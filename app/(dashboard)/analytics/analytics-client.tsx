"use client"

import { useState, useMemo, useTransition } from "react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, ReferenceLine, Legend,
} from "recharts"
import type { TooltipContentProps } from "recharts"
import {
  TrendingUp, Calendar, AlertTriangle, DollarSign, Activity,
  Target, BarChart3, ChevronRight, Info, Search, X, Users, Loader2,
} from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Header } from "@/components/layout/header"
import type { ProjectIndicator, UserOption } from "./page"
import { getPersonAllocation } from "@/lib/actions/allocation"
import type { AllocationResult } from "@/lib/actions/allocation"

// ─── Colors ─────────────────────────────────────────────────────────────────
const C = {
  blue:   "#2463FF",
  purple: "#7B2FBE",
  green:  "#10B981",
  amber:  "#F59E0B",
  red:    "#EF4444",
  slate:  "#64748B",
}

const ACTIVE_STATUSES = new Set([
  "IN_PROGRESS", "PILOT", "RAMP_UP", "GO_LIVE", "POST_GOLIVE",
])

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtDevio(d: number | null): string {
  if (d === null) return "—"
  const pct = Math.round(d * 100)
  return pct >= 0 ? `+${pct}%` : `${pct}%`
}

function idpLabel(idp: number | null): string {
  if (idp === null) return "N/D"
  if (idp >= 1.05) return "Adiantado"
  if (idp >= 0.9)  return "No Prazo"
  if (idp >= 0.75) return "Atenção"
  return "Crítico"
}

function idpColor(idp: number | null): string {
  if (idp === null) return C.slate
  if (idp >= 0.9)  return C.green
  if (idp >= 0.75) return C.amber
  return C.red
}

function idcColor(idc: number | null): string {
  if (idc === null) return C.slate
  if (idc > 1)    return C.green
  if (idc >= 0.9) return C.amber
  return C.red
}

function currency(v: number | null): string {
  if (v === null || v === undefined) return "—"
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `R$ ${(v / 1_000).toFixed(0)}K`
  return `R$ ${v.toFixed(0)}`
}

function schedColor(s: string): string {
  if (s === "ON_TIME") return C.green
  if (s === "AT_RISK") return C.amber
  if (s === "DELAYED") return C.red
  return C.slate
}

function devioColor(d: number | null): string {
  if (d === null)  return C.slate
  if (d >= 0)      return C.green   // adiantado ou exato
  if (d >= -0.2)   return C.amber   // até 20pp atrasado
  return C.red                       // mais de 20pp atrasado
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s
}

const STATUS_LABELS: Record<string, string> = {
  PLANNING:        "Planejamento",
  IN_PROGRESS:     "Em Andamento",
  PILOT:           "Piloto",
  RAMP_UP:         "Ramp Up",
  GO_LIVE:         "Go Live",
  POST_GOLIVE:     "Pós Go Live",
  COMPLETED:       "Concluído",
  ON_HOLD:         "Em Espera",
  FUTURE_ANALYSIS: "Análise Futura",
}

const STATUS_BADGE_COLORS: Record<string, string> = {
  PLANNING:        "bg-slate-100 text-slate-600",
  IN_PROGRESS:     "bg-blue-100 text-blue-700",
  PILOT:           "bg-purple-100 text-purple-700",
  RAMP_UP:         "bg-indigo-100 text-indigo-700",
  GO_LIVE:         "bg-emerald-100 text-emerald-700",
  POST_GOLIVE:     "bg-teal-100 text-teal-700",
  COMPLETED:       "bg-green-100 text-green-700",
  ON_HOLD:         "bg-orange-100 text-orange-700",
  FUTURE_ANALYSIS: "bg-gray-100 text-gray-600",
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: "linear-gradient(135deg, #00C4E0, #2463FF, #8B2FFF)" }}
      >
        <Icon className="w-3.5 h-3.5 text-white" />
      </div>
      <span className="text-sm font-black text-slate-800 tracking-wide uppercase">{label}</span>
      <div className="flex-1 h-px bg-slate-200 ml-2" />
    </div>
  )
}

// ─── KPI Chip ─────────────────────────────────────────────────────────────────
function KpiChip({
  label, value, color, icon: Icon, subtitle,
}: {
  label: string; value: string | number; color: string; icon: React.ElementType; subtitle?: string
}) {
  return (
    <div
      className="flex items-center gap-3 bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3 flex-1 min-w-[140px]"
    >
      <div
        className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `${color}18` }}
      >
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div>
        <p className="text-xs text-slate-500 leading-tight">{label}</p>
        {subtitle && (
          <p className="text-[10px] text-slate-400 leading-tight mt-0.5">{subtitle}</p>
        )}
        <p className="text-sm font-bold leading-tight mt-0.5" style={{ color }}>{value}</p>
      </div>
    </div>
  )
}

