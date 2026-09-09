"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { toLegacyLikeTasks, areasFromV2, dependenciesById } from "@/lib/utils/schedule-v2-adapter"

export async function getIndicatorsData(projectId: string) {
  const session = await auth()
  if (!session?.user) return null

  const [project, deps] = await Promise.all([
    db.project.findUnique({
      where: { id: projectId },
      select: {
        id: true, title: true, status: true, requestNumber: true,
        expectedStart: true, expectedEnd: true,
        actualStart: true, actualEnd: true,
        budget: true, estimatedCosts: true, economy: true,
        scheduleV2Items: {
          orderBy: { order: "asc" },
          select: {
            id: true, parentId: true, title: true, status: true, percentualCompleto: true,
            inicioEstimado: true, terminoEstimado: true, inicioReal: true, terminoReal: true,
            esforcoEstimadoH: true, esforcoRealH: true, budgetedCost: true, actualCost: true,
            responsavelId: true, responsavelNome: true, responsavel: { select: { id: true, name: true } },
          },
        },
      },
    }),
    db.scheduleV2Dependency.findMany({
      where: { successor: { projectId } },
      select: { successorId: true, predecessorId: true },
    }),
  ])

  if (!project) return null

  const legacyTasks = toLegacyLikeTasks(project.scheduleV2Items)
  const areas = areasFromV2(project.scheduleV2Items)
  const depsByTask = dependenciesById(deps)

  const tasks = legacyTasks.map((t) => ({
    id:               t.id,
    title:            t.title,
    status:           t.status,
    progress:         t.progress,
    riskStatus:       t.riskStatus,
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
    responsibleName:  t.responsibleName,
    wbsAreaName:      t.wbsAreaName,
    wbsAreaColor:     t.wbsAreaColor,
    dependencies:     depsByTask.get(t.id) ?? [],
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
    areas: areas.map((a, i) => ({ id: a.id, name: a.name, color: a.color, order: i })),
  }
}

export type IndicatorsData = Awaited<ReturnType<typeof getIndicatorsData>>
export type IndicatorsTask = NonNullable<IndicatorsData>["tasks"][number]
export type IndicatorsProject = NonNullable<IndicatorsData>["project"]
export type IndicatorsArea = NonNullable<IndicatorsData>["areas"][number]
