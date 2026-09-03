"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { V2_STATUS_TO_LEGACY } from "@/lib/utils/schedule-v2-adapter"

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
            // item sobrepõe o período: começa antes do fim E termina depois do início
            {
              inicioEstimado: { lte: new Date(endDate) },
              terminoEstimado: { gte: new Date(startDate) },
            },
            // item começa dentro do período mas sem data de fim
            {
              inicioEstimado: { gte: new Date(startDate), lte: new Date(endDate) },
              terminoEstimado: null,
            },
            // sem datas — inclui sempre para não ocultar trabalho real
            { inicioEstimado: null },
          ],
        }
      : {}

  const items = await db.scheduleV2Item.findMany({
    where: { responsavelId: userId, ...dateFilter },
    select: {
      id: true, title: true, status: true, percentualCompleto: true,
      inicioEstimado: true, terminoEstimado: true,
      project: {
        select: { id: true, title: true, projectArea: true, status: true },
      },
    },
    orderBy: [{ project: { title: "asc" } }, { inicioEstimado: "asc" }],
  })

  const user = await db.user.findUnique({
    where:  { id: userId },
    select: { name: true },
  })

  return {
    userName: user?.name ?? null,
    tasks: items.map((t) => ({
      id:            t.id,
      title:         t.title,
      status:        V2_STATUS_TO_LEGACY[t.status] ?? "PLANNING",
      progress:      t.percentualCompleto,
      startDate:     t.inicioEstimado?.toISOString() ?? null,
      endDate:       t.terminoEstimado?.toISOString() ?? null,
      projectId:     t.project.id,
      projectTitle:  t.project.title,
      projectArea:   t.project.projectArea,
      projectStatus: t.project.status,
    })),
  }
}
