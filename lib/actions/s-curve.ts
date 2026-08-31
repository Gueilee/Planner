"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import {
  startOfWeek, addWeeks, eachWeekOfInterval,
  isAfter, isBefore, differenceInDays,
  startOfMonth, addMonths, eachMonthOfInterval,
} from "date-fns"
import { computeProjectProgress } from "@/lib/utils/project-progress"

const CAN_MANAGE_BASELINE = new Set(["ADMIN", "PROJECT_MANAGER", "SPONSOR"])

// ─── Types ────────────────────────────────────────────────────────────────────

export type BaselineInfo = {
  id: string
  number: number
  name: string
  description: string | null
  reason: string | null
  createdAt: string
  createdByName: string | null
  approvedByName: string | null
  approvedAt: string | null
  taskCount: number
  latestEndDate: string | null  // max plannedEnd in snaps (for comparison)
}

export type SCurvePoint = {
  date: string
  planned: number
  realized: number | null   // null = no real data for this future date
  [key: string]: number | string | null
}

export type SCurveStats = {
  plannedToday: number
  realizedToday: number
  deviation: number          // realized - planned (negative = atraso)
  projectedEndDate: string | null
  originalEndDate: string | null  // baseline 0 latest endDate
  currentEndDate: string | null   // expectedEnd
  daysDeviation: number          // projected vs planned (positive = atraso)
  velocity: number               // % per week in last 4 weeks
}

export type SCurvePayload = {
  project: {
    id: string
    title: string
    expectedStart: string | null
    expectedEnd: string | null
    actualStart: string | null
    actualEnd: string | null
  }
  baselines: BaselineInfo[]
  series: SCurvePoint[]
  stats: SCurveStats
  granularity: "week" | "month"
}

// ─── Curve algorithm ──────────────────────────────────────────────────────────
// Usa as mesmas tarefas-FOLHA do Cronograma
// (lib/utils/project-progress.ts::computeProjectProgress), em média simples
// (sem peso por dias, horas ou custo — por decisão), para o ponto de "hoje"
// da Curva S nunca divergir do % mostrado em Cronograma/Detalhes do Projeto/
// Status Report. Contar "Atividades" de topo como unidades iguais (o que a
// Curva S fazia antes) sub-pondera fases com várias tarefas substanciais e
// super-pondera fases de 1 tarefa só (ex.: uma reunião de encerramento) —
// por isso a troca para tarefa-folha.

type RawTask = {
  id: string
  startDate: Date | null
  endDate: Date | null
  actualStart: Date | null
  actualEnd: Date | null
  completedAt: Date | null
  status: string
  progress: number
}

function linearFraction(s: Date, e: Date, T: Date): number {
  if (T <= s) return 0
  if (T >= e) return 1
  const span = e.getTime() - s.getTime()
  if (span <= 0) return 1
  return (T.getTime() - s.getTime()) / span
}

// % esperado por tarefa (tempo decorrido ÷ duração) — mesma lógica de
// computeExpectedPct (lib/utils/schedule-status.ts), aplicada a cada ponto da
// série em vez de só "hoje". Média simples entre as tarefas.
function computePlanned(tasks: RawTask[], timePoints: Date[]): number[] {
  const withDates = tasks.filter((t) => t.endDate)
  if (withDates.length === 0) return timePoints.map(() => 0)
  return timePoints.map((T) => {
    const sum = withDates.reduce((s, t) => {
      const start = t.startDate ?? t.endDate!
      return s + linearFraction(start, t.endDate!, T) * 100
    }, 0)
    return Math.round(sum / withDates.length)
  })
}

// % realizado por tarefa, reconstruído no tempo: 0 antes de começar, sobe
// linearmente de 0 até o progresso ATUAL da tarefa entre o início real e a
// conclusão (ou "hoje", se ainda em andamento) — por isso, no ponto "hoje",
// o valor de cada tarefa é exatamente o seu progress atual, e a média
// simples das tarefas-folha fecha exatamente com o % do Cronograma.
function computeRealized(tasks: RawTask[], timePoints: Date[], today: Date): (number | null)[] {
  if (tasks.length === 0) return timePoints.map(() => 0)

  return timePoints.map((T) => {
    if (isAfter(T, today)) return null

    const sum = tasks.reduce((s, t) => {
      if (!t.actualStart || isAfter(t.actualStart, T)) return s
      if (t.progress <= 0) return s

      const rampEnd = t.completedAt ?? t.actualEnd ?? today
      if (!isAfter(rampEnd, t.actualStart) || !isBefore(T, rampEnd)) return s + t.progress

      const elapsed = (T.getTime() - t.actualStart.getTime()) / (rampEnd.getTime() - t.actualStart.getTime())
      return s + t.progress * elapsed
    }, 0)

    return Math.round(sum / tasks.length)
  })
}

