import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { getProjectsForPriority } from "@/lib/actions/priority"
import { PriorityClient } from "./priority-client"

export const metadata = { title: "Priorização de Projetos" }

export default async function PriorityPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

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
        progress:         p.tasks.length > 0
          ? Math.round(p.tasks.reduce((s, t) => s + t.progress, 0) / p.tasks.length)
          : 0,
      }))}
    />
  )
}
