"use client"

import { useState, useTransition } from "react"
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from "recharts"
import {
  Pencil, Trash2, ChevronDown, ChevronRight,
  Loader2, PlusCircle, FileText, BarChart3,
} from "lucide-react"
import {
  updateBenefit, deleteBenefit, addMeasurement, getProjectBenefits,
} from "@/lib/actions/benefits"
import type {
  BenefitItem, MeasurementFormData, BenefitCategory, BenefitStatus,
} from "@/lib/types/benefits"
import {
  BENEFIT_CATEGORY_LABELS, BENEFIT_TYPE_LABELS,
  BENEFIT_STATUS_LABELS, BENEFIT_FREQUENCY_LABELS,
  BENEFIT_PERIODICITY_LABELS,
} from "@/lib/types/benefits"

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtBRL(v: number) {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `R$ ${(v / 1_000).toFixed(0)}K`
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
}
function fmtDate(s: string | null) {
  if (!s) return "—"
  return new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
}

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CFG: Record<BenefitStatus, { color: string; bg: string; label: string }> = {
  PLANNED:       { color: "#64748B", bg: "#F1F5F9",  label: "Planejado"     },
  IN_PROGRESS:   { color: "#2563EB", bg: "#EFF6FF",  label: "Em Medição"    },
  REALIZED:      { color: "#059669", bg: "#ECFDF5",  label: "Realizado"     },
  PARTIAL:       { color: "#D97706", bg: "#FFFBEB",  label: "Parcial"       },
  NOT_REALIZED:  { color: "#DC2626", bg: "#FEF2F2",  label: "Não Realizado" },
  CANCELLED:     { color: "#9CA3AF", bg: "#F9FAFB",  label: "Cancelado"     },
}

// ── Category config ───────────────────────────────────────────────────────────
const CAT_CFG: Record<BenefitCategory, { color: string; bg: string; border: string; icon: string }> = {
  FINANCIAL:   { color: "#059669", bg: "rgba(5,150,105,0.07)",   border: "rgba(5,150,105,0.18)",   icon: "💰" },
  OPERATIONAL: { color: "#2563EB", bg: "rgba(37,99,235,0.07)",   border: "rgba(37,99,235,0.18)",   icon: "⚙️" },
  STRATEGIC:   { color: "#7B2FBE", bg: "rgba(123,47,190,0.07)", border: "rgba(123,47,190,0.18)",  icon: "🎯" },
  COMPLIANCE:  { color: "#D97706", bg: "rgba(217,119,6,0.07)",   border: "rgba(217,119,6,0.18)",   icon: "🛡️" },
}

const CAN_MANAGE_ROLES = new Set(["ADMIN", "PROJECT_MANAGER"])

