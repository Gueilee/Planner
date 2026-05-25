"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { ProjectStatus, MeetingType } from "@/lib/generated/prisma/enums"
import { generateMeetingATA } from "@/lib/actions/ata"

export async function saveGoNoGoDecision(data: {
  projectId: string
  decision: "GO" | "NO_GO" | "STAND_BY"
  notes: string
  attendeeIds: string[]
  meetingDate: string
}) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const uniqueIds = [...new Set(data.attendeeIds)]

  const projectStatus =
    data.decision === "GO"      ? ProjectStatus.PLANNING :
    data.decision === "NO_GO"   ? ProjectStatus.FUTURE_ANALYSIS :
    ProjectStatus.ON_HOLD

  const decisionLabel =
    data.decision === "GO"      ? "APROVADO — Em Planejamento" :
    data.decision === "NO_GO"   ? "ANÁLISE FUTURA" :
    "STAND BY"

  const meetingId = await db.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: data.projectId },
      data: { status: projectStatus },
    })
    const meeting = await tx.meeting.create({
      data: {
        projectId: data.projectId,
        type: MeetingType.GO_NO_GO,
        title: `Reunião Go/No-Go — ${decisionLabel}`,
        date: new Date(data.meetingDate),
        decisions: data.notes || null,
        createdById: session.user.id,
        ...(uniqueIds.length > 0
          ? { participants: { create: uniqueIds.map((userId) => ({ userId })) } }
          : {}),
      },
    })
    return meeting.id
  })

  revalidatePath(`/projects/${data.projectId}`)
  revalidatePath("/projects")
  revalidatePath("/dashboard")

  let ataContent: string | null = null
  try {
    const ata = await generateMeetingATA(meetingId)
    ataContent = ata.content
  } catch {}

  return { success: true, meetingId, ataContent }
}
