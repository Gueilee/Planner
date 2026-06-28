"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import bcrypt from "bcryptjs"
import { deriveStatus, deriveProgress, type AncestorUpdate } from "@/lib/utils/task-progress"
import { nextWorkingDay, addWorkingDays, workingDaysBetween } from "@/lib/working-days"

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
  budgetedCost?: number | null
  actualCost?: number | null
  status?: string
  progress?: number
  dependencies?: string[]
  order?: number
}

const INCLUDE = {
  responsible: { select: { id: true, name: true, image: true } },
  wbsArea: { select: { id: true, name: true, color: true } },
  _count: { select: { comments: true, attachments: true } },
} as const

export type SuccessorUpdate = {
  id: string
  startDate: string | null
  endDate: string | null
}

function dateToStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

function strToDate(s: string): Date {
  return new Date(s + 'T00:00:00.000Z')
}

function serialize(t: {
  id: string; projectId: string; wbsAreaId: string | null; parentId: string | null
  title: string; description: string | null; responsibleId: string | null
  startDate: Date | null; endDate: Date | null; actualStart: Date | null; actualEnd: Date | null
  completedAt: Date | null; estimatedEffort: number | null; actualEffort: number | null
  status: string; riskStatus: string; progress: number; order: number
  budgetedCost: number | null; actualCost: number | null
  dependencies: string | null; createdAt: Date; updatedAt: Date
  responsible: { id: string; name: string; image: string | null } | null
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
      budgetedCost: data.budgetedCost ?? null,
      actualCost:   data.actualCost   ?? null,
      status: (data.status ?? "PLANNING") as never,
      progress: data.progress ?? 0,
      dependencies: data.dependencies?.length ? JSON.stringify(data.dependencies) : null,
      order: (maxOrder._max.order ?? -1) + 1,
    },
    include: INCLUDE,
  })

  if (data.parentId) await propagateParentUp(data.parentId)
  revalidatePath(`/projects/${data.projectId}/schedule`)
  return serialize(task)
}

// Cascades startDate/endDate downstream through FS dependency relationships.
// Uses BFS in topological order to recalculate each successor's dates from its
// latest predecessor's endDate, preserving working-day duration when both dates exist.
async function propagateSuccessorsDown(
  rootTaskId: string,
  projectId: string
): Promise<SuccessorUpdate[]> {
  const allTasks = await db.scheduleTask.findMany({
    where: { projectId },
    select: { id: true, dependencies: true, startDate: true, endDate: true },
  })

  // Mutable date cache — updated in-place as tasks are processed
  const dateCache = new Map<string, { start: Date | null; end: Date | null }>(
    allTasks.map(t => [t.id, { start: t.startDate, end: t.endDate }])
  )

  const predMap = new Map<string, string[]>()
  const succMap = new Map<string, string[]>()
  for (const t of allTasks) {
    let deps: string[] = []
    try { deps = t.dependencies ? (JSON.parse(t.dependencies) as string[]) : [] } catch { /* noop */ }
    predMap.set(t.id, deps)
    for (const dep of deps) {
      if (!succMap.has(dep)) succMap.set(dep, [])
      succMap.get(dep)!.push(t.id)
    }
  }

  const updates: SuccessorUpdate[] = []
  const visited = new Set<string>([rootTaskId])
  const queue = [rootTaskId]

  while (queue.length > 0) {
    const current = queue.shift()!
    for (const succId of (succMap.get(current) ?? [])) {
      if (visited.has(succId)) continue

      const preds = predMap.get(succId) ?? []
      const predEnds = preds
        .map(p => dateCache.get(p)?.end)
        .filter((d): d is Date => d != null)

      if (predEnds.length === 0) {
        // No predecessor has an endDate yet — queue for later but don't update
        visited.add(succId)
        queue.push(succId)
        continue
      }

      const latestEnd = predEnds.reduce((max, d) => d > max ? d : max, predEnds[0])
      const newStartStr = nextWorkingDay(dateToStr(latestEnd))
      const newStart = strToDate(newStartStr)

      const cur = dateCache.get(succId)!

      // Skip when start date is already correct
      if (cur.start && dateToStr(cur.start) === newStartStr) {
        visited.add(succId)
        queue.push(succId)
        continue
      }

      // Preserve working-day duration when both dates are known
      let newEnd: Date | null = cur.end
      if (cur.start && cur.end) {
        const dur = workingDaysBetween(dateToStr(cur.start), dateToStr(cur.end))
        if (dur > 0) newEnd = strToDate(addWorkingDays(newStartStr, dur))
      }

      await db.scheduleTask.update({
        where: { id: succId },
        data: { startDate: newStart, ...(newEnd && { endDate: newEnd }) },
      })

      // Bubble up to parent so parent spans stay accurate
      const row = await db.scheduleTask.findUnique({ where: { id: succId }, select: { parentId: true } })
      if (row?.parentId) await propagateParentUp(row.parentId)

      dateCache.set(succId, { start: newStart, end: newEnd })
      updates.push({ id: succId, startDate: newStart.toISOString(), endDate: newEnd?.toISOString() ?? null })

      visited.add(succId)
      queue.push(succId)
    }
  }

  return updates
}

