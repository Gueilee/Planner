"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { ProjectStatus } from "@/lib/generated/prisma/enums"

export type PriorityItem = {
  id: string
  priority: number
  priorityLabel: string
  priorityNotes?: string
}

export async function savePriorities(items: PriorityItem[]) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const now = new Date()
  await db.$transaction(
    items.map((item) =>
      db.project.update({
        where: { id: item.id },
        data: {
          priority:          item.priority,
          priorityLabel:     item.priorityLabel,
          priorityNotes:     item.priorityNotes ?? null,
          priorityUpdatedAt: now,
        },
      })
    )
  )

  revalidatePath("/priority")
  revalidatePath("/projects")
  return { success: true }
}

const ACTIVE_STATUSES: ProjectStatus[] = [
  ProjectStatus.PLANNING,
  ProjectStatus.IN_PROGRESS,
  ProjectStatus.PILOT,
  ProjectStatus.RAMP_UP,
  ProjectStatus.GO_LIVE,
  ProjectStatus.POST_GOLIVE,
]

export async function getProjectsForPriority() {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  return db.project.findMany({
    where: { status: { in: ACTIVE_STATUSES }, organizationId: session.user.organizationId },
    orderBy: [
      { priority: { sort: "asc", nulls: "last" } },
      { createdAt: "asc" },
    ],
    select: {
      id:               true,
      title:            true,
      status:           true,
      priority:         true,
      priorityLabel:    true,
      priorityNotes:    true,
      priorityUpdatedAt: true,
      projectArea:  true,
      sponsor:     { select: { name: true } },
      members:     { select: { id: true } },
      tasks:       { select: { status: true, progress: true } },
      economy:     true,
      expectedEnd: true,
    },
  })
}
