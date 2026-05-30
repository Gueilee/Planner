"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"

export async function getAllProjectsSummary() {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")
  return db.project.findMany({
    orderBy: [
      { priority: { sort: "asc", nulls: "last" } },
      { updatedAt: "desc" },
    ],
    select: {
      id: true, title: true, description: true, status: true,
      priority: true, priorityLabel: true,
      projectArea: true, origin: true,
      economy: true, budget: true,
      expectedStart: true, expectedEnd: true,
      createdAt: true, updatedAt: true,
      sponsor: { select: { name: true } },
      tasks: { select: { status: true, progress: true } },
      _count: { select: { meetings: true, risks: true, members: true } },
    },
  })
}

export async function getProjectFullHistory(projectId: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")
  return db.project.findUnique({
    where: { id: projectId },
    include: {
      sponsor: { select: { name: true, email: true, department: true } },
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
            include: { responsible: { select: { name: true } } },
          },
        },
      },
      tasks: {
        orderBy: { order: "asc" },
        select: { id: true, status: true, progress: true, budgetedCost: true, actualCost: true },
      },
      risks: { orderBy: { createdAt: "asc" } },
      meetings: {
        orderBy: { date: "asc" },
        include: {
          createdBy:    { select: { name: true } },
          _count:       { select: { participants: true } },
        },
      },
      lessonsLearned: {
        orderBy: { createdAt: "asc" },
        include: { createdBy: { select: { name: true } } },
      },
      documents: { orderBy: { createdAt: "asc" } },
      statusReports: { orderBy: { createdAt: "asc" } },
      attachments: {
        orderBy: { uploadedAt: "asc" },
        include: { task: { select: { title: true } } },
      },
    },
  })
}

// ─── Exclusão de Reunião ──────────────────────────────────────────────────────

export async function deleteMeeting(meetingId: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  // Busca o projectId antes de deletar para revalidar as rotas certas
  const meeting = await db.meeting.findUnique({
    where:  { id: meetingId },
    select: { projectId: true },
  })

  await db.meeting.delete({ where: { id: meetingId } })

  // Revalida todas as rotas que exibem dados de reuniões/checkpoints
  revalidatePath("/history")
  revalidatePath("/status-report")
  if (meeting?.projectId) {
    revalidatePath(`/projects/${meeting.projectId}`)
    revalidatePath(`/projects/${meeting.projectId}/checkpoint`)
    revalidatePath(`/projects/${meeting.projectId}/meetings`)
  }

  return { success: true }
}

// ─── Exclusão de Anexo ────────────────────────────────────────────────────────

export async function deleteAttachment(attachmentId: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const att = await db.attachment.findUnique({
    where:  { id: attachmentId },
    select: { fileUrl: true, projectId: true, taskId: true },
  })
  if (!att) throw new Error("Anexo não encontrado")

  await db.attachment.delete({ where: { id: attachmentId } })

  // Remove do Vercel Blob se disponível
  if (att.fileUrl.startsWith("https://") && process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { del } = await import("@vercel/blob")
      await del(att.fileUrl)
    } catch { /* silently ignore blob deletion errors */ }
  }

  revalidatePath("/history")
  if (att.projectId) {
    revalidatePath(`/projects/${att.projectId}`)
    revalidatePath(`/projects/${att.projectId}/schedule`)
  }

  return { success: true }
}
