"use client"

import { useState, useTransition } from "react"
import {
  RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts"
import {
  Plus, Pencil, Trash2, ChevronDown, ChevronRight, UploadCloud,
  FileText, X, CheckCircle2, Clock, TrendingUp, DollarSign,
  Target, Loader2, PlusCircle, Eye, EyeOff,
} from "lucide-react"
import {
  createBenefit, updateBenefit, deleteBenefit, addMeasurement,
  deleteMeasurement, addBenefitAttachment, deleteBenefitAttachment,
  updateProjectInvestment, getProjectBenefits,
} from "@/lib/actions/benefits"
import { impactColor, impactBg, impactLabel } from "@/lib/utils/benefits-calc"
import type {
  BenefitItem, BenefitFormData, MeasurementFormData,
  ProjectBenefitMetrics, BenefitCategory, BenefitStatus,
} from "@/lib/types/benefits"
import {
  BENEFIT_CATEGORY_LABELS, BENEFIT_TYPE_LABELS, BENEFIT_TYPE_BY_CATEGORY,
  BENEFIT_STATUS_LABELS, BENEFIT_FREQUENCY_LABELS,
} from "@/lib/types/benefits"

const CAN_MANAGE = new Set(["ADMIN", "PROJECT_MANAGER"])

function fmtBRL(v: number) {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `R$ ${(v / 1_000).toFixed(0)}K`
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
}

function fmtDate(s: string | null) {
  if (!s) return "—"
  return new Date(s).toLocaleDateString("pt-BR")
}

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<BenefitStatus, { color: string; bg: string; label: string }> = {
  PLANNED:       { color: "#64748B", bg: "rgba(100,116,139,0.1)", label: "Planejado" },
  IN_PROGRESS:   { color: "#2563EB", bg: "rgba(37,99,235,0.1)",   label: "Em Medição" },
  REALIZED:      { color: "#059669", bg: "rgba(5,150,105,0.1)",   label: "Realizado" },
  NOT_REALIZED:  { color: "#DC2626", bg: "rgba(220,38,38,0.1)",   label: "Não Realizado" },
}

// ── Category colors ───────────────────────────────────────────────────────────
const CAT_CONFIG: Record<BenefitCategory, { color: string; bg: string; border: string }> = {
  FINANCIAL:   { color: "#059669", bg: "rgba(5,150,105,0.08)",   border: "rgba(5,150,105,0.2)"   },
  OPERATIONAL: { color: "#2563EB", bg: "rgba(37,99,235,0.08)",  border: "rgba(37,99,235,0.2)"   },
  STRATEGIC:   { color: "#7B2FBE", bg: "rgba(123,47,190,0.08)", border: "rgba(123,47,190,0.2)"  },
}

// ── Blank form ────────────────────────────────────────────────────────────────
const BLANK: BenefitFormData = {
  category: "FINANCIAL", type: "COST_REDUCTION", description: "",
  unit: "R$", plannedValue: 0, realizedValue: 0, frequency: "ONCE",
  baselineDate: null, realizationDate: null, evidence: null, status: "PLANNED",
  customTypeName: null,
}

// ── Impact Gauge ──────────────────────────────────────────────────────────────
function ImpactGauge({ score }: { score: number }) {
  const color = impactColor(score)
  const data = [{ value: score, fill: color }]
  return (
    <div className="flex flex-col items-center">
      <ResponsiveContainer width={140} height={100}>
        <RadialBarChart
          cx="50%" cy="80%"
          innerRadius="60%" outerRadius="100%"
          startAngle={180} endAngle={0}
          data={data}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar background={{ fill: "rgba(0,0,0,0.05)" }} dataKey="value" cornerRadius={6} />
        </RadialBarChart>
      </ResponsiveContainer>
      <p className="text-2xl font-black -mt-4" style={{ color }}>{score}</p>
      <p className="text-xs font-bold mt-0.5" style={{ color }}>{impactLabel(score)}</p>
    </div>
  )
}

// ── ROI Summary Card ──────────────────────────────────────────────────────────
function RoiCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string; icon: React.ElementType; color: string
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "rgba(0,0,0,0.02)", border: "1px solid rgba(0,0,0,0.06)" }}>
      <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${color}15` }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
        <p className="text-base font-black" style={{ color }}>{value}</p>
        {sub && <p className="text-[10px] text-slate-400">{sub}</p>}
      </div>
    </div>
  )
}

// ── Benefit Card ──────────────────────────────────────────────────────────────
function BenefitCard({
  benefit, canManage, onEdit, onDelete, onAddMeasurement,
}: {
  benefit: BenefitItem
  canManage: boolean
  onEdit: (b: BenefitItem) => void
  onDelete: (id: string) => void
  onAddMeasurement: (b: BenefitItem) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const cat = CAT_CONFIG[benefit.category]
  const st  = STATUS_CONFIG[benefit.status]

  const realizationPct = benefit.plannedValue > 0
    ? Math.min(100, Math.round((benefit.realizedValue / benefit.plannedValue) * 100))
    : 0

  return (
    <div
      className="rounded-xl overflow-hidden transition-all"
      style={{ border: `1px solid ${cat.border}`, background: cat.bg }}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{ color: cat.color, background: `${cat.color}18` }}>
                {BENEFIT_CATEGORY_LABELS[benefit.category]}
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ color: st.color, background: st.bg }}>
                {st.label}
              </span>
              <span className="text-[10px] text-slate-400 font-medium">
                {benefit.type === "OTHER" ? (benefit.customTypeName || "Outros") : BENEFIT_TYPE_LABELS[benefit.type]}
              </span>
            </div>
            <p className="text-sm font-semibold text-slate-800 leading-snug">{benefit.description}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {canManage && (
              <>
                <button onClick={() => onEdit(benefit)} className="p-1.5 rounded-lg hover:bg-white/60 text-slate-400 hover:text-slate-700 transition-all">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => onDelete(benefit.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-all">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            <button onClick={() => setExpanded((v) => !v)} className="p-1.5 rounded-lg hover:bg-white/60 text-slate-400 transition-all">
              {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Values row */}
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div>
            <p className="text-[10px] text-slate-400 font-medium mb-0.5">Planejado</p>
            <p className="text-sm font-bold text-slate-700">{benefit.unit === "R$" ? fmtBRL(benefit.plannedValue) : `${benefit.plannedValue} ${benefit.unit}`}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 font-medium mb-0.5">Realizado</p>
            <p className="text-sm font-bold" style={{ color: cat.color }}>
              {benefit.unit === "R$" ? fmtBRL(benefit.realizedValue) : `${benefit.realizedValue} ${benefit.unit}`}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 font-medium mb-0.5">Frequência</p>
            <p className="text-sm font-bold text-slate-700">{BENEFIT_FREQUENCY_LABELS[benefit.frequency]}</p>
          </div>
        </div>

        {/* Progress bar */}
        {benefit.plannedValue > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-white/60 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${realizationPct}%`, background: cat.color }}
              />
            </div>
            <span className="text-[10px] font-bold tabular-nums" style={{ color: cat.color }}>{realizationPct}%</span>
          </div>
        )}
      </div>

      {/* Expanded section */}
      {expanded && (
        <div className="border-t px-4 pb-4 pt-3 space-y-3" style={{ borderColor: cat.border, background: "rgba(255,255,255,0.5)" }}>
          {/* Meta */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            {[
              ["Data Baseline",   fmtDate(benefit.baselineDate)],
              ["Data Realização", fmtDate(benefit.realizationDate)],
              ["Evidência",       benefit.evidence ?? "—"],
            ].map(([k, v]) => (
              <div key={k}>
                <p className="text-[10px] font-bold uppercase text-slate-400">{k}</p>
                <p className="text-slate-700 mt-0.5 line-clamp-2">{v}</p>
              </div>
            ))}
          </div>

          {/* Measurement chart */}
          {benefit.measurements.length > 1 && (
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">Histórico de Medições</p>
              <ResponsiveContainer width="100%" height={100}>
                <AreaChart data={benefit.measurements.slice().reverse().map((m) => ({
                  date: new Date(m.measuredAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
                  value: m.measuredValue,
                }))}>
                  <defs>
                    <linearGradient id={`mg-${benefit.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={cat.color} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={cat.color} stopOpacity={0}   />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                  <XAxis dataKey="date" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} width={32} />
                  <Tooltip />
                  <Area type="monotone" dataKey="value" stroke={cat.color} fill={`url(#mg-${benefit.id})`} strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Measurement list */}
          {benefit.measurements.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">
                Últimas Medições ({benefit.measurements.length})
              </p>
              <div className="space-y-1.5">
                {benefit.measurements.slice(0, 5).map((m) => (
                  <div key={m.id} className="flex items-center justify-between text-xs bg-white/70 rounded-lg px-3 py-2">
                    <div>
                      <span className="font-semibold text-slate-700">
                        {benefit.unit === "R$" ? fmtBRL(m.measuredValue) : `${m.measuredValue} ${benefit.unit}`}
                      </span>
                      {m.notes && <span className="text-slate-400 ml-2">— {m.notes}</span>}
                    </div>
                    <span className="text-slate-400">{fmtDate(m.measuredAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Attachments */}
          {benefit.attachments.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">Evidências ({benefit.attachments.length})</p>
              <div className="space-y-1.5">
                {benefit.attachments.map((a) => (
                  <a
                    key={a.id}
                    href={a.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs bg-white/70 rounded-lg px-3 py-2 hover:bg-white transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-slate-700 truncate flex-1">{a.fileName}</span>
                    <span className="text-slate-400">{fmtDate(a.uploadedAt)}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          {canManage && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => onAddMeasurement(benefit)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold text-white transition-all"
                style={{ background: cat.color }}
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Registrar Medição
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Benefit Form Modal ────────────────────────────────────────────────────────
function BenefitModal({
  open, onClose, onSave, initial, projectId, loading,
}: {
  open: boolean; onClose: () => void; onSave: (d: BenefitFormData) => void
  initial?: BenefitFormData; projectId: string; loading: boolean
}) {
  const [form, setForm] = useState<BenefitFormData>(initial ?? BLANK)
  const set = (k: keyof BenefitFormData, v: unknown) => setForm((p) => ({ ...p, [k]: v }))

  // Reset form when modal opens
  useState(() => { if (open) setForm(initial ?? BLANK) })

  if (!open) return null

  const types = BENEFIT_TYPE_BY_CATEGORY[form.category]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: "#fff", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-800">{initial ? "Editar Benefício" : "Novo Benefício"}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4 flex-1">
          {/* Category + Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Categoria</label>
              <select className="field-input" value={form.category} onChange={(e) => { set("category", e.target.value); set("type", BENEFIT_TYPE_BY_CATEGORY[e.target.value as BenefitCategory][0]); set("customTypeName", null) }}>
                {(Object.keys(BENEFIT_CATEGORY_LABELS) as BenefitCategory[]).map((k) => (
                  <option key={k} value={k}>{BENEFIT_CATEGORY_LABELS[k]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Tipo de Benefício</label>
              <select className="field-input" value={form.type} onChange={(e) => { set("type", e.target.value); if (e.target.value !== "OTHER") set("customTypeName", null) }}>
                {types.map((t) => <option key={t} value={t}>{BENEFIT_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
          </div>

          {/* Custom type name — shown only when "Outros" is selected */}
          {form.type === "OTHER" && (
            <div>
              <label className="field-label">Nome do Tipo de Benefício</label>
              <input
                type="text"
                className="field-input"
                value={form.customTypeName ?? ""}
                onChange={(e) => set("customTypeName", e.target.value || null)}
                placeholder="Descreva o tipo de benefício..."
                autoFocus
              />
            </div>
          )}

          {/* Description */}
          <div>
            <label className="field-label">Descrição</label>
            <textarea
              className="field-input resize-none"
              rows={2}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Descreva o benefício obtido..."
            />
          </div>

          {/* Values */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="field-label">Valor Planejado</label>
              <input type="number" className="field-input" value={form.plannedValue} onChange={(e) => set("plannedValue", Number(e.target.value))} min={0} />
            </div>
            <div>
              <label className="field-label">Valor Realizado</label>
              <input type="number" className="field-input" value={form.realizedValue} onChange={(e) => set("realizedValue", Number(e.target.value))} min={0} />
            </div>
            <div>
              <label className="field-label">Unidade</label>
              <input type="text" className="field-input" value={form.unit} onChange={(e) => set("unit", e.target.value)} placeholder="R$, horas, %" />
            </div>
          </div>

          {/* Frequency + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Frequência</label>
              <select className="field-input" value={form.frequency} onChange={(e) => set("frequency", e.target.value)}>
                {Object.entries(BENEFIT_FREQUENCY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Status</label>
              <select className="field-input" value={form.status} onChange={(e) => set("status", e.target.value)}>
                {Object.entries(BENEFIT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Data Baseline</label>
              <input type="date" className="field-input" value={form.baselineDate ?? ""} onChange={(e) => set("baselineDate", e.target.value || null)} />
            </div>
            <div>
              <label className="field-label">Data Realização</label>
              <input type="date" className="field-input" value={form.realizationDate ?? ""} onChange={(e) => set("realizationDate", e.target.value || null)} />
            </div>
          </div>

          {/* Evidence */}
          <div>
            <label className="field-label">Evidência (texto ou link)</label>
            <input type="text" className="field-input" value={form.evidence ?? ""} onChange={(e) => set("evidence", e.target.value || null)} placeholder="Descrição ou URL da evidência" />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-all">Cancelar</button>
          <button
            onClick={() => onSave(form)}
            disabled={loading || !form.description.trim() || (form.type === "OTHER" && !form.customTypeName?.trim())}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50 flex items-center gap-2"
            style={{ background: "linear-gradient(135deg,#7B2FBE,#A855F7)" }}
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {initial ? "Salvar Alterações" : "Criar Benefício"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Measurement Modal ─────────────────────────────────────────────────────────
function MeasurementModal({
  open, onClose, onSave, benefit, loading,
}: {
  open: boolean; onClose: () => void; onSave: (d: MeasurementFormData) => void
  benefit: BenefitItem | null; loading: boolean
}) {
  const [form, setForm] = useState<MeasurementFormData>({
    measuredAt: new Date().toISOString().split("T")[0],
    measuredValue: 0,
    notes: null,
  })

  if (!open || !benefit) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-md rounded-2xl shadow-2xl"
        style={{ background: "#fff" }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-800">Registrar Medição</h2>
            <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[300px]">{benefit.description}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Data da Medição</label>
              <input type="date" className="field-input" value={form.measuredAt}
                onChange={(e) => setForm((p) => ({ ...p, measuredAt: e.target.value }))} />
            </div>
            <div>
              <label className="field-label">Valor ({benefit.unit})</label>
              <input type="number" className="field-input" value={form.measuredValue} min={0}
                onChange={(e) => setForm((p) => ({ ...p, measuredValue: Number(e.target.value) }))} />
            </div>
          </div>
          <div>
            <label className="field-label">Observações</label>
            <textarea className="field-input resize-none" rows={2} value={form.notes ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value || null }))}
              placeholder="Fonte dos dados, metodologia..." />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancelar</button>
          <button
            onClick={() => onSave(form)}
            disabled={loading}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white flex items-center gap-2 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg,#7B2FBE,#A855F7)" }}
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Registrar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Client Component ──────────────────────────────────────────────────────
interface Props {
  projectId: string
  projectTitle: string
  benefits: BenefitItem[]
  metrics: ProjectBenefitMetrics
  investment: number
  userRole: string
}

export function ProjectBenefitsClient({ projectId, projectTitle, benefits: initialBenefits, metrics: initialMetrics, investment: initialInvestment, userRole }: Props) {
  const canManage = CAN_MANAGE.has(userRole)
  const [benefits, setBenefits]   = useState(initialBenefits)
  const [metrics,  setMetrics]    = useState(initialMetrics)
  const [investment, setInvestmentState] = useState(initialInvestment)
  const [editingInvestment, setEditingInvestment] = useState(false)
  const [invInput, setInvInput]   = useState(String(initialInvestment))

  // Modals
  const [formOpen,    setFormOpen]    = useState(false)
  const [editBenefit, setEditBenefit] = useState<BenefitItem | null>(null)
  const [measOpen,    setMeasOpen]    = useState(false)
  const [measBenefit, setMeasBenefit] = useState<BenefitItem | null>(null)

  // Uploading
  const [uploadingBenefitId, setUploadingBenefitId] = useState<string | null>(null)

  const [isPending, startTransition] = useTransition()
  const [activeCategory, setActiveCategory] = useState<BenefitCategory | "ALL">("ALL")

  // ── Refresh data (plain async — chamada dentro das transitions existentes) ──
  const refresh = async () => {
    const data = await getProjectBenefits(projectId)
    setBenefits(data.benefits)
    setMetrics(data.metrics)
    setInvestmentState(data.investment)
  }

  // ── Create / update benefit ─────────────────────────────────────────────────
  const handleSaveBenefit = (data: BenefitFormData) => {
    startTransition(async () => {
      try {
        if (editBenefit) {
          await updateBenefit(editBenefit.id, data)
        } else {
          await createBenefit(projectId, data)
        }
        setFormOpen(false)
        setEditBenefit(null)
        await refresh()
      } catch (err) {
        console.error("Erro ao salvar benefício:", err)
      }
    })
  }

  const handleDelete = (id: string) => {
    if (!confirm("Excluir este benefício?")) return
    startTransition(async () => {
      try {
        await deleteBenefit(id)
        await refresh()
      } catch (err) {
        console.error("Erro ao deletar benefício:", err)
      }
    })
  }

  // ── Measurement ────────────────────────────────────────────────────────────
  const handleSaveMeasurement = (data: MeasurementFormData) => {
    if (!measBenefit) return
    startTransition(async () => {
      try {
        await addMeasurement(measBenefit.id, data)
        setMeasOpen(false)
        setMeasBenefit(null)
        await refresh()
      } catch (err) {
        console.error("Erro ao salvar medição:", err)
      }
    })
  }

  // ── Investment ─────────────────────────────────────────────────────────────
  const handleSaveInvestment = () => {
    startTransition(async () => {
      try {
        await updateProjectInvestment(projectId, Number(invInput) || 0)
        setEditingInvestment(false)
        await refresh()
      } catch (err) {
        console.error("Erro ao salvar investimento:", err)
      }
    })
  }

  // ── Upload ─────────────────────────────────────────────────────────────────
  const handleUpload = async (benefitId: string, files: FileList) => {
    setUploadingBenefitId(benefitId)
    try {
      const fd = new FormData()
      Array.from(files).forEach((f) => fd.append("files", f))
      const res = await fetch("/api/upload", { method: "POST", body: fd })
      const json = await res.json() as { files: { name: string; url: string; size: number }[] }
      for (const f of json.files) {
        const mime = files[0]?.type ?? "application/octet-stream"
        await addBenefitAttachment(benefitId, { fileName: f.name, fileUrl: f.url, fileType: mime, fileSize: f.size })
      }
      await refresh()
    } finally {
      setUploadingBenefitId(null)
    }
  }

  // ── Filter by category ─────────────────────────────────────────────────────
  const filtered = activeCategory === "ALL" ? benefits : benefits.filter((b) => b.category === activeCategory)
  const categoryCounts = {
    FINANCIAL:   benefits.filter((b) => b.category === "FINANCIAL").length,
    OPERATIONAL: benefits.filter((b) => b.category === "OPERATIONAL").length,
    STRATEGIC:   benefits.filter((b) => b.category === "STRATEGIC").length,
  }

  return (
    <>
      <style>{`
        .field-label { display:block; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#9ca3af; margin-bottom:4px; }
        .field-input { width:100%; border:1px solid #e2e8f0; border-radius:8px; padding:7px 10px; font-size:13px; color:#1a1625; background:#fff; outline:none; transition:border .15s; }
        .field-input:focus { border-color:#7B2FBE; box-shadow:0 0 0 3px rgba(123,47,190,.12); }
        .field-input option { color:#1a1625; }
      `}</style>

      {/* ── Top Summary ─────────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
      >
        <div className="h-1 w-full" style={{ background: "linear-gradient(90deg,#10B981,#3B82F6,#7B2FBE)" }} />
        <div className="p-5 bg-white">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h2 className="text-base font-bold text-slate-800">Resumo de Valor Gerado</h2>
            {canManage && (
              <button
                onClick={() => { setEditBenefit(null); setFormOpen(true) }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all"
                style={{ background: "linear-gradient(135deg,#7B2FBE,#A855F7)" }}
              >
                <Plus className="w-4 h-4" />
                Novo Benefício
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* ROI cards */}
            <div className="md:col-span-2 grid grid-cols-2 gap-3">
              <RoiCard
                label="Total Realizado" icon={CheckCircle2} color="#059669"
                value={fmtBRL(metrics.totalRealized)}
                sub={`${metrics.realizedCount}/${metrics.benefitCount} benefícios`}
              />
              <RoiCard
                label="ROI" icon={TrendingUp} color={metrics.roi !== null && metrics.roi >= 0 ? "#059669" : "#DC2626"}
                value={metrics.roi !== null ? `${metrics.roi >= 0 ? "+" : ""}${Math.round(metrics.roi)}%` : "—"}
                sub={metrics.roi !== null ? "retorno sobre investimento" : "sem investimento cadastrado"}
              />
              <RoiCard
                label="Payback" icon={Clock} color="#2563EB"
                value={metrics.paybackMonths !== null ? `${metrics.paybackMonths.toFixed(1)} meses` : "—"}
                sub={metrics.paybackMonths !== null ? "para recuperar investimento" : undefined}
              />
              {/* Investment (editable) */}
              <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "rgba(0,0,0,0.02)", border: "1px solid rgba(0,0,0,0.06)" }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(217,119,6,0.1)" }}>
                  <DollarSign className="w-4 h-4 text-amber-600" />
                </div>
                <div className="flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Investimento</p>
                  {editingInvestment && canManage ? (
                    <div className="flex items-center gap-1 mt-0.5">
                      <input
                        type="number" min={0}
                        value={invInput}
                        onChange={(e) => setInvInput(e.target.value)}
                        className="w-full text-sm border border-slate-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-purple-400"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === "Enter") handleSaveInvestment(); if (e.key === "Escape") setEditingInvestment(false) }}
                      />
                      <button onClick={handleSaveInvestment} className="p-0.5 text-green-600"><CheckCircle2 className="w-4 h-4" /></button>
                      <button onClick={() => setEditingInvestment(false)} className="p-0.5 text-slate-400"><X className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <p className="text-base font-black text-amber-600">{investment > 0 ? fmtBRL(investment) : "—"}</p>
                      {canManage && (
                        <button onClick={() => { setInvInput(String(investment)); setEditingInvestment(true) }}
                          className="p-0.5 text-slate-300 hover:text-slate-500">
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Impact Gauge */}
            <div
              className="flex flex-col items-center justify-center p-4 rounded-xl"
              style={{ background: impactBg(metrics.impactScore), border: `1px solid ${impactColor(metrics.impactScore)}20` }}
            >
              <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: impactColor(metrics.impactScore) }}>
                Score de Impacto Estratégico
              </p>
              <ImpactGauge score={metrics.impactScore} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Benefits List ────────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
      >
        {/* Category tabs */}
        <div className="flex items-center gap-1 p-4 bg-white border-b border-slate-100 flex-wrap">
          {([["ALL", "Todos", benefits.length], ["FINANCIAL", "Financeiro", categoryCounts.FINANCIAL], ["OPERATIONAL", "Operacional", categoryCounts.OPERATIONAL], ["STRATEGIC", "Estratégico", categoryCounts.STRATEGIC]] as [BenefitCategory | "ALL", string, number][]).map(([cat, label, count]) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeCategory === cat
                  ? "text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
              }`}
              style={activeCategory === cat ? { background: cat === "ALL" ? "linear-gradient(135deg,#7B2FBE,#A855F7)" : CAT_CONFIG[cat].color } : {}}
            >
              {label}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeCategory === cat ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500"}`}>
                {count}
              </span>
            </button>
          ))}

          {/* Upload for all */}
          {canManage && measBenefit === null && filtered.length > 0 && (
            <label className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-purple-600 hover:text-purple-800 cursor-pointer transition-colors">
              <UploadCloud className="w-3.5 h-3.5" />
              Evidência
              <input type="file" className="hidden" accept="image/*,.pdf,.docx,.xlsx,.zip" multiple
                onChange={(e) => {
                  const first = filtered[0]
                  if (e.target.files && first) handleUpload(first.id, e.target.files)
                }}
              />
            </label>
          )}
        </div>

        <div className="p-4 bg-slate-50/50 space-y-3">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              <Target className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p>Nenhum benefício cadastrado nesta categoria.</p>
              {canManage && (
                <button
                  onClick={() => { setEditBenefit(null); setFormOpen(true) }}
                  className="mt-3 text-purple-600 font-semibold hover:text-purple-800 flex items-center gap-1 mx-auto"
                >
                  <Plus className="w-4 h-4" /> Adicionar benefício
                </button>
              )}
            </div>
          ) : filtered.map((b) => (
            <div key={b.id} className="relative">
              <BenefitCard
                benefit={b}
                canManage={canManage}
                onEdit={(ben) => { setEditBenefit(ben); setFormOpen(true) }}
                onDelete={handleDelete}
                onAddMeasurement={(ben) => { setMeasBenefit(ben); setMeasOpen(true) }}
              />
              {canManage && (
                <label
                  className="absolute top-3 right-16 cursor-pointer text-slate-400 hover:text-purple-600 transition-colors"
                  title="Upload de evidência"
                >
                  {uploadingBenefitId === b.id
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <UploadCloud className="w-4 h-4" />
                  }
                  <input type="file" className="hidden" accept="image/*,.pdf,.docx,.xlsx,.zip" multiple
                    onChange={(e) => { if (e.target.files) handleUpload(b.id, e.target.files) }} />
                </label>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────────── */}
      <BenefitModal
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditBenefit(null) }}
        onSave={handleSaveBenefit}
        initial={editBenefit ? {
          category:        editBenefit.category,
          type:            editBenefit.type,
          description:     editBenefit.description,
          unit:            editBenefit.unit,
          plannedValue:    editBenefit.plannedValue,
          realizedValue:   editBenefit.realizedValue,
          frequency:       editBenefit.frequency,
          baselineDate:    editBenefit.baselineDate ? editBenefit.baselineDate.split("T")[0] : null,
          realizationDate: editBenefit.realizationDate ? editBenefit.realizationDate.split("T")[0] : null,
          evidence:        editBenefit.evidence,
          status:          editBenefit.status,
        } : undefined}
        projectId={projectId}
        loading={isPending}
      />

      <MeasurementModal
        open={measOpen}
        onClose={() => { setMeasOpen(false); setMeasBenefit(null) }}
        onSave={handleSaveMeasurement}
        benefit={measBenefit}
        loading={isPending}
      />
    </>
  )
}
