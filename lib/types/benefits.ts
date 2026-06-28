export type BenefitCategory = "FINANCIAL" | "OPERATIONAL" | "STRATEGIC" | "COMPLIANCE"

export type BenefitType =
  // Financial
  | "COST_REDUCTION" | "REVENUE_INCREASE" | "OPEX_REDUCTION" | "ANNUAL_SAVINGS" | "MONTHLY_SAVINGS"
  | "WORKING_CAPITAL" | "MARGIN_INCREASE" | "CAPEX_AVOIDANCE" | "INVENTORY_REDUCTION"
  | "FINE_REDUCTION" | "LOSS_REDUCTION"
  // Operational
  | "HOURS_SAVED" | "PRODUCTIVITY_GAIN" | "PROCESS_AUTOMATION" | "REWORK_REDUCTION" | "TIME_REDUCTION"
  | "LEAD_TIME_REDUCTION" | "MANUAL_REDUCTION" | "SPREADSHEET_ELIMINATION" | "ERROR_REDUCTION"
  | "SLA_IMPROVEMENT" | "CAPACITY_INCREASE" | "TICKET_REDUCTION" | "INCIDENT_REDUCTION"
  | "PROCESS_STANDARDIZATION"
  // Strategic
  | "CUSTOMER_EXPERIENCE" | "RISK_REDUCTION" | "QUALITY" | "GOVERNANCE" | "USER_SATISFACTION"
  | "NEW_SERVICE" | "NEW_PRODUCT" | "MARKET_EXPANSION" | "DIGITAL_TRANSFORMATION"
  | "INNOVATION" | "BRAND_IMAGE" | "COMPETITIVENESS" | "SUSTAINABILITY"
  // Compliance
  | "COMPLIANCE" | "LGPD" | "SECURITY" | "REGULATORY"
  // Other
  | "OTHER"

export type BenefitFrequency   = "ONCE" | "MONTHLY" | "ANNUAL"
export type BenefitPeriodicity = "MONTHLY" | "QUARTERLY" | "SEMIANNUAL" | "ANNUAL"
export type BenefitStatus      = "PLANNED" | "IN_PROGRESS" | "REALIZED" | "PARTIAL" | "NOT_REALIZED" | "CANCELLED"

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
  name: string
  description: string
  indicator: string | null
  formula: string | null
  unit: string
  plannedValue: number
  realizedValue: number
  frequency: BenefitFrequency
  periodicity: BenefitPeriodicity
  monitoringMonths: number
  baselineDate: string | null
  targetDate: string | null
  realizationDate: string | null
  evidence: string | null
  notes: string | null
  status: BenefitStatus
  customTypeName: string | null
  responsibleId: string | null
  responsibleName: string | null
  // Operational time fields
  timeBeforeMinutes: number | null
  timeAfterMinutes: number | null
  executionsPerMonth: number | null
  hourlyRate: number | null
  // Strategic weight
  strategicWeight: number
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
  financialPlanned: number
  financialRealized: number
  operationalRealized: number
  strategicRealized: number
  complianceRealized: number
  // ROI / Payback
  roi: number | null
  paybackMonths: number | null
  // EVM-style
  netValueGenerated: number | null
  // IVG — Índice de Valor Gerado (0–100)
  ivg: number
  ivgLabel: string
  ivgColor: string
  // Legacy
  impactScore: number
  impactLabel: string
  benefitCount: number
  realizedCount: number
  // Operational highlights
  hoursSaved: number
  economyMonthly: number
  economyAnnual: number
  // Benefit realization rate
  realizationRate: number
}

export interface PortfolioSummary {
  totalPlanned: number
  totalRealized: number
  totalEconomy: number
  totalRevenue: number
  totalHours: number
  totalInvestment: number
  netValueGenerated: number
  economyMonthly: number
  economyAnnual: number
  averageRoi: number | null
  averagePaybackMonths: number | null
  averageIvg: number | null
  projectCount: number
  realizedProjectCount: number
  belowTargetCount: number
  noMeasurementCount: number
  productivityCount: number
}

