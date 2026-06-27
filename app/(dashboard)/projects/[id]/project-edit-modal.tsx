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
  category: "FINANCIAL" | "OPERATIONAL" | "STRATEGIC"
  type: string
  description: string
  unit: string
  plannedValue: number
  realizedValue: number
  frequency: "ONCE" | "MONTHLY" | "ANNUAL"
  status: "PLANNED" | "IN_PROGRESS" | "REALIZED" | "NOT_REALIZED"
  customTypeName: string | null
}

// ── Benefits constants ──────────────────────────────────────────────────────

const BEN_CATEGORIES = [
  { value: "FINANCIAL",   label: "Financeiro",  color: "#059669", bg: "#ECFDF5", icon: "💰" },
  { value: "OPERATIONAL", label: "Operacional", color: "#2563EB", bg: "#EFF6FF", icon: "⚙️"  },
  { value: "STRATEGIC",   label: "Estratégico", color: "#7B2FBE", bg: "#F5F3FF", icon: "🎯" },
] as const

const BEN_META: Record<string, { label: string; unit: string; valueType: "currency"|"hours"|"percent"|"count"|"score"; suffix: string; showFrequency: boolean }> = {
  COST_REDUCTION:     { label: "Redução de Custos",      unit: "R$",       valueType: "currency", suffix: "R$",        showFrequency: true  },
  REVENUE_INCREASE:   { label: "Aumento de Receita",     unit: "R$",       valueType: "currency", suffix: "R$",        showFrequency: true  },
  OPEX_REDUCTION:     { label: "Redução de OPEX",        unit: "R$",       valueType: "currency", suffix: "R$",        showFrequency: true  },
  ANNUAL_SAVINGS:     { label: "Economia Anual",         unit: "R$",       valueType: "currency", suffix: "R$/ano",    showFrequency: false },
  MONTHLY_SAVINGS:    { label: "Economia Mensal",        unit: "R$",       valueType: "currency", suffix: "R$/mês",    showFrequency: false },
  HOURS_SAVED:        { label: "Horas Economizadas",     unit: "horas",    valueType: "hours",    suffix: "horas",     showFrequency: true  },
  PRODUCTIVITY_GAIN:  { label: "Ganho de Produtividade", unit: "%",        valueType: "percent",  suffix: "%",         showFrequency: false },
  PROCESS_AUTOMATION: { label: "Automação de Processo",  unit: "processos",valueType: "count",    suffix: "processos", showFrequency: false },
  REWORK_REDUCTION:   { label: "Redução de Retrabalho",  unit: "%",        valueType: "percent",  suffix: "%",         showFrequency: false },
  TIME_REDUCTION:     { label: "Redução de Lead Time",   unit: "dias",     valueType: "count",    suffix: "dias",      showFrequency: false },
  CUSTOMER_EXPERIENCE:{ label: "Experiência do Cliente", unit: "pontos",   valueType: "score",    suffix: "pontos",    showFrequency: false },
  RISK_REDUCTION:     { label: "Redução de Risco",       unit: "%",        valueType: "percent",  suffix: "%",         showFrequency: false },
  COMPLIANCE:         { label: "Compliance",             unit: "%",        valueType: "percent",  suffix: "%",         showFrequency: false },
  QUALITY:            { label: "Qualidade",              unit: "%",        valueType: "percent",  suffix: "%",         showFrequency: false },
  GOVERNANCE:         { label: "Governança",             unit: "pontos",   valueType: "score",    suffix: "pontos",    showFrequency: false },
  USER_SATISFACTION:  { label: "Satisfação do Usuário",  unit: "%",        valueType: "percent",  suffix: "%",         showFrequency: false },
  OTHER:              { label: "Outros",                 unit: "R$",       valueType: "currency", suffix: "R$",        showFrequency: true  },
}

