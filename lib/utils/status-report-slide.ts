// Extraído de app/(dashboard)/status-report/page.tsx (Fase I) para ser
// reaproveitado também pela rota pública (app/(print)/public/status-report/
// [token]/page.tsx) sem duplicar as ~230 linhas de cálculo de progresso,
// IDC/IDP, S-Curve etc. Continua sendo lógica de leitura pura — nenhuma
// escrita, nenhuma dependência de auth() aqui dentro (a rota pública não
// pode chamar nada que exija sessão).
import { Prisma } from "@/lib/generated/prisma/client"
import { differenceInDays, startOfWeek, eachWeekOfInterval, isAfter, isBefore, addWeeks } from "date-fns"
import { computeProjectProgress } from "@/lib/utils/project-progress"
import { computePlanned, computeRealized, type RawTask } from "@/lib/utils/s-curve-math"
import { toLegacyLikeTasks, areasFromV2 } from "@/lib/utils/schedule-v2-adapter"
import type { ProjectSlideData } from "@/app/(dashboard)/status-report/report-client"

export const STATUS_REPORT_PROJECT_INCLUDE = {
  sponsor: { select: { name: true } },
  members: { select: { role: true, user: { select: { name: true, image: true } } } },
  scheduleV2Items: {
    orderBy: { order: "asc" as const },
    select: {
      id: true, parentId: true, title: true, status: true, percentualCompleto: true,
      inicioEstimado: true, terminoEstimado: true, inicioReal: true, terminoReal: true,
      esforcoEstimadoH: true, esforcoRealH: true, budgetedCost: true, actualCost: true,
      responsavelId: true, responsavelNome: true, responsavel: { select: { id: true, name: true, image: true } },
      isMacroMilestone: true,
    },
  },
  risks: {
    select: { status: true, description: true, mitigation: true, owner: true, presentToClient: true },
    orderBy: { status: "asc" as const },
    take: 8,
  },
  meetings: {
    orderBy: { date: "desc" as const },
    select: { type: true, date: true, title: true, location: true, content: true, decisions: true, nextActions: true },
  },
  _count: { select: { meetings: true } },
} satisfies Prisma.ProjectInclude

export type StatusReportProjectRow = Prisma.ProjectGetPayload<{ include: typeof STATUS_REPORT_PROJECT_INCLUDE }>

