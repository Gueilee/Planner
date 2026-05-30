import { auth } from "@/auth"
import { db } from "@/lib/db"
import { notFound, redirect } from "next/navigation"
import { getKickOff } from "@/lib/actions/kickoff"
import { getProjectParticipants, getAllActiveUsers } from "@/lib/actions/meeting-participants"
import { KickOffClient } from "./kickoff-client"

export const metadata = { title: "Kick-Off do Projeto" }

export default async function KickOffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) redirect("/login")

  const [project, projectParticipants, allUsers, existing] = await Promise.all([
    db.project.findUnique({
      where: { id },
      include: {
        sponsor: { select: { name: true, department: true } },
        risks: { orderBy: { status: "asc" } },
        members: {
          include: { user: { select: { id: true, name: true, department: true, role: true } } },
        },
      },
    }),
    getProjectParticipants(id),
    getAllActiveUsers(),
    getKickOff(id),
  ])

  if (!project) notFound()

  const projectData = {
    id: project.id, title: project.title, description: project.description,
    status: project.status, origin: project.origin, scope: project.scope,
    asIs: project.asIs, toBe: project.toBe,
    assumptions: project.assumptions, restrictions: project.restrictions,
    expectedStart: project.expectedStart?.toISOString() ?? null,
    expectedEnd: project.expectedEnd?.toISOString() ?? null,
    economy: project.economy, estimatedCosts: project.estimatedCosts, budget: project.budget,
    sponsor: project.sponsor,
    risks: project.risks.map((r) => ({
      description: r.description, level: r.status as "LOW"|"MEDIUM"|"HIGH"|"CRITICAL", mitigation: r.mitigation ?? "",
    })),
    members: project.members.map((m) => ({
      role: m.role,
      user: { id: m.user.id, name: m.user.name, department: m.user.department, role: m.user.role },
    })),
  }

  return (
    <KickOffClient
      project={projectData}
      existing={existing}
      projectParticipants={projectParticipants}
      allUsers={allUsers}
    />
  )
}
