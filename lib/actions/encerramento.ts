"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

export type ClosureMeetingInput = {
  projectId:    string
  date:         string
  location?:    string
  content?:     string
  decisions?:   string
  nextActions?: string
  attendeeIds:  string[]
  closingNotes?: string
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function getProjectsForClosure() {
  return db.project.findMany({
    where: {
      status: { notIn: ["COMPLETED", "CANCELLED"] },
    },
    orderBy: [{ priority: "asc" }, { title: "asc" }],
    select: {
      id:           true,
      title:        true,
      description:  true,
      status:       true,
      priority:     true,
      priorityLabel: true,
      expectedEnd:  true,
      actualStart:  true,
      goLiveDate:   true,
      sponsor:      { select: { name: true } },
      members:      { select: { id: true } },
      tasks:        { select: { id: true, status: true } },
    },
  })
}

export async function getProjectClosureData(projectId: string) {
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
            include: {
              responsible: { select: { name: true } },
              subtasks:    { select: { id: true, status: true, progress: true } },
            },
          },
        },
      },
      tasks: { orderBy: { order: "asc" }, select: { id: true, status: true, progress: true, parentId: true } },
      risks: { orderBy: { createdAt: "asc" } },
      meetings: {
        orderBy: { date: "asc" },
        include: { _count: { select: { participants: true } } },
      },
      lessonsLearned: {
        orderBy: { createdAt: "asc" },
        include: { createdBy: { select: { name: true } } },
      },
      documents: { orderBy: { createdAt: "desc" } },
    },
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function registerClosureMeeting(data: ClosureMeetingInput) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const meetingDate = new Date(data.date + "T12:00:00")
  const now         = new Date()

  await db.$transaction(async (tx) => {
    const meeting = await tx.meeting.create({
      data: {
        projectId:   data.projectId,
        type:        "PROJECT_CLOSURE",
        title:       `Reunião de Encerramento — ${format(meetingDate, "dd/MM/yyyy", { locale: ptBR })}`,
        date:        meetingDate,
        location:    data.location?.trim() || null,
        content:     data.content?.trim() || null,
        decisions:   data.decisions?.trim() || null,
        nextActions: data.nextActions?.trim() || null,
        createdById: session.user.id,
      },
    })

    for (const userId of data.attendeeIds) {
      await tx.meetingParticipant.create({ data: { meetingId: meeting.id, userId } }).catch(() => {})
    }

    await tx.projectDocument.create({
      data: {
        projectId:   data.projectId,
        type:        "PROJECT_CLOSURE",
        title:       `Termo de Encerramento — ${format(now, "dd/MM/yyyy", { locale: ptBR })}`,
        content:     data.closingNotes?.trim() || data.content?.trim() || null,
        version:     1,
        createdById: session.user.id,
      },
    })

    await tx.project.update({
      where: { id: data.projectId },
      data:  { status: "COMPLETED", actualEnd: now },
    })
  })

  revalidatePath(`/projects/${data.projectId}`)
  revalidatePath("/encerramento")
  return { success: true }
}
