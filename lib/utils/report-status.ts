import { computeExpectedPct, computeScheduleStatus, DEFAULT_RISK_THRESHOLD_PCT } from "./schedule-status"

type TL = "GREEN" | "YELLOW" | "RED"

export type AutoReportStatus = { cost: TL; schedule: TL; resources: TL; overall: TL }

type ProjectSnapshot = {
  budget:         number | null
  estimatedCosts: number | null
  status:         string
  expectedStart:  Date | null
  expectedEnd:    Date | null
  tasks: {
    status:       string
    progress:     number
    endDate:      Date | null
    budgetedCost: number | null
    actualCost:   number | null
  }[]
  risks: { status: string }[]
}

export function computeReportStatus(
  p: ProjectSnapshot,
  riskThresholdPct: number = DEFAULT_RISK_THRESHOLD_PCT,
): AutoReportStatus {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const isFinished = ["COMPLETED", "CANCELLED"].includes(p.status)

  // ── CUSTOS — IDC (Índice de Desempenho de Custo) ───────────────────────────
  // IDC = Valor Agregado / Custo Real  (Earned Value / Actual Cost)
  // IDC >= 1.0: dentro do orçamento → GREEN
  // IDC >= 0.85: atenção            → YELLOW
  // IDC <  0.85: risco orçamentário → RED
  // Fallback: estimatedCosts vs budget quando não há dados por tarefa.
  let cost: TL = "GREEN"

  const ve = p.tasks.reduce((s, t) => s + ((t.budgetedCost ?? 0) * (t.progress / 100)), 0)
  const cr = p.tasks.reduce((s, t) => s + (t.actualCost ?? 0), 0)

  if (cr > 0 && ve >= 0) {
    const idc = ve / cr
    if      (idc < 0.85) cost = "RED"
    else if (idc < 1.00) cost = "YELLOW"
  } else if (p.budget && p.estimatedCosts) {
    const ratio = p.estimatedCosts / p.budget
    if      (ratio > 1.15) cost = "RED"
    else if (ratio > 1.00) cost = "YELLOW"
  }

  const critHighRisks = p.risks.filter(r => ["HIGH", "CRITICAL"].includes(r.status)).length
  if (critHighRisks >= 3 && cost === "GREEN")  cost = "YELLOW"
  if (critHighRisks >= 5 && cost === "YELLOW") cost = "RED"

  // ── CRONOGRAMA ─────────────────────────────────────────────────────────────
  // Usa a mesma regra canônica de progresso esperado/variação do resto do
  // sistema (lib/utils/schedule-status.ts), com o limite de risco configurável
  // por organização — em vez de uma fórmula própria e divergente.
  let schedule: TL = "GREEN"
  if (!isFinished) {
    if (p.expectedEnd && p.expectedEnd < today) {
      // Prazo final já passou e projeto não concluído → vermelho imediato
      schedule = "RED"
    } else {
      const total = p.tasks.length
      if (total > 0) {
        const actual        = Math.round(p.tasks.reduce((s, t) => s + t.progress, 0) / total)
        const expected      = computeExpectedPct(p.expectedStart, p.expectedEnd, today)
        const scheduleStatus = computeScheduleStatus(actual, expected, riskThresholdPct)

        if      (scheduleStatus === "DELAYED") schedule = "RED"
        else if (scheduleStatus === "AT_RISK") schedule = "YELLOW"
      }
    }
  }

  // ── RECURSOS ───────────────────────────────────────────────────────────────
  // De todas as tarefas cujo prazo já chegou, quantas foram concluídas?
  // Alta taxa de não-entrega no prazo → equipe/recursos em risco.
  let resources: TL = "GREEN"
  const tasksDue = p.tasks.filter(t => t.endDate && t.endDate <= today)
  if (tasksDue.length >= 3) {   // mínimo 3 tarefas com prazo para ter base estatística
    const doneRate = tasksDue.filter(t => t.status === "COMPLETED").length / tasksDue.length
    if      (doneRate < 0.60) resources = "RED"
    else if (doneRate < 0.80) resources = "YELLOW"
  }

  // ── GERAL ──────────────────────────────────────────────────────────────────
  const lights = [cost, schedule, resources]
  const overall: TL =
    lights.includes("RED")    ? "RED" :
    lights.includes("YELLOW") ? "YELLOW" :
    "GREEN"

  return { cost, schedule, resources, overall }
}
