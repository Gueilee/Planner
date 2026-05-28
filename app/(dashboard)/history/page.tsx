import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { getAllProjectsSummary } from "@/lib/actions/history"
import { HistoryClient } from "./history-client"
import { differenceInDays } from "date-fns"

export const metadata = { title: "Consulta de Projetos" }

export default async function HistoryPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const raw = await getAllProjectsSummary()

  const projects = raw.map((p) => {
    const total    = p.tasks.length
    const done     = p.tasks.filter((t) => t.status === "COMPLETED").length
    const progress = total > 0
      ? Math.round(p.tasks.reduce((s, t) => s + t.progress, 0) / total)
      : p.status === "COMPLETED" ? 100 : 0

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
      expectedStart: p.expectedStart?.toISOString() ?? null,
      expectedEnd:   p.expectedEnd?.toISOString() ?? null,
      daysLeft:      p.expectedEnd
        ? differenceInDays(p.expectedEnd, new Date())
        : null,
    }
  })

  return <HistoryClient projects={projects} />
}
