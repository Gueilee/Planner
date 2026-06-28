import type { BenefitItem, ProjectBenefitMetrics, IvgBreakdown, IVG_BANDS } from "@/lib/types/benefits"

// ── Annualize a benefit value for consistent comparison ───────────────────────
export function annualizeValue(value: number, frequency: string): number {
  if (frequency === "MONTHLY") return value * 12
  return value
}

// ── Monthly equivalent (for payback / economy monthly) ───────────────────────
export function toMonthly(value: number, frequency: string): number {
  if (frequency === "ANNUAL")  return value / 12
  if (frequency === "MONTHLY") return value
  return 0
}

// ── Effective value: realizedValue when active, plannedValue otherwise ────────
export function effectiveValue(b: BenefitItem): number {
  return (b.status === "REALIZED" || b.status === "IN_PROGRESS" || b.status === "PARTIAL")
    ? b.realizedValue
    : b.plannedValue
}

// ── Operational time savings in hours/year ────────────────────────────────────
export function computeTimeSavingsAnnual(b: BenefitItem): number {
  const { timeBeforeMinutes, timeAfterMinutes, executionsPerMonth } = b
  if (timeBeforeMinutes == null || timeAfterMinutes == null || executionsPerMonth == null) return 0
  const savingsMins = (timeBeforeMinutes - timeAfterMinutes) * executionsPerMonth * 12
  return Math.max(0, savingsMins / 60)
}

// ── Operational savings financial value (hours × rate) ───────────────────────
export function computeTimeSavingsValue(b: BenefitItem): number {
  const hours = computeTimeSavingsAnnual(b)
  return hours * (b.hourlyRate ?? 0)
}

// ── ROI ───────────────────────────────────────────────────────────────────────
export function computeROI(totalRealized: number, investment: number): number | null {
  if (investment <= 0) return null
  return ((totalRealized - investment) / investment) * 100
}

// ── Payback (months) ─────────────────────────────────────────────────────────
export function computePaybackMonths(investment: number, benefits: BenefitItem[]): number | null {
  if (investment <= 0) return null
  const active = benefits.filter((b) => b.status === "REALIZED" || b.status === "IN_PROGRESS" || b.status === "PARTIAL")
  const monthlyTotal = active.reduce((s, b) => s + toMonthly(b.realizedValue, b.frequency), 0)
  if (monthlyTotal <= 0) return null
  return investment / monthlyTotal
}

// ── Financial sum ─────────────────────────────────────────────────────────────
export function computeFinancialRealized(benefits: BenefitItem[]): number {
  return benefits
    .filter((b) => b.category === "FINANCIAL")
    .reduce((s, b) => s + annualizeValue(effectiveValue(b), b.frequency), 0)
}

export function computeFinancialPlanned(benefits: BenefitItem[]): number {
  return benefits
    .filter((b) => b.category === "FINANCIAL")
    .reduce((s, b) => s + annualizeValue(b.plannedValue, b.frequency), 0)
}

// ── Revenue ───────────────────────────────────────────────────────────────────
export function computeRevenueRealized(benefits: BenefitItem[]): number {
  return benefits
    .filter((b) => b.type === "REVENUE_INCREASE" || b.type === "MARGIN_INCREASE")
    .reduce((s, b) => s + annualizeValue(effectiveValue(b), b.frequency), 0)
}

// ── Hours saved ───────────────────────────────────────────────────────────────
export function computeHoursSaved(benefits: BenefitItem[]): number {
  return benefits
    .filter((b) => b.type === "HOURS_SAVED")
    .reduce((s, b) => s + effectiveValue(b), 0)
  + benefits.reduce((s, b) => s + computeTimeSavingsAnnual(b), 0)
}

// ── Total effective value across ALL categories ───────────────────────────────
export function computeTotalEffective(benefits: BenefitItem[]): number {
  return benefits.reduce((s, b) => s + annualizeValue(effectiveValue(b), b.frequency), 0)
}

export function computeTotalPlanned(benefits: BenefitItem[]): number {
  return benefits.reduce((s, b) => s + annualizeValue(b.plannedValue, b.frequency), 0)
}

// ── Economy monthly / annual ──────────────────────────────────────────────────
export function computeEconomyMonthly(benefits: BenefitItem[]): number {
  return benefits
    .filter((b) => b.status === "REALIZED" || b.status === "IN_PROGRESS" || b.status === "PARTIAL")
    .reduce((s, b) => s + toMonthly(b.realizedValue, b.frequency), 0)
}

