"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"

export async function getProjectForCharter(projectId: string) {
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
      risks: {
        orderBy: { status: "asc" },
      },
      meetings: {
        where: { type: "GO_NO_GO" },
        orderBy: { date: "desc" },
        take: 1,
        include: {
          participants: true,
          createdBy: { select: { name: true } },
        },
      },
    },
  })
}
