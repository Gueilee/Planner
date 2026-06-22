"use client"

import { useState, useCallback, useTransition, useRef, useEffect } from "react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LabelList,
} from "recharts"
import Link from "next/link"
import {
  BarChart3, Award, Filter,
  ChevronRight, Sparkles, Target, ChevronDown, X, Loader2,
} from "lucide-react"
import { getPortfolioBenefits } from "@/lib/actions/benefits"
import { impactColor, impactBg } from "@/lib/utils/benefits-calc"
import type { PortfolioSummary, PortfolioChartData, ProjectBenefitMetrics } from "@/lib/types/benefits"

// ── Multi-Select Dropdown ──────────────────────────────────────────────────────
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

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value])
  }

  const displayLabel = selected.length === 0
    ? placeholder
    : selected.length === 1
      ? options.find((o) => o.value === selected[0])?.label ?? selected[0]
      : `${selected.length} selecionados`

  const hasSelection = selected.length > 0

  return (
    <div ref={ref} className="relative flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center justify-between gap-2 h-8 px-3 rounded-lg text-sm border transition-all min-w-[140px] ${
          hasSelection
            ? "border-purple-300 bg-purple-50 text-purple-800 font-semibold"
            : "border-slate-200 bg-white text-slate-600"
        }`}
      >
        <span className="truncate">{displayLabel}</span>
        <div className="flex items-center gap-1 shrink-0">
          {hasSelection && (
            <span
              className="w-4 h-4 rounded-full bg-purple-600 text-white text-[9px] font-black flex items-center justify-center"
              onClick={(e) => { e.stopPropagation(); onChange([]) }}
            >
              {selected.length}
            </span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 z-50 min-w-[180px] rounded-xl shadow-xl overflow-hidden"
          style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)" }}
        >
          {options.map((opt) => {
            const checked = selected.includes(opt.value)
            return (
              <button
                key={opt.value}
                onClick={() => toggle(opt.value)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors hover:bg-purple-50 ${
                  checked ? "bg-purple-50/60" : ""
                }`}
              >
                <span
                  className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border-2 transition-all ${
                    checked ? "border-purple-600 bg-purple-600" : "border-slate-300"
                  }`}
                >
                  {checked && (
                    <svg viewBox="0 0 10 8" className="w-2.5 h-2.5 fill-white">
                      <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className={`font-medium ${checked ? "text-purple-800" : "text-slate-700"}`}>{opt.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function fmtBRL(v: number) {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `R$ ${(v / 1_000).toFixed(0)}K`
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
}

function fmtNum(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`
  return String(Math.round(v))
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, gradient, glow, icon: Icon }: {
  label: string; value: string; sub?: string; gradient: string; glow: string; icon: React.ElementType
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-5 text-white"
      style={{ background: gradient, boxShadow: `0 4px 24px ${glow}` }}
    >
      <div className="absolute -top-5 -right-5 w-24 h-24 rounded-full opacity-10"
        style={{ background: "radial-gradient(circle, white 0%, transparent 70%)" }} />
      <div className="flex items-start justify-between mb-3">
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">{label}</p>
        <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-3xl font-black leading-none">{value}</p>
      {sub && <p className="text-xs opacity-60 mt-1.5 font-medium">{sub}</p>}
    </div>
  )
}

// ── Impact Badge ──────────────────────────────────────────────────────────────
function ImpactBadge({ score, label }: { score: number; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
      style={{ color: impactColor(score), background: impactBg(score) }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: impactColor(score) }} />
      {label}
    </span>
  )
}

