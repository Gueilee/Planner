"use client"

import { useState, useCallback, useTransition } from "react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, Legend,
} from "recharts"
import Link from "next/link"
import {
  TrendingUp, DollarSign, Clock, BarChart3, Award, Filter,
  ChevronRight, Sparkles, Target, ArrowUpRight,
} from "lucide-react"
import { getPortfolioBenefits } from "@/lib/actions/benefits"
import { impactColor, impactBg } from "@/lib/utils/benefits-calc"
import type { PortfolioSummary, PortfolioChartData, ProjectBenefitMetrics } from "@/lib/types/benefits"

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
      <p className="text-slate-500">Valor gerado: <span className="font-bold text-slate-800">{fmtBRL(payload[0].value)}</span></p>
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

export function BenefitsClient({ summary, charts, projects, users, userRole }: Props) {
  const [filterArea,     setFilterArea]     = useState("")
  const [filterStatus,   setFilterStatus]   = useState("")
  const [filterCategory, setFilterCategory] = useState("")
  const [filterManager,  setFilterManager]  = useState("")
  const [filterYear,     setFilterYear]     = useState("")
  const [sortBy,         setSortBy]         = useState<"value" | "roi" | "score">("value")
  const [currentSummary,   setCurrentSummary]   = useState(summary)
  const [currentCharts,    setCurrentCharts]    = useState(charts)
  const [currentProjects,  setCurrentProjects]  = useState(projects)
  const [isPending, startTransition] = useTransition()

  const applyFilters = useCallback(() => {
    startTransition(async () => {
      const data = await getPortfolioBenefits({
        area:      filterArea     || undefined,
        status:    filterStatus   || undefined,
        category:  filterCategory || undefined,
        managerId: filterManager  || undefined,
        year:      filterYear     ? Number(filterYear) : undefined,
      })
      setCurrentSummary(data.summary)
      setCurrentCharts(data.charts)
      setCurrentProjects(data.projects)
    })
  }, [filterArea, filterStatus, filterCategory, filterManager, filterYear])

  const sorted = [...currentProjects].sort((a, b) => {
    if (sortBy === "roi")   return (b.roi ?? -999) - (a.roi ?? -999)
    if (sortBy === "score") return b.impactScore - a.impactScore
    return b.totalRealized - a.totalRealized
  })

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">

      {/* ── KPI Row ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Total Economizado"
          value={fmtBRL(currentSummary.totalEconomy)}
          sub={`${currentSummary.realizedProjectCount} projetos com retorno`}
          gradient="linear-gradient(135deg,#065F46,#10B981)"
          glow="rgba(16,185,129,0.3)"
          icon={DollarSign}
        />
        <KpiCard
          label="Receita Gerada"
          value={fmtBRL(currentSummary.totalRevenue)}
          sub="Aumento de receita realizado"
          gradient="linear-gradient(135deg,#1E40AF,#3B82F6)"
          glow="rgba(59,130,246,0.3)"
          icon={TrendingUp}
        />
        <KpiCard
          label="ROI Médio Portfólio"
          value={currentSummary.averageRoi !== null ? `${Math.round(currentSummary.averageRoi)}%` : "—"}
          sub={`${fmtBRL(currentSummary.totalInvestment)} investidos`}
          gradient="linear-gradient(135deg,#4C1D95,#7B2FBE)"
          glow="rgba(123,47,190,0.35)"
          icon={Target}
        />
        <KpiCard
          label="Horas Economizadas"
          value={`${fmtNum(currentSummary.totalHours)}h`}
          sub={`${currentSummary.projectCount} projetos analisados`}
          gradient="linear-gradient(135deg,#92400E,#F59E0B)"
          glow="rgba(245,158,11,0.3)"
          icon={Clock}
        />
      </div>

      {/* ── Filters ──────────────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl p-4"
        style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-purple-600" />
          <span className="text-sm font-semibold text-slate-700">Filtros</span>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          {[
            { label: "Ano", value: filterYear, onChange: setFilterYear,
              options: [["", "Todos os anos"], ...years.map((y) => [String(y), String(y)])] },
            { label: "Área", value: filterArea, onChange: setFilterArea,
              options: [["", "Todas as áreas"], ["TECNOLOGIA", "Tecnologia"], ["QUALIDADE", "Qualidade"], ["ESTRATEGICO", "Estratégico"]] },
            { label: "Status do Projeto", value: filterStatus, onChange: setFilterStatus,
              options: [["", "Todos"], ["PLANNING", "Planejamento"], ["IN_PROGRESS", "Em Andamento"], ["COMPLETED", "Concluído"]] },
            { label: "Categoria", value: filterCategory, onChange: setFilterCategory,
              options: [["", "Todas"], ["FINANCIAL", "Financeiro"], ["OPERATIONAL", "Operacional"], ["STRATEGIC", "Estratégico"]] },
          ].map(({ label, value, onChange, options }) => (
            <div key={label} className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</label>
              <select
                value={value as string}
                onChange={(e) => (onChange as (v: string) => void)(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-purple-300"
              >
                {(options as [string, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          ))}

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Gestor</label>
            <select
              value={filterManager}
              onChange={(e) => setFilterManager(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-purple-300"
            >
              <option value="">Todos</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>

          <button
            onClick={applyFilters}
            disabled={isPending}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition-all"
            style={{ background: "linear-gradient(135deg,#7B2FBE,#A855F7)" }}
          >
            {isPending ? "Carregando…" : "Aplicar"}
          </button>
        </div>
      </div>

      {/* ── Charts Row ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Bar chart — top projects */}
        <div
          className="xl:col-span-2 rounded-2xl p-5"
          style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-purple-600" />
              Top Projetos por Valor Gerado
            </h3>
          </div>
          {currentCharts.topProjects.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-slate-400 text-sm">Nenhum benefício registrado ainda</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={currentCharts.topProjects} layout="vertical" margin={{ left: 0, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => fmtBRL(v)} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomBarTooltip />} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {currentCharts.topProjects.map((_, i) => (
                    <Cell key={i} fill={`hsl(${270 - i * 15}, 70%, ${55 + i * 3}%)`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pie — category breakdown */}
        <div
          className="rounded-2xl p-5"
          style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
        >
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-4">
            <Sparkles className="w-4 h-4 text-purple-600" />
            Por Categoria
          </h3>
          {currentCharts.byCategory.every((c) => c.value === 0) ? (
            <div className="h-56 flex items-center justify-center text-slate-400 text-sm">Sem dados</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={currentCharts.byCategory} cx="50%" cy="50%" innerRadius={48} outerRadius={80} paddingAngle={3} dataKey="value">
                    {currentCharts.byCategory.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmtBRL(v as number)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {currentCharts.byCategory.map((c) => (
                  <div key={c.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />
                      <span className="text-slate-600">{c.name}</span>
                    </div>
                    <span className="font-semibold text-slate-800">{fmtBRL(c.value)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Timeline ─────────────────────────────────────────────────────────── */}
      {currentCharts.timeline.length > 0 && (
        <div
          className="rounded-2xl p-5"
          style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
        >
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-purple-600" />
            Evolução Acumulada do Retorno
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={currentCharts.timeline} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="grad-cum" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#7B2FBE" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#7B2FBE" stopOpacity={0}   />
                </linearGradient>
                <linearGradient id="grad-mon" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#10B981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0}   />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => fmtBRL(v)} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => fmtBRL(v as number)} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="cumulative" name="Acumulado" stroke="#7B2FBE" fill="url(#grad-cum)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="monthly"    name="No Mês"    stroke="#10B981" fill="url(#grad-mon)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Projects Table ───────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
      >
        <div className="flex items-center justify-between px-5 py-4 bg-white border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Award className="w-4 h-4 text-purple-600" />
            Projetos — Impacto e Retorno ({sorted.length})
          </h3>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 font-medium">Ordenar por:</span>
            {(["value", "roi", "score"] as const).map((key) => (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                  sortBy === key ? "bg-purple-600 text-white" : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                {key === "value" ? "Valor" : key === "roi" ? "ROI" : "Score"}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {["Projeto", "Área", "Benefícios", "Realizado", "Investimento", "ROI", "Payback", "Score de Impacto", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-400 text-sm">Nenhum projeto com benefícios cadastrados</td></tr>
              ) : sorted.map((p) => (
                <tr key={p.projectId} className="border-b border-slate-50 hover:bg-purple-50/30 transition-colors">
                  <td className="px-4 py-3 font-semibold text-slate-800 max-w-[220px] truncate">{p.projectTitle}</td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{p.projectArea}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <span className="font-semibold text-slate-800">{p.realizedCount}</span>
                    <span className="text-slate-400">/{p.benefitCount}</span>
                  </td>
                  <td className="px-4 py-3 font-bold text-green-700">{fmtBRL(p.totalRealized)}</td>
                  <td className="px-4 py-3 text-slate-600">{p.investment > 0 ? fmtBRL(p.investment) : <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3">
                    {p.roi !== null ? (
                      <span className={`font-bold ${p.roi >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {p.roi >= 0 ? "+" : ""}{Math.round(p.roi)}%
                      </span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {p.paybackMonths !== null ? `${p.paybackMonths.toFixed(1)} meses` : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 min-w-[160px]">
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
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals row */}
        {sorted.length > 0 && (
          <div className="flex items-center gap-8 px-5 py-3 bg-slate-50 border-t border-slate-100 text-xs">
            <span className="text-slate-500 font-medium">Totais:</span>
            <span className="font-bold text-green-700">{fmtBRL(currentSummary.totalRealized)} realizados</span>
            <span className="font-bold text-slate-700">{fmtBRL(currentSummary.totalInvestment)} investidos</span>
            {currentSummary.averageRoi !== null && (
              <span className="font-bold text-purple-700">ROI médio: {Math.round(currentSummary.averageRoi)}%</span>
            )}
            <Link href="/benefits" className="ml-auto flex items-center gap-1 text-purple-600 hover:text-purple-800 font-semibold">
              Exportar <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}
      </div>

    </div>
  )
}
