import { auth } from "@/auth"
import { db } from "@/lib/db"
import { notFound, redirect } from "next/navigation"
import { getPresentation } from "@/lib/actions/presentation"
import { BuilderClient } from "./builder-client"

export const metadata = { title: "Apresentação Técnica" }

export default async function PresentationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) redirect("/login")

  const project = await db.project.findUnique({
    where: { id },
    include: {
      sponsor: { select: { name: true, department: true } },
      risks: { orderBy: { status: "asc" } },
      members: {
        include: { user: { select: { id: true, name: true, department: true, role: true } } },
      },
    },
  })

  if (!project) notFound()

  const existing = await getPresentation(id)

  const projectData = {
    id: project.id,
    title: project.title,
    description: project.description,
    status: project.status,
    origin: project.origin,
    scope: project.scope,
    asIs: project.asIs,
    toBe: project.toBe,
    assumptions: project.assumptions,
    restrictions: project.restrictions,
    expectedStart: project.expectedStart?.toISOString() ?? null,
    expectedEnd: project.expectedEnd?.toISOString() ?? null,
    economy: project.economy,
    estimatedCosts: project.estimatedCosts,
    budget: project.budget,
    sponsor: project.sponsor,
    risks: project.risks.map((r) => ({
      description: r.description,
      level: r.status as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      mitigation: r.mitigation ?? "",
    })),
    members: project.members.map((m) => ({
      role: m.role,
      user: { name: m.user.name, department: m.user.department, role: m.user.role },
    })),
  }

  return (
    <BuilderClient
      project={projectData}
      existing={existing}
    />
  )
}
