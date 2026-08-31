// Helper interno de notificações — de propósito SEM "use server": estas funções só
// devem ser chamadas a partir de outras Server Actions (nunca diretamente do
// client), então não viram endpoints invocáveis por conta própria.

import { db } from "@/lib/db"

export type NotificationPrefKey =
  | "projectDeadline" | "projectOnHold" | "projectCompleted"
  | "taskOverdue" | "taskAssigned" | "checkpointAdded"
  | "meetingAdded" | "criticalRisk" | "budgetExceeded"

const DEFAULT_PREFS: Record<NotificationPrefKey, boolean> = {
  projectDeadline:  true,
  projectOnHold:    true,
  projectCompleted: false,
  taskOverdue:      true,
  taskAssigned:     true,
  checkpointAdded:  true,
  meetingAdded:     false,
  criticalRisk:     true,
  budgetExceeded:   true,
}

async function isEnabled(userId: string, key: NotificationPrefKey): Promise<boolean> {
  const row = await db.notificationPreference.findUnique({ where: { userId } })
  return row ? Boolean(row[key]) : DEFAULT_PREFS[key]
}

type NotifyData = { type: string; title: string; message: string; link?: string }

/** Notifica um usuário específico, respeitando a preferência dele para esse tipo de evento. */
export async function notifyUser(userId: string, prefKey: NotificationPrefKey, data: NotifyData): Promise<void> {
  if (!(await isEnabled(userId, prefKey))) return
  await db.notification.create({
    data: { userId, type: data.type, title: data.title, message: data.message, link: data.link ?? null },
  })
}

/** Notifica todos os membros de um projeto, cada um respeitando sua própria preferência. */
export async function notifyProjectMembers(projectId: string, prefKey: NotificationPrefKey, data: NotifyData): Promise<void> {
  const members = await db.projectMember.findMany({ where: { projectId }, select: { userId: true } })
  for (const m of members) {
    await notifyUser(m.userId, prefKey, data)
  }
}
