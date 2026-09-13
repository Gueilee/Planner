"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { addMonths } from "date-fns"
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
  justification: string
  assumptions: string
  restrictions: string
  // Prazo é uma estimativa opcional — término não é mais digitado direto,
  // é derivado de início + duração (a data de término de verdade vem do
  // cronograma do projeto, não da solicitação).
  expectedStart?: string
  expectedDurationMonths?: number
  files: Array<{ id?: string; name: string; url: string; size: number }>
}) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const memberIds = [session.user.id]
  if (data.sponsorId !== session.user.id) memberIds.push(data.sponsorId)

  const expectedStartDate = data.expectedStart ? new Date(data.expectedStart) : null
  const expectedEndDate = expectedStartDate && data.expectedDurationMonths
    ? addMonths(expectedStartDate, data.expectedDurationMonths)
    : null

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
      justification:  data.justification || null,
      assumptions:    data.assumptions || null,
      restrictions:   data.restrictions || null,
      expectedStart:  expectedStartDate,
      expectedEnd:    expectedEndDate,
      expectedDurationMonths: data.expectedDurationMonths ?? null,
      sponsorId:      data.sponsorId || null,
      roadmapYear:    new Date().getFullYear(),
      roadmapQuarter: Math.ceil((new Date().getMonth() + 1) / 3),
      members: {
        create: memberIds.map((userId, i) => ({
          userId,
          role: i === 0 ? "Gerente de Projetos" : "Solicitante / Sponsor",
        })),
      },
    },
  })

  // Link pre-uploaded attachments (created by /api/upload) to this project
  const uploadedIds = data.files.map(f => f.id).filter(Boolean) as string[]
  if (uploadedIds.length > 0) {
    await db.attachment.updateMany({
      where: { id: { in: uploadedIds } },
      data:  { projectId: project.id },
    })
  }

  revalidatePath("/projects")
  revalidatePath("/dashboard")
  return { id: project.id }
}
