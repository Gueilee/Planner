import { db } from "@/lib/db"
import { SCurveClient } from "./s-curve-client"
import { eachWeekOfInterval, startOfWeek, addWeeks, isAfter, isBefore } from "date-fns"
import { DatabaseZap } from "lucide-react"

function pct(count: number, total: number) {
  if (total === 0) return 0
  return Math.round((count / total) * 100)
}

function MigrationPending() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 bg-amber-50 rounded-2xl border border-amber-200">
      <DatabaseZap className="w-10 h-10 text-amber-400" />
      <div className="text-center">
        <p className="text-amber-800 font-semibold text-base">Migration pendente no banco de produção</p>
        <p className="text-amber-600 text-sm mt-1">
          As tabelas da Curva S ainda não foram criadas no banco Turso.
          Execute <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono text-xs">prisma migrate deploy</code> no servidor de produção.
        </p>
      </div>
    </div>
  )
}

export async function SCurveTab({ projectId }: { projectId: string }) {
  try {
    const [project, baselines] = await Promise.all([
      db.project.findUnique({
        where: { id: projectId },
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
        where: { projectId },
        orderBy: { number: "asc" },
        include: { snaps: true },
      }),
    ])

    if (!project) return null

    // Usar apenas tarefas FOLHA — tarefas-pai têm endDate inflado cobrindo todos os filhos
    const tasks = project.tasks.filter((t) => t._count.subtasks === 0)
    const totalTasks = tasks.length

    if (totalTasks === 0) {
      return <SCurveClient projectId={projectId} initialData={{ series: [], baselines: [], totalTasks: 0 }} />
    }

    // Range: apenas datas planejadas (endDate) — completedAt não estende o eixo X
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

    return <SCurveClient projectId={projectId} initialData={{ series, baselines: blMeta, totalTasks }} />

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes("no such table") || msg.includes("does not exist") || msg.includes("ProjectBaseline")) {
      return <MigrationPending />
    }
    throw err
  }
}
