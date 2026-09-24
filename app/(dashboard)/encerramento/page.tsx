import { requireScreenView } from "@/lib/permissions-guard"
import { getProjectsForClosure } from "@/lib/actions/encerramento"
import { EncerramentoClient } from "./encerramento-client"

export const metadata = { title: "Encerramento de Projeto" }

export default async function EncerramentoPage() {
  await requireScreenView("closure")

  const projects = await getProjectsForClosure()

  return (
    <EncerramentoClient
      projects={projects.map((p) => {
        // Só tarefas-folha (sem filhos) — um grupo/seção do Cronograma
        // rolar pra "Concluído" não deve contar aqui, senão diverge do que
        // o Kanban mostra pro mesmo projeto (que só lista folha).
        const groupIds = new Set(p.scheduleV2Items.filter((t) => t.parentId).map((t) => t.parentId as string))
        const leafItems = p.scheduleV2Items.filter((t) => !groupIds.has(t.id))
        return {
          id:           p.id,
          title:        p.title,
          description:  p.description,
          status:       p.status as string,
          priority:     p.priority,
          priorityLabel: p.priorityLabel,
          expectedEnd:  p.expectedEnd?.toISOString() ?? null,
          actualStart:  p.actualStart?.toISOString() ?? null,
          goLiveDate:   p.goLiveDate?.toISOString() ?? null,
          sponsorName:  p.sponsor?.name ?? null,
          memberCount:  p.members.length,
          tasksTotal:   leafItems.length,
          tasksDone:    leafItems.filter((t) => t.status === "CONCLUIDO").length,
        }
      })}
    />
  )
}
