"use client"

import { useState, useTransition, useEffect, useCallback } from "react"
import {
  Pencil, X, Save, Loader2, Calendar, DollarSign, FileText,
  Info, Users, AlertTriangle, Plus, Trash2, ChevronDown, Gem, ChevronUp, UserPlus,
} from "lucide-react"
import {
  updateProjectDetails, addProjectMember, removeProjectMember,
  createRisk, updateRisk, deleteRisk,
} from "@/lib/actions/projects"
import { createBenefit, updateBenefit, deleteBenefit } from "@/lib/actions/benefits"

// ── Types ──────────────────────────────────────────────────────────────────

type Member = { userId: string; role: string; user: { id: string; name: string; department: string | null; role: string } }
type AvailUser = { id: string; name: string; department: string | null; role: string }
type RiskItem = { id: string; description: string; level: string; mitigation: string | null }
type BenefitRow = {
  id: string
  category: "FINANCIAL" | "OPERATIONAL" | "STRATEGIC" | "COMPLIANCE"
  type: string
  name: string
  description: string
  unit: string
  plannedValue: number
  realizedValue: number
  frequency: "ONCE" | "MONTHLY" | "ANNUAL"
  periodicity: "MONTHLY" | "QUARTERLY" | "SEMIANNUAL" | "ANNUAL"
  monitoringMonths: number
  status: "PLANNED" | "IN_PROGRESS" | "REALIZED" | "PARTIAL" | "NOT_REALIZED" | "CANCELLED"
  customTypeName: string | null
  indicator: string | null
  notes: string | null
  responsibleId: string | null
  responsibleName: string | null
  targetDate: string | null
}

// ── Benefits constants ──────────────────────────────────────────────────────

const BEN_CATEGORIES = [
  { value: "FINANCIAL",   label: "Financeiro",  color: "#059669", bg: "#ECFDF5", icon: "💰" },
  { value: "OPERATIONAL", label: "Operacional", color: "#2563EB", bg: "#EFF6FF", icon: "⚙️"  },
  { value: "STRATEGIC",   label: "Estratégico", color: "#7B2FBE", bg: "#F5F3FF", icon: "🎯" },
  { value: "COMPLIANCE",  label: "Compliance",  color: "#D97706", bg: "#FFFBEB", icon: "🛡️" },
] as const

type BenValueType = "currency" | "hours" | "percent" | "count" | "score"
const BEN_META: Record<string, { label: string; unit: string; valueType: BenValueType; suffix: string; showFrequency: boolean; maxVal: number }> = {
  // Financial
  COST_REDUCTION:          { label: "Redução de Custos",             unit: "R$",       valueType: "currency", suffix: "R$",        showFrequency: true,  maxVal: 999_999_999 },
  REVENUE_INCREASE:        { label: "Aumento de Receita",            unit: "R$",       valueType: "currency", suffix: "R$",        showFrequency: true,  maxVal: 999_999_999 },
  OPEX_REDUCTION:          { label: "Redução de OPEX",               unit: "R$",       valueType: "currency", suffix: "R$",        showFrequency: true,  maxVal: 999_999_999 },
  ANNUAL_SAVINGS:          { label: "Economia Anual",                unit: "R$",       valueType: "currency", suffix: "R$/ano",    showFrequency: false, maxVal: 999_999_999 },
  MONTHLY_SAVINGS:         { label: "Economia Mensal",               unit: "R$",       valueType: "currency", suffix: "R$/mês",    showFrequency: false, maxVal: 999_999_999 },
  WORKING_CAPITAL:         { label: "Melhoria do Fluxo de Caixa",    unit: "R$",       valueType: "currency", suffix: "R$",        showFrequency: true,  maxVal: 999_999_999 },
  MARGIN_INCREASE:         { label: "Aumento de Margem",             unit: "R$",       valueType: "currency", suffix: "R$",        showFrequency: true,  maxVal: 999_999_999 },
  CAPEX_AVOIDANCE:         { label: "Redução de Investimentos",      unit: "R$",       valueType: "currency", suffix: "R$",        showFrequency: false, maxVal: 999_999_999 },
  INVENTORY_REDUCTION:     { label: "Redução de Estoque",            unit: "R$",       valueType: "currency", suffix: "R$",        showFrequency: false, maxVal: 999_999_999 },
  FINE_REDUCTION:          { label: "Redução de Multas",             unit: "R$",       valueType: "currency", suffix: "R$/ano",    showFrequency: false, maxVal: 999_999_999 },
  LOSS_REDUCTION:          { label: "Redução de Perdas",             unit: "R$",       valueType: "currency", suffix: "R$/ano",    showFrequency: false, maxVal: 999_999_999 },
  // Operational
  HOURS_SAVED:             { label: "Horas Economizadas",            unit: "horas",    valueType: "hours",    suffix: "h/ano",     showFrequency: false, maxVal: 99_999 },
  PRODUCTIVITY_GAIN:       { label: "Ganho de Produtividade",        unit: "%",        valueType: "percent",  suffix: "%",         showFrequency: false, maxVal: 100 },
  PROCESS_AUTOMATION:      { label: "Automação de Processos",        unit: "processos",valueType: "count",    suffix: "processos", showFrequency: false, maxVal: 9_999 },
  REWORK_REDUCTION:        { label: "Redução de Retrabalho",         unit: "%",        valueType: "percent",  suffix: "%",         showFrequency: false, maxVal: 100 },
  TIME_REDUCTION:          { label: "Redução de Tempo de Execução",  unit: "min",      valueType: "count",    suffix: "min",       showFrequency: false, maxVal: 99_999 },
  LEAD_TIME_REDUCTION:     { label: "Redução do Lead Time",          unit: "dias",     valueType: "count",    suffix: "dias",      showFrequency: false, maxVal: 9_999 },
  MANUAL_REDUCTION:        { label: "Redução de Atividades Manuais", unit: "%",        valueType: "percent",  suffix: "%",         showFrequency: false, maxVal: 100 },
  SPREADSHEET_ELIMINATION: { label: "Eliminação de Planilhas",       unit: "planilhas",valueType: "count",    suffix: "planilhas", showFrequency: false, maxVal: 9_999 },
  ERROR_REDUCTION:         { label: "Redução de Erros",              unit: "%",        valueType: "percent",  suffix: "%",         showFrequency: false, maxVal: 100 },
  SLA_IMPROVEMENT:         { label: "Melhoria de SLA",               unit: "%",        valueType: "percent",  suffix: "%",         showFrequency: false, maxVal: 100 },
  CAPACITY_INCREASE:       { label: "Aumento de Capacidade",         unit: "%",        valueType: "percent",  suffix: "%",         showFrequency: false, maxVal: 100 },
  TICKET_REDUCTION:        { label: "Redução de Chamados",           unit: "%",        valueType: "percent",  suffix: "%",         showFrequency: false, maxVal: 100 },
  INCIDENT_REDUCTION:      { label: "Redução de Incidentes",         unit: "%",        valueType: "percent",  suffix: "%",         showFrequency: false, maxVal: 100 },
  PROCESS_STANDARDIZATION: { label: "Padronização de Processos",     unit: "processos",valueType: "count",    suffix: "processos", showFrequency: false, maxVal: 9_999 },
  // Strategic
  CUSTOMER_EXPERIENCE:     { label: "Experiência do Cliente",        unit: "pontos",   valueType: "score",    suffix: "pts",       showFrequency: false, maxVal: 100 },
  RISK_REDUCTION:          { label: "Redução de Riscos",             unit: "%",        valueType: "percent",  suffix: "%",         showFrequency: false, maxVal: 100 },
  QUALITY:                 { label: "Qualidade",                     unit: "%",        valueType: "percent",  suffix: "%",         showFrequency: false, maxVal: 100 },
  GOVERNANCE:              { label: "Governança",                    unit: "pontos",   valueType: "score",    suffix: "pts",       showFrequency: false, maxVal: 100 },
  USER_SATISFACTION:       { label: "Satisfação dos Usuários",       unit: "%",        valueType: "percent",  suffix: "%",         showFrequency: false, maxVal: 100 },
  NEW_SERVICE:             { label: "Novo Serviço",                  unit: "pontos",   valueType: "score",    suffix: "pts",       showFrequency: false, maxVal: 100 },
  NEW_PRODUCT:             { label: "Novo Produto",                  unit: "pontos",   valueType: "score",    suffix: "pts",       showFrequency: false, maxVal: 100 },
  MARKET_EXPANSION:        { label: "Expansão de Mercado",           unit: "pontos",   valueType: "score",    suffix: "pts",       showFrequency: false, maxVal: 100 },
  DIGITAL_TRANSFORMATION:  { label: "Transformação Digital",         unit: "pontos",   valueType: "score",    suffix: "pts",       showFrequency: false, maxVal: 100 },
  INNOVATION:              { label: "Inovação",                      unit: "pontos",   valueType: "score",    suffix: "pts",       showFrequency: false, maxVal: 100 },
  BRAND_IMAGE:             { label: "Imagem Institucional",          unit: "pontos",   valueType: "score",    suffix: "pts",       showFrequency: false, maxVal: 100 },
  COMPETITIVENESS:         { label: "Competitividade",               unit: "pontos",   valueType: "score",    suffix: "pts",       showFrequency: false, maxVal: 100 },
  SUSTAINABILITY:          { label: "Sustentabilidade",              unit: "pontos",   valueType: "score",    suffix: "pts",       showFrequency: false, maxVal: 100 },
  // Compliance
  COMPLIANCE:              { label: "Compliance",                    unit: "%",        valueType: "percent",  suffix: "%",         showFrequency: false, maxVal: 100 },
  LGPD:                    { label: "LGPD",                          unit: "%",        valueType: "percent",  suffix: "%",         showFrequency: false, maxVal: 100 },
  SECURITY:                { label: "Segurança",                     unit: "%",        valueType: "percent",  suffix: "%",         showFrequency: false, maxVal: 100 },
  REGULATORY:              { label: "Conformidade Regulatória",      unit: "%",        valueType: "percent",  suffix: "%",         showFrequency: false, maxVal: 100 },
  // Other
  OTHER:                   { label: "Outros",                        unit: "R$",       valueType: "currency", suffix: "R$",        showFrequency: true,  maxVal: 999_999_999 },
}