// ── Inline Edit Form ──────────────────────────────────────────────────────────
function InlineEditForm({
  benefit, onSave, onCancel, loading,
}: {
  benefit: BenefitItem
  onSave: (fields: { status: BenefitStatus; plannedValue: number; realizedValue: number; indicator: string | null; notes: string | null }) => void
  onCancel: () => void
  loading: boolean
}) {
  const [status,        setStatus]        = useState<BenefitStatus>(benefit.status)
  const [plannedValue,  setPlannedValue]  = useState(benefit.plannedValue)
  const [realizedValue, setRealizedValue] = useState(benefit.realizedValue)
  const [indicator,     setIndicator]     = useState(benefit.indicator ?? "")
  const [notes,         setNotes]         = useState(benefit.notes ?? "")

  return (
    <div className="inline-edit">
      <div className="inline-edit-section">
        <p className="field-label">Status</p>
        <div className="status-pills">
          {(Object.keys(STATUS_CFG) as BenefitStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className="status-pill"
              style={status === s
                ? { background: STATUS_CFG[s].color, color: "#fff", borderColor: STATUS_CFG[s].color }
                : { background: "transparent", color: STATUS_CFG[s].color, borderColor: STATUS_CFG[s].color }
              }
            >
              {STATUS_CFG[s].label}
            </button>
          ))}
        </div>
      </div>

      <div className="inline-edit-grid">
        <div>
          <label className="field-label">Valor Previsto ({benefit.unit})</label>
          <input
            type="number" min={0} className="field-input"
            value={plannedValue}
            onChange={(e) => setPlannedValue(Number(e.target.value))}
          />
        </div>
        <div>
          <label className="field-label">Valor Realizado ({benefit.unit})</label>
          <input
            type="number" min={0} className="field-input"
            value={realizedValue}
            onChange={(e) => setRealizedValue(Number(e.target.value))}
          />
        </div>
        <div>
          <label className="field-label">Indicador</label>
          <input
            type="text" className="field-input"
            value={indicator}
            onChange={(e) => setIndicator(e.target.value)}
            placeholder="ex: % redução de custo"
          />
        </div>
        <div>
          <label className="field-label">Observações</label>
          <input
            type="text" className="field-input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notas adicionais..."
          />
        </div>
      </div>

      <div className="inline-edit-actions">
        <button onClick={onCancel} className="btn-ghost">Cancelar</button>
        <button
          onClick={() => onSave({
            status,
            plannedValue,
            realizedValue,
            indicator: indicator.trim() || null,
            notes: notes.trim() || null,
          })}
          disabled={loading}
          className="btn-primary"
        >
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Salvar
        </button>
      </div>
    </div>
  )
}

// ── Add Measurement Form ──────────────────────────────────────────────────────
function AddMeasurementForm({
  benefit, onSave, onCancel, loading,
}: {
  benefit: BenefitItem
  onSave: (d: MeasurementFormData) => void
  onCancel: () => void
  loading: boolean
}) {
  const [form, setForm] = useState<MeasurementFormData>({
    measuredAt: new Date().toISOString().split("T")[0],
    measuredValue: 0,
    notes: null,
  })

  return (
    <div className="inline-edit">
      <p className="inline-edit-title">Registrar Medição</p>
      <div className="inline-edit-grid">
        <div>
          <label className="field-label">Data</label>
          <input
            type="date" className="field-input"
            value={form.measuredAt}
            onChange={(e) => setForm((p) => ({ ...p, measuredAt: e.target.value }))}
          />
        </div>
        <div>
          <label className="field-label">Valor ({benefit.unit})</label>
          <input
            type="number" min={0} className="field-input"
            value={form.measuredValue}
            onChange={(e) => setForm((p) => ({ ...p, measuredValue: Number(e.target.value) }))}
          />
        </div>
        <div className="col-span-2">
          <label className="field-label">Observações</label>
          <input
            type="text" className="field-input"
            value={form.notes ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value || null }))}
            placeholder="Fonte dos dados, metodologia..."
          />
        </div>
      </div>
      <div className="inline-edit-actions">
        <button onClick={onCancel} className="btn-ghost">Cancelar</button>
        <button
          onClick={() => onSave(form)}
          disabled={loading}
          className="btn-primary"
        >
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Registrar
        </button>
      </div>
    </div>
  )
}

