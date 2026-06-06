"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"

export type AllocationTask = {
  id: string
  title: string
  status: string
  progress: number
  startDate: string | null
  endDate: string | null
  projectId: string
  projectTitle: string
  projectArea: string
  projectStatus: string
}

export type AllocationResult = {
  tasks: AllocationTask[]
  userName: string | null
}

export async function getPersonAllocation(
  userId: string,
  startDate: string | null,
  endDate: string | null,
): Promise<AllocationResult> {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const dateFilter =
    startDate && endDate
      ? {
          OR: [
            // tarefa sobrepõe o período: começa antes do fim E termina depois do início
            {
              startDate: { lte: new Date(endDate) },
              endDate:   { gte: new Date(startDate) },
            },
            // tarefa começa dentro do período mas sem data de fim
            {
              startDate: { gte: new Date(startDate), lte: new Date(endDate) },
              endDate: null,
            },
            // sem datas — inclui sempre para não ocultar trabalho real
            { startDate: null },
          ],
        }
      : {}

  const tasks = await db.scheduleTask.findMany({
    where: { responsibleId: userId, ...dateFilter },
    select: {
      id: true, title: true, status: true, progress: true,
      startDate: true, endDate: true,
      project: {
        select: { id: true, title: true, projectArea: true, status: true },
      },
    },
    orderBy: [{ project: { title: "asc" } }, { startDate: "asc" }],
  })

  const user = await db.user.findUnique({
    where:  { id: userId },
    select: { name: true },
  })

  return {
    userName: user?.name ?? null,
    tasks: tasks.map((t) => ({
      id:            t.id,
      title:         t.title,
      status:        t.status,
      progress:      t.progress,
      startDate:     t.startDate?.toISOString() ?? null,
      endDate:       t.endDate?.toISOString()   ?? null,
      projectId:     t.project.id,
      projectTitle:  t.project.title,
      projectArea:   t.project.projectArea,
      projectStatus: t.project.status,
    })),
  }
}
