"use client"

import { useState, useMemo } from "react"
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from "recharts"
import {
  TrendingUp, Briefcase, Activity, CheckCircle2,
  ListTodo, Clock, AlertTriangle, BarChart3, Gauge,
} from "lucide-react"
import { format, isBefore, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Header } from "@/components/layout/header"
import type { ProjectIndicator, TaskDashData, UserOption } from "./page"

export type { UserOption }

// ─── Color tokens ────────────────────────────────────────────────────────────
const C = {
  blue:   "#2463FF",
  purple: "#7B2FBE",
  green:  "#10B981",
  amber:  "#F59E0B",
  red:    "#EF4444",
  slate:  "#64748B",
  cyan:   "#0891B2",
  orange: "#F97316",
}

const ACTIVE_STATUSES = new Set([
  "IN_PROGRESS", "PILOT", "RAMP_UP", "GO_LIVE", "POST_GOLIVE",
])

// ─── Helpers ─────────────────────────────────────────────────────────────────
function isTaskOverdue(t: TaskDashData, today: Date): boolean {
  if (t.status === "COMPLETED" || t.status === "CANCELLED") return false
  if (t.status === "DELAYED") return true
  if (t.endDate) return isBefore(parseISO(t.endDate), today)
  return false
}

function computeHealthScore(p: ProjectIndicator, today: Date): number {
  const tasks      = p.tasks
  const totalTasks = tasks.length
  const spi        = p.idp ?? 1
  const cpi        = p.idc ?? 1
  const spiScore   = Math.min(1, spi) * 100 * 0.35
  const cpiScore   = Math.min(1, cpi) * 100 * 0.25
  const progressScore =
    p.plannedPct && p.plannedPct > 0
      ? Math.min(1, p.progress / p.plannedPct) * 100 * 0.20
      : 0.5 * 100 * 0.20
  const criticalDelays = tasks.filter((t) => isTaskOverdue(t, today)).length
  const delayScore = (1 - Math.min(1, totalTasks > 0 ? criticalDelays / totalTasks : 0)) * 100 * 0.10
  const estEffort = tasks.reduce((s, t) => s + (t.estimatedEffort ?? 0), 0)
  const actEffort = tasks.reduce((s, t) => s + (t.actualEffort ?? 0), 0)
  const effScore  = actEffort > 0
    ? Math.min(1, estEffort / actEffort) * 100 * 0.10
    : 0.5 * 100 * 0.10
  return Math.round(spiScore + cpiScore + progressScore + delayScore + effScore)
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, color, icon: Icon, accent,
}: {
  label: string
  value: string | number
  color: string
  icon: React.ElementType
  accent?: boolean
}) {
  return (
    <div
      className="rounded-2xl border p-5 flex flex-col gap-3 transition-all hover:shadow-md"
      style={{
        background: accent ? `${color}08` : "#fff",
        borderColor: accent ? `${color}30` : "#E2E8F0",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center"
        style={{ background: `${color}15` }}
      >
        <Icon className="w-4.5 h-4.5" style={{ color }} />
      </div>
      <div>
        <p
          className="text-2xl font-black leading-none tabular-nums"
          style={{ color, fontVariantNumeric: "tabular-nums" }}
        >
          {value}
        </p>
        <p className="text-[11px] text-slate-500 mt-1.5 font-semibold leading-tight">{label}</p>
      </div>
    </div>
  )
}

// ─── Health Gauge ─────────────────────────────────────────────────────────────
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

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: 200, height: 110 }}>
        <PieChart width={200} height={110}>
          <Pie
            data={[{ value: score }, { value: 100 - score }]}
            cx={100} cy={105}
            startAngle={180} endAngle={0}
            innerRadius={68} outerRadius={96}
            dataKey="value" strokeWidth={0}
          >
            <Cell fill={color} />
            <Cell fill="#E2E8F0" />
          </Pie>
        </PieChart>
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-2 pointer-events-none">
          <span className="text-3xl font-black leading-none tabular-nums" style={{ color }}>
            {Math.round(score)}
          </span>
          <span className="text-[11px] font-bold uppercase tracking-wider mt-0.5" style={{ color }}>
            {label}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({
  icon: Icon, label, sub, accentColor = C.purple,
}: {
  icon: React.ElementType
  label: string
  sub?: string
  accentColor?: string
}) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-1 self-stretch rounded-full shrink-0" style={{ background: accentColor, minHeight: 32 }} />
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

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export function AnalyticsClient({
  projects,
  userRole: _userRole,
  userArea: _userArea,
}: {
  projects:  ProjectIndicator[]
  users:     UserOption[]
  userRole:  string
  userArea:  string | null
}) {
  const today = useMemo(() => new Date(), [])
  const [filter, setFilter] = useState<"ACTIVE" | "ALL">("ACTIVE")

  // ── Filtered projects ────────────────────────────────────────────────────────
  const filtered = useMemo(
    () => filter === "ACTIVE" ? projects.filter((p) => ACTIVE_STATUSES.has(p.status)) : projects,
    [projects, filter],
  )

  const allTasks = useMemo(() => filtered.flatMap((p) => p.tasks), [filtered])

  // ── Resumo Executivo ─────────────────────────────────────────────────────────
  const totalProjects     = filtered.length
  const activeProjects    = filtered.filter((p) => ACTIVE_STATUSES.has(p.status)).length
  const completedProjects = filtered.filter((p) => p.status === "COMPLETED").length
  const totalTasks        = allTasks.length
  const completedTasks    = allTasks.filter((t) => t.status === "COMPLETED").length
  const inProgressTasks   = allTasks.filter((t) => t.status === "IN_PROGRESS" || t.status === "VALIDATION").length
  const delayedTasks      = allTasks.filter((t) => isTaskOverdue(t, today)).length

  // ── Health Score ─────────────────────────────────────────────────────────────
  const healthScores = useMemo(
    () => filtered.map((p) => computeHealthScore(p, today)),
    [filtered, today],
  )
  const avgHealth = healthScores.length
    ? Math.round(healthScores.reduce((s, h) => s + h, 0) / healthScores.length)
    : 0

  // ── Task Status Pie ──────────────────────────────────────────────────────────
  const taskPieData = useMemo(() => {
    const completed  = allTasks.filter((t) => t.status === "COMPLETED").length
    const inProgress = allTasks.filter((t) => t.status === "IN_PROGRESS" || t.status === "VALIDATION").length
    const planning   = allTasks.filter((t) => t.status === "PLANNING").length
    const delayed    = allTasks.filter((t) => isTaskOverdue(t, today)).length
    const onHold     = allTasks.filter((t) => t.status === "ON_HOLD").length
    return [
      { name: "Concluídas",    value: completed,  fill: C.green  },
      { name: "Em Andamento",  value: inProgress, fill: C.blue   },
      { name: "Não Iniciadas", value: planning,   fill: "#94A3B8" },
      { name: "Atrasadas",     value: delayed,    fill: C.red    },
      { name: "Pausadas",      value: onHold,     fill: C.amber  },
    ].filter((d) => d.value > 0)
  }, [allTasks, today])

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header />

      <div className="flex-1 overflow-y-auto bg-slate-50">
        <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">

          {/* Page title + filter toggle */}
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-md shrink-0"
                style={{ background: "linear-gradient(135deg, #00C4E0, #2463FF, #8B2FFF)" }}
              >
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-black text-slate-900 leading-tight">Indicadores de Gestão</h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  {today && format(today, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 bg-white rounded-xl border border-slate-200 p-1 shadow-sm">
              {(["ACTIVE", "ALL"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={
                    "px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 " +
                    (filter === f
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-700")
                  }
                >
                  {f === "ACTIVE" ? "Projetos Ativos" : "Todos os Projetos"}
                </button>
              ))}
            </div>
          </div>

          {/* ── RESUMO EXECUTIVO ─────────────────────────────────────────────── */}
          <section>
            <SectionHeader
              icon={Briefcase}
              label="Resumo Executivo"
              sub="Visão consolidada do portfólio"
              accentColor={C.blue}
            />
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))" }}>
              <KpiCard label="Total de Projetos"     value={totalProjects}     color={C.blue}   icon={Briefcase}     accent />
              <KpiCard label="Em Andamento"          value={activeProjects}    color={C.cyan}   icon={Activity} />
              <KpiCard label="Concluídos"            value={completedProjects} color={C.green}  icon={CheckCircle2} />
              <KpiCard label="Total de Atividades"   value={totalTasks}        color={C.slate}  icon={ListTodo} />
              <KpiCard label="Atividades Concluídas" value={completedTasks}    color={C.green}  icon={CheckCircle2}  accent />
              <KpiCard label="Em Andamento"          value={inProgressTasks}   color={C.blue}   icon={Clock} />
              <KpiCard
                label="Atrasadas"
                value={delayedTasks}
                color={delayedTasks > 0 ? C.red : C.green}
                icon={AlertTriangle}
                accent={delayedTasks > 0}
              />
            </div>
          </section>

          {/* ── GRÁFICOS ─────────────────────────────────────────────────────── */}
          <div className="grid gap-5" style={{ gridTemplateColumns: "1fr 1fr" }}>

            {/* Média do Portfólio */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-1 self-stretch rounded-full" style={{ background: C.purple, minHeight: 28 }} />
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${C.purple}18` }}>
                  <Gauge className="w-3.5 h-3.5" style={{ color: C.purple }} />
                </div>
                <div>
                  <p className="text-xs font-black text-slate-800 uppercase tracking-wider">Média do Portfólio</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Índice de saúde consolidado</p>
                </div>
              </div>

              {filtered.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-10 text-slate-400 gap-2">
                  <Gauge className="w-8 h-8 opacity-30" />
                  <span className="text-xs">Sem projetos visíveis</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-center my-2">
                    <HealthGauge score={avgHealth} />
                  </div>
                  <div className="mt-4 space-y-2">
                    {[
                      { range: "90–100", label: "Excelente", color: C.green  },
                      { range: "80–89",  label: "Saudável",  color: C.green  },
                      { range: "70–79",  label: "Atenção",   color: C.amber  },
                      { range: "50–69",  label: "Risco",     color: C.orange },
                      { range: "< 50",   label: "Crítico",   color: C.red    },
                    ].map((b) => (
                      <div key={b.range} className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: b.color }} />
                          <span className="text-slate-400 tabular-nums">{b.range}</span>
                        </div>
                        <span className="font-bold" style={{ color: b.color }}>{b.label}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Status das Tarefas */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-1 self-stretch rounded-full" style={{ background: C.green, minHeight: 28 }} />
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${C.green}18` }}>
                  <BarChart3 className="w-3.5 h-3.5" style={{ color: C.green }} />
                </div>
                <div>
                  <p className="text-xs font-black text-slate-800 uppercase tracking-wider">Status das Tarefas</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Distribuição por situação</p>
                </div>
              </div>

              {taskPieData.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-10 text-slate-400 gap-2">
                  <BarChart3 className="w-8 h-8 opacity-30" />
                  <span className="text-xs">Sem atividades cadastradas</span>
                </div>
              ) : (
                <>
                  <div className="relative flex items-center justify-center">
                    <ResponsiveContainer width="100%" height={190}>
                      <PieChart>
                        <Pie
                          data={taskPieData}
                          cx="50%" cy="50%"
                          innerRadius={58} outerRadius={84}
                          dataKey="value"
                          paddingAngle={2} strokeWidth={0}
                        >
                          {taskPieData.map((entry, i) => (
                            <Cell key={i} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            borderRadius: 10,
                            border: "1px solid #E2E8F0",
                            fontSize: 11,
                            boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute flex flex-col items-center pointer-events-none">
                      <span className="text-2xl font-black text-slate-800 tabular-nums">{totalTasks}</span>
                      <span className="text-[9px] text-slate-400 uppercase tracking-wide font-semibold">atividades</span>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    {taskPieData.map((d) => {
                      const pct = totalTasks > 0 ? Math.round((d.value / totalTasks) * 100) : 0
                      return (
                        <div key={d.name} className="flex items-center gap-2.5">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.fill }} />
                          <span className="flex-1 text-xs text-slate-600 font-medium">{d.name}</span>
                          <span className="text-xs font-black tabular-nums text-slate-800">{d.value}</span>
                          <span
                            className="text-[10px] font-bold tabular-nums w-9 text-right"
                            style={{ color: d.fill }}
                          >
                            {pct}%
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
