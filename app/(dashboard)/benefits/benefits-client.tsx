"use client"

import { useState, useCallback, useTransition, useRef, useEffect } from "react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, ScatterChart, Scatter,
  ZAxis, Legend,
} from "recharts"
import Link from "next/link"
import {
  TrendingUp, TrendingDown, AlertTriangle, Clock, DollarSign,
  BarChart3, Target, Award, Filter, ChevronDown, ChevronRight,
  X, Loader2, ArrowUpDown, Zap, Shield, Star, Activity,
  CheckCircle, AlertCircle, Info,
} from "lucide-react"
import { getPortfolioBenefits } from "@/lib/actions/benefits"
import type {
  PortfolioSummary, PortfolioChartData, ProjectBenefitMetrics,
} from "@/lib/types/benefits"

// ── Format helpers ─────────────────────────────────────────────────────────────
function fmtBRL(v: number): string {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace(".", ",")}M`
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}K`
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
}
function fmtPct(v: number): string { return v.toFixed(1) + "%" }
function fmtNum(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(".", ",")}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`
  return String(Math.round(v))
}

// ── IVG helpers ────────────────────────────────────────────────────────────────
function ivgColor(score: number): string {
  if (score >= 90) return "#10B981"
  if (score >= 80) return "#3B82F6"
  if (score >= 70) return "#7B2FBE"
  if (score >= 50) return "#F59E0B"
  return "#EF4444"
}
function ivgBg(score: number): string {
  if (score >= 90) return "rgba(16,185,129,0.12)"
  if (score >= 80) return "rgba(59,130,246,0.12)"
  if (score >= 70) return "rgba(123,47,190,0.12)"
  if (score >= 50) return "rgba(245,158,11,0.12)"
  return "rgba(239,68,68,0.12)"
}
function ivgLabel(score: number): string {
  if (score >= 90) return "Valor Excepcional"
  if (score >= 80) return "Alto Valor"
  if (score >= 70) return "Bom Valor"
  if (score >= 50) return "Valor Moderado"
  return "Baixo Valor"
}

// ── MultiSelect ────────────────────────────────────────────────────────────────
interface MultiSelectProps {
  label: string
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (values: string[]) => void
  placeholder?: string
}

function MultiSelect({ label, options, selected, onChange, placeholder = "Todos" }: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const displayLabel =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label ?? selected[0]
        : `${selected.length} selecionados`

  return (
    <div ref={ref} style={{ position: "relative", display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#6B7280" }}>
        {label}
      </span>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 6, height: 34, padding: "0 10px", borderRadius: 8, fontSize: 13,
          border: selected.length > 0 ? "1.5px solid #7B2FBE" : "1.5px solid #E5E7EB",
          background: selected.length > 0 ? "rgba(123,47,190,0.06)" : "#fff",
          color: selected.length > 0 ? "#5B21B6" : "#374151",
          fontWeight: selected.length > 0 ? 600 : 400,
          cursor: "pointer", minWidth: 130, whiteSpace: "nowrap", outline: "none",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{displayLabel}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {selected.length > 0 && (
            <span
              onClick={(e) => { e.stopPropagation(); onChange([]) }}
              style={{
                width: 16, height: 16, borderRadius: "50%", background: "#7B2FBE",
                color: "#fff", fontSize: 9, fontWeight: 900,
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
              }}
            >
              {selected.length}
            </span>
          )}
          <ChevronDown size={12} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
        </div>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 100,
          minWidth: 190, borderRadius: 10, boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
          background: "#fff", border: "1px solid rgba(0,0,0,0.08)", overflow: "hidden",
        }}>
          {options.map((opt) => {
            const checked = selected.includes(opt.value)
            return (
              <button
                key={opt.value}
                onClick={() => onChange(checked ? selected.filter((v) => v !== opt.value) : [...selected, opt.value])}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 12px", textAlign: "left", fontSize: 13,
                  background: checked ? "rgba(123,47,190,0.07)" : "transparent",
                  border: "none", cursor: "pointer", color: checked ? "#5B21B6" : "#374151",
                  fontWeight: checked ? 600 : 400,
                }}
              >
                <span style={{
                  width: 15, height: 15, borderRadius: 4, flexShrink: 0,
                  border: checked ? "2px solid #7B2FBE" : "2px solid #D1D5DB",
                  background: checked ? "#7B2FBE" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {checked && <svg viewBox="0 0 10 8" width="9" height="8"><path d="M1 4l3 3 5-6" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </span>
                {opt.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Section Block (collapsible) ────────────────────────────────────────────────
function Section({
  id, title, subtitle, icon: Icon, accentColor = "#7B2FBE", defaultOpen = true, children,
}: {
  id: string; title: string; subtitle?: string; icon: React.ElementType
  accentColor?: string; defaultOpen?: boolean; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{
      background: "#fff", borderRadius: 14,
      border: "1px solid rgba(0,0,0,0.07)",
      boxShadow: "0 1px 6px rgba(0,0,0,0.04)",
      overflow: "hidden",
    }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 12,
          padding: "14px 20px", background: "transparent", border: "none",
          cursor: "pointer", textAlign: "left",
          borderBottom: open ? "1px solid rgba(0,0,0,0.06)" : "none",
        }}
      >
        <span style={{
          width: 4, height: 32, borderRadius: 2, background: accentColor, flexShrink: 0,
        }} />
        <span style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: `${accentColor}18`, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon size={16} style={{ color: accentColor }} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", letterSpacing: "-0.01em" }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 1 }}>{subtitle}</div>}
        </div>
        <ChevronDown
          size={16}
          style={{ color: "#9CA3AF", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }}
        />
      </button>
      {open && <div style={{ padding: "20px" }}>{children}</div>}
    </div>
  )
}

// ── IVG Badge ─────────────────────────────────────────────────────────────────
function IvgBadge({ score, size = "md" }: { score: number; size?: "sm" | "md" | "lg" }) {
  const c = ivgColor(score)
  const bg = ivgBg(score)
  const sizes = { sm: { px: 8, py: 3, fs: 11, dot: 6 }, md: { px: 10, py: 4, fs: 12, dot: 7 }, lg: { px: 12, py: 6, fs: 14, dot: 8 } }
  const s = sizes[size]
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: `${s.py}px ${s.px}px`, borderRadius: 20,
      background: bg, color: c, fontWeight: 700, fontSize: s.fs,
      fontVariantNumeric: "tabular-nums",
    }}>
      <span style={{ width: s.dot, height: s.dot, borderRadius: "50%", background: c, flexShrink: 0 }} />
      {score}
    </span>
  )
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, gradientFrom, gradientTo, icon: Icon, trend,
}: {
  label: string; value: string; sub?: string
  gradientFrom: string; gradientTo: string
  icon: React.ElementType; trend?: "up" | "down" | "neutral"
}) {
  return (
    <div style={{
      background: `linear-gradient(135deg, ${gradientFrom} 0%, ${gradientTo} 100%)`,
      borderRadius: 14, padding: "18px 20px", color: "#fff",
      position: "relative", overflow: "hidden",
      boxShadow: `0 4px 20px ${gradientTo}55`,
    }}>
      <div style={{
        position: "absolute", top: -20, right: -20, width: 90, height: 90,
        borderRadius: "50%", background: "rgba(255,255,255,0.08)",
      }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.7 }}>{label}</span>
        <span style={{
          width: 30, height: 30, borderRadius: 8, background: "rgba(255,255,255,0.18)",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Icon size={14} />
        </span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && (
        <div style={{ fontSize: 11, opacity: 0.65, marginTop: 5, display: "flex", alignItems: "center", gap: 4 }}>
          {trend === "up" && <TrendingUp size={10} />}
          {trend === "down" && <TrendingDown size={10} />}
          {sub}
        </div>
      )}
    </div>
  )
}

// ── Custom tooltip ─────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, formatter }: {
  active?: boolean
  payload?: { name: string; value: number; color?: string; fill?: string }[]
  label?: string
  formatter?: (name: string, value: number) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: "#1A0B2E", borderRadius: 10, padding: "10px 14px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.25)", fontSize: 12, color: "#fff",
      border: "1px solid rgba(255,255,255,0.1)",
    }}>
      {label && <div style={{ fontWeight: 700, marginBottom: 6, color: "#E5E7EB" }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color ?? p.fill ?? "#7B2FBE", flexShrink: 0 }} />
          <span style={{ color: "#9CA3AF" }}>{p.name}:</span>
          <span style={{ fontWeight: 700 }}>
            {formatter ? formatter(p.name, p.value) : fmtBRL(p.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Sort button ────────────────────────────────────────────────────────────────
function SortBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
        background: active ? "#7B2FBE" : "transparent",
        color: active ? "#fff" : "#6B7280",
        border: active ? "none" : "1px solid #E5E7EB",
      }}
    >
      {label}
    </button>
  )
}

// ── STATUS PILL ───────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: string }) {
  const MAP: Record<string, { label: string; color: string; bg: string }> = {
    PLANNING:    { label: "Planejamento", color: "#6366F1", bg: "rgba(99,102,241,0.1)" },
    IN_PROGRESS: { label: "Em Andamento", color: "#3B82F6", bg: "rgba(59,130,246,0.1)" },
    COMPLETED:   { label: "Concluído",    color: "#10B981", bg: "rgba(16,185,129,0.1)" },
    ON_HOLD:     { label: "Em Espera",    color: "#F59E0B", bg: "rgba(245,158,11,0.1)" },
    CANCELLED:   { label: "Cancelado",    color: "#EF4444", bg: "rgba(239,68,68,0.1)" },
  }
  const s = MAP[status] ?? { label: status, color: "#6B7280", bg: "rgba(107,114,128,0.1)" }
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
      color: s.color, background: s.bg, whiteSpace: "nowrap",
    }}>
      {s.label}
    </span>
  )
}

// ── ALERT ITEM ────────────────────────────────────────────────────────────────
function AlertItem({ type, title, desc }: { type: "error" | "warning" | "info"; title: string; desc: string }) {
  const CFG = {
    error:   { icon: AlertCircle, color: "#EF4444", bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.2)" },
    warning: { icon: AlertTriangle, color: "#F59E0B", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.2)" },
    info:    { icon: Info, color: "#3B82F6", bg: "rgba(59,130,246,0.08)", border: "rgba(59,130,246,0.2)" },
  }
  const { icon: Icon, color, bg, border } = CFG[type]
  return (
    <div style={{
      display: "flex", gap: 12, padding: "12px 16px", borderRadius: 10,
      background: bg, border: `1px solid ${border}`,
    }}>
      <Icon size={16} style={{ color, flexShrink: 0, marginTop: 1 }} />
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{title}</div>
        <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{desc}</div>
      </div>
    </div>
  )
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────────
interface Props {
  summary: PortfolioSummary
  charts: PortfolioChartData
  projects: ProjectBenefitMetrics[]
  users: { id: string; name: string }[]
  userRole: string
}

interface FilterState {
  years: string[]; areas: string[]; statuses: string[]
  categories: string[]; managers: string[]
}

const EMPTY_FILTERS: FilterState = { years: [], areas: [], statuses: [], categories: [], managers: [] }

type SortKey = "ivg" | "roi" | "realized" | "planned" | "investment" | "payback"

export function BenefitsClient({ summary, charts, projects, users }: Props) {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [sortKey, setSortKey] = useState<SortKey>("ivg")
  const [sortAsc, setSortAsc] = useState(false)
  const [currentSummary, setCurrentSummary] = useState(summary)
  const [currentCharts, setCurrentCharts] = useState(charts)
  const [currentProjects, setCurrentProjects] = useState(projects)
  const [isPending, startTransition] = useTransition()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runFilter = useCallback((f: FilterState) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        const data = await getPortfolioBenefits({
          years: f.years.map(Number).filter(Boolean),
          areas: f.areas,
          statuses: f.statuses,
          categories: f.categories,
          managerIds: f.managers,
        })
        setCurrentSummary(data.summary)
        setCurrentCharts(data.charts)
        setCurrentProjects(data.projects)
      })
    }, 350)
  }, [])

  function setFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    const next = { ...filters, [key]: value }
    setFilters(next)
    runFilter(next)
  }

  const hasAnyFilter = Object.values(filters).some((v) => v.length > 0)

  function clearAll() { setFilters(EMPTY_FILTERS); runFilter(EMPTY_FILTERS) }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v)
    else { setSortKey(key); setSortAsc(false) }
  }

  // Derived data
  const withBenefits = currentProjects.filter((p) => p.benefitCount > 0)
  const realizationRate = currentSummary.projectCount > 0
    ? Math.round(currentSummary.realizedProjectCount / currentSummary.projectCount * 100) : 0

  const sortedProjects = [...withBenefits].sort((a, b) => {
    let av = 0, bv = 0
    if (sortKey === "ivg")        { av = a.ivg; bv = b.ivg }
    else if (sortKey === "roi")   { av = a.roi ?? -Infinity; bv = b.roi ?? -Infinity }
    else if (sortKey === "realized") { av = a.totalRealized; bv = b.totalRealized }
    else if (sortKey === "planned")  { av = a.totalPlanned; bv = b.totalPlanned }
    else if (sortKey === "investment") { av = a.investment; bv = b.investment }
    else if (sortKey === "payback") { av = a.paybackMonths ?? Infinity; bv = b.paybackMonths ?? Infinity }
    return sortAsc ? av - bv : bv - av
  })

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)

  // Alerts
  const alerts: { type: "error" | "warning" | "info"; title: string; desc: string }[] = []
  if (currentProjects.some((p) => p.roi !== null && p.roi < 0))
    alerts.push({ type: "error", title: "ROI negativo detectado", desc: "Um ou mais projetos apresentam benefícios realizados abaixo do investimento." })
  if (currentSummary.noMeasurementCount > 0)
    alerts.push({ type: "warning", title: `${currentSummary.noMeasurementCount} projeto${currentSummary.noMeasurementCount > 1 ? "s" : ""} sem medição`, desc: "Projetos sem registro de benefícios realizados. Considere iniciar o monitoramento." })
  if (currentSummary.belowTargetCount > 0)
    alerts.push({ type: "warning", title: `${currentSummary.belowTargetCount} abaixo da meta`, desc: "Projetos com taxa de realização inferior ao esperado. Revise os planos de captura." })
  if (currentSummary.averagePaybackMonths !== null && currentSummary.averagePaybackMonths > 24)
    alerts.push({ type: "info", title: "Payback médio acima de 24 meses", desc: "O portfólio apresenta retorno lento. Avalie a priorização de projetos de alta velocidade de captura." })
  if (alerts.length === 0)
    alerts.push({ type: "info", title: "Portfólio sem alertas críticos", desc: "Todos os indicadores estão dentro de parâmetros aceitáveis." })

  // Category totals for Bloco 3
  const catTotal = currentCharts.byCategory.reduce((s, c) => s + c.value, 0)

  // Scatter data for Bloco 11
  const scatterData = currentProjects
    .filter((p) => p.roi !== null)
    .map((p) => ({
      x: Math.round(p.roi ?? 0),
      y: p.ivg,
      z: Math.max(p.investment / 50_000, 60),
      name: p.projectTitle,
      color: ivgColor(p.ivg),
    }))

  // Strategic/compliance for Bloco 10
  const strategicProjects = currentProjects.filter(
    (p) => p.strategicRealized > 0 || p.complianceRealized > 0
  )

  return (
    <div style={{ padding: "24px 24px 40px", maxWidth: 1440, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── FILTER BAR ─────────────────────────────────────────────────────── */}
      <div style={{
        background: "#fff", borderRadius: 14, padding: "14px 20px",
        border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 6px rgba(0,0,0,0.04)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Filter size={14} style={{ color: "#7B2FBE" }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>Filtros</span>
            {isPending && <Loader2 size={13} style={{ color: "#7B2FBE", animation: "spin 1s linear infinite" }} />}
          </div>
          {hasAnyFilter && (
            <button
              onClick={clearAll}
              style={{
                display: "flex", alignItems: "center", gap: 4, fontSize: 12,
                color: "#9CA3AF", background: "none", border: "none", cursor: "pointer", fontWeight: 500,
              }}
            >
              <X size={12} /> Limpar filtros
            </button>
          )}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
          <MultiSelect label="Ano" selected={filters.years} onChange={(v) => setFilter("years", v)}
            options={years.map((y) => ({ value: String(y), label: String(y) }))} placeholder="Todos os anos" />
          <MultiSelect label="Área" selected={filters.areas} onChange={(v) => setFilter("areas", v)}
            options={[
              { value: "TECNOLOGIA", label: "Tecnologia" }, { value: "QUALIDADE", label: "Qualidade" },
              { value: "ESTRATEGICO", label: "Estratégico" }, { value: "OPERACOES", label: "Operações" },
              { value: "COMERCIAL", label: "Comercial" }, { value: "FINANCEIRO", label: "Financeiro" },
            ]} placeholder="Todas as áreas" />
          <MultiSelect label="Status" selected={filters.statuses} onChange={(v) => setFilter("statuses", v)}
            options={[
              { value: "PLANNING", label: "Planejamento" }, { value: "IN_PROGRESS", label: "Em Andamento" },
              { value: "COMPLETED", label: "Concluído" }, { value: "ON_HOLD", label: "Em Espera" },
            ]} placeholder="Todos" />
          <MultiSelect label="Categoria" selected={filters.categories} onChange={(v) => setFilter("categories", v)}
            options={[
              { value: "FINANCIAL", label: "Financeiro" }, { value: "OPERATIONAL", label: "Operacional" },
              { value: "STRATEGIC", label: "Estratégico" }, { value: "COMPLIANCE", label: "Compliance" },
            ]} placeholder="Todas" />
          <MultiSelect label="Gestor" selected={filters.managers} onChange={(v) => setFilter("managers", v)}
            options={users.map((u) => ({ value: u.id, label: u.name }))} placeholder="Todos" />
        </div>
      </div>

      {/* ── BLOCO 1 — RESUMO EXECUTIVO ─────────────────────────────────────── */}
      <Section id="resumo" title="Resumo Executivo" subtitle="KPIs consolidados do portfólio de benefícios" icon={BarChart3}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 14 }}>
          <KpiCard label="Benefício Total Previsto" value={fmtBRL(currentSummary.totalPlanned)}
            sub={`${currentSummary.projectCount} projeto${currentSummary.projectCount !== 1 ? "s" : ""} no portfólio`}
            gradientFrom="#1E3A8A" gradientTo="#2463FF" icon={Target} />
          <KpiCard label="Benefício Realizado" value={fmtBRL(currentSummary.totalRealized)}
            sub={fmtPct(currentSummary.totalPlanned > 0 ? currentSummary.totalRealized / currentSummary.totalPlanned * 100 : 0) + " do previsto"}
            gradientFrom="#065F46" gradientTo="#10B981" icon={CheckCircle} trend="up" />
          <KpiCard label="ROI Médio" value={currentSummary.averageRoi !== null ? fmtPct(currentSummary.averageRoi) : "—"}
            sub={currentSummary.averageRoi !== null ? (currentSummary.averageRoi > 0 ? "Retorno positivo" : "Retorno negativo") : "Sem dados"}
            gradientFrom="#4C1D95" gradientTo="#7B2FBE" icon={TrendingUp}
            trend={currentSummary.averageRoi !== null ? (currentSummary.averageRoi > 0 ? "up" : "down") : "neutral"} />
          <KpiCard label="Payback Médio" value={currentSummary.averagePaybackMonths !== null ? `${Math.round(currentSummary.averagePaybackMonths)}m` : "—"}
            sub="Meses para recuperar investimento"
            gradientFrom="#713F12" gradientTo="#F59E0B" icon={Clock} />
          <KpiCard label="Valor Líquido Gerado" value={fmtBRL(currentSummary.netValueGenerated)}
            sub="Benefícios realizados − investimento"
            gradientFrom="#065F46" gradientTo="#059669" icon={DollarSign}
            trend={currentSummary.netValueGenerated > 0 ? "up" : "down"} />
          <KpiCard label="Economia Mensal" value={fmtBRL(currentSummary.economyMonthly)}
            sub="Recorrente por mês"
            gradientFrom="#1E3A8A" gradientTo="#3B82F6" icon={Activity} />
          <KpiCard label="Economia Anual" value={fmtBRL(currentSummary.economyAnnual)}
            sub="Projeção anualizada"
            gradientFrom="#134E4A" gradientTo="#0D9488" icon={Star} />
          <KpiCard label="Horas Economizadas" value={fmtNum(currentSummary.totalHours) + "h"}
            sub="Ganho operacional acumulado"
            gradientFrom="#1E3A8A" gradientTo="#6366F1" icon={Zap} />
          <KpiCard
            label="IVG Médio do Portfólio"
            value={currentSummary.averageIvg !== null ? Math.round(currentSummary.averageIvg) + "/100" : "—"}
            sub={currentSummary.averageIvg !== null ? ivgLabel(currentSummary.averageIvg) : "Sem dados"}
            gradientFrom={currentSummary.averageIvg !== null ? ivgColor(currentSummary.averageIvg) + "CC" : "#4B5563"}
            gradientTo={currentSummary.averageIvg !== null ? ivgColor(currentSummary.averageIvg) : "#6B7280"}
            icon={Award} />
          <KpiCard label="Projetos c/ Benefício" value={`${currentSummary.realizedProjectCount}`}
            sub={`de ${currentSummary.projectCount} · ${realizationRate}% do portfólio`}
            gradientFrom="#4C1D95" gradientTo="#8B5CF6" icon={BarChart3} />
          <KpiCard label="Abaixo da Meta" value={`${currentSummary.belowTargetCount}`}
            sub="Projetos com realização insuficiente"
            gradientFrom={currentSummary.belowTargetCount > 0 ? "#7F1D1D" : "#1F2937"}
            gradientTo={currentSummary.belowTargetCount > 0 ? "#EF4444" : "#374151"}
            icon={AlertTriangle} />
          <KpiCard label="Sem Medição" value={`${currentSummary.noMeasurementCount}`}
            sub="Sem registro de benefícios realizados"
            gradientFrom="#1F2937" gradientTo="#4B5563" icon={AlertCircle} />
        </div>
      </Section>

      {/* ── BLOCO 7 — PORTFÓLIO SUMMARY ROW ───────────────────────────────── */}
      <Section id="portfolio" title="Visão do Portfólio" subtitle="Indicadores financeiros consolidados" icon={DollarSign} accentColor="#2463FF">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 12 }}>
          {[
            { label: "Total Investido", value: fmtBRL(currentSummary.totalInvestment), color: "#6366F1" },
            { label: "Benefício Total", value: fmtBRL(currentSummary.totalRealized), color: "#10B981" },
            { label: "ROI do Portfólio", value: currentSummary.averageRoi !== null ? fmtPct(currentSummary.averageRoi) : "—", color: currentSummary.averageRoi !== null && currentSummary.averageRoi < 0 ? "#EF4444" : "#7B2FBE" },
            { label: "Economia Total", value: fmtBRL(currentSummary.totalEconomy), color: "#0D9488" },
            { label: "Horas Economizadas", value: fmtNum(currentSummary.totalHours) + "h", color: "#3B82F6" },
            { label: "Payback Médio", value: currentSummary.averagePaybackMonths !== null ? `${Math.round(currentSummary.averagePaybackMonths)}m` : "—", color: "#F59E0B" },
            { label: "IVG Médio", value: currentSummary.averageIvg !== null ? `${Math.round(currentSummary.averageIvg)}/100` : "—", color: currentSummary.averageIvg !== null ? ivgColor(currentSummary.averageIvg) : "#6B7280" },
            { label: "Taxa Realização", value: fmtPct(realizationRate), color: realizationRate >= 70 ? "#10B981" : realizationRate >= 40 ? "#F59E0B" : "#EF4444" },
          ].map((item) => (
            <div key={item.label} style={{
              padding: "16px 18px", borderRadius: 10,
              background: "#F8F7FB", border: "1px solid rgba(0,0,0,0.05)",
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9CA3AF", marginBottom: 6 }}>{item.label}</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: item.color, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>{item.value}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── BLOCO 2 — IMPACTO FINANCEIRO ──────────────────────────────────── */}
      <Section id="financeiro" title="Impacto Financeiro" subtitle="Previsto vs. realizado e receita vs. economia por projeto" icon={TrendingUp} accentColor="#10B981">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* Previsto vs Realizado */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#9CA3AF", marginBottom: 12 }}>Previsto vs. Realizado (top 8)</div>
            {currentCharts.topProjects.length === 0 ? (
              <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "#9CA3AF", fontSize: 13 }}>Sem dados</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={currentCharts.topProjects.slice(0, 8).map((p) => ({
                    name: p.name.length > 18 ? p.name.slice(0, 17) + "…" : p.name,
                    fullName: p.name,
                    planned: p.planned, realized: p.realized,
                  }))}
                  margin={{ top: 4, right: 10, bottom: 24, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} angle={-30} textAnchor="end" />
                  <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} tickFormatter={fmtBRL} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Bar dataKey="planned" name="Previsto" fill="#2463FF" radius={[4, 4, 0, 0]} opacity={0.7} />
                  <Bar dataKey="realized" name="Realizado" fill="#10B981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Receita vs Economia */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#9CA3AF", marginBottom: 12 }}>Receita vs. Economia por Projeto</div>
            {currentCharts.revenueVsEconomy.length === 0 ? (
              <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "#9CA3AF", fontSize: 13 }}>Sem dados</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={currentCharts.revenueVsEconomy.slice(0, 8).map((p) => ({
                    name: p.name.length > 18 ? p.name.slice(0, 17) + "…" : p.name,
                    revenue: p.revenue, economy: p.economy,
                  }))}
                  margin={{ top: 4, right: 10, bottom: 24, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} angle={-30} textAnchor="end" />
                  <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} tickFormatter={fmtBRL} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Bar dataKey="revenue" name="Receita" fill="#7B2FBE" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="economy" name="Economia" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </Section>

      {/* ── BLOCO 3 — BENEFÍCIOS POR CATEGORIA ────────────────────────────── */}
      <Section id="categorias" title="Benefícios por Categoria" subtitle="Distribuição do valor realizado entre as categorias do portfólio" icon={Award} accentColor="#8B5CF6">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "center" }}>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={currentCharts.byCategory.filter((c) => c.value > 0)}
                cx="50%" cy="50%" innerRadius={64} outerRadius={100}
                paddingAngle={3} dataKey="value" startAngle={90} endAngle={-270}
              >
                {currentCharts.byCategory.filter((c) => c.value > 0).map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0].payload as typeof currentCharts.byCategory[0]
                  return (
                    <div style={{
                      background: "#1A0B2E", borderRadius: 10, padding: "10px 14px",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.25)", fontSize: 12, color: "#fff",
                    }}>
                      <div style={{ fontWeight: 700, color: d.color }}>{d.name}</div>
                      <div style={{ color: "#9CA3AF", marginTop: 4 }}>{fmtBRL(d.value)} · {d.pct}%</div>
                    </div>
                  )
                }}
              />
            </PieChart>
          </ResponsiveContainer>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {currentCharts.byCategory.map((cat) => (
              <div key={cat.name} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: cat.color, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{cat.name}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#111827", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(cat.value)}</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 3, background: "#F3F4F6", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 3, background: cat.color, width: `${cat.pct}%`, transition: "width 0.5s" }} />
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: cat.color, minWidth: 36, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {cat.pct}%
                </span>
              </div>
            ))}
            {catTotal === 0 && (
              <div style={{ color: "#9CA3AF", fontSize: 13 }}>Sem dados de categoria</div>
            )}
          </div>
        </div>
      </Section>

      {/* ── BLOCO 4 — IVG POR PROJETO ─────────────────────────────────────── */}
      <Section id="ivg" title="IVG por Projeto" subtitle="Índice de Valor Gerado — score proprietário 0–100" icon={Star} accentColor="#7B2FBE">
        {withBenefits.length === 0 ? (
          <div style={{ color: "#9CA3AF", fontSize: 13, padding: "20px 0" }}>Nenhum projeto com benefícios cadastrados.</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {[...withBenefits].sort((a, b) => b.ivg - a.ivg).map((p) => (
              <div key={p.projectId} style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                gap: 6, padding: "14px 16px", borderRadius: 12,
                background: ivgBg(p.ivg), border: `1px solid ${ivgColor(p.ivg)}30`,
                minWidth: 130, flex: "1 0 130px", maxWidth: 200,
              }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: ivgColor(p.ivg), fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{p.ivg}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: ivgColor(p.ivg), textTransform: "uppercase", letterSpacing: "0.06em" }}>{p.ivgLabel}</div>
                <div style={{ fontSize: 11, color: "#374151", textAlign: "center", fontWeight: 600, lineHeight: 1.3 }}>{p.projectTitle}</div>
                <div style={{ height: 4, borderRadius: 2, background: "rgba(0,0,0,0.08)", width: "100%", overflow: "hidden" }}>
                  <div style={{ height: "100%", background: ivgColor(p.ivg), borderRadius: 2, width: `${p.ivg}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── BLOCO 5 — EVOLUÇÃO DOS BENEFÍCIOS ─────────────────────────────── */}
      <Section id="timeline" title="Evolução dos Benefícios" subtitle="Benefícios acumulados ao longo do tempo — previsto vs. realizado" icon={Activity} accentColor="#2463FF">
        {currentCharts.timeline.length === 0 ? (
          <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "#9CA3AF", fontSize: 13 }}>
            Nenhum dado de timeline disponível
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={currentCharts.timeline} margin={{ top: 8, right: 20, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} tickFormatter={fmtBRL} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  return (
                    <div style={{
                      background: "#1A0B2E", borderRadius: 10, padding: "10px 14px",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.25)", fontSize: 12, color: "#fff",
                    }}>
                      <div style={{ fontWeight: 700, marginBottom: 8, color: "#E5E7EB" }}>{label}</div>
                      {payload.map((p, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
                          <span style={{ color: "#9CA3AF" }}>{p.name}:</span>
                          <span style={{ fontWeight: 700 }}>{fmtBRL(Number(p.value))}</span>
                        </div>
                      ))}
                    </div>
                  )
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Line
                type="monotone" dataKey="cumPlanned" name="Previsto Acumulado"
                stroke="#2463FF" strokeWidth={2} strokeDasharray="6 3"
                dot={false} activeDot={{ r: 5 }}
              />
              <Line
                type="monotone" dataKey="cumRealized" name="Realizado Acumulado"
                stroke="#10B981" strokeWidth={2.5}
                dot={false} activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Section>

      {/* ── BLOCO 6 — TABELA DE PROJETOS ──────────────────────────────────── */}
      <Section id="tabela" title="Benefícios por Projeto" subtitle="Clique nos cabeçalhos para ordenar" icon={BarChart3}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #F3F4F6" }}>
                {([
                  { key: null, label: "Projeto" },
                  { key: "investment" as SortKey, label: "Investimento" },
                  { key: "planned" as SortKey, label: "Previsto" },
                  { key: "realized" as SortKey, label: "Realizado" },
                  { key: "roi" as SortKey, label: "ROI" },
                  { key: "payback" as SortKey, label: "Payback" },
                  { key: "ivg" as SortKey, label: "IVG" },
                  { key: null, label: "Status" },
                  { key: null, label: "" },
                ] as { key: SortKey | null; label: string }[]).map((col) => (
                  <th key={col.label}
                    onClick={col.key ? () => toggleSort(col.key!) : undefined}
                    style={{
                      padding: "8px 12px", textAlign: "left", fontWeight: 700, fontSize: 10,
                      textTransform: "uppercase", letterSpacing: "0.08em", color: "#9CA3AF",
                      whiteSpace: "nowrap", cursor: col.key ? "pointer" : "default",
                      userSelect: "none",
                    }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {col.label}
                      {col.key && (
                        <ArrowUpDown size={11} style={{ color: sortKey === col.key ? "#7B2FBE" : "#D1D5DB" }} />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedProjects.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: "40px 12px", textAlign: "center", color: "#9CA3AF" }}>Nenhum projeto com benefícios cadastrados</td></tr>
              ) : sortedProjects.map((p, idx) => (
                <tr key={p.projectId} style={{ borderBottom: "1px solid #F9FAFB", background: idx % 2 === 0 ? "transparent" : "rgba(123,47,190,0.015)" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 600, color: "#111827", maxWidth: 220 }}>
                    <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.projectTitle}</span>
                    <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 400 }}>{p.projectArea}</span>
                  </td>
                  <td style={{ padding: "10px 12px", fontVariantNumeric: "tabular-nums", color: "#374151" }}>
                    {p.investment > 0 ? fmtBRL(p.investment) : <span style={{ color: "#D1D5DB" }}>—</span>}
                  </td>
                  <td style={{ padding: "10px 12px", fontVariantNumeric: "tabular-nums", color: "#374151" }}>{fmtBRL(p.totalPlanned)}</td>
                  <td style={{ padding: "10px 12px", fontVariantNumeric: "tabular-nums", fontWeight: 700, color: "#10B981" }}>{fmtBRL(p.totalRealized)}</td>
                  <td style={{ padding: "10px 12px", fontVariantNumeric: "tabular-nums" }}>
                    {p.roi !== null ? (
                      <span style={{ fontWeight: 700, color: p.roi >= 0 ? "#059669" : "#EF4444" }}>
                        {p.roi >= 0 ? "+" : ""}{fmtPct(p.roi)}
                      </span>
                    ) : <span style={{ color: "#D1D5DB" }}>—</span>}
                  </td>
                  <td style={{ padding: "10px 12px", fontVariantNumeric: "tabular-nums", color: "#374151" }}>
                    {p.paybackMonths !== null ? `${Math.round(p.paybackMonths)}m` : <span style={{ color: "#D1D5DB" }}>—</span>}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <IvgBadge score={p.ivg} size="sm" />
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <StatusPill status={p.projectStatus} />
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <Link href={`/projects/${p.projectId}/benefits`}
                      style={{ display: "inline-flex", alignItems: "center", gap: 3, color: "#7B2FBE", fontWeight: 600, fontSize: 12, textDecoration: "none" }}>
                      Ver <ChevronRight size={12} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {sortedProjects.length > 0 && (
          <div style={{
            marginTop: 12, paddingTop: 12, borderTop: "1px solid #F3F4F6",
            display: "flex", flexWrap: "wrap", gap: 20, fontSize: 12,
          }}>
            <span style={{ color: "#6B7280" }}><strong style={{ color: "#111827" }}>{sortedProjects.length}</strong> projetos</span>
            <span style={{ color: "#6B7280" }}>Total realizado: <strong style={{ color: "#10B981" }}>{fmtBRL(sortedProjects.reduce((s, p) => s + p.totalRealized, 0))}</strong></span>
            {currentSummary.averageRoi !== null && (
              <span style={{ color: "#6B7280" }}>ROI médio: <strong style={{ color: "#7B2FBE" }}>{fmtPct(currentSummary.averageRoi)}</strong></span>
            )}
            {currentSummary.averageIvg !== null && (
              <span style={{ color: "#6B7280" }}>IVG médio: <strong style={{ color: ivgColor(currentSummary.averageIvg) }}>{Math.round(currentSummary.averageIvg)}/100</strong></span>
            )}
          </div>
        )}
      </Section>

      {/* ── BLOCO 8 — ALERTAS ─────────────────────────────────────────────── */}
      <Section id="alertas" title="Alertas do Portfólio" subtitle="Situações que requerem atenção da gestão" icon={AlertTriangle} accentColor="#F59E0B">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {alerts.map((a, i) => <AlertItem key={i} {...a} />)}
        </div>
      </Section>

      {/* ── BLOCO 9 — GANHOS OPERACIONAIS ─────────────────────────────────── */}
      <Section id="operacional" title="Ganhos Operacionais" subtitle="Eficiência e produtividade geradas pelos projetos" icon={Zap} accentColor="#3B82F6">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
          <div style={{ padding: "20px", borderRadius: 12, background: "rgba(59,130,246,0.07)", border: "1px solid rgba(59,130,246,0.15)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#3B82F6", marginBottom: 8 }}>Horas Economizadas</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: "#1E3A8A", fontVariantNumeric: "tabular-nums" }}>{fmtNum(currentSummary.totalHours)}h</div>
            <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>Total acumulado do portfólio</div>
          </div>

          <div style={{ padding: "20px", borderRadius: 12, background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.15)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#10B981", marginBottom: 8 }}>Projetos c/ Ganhos Operacionais</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: "#065F46", fontVariantNumeric: "tabular-nums" }}>
              {currentProjects.filter((p) => p.operationalRealized > 0 || p.hoursSaved > 0).length}
            </div>
            <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>De {currentSummary.projectCount} projetos no total</div>
          </div>

          <div style={{ padding: "20px", borderRadius: 12, background: "rgba(123,47,190,0.07)", border: "1px solid rgba(123,47,190,0.15)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7B2FBE", marginBottom: 8 }}>Taxa de Realização Operacional</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: "#4C1D95", fontVariantNumeric: "tabular-nums" }}>
              {fmtPct(currentSummary.productivityCount > 0 && currentSummary.projectCount > 0
                ? currentSummary.productivityCount / currentSummary.projectCount * 100 : 0)}
            </div>
            <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>Projetos com ganhos de produtividade</div>
          </div>

          <div style={{ padding: "20px", borderRadius: 12, background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.15)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#F59E0B", marginBottom: 8 }}>Economia Operacional Mensal</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: "#92400E", fontVariantNumeric: "tabular-nums" }}>
              {fmtBRL(currentSummary.economyMonthly)}
            </div>
            <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>Recorrente / mês</div>
          </div>
        </div>
      </Section>

      {/* ── BLOCO 10 — BENEFÍCIOS ESTRATÉGICOS ────────────────────────────── */}
      <Section id="estrategico" title="Benefícios Estratégicos e Compliance" subtitle="Projetos com impacto em governança, risco e transformação" icon={Shield} accentColor="#8B5CF6">
        {strategicProjects.length === 0 ? (
          <div style={{ color: "#9CA3AF", fontSize: 13, padding: "16px 0" }}>Nenhum projeto com benefícios estratégicos ou de compliance registrados.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {strategicProjects.map((p) => (
              <div key={p.projectId} style={{
                padding: "16px", borderRadius: 12,
                background: "#FAFAF9", border: "1px solid #E5E7EB",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{p.projectTitle}</div>
                    <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{p.projectArea}</div>
                  </div>
                  <IvgBadge score={p.ivg} size="sm" />
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {p.strategicRealized > 0 && (
                    <div style={{ fontSize: 11, padding: "3px 8px", borderRadius: 20, background: "rgba(139,92,246,0.1)", color: "#7C3AED", fontWeight: 600 }}>
                      Estratégico {fmtBRL(p.strategicRealized)}
                    </div>
                  )}
                  {p.complianceRealized > 0 && (
                    <div style={{ fontSize: 11, padding: "3px 8px", borderRadius: 20, background: "rgba(245,158,11,0.1)", color: "#B45309", fontWeight: 600 }}>
                      Compliance {fmtBRL(p.complianceRealized)}
                    </div>
                  )}
                </div>
                <div style={{ marginTop: 10 }}>
                  <div style={{ height: 4, borderRadius: 2, background: "#F3F4F6", overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: 2,
                      background: "linear-gradient(90deg, #8B5CF6, #F59E0B)",
                      width: `${p.realizationRate}%`,
                    }} />
                  </div>
                  <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 3, fontVariantNumeric: "tabular-nums" }}>
                    Taxa de realização: {fmtPct(p.realizationRate)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── BLOCO 11 — MATRIZ IMPACTO × ROI ──────────────────────────────── */}
      <Section id="matriz" title="Matriz Impacto × ROI" subtitle="IVG vs. ROI — tamanho do ponto proporcional ao investimento" icon={Target} accentColor="#2463FF" defaultOpen={false}>
        {scatterData.length === 0 ? (
          <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "#9CA3AF", fontSize: 13 }}>
            Nenhum projeto com ROI calculado disponível
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={340}>
            <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis
                type="number" dataKey="x" name="ROI (%)"
                tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false}
                label={{ value: "ROI (%)", position: "insideBottom", offset: -12, fontSize: 11, fill: "#9CA3AF" }}
              />
              <YAxis
                type="number" dataKey="y" name="IVG" domain={[0, 100]}
                tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false}
                label={{ value: "IVG", angle: -90, position: "insideLeft", fontSize: 11, fill: "#9CA3AF" }}
              />
              <ZAxis type="number" dataKey="z" range={[40, 400]} />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0].payload as typeof scatterData[0]
                  return (
                    <div style={{
                      background: "#1A0B2E", borderRadius: 10, padding: "10px 14px",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.25)", fontSize: 12, color: "#fff",
                      border: `1px solid ${d.color}40`,
                    }}>
                      <div style={{ fontWeight: 700, marginBottom: 6, color: "#E5E7EB" }}>{d.name}</div>
                      <div style={{ color: "#9CA3AF" }}>ROI: <strong style={{ color: d.x >= 0 ? "#10B981" : "#EF4444" }}>{d.x >= 0 ? "+" : ""}{d.x}%</strong></div>
                      <div style={{ color: "#9CA3AF" }}>IVG: <strong style={{ color: d.color }}>{d.y} — {ivgLabel(d.y)}</strong></div>
                    </div>
                  )
                }}
              />
              <Scatter data={scatterData} shape={
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (props: any) => (
                  <circle
                    cx={props.cx ?? 0} cy={props.cy ?? 0} r={props.r ?? 8}
                    fill={(props.payload as typeof scatterData[0]).color}
                    fillOpacity={0.7}
                    stroke={(props.payload as typeof scatterData[0]).color}
                    strokeWidth={1.5}
                  />
                )
              } />
            </ScatterChart>
          </ResponsiveContainer>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
          {[
            { label: "Valor Excepcional", color: "#10B981" },
            { label: "Alto Valor", color: "#3B82F6" },
            { label: "Bom Valor", color: "#7B2FBE" },
            { label: "Valor Moderado", color: "#F59E0B" },
            { label: "Baixo Valor", color: "#EF4444" },
          ].map((b) => (
            <span key={b.label} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "#6B7280" }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: b.color }} />
              {b.label}
            </span>
          ))}
        </div>
      </Section>

      {/* Spinner overlay */}
      {isPending && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(26,11,46,0.15)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
          backdropFilter: "blur(2px)",
        }}>
          <div style={{
            background: "#fff", borderRadius: 14, padding: "20px 28px",
            display: "flex", alignItems: "center", gap: 12,
            boxShadow: "0 16px 40px rgba(0,0,0,0.15)",
          }}>
            <Loader2 size={20} style={{ color: "#7B2FBE", animation: "spin 1s linear infinite" }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>Atualizando filtros…</span>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