// Propagates progress AND dates up the parent chain.
// parentId = the direct parent of the task that just changed.
async function propagateParentUp(parentId: string, collected: AncestorUpdate[] = []): Promise<AncestorUpdate[]> {
  const children = await db.scheduleTask.findMany({
    where: { parentId },
    select: { progress: true, startDate: true, endDate: true, actualStart: true, actualEnd: true },
  })
  if (!children.length) return collected

  const avg = Math.round(children.reduce((s, t) => s + t.progress, 0) / children.length)

  const startDates   = children.map(t => t.startDate).filter((d): d is Date => d !== null)
  const endDates     = children.map(t => t.endDate).filter((d): d is Date => d !== null)
  const actualStarts = children.map(t => t.actualStart).filter((d): d is Date => d !== null)
  const actualEnds   = children.map(t => t.actualEnd).filter((d): d is Date => d !== null)

  const minStart       = startDates.length   ? new Date(Math.min(...startDates.map(d => d.getTime())))   : null
  const maxEnd         = endDates.length     ? new Date(Math.max(...endDates.map(d => d.getTime())))     : null
  const minActualStart = actualStarts.length ? new Date(Math.min(...actualStarts.map(d => d.getTime()))) : null
  const maxActualEnd   = actualEnds.length   ? new Date(Math.max(...actualEnds.map(d => d.getTime())))   : null

  const parent = await db.scheduleTask.findUnique({
    where: { id: parentId },
    select: { status: true, parentId: true },
  })
  if (!parent) return collected

  const newStatus = deriveStatus(avg, parent.status)
  await db.scheduleTask.update({
    where: { id: parentId },
    data: {
      progress: avg,
      status:      newStatus as never,
      startDate:   minStart,
      endDate:     maxEnd,
      actualStart: minActualStart,
      actualEnd:   maxActualEnd,
    },
  })

  collected.push({
    id: parentId,
    progress: avg,
    status: newStatus,
    startDate:   minStart?.toISOString()       ?? null,
    endDate:     maxEnd?.toISOString()         ?? null,
    actualStart: minActualStart?.toISOString() ?? null,
    actualEnd:   maxActualEnd?.toISOString()   ?? null,
  })

  if (parent.parentId) return propagateParentUp(parent.parentId, collected)
  return collected
}