const BEN_TYPES_BY_CAT: Record<string, string[]> = {
  FINANCIAL:   ["COST_REDUCTION","REVENUE_INCREASE","OPEX_REDUCTION","ANNUAL_SAVINGS","MONTHLY_SAVINGS","WORKING_CAPITAL","MARGIN_INCREASE","CAPEX_AVOIDANCE","INVENTORY_REDUCTION","FINE_REDUCTION","LOSS_REDUCTION","OTHER"],
  OPERATIONAL: ["HOURS_SAVED","PRODUCTIVITY_GAIN","PROCESS_AUTOMATION","REWORK_REDUCTION","TIME_REDUCTION","LEAD_TIME_REDUCTION","MANUAL_REDUCTION","SPREADSHEET_ELIMINATION","ERROR_REDUCTION","SLA_IMPROVEMENT","CAPACITY_INCREASE","TICKET_REDUCTION","INCIDENT_REDUCTION","PROCESS_STANDARDIZATION","OTHER"],
  STRATEGIC:   ["CUSTOMER_EXPERIENCE","RISK_REDUCTION","QUALITY","GOVERNANCE","USER_SATISFACTION","NEW_SERVICE","NEW_PRODUCT","MARKET_EXPANSION","DIGITAL_TRANSFORMATION","INNOVATION","BRAND_IMAGE","COMPETITIVENESS","SUSTAINABILITY","OTHER"],
  COMPLIANCE:  ["COMPLIANCE","LGPD","SECURITY","REGULATORY","OTHER"],
}

const BEN_STATUSES = [
  { value: "PLANNED",      label: "Planejado",     color: "#64748B", bg: "#F1F5F9" },
  { value: "IN_PROGRESS",  label: "Em Medição",    color: "#2563EB", bg: "#EFF6FF" },
  { value: "REALIZED",     label: "Realizado",     color: "#059669", bg: "#ECFDF5" },
  { value: "PARTIAL",      label: "Parcial",       color: "#D97706", bg: "#FFFBEB" },
  { value: "NOT_REALIZED", label: "Não Realizado", color: "#DC2626", bg: "#FEF2F2" },
  { value: "CANCELLED",    label: "Cancelado",     color: "#9CA3AF", bg: "#F9FAFB" },
]

const BEN_FREQS = [
  { value: "MONTHLY", label: "Mensal" },
  { value: "ANNUAL",  label: "Anual"  },
  { value: "ONCE",    label: "Pontual" },
] as const

const BEN_PERIODICITIES = [
  { value: "MONTHLY",    label: "Mensal"    },
  { value: "QUARTERLY",  label: "Trimestral" },
  { value: "SEMIANNUAL", label: "Semestral" },
  { value: "ANNUAL",     label: "Anual"     },
] as const

