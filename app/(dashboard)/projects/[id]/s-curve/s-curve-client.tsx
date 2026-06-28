"use client"

import { useState, useMemo, useCallback, useRef, useEffect } from "react"
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Legend, Area,
} from "recharts"
import { format, parseISO, differenceInDays } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  Plus, RefreshCw, TrendingUp, TrendingDown, Minus, Clock, Calendar,
  Maximize2, Minimize2, X, ChevronRight, Info, Layers, AlertTriangle,
  Rewind, BarChart3, Eye, EyeOff, Download, GitBranch, Zap,
} from "lucide-react"
import { createBaselineAction } from "@/lib/actions/s-curve"
import type { SCurvePayload, BaselineInfo } from "@/lib/actions/s-curve"

// Re-export for backward compatibility with schedule-client.tsx
export type SCurveData = SCurvePayload

// ─── Palette ─────────────────────────────────────────────────────────────────

const BL_COLORS = [
  "#F59E0B", "#EC4899", "#8B5CF6", "#14B8A6",
  "#F97316", "#06B6D4", "#84CC16", "#FB923C",
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string, gran: "week" | "month"): string {
  try {
    return format(parseISO(iso), gran === "month" ? "MMM/yy" : "dd/MM", { locale: ptBR })
  } catch { return "" }
}

function fmtDateFull(iso: string): string {
  try { return format(parseISO(iso), "dd/MM/yyyy", { locale: ptBR }) } catch { return "" }
}

function deltaColor(v: number, inverted = false): string {
  if (v === 0) return "#94A3B8"
  const good = inverted ? v < 0 : v > 0
  return good ? "#10B981" : "#EF4444"
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function SCTooltip({
  active, payload, label, dark, granularity, baselines,
}: {
  active?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: readonly any[]
  label?: string | number
  dark: boolean
  granularity: "week" | "month"
  baselines: BaselineInfo[]
}) {
  if (!active || !payload?.length || !label) return null
  const date = fmtDateFull(String(label))

  const byKey: Record<string, { name: string; value: number; color: string }> = {}
  for (const p of payload) {
    if (p.value !== null && p.value !== undefined) {
      byKey[p.dataKey] = { name: p.name, value: p.value, color: p.color ?? p.stroke }
    }
  }

  const rows = [
    byKey["planned"]    && { key: "planned",    ...byKey["planned"] },
    byKey["realized"]   && { key: "realized",   ...byKey["realized"] },
    byKey["projection"] && { key: "projection", ...byKey["projection"] },
    ...baselines.map((bl, i) => byKey[`b_${bl.id}`]
      ? { key: `b_${bl.id}`, name: bl.name, value: byKey[`b_${bl.id}`].value, color: BL_COLORS[i % BL_COLORS.length] }
      : null
    ),
  ].filter(Boolean) as { key: string; name: string; value: number; color: string }[]

  // Deviation
  const planned  = byKey["planned"]?.value
  const realized = byKey["realized"]?.value ?? byKey["projection"]?.value
  const deviation = planned !== undefined && realized !== undefined ? realized - planned : null

  return (
    <div className={`px-4 py-3 rounded-2xl border shadow-2xl min-w-[180px] ${dark ? "bg-[#1E293B] border-[#334155] text-white" : "bg-white border-slate-200 text-slate-900"}`}
      style={{ backdropFilter: "blur(12px)" }}>
      <p className={`text-[11px] font-black uppercase tracking-widest mb-3 ${dark ? "text-slate-400" : "text-slate-500"}`}>{date}</p>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center justify-between gap-5">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.color }} />
              <span className={`text-xs ${dark ? "text-slate-300" : "text-slate-600"}`}>{r.name}</span>
            </div>
            <span className="text-sm font-black tabular-nums" style={{ color: r.color }}>{r.value}%</span>
          </div>
        ))}
      </div>
      {deviation !== null && (
        <div className={`mt-2.5 pt-2.5 border-t ${dark ? "border-[#334155]" : "border-slate-100"} flex justify-between items-center`}>
          <span className={`text-xs ${dark ? "text-slate-400" : "text-slate-500"}`}>Desvio</span>
          <span className="text-sm font-black tabular-nums" style={{ color: deltaColor(deviation) }}>
            {deviation > 0 ? "+" : ""}{deviation}%
          </span>
        </div>
      )}
    </div>
  )
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, color, dark, icon: Icon,
}: {
  label: string; value: string; sub?: string; color: string; dark: boolean
  icon?: typeof TrendingUp
}) {
  const isLong = value.length > 6
  return (
    <div className={`rounded-2xl border p-3.5 min-w-0 overflow-hidden ${dark ? "bg-[#1E293B] border-[#334155]" : "bg-white border-slate-200"}`}>
      <div className="flex items-center gap-2 mb-2 min-w-0">
        {Icon && <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}18` }}><Icon className="w-3 h-3" style={{ color }} /></div>}
        <p className={`text-[10px] font-black uppercase tracking-widest truncate ${dark ? "text-slate-400" : "text-slate-500"}`}>{label}</p>
      </div>
      <p
        className={`${isLong ? "text-lg" : "text-2xl"} font-black leading-none truncate`}
        style={{ color }}
        title={value}
      >
        {value}
      </p>
      {sub && <p className={`text-xs mt-1 truncate ${dark ? "text-slate-500" : "text-slate-400"}`} title={sub}>{sub}</p>}
    </div>
  )
}

// ─── Line toggle badge ────────────────────────────────────────────────────────

function LineBadge({ label, color, hidden, dashed, onClick }: { label: string; color: string; hidden: boolean; dashed?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${hidden ? "opacity-40" : ""}`}
      style={{ borderColor: color, color: hidden ? "#94A3B8" : color, background: hidden ? "transparent" : `${color}14` }}>
      <svg width="16" height="2" viewBox="0 0 16 2">
        {dashed
          ? <line x1="0" y1="1" x2="16" y2="1" stroke={hidden ? "#94A3B8" : color} strokeWidth="2" strokeDasharray="4 2" />
          : <line x1="0" y1="1" x2="16" y2="1" stroke={hidden ? "#94A3B8" : color} strokeWidth="2" />
        }
      </svg>
      {label}
    </button>
  )
}