// ─── Progress Ring (SVG donut) ────────────────────────────────────────────────
function ProgressRing({ pct, color, size = 60 }: { pct: number; color: string; size?: number }) {
  const r = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  return (
    <svg width={size} height={size}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F1F5F9" strokeWidth={6} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={6}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x={size / 2} y={size / 2 + 4}
        textAnchor="middle" fontSize={10} fontWeight="700" fill={color}
      >
        {pct}%
      </text>
    </svg>
  )
}

// ─── Custom Tooltip for Devio chart ──────────────────────────────────────────
function DevioTooltip({ active, payload }: TooltipContentProps): React.ReactElement | null {
  if (!active || !payload?.length) return null
  const d = payload[0]
  const rawVal = d.value
  const pct = typeof rawVal === "number" ? Math.round(rawVal) : 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entry = (d as any).payload as { fullName?: string; planned?: number; actual?: number }
  const color = pct >= 0 ? C.green : pct >= -20 ? C.amber : C.red
  const label = pct > 0 ? "Adiantado" : pct < 0 ? "Atrasado" : "No prazo"
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-lg px-3 py-2.5 text-xs space-y-1 min-w-[180px]">
      <p className="font-bold text-slate-800">{entry.fullName}</p>
      <div className="h-px bg-slate-100" />
      <p style={{ color }} className="font-semibold">
        {label}: {pct >= 0 ? "+" : ""}{pct}pp
      </p>
      {entry.planned != null && (
        <p className="text-slate-400">Progresso planejado: <span className="font-semibold text-slate-600">{entry.planned}%</span></p>
      )}
      {entry.actual != null && (
        <p className="text-slate-400">Progresso real: <span className="font-semibold text-slate-600">{entry.actual}%</span></p>
      )}
      <p className="text-slate-300 text-[10px]">pp = pontos percentuais</p>
    </div>
  )
}

// ─── Custom Tooltip for Budget chart ─────────────────────────────────────────
function BudgetTooltip({ active, payload }: TooltipContentProps): React.ReactElement | null {
  if (!active || !payload?.length) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fullName = (payload[0] as any).payload?.fullName as string | undefined
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-lg px-3 py-2 text-xs">
      <p className="font-bold text-slate-800 mb-1">{fullName}</p>
      {payload.map((entry) => {
        const numVal = typeof entry.value === "number" ? entry.value : null
        return (
          <p key={String(entry.name)} style={{ color: entry.color as string }}>
            {entry.name === "budget" ? "Orçamento" : "Estimado"}: {currency(numVal)}
          </p>
        )
      })}
    </div>
  )
}

// ─── Task Status ──────────────────────────────────────────────────────────────
const TASK_STATUS_LABEL: Record<string, string> = {
  PLANNING:    "Planejamento",
  IN_PROGRESS: "Em Andamento",
  COMPLETED:   "Concluída",
  DELAYED:     "Atrasada",
  ON_HOLD:     "Em Espera",
  CANCELLED:   "Cancelada",
}

const TASK_STATUS_BADGE: Record<string, string> = {
  PLANNING:    "bg-slate-100 text-slate-600",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  COMPLETED:   "bg-green-100 text-green-700",
  DELAYED:     "bg-red-100 text-red-700",
  ON_HOLD:     "bg-orange-100 text-orange-700",
  CANCELLED:   "bg-gray-100 text-gray-400",
}