function computeBaselineCurve(
  snaps: { plannedStart: Date | null; plannedEnd: Date }[],
  timePoints: Date[]
): number[] {
  if (snaps.length === 0) return timePoints.map(() => 0)
  return timePoints.map((T) => {
    const sum = snaps.reduce((s, snap) => {
      const start = snap.plannedStart ?? snap.plannedEnd
      return s + linearFraction(start, snap.plannedEnd, T) * 100
    }, 0)
    return Math.round(sum / snaps.length)
  })
}

// ─── Main server action ────────────────────────────────────────────────────────

export async function getSCurveData(projectId: string): Promise<SCurvePayload | null> {
  const session = await auth()
  if (!session?.user) return null

  const [project, baselines] = await Promise.all([
    db.project.findUnique({
      where: { id: projectId },
      select: {
        id: true, title: true,
        expectedStart: true, expectedEnd: true,
        actualStart: true, actualEnd: true,
        tasks: {
          select: {
            id: true, parentId: true,
            startDate: true, endDate: true,
            actualStart: true, actualEnd: true, completedAt: true,
            status: true, progress: true,
          },
        },
      },
    }),
    db.projectBaseline.findMany({
      where: { projectId },
      orderBy: { number: "asc" },
      include: {
        snaps: true,
        createdBy:  { select: { name: true } },
        approvedBy: { select: { name: true } },
      },
    }),
  ])

  if (!project) return null

  const today = startOfWeek(new Date(), { weekStartsOn: 1 })
  // Tarefas-FOLHA (sem subtarefa) — mesma base do progresso canônico do
  // projeto (computeProjectProgress), ponderada por duração.
  //
  // allLeafTasks: TODAS as tarefas-folha, com ou sem data — usada só para os
  // KPIs "Planejado/Realizado Hoje", que precisam bater exatamente com o
  // Cronograma (que não exige data para entrar na média).
  // leafTasks: só as que têm data de fim — usada para desenhar a curva no
  // tempo, já que uma tarefa sem data não tem onde ser plotada.
  const parentIds  = new Set(project.tasks.map((t) => t.parentId).filter((id): id is string => id !== null))
  const allLeafTasks = project.tasks.filter((t) => !parentIds.has(t.id))
  const leafTasks: RawTask[] = allLeafTasks
    .filter((t) => t.endDate)
    .map((t) => ({
      id: t.id,
      startDate: t.startDate,
      endDate: t.endDate,
      actualStart: t.actualStart,
      actualEnd: t.actualEnd,
      completedAt: t.completedAt,
      status: t.status,
      progress: t.progress,
    }))

  if (leafTasks.length === 0) {
    const realizedNoDates = computeProjectProgress(
      allLeafTasks.map((t) => ({ id: t.id, progress: t.progress, parentId: null, startDate: t.startDate, endDate: t.endDate })),
    )
    return {
      project: {
        id: project.id,
        title: project.title,
        expectedStart:  project.expectedStart?.toISOString()  ?? null,
        expectedEnd:    project.expectedEnd?.toISOString()    ?? null,
        actualStart:    project.actualStart?.toISOString()    ?? null,
        actualEnd:      project.actualEnd?.toISOString()      ?? null,
      },
      baselines: [],
      series: [],
      stats: { plannedToday: 0, realizedToday: realizedNoDates, deviation: 0 - realizedNoDates, projectedEndDate: null, originalEndDate: null, currentEndDate: project.expectedEnd?.toISOString() ?? null, daysDeviation: 0, velocity: 0 },
      granularity: "week",
    }
  }

  // ── Build time range ──────────────────────────────────────────────────────
  const allDates = [
    project.actualStart,
    project.expectedStart,
    ...leafTasks.map((t) => t.startDate),
    ...leafTasks.map((t) => t.endDate),
  ].filter(Boolean) as Date[]

  const rangeStart = startOfWeek(
    allDates.reduce((min, d) => isBefore(d, min) ? d : min, allDates[0]),
    { weekStartsOn: 1 }
  )

  const latestEnd = allDates.reduce((max, d) => isAfter(d, max) ? d : max, allDates[0])
  // O intervalo sempre cobre até hoje — um projeto com tarefas atrasadas
  // (fim planejado no passado) não pode deixar "hoje" de fora da grade, senão
  // Planejado/Realizado Hoje ficam sem ponto correspondente e caem para 0%.
  const rangeEnd = isAfter(today, latestEnd) ? today : latestEnd
  const projectDays = differenceInDays(rangeEnd, rangeStart)

  // Granularity: weekly for short projects, monthly for > 6 months
  const useMonthly = projectDays > 180

  const timePoints: Date[] = useMonthly
    ? eachMonthOfInterval({ start: startOfMonth(rangeStart), end: rangeEnd })
    : eachWeekOfInterval({ start: rangeStart, end: rangeEnd }, { weekStartsOn: 1 })

  const granularity: "week" | "month" = useMonthly ? "month" : "week"

  // ── Compute curves ────────────────────────────────────────────────────────
  const plannedCurve  = computePlanned(leafTasks, timePoints)
  const realizedCurve = computeRealized(leafTasks, timePoints, today)

  // Baseline curves
  const baselineCurves: Map<string, number[]> = new Map()
  for (const bl of baselines) {
    if (bl.snaps.length === 0) continue
    const blCurve = computeBaselineCurve(
      bl.snaps.map((s) => ({
        plannedStart: s.plannedStart,
        plannedEnd:   s.plannedEnd,
      })),
      timePoints
    )
    baselineCurves.set(bl.id, blCurve)
  }

  // ── Velocity & projection ─────────────────────────────────────────────────
  const todayIdx    = timePoints.findIndex((d) => !isBefore(d, today))
  const lookback    = useMonthly ? 3 : 4
  const realPtsSoFar = timePoints
    .map((_, i) => realizedCurve[i])
    .filter((v) => v !== null) as number[]

  let velocity = 0
  if (realPtsSoFar.length >= 2) {
    const n    = Math.min(lookback, realPtsSoFar.length - 1)
    const curr = realPtsSoFar[realPtsSoFar.length - 1]
    const prev = realPtsSoFar[realPtsSoFar.length - 1 - n]
    velocity   = (curr - prev) / n  // % per period
  }

  // Calculados direto em cima de "hoje" (não pelo índice mais próximo na
  // grade semanal/mensal do gráfico), para bater exatamente com o Cronograma
  // mesmo quando "hoje" cai entre dois pontos da grade (granularidade mensal).
  const realizedToday = computeProjectProgress(
    allLeafTasks.map((t) => ({ id: t.id, progress: t.progress, parentId: null, startDate: t.startDate, endDate: t.endDate })),
  )
  const plannedToday  = computePlanned(leafTasks, [today])[0] ?? 0

  // Último ponto da grade com dado real (a semana/mês corrente) — forçado a
  // bater com realizedToday, já que a grade pode não cair exatamente em
  // "hoje" (granularidade mensal), mas o ponto mais recente do gráfico deve
  // sempre mostrar o mesmo número do card e do Cronograma.
  const lastRealIdx = timePoints.reduce((acc, _, i) => (realizedCurve[i] !== null ? i : acc), -1)

  // Build series with projection
  const series: SCurvePoint[] = timePoints.map((d, i) => {
    const pt: SCurvePoint = {
      date:     d.toISOString(),
      planned:  plannedCurve[i],
      realized: i === lastRealIdx ? realizedToday : realizedCurve[i],
    }

    // Projection: only future points, linear trend from last realized
    if (realizedCurve[i] === null && velocity > 0) {
      const weeksAhead = i - (todayIdx >= 0 ? todayIdx : realPtsSoFar.length)
      const proj = Math.min(100, realizedToday + velocity * weeksAhead)
      pt["projection"] = Math.round(proj)
    } else {
      pt["projection"] = null
    }

    // Baselines
    for (const [blId, curve] of baselineCurves.entries()) {
      pt[`b_${blId}`] = curve[i]
    }

    return pt
  })

  // ── Projected end date ────────────────────────────────────────────────────
  let projectedEndDate: string | null = null
  if (velocity > 0 && realizedToday < 100) {
    const periodsToComplete = (100 - realizedToday) / velocity
    const projEnd = useMonthly
      ? addMonths(today, Math.ceil(periodsToComplete))
      : addWeeks(today, Math.ceil(periodsToComplete))
    projectedEndDate = projEnd.toISOString()
  } else if (realizedToday >= 100) {
    projectedEndDate = today.toISOString()
  }

  const currentEndDate   = project.expectedEnd?.toISOString() ?? null
  const originalBaseline = baselines.find((b) => b.number === 0)
  const originalEndDate  = originalBaseline?.snaps.length
    ? new Date(Math.max(...originalBaseline.snaps.map((s) => s.plannedEnd.getTime()))).toISOString()
    : null

  let daysDeviation = 0
  if (projectedEndDate && currentEndDate) {
    daysDeviation = differenceInDays(new Date(projectedEndDate), new Date(currentEndDate))
  }

  const baselinesMeta: BaselineInfo[] = baselines.map((b) => ({
    id:            b.id,
    number:        b.number,
    name:          b.name,
    description:   b.description,
    reason:        b.reason,
    createdAt:      b.createdAt.toISOString(),
    createdByName:  b.createdBy?.name ?? null,
    approvedByName: b.approvedBy?.name ?? null,
    approvedAt:     b.approvedAt?.toISOString() ?? null,
    taskCount:     b.snaps.length,
    latestEndDate: b.snaps.length
      ? new Date(Math.max(...b.snaps.map((s) => s.plannedEnd.getTime()))).toISOString()
      : null,
  }))

  return {
    project: {
      id:            project.id,
      title:         project.title,
      expectedStart: project.expectedStart?.toISOString()  ?? null,
      expectedEnd:   project.expectedEnd?.toISOString()    ?? null,
      actualStart:   project.actualStart?.toISOString()    ?? null,
      actualEnd:     project.actualEnd?.toISOString()      ?? null,
    },
    baselines: baselinesMeta,
    series,
    stats: {
      plannedToday,
      realizedToday,
      deviation:       realizedToday - plannedToday,
      projectedEndDate,
      originalEndDate,
      currentEndDate,
      daysDeviation,
      velocity:        Math.round(velocity * 10) / 10,
    },
    granularity,
  }
}

