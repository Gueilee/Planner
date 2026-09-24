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

    // Prazo (daysLeft, e expectedStart/expectedEnd abaixo) prioriza o
    // período do CRONOGRAMA DE VERDADE (min início/max término das
    // tarefas) sobre Project.expectedStart/expectedEnd — esse par é só a
    // estimativa inicial da solicitação do projeto, gravada ANTES de
    // existir cronograma detalhado, e fica desatualizada assim que ele é
    // montado (ex.: pedido pra terminar em 18/09, cronograma de verdade vai
    // até 12/11 — urgência/dias restantes ficavam sempre "atrasado", mesmo
    // com o projeto no meio do prazo real). Cai pro campo do projeto só
    // quando nenhuma tarefa tem data ainda.
    const scheduleDates = p.tasks.reduce(
      (acc, t) => {
        if (t.startDate && (!acc.start || t.startDate < acc.start)) acc.start = t.startDate
        if (t.endDate && (!acc.end || t.endDate > acc.end)) acc.end = t.endDate
        return acc
      },
      { start: null as Date | null, end: null as Date | null }
    )
    const effectiveStart = scheduleDates.start ?? p.expectedStart
    const effectiveEnd   = scheduleDates.end   ?? p.expectedEnd

    const daysLeft = effectiveEnd
      ? differenceInDays(effectiveEnd, new Date())
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
      expectedEnd:   effectiveEnd?.toISOString() ?? null,
      expectedStart: effectiveStart?.toISOString() ?? null,
      sponsor:       p.sponsor?.name ?? "—",
      daysLeft,
      isResponsavel: p.isResponsavel,
    }
  })

  // Membros e sponsors veem apenas projetos em que participam; Cliente é
  // mais restrito ainda — só projeto em que consta como RESPONSÁVEL de
  // alguma atividade (não basta ser "membro"), pra nunca um cliente ver o
  // projeto de outro cliente dentro da mesma filial.
  const visibleProjects = FULL_ACCESS_ROLES.has(userRole)
    ? projects
    : userRole === "CLIENT"
      ? projects.filter((p) => p.isResponsavel)
      : projects.filter((p) => p.members.some((m) => m.id === userId))

  return <KanbanClient projects={visibleProjects} riskThresholdPct={riskThresholdPct} userRole={userRole} />
}
