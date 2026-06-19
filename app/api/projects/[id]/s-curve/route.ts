import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auth } from "@/auth"
import { addDays, startOfWeek, eachWeekOfInterval, isAfter, isBefore, addWeeks } from "date-fns"

export const dynamic = "force-dynamic"

function pct(count: number, total: number) {
  if (total === 0) return 0
  return Math.round((count / total) * 100)
}

// GET /api/projects/[id]/s-curve
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const [project, baselines] = await Promise.all([
    db.project.findUnique({
      where: { id },
      select: {
        actualStart: true,
        expectedStart: true,
        actualEnd: true,
        expectedEnd: true,
        tasks: {
          select: { id: true, endDate: true, completedAt: true, actualEnd: true, status: true },
          where: { endDate: { not: null } },
        },
      },
    }),
    db.projectBaseline.findMany({
      where: { projectId: id },
      orderBy: { number: "asc" },
      include: { snaps: true },
    }),
  ])

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const tasks = project.tasks
  const totalTasks = tasks.length
  if (totalTasks === 0) return NextResponse.json({ series: [], baselines: [], totalTasks: 0 })

  // Determine time range
  const allDates = [
    project.actualStart,
    project.expectedStart,
    ...tasks.map((t) => t.endDate),
    ...tasks.map((t) => t.completedAt),
    ...baselines.flatMap((b) => b.snaps.map((s) => s.plannedEnd)),
  ].filter(Boolean) as Date[]

  const rangeStart = startOfWeek(
    allDates.reduce((min, d) => isBefore(d, min) ? d : min, allDates[0]),
    { weekStartsOn: 1 }
  )
  const rangeEnd = addWeeks(
    allDates.reduce((max, d) => isAfter(d, max) ? d : max, allDates[0]),
    2
  )

  // Generate weekly ticks
  const weeks = eachWeekOfInterval({ start: rangeStart, end: rangeEnd }, { weekStartsOn: 1 })

  // Build series
  const series = weeks.map((weekStart) => {
    const d = weekStart.toISOString()

    // Planejado: tasks with endDate <= weekStart
    const planned = pct(tasks.filter((t) => t.endDate && !isAfter(t.endDate, weekStart)).length, totalTasks)

    // Realizado: tasks marked as completed by this date
    const realized = pct(
      tasks.filter((t) => {
        const completedDate = t.completedAt ?? t.actualEnd
        if (completedDate && !isAfter(completedDate, weekStart)) return true
        if (t.status === "COMPLETED" && t.endDate && !isAfter(t.endDate, weekStart)) return true
        return false
      }).length,
      totalTasks
    )

    // Each baseline
    const baselinePcts: Record<string, number> = {}
    for (const bl of baselines) {
      const blTotal = bl.snaps.length
      if (blTotal === 0) continue
      const count = bl.snaps.filter((s) => !isAfter(s.plannedEnd, weekStart)).length
      baselinePcts[`b_${bl.id}`] = pct(count, blTotal)
    }

    return { date: d, planned, realized, ...baselinePcts }
  })

  const blMeta = baselines.map((b) => ({ id: b.id, number: b.number, name: b.name, description: b.description, createdAt: b.createdAt, snapCount: b.snaps.length }))

  return NextResponse.json({ series, baselines: blMeta, totalTasks })
}
