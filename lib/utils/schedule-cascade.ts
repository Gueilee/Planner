import { computeProjectProgress, type AreaForProgress } from "./project-progress"
import {
  computeExpectedPct, computeScheduleStatus,
  type ScheduleStatus, DEFAULT_RISK_THRESHOLD_PCT,
} from "./schedule-status"

export type CascadeTask = {
  id:        string
  wbsAreaId: string | null
  progress:  number
  startDate: Date | null
  endDate:   Date | null
}

export type TaskCascadeResult = {
  id:             string
  expectedPct:    number | null
  scheduleStatus: ScheduleStatus
}

export type AreaCascadeResult = {
  id:             string
  actualPct:      number
  expectedPct:    number | null
  scheduleStatus: ScheduleStatus
}

export type ProjectCascadeResult = {
  actualPct:      number
  expectedPct:    number | null
  scheduleStatus: ScheduleStatus
  tasks:          TaskCascadeResult[]
  areas:          AreaCascadeResult[]
}

/**
 * Cascata Tarefa → Módulo (WBS) → Projeto: progresso esperado por tarefa
 * (calendário: tempo decorrido ÷ duração) e status (on track/at risk/delayed)
 * em cada nível, sempre por média simples dentro de cada módulo — igual à
 * planilha do PMO — e agregado ao projeto com o mesmo critério de peso por
 * módulo (WbsArea.weight) já usado para o progresso real, aplicado agora
 * também ao lado "esperado", para os dois ficarem comparáveis.
 *
 * Tarefas sem data de início/fim não têm % esperado (ficam "ND" nesse nível)
 * e são excluídas apenas do lado "esperado" da agregação — o progresso real
 * delas continua contando normalmente.
 */
export function computeScheduleCascade(
  tasks:            CascadeTask[],
  wbsAreas:         AreaForProgress[],
  riskThresholdPct: number = DEFAULT_RISK_THRESHOLD_PCT,
  today:            Date = new Date(),
): ProjectCascadeResult {
  // ── 1. Tarefa ──────────────────────────────────────────────────────────────
  const taskResults: TaskCascadeResult[] = tasks.map((t) => {
    const expectedPct = computeExpectedPct(t.startDate, t.endDate, today)
    return {
      id:             t.id,
      expectedPct,
      scheduleStatus: computeScheduleStatus(t.progress, expectedPct, riskThresholdPct),
    }
  })
  const expectedById = new Map(taskResults.map((r) => [r.id, r.expectedPct]))

  // ── 2. Módulo WBS (média simples das tarefas daquele módulo) ────────────────
  const areaResults: AreaCascadeResult[] = []
  for (const area of wbsAreas) {
    const areaTasks = tasks.filter((t) => t.wbsAreaId === area.id)
    if (areaTasks.length === 0) continue

    const actualPct = Math.round(areaTasks.reduce((s, t) => s + t.progress, 0) / areaTasks.length)

    const expectedVals = areaTasks
      .map((t) => expectedById.get(t.id))
      .filter((v): v is number => v !== null && v !== undefined)
    const expectedPct = expectedVals.length > 0
      ? Math.round(expectedVals.reduce((s, v) => s + v, 0) / expectedVals.length)
      : null

    areaResults.push({
      id: area.id,
      actualPct,
      expectedPct,
      scheduleStatus: computeScheduleStatus(actualPct, expectedPct, riskThresholdPct),
    })
  }

  // ── 3. Projeto (reaproveita a mesma ponderação por módulo do progresso real,
  //      aplicada agora também ao lado "esperado", via tarefas substitutas) ───
  const projectActualPct = tasks.length > 0 ? computeProjectProgress(tasks, wbsAreas) : 0

  const tasksWithExpected = tasks
    .filter((t) => expectedById.get(t.id) !== null && expectedById.get(t.id) !== undefined)
    .map((t) => ({ wbsAreaId: t.wbsAreaId, progress: expectedById.get(t.id) as number }))

  const projectExpectedPct = tasksWithExpected.length > 0
    ? computeProjectProgress(tasksWithExpected, wbsAreas)
    : null

  return {
    actualPct:      projectActualPct,
    expectedPct:    projectExpectedPct,
    scheduleStatus: computeScheduleStatus(projectActualPct, projectExpectedPct, riskThresholdPct),
    tasks:          taskResults,
    areas:          areaResults,
  }
}
