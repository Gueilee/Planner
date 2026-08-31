import { differenceInDays } from "date-fns"

export type ScheduleStatus = "ON_TIME" | "AT_RISK" | "DELAYED" | "ND"

export const DEFAULT_RISK_THRESHOLD_PCT = 10

/**
 * % esperado de conclusão até hoje, baseado no calendário (dias decorridos ÷
 * duração total), limitado a 0–100%. Mesma lógica usada na planilha de status
 * report do PMO (abas Baseline/Schedule) para "progresso esperado".
 */
export function computeExpectedPct(
  start: Date | null,
  end: Date | null,
  today: Date = new Date(),
): number | null {
  if (!start || !end) return null
  const totalDays = differenceInDays(end, start)
  if (totalDays <= 0) return null
  const elapsedDays = differenceInDays(today, start)
  return Math.max(0, Math.min(100, Math.round((elapsedDays / totalDays) * 100)))
}

/**
 * Classifica o status de prazo a partir da variação (real − esperado), com um
 * único limite de risco configurável — a mesma regra da planilha do PMO:
 * variação ≥ 0 → no prazo; variação abaixo de -limite → atrasado; entre os
 * dois → em risco.
 */
export function computeScheduleStatus(
  actualPct:        number,
  expectedPct:      number | null,
  riskThresholdPct: number = DEFAULT_RISK_THRESHOLD_PCT,
): ScheduleStatus {
  if (expectedPct === null) return "ND"
  const variance = actualPct - expectedPct
  if (variance >= 0) return "ON_TIME"
  if (variance < -riskThresholdPct) return "DELAYED"
  return "AT_RISK"
}

const STATUS_RANK: Record<ScheduleStatus, number> = { ON_TIME: 0, AT_RISK: 1, DELAYED: 2, ND: -1 }

/**
 * Compara o status de prazo de uma tarefa antes/depois de uma atualização de
 * progresso, mantendo o % esperado fixo (calculado "hoje"), para detectar se
 * essa mudança fez a tarefa PIORAR de faixa (ex.: on track → at risk, ou
 * at risk → delayed) — usado para disparar o alerta de "tarefa em risco/
 * atrasada" só quando é uma novidade, não a cada leitura.
 */
export function detectScheduleStatusWorsening(
  oldProgress:      number,
  newProgress:      number,
  start:            Date | null,
  end:              Date | null,
  riskThresholdPct: number = DEFAULT_RISK_THRESHOLD_PCT,
  today:            Date = new Date(),
): { from: ScheduleStatus; to: ScheduleStatus; worsened: boolean } {
  const expected = computeExpectedPct(start, end, today)
  const from = computeScheduleStatus(oldProgress, expected, riskThresholdPct)
  const to   = computeScheduleStatus(newProgress, expected, riskThresholdPct)
  const worsened = STATUS_RANK[to] > STATUS_RANK[from] && (to === "AT_RISK" || to === "DELAYED")
  return { from, to, worsened }
}