export function buildProjectSlideData(p: StatusReportProjectRow, today: Date): ProjectSlideData {
  const tasks = toLegacyLikeTasks(p.scheduleV2Items)
  const areas = areasFromV2(p.scheduleV2Items)
  // Apenas tarefas folha (sem filhos) para listas de atividades e progresso
  const groupIds  = new Set(p.scheduleV2Items.filter((i) => i.parentId).map((i) => i.parentId as string))
  const leafTasks = tasks.filter((t) => !groupIds.has(t.id))
  const total     = leafTasks.length

  const completed  = leafTasks.filter((t) => t.status === "COMPLETED")
  // Em Andamento: exclui tarefas IN_PROGRESS cujo prazo já passou (essas vão para Em Atraso)
  const inProgress = leafTasks.filter((t) =>
    t.status === "IN_PROGRESS" && !(t.endDate && new Date(t.endDate) < today)
  )
  // Em Atraso: status DELAYED + IN_PROGRESS com endDate no passado
  const delayed = leafTasks.filter((t) =>
    t.status === "DELAYED" ||
    (t.status === "IN_PROGRESS" && t.endDate && new Date(t.endDate) < today)
  )
  const planning   = leafTasks.filter((t) => t.status === "PLANNING")
  const avgProgress = tasks.length > 0
    ? computeProjectProgress(tasks)
    : (p.status === "COMPLETED" ? 100 : 0)

  // IDC
  const earnedValue   = tasks.reduce((s, t) => s + (t.budgetedCost ?? 0) * (t.progress / 100), 0)
  const actualCostSum = tasks.reduce((s, t) => s + (t.actualCost ?? 0), 0)
  const idc = actualCostSum > 0 ? Math.round((earnedValue / actualCostSum) * 100) / 100 : null
  // Peso alternativo do IDP ponderado do portfólio (lib/utils/weighted-idp.ts).
  const tasksBudgetedCostSum = tasks.reduce((s, t) => s + (t.budgetedCost ?? 0), 0)

  // IDP: usa expectedStart como linha de base (cronograma original, não data real de início)
  // Isso garante que projetos que começaram atrasados não tenham IDP artificialmente inflado
  let idp: number | null = null
  let timelineProgress: number | null = null
  const pStart = p.expectedStart ?? p.suggestedStart
  const pEnd   = p.expectedEnd   ?? p.suggestedEnd
  if (pStart && pEnd && p.status !== "PAUSED") {
    const totalDays   = differenceInDays(pEnd, pStart)
    const elapsedDays = differenceInDays(today, pStart)
    if (totalDays > 0 && elapsedDays > 0) {
      const plannedPct = Math.min(100, (elapsedDays / totalDays) * 100)
      timelineProgress = Math.round(plannedPct)
      if (plannedPct > 2) idp = Math.round((avgProgress / plannedPct) * 100) / 100
    }
  }

  // At-risk tasks — usa apenas tarefas folha
  const atRiskTasks: ProjectSlideData["atRiskTasks"] = []
  for (const t of leafTasks) {
    const responsible = t.responsibleName ?? null
    const startDate   = t.startDate?.toISOString() ?? null
    const endDate     = t.endDate?.toISOString()   ?? null
    if (t.status === "PLANNING" && t.startDate) {
      const start = new Date(t.startDate); start.setHours(0, 0, 0, 0)
      if (start < today)
        atRiskTasks.push({ title: t.title, type: "NOT_STARTED", date: t.startDate.toISOString(), daysLate: differenceInDays(today, start), responsible, startDate, endDate })
    } else if (t.status === "DELAYED") {
      const ref = t.endDate ?? t.startDate
      const daysLate = ref ? Math.max(0, differenceInDays(today, new Date(ref))) : 0
      atRiskTasks.push({ title: t.title, type: "OVERDUE", date: (ref ?? new Date()).toISOString(), daysLate, responsible, startDate, endDate })
    } else if (t.status === "IN_PROGRESS" && t.endDate) {
      const end = new Date(t.endDate); end.setHours(0, 0, 0, 0)
      if (end < today)
        atRiskTasks.push({ title: t.title, type: "LATE_RUNNING", date: t.endDate.toISOString(), daysLate: differenceInDays(today, end), responsible, startDate, endDate })
    }
  }
  atRiskTasks.sort((a, b) => b.daysLate - a.daysLate)

  // Task details com startDate nas in-progress
  const taskDetails: ProjectSlideData["taskDetails"] = {
    recentlyCompleted: completed.slice(-5).map((t) => ({ title: t.title })),
    inProgress: inProgress.slice(0, 6).map((t) => ({
      title: t.title,
      responsible: t.responsibleName ?? null,
      startDate: t.startDate?.toISOString() ?? null,
      endDate:   t.endDate?.toISOString()   ?? null,
    })),
    delayed: delayed.slice(0, 5).map((t) => {
      const ref = t.endDate ?? t.startDate
      return {
        title:       t.title,
        responsible: t.responsibleName ?? null,
        startDate:   t.startDate?.toISOString() ?? null,
        endDate:     ref?.toISOString() ?? null,
        daysLate:    ref ? Math.max(0, differenceInDays(today, new Date(ref))) : 0,
      }
    }),
    upcoming: leafTasks
      .filter((t) => (t.status === "PLANNING" || t.status === "IN_PROGRESS") && t.endDate && new Date(t.endDate) >= today)
      .sort((a, b) => (a.endDate?.getTime() ?? 0) - (b.endDate?.getTime() ?? 0))
      .slice(0, 5)
      .map((t) => ({
        title:       t.title,
        responsible: t.responsibleName ?? null,
        daysUntil:   t.endDate ? differenceInDays(new Date(t.endDate), today) : 0,
        startDate:   t.startDate?.toISOString() ?? null,
        endDate:     t.endDate?.toISOString()   ?? null,
      })),
  }

  // Meetings por tipo (todas as reuniões)
  const meetingsByType = p.meetings
    .reduce((acc, m) => { acc[m.type] = (acc[m.type] ?? 0) + 1; return acc }, {} as Record<string, number>)

  // Macro Cronograma — itens marcados com a estrela na grade (Fase I),
  // independente de serem marco de calendário (duração 0) ou não.
  const macroMilestones = p.scheduleV2Items
    .filter((i) => i.isMacroMilestone)
    .map((i) => ({ title: i.title, status: i.status, terminoEstimado: i.terminoEstimado ? i.terminoEstimado.toISOString().slice(0, 10) : null }))
    .sort((a, b) => (a.terminoEstimado ?? "9999").localeCompare(b.terminoEstimado ?? "9999"))

  const daysLeft = pEnd ? differenceInDays(pEnd, today) : null
  // Último checkpoint = primeira reunião do tipo CHECKPOINT (já ordenado por date desc)
  const lastMtg  = p.meetings.find((m) => m.type === "CHECKPOINT") ?? null

  // Delta de progresso: tarefas concluídas DESDE o último checkpoint
  const lastCpDate = lastMtg?.date ?? null
  const completedSinceCheckpoint = lastCpDate
    ? leafTasks.filter((t) => t.completedAt && new Date(t.completedAt) > new Date(lastCpDate)).length
    : 0
  const progressDelta = total > 0 ? Math.round((completedSinceCheckpoint / total) * 100) : null
  const rawSteps = lastMtg?.nextActions || lastMtg?.decisions || null
  const nextSteps = rawSteps
    ?.split("\n").map((l) => l.replace(/^[-•*\d.]\s*/, "").trim()).filter(Boolean).slice(0, 5) ?? []

  const leafTasksByArea = new Map<string, typeof leafTasks>()
  for (const t of leafTasks) {
    const key = t.wbsAreaId ?? "__none__"
    leafTasksByArea.set(key, [...(leafTasksByArea.get(key) ?? []), t])
  }
  // início/término da área = min/max entre os filhos-folha (mesma regra de
  // rollup de grupo do motor de cronograma, §3.7) — usado no modo "Cliente"
  // do Status Report pra mostrar "Infraestrutura: início X, término Y" em
  // vez da lista de tarefas internas por trás dela.
  const wbsSummary = areas
    .map((a) => ({ ...a, tasks: leafTasksByArea.get(a.id) ?? [] }))
    .filter((a) => a.tasks.length > 0)
    .map((a) => {
      const starts = a.tasks.map((t) => t.startDate).filter((d): d is Date => d !== null)
      const ends   = a.tasks.map((t) => t.endDate).filter((d): d is Date => d !== null)
      const minStart = starts.length > 0 ? starts.reduce((m, d) => (d < m ? d : m), starts[0]!) : null
      const maxEnd   = ends.length   > 0 ? ends.reduce((m, d) => (d > m ? d : m), ends[0]!)     : null
      return {
        name: a.name, color: a.color,
        total: a.tasks.length,
        done:  a.tasks.filter((t) => t.status === "COMPLETED").length,
        pct:   Math.round((a.tasks.filter((t) => t.status === "COMPLETED").length / a.tasks.length) * 100),
        start: minStart ? minStart.toISOString() : null,
        end:   maxEnd   ? maxEnd.toISOString()   : null,
      }
    })

  // S-Curve: mesma matemática (lib/utils/s-curve-math.ts) da tela dedicada
  // de Curva S do projeto — planejado/realizado como média simples das
  // tarefas-folha, nunca uma reimplementação própria que possa divergir.
  const sCurveResult = (() => {
    // Usa apenas tarefas folha — tarefas-pai têm endDate inflado abrangendo toda a hierarquia
    const tw: RawTask[] = leafTasks.filter(t => t.endDate !== null)
    if (tw.length < 3) return null
    // Range calculado apenas pelas endDates planejadas — completedAt não estende o eixo X.
    const plannedDates: Date[] = [
      ...tw.map(t => t.endDate!),
      ...[p.actualStart, p.expectedStart].filter((d): d is Date => d !== null),
    ]
    const minDate = plannedDates.reduce((m, d) => isBefore(d, m) ? d : m, plannedDates[0])
    const maxDate = plannedDates.reduce((m, d) => isAfter(d, m)  ? d : m, plannedDates[0])
    if (!isBefore(minDate, maxDate)) return null
    const rangeStart = startOfWeek(minDate, { weekStartsOn: 1 })
    // O intervalo sempre cobre até hoje — senão um projeto atrasado (fim
    // planejado no passado) deixa "hoje" fora da grade.
    const latestKnown = isAfter(maxDate, today) ? maxDate : today
    const rangeEnd     = addWeeks(latestKnown, 1)
    const weeks = eachWeekOfInterval({ start: rangeStart, end: rangeEnd }, { weekStartsOn: 1 })
    if (weeks.length < 3) return null

    const plannedCurve  = computePlanned(tw, weeks)
    const realizedCurve = computeRealized(tw, weeks, today)
    // Ponto mais recente com dado real forçado a bater com o % exato de
    // hoje (mesma tarefa-folha usada no card "Progresso do Projeto" acima).
    const lastRealIdx = weeks.reduce((acc, _, i) => (realizedCurve[i] !== null ? i : acc), -1)
    const realizedTodayExact = computeProjectProgress(
      tw.map((t) => ({ id: t.id, progress: t.progress, parentId: null }))
    )

    const series = weeks.map((ws, i) => ({
      date:     ws.toISOString(),
      planned:  plannedCurve[i],
      realized: i === lastRealIdx ? realizedTodayExact : realizedCurve[i],
    }))
    return { series }
  })()

  return {
    id: p.id, title: p.title, status: p.status,
    sponsor:  p.sponsor?.name ?? null,
    progress: avgProgress,
    idc, idp, timelineProgress, progressDelta,
    budgetUsed: actualCostSum > 0 ? actualCostSum : null,
    tasksBudgetedCostSum,
    meetingsCount:  p._count.meetings,
    meetingsByType,
    // Squad completa: membros formais + responsáveis do cronograma não listados como membros
    ...((): { team: number; members: { name: string; role: string | null; image: string | null }[] } => {
      const formalMembers = p.members.map((m) => ({ name: m.user.name, role: m.role as string | null, image: m.user.image }))
      const formalNames   = new Set(formalMembers.map((m) => m.name))
      const scheduleExtra = [
        ...new Map(
          tasks
            .filter((t) => t.responsibleName && !formalNames.has(t.responsibleName))
            .map((t) => [t.responsibleName!, { name: t.responsibleName!, image: t.responsibleImage }] as const)
        ).values(),
      ].map((r) => ({ name: r.name, role: null as string | null, image: r.image }))
      const fullTeam = [...formalMembers, ...scheduleExtra]
      return { team: fullTeam.length, members: fullTeam }
    })(),
    tasks: {
      total, completed: completed.length, inProgress: inProgress.length,
      delayed: delayed.length, planning: planning.length,
      completedTitles:  completed.slice(-5).map((t) => t.title),
      inProgressTitles: inProgress.slice(0, 5).map((t) => t.title),
      plannedTitles:    planning.slice(0, 4).map((t) => t.title),
    },
    taskDetails,
    risks: {
      critical: p.risks.filter((r) => r.status === "CRITICAL").length,
      high:     p.risks.filter((r) => r.status === "HIGH").length,
      items:    p.risks.map((r) => ({ level: r.status, description: r.description, mitigation: r.mitigation ?? null, owner: r.owner ?? null, presentToClient: r.presentToClient })),
    },
    daysLeft, economy: p.economy, budget: p.budget,
    lastCheckpoint: lastMtg ? {
      date: lastMtg.date.toISOString(), title: lastMtg.title,
      location: lastMtg.location ?? null,
      highlights: lastMtg.content  ?? null,
      decisions:  lastMtg.decisions ?? null,
      nextSteps,
    } : null,
    atRiskTasks: atRiskTasks.slice(0, 6),
    wbsAreas: wbsSummary,
    sCurve: sCurveResult,
    publicStatusToken: p.publicStatusToken,
    macroMilestones,
    dates: {
      start:  p.actualStart?.toISOString()  ?? p.expectedStart?.toISOString() ?? null,
      end:    pEnd?.toISOString()            ?? null,
      goLive: p.goLiveDate?.toISOString()    ?? null,
    },
    reportStatus: {
      cost:      p.reportStatusCost      as "GREEN" | "YELLOW" | "RED",
      schedule:  p.reportStatusSchedule  as "GREEN" | "YELLOW" | "RED",
      resources: p.reportStatusResources as "GREEN" | "YELLOW" | "RED",
      overall:   p.reportStatusOverall   as "GREEN" | "YELLOW" | "RED",
      notes:     p.reportStatusNotes ?? null,
    },
  }
}
