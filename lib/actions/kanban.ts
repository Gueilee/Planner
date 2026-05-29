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
    select: {
      id:            true,
      title:         true,
      description:   true,
      status:        true,
      priority:      true,
      priorityLabel: true,
      economy:       true,
      budget:        true,
      expectedEnd:   true,
      expectedStart: true,
      projectArea:   true,
      sponsor:  { select: { name: true, department: true } },
      members:  { take: 5, include: { user: { select: { id: true, name: true } } } },
      _count:   { select: { members: true } },
      tasks:    { where: { subtasks: { none: {} } }, select: { status: true, progress: true } },
      risks:    { select: { status: true } },
    },
  })
}

export async function getTaskDetail(taskId: string) {
  const task = await db.scheduleTask.findUnique({
    where: { id: taskId },
    select: {
      id:          true,
      actualStart: true,
      actualEnd:   true,
      progress:    true,
      status:      true,
      comments: {
        orderBy: { createdAt: "asc" },
        select: {
          id:        true,
          content:   true,
          createdAt: true,
          user: { select: { id: true, name: true } },
        },
      },
      attachments: {
        orderBy: { uploadedAt: "desc" },
        select: { id: true, fileName: true, fileUrl: true, fileType: true, fileSize: true },
      },
      budgetedCost: true,
      actualCost:   true,
    },
  })
  if (!task) return null
  return {
    ...task,
    status:      task.status as string,
    actualStart: task.actualStart?.toISOString() ?? null,
    actualEnd:   task.actualEnd?.toISOString()   ?? null,
    comments:    task.comments.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
  }
}

export async function updateTaskKanban(
  taskId:    string,
  projectId: string,
  data: {
    progress?:     number
    actualStart?:  string | null
    actualEnd?:    string | null
    status?:       string
    budgetedCost?: number | null
    actualCost?:   number | null
  },
) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  await db.scheduleTask.update({
    where: { id: taskId },
    data: {
      ...(data.progress     !== undefined && { progress:     data.progress }),
      ...(data.actualStart  !== undefined && { actualStart:  data.actualStart  ? new Date(data.actualStart)  : null }),
      ...(data.actualEnd    !== undefined && { actualEnd:    data.actualEnd    ? new Date(data.actualEnd)    : null }),
      ...(data.budgetedCost !== undefined && { budgetedCost: data.budgetedCost }),
      ...(data.actualCost   !== undefined && { actualCost:   data.actualCost }),
      ...(data.status !== undefined && {
        status: data.status as never,
        ...(data.status === "COMPLETED" && { completedAt: new Date(), progress: 100 }),
        ...(data.status === "IN_PROGRESS" && { completedAt: null }),
      }),
    },
  })

  revalidatePath(`/projects/${projectId}/schedule`)
  revalidatePath("/kanban")
}

export async function addTaskComment(taskId: string, projectId: string, content: string) {
  const session = await auth()
  if (!session?.user?.email) throw new Error("Não autorizado")

  const user = await db.user.findUnique({
    where:  { email: session.user.email },
    select: { id: true },
  })
  if (!user) throw new Error("Usuário não encontrado")

  const comment = await db.comment.create({
    data: { taskId, userId: user.id, content },
    select: {
      id:        true,
      content:   true,
      createdAt: true,
      user: { select: { id: true, name: true } },
    },
  })

  revalidatePath(`/projects/${projectId}/schedule`)
  return { ...comment, createdAt: comment.createdAt.toISOString() }
}

export async function addTaskAttachmentKanban(
  taskId: string,
  projectId: string,
  attachment: { fileName: string; fileUrl: string; fileType: string; fileSize: number },
) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const att = await db.attachment.create({
    data: { taskId, projectId, fileName: attachment.fileName, fileUrl: attachment.fileUrl, fileType: attachment.fileType, fileSize: attachment.fileSize },
    select: { id: true, fileName: true, fileUrl: true, fileType: true, fileSize: true },
  })

  revalidatePath(`/projects/${projectId}/schedule`)
  revalidatePath("/kanban")
  return att
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
