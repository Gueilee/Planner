import type { BenefitItem, ProjectBenefitMetrics } from "@/lib/types/benefits"

// ── Annualize a benefit value for consistent comparison ───────────────────────
export function annualizeValue(value: number, frequency: string): number {
  if (frequency === "MONTHLY") return value * 12
  return value // ONCE and ANNUAL stay as-is
}

// ── Monthly equivalent (for payback) — ONCE is excluded ──────────────────────
function toMonthly(value: number, frequency: string): number {
  if (frequency === "ANNUAL")  return value / 12
  if (frequency === "MONTHLY") return value
  return 0 // ONCE: one-time, not recurrent
}

// ── Impact Score dimensions ───────────────────────────────────────────────────
const FINANCIAL_TYPES  = new Set(["COST_REDUCTION", "OPEX_REDUCTION", "ANNUAL_SAVINGS", "MONTHLY_SAVINGS"])
const REVENUE_TYPES    = new Set(["REVENUE_INCREASE"])
const PROD_TYPES       = new Set(["HOURS_SAVED", "PRODUCTIVITY_GAIN", "PROCESS_AUTOMATION", "REWORK_REDUCTION", "TIME_REDUCTION"])
const RISK_TYPES       = new Set(["RISK_REDUCTION", "COMPLIANCE", "GOVERNANCE"])
const QUALITY_TYPES    = new Set(["QUALITY", "CUSTOMER_EXPERIENCE", "USER_SATISFACTION"])

// Score weights
const W = { financial: 0.30, revenue: 0.20, productivity: 0.20, risk: 0.15, quality: 0.15 }

export function computeStrategicScore(
  benefits: BenefitItem[],
  portfolioMaxFinancial: number,
  portfolioMaxRevenue: number,
): number {
  const realized = benefits.filter((b) => b.status === "REALIZED" || b.status === "IN_PROGRESS")

  // Financial savings dimension (normalized against portfolio max)
  const financialSum = realized
    .filter((b) => FINANCIAL_TYPES.has(b.type))
    .reduce((s, b) => s + annualizeValue(b.realizedValue, b.frequency), 0)
  const financialScore = portfolioMaxFinancial > 0
    ? Math.min(100, (financialSum / portfolioMaxFinancial) * 100)
    : (financialSum > 0 ? 50 : 0)

  // Revenue dimension
  const revenueSum = realized
    .filter((b) => REVENUE_TYPES.has(b.type))
    .reduce((s, b) => s + annualizeValue(b.realizedValue, b.frequency), 0)
  const revenueScore = portfolioMaxRevenue > 0
    ? Math.min(100, (revenueSum / portfolioMaxRevenue) * 100)
    : (revenueSum > 0 ? 50 : 0)

  // Productivity — count-based (each benefit = 20 pts, cap 100)
  const prodCount = realized.filter((b) => PROD_TYPES.has(b.type)).length
  const prodScore = Math.min(100, prodCount * 20)

  // Risk reduction — count-based (each = 33.3 pts, cap 100)
  const riskCount = realized.filter((b) => RISK_TYPES.has(b.type)).length
  const riskScore = Math.min(100, riskCount * 33.3)

  // Quality — count-based (each = 33.3 pts, cap 100)
  const qualityCount = realized.filter((b) => QUALITY_TYPES.has(b.type)).length
  const qualityScore = Math.min(100, qualityCount * 33.3)

  const raw =
    financialScore * W.financial +
    revenueScore   * W.revenue   +
    prodScore      * W.productivity +
    riskScore      * W.risk      +
    qualityScore   * W.quality

  return Math.round(raw)
}

export function impactLabel(score: number): string {
  if (score <= 20) return "Baixo Impacto"
  if (score <= 40) return "Moderado"
  if (score <= 60) return "Relevante"
  if (score <= 80) return "Alto Impacto"
  return "Transformacional"
}

export function impactColor(score: number): string {
  if (score <= 20) return "#64748B"
  if (score <= 40) return "#2563EB"
  if (score <= 60) return "#D97706"
  if (score <= 80) return "#EA580C"
  return "#7B2FBE"
}

export function impactBg(score: number): string {
  if (score <= 20) return "rgba(100,116,139,0.1)"
  if (score <= 40) return "rgba(37,99,235,0.1)"
  if (score <= 60) return "rgba(217,119,6,0.1)"
  if (score <= 80) return "rgba(234,88,12,0.1)"
  return "rgba(123,47,190,0.1)"
}

// ── ROI ───────────────────────────────────────────────────────────────────────
export function computeROI(totalRealized: number, investment: number): number | null {
  if (investment <= 0) return null
  return ((totalRealized - investment) / investment) * 100
}

