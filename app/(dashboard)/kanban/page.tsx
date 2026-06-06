import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { getAllProjectsForKanban } from "@/lib/actions/kanban"
import { KanbanClient } from "./kanban-client"
import { differenceInDays } from "date-fns"

export const dynamic = "force-dynamic"

export const metadata = { title: "Kanban — Projetos" }

const FULL_ACCESS_ROLES = new Set(["ADMIN", "DIRECTOR", "PROJECT_MANAGER"])

export default async function KanbanPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const userId   = session.user.id   ?? ""
  const userRole = (session.user.role ?? "PROJECT_MEMBER") as string

  const raw = await getAllProjectsForKanban()

  const projects = raw.map((p) => {
    // Mesma lógica do project-tasks-kanban: apenas tarefas folha (sem filhos)
    const leafTasks    = p.tasks.filter((t) => t._count.subtasks === 0)
    const total        = leafTasks.length
    const done         = leafTasks.filter((t) => t.status === "COMPLETED").length
    const progress     = total > 0
      ? Math.round(leafTasks.reduce((s, t) => s + t.progress, 0) / total)
      : 0

    const highRisks    = p.risks.filter((r) => r.status === "HIGH" || r.status === "CRITICAL").length
    const delayedTasks = leafTasks.filter((t) => t.status === "DELAYED").length

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
      projectArea:   p.projectArea as string,
      progress,
      tasksDone:     done,
      tasksTotal:    total,
      teamSize:      p._count.members,
      members:       p.members.map((m) => ({ id: m.user.id, name: m.user.name })),
      riskCount:     p.risks.length,
      highRisks,
      delayedTasks,
      economy:       p.economy,
      budget:        p.budget,
      expectedEnd:   p.expectedEnd?.toISOString() ?? null,
      expectedStart: p.expectedStart?.toISOString() ?? null,
      sponsor:       p.sponsor?.name ?? "—",
      daysLeft,
    }
  })

  // Membros e sponsors veem apenas projetos em que participam
  const visibleProjects = FULL_ACCESS_ROLES.has(userRole)
    ? projects
    : projects.filter((p) => p.members.some((m) => m.id === userId))

  return <KanbanClient projects={visibleProjects} />
}
