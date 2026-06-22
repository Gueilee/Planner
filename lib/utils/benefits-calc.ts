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
  return 0
}

// ── Effective value: realizedValue when done, plannedValue otherwise ──────────
// Exposed so score + compute functions share the same semantic
export function effectiveValue(b: BenefitItem): number {
  return (b.status === "REALIZED" || b.status === "IN_PROGRESS") ? b.realizedValue : b.plannedValue
}

// ── Type sets for scoring ─────────────────────────────────────────────────────
const FINANCIAL_TYPES  = new Set(["COST_REDUCTION", "OPEX_REDUCTION", "ANNUAL_SAVINGS", "MONTHLY_SAVINGS"])
const REVENUE_TYPES    = new Set(["REVENUE_INCREASE"])
const PROD_TYPES       = new Set(["HOURS_SAVED", "PRODUCTIVITY_GAIN", "PROCESS_AUTOMATION", "REWORK_REDUCTION", "TIME_REDUCTION"])
const RISK_TYPES       = new Set(["RISK_REDUCTION", "COMPLIANCE", "GOVERNANCE"])
const QUALITY_TYPES    = new Set(["QUALITY", "CUSTOMER_EXPERIENCE", "USER_SATISFACTION"])

// ── Impact Score — 4 balanced dimensions (0–25 pts each = max 100) ────────────
//
// Dim 1 – Quantity:   how many benefits are registered (5 pts × count, cap 25)
// Dim 2 – Diversity:  unique benefit categories present (up to 3, weighted 25)
// Dim 3 – Financial:  financial + revenue value normalized against portfolio max
// Dim 4 – Op/Strat:   count of operational/strategic type benefits (8 pts each)
//
// All benefits count regardless of status — PLANNED reflects committed intent.
// Financial dimension uses effective value so realized benefits count more.
export function computeStrategicScore(
  benefits: BenefitItem[],
  portfolioMaxFinancial: number,
  portfolioMaxRevenue: number,
): number {
  if (benefits.length === 0) return 0

  // Dim 1: Quantity
  const countScore = Math.min(25, benefits.length * 5)

  // Dim 2: Diversity — unique categories
  const uniqueCategories = new Set(benefits.map((b) => b.category)).size
  const diversityScore = Math.round((uniqueCategories / 3) * 25)

  // Dim 3: Financial value (incl. OTHER in FINANCIAL category)
  const portfolioFinMax = Math.max(portfolioMaxFinancial, portfolioMaxRevenue, 1)
  const financialTotal = benefits
    .filter((b) =>
      FINANCIAL_TYPES.has(b.type) ||
      REVENUE_TYPES.has(b.type) ||
      (b.type === "OTHER" && b.category === "FINANCIAL"),
    )
    .reduce((s, b) => s + annualizeValue(effectiveValue(b), b.frequency), 0)
  const financialScore = Math.min(25, (financialTotal / portfolioFinMax) * 25)

  // Dim 4: Operational/Strategic depth
  const nonFinancialCount = benefits.filter((b) =>
    PROD_TYPES.has(b.type) ||
    RISK_TYPES.has(b.type) ||
    QUALITY_TYPES.has(b.type) ||
    (b.type === "OTHER" && b.category !== "FINANCIAL"),
  ).length
  const opStratScore = Math.min(25, nonFinancialCount * 8)

  return Math.round(Math.min(100, countScore + diversityScore + financialScore + opStratScore))
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
  const monthlyTotal = realized.reduce((s, b) => s + toMonthly(b.realizedValue, b.frequency), 0)
  if (monthlyTotal <= 0) return null
  return investment / monthlyTotal
}

// ── Financial effective value (FINANCIAL category — planned or realized) ──────
export function computeFinancialRealized(benefits: BenefitItem[]): number {
  return benefits
    .filter((b) => b.category === "FINANCIAL")
    .reduce((s, b) => s + annualizeValue(effectiveValue(b), b.frequency), 0)
}

// ── Revenue effective value (REVENUE_INCREASE — planned or realized) ──────────
export function computeRevenueRealized(benefits: BenefitItem[]): number {
  return benefits
    .filter((b) => b.type === "REVENUE_INCREASE")
    .reduce((s, b) => s + annualizeValue(effectiveValue(b), b.frequency), 0)
}

// ── Hours saved (HOURS_SAVED — planned or realized) ───────────────────────────
export function computeHoursSaved(benefits: BenefitItem[]): number {
  return benefits
    .filter((b) => b.type === "HOURS_SAVED")
    .reduce((s, b) => s + effectiveValue(b), 0)
}

// ── Total effective value across ALL categories ────────────────────────────────
export function computeTotalEffective(benefits: BenefitItem[]): number {
  return benefits.reduce((s, b) => s + annualizeValue(effectiveValue(b), b.frequency), 0)
}

// ── Cumulative timeline — PLANNED uses createdAt, REALIZED uses realizationDate
export function buildTimelineData(
  projects: { benefits: BenefitItem[] }[],
): { month: string; cumulative: number; monthly: number }[] {
  const monthlyMap: Record<string, number> = {}

  for (const p of projects) {
    for (const b of p.benefits) {
      const isRealized = b.status === "REALIZED" || b.status === "IN_PROGRESS"
      const dateStr = isRealized ? (b.realizationDate ?? b.updatedAt) : b.createdAt
      const value   = isRealized
        ? annualizeValue(b.realizedValue, b.frequency)
        : annualizeValue(b.plannedValue,  b.frequency)
      const d   = new Date(dateStr)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      monthlyMap[key] = (monthlyMap[key] ?? 0) + value
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

// ── Full project metrics ──────────────────────────────────────────────────────
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
  const totalRealized = benefits.reduce((s, b) =>
    (b.status === "REALIZED" || b.status === "IN_PROGRESS")
      ? s + annualizeValue(b.realizedValue, b.frequency)
      : s,
    0,
  )

  const financialRealized   = computeFinancialRealized(benefits)
  const operationalRealized = benefits
    .filter((b) => b.category === "OPERATIONAL")
    .reduce((s, b) => s + annualizeValue(effectiveValue(b), b.frequency), 0)
  const strategicRealized   = benefits
    .filter((b) => b.category === "STRATEGIC")
    .reduce((s, b) => s + annualizeValue(effectiveValue(b), b.frequency), 0)

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
    roi:           computeROI(financialRealized, investment),
    paybackMonths: computePaybackMonths(investment, benefits),
    impactScore:   score,
    impactLabel:   impactLabel(score),
    benefitCount:  benefits.length,
    realizedCount: benefits.filter((b) => b.status === "REALIZED").length,
  }
}
