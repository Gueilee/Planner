"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getMyNotifications(limit = 50) {
  const session = await auth()
  if (!session?.user?.id) return []

  const rows = await db.notification.findMany({
    where:   { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take:    limit,
    select:  { id: true, type: true, title: true, message: true, link: true, read: true, createdAt: true },
  })

  return rows.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() }))
}

export async function getHeaderNotifications() {
  const session = await auth()
  if (!session?.user?.id) return { items: [], unreadCount: 0 }

  const [items, unreadCount] = await Promise.all([
    db.notification.findMany({
      where:   { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take:    6,
      select:  { id: true, type: true, title: true, message: true, link: true, read: true, createdAt: true },
    }),
    db.notification.count({ where: { userId: session.user.id, read: false } }),
  ])

  return {
    unreadCount,
    items: items.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() })),
  }
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function markRead(id: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Não autorizado")
  await db.notification.update({ where: { id }, data: { read: true } })
  revalidatePath("/settings")
  revalidatePath("/notifications")
}

export async function markAllRead() {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Não autorizado")
  await db.notification.updateMany({ where: { userId: session.user.id, read: false }, data: { read: true } })
  revalidatePath("/settings")
  revalidatePath("/notifications")
}

export async function deleteNotification(id: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Não autorizado")
  await db.notification.delete({ where: { id } })
  revalidatePath("/settings")
  revalidatePath("/notifications")
}

// ─── Create (utility used by other server actions) ────────────────────────────

export async function createNotification(data: {
  userId:  string
  type:    string
  title:   string
  message: string
  link?:   string
}) {
  return db.notification.create({
    data: {
      userId:  data.userId,
      type:    data.type,
      title:   data.title,
      message: data.message,
      link:    data.link ?? null,
    },
  })
}

// ─── Create for all project members (convenience) ────────────────────────────

export async function notifyProjectMembers(projectId: string, data: {
  type: string; title: string; message: string; link?: string
}) {
  const members = await db.projectMember.findMany({
    where:  { projectId },
    select: { userId: true },
  })
  if (!members.length) return

  for (const m of members) {
    await db.notification.create({
      data: {
        userId:  m.userId,
        type:    data.type,
        title:   data.title,
        message: data.message,
        link:    data.link ?? null,
      },
    })
  }
}
