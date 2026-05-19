"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { ProjectStatus } from "@/lib/generated/prisma/enums"

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
    include: {
      sponsor: { select: { name: true, department: true } },
      members: {
        take: 5,
        include: { user: { select: { id: true, name: true } } },
      },
      _count: { select: { members: true } },
      tasks:  { select: { status: true, progress: true } },
      risks:  { select: { status: true } },
    },
  })
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
