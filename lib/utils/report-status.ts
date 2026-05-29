import { differenceInDays } from "date-fns"

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

export function computeReportStatus(p: ProjectSnapshot): AutoReportStatus {
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
  // δ = progresso_real − progresso_esperado_pela_timeline
  // Também penaliza pela proporção de tarefas com prazo vencido e ainda abertas.
  let schedule: TL = "GREEN"
  if (!isFinished) {
    if (p.expectedEnd && p.expectedEnd < today) {
      // Prazo final já passou e projeto não concluído → vermelho imediato
      schedule = "RED"
    } else {
      const total = p.tasks.length
      if (total > 0) {
        const overdueCount  = p.tasks.filter(t =>
          t.status !== "COMPLETED" && t.endDate && t.endDate < today
        ).length
        const overdueRatio  = overdueCount / total

        let delta = 0
        if (p.expectedStart && p.expectedEnd) {
          const span       = differenceInDays(p.expectedEnd, p.expectedStart)
          const elapsed    = differenceInDays(today, p.expectedStart)
          const expected   = span > 0 ? Math.max(0, Math.min(100, Math.round((elapsed / span) * 100))) : 0
          const actual     = Math.round(p.tasks.reduce((s, t) => s + t.progress, 0) / total)
          delta = actual - expected   // negativo = atrás do plano
        }

        if      (delta < -25 || overdueRatio > 0.25) schedule = "RED"
        else if (delta < -10 || overdueRatio > 0.10) schedule = "YELLOW"
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
