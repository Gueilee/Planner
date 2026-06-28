"use client"

import { useState, useMemo, useTransition } from "react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, ReferenceLine, Legend,
} from "recharts"
import {
  TrendingUp, Calendar, AlertTriangle, DollarSign, Activity,
  Target, BarChart3, ChevronRight, Info, Search, X, Users, Loader2,
  CheckCircle2, Clock, Pause, Zap, ShieldAlert, Award, Layers,
  ArrowUpRight, ArrowDownRight, ChevronUp, ChevronDown, ChevronsUpDown,
  AlertCircle, TrendingDown, Gauge, ListTodo, Briefcase, Timer,
} from "lucide-react"
import { format, differenceInDays, isAfter, isBefore, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { motion, AnimatePresence } from "framer-motion"
import { Header } from "@/components/layout/header"
import type { ProjectIndicator, TaskDashData, AreaDashData, UserOption } from "./page"
import { getPersonAllocation } from "@/lib/actions/allocation"
import type { AllocationResult } from "@/lib/actions/allocation"

// ─── Re-export type alias so existing code that imports UserOption from here still works
export type { UserOption }

// ─── Color tokens ────────────────────────────────────────────────────────────
const C = {
  blue:    "#2463FF",
  purple:  "#7B2FBE",
  green:   "#10B981",
  amber:   "#F59E0B",
  red:     "#EF4444",
  slate:   "#64748B",
  cyan:    "#0891B2",
  indigo:  "#4F46E5",
  rose:    "#F43F5E",
  teal:    "#0D9488",
  orange:  "#F97316",
  sky:     "#0EA5E9",
}

// ─── Status sets ─────────────────────────────────────────────────────────────
const ACTIVE_STATUSES = new Set([
  "IN_PROGRESS", "PILOT", "RAMP_UP", "GO_LIVE", "POST_GOLIVE",
])

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
  PAUSED:          "Pausado",
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
  PAUSED:          "bg-slate-100 text-slate-600",
}

const TASK_STATUS_LABEL: Record<string, string> = {
  PLANNING:    "Planejamento",
  IN_PROGRESS: "Em Andamento",
  VALIDATION:  "Validação",
  COMPLETED:   "Concluída",
  DELAYED:     "Atrasada",
  ON_HOLD:     "Em Espera",
  CANCELLED:   "Cancelada",
}

const TASK_STATUS_BADGE: Record<string, string> = {
  PLANNING:    "bg-slate-100 text-slate-600",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  VALIDATION:  "bg-indigo-100 text-indigo-700",
  COMPLETED:   "bg-green-100 text-green-700",
  DELAYED:     "bg-red-100 text-red-700",
  ON_HOLD:     "bg-orange-100 text-orange-700",
  CANCELLED:   "bg-gray-100 text-gray-400",
}

const AREA_CFG: Record<string, { label: string; color: string }> = {
  TECNOLOGIA:  { label: "Tecnologia",            color: "#0891B2" },
  QUALIDADE:   { label: "Qualidade",             color: "#059669" },
  ESTRATEGICO: { label: "Projetos Estratégicos", color: "#7B2FBE" },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s
}

function currency(v: number | null): string {
  if (v === null || v === undefined) return "—"
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `R$ ${(v / 1_000).toFixed(0)}K`
  return `R$ ${v.toFixed(0)}`
}

function devioColor(devio: number | null): string {
  if (devio === null) return C.slate
  if (devio >= -15)  return C.green
  if (devio >= -30)  return C.amber
  return C.red
}

function devioLabel(devio: number | null): string {
  if (devio === null) return "N/D"
  if (devio >= 5)    return "Adiantado"
  if (devio >= -15)  return "No Prazo"
  if (devio >= -30)  return "Em Risco"
  return "Atrasado"
}

function idcColor(idc: number | null): string {
  if (idc === null) return C.slate
  if (idc > 1)    return C.green
  if (idc >= 0.9) return C.amber
  return C.red
}

function schedColor(s: string): string {
  if (s === "ON_TIME") return C.green
  if (s === "AT_RISK") return C.amber
  if (s === "DELAYED") return C.red
  return C.slate
}

function isTaskOverdue(t: TaskDashData, today: Date): boolean {
  if (t.status === "COMPLETED" || t.status === "CANCELLED") return false
  if (t.status === "DELAYED") return true
  if (t.endDate) return isBefore(parseISO(t.endDate), today)
  return false
}

function isTaskCritical(t: TaskDashData): boolean {
  return t.riskStatus === "HIGH" || t.riskStatus === "CRITICAL"
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({
  icon: Icon,
  label,
  sub,
  accentColor = "#7B2FBE",
}: {
  icon: React.ElementType
  label: string
  sub?: string
  accentColor?: string
}) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div
        className="w-1 self-stretch rounded-full shrink-0"
        style={{ background: accentColor, minHeight: 32 }}
      />
      <div
        className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `${accentColor}18` }}
      >
        <Icon className="w-4 h-4" style={{ color: accentColor }} />
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider leading-tight">{label}</h2>
        {sub && <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">{sub}</p>}
      </div>
      <div className="flex-1 max-w-xs h-px bg-slate-100" />
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({
  label,
  value,
  color,
  icon: Icon,
  sub,
  trend,
}: {
  label: string
  value: string | number
  color: string
  icon: React.ElementType
  sub?: string
  trend?: "up" | "down" | "neutral"
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3.5 flex flex-col gap-2 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: `${color}15` }}
        >
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        {trend === "up" && <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />}
        {trend === "down" && <ArrowDownRight className="w-3.5 h-3.5 text-red-400" />}
      </div>
      <div>
        <p
          className="text-xl font-black leading-none tabular-nums"
          style={{ color, fontVariantNumeric: "tabular-nums" }}
        >
          {value}
        </p>
        <p className="text-[11px] text-slate-500 mt-1 leading-tight font-medium">{label}</p>
        {sub && <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────
function ProgressBar({
  value,
  planned,
  color,
  height = 6,
}: {
  value: number
  planned?: number
  color: string
  height?: number
}) {
  return (
    <div
      className="w-full bg-slate-100 rounded-full overflow-hidden relative"
      style={{ height }}
    >
      {planned !== undefined && (
        <div
          className="absolute top-0 left-0 h-full rounded-full opacity-30"
          style={{ width: `${Math.min(100, planned)}%`, background: color }}
        />
      )}
      <div
        className="absolute top-0 left-0 h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(100, value)}%`, background: color }}
      />
    </div>
  )
}

// ─── Health Gauge (Recharts semicircle) ───────────────────────────────────────
function HealthGauge({ score }: { score: number }) {
  const color =
    score >= 80 ? C.green :
    score >= 60 ? C.amber :
    score >= 40 ? C.orange :
    C.red

  const label =
    score >= 90 ? "Excelente" :
    score >= 80 ? "Saudável" :
    score >= 70 ? "Atenção" :
    score >= 50 ? "Risco" :
    "Crítico"

  const gaugeData = [
    { value: score },
    { value: 100 - score },
  ]

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: 180, height: 100 }}>
        <PieChart width={180} height={100}>
          <Pie
            data={gaugeData}
            cx={90}
            cy={95}
            startAngle={180}
            endAngle={0}
            innerRadius={60}
            outerRadius={85}
            dataKey="value"
            strokeWidth={0}
          >
            <Cell fill={color} />
            <Cell fill="#E2E8F0" />
          </Pie>
        </PieChart>
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-1 pointer-events-none">
          <span
            className="text-2xl font-black leading-none tabular-nums"
            style={{ color, fontVariantNumeric: "tabular-nums" }}
          >
            {Math.round(score)}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color }}>
            {label}
          </span>
        </div>
      </div>
    </div>
  )
}