// ─── Create Baseline Modal ────────────────────────────────────────────────────

function CreateBaselineModal({
  open, onClose, onCreated, nextNumber, dark, projectId,
}: {
  open: boolean; onClose: () => void; onCreated: () => void
  nextNumber: number; dark: boolean; projectId: string
}) {
  const [name, setName]         = useState("")
  const [reason, setReason]     = useState("")
  const [desc, setDesc]         = useState("")
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  // Reset form when opening
  useEffect(() => { if (open) { setName(""); setReason(""); setDesc(""); setError(null) } }, [open])

  async function handleCreate() {
    setLoading(true)
    setError(null)
    try {
      const result = await createBaselineAction(
        projectId,
        { name: name || undefined, reason: reason || undefined, description: desc || undefined }
      )
      if (result.error) { setError(result.error); return }
      onCreated()
      onClose()
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  const label = nextNumber === 0 ? "Baseline Original" : `Replanejamento ${nextNumber}`

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`fixed inset-0 z-50 flex items-center justify-center p-4`}>
        <div className={`rounded-3xl shadow-2xl w-full max-w-md p-6 border ${dark ? "bg-[#0F172A] border-[#334155]" : "bg-white border-slate-200"}`}>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className={`text-base font-black ${dark ? "text-white" : "text-slate-900"}`}>{label}</h3>
              <p className={`text-xs mt-0.5 ${dark ? "text-slate-400" : "text-slate-500"}`}>
                Congela o cronograma atual como fotografia histórica
              </p>
            </div>
            <button onClick={onClose} className={`p-1.5 rounded-lg ${dark ? "text-slate-400 hover:text-white hover:bg-[#334155]" : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"} transition-colors`}>
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className={`block text-xs font-black uppercase tracking-wider mb-1.5 ${dark ? "text-slate-400" : "text-slate-500"}`}>Nome</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                placeholder={label}
                className={`w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none transition-colors ${dark ? "bg-[#1E293B] border-[#334155] text-white placeholder:text-slate-600 focus:border-violet-500" : "bg-white border-slate-200 text-slate-900 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"}`} />
            </div>
            <div>
              <label className={`block text-xs font-black uppercase tracking-wider mb-1.5 ${dark ? "text-slate-400" : "text-slate-500"}`}>
                Motivo do replanejamento <span className="font-normal normal-case opacity-60">(obrigatório para revisões)</span>
              </label>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
                placeholder="Ex: Atraso na entrega do fornecedor, extensão de escopo, mudança de prioridade..."
                className={`w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none transition-colors resize-none ${dark ? "bg-[#1E293B] border-[#334155] text-white placeholder:text-slate-600 focus:border-violet-500" : "bg-white border-slate-200 text-slate-900 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"}`} />
            </div>
            <div>
              <label className={`block text-xs font-black uppercase tracking-wider mb-1.5 ${dark ? "text-slate-400" : "text-slate-500"}`}>
                Descrição <span className="font-normal normal-case opacity-60">(opcional)</span>
              </label>
              <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2}
                placeholder="Detalhes adicionais sobre este replanejamento..."
                className={`w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none transition-colors resize-none ${dark ? "bg-[#1E293B] border-[#334155] text-white placeholder:text-slate-600 focus:border-violet-500" : "bg-white border-slate-200 text-slate-900 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"}`} />
            </div>
          </div>

          {error && <p className="text-sm text-red-500 mt-3 font-medium">{error}</p>}

          <div className="flex gap-3 mt-6">
            <button onClick={onClose} className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${dark ? "border-[#334155] text-slate-400 hover:border-[#475569]" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              Cancelar
            </button>
            <button onClick={handleCreate} disabled={loading}
              className="flex-1 py-2.5 rounded-xl text-sm font-black text-white transition-all disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #7B2FBE, #2463FF)", boxShadow: "0 4px 16px rgba(123,47,190,0.4)" }}>
              {loading ? "Criando…" : "Criar Baseline"}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Baseline comparison panel ────────────────────────────────────────────────