// ── Payback ───────────────────────────────────────────────────────────────────
export function computePaybackMonths(investment: number, benefits: BenefitItem[]): number | null {
  if (investment <= 0) return null
  const realized = benefits.filter((b) => b.status === "REALIZED" || b.status === "IN_PROGRESS")
  const monthlyTotal = realized.reduce(
    (s, b) => s + toMonthly(b.realizedValue, b.frequency),
    0,
  )
  if (monthlyTotal <= 0) return null
  return investment / monthlyTotal
}

// ── Effective value: realizedValue when done, plannedValue otherwise ──────────
function effectiveValue(b: BenefitItem): number {
  return (b.status === "REALIZED" || b.status === "IN_PROGRESS") ? b.realizedValue : b.plannedValue
}

// ── Total financial value (planned pipeline + realized) ───────────────────────
export function computeFinancialRealized(benefits: BenefitItem[]): number {
  return benefits
    .filter((b) => b.category === "FINANCIAL")
    .reduce((s, b) => s + annualizeValue(effectiveValue(b), b.frequency), 0)
}

// ── Revenue value (planned pipeline + realized) ───────────────────────────────
export function computeRevenueRealized(benefits: BenefitItem[]): number {
  return benefits
    .filter((b) => b.type === "REVENUE_INCREASE")
    .reduce((s, b) => s + annualizeValue(effectiveValue(b), b.frequency), 0)
}

// ── Hours saved value (planned pipeline + realized) ───────────────────────────
export function computeHoursSaved(benefits: BenefitItem[]): number {
  return benefits
    .filter((b) => b.type === "HOURS_SAVED")
    .reduce((s, b) => s + effectiveValue(b), 0)
}

// ── Strictly-realized helpers (for ROI, payback, project-level tracking) ─────
export function computeFinancialRealizedStrict(benefits: BenefitItem[]): number {
  return benefits
    .filter((b) => b.category === "FINANCIAL" && (b.status === "REALIZED" || b.status === "IN_PROGRESS"))
    .reduce((s, b) => s + annualizeValue(b.realizedValue, b.frequency), 0)
}

// ── Build monthly cumulative timeline ────────────────────────────────────────
export function buildTimelineData(
  projects: { benefits: BenefitItem[]; realizationDate?: string | null }[],
): { month: string; cumulative: number; monthly: number }[] {
  const monthlyMap: Record<string, number> = {}

  for (const p of projects) {
    for (const b of p.benefits) {
      if (b.status !== "REALIZED" && b.status !== "IN_PROGRESS") continue
      const dateStr = b.realizationDate ?? b.updatedAt
      const d = new Date(dateStr)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      monthlyMap[key] = (monthlyMap[key] ?? 0) + annualizeValue(b.realizedValue, b.frequency)
    }
  }

  const sorted = Object.entries(monthlyMap).sort(([a], [b]) => a.localeCompare(b))
  let cumulative = 0
  return sorted.map(([month, monthly]) => {
    cumulative += monthly
    const [year, m] = month.split("-")
    const label = new Date(Number(year), Number(m) - 1, 1).toLocaleDateString("pt-BR", {
      month: "short", year: "2-digit",
    })
    return { month: label, cumulative, monthly }
  })
}

// ── Compute full metrics for a project ───────────────────────────────────────
export function computeProjectMetrics(
  project: {
    id: string
    title: string
    projectArea: string
    status: string
    investment: number
    benefits: BenefitItem[]
  },
  portfolioMaxFinancial: number,
  portfolioMaxRevenue: number,
): ProjectBenefitMetrics {
  const { benefits, investment } = project

  const totalPlanned  = benefits.reduce((s, b) => s + annualizeValue(b.plannedValue,  b.frequency), 0)
  const totalRealized = benefits.reduce((s, b) => b.status === "REALIZED" || b.status === "IN_PROGRESS"
    ? s + annualizeValue(b.realizedValue, b.frequency) : s, 0)

  const financialRealized   = computeFinancialRealized(benefits)
  const operationalRealized = benefits
    .filter((b) => b.category === "OPERATIONAL" && (b.status === "REALIZED" || b.status === "IN_PROGRESS"))
    .reduce((s, b) => s + b.realizedValue, 0)
  const strategicRealized   = benefits
    .filter((b) => b.category === "STRATEGIC" && (b.status === "REALIZED" || b.status === "IN_PROGRESS"))
    .reduce((s, b) => s + b.realizedValue, 0)

  const score = computeStrategicScore(benefits, portfolioMaxFinancial, portfolioMaxRevenue)

  return {
    projectId:            project.id,
    projectTitle:         project.title,
    projectArea:          project.projectArea,
    projectStatus:        project.status,
    investment,
    totalPlanned,
    totalRealized,
    financialRealized,
    operationalRealized,
    strategicRealized,
    roi:                  computeROI(financialRealized, investment),
    paybackMonths:        computePaybackMonths(investment, benefits),
    impactScore:          score,
    impactLabel:          impactLabel(score),
    benefitCount:         benefits.length,
    realizedCount:        benefits.filter((b) => b.status === "REALIZED").length,
  }
}
