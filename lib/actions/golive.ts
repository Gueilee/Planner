"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { addDays, format } from "date-fns"
import { ptBR } from "date-fns/locale"

export type DeploymentType = "DIRECT" | "PHASED"

export type GoLiveInput = {
  projectId: string
  goLiveDate: string
  deploymentType: DeploymentType
  pilotEndDate?: string
  rampUpEndDate?: string
  postGoLiveDays: 30 | 60 | 90
  notes: string
  attendeeIds: string[]
}

export async function registerGoLive(data: GoLiveInput) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const glDate      = new Date(data.goLiveDate + "T12:00:00")
  const postEndDate = addDays(glDate, data.postGoLiveDays)

  const contentParts: string[] = []
  if (data.deploymentType === "PHASED") {
    if (data.pilotEndDate)  contentParts.push(`Fim do Piloto: ${data.pilotEndDate}`)
    if (data.rampUpEndDate) contentParts.push(`Fim do Ramp-Up: ${data.rampUpEndDate}`)
  }
  if (data.notes.trim()) contentParts.push(data.notes.trim())

  await db.$transaction(async (tx) => {
    const meeting = await tx.meeting.create({
      data: {
        projectId:   data.projectId,
        type:        "GO_LIVE",
        title:       `GO LIVE — ${format(glDate, "dd/MM/yyyy", { locale: ptBR })}`,
        date:        glDate,
        location:    data.deploymentType === "PHASED" ? "Faseado (Piloto + Ramp-Up)" : "GO LIVE Direto",
        content:     contentParts.join("\n") || null,
        decisions:   `Monitoramento pós GO LIVE: ${data.postGoLiveDays} dias (até ${format(postEndDate, "dd/MM/yyyy", { locale: ptBR })})`,
        createdById: session.user.id,
      },
    })

    for (const userId of data.attendeeIds) {
      await tx.meetingParticipant.create({ data: { meetingId: meeting.id, userId } }).catch(() => {})
    }

    await tx.project.update({
      where: { id: data.projectId },
      data: {
        goLiveActual:      glDate,
        goLiveDate:        glDate,
        postGoLiveEndDate: postEndDate,
        status:            "GO_LIVE",
      },
    })
  })

  revalidatePath(`/projects/${data.projectId}`)
  return { success: true }
}

export async function closeProject(projectId: string, closingNotes?: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const now = new Date()

  await db.$transaction(async (tx) => {
    await tx.projectDocument.create({
      data: {
        projectId,
        type:        "PROJECT_CLOSURE",
        title:       `Encerramento — ${format(now, "dd/MM/yyyy", { locale: ptBR })}`,
        content:     closingNotes?.trim() || null,
        version:     1,
        createdById: session.user.id,
      },
    })

    await tx.project.update({
      where: { id: projectId },
      data: { status: "COMPLETED", actualEnd: now },
    })
  })

  revalidatePath(`/projects/${projectId}`)
  return { success: true }
}

export async function getProjectForClosure(projectId: string) {
  return db.project.findUnique({
    where: { id: projectId },
    include: {
      sponsor: { select: { name: true, department: true } },
      members: {
        include: {
          user: { select: { id: true, name: true, email: true, department: true, role: true } },
        },
      },
      wbsAreas: {
        orderBy: { order: "asc" },
        include: {
          tasks: {
            orderBy: { order: "asc" },
            include: { responsible: { select: { name: true } } },
          },
        },
      },
      tasks: { orderBy: { order: "asc" }, select: { id: true, status: true, progress: true } },
      risks: { orderBy: { createdAt: "asc" } },
      meetings: {
        orderBy: { date: "asc" },
        include: { _count: { select: { participants: true } } },
      },
      lessonsLearned: {
        orderBy: { createdAt: "asc" },
        include: { createdBy: { select: { name: true } } },
      },
    },
  })
}
