import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { getProjectsForClosure } from "@/lib/actions/encerramento"
import { EncerramentoClient } from "./encerramento-client"

export const metadata = { title: "Encerramento de Projeto" }

export default async function EncerramentoPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const projects = await getProjectsForClosure()

  return (
    <EncerramentoClient
      projects={projects.map((p) => ({
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
        tasksTotal:   p.tasks.length,
        tasksDone:    p.tasks.filter((t) => t.status === "COMPLETED").length,
      }))}
    />
  )
}
