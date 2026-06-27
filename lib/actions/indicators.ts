"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"

export async function getIndicatorsData(projectId: string) {
  const session = await auth()
  if (!session?.user) return null

  const [project, areas] = await Promise.all([
    db.project.findUnique({
      where: { id: projectId },
      select: {
        id: true, title: true, status: true, requestNumber: true,
        expectedStart: true, expectedEnd: true,
        actualStart: true, actualEnd: true,
        budget: true, estimatedCosts: true, economy: true,
        tasks: {
          orderBy: { order: "asc" },
          select: {
            id: true, title: true, status: true, progress: true, riskStatus: true,
            startDate: true, endDate: true, actualStart: true, actualEnd: true, completedAt: true,
            estimatedEffort: true, actualEffort: true,
            budgetedCost: true, actualCost: true,
            parentId: true, wbsAreaId: true, responsibleId: true, order: true,
            dependencies: true,
            responsible: { select: { id: true, name: true } },
            wbsArea:     { select: { id: true, name: true, color: true } },
          },
        },
      },
    }),
    db.wbsArea.findMany({
      where: { projectId },
      orderBy: { order: "asc" },
      select: { id: true, name: true, color: true, order: true },
    }),
  ])

  if (!project) return null

  const tasks = project.tasks.map((t) => ({
    id:               t.id,
    title:            t.title,
    status:           t.status as string,
    progress:         t.progress,
    riskStatus:       t.riskStatus as string,
    startDate:        t.startDate?.toISOString() ?? null,
    endDate:          t.endDate?.toISOString() ?? null,
    actualStart:      t.actualStart?.toISOString() ?? null,
    actualEnd:        t.actualEnd?.toISOString() ?? null,
    completedAt:      t.completedAt?.toISOString() ?? null,
    estimatedEffort:  t.estimatedEffort,
    actualEffort:     t.actualEffort,
    budgetedCost:     t.budgetedCost,
    actualCost:       t.actualCost,
    parentId:         t.parentId,
    wbsAreaId:        t.wbsAreaId,
    responsibleId:    t.responsibleId,
    responsibleName:  t.responsible?.name ?? null,
    wbsAreaName:      t.wbsArea?.name ?? null,
    wbsAreaColor:     t.wbsArea?.color ?? null,
    dependencies:     (() => { try { return JSON.parse(t.dependencies ?? "[]") as string[] } catch { return [] } })(),
    order:            t.order,
  }))

  return {
    project: {
      id:             project.id,
      title:          project.title,
      status:         project.status as string,
      requestNumber:  project.requestNumber,
      expectedStart:  project.expectedStart?.toISOString() ?? null,
      expectedEnd:    project.expectedEnd?.toISOString() ?? null,
      actualStart:    project.actualStart?.toISOString() ?? null,
      actualEnd:      project.actualEnd?.toISOString() ?? null,
      budget:         project.budget,
      estimatedCosts: project.estimatedCosts,
      economy:        project.economy,
    },
    tasks,
    areas: areas.map((a) => ({ id: a.id, name: a.name, color: a.color, order: a.order })),
  }
}

export type IndicatorsData = Awaited<ReturnType<typeof getIndicatorsData>>
export type IndicatorsTask = NonNullable<IndicatorsData>["tasks"][number]
export type IndicatorsProject = NonNullable<IndicatorsData>["project"]
export type IndicatorsArea = NonNullable<IndicatorsData>["areas"][number]