const MONITORING_OPTIONS = [
  { value: 3,  label: "3 meses"  },
  { value: 6,  label: "6 meses"  },
  { value: 12, label: "12 meses" },
  { value: 24, label: "24 meses" },
  { value: 36, label: "36 meses" },
] as const

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
}
function parseBRLEdit(v: string) {
  const n = parseFloat(v.replace(/[R$\s.]/g, "").replace(",", "."))
  return isNaN(n) ? 0 : n
}
function fmtBRLInput(raw: string) {
  const d = raw.replace(/\D/g, "")
  if (!d) return ""
  return (parseInt(d, 10) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}
function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

const PROJECT_AREAS = [
  { value: "TECNOLOGIA",  label: "Tecnologia",            desc: "Sistemas, TI e projetos digitais", color: "#0891B2", icon: "💻" },
  { value: "QUALIDADE",   label: "Qualidade",             desc: "Melhoria contínua e certificações", color: "#059669", icon: "✅" },
  { value: "ESTRATEGICO", label: "Projetos Estratégicos", desc: "Iniciativas de alto impacto",       color: "#7B2FBE", icon: "🎯" },
]

type Props = {
  project: {
    id: string
    title: string
    description: string | null
    scope: string | null
    assumptions: string | null
    restrictions: string | null
    origin: string | null
    projectArea: string
    proposalNumber: string | null
    contractNumber: string | null
    budget: number | null
    estimatedCosts: number | null
    economy: number | null
    expectedStart: Date | null
    expectedEnd: Date | null
    actualStart: Date | null
    actualEnd: Date | null
    goLiveDate: Date | null
  }
  members: Member[]
  allUsers: AvailUser[]
  risks: RiskItem[]
  benefits: BenefitRow[]
}

// ── Helpers ────────────────────────────────────────────────────────────────

function toInputDate(d: Date | null): string {
  if (!d) return ""
  return new Date(d).toISOString().split("T")[0]
}

const ORIGIN_LABELS: Record<string, string> = {
  INTERNAL: "Interna",
  CLIENT:   "Cliente",
  SPONSOR:  "Sponsor / Diretoria",
}

const RISK_LEVELS = [
  { value: "LOW",      label: "Baixo",    color: "#10B981", bg: "#F0FDF4", border: "#BBF7D0" },
  { value: "MEDIUM",   label: "Médio",    color: "#F59E0B", bg: "#FFFBEB", border: "#FDE68A" },
  { value: "HIGH",     label: "Alto",     color: "#EF4444", bg: "#FEF2F2", border: "#FECACA" },
  { value: "CRITICAL", label: "Crítico",  color: "#7C3AED", bg: "#F5F3FF", border: "#DDD6FE" },
]

function riskCfg(level: string) {
  return RISK_LEVELS.find(r => r.value === level) ?? RISK_LEVELS[1]
}

const SECTIONS = [
  { id: "info",         label: "Informações",  icon: Info },
  { id: "dates",        label: "Datas",        icon: Calendar },
  { id: "financial",    label: "Financeiro",   icon: DollarSign },
  { id: "scope",        label: "Escopo",       icon: FileText },
  { id: "team",         label: "Equipe",       icon: Users },
  { id: "risks",        label: "Riscos",       icon: AlertTriangle },
  { id: "benefits",     label: "Benefícios",   icon: Gem },
]

// ── BenefitsSection ─────────────────────────────────────────────────────────

type EditState = {
  description: string; plannedValue: string; realizedValue: string
  status: string; frequency: string; indicator: string
  responsibleId: string; targetDate: string; notes: string; periodicity: string
}

type NewBenefit = {
  category: BenefitRow["category"]
  types: string[]
  name: string
  description: string
  indicator: string
  plannedValue: string
  frequency: BenefitRow["frequency"]
  customTypeName: string
  responsibleId: string
  targetDate: string
  periodicity: BenefitRow["periodicity"]
  monitoringMonths: number
}

const EMPTY_NEW: NewBenefit = {
  category: "FINANCIAL", types: ["COST_REDUCTION"],
  name: "", description: "", indicator: "", plannedValue: "",
  frequency: "MONTHLY", customTypeName: "",
  responsibleId: "", targetDate: "",
  periodicity: "MONTHLY", monitoringMonths: 12,
}

function BenefitsSection({ projectId, initialBenefits, allUsers }: { projectId: string; initialBenefits: BenefitRow[]; allUsers: { id: string; name: string }[] }) {
  const [benefits, setBenefits] = useState<BenefitRow[]>(initialBenefits)
  const [expanded, setExpanded]   = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Record<string, EditState>>({})
  const [adding, setAdding]       = useState(false)
  const [newBen, setNewBen]       = useState<NewBenefit>({ ...EMPTY_NEW })
  const [isPending, startTransition] = useTransition()
  const [savingId, setSavingId]   = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const inpCls = "w-full h-9 px-3 text-xs rounded-lg border border-slate-200 bg-white text-slate-800 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all"

  function toggleExpand(id: string, b: BenefitRow) {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    const meta = BEN_META[b.type]
    setEditValues(ev => ({
      ...ev,
      [id]: {
        description:   b.description,
        plannedValue:  meta?.valueType === "currency" ? fmtBRL(b.plannedValue) : String(b.plannedValue),
        realizedValue: meta?.valueType === "currency" ? fmtBRL(b.realizedValue) : String(b.realizedValue),
        status:        b.status,
        frequency:     b.frequency,
        indicator:     b.indicator ?? "",
        responsibleId: b.responsibleId ?? "",
        targetDate:    b.targetDate ? b.targetDate.split("T")[0] : "",
        notes:         b.notes ?? "",
        periodicity:   b.periodicity ?? "MONTHLY",
      },
    }))
  }

  function handleSave(b: BenefitRow) {
    const ev = editValues[b.id]
    if (!ev) return
    setSavingId(b.id)
    const meta    = BEN_META[b.type]
    const planned  = meta?.valueType === "currency" ? parseBRLEdit(ev.plannedValue) : clamp(parseFloat(ev.plannedValue) || 0, 0, meta?.maxVal ?? 99999)
    const realized = meta?.valueType === "currency" ? parseBRLEdit(ev.realizedValue) : clamp(parseFloat(ev.realizedValue) || 0, 0, meta?.maxVal ?? 99999)
    startTransition(async () => {
      try {
        await updateBenefit(b.id, {
          description:   ev.description,
          plannedValue:  planned,
          realizedValue: realized,
          status:        ev.status as never,
          frequency:     ev.frequency as never,
          unit:          meta?.unit ?? b.unit,
          indicator:     ev.indicator || null,
          responsibleId: ev.responsibleId || null,
          targetDate:    ev.targetDate || null,
          notes:         ev.notes || null,
          periodicity:   ev.periodicity as never,
        })
        setBenefits(prev => prev.map(x => x.id === b.id
          ? {
              ...x, description: ev.description, plannedValue: planned, realizedValue: realized,
              status: ev.status as BenefitRow["status"], frequency: ev.frequency as BenefitRow["frequency"],
              indicator: ev.indicator || null, responsibleId: ev.responsibleId || null,
              responsibleName: allUsers.find(u => u.id === ev.responsibleId)?.name ?? null,
              targetDate: ev.targetDate || null, notes: ev.notes || null,
              periodicity: ev.periodicity as BenefitRow["periodicity"],
            }
          : x
        ))
        setExpanded(null)
      } catch (err) { console.error(err) } finally { setSavingId(null) }
    })
  }

  function handleDelete(id: string) {
    setDeletingId(id)
    startTransition(async () => {
      try {
        await deleteBenefit(id)
        setBenefits(prev => prev.filter(b => b.id !== id))
        if (expanded === id) setExpanded(null)
      } catch (err) { console.error(err) } finally { setDeletingId(null) }
    })
  }

  function handleAdd() {
    const t0   = newBen.types[0]
    const meta = BEN_META[t0]
    const val  = meta?.valueType === "currency" ? parseBRLEdit(newBen.plannedValue) : clamp(parseFloat(newBen.plannedValue) || 0, 0, meta?.maxVal ?? 99999)
    const snap = { ...newBen }
    startTransition(async () => {
      try {
        await Promise.all(snap.types.map(t =>
          createBenefit(projectId, {
            category:        snap.category as never,
            type:            t as never,
            name:            snap.name,
            description:     snap.description,
            indicator:       snap.indicator || null,
            formula:         null,
            unit:            BEN_META[t]?.unit ?? "R$",
            plannedValue:    val,
            realizedValue:   0,
            frequency:       snap.frequency as never,
            periodicity:     snap.periodicity as never,
            monitoringMonths: snap.monitoringMonths,
            status:          "PLANNED" as never,
            baselineDate:    null,
            targetDate:      snap.targetDate || null,
            realizationDate: null,
            evidence:        null,
            notes:           null,
            customTypeName:  t === "OTHER" ? (snap.customTypeName || null) : null,
            responsibleId:   snap.responsibleId || null,
          })
        ))
        setAdding(false)
        setNewBen({ ...EMPTY_NEW })
        const ts = Date.now()
        setBenefits(prev => [
          ...prev,
          ...snap.types.map((t, i) => ({
            id: `new-${ts}-${i}`,
            category:        snap.category,
            type:            t,
            name:            snap.name,
            description:     snap.description,
            unit:            BEN_META[t]?.unit ?? "R$",
            plannedValue:    val,
            realizedValue:   0,
            frequency:       snap.frequency,
            periodicity:     snap.periodicity,
            monitoringMonths: snap.monitoringMonths,
            status:          "PLANNED" as const,
            customTypeName:  t === "OTHER" ? (snap.customTypeName || null) : null,
            indicator:       snap.indicator || null,
            notes:           null,
            responsibleId:   snap.responsibleId || null,
            responsibleName: allUsers.find(u => u.id === snap.responsibleId)?.name ?? null,
            targetDate:      snap.targetDate || null,
          })),
        ])
      } catch (err) { console.error(err) }
    })
  }

  // ── Render helpers ──────────────────────────────────────────────────────────

  function ValueInput({ valueType, maxVal, value, suffix, catColor, onChange }: {
    valueType: BenValueType; maxVal: number; value: string; suffix: string; catColor: string; onChange: (v: string) => void
  }) {
    if (valueType === "currency") {
      return (
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-emerald-600">R$</span>
          <input className={`${inpCls} pl-7`} placeholder="0,00" value={value}
            onChange={e => { const raw = e.target.value.replace(/\D/g, ""); onChange(raw ? fmtBRLInput(raw) : "") }} />
        </div>
      )
    }
    const step = (valueType === "percent" || valueType === "score") ? "0.1" : "1"
    return (
      <div className="relative">
        <input type="number" min={0} max={maxVal} step={step} className={`${inpCls} pr-12`}
          placeholder="0" value={value}
          onBlur={e => {
            const n = parseFloat(e.target.value) || 0
            onChange(String(Math.min(maxVal, Math.max(0, n))))
          }}
          onChange={e => onChange(e.target.value)} />
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] font-black px-1 py-0.5 rounded"
          style={{ background: `${catColor}18`, color: catColor }}>
          {suffix}
        </span>
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      {/* Summary header */}
      {benefits.length > 0 && (
        <div className="flex items-center justify-between px-3 py-2 rounded-xl"
          style={{ background: "linear-gradient(135deg, #F8F4FF, #F0F4FF)", border: "1px solid rgba(123,47,190,0.12)" }}>
          <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600">
            {benefits.length} Benefício{benefits.length !== 1 ? "s" : ""} registrado{benefits.length !== 1 ? "s" : ""}
          </span>
          <div className="flex gap-3 text-[10px] font-semibold text-slate-500">
            <span className="text-emerald-600">{benefits.filter(b => b.status === "REALIZED").length} realizados</span>
            <span>{benefits.filter(b => b.status === "IN_PROGRESS").length} em medição</span>
          </div>
        </div>
      )}

      {benefits.length === 0 && !adding && (
        <div className="py-8 rounded-xl text-center" style={{ border: "1px dashed #CBD5E1", background: "#F8FAFC" }}>
          <Gem className="w-6 h-6 mx-auto mb-2 text-slate-300" />
          <p className="text-xs font-semibold text-slate-400">Nenhum benefício registrado</p>
          <p className="text-[10px] text-slate-300 mt-0.5">Adicione benefícios financeiros, operacionais e estratégicos</p>
        </div>
      )}

      {/* Existing benefit cards */}
      {benefits.map(b => {
        const meta  = BEN_META[b.type]
        const cat   = BEN_CATEGORIES.find(c => c.value === b.category) ?? BEN_CATEGORIES[0]
        const stCfg = BEN_STATUSES.find(s => s.value === b.status) ?? BEN_STATUSES[0]
        const isExp = expanded === b.id
        const ev    = editValues[b.id]

        return (
          <div key={b.id} className="rounded-xl border overflow-hidden transition-all"
            style={{ borderColor: isExp ? `${cat.color}40` : `${cat.color}20` }}>
            {/* Card header */}
            <div className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors"
              style={{ background: isExp ? cat.bg : "#fff" }}
              onClick={() => toggleExpand(b.id, b)}>
              <span className="text-base shrink-0">{cat.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-slate-800 truncate">
                  {b.name || (b.type === "OTHER" ? (b.customTypeName || "Outros") : (meta?.label ?? b.type))}
                </p>
                <p className="text-[10px] text-slate-400 truncate">{b.description || "—"}</p>
              </div>
              {/* KPI indicator pill */}
              {b.indicator && (
                <span className="hidden sm:block text-[9px] font-bold px-1.5 py-0.5 rounded truncate max-w-[80px]"
                  style={{ background: `${cat.color}12`, color: cat.color }}>
                  {b.indicator}
                </span>
              )}
              {/* Responsible */}
              {b.responsibleName && (
                <span className="hidden sm:block text-[9px] text-slate-400 font-medium truncate max-w-[60px]">
                  {b.responsibleName.split(" ")[0]}
                </span>
              )}
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                style={{ background: stCfg.bg, color: stCfg.color }}>
                {stCfg.label}
              </span>
              <span className="text-[11px] font-bold text-slate-700 shrink-0">
                {meta?.valueType === "currency" ? fmtBRL(b.plannedValue) : `${b.plannedValue} ${meta?.suffix ?? ""}`}
              </span>
              <button type="button" onClick={e => { e.stopPropagation(); handleDelete(b.id) }}
                disabled={isPending}
                className="p-1 rounded-md text-slate-200 hover:text-red-500 hover:bg-red-50 transition-all">
                {deletingId === b.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </button>
              {isExp ? <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
            </div>

            {/* Expanded edit form */}
            {isExp && ev && (
              <div className="px-3 pb-3 pt-2 space-y-2.5 border-t" style={{ borderColor: `${cat.color}15`, background: cat.bg }}>
                <div className="grid grid-cols-2 gap-2.5">
                  {/* Descrição */}
                  <div className="col-span-2">
                    <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400 mb-1">Descrição</p>
                    <textarea rows={2} className={`${inpCls} h-auto py-1.5 resize-none`}
                      value={ev.description}
                      onChange={e => setEditValues(v => ({ ...v, [b.id]: { ...v[b.id], description: e.target.value } }))} />
                  </div>

                  {/* Valor Previsto */}
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400 mb-1">
                      {meta?.valueType === "currency" ? "Valor Previsto" : `Previsto (${meta?.suffix})`}
                    </p>
                    <ValueInput valueType={meta?.valueType ?? "currency"} maxVal={meta?.maxVal ?? 99999}
                      value={ev.plannedValue} suffix={meta?.suffix ?? ""} catColor={cat.color}
                      onChange={v => setEditValues(x => ({ ...x, [b.id]: { ...x[b.id], plannedValue: v } }))} />
                  </div>

                  {/* Valor Realizado */}
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400 mb-1">
                      {meta?.valueType === "currency" ? "Valor Realizado" : `Realizado (${meta?.suffix})`}
                    </p>
                    <ValueInput valueType={meta?.valueType ?? "currency"} maxVal={meta?.maxVal ?? 99999}
                      value={ev.realizedValue} suffix={meta?.suffix ?? ""} catColor={cat.color}
                      onChange={v => setEditValues(x => ({ ...x, [b.id]: { ...x[b.id], realizedValue: v } }))} />
                  </div>

                  {/* Indicador KPI */}
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400 mb-1">Indicador (KPI)</p>
                    <input className={inpCls} placeholder="Ex: Redução de 20% no custo"
                      value={ev.indicator}
                      onChange={e => setEditValues(v => ({ ...v, [b.id]: { ...v[b.id], indicator: e.target.value } }))} />
                  </div>

                  {/* Responsável */}
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400 mb-1">Responsável</p>
                    <select className={inpCls} value={ev.responsibleId}
                      onChange={e => setEditValues(v => ({ ...v, [b.id]: { ...v[b.id], responsibleId: e.target.value } }))}>
                      <option value="">— Nenhum —</option>
                      {allUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>

                  {/* Target date */}
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400 mb-1">Prazo de Realização</p>
                    <input type="date" className={inpCls} value={ev.targetDate}
                      onChange={e => setEditValues(v => ({ ...v, [b.id]: { ...v[b.id], targetDate: e.target.value } }))} />
                  </div>

                  {/* Periodicidade */}
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400 mb-1">Periodicidade de Medição</p>
                    <select className={inpCls} value={ev.periodicity}
                      onChange={e => setEditValues(v => ({ ...v, [b.id]: { ...v[b.id], periodicity: e.target.value } }))}>
                      {BEN_PERIODICITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </div>
                </div>

                {/* Frequência (só quando showFrequency = true) */}
                {meta?.showFrequency && (
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400 mb-1">Frequência do Valor</p>
                    <div className="flex gap-1.5">
                      {BEN_FREQS.map(f => (
                        <button key={f.value} type="button"
                          onClick={() => setEditValues(v => ({ ...v, [b.id]: { ...v[b.id], frequency: f.value } }))}
                          className="h-8 px-2.5 rounded-lg text-[10px] font-bold border-2 transition-all"
                          style={ev.frequency === f.value
                            ? { borderColor: cat.color, background: cat.color, color: "#fff" }
                            : { borderColor: "#E2E8F0", background: "#fff", color: "#94A3B8" }}>
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Status */}
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400 mb-1">Status</p>
                  <div className="flex flex-wrap gap-1.5">
                    {BEN_STATUSES.map(s => (
                      <button key={s.value} type="button"
                        onClick={() => setEditValues(v => ({ ...v, [b.id]: { ...v[b.id], status: s.value } }))}
                        className="px-2.5 py-1 rounded-full text-[10px] font-bold border-2 transition-all"
                        style={ev.status === s.value
                          ? { borderColor: s.color, background: s.color, color: "#fff" }
                          : { borderColor: "#E2E8F0", background: "#fff", color: "#94A3B8" }}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Observações */}
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400 mb-1">Observações</p>
                  <input className={inpCls} placeholder="Observações sobre a realização deste benefício..."
                    value={ev.notes}
                    onChange={e => setEditValues(v => ({ ...v, [b.id]: { ...v[b.id], notes: e.target.value } }))} />
                </div>

                {/* Save / Cancel */}
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setExpanded(null)}
                    className="px-3 h-8 text-xs font-semibold rounded-lg border border-slate-200 text-slate-500 hover:bg-white transition-all">
                    Cancelar
                  </button>
                  <button type="button" onClick={() => handleSave(b)} disabled={isPending}
                    className="flex items-center gap-1.5 px-3 h-8 text-xs font-bold rounded-lg text-white transition-all disabled:opacity-50"
                    style={{ background: `linear-gradient(135deg, ${cat.color}, ${cat.color}cc)` }}>
                    {savingId === b.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    Salvar
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Add new benefit */}
      {!adding ? (
        <button type="button" onClick={() => setAdding(true)}
          className="w-full flex items-center justify-center gap-1.5 h-9 text-xs font-semibold rounded-xl border-2 border-dashed border-slate-200 text-slate-400 hover:border-purple-300 hover:text-purple-600 hover:bg-purple-50 transition-all">
          <Plus className="w-3.5 h-3.5" /> Adicionar Benefício
        </button>
      ) : (() => {
        const activeCat  = BEN_CATEGORIES.find(c => c.value === newBen.category)!
        const firstMeta  = BEN_META[newBen.types[0]]
        const showFreq   = newBen.types.some(t => BEN_META[t]?.showFrequency)
        const hasOther   = newBen.types.includes("OTHER")
        const canAdd     = newBen.types.length > 0 && newBen.description.trim() && (!hasOther || newBen.customTypeName.trim())
        return (
          <div className="rounded-xl border-2 overflow-hidden" style={{ borderColor: `${activeCat.color}40` }}>
            {/* Category selector */}
            <div className="flex gap-1.5 flex-wrap px-3 py-2.5 border-b" style={{ background: `${activeCat.color}08`, borderColor: `${activeCat.color}20` }}>
              {BEN_CATEGORIES.map(c => (
                <button key={c.value} type="button"
                  onClick={() => setNewBen(n => ({ ...n, category: c.value, types: [BEN_TYPES_BY_CAT[c.value][0]], customTypeName: "" }))}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all"
                  style={newBen.category === c.value
                    ? { background: c.color, color: "#fff" }
                    : { background: "rgba(0,0,0,0.05)", color: "#9c99b0" }}>
                  {c.icon} {c.label}
                </button>
              ))}
            </div>

            <div className="p-3 space-y-2.5">
              {/* Type pills */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Tipo de Benefício</p>
                  {newBen.types.length > 1 && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: `${activeCat.color}15`, color: activeCat.color }}>
                      {newBen.types.length} selecionados
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {BEN_TYPES_BY_CAT[newBen.category].map(t => {
                    const isSel = newBen.types.includes(t)
                    return (
                      <button key={t} type="button"
                        onClick={() => setNewBen(n => {
                          const next = isSel ? n.types.filter(x => x !== t) : [...n.types, t]
                          return { ...n, types: next.length > 0 ? next : [t], customTypeName: next.includes("OTHER") ? n.customTypeName : "" }
                        })}
                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold border-2 transition-all"
                        style={isSel
                          ? { borderColor: activeCat.color, background: activeCat.color, color: "#fff" }
                          : { borderColor: "#E2E8F0", background: "#fff", color: "#6b6880" }}>
                        {BEN_META[t]?.label ?? t}
                      </button>
                    )
                  })}
                </div>
              </div>

              {hasOther && (
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400 mb-1">Nome personalizado</p>
                  <input className={inpCls} placeholder="Ex: Redução de licenças, Melhora em NPS..."
                    value={newBen.customTypeName} onChange={e => setNewBen(n => ({ ...n, customTypeName: e.target.value }))} />
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5">
                {/* Nome */}
                <div className="col-span-2">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400 mb-1">Nome do Benefício <span className="text-red-400">*</span></p>
                  <input className={inpCls} placeholder="Ex: Redução de 20% no custo de frete"
                    value={newBen.name} onChange={e => setNewBen(n => ({ ...n, name: e.target.value }))} />
                </div>

                {/* Descrição */}
                <div className="col-span-2">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400 mb-1">Como este benefício será gerado <span className="text-red-400">*</span></p>
                  <textarea rows={2} className={`${inpCls} h-auto py-1.5 resize-none`}
                    placeholder="Descreva como este benefício será gerado e mensurado..."
                    value={newBen.description} onChange={e => setNewBen(n => ({ ...n, description: e.target.value }))} />
                </div>

                {/* Valor previsto */}
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400 mb-1">
                    {firstMeta?.valueType === "currency" ? "Valor Previsto (R$)" : `Valor Previsto (${firstMeta?.suffix ?? ""})`}
                    {firstMeta && firstMeta.valueType !== "currency" && (
                      <span className="ml-1 normal-case text-slate-300">máx. {firstMeta.maxVal.toLocaleString("pt-BR")}</span>
                    )}
                  </p>
                  {firstMeta?.valueType === "currency" ? (
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-emerald-600">R$</span>
                      <input className={`${inpCls} pl-7`} placeholder="0,00"
                        value={newBen.plannedValue}
                        onChange={e => { const raw = e.target.value.replace(/\D/g, ""); setNewBen(n => ({ ...n, plannedValue: raw ? fmtBRLInput(raw) : "" })) }} />
                    </div>
                  ) : (
                    <div className="relative">
                      <input type="number" min={0} max={firstMeta?.maxVal ?? 99999}
                        step={(firstMeta?.valueType === "percent" || firstMeta?.valueType === "score") ? "0.1" : "1"}
                        className={`${inpCls} pr-10`} placeholder="0"
                        value={newBen.plannedValue}
                        onBlur={e => {
                          const n = parseFloat(e.target.value) || 0
                          setNewBen(x => ({ ...x, plannedValue: String(Math.min(firstMeta?.maxVal ?? 99999, Math.max(0, n))) }))
                        }}
                        onChange={e => setNewBen(n => ({ ...n, plannedValue: e.target.value }))} />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] font-black"
                        style={{ color: activeCat.color }}>{firstMeta?.suffix}</span>
                    </div>
                  )}
                </div>

                {/* Frequência */}
                {showFreq ? (
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400 mb-1">Frequência</p>
                    <div className="flex gap-1">
                      {BEN_FREQS.map(f => (
                        <button key={f.value} type="button"
                          onClick={() => setNewBen(n => ({ ...n, frequency: f.value }))}
                          className="flex-1 h-9 rounded-lg text-[10px] font-bold border-2 transition-all"
                          style={newBen.frequency === f.value
                            ? { borderColor: activeCat.color, background: activeCat.color, color: "#fff" }
                            : { borderColor: "#E2E8F0", background: "#fff", color: "#94A3B8" }}>
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400 mb-1">Periodicidade de Medição</p>
                    <select className={inpCls} value={newBen.periodicity}
                      onChange={e => setNewBen(n => ({ ...n, periodicity: e.target.value as never }))}>
                      {BEN_PERIODICITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </div>
                )}

                {/* Indicador KPI */}
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400 mb-1">Indicador (KPI)</p>
                  <input className={inpCls} placeholder="Ex: % de redução no custo"
                    value={newBen.indicator} onChange={e => setNewBen(n => ({ ...n, indicator: e.target.value }))} />
                </div>

                {/* Prazo */}
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400 mb-1">Prazo de Realização</p>
                  <input type="date" className={inpCls} value={newBen.targetDate}
                    onChange={e => setNewBen(n => ({ ...n, targetDate: e.target.value }))} />
                </div>

                {/* Responsável */}
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400 mb-1">Responsável</p>
                  <select className={inpCls} value={newBen.responsibleId}
                    onChange={e => setNewBen(n => ({ ...n, responsibleId: e.target.value }))}>
                    <option value="">— Nenhum —</option>
                    {allUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>

                {/* Monitoramento pós-projeto */}
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400 mb-1">Monitorar por</p>
                  <select className={inpCls} value={newBen.monitoringMonths}
                    onChange={e => setNewBen(n => ({ ...n, monitoringMonths: Number(e.target.value) }))}>
                    {MONITORING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => { setAdding(false); setNewBen({ ...EMPTY_NEW }) }}
                  className="px-3 h-8 text-xs font-semibold rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all">
                  Cancelar
                </button>
                <button type="button" onClick={handleAdd} disabled={isPending || !canAdd}
                  className="flex items-center gap-1.5 px-4 h-8 text-xs font-bold rounded-lg text-white transition-all disabled:opacity-50"
                  style={{ background: `linear-gradient(135deg, ${activeCat.color}, ${activeCat.color}cc)` }}>
                  {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                  {newBen.types.length > 1 ? `Adicionar ${newBen.types.length} benefícios` : "Adicionar Benefício"}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div>
        <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">{label}</label>
        {hint && <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

// ── Team Section ────────────────────────────────────────────────────────────

function TeamSection({
  projectId, initialMembers, allUsers,
}: { projectId: string; initialMembers: Member[]; allUsers: AvailUser[] }) {
  const [members, setMembers] = useState<Member[]>(initialMembers)
  const [selectedUserId, setSelectedUserId] = useState("")
  const [newRole, setNewRole] = useState("Membro")
  const [isPending, startTransition] = useTransition()
  const [removingId, setRemovingId] = useState<string | null>(null)

  const available = allUsers.filter(u => !members.some(m => m.userId === u.id))

  function handleAdd() {
    if (!selectedUserId) return
    const user = allUsers.find(u => u.id === selectedUserId)
    if (!user) return
    startTransition(async () => {
      await addProjectMember(projectId, selectedUserId, newRole)
      setMembers(prev => [...prev, { userId: selectedUserId, role: newRole, user }])
      setSelectedUserId("")
      setNewRole("Membro")
    })
  }

  function handleRemove(userId: string) {
    setRemovingId(userId)
    startTransition(async () => {
      await removeProjectMember(projectId, userId)
      setMembers(prev => prev.filter(m => m.userId !== userId))
      setRemovingId(null)
    })
  }

  return (
    <div className="space-y-4">
      {/* Current members */}
      {members.length > 0 ? (
        <div className="space-y-2">
          {members.map(m => (
            <div
              key={m.userId}
              className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl"
              style={{ border: "1px solid #E2E8F0", background: "#F8FAFC" }}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0"
                style={{ background: `hsl(${(m.user.name.charCodeAt(0) * 37) % 360}, 55%, 40%)` }}
              >
                {m.user.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#0F172A] truncate">{m.user.name}</p>
                <p className="text-[11px] text-slate-400 truncate">
                  {m.role}{m.user.department ? ` · ${m.user.department}` : ""}
                </p>
              </div>
              <button
                onClick={() => handleRemove(m.userId)}
                disabled={isPending}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-40"
              >
                {removingId === m.userId
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Trash2 className="w-3.5 h-3.5" />
                }
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div
          className="py-6 rounded-xl text-center"
          style={{ border: "1px dashed #CBD5E1", background: "#F8FAFC" }}
        >
          <p className="text-xs text-slate-400">Nenhum membro adicionado</p>
        </div>
      )}

      {/* Add member */}
      <div
        className="rounded-xl p-4 space-y-3"
        style={{ border: "1px solid #E2E8F0", background: "white" }}
      >
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Adicionar Membro</p>
          <a
            href="/users"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] font-semibold transition-opacity hover:opacity-75"
            style={{ color: "#7B2FBE" }}
          >
            <UserPlus className="w-3 h-3" />
            Cadastrar novo usuário
          </a>
        </div>

        {available.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-2">
            Todos os usuários cadastrados já participam do projeto.{" "}
            <a href="/users" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "#7B2FBE" }}>
              Cadastre um novo usuário
            </a>{" "}
            para adicioná-lo aqui.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <div className="relative">
                <select
                  className="lp-inp pr-8 appearance-none"
                  value={selectedUserId}
                  onChange={e => setSelectedUserId(e.target.value)}
                >
                  <option value="">Selecionar pessoa...</option>
                  {available.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name}{u.department ? ` — ${u.department}` : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
              <Field label="Função / Papel">
                <input
                  className="lp-inp"
                  value={newRole}
                  onChange={e => setNewRole(e.target.value)}
                  placeholder="Ex: Tech Lead, Analista..."
                />
              </Field>
              <button
                onClick={handleAdd}
                disabled={!selectedUserId || isPending}
                className="h-[42px] px-4 rounded-xl text-sm font-bold text-white flex items-center gap-1.5 disabled:opacity-40 transition-opacity shrink-0"
                style={{ background: "linear-gradient(135deg, #2463FF, #8B2FFF)" }}
              >
                {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Adicionar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Risks Section ───────────────────────────────────────────────────────────

function RisksSection({
  projectId, initialRisks,
}: { projectId: string; initialRisks: RiskItem[] }) {
  const [risks, setRisks] = useState<RiskItem[]>(initialRisks)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ description: "", level: "MEDIUM", mitigation: "" })
  const [newForm, setNewForm] = useState({ description: "", level: "MEDIUM", mitigation: "" })
  const [showNew, setShowNew] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function startEdit(r: RiskItem) {
    setEditingId(r.id)
    setEditForm({ description: r.description, level: r.level, mitigation: r.mitigation ?? "" })
  }

  function handleUpdate(id: string) {
    startTransition(async () => {
      await updateRisk(id, { description: editForm.description, level: editForm.level, mitigation: editForm.mitigation })
      setRisks(prev => prev.map(r => r.id === id
        ? { ...r, description: editForm.description, level: editForm.level, mitigation: editForm.mitigation }
        : r
      ))
      setEditingId(null)
    })
  }

  function handleDelete(id: string) {
    setDeletingId(id)
    startTransition(async () => {
      await deleteRisk(id)
      setRisks(prev => prev.filter(r => r.id !== id))
      setDeletingId(null)
    })
  }

  function handleCreate() {
    if (!newForm.description.trim()) return
    startTransition(async () => {
      await createRisk(projectId, { description: newForm.description, level: newForm.level, mitigation: newForm.mitigation })
      // optimistically add with temp id — revalidatePath will refresh on next load
      setRisks(prev => [...prev, {
        id: `temp-${Date.now()}`,
        description: newForm.description,
        level: newForm.level,
        mitigation: newForm.mitigation || null,
      }])
      setNewForm({ description: "", level: "MEDIUM", mitigation: "" })
      setShowNew(false)
    })
  }

  return (
    <div className="space-y-3">
      {risks.length === 0 && !showNew && (
        <div className="py-6 rounded-xl text-center" style={{ border: "1px dashed #CBD5E1", background: "#F8FAFC" }}>
          <p className="text-xs text-slate-400">Nenhum risco registrado</p>
        </div>
      )}

      {risks.map(r => {
        const cfg = riskCfg(r.level)
        const isEditing = editingId === r.id
        return (
          <div
            key={r.id}
            className="rounded-xl overflow-hidden"
            style={{ border: `1px solid ${isEditing ? "#93C5FD" : "#E2E8F0"}`, background: isEditing ? "#EFF6FF" : "white" }}
          >
            {isEditing ? (
              <div className="p-4 space-y-3">
                <Field label="Descrição do risco">
                  <textarea
                    className="lp-inp"
                    rows={2}
                    style={{ paddingTop: 10, paddingBottom: 10, resize: "vertical" }}
                    value={editForm.description}
                    onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Nível">
                    <div className="relative">
                      <select
                        className="lp-inp pr-8 appearance-none"
                        value={editForm.level}
                        onChange={e => setEditForm(f => ({ ...f, level: e.target.value }))}
                      >
                        {RISK_LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                    </div>
                  </Field>
                  <Field label="Mitigação">
                    <input
                      className="lp-inp"
                      value={editForm.mitigation}
                      onChange={e => setEditForm(f => ({ ...f, mitigation: e.target.value }))}
                      placeholder="Ação de mitigação..."
                    />
                  </Field>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setEditingId(null)}
                    className="px-3 h-8 text-xs font-semibold rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleUpdate(r.id)}
                    disabled={isPending}
                    className="px-3 h-8 text-xs font-bold rounded-lg text-white flex items-center gap-1.5 disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #2463FF, #8B2FFF)" }}
                  >
                    {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    Salvar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 p-3.5">
                <span
                  className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wide shrink-0 mt-0.5"
                  style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}
                >
                  {cfg.label}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#0F172A] font-medium leading-snug">{r.description}</p>
                  {r.mitigation && (
                    <p className="text-[11px] text-slate-400 mt-1">Mitigação: {r.mitigation}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => startEdit(r)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleDelete(r.id)}
                    disabled={isPending}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-40"
                  >
                    {deletingId === r.id
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Trash2 className="w-3 h-3" />
                    }
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* New risk form */}
      {showNew && (
        <div className="rounded-xl p-4 space-y-3" style={{ border: "1px solid #93C5FD", background: "#EFF6FF" }}>
          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide">Novo Risco / Issue</p>
          <Field label="Descrição do risco *">
            <textarea
              className="lp-inp"
              rows={2}
              style={{ paddingTop: 10, paddingBottom: 10, resize: "vertical" }}
              value={newForm.description}
              onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Descreva o risco ou issue..."
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nível">
              <div className="relative">
                <select
                  className="lp-inp pr-8 appearance-none"
                  value={newForm.level}
                  onChange={e => setNewForm(f => ({ ...f, level: e.target.value }))}
                >
                  {RISK_LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              </div>
            </Field>
            <Field label="Mitigação">
              <input
                className="lp-inp"
                value={newForm.mitigation}
                onChange={e => setNewForm(f => ({ ...f, mitigation: e.target.value }))}
                placeholder="Ação de mitigação..."
              />
            </Field>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setShowNew(false)}
              className="px-3 h-8 text-xs font-semibold rounded-lg border border-slate-200 text-slate-500 hover:bg-white transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleCreate}
              disabled={isPending || !newForm.description.trim()}
              className="px-3 h-8 text-xs font-bold rounded-lg text-white flex items-center gap-1.5 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #2463FF, #8B2FFF)" }}
            >
              {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              Adicionar Risco
            </button>
          </div>
        </div>
      )}

      {!showNew && (
        <button
          onClick={() => setShowNew(true)}
          className="w-full h-10 rounded-xl text-xs font-semibold text-slate-500 flex items-center justify-center gap-1.5 hover:bg-slate-50 transition-colors"
          style={{ border: "1px dashed #CBD5E1" }}
        >
          <Plus className="w-3.5 h-3.5" />
          Adicionar Risco / Issue
        </button>
      )}
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────

export function ProjectEditModal({ project, members, allUsers, risks, benefits }: Props) {
  const [open, setOpen] = useState(false)
  const [section, setSection] = useState("info")
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)

  const [form, setForm] = useState({
    title:         project.title         ?? "",
    description:   project.description   ?? "",
    scope:         project.scope         ?? "",
    assumptions:   project.assumptions   ?? "",
    restrictions:  project.restrictions  ?? "",
    origin:        project.origin        ?? "INTERNAL",
    projectArea:   project.projectArea   ?? "TECNOLOGIA",
    proposalNumber: project.proposalNumber ?? "",
    contractNumber: project.contractNumber ?? "",
    budget:         project.budget         != null ? String(project.budget)         : "",
    estimatedCosts: project.estimatedCosts != null ? String(project.estimatedCosts) : "",
    economy:        project.economy        != null ? String(project.economy)        : "",
    expectedStart: toInputDate(project.expectedStart),
    expectedEnd:   toInputDate(project.expectedEnd),
    actualStart:   toInputDate(project.actualStart),
    actualEnd:     toInputDate(project.actualEnd),
    goLiveDate:    toInputDate(project.goLiveDate),
  })

  useEffect(() => {
    setForm({
      title:         project.title         ?? "",
      description:   project.description   ?? "",
      scope:         project.scope         ?? "",
      assumptions:   project.assumptions   ?? "",
      restrictions:  project.restrictions  ?? "",
      origin:        project.origin        ?? "INTERNAL",
      projectArea:   project.projectArea   ?? "TECNOLOGIA",
      proposalNumber: project.proposalNumber ?? "",
      contractNumber: project.contractNumber ?? "",
      budget:         project.budget         != null ? String(project.budget)         : "",
      estimatedCosts: project.estimatedCosts != null ? String(project.estimatedCosts) : "",
      economy:        project.economy        != null ? String(project.economy)        : "",
      expectedStart: toInputDate(project.expectedStart),
      expectedEnd:   toInputDate(project.expectedEnd),
      actualStart:   toInputDate(project.actualStart),
      actualEnd:     toInputDate(project.actualEnd),
      goLiveDate:    toInputDate(project.goLiveDate),
    })
  }, [project])

  function set(k: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))
  }

  function handleSave() {
    startTransition(async () => {
      const parseMoney = (v: string) => {
        const n = parseFloat(v.replace(",", "."))
        return isNaN(n) ? null : n
      }
      await updateProjectDetails(project.id, {
        title:         form.title.trim() || undefined,
        description:   form.description.trim() || undefined,
        scope:         form.scope.trim()        || undefined,
        assumptions:   form.assumptions.trim()  || null,
        restrictions:  form.restrictions.trim() || null,
        origin:        form.origin || undefined,
        projectArea:   form.projectArea || undefined,
        proposalNumber: form.proposalNumber.trim() || null,
        contractNumber: form.contractNumber.trim() || null,
        budget:         parseMoney(form.budget),
        estimatedCosts: parseMoney(form.estimatedCosts),
        economy:        parseMoney(form.economy),
        expectedStart: form.expectedStart || null,
        expectedEnd:   form.expectedEnd   || null,
        actualStart:   form.actualStart   || null,
        actualEnd:     form.actualEnd     || null,
        goLiveDate:    form.goLiveDate    || null,
      })
      setSaved(true)
      setTimeout(() => { setSaved(false); setOpen(false) }, 1000)
    })
  }

  // Sections where the footer save button applies
  const isSaveSection = ["info", "dates", "financial", "scope"].includes(section)

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 h-9 text-sm font-semibold rounded-xl transition-all hover:opacity-90 active:scale-[0.98]"
        style={{ background: "linear-gradient(135deg, #0F172A, #1E293B)", boxShadow: "0 4px 20px rgba(15,23,42,0.25)", color: "white" }}
      >
        <Pencil className="w-3.5 h-3.5" />
        Editar Projeto
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)" }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          {/* Modal */}
          <div
            className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl overflow-hidden"
            style={{ background: "#ffffff", boxShadow: "0 24px 80px rgba(15,23,42,0.30), 0 0 0 1px rgba(226,232,240,1)" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: "1px solid #F1F5F9" }}>
              <div>
                <h2 className="text-base font-black text-[#0F172A]">Editar Projeto</h2>
                <p className="text-xs text-slate-400 mt-0.5 truncate max-w-md">{project.title}</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Section tabs */}
            <div className="flex gap-0.5 px-4 py-2 shrink-0 overflow-x-auto" style={{ borderBottom: "1px solid #F1F5F9", background: "#FAFBFC" }}>
              {SECTIONS.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap shrink-0"
                  style={section === s.id
                    ? { background: "linear-gradient(135deg, #2463FF, #8B2FFF)", color: "white" }
                    : { background: "transparent", color: "#94A3B8" }
                  }
                >
                  <s.icon className="w-3 h-3" />
                  {s.label}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

              {/* ── Informações ─────────────────────────────────── */}
              {section === "info" && (
                <>
                  <Field label="Título do Projeto *">
                    <input className="lp-inp" value={form.title} onChange={set("title")} placeholder="Nome do projeto" />
                  </Field>
                  <Field label="Descrição Resumida">
                    <textarea
                      className="lp-inp" rows={3} value={form.description} onChange={set("description")}
                      placeholder="Breve descrição do projeto..."
                      style={{ height: "auto", paddingTop: 10, paddingBottom: 10, resize: "vertical" }}
                    />
                  </Field>
                  <Field label="Origem / Demanda">
                    <div className="relative">
                      <select className="lp-inp pr-8 appearance-none" value={form.origin} onChange={set("origin")}>
                        {Object.entries(ORIGIN_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                    </div>
                  </Field>

                  {form.origin === "CLIENT" && (
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Nº da Proposta Comercial" hint="Número da proposta aprovada pelo cliente">
                        <input className="lp-inp" value={form.proposalNumber} onChange={set("proposalNumber")}
                          placeholder="Ex: PROP-2024-001" />
                      </Field>
                      <Field label="Nº Contrato / Pedido de Venda" hint="Contrato ou PV (quando aplicável)">
                        <input className="lp-inp" value={form.contractNumber} onChange={set("contractNumber")}
                          placeholder="Ex: CONT-123 ou PV-456" />
                      </Field>
                    </div>
                  )}

                  <Field label="Portfólio / Área de Gestão">
                    <div className="grid grid-cols-3 gap-2">
                      {PROJECT_AREAS.map(pa => {
                        const sel = form.projectArea === pa.value
                        return (
                          <button
                            key={pa.value}
                            type="button"
                            onClick={() => setForm(f => ({ ...f, projectArea: pa.value }))}
                            className="p-3 rounded-xl border-2 text-left transition-all duration-150"
                            style={sel
                              ? { borderColor: pa.color, background: `${pa.color}0D` }
                              : { borderColor: "#E2E8F0", background: "#F8FAFC" }
                            }
                          >
                            <div className="text-base mb-1">{pa.icon}</div>
                            <p className="text-xs font-bold leading-tight" style={{ color: sel ? pa.color : "#0F172A" }}>
                              {pa.label}
                            </p>
                            <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">{pa.desc}</p>
                          </button>
                        )
                      })}
                    </div>
                  </Field>
                </>
              )}

              {/* ── Datas ───────────────────────────────────────── */}
              {section === "dates" && (
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Início Planejado">
                    <input type="date" className="lp-inp" value={form.expectedStart} onChange={set("expectedStart")} />
                  </Field>
                  <Field label="Fim Planejado">
                    <input type="date" className="lp-inp" value={form.expectedEnd} onChange={set("expectedEnd")} />
                  </Field>
                  <Field label="Início Real">
                    <input type="date" className="lp-inp" value={form.actualStart} onChange={set("actualStart")} />
                  </Field>
                  <Field label="GO LIVE Previsto">
                    <input type="date" className="lp-inp" value={form.goLiveDate} onChange={set("goLiveDate")} />
                  </Field>
                  <Field label="Fim Real / Encerramento">
                    <input type="date" className="lp-inp" value={form.actualEnd} onChange={set("actualEnd")} />
                  </Field>
                </div>
              )}

              {/* ── Financeiro ──────────────────────────────────── */}
              {section === "financial" && (
                <>
                  <Field label="Budget Total (R$)" hint="Valor total do orçamento aprovado para o projeto">
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-emerald-500">R$</span>
                      <input type="text" inputMode="decimal" className="lp-inp" style={{ paddingLeft: 36 }}
                        value={form.budget} onChange={set("budget")} placeholder="0,00" />
                    </div>
                  </Field>
                  <Field label="Custo Estimado (R$)" hint="Estimativa de custo total para execução do projeto">
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-500">R$</span>
                      <input type="text" inputMode="decimal" className="lp-inp" style={{ paddingLeft: 36 }}
                        value={form.estimatedCosts} onChange={set("estimatedCosts")} placeholder="0,00" />
                    </div>
                  </Field>
                  <Field label="Economia Esperada (R$)" hint="Ganho financeiro estimado com o projeto">
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-blue-500">R$</span>
                      <input type="text" inputMode="decimal" className="lp-inp" style={{ paddingLeft: 36 }}
                        value={form.economy} onChange={set("economy")} placeholder="0,00" />
                    </div>
                  </Field>
                </>
              )}

              {/* ── Escopo ──────────────────────────────────────── */}
              {section === "scope" && (
                <>
                  <Field label="Escopo do Projeto">
                    <textarea className="lp-inp" rows={5} value={form.scope} onChange={set("scope")}
                      placeholder="Descreva o escopo: objetivos, entregas e limites..."
                      style={{ height: "auto", paddingTop: 10, paddingBottom: 10, resize: "vertical" }} />
                  </Field>
                  <Field label="Premissas" hint="O que precisa ser verdadeiro para o projeto ter sucesso">
                    <textarea className="lp-inp" rows={4} value={form.assumptions} onChange={set("assumptions")}
                      placeholder="Liste as premissas do projeto..."
                      style={{ height: "auto", paddingTop: 10, paddingBottom: 10, resize: "vertical" }} />
                  </Field>
                  <Field label="Restrições" hint="Limitações ou condições que o projeto deve respeitar">
                    <textarea className="lp-inp" rows={4} value={form.restrictions} onChange={set("restrictions")}
                      placeholder="Liste as restrições do projeto..."
                      style={{ height: "auto", paddingTop: 10, paddingBottom: 10, resize: "vertical" }} />
                  </Field>
                </>
              )}

              {/* ── Equipe ──────────────────────────────────────── */}
              {section === "team" && (
                <TeamSection projectId={project.id} initialMembers={members} allUsers={allUsers} />
              )}

              {/* ── Riscos ──────────────────────────────────────── */}
              {section === "risks" && (
                <RisksSection projectId={project.id} initialRisks={risks} />
              )}

              {/* ── Benefícios ──────────────────────────────────── */}
              {section === "benefits" && (
                <BenefitsSection projectId={project.id} initialBenefits={benefits} allUsers={allUsers} />
              )}
            </div>

            {/* Footer — save button only for data sections */}
            {isSaveSection && (
              <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderTop: "1px solid #F1F5F9", background: "#FAFBFC" }}>
                <button
                  onClick={() => setOpen(false)}
                  className="px-4 h-9 text-sm font-semibold rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={isPending || !form.title.trim()}
                  className="inline-flex items-center gap-2 px-5 h-9 text-sm font-bold rounded-xl text-white transition-all disabled:opacity-50"
                  style={{
                    background: saved
                      ? "linear-gradient(135deg, #059669, #10B981)"
                      : "linear-gradient(135deg, #2463FF, #8B2FFF)",
                    boxShadow: "0 4px 20px rgba(36,99,255,0.35)",
                  }}
                >
                  {isPending
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando...</>
                    : saved
                      ? <><Save className="w-3.5 h-3.5" /> Salvo!</>
                      : <><Save className="w-3.5 h-3.5" /> Salvar Alterações</>
                  }
                </button>
              </div>
            )}

            {/* Footer — close only for team/risks (saves happen inline) */}
            {!isSaveSection && (
              <div className="flex items-center justify-end px-6 py-4 shrink-0" style={{ borderTop: "1px solid #F1F5F9", background: "#FAFBFC" }}>
                <button
                  onClick={() => setOpen(false)}
                  className="px-4 h-9 text-sm font-semibold rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all"
                >
                  Fechar
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <style jsx global>{`
        .lp-inp {
          width: 100%;
          min-height: 42px;
          padding: 0 14px;
          background: #ffffff;
          border: 1.5px solid rgba(0,0,0,0.10);
          border-radius: 10px;
          color: #0F172A;
          font-size: 13.5px;
          outline: none;
          transition: border-color 0.18s, box-shadow 0.18s;
          box-shadow: 0 1px 2px rgba(0,0,0,0.04) inset;
          display: block;
        }
        .lp-inp::placeholder { color: #CBD5E1; }
        .lp-inp:focus {
          border-color: #2463FF;
          box-shadow: 0 0 0 3px rgba(36,99,255,0.10), 0 1px 2px rgba(0,0,0,0.04) inset;
        }
      `}</style>
    </>
  )
}
