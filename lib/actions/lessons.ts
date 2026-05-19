"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { ProjectPhase, LessonInfluence, LessonImpact } from "@/lib/generated/prisma/enums"

export type LessonInput = {
  projectId:   string
  phase:       ProjectPhase
  area:        string
  responsible: string
  occurrence:  string
  influence:   LessonInfluence
  impact:      LessonImpact
  lesson:      string
  identifiedAt?: string
  tags?:       string[]
}

export type LessonFilter = {
  projectId?:  string
  phase?:      ProjectPhase
  influence?:  LessonInfluence
  impact?:     LessonImpact
  area?:       string
  search?:     string
}

function serializeLesson(l: {
  id: string; projectId: string; phase: ProjectPhase; area: string; responsible: string
  occurrence: string; influence: LessonInfluence; impact: LessonImpact; lesson: string
  identifiedAt: Date; tags: string | null; createdAt: Date; updatedAt: Date
  project: { id: string; title: string }
  createdBy: { id: string; name: string }
}) {
  return {
    ...l,
    identifiedAt: l.identifiedAt.toISOString(),
    createdAt:    l.createdAt.toISOString(),
    updatedAt:    l.updatedAt.toISOString(),
    tags:         l.tags ? (JSON.parse(l.tags) as string[]) : [],
  }
}

const INCLUDE = {
  project:   { select: { id: true, title: true } },
  createdBy: { select: { id: true, name: true } },
} as const

export async function createLesson(data: LessonInput) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const lesson = await db.lessonLearned.create({
    data: {
      projectId:   data.projectId,
      phase:       data.phase,
      area:        data.area.trim(),
      responsible: data.responsible.trim(),
      occurrence:  data.occurrence.trim(),
      influence:   data.influence,
      impact:      data.impact,
      lesson:      data.lesson.trim(),
      identifiedAt: data.identifiedAt ? new Date(data.identifiedAt) : new Date(),
      tags:        data.tags?.length ? JSON.stringify(data.tags) : null,
      createdById: session.user.id!,
    },
    include: INCLUDE,
  })

  revalidatePath(`/projects/${data.projectId}/lessons`)
  revalidatePath("/knowledge")
  return serializeLesson(lesson)
}

export async function updateLesson(id: string, projectId: string, data: Partial<LessonInput>) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const lesson = await db.lessonLearned.update({
    where: { id },
    data: {
      ...(data.phase       !== undefined && { phase: data.phase }),
      ...(data.area        !== undefined && { area: data.area.trim() }),
      ...(data.responsible !== undefined && { responsible: data.responsible.trim() }),
      ...(data.occurrence  !== undefined && { occurrence: data.occurrence.trim() }),
      ...(data.influence   !== undefined && { influence: data.influence }),
      ...(data.impact      !== undefined && { impact: data.impact }),
      ...(data.lesson      !== undefined && { lesson: data.lesson.trim() }),
      ...(data.identifiedAt !== undefined && { identifiedAt: new Date(data.identifiedAt!) }),
      ...(data.tags        !== undefined && { tags: data.tags?.length ? JSON.stringify(data.tags) : null }),
    },
    include: INCLUDE,
  })

  revalidatePath(`/projects/${projectId}/lessons`)
  revalidatePath("/knowledge")
  return serializeLesson(lesson)
}

export async function deleteLesson(id: string, projectId: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")
  await db.lessonLearned.delete({ where: { id } })
  revalidatePath(`/projects/${projectId}/lessons`)
  revalidatePath("/knowledge")
}

export async function getProjectLessons(projectId: string) {
  const lessons = await db.lessonLearned.findMany({
    where: { projectId },
    include: INCLUDE,
    orderBy: { createdAt: "desc" },
  })
  return lessons.map(serializeLesson)
}

export async function getAllLessons(filter: LessonFilter = {}) {
  const lessons = await db.lessonLearned.findMany({
    where: {
      ...(filter.projectId && { projectId: filter.projectId }),
      ...(filter.phase     && { phase: filter.phase }),
      ...(filter.influence && { influence: filter.influence }),
      ...(filter.impact    && { impact: filter.impact }),
      ...(filter.area      && { area: { contains: filter.area } }),
      ...(filter.search    && {
        OR: [
          { occurrence: { contains: filter.search } },
          { lesson:     { contains: filter.search } },
          { area:       { contains: filter.search } },
          { responsible:{ contains: filter.search } },
        ],
      }),
    },
    include: INCLUDE,
    orderBy: { identifiedAt: "desc" },
  })
  return lessons.map(serializeLesson)
}

export async function getKnowledgeStats() {
  const [total, byInfluence, byPhase] = await Promise.all([
    db.lessonLearned.count(),
    db.lessonLearned.groupBy({ by: ["influence"], _count: true }),
    db.lessonLearned.groupBy({ by: ["phase"],     _count: true }),
  ])
  return { total, byInfluence, byPhase }
}
