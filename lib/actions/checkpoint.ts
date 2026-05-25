"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { generateMeetingATA } from "@/lib/actions/ata"

export type CheckpointFrequency = "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY"

export type TaskAttachmentInput = {
  fileName: string
  fileUrl: string
  fileType: string
  fileSize: number
}

export type TaskUpdateInput = {
  taskId: string
  status: string
  progress: number
  comment?: string
  attachments?: TaskAttachmentInput[]
}

export type CheckpointInput = {
  projectId: string
  date: string
  frequency: CheckpointFrequency
  location: string
  highlights: string
  blockers: string
  nextSteps: string
  attendeeIds: string[]
  taskUpdates: TaskUpdateInput[]
}

const FREQ_LABELS: Record<CheckpointFrequency, string> = {
  DAILY:    "Diário",
  WEEKLY:   "Semanal",
  BIWEEKLY: "Quinzenal",
  MONTHLY:  "Mensal",
}

export async function saveCheckpoint(data: CheckpointInput) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const meetingDate = new Date(data.date)
  const freq = FREQ_LABELS[data.frequency]

  const meetingId = await db.$transaction(async (tx) => {
    // 1. Create meeting record
    const meeting = await tx.meeting.create({
      data: {
        projectId: data.projectId,
        type: "CHECKPOINT",
        title: `Checkpoint ${freq} — ${format(meetingDate, "dd/MM/yyyy", { locale: ptBR })}`,
        date: meetingDate,
        location: data.location || null,
        content: data.highlights || null,
        decisions: data.nextSteps || null,
        nextActions: data.blockers || null,
        createdById: session.user.id,
      },
    })

    // 2. Participants
    for (const userId of data.attendeeIds) {
      await tx.meetingParticipant.create({ data: { meetingId: meeting.id, userId } }).catch(() => {})
    }

    // 3. Update tasks + add comments
    for (const upd of data.taskUpdates) {
      await tx.scheduleTask.update({
        where: { id: upd.taskId },
        data: {
          status: upd.status as never,
          progress: upd.progress,
          ...(upd.status === "COMPLETED" && { completedAt: new Date() }),
        },
      })

      let commentId: string | null = null
      if (upd.comment?.trim()) {
        const comment = await tx.comment.create({
          data: {
            taskId: upd.taskId,
            userId: session.user.id,
            content: `[Checkpoint ${format(meetingDate, "dd/MM")}] ${upd.comment.trim()}`,
          },
        })
        commentId = comment.id
      }

      if (upd.attachments?.length) {
        for (const att of upd.attachments) {
          await tx.attachment.create({
            data: {
              taskId:    upd.taskId,
              commentId,
              fileName:  att.fileName,
              fileUrl:   att.fileUrl,
              fileType:  att.fileType,
              fileSize:  att.fileSize,
            },
          })
        }
      }
    }

    return meeting.id
  })

  revalidatePath(`/projects/${data.projectId}`)
  revalidatePath(`/projects/${data.projectId}/schedule`)

  // Generate ATA after transaction completes (reads participants + comments)
  let ataContent: string | null = null
  try {
    const ata = await generateMeetingATA(meetingId)
    ataContent = ata.content
  } catch {
    // ATA generation is best-effort; don't fail the save
  }

  return { success: true, meetingId, ataContent }
}

export async function getCheckpointHistory(projectId: string) {
  const meetings = await db.meeting.findMany({
    where: { projectId, type: "CHECKPOINT" },
    orderBy: { date: "desc" },
    select: {
      id: true,
      title: true,
      date: true,
      location: true,
      content: true,
      _count: { select: { participants: true } },
    },
    take: 10,
  })
  return meetings.map((m) => ({ ...m, date: m.date.toISOString() }))
}
