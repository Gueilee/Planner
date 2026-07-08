"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { ProjectStatus } from "@/lib/generated/prisma/enums"

export async function createProjectRequest(data: {
  title: string
  area: string
  projectArea: string
  sponsorId: string
  areaSolicitante: string
  origin: string
  stakeholders: string[]
  scope: string
  asIs: string
  toBe: string
  assumptions: string
  restrictions: string
  expectedStart: string
  expectedEnd: string
  risks: Array<{ description: string; level: string; mitigation: string }>
  files: Array<{ name: string; url: string; size: number }>
  benefits: Array<{
    category: string; type: string; description: string
    unit: string; plannedValue: number; frequency: string
    customTypeName?: string | null
    impactLevel?: string | null
    strategicWeight?: number
  }>
}) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const memberIds = [session.user.id]
  if (data.sponsorId !== session.user.id) memberIds.push(data.sponsorId)

  // Generate next sequential request number scoped per organization
  const maxResult  = await db.project.aggregate({
    _max: { requestNumber: true },
    where: { organizationId: session.user.organizationId },
  })
  const nextNumber = (maxResult._max.requestNumber ?? 0) + 1

  const project = await db.project.create({
    data: {
      title:          data.title,
      requestNumber:  nextNumber,
      organizationId: session.user.organizationId,
      description:    data.scope || null,
      status:         ProjectStatus.PENDING_GO_NO_GO,
      projectArea:    (data.projectArea || "TECNOLOGIA") as never,
      origin:         data.origin || null,
      scope:          data.scope || null,
      asIs:           data.asIs || null,
      toBe:           data.toBe || null,
      assumptions:    data.assumptions || null,
      restrictions:   data.restrictions || null,
      expectedStart:  data.expectedStart ? new Date(data.expectedStart) : null,
      expectedEnd:    data.expectedEnd   ? new Date(data.expectedEnd)   : null,
      sponsorId:      data.sponsorId || null,
      roadmapYear:    new Date().getFullYear(),
      roadmapQuarter: Math.ceil((new Date().getMonth() + 1) / 3),
      members: {
        create: memberIds.map((userId, i) => ({
          userId,
          role: i === 0 ? "Gerente de Projetos" : "Solicitante / Sponsor",
        })),
      },
      risks: data.risks.length > 0
        ? {
            create: data.risks.map((r) => ({
              description: r.description,
              probability: "MEDIUM",
              impact:      r.level,
              mitigation:  r.mitigation || null,
              status:      (["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(r.level) ? r.level : "MEDIUM") as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
            })),
          }
        : undefined,
      attachments: data.files.length > 0
        ? {
            create: data.files.map((f) => ({
              fileName: f.name,
              fileUrl:  f.url,
              fileSize: f.size,
              fileType: f.name.split(".").pop()?.toLowerCase() ?? "",
            })),
          }
        : undefined,
      benefits: data.benefits.length > 0
        ? {
            create: data.benefits.map((b) => ({
              category:       b.category as never,
              type:           b.type     as never,
              description:    b.description,
              unit:           b.unit || "R$",
              plannedValue:   b.plannedValue,
              realizedValue:  0,
              frequency:      b.frequency as never,
              status:         "PLANNED"   as never,
              customTypeName: b.customTypeName ?? null,
              impactLevel:    (b.impactLevel ?? null) as never,
              strategicWeight: b.strategicWeight ?? 0,
              createdById:    session.user.id!,
            })),
          }
        : undefined,
    },
  })

  revalidatePath("/projects")
  revalidatePath("/dashboard")
  return { id: project.id }
}