export interface PortfolioChartData {
  topProjects: { name: string; planned: number; realized: number; roi: number | null; ivg: number }[]
  byCategory: { name: string; value: number; color: string; pct: number }[]
  timeline: { month: string; planned: number; realized: number; cumPlanned: number; cumRealized: number }[]
  revenueVsEconomy: { name: string; revenue: number; economy: number }[]
}

export interface BenefitFormData {
  category: BenefitCategory
  type: BenefitType
  name: string
  description: string
  indicator: string | null
  formula: string | null
  unit: string
  plannedValue: number
  realizedValue: number
  frequency: BenefitFrequency
  periodicity: BenefitPeriodicity
  monitoringMonths: number
  baselineDate: string | null
  targetDate: string | null
  realizationDate: string | null
  evidence: string | null
  notes: string | null
  status: BenefitStatus
  customTypeName?: string | null
  responsibleId?: string | null
  timeBeforeMinutes?: number | null
  timeAfterMinutes?: number | null
  executionsPerMonth?: number | null
  hourlyRate?: number | null
  strategicWeight?: number
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
  COMPLIANCE:  "Compliance",
}

export const BENEFIT_CATEGORY_COLORS: Record<BenefitCategory, string> = {
  FINANCIAL:   "#10B981",
  OPERATIONAL: "#3B82F6",
  STRATEGIC:   "#8B5CF6",
  COMPLIANCE:  "#F59E0B",
}

export const BENEFIT_TYPE_LABELS: Record<BenefitType, string> = {
  // Financial
  COST_REDUCTION:          "Redução de Custos",
  REVENUE_INCREASE:        "Aumento de Receita",
  OPEX_REDUCTION:          "Redução de Despesas Operacionais",
  ANNUAL_SAVINGS:          "Economia Anual",
  MONTHLY_SAVINGS:         "Economia Mensal",
  WORKING_CAPITAL:         "Melhoria do Fluxo de Caixa",
  MARGIN_INCREASE:         "Aumento de Margem",
  CAPEX_AVOIDANCE:         "Redução de Investimentos Futuros",
  INVENTORY_REDUCTION:     "Redução de Estoque",
  FINE_REDUCTION:          "Redução de Multas",
  LOSS_REDUCTION:          "Redução de Perdas",
  // Operational
  HOURS_SAVED:             "Horas Economizadas",
  PRODUCTIVITY_GAIN:       "Ganho de Produtividade",
  PROCESS_AUTOMATION:      "Automação de Processos",
  REWORK_REDUCTION:        "Redução de Retrabalho",
  TIME_REDUCTION:          "Redução de Tempo de Execução",
  LEAD_TIME_REDUCTION:     "Redução do Lead Time",
  MANUAL_REDUCTION:        "Redução de Atividades Manuais",
  SPREADSHEET_ELIMINATION: "Eliminação de Planilhas",
  ERROR_REDUCTION:         "Redução de Erros",
  SLA_IMPROVEMENT:         "Melhoria de SLA",
  CAPACITY_INCREASE:       "Aumento de Capacidade Operacional",
  TICKET_REDUCTION:        "Redução de Chamados",
  INCIDENT_REDUCTION:      "Redução de Incidentes",
  PROCESS_STANDARDIZATION: "Padronização de Processos",
  // Strategic
  CUSTOMER_EXPERIENCE:     "Melhoria da Experiência do Cliente",
  RISK_REDUCTION:          "Redução de Riscos",
  QUALITY:                 "Qualidade",
  GOVERNANCE:              "Governança",
  USER_SATISFACTION:       "Satisfação dos Usuários",
  NEW_SERVICE:             "Novo Serviço",
  NEW_PRODUCT:             "Novo Produto",
  MARKET_EXPANSION:        "Expansão de Mercado",
  DIGITAL_TRANSFORMATION:  "Transformação Digital",
  INNOVATION:              "Inovação",
  BRAND_IMAGE:             "Imagem Institucional",
  COMPETITIVENESS:         "Competitividade",
  SUSTAINABILITY:          "Sustentabilidade",
  // Compliance
  COMPLIANCE:              "Compliance",
  LGPD:                    "LGPD",
  SECURITY:                "Segurança",
  REGULATORY:              "Conformidade Regulatória",
  // Other
  OTHER:                   "Outros",
}

