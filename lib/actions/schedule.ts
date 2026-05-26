"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import bcrypt from "bcryptjs"

export type TaskInput = {
  projectId: string
  wbsAreaId?: string | null
  parentId?: string | null
  title: string
  description?: string | null
  responsibleId?: string | null
  startDate?: string | null
  endDate?: string | null
  actualStart?: string | null
  actualEnd?: string | null
  estimatedEffort?: number | null
  actualEffort?: number | null
  status?: string
  progress?: number
  dependencies?: string[]
  order?: number
}

const INCLUDE = {
  responsible: { select: { id: true, name: true } },
  wbsArea: { select: { id: true, name: true, color: true } },
  _count: { select: { comments: true, attachments: true } },
} as const

function serialize(t: {
  id: string; projectId: string; wbsAreaId: string | null; parentId: string | null
  title: string; description: string | null; responsibleId: string | null
  startDate: Date | null; endDate: Date | null; actualStart: Date | null; actualEnd: Date | null
  completedAt: Date | null; estimatedEffort: number | null; actualEffort: number | null
  status: string; riskStatus: string; progress: number; order: number
  dependencies: string | null; createdAt: Date; updatedAt: Date
  responsible: { id: string; name: string } | null
  wbsArea: { id: string; name: string; color: string | null } | null
  _count: { comments: number; attachments: number }
}) {
  return {
    ...t,
    startDate: t.startDate?.toISOString() ?? null,
    endDate: t.endDate?.toISOString() ?? null,
    actualStart: t.actualStart?.toISOString() ?? null,
    actualEnd: t.actualEnd?.toISOString() ?? null,
    completedAt: t.completedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    dependencies: t.dependencies ? (JSON.parse(t.dependencies) as string[]) : ([] as string[]),
  }
}

export async function createTask(data: TaskInput) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const maxOrder = await db.scheduleTask.aggregate({
    _max: { order: true },
    where: { projectId: data.projectId, parentId: data.parentId ?? null },
  })

  const task = await db.scheduleTask.create({
    data: {
      projectId: data.projectId,
      wbsAreaId: data.wbsAreaId || null,
      parentId: data.parentId || null,
      title: data.title,
      description: data.description || null,
      responsibleId: data.responsibleId || null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      endDate: data.endDate ? new Date(data.endDate) : null,
      actualStart: data.actualStart ? new Date(data.actualStart) : null,
      actualEnd: data.actualEnd ? new Date(data.actualEnd) : null,
      estimatedEffort: data.estimatedEffort ?? null,
      actualEffort: data.actualEffort ?? null,
      status: (data.status ?? "PLANNING") as never,
      progress: data.progress ?? 0,
      dependencies: data.dependencies?.length ? JSON.stringify(data.dependencies) : null,
      order: (maxOrder._max.order ?? -1) + 1,
    },
    include: INCLUDE,
  })

  revalidatePath(`/projects/${data.projectId}/schedule`)
  return serialize(task)
}

export async function updateTask(id: string, projectId: string, data: Partial<TaskInput>) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const task = await db.scheduleTask.update({
    where: { id },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.wbsAreaId !== undefined && { wbsAreaId: data.wbsAreaId }),
      ...(data.responsibleId !== undefined && { responsibleId: data.responsibleId }),
      ...(data.parentId !== undefined && { parentId: data.parentId }),
      ...(data.startDate !== undefined && { startDate: data.startDate ? new Date(data.startDate) : null }),
      ...(data.endDate !== undefined && { endDate: data.endDate ? new Date(data.endDate) : null }),
      ...(data.actualStart !== undefined && { actualStart: data.actualStart ? new Date(data.actualStart) : null }),
      ...(data.actualEnd !== undefined && { actualEnd: data.actualEnd ? new Date(data.actualEnd) : null }),
      ...(data.estimatedEffort !== undefined && { estimatedEffort: data.estimatedEffort }),
      ...(data.actualEffort !== undefined && { actualEffort: data.actualEffort }),
      ...(data.status !== undefined && { status: data.status as never }),
      ...(data.progress !== undefined && { progress: data.progress }),
      ...(data.dependencies !== undefined && {
        dependencies: data.dependencies?.length ? JSON.stringify(data.dependencies) : null,
      }),
      ...(data.order !== undefined && { order: data.order }),
    },
    include: INCLUDE,
  })

  revalidatePath(`/projects/${projectId}/schedule`)
  return serialize(task)
}

export async function deleteTask(id: string, projectId: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")
  await db.scheduleTask.deleteMany({ where: { parentId: id } })
  await db.scheduleTask.delete({ where: { id } })
  revalidatePath(`/projects/${projectId}/schedule`)
}

export type AttachmentUpload = {
  fileName: string
  fileUrl:  string
  fileType: string
  fileSize: number
}

export async function getTaskAttachments(taskId: string) {
  return db.attachment.findMany({
    where: { taskId },
    orderBy: { uploadedAt: "desc" },
    select: { id: true, fileName: true, fileUrl: true, fileType: true, fileSize: true },
  })
}

export async function addTaskAttachments(taskId: string, projectId: string, attachments: AttachmentUpload[]) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  for (const att of attachments) {
    await db.attachment.create({
      data: { taskId, fileName: att.fileName, fileUrl: att.fileUrl, fileType: att.fileType, fileSize: att.fileSize },
    })
  }

  revalidatePath(`/projects/${projectId}/schedule`)
}

export async function createArea(projectId: string, name: string, color: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")
  const maxOrder = await db.wbsArea.aggregate({ _max: { order: true }, where: { projectId } })
  const area = await db.wbsArea.create({
    data: { projectId, name, color, order: (maxOrder._max.order ?? -1) + 1 },
  })
  revalidatePath(`/projects/${projectId}/schedule`)
  return area
}

export async function reorderAreas(projectId: string, orderedIds: string[]) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")
  await Promise.all(
    orderedIds.map((id, i) => db.wbsArea.update({ where: { id }, data: { order: i } }))
  )
  revalidatePath(`/projects/${projectId}/schedule`)
}

export async function reorderTasks(projectId: string, orderedIds: string[]) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")
  await Promise.all(
    orderedIds.map((id, i) => db.scheduleTask.update({ where: { id }, data: { order: i } }))
  )
  revalidatePath(`/projects/${projectId}/schedule`)
}

export async function addExternalMember(projectId: string, name: string): Promise<{ id: string; name: string; department: string | null }> {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const trimmed = name.trim()
  if (!trimmed) throw new Error("Nome obrigatório")

  const slug  = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30).replace(/-$/, "")
  const email = `ext-${slug}-${projectId.slice(-8)}@ext.planner`

  let user = await db.user.findUnique({ where: { email } })
  if (!user) {
    const hash = await bcrypt.hash(crypto.randomUUID(), 10)
    user = await db.user.create({
      data: { name: trimmed, email, password: hash, role: "PROJECT_MEMBER", active: true, department: "Externo" },
    })
  }

  await db.projectMember.upsert({
    where: { projectId_userId: { projectId, userId: user.id } },
    create: { projectId, userId: user.id, role: "Externo" },
    update: {},
  })

  revalidatePath(`/projects/${projectId}/schedule`)
  return { id: user.id, name: user.name, department: user.department }
}