// ── IVG — Índice de Valor Gerado (0–100) ──────────────────────────────────────
//
// Composição:
//   ROI realizado           → 30 pts  (ROI ≥ 100% = max; linear até 30)
//   Benefícios financeiros  → 25 pts  (realized / planned, capped)
//   Ganhos operacionais     → 20 pts  (operational hours + process benefits)
//   Benefícios estratégicos → 15 pts  (strategic + compliance weighted)
//   Taxa de realização      → 10 pts  (count realized / count total)
//
export function computeIvg(
  benefits: BenefitItem[],
  investment: number,
): { ivg: number; breakdown: IvgBreakdown } {
  if (benefits.length === 0) return { ivg: 0, breakdown: { roiScore: 0, financialScore: 0, operationalScore: 0, strategicScore: 0, realizationScore: 0, total: 0 } }

  // 1. ROI (30 pts) — ROI de 0→100% maps 0→30; above 100% = max 30
  const financialRealized = computeFinancialRealized(benefits)
  const roi               = investment > 0 ? ((financialRealized - investment) / investment) * 100 : null
  const roiScore          = roi == null ? 0 : Math.min(30, Math.max(0, (roi / 100) * 30))

  // 2. Financial (25 pts) — realized / planned ratio (only financial category)
  const financialPlanned  = computeFinancialPlanned(benefits)
  const finRatio          = financialPlanned > 0 ? Math.min(1, financialRealized / financialPlanned) : 0
  const financialScore    = finRatio * 25

  // 3. Operational (20 pts) — count of operational benefits that are active + hours
  const opBenefits  = benefits.filter((b) => b.category === "OPERATIONAL")
  const opActive    = opBenefits.filter((b) => b.status === "REALIZED" || b.status === "IN_PROGRESS" || b.status === "PARTIAL").length
  const opTotal     = Math.max(1, opBenefits.length)
  const hoursTotal  = computeHoursSaved(benefits)
  const opRatio     = opTotal > 0 ? opActive / opTotal : 0
  const hourBonus   = Math.min(1, hoursTotal / 1000) // 1000h = max bonus
  const operationalScore = Math.min(20, (opRatio * 15) + (hourBonus * 5))

  // 4. Strategic + Compliance (15 pts) — weighted by strategicWeight if set, else count
  const stBenefits  = benefits.filter((b) => b.category === "STRATEGIC" || b.category === "COMPLIANCE")
  const stActive    = stBenefits.filter((b) => b.status === "REALIZED" || b.status === "IN_PROGRESS" || b.status === "PARTIAL")
  const hasWeights  = stBenefits.some((b) => b.strategicWeight > 0)
  let strategicScore: number
  if (hasWeights) {
    const totalWeight   = stBenefits.reduce((s, b) => s + b.strategicWeight, 0) || 1
    const realizedWeight = stActive.reduce((s, b) => s + b.strategicWeight, 0)
    strategicScore = Math.min(15, (realizedWeight / totalWeight) * 15)
  } else {
    const stRatio = stBenefits.length > 0 ? stActive.length / stBenefits.length : 0
    strategicScore = stRatio * 15
  }

  // 5. Realization rate (10 pts)
  const totalCount    = benefits.length
  const realizedCount = benefits.filter((b) => b.status === "REALIZED").length
  const realizationScore = totalCount > 0 ? (realizedCount / totalCount) * 10 : 0

  const total = Math.round(Math.min(100,
    roiScore + financialScore + operationalScore + strategicScore + realizationScore
  ))

  return {
    ivg: total,
    breakdown: {
      roiScore:          Math.round(roiScore),
      financialScore:    Math.round(financialScore),
      operationalScore:  Math.round(operationalScore),
      strategicScore:    Math.round(strategicScore),
      realizationScore:  Math.round(realizationScore),
      total,
    },
  }
}

export function ivgLabel(score: number): string {
  if (score >= 90) return "Valor Excepcional"
  if (score >= 80) return "Alto Valor"
  if (score >= 70) return "Bom Valor"
  if (score >= 50) return "Valor Moderado"
  return "Baixo Valor"
}

export function ivgColor(score: number): string {
  if (score >= 90) return "#10B981"
  if (score >= 80) return "#3B82F6"
  if (score >= 70) return "#7B2FBE"
  if (score >= 50) return "#F59E0B"
  return "#EF4444"
}