function BaselinePanel({
  baselines, currentEndDate, dark,
}: {
  baselines: BaselineInfo[]; currentEndDate: string | null; dark: boolean
}) {
  if (baselines.length === 0) return (
    <div className={`p-4 rounded-2xl border text-center ${dark ? "bg-[#1E293B] border-[#334155]" : "bg-slate-50 border-slate-200"}`}>
      <GitBranch className={`w-8 h-8 mx-auto mb-2 ${dark ? "text-slate-600" : "text-slate-300"}`} />
      <p className={`text-xs font-semibold ${dark ? "text-slate-500" : "text-slate-400"}`}>Nenhuma baseline criada</p>
      <p className={`text-[10px] mt-0.5 ${dark ? "text-slate-600" : "text-slate-400"}`}>Crie a Baseline Original para iniciar o rastreamento</p>
    </div>
  )

  const b0 = baselines.find((b) => b.number === 0)
  const bLast = baselines[baselines.length - 1]

  return (
    <div className="space-y-3">
      {/* Summary comparison */}
      {b0 && bLast && b0.id !== bLast.id && (
        <div className={`p-3.5 rounded-2xl border ${dark ? "bg-[#1E293B] border-[#334155]" : "bg-slate-50 border-slate-200"}`}>
          <p className={`text-[10px] font-black uppercase tracking-widest mb-2.5 ${dark ? "text-slate-400" : "text-slate-500"}`}>Comparação de Baseline</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Baseline 0",    date: b0.latestEndDate,       color: BL_COLORS[0] },
              { label: bLast.name,      date: bLast.latestEndDate,    color: BL_COLORS[(baselines.length - 1) % BL_COLORS.length] },
              { label: "Plano Atual",   date: currentEndDate,         color: "#3B82F6" },
            ].filter((r) => r.date).map((row) => (
              <div key={row.label} className={`p-2 rounded-xl ${dark ? "bg-[#0F172A]" : "bg-white"}`}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: row.color }} />
                  <span className={`text-[10px] font-semibold ${dark ? "text-slate-400" : "text-slate-500"}`}>{row.label}</span>
                </div>
                <p className={`text-sm font-black ${dark ? "text-white" : "text-slate-900"}`}>{fmtDateFull(row.date!)}</p>
              </div>
            ))}
            {b0.latestEndDate && bLast.latestEndDate && (
              <div className={`p-2 rounded-xl ${dark ? "bg-[#0F172A]" : "bg-white"}`}>
                <p className={`text-[10px] font-semibold mb-0.5 ${dark ? "text-slate-400" : "text-slate-500"}`}>Diferença</p>
                {(() => {
                  const d = differenceInDays(parseISO(bLast.latestEndDate!), parseISO(b0.latestEndDate!))
                  return <p className={`text-sm font-black ${d > 0 ? "text-red-500" : d < 0 ? "text-emerald-500" : "text-slate-400"}`}>{d > 0 ? "+" : ""}{d} dias</p>
                })()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Baselines list */}
      <div className="space-y-2">
        {baselines.map((bl, i) => (
          <div key={bl.id} className={`p-3 rounded-xl border ${dark ? "bg-[#1E293B] border-[#334155]" : "bg-white border-slate-200"}`}>
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: `${BL_COLORS[i % BL_COLORS.length]}18` }}>
                <span className="text-[10px] font-black" style={{ color: BL_COLORS[i % BL_COLORS.length] }}>B{bl.number}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-black ${dark ? "text-white" : "text-slate-900"}`}>{bl.name}</p>
                <p className={`text-[10px] mt-0.5 ${dark ? "text-slate-500" : "text-slate-400"}`}>
                  {fmtDateFull(bl.createdAt)}
                  {bl.createdByName ? ` · ${bl.createdByName}` : ""}
                  {" · "}{bl.taskCount} atividades
                </p>
                {bl.latestEndDate && (
                  <p className={`text-[10px] mt-0.5 font-semibold ${dark ? "text-slate-400" : "text-slate-600"}`}>
                    Data fim: {fmtDateFull(bl.latestEndDate)}
                  </p>
                )}
                {bl.reason && (
                  <p className={`text-[10px] mt-1 italic leading-snug ${dark ? "text-slate-500" : "text-slate-400"}`}>"{bl.reason}"</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Time Machine Panel ───────────────────────────────────────────────────────

function TimeMachinePanel({
  baselines, selected, onSelect, dark,
}: {
  baselines: BaselineInfo[]
  selected: string | null
  onSelect: (id: string | null) => void
  dark: boolean
}) {
  if (baselines.length === 0) return (
    <p className={`text-xs text-center py-4 ${dark ? "text-slate-500" : "text-slate-400"}`}>Crie baselines para usar o Time Machine</p>
  )

  return (
    <div className="space-y-2">
      <p className={`text-[10px] font-black uppercase tracking-widest ${dark ? "text-slate-400" : "text-slate-500"}`}>Selecione um ponto no tempo</p>
      {[{ id: null, label: "Visão Atual", date: new Date().toISOString() }, ...baselines.map((b) => ({ id: b.id, label: b.name, date: b.createdAt }))].map((opt, i) => {
        const isActive = selected === opt.id
        const color    = opt.id === null ? "#10B981" : BL_COLORS[(i - 1) % BL_COLORS.length]
        return (
          <button key={opt.id ?? "current"} onClick={() => onSelect(opt.id)}
            className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${isActive ? "" : dark ? "bg-[#1E293B] border-[#334155] hover:border-[#475569]" : "bg-white border-slate-200 hover:border-slate-300"}`}
            style={isActive ? { background: `${color}18`, borderColor: color } : {}}>
            <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center"
              style={{ background: `${color}20`, border: `2px solid ${color}` }}>
              {opt.id === null
                ? <Zap className="w-2.5 h-2.5" style={{ color }} />
                : <span className="text-[8px] font-black" style={{ color }}>B{i - 1}</span>
              }
            </div>
            <div>
              <p className={`text-xs font-bold ${isActive ? "" : dark ? "text-white" : "text-slate-800"}`} style={isActive ? { color } : {}}>
                {opt.label}
              </p>
              <p className={`text-[10px] ${dark ? "text-slate-500" : "text-slate-400"}`}>{fmtDateFull(opt.date)}</p>
            </div>
            {isActive && <ChevronRight className="w-3.5 h-3.5 ml-auto" style={{ color }} />}
          </button>
        )
      })}
    </div>
  )
}