// ─── Alert Badge ──────────────────────────────────────────────────────────────
function AlertCard({
  level,
  message,
}: {
  level: "red" | "amber" | "blue"
  message: string
}) {
  const cfg = {
    red:   { bg: "bg-red-50",   border: "border-red-200",  text: "text-red-700",   icon: <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" /> },
    amber: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", icon: <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" /> },
    blue:  { bg: "bg-blue-50",  border: "border-blue-200",  text: "text-blue-700",  icon: <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" /> },
  }[level]

  return (
    <div className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 ${cfg.bg} ${cfg.border}`}>
      {cfg.icon}
      <span className={`text-xs leading-relaxed font-medium ${cfg.text}`}>{message}</span>
    </div>
  )
}

// ─── Allocation Results ───────────────────────────────────────────────────────
function AllocationResults({ results }: { results: AllocationResult }) {
  const { tasks, userName } = results
  if (tasks.length === 0) {
    return (
      <div className="py-8 flex flex-col items-center text-slate-400 gap-2">
        <Search className="w-8 h-8 opacity-40" />
        <span className="text-xs">
          Nenhuma atividade encontrada para <strong>{userName}</strong> no período selecionado
        </span>
      </div>
    )
  }

  const byProject = tasks.reduce(
    (acc, t) => {
      if (!acc[t.projectId]) {
        acc[t.projectId] = {
          title: t.projectTitle,
          area: t.projectArea,
          status: t.projectStatus,
          tasks: [],
        }
      }
      acc[t.projectId].tasks.push(t)
      return acc
    },
    {} as Record<string, { title: string; area: string; status: string; tasks: typeof tasks }>,
  )

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        <span className="font-bold text-slate-700">{tasks.length}</span>{" "}
        atividade{tasks.length !== 1 ? "s" : ""} de{" "}
        <span className="font-bold text-slate-700">{userName}</span>
      </p>
      {Object.values(byProject).map((proj) => (
        <div key={proj.title} className="border border-slate-100 rounded-xl overflow-hidden">
          <div className="px-4 py-2 bg-slate-50 flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-700">{proj.title}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-500">
              {AREA_CFG[proj.area]?.label ?? proj.area}
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_BADGE_COLORS[proj.status] ?? "bg-slate-100 text-slate-600"}`}>
              {STATUS_LABELS[proj.status] ?? proj.status}
            </span>
            <span className="ml-auto text-[10px] text-slate-400">
              {proj.tasks.length} atividade{proj.tasks.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="overflow-x-auto">
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
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${TASK_STATUS_BADGE[t.status] ?? "bg-slate-100 text-slate-600"}`}>
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
                        <span className="text-[10px] font-bold text-slate-500 w-7 text-right tabular-nums">
                          {t.progress}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-center text-slate-500 whitespace-nowrap">
                      {t.startDate ? format(parseISO(t.startDate), "dd/MM/yy", { locale: ptBR }) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-center text-slate-500 whitespace-nowrap">
                      {t.endDate ? format(parseISO(t.endDate), "dd/MM/yy", { locale: ptBR }) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Sortable table hook ──────────────────────────────────────────────────────
type SortDir = "asc" | "desc" | null
function useSortable<T>(data: T[]) {
  const [sortKey, setSortKey] = useState<keyof T | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)

  function toggleSort(key: keyof T) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : d === "desc" ? null : "asc"))
      if (sortDir === "desc") setSortKey(null)
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return data
    return [...data].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (av === null || av === undefined) return 1
      if (bv === null || bv === undefined) return -1
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av
      }
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av))
    })
  }, [data, sortKey, sortDir])

  function SortIcon({ k }: { k: keyof T }) {
    if (sortKey !== k) return <ChevronsUpDown className="w-3 h-3 text-slate-300 inline ml-1" />
    if (sortDir === "asc") return <ChevronUp className="w-3 h-3 text-slate-500 inline ml-1" />
    return <ChevronDown className="w-3 h-3 text-slate-500 inline ml-1" />
  }

  return { sorted, toggleSort, SortIcon }
}

// ─── Compute health score for a project ──────────────────────────────────────
function computeHealthScore(p: ProjectIndicator, today: Date): number {
  const tasks = p.tasks
  const totalTasks = tasks.length

  // SPI (35%)
  const spi = p.idp ?? 1
  const spiScore = Math.min(1, spi) * 100 * 0.35

  // CPI (25%)
  const cpi = p.idc ?? 1
  const cpiScore = Math.min(1, cpi) * 100 * 0.25

  // Progress vs planned (20%)
  const progressScore =
    p.plannedPct && p.plannedPct > 0
      ? Math.min(1, p.progress / p.plannedPct) * 100 * 0.20
      : 0.5 * 100 * 0.20

  // Critical delays (10%)
  const criticalDelays = tasks.filter((t) => isTaskOverdue(t, today)).length
  const delayScore = (1 - Math.min(1, totalTasks > 0 ? criticalDelays / totalTasks : 0)) * 100 * 0.10

  // Team efficiency (10%)
  const estEffort = tasks.reduce((s, t) => s + (t.estimatedEffort ?? 0), 0)
  const actEffort = tasks.reduce((s, t) => s + (t.actualEffort ?? 0), 0)
  const effScore =
    actEffort > 0
      ? Math.min(1, estEffort / actEffort) * 100 * 0.10
      : 0.5 * 100 * 0.10

  return Math.round(spiScore + cpiScore + progressScore + delayScore + effScore)
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export function AnalyticsClient({
  projects,
  users,
  userRole,
  userArea,
}: {
  projects: ProjectIndicator[]
  users: UserOption[]
  userRole: string
  userArea: string | null
}) {
  void userRole

  const today = useMemo(() => new Date(), [])

  // ── Filters ──────────────────────────────────────────────────────────────────
  const [filter,      setFilter]      = useState<"ACTIVE" | "ALL">("ACTIVE")
  const [areaFilter,  setAreaFilter]  = useState<string>(userArea ?? "ALL")
  const [responsible, setResponsible] = useState<string>("ALL")
  const [search,      setSearch]      = useState("")
  const [projectSel,  setProjectSel]  = useState<string>("ALL")

  // ── Allocation panel ─────────────────────────────────────────────────────────
  const [allocOpen,    setAllocOpen]    = useState(false)
  const [selectedUser, setSelectedUser] = useState("")
  const [allocStart,   setAllocStart]   = useState("")
  const [allocEnd,     setAllocEnd]     = useState("")
  const [allocResults, setAllocResults] = useState<AllocationResult | null>(null)
  const [allocPending, startAlloc]      = useTransition()

  function handleAllocSearch() {
    if (!selectedUser) return
    startAlloc(async () => {
      const result = await getPersonAllocation(selectedUser, allocStart || null, allocEnd || null)
      setAllocResults(result)
    })
  }

  function onUserChange(uid: string) {
    setSelectedUser(uid)
    setAllocResults(null)
  }

  function clearFilters() {
    setAreaFilter("ALL")
    setResponsible("ALL")
    setSearch("")
    setProjectSel("ALL")
  }

  // ── Filtered projects ────────────────────────────────────────────────────────
  const allResponsibles = useMemo(
    () => [...new Set(projects.flatMap((p) => p.taskResponsibles))].sort(),
    [projects],
  )

  const filtered = useMemo(() => {
    let list = filter === "ACTIVE"
      ? projects.filter((p) => ACTIVE_STATUSES.has(p.status))
      : projects
    if (areaFilter !== "ALL")  list = list.filter((p) => p.projectArea === areaFilter)
    if (responsible !== "ALL") list = list.filter((p) => p.taskResponsibles.includes(responsible))
    if (search.trim())         list = list.filter((p) => p.title.toLowerCase().includes(search.trim().toLowerCase()))
    if (projectSel !== "ALL")  list = list.filter((p) => p.id === projectSel)
    return list
  }, [projects, filter, areaFilter, responsible, search, projectSel])

  // ── All tasks from filtered projects ────────────────────────────────────────
  const allTasks = useMemo(
    () => filtered.flatMap((p) => p.tasks),
    [filtered],
  )

  // ─────────────────────────────────────────────────────────────────────────────
  // BLOCK 1 — Resumo Executivo
  // ─────────────────────────────────────────────────────────────────────────────
  const totalProjects   = filtered.length
  const activeProjects  = filtered.filter((p) => ACTIVE_STATUSES.has(p.status)).length
  const completedProjects = filtered.filter((p) => p.status === "COMPLETED").length

  const totalTasks      = allTasks.length
  const completedTasks  = allTasks.filter((t) => t.status === "COMPLETED").length
  const inProgressTasks = allTasks.filter((t) => t.status === "IN_PROGRESS" || t.status === "VALIDATION").length
  const delayedTasks    = allTasks.filter((t) => isTaskOverdue(t, today)).length

  const totalBudget     = filtered.reduce((s, p) => s + (p.budget ?? 0), 0)
  const totalActualCost = allTasks.reduce((s, t) => s + (t.actualCost ?? 0), 0)
  const totalBudgeted   = allTasks.reduce((s, t) => s + (t.budgetedCost ?? 0), 0)
  const financialDevio  = totalBudgeted - totalActualCost

  const totalEstHours  = allTasks.reduce((s, t) => s + (t.estimatedEffort ?? 0), 0)
  const totalActHours  = allTasks.reduce((s, t) => s + (t.actualEffort ?? 0), 0)

  // ─────────────────────────────────────────────────────────────────────────────
  // BLOCK 2 — Health Score
  // ─────────────────────────────────────────────────────────────────────────────
  const healthScores = useMemo(
    () => filtered.map((p) => ({ id: p.id, title: p.title, score: computeHealthScore(p, today) })),
    [filtered, today],
  )
  const avgHealth = healthScores.length
    ? Math.round(healthScores.reduce((s, h) => s + h.score, 0) / healthScores.length)
    : 0

  // ─────────────────────────────────────────────────────────────────────────────
  // BLOCK 3 — Progresso
  // ─────────────────────────────────────────────────────────────────────────────
  const taskStatusCounts = useMemo(() => {
    const completed   = allTasks.filter((t) => t.status === "COMPLETED").length
    const inProgress  = allTasks.filter((t) => t.status === "IN_PROGRESS" || t.status === "VALIDATION").length
    const planning    = allTasks.filter((t) => t.status === "PLANNING").length
    const delayed     = allTasks.filter((t) => isTaskOverdue(t, today)).length
    const onHold      = allTasks.filter((t) => t.status === "ON_HOLD").length
    return { completed, inProgress, planning, delayed, onHold }
  }, [allTasks, today])

  const taskPieData = [
    { name: "Concluídas",    value: taskStatusCounts.completed,  fill: C.green  },
    { name: "Em Andamento",  value: taskStatusCounts.inProgress, fill: C.blue   },
    { name: "Não Iniciadas", value: taskStatusCounts.planning,   fill: "#94A3B8" },
    { name: "Atrasadas",     value: taskStatusCounts.delayed,    fill: C.red    },
    { name: "Pausadas",      value: taskStatusCounts.onHold,     fill: C.amber  },
  ].filter((d) => d.value > 0)

  // WBS area progress bars
  const areaProgressData = useMemo(() => {
    const areaMap: Record<string, { name: string; color: string; tasks: TaskDashData[] }> = {}
    filtered.forEach((p) => {
      p.areas.forEach((a) => {
        if (!areaMap[a.id]) {
          areaMap[a.id] = { name: a.name, color: a.color ?? C.blue, tasks: [] }
        }
      })
      p.tasks.forEach((t) => {
        if (t.wbsAreaId && areaMap[t.wbsAreaId]) {
          areaMap[t.wbsAreaId].tasks.push(t)
        }
      })
    })
    return Object.values(areaMap).map((a) => {
      const total   = a.tasks.length
      const done    = a.tasks.filter((t) => t.status === "COMPLETED").length
      const realPct = total > 0 ? Math.round((done / total) * 100) : 0
      const avgProg = total > 0 ? Math.round(a.tasks.reduce((s, t) => s + t.progress, 0) / total) : 0
      return {
        name:    truncate(a.name, 22),
        fullName: a.name,
        real:    avgProg,
        done,
        total,
        color:   a.color,
      }
    }).filter((d) => d.total > 0)
  }, [filtered])

  // ─────────────────────────────────────────────────────────────────────────────
  // BLOCK 4 — Cronograma
  // ─────────────────────────────────────────────────────────────────────────────
  const scheduleKpis = useMemo(() => {
    const delayed     = allTasks.filter((t) => isTaskOverdue(t, today))
    const critical    = allTasks.filter((t) => isTaskCritical(t) && !["COMPLETED","CANCELLED"].includes(t.status))
    const noResp      = allTasks.filter((t) => !t.responsibleId && !["COMPLETED","CANCELLED"].includes(t.status))

    const delayDays   = delayed.map((t) =>
      t.endDate ? differenceInDays(today, parseISO(t.endDate)) : 0
    )
    const maxDelay    = delayDays.length ? Math.max(...delayDays) : 0

    const aheadTasks  = allTasks.filter((t) => {
      if (t.status !== "COMPLETED" || !t.completedAt || !t.endDate) return false
      return isBefore(parseISO(t.completedAt), parseISO(t.endDate))
    })
    const aheadDays   = aheadTasks.map((t) =>
      differenceInDays(parseISO(t.endDate!), parseISO(t.completedAt!))
    )
    const maxAhead    = aheadDays.length ? Math.max(...aheadDays) : 0

    const durations   = allTasks
      .filter((t) => t.startDate && t.endDate)
      .map((t) => differenceInDays(parseISO(t.endDate!), parseISO(t.startDate!)))
    const avgDuration = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0

    const onTimeTasks = allTasks.filter((t) => {
      if (!t.actualStart || !t.startDate) return false
      return !isAfter(parseISO(t.actualStart), parseISO(t.startDate))
    }).length
    const lateStartTasks = allTasks.filter((t) => {
      if (!t.actualStart || !t.startDate) return false
      return isAfter(parseISO(t.actualStart), parseISO(t.startDate))
    }).length

    return { delayed: delayed.length, critical: critical.length, noResp: noResp.length, maxDelay, maxAhead, avgDuration, onTimeTasks, lateStartTasks }
  }, [allTasks, today])

  // ─────────────────────────────────────────────────────────────────────────────
  // BLOCK 5 — Custos
  // ─────────────────────────────────────────────────────────────────────────────
  const costData = useMemo(() =>
    filtered
      .filter((p) => p.budget !== null || p.estimatedCosts !== null || allTasks.some((t) => t.actualCost))
      .map((p) => {
        const actual = p.tasks.reduce((s, t) => s + (t.actualCost ?? 0), 0)
        return {
          name:     truncate(p.title, 18),
          fullName: p.title,
          budget:   p.budget ?? 0,
          actual,
        }
      }),
    [filtered, allTasks],
  )

  const top5CostTasks = useMemo(() =>
    [...allTasks]
      .filter((t) => t.actualCost && t.actualCost > 0)
      .sort((a, b) => (b.actualCost ?? 0) - (a.actualCost ?? 0))
      .slice(0, 5),
    [allTasks],
  )

  // ─────────────────────────────────────────────────────────────────────────────
  // BLOCK 6 — Horas
  // ─────────────────────────────────────────────────────────────────────────────
  const hoursEfficiency = totalActHours > 0
    ? Math.round((totalEstHours / totalActHours) * 100)
    : null

  const hoursPerResponsible = useMemo(() => {
    const map: Record<string, { name: string; est: number; act: number }> = {}
    allTasks.forEach((t) => {
      const name = t.responsibleName ?? "Sem responsável"
      if (!map[name]) map[name] = { name, est: 0, act: 0 }
      map[name].est += t.estimatedEffort ?? 0
      map[name].act += t.actualEffort ?? 0
    })
    return Object.values(map)
      .sort((a, b) => b.act - a.act)
      .slice(0, 10)
      .map((d) => ({ ...d, name: truncate(d.name, 18) }))
  }, [allTasks])

  // ─────────────────────────────────────────────────────────────────────────────
  // BLOCK 7 — Responsáveis table
  // ─────────────────────────────────────────────────────────────────────────────
  type ResponsibleRow = {
    name:        string
    total:       number
    completed:   number
    inProgress:  number
    delayed:     number
    hours:       number
    efficiency:  number | null
  }

  const responsibleRows = useMemo((): ResponsibleRow[] => {
    const map: Record<string, { tasks: TaskDashData[] }> = {}
    allTasks.forEach((t) => {
      const key = t.responsibleName ?? "—"
      if (!map[key]) map[key] = { tasks: [] }
      map[key].tasks.push(t)
    })
    return Object.entries(map).map(([name, { tasks }]) => {
      const est = tasks.reduce((s, t) => s + (t.estimatedEffort ?? 0), 0)
      const act = tasks.reduce((s, t) => s + (t.actualEffort ?? 0), 0)
      return {
        name,
        total:      tasks.length,
        completed:  tasks.filter((t) => t.status === "COMPLETED").length,
        inProgress: tasks.filter((t) => t.status === "IN_PROGRESS" || t.status === "VALIDATION").length,
        delayed:    tasks.filter((t) => isTaskOverdue(t, today)).length,
        hours:      act,
        efficiency: act > 0 ? Math.round((est / act) * 100) : null,
      }
    })
  }, [allTasks, today])

  const { sorted: sortedResp, toggleSort: toggleRespSort, SortIcon: RespSortIcon } =
    useSortable<ResponsibleRow>(responsibleRows)

  // ─────────────────────────────────────────────────────────────────────────────
  // BLOCK 8 — Módulos
  // ─────────────────────────────────────────────────────────────────────────────
  type ModuleCard = {
    id:       string
    name:     string
    color:    string
    progress: number
    done:     number
    total:    number
    delayed:  number
    budget:   number
    actual:   number
  }

  const moduleCards = useMemo((): ModuleCard[] => {
    const map: Record<string, ModuleCard> = {}
    filtered.forEach((p) => {
      p.areas.forEach((a) => {
        if (!map[a.id]) {
          map[a.id] = {
            id:       a.id,
            name:     a.name,
            color:    a.color ?? C.indigo,
            progress: 0,
            done:     0,
            total:    0,
            delayed:  0,
            budget:   0,
            actual:   0,
          }
        }
      })
      p.tasks.forEach((t) => {
        if (!t.wbsAreaId || !map[t.wbsAreaId]) return
        const m = map[t.wbsAreaId]
        m.total++
        m.budget += t.budgetedCost ?? 0
        m.actual += t.actualCost ?? 0
        if (t.status === "COMPLETED") m.done++
        if (isTaskOverdue(t, today)) m.delayed++
      })
    })
    return Object.values(map)
      .filter((m) => m.total > 0)
      .map((m) => ({
        ...m,
        progress: m.total > 0 ? Math.round((m.done / m.total) * 100) : 0,
      }))
  }, [filtered, today])

  // ─────────────────────────────────────────────────────────────────────────────
  // BLOCK 9 — Timeline (Gantt)
  // ─────────────────────────────────────────────────────────────────────────────
  const ganttData = useMemo(() => {
    const epoch = new Date("2020-01-01").getTime()
    return allTasks
      .filter((t) => t.startDate && t.endDate)
      .slice(0, 20)
      .map((t) => {
        const start    = parseISO(t.startDate!).getTime() - epoch
        const end      = parseISO(t.endDate!).getTime() - epoch
        const actStart = t.actualStart ? parseISO(t.actualStart).getTime() - epoch : null
        const actEnd   = t.actualEnd ? parseISO(t.actualEnd).getTime() - epoch : today.getTime() - epoch
        const delayed  = isTaskOverdue(t, today)
        return {
          name:      truncate(t.title, 25),
          fullName:  t.title,
          planned:   [start, end] as [number, number],
          actual:    actStart !== null ? [actStart, actEnd] as [number, number] : null,
          delayed,
          status:    t.status,
        }
      })
  }, [allTasks, today])

  // ─────────────────────────────────────────────────────────────────────────────
  // BLOCK 10 — Alertas
  // ─────────────────────────────────────────────────────────────────────────────
  const alerts = useMemo(() => {
    const list: { level: "red" | "amber" | "blue"; message: string }[] = []

    filtered.forEach((p) => {
      const pActual = p.tasks.reduce((s, t) => s + (t.actualCost ?? 0), 0)
      if (p.budget && pActual > p.budget) {
        list.push({
          level: "red",
          message: `Projeto "${p.title}" acima do orçamento em ${currency(pActual - p.budget)}`,
        })
      }
      if (p.devio !== null && p.devio < -15) {
        list.push({
          level: p.devio < -30 ? "red" : "amber",
          message: `Projeto "${p.title}" com desvio de prazo de ${p.devio}pp`,
        })
      }
    })

    const criticalNoResp = allTasks.filter(
      (t) => isTaskCritical(t) && !t.responsibleId && !["COMPLETED","CANCELLED"].includes(t.status)
    ).length
    if (criticalNoResp > 0) {
      list.push({ level: "red", message: `${criticalNoResp} atividade(s) crítica(s) sem responsável atribuído` })
    }

    moduleCards.forEach((m) => {
      if (m.progress === 0 && m.total > 0) {
        list.push({ level: "amber", message: `Módulo "${m.name}" com 0% de progresso e atividades em aberto` })
      }
    })

    const respMap: Record<string, number> = {}
    allTasks.forEach((t) => {
      if (t.responsibleName && (t.status === "IN_PROGRESS" || t.status === "VALIDATION")) {
        respMap[t.responsibleName] = (respMap[t.responsibleName] ?? 0) + 1
      }
    })
    Object.entries(respMap).forEach(([name, count]) => {
      if (count > 10) {
        list.push({ level: "amber", message: `${name} tem ${count} atividades em andamento simultaneamente` })
      }
    })

    if (totalActHours > 0 && totalEstHours > 0) {
      const overPct = Math.round(((totalActHours - totalEstHours) / totalEstHours) * 100)
      if (overPct > 15) {
        list.push({ level: "amber", message: `Horas realizadas ${overPct}% acima do previsto no portfólio` })
      }
    }

    if (list.length === 0) {
      list.push({ level: "blue", message: "Nenhum alerta crítico detectado no portfólio atual" })
    }

    return list
  }, [filtered, allTasks, moduleCards, totalActHours, totalEstHours])

  // ─────────────────────────────────────────────────────────────────────────────
  // BLOCK 11 — EVM
  // ─────────────────────────────────────────────────────────────────────────────
  const evmData = useMemo(() =>
    filtered.map((p) => {
      const BAC = p.tasks.reduce((s, t) => s + (t.budgetedCost ?? 0), 0)
      const EV  = p.tasks.reduce((s, t) => s + (t.budgetedCost ?? 0) * (t.progress / 100), 0)
      const PV  = BAC * ((p.plannedPct ?? 0) / 100)
      const AC  = p.tasks.reduce((s, t) => s + (t.actualCost ?? 0), 0)
      const SV  = EV - PV
      const CV  = EV - AC
      const SPI = PV > 0 ? EV / PV : null
      const CPI = AC > 0 ? EV / AC : null
      const EAC = CPI && CPI > 0 ? BAC / CPI : BAC
      const ETC = EAC - AC
      const VAC = BAC - EAC
      return { id: p.id, title: p.title, BAC, EV, PV, AC, SV, CV, SPI, CPI, EAC, ETC, VAC }
    }),
    [filtered],
  )

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  const hasFilters = areaFilter !== "ALL" || responsible !== "ALL" || search !== "" || projectSel !== "ALL"

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header />

      <div className="flex-1 overflow-y-auto bg-slate-50">
        <div className="max-w-[1440px] mx-auto px-6 py-6 space-y-8">

          {/* ── Page Title ──────────────────────────────────────────── */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-md shrink-0"
                style={{ background: "linear-gradient(135deg, #00C4E0, #2463FF, #8B2FFF)" }}
              >
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-black text-slate-900 leading-tight">Indicadores de Gestão</h1>
                <p className="text-xs text-slate-500 mt-0.5">Dashboard executivo consolidado · {today && format(today, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 bg-white rounded-xl border border-slate-200 p-1 shadow-sm">
              {(["ACTIVE", "ALL"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={
                    "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 " +
                    (filter === f ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-700")
                  }
                >
                  {f === "ACTIVE" ? "Ativos" : "Todos os projetos"}
                </button>
              ))}
            </div>
          </div>

          {/* ══ FILTER BAR ══════════════════════════════════════════════════════ */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-wrap gap-3 items-center">
            {/* Busca */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar projeto…"
                className="pl-8 pr-7 h-8 text-xs rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-[#7B2FBE] w-52 transition-colors"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="w-3 h-3 text-slate-400" />
                </button>
              )}
            </div>

            <div className="w-px h-6 bg-slate-200" />

            {/* Projeto específico */}
            <select
              value={projectSel}
              onChange={(e) => setProjectSel(e.target.value)}
              className="h-8 pl-3 pr-7 text-xs rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-[#7B2FBE] text-slate-700 appearance-none cursor-pointer transition-colors"
              style={{ minWidth: 180 }}
            >
              <option value="ALL">Todos os projetos</option>
              {(filter === "ACTIVE" ? projects.filter((p) => ACTIVE_STATUSES.has(p.status)) : projects).map((p) => (
                <option key={p.id} value={p.id}>{truncate(p.title, 40)}</option>
              ))}
            </select>

            <div className="w-px h-6 bg-slate-200" />

            {/* Área */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100">
              {[
                { key: "ALL", label: "Todas áreas", color: "#64748B" },
                ...Object.entries(AREA_CFG).map(([k, v]) => ({ key: k, label: v.label, color: v.color })),
              ].map((a) => {
                const isActive = areaFilter === a.key
                const count = a.key === "ALL"
                  ? (filter === "ACTIVE" ? projects.filter((p) => ACTIVE_STATUSES.has(p.status)).length : projects.length)
                  : projects.filter((p) => p.projectArea === a.key).length
                return (
                  <button
                    key={a.key}
                    onClick={() => setAreaFilter(a.key)}
                    className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap"
                    style={
                      isActive
                        ? { background: a.color, color: "#fff", boxShadow: `0 2px 8px ${a.color}40` }
                        : { background: "transparent", color: "#94A3B8" }
                    }
                  >
                    {a.label}
                    <span
                      className="text-[9px] font-black px-1 py-px rounded-full"
                      style={isActive ? { background: "rgba(255,255,255,0.25)", color: "#fff" } : { background: "#E2E8F0", color: "#94A3B8" }}
                    >
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="w-px h-6 bg-slate-200" />

            {/* Responsável */}
            <div className="flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <select
                value={responsible}
                onChange={(e) => setResponsible(e.target.value)}
                className="h-8 pl-2 pr-7 text-xs rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-[#7B2FBE] text-slate-700 appearance-none cursor-pointer transition-colors"
                style={{ minWidth: 170 }}
              >
                <option value="ALL">Todos os responsáveis</option>
                {allResponsibles.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            {hasFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1.5 px-3 h-7 rounded-xl text-xs font-semibold text-slate-500 hover:text-red-500 border border-slate-200 hover:border-red-200 transition-all"
              >
                <X className="w-3 h-3" /> Limpar filtros
              </button>
            )}

            <span className="ml-auto text-xs font-bold text-slate-400 tabular-nums">
              {filtered.length} projeto{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* ══ BLOCO 1 — RESUMO EXECUTIVO ══════════════════════════════════════ */}
          <section>
            <SectionHeader icon={Briefcase} label="Resumo Executivo" sub="Visão consolidada do portfólio" accentColor={C.blue} />
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
              <KpiCard label="Total de Projetos"      value={totalProjects}                       color={C.blue}   icon={Briefcase} />
              <KpiCard label="Em Andamento"           value={activeProjects}                      color={C.cyan}   icon={Activity} />
              <KpiCard label="Concluídos"             value={completedProjects}                   color={C.green}  icon={CheckCircle2} />
              <KpiCard label="Total de Atividades"    value={totalTasks}                          color={C.slate}  icon={ListTodo} />
              <KpiCard label="Atividades Concluídas"  value={completedTasks}                      color={C.green}  icon={CheckCircle2} />
              <KpiCard label="Em Andamento"           value={inProgressTasks}                     color={C.blue}   icon={Clock} />
              <KpiCard label="Atrasadas"              value={delayedTasks}                        color={C.red}    icon={AlertTriangle} trend={delayedTasks > 0 ? "down" : "neutral"} />
              <KpiCard label="Orçamento Total"        value={currency(totalBudget || null)}       color={C.indigo} icon={DollarSign} />
              <KpiCard label="Custo Real (tarefas)"   value={currency(totalActualCost || null)}   color={C.purple} icon={TrendingDown} />
              <KpiCard label="Desvio Financeiro"      value={currency(financialDevio || null)}    color={financialDevio >= 0 ? C.green : C.red} icon={Gauge} trend={financialDevio >= 0 ? "up" : "down"} />
              <KpiCard label="Horas Planejadas"       value={totalEstHours > 0 ? `${totalEstHours}h` : "—"} color={C.sky}    icon={Timer} />
              <KpiCard label="Horas Realizadas"       value={totalActHours > 0 ? `${totalActHours}h` : "—"} color={C.teal}   icon={Zap} />
            </div>
          </section>

          {/* ══ BLOCO 2 — HEALTH SCORE ══════════════════════════════════════════ */}
          <section>
            <SectionHeader icon={Gauge} label="Health Score dos Projetos" sub="Índice de saúde calculado por SPI, CPI, progresso, atrasos e eficiência" accentColor={C.purple} />
            <div className="grid gap-4" style={{ gridTemplateColumns: "280px 1fr" }}>
              {/* Media geral */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col items-center justify-center gap-3">
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Média do Portfólio</p>
                <HealthGauge score={avgHealth} />
                <div className="w-full space-y-1.5 text-[10px]">
                  {[
                    { range: "90–100", label: "Excelente", color: C.green },
                    { range: "80–89",  label: "Saudável",  color: C.green },
                    { range: "70–79",  label: "Atenção",   color: C.amber },
                    { range: "50–69",  label: "Risco",     color: C.orange },
                    { range: "<50",    label: "Crítico",   color: C.red },
                  ].map((b) => (
                    <div key={b.range} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: b.color }} />
                        <span className="text-slate-500">{b.range}</span>
                      </div>
                      <span className="font-bold" style={{ color: b.color }}>{b.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Por projeto */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <p className="text-xs font-black text-slate-700 mb-4 uppercase tracking-wide">Score por Projeto</p>
                {healthScores.length === 0 ? (
                  <div className="py-8 flex flex-col items-center text-slate-400 gap-2">
                    <Gauge className="w-8 h-8 opacity-40" />
                    <span className="text-xs">Nenhum projeto visível</span>
                  </div>
                ) : (
                  <div className="space-y-3 overflow-y-auto max-h-80">
                    {healthScores.sort((a, b) => a.score - b.score).map((h) => {
                      const color =
                        h.score >= 80 ? C.green :
                        h.score >= 60 ? C.amber :
                        h.score >= 40 ? C.orange :
                        C.red
                      return (
                        <div key={h.id} className="flex items-center gap-3">
                          <div className="w-48 shrink-0 text-xs text-slate-700 font-medium truncate" title={h.title}>
                            {h.title}
                          </div>
                          <div className="flex-1">
                            <ProgressBar value={h.score} color={color} height={8} />
                          </div>
                          <span className="w-10 text-right text-xs font-black tabular-nums" style={{ color }}>
                            {h.score}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ══ BLOCO 3 — PROGRESSO ═════════════════════════════════════════════ */}
          <section>
            <SectionHeader icon={CheckCircle2} label="Progresso das Atividades" sub="Distribuição de status das tarefas e progresso por módulo WBS" accentColor={C.green} />
            <div className="grid gap-4" style={{ gridTemplateColumns: "280px 1fr" }}>
              {/* Donut */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col">
                <p className="text-xs font-black text-slate-700 mb-3 uppercase tracking-wide">Status das Tarefas</p>
                {taskPieData.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-2">
                    <BarChart3 className="w-8 h-8 opacity-40" />
                    <span className="text-xs">Sem atividades</span>
                  </div>
                ) : (
                  <>
                    <div className="relative flex items-center justify-center">
                      <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                          <Pie
                            data={taskPieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={80}
                            dataKey="value"
                            paddingAngle={2}
                            strokeWidth={0}
                          >
                            {taskPieData.map((entry, i) => (
                              <Cell key={i} fill={entry.fill} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              borderRadius: 10, border: "1px solid #E2E8F0",
                              fontSize: 11, boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute flex flex-col items-center pointer-events-none">
                        <span className="text-2xl font-black text-slate-800 tabular-nums">{totalTasks}</span>
                        <span className="text-[9px] text-slate-400 uppercase tracking-wide">atividades</span>
                      </div>
                    </div>
                    <div className="mt-2 space-y-1.5">
                      {taskPieData.map((d) => (
                        <div key={d.name} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.fill }} />
                            <span className="text-slate-600">{d.name}</span>
                          </div>
                          <span className="font-bold text-slate-800 tabular-nums">{d.value}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* WBS Area bars */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <p className="text-xs font-black text-slate-700 mb-4 uppercase tracking-wide">Progresso por Módulo WBS</p>
                {areaProgressData.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2 py-8">
                    <Layers className="w-8 h-8 opacity-40" />
                    <span className="text-xs">Nenhuma área WBS configurada</span>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(200, areaProgressData.length * 38)}>
                    <BarChart data={areaProgressData} layout="vertical" margin={{ top: 4, right: 52, left: 0, bottom: 4 }}>
                      <CartesianGrid horizontal={false} stroke="#F1F5F9" />
                      <XAxis
                        type="number"
                        domain={[0, 100]}
                        tick={{ fontSize: 10, fill: "#94A3B8" }}
                        tickFormatter={(v: number) => `${v}%`}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={160}
                        tick={{ fontSize: 10, fill: "#475569" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        content={(props) => {
                          if (!props.active || !props.payload?.length) return null
                          const d = props.payload[0]?.payload as typeof areaProgressData[0]
                          return (
                            <div className="bg-white rounded-xl border border-slate-200 shadow-lg px-3 py-2 text-xs">
                              <p className="font-bold text-slate-800 mb-1">{d.fullName}</p>
                              <p className="text-slate-500">Progresso médio: <span className="font-bold text-slate-800">{d.real}%</span></p>
                              <p className="text-slate-500">Concluídas: <span className="font-bold text-slate-800">{d.done}/{d.total}</span></p>
                            </div>
                          )
                        }}
                      />
                      <Bar dataKey="real" radius={[0, 4, 4, 0]} maxBarSize={18} label={{ position: "right", fontSize: 9, fill: "#94A3B8", formatter: (v: unknown) => `${v}%` }}>
                        {areaProgressData.map((entry, i) => (
                          <Cell key={i} fill={entry.color ?? C.blue} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </section>

          {/* ══ BLOCO 4 — CRONOGRAMA ════════════════════════════════════════════ */}
          <section>
            <SectionHeader icon={Calendar} label="Cronograma" sub="Situação dos prazos e aderência ao planejado" accentColor={C.amber} />
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(175px, 1fr))" }}>
              <KpiCard label="Atividades Atrasadas"      value={scheduleKpis.delayed}          color={C.red}   icon={AlertTriangle} trend={scheduleKpis.delayed > 0 ? "down" : "neutral"} />
              <KpiCard label="Atividades Críticas"       value={scheduleKpis.critical}         color={C.orange} icon={ShieldAlert} />
              <KpiCard label="Maior Atraso"              value={scheduleKpis.maxDelay > 0 ? `${scheduleKpis.maxDelay}d` : "—"} color={C.red} icon={TrendingDown} />
              <KpiCard label="Maior Adiantamento"        value={scheduleKpis.maxAhead > 0 ? `${scheduleKpis.maxAhead}d` : "—"} color={C.green} icon={TrendingUp} />
              <KpiCard label="Duração Média (dias)"      value={scheduleKpis.avgDuration > 0 ? `${scheduleKpis.avgDuration}d` : "—"} color={C.slate} icon={Timer} />
              <KpiCard label="Sem Responsável"           value={scheduleKpis.noResp}           color={C.rose}  icon={Users} trend={scheduleKpis.noResp > 0 ? "down" : "neutral"} />
              <KpiCard label="Iniciadas no Prazo"        value={scheduleKpis.onTimeTasks}      color={C.green} icon={CheckCircle2} />
              <KpiCard label="Início Fora do Prazo"      value={scheduleKpis.lateStartTasks}   color={C.amber} icon={Clock} />
            </div>
          </section>

          {/* ══ BLOCO 5 — CUSTOS ════════════════════════════════════════════════ */}
          <section>
            <SectionHeader icon={DollarSign} label="Custos" sub="Orçamento planejado vs custo real por projeto" accentColor={C.indigo} />
            <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 320px" }}>
              {/* Bar chart */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <p className="text-xs font-black text-slate-700 mb-4 uppercase tracking-wide">Orçamento vs Custo Real</p>
                {costData.length === 0 ? (
                  <div className="h-48 flex flex-col items-center justify-center text-slate-400 gap-2">
                    <DollarSign className="w-8 h-8 opacity-40" />
                    <span className="text-xs">Nenhum dado financeiro disponível</span>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(200, costData.length * 52)}>
                    <BarChart data={costData} layout="vertical" margin={{ top: 4, right: 48, left: 0, bottom: 4 }}>
                      <CartesianGrid horizontal={false} stroke="#F1F5F9" />
                      <XAxis type="number" tick={{ fontSize: 10, fill: "#94A3B8" }} tickFormatter={(v: number) => currency(v)} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={155} tick={{ fontSize: 10, fill: "#475569" }} axisLine={false} tickLine={false} />
                      <Tooltip
                        content={(props) => {
                          if (!props.active || !props.payload?.length) return null
                          const d = props.payload[0]?.payload as typeof costData[0]
                          return (
                            <div className="bg-white rounded-xl border border-slate-200 shadow-lg px-3 py-2 text-xs space-y-1">
                              <p className="font-bold text-slate-800">{d.fullName}</p>
                              <p style={{ color: C.blue }}>Orçamento: {currency(d.budget)}</p>
                              <p style={{ color: C.purple }}>Real: {currency(d.actual)}</p>
                            </div>
                          )
                        }}
                      />
                      <Legend iconType="circle" iconSize={8} formatter={(v: string) => (
                        <span className="text-[10px] text-slate-600">{v === "budget" ? "Orçamento" : "Custo Real"}</span>
                      )} />
                      <Bar dataKey="budget" fill={C.blue}   radius={[0, 4, 4, 0]} maxBarSize={14} name="budget" />
                      <Bar dataKey="actual" fill={C.purple} radius={[0, 4, 4, 0]} maxBarSize={14} name="actual" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Summary + Top 5 */}
              <div className="flex flex-col gap-3">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
                  {[
                    { label: "Total Orçado",    value: currency(totalBudget || null),      color: C.blue },
                    { label: "Total Gasto",      value: currency(totalActualCost || null),  color: C.purple },
                    { label: financialDevio >= 0 ? "Economia" : "Estouro", value: currency(Math.abs(financialDevio) || null), color: financialDevio >= 0 ? C.green : C.red },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between text-sm">
                      <span className="text-slate-500 text-xs">{row.label}</span>
                      <span className="font-black text-sm tabular-nums" style={{ color: row.color }}>{row.value}</span>
                    </div>
                  ))}
                </div>

                {top5CostTasks.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex-1">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-wide mb-3">Top 5 Atividades por Custo</p>
                    <div className="space-y-2">
                      {top5CostTasks.map((t, i) => (
                        <div key={t.id} className="flex items-center gap-2 text-xs">
                          <span className="w-4 h-4 rounded-full bg-slate-100 text-slate-500 text-[10px] font-black flex items-center justify-center shrink-0">
                            {i + 1}
                          </span>
                          <span className="flex-1 text-slate-700 truncate" title={t.title}>{t.title}</span>
                          <span className="font-bold tabular-nums shrink-0" style={{ color: C.purple }}>{currency(t.actualCost)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ══ BLOCO 6 — HORAS ═════════════════════════════════════════════════ */}
          <section>
            <SectionHeader icon={Timer} label="Horas" sub="Esforço estimado vs realizado por responsável" accentColor={C.teal} />
            <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 280px" }}>
              {/* Bar chart */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <p className="text-xs font-black text-slate-700 mb-4 uppercase tracking-wide">Horas por Responsável (Top 10)</p>
                {hoursPerResponsible.length === 0 ? (
                  <div className="h-48 flex flex-col items-center justify-center text-slate-400 gap-2">
                    <Timer className="w-8 h-8 opacity-40" />
                    <span className="text-xs">Sem dados de esforço</span>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(200, hoursPerResponsible.length * 42)}>
                    <BarChart data={hoursPerResponsible} layout="vertical" margin={{ top: 4, right: 48, left: 0, bottom: 4 }}>
                      <CartesianGrid horizontal={false} stroke="#F1F5F9" />
                      <XAxis type="number" tick={{ fontSize: 10, fill: "#94A3B8" }} tickFormatter={(v: number) => `${v}h`} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 10, fill: "#475569" }} axisLine={false} tickLine={false} />
                      <Tooltip
                        content={(props) => {
                          if (!props.active || !props.payload?.length) return null
                          const d = props.payload[0]?.payload as typeof hoursPerResponsible[0]
                          return (
                            <div className="bg-white rounded-xl border border-slate-200 shadow-lg px-3 py-2 text-xs space-y-1">
                              <p className="font-bold text-slate-800">{d.name}</p>
                              <p style={{ color: C.sky }}>Estimado: {d.est}h</p>
                              <p style={{ color: C.teal }}>Realizado: {d.act}h</p>
                            </div>
                          )
                        }}
                      />
                      <Legend iconType="circle" iconSize={8} formatter={(v: string) => (
                        <span className="text-[10px] text-slate-600">{v === "est" ? "Estimado" : "Realizado"}</span>
                      )} />
                      <Bar dataKey="est" fill={C.sky}  radius={[0, 4, 4, 0]} maxBarSize={14} name="est" />
                      <Bar dataKey="act" fill={C.teal} radius={[0, 4, 4, 0]} maxBarSize={14} name="act" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* KPI cards */}
              <div className="grid grid-cols-1 gap-3 content-start">
                <KpiCard label="Horas Previstas"  value={totalEstHours > 0 ? `${totalEstHours}h` : "—"} color={C.sky}   icon={Timer} />
                <KpiCard label="Horas Realizadas" value={totalActHours > 0 ? `${totalActHours}h` : "—"} color={C.teal}  icon={Zap} />
                <KpiCard label="Horas Restantes"  value={totalEstHours > totalActHours ? `${totalEstHours - totalActHours}h` : "0h"} color={C.slate} icon={Clock} />
                <KpiCard label="Eficiência"        value={hoursEfficiency !== null ? `${hoursEfficiency}%` : "—"} color={hoursEfficiency !== null && hoursEfficiency >= 90 ? C.green : hoursEfficiency !== null && hoursEfficiency >= 70 ? C.amber : C.red} icon={Gauge} trend={hoursEfficiency !== null ? (hoursEfficiency >= 90 ? "up" : "down") : undefined} />
              </div>
            </div>
          </section>

          {/* ══ BLOCO 7 — RESPONSÁVEIS ══════════════════════════════════════════ */}
          <section>
            <SectionHeader icon={Users} label="Responsáveis" sub="Performance e carga de trabalho por pessoa" accentColor={C.cyan} />
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {sortedResp.length === 0 ? (
                <div className="py-12 flex flex-col items-center text-slate-400 gap-2">
                  <Users className="w-8 h-8 opacity-40" />
                  <span className="text-xs">Nenhum dado de responsáveis</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-500 font-black uppercase tracking-wide text-[10px] border-b border-slate-100 bg-slate-50">
                        {(
                          [
                            { key: "name",       label: "Responsável" },
                            { key: "total",      label: "Total" },
                            { key: "completed",  label: "Concluídas" },
                            { key: "inProgress", label: "Em Andamento" },
                            { key: "delayed",    label: "Atrasadas" },
                            { key: "hours",      label: "Horas" },
                            { key: "efficiency", label: "Eficiência" },
                          ] as { key: keyof ResponsibleRow; label: string }[]
                        ).map((col) => (
                          <th
                            key={col.key}
                            className={`px-4 py-3 select-none cursor-pointer hover:bg-slate-100 transition-colors ${col.key === "name" ? "text-left" : "text-center"}`}
                            onClick={() => toggleRespSort(col.key)}
                          >
                            {col.label}
                            <RespSortIcon k={col.key} />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedResp.map((row, i) => (
                        <tr
                          key={row.name}
                          className="border-b border-slate-50 hover:bg-slate-50 transition-colors"
                          style={{ background: i % 2 === 0 ? "#fff" : "#FAFBFC" }}
                        >
                          <td className="px-4 py-2.5 font-semibold text-slate-700">{row.name}</td>
                          <td className="px-4 py-2.5 text-center font-bold tabular-nums text-slate-600">{row.total}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className="font-bold tabular-nums" style={{ color: C.green }}>{row.completed}</span>
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <span className="font-bold tabular-nums" style={{ color: C.blue }}>{row.inProgress}</span>
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <span className="font-bold tabular-nums" style={{ color: row.delayed > 0 ? C.red : C.slate }}>
                              {row.delayed}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-center font-medium tabular-nums text-slate-600">
                            {row.hours > 0 ? `${row.hours}h` : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {row.efficiency !== null ? (
                              <span
                                className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold"
                                style={{
                                  background: `${row.efficiency >= 90 ? C.green : row.efficiency >= 70 ? C.amber : C.red}18`,
                                  color: row.efficiency >= 90 ? C.green : row.efficiency >= 70 ? C.amber : C.red,
                                }}
                              >
                                {row.efficiency}%
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          {/* ══ BLOCO 8 — MÓDULOS ═══════════════════════════════════════════════ */}
          <section>
            <SectionHeader icon={Layers} label="Módulos (Áreas WBS)" sub="Progresso, atrasos e orçamento por módulo do projeto" accentColor={C.indigo} />
            {moduleCards.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm py-12 flex flex-col items-center text-slate-400 gap-2">
                <Layers className="w-8 h-8 opacity-40" />
                <span className="text-xs">Nenhum módulo WBS configurado</span>
              </div>
            ) : (
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
                {moduleCards.map((m) => {
                  const color = m.color ?? C.indigo
                  return (
                    <div
                      key={m.id}
                      className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: color }} />
                        <span className="text-xs font-bold text-slate-700 truncate flex-1">{m.name}</span>
                        {m.delayed > 0 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-50 text-red-600">
                            {m.delayed} atraso{m.delayed !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      <div className="mb-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-slate-500">Progresso</span>
                          <span className="text-[10px] font-bold tabular-nums" style={{ color }}>{m.progress}%</span>
                        </div>
                        <ProgressBar value={m.progress} color={color} height={6} />
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-3">
                        <div className="text-center">
                          <p className="text-[10px] text-slate-400">Tarefas</p>
                          <p className="text-xs font-bold tabular-nums text-slate-700">{m.done}/{m.total}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] text-slate-400">Orçado</p>
                          <p className="text-xs font-bold tabular-nums text-slate-700">{currency(m.budget || null)}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] text-slate-400">Real</p>
                          <p className="text-xs font-bold tabular-nums" style={{ color: m.actual > m.budget && m.budget > 0 ? C.red : C.slate }}>
                            {currency(m.actual || null)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* ══ BLOCO 9 — LINHA DO TEMPO (Gantt) ════════════════════════════════ */}
          <section>
            <SectionHeader icon={Calendar} label="Linha do Tempo" sub="Barras de cronograma planejado e realizado por atividade (até 20 tarefas)" accentColor={C.sky} />
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              {ganttData.length === 0 ? (
                <div className="py-12 flex flex-col items-center text-slate-400 gap-2">
                  <Calendar className="w-8 h-8 opacity-40" />
                  <span className="text-xs">Selecione um projeto com tarefas datadas para ver a linha do tempo</span>
                </div>
              ) : (
                <>
                  <div className="flex gap-4 mb-4 text-[10px] font-semibold text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-sm" style={{ background: C.blue }} /> Planejado
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-sm" style={{ background: C.green }} /> Realizado no prazo
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-sm" style={{ background: C.red }} /> Realizado / Atrasado
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <div style={{ minWidth: 640 }}>
                      {ganttData.map((t) => {
                        const minVal = Math.min(t.planned[0], t.actual?.[0] ?? t.planned[0])
                        const maxVal = Math.max(t.planned[1], t.actual?.[1] ?? t.planned[1])
                        const range  = maxVal - minVal || 1

                        const pLeft  = ((t.planned[0] - minVal) / range) * 100
                        const pWidth = ((t.planned[1] - t.planned[0]) / range) * 100
                        const aLeft  = t.actual ? ((t.actual[0] - minVal) / range) * 100 : null
                        const aWidth = t.actual ? ((t.actual[1] - t.actual[0]) / range) * 100 : null

                        return (
                          <div key={t.name} className="flex items-center gap-3 mb-2 group">
                            <div className="w-44 shrink-0 text-[10px] text-slate-600 font-medium truncate text-right" title={t.fullName}>
                              {t.name}
                            </div>
                            <div className="flex-1 relative" style={{ height: 24 }}>
                              {/* Planned bar */}
                              <div
                                className="absolute top-0 h-2.5 rounded-full opacity-40"
                                style={{ left: `${pLeft}%`, width: `${pWidth}%`, background: C.blue, top: 6 }}
                              />
                              {/* Actual bar */}
                              {aLeft !== null && aWidth !== null && (
                                <div
                                  className="absolute h-2.5 rounded-full"
                                  style={{
                                    left: `${aLeft}%`,
                                    width: `${Math.max(aWidth, 1)}%`,
                                    background: t.delayed ? C.red : C.green,
                                    top: 6,
                                  }}
                                />
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-3">
                    Exibindo até 20 atividades. Use o filtro de projeto para ver tarefas específicas.
                  </p>
                </>
              )}
            </div>
          </section>

          {/* ══ BLOCO 10 — ALERTAS ══════════════════════════════════════════════ */}
          <section>
            <SectionHeader icon={AlertTriangle} label="Alertas" sub="Situações que requerem atenção no portfólio atual" accentColor={C.red} />
            <div className="space-y-2">
              {alerts.map((a, i) => (
                <AlertCard key={i} level={a.level} message={a.message} />
              ))}
            </div>
          </section>

          {/* ══ BLOCO 11 — EVM ══════════════════════════════════════════════════ */}
          <section>
            <SectionHeader icon={Target} label="EVM — Earned Value Management" sub="Indicadores de valor agregado por projeto" accentColor={C.purple} />

            {/* EVM Legend */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-5 py-3 mb-4 flex flex-wrap gap-x-6 gap-y-1 text-[10px] text-indigo-700">
              {[
                ["BAC", "Budget at Completion — custo total orçado"],
                ["EV",  "Earned Value — valor do trabalho concluído"],
                ["PV",  "Planned Value — valor que deveria estar concluído"],
                ["AC",  "Actual Cost — custo real incorrido"],
                ["SPI", "Schedule Performance Index = EV / PV"],
                ["CPI", "Cost Performance Index = EV / AC"],
                ["EAC", "Estimate at Completion = BAC / CPI"],
                ["VAC", "Variance at Completion = BAC − EAC"],
              ].map(([acr, def]) => (
                <span key={acr}>
                  <strong>{acr}</strong> — {def}
                </span>
              ))}
            </div>

            {evmData.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm py-12 flex flex-col items-center text-slate-400 gap-2">
                <Target className="w-8 h-8 opacity-40" />
                <span className="text-xs">Nenhum projeto com dados EVM disponíveis</span>
              </div>
            ) : (
              <div className="space-y-4">
                {evmData.map((e) => (
                  <div key={e.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Award className="w-4 h-4 text-purple-400" />
                      <span className="text-xs font-bold text-slate-800">{e.title}</span>
                    </div>
                    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(145px, 1fr))" }}>
                      {[
                        { acr: "BAC", label: "Budget at Completion", value: currency(e.BAC), color: C.blue,   ok: true },
                        { acr: "EV",  label: "Earned Value",         value: currency(e.EV),  color: C.green,  ok: true },
                        { acr: "PV",  label: "Planned Value",        value: currency(e.PV),  color: C.cyan,   ok: true },
                        { acr: "AC",  label: "Actual Cost",          value: currency(e.AC),  color: C.purple, ok: true },
                        { acr: "SV",  label: "Schedule Variance",    value: currency(e.SV),  color: e.SV >= 0 ? C.green : C.red, ok: e.SV >= 0 },
                        { acr: "CV",  label: "Cost Variance",        value: currency(e.CV),  color: e.CV >= 0 ? C.green : C.red, ok: e.CV >= 0 },
                        { acr: "SPI", label: "Sched. Performance",   value: e.SPI !== null ? e.SPI.toFixed(2) : "N/D", color: e.SPI !== null ? (e.SPI >= 0.9 ? C.green : e.SPI >= 0.75 ? C.amber : C.red) : C.slate, ok: e.SPI !== null && e.SPI >= 0.9 },
                        { acr: "CPI", label: "Cost Performance",     value: e.CPI !== null ? e.CPI.toFixed(2) : "N/D", color: e.CPI !== null ? (e.CPI >= 0.9 ? C.green : e.CPI >= 0.75 ? C.amber : C.red) : C.slate, ok: e.CPI !== null && e.CPI >= 0.9 },
                        { acr: "EAC", label: "Estimate at Completion", value: currency(e.EAC), color: e.EAC <= e.BAC ? C.green : C.red, ok: e.EAC <= e.BAC },
                        { acr: "ETC", label: "Estimate to Complete",  value: currency(e.ETC), color: C.slate,  ok: true },
                        { acr: "VAC", label: "Variance at Completion", value: currency(e.VAC), color: e.VAC >= 0 ? C.green : C.red, ok: e.VAC >= 0 },
                      ].map((kpi) => (
                        <div
                          key={kpi.acr}
                          className="rounded-xl border p-3 flex flex-col gap-1"
                          style={{ borderColor: `${kpi.color}30`, background: `${kpi.color}08` }}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-black" style={{ color: kpi.color }}>{kpi.acr}</span>
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ background: kpi.ok ? C.green : C.red }}
                            />
                          </div>
                          <span className="text-[10px] text-slate-400 leading-tight">{kpi.label}</span>
                          <span
                            className="text-sm font-black tabular-nums leading-tight"
                            style={{ color: kpi.color, fontVariantNumeric: "tabular-nums" }}
                          >
                            {kpi.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ══ ALOCAÇÃO POR PESSOA ══════════════════════════════════════════════ */}
          <section className="pb-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <button
                onClick={() => setAllocOpen((v) => !v)}
                className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-50 transition-colors"
              >
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: "linear-gradient(135deg, #00C4E0, #2463FF, #8B2FFF)" }}
                >
                  <Users className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-black text-slate-800 uppercase tracking-wide">Alocação por Pessoa</span>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Veja todas as atividades de uma pessoa em um período, independente do projeto
                  </p>
                </div>
                <ChevronRight
                  className={`w-4 h-4 text-slate-400 ml-auto shrink-0 transition-transform duration-200 ${allocOpen ? "rotate-90" : ""}`}
                />
              </button>

              <AnimatePresence>
                {allocOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-slate-100 px-5 pb-5 pt-4 space-y-4">
                      <div className="flex flex-wrap gap-3 items-end">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Pessoa</label>
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
                          {allocPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
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
                      {allocResults && <AllocationResults results={allocResults} />}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </section>

        </div>
      </div>
    </div>
  )
}