// ── Legacy impact score ────────────────────────────────────────────────────────
export function computeStrategicScore(
  benefits: BenefitItem[],
  portfolioMaxFinancial: number,
  portfolioMaxRevenue: number,
): number {
  if (benefits.length === 0) return 0
  const countScore      = Math.min(25, benefits.length * 5)
  const uniqueCategories = new Set(benefits.map((b) => b.category)).size
  const diversityScore  = Math.round((uniqueCategories / 4) * 25)
  const portfolioFinMax = Math.max(portfolioMaxFinancial, portfolioMaxRevenue, 1)
  const financialTotal  = benefits.filter((b) => b.category === "FINANCIAL")
    .reduce((s, b) => s + annualizeValue(effectiveValue(b), b.frequency), 0)
  const financialScore  = Math.min(25, (financialTotal / portfolioFinMax) * 25)
  const nonFinCount     = benefits.filter((b) => b.category !== "FINANCIAL").length
  const opStratScore    = Math.min(25, nonFinCount * 8)
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

// ── Timeline data ─────────────────────────────────────────────────────────────
export function buildTimelineData(
  projects: { benefits: BenefitItem[] }[],
): { month: string; planned: number; realized: number; cumPlanned: number; cumRealized: number }[] {
  const plannedMap:  Record<string, number> = {}
  const realizedMap: Record<string, number> = {}

  for (const p of projects) {
    for (const b of p.benefits) {
      const dateStr  = b.realizationDate ?? b.targetDate ?? b.createdAt
      const d        = new Date(dateStr)
      const key      = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      plannedMap[key]  = (plannedMap[key]  ?? 0) + annualizeValue(b.plannedValue, b.frequency)
      const isActive   = b.status === "REALIZED" || b.status === "IN_PROGRESS" || b.status === "PARTIAL"
      if (isActive) {
        realizedMap[key] = (realizedMap[key] ?? 0) + annualizeValue(b.realizedValue, b.frequency)
      }
    }
  }

  const allKeys = [...new Set([...Object.keys(plannedMap), ...Object.keys(realizedMap)])].sort()
  let cumPlanned = 0, cumRealized = 0
  return allKeys.map((key) => {
    const planned  = plannedMap[key]  ?? 0
    const realized = realizedMap[key] ?? 0
    cumPlanned  += planned
    cumRealized += realized
    const [year, m] = key.split("-")
    const label = new Date(Number(year), Number(m) - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" })
    return { month: label, planned, realized, cumPlanned, cumRealized }
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

  const totalPlanned       = computeTotalPlanned(benefits)
  const totalRealized      = benefits.filter((b) => b.status === "REALIZED" || b.status === "IN_PROGRESS" || b.status === "PARTIAL")
    .reduce((s, b) => s + annualizeValue(b.realizedValue, b.frequency), 0)
  const financialPlanned   = computeFinancialPlanned(benefits)
  const financialRealized  = computeFinancialRealized(benefits)
  const operationalRealized = benefits.filter((b) => b.category === "OPERATIONAL")
    .reduce((s, b) => s + annualizeValue(effectiveValue(b), b.frequency), 0)
  const strategicRealized  = benefits.filter((b) => b.category === "STRATEGIC")
    .reduce((s, b) => s + annualizeValue(effectiveValue(b), b.frequency), 0)
  const complianceRealized = benefits.filter((b) => b.category === "COMPLIANCE")
    .reduce((s, b) => s + annualizeValue(effectiveValue(b), b.frequency), 0)

  const roi           = computeROI(financialRealized, investment)
  const paybackMonths = computePaybackMonths(investment, benefits)
  const hoursSaved    = computeHoursSaved(benefits)
  const economyMonthly = computeEconomyMonthly(benefits)
  const economyAnnual  = economyMonthly * 12

  const { ivg } = computeIvg(benefits, investment)

  const score         = computeStrategicScore(benefits, portfolioMaxFinancial, portfolioMaxRevenue)
  const realizedCount = benefits.filter((b) => b.status === "REALIZED").length
  const realizationRate = benefits.length > 0 ? Math.round((realizedCount / benefits.length) * 100) : 0

  return {
    projectId:           project.id,
    projectTitle:        project.title,
    projectArea:         project.projectArea,
    projectStatus:       project.status,
    investment,
    totalPlanned,
    totalRealized,
    financialPlanned,
    financialRealized,
    operationalRealized,
    strategicRealized,
    complianceRealized,
    roi,
    paybackMonths,
    netValueGenerated:   investment > 0 ? financialRealized - investment : null,
    ivg,
    ivgLabel:            ivgLabel(ivg),
    ivgColor:            ivgColor(ivg),
    impactScore:         score,
    impactLabel:         impactLabel(score),
    benefitCount:        benefits.length,
    realizedCount,
    realizationRate,
    hoursSaved,
    economyMonthly,
    economyAnnual,
  }
}