// ─── Create baseline server action ────────────────────────────────────────────

export async function createBaselineAction(
  projectId: string,
  { name, reason, description }: { name?: string; reason?: string; description?: string }
): Promise<{ error?: string; id?: string }> {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  if (!CAN_MANAGE_BASELINE.has(session.user.role ?? "")) {
    return { error: "Apenas Administradores, Gerentes de Projeto e Sponsors podem aprovar um baseline." }
  }

  const tasks = await db.scheduleTask.findMany({
    where:  { projectId, endDate: { not: null } },
    select: { id: true, title: true, startDate: true, endDate: true, budgetedCost: true, _count: { select: { subtasks: true } } },
  })

  const leafTasks = tasks.filter((t) => t._count.subtasks === 0)

  if (leafTasks.length === 0) {
    return { error: "O projeto não possui atividades folha com data de término definida." }
  }

  const last = await db.projectBaseline.findFirst({
    where:   { projectId },
    orderBy: { number: "desc" },
    select:  { number: true },
  })
  const nextNumber = (last?.number ?? -1) + 1
  const autoName   = name || (nextNumber === 0 ? "Baseline Original" : `Replanejamento ${nextNumber}`)

  const userId = (session.user as { id?: string }).id ?? null
  const now    = new Date()

  const baseline = await db.projectBaseline.create({
    data: {
      projectId,
      number:      nextNumber,
      name:        autoName,
      description: description ?? null,
      reason:      reason ?? null,
      createdById: userId,
      status:      "APPROVED",
      approvedById: userId,
      approvedAt:   now,
      snaps: {
        create: leafTasks.map((t) => ({
          taskId:       t.id,
          taskTitle:    t.title,
          plannedStart: t.startDate ?? null,
          plannedEnd:   t.endDate!,
          budgetedCost: t.budgetedCost ?? null,
        })),
      },
    },
  })

  return { id: baseline.id }
}
