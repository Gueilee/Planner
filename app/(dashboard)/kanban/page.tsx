import { db } from "@/lib/db"
import { requireScreenView } from "@/lib/permissions-guard"
import { getAllProjectsForKanban } from "@/lib/actions/kanban"
import { KanbanClient } from "./kanban-client"
import { differenceInDays } from "date-fns"
import { computeProjectProgress } from "@/lib/utils/project-progress"
import { DEFAULT_RISK_THRESHOLD_PCT } from "@/lib/utils/schedule-status"

export const dynamic = "force-dynamic"

export const metadata = { title: "Kanban — Projetos" }

const FULL_ACCESS_ROLES = new Set(["ADMIN", "DIRECTOR", "PROJECT_MANAGER"])

export default async function KanbanPage() {
  const { session } = await requireScreenView("kanban")

  const userId   = session.user.id   ?? ""
  const userRole = (session.user.role ?? "PROJECT_MEMBER") as string

  const [raw, org] = await Promise.all([
    getAllProjectsForKanban(),
    db.organization.findUnique({
      where:  { id: session.user.organizationId },
      select: { riskThresholdPct: true },
    }),
  ])
  const riskThresholdPct = org?.riskThresholdPct ?? DEFAULT_RISK_THRESHOLD_PCT

  const projects = raw.map((p) => {
    // Cards mostram tarefas folha (sem filhos) — mas o % de progresso usa a
    // função canônica (lib/utils/project-progress.ts), a mesma do Cronograma,
    // Detalhes do Projeto e Status Report, para nunca divergir de tela pra tela.
    const leafTasks    = p.tasks.filter((t) => t._count.subtasks === 0)
    const total        = leafTasks.length
    const done         = leafTasks.filter((t) => t.status === "COMPLETED").length
    const progress     = computeProjectProgress(
      p.tasks.map((t) => ({ id: t.id, progress: t.progress, parentId: t.parentId, startDate: t.startDate, endDate: t.endDate })),
    )

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

  return <KanbanClient projects={visibleProjects} riskThresholdPct={riskThresholdPct} />
}
