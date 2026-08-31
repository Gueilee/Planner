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
      projects={projects.map((p) => ({
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
        tasksDone:        p.tasks.filter((t) => t.status === "COMPLETED").length,
        tasksTotal:       p.tasks.length,
        progress:         computeProjectProgress(
          p.tasks.map((t) => ({ progress: t.progress, parentId: t.parentId })),
        ),
      }))}
    />
  )
}
