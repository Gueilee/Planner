"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { generateMeetingATA } from "@/lib/actions/ata"

export type LessonItem = {
  type: "GOOD_PRACTICE" | "PROBLEM"
  area: string
  description: string
  impact?: string
  recommendation?: string
}

export type LessonsLearnedInput = {
  projectId: string
  date: string
  location: string
  generalNotes?: string
  attendeeIds: string[]
  lessons: LessonItem[]
}

export async function saveLessonsLearned(data: LessonsLearnedInput) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const meetingDate = new Date(data.date + "T12:00:00")
  const goodCount   = data.lessons.filter((l) => l.type === "GOOD_PRACTICE").length
  const probCount   = data.lessons.filter((l) => l.type === "PROBLEM").length

  const meetingId = await db.$transaction(async (tx) => {
    const meeting = await tx.meeting.create({
      data: {
        projectId:   data.projectId,
        type:        "LESSONS_LEARNED",
        title:       `Lições Aprendidas — ${format(meetingDate, "dd/MM/yyyy", { locale: ptBR })}`,
        date:        meetingDate,
        location:    data.location || null,
        content:     data.generalNotes?.trim() || null,
        decisions:   `${goodCount} boas práticas · ${probCount} pontos de melhoria registrados`,
        createdById: session.user.id,
      },
    })

    for (const userId of data.attendeeIds) {
      await tx.meetingParticipant.create({ data: { meetingId: meeting.id, userId } }).catch(() => {})
    }

    for (const lesson of data.lessons) {
      if (!lesson.description.trim()) continue
      await tx.lessonLearned.create({
        data: {
          projectId:   data.projectId,
          phase:       "EXECUTION",
          area:        lesson.area?.trim() || "Geral",
          responsible: "Não especificado",
          occurrence:  lesson.description.trim(),
          influence:   lesson.type === "GOOD_PRACTICE" ? "POSITIVE" : lesson.type === "PROBLEM" ? "NEGATIVE" : "NEUTRAL",
          impact:      lesson.impact ? "HIGH" : "MEDIUM",
          lesson:      lesson.recommendation?.trim() || lesson.description.trim(),
          identifiedAt: new Date(),
          createdById: session.user.id,
        },
      })
    }

    return meeting.id
  })

  revalidatePath(`/projects/${data.projectId}`)

  let ataContent: string | null = null
  try {
    const ata = await generateMeetingATA(meetingId)
    ataContent = ata.content
  } catch {}

  return { success: true, meetingId, ataContent }
}

export async function getProjectForLessons(projectId: string) {
  return db.project.findUnique({
    where: { id: projectId },
    select: {
      id:    true,
      title: true,
      status: true,
      members: {
        include: { user: { select: { id: true, name: true, department: true } } },
      },
      lessonsLearned: {
        orderBy: { createdAt: "desc" },
        include: { createdBy: { select: { name: true } } },
      },
      meetings: {
        where: { type: "LESSONS_LEARNED" },
        orderBy: { date: "desc" },
        include: { _count: { select: { participants: true } } },
      },
    },
  })
}
