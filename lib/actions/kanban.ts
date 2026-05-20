"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { ProjectStatus, TaskStatus } from "@/lib/generated/prisma/enums"

export async function getProjectTasksForKanban(projectId: string) {
  const tasks = await db.scheduleTask.findMany({
    where:   { projectId },
    orderBy: [{ order: "asc" }],
    include: {
      wbsArea:     { select: { name: true, color: true } },
      responsible: { select: { id: true, name: true } },
      _count:      { select: { subtasks: true } },
    },
  })
  return tasks.map((t) => ({
    id:          t.id,
    title:       t.title,
    status:      t.status as string,
    progress:    t.progress,
    startDate:   t.startDate?.toISOString()  ?? null,
    endDate:     t.endDate?.toISOString()    ?? null,
    wbsArea:     t.wbsArea  ?? null,
    responsible: t.responsible ?? null,
    parentId:    t.parentId   ?? null,
    childCount:  t._count.subtasks,
  }))
}

export async function updateTaskStatusKanban(taskId: string, status: TaskStatus) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const task = await db.scheduleTask.findUnique({
    where:  { id: taskId },
    select: { projectId: true, parentId: true },
  })

  await db.scheduleTask.update({
    where: { id: taskId },
    data: {
      status,
      progress:    status === "COMPLETED" ? 100 : undefined,
      completedAt: status === "COMPLETED" ? new Date() : undefined,
    },
  })

  // Auto-complete parent when all its children are COMPLETED
  if (status === "COMPLETED" && task?.parentId) {
    const siblings = await db.scheduleTask.findMany({
      where:  { parentId: task.parentId },
      select: { status: true },
    })
    if (siblings.every((s) => s.status === "COMPLETED")) {
      await db.scheduleTask.update({
        where: { id: task.parentId },
        data:  { status: TaskStatus.COMPLETED, progress: 100, completedAt: new Date() },
      })
    }
  }

  if (task) {
    revalidatePath(`/projects/${task.projectId}`)
    revalidatePath("/kanban")
  }
}

export async function getAllProjectsForKanban() {
  return db.project.findMany({
    where: {
      status: {
        notIn: [ProjectStatus.CANCELLED],
      },
    },
    orderBy: [
      { priority: { sort: "asc", nulls: "last" } },
      { createdAt: "desc" },
    ],
    include: {
      sponsor: { select: { name: true, department: true } },
      members: {
        take: 5,
        include: { user: { select: { id: true, name: true } } },
      },
      _count: { select: { members: true } },
      tasks:  { select: { status: true, progress: true } },
      risks:  { select: { status: true } },
    },
  })
}

export async function updateProjectStatusKanban(
  projectId: string,
  newStatus: string,
) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  await db.project.update({
    where: { id: projectId },
    data:  { status: newStatus as ProjectStatus },
  })

  revalidatePath("/kanban")
  revalidatePath("/projects")
  return { success: true }
}
