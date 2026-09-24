"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { canAccessOrg } from "@/lib/actions/project-access"
import { toLegacyLikeTasks, areasFromV2, dependenciesById } from "@/lib/utils/schedule-v2-adapter"

export async function getIndicatorsData(projectId: string) {
  const session = await auth()
  if (!session?.user) return null

  const [project, deps] = await Promise.all([
    db.project.findUnique({
      where: { id: projectId },
      select: {
        id: true, title: true, status: true, requestNumber: true, organizationId: true,
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
  if (!(await canAccessOrg(session, project.organizationId))) return null

  const legacyTasks = toLegacyLikeTasks(project.scheduleV2Items)
  const areas = areasFromV2(project.scheduleV2Items)
  const depsByTask = dependenciesById(deps)

  // Prazo (daysRemaining, SPI/IDP, Gantt de módulos) prioriza o período do
  // CRONOGRAMA DE VERDADE (min início/max término das tarefas) sobre
  // Project.expectedStart/expectedEnd — esse par é só a estimativa inicial
  // da solicitação do projeto, gravada ANTES de existir cronograma
  // detalhado, e fica desatualizada assim que ele é montado (ex.: pedido
  // pra terminar em 18/09, cronograma de verdade vai até 12/11 — os
  // indicadores de prazo ficavam sempre travados em "atrasado", mesmo com
  // o projeto no meio do prazo real). Cai pro campo do projeto só quando
  // nenhuma tarefa tem data ainda.
  const scheduleDates = legacyTasks.reduce(
    (acc, t) => {
      if (t.startDate && (!acc.start || t.startDate < acc.start)) acc.start = t.startDate
      if (t.endDate && (!acc.end || t.endDate > acc.end)) acc.end = t.endDate
      return acc
    },
    { start: null as Date | null, end: null as Date | null }
  )
  const effectiveExpectedStart = scheduleDates.start ?? project.expectedStart
  const effectiveExpectedEnd   = scheduleDates.end   ?? project.expectedEnd

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
      expectedStart:  effectiveExpectedStart?.toISOString() ?? null,
      expectedEnd:    effectiveExpectedEnd?.toISOString() ?? null,
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
