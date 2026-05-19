import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { getAllProjectsForKanban } from "@/lib/actions/kanban"
import { KanbanClient } from "./kanban-client"
import { differenceInDays } from "date-fns"

export const metadata = { title: "Kanban — Projetos" }

export default async function KanbanPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const raw = await getAllProjectsForKanban()

  const projects = raw.map((p) => {
    const tasks    = p.tasks
    const total    = tasks.length
    const done     = tasks.filter((t) => t.status === "COMPLETED").length
    const progress = total > 0
      ? Math.round(tasks.reduce((s, t) => s + t.progress, 0) / total)
      : 0

    const highRisks = p.risks.filter((r) =>
      r.status === "HIGH" || r.status === "CRITICAL"
    ).length

    const daysLeft = p.expectedEnd
      ? differenceInDays(p.expectedEnd, new Date())
      : null

    return {
      id:            p.id,
      title:         p.title,
      description:   p.description,
      status:        p.status as string,
      priority:      p.priority,
      priorityLabel: p.priorityLabel,
      progress,
      tasksDone:     done,
      tasksTotal:    total,
      teamSize:      p._count.members,
      members:       p.members.map((m) => ({ id: m.user.id, name: m.user.name })),
      riskCount:     p.risks.length,
      highRisks,
      economy:       p.economy,
      budget:        p.budget,
      expectedEnd:   p.expectedEnd?.toISOString() ?? null,
      expectedStart: p.expectedStart?.toISOString() ?? null,
      sponsor:       p.sponsor?.name ?? "—",
      daysLeft,
    }
  })

  return <KanbanClient projects={projects} />
}
