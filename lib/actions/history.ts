"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"

export async function getAllProjectsSummary() {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")
  return db.project.findMany({
    orderBy: [
      { priority: { sort: "asc", nulls: "last" } },
      { updatedAt: "desc" },
    ],
    include: {
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
        select: { id: true, status: true, progress: true },
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
    },
  })
}
