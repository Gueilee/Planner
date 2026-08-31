"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { generateCheckpointATADirect } from "@/lib/actions/ata"
import { deriveStatus, deriveProgress } from "@/lib/utils/task-progress"
import { detectScheduleStatusWorsening, DEFAULT_RISK_THRESHOLD_PCT } from "@/lib/utils/schedule-status"
import { notifyUser, notifyProjectMembers } from "@/lib/notify"

export type CheckpointFrequency = "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY"

export type TaskAttachmentInput = {
  fileName: string
  fileUrl:  string
  fileType: string
  fileSize: number
}

export type TaskUpdateInput = {
  taskId:      string
  title:       string
  areaName:    string
  responsible: string
  startDate:   string | null
  endDate:     string | null
  oldStatus:   string
  oldProgress: number
  status:      string
  progress:    number
  comment?:    string
  attachments?: TaskAttachmentInput[]
}

export type CheckpointInput = {
  projectId:             string
  date:                  string
  frequency:             CheckpointFrequency
  location:              string
  highlights:            string
  blockers:              string
  nextSteps:             string
  observations?:         string
  attendeeIds:           string[]
  externalAttendeesStr?: string
  taskUpdates:           TaskUpdateInput[]
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
  const freq        = FREQ_LABELS[data.frequency]

  // Fetch registeredBy name for ATA
  const registeredBy = await db.user.findUnique({
    where: { id: session.user.id },
    select: { name: true },
  })

  // Fetch participants names for ATA
  const participantUsers = data.attendeeIds.length
    ? await db.user.findMany({
        where: { id: { in: data.attendeeIds }, organizationId: session.user.organizationId },
        select: { name: true, department: true },
      })
    : []

  const meetingId = await db.$transaction(async (tx) => {
    // 1. Create meeting record
    const meeting = await tx.meeting.create({
      data: {
        projectId:   data.projectId,
        type:        "CHECKPOINT",
        title:       `Checkpoint ${freq} — ${format(meetingDate, "dd/MM/yyyy", { locale: ptBR })}`,
        date:        meetingDate,
        location:     data.location              || null,
        content:      data.highlights            || null,
        decisions:    data.nextSteps             || null,
        nextActions:  data.blockers              || null,
        observations: data.observations?.trim()  || null,
        createdById:  session.user.id,
      },
    })

    // 2. Participants
    for (const userId of data.attendeeIds) {
      await tx.meetingParticipant.create({ data: { meetingId: meeting.id, userId } }).catch(() => {})
    }

    // 3. Update tasks with auto-derivation + add comments + attachments
    for (const upd of data.taskUpdates) {
      // Apply auto-derivation: if only status changed, derive progress; if both provided use as-is
      let finalStatus   = upd.status
      let finalProgress = upd.progress

      if (upd.status !== upd.oldStatus && upd.progress === upd.oldProgress) {
        // Status changed — derive new progress
        finalProgress = deriveProgress(finalStatus, upd.oldProgress)
      } else if (upd.progress !== upd.oldProgress && upd.status === upd.oldStatus) {
        // Progress changed — derive new status
        finalStatus = deriveStatus(finalProgress, upd.oldStatus)
      }

      await tx.scheduleTask.update({
        where: { id: upd.taskId },
        data: {
          status:      finalStatus as never,
          progress:    finalProgress,
          ...(finalStatus === "COMPLETED" && { completedAt: new Date() }),
        },
      })

      let commentId: string | null = null
      if (upd.comment?.trim()) {
        const comment = await tx.comment.create({
          data: {
            taskId:  upd.taskId,
            userId:  session.user.id,
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
              commentId: commentId ?? undefined,
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
  revalidatePath(`/projects/${data.projectId}/kanban`)

  // ── Alertas proativos ──────────────────────────────────────────────────────
  try {
    const project = await db.project.findUnique({ where: { id: data.projectId }, select: { title: true } })

    // Checkpoint registrado — avisa os membros do projeto (quem quiser saber)
    await notifyProjectMembers(data.projectId, "checkpointAdded", {
      type:    "checkpoint_added",
      title:   "Checkpoint registrado",
      message: `Um checkpoint ${FREQ_LABELS[data.frequency].toLowerCase()} foi registrado no projeto "${project?.title ?? ""}".`,
      link:    `/projects/${data.projectId}`,
    })

    // Tarefas que pioraram de faixa de prazo neste checkpoint — avisa o responsável
    const org = await db.organization.findUnique({
      where:  { id: session.user.organizationId },
      select: { riskThresholdPct: true },
    })
    const threshold = org?.riskThresholdPct ?? DEFAULT_RISK_THRESHOLD_PCT
    const taskIds   = data.taskUpdates.map((u) => u.taskId)
    const respById  = taskIds.length
      ? new Map(
          (await db.scheduleTask.findMany({ where: { id: { in: taskIds } }, select: { id: true, responsibleId: true } }))
            .map((t) => [t.id, t.responsibleId] as const)
        )
      : new Map<string, string | null>()

    for (const upd of data.taskUpdates) {
      const responsibleId = respById.get(upd.taskId)
      if (!responsibleId) continue
      const { to, worsened } = detectScheduleStatusWorsening(
        upd.oldProgress, upd.progress,
        upd.startDate ? new Date(upd.startDate) : null,
        upd.endDate   ? new Date(upd.endDate)   : null,
        threshold,
      )
      if (worsened) {
        await notifyUser(responsibleId, "taskOverdue", {
          type:    "task_schedule_status",
          title:   to === "DELAYED" ? "Tarefa atrasada" : "Tarefa em risco",
          message: `"${upd.title}" está ${to === "DELAYED" ? "atrasada" : "em risco"} em relação ao prazo planejado.`,
          link:    `/projects/${data.projectId}/schedule`,
        })
      }
    }
  } catch { /* alertas são best-effort — não bloqueiam o checkpoint */ }

  // Generate rich ATA using the direct data from this session
  let ataContent: string | null = null
  try {
    ataContent = await generateCheckpointATADirect({
      meetingId,
      projectId:    data.projectId,
      date:         meetingDate,
      frequency:    freq,
      location:     data.location,
      highlights:   data.highlights,
      blockers:     data.blockers,
      nextSteps:    data.nextSteps,
      observations: data.observations,
      registeredBy: registeredBy?.name ?? "Sistema",
      participants: [
        ...participantUsers,
        ...(data.externalAttendeesStr
          ? data.externalAttendeesStr.split(",").map((s) => ({ name: s.trim(), department: "Externo" }))
          : []),
      ],
      taskUpdates: data.taskUpdates,
    })
  } catch { /* ATA generation is best-effort */ }

  return { success: true, meetingId, ataContent }
}

export async function getCheckpointHistory(projectId: string) {
  const meetings = await db.meeting.findMany({
    where:   { projectId, type: "CHECKPOINT" },
    orderBy: { date: "desc" },
    select: {
      id:       true,
      title:    true,
      date:     true,
      location: true,
      content:  true,
      _count:   { select: { participants: true } },
    },
    take: 10,
  })
  return meetings.map((m) => ({ ...m, date: m.date.toISOString() }))
}