// ── Benefit Card ──────────────────────────────────────────────────────────────
function BenefitCard({
  benefit, canManage, onEdit, onDelete, onMeasurementAdded, isPending,
}: {
  benefit: BenefitItem
  canManage: boolean
  onEdit: (id: string, fields: { status: BenefitStatus; plannedValue: number; realizedValue: number; indicator: string | null; notes: string | null }) => void
  onDelete: (id: string) => void
  onMeasurementAdded: (benefitId: string, data: MeasurementFormData) => void
  isPending: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [measOpen, setMeasOpen] = useState(false)

  const cat = CAT_CFG[benefit.category]
  const st  = STATUS_CFG[benefit.status]

  const chartData = benefit.measurements.length > 1
    ? benefit.measurements.slice().sort((a, b) =>
        new Date(a.measuredAt).getTime() - new Date(b.measuredAt).getTime()
      ).map((m) => ({
        date: new Date(m.measuredAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
        valor: m.measuredValue,
      }))
    : []

  const typeLabel = benefit.type === "OTHER"
    ? (benefit.customTypeName || "Outros")
    : BENEFIT_TYPE_LABELS[benefit.type]

  return (
    <div className="benefit-card" style={{ borderColor: cat.border }}>
      {/* Left accent stripe */}
      <div className="benefit-stripe" style={{ background: cat.color }} />

      <div className="benefit-body">
        {/* Header row */}
        <div className="benefit-header">
          <div className="benefit-meta">
            <span className="cat-chip" style={{ color: cat.color, background: cat.bg, borderColor: cat.border }}>
              {cat.icon} {BENEFIT_CATEGORY_LABELS[benefit.category]}
            </span>
            <span className="status-chip" style={{ color: st.color, background: st.bg }}>
              {st.label}
            </span>
            <span className="type-chip">{typeLabel}</span>
          </div>
          <div className="benefit-actions">
            {canManage && !editOpen && !measOpen && (
              <>
                <button
                  onClick={() => { setEditOpen(true); setMeasOpen(false); setExpanded(true) }}
                  className="icon-btn" title="Editar"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onDelete(benefit.id)}
                  className="icon-btn icon-btn--danger" title="Excluir"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            <button
              onClick={() => setExpanded((v) => !v)}
              className="icon-btn expand-btn"
              aria-expanded={expanded}
            >
              {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Name / description */}
        <p className="benefit-name">{benefit.name || benefit.description}</p>
        {benefit.name && <p className="benefit-desc">{benefit.description}</p>}

        {/* Expanded section */}
        {expanded && (
          <div className="benefit-expanded">
            {/* Edit form */}
            {editOpen && (
              <InlineEditForm
                benefit={benefit}
                loading={isPending}
                onCancel={() => setEditOpen(false)}
                onSave={(fields) => {
                  onEdit(benefit.id, fields)
                  setEditOpen(false)
                }}
              />
            )}

            {/* Add measurement form */}
            {measOpen && !editOpen && (
              <AddMeasurementForm
                benefit={benefit}
                loading={isPending}
                onCancel={() => setMeasOpen(false)}
                onSave={(data) => {
                  onMeasurementAdded(benefit.id, data)
                  setMeasOpen(false)
                }}
              />
            )}

            {/* Chart */}
            {!editOpen && !measOpen && chartData.length > 1 && (
              <div className="meas-chart">
                <p className="section-sublabel">Histórico de Medições</p>
                <ResponsiveContainer width="100%" height={90}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id={`g-${benefit.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={cat.color} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={cat.color} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: "#94A3B8" }} axisLine={false} tickLine={false} width={38} />
                    <Tooltip
                      contentStyle={{ fontSize: 11, background: "#fff", border: "1px solid #E8E4F0", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                      itemStyle={{ color: cat.color }}
                    />
                    <Area
                      type="monotone" dataKey="valor" stroke={cat.color}
                      fill={`url(#g-${benefit.id})`} strokeWidth={2} dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Measurement list */}
            {!editOpen && !measOpen && benefit.measurements.length > 0 && (
              <div>
                <p className="section-sublabel">Últimas medições ({benefit.measurements.length})</p>
                <div className="meas-list">
                  {benefit.measurements.slice(0, 6).map((m) => (
                    <div key={m.id} className="meas-row">
                      <span className="meas-val" style={{ color: cat.color }}>
                        {benefit.unit === "R$" ? fmtBRL(m.measuredValue) : `${m.measuredValue} ${benefit.unit}`}
                      </span>
                      <span className="meas-date">{fmtDate(m.measuredAt)}</span>
                      {m.notes && <span className="meas-notes">{m.notes}</span>}
                      <span className="meas-by">{m.createdBy.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Attachments */}
            {!editOpen && !measOpen && benefit.attachments.length > 0 && (
              <div>
                <p className="section-sublabel">Evidências ({benefit.attachments.length})</p>
                <div className="attach-list">
                  {benefit.attachments.map((a) => (
                    <a
                      key={a.id} href={a.fileUrl}
                      target="_blank" rel="noopener noreferrer"
                      className="attach-row"
                    >
                      <FileText className="w-3.5 h-3.5 text-slate-400" />
                      <span className="attach-name">{a.fileName}</span>
                      <span className="attach-date">{fmtDate(a.uploadedAt)}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Expanded bottom actions */}
            {!editOpen && !measOpen && canManage && (
              <div className="expanded-actions">
                <button
                  onClick={() => { setMeasOpen(true); setEditOpen(false) }}
                  className="btn-outline"
                  style={{ color: cat.color, borderColor: cat.border }}
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  Registrar Medição
                </button>
              </div>
            )}

            {/* Meta details */}
            {!editOpen && !measOpen && (
              <div className="meta-grid">
                {[
                  ["Frequência",     BENEFIT_FREQUENCY_LABELS[benefit.frequency]],
                  ["Periodicidade",  BENEFIT_PERIODICITY_LABELS[benefit.periodicity]],
                  ["Previsto",       benefit.unit === "R$" ? fmtBRL(benefit.plannedValue) : `${benefit.plannedValue} ${benefit.unit}`],
                  ["Realizado",      benefit.unit === "R$" ? fmtBRL(benefit.realizedValue) : `${benefit.realizedValue} ${benefit.unit}`],
                  ["Baseline",       fmtDate(benefit.baselineDate)],
                  ["Meta (data)",    fmtDate(benefit.targetDate)],
                  ["Realização",     fmtDate(benefit.realizationDate)],
                  ["Meses Monitor.", String(benefit.monitoringMonths)],
                  ["Evidência",      benefit.evidence ?? "—"],
                  ["Fórmula",        benefit.formula  ?? "—"],
                  ["Indicador",      benefit.indicator ?? "—"],
                  ["Responsável",    benefit.responsibleName ?? "—"],
                  ["Notas",          benefit.notes ?? "—"],
                ].filter(([, v]) => v !== "—").map(([k, v]) => (
                  <div key={k} className="meta-item">
                    <span className="meta-key">{k}</span>
                    <span className="meta-val">{v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
interface Props {
  projectId: string
  projectTitle: string
  benefits: BenefitItem[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metrics: any
  investment: number
  userRole: string
}

export function ProjectBenefitsClient({
  projectId, benefits: init, userRole,
}: Props) {
  const canManage = CAN_MANAGE_ROLES.has(userRole)
  const [benefits,  setBenefits]  = useState(init)
  const [isPending, startTransition] = useTransition()
  const [activeCategory, setActiveCategory] = useState<BenefitCategory | "ALL">("ALL")

  const refresh = async () => {
    const data = await getProjectBenefits(projectId)
    setBenefits(data.benefits)
  }

  const handleEdit = (
    id: string,
    fields: { status: BenefitStatus; plannedValue: number; realizedValue: number; indicator: string | null; notes: string | null }
  ) => {
    startTransition(async () => {
      try {
        await updateBenefit(id, {
          status:        fields.status,
          plannedValue:  fields.plannedValue,
          realizedValue: fields.realizedValue,
          indicator:     fields.indicator,
          notes:         fields.notes,
        })
        await refresh()
      } catch (err) { console.error(err) }
    })
  }

  const handleDelete = (id: string) => {
    if (!confirm("Excluir este benefício permanentemente?")) return
    startTransition(async () => {
      try {
        await deleteBenefit(id)
        await refresh()
      } catch (err) { console.error(err) }
    })
  }

  const handleMeasurement = (benefitId: string, data: MeasurementFormData) => {
    startTransition(async () => {
      try {
        await addMeasurement(benefitId, data)
        await refresh()
      } catch (err) { console.error(err) }
    })
  }

  const filtered = activeCategory === "ALL"
    ? benefits
    : benefits.filter((b) => b.category === activeCategory)

  const catCounts = {
    ALL:         benefits.length,
    FINANCIAL:   benefits.filter((b) => b.category === "FINANCIAL").length,
    OPERATIONAL: benefits.filter((b) => b.category === "OPERATIONAL").length,
    STRATEGIC:   benefits.filter((b) => b.category === "STRATEGIC").length,
    COMPLIANCE:  benefits.filter((b) => b.category === "COMPLIANCE").length,
  }

  return (
    <>
      {/* ── Global styles ─────────────────────────────────────────────────── */}
      <style>{`
        :root{--purple:#7B2FBE;--ink:#0F0A1E;--mist:#F5F3FA;--steel:#64748B;--divider:#E8E4F0;--card-bg:#fff;--r:12px;--rs:8px}
        .field-label{display:block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#94A3B8;margin-bottom:4px}
        .field-input{width:100%;border:1px solid var(--divider);border-radius:var(--rs);padding:7px 10px;font-size:13px;color:var(--ink);background:#fff;outline:none;transition:border .15s,box-shadow .15s;font-variant-numeric:tabular-nums}
        .field-input:focus{border-color:var(--purple);box-shadow:0 0 0 3px rgba(123,47,190,.1)}
        .benefit-card{display:flex;background:var(--card-bg);border:1px solid;border-radius:var(--r);overflow:hidden;transition:box-shadow .15s}
        .benefit-card:hover{box-shadow:0 2px 12px rgba(15,10,30,.07)}
        .benefit-stripe{width:4px;flex-shrink:0}
        .benefit-body{flex:1;padding:14px 16px;min-width:0}
        .benefit-header{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px}
        .benefit-meta{display:flex;flex-wrap:wrap;gap:5px;align-items:center}
        .benefit-actions{display:flex;align-items:center;gap:2px;flex-shrink:0}
        .benefit-name{font-size:13px;font-weight:700;color:var(--ink);line-height:1.35;margin-bottom:2px}
        .benefit-desc{font-size:12px;color:var(--steel);line-height:1.4}
        .cat-chip{display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px;border:1px solid}
        .status-chip{font-size:10px;font-weight:600;padding:2px 8px;border-radius:99px}
        .type-chip{font-size:10px;color:#94A3B8;font-weight:500}
        .icon-btn{width:28px;height:28px;border-radius:var(--rs);display:flex;align-items:center;justify-content:center;color:#94A3B8;transition:background .12s,color .12s;cursor:pointer;border:none;background:transparent}
        .icon-btn:hover{background:var(--mist);color:var(--ink)}
        .icon-btn--danger:hover{background:#FEF2F2;color:#DC2626}
        .expand-btn:hover{background:var(--mist);color:var(--purple)}
        .btn-primary{display:inline-flex;align-items:center;gap:6px;padding:7px 16px;border-radius:var(--rs);background:var(--purple);color:#fff;font-size:12px;font-weight:600;border:none;cursor:pointer;transition:opacity .12s}
        .btn-primary:disabled{opacity:.55;cursor:not-allowed}
        .btn-ghost{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:var(--rs);background:transparent;color:var(--steel);font-size:12px;font-weight:600;border:none;cursor:pointer;transition:background .12s}
        .btn-ghost:hover{background:var(--mist)}
        .btn-outline{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:var(--rs);background:transparent;font-size:12px;font-weight:600;border:1px solid;cursor:pointer;transition:opacity .12s}
        .btn-outline:hover{opacity:.75}
        .cat-tabs{display:flex;flex-wrap:wrap;gap:6px}
        .cat-tab{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:var(--rs);font-size:12px;font-weight:600;cursor:pointer;border:none;transition:background .12s,color .12s}
        .cat-tab--active{color:#fff}
        .cat-tab--inactive{background:var(--mist);color:var(--steel)}
        .cat-tab--inactive:hover{background:#EDE8F5;color:var(--purple)}
        .cat-tab-count{font-size:10px;font-weight:700;min-width:18px;text-align:center;padding:1px 5px;border-radius:99px}
        .cat-tab--active .cat-tab-count{background:rgba(255,255,255,.25);color:#fff}
        .cat-tab--inactive .cat-tab-count{background:rgba(100,116,139,.12);color:var(--steel)}
        .benefit-expanded{margin-top:12px;padding-top:12px;border-top:1px solid var(--divider);display:flex;flex-direction:column;gap:12px}
        .section-sublabel{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#94A3B8;margin-bottom:6px}
        .meas-list,.attach-list{display:flex;flex-direction:column;gap:4px}
        .meas-row,.attach-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:var(--mist);border-radius:var(--rs);padding:7px 10px;font-size:11px}
        .attach-row{text-decoration:none;color:var(--ink);transition:background .12s}
        .attach-row:hover{background:#EDE8F5}
        .meas-val{font-weight:700;font-variant-numeric:tabular-nums}
        .meas-date{color:#94A3B8;margin-left:auto}
        .meas-notes{color:var(--steel);font-style:italic}
        .meas-by{font-size:10px;color:#C4BDD4}
        .attach-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
        .attach-date{color:#94A3B8;flex-shrink:0}
        .meta-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;background:var(--mist);border-radius:var(--rs);padding:10px 12px}
        .meta-item{display:flex;flex-direction:column;gap:1px}
        .meta-key{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#94A3B8}
        .meta-val{font-size:11px;font-weight:600;color:var(--ink)}
        .inline-edit{background:var(--mist);border-radius:var(--rs);padding:14px;display:flex;flex-direction:column;gap:12px}
        .inline-edit-title{font-size:12px;font-weight:700;color:var(--ink)}
        .inline-edit-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
        .inline-edit-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px}
        .inline-edit-section{}
        .status-pills{display:flex;flex-wrap:wrap;gap:5px;margin-top:4px}
        .status-pill{font-size:10px;font-weight:600;padding:3px 10px;border-radius:99px;border:1px solid;cursor:pointer;transition:background .12s,color .12s}
        .expanded-actions{display:flex;gap:8px;flex-wrap:wrap}
        .empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 24px;text-align:center;color:#94A3B8}
        .empty-state-icon{width:40px;height:40px;margin-bottom:12px;opacity:.3}
        .empty-state-text{font-size:13px;font-weight:500;margin-bottom:14px}
        .col-span-2{grid-column:span 2}
        .meas-chart{margin-bottom:4px}
      `}</style>

      {/* ── Benefits List ─────────────────────────────────────────────────── */}
      <div style={{ background: "#fff", border: "1px solid #E8E4F0", borderRadius: 12, overflow: "hidden" }}>
        {/* List header */}
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #E8E4F0", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div className="cat-tabs">
            {([
              ["ALL",         "Todos",       catCounts.ALL],
              ["FINANCIAL",   "Financeiro",  catCounts.FINANCIAL],
              ["OPERATIONAL", "Operacional", catCounts.OPERATIONAL],
              ["STRATEGIC",   "Estratégico", catCounts.STRATEGIC],
              ["COMPLIANCE",  "Compliance",  catCounts.COMPLIANCE],
            ] as [BenefitCategory | "ALL", string, number][]).map(([cat, label, count]) => {
              const active = activeCategory === cat
              const color  = cat === "ALL" ? "#7B2FBE" : CAT_CFG[cat as BenefitCategory].color
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`cat-tab ${active ? "cat-tab--active" : "cat-tab--inactive"}`}
                  style={active ? { background: color } : {}}
                >
                  {label}
                  <span className="cat-tab-count">{count}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Cards */}
        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10, background: "#FAFAFA" }}>
          {filtered.length === 0 ? (
            <div className="empty-state">
              <BarChart3 className="empty-state-icon" />
              <p className="empty-state-text">Nenhum benefício cadastrado nesta categoria.</p>
            </div>
          ) : (
            filtered.map((b) => (
              <BenefitCard
                key={b.id}
                benefit={b}
                canManage={canManage}
                isPending={isPending}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onMeasurementAdded={handleMeasurement}
              />
            ))
          )}
        </div>
      </div>
    </>
  )
}