export const BENEFIT_STATUS_LABELS: Record<BenefitStatus, string> = {
  PLANNED:       "Planejado",
  IN_PROGRESS:   "Em Medição",
  REALIZED:      "Realizado",
  PARTIAL:       "Parcial",
  NOT_REALIZED:  "Não Realizado",
  CANCELLED:     "Cancelado",
}

export const BENEFIT_STATUS_COLORS: Record<BenefitStatus, string> = {
  PLANNED:      "#64748B",
  IN_PROGRESS:  "#3B82F6",
  REALIZED:     "#10B981",
  PARTIAL:      "#F59E0B",
  NOT_REALIZED: "#EF4444",
  CANCELLED:    "#9CA3AF",
}

export const BENEFIT_FREQUENCY_LABELS: Record<BenefitFrequency, string> = {
  ONCE:    "Único (one-time)",
  MONTHLY: "Mensal",
  ANNUAL:  "Anual",
}

export const BENEFIT_PERIODICITY_LABELS: Record<BenefitPeriodicity, string> = {
  MONTHLY:    "Mensal",
  QUARTERLY:  "Trimestral",
  SEMIANNUAL: "Semestral",
  ANNUAL:     "Anual",
}

export const BENEFIT_TYPE_BY_CATEGORY: Record<BenefitCategory, BenefitType[]> = {
  FINANCIAL: [
    "COST_REDUCTION", "REVENUE_INCREASE", "OPEX_REDUCTION", "ANNUAL_SAVINGS", "MONTHLY_SAVINGS",
    "WORKING_CAPITAL", "MARGIN_INCREASE", "CAPEX_AVOIDANCE", "INVENTORY_REDUCTION",
    "FINE_REDUCTION", "LOSS_REDUCTION", "OTHER",
  ],
  OPERATIONAL: [
    "HOURS_SAVED", "PRODUCTIVITY_GAIN", "PROCESS_AUTOMATION", "REWORK_REDUCTION", "TIME_REDUCTION",
    "LEAD_TIME_REDUCTION", "MANUAL_REDUCTION", "SPREADSHEET_ELIMINATION", "ERROR_REDUCTION",
    "SLA_IMPROVEMENT", "CAPACITY_INCREASE", "TICKET_REDUCTION", "INCIDENT_REDUCTION",
    "PROCESS_STANDARDIZATION", "OTHER",
  ],
  STRATEGIC: [
    "CUSTOMER_EXPERIENCE", "RISK_REDUCTION", "QUALITY", "GOVERNANCE", "USER_SATISFACTION",
    "NEW_SERVICE", "NEW_PRODUCT", "MARKET_EXPANSION", "DIGITAL_TRANSFORMATION",
    "INNOVATION", "BRAND_IMAGE", "COMPETITIVENESS", "SUSTAINABILITY", "OTHER",
  ],
  COMPLIANCE: [
    "COMPLIANCE", "LGPD", "SECURITY", "REGULATORY", "OTHER",
  ],
}

// ── IVG — Índice de Valor Gerado ─────────────────────────────────────────────

export interface IvgBreakdown {
  roiScore: number        // 30% — ROI realizado normalizado 0–30
  financialScore: number  // 25% — Benefícios financeiros realizados / planejados × 25
  operationalScore: number // 20% — Ganhos operacionais
  strategicScore: number  // 15% — Benefícios estratégicos
  realizationScore: number // 10% — % benefícios realizados / planejados
  total: number
}

export const IVG_BANDS = [
  { min: 90, label: "Valor Excepcional", color: "#10B981", bg: "rgba(16,185,129,0.1)" },
  { min: 80, label: "Alto Valor",        color: "#3B82F6", bg: "rgba(59,130,246,0.1)" },
  { min: 70, label: "Bom Valor",         color: "#7B2FBE", bg: "rgba(123,47,190,0.1)" },
  { min: 50, label: "Valor Moderado",    color: "#F59E0B", bg: "rgba(245,158,11,0.1)" },
  { min: 0,  label: "Baixo Valor",       color: "#EF4444", bg: "rgba(239,68,68,0.1)"  },
] as const