const BEN_TYPES_BY_CAT: Record<string, string[]> = {
  FINANCIAL:   ["COST_REDUCTION","REVENUE_INCREASE","OPEX_REDUCTION","ANNUAL_SAVINGS","MONTHLY_SAVINGS","OTHER"],
  OPERATIONAL: ["HOURS_SAVED","PRODUCTIVITY_GAIN","PROCESS_AUTOMATION","REWORK_REDUCTION","TIME_REDUCTION","OTHER"],
  STRATEGIC:   ["CUSTOMER_EXPERIENCE","RISK_REDUCTION","COMPLIANCE","QUALITY","GOVERNANCE","USER_SATISFACTION","OTHER"],
}

const BEN_STATUSES = [
  { value: "PLANNED",       label: "Planejado",       color: "#64748B", bg: "#F1F5F9" },
  { value: "IN_PROGRESS",   label: "Em Andamento",    color: "#2563EB", bg: "#EFF6FF" },
  { value: "REALIZED",      label: "Realizado",       color: "#059669", bg: "#ECFDF5" },
  { value: "NOT_REALIZED",  label: "Não Realizado",   color: "#DC2626", bg: "#FEF2F2" },
]

const BEN_FREQS = [
  { value: "MONTHLY", label: "Por mês" },
  { value: "ANNUAL",  label: "Por ano" },
  { value: "ONCE",    label: "Pontual" },
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

type NewBenefit = { category: "FINANCIAL"|"OPERATIONAL"|"STRATEGIC"; types: string[]; description: string; plannedValue: string; frequency: "ONCE"|"MONTHLY"|"ANNUAL"; customTypeName: string }
const EMPTY_NEW: NewBenefit = { category: "FINANCIAL", types: ["COST_REDUCTION"], description: "", plannedValue: "", frequency: "MONTHLY", customTypeName: "" }

function BenefitsSection({ projectId, initialBenefits }: { projectId: string; initialBenefits: BenefitRow[] }) {
  const [benefits, setBenefits] = useState<BenefitRow[]>(initialBenefits)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Record<string, { description: string; plannedValue: string; status: string; frequency: string }>>({})
  const [adding, setAdding] = useState(false)
  const [newBen, setNewBen] = useState<NewBenefit>({ ...EMPTY_NEW })
  const [isPending, startTransition] = useTransition()
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function toggleExpand(id: string, b: BenefitRow) {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    const meta = BEN_META[b.type]
    setEditValues(ev => ({
      ...ev,
      [id]: {
        description:  b.description,
        plannedValue: meta?.valueType === "currency" ? fmtBRL(b.plannedValue) : String(b.plannedValue),
        status:       b.status,
        frequency:    b.frequency,
      },
    }))
  }

  function handleSaveBenefit(b: BenefitRow) {
    const ev = editValues[b.id]
    if (!ev) return
    setSavingId(b.id)
    const meta = BEN_META[b.type]
    const val  = meta?.valueType === "currency" ? parseBRLEdit(ev.plannedValue) : parseFloat(ev.plannedValue) || 0
    startTransition(async () => {
      try {
        await updateBenefit(b.id, {
          description:  ev.description,
          plannedValue: val,
          status:       ev.status as never,
          frequency:    ev.frequency as never,
          unit:         meta?.unit ?? b.unit,
        })
        setBenefits(prev => prev.map(x => x.id === b.id
          ? { ...x, description: ev.description, plannedValue: val, status: ev.status as BenefitRow["status"], frequency: ev.frequency as BenefitRow["frequency"] }
          : x
        ))
        setExpanded(null)
      } catch (err) {
        console.error("Erro ao salvar benefício:", err)
      } finally {
        setSavingId(null)
      }
    })
  }

  function handleDelete(id: string) {
    setDeletingId(id)
    startTransition(async () => {
      try {
        await deleteBenefit(id)
        setBenefits(prev => prev.filter(b => b.id !== id))
        if (expanded === id) setExpanded(null)
      } catch (err) {
        console.error("Erro ao deletar benefício:", err)
      } finally {
        setDeletingId(null)
      }
    })
  }

  function handleAdd() {
    const firstMeta = BEN_META[newBen.types[0]]
    const val = firstMeta?.valueType === "currency" ? parseBRLEdit(newBen.plannedValue) : parseFloat(newBen.plannedValue) || 0
    const snapshot = { ...newBen }
    startTransition(async () => {
      try {
        await Promise.all(snapshot.types.map(t =>
          createBenefit(projectId, {
            category:        snapshot.category as never,
            type:            t as never,
            description:     snapshot.description,
            unit:            BEN_META[t]?.unit ?? "R$",
            plannedValue:    val,
            realizedValue:   0,
            frequency:       snapshot.frequency as never,
            status:          "PLANNED" as never,
            baselineDate:    null,
            realizationDate: null,
            evidence:        null,
            customTypeName:  t === "OTHER" ? (snapshot.customTypeName || null) : null,
          })
        ))
        setAdding(false)
        setNewBen({ ...EMPTY_NEW })
        const ts = Date.now()
        setBenefits(prev => [
          ...prev,
          ...snapshot.types.map((t, i) => ({
            id: `new-${ts}-${i}`,
            category:       snapshot.category,
            type:           t,
            description:    snapshot.description,
            unit:           BEN_META[t]?.unit ?? "R$",
            plannedValue:   val,
            realizedValue:  0,
            frequency:      snapshot.frequency,
            status:         "PLANNED" as const,
            customTypeName: t === "OTHER" ? (snapshot.customTypeName || null) : null,
          })),
        ])
      } catch (err) {
        console.error("Erro ao adicionar benefício:", err)
      }
    })
  }

  const inpCls = "w-full h-10 px-3 text-sm rounded-xl border border-slate-200 bg-white text-slate-800 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all"

  return (
    <div className="space-y-3">
      {benefits.length === 0 && !adding && (
        <div className="py-8 rounded-xl text-center" style={{ border: "1px dashed #CBD5E1", background: "#F8FAFC" }}>
          <Gem className="w-6 h-6 mx-auto mb-2 text-slate-300" />
          <p className="text-xs text-slate-400">Nenhum benefício registrado</p>
        </div>
      )}

      {/* Existing benefits */}
      {benefits.map(b => {
        const meta   = BEN_META[b.type]
        const cat    = BEN_CATEGORIES.find(c => c.value === b.category)!
        const stCfg  = BEN_STATUSES.find(s => s.value === b.status)!
        const isExp  = expanded === b.id
        const ev     = editValues[b.id]

        return (
          <div key={b.id} className="rounded-xl border overflow-hidden" style={{ borderColor: `${cat.color}25` }}>
            {/* Row header */}
            <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
              style={{ background: isExp ? cat.bg : "#fff" }}
              onClick={() => toggleExpand(b.id, b)}>
              <span className="text-sm">{cat.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-800 truncate">
                  {b.type === "OTHER" ? (b.customTypeName || "Outros") : (meta?.label ?? b.type)}
                </p>
                <p className="text-[10px] text-slate-400 truncate">{b.description || "—"}</p>
              </div>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0"
                style={{ background: stCfg.bg, color: stCfg.color }}>
                {stCfg.label}
              </span>
              <span className="text-xs font-semibold text-slate-600 shrink-0">
                {meta?.valueType === "currency" ? fmtBRL(b.plannedValue) : `${b.plannedValue} ${meta?.suffix ?? ""}`}
              </span>
              <button type="button"
                onClick={e => { e.stopPropagation(); handleDelete(b.id) }}
                disabled={isPending}
                className="p-1 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all ml-1">
                {deletingId === b.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </button>
              {isExp ? <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
            </div>

            {/* Expanded edit */}
            {isExp && ev && (
              <div className="px-4 pb-4 pt-2 space-y-3 border-t" style={{ borderColor: `${cat.color}15`, background: cat.bg }}>
                {/* Descrição */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Descrição</p>
                  <textarea rows={2} className={`${inpCls} h-auto py-2 resize-none`}
                    value={ev.description}
                    onChange={e => setEditValues(v => ({ ...v, [b.id]: { ...v[b.id], description: e.target.value } }))} />
                </div>

                {/* Valor + Frequência */}
                <div className="flex gap-3">
                  <div className="flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                      {meta?.valueType === "currency" ? "Valor (R$)" : `Resultado (${meta?.suffix})`}
                    </p>
                    {meta?.valueType === "currency" ? (
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-emerald-600">R$</span>
                        <input className={`${inpCls} pl-8`}
                          value={ev.plannedValue}
                          onChange={e => {
                            const raw = e.target.value.replace(/\D/g, "")
                            setEditValues(v => ({ ...v, [b.id]: { ...v[b.id], plannedValue: raw ? fmtBRLInput(raw) : "" } }))
                          }} />
                      </div>
                    ) : (
                      <div className="relative">
                        <input type="number" min={0} className={`${inpCls} pr-16`}
                          value={ev.plannedValue}
                          onChange={e => setEditValues(v => ({ ...v, [b.id]: { ...v[b.id], plannedValue: e.target.value } }))} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold px-1.5 py-0.5 rounded"
                          style={{ background: `${cat.color}15`, color: cat.color }}>
                          {meta?.suffix}
                        </span>
                      </div>
                    )}
                  </div>
                  {meta?.showFrequency && (
                    <div className="shrink-0">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Frequência</p>
                      <div className="flex gap-1.5">
                        {BEN_FREQS.map(f => (
                          <button key={f.value} type="button"
                            onClick={() => setEditValues(v => ({ ...v, [b.id]: { ...v[b.id], frequency: f.value } }))}
                            className="h-10 px-2.5 rounded-xl text-[11px] font-bold border-2 transition-all"
                            style={ev.frequency === f.value
                              ? { borderColor: cat.color, background: cat.color, color: "#fff" }
                              : { borderColor: "#E2E8F0", background: "#fff", color: "#94A3B8" }}>
                            {f.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Status */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Status</p>
                  <div className="flex flex-wrap gap-1.5">
                    {BEN_STATUSES.map(s => (
                      <button key={s.value} type="button"
                        onClick={() => setEditValues(v => ({ ...v, [b.id]: { ...v[b.id], status: s.value } }))}
                        className="px-3 py-1 rounded-full text-[11px] font-bold border-2 transition-all"
                        style={ev.status === s.value
                          ? { borderColor: s.color, background: s.color, color: "#fff" }
                          : { borderColor: "#E2E8F0", background: "#fff", color: "#94A3B8" }}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Save row */}
                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={() => setExpanded(null)}
                    className="px-3 h-8 text-xs font-semibold rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all">
                    Cancelar
                  </button>
                  <button type="button" onClick={() => handleSaveBenefit(b)}
                    disabled={isPending}
                    className="flex items-center gap-1.5 px-3 h-8 text-xs font-semibold rounded-lg text-white transition-all disabled:opacity-50"
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
        const activeCat = BEN_CATEGORIES.find(c => c.value === newBen.category)!
        const firstMeta = BEN_META[newBen.types[0]]
        const showFreq  = newBen.types.some(t => BEN_META[t]?.showFrequency)
        const hasOther  = newBen.types.includes("OTHER")
        const canAdd    = newBen.types.length > 0 && newBen.description.trim() && (!hasOther || newBen.customTypeName.trim())
        return (
          <div className="rounded-xl border-2 border-purple-200 overflow-hidden">
            {/* Category selector */}
            <div className="flex gap-1.5 px-4 py-3 border-b border-purple-100 bg-purple-50">
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
            <div className="p-4 space-y-3">
              {/* Type pills — multi-select */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Tipo</p>
                  {newBen.types.length > 1 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: `${activeCat.color}18`, color: activeCat.color }}>
                      {newBen.types.length} selecionados
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {BEN_TYPES_BY_CAT[newBen.category].map(t => {
                    const isSelected = newBen.types.includes(t)
                    return (
                      <button key={t} type="button"
                        onClick={() => setNewBen(n => {
                          const next = isSelected
                            ? n.types.filter(x => x !== t)
                            : [...n.types, t]
                          return { ...n, types: next.length > 0 ? next : [t], customTypeName: next.includes("OTHER") ? n.customTypeName : "" }
                        })}
                        className="px-2.5 py-1 rounded-full text-[11px] font-semibold border-2 transition-all"
                        style={isSelected
                          ? { borderColor: activeCat.color, background: activeCat.color, color: "#fff" }
                          : { borderColor: "#E2E8F0", background: "#fff", color: "#6b6880" }}>
                        {BEN_META[t]?.label ?? t}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Custom type name — only when Outros is selected */}
              {hasOther && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Nome do Benefício "Outros"</p>
                  <input
                    className={inpCls}
                    placeholder="Ex: Redução de licenças, Melhora em NPS..."
                    value={newBen.customTypeName}
                    onChange={e => setNewBen(n => ({ ...n, customTypeName: e.target.value }))}
                    autoFocus
                  />
                </div>
              )}

              {/* Description */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Descrição</p>
                <textarea rows={2} className={`${inpCls} h-auto py-2 resize-none`}
                  placeholder="Como este benefício será gerado?"
                  value={newBen.description}
                  onChange={e => setNewBen(n => ({ ...n, description: e.target.value }))} />
              </div>

              {/* Value + Frequency */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                    {firstMeta?.valueType === "currency" ? "Valor (R$)" : `Resultado (${firstMeta?.suffix ?? ""})`}
                  </p>
                  {firstMeta?.valueType === "currency" ? (
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-emerald-600">R$</span>
                      <input className={`${inpCls} pl-8`} placeholder="0,00"
                        value={newBen.plannedValue}
                        onChange={e => { const raw = e.target.value.replace(/\D/g, ""); setNewBen(n => ({ ...n, plannedValue: raw ? fmtBRLInput(raw) : "" })) }} />
                    </div>
                  ) : (
                    <div className="relative">
                      <input type="number" min={0} className={`${inpCls} pr-16`}
                        placeholder="0" value={newBen.plannedValue}
                        onChange={e => setNewBen(n => ({ ...n, plannedValue: e.target.value }))} />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-purple-600">{firstMeta?.suffix}</span>
                    </div>
                  )}
                </div>
                {showFreq && (
                  <div className="shrink-0">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Frequência</p>
                    <div className="flex gap-1.5">
                      {BEN_FREQS.map(f => (
                        <button key={f.value} type="button"
                          onClick={() => setNewBen(n => ({ ...n, frequency: f.value }))}
                          className="h-10 px-2.5 rounded-xl text-[11px] font-bold border-2 transition-all"
                          style={newBen.frequency === f.value
                            ? { borderColor: "#7B2FBE", background: "#7B2FBE", color: "#fff" }
                            : { borderColor: "#E2E8F0", background: "#fff", color: "#94A3B8" }}>
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => { setAdding(false); setNewBen({ ...EMPTY_NEW }) }}
                  className="px-3 h-8 text-xs font-semibold rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all">
                  Cancelar
                </button>
                <button type="button" onClick={handleAdd}
                  disabled={isPending || !canAdd}
                  className="flex items-center gap-1.5 px-4 h-8 text-xs font-semibold rounded-lg text-white transition-all disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #7B2FBE, #9333EA)" }}>
                  {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                  {newBen.types.length > 1 ? `Adicionar ${newBen.types.length} benefícios` : "Adicionar"}
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
                <BenefitsSection projectId={project.id} initialBenefits={benefits} />
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
