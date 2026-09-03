"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { ProjectStatus, TaskStatus } from "@/lib/generated/prisma/enums"
import { V2_STATUS_TO_LEGACY, LEGACY_STATUS_TO_V2, topLevelAncestorId } from "@/lib/utils/schedule-v2-adapter"
import { applyItemUpdatesV2 } from "@/lib/actions/schedule-v2"

// Fase 5 — Kanban unificado: os cards SÃO os itens do motor v2
// (ScheduleV2Item), a mesma árvore do Cronograma. "Área" v2 = ancestral de
// topo (ver lib/utils/schedule-v2-adapter.ts) — não existe mais WbsArea
// separada. O board continua com o vocabulário rico de 6 status (Fase 5,
// decisão do time) — V2_STATUS_TO_LEGACY/LEGACY_STATUS_TO_V2 traduzem nas
// duas pontas para o Kanban (e o resto do app) não precisar mudar de
// vocabulário.

export async function getProjectTasksForKanban(projectId: string) {
  const items = await db.scheduleV2Item.findMany({
    where:   { projectId },
    orderBy: [{ order: "asc" }],
    select: {
      id: true, parentId: true, title: true, status: true, percentualCompleto: true,
      inicioEstimado: true, terminoEstimado: true,
      responsavelId: true, responsavel: { select: { id: true, name: true, image: true } },
      _count: { select: { comments: true, attachments: true } },
    },
  })

  const childCount = new Map<string, number>()
  for (const it of items) if (it.parentId) childCount.set(it.parentId, (childCount.get(it.parentId) ?? 0) + 1)
  const parentById = new Map(items.map((i) => [i.id, i.parentId]))
  const titleById   = new Map(items.map((i) => [i.id, i.title]))

  return items.map((t) => {
    const areaId = topLevelAncestorId(t.id, parentById)
    return {
      id:             t.id,
      title:          t.title,
      status:         V2_STATUS_TO_LEGACY[t.status] ?? "PLANNING",
      progress:       t.percentualCompleto,
      startDate:      t.inicioEstimado?.toISOString()  ?? null,
      endDate:        t.terminoEstimado?.toISOString() ?? null,
      wbsArea:        areaId !== t.id ? { name: titleById.get(areaId) ?? "", color: null } : null,
      responsible:    t.responsavel ?? null,
      parentId:       t.parentId ?? null,
      childCount:     childCount.get(t.id) ?? 0,
      commentCount:   t._count.comments,
      attachmentCount: t._count.attachments,
    }
  })
}

export async function updateTaskStatusKanban(taskId: string, status: TaskStatus) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const item = await db.scheduleV2Item.findUnique({
    where:  { id: taskId },
    select: { projectId: true, parentId: true },
  })
  if (!item) return

  const v2Status = LEGACY_STATUS_TO_V2[status] ?? "A_INICIAR"
  await applyItemUpdatesV2(item.projectId, [{
    itemId: taskId,
    status: v2Status,
    ...(v2Status === "CONCLUIDO" && { percentualCompleto: 100, terminoReal: new Date().toISOString().slice(0, 10) }),
  }])

  // Auto-completa o pai quando todos os irmãos ficam concluídos (mesmo
  // comportamento do legado — só 1 nível, não recursivo).
  if (v2Status === "CONCLUIDO" && item.parentId) {
    const siblings = await db.scheduleV2Item.findMany({
      where:  { parentId: item.parentId },
      select: { status: true },
    })
    if (siblings.every((s) => s.status === "CONCLUIDO")) {
      await applyItemUpdatesV2(item.projectId, [{
        itemId: item.parentId,
        status: "CONCLUIDO",
        terminoReal: new Date().toISOString().slice(0, 10),
      }])
    }
  }

  revalidatePath(`/projects/${item.projectId}`)
  revalidatePath(`/projects/${item.projectId}/schedule`)
  revalidatePath("/kanban")
}

export async function getAllProjectsForKanban() {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const projects = await db.project.findMany({
    where: {
      organizationId: session.user.organizationId,
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
      members:  { take: 5, include: { user: { select: { id: true, name: true, image: true } } } },
      _count:   { select: { members: true } },
      scheduleV2Items: {
        select: { id: true, parentId: true, status: true, percentualCompleto: true, inicioEstimado: true, terminoEstimado: true },
      },
      risks:    { select: { status: true } },
    },
  })

  return projects.map((p) => {
    const childCount = new Map<string, number>()
    for (const it of p.scheduleV2Items) if (it.parentId) childCount.set(it.parentId, (childCount.get(it.parentId) ?? 0) + 1)
    return {
      ...p,
      tasks: p.scheduleV2Items.map((t) => ({
        id:        t.id,
        status:    V2_STATUS_TO_LEGACY[t.status] ?? "PLANNING",
        progress:  t.percentualCompleto,
        parentId:  t.parentId,
        startDate: t.inicioEstimado,
        endDate:   t.terminoEstimado,
        _count:    { subtasks: childCount.get(t.id) ?? 0 },
      })),
    }
  })
}

export async function getTaskDetail(taskId: string) {
  const item = await db.scheduleV2Item.findUnique({
    where: { id: taskId },
    select: {
      id:                 true,
      inicioReal:         true,
      terminoReal:        true,
      percentualCompleto: true,
      status:             true,
      comments: {
        orderBy: { createdAt: "asc" },
        select: {
          id:        true,
          content:   true,
          createdAt: true,
          user: { select: { id: true, name: true, image: true } },
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
  if (!item) return null
  return {
    id:           item.id,
    actualStart:  item.inicioReal?.toISOString()  ?? null,
    actualEnd:    item.terminoReal?.toISOString() ?? null,
    progress:     item.percentualCompleto,
    status:       V2_STATUS_TO_LEGACY[item.status] ?? "PLANNING",
    comments:     item.comments.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
    attachments:  item.attachments,
    budgetedCost: item.budgetedCost,
    actualCost:   item.actualCost,
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

  const v2Status = data.status !== undefined ? (LEGACY_STATUS_TO_V2[data.status] ?? "A_INICIAR") : undefined

  await applyItemUpdatesV2(projectId, [{
    itemId: taskId,
    ...(data.progress     !== undefined && { percentualCompleto: data.progress }),
    ...(data.actualStart  !== undefined && { inicioReal:  data.actualStart }),
    ...(data.actualEnd    !== undefined && { terminoReal: data.actualEnd }),
    ...(data.budgetedCost !== undefined && { budgetedCost: data.budgetedCost }),
    ...(data.actualCost   !== undefined && { actualCost:   data.actualCost }),
    ...(v2Status !== undefined && {
      status: v2Status,
      ...(v2Status === "CONCLUIDO"   && { percentualCompleto: 100, terminoReal: new Date().toISOString().slice(0, 10) }),
      ...(v2Status === "EM_ANDAMENTO" && { terminoReal: null }),
    }),
  }])

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
    data: { scheduleV2ItemId: taskId, userId: user.id, content },
    select: {
      id:        true,
      content:   true,
      createdAt: true,
      user: { select: { id: true, name: true, image: true } },
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
    data: { scheduleV2ItemId: taskId, projectId, fileName: attachment.fileName, fileUrl: attachment.fileUrl, fileType: attachment.fileType, fileSize: attachment.fileSize },
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
