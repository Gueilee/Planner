import { auth } from "@/auth"
import { db } from "@/lib/db"
import { notFound, redirect } from "next/navigation"
import { getKickOff } from "@/lib/actions/kickoff"
import { getKickOffPresentation } from "@/lib/actions/kickoff-presentation"
import { KOBuilderClient } from "./builder-client"

export const metadata = { title: "Apresentação de Kick-Off" }

export default async function KickOffPresentationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) redirect("/login")

  const [project, kickoff, existing] = await Promise.all([
    db.project.findUnique({
      where: { id },
      include: {
        sponsor:  { select: { name: true, department: true } },
        risks:    { orderBy: { status: "asc" } },
        members:  { include: { user: { select: { id: true, name: true, department: true, role: true, email: true } } } },
      },
    }),
    getKickOff(id),
    getKickOffPresentation(id),
  ])

  if (!project) notFound()

  const projectData = {
    id:             project.id,
    title:          project.title,
    description:    project.description,
    status:         project.status,
    origin:         project.origin,
    scope:          project.scope,
    asIs:           project.asIs,
    toBe:           project.toBe,
    assumptions:    project.assumptions,
    restrictions:   project.restrictions,
    expectedStart:  project.expectedStart?.toISOString() ?? null,
    expectedEnd:    project.expectedEnd?.toISOString()   ?? null,
    economy:        project.economy,
    estimatedCosts: project.estimatedCosts,
    budget:         project.budget,
    sponsor:        project.sponsor,
    risks: project.risks.map((r) => ({
      description: r.description,
      level:       r.status as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      mitigation:  r.mitigation ?? "",
    })),
    members: project.members.map((m) => ({
      role: m.role,
      user: { id: m.user.id, name: m.user.name, department: m.user.department, role: m.user.role, email: m.user.email },
    })),
  }

  return (
    <KOBuilderClient
      project={projectData}
      kickoff={kickoff}
      existing={existing}
    />
  )
}
