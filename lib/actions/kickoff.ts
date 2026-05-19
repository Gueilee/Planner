"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { DocumentType } from "@/lib/generated/prisma/enums"
import { format } from "date-fns"
import type { KickOffData } from "@/lib/types/kickoff"

export async function getKickOff(projectId: string) {
  const doc = await db.projectDocument.findFirst({
    where: { projectId, type: DocumentType.KICKOFF },
    orderBy: { updatedAt: "desc" },
  })
  if (!doc) return null
  try {
    const parsed = JSON.parse(doc.content ?? "{}")
    return { id: doc.id, ...parsed } as KickOffData & { id: string }
  } catch {
    return null
  }
}

export async function saveKickOff(data: KickOffData) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const content = JSON.stringify({
    meetingDate: data.meetingDate,
    location: data.location,
    objectives: data.objectives,
    eapAreas: data.eapAreas,
    milestones: data.milestones,
    attachments: data.attachments,
    attendeeIds: data.attendeeIds,
    notes: data.notes,
    registeredAt: data.registeredAt,
  })

  if (data.id) {
    await db.projectDocument.update({
      where: { id: data.id },
      data: { content, updatedAt: new Date() },
    })
    return { id: data.id }
  }

  const doc = await db.projectDocument.create({
    data: {
      projectId: data.projectId,
      type: DocumentType.KICKOFF,
      title: `Kick-Off — ${data.projectId}`,
      content,
      version: 1,
      createdById: session.user.id,
    },
  })
  revalidatePath(`/projects/${data.projectId}`)
  return { id: doc.id }
}

export async function registerKickOff(data: KickOffData) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const meetingDate = data.meetingDate ? new Date(data.meetingDate) : new Date()
  const registeredAt = new Date().toISOString()

  const content = JSON.stringify({
    meetingDate: data.meetingDate,
    location: data.location,
    objectives: data.objectives,
    eapAreas: data.eapAreas,
    milestones: data.milestones,
    attachments: data.attachments,
    attendeeIds: data.attendeeIds,
    notes: data.notes,
    registeredAt,
  })

  await db.$transaction(async (tx) => {
    // 1. Save/update kick-off document
    if (data.id) {
      await tx.projectDocument.update({
        where: { id: data.id },
        data: { content, title: `Kick-Off — ${format(meetingDate, "dd/MM/yyyy")}`, updatedAt: new Date() },
      })
    } else {
      await tx.projectDocument.create({
        data: {
          projectId: data.projectId,
          type: DocumentType.KICKOFF,
          title: `Kick-Off — ${format(meetingDate, "dd/MM/yyyy")}`,
          content,
          version: 1,
          createdById: session.user.id,
        },
      })
    }

    // 2. Create WBS areas + tasks from EAP (only if project has none yet)
    const existingAreas = await tx.wbsArea.count({ where: { projectId: data.projectId } })
    if (existingAreas === 0) {
      for (let i = 0; i < data.eapAreas.length; i++) {
        const area = data.eapAreas[i]
        const wbs = await tx.wbsArea.create({
          data: { projectId: data.projectId, name: area.name, color: area.color, order: i },
        })
        for (let j = 0; j < area.tasks.length; j++) {
          const t = area.tasks[j]
          if (t.text.trim()) {
            await tx.scheduleTask.create({
              data: { projectId: data.projectId, wbsAreaId: wbs.id, title: t.text, status: "PLANNING", order: j },
            })
          }
        }
      }
    }

    // 3. Create Meeting record
    const meeting = await tx.meeting.create({
      data: {
        projectId: data.projectId,
        type: "KICKOFF",
        title: `Reunião de Kick-Off`,
        date: meetingDate,
        location: data.location || null,
        content: data.objectives || null,
        decisions: data.notes || null,
        createdById: session.user.id,
      },
    })

    // 4. Add participants
    for (const userId of data.attendeeIds) {
      await tx.meetingParticipant.create({ data: { meetingId: meeting.id, userId } }).catch(() => {})
    }

    // 5. Move project to IN_PROGRESS
    await tx.project.update({
      where: { id: data.projectId },
      data: { status: "IN_PROGRESS", actualStart: meetingDate },
    })
  })

  revalidatePath(`/projects/${data.projectId}`)
  return { success: true }
}