// ── Score Bar ─────────────────────────────────────────────────────────────────
function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${score}%`, background: impactColor(score) }}
        />
      </div>
      <span className="text-xs font-bold tabular-nums" style={{ color: impactColor(score) }}>{score}</span>
    </div>
  )
}

// ── Custom Tooltip for charts ─────────────────────────────────────────────────
function CustomBarTooltip({ active, payload }: { active?: boolean; payload?: { name: string; value: number; payload: { name: string } }[] }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-100 rounded-xl shadow-lg p-3 text-xs">
      <p className="font-semibold text-slate-700 mb-1">{payload[0].payload.name}</p>
      <p className="text-slate-500">Valor planejado: <span className="font-bold text-slate-800">{fmtBRL(payload[0].value)}</span></p>
      {payload[1] && <p className="text-slate-500">ROI: <span className="font-bold text-purple-700">{payload[1].value !== null ? `${Math.round(payload[1].value as number)}%` : "—"}</span></p>}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
interface Props {
  summary: PortfolioSummary
  charts: PortfolioChartData
  projects: ProjectBenefitMetrics[]
  users: { id: string; name: string }[]
  userRole: string
}

interface FilterState {
  years:      string[]
  areas:      string[]
  statuses:   string[]
  categories: string[]
  managers:   string[]
}

const EMPTY_FILTERS: FilterState = { years: [], areas: [], statuses: [], categories: [], managers: [] }

export function BenefitsClient({ summary, charts, projects, users, userRole }: Props) {
  const [filters,   setFilters]   = useState<FilterState>(EMPTY_FILTERS)
  const [sortBy,    setSortBy]    = useState<"value" | "roi" | "score">("value")
  const [currentSummary,  setCurrentSummary]  = useState(summary)
  const [currentCharts,   setCurrentCharts]   = useState(charts)
  const [currentProjects, setCurrentProjects] = useState(projects)
  const [isPending, startTransition] = useTransition()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runFilter = useCallback((f: FilterState) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        const data = await getPortfolioBenefits({
          years:      f.years.map(Number).filter(Boolean),
          areas:      f.areas,
          statuses:   f.statuses,
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

  function clearAll() {
    setFilters(EMPTY_FILTERS)
    runFilter(EMPTY_FILTERS)
  }

  const withBenefits       = currentProjects.filter((p) => p.benefitCount > 0)
  const totalBenefitCount  = withBenefits.reduce((s, p) => s + p.benefitCount,  0)
  const totalRealizedCount = withBenefits.reduce((s, p) => s + p.realizedCount, 0)
  const realizationRate    = totalBenefitCount > 0 ? Math.round(totalRealizedCount / totalBenefitCount * 100) : 0

  const sorted = [...withBenefits].sort((a, b) => {
    if (sortBy === "roi")   return b.impactScore - a.impactScore  // fallback to score if no ROI
    if (sortBy === "score") return b.impactScore - a.impactScore
    return b.benefitCount - a.benefitCount
  })

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">

      {/* ── KPI Row ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Projetos com Benefícios"
          value={`${withBenefits.length}`}
          sub={`de ${currentSummary.projectCount} projetos · ${Math.round(withBenefits.length / Math.max(currentSummary.projectCount, 1) * 100)}% do portfólio`}
          gradient="linear-gradient(135deg,#065F46,#10B981)"
          glow="rgba(16,185,129,0.3)"
          icon={BarChart3}
        />
        <KpiCard
          label="Score Médio de Impacto"
          value={currentSummary.averageImpactScore !== null ? `${Math.round(currentSummary.averageImpactScore)} pts` : "—"}
          sub={currentSummary.averageImpactScore !== null
            ? (currentSummary.averageImpactScore <= 20 ? "Baixo Impacto"
              : currentSummary.averageImpactScore <= 40 ? "Moderado"
              : currentSummary.averageImpactScore <= 60 ? "Relevante"
              : currentSummary.averageImpactScore <= 80 ? "Alto Impacto"
              : "Transformacional")
            : "Sem dados"}
          gradient="linear-gradient(135deg,#1E40AF,#3B82F6)"
          glow="rgba(59,130,246,0.3)"
          icon={Sparkles}
        />
        <KpiCard
          label="Benefícios Cadastrados"
          value={`${totalBenefitCount}`}
          sub={`em ${withBenefits.length} projeto${withBenefits.length !== 1 ? "s" : ""}`}
          gradient="linear-gradient(135deg,#4C1D95,#7B2FBE)"
          glow="rgba(123,47,190,0.35)"
          icon={Award}
        />
        <KpiCard
          label="Taxa de Realização"
          value={`${realizationRate}%`}
          sub={`${totalRealizedCount} realizados · ${totalBenefitCount - totalRealizedCount} pendentes`}
          gradient="linear-gradient(135deg,#92400E,#F59E0B)"
          glow="rgba(245,158,11,0.3)"
          icon={Target}
        />
      </div>

      {/* ── Filters ──────────────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl p-4"
        style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-semibold text-slate-700">Filtros</span>
            {isPending && <Loader2 className="w-3.5 h-3.5 text-purple-500 animate-spin" />}
          </div>
          {hasAnyFilter && (
            <button
              onClick={clearAll}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 transition-colors font-medium"
            >
              <X className="w-3 h-3" />
              Limpar filtros
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <MultiSelect
            label="Ano"
            selected={filters.years}
            onChange={(v) => setFilter("years", v)}
            options={years.map((y) => ({ value: String(y), label: String(y) }))}
            placeholder="Todos os anos"
          />
          <MultiSelect
            label="Área"
            selected={filters.areas}
            onChange={(v) => setFilter("areas", v)}
            options={[
              { value: "TECNOLOGIA", label: "Tecnologia" },
              { value: "QUALIDADE", label: "Qualidade" },
              { value: "ESTRATEGICO", label: "Estratégico" },
              { value: "OPERACOES", label: "Operações" },
              { value: "COMERCIAL", label: "Comercial" },
              { value: "FINANCEIRO", label: "Financeiro" },
            ]}
            placeholder="Todas as áreas"
          />
          <MultiSelect
            label="Status do Projeto"
            selected={filters.statuses}
            onChange={(v) => setFilter("statuses", v)}
            options={[
              { value: "PLANNING",    label: "Planejamento" },
              { value: "IN_PROGRESS", label: "Em Andamento" },
              { value: "COMPLETED",   label: "Concluído" },
              { value: "ON_HOLD",     label: "Em Espera" },
            ]}
            placeholder="Todos"
          />
          <MultiSelect
            label="Categoria"
            selected={filters.categories}
            onChange={(v) => setFilter("categories", v)}
            options={[
              { value: "FINANCIAL",   label: "Financeiro" },
              { value: "OPERATIONAL", label: "Operacional" },
              { value: "STRATEGIC",   label: "Estratégico" },
            ]}
            placeholder="Todas"
          />
          <MultiSelect
            label="Gestor"
            selected={filters.managers}
            onChange={(v) => setFilter("managers", v)}
            options={users.map((u) => ({ value: u.id, label: u.name }))}
            placeholder="Todos"
          />
        </div>
      </div>

      {/* ── Charts Row ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Bar chart — top projects by impact score */}
        <div
          className="xl:col-span-2 rounded-2xl p-5"
          style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
        >
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-purple-600" />
              Top Projetos por Score de Impacto
            </h3>
          </div>
          <p className="text-[11px] text-slate-400 mb-4">Pontuação de impacto 0–100 · considera quantidade, diversidade e profundidade dos benefícios</p>
          {(() => {
            const chartData = [...withBenefits]
              .sort((a, b) => b.impactScore - a.impactScore)
              .slice(0, 10)
              .map((p) => ({
                name:      p.projectTitle,
                shortName: p.projectTitle.length > 28 ? p.projectTitle.slice(0, 26) + "…" : p.projectTitle,
                score:     p.impactScore,
                label:     p.impactLabel,
                count:     p.benefitCount,
                realized:  p.realizedCount,
                area:      p.projectArea,
                color:     p.impactScore > 80 ? "#7B2FBE" : p.impactScore > 60 ? "#EA580C" : p.impactScore > 40 ? "#D97706" : p.impactScore > 20 ? "#2563EB" : "#64748B",
              }))
            if (chartData.length === 0) {
              return <div className="h-56 flex items-center justify-center text-slate-400 text-sm">Nenhum benefício cadastrado ainda</div>
            }
            const barH   = 28
            const chartH = Math.max(160, chartData.length * (barH + 16) + 32)
            return (
              <ResponsiveContainer width="100%" height={chartH}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 60, top: 4, bottom: 4 }} barSize={barH}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="shortName"
                    width={160}
                    tick={{ fontSize: 11, fill: "#374151" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0].payload as typeof chartData[0]
                      return (
                        <div className="bg-white border border-slate-100 rounded-xl shadow-lg p-3 text-xs max-w-[240px]">
                          <p className="font-semibold text-slate-700 mb-2 leading-snug">{d.name}</p>
                          <p style={{ color: d.color }} className="font-bold text-sm">{d.label} · {d.score}/100</p>
                          <p className="text-slate-400 mt-1">{d.count} benefício{d.count !== 1 ? "s" : ""} · {d.realized} realizado{d.realized !== 1 ? "s" : ""}</p>
                          <p className="text-slate-400">Área: {d.area}</p>
                        </div>
                      )
                    }}
                  />
                  <Bar dataKey="score" radius={[0, 6, 6, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                    <LabelList
                      dataKey="score"
                      position="right"
                      formatter={(v: unknown) => `${Number(v)}`}
                      style={{ fontSize: 11, fontWeight: 700, fill: "#374151" }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )
          })()}
        </div>

        {/* Pie — status dos benefícios */}
        <div
          className="rounded-2xl p-5"
          style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
        >
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-purple-600" />
            Status dos Benefícios
          </h3>
          <p className="text-[11px] text-slate-400 mb-3">Proporção entre benefícios realizados e pendentes</p>
          {(() => {
            const pending  = totalBenefitCount - totalRealizedCount
            if (totalBenefitCount === 0) {
              return <div className="h-48 flex items-center justify-center text-slate-400 text-sm">Sem dados</div>
            }
            const pieData = [
              { name: "Realizados",  value: totalRealizedCount, color: "#10B981" },
              { name: "Pendentes",   value: pending,            color: "#E2E8F0" },
            ].filter((d) => d.value > 0)
            return (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={44} outerRadius={72} paddingAngle={3} dataKey="value" startAngle={90} endAngle={-270}>
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: unknown) => [`${Number(v)} benefício${Number(v) !== 1 ? "s" : ""}`, ""]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-3 mt-3">
                  {pieData.map((c) => (
                    <div key={c.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                        <span className="text-slate-600 font-medium">{c.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-slate-800">{c.value}</span>
                        <span className="text-slate-400 ml-1">({Math.round(c.value / totalBenefitCount * 100)}%)</span>
                      </div>
                    </div>
                  ))}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-500">Total</span>
                    <span className="font-bold text-slate-800">{totalBenefitCount} benefícios</span>
                  </div>
                </div>
              </>
            )
          })()}
        </div>
      </div>

      {/* ── Second Charts Row ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Benefícios por Área */}
        <div
          className="rounded-2xl p-5"
          style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
        >
          <div className="mb-3">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-600" />
              Benefícios por Área de Negócio
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Quantidade de benefícios cadastrados por área · projetos com pelo menos 1 benefício</p>
          </div>
          {(() => {
            const areaMap: Record<string, { count: number; score: number; projects: number }> = {}
            for (const p of withBenefits) {
              const a = areaMap[p.projectArea] ?? { count: 0, score: 0, projects: 0 }
              areaMap[p.projectArea] = { count: a.count + p.benefitCount, score: a.score + p.impactScore, projects: a.projects + 1 }
            }
            const areaData = Object.entries(areaMap)
              .sort(([, a], [, b]) => b.count - a.count)
              .map(([name, v]) => ({ name, count: v.count, avgScore: Math.round(v.score / v.projects), projects: v.projects }))
            if (areaData.length === 0) {
              return <div className="h-40 flex items-center justify-center text-slate-400 text-sm">Nenhum benefício cadastrado</div>
            }
            const h = Math.max(120, areaData.length * 48 + 32)
            return (
              <ResponsiveContainer width="100%" height={h}>
                <BarChart data={areaData} layout="vertical" margin={{ top: 0, right: 50, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={90} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0].payload as typeof areaData[0]
                      return (
                        <div className="bg-white border border-slate-100 rounded-xl shadow-lg p-3 text-xs">
                          <p className="font-semibold text-slate-700 mb-1">{d.name}</p>
                          <p className="text-slate-500">{d.count} benefício{d.count !== 1 ? "s" : ""} em {d.projects} projeto{d.projects !== 1 ? "s" : ""}</p>
                          <p className="text-purple-600 font-semibold">Score médio: {d.avgScore}/100</p>
                        </div>
                      )
                    }}
                  />
                  <Bar dataKey="count" fill="#3B82F6" radius={[0, 4, 4, 0]} barSize={22}>
                    <LabelList dataKey="count" position="right" style={{ fontSize: 11, fontWeight: 700, fill: "#374151" }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )
          })()}
        </div>

        {/* Distribuição de Impacto */}
        <div
          className="rounded-2xl p-5"
          style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
        >
          <div className="mb-3">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Award className="w-4 h-4 text-purple-600" />
              Distribuição de Impacto
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Projetos com benefícios cadastrados · agrupados por nível de impacto</p>
          </div>
          {(() => {
            const TIERS = [
              { label: "Transformacional", color: "#7B2FBE" },
              { label: "Alto Impacto",     color: "#EA580C" },
              { label: "Relevante",        color: "#D97706" },
              { label: "Moderado",         color: "#2563EB" },
              { label: "Baixo Impacto",    color: "#64748B" },
            ]
            const tierData = TIERS
              .map((t) => ({
                name:  t.label,
                value: withBenefits.filter((p) => p.impactLabel === t.label).length,
                color: t.color,
              }))
              .filter((t) => t.value > 0)
            if (tierData.length === 0) {
              return <div className="h-40 flex items-center justify-center text-slate-400 text-sm">Nenhum projeto avaliado</div>
            }
            return (
              <ResponsiveContainer width="100%" height={Math.max(120, tierData.length * 48 + 32)}>
                <BarChart data={tierData} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={100} />
                  <Tooltip formatter={(v: unknown) => [`${Number(v)} projeto${Number(v) !== 1 ? "s" : ""}`, "Quantidade"]} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={22}>
                    {tierData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                    <LabelList dataKey="value" position="right" style={{ fontSize: 11, fontWeight: 700, fill: "#374151" }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )
          })()}
        </div>
      </div>

      {/* ── Projects Table ───────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
      >
        <div className="flex items-center justify-between px-5 py-4 bg-white border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Award className="w-4 h-4 text-purple-600" />
            Projetos — Impacto dos Benefícios ({sorted.length})
          </h3>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 font-medium">Ordenar por:</span>
            {(["score", "value", "roi"] as const).map((key) => (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                  sortBy === key ? "bg-purple-600 text-white" : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                {key === "score" ? "Score" : key === "value" ? "Qtd." : "Status"}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {["Projeto", "Área", "Benefícios", "Realização", "Score de Impacto", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400 text-sm">Nenhum projeto com benefícios cadastrados</td></tr>
              ) : sorted.map((p) => {
                const rate = p.benefitCount > 0 ? Math.round(p.realizedCount / p.benefitCount * 100) : 0
                return (
                  <tr key={p.projectId} className="border-b border-slate-50 hover:bg-purple-50/30 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-800 max-w-[240px] truncate">{p.projectTitle}</td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{p.projectArea}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <span className="font-semibold text-slate-800">{p.benefitCount}</span>
                      <span className="text-slate-400 text-xs ml-1">cadastrado{p.benefitCount !== 1 ? "s" : ""}</span>
                    </td>
                    <td className="px-4 py-3 min-w-[140px]">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${rate}%`, background: rate === 100 ? "#10B981" : rate > 50 ? "#3B82F6" : "#94A3B8" }}
                          />
                        </div>
                        <span className="text-xs text-slate-500 tabular-nums whitespace-nowrap">{p.realizedCount}/{p.benefitCount}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 min-w-[180px]">
                      <div className="space-y-1">
                        <ImpactBadge score={p.impactScore} label={p.impactLabel} />
                        <ScoreBar score={p.impactScore} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/projects/${p.projectId}/benefits`}
                        className="inline-flex items-center gap-1 text-purple-600 hover:text-purple-800 font-semibold text-xs transition-colors"
                      >
                        Ver <ChevronRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {sorted.length > 0 && (
          <div className="flex items-center gap-6 px-5 py-3 bg-slate-50 border-t border-slate-100 text-xs">
            <span className="text-slate-500 font-medium">Resumo:</span>
            <span className="font-bold text-slate-700">{sorted.length} projetos · {totalBenefitCount} benefícios</span>
            <span className="font-bold text-green-700">{totalRealizedCount} realizados ({realizationRate}%)</span>
            {currentSummary.averageImpactScore !== null && (
              <span className="font-bold text-purple-700">Score médio: {Math.round(currentSummary.averageImpactScore)}/100</span>
            )}
          </div>
        )}
      </div>

    </div>
  )
}
