"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import {
  startOfWeek, addWeeks, eachWeekOfInterval,
  isAfter, isBefore, differenceInDays,
  startOfMonth, addMonths, eachMonthOfInterval,
} from "date-fns"

// ─── Types ────────────────────────────────────────────────────────────────────

export type BaselineInfo = {
  id: string
  number: number
  name: string
  description: string | null
  reason: string | null
  createdAt: string
  createdByName: string | null
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

// ─── Linear distribution algorithm ────────────────────────────────────────────

type RawTask = {
  id: string
  startDate: Date | null
  endDate: Date | null
  actualStart: Date | null
  actualEnd: Date | null
  completedAt: Date | null
  status: string
  progress: number
  budgetedCost: number | null
  subtaskCount: number
}

function linearFraction(s: Date, e: Date, T: Date): number {
  if (T <= s) return 0
  if (T >= e) return 1
  const span = e.getTime() - s.getTime()
  if (span <= 0) return 1
  return (T.getTime() - s.getTime()) / span
}

function computePlanned(leafTasks: RawTask[], timePoints: Date[]): number[] {
  const totalWeight = leafTasks.reduce((s, t) => s + (t.budgetedCost ?? 1), 0)
  if (totalWeight === 0) return timePoints.map(() => 0)

  return timePoints.map((T) => {
    let cum = 0
    for (const t of leafTasks) {
      if (!t.endDate) continue
      const w = t.budgetedCost ?? 1
      const s = t.startDate ?? t.endDate
      cum += w * linearFraction(s, t.endDate, T)
    }
    return Math.round((cum / totalWeight) * 100)
  })
}

function computeRealized(leafTasks: RawTask[], timePoints: Date[], today: Date): (number | null)[] {
  const totalWeight = leafTasks.reduce((s, t) => s + (t.budgetedCost ?? 1), 0)
  if (totalWeight === 0) return timePoints.map(() => 0)

  return timePoints.map((T) => {
    if (isAfter(T, today)) return null

    let cum = 0
    for (const t of leafTasks) {
      const w = t.budgetedCost ?? 1

      // Task completed before T
      const completedDate = t.completedAt ?? t.actualEnd
      if (completedDate && !isAfter(completedDate, T)) { cum += w; continue }
      if (t.status === "COMPLETED" && t.endDate && !isAfter(t.endDate, T)) { cum += w; continue }

      // Task in progress
      if (t.actualStart && !isAfter(t.actualStart, T) && t.progress > 0) {
        const s = t.actualStart
        const e = t.endDate ?? today
        const span = e.getTime() - s.getTime()
        let fraction: number
        if (span <= 0 || !isAfter(e, T)) {
          fraction = t.progress / 100
        } else {
          const elapsed = (T.getTime() - s.getTime()) / span
          fraction = Math.min(t.progress / 100, elapsed * (t.progress / 100))
        }
        cum += w * fraction
      }
    }
    return Math.round((cum / totalWeight) * 100)
  })
}

function computeBaselineCurve(
  snaps: { plannedStart: Date | null; plannedEnd: Date; budgetedCost: number | null }[],
  timePoints: Date[]
): number[] {
  const totalWeight = snaps.reduce((s, snap) => s + (snap.budgetedCost ?? 1), 0)
  if (totalWeight === 0 || snaps.length === 0) return timePoints.map(() => 0)

  return timePoints.map((T) => {
    let cum = 0
    for (const snap of snaps) {
      const w = snap.budgetedCost ?? 1
      const s = snap.plannedStart ?? snap.plannedEnd
      cum += w * linearFraction(s, snap.plannedEnd, T)
    }
    return Math.round((cum / totalWeight) * 100)
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
            id: true,
            startDate: true, endDate: true,
            actualStart: true, actualEnd: true, completedAt: true,
            status: true, progress: true, budgetedCost: true,
            _count: { select: { subtasks: true } },
          },
        },
      },
    }),
    db.projectBaseline.findMany({
      where: { projectId },
      orderBy: { number: "asc" },
      include: {
        snaps: true,
        createdBy: { select: { name: true } },
      },
    }),
  ])

  if (!project) return null

  const today = startOfWeek(new Date(), { weekStartsOn: 1 })
  const leafTasks: RawTask[] = project.tasks
    .filter((t) => t._count.subtasks === 0 && t.endDate)
    .map((t) => ({
      id: t.id,
      startDate: t.startDate,
      endDate: t.endDate,
      actualStart: t.actualStart,
      actualEnd: t.actualEnd,
      completedAt: t.completedAt,
      status: t.status,
      progress: t.progress,
      budgetedCost: t.budgetedCost,
      subtaskCount: t._count.subtasks,
    }))

  if (leafTasks.length === 0) {
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
      stats: { plannedToday: 0, realizedToday: 0, deviation: 0, projectedEndDate: null, originalEndDate: null, currentEndDate: project.expectedEnd?.toISOString() ?? null, daysDeviation: 0, velocity: 0 },
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

  // Extend range to cover projection (add 25% of project duration after latest end)
  const latestEnd = allDates.reduce((max, d) => isAfter(d, max) ? d : max, allDates[0])
  const projectDays = differenceInDays(latestEnd, rangeStart)
  const rangeEnd = addWeeks(latestEnd, Math.max(4, Math.ceil(projectDays / 28)))

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
        budgetedCost: s.budgetedCost,
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

  const realizedToday  = realPtsSoFar.length > 0 ? realPtsSoFar[realPtsSoFar.length - 1] : 0
  const plannedToday   = todayIdx >= 0 ? plannedCurve[todayIdx] : 0

  // Build series with projection
  const series: SCurvePoint[] = timePoints.map((d, i) => {
    const pt: SCurvePoint = {
      date:     d.toISOString(),
      planned:  plannedCurve[i],
      realized: realizedCurve[i],
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
    createdAt:     b.createdAt.toISOString(),
    createdByName: b.createdBy?.name ?? null,
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

  const baseline = await db.projectBaseline.create({
    data: {
      projectId,
      number:      nextNumber,
      name:        autoName,
      description: description ?? null,
      reason:      reason ?? null,
      createdById: (session.user as { id?: string }).id ?? null,
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
