import { requireScreenView } from "@/lib/permissions-guard"
import { getProjectsForPriority } from "@/lib/actions/priority"
import { PriorityClient } from "./priority-client"
import { computeProjectProgress } from "@/lib/utils/project-progress"

export const metadata = { title: "Priorização de Projetos" }

export default async function PriorityPage() {
  await requireScreenView("priority")

  const projects = await getProjectsForPriority()

  return (
    <PriorityClient
      projects={projects.map((p) => {
        // Só tarefas-folha — grupo/seção concluído não deve contar (senão
        // diverge do Kanban, que só lista folha, pro mesmo projeto).
        const groupIds  = new Set(p.scheduleV2Items.filter((t) => t.parentId).map((t) => t.parentId as string))
        const leafItems = p.scheduleV2Items.filter((t) => !groupIds.has(t.id))
        return {
          id:               p.id,
          title:            p.title,
          status:           p.status,
          priority:         p.priority,
          priorityLabel:    p.priorityLabel,
          priorityNotes:    p.priorityNotes,
          priorityUpdatedAt: p.priorityUpdatedAt?.toISOString() ?? null,
          projectArea:      p.projectArea,
          sponsor:          p.sponsor?.name ?? "—",
          expectedEnd:      p.expectedEnd?.toISOString() ?? null,
          economy:          p.economy,
          teamSize:         p.members.length,
          tasksDone:        leafItems.filter((t) => t.status === "CONCLUIDO").length,
          tasksTotal:       leafItems.length,
          progress:         computeProjectProgress(
            p.scheduleV2Items.map((t) => ({ id: t.id, progress: t.percentualCompleto, parentId: t.parentId, startDate: t.inicioEstimado, endDate: t.terminoEstimado })),
          ),
        }
      })}
    />
  )
}
