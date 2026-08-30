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
