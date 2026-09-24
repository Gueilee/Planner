import { requireScreenView } from "@/lib/permissions-guard"
import { getAllProjectsSummary } from "@/lib/actions/history"
import { HistoryClient } from "./history-client"
import { differenceInDays } from "date-fns"
import { computeProjectProgress } from "@/lib/utils/project-progress"

export const metadata = { title: "Consulta de Projetos" }

export default async function HistoryPage() {
  const { session } = await requireScreenView("history")

  const raw = await getAllProjectsSummary()

  const projects = raw.map((p) => {
    // Só tarefas-folha — grupo/seção concluído não deve contar (senão
    // diverge do Kanban, que só lista folha, pro mesmo projeto).
    const groupIds  = new Set(p.scheduleV2Items.filter((t) => t.parentId).map((t) => t.parentId as string))
    const leafItems = p.scheduleV2Items.filter((t) => !groupIds.has(t.id))
    const total    = leafItems.length
    const done     = leafItems.filter((t) => t.status === "CONCLUIDO").length
    const progress = total > 0
      ? computeProjectProgress(p.scheduleV2Items.map((t) => ({ id: t.id, progress: t.percentualCompleto, parentId: t.parentId, startDate: t.inicioEstimado, endDate: t.terminoEstimado })))
      : p.status === "COMPLETED" ? 100 : 0

    // Prazo (daysLeft) prioriza o período do CRONOGRAMA DE VERDADE (min
    // início/max término das tarefas) sobre Project.expectedStart/
    // expectedEnd — esse par é só a estimativa inicial da solicitação,
    // gravada ANTES de existir cronograma detalhado, e fica desatualizada
    // assim que ele é montado. Cai pro campo do projeto só quando nenhuma
    // tarefa tem data ainda.
    const scheduleDates = p.scheduleV2Items.reduce(
      (acc, t) => {
        if (t.inicioEstimado && (!acc.start || t.inicioEstimado < acc.start)) acc.start = t.inicioEstimado
        if (t.terminoEstimado && (!acc.end || t.terminoEstimado > acc.end)) acc.end = t.terminoEstimado
        return acc
      },
      { start: null as Date | null, end: null as Date | null }
    )
    const effectiveStart = scheduleDates.start ?? p.expectedStart
    const effectiveEnd   = scheduleDates.end   ?? p.expectedEnd

    return {
      id:            p.id,
      title:         p.title,
      description:   p.description,
      status:        p.status as string,
      priority:      p.priority,
      priorityLabel: p.priorityLabel,
      projectArea:   p.projectArea as string,
      origin:        p.origin ?? null,
      progress,
      tasksDone:     done,
      tasksTotal:    total,
      teamSize:      p._count.members,
      meetingCount:  p._count.meetings,
      riskCount:     p._count.risks,
      economy:       p.economy,
      budget:        p.budget,
      sponsor:       p.sponsor?.name ?? "—",
      projectCreatedAt: p.createdAt.toISOString(),
      expectedStart: effectiveStart?.toISOString() ?? null,
      expectedEnd:   effectiveEnd?.toISOString() ?? null,
      daysLeft:      effectiveEnd
        ? differenceInDays(effectiveEnd, new Date())
        : null,
    }
  })

  return <HistoryClient projects={projects} userRole={session.user.role} />
}