// ─── Export helper ────────────────────────────────────────────────────────────

function exportPNG(_containerRef: React.RefObject<HTMLDivElement | null>) {
  window.print()
}

// ─── Main component ───────────────────────────────────────────────────────────

export interface SCurveClientProps {
  projectId: string
  initialData: SCurvePayload | null
}

type PanelMode = "baselines" | "timemachine"

export function SCurveClient({ projectId, initialData }: SCurveClientProps) {
  const [data, setData]                   = useState<SCurvePayload | null>(initialData)
  const [loading, setLoading]             = useState(false)
  const [showModal, setShowModal]         = useState(false)
  const [dark, setDark]                   = useState(true)
  const [fullscreen, setFullscreen]       = useState(false)
  const [panel, setPanel]                 = useState<PanelMode | null>("baselines")
  const [hiddenLines, setHiddenLines]     = useState<Set<string>>(new Set())
  const [timeMachineId, setTimeMachineId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef     = useRef<HTMLDivElement | null>(null)

  const today = useMemo(() => new Date(), [])

  // Find today's ISO string for ReferenceLine
  const todayISO = useMemo(() => {
    if (!data?.series.length) return new Date().toISOString()
    const todayStart = new Date(today)
    todayStart.setHours(0, 0, 0, 0)
    const closest = data.series.reduce((prev, curr) => {
      const pd = Math.abs(parseISO(prev.date).getTime() - todayStart.getTime())
      const cd = Math.abs(parseISO(curr.date).getTime() - todayStart.getTime())
      return cd < pd ? curr : prev
    })
    return closest.date
  }, [data, today])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/projects/${projectId}/s-curve`)
      const json = await res.json()
      setData(json)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  // Fullscreen
  useEffect(() => {
    if (fullscreen) containerRef.current?.requestFullscreen?.().catch(() => {})
    else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
  }, [fullscreen])
  useEffect(() => {
    function onFsc() { if (!document.fullscreenElement) setFullscreen(false) }
    document.addEventListener("fullscreenchange", onFsc)
    return () => document.removeEventListener("fullscreenchange", onFsc)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "f" || e.key === "F") setFullscreen((v) => !v)
      if (e.key === "Escape" && fullscreen) setFullscreen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [fullscreen])

  function toggleLine(key: string) {
    setHiddenLines((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  // Time Machine: filter series to only show data up to selected baseline's createdAt
  const activeSeries = useMemo(() => {
    if (!data?.series.length) return []
    if (!timeMachineId) return data.series

    const bl = data.baselines.find((b) => b.id === timeMachineId)
    if (!bl) return data.series

    const cutoff = parseISO(bl.createdAt)
    return data.series.map((pt) => {
      const d = parseISO(pt.date)
      if (d > cutoff) return null
      // Hide future projection
      return { ...pt, projection: null }
    }).filter(Boolean) as typeof data.series
  }, [data, timeMachineId])

  const activeMachineBaselines = useMemo(() => {
    if (!timeMachineId || !data) return data?.baselines ?? []
    const bl = data.baselines.find((b) => b.id === timeMachineId)
    if (!bl) return data.baselines
    return data.baselines.filter((b) => b.number <= bl.number)
  }, [data, timeMachineId])

  // Colors
  const bg    = dark ? "#0F172A" : "#F8FAFC"
  const card  = dark ? "#1E293B" : "#FFFFFF"
  const bord  = dark ? "#334155" : "#E2E8F0"
  const tick  = dark ? "#64748B" : "#94A3B8"
  const gridC = dark ? "#1E293B" : "#F1F5F9"
  const text  = dark ? "#F8FAFC" : "#0F172A"

  const stats     = data?.stats
  const baselines = activeMachineBaselines
  const hasSeries = activeSeries.length > 0

  return (
    <div
      ref={containerRef}
      data-project-id={projectId}
      className={`flex flex-col ${fullscreen ? "fixed inset-0 z-50 overflow-auto" : "min-h-0"}`}
      style={{ background: bg, transition: "background 0.2s" }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-5 py-4 flex-wrap"
        style={{ borderBottom: `1px solid ${bord}` }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(123,47,190,0.15)" }}>
            <BarChart3 className="w-4 h-4" style={{ color: "#7B2FBE" }} />
          </div>
          <div>
            <h2 className="text-sm font-black" style={{ color: text }}>Curva S — Análise de Desempenho</h2>
            <p className="text-[10px]" style={{ color: tick }}>
              Distribuição linear ponderada · {data?.series.length ?? 0} pontos de controle
              {timeMachineId && <span className="ml-2 px-1.5 py-0.5 rounded text-yellow-500 font-bold" style={{ background: "rgba(245,158,11,0.1)" }}>⏪ Time Machine ativo</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Time Machine toggle */}
          <button
            onClick={() => setPanel((p) => p === "timemachine" ? null : "timemachine")}
            className="inline-flex items-center gap-1.5 px-3 h-8 text-xs font-bold rounded-xl border transition-colors"
            style={{
              background: panel === "timemachine" ? "rgba(245,158,11,0.15)" : "transparent",
              borderColor: panel === "timemachine" ? "#F59E0B" : bord,
              color: panel === "timemachine" ? "#F59E0B" : tick,
            }}>
            <Rewind className="w-3.5 h-3.5" /> Time Machine
          </button>
          {/* Baselines panel */}
          <button
            onClick={() => setPanel((p) => p === "baselines" ? null : "baselines")}
            className="inline-flex items-center gap-1.5 px-3 h-8 text-xs font-bold rounded-xl border transition-colors"
            style={{
              background: panel === "baselines" ? "rgba(123,47,190,0.15)" : "transparent",
              borderColor: panel === "baselines" ? "#7B2FBE" : bord,
              color: panel === "baselines" ? "#7B2FBE" : tick,
            }}>
            <Layers className="w-3.5 h-3.5" /> Baselines
          </button>
          <button onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 h-8 text-xs font-black text-white rounded-xl transition-all hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #7B2FBE, #2463FF)", boxShadow: "0 4px 12px rgba(123,47,190,0.35)" }}>
            <Plus className="w-3.5 h-3.5" />
            {(data?.baselines.length ?? 0) === 0 ? "Criar Baseline" : "Replanear"}
          </button>
          <button onClick={refresh} disabled={loading}
            className="p-2 rounded-xl border transition-colors disabled:opacity-50"
            style={{ borderColor: bord, color: tick }}
            title="Atualizar dados">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={() => exportPNG(chartRef)}
            className="p-2 rounded-xl border transition-colors"
            style={{ borderColor: bord, color: tick }}
            title="Exportar PNG">
            <Download className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setDark((d) => !d)}
            className="p-2 rounded-xl border transition-colors"
            style={{ borderColor: bord, color: tick }}
            title="Alternar tema">
            {dark ? "☀️" : "🌙"}
          </button>
          <button onClick={() => setFullscreen((f) => !f)}
            className="p-2 rounded-xl border transition-colors"
            style={{ borderColor: bord, color: tick }}
            title="Tela cheia (F)">
            {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* ── Time Machine banner ──────────────────────────────────────────── */}
      {timeMachineId && (() => {
        const bl = data?.baselines.find((b) => b.id === timeMachineId)
        return bl ? (
          <div className="flex items-center gap-3 px-5 py-2.5" style={{ background: "rgba(245,158,11,0.1)", borderBottom: `1px solid rgba(245,158,11,0.3)` }}>
            <Rewind className="w-4 h-4 text-yellow-400 shrink-0" />
            <p className="text-xs font-bold text-yellow-400 flex-1">
              Time Machine — Visualizando como o projeto aparecia em <strong>{fmtDateFull(bl.createdAt)}</strong> ({bl.name})
            </p>
            <button onClick={() => setTimeMachineId(null)} className="text-yellow-500 hover:text-yellow-300 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : null
      })()}

      {/* ── Main body ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Chart column */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          <div className="p-5 space-y-5">

            {/* KPI Cards */}
            {stats && (
              <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-6 gap-3">
                <KpiCard
                  dark={dark} label="Planejado Hoje" icon={Calendar}
                  value={`${stats.plannedToday}%`}
                  color="#3B82F6"
                />
                <KpiCard
                  dark={dark} label="Realizado Hoje" icon={TrendingUp}
                  value={`${stats.realizedToday}%`}
                  color={stats.realizedToday >= stats.plannedToday ? "#10B981" : "#EF4444"}
                />
                <KpiCard
                  dark={dark} label="Desvio" icon={stats.deviation >= 0 ? TrendingUp : TrendingDown}
                  value={`${stats.deviation > 0 ? "+" : ""}${stats.deviation}%`}
                  color={deltaColor(stats.deviation)}
                  sub={stats.deviation >= 0 ? "Adiantado" : "Em atraso"}
                />
                <KpiCard
                  dark={dark} label="Velocidade" icon={Zap}
                  value={`${stats.velocity > 0 ? "+" : ""}${stats.velocity}%`}
                  color="#8B5CF6"
                  sub="por semana"
                />
                {stats.projectedEndDate && (
                  <KpiCard
                    dark={dark} label="Previsão Fim" icon={Clock}
                    value={fmtDateFull(stats.projectedEndDate)}
                    color={stats.daysDeviation > 0 ? "#EF4444" : "#10B981"}
                    sub={stats.daysDeviation !== 0 ? `${stats.daysDeviation > 0 ? "+" : ""}${stats.daysDeviation} dias vs. plano` : "No prazo"}
                  />
                )}
                {stats.currentEndDate && (
                  <KpiCard
                    dark={dark} label="Fim Planejado" icon={Calendar}
                    value={fmtDateFull(stats.currentEndDate)}
                    color="#F59E0B"
                    sub={stats.originalEndDate && stats.originalEndDate !== stats.currentEndDate
                      ? `Original: ${fmtDateFull(stats.originalEndDate)}`
                      : "Baseline 0"}
                  />
                )}
              </div>
            )}

            {/* Chart */}
            <div ref={chartRef} className="rounded-2xl border p-5" style={{ background: card, borderColor: bord }}>
              {!hasSeries ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <TrendingUp className="w-10 h-10 opacity-20" style={{ color: tick }} />
                  <p className="text-sm font-semibold" style={{ color: tick }}>Nenhuma atividade com datas definidas</p>
                  <p className="text-xs" style={{ color: tick }}>Adicione datas de início/fim ao cronograma para visualizar a Curva S</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={420}>
                  <ComposedChart data={activeSeries} margin={{ top: 8, right: 30, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridC} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(v) => fmtDate(v as string, data?.granularity ?? "week")}
                      tick={{ fontSize: 10, fill: tick }}
                      tickLine={false}
                      axisLine={{ stroke: bord }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      domain={[0, 100]}
                      tickFormatter={(v) => `${v}%`}
                      tick={{ fontSize: 10, fill: tick }}
                      tickLine={false}
                      axisLine={false}
                      width={44}
                    />
                    <Tooltip
                      content={(props) => (
                        <SCTooltip
                          {...props}
                          dark={dark}
                          granularity={data?.granularity ?? "week"}
                          baselines={baselines}
                        />
                      )}
                    />

                    {/* Today reference line */}
                    <ReferenceLine
                      x={todayISO}
                      stroke="#EF4444"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      label={{ value: "Hoje", position: "insideTopRight", fill: "#EF4444", fontSize: 10, fontWeight: 700 }}
                    />

                    {/* Baselines */}
                    {baselines.map((bl, i) => !hiddenLines.has(`b_${bl.id}`) && (
                      <Line
                        key={bl.id}
                        type="monotone"
                        dataKey={`b_${bl.id}`}
                        name={bl.name}
                        stroke={BL_COLORS[i % BL_COLORS.length]}
                        strokeWidth={1.5}
                        strokeDasharray="6 3"
                        dot={false}
                        connectNulls
                        activeDot={{ r: 4, strokeWidth: 0 }}
                      />
                    ))}

                    {/* Planned (current) */}
                    {!hiddenLines.has("planned") && (
                      <Line
                        type="monotone"
                        dataKey="planned"
                        name="Planejado"
                        stroke="#3B82F6"
                        strokeWidth={2.5}
                        dot={false}
                        connectNulls
                        activeDot={{ r: 5, strokeWidth: 0 }}
                      />
                    )}

                    {/* Realized */}
                    {!hiddenLines.has("realized") && (
                      <Line
                        type="monotone"
                        dataKey="realized"
                        name="Realizado"
                        stroke="#10B981"
                        strokeWidth={2.5}
                        dot={false}
                        connectNulls
                        activeDot={{ r: 5, strokeWidth: 0 }}
                      />
                    )}

                    {/* Projection */}
                    {!hiddenLines.has("projection") && (
                      <Line
                        type="monotone"
                        dataKey="projection"
                        name="Tendência"
                        stroke="#F97316"
                        strokeWidth={2}
                        strokeDasharray="5 4"
                        dot={false}
                        connectNulls
                        activeDot={{ r: 4, strokeWidth: 0 }}
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              )}

              {/* Legend toggles */}
              {hasSeries && (
                <div className="mt-4 pt-4 flex flex-wrap gap-2" style={{ borderTop: `1px solid ${bord}` }}>
                  <LineBadge label="Planejado" color="#3B82F6" hidden={hiddenLines.has("planned")} onClick={() => toggleLine("planned")} />
                  <LineBadge label="Realizado" color="#10B981" hidden={hiddenLines.has("realized")} onClick={() => toggleLine("realized")} />
                  <LineBadge label="Tendência" color="#F97316" hidden={hiddenLines.has("projection")} dashed onClick={() => toggleLine("projection")} />
                  {baselines.map((bl, i) => (
                    <LineBadge
                      key={bl.id}
                      label={bl.name}
                      color={BL_COLORS[i % BL_COLORS.length]}
                      hidden={hiddenLines.has(`b_${bl.id}`)}
                      dashed
                      onClick={() => toggleLine(`b_${bl.id}`)}
                    />
                  ))}
                  <button
                    onClick={() => {
                      const hasHidden = hiddenLines.size > 0
                      setHiddenLines(hasHidden ? new Set() : new Set(["projection", ...baselines.map((b) => `b_${b.id}`)]))
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-full transition-colors"
                    style={{ color: tick, border: `1px solid ${bord}` }}>
                    {hiddenLines.size > 0 ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    {hiddenLines.size > 0 ? "Mostrar tudo" : "Ocultar linhas extras"}
                  </button>
                </div>
              )}
            </div>

            {/* Info box */}
            <div className="flex items-start gap-3 rounded-xl px-4 py-3 border"
              style={{ background: dark ? "rgba(59,130,246,0.08)" : "#EFF6FF", borderColor: dark ? "rgba(59,130,246,0.2)" : "#BFDBFE" }}>
              <Info className="w-4 h-4 mt-0.5 shrink-0 text-blue-400" />
              <p className="text-xs text-blue-300" style={{ color: dark ? "#93C5FD" : "#1D4ED8" }}>
                <strong>Metodologia:</strong> A Curva S usa distribuição linear ponderada pelo custo orçado de cada atividade, distribuindo o avanço uniformemente entre início e fim planejados (não mais contagem binária por conclusão). A tendência é calculada com a velocidade média das últimas {data?.granularity === "month" ? "3 semanas" : "4 semanas"} de execução.
              </p>
            </div>

          </div>
        </div>

        {/* Side panel */}
        {panel && (
          <div className="w-80 shrink-0 overflow-y-auto"
            style={{ borderLeft: `1px solid ${bord}`, background: dark ? "#0F172A" : "#F8FAFC" }}>
            <div className="p-4 space-y-4">
              {/* Panel header */}
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-widest" style={{ color: tick }}>
                  {panel === "timemachine" ? "⏪ Time Machine" : "📊 Baselines"}
                </h3>
                <button onClick={() => setPanel(null)} className="p-1 rounded-lg transition-colors" style={{ color: tick }}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {panel === "baselines" && (
                <BaselinePanel
                  baselines={baselines}
                  currentEndDate={data?.project.expectedEnd ?? null}
                  dark={dark}
                />
              )}

              {panel === "timemachine" && (
                <>
                  <p className="text-xs leading-relaxed" style={{ color: tick }}>
                    Selecione qualquer ponto no histórico do projeto. O gráfico reconstruirá exatamente o que era conhecido naquela data.
                  </p>
                  <TimeMachinePanel
                    baselines={data?.baselines ?? []}
                    selected={timeMachineId}
                    onSelect={(id) => {
                      setTimeMachineId(id)
                    }}
                    dark={dark}
                  />
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create baseline modal */}
      <CreateBaselineModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onCreated={refresh}
        nextNumber={data?.baselines.length ?? 0}
        dark={dark}
        projectId={projectId}
      />
    </div>
  )
}
