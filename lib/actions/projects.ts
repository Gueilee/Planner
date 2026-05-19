"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { ProjectStatus, TaskStatus, RiskLevel } from "@/lib/generated/prisma/enums"

// ─── Project ───────────────────────────────────────────────────────────────

export async function updateProjectStatus(id: string, status: ProjectStatus) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const data: Record<string, unknown> = { status }
  if (status === "IN_PROGRESS") data.actualStart = new Date()
  if (status === "COMPLETED")   data.actualEnd   = new Date()

  await db.project.update({ where: { id }, data })
  revalidatePath(`/projects`)
  revalidatePath(`/projects/${id}`)
}

export async function updateProjectDetails(id: string, data: {
  description?: string
  actualStart?: string
  actualEnd?: string
  goLiveDate?: string
  roadmapYear?: number
  roadmapQuarter?: number
}) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  await db.project.update({
    where: { id },
    data: {
      description:   data.description,
      actualStart:   data.actualStart  ? new Date(data.actualStart)  : undefined,
      actualEnd:     data.actualEnd    ? new Date(data.actualEnd)     : undefined,
      goLiveDate:    data.goLiveDate   ? new Date(data.goLiveDate)    : undefined,
      roadmapYear:   data.roadmapYear,
      roadmapQuarter:data.roadmapQuarter,
    },
  })
  revalidatePath(`/projects/${id}`)
}

// ─── WBS Areas ─────────────────────────────────────────────────────────────

export async function createWbsArea(projectId: string, name: string, color: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const max = await db.wbsArea.aggregate({ where: { projectId }, _max: { order: true } })
  await db.wbsArea.create({
    data: { projectId, name, color, order: (max._max.order ?? 0) + 1 },
  })
  revalidatePath(`/projects/${projectId}`)
}

export async function updateWbsArea(id: string, data: { name?: string; color?: string }) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const area = await db.wbsArea.findUnique({ where: { id }, select: { projectId: true } })
  await db.wbsArea.update({ where: { id }, data })
  if (area) revalidatePath(`/projects/${area.projectId}`)
}

export async function deleteWbsArea(id: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const area = await db.wbsArea.findUnique({ where: { id }, select: { projectId: true } })
  await db.wbsArea.delete({ where: { id } })
  if (area) revalidatePath(`/projects/${area.projectId}`)
}

// ─── Tasks ─────────────────────────────────────────────────────────────────

export async function createTask(data: {
  projectId: string
  wbsAreaId?: string
  title: string
  description?: string
  responsibleId?: string
  startDate?: string
  endDate?: string
  status?: TaskStatus
  riskStatus?: RiskLevel
  progress?: number
}) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const max = await db.scheduleTask.aggregate({ where: { projectId: data.projectId }, _max: { order: true } })
  await db.scheduleTask.create({
    data: {
      projectId:     data.projectId,
      wbsAreaId:     data.wbsAreaId,
      title:         data.title,
      description:   data.description,
      responsibleId: data.responsibleId,
      startDate:     data.startDate ? new Date(data.startDate) : null,
      endDate:       data.endDate   ? new Date(data.endDate)   : null,
      status:        data.status      ?? TaskStatus.PLANNING,
      riskStatus:    data.riskStatus  ?? RiskLevel.LOW,
      progress:      data.progress    ?? 0,
      order:         (max._max.order ?? 0) + 1,
    },
  })
  revalidatePath(`/projects/${data.projectId}`)
}

export async function updateTask(id: string, data: {
  title?: string
  description?: string
  responsibleId?: string
  startDate?: string
  endDate?: string
  status?: TaskStatus
  riskStatus?: RiskLevel
  progress?: number
  wbsAreaId?: string
}) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const task = await db.scheduleTask.findUnique({ where: { id }, select: { projectId: true } })
  await db.scheduleTask.update({
    where: { id },
    data: {
      ...data,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      endDate:   data.endDate   ? new Date(data.endDate)   : undefined,
      completedAt: data.status === "COMPLETED" ? new Date() : undefined,
    },
  })
  if (task) revalidatePath(`/projects/${task.projectId}`)
}

export async function deleteTask(id: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const task = await db.scheduleTask.findUnique({ where: { id }, select: { projectId: true } })
  await db.scheduleTask.delete({ where: { id } })
  if (task) revalidatePath(`/projects/${task.projectId}`)
}

// ─── Team Members ──────────────────────────────────────────────────────────

export async function addProjectMember(projectId: string, userId: string, role: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  await db.projectMember.upsert({
    where: { projectId_userId: { projectId, userId } },
    update: { role },
    create: { projectId, userId, role },
  })
  revalidatePath(`/projects/${projectId}`)
}

export async function removeProjectMember(projectId: string, userId: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  await db.projectMember.delete({
    where: { projectId_userId: { projectId, userId } },
  })
  revalidatePath(`/projects/${projectId}`)
}
