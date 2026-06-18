export type BenefitCategory = "FINANCIAL" | "OPERATIONAL" | "STRATEGIC"
export type BenefitType =
  | "COST_REDUCTION" | "REVENUE_INCREASE" | "OPEX_REDUCTION" | "ANNUAL_SAVINGS" | "MONTHLY_SAVINGS"
  | "HOURS_SAVED" | "PRODUCTIVITY_GAIN" | "PROCESS_AUTOMATION" | "REWORK_REDUCTION" | "TIME_REDUCTION"
  | "CUSTOMER_EXPERIENCE" | "RISK_REDUCTION" | "COMPLIANCE" | "QUALITY" | "GOVERNANCE" | "USER_SATISFACTION"
export type BenefitFrequency = "ONCE" | "MONTHLY" | "ANNUAL"
export type BenefitStatus = "PLANNED" | "IN_PROGRESS" | "REALIZED" | "NOT_REALIZED"

export interface BenefitAttachmentItem {
  id: string
  fileName: string
  fileUrl: string
  fileType: string
  fileSize: number | null
  uploadedAt: string
}

export interface BenefitMeasurementItem {
  id: string
  measuredAt: string
  measuredValue: number
  notes: string | null
  createdBy: { name: string }
}

export interface BenefitItem {
  id: string
  projectId: string
  category: BenefitCategory
  type: BenefitType
  description: string
  unit: string
  plannedValue: number
  realizedValue: number
  frequency: BenefitFrequency
  baselineDate: string | null
  realizationDate: string | null
  evidence: string | null
  status: BenefitStatus
  createdById: string
  createdAt: string
  updatedAt: string
  measurements: BenefitMeasurementItem[]
  attachments: BenefitAttachmentItem[]
  _count?: { measurements: number; attachments: number }
}

export interface ProjectBenefitMetrics {
  projectId: string
  projectTitle: string
  projectArea: string
  projectStatus: string
  investment: number
  totalPlanned: number
  totalRealized: number
  financialRealized: number
  operationalRealized: number
  strategicRealized: number
  roi: number | null
  paybackMonths: number | null
  impactScore: number
  impactLabel: string
  benefitCount: number
  realizedCount: number
}

export interface PortfolioSummary {
  totalEconomy: number
  totalRevenue: number
  totalHours: number
  averageRoi: number | null
  totalRealized: number
  totalInvestment: number
  projectCount: number
  realizedProjectCount: number
}

export interface PortfolioChartData {
  topProjects: { name: string; value: number; roi: number | null }[]
  byCategory: { name: string; value: number; color: string }[]
  timeline: { month: string; cumulative: number; monthly: number }[]
}

export interface BenefitFormData {
  category: BenefitCategory
  type: BenefitType
  description: string
  unit: string
  plannedValue: number
  realizedValue: number
  frequency: BenefitFrequency
  baselineDate: string | null
  realizationDate: string | null
  evidence: string | null
  status: BenefitStatus
}

export interface MeasurementFormData {
  measuredAt: string
  measuredValue: number
  notes: string | null
}

// ── Label maps ────────────────────────────────────────────────────────────────

export const BENEFIT_CATEGORY_LABELS: Record<BenefitCategory, string> = {
  FINANCIAL:   "Financeiro",
  OPERATIONAL: "Operacional",
  STRATEGIC:   "Estratégico",
}

export const BENEFIT_TYPE_LABELS: Record<BenefitType, string> = {
  COST_REDUCTION:      "Redução de Custos",
  REVENUE_INCREASE:    "Aumento de Receita",
  OPEX_REDUCTION:      "Redução de Despesas Operacionais",
  ANNUAL_SAVINGS:      "Economia Anual",
  MONTHLY_SAVINGS:     "Economia Mensal",
  HOURS_SAVED:         "Horas Economizadas",
  PRODUCTIVITY_GAIN:   "Ganho de Produtividade",
  PROCESS_AUTOMATION:  "Automação de Processos",
  REWORK_REDUCTION:    "Redução de Retrabalho",
  TIME_REDUCTION:      "Redução de Tempo de Execução",
  CUSTOMER_EXPERIENCE: "Melhoria da Experiência do Cliente",
  RISK_REDUCTION:      "Redução de Riscos",
  COMPLIANCE:          "Compliance",
  QUALITY:             "Qualidade",
  GOVERNANCE:          "Governança",
  USER_SATISFACTION:   "Satisfação dos Usuários",
}

export const BENEFIT_STATUS_LABELS: Record<BenefitStatus, string> = {
  PLANNED:       "Planejado",
  IN_PROGRESS:   "Em Medição",
  REALIZED:      "Realizado",
  NOT_REALIZED:  "Não Realizado",
}

export const BENEFIT_FREQUENCY_LABELS: Record<BenefitFrequency, string> = {
  ONCE:    "Único (one-time)",
  MONTHLY: "Mensal",
  ANNUAL:  "Anual",
}

export const BENEFIT_TYPE_BY_CATEGORY: Record<BenefitCategory, BenefitType[]> = {
  FINANCIAL: [
    "COST_REDUCTION", "REVENUE_INCREASE", "OPEX_REDUCTION", "ANNUAL_SAVINGS", "MONTHLY_SAVINGS",
  ],
  OPERATIONAL: [
    "HOURS_SAVED", "PRODUCTIVITY_GAIN", "PROCESS_AUTOMATION", "REWORK_REDUCTION", "TIME_REDUCTION",
  ],
  STRATEGIC: [
    "CUSTOMER_EXPERIENCE", "RISK_REDUCTION", "COMPLIANCE", "QUALITY", "GOVERNANCE", "USER_SATISFACTION",
  ],
}