export async function updateTask(id: string, projectId: string, data: Partial<TaskInput>) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  // Fetch current values for auto-derivation and duration preservation
  const current = await db.scheduleTask.findUnique({
    where: { id },
    select: { progress: true, status: true, startDate: true, endDate: true },
  })
  const curProgress = current?.progress ?? 0
  const curStatus   = current?.status   ?? "PLANNING"

  let finalProgress = data.progress !== undefined ? data.progress : curProgress
  let finalStatus   = data.status   !== undefined ? data.status   : curStatus

  if (data.progress !== undefined && data.status === undefined) {
    finalStatus = deriveStatus(finalProgress, curStatus)
  } else if (data.status !== undefined && data.progress === undefined) {
    finalProgress = deriveProgress(finalStatus, curProgress)
  }

  // When only startDate changes, auto-preserve working-day duration by shifting endDate
  const computedEndDate = (() => {
    if (data.endDate !== undefined) return data.endDate // explicit value (or null to clear)
    if (
      data.startDate !== undefined &&
      data.startDate !== null &&
      current?.startDate &&
      current?.endDate
    ) {
      const dur = workingDaysBetween(dateToStr(current.startDate), dateToStr(current.endDate))
      if (dur > 0) return addWorkingDays(data.startDate, dur)
    }
    return undefined // leave endDate untouched
  })()

  const task = await db.scheduleTask.update({
    where: { id },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.wbsAreaId !== undefined && { wbsAreaId: data.wbsAreaId }),
      ...(data.responsibleId !== undefined && { responsibleId: data.responsibleId }),
      ...(data.parentId !== undefined && { parentId: data.parentId }),
      ...(data.startDate !== undefined && { startDate: data.startDate ? new Date(data.startDate) : null }),
      ...(computedEndDate !== undefined && { endDate: computedEndDate ? new Date(computedEndDate) : null }),
      ...(data.actualStart !== undefined && { actualStart: data.actualStart ? new Date(data.actualStart) : null }),
      ...(data.actualEnd !== undefined && { actualEnd: data.actualEnd ? new Date(data.actualEnd) : null }),
      ...(data.estimatedEffort !== undefined && { estimatedEffort: data.estimatedEffort }),
      ...(data.actualEffort    !== undefined && { actualEffort:    data.actualEffort }),
      ...(data.budgetedCost    !== undefined && { budgetedCost:    data.budgetedCost }),
      ...(data.actualCost      !== undefined && { actualCost:      data.actualCost }),
      status: finalStatus as never,
      progress: finalProgress,
      ...(data.dependencies !== undefined && {
        dependencies: data.dependencies?.length ? JSON.stringify(data.dependencies) : null,
      }),
      ...(data.order !== undefined && { order: data.order }),
    },
    include: INCLUDE,
  })

  const updated = await db.scheduleTask.findUnique({ where: { id }, select: { parentId: true } })
  const ancestors = updated?.parentId ? await propagateParentUp(updated.parentId) : []

  // Cascade to successor tasks when planned dates change
  const successorUpdates =
    data.startDate !== undefined || data.endDate !== undefined
      ? await propagateSuccessorsDown(id, projectId)
      : []

  revalidatePath(`/projects/${projectId}/schedule`)
  return { task: serialize(task), ancestors, successorUpdates }
}

export async function deleteTask(id: string, projectId: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")
  const task = await db.scheduleTask.findUnique({ where: { id }, select: { parentId: true } })
  await db.scheduleTask.deleteMany({ where: { parentId: id } })
  await db.scheduleTask.delete({ where: { id } })
  if (task?.parentId) await propagateParentUp(task.parentId)
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
      data: { taskId, projectId, fileName: att.fileName, fileUrl: att.fileUrl, fileType: att.fileType, fileSize: att.fileSize },
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

export async function deleteArea(areaId: string, projectId: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  // Find all tasks in this area, then delete their subtasks, then the tasks, then the area
  const areaTasks = await db.scheduleTask.findMany({
    where: { projectId, wbsAreaId: areaId },
    select: { id: true },
  })
  const taskIds = areaTasks.map((t) => t.id)
  if (taskIds.length > 0) {
    await db.scheduleTask.deleteMany({ where: { parentId: { in: taskIds } } })
    await db.scheduleTask.deleteMany({ where: { id: { in: taskIds } } })
  }
  await db.wbsArea.delete({ where: { id: areaId } })
  revalidatePath(`/projects/${projectId}/schedule`)
}

export async function renameArea(areaId: string, name: string, projectId: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")
  const trimmed = name.trim()
  if (!trimmed) return
  await db.wbsArea.update({ where: { id: areaId }, data: { name: trimmed } })
  revalidatePath(`/projects/${projectId}/schedule`)
}

export async function updateAreaWeight(areaId: string, weight: number | null, projectId: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")
  await db.wbsArea.update({ where: { id: areaId }, data: { weight } })
  revalidatePath(`/projects/${projectId}/schedule`)
}

export async function convertUngroupedToArea(name: string, projectId: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")
  const trimmed = name.trim()
  if (!trimmed) return null
  const order = await db.wbsArea.count({ where: { projectId } })
  const area = await db.wbsArea.create({
    data: { projectId, name: trimmed, order, color: "#CBD5E1" },
  })
  await db.scheduleTask.updateMany({
    where: { projectId, wbsAreaId: null },
    data: { wbsAreaId: area.id },
  })
  revalidatePath(`/projects/${projectId}/schedule`)
  return { id: area.id, name: trimmed, color: "#CBD5E1" }
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
