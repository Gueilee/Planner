import { auth } from "@/auth"
import { db } from "@/lib/db"
import { notFound, redirect } from "next/navigation"
import { getProjectParticipants, getAllActiveUsers } from "@/lib/actions/meeting-participants"
import { GoNoGoClient } from "./go-no-go-client"

export const metadata = { title: "Reunião Go/No-Go" }

export default async function GoNoGoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) redirect("/login")

  const [project, projectParticipants, allUsers] = await Promise.all([
    db.project.findUnique({
      where: { id },
      include: {
        sponsor: { select: { id: true, name: true, department: true } },
        members: {
          include: { user: { select: { id: true, name: true, department: true, role: true } } },
        },
        risks: { orderBy: { status: "asc" } },
      },
    }),
    getProjectParticipants(id),
    getAllActiveUsers(),
  ])

  if (!project) notFound()

  const projectData = {
    id: project.id, title: project.title, status: project.status,
    origin: project.origin, scope: project.scope, asIs: project.asIs, toBe: project.toBe,
    assumptions: project.assumptions, restrictions: project.restrictions,
    expectedStart:  project.expectedStart?.toISOString()  ?? null,
    expectedEnd:    project.expectedEnd?.toISOString()    ?? null,
    suggestedStart: project.suggestedStart?.toISOString() ?? null,
    suggestedEnd:   project.suggestedEnd?.toISOString()   ?? null,
    economy: project.economy, estimatedCosts: project.estimatedCosts, budget: project.budget,
    sponsor: project.sponsor,
    risks: project.risks.map((r) => ({ description: r.description, level: r.status as "LOW"|"MEDIUM"|"HIGH", mitigation: r.mitigation ?? "" })),
    members: project.members.map((m) => ({ role: m.role, user: m.user })),
  }

  return (
    <GoNoGoClient
      project={projectData}
      projectParticipants={projectParticipants}
      allUsers={allUsers}
      currentUserId={session.user.id}
    />
  )
}
