"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"

export type NotificationPreferenceData = {
  projectDeadline:  boolean
  projectOnHold:    boolean
  projectCompleted: boolean
  taskOverdue:      boolean
  taskAssigned:     boolean
  checkpointAdded:  boolean
  meetingAdded:     boolean
  criticalRisk:     boolean
}

export async function getNotificationPreferences() {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const existing = await db.notificationPreference.findUnique({
    where: { userId: session.user.id },
  })

  if (existing) return existing

  // Return defaults if not configured yet
  return {
    id: null,
    userId: session.user.id,
    projectDeadline:  true,
    projectOnHold:    true,
    projectCompleted: false,
    taskOverdue:      true,
    taskAssigned:     true,
    checkpointAdded:  true,
    meetingAdded:     false,
    criticalRisk:     true,
  }
}

export async function saveNotificationPreferences(data: NotificationPreferenceData) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  await db.notificationPreference.upsert({
    where:  { userId: session.user.id },
    create: { userId: session.user.id, ...data },
    update: { ...data },
  })

  revalidatePath("/settings")
  return { success: true }
}
