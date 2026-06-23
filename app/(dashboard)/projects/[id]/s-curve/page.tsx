import { db } from "@/lib/db"
import { auth } from "@/auth"
import { notFound } from "next/navigation"
import { SCurveClient } from "./s-curve-client"
import { eachWeekOfInterval, startOfWeek, addWeeks, isAfter, isBefore } from "date-fns"

export const dynamic = "force-dynamic"

function pct(count: number, total: number) {
  if (total === 0) return 0
  return Math.round((count / total) * 100)
}

export default async function SCurvePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) notFound()

  const [project, baselines] = await Promise.all([
    db.project.findUnique({
      where: { id },
      select: {
        actualStart: true,
        expectedStart: true,
        actualEnd: true,
        expectedEnd: true,
        tasks: {
          select: {
            id: true, endDate: true, completedAt: true, actualEnd: true, status: true,
            _count: { select: { subtasks: true } },
          },
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

  if (!project) notFound()

  // Usar apenas tarefas FOLHA — tarefas-pai têm endDate inflado cobrindo todos os filhos
  const tasks = project.tasks.filter((t) => t._count.subtasks === 0)
  const totalTasks = tasks.length

  if (totalTasks === 0) {
    return (
      <SCurveClient
        projectId={id}
        initialData={{ series: [], baselines: [], totalTasks: 0 }}
      />
    )
  }

  // Range: apenas datas planejadas — completedAt não deve estender o eixo X
  const plannedDates = [
    project.actualStart,
    project.expectedStart,
    ...tasks.map((t) => t.endDate),
  ].filter(Boolean) as Date[]

  const rangeStart = startOfWeek(
    plannedDates.reduce((min, d) => isBefore(d, min) ? d : min, plannedDates[0]),
    { weekStartsOn: 1 }
  )
  const rangeEnd = addWeeks(
    plannedDates.reduce((max, d) => isAfter(d, max) ? d : max, plannedDates[0]),
    1
  )

  const weeks = eachWeekOfInterval({ start: rangeStart, end: rangeEnd }, { weekStartsOn: 1 })

  const series = weeks.map((weekStart) => {
    const planned = pct(tasks.filter((t) => t.endDate && !isAfter(t.endDate, weekStart)).length, totalTasks)
    const realized = pct(
      tasks.filter((t) => {
        const cd = t.completedAt ?? t.actualEnd
        if (cd && !isAfter(cd, weekStart)) return true
        if (t.status === "COMPLETED" && t.endDate && !isAfter(t.endDate, weekStart)) return true
        return false
      }).length,
      totalTasks
    )

    const baselinePcts: Record<string, number> = {}
    for (const bl of baselines) {
      if (bl.snaps.length === 0) continue
      baselinePcts[`b_${bl.id}`] = pct(bl.snaps.filter((s) => !isAfter(s.plannedEnd, weekStart)).length, bl.snaps.length)
    }

    return { date: weekStart.toISOString(), planned, realized, ...baselinePcts }
  })

  const blMeta = baselines.map((b) => ({
    id: b.id,
    number: b.number,
    name: b.name,
    description: b.description,
    createdAt: b.createdAt.toISOString(),
    snapCount: b.snaps.length,
  }))

  return (
    <SCurveClient
      projectId={id}
      initialData={{ series, baselines: blMeta, totalTasks }}
    />
  )
}