// ─── Allocation Results Component ────────────────────────────────────────────
function AllocationResults({ results }: { results: AllocationResult }) {
  const { tasks, userName } = results

  if (tasks.length === 0) {
    return (
      <div className="py-8 flex flex-col items-center text-slate-400 gap-2">
        <Search className="w-8 h-8 opacity-40" />
        <span className="text-xs">Nenhuma atividade encontrada para <strong>{userName}</strong> no período selecionado</span>
      </div>
    )
  }

  // Agrupa por projeto
  const byProject = tasks.reduce((acc, t) => {
    if (!acc[t.projectId]) {
      acc[t.projectId] = { title: t.projectTitle, area: t.projectArea, status: t.projectStatus, tasks: [] }
    }
    acc[t.projectId].tasks.push(t)
    return acc
  }, {} as Record<string, { title: string; area: string; status: string; tasks: typeof tasks }>)

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        <span className="font-bold text-slate-700">{tasks.length}</span>{" "}
        atividade{tasks.length !== 1 ? "s" : ""} de{" "}
        <span className="font-bold text-slate-700">{userName}</span>
      </p>

      {Object.values(byProject).map((proj) => (
        <div key={proj.title} className="border border-slate-100 rounded-xl overflow-hidden">
          {/* Cabeçalho do projeto */}
          <div className="px-4 py-2 bg-slate-50 flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-700">{proj.title}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-500">
              {AREA_CFG[proj.area]?.label ?? proj.area}
            </span>
            <span className={
              "text-[10px] px-2 py-0.5 rounded-full " +
              (STATUS_BADGE_COLORS[proj.status] ?? "bg-slate-100 text-slate-600")
            }>
              {STATUS_LABELS[proj.status] ?? proj.status}
            </span>
            <span className="ml-auto text-[10px] text-slate-400">
              {proj.tasks.length} atividade{proj.tasks.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Tabela de tarefas */}
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] text-slate-400 font-semibold uppercase bg-white">
                <th className="text-left px-4 py-2">Atividade</th>
                <th className="text-center px-4 py-2">Status</th>
                <th className="text-center px-4 py-2">Progresso</th>
                <th className="text-center px-4 py-2">Início</th>
                <th className="text-center px-4 py-2">Término</th>
              </tr>
            </thead>
            <tbody>
              {proj.tasks.map((t) => (
                <tr key={t.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-slate-700 max-w-[280px]">
                    <span className="line-clamp-2">{t.title}</span>
                  </td>
                  <td className="px-4 py-2.5 text-center whitespace-nowrap">
                    <span className={
                      "inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold " +
                      (TASK_STATUS_BADGE[t.status] ?? "bg-slate-100 text-slate-600")
                    }>
                      {TASK_STATUS_LABEL[t.status] ?? t.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <div className="flex items-center gap-2 justify-center">
                      <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${t.progress}%`,
                            background: t.progress >= 80 ? C.green : t.progress >= 50 ? C.blue : C.amber,
                          }}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-slate-500 w-7 text-right">{t.progress}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-center text-slate-500 whitespace-nowrap">
                    {t.startDate ? format(new Date(t.startDate), "dd/MM/yy", { locale: ptBR }) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-center text-slate-500 whitespace-nowrap">
                    {t.endDate ? format(new Date(t.endDate), "dd/MM/yy", { locale: ptBR }) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

// ─── Area Config ─────────────────────────────────────────────────────────────
const AREA_CFG: Record<string, { label: string; color: string }> = {
  TECNOLOGIA:  { label: "Tecnologia",            color: "#0891B2" },
  QUALIDADE:   { label: "Qualidade",             color: "#059669" },
  ESTRATEGICO: { label: "Projetos Estratégicos", color: "#7B2FBE" },
}

// ─── Main Client Component ────────────────────────────────────────────────────
export function AnalyticsClient({
  projects,
  users,
  userRole,
}: {
  projects: ProjectIndicator[]
  users: UserOption[]
  userRole: string
}) {
  const [filter,      setFilter]      = useState<"ACTIVE" | "ALL">("ACTIVE")
  const [areaFilter,  setAreaFilter]  = useState<string>("ALL")
  const [responsible, setResponsible] = useState<string>("ALL")
  const [search,      setSearch]      = useState("")

  // ── Alocação por Pessoa ────────────────────────────────────────
  const [allocOpen,    setAllocOpen]    = useState(false)
  const [selectedUser, setSelectedUser] = useState("")
  const [allocStart,   setAllocStart]   = useState("")
  const [allocEnd,     setAllocEnd]     = useState("")
  const [allocResults, setAllocResults] = useState<AllocationResult | null>(null)
  const [allocPending, startAlloc]      = useTransition()

  function handleAllocSearch() {
    if (!selectedUser) return
    startAlloc(async () => {
      const result = await getPersonAllocation(
        selectedUser,
        allocStart || null,
        allocEnd   || null,
      )
      setAllocResults(result)
    })
  }

  // Reseta resultados se trocar a pessoa ou o período
  function onUserChange(uid: string) {
    setSelectedUser(uid)
    setAllocResults(null)
  }

  void userRole // disponível para futuras restrições por papel

  // Responsáveis únicos de todas as tarefas
  const allResponsibles = useMemo(
    () => [...new Set(projects.flatMap((p) => p.taskResponsibles))].sort(),
    [projects],
  )

  const filtered = useMemo(() => {
    let list = filter === "ACTIVE" ? projects.filter((p) => ACTIVE_STATUSES.has(p.status)) : projects
    if (areaFilter !== "ALL")  list = list.filter((p) => p.projectArea === areaFilter)
    if (responsible !== "ALL") list = list.filter((p) => p.taskResponsibles.includes(responsible))
    if (search.trim())         list = list.filter((p) => p.title.toLowerCase().includes(search.trim().toLowerCase()))
    return list
  }, [projects, filter, areaFilter, responsible, search])

  // ── Summary KPIs ───────────────────────────────────────────────
  const onTime  = filtered.filter((p) => p.scheduleStatus === "ON_TIME").length
  const atRisk  = filtered.filter((p) => p.scheduleStatus === "AT_RISK").length
  const delayed = filtered.filter((p) => p.scheduleStatus === "DELAYED").length

  const idpValues = filtered.map((p) => p.idp).filter((v): v is number => v !== null)
  const avgIdp = idpValues.length ? idpValues.reduce((a, b) => a + b, 0) / idpValues.length : null

  const idcValues = filtered.map((p) => p.idc).filter((v): v is number => v !== null)
  const avgIdc = idcValues.length ? idcValues.reduce((a, b) => a + b, 0) / idcValues.length : null

  // ── Devio chart data ──────────────────────────────────────────
  const devioData = filtered
    .filter((p) => p.devio !== null)
    .map((p) => {
      const devPct   = Math.round((p.devio ?? 0) * 100)
      // Reconstruir progresso planejado = progresso_real - devio_pp
      const actual   = p.progress
      const planned  = Math.max(0, Math.min(100, actual - devPct))
      return {
        name:     truncate(p.title, 20),
        fullName: p.title,
        devio:    devPct,
        color:    devioColor(p.devio),
        planned,
        actual,
      }
    })
    .sort((a, b) => b.devio - a.devio)

  // ── Pie data ──────────────────────────────────────────────────
  const ndCount = filtered.filter((p) => p.scheduleStatus === "ND").length
  const pieData = [
    { name: "No Prazo",  value: onTime,  fill: C.green },
    { name: "Em Risco",  value: atRisk,  fill: C.amber },
    { name: "Atrasados", value: delayed, fill: C.red },
  ].filter((d) => d.value > 0)

  // ── Budget chart data ─────────────────────────────────────────
  const budgetData = filtered
    .filter((p) => p.budget !== null || p.estimatedCosts !== null)
    .map((p) => ({
      name:          truncate(p.title, 18),
      fullName:      p.title,
      budget:        p.budget ?? 0,
      estimatedCosts: p.estimatedCosts ?? 0,
    }))

  // ── Economy ───────────────────────────────────────────────────
  const totalEconomy = filtered
    .map((p) => p.economy ?? 0)
    .reduce((a, b) => a + b, 0)

  const projectsWithEconomy = filtered.filter((p) => p.economy !== null && p.economy > 0)

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-8">

          {/* ── Page Header ─────────────────────────────────────── */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-md"
                style={{ background: "linear-gradient(135deg, #00C4E0, #2463FF, #8B2FFF)" }}
              >
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-black text-slate-900">Indicadores de Gestão</h1>
                <p className="text-xs text-slate-500 mt-0.5">Visão analítica consolidada dos projetos</p>
              </div>
            </div>

            {/* Status toggle */}
            <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
              {(["ACTIVE", "ALL"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={
                    "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 " +
                    (filter === f
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700")
                  }
                >
                  {f === "ACTIVE" ? "Ativos" : "Todos"}
                </button>
              ))}
            </div>
          </div>

          {/* ── Filter bar ─────────────────────────────────────────── */}
          <div className="flex flex-wrap gap-3 items-center p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">

            {/* Busca por projeto */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar projeto…"
                className="pl-8 pr-7 h-8 text-xs rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-[#7B2FBE] w-48 transition-colors"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="w-3 h-3 text-slate-400" />
                </button>
              )}
            </div>

            <div className="w-px h-6 bg-slate-200" />

            {/* Portfólio / Área */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200">
              {[{ key: "ALL", label: "Todos", color: "#64748B" }, ...Object.entries(AREA_CFG).map(([k, v]) => ({ key: k, label: v.label, color: v.color }))].map((a) => {
                const isActive = areaFilter === a.key
                const count = a.key === "ALL" ? (filter === "ACTIVE" ? projects.filter(p => ACTIVE_STATUSES.has(p.status)).length : projects.length) : projects.filter(p => p.projectArea === a.key).length
                return (
                  <button
                    key={a.key}
                    onClick={() => setAreaFilter(a.key)}
                    className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap"
                    style={isActive
                      ? { background: a.color, color: "#fff", boxShadow: `0 2px 8px ${a.color}40` }
                      : { background: "transparent", color: "#94A3B8" }
                    }
                  >
                    {a.label}
                    <span className="text-[9px] font-black px-1 py-px rounded-full"
                      style={isActive ? { background: "rgba(255,255,255,0.25)", color: "#fff" } : { background: "#E2E8F0", color: "#94A3B8" }}>
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="w-px h-6 bg-slate-200" />

            {/* Responsável pela atividade */}
            <div className="flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <select
                value={responsible}
                onChange={(e) => setResponsible(e.target.value)}
                className="h-8 pl-2 pr-7 text-xs rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-[#7B2FBE] text-slate-700 appearance-none cursor-pointer transition-colors"
                style={{ minWidth: 160 }}
              >
                <option value="ALL">Todos os responsáveis</option>
                {allResponsibles.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            {/* Reset */}
            {(areaFilter !== "ALL" || responsible !== "ALL" || search) && (
              <button
                onClick={() => { setAreaFilter("ALL"); setResponsible("ALL"); setSearch("") }}
                className="flex items-center gap-1.5 px-3 h-7 rounded-xl text-xs font-semibold text-slate-500 hover:text-red-500 border border-slate-200 hover:border-red-200 transition-all"
              >
                <X className="w-3 h-3" /> Limpar filtros
              </button>
            )}

            {/* Contador de resultados */}
            <span className="ml-auto text-xs text-slate-400 font-medium">
              {filtered.length} projeto{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* ── Alocação por Pessoa ─────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <button
              onClick={() => setAllocOpen((v) => !v)}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50 transition-colors"
            >
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "linear-gradient(135deg, #00C4E0, #2463FF, #8B2FFF)" }}
              >
                <Users className="w-3.5 h-3.5 text-white" />
              </div>
              <div>
                <span className="text-sm font-black text-slate-800 uppercase tracking-wide">
                  Alocação por Pessoa
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Veja todas as atividades de uma pessoa em um período, independente do projeto
                </p>
              </div>
              <ChevronRight
                className={
                  "w-4 h-4 text-slate-400 ml-auto shrink-0 transition-transform duration-200 " +
                  (allocOpen ? "rotate-90" : "")
                }
              />
            </button>

            {allocOpen && (
              <div className="border-t border-slate-100 px-4 pb-5 pt-4 space-y-4">
                {/* Filtros */}
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                      Pessoa
                    </label>
                    <select
                      value={selectedUser}
                      onChange={(e) => onUserChange(e.target.value)}
                      className="h-8 pl-3 pr-7 text-xs rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-[#7B2FBE] text-slate-700 appearance-none cursor-pointer transition-colors"
                      style={{ minWidth: 220 }}
                    >
                      <option value="">Selecione uma pessoa…</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">De</label>
                    <input
                      type="date"
                      value={allocStart}
                      onChange={(e) => { setAllocStart(e.target.value); setAllocResults(null) }}
                      className="h-8 px-3 text-xs rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-[#7B2FBE] transition-colors"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Até</label>
                    <input
                      type="date"
                      value={allocEnd}
                      onChange={(e) => { setAllocEnd(e.target.value); setAllocResults(null) }}
                      className="h-8 px-3 text-xs rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-[#7B2FBE] transition-colors"
                    />
                  </div>

                  <button
                    onClick={handleAllocSearch}
                    disabled={!selectedUser || allocPending}
                    className="h-8 px-4 rounded-xl text-xs font-bold text-white disabled:opacity-50 flex items-center gap-1.5 transition-all hover:opacity-90"
                    style={{ background: "linear-gradient(135deg, #2463FF, #8B2FFF)" }}
                  >
                    {allocPending
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Search className="w-3.5 h-3.5" />}
                    Consultar
                  </button>

                  {allocResults && (
                    <button
                      onClick={() => { setAllocResults(null); setSelectedUser(""); setAllocStart(""); setAllocEnd("") }}
                      className="h-8 px-3 rounded-xl text-xs font-semibold text-slate-500 hover:text-red-500 border border-slate-200 hover:border-red-200 flex items-center gap-1.5 transition-all"
                    >
                      <X className="w-3 h-3" /> Limpar
                    </button>
                  )}
                </div>

                {/* Resultados */}
                {allocResults && <AllocationResults results={allocResults} />}
              </div>
            )}
          </div>

          {/* ── Summary Strip ───────────────────────────────────── */}
          <div className="flex gap-3 flex-wrap">
            <KpiChip
              label="No Prazo"    value={onTime}
              color={C.green}     icon={Calendar}
            />
            <KpiChip
              label="Em Risco"   value={atRisk}
              color={C.amber}    icon={AlertTriangle}
            />
            <KpiChip
              label="Atrasados"  value={delayed}
              color={C.red}      icon={Activity}
            />
            <KpiChip
              label="IDP Médio"
              subtitle="Índice de Desempenho de Prazo"
              value={avgIdp !== null ? avgIdp.toFixed(2) : "N/D"}
              color={idpColor(avgIdp)}
              icon={Target}
            />
            <KpiChip
              label="IDC Médio"
              subtitle="Índice de Desempenho de Custo"
              value={avgIdc !== null ? avgIdc.toFixed(2) : "N/D"}
              color={idcColor(avgIdc)}
              icon={DollarSign}
            />
          </div>

          {/* ══ Indicadores Operacionais ═══════════════════════════ */}
          <section>
            <SectionHeader icon={Calendar} label="Indicadores Operacionais" />

            <div className="grid gap-4" style={{ gridTemplateColumns: "2fr 1fr" }}>

              {/* LEFT: Diverging Bar Chart */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                {/* Title + subtitle */}
                <div className="mb-4">
                  <p className="text-xs font-black text-slate-700 uppercase tracking-wide">
                    Desvio de Prazo por Projeto
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Diferença entre progresso real e progresso esperado para a data de hoje
                  </p>
                </div>

                {/* Color legend */}
                <div className="flex flex-wrap items-center gap-3 mb-4 text-[10px] font-semibold text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm" style={{ background: C.green }} />
                    Adiantado (barra → direita)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm" style={{ background: C.amber }} />
                    Até 20pp atrasado
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm" style={{ background: C.red }} />
                    Mais de 20pp atrasado (barra → esquerda)
                  </span>
                </div>

                {devioData.length === 0 ? (
                  <div className="h-48 flex flex-col items-center justify-center text-slate-400 gap-2">
                    <Calendar className="w-8 h-8 opacity-40" />
                    <span className="text-xs">Nenhum projeto com datas configuradas</span>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(200, devioData.length * 44)}>
                    <BarChart
                      data={devioData}
                      layout="vertical"
                      margin={{ top: 4, right: 48, left: 0, bottom: 20 }}
                    >
                      <CartesianGrid horizontal={false} stroke="#F1F5F9" />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 10, fill: "#94A3B8" }}
                        tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v}pp`}
                        axisLine={false}
                        tickLine={false}
                        label={{
                          value: "← Atrasado    |    Adiantado →",
                          position: "insideBottom",
                          offset: -12,
                          style: { fontSize: 10, fill: "#94A3B8", fontWeight: 600 },
                        }}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={155}
                        tick={{ fontSize: 10, fill: "#475569" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip content={DevioTooltip} />
                      <ReferenceLine
                        x={0}
                        stroke="#94A3B8"
                        strokeWidth={2}
                        strokeDasharray="4 2"
                        label={{ value: "0", position: "top", style: { fontSize: 9, fill: "#94A3B8" } }}
                      />
                      <Bar dataKey="devio" radius={[0, 4, 4, 0]} maxBarSize={22} label={{ position: "right", fontSize: 9, fill: "#64748B", formatter: (v: unknown) => { const n = Number(v); return n !== 0 ? `${n > 0 ? "+" : ""}${n}pp` : "" } }}>
                        {devioData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* RIGHT: Donut Pie */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col">
                <p className="text-xs font-black text-slate-700 mb-4 uppercase tracking-wide">
                  Classificação de Prazo
                </p>

                {pieData.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-2">
                    <BarChart3 className="w-8 h-8 opacity-40" />
                    <span className="text-xs">Sem dados suficientes</span>
                  </div>
                ) : (
                  <>
                    <div className="relative flex items-center justify-center">
                      <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={80}
                            dataKey="value"
                            paddingAngle={3}
                          >
                            {pieData.map((entry, i) => (
                              <Cell key={i} fill={entry.fill} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              borderRadius: 12, border: "1px solid #E2E8F0",
                              fontSize: 11, boxShadow: "0 4px 12px rgba(0,0,0,0.08)"
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      {/* Center label */}
                      <div className="absolute flex flex-col items-center pointer-events-none">
                        <span className="text-2xl font-black text-slate-800">{filtered.length}</span>
                        <span className="text-[9px] text-slate-400 uppercase tracking-wide">projetos</span>
                      </div>
                    </div>

                    {/* Legend */}
                    <div className="mt-3 space-y-1.5">
                      {pieData.map((d) => (
                        <div key={d.name} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ background: d.fill }}
                            />
                            <span className="text-slate-600">{d.name}</span>
                          </div>
                          <span className="font-bold text-slate-800">{d.value}</span>
                        </div>
                      ))}
                    </div>

                    {ndCount > 0 && (
                      <p className="mt-3 text-[10px] text-slate-400 flex items-center gap-1">
                        <Info className="w-3 h-3" />
                        {ndCount} projeto{ndCount > 1 ? "s" : ""} sem datas configuradas (N/D)
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </section>

          {/* ══ Indicadores de Desempenho ══════════════════════════ */}
          <section>
            <SectionHeader icon={Target} label="Indicadores de Desempenho" />

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {filtered.length === 0 ? (
                <div className="py-16 flex flex-col items-center text-slate-400 gap-2">
                  <BarChart3 className="w-10 h-10 opacity-40" />
                  <span className="text-sm">Nenhum projeto encontrado</span>
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr
                      className="text-slate-500 font-black uppercase tracking-wide text-[10px]"
                      style={{ borderBottom: "1px solid #F1F5F9", background: "#FAFAFA" }}
                    >
                      <th className="text-left px-4 py-3">Projeto</th>
                      <th className="text-left px-4 py-3">Status</th>
                      <th className="text-center px-4 py-3">Progresso</th>
                      <th className="text-center px-4 py-3">IDP</th>
                      <th className="text-center px-4 py-3">IDC</th>
                      <th className="text-center px-4 py-3">Desvio</th>
                      <th className="text-center px-4 py-3">Risco</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p, idx) => {
                      const worstRisk =
                        p.risks.critical > 0 ? "CRITICAL"
                        : p.risks.high > 0   ? "HIGH"
                        : p.risks.medium > 0 ? "MEDIUM"
                        : p.risks.low > 0    ? "LOW"
                        : null
                      const riskColor =
                        worstRisk === "CRITICAL" ? C.red
                        : worstRisk === "HIGH"   ? "#F97316"
                        : worstRisk === "MEDIUM" ? C.amber
                        : worstRisk === "LOW"    ? C.green
                        : C.slate
                      const riskLabel =
                        worstRisk === "CRITICAL" ? "Crítico"
                        : worstRisk === "HIGH"   ? "Alto"
                        : worstRisk === "MEDIUM" ? "Médio"
                        : worstRisk === "LOW"    ? "Baixo"
                        : "—"

                      const devVal = p.devio !== null ? Math.round(p.devio * 100) : null

                      return (
                        <tr
                          key={p.id}
                          className="group transition-colors duration-100"
                          style={{
                            background: idx % 2 === 0 ? "#FFFFFF" : "#FAFBFC",
                            borderBottom: "1px solid #F1F5F9",
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLTableRowElement).style.background = "#F8F9FF"
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLTableRowElement).style.background =
                              idx % 2 === 0 ? "#FFFFFF" : "#FAFBFC"
                          }}
                        >
                          {/* Title */}
                          <td className="px-4 py-3 max-w-[220px]">
                            <p className="font-semibold text-slate-800 truncate" title={p.title}>
                              {p.title}
                            </p>
                            {p.sponsor && (
                              <p className="text-[10px] text-slate-400 mt-0.5 truncate">{p.sponsor}</p>
                            )}
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={
                                "px-2 py-0.5 rounded-full text-[10px] font-semibold " +
                                (STATUS_BADGE_COLORS[p.status] ?? "bg-slate-100 text-slate-600")
                              }
                            >
                              {STATUS_LABELS[p.status] ?? p.status}
                            </span>
                          </td>

                          {/* Progress */}
                          <td className="px-4 py-3 min-w-[100px]">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${p.progress}%`,
                                    background: p.progress >= 80 ? C.green : p.progress >= 50 ? C.blue : C.amber,
                                  }}
                                />
                              </div>
                              <span className="text-[10px] font-bold text-slate-600 w-8 text-right">
                                {p.progress}%
                              </span>
                            </div>
                          </td>

                          {/* IDP */}
                          <td className="px-4 py-3 text-center">
                            {p.idp !== null ? (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                                style={{
                                  background: `${idpColor(p.idp)}18`,
                                  color: idpColor(p.idp),
                                }}
                                title={`IDP: ${p.idp.toFixed(2)} — ${idpLabel(p.idp)}`}
                              >
                                {p.idp.toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-slate-300 text-[10px]">N/D</span>
                            )}
                          </td>

                          {/* IDC */}
                          <td className="px-4 py-3 text-center">
                            {p.idc !== null ? (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                                style={{
                                  background: `${idcColor(p.idc)}18`,
                                  color: idcColor(p.idc),
                                }}
                                title={`IDC: ${p.idc.toFixed(2)}`}
                              >
                                {p.idc.toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-slate-300 text-[10px]">N/D</span>
                            )}
                          </td>

                          {/* Desvio */}
                          <td className="px-4 py-3 text-center">
                            {devVal !== null ? (
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold"
                                style={{
                                  background: `${devioColor(p.devio)}15`,
                                  color: devioColor(p.devio),
                                }}
                                title={devVal >= 0 ? `Adiantado ${devVal}pp` : `Atrasado ${Math.abs(devVal)}pp`}
                              >
                                {devVal >= 0 ? "+" : ""}{devVal}pp
                              </span>
                            ) : (
                              <span className="text-slate-300 text-[10px]">—</span>
                            )}
                          </td>

                          {/* Worst risk */}
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ background: riskColor }}
                              />
                              <span className="text-[10px]" style={{ color: riskColor }}>
                                {riskLabel}
                              </span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* ══ Indicadores de Efetividade ════════════════════════ */}
          <section>
            <SectionHeader icon={Activity} label="Indicadores de Efetividade" />

            <p className="text-xs text-slate-500 mb-4">
              Medem se as metas do projeto foram atingidas. Configure metas por projeto para rastreamento automático.
            </p>

            {filtered.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm py-12 flex flex-col items-center text-slate-400 gap-2">
                <Activity className="w-10 h-10 opacity-40" />
                <span className="text-sm">Nenhum projeto encontrado</span>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {filtered.map((p) => {
                  const sc = schedColor(p.scheduleStatus)
                  return (
                    <div
                      key={p.id}
                      className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex gap-4 items-start hover:shadow-md transition-shadow"
                    >
                      <ProgressRing pct={p.progress} color={sc} />
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-xs font-bold text-slate-800 leading-tight truncate"
                          title={p.title}
                        >
                          {p.title}
                        </p>
                        <span
                          className={
                            "mt-1 inline-block px-2 py-0.5 rounded-full text-[9px] font-semibold " +
                            (STATUS_BADGE_COLORS[p.status] ?? "bg-slate-100 text-slate-600")
                          }
                        >
                          {STATUS_LABELS[p.status] ?? p.status}
                        </span>
                        <p className="text-[10px] text-slate-400 mt-2">{p.progress}% concluído</p>
                        <div className="mt-1.5 h-1 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${p.progress}%`, background: sc }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* ══ Indicadores de Impacto ════════════════════════════ */}
          <section className="pb-6">
            <SectionHeader icon={DollarSign} label="Indicadores de Impacto" />

            <div className="grid grid-cols-2 gap-4">

              {/* LEFT: Budget vs Estimado */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <p className="text-xs font-black text-slate-700 mb-4 uppercase tracking-wide">
                  Orçamento vs Custo Estimado
                </p>

                {budgetData.length === 0 ? (
                  <div className="h-48 flex flex-col items-center justify-center text-slate-400 gap-2">
                    <DollarSign className="w-8 h-8 opacity-40" />
                    <span className="text-xs">Nenhum projeto com dados financeiros</span>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(200, budgetData.length * 52)}>
                    <BarChart
                      data={budgetData}
                      layout="vertical"
                      margin={{ top: 4, right: 40, left: 0, bottom: 4 }}
                    >
                      <CartesianGrid horizontal={false} stroke="#F1F5F9" />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 10, fill: "#94A3B8" }}
                        tickFormatter={(v: number) => currency(v)}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={150}
                        tick={{ fontSize: 10, fill: "#475569" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip content={BudgetTooltip} />
                      <Legend
                        iconType="circle"
                        iconSize={8}
                        formatter={(value: string) => (
                          <span className="text-[10px] text-slate-600">
                            {value === "budget" ? "Orçamento" : "Estimado"}
                          </span>
                        )}
                      />
                      <Bar dataKey="budget"         fill={C.blue}   radius={[0, 4, 4, 0]} maxBarSize={14} name="budget" />
                      <Bar dataKey="estimatedCosts" fill={C.purple} radius={[0, 4, 4, 0]} maxBarSize={14} name="estimatedCosts" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* RIGHT: Economy */}
              <div className="flex flex-col gap-3">
                {/* Total economy big card */}
                <div
                  className="rounded-2xl p-5 text-white"
                  style={{ background: "linear-gradient(135deg, #00C4E0, #2463FF, #8B2FFF)" }}
                >
                  <p className="text-xs font-bold uppercase tracking-wide opacity-80">
                    Impacto Financeiro Total Esperado
                  </p>
                  <p className="text-3xl font-black mt-2">
                    {currency(totalEconomy || null)}
                  </p>
                  <p className="text-xs opacity-70 mt-1">
                    {projectsWithEconomy.length} projeto{projectsWithEconomy.length !== 1 ? "s" : ""} com economia registrada
                  </p>
                </div>

                {/* Per-project economy cards */}
                <div className="flex-1 overflow-y-auto space-y-2 max-h-[300px] pr-1">
                  {filtered.map((p) =>
                    p.economy !== null && p.economy > 0 ? (
                      <div
                        key={p.id}
                        className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-2.5 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="text-xs text-slate-700 font-medium truncate">{p.title}</span>
                        </div>
                        <span className="text-xs font-bold shrink-0 ml-2" style={{ color: C.green }}>
                          {currency(p.economy)}
                        </span>
                      </div>
                    ) : (
                      <div
                        key={p.id}
                        className="bg-slate-50 rounded-xl border border-dashed border-slate-200 px-4 py-2.5 flex items-center justify-between"
                      >
                        <span className="text-xs text-slate-400 truncate">{p.title}</span>
                        <span className="text-[10px] text-slate-300 ml-2 shrink-0">Não informado</span>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  )
}
