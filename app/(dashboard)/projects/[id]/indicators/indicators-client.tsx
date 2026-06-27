"use client"

import { useState, useMemo, useCallback } from "react"
import Link from "next/link"
import { differenceInDays, format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, LineChart, Line, ComposedChart,
} from "recharts"
import {
  ArrowLeft, Sun, Moon, CheckCircle2, Clock, AlertTriangle, TrendingUp, TrendingDown,
  DollarSign, Users, Timer, Calendar, Target, Layers, BarChart3, Zap,
  ChevronRight, X, Filter, RefreshCw, Activity, Award, Flame, Shield,
  ArrowUpRight, ArrowDownRight, Minus, Info, Star, AlertCircle, Bell,
} from "lucide-react"
import type { IndicatorsData, IndicatorsTask, IndicatorsProject, IndicatorsArea } from "@/lib/actions/indicators"

// ─── Types ────────────────────────────────────────────────────────────────────

type Task = IndicatorsTask
type Project = IndicatorsProject
type Area = IndicatorsArea

type DrillDown = { title: string; tasks: Task[] } | null

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; darkBg: string }> = {
  COMPLETED:   { label: "Concluída",     color: "#10B981", bg: "#D1FAE5", darkBg: "#064E3B" },
  IN_PROGRESS: { label: "Em Andamento",  color: "#3B82F6", bg: "#DBEAFE", darkBg: "#1E3A5F" },
  PLANNING:    { label: "A Iniciar",     color: "#94A3B8", bg: "#F1F5F9", darkBg: "#1E293B" },
  INITIATIVE:  { label: "Iniciativa",    color: "#94A3B8", bg: "#F1F5F9", darkBg: "#1E293B" },
  VALIDATION:  { label: "Validação",     color: "#8B5CF6", bg: "#F3E8FF", darkBg: "#3B0764" },
  ON_HOLD:     { label: "Pausada",       color: "#F59E0B", bg: "#FEF3C7", darkBg: "#451A03" },
  DELAYED:     { label: "Atrasada",      color: "#EF4444", bg: "#FEE2E2", darkBg: "#450A0A" },
}

const RISK_CFG: Record<string, { label: string; color: string }> = {
  LOW:      { label: "Baixo",    color: "#10B981" },
  MEDIUM:   { label: "Médio",   color: "#F59E0B" },
  HIGH:     { label: "Alto",    color: "#EF4444" },
  CRITICAL: { label: "Crítico", color: "#7F1D1D" },
}

const AREA_PALETTE = [
  "#7B2FBE","#2463FF","#10B981","#F59E0B","#EF4444","#0891B2","#8B5CF6","#DB2777",
  "#059669","#D97706","#DC2626","#0D9488","#7C3AED","#EA580C","#2563EB","#65A30D",
]

function fmtBRL(v: number): string {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `R$ ${(v / 1_000).toFixed(0)}k`
  return `R$ ${v.toFixed(0)}`
}
function fmtBRLFull(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
}
function fmtH(v: number): string { return `${v.toFixed(0)}h` }
function fmtPct(v: number): string { return `${Math.max(0, Math.min(100, Math.round(v))).toFixed(0)}%` }
function safeDiv(a: number, b: number, fallback = 0): number { return b !== 0 ? a / b : fallback }

function isOverdue(t: Task, today: Date): boolean {
  if (t.status === "COMPLETED" || t.status === "ON_HOLD") return false
  if (t.endDate && new Date(t.endDate) < today && t.progress < 100) return true
  return t.status === "DELAYED"
}

// ─── Computation ──────────────────────────────────────────────────────────────

function computeMetrics(tasks: Task[], project: Project, today: Date) {
  const taskIds = new Set(tasks.map((t) => t.id))

  // Status counts
  const total       = tasks.length
  const completed   = tasks.filter((t) => t.status === "COMPLETED").length
  const inProgress  = tasks.filter((t) => t.status === "IN_PROGRESS").length
  const planning    = tasks.filter((t) => t.status === "PLANNING" || t.status === "INITIATIVE").length
  const onHold      = tasks.filter((t) => t.status === "ON_HOLD").length
  const validation  = tasks.filter((t) => t.status === "VALIDATION").length
  const overdueList = tasks.filter((t) => isOverdue(t, today))
  const overdue     = overdueList.length
  const critical    = tasks.filter((t) => t.riskStatus === "CRITICAL" || t.riskStatus === "HIGH").length

  // Average progress
  const avgProgress = total > 0 ? tasks.reduce((s, t) => s + t.progress, 0) / total : 0

  // Expected progress from timeline
  let expectedProgress = 0
  if (project.expectedStart && project.expectedEnd) {
    const start    = new Date(project.expectedStart)
    const end      = new Date(project.expectedEnd)
    const totalD   = differenceInDays(end, start)
    const elapsed  = differenceInDays(today, start)
    if (totalD > 0) expectedProgress = Math.max(0, Math.min(100, (elapsed / totalD) * 100))
  }
  const progressDelta = avgProgress - expectedProgress

  // Days
  const daysRemaining = project.expectedEnd
    ? differenceInDays(new Date(project.expectedEnd), today)
    : null
  const daysDelayed = daysRemaining !== null && daysRemaining < 0 ? Math.abs(daysRemaining) : 0

  // EVM
  const bac = tasks.reduce((s, t) => s + (t.budgetedCost ?? 0), 0)
  const ac  = tasks.reduce((s, t) => s + (t.actualCost  ?? 0), 0)
  const ev  = tasks.reduce((s, t) => s + (t.budgetedCost ?? 0) * (t.progress / 100), 0)
  let pv = 0
  if (project.expectedStart && project.expectedEnd && bac > 0) {
    const totalD  = differenceInDays(new Date(project.expectedEnd), new Date(project.expectedStart))
    const elapsed = differenceInDays(today, new Date(project.expectedStart))
    if (totalD > 0) pv = bac * Math.max(0, Math.min(1, elapsed / totalD))
  }
  const cpi = ac > 0 ? ev / ac : null
  const spi = pv > 0 ? ev / pv : null
  const sv  = pv > 0 ? ev - pv : null
  const cv  = ac > 0 ? ev - ac : null
  const eac = cpi && cpi > 0 ? bac / cpi : bac
  const etc = eac - ac
  const vac = bac - eac

  // Hours
  const estH  = tasks.reduce((s, t) => s + (t.estimatedEffort ?? 0), 0)
  const realH = tasks.reduce((s, t) => s + (t.actualEffort   ?? 0), 0)
  const remH  = Math.max(0, estH - realH)
  const overH = Math.max(0, realH - estH)

  // Budget project-level
  const projectBudget = project.budget ?? 0
  const budgetDelta   = projectBudget > 0 ? ac - projectBudget : 0

  // Schedule indicators
  const startedEarly    = tasks.filter((t) => t.actualStart && t.startDate && new Date(t.actualStart) < new Date(t.startDate))
  const startedLate     = tasks.filter((t) => t.actualStart && t.startDate && new Date(t.actualStart) > new Date(t.startDate) && t.status !== "PLANNING")
  const completedEarly  = tasks.filter((t) => t.completedAt && t.endDate && new Date(t.completedAt) < new Date(t.endDate))
  const completedLate   = tasks.filter((t) => t.completedAt && t.endDate && new Date(t.completedAt) > new Date(t.endDate))

  // Max delays
  let maxDelay = 0, maxDelaytask = ""
  let maxAdvance = 0, maxAdvanceTask = ""
  overdueList.forEach((t) => {
    if (t.endDate) {
      const d = differenceInDays(today, new Date(t.endDate))
      if (d > maxDelay) { maxDelay = d; maxDelaytask = t.title }
    }
  })
  completedEarly.forEach((t) => {
    if (t.completedAt && t.endDate) {
      const d = differenceInDays(new Date(t.endDate), new Date(t.completedAt))
      if (d > maxAdvance) { maxAdvance = d; maxAdvanceTask = t.title }
    }
  })

  // Broken dependencies
  const brokenDeps = tasks.filter((t) => {
    if (!t.dependencies?.length) return false
    return t.dependencies.some((depId) => {
      const dep = tasks.find((x) => x.id === depId)
      if (!dep) return false
      return dep.status !== "COMPLETED" && t.status === "IN_PROGRESS"
    })
  }).length

  // Average times
  const completedWithDuration = tasks.filter((t) => t.actualStart && t.completedAt)
  const avgTaskDays = completedWithDuration.length > 0
    ? completedWithDuration.reduce((s, t) => s + differenceInDays(new Date(t.completedAt!), new Date(t.actualStart!)), 0) / completedWithDuration.length
    : null

  // By area
  const areaMap: Record<string, Task[]> = {}
  tasks.forEach((t) => {
    const key = t.wbsAreaId ?? "__none__"
    if (!areaMap[key]) areaMap[key] = []
    areaMap[key].push(t)
  })

  const byArea = Object.entries(areaMap).map(([areaId, atasks]) => {
    const name    = atasks[0].wbsAreaName ?? "Sem Área"
    const color   = atasks[0].wbsAreaColor ?? "#94A3B8"
    const done    = atasks.filter((t) => t.status === "COMPLETED").length
    const late    = atasks.filter((t) => isOverdue(t, today)).length
    const prog    = atasks.reduce((s, t) => s + t.progress, 0) / atasks.length
    const budget  = atasks.reduce((s, t) => s + (t.budgetedCost ?? 0), 0)
    const cost    = atasks.reduce((s, t) => s + (t.actualCost ?? 0), 0)
    const esthrs  = atasks.reduce((s, t) => s + (t.estimatedEffort ?? 0), 0)
    const realhrs = atasks.reduce((s, t) => s + (t.actualEffort ?? 0), 0)
    const dates   = atasks.filter((t) => t.startDate).map((t) => new Date(t.startDate!))
    const endDates = atasks.filter((t) => t.endDate).map((t) => new Date(t.endDate!))
    const minStart = dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null
    const maxEnd   = endDates.length ? new Date(Math.max(...endDates.map((d) => d.getTime()))) : null
    return { areaId, name, color, tasks: atasks, total: atasks.length, done, late, progress: prog, budget, cost, estH: esthrs, realH: realhrs, minStart, maxEnd }
  }).sort((a, b) => b.progress - a.progress)

  // By responsible
  const respMap: Record<string, Task[]> = {}
  tasks.forEach((t) => {
    if (!t.responsibleId) return
    if (!respMap[t.responsibleId]) respMap[t.responsibleId] = []
    respMap[t.responsibleId].push(t)
  })

  const byResponsible = Object.entries(respMap).map(([respId, rtasks]) => {
    const name   = rtasks[0].responsibleName ?? "—"
    const done   = rtasks.filter((t) => t.status === "COMPLETED").length
    const late   = rtasks.filter((t) => isOverdue(t, today)).length
    const estH   = rtasks.reduce((s, t) => s + (t.estimatedEffort ?? 0), 0)
    const realH  = rtasks.reduce((s, t) => s + (t.actualEffort   ?? 0), 0)
    const eff    = estH > 0 ? Math.min(100, safeDiv(done, rtasks.length) * 100) : 0
    return { respId, name, tasks: rtasks, total: rtasks.length, done, late, estH, realH, efficiency: eff }
  }).sort((a, b) => b.efficiency - a.efficiency)

  // Top expensive tasks
  const topCostTasks = [...tasks]
    .filter((t) => (t.actualCost ?? 0) > 0)
    .sort((a, b) => (b.actualCost ?? 0) - (a.actualCost ?? 0))
    .slice(0, 10)

  // Health Score
  const spiScore  = spi !== null ? Math.min(100, Math.max(0, spi * 90)) : 50
  const cpiScore  = cpi !== null ? Math.min(100, Math.max(0, cpi * 90)) : 50
  const progScore = Math.min(100, Math.max(0, 50 + progressDelta * 1.5))
  const delayScore = total > 0 ? Math.max(0, 100 - (overdue / total) * 300) : 80
  const hrScore   = estH > 0 ? Math.min(100, safeDiv(estH, Math.max(estH, realH)) * 100) : 50
  const healthScore = Math.round(spiScore * 0.35 + cpiScore * 0.25 + progScore * 0.20 + delayScore * 0.10 + hrScore * 0.10)

  // Alerts
  const alerts: { id: string; severity: "critical"|"high"|"medium"|"low"; title: string; desc: string; tasks?: Task[] }[] = []

  if (bac > 0 && ac > bac * 1.05)
    alerts.push({ id: "budget-over", severity: "critical", title: "Orçamento ultrapassado", desc: `Custo atual ${fmtBRLFull(ac)} supera orçamento de ${fmtBRLFull(bac)} em ${fmtBRLFull(ac - bac)}.` })

  if (daysDelayed > 0 && project.status !== "COMPLETED")
    alerts.push({ id: "sched-over", severity: "critical", title: `Projeto com ${daysDelayed} dias de atraso`, desc: "Data de encerramento planejada já passou." })

  if (spi !== null && spi < 0.80)
    alerts.push({ id: "spi-low", severity: "high", title: `SPI baixo: ${spi.toFixed(2)}`, desc: "Desempenho de prazo abaixo de 80% — cronograma em risco." })

  if (cpi !== null && cpi < 0.85)
    alerts.push({ id: "cpi-low", severity: "high", title: `CPI baixo: ${cpi.toFixed(2)}`, desc: "Desempenho de custo abaixo de 85% — orçamento em risco." })

  const noResp = tasks.filter((t) => !t.responsibleId && t.status !== "COMPLETED" && t.status !== "ON_HOLD")
  if (noResp.length > 0)
    alerts.push({ id: "no-resp", severity: "medium", title: `${noResp.length} atividades sem responsável`, desc: "Atividades em aberto sem responsável designado.", tasks: noResp })

  byResponsible.filter((r) => r.late >= 3).forEach((r) => {
    alerts.push({ id: `overload-${r.respId}`, severity: "medium", title: `${r.name} com ${r.late} atividades atrasadas`, desc: "Possível sobrecarga ou bloqueio na equipe.", tasks: r.tasks.filter((t) => isOverdue(t, today)) })
  })

  byArea.filter((a) => a.progress < 5 && a.minStart && a.minStart < today).forEach((a) => {
    alerts.push({ id: `stalled-${a.areaId}`, severity: "low", title: `Módulo "${a.name}" parado`, desc: `Progresso de ${a.progress.toFixed(0)}% apesar do início planejado.` })
  })

  if (brokenDeps > 0)
    alerts.push({ id: "broken-deps", severity: "medium", title: `${brokenDeps} dependências quebradas`, desc: "Atividades iniciadas com predecessoras ainda em aberto." })

  const criticalOpenTasks = tasks.filter((t) => t.riskStatus === "CRITICAL" && t.status !== "COMPLETED" && !t.responsibleId)
  if (criticalOpenTasks.length > 0)
    alerts.push({ id: "crit-no-resp", severity: "high", title: `${criticalOpenTasks.length} atividades críticas sem responsável`, desc: "Atividades de risco crítico sem responsável designado.", tasks: criticalOpenTasks })

  if (estH > 0 && realH > estH * 1.15)
    alerts.push({ id: "hours-over", severity: "medium", title: `Horas ${((realH / estH - 1) * 100).toFixed(0)}% acima do previsto`, desc: `Realizadas ${fmtH(realH)} vs. estimadas ${fmtH(estH)}.` })

  if (healthScore < 50)
    alerts.push({ id: "health-low", severity: "critical", title: "Saúde do projeto crítica", desc: `Health Score ${healthScore}/100 — intervenção imediata necessária.` })

  // S-curve data (weekly points)
  const sCurve = buildSCurve(tasks, project, today)

  // Gantt data
  const ganttData = byArea
    .filter((a) => a.minStart || a.maxEnd)
    .slice(0, 12)
    .map((a) => ({
      name:     a.name,
      color:    a.color,
      planned:  [a.minStart?.toISOString() ?? null, a.maxEnd?.toISOString() ?? null],
      actual:   [
        a.tasks.filter((t) => t.actualStart).length > 0
          ? new Date(Math.min(...a.tasks.filter((t) => t.actualStart).map((t) => new Date(t.actualStart!).getTime()))).toISOString()
          : null,
        a.tasks.filter((t) => t.actualEnd).length > 0
          ? new Date(Math.max(...a.tasks.filter((t) => t.actualEnd).map((t) => new Date(t.actualEnd!).getTime()))).toISOString()
          : null,
      ],
      progress: a.progress,
    }))

  return {
    total, completed, inProgress, planning, onHold, validation, overdue, critical,
    avgProgress, expectedProgress, progressDelta,
    daysRemaining, daysDelayed,
    bac, ac, ev, pv, cpi, spi, sv, cv, eac, etc, vac,
    estH, realH, remH, overH,
    projectBudget, budgetDelta,
    startedEarly, startedLate, completedEarly, completedLate,
    maxDelay, maxDelaytask, maxAdvance, maxAdvanceTask, brokenDeps, avgTaskDays,
    byArea, byResponsible, topCostTasks,
    overdueList, criticalTaskList: tasks.filter((t) => t.riskStatus === "CRITICAL" || t.riskStatus === "HIGH"),
    healthScore, spiScore, cpiScore, progScore, delayScore, hrScore,
    alerts, sCurve, ganttData,
  }
}

function buildSCurve(tasks: Task[], project: Project, today: Date) {
  if (!project.expectedStart || !project.expectedEnd) return []
  const start = new Date(project.expectedStart)
  const end   = new Date(project.expectedEnd)
  const totalDays = differenceInDays(end, start)
  if (totalDays <= 0) return []
  const step = Math.max(1, Math.ceil(totalDays / 20))
  const pts: { date: string; planned: number; actual: number }[] = []
  for (let d = 0; d <= totalDays; d += step) {
    const date = new Date(start.getTime() + d * 86400000)
    const pct  = Math.min(100, (d / totalDays) * 100)
    let actualPct = 0
    if (date <= today) {
      const doneTasks    = tasks.filter((t) => t.completedAt && new Date(t.completedAt) <= date)
      const partialTasks = tasks.filter((t) => t.actualStart && new Date(t.actualStart) <= date && t.status !== "COMPLETED")
      actualPct = tasks.length > 0
        ? (doneTasks.length + partialTasks.reduce((s, t) => s + t.progress / 100, 0)) / tasks.length * 100
        : 0
    }
    pts.push({ date: format(date, "dd/MM", { locale: ptBR }), planned: +pct.toFixed(1), actual: date <= today ? +actualPct.toFixed(1) : 0 })
  }
  return pts
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function HealthGauge({ score, dark }: { score: number; dark: boolean }) {
  const cx = 90, cy = 88, r = 68
  const START = 225, END = 135

  function coord(deg: number): [number, number] {
    const rad = ((deg - 90) * Math.PI) / 180
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
  }

  const [bx1, by1] = coord(START)
  const [bx2, by2] = coord(END)
  const bgPath = `M ${bx1.toFixed(2)} ${by1.toFixed(2)} A ${r} ${r} 0 1 1 ${bx2.toFixed(2)} ${by2.toFixed(2)}`

  const sEndAngle = START + (score / 100) * 270
  const [sx2, sy2] = coord(sEndAngle)
  const span = (score / 100) * 270
  const scorePath = score > 0.5
    ? `M ${bx1.toFixed(2)} ${by1.toFixed(2)} A ${r} ${r} 0 ${span > 180 ? 1 : 0} 1 ${sx2.toFixed(2)} ${sy2.toFixed(2)}`
    : ""

  const color = score >= 90 ? "#10B981" : score >= 80 ? "#34D399" : score >= 70 ? "#FBBF24" : score >= 50 ? "#F97316" : "#EF4444"
  const label = score >= 90 ? "Excelente" : score >= 80 ? "Saudável" : score >= 70 ? "Atenção" : score >= 50 ? "Risco" : "Crítico"
  const zones = [
    { end: 50,  color: "#EF4444" },
    { end: 70,  color: "#F97316" },
    { end: 80,  color: "#FBBF24" },
    { end: 90,  color: "#34D399" },
    { end: 100, color: "#10B981" },
  ]

  return (
    <svg viewBox="0 0 180 155" className="w-full max-w-[260px] mx-auto select-none">
      {/* Track */}
      <path d={bgPath} fill="none" stroke={dark ? "#334155" : "#E2E8F0"} strokeWidth="14" strokeLinecap="round" />
      {/* Score arc */}
      {scorePath && (
        <path d={scorePath} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${color}60)` }} />
      )}
      {/* Zone ticks */}
      {zones.map((z, i) => {
        const tick = START + (z.end / 100) * 270
        const [tx, ty] = coord(tick)
        const [tx2, ty2] = coord(tick)
        const r2 = r + 10
        const [ox, oy] = [cx + r2 * Math.cos(((tick - 90) * Math.PI) / 180), cy + r2 * Math.sin(((tick - 90) * Math.PI) / 180)]
        return <line key={i} x1={tx.toFixed(1)} y1={ty.toFixed(1)} x2={ox.toFixed(1)} y2={oy.toFixed(1)} stroke={z.color} strokeWidth="2" opacity="0.6" />
      })}
      {/* Center score */}
      <text x={cx} y={cy - 6} textAnchor="middle" style={{ fontSize: 38, fontWeight: 900, fill: dark ? "#F8FAFC" : "#0F172A", fontFamily: "Inter, system-ui, sans-serif" }}>{score}</text>
      <text x={cx} y={cy + 18} textAnchor="middle" style={{ fontSize: 13, fontWeight: 700, fill: color, fontFamily: "Inter, system-ui, sans-serif" }}>{label}</text>
      {/* Zone labels */}
      {[
        { angle: START, label: "0" },
        { angle: START + 135, label: "50" },
        { angle: END, label: "100" },
      ].map(({ angle, label: lbl }, i) => {
        const r3 = r + 22
        const [lx, ly] = [cx + r3 * Math.cos(((angle - 90) * Math.PI) / 180), cy + r3 * Math.sin(((angle - 90) * Math.PI) / 180)]
        return <text key={i} x={lx.toFixed(1)} y={ly.toFixed(1)} textAnchor="middle" dominantBaseline="middle"
          style={{ fontSize: 9, fill: dark ? "#64748B" : "#94A3B8", fontWeight: 600 }}>{lbl}</text>
      })}
    </svg>
  )
}

function Sparkline({ values, color = "#7B2FBE", height = 28 }: { values: number[]; color?: string; height?: number }) {
  if (values.length < 2) return <div style={{ height }} />
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const w = 80, h = height
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * w,
    h - ((v - min) / range) * h * 0.8 - h * 0.1,
  ] as [number, number])
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ")
  const area = `${path} L ${w} ${h} L 0 ${h} Z`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }}>
      <defs>
        <linearGradient id={`sg-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sg-${color.replace("#","")})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function TrendBadge({ value, inverted = false }: { value: number; inverted?: boolean }) {
  const good = inverted ? value < 0 : value >= 0
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus
  const cls = good ? "text-emerald-500" : "text-red-500"
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${cls}`}>
      <Icon className="w-3 h-3" />
      {value !== 0 ? `${Math.abs(value).toFixed(0)}%` : "—"}
    </span>
  )
}

function SectionHeader({ icon: Icon, title, subtitle, color, dark }: { icon: typeof Target; title: string; subtitle?: string; color: string; dark: boolean }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div>
        <h2 className={`text-base font-black ${dark ? "text-white" : "text-slate-900"}`}>{title}</h2>
        {subtitle && <p className={`text-xs ${dark ? "text-slate-400" : "text-slate-500"}`}>{subtitle}</p>}
      </div>
    </div>
  )
}

function Card({ children, className = "", dark, onClick, style }: { children: React.ReactNode; className?: string; dark: boolean; onClick?: () => void; style?: React.CSSProperties }) {
  const base = `rounded-2xl border p-4 ${dark ? "bg-[#1E293B] border-[#334155]" : "bg-white border-slate-200"} ${onClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`
  return <div className={`${base} ${className}`} onClick={onClick} style={style}>{children}</div>
}

// Drill-down modal
function DrillModal({ drill, dark, onClose }: { drill: DrillDown; dark: boolean; onClose: () => void }) {
  if (!drill) return null
  const today = new Date()
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className={`fixed right-0 top-0 bottom-0 z-50 w-full max-w-xl shadow-2xl flex flex-col ${dark ? "bg-[#0F172A] border-l border-[#334155]" : "bg-white border-l border-slate-200"}`}>
        <div className={`flex items-center justify-between px-5 py-4 border-b ${dark ? "border-[#334155]" : "border-slate-200"}`}>
          <div>
            <h3 className={`text-sm font-black ${dark ? "text-white" : "text-slate-900"}`}>{drill.title}</h3>
            <p className={`text-xs ${dark ? "text-slate-400" : "text-slate-500"}`}>{drill.tasks.length} atividades</p>
          </div>
          <button onClick={onClose} className={`p-1.5 rounded-lg transition-colors ${dark ? "text-slate-400 hover:text-white hover:bg-[#334155]" : "text-slate-400 hover:text-slate-900 hover:bg-slate-100"}`}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {drill.tasks.map((t) => {
            const cfg = STATUS_CFG[t.status] ?? STATUS_CFG.PLANNING
            const late = isOverdue(t, today)
            return (
              <div key={t.id} className={`p-3 rounded-xl border ${dark ? "bg-[#1E293B] border-[#334155]" : "bg-slate-50 border-slate-200"}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className={`text-sm font-semibold ${dark ? "text-white" : "text-slate-900"}`}>{t.title}</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: cfg.bg, color: cfg.color }}>
                    {cfg.label}
                  </span>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  {t.responsibleName && (
                    <span className={`text-xs ${dark ? "text-slate-400" : "text-slate-500"}`}>
                      <Users className="w-3 h-3 inline mr-1" />{t.responsibleName}
                    </span>
                  )}
                  {t.endDate && (
                    <span className={`text-xs ${late ? "text-red-500 font-bold" : dark ? "text-slate-400" : "text-slate-500"}`}>
                      <Calendar className="w-3 h-3 inline mr-1" />
                      {format(new Date(t.endDate), "dd/MM/yy")}
                      {late && " ⚠"}
                    </span>
                  )}
                  {t.wbsAreaName && (
                    <span className={`text-xs ${dark ? "text-slate-500" : "text-slate-400"}`}>{t.wbsAreaName}</span>
                  )}
                </div>
                <div className="mt-2">
                  <div className="flex justify-between text-[10px] mb-1">
                    <span className={dark ? "text-slate-400" : "text-slate-500"}>Progresso</span>
                    <span className={`font-bold ${dark ? "text-slate-300" : "text-slate-700"}`}>{t.progress}%</span>
                  </div>
                  <div className={`h-1.5 rounded-full ${dark ? "bg-[#334155]" : "bg-slate-200"}`}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${t.progress}%`, background: late ? "#EF4444" : cfg.color }} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

// Custom recharts tooltip
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, label, dark, formatter }: { active?: boolean; payload?: readonly any[]; label?: string | number; dark: boolean; formatter?: (name: string, value: number) => string }) {
  if (!active || !payload?.length) return null
  return (
    <div className={`px-3 py-2 rounded-xl border shadow-xl text-xs ${dark ? "bg-[#1E293B] border-[#475569] text-white" : "bg-white border-slate-200 text-slate-900"}`}>
      {label !== undefined && label !== "" && <p className={`font-bold mb-1.5 ${dark ? "text-slate-300" : "text-slate-600"}`}>{label}</p>}
      {payload.map((p: { name: string; value: number; color: string }, i: number) => (
        <p key={i} className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
          <span className={dark ? "text-slate-400" : "text-slate-500"}>{p.name}:</span>
          <span className="font-bold">{formatter ? formatter(p.name, p.value) : p.value}</span>
        </p>
      ))}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  data: NonNullable<IndicatorsData>
  projectId: string
}

export function IndicatorsClient({ data, projectId }: Props) {
  const [dark, setDark]           = useState(false)
  const [drill, setDrill]         = useState<DrillDown>(null)
  const [filterArea, setArea]     = useState<string>("all")
  const [filterResp, setResp]     = useState<string>("all")
  const [filterStatus, setFStatus]= useState<string>("all")

  const today = useMemo(() => new Date(), [])

  const filteredTasks = useMemo(() => {
    let list = data.tasks
    if (filterArea !== "all")   list = list.filter((t) => (t.wbsAreaId ?? "__none__") === filterArea)
    if (filterResp !== "all")   list = list.filter((t) => (t.responsibleId ?? "__none__") === filterResp)
    if (filterStatus !== "all") list = list.filter((t) => t.status === filterStatus)
    return list
  }, [data.tasks, filterArea, filterResp, filterStatus])

  const m = useMemo(() => computeMetrics(filteredTasks, data.project, today), [filteredTasks, data.project, today])

  const bg   = dark ? "bg-[#0F172A]"   : "bg-[#F1F5F9]"
  const text  = dark ? "text-white"     : "text-slate-900"
  const sub   = dark ? "text-slate-400" : "text-slate-500"
  const card  = dark ? "bg-[#1E293B] border-[#334155]" : "bg-white border-slate-200"
  const divider = dark ? "border-[#334155]" : "border-slate-200"

  const cChart = {
    grid:  dark ? "#1E293B" : "#F1F5F9",
    tick:  dark ? "#64748B" : "#94A3B8",
    bg:    dark ? "#0F172A" : "#FFFFFF",
  }

  function openDrill(title: string, tasks: Task[]) { setDrill({ title, tasks }) }

  // Donut data
  const donutData = [
    { name: "Concluídas",    value: m.completed,  color: "#10B981" },
    { name: "Em Andamento",  value: m.inProgress, color: "#3B82F6" },
    { name: "A Iniciar",     value: m.planning,   color: "#94A3B8" },
    { name: "Pausadas",      value: m.onHold,     color: "#F59E0B" },
    { name: "Validação",     value: m.validation, color: "#8B5CF6" },
    { name: "Atrasadas",     value: m.overdue,    color: "#EF4444" },
  ].filter((d) => d.value > 0)

  const areaBarData = m.byArea.slice(0, 10).map((a) => ({
    name:      a.name.length > 16 ? a.name.slice(0, 14) + "…" : a.name,
    fullName:  a.name,
    Planejado: +a.progress.toFixed(0),
    Esperado:  +m.expectedProgress.toFixed(0),
  }))

  const costBarData = m.byArea.filter((a) => a.budget > 0 || a.cost > 0).slice(0, 8).map((a) => ({
    name:      a.name.length > 12 ? a.name.slice(0, 10) + "…" : a.name,
    Orçado:    +(a.budget / 1000).toFixed(1),
    Realizado: +(a.cost / 1000).toFixed(1),
  }))

  const respBarData = m.byResponsible.slice(0, 10).map((r) => ({
    name:       r.name.split(" ")[0],
    fullName:   r.name,
    Atividades: r.total,
    Concluídas: r.done,
    Atrasadas:  r.late,
  }))

  const severityColors = { critical: "#EF4444", high: "#F97316", medium: "#F59E0B", low: "#3B82F6" }
  const severityLabels = { critical: "Crítico", high: "Alto", medium: "Médio", low: "Baixo" }

  const uniqueResponsibles = Array.from(
    new Map(data.tasks.filter((t) => t.responsibleId).map((t) => [t.responsibleId, t.responsibleName])).entries()
  )

  return (
    <div className={`flex flex-col min-h-full ${bg} transition-colors duration-300`}>
      {/* ── Sticky header ─────────────────────────────────── */}
      <div className={`sticky top-0 z-30 px-6 py-3 border-b ${dark ? "bg-[#0F172A]/95 border-[#334155]" : "bg-white/95 border-slate-200"} backdrop-blur`}>
        <div className="max-w-[1600px] mx-auto flex items-center gap-3 flex-wrap">
          <Link href={`/projects/${projectId}`} className={`inline-flex items-center gap-1.5 text-sm font-medium shrink-0 ${sub} hover:${text} transition-colors`}>
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Link>
          <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 shrink-0" />
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <BarChart3 className="w-4 h-4 text-violet-500 shrink-0" />
            <span className={`text-sm font-black truncate ${text}`}>{data.project.title}</span>
            {data.project.requestNumber && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: "rgba(123,47,190,0.1)", color: "#7B2FBE" }}>
                VDM-{String(data.project.requestNumber).padStart(4, "0")}
              </span>
            )}
          </div>
          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className={`w-3.5 h-3.5 ${sub} shrink-0`} />
            {[
              { value: filterArea, set: setArea, options: [["all","Todos os módulos"], ...data.areas.map((a) => [a.id, a.name])] },
              { value: filterResp, set: setResp, options: [["all","Todos responsáveis"], ...uniqueResponsibles.map(([id, name]) => [id!, name ?? "—"])] },
              { value: filterStatus, set: setFStatus, options: [["all","Todos os status"], ...Object.entries(STATUS_CFG).map(([k, v]) => [k, v.label])] },
            ].map(({ value, set, options }, i) => (
              <select key={i} value={value} onChange={(e) => set(e.target.value)}
                className={`text-xs font-semibold px-2.5 h-7 rounded-lg border outline-none cursor-pointer transition-colors ${dark ? "bg-[#1E293B] border-[#334155] text-slate-300" : "bg-white border-slate-200 text-slate-600"}`}>
                {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            ))}
            {(filterArea !== "all" || filterResp !== "all" || filterStatus !== "all") && (
              <button onClick={() => { setArea("all"); setResp("all"); setFStatus("all") }}
                className="text-xs font-semibold text-violet-500 hover:text-violet-700 flex items-center gap-1">
                <RefreshCw className="w-3 h-3" /> Limpar
              </button>
            )}
          </div>
          <button onClick={() => setDark((d) => !d)}
            className={`p-1.5 rounded-lg transition-all shrink-0 ${dark ? "bg-[#1E293B] text-yellow-400 hover:bg-[#334155]" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 py-6">
        <div className="max-w-[1600px] mx-auto space-y-8">

          {/* ══════════════════════════════════════════════════════
              BLOCO 1 — RESUMO EXECUTIVO
          ════════════════════════════════════════════════════════ */}
          <section>
            <SectionHeader icon={Activity} title="Resumo Executivo" subtitle="Visão geral calculada do cronograma" color="#7B2FBE" dark={dark} />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">

              {/* % Concluído */}
              <Card dark={dark} className="relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl" style={{ background: "linear-gradient(90deg, #7B2FBE, #2463FF)" }} />
                <p className={`text-[10px] font-black uppercase tracking-widest ${sub} mb-2`}>Progresso Real</p>
                <div className="flex items-end gap-2 mb-1">
                  <span className={`text-3xl font-black ${text}`}>{fmtPct(m.avgProgress)}</span>
                  <TrendBadge value={m.progressDelta} />
                </div>
                <p className={`text-xs ${sub}`}>Esperado: {fmtPct(m.expectedProgress)}</p>
                <div className="mt-2">
                  <div className={`h-1.5 rounded-full ${dark ? "bg-[#334155]" : "bg-slate-100"}`}>
                    <div className="h-full rounded-full" style={{ width: `${m.avgProgress}%`, background: "linear-gradient(90deg, #7B2FBE, #2463FF)" }} />
                  </div>
                </div>
              </Card>

              {/* Atividades */}
              <Card dark={dark}>
                <p className={`text-[10px] font-black uppercase tracking-widest ${sub} mb-3`}>Atividades</p>
                <div className="grid grid-cols-2 gap-y-1.5 gap-x-3">
                  {[
                    { label: "Total",     value: m.total,      color: "#94A3B8" },
                    { label: "Concluídas",value: m.completed,  color: "#10B981" },
                    { label: "Andamento", value: m.inProgress, color: "#3B82F6" },
                    { label: "A Iniciar", value: m.planning,   color: "#94A3B8" },
                    { label: "Atrasadas", value: m.overdue,    color: "#EF4444" },
                    { label: "Críticas",  value: m.critical,   color: "#F97316" },
                  ].map((item) => (
                    <button key={item.label}
                      onClick={() => {
                        const tasks = item.label === "Atrasadas"
                          ? m.overdueList
                          : item.label === "Críticas"
                          ? m.criticalTaskList
                          : filteredTasks.filter((t) =>
                            item.label === "Concluídas" ? t.status === "COMPLETED" :
                            item.label === "Andamento"  ? t.status === "IN_PROGRESS" :
                            item.label === "A Iniciar"  ? t.status === "PLANNING" || t.status === "INITIATIVE" :
                            true
                          )
                        openDrill(item.label, tasks)
                      }}
                      className="flex items-center gap-1.5 group text-left">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: item.color }} />
                      <span className={`text-[10px] ${sub}`}>{item.label}</span>
                      <span className={`text-sm font-black ml-auto ${text} group-hover:text-violet-500 transition-colors`}>{item.value}</span>
                    </button>
                  ))}
                </div>
              </Card>

              {/* Dias */}
              <Card dark={dark}>
                <p className={`text-[10px] font-black uppercase tracking-widest ${sub} mb-2`}>Cronograma</p>
                {m.daysRemaining !== null ? (
                  <>
                    <div className={`text-3xl font-black mb-0.5 ${m.daysRemaining >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {Math.abs(m.daysRemaining)}
                    </div>
                    <p className={`text-xs font-semibold ${m.daysRemaining >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {m.daysRemaining >= 0 ? "dias restantes" : "dias de atraso"}
                    </p>
                    {data.project.expectedEnd && (
                      <p className={`text-xs mt-1 ${sub}`}>Prev.: {format(new Date(data.project.expectedEnd), "dd/MM/yy")}</p>
                    )}
                    {data.project.expectedStart && (
                      <p className={`text-xs ${sub}`}>Início: {format(new Date(data.project.expectedStart), "dd/MM/yy")}</p>
                    )}
                  </>
                ) : (
                  <p className={`text-sm ${sub}`}>Datas não definidas</p>
                )}
              </Card>

              {/* Financeiro */}
              <Card dark={dark}>
                <p className={`text-[10px] font-black uppercase tracking-widest ${sub} mb-2`}>Financeiro</p>
                <div className="space-y-1.5">
                  {[
                    { label: "BAC (Orçamento)", value: m.bac, color: "#7B2FBE" },
                    { label: "Custo Real (AC)", value: m.ac,  color: m.ac > m.bac && m.bac > 0 ? "#EF4444" : "#10B981" },
                    { label: "Valor Agregado",  value: m.ev,  color: "#3B82F6" },
                    { label: "Valor Planejado", value: m.pv,  color: "#F59E0B" },
                  ].filter((item) => item.value > 0).map((item) => (
                    <div key={item.label} className="flex justify-between items-center">
                      <span className={`text-[10px] ${sub}`}>{item.label}</span>
                      <span className="text-xs font-black" style={{ color: item.color }}>{fmtBRL(item.value)}</span>
                    </div>
                  ))}
                  {m.bac > 0 && (
                    <div className="mt-2">
                      <div className={`h-1.5 rounded-full ${dark ? "bg-[#334155]" : "bg-slate-100"}`}>
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (m.ac / m.bac) * 100)}%`, background: m.ac > m.bac ? "#EF4444" : "#10B981" }} />
                      </div>
                      <p className={`text-[10px] mt-0.5 ${sub}`}>{Math.min(100, m.bac > 0 ? Math.round((m.ac / m.bac) * 100) : 0)}% do orçamento utilizado</p>
                    </div>
                  )}
                </div>
              </Card>

              {/* Horas */}
              <Card dark={dark}>
                <p className={`text-[10px] font-black uppercase tracking-widest ${sub} mb-2`}>Horas</p>
                <div className="space-y-1.5">
                  {[
                    { label: "Estimadas",   value: m.estH,  color: "#7B2FBE" },
                    { label: "Realizadas",  value: m.realH, color: m.realH > m.estH && m.estH > 0 ? "#EF4444" : "#10B981" },
                    { label: "Restantes",   value: m.remH,  color: "#3B82F6" },
                    { label: "Extras",      value: m.overH, color: "#F59E0B" },
                  ].filter((item) => item.value > 0).map((item) => (
                    <div key={item.label} className="flex justify-between items-center">
                      <span className={`text-[10px] ${sub}`}>{item.label}</span>
                      <span className="text-xs font-black" style={{ color: item.color }}>{fmtH(item.value)}</span>
                    </div>
                  ))}
                  {m.estH > 0 && (
                    <div className="mt-2">
                      <div className={`h-1.5 rounded-full ${dark ? "bg-[#334155]" : "bg-slate-100"}`}>
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (m.realH / m.estH) * 100)}%`, background: m.realH > m.estH ? "#EF4444" : "#10B981" }} />
                      </div>
                      <p className={`text-[10px] mt-0.5 ${sub}`}>{m.estH > 0 ? Math.round((m.realH / m.estH) * 100) : 0}% das horas utilizadas</p>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </section>

          {/* ══════════════════════════════════════════════════════
              BLOCO 2 — HEALTH SCORE
          ════════════════════════════════════════════════════════ */}
          <section>
            <SectionHeader icon={Activity} title="Saúde do Projeto — Health Score" subtitle="Índice ponderado calculado automaticamente" color="#7B2FBE" dark={dark} />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Gauge */}
              <Card dark={dark} className="flex flex-col items-center py-6">
                <HealthGauge score={m.healthScore} dark={dark} />
                <div className="mt-3 text-center">
                  <p className={`text-xs font-bold ${sub}`}>Índice Geral de Saúde</p>
                  <div className="flex items-center gap-2 justify-center mt-2 flex-wrap">
                    {[
                      ["90–100", "#10B981", "Excelente"],
                      ["80–89",  "#34D399", "Saudável"],
                      ["70–79",  "#FBBF24", "Atenção"],
                      ["50–69",  "#F97316", "Risco"],
                      ["<50",    "#EF4444", "Crítico"],
                    ].map(([range, color, label]) => (
                      <div key={range} className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                        <span className={`text-[10px] font-semibold ${sub}`}>{range}: {label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              {/* Components breakdown */}
              <Card dark={dark} className="lg:col-span-2">
                <p className={`text-xs font-black uppercase tracking-widest ${sub} mb-4`}>Composição do Score</p>
                <div className="space-y-3">
                  {[
                    { label: "Desempenho de Prazo (SPI)", pct: 35, score: Math.round(m.spiScore), color: "#2463FF", detail: m.spi !== null ? `SPI ${m.spi.toFixed(2)}` : "Sem dados" },
                    { label: "Controle de Custos (CPI)",  pct: 25, score: Math.round(m.cpiScore), color: "#7B2FBE", detail: m.cpi !== null ? `CPI ${m.cpi.toFixed(2)}` : "Sem dados" },
                    { label: "Progresso vs. Planejado",  pct: 20, score: Math.round(m.progScore), color: "#10B981", detail: `Real ${fmtPct(m.avgProgress)} / Esp. ${fmtPct(m.expectedProgress)}` },
                    { label: "Atividades Críticas",      pct: 10, score: Math.round(m.delayScore),color: "#F59E0B", detail: `${m.overdue} de ${m.total} atrasadas` },
                    { label: "Eficiência de Horas",      pct: 10, score: Math.round(m.hrScore),   color: "#0891B2", detail: m.estH > 0 ? `${fmtH(m.realH)} / ${fmtH(m.estH)}` : "Sem dados" },
                  ].map((item) => (
                    <div key={item.label}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-semibold flex-1 ${dark ? "text-slate-300" : "text-slate-700"}`}>{item.label}</span>
                        <span className={`text-[10px] font-bold ${sub}`}>{item.pct}%</span>
                        <span className="text-xs font-black" style={{ color: item.color }}>{item.score}/100</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={`flex-1 h-2 rounded-full ${dark ? "bg-[#334155]" : "bg-slate-100"}`}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${item.score}%`, background: item.color }} />
                        </div>
                        <span className={`text-[10px] ${sub} w-28 text-right`}>{item.detail}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className={`mt-4 pt-4 border-t ${divider} flex justify-between items-center`}>
                  <span className={`text-xs font-bold ${sub}`}>Score Final Ponderado</span>
                  <span className="text-xl font-black" style={{ color: m.healthScore >= 90 ? "#10B981" : m.healthScore >= 80 ? "#34D399" : m.healthScore >= 70 ? "#FBBF24" : m.healthScore >= 50 ? "#F97316" : "#EF4444" }}>
                    {m.healthScore} / 100
                  </span>
                </div>
              </Card>
            </div>
          </section>

          {/* ══════════════════════════════════════════════════════
              BLOCO 3 — PROGRESSO
          ════════════════════════════════════════════════════════ */}
          <section>
            <SectionHeader icon={Target} title="Progresso" subtitle="Distribuição de status e avanço por módulo" color="#10B981" dark={dark} />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

              {/* Donut */}
              <Card dark={dark}>
                <p className={`text-xs font-black uppercase tracking-widest ${sub} mb-4`}>Status das Atividades</p>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={donutData} cx="50%" cy="50%" innerRadius="55%" outerRadius="80%"
                      dataKey="value" paddingAngle={3} onClick={(d) => openDrill(d.name ?? "", filteredTasks.filter((t) => {
                        const cfg = STATUS_CFG[t.status] ?? STATUS_CFG.PLANNING
                        return cfg.label === d.name || (d.name === "Atrasadas" && isOverdue(t, today))
                      }))}>
                      {donutData.map((d, i) => <Cell key={i} fill={d.color} strokeWidth={0} />)}
                    </Pie>
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0]
                      return (
                        <div className={`px-3 py-2 rounded-xl border text-xs shadow-xl ${dark ? "bg-[#1E293B] border-[#475569] text-white" : "bg-white border-slate-200 text-slate-900"}`}>
                          <p className="font-bold">{d.name}</p>
                          <p style={{ color: d.payload.color }}>{d.value} atividades ({m.total > 0 ? Math.round((d.value as number / m.total) * 100) : 0}%)</p>
                        </div>
                      )
                    }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 mt-2">
                  {donutData.map((d) => (
                    <button key={d.name} onClick={() => openDrill(d.name, filteredTasks.filter((t) => {
                      if (d.name === "Atrasadas") return isOverdue(t, today)
                      const cfg = STATUS_CFG[t.status] ?? STATUS_CFG.PLANNING
                      return cfg.label === d.name
                    }))} className="w-full flex items-center gap-2 group hover:opacity-80 transition-opacity">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                      <span className={`text-xs flex-1 text-left ${dark ? "text-slate-300" : "text-slate-700"}`}>{d.name}</span>
                      <span className="text-xs font-black" style={{ color: d.color }}>{d.value}</span>
                      <span className={`text-[10px] w-8 text-right ${sub}`}>{m.total > 0 ? Math.round((d.value / m.total) * 100) : 0}%</span>
                      <ChevronRight className={`w-3 h-3 ${sub} opacity-0 group-hover:opacity-100`} />
                    </button>
                  ))}
                </div>
              </Card>

              {/* Progress by module */}
              <Card dark={dark} className="lg:col-span-2">
                <p className={`text-xs font-black uppercase tracking-widest ${sub} mb-4`}>Progresso por Módulo</p>
                {areaBarData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={Math.max(200, areaBarData.length * 32)}>
                    <BarChart data={areaBarData} layout="vertical" margin={{ left: 8, right: 30, top: 0, bottom: 0 }}>
                      <CartesianGrid horizontal={false} stroke={cChart.grid} />
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: cChart.tick }} tickFormatter={(v) => `${v}%`} />
                      <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 10, fill: cChart.tick }} />
                      <Tooltip content={(props) => <ChartTooltip {...props} dark={dark} formatter={(_, v) => `${v}%`} />} />
                      <Bar dataKey="Esperado"  fill={dark ? "#334155" : "#E2E8F0"} radius={4} barSize={8} />
                      <Bar dataKey="Planejado" fill="#7B2FBE" radius={4} barSize={8}
                        label={{ position: "right", fontSize: 10, fill: cChart.tick, formatter: (v: unknown) => `${v}%` }} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className={`flex items-center justify-center h-32 ${sub} text-sm`}>Nenhum módulo encontrado</div>
                )}
              </Card>
            </div>

            {/* S-Curve */}
            {m.sCurve.length > 0 && (
              <Card dark={dark} className="mt-4">
                <p className={`text-xs font-black uppercase tracking-widest ${sub} mb-4`}>Curva S — Evolução do Projeto</p>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={m.sCurve} margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="gPlanned" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#3B82F6" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gActual" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#7B2FBE" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#7B2FBE" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={cChart.grid} vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: cChart.tick }} interval="preserveStartEnd" />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: cChart.tick }} tickFormatter={(v) => `${v}%`} />
                    <Tooltip content={(props) => <ChartTooltip {...props} dark={dark} formatter={(_, v) => `${v}%`} />} />
                    <Area type="monotone" dataKey="planned" name="Planejado" stroke="#3B82F6" strokeWidth={2} fill="url(#gPlanned)" dot={false} />
                    <Area type="monotone" dataKey="actual"  name="Real"      stroke="#7B2FBE" strokeWidth={2} fill="url(#gActual)"  dot={false} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </Card>
            )}
          </section>

          {/* ══════════════════════════════════════════════════════
              BLOCO 4 — CRONOGRAMA
          ════════════════════════════════════════════════════════ */}
          <section>
            <SectionHeader icon={Calendar} title="Indicadores de Cronograma" subtitle="Análise de aderência ao plano" color="#F59E0B" dark={dark} />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {[
                { label: "Atrasadas",                      value: m.overdue,             color: "#EF4444", tasks: m.overdueList, icon: AlertTriangle },
                { label: "Críticas (alto risco)",          value: m.critical,            color: "#F97316", tasks: m.criticalTaskList, icon: Flame },
                { label: "Iniciadas antes do planejado",   value: m.startedEarly.length, color: "#10B981", tasks: m.startedEarly, icon: Zap },
                { label: "Iniciadas após o planejado",     value: m.startedLate.length,  color: "#EF4444", tasks: m.startedLate, icon: AlertCircle },
                { label: "Concluídas antes do prazo",      value: m.completedEarly.length,color:"#10B981", tasks: m.completedEarly, icon: CheckCircle2 },
                { label: "Concluídas após o prazo",        value: m.completedLate.length, color:"#EF4444", tasks: m.completedLate, icon: Clock },
                { label: "Dependências quebradas",         value: m.brokenDeps,          color: "#8B5CF6", tasks: [], icon: Shield },
              ].map((item) => {
                const Icon = item.icon
                return (
                  <Card key={item.label} dark={dark} onClick={item.tasks?.length ? () => openDrill(item.label, item.tasks) : undefined}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${item.color}18` }}>
                        <Icon className="w-3.5 h-3.5" style={{ color: item.color }} />
                      </div>
                      {item.tasks?.length > 0 && <ChevronRight className={`w-3 h-3 ml-auto ${sub}`} />}
                    </div>
                    <p className="text-2xl font-black mb-0.5" style={{ color: item.value > 0 ? item.color : dark ? "#F8FAFC" : "#0F172A" }}>{item.value}</p>
                    <p className={`text-[10px] font-semibold leading-tight ${sub}`}>{item.label}</p>
                  </Card>
                )
              })}
              {m.maxDelay > 0 && (
                <Card dark={dark}>
                  <p className={`text-[10px] font-black uppercase tracking-widest ${sub} mb-2`}>Maior Atraso</p>
                  <p className="text-2xl font-black text-red-500 mb-0.5">{m.maxDelay}d</p>
                  <p className={`text-[10px] ${sub} line-clamp-2`}>{m.maxDelaytask}</p>
                </Card>
              )}
              {m.maxAdvance > 0 && (
                <Card dark={dark}>
                  <p className={`text-[10px] font-black uppercase tracking-widest ${sub} mb-2`}>Maior Adiantamento</p>
                  <p className="text-2xl font-black text-emerald-500 mb-0.5">{m.maxAdvance}d</p>
                  <p className={`text-[10px] ${sub} line-clamp-2`}>{m.maxAdvanceTask}</p>
                </Card>
              )}
              {m.avgTaskDays !== null && (
                <Card dark={dark}>
                  <p className={`text-[10px] font-black uppercase tracking-widest ${sub} mb-2`}>Tempo Médio/Atividade</p>
                  <p className={`text-2xl font-black mb-0.5 ${text}`}>{Math.round(m.avgTaskDays)}d</p>
                  <p className={`text-[10px] ${sub}`}>em atividades concluídas</p>
                </Card>
              )}
            </div>
          </section>

          {/* ══════════════════════════════════════════════════════
              BLOCO 5 — CUSTOS
          ════════════════════════════════════════════════════════ */}
          {(m.bac > 0 || m.ac > 0) && (
            <section>
              <SectionHeader icon={DollarSign} title="Análise de Custos" subtitle="Orçado vs. realizado por módulo" color="#8B5CF6" dark={dark} />
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

                {/* Summary cards */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "BAC",     value: m.bac,     color: "#7B2FBE", desc: "Budget at Completion" },
                    { label: "AC",      value: m.ac,      color: m.ac > m.bac && m.bac > 0 ? "#EF4444" : "#10B981", desc: "Custo Real" },
                    { label: "EV",      value: m.ev,      color: "#3B82F6", desc: "Valor Agregado" },
                    { label: "Desvio",  value: m.cv ?? 0, color: (m.cv ?? 0) < 0 ? "#EF4444" : "#10B981", desc: "Variação de Custo" },
                  ].map((item) => (
                    <Card key={item.label} dark={dark}>
                      <p className={`text-[10px] font-black uppercase ${sub} mb-1`}>{item.label}</p>
                      <p className="text-lg font-black mb-0.5" style={{ color: item.color }}>{fmtBRLFull(item.value)}</p>
                      <p className={`text-[10px] ${sub}`}>{item.desc}</p>
                    </Card>
                  ))}
                </div>

                {/* Bar chart */}
                <Card dark={dark} className="lg:col-span-2">
                  <p className={`text-xs font-black uppercase tracking-widest ${sub} mb-4`}>Custo por Módulo (R$ mil)</p>
                  {costBarData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={costBarData} margin={{ top: 0, right: 16, bottom: 20, left: 0 }}>
                        <CartesianGrid vertical={false} stroke={cChart.grid} />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: cChart.tick }} angle={-30} textAnchor="end" height={45} />
                        <YAxis tick={{ fontSize: 10, fill: cChart.tick }} tickFormatter={(v) => `${v}k`} />
                        <Tooltip content={(props) => <ChartTooltip {...props} dark={dark} formatter={(_, v) => `R$ ${(v as number).toFixed(0)}k`} />} />
                        <Bar dataKey="Orçado"    fill="#7B2FBE" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Realizado" fill="#10B981" radius={[4, 4, 0, 0]} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className={`flex items-center justify-center h-32 text-sm ${sub}`}>Custos não definidos nos módulos</div>
                  )}
                </Card>
              </div>

              {/* Top 10 most expensive */}
              {m.topCostTasks.length > 0 && (
                <Card dark={dark} className="mt-4">
                  <p className={`text-xs font-black uppercase tracking-widest ${sub} mb-3`}>Top atividades por custo real</p>
                  <div className="space-y-2">
                    {m.topCostTasks.slice(0, 5).map((t, i) => {
                      const maxCost = m.topCostTasks[0].actualCost ?? 1
                      const pct = ((t.actualCost ?? 0) / maxCost) * 100
                      return (
                        <div key={t.id} className="flex items-center gap-3">
                          <span className={`text-xs font-black w-4 text-center ${sub}`}>{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-center mb-0.5">
                              <span className={`text-xs font-semibold truncate ${dark ? "text-slate-300" : "text-slate-700"}`}>{t.title}</span>
                              <span className="text-xs font-black text-violet-500 shrink-0 ml-2">{fmtBRLFull(t.actualCost ?? 0)}</span>
                            </div>
                            <div className={`h-1.5 rounded-full ${dark ? "bg-[#334155]" : "bg-slate-100"}`}>
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg, #7B2FBE, #2463FF)" }} />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </Card>
              )}
            </section>
          )}

          {/* ══════════════════════════════════════════════════════
              BLOCO 6 — HORAS
          ════════════════════════════════════════════════════════ */}
          {m.estH > 0 && (
            <section>
              <SectionHeader icon={Timer} title="Indicadores de Horas" subtitle="Planejadas vs. realizadas" color="#0891B2" dark={dark} />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                {[
                  { label: "Previstas",  value: m.estH,  color: "#7B2FBE", icon: Clock },
                  { label: "Realizadas", value: m.realH, color: m.realH > m.estH ? "#EF4444" : "#10B981", icon: CheckCircle2 },
                  { label: "Restantes",  value: m.remH,  color: "#3B82F6", icon: Timer },
                  { label: "Extras",     value: m.overH, color: "#F59E0B", icon: Zap },
                ].map((item) => {
                  const Icon = item.icon
                  return (
                    <Card key={item.label} dark={dark} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${item.color}18` }}>
                        <Icon className="w-4 h-4" style={{ color: item.color }} />
                      </div>
                      <div>
                        <p className="text-xl font-black" style={{ color: item.color }}>{fmtH(item.value)}</p>
                        <p className={`text-[10px] font-semibold ${sub}`}>{item.label}</p>
                      </div>
                    </Card>
                  )
                })}
              </div>

              {/* Hours by responsible */}
              {m.byResponsible.filter((r) => r.estH > 0 || r.realH > 0).length > 0 && (
                <Card dark={dark}>
                  <p className={`text-xs font-black uppercase tracking-widest ${sub} mb-4`}>Horas por Responsável</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={m.byResponsible.filter((r) => r.estH > 0 || r.realH > 0).map((r) => ({
                      name: r.name.split(" ")[0],
                      Estimadas: +r.estH.toFixed(0),
                      Realizadas: +r.realH.toFixed(0),
                    }))} margin={{ top: 0, right: 16, bottom: 20, left: 0 }}>
                      <CartesianGrid vertical={false} stroke={cChart.grid} />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: cChart.tick }} />
                      <YAxis tick={{ fontSize: 10, fill: cChart.tick }} />
                      <Tooltip content={(props) => <ChartTooltip {...props} dark={dark} formatter={(_, v) => `${v}h`} />} />
                      <Bar dataKey="Estimadas"  fill="#7B2FBE" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Realizadas" fill="#10B981" radius={[4, 4, 0, 0]} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              )}
            </section>
          )}

          {/* ══════════════════════════════════════════════════════
              BLOCO 7 — RESPONSÁVEIS
          ════════════════════════════════════════════════════════ */}
          {m.byResponsible.length > 0 && (
            <section>
              <SectionHeader icon={Users} title="Desempenho por Responsável" subtitle="Ranking automático por eficiência" color="#DB2777" dark={dark} />
              <Card dark={dark} className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className={`border-b ${divider}`}>
                      {["#", "Responsável", "Atividades", "Concluídas", "Atrasadas", "Horas Est.", "Horas Reais", "Eficiência"].map((h) => (
                        <th key={h} className={`text-left py-2 px-3 font-black uppercase tracking-wider ${sub}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {m.byResponsible.map((r, i) => {
                      const effColor = r.efficiency >= 80 ? "#10B981" : r.efficiency >= 60 ? "#F59E0B" : "#EF4444"
                      return (
                        <tr key={r.respId} className={`border-b ${divider} ${dark ? "hover:bg-[#334155]" : "hover:bg-slate-50"} transition-colors cursor-pointer`}
                          onClick={() => openDrill(`Atividades de ${r.name}`, r.tasks)}>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1">
                              {i === 0 && <Star className="w-3 h-3 text-yellow-400" />}
                              <span className={`font-bold ${i === 0 ? "text-yellow-400" : sub}`}>{i + 1}</span>
                            </div>
                          </td>
                          <td className={`py-2.5 px-3 font-semibold ${text}`}>{r.name}</td>
                          <td className={`py-2.5 px-3 font-bold ${text}`}>{r.total}</td>
                          <td className="py-2.5 px-3 font-bold text-emerald-500">{r.done}</td>
                          <td className={`py-2.5 px-3 font-bold ${r.late > 0 ? "text-red-500" : sub}`}>{r.late}</td>
                          <td className={`py-2.5 px-3 ${sub}`}>{r.estH > 0 ? fmtH(r.estH) : "—"}</td>
                          <td className={`py-2.5 px-3 ${sub}`}>{r.realH > 0 ? fmtH(r.realH) : "—"}</td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              <div className={`w-16 h-1.5 rounded-full ${dark ? "bg-[#334155]" : "bg-slate-100"}`}>
                                <div className="h-full rounded-full" style={{ width: `${r.efficiency}%`, background: effColor }} />
                              </div>
                              <span className="font-black" style={{ color: effColor }}>{Math.round(r.efficiency)}%</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </Card>
            </section>
          )}

          {/* ══════════════════════════════════════════════════════
              BLOCO 8 — MÓDULOS
          ════════════════════════════════════════════════════════ */}
          {m.byArea.length > 0 && (
            <section>
              <SectionHeader icon={Layers} title="Módulos do Projeto" subtitle="Cards por WBS — clique para detalhar" color="#6366F1" dark={dark} />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {m.byArea.map((area, i) => {
                  const acolor = area.color ?? AREA_PALETTE[i % AREA_PALETTE.length]
                  const progColor = area.progress >= 80 ? "#10B981" : area.progress >= 50 ? "#F59E0B" : "#EF4444"
                  return (
                    <Card key={area.areaId} dark={dark} onClick={() => openDrill(`Módulo: ${area.name}`, area.tasks)}
                      className="border-t-4 cursor-pointer group hover:shadow-lg transition-all" style={{ borderTopColor: acolor }}>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-black ${text} truncate`}>{area.name}</p>
                          <p className={`text-[10px] font-semibold ${sub} mt-0.5`}>{area.total} atividades</p>
                        </div>
                        <ChevronRight className={`w-4 h-4 ${sub} opacity-0 group-hover:opacity-100 transition-opacity shrink-0`} />
                      </div>

                      {/* Progress */}
                      <div className="mb-3">
                        <div className="flex justify-between items-center mb-1">
                          <span className={`text-[10px] ${sub}`}>Progresso</span>
                          <span className="text-sm font-black" style={{ color: progColor }}>{Math.round(area.progress)}%</span>
                        </div>
                        <div className={`h-2 rounded-full ${dark ? "bg-[#334155]" : "bg-slate-100"}`}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${area.progress}%`, background: `linear-gradient(90deg, ${acolor}, ${acolor}99)` }} />
                        </div>
                      </div>

                      {/* Stats grid */}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        <div className="flex justify-between">
                          <span className={`text-[10px] ${sub}`}>Concluídas</span>
                          <span className="text-[10px] font-bold text-emerald-500">{area.done}/{area.total}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className={`text-[10px] ${sub}`}>Atrasadas</span>
                          <span className={`text-[10px] font-bold ${area.late > 0 ? "text-red-500" : "text-emerald-500"}`}>{area.late}</span>
                        </div>
                        {area.budget > 0 && (
                          <div className="flex justify-between">
                            <span className={`text-[10px] ${sub}`}>Orçado</span>
                            <span className={`text-[10px] font-bold ${text}`}>{fmtBRL(area.budget)}</span>
                          </div>
                        )}
                        {area.cost > 0 && (
                          <div className="flex justify-between">
                            <span className={`text-[10px] ${sub}`}>Realizado</span>
                            <span className={`text-[10px] font-bold ${area.cost > area.budget && area.budget > 0 ? "text-red-500" : "text-emerald-500"}`}>{fmtBRL(area.cost)}</span>
                          </div>
                        )}
                        {area.estH > 0 && (
                          <div className="flex justify-between col-span-2">
                            <span className={`text-[10px] ${sub}`}>Horas est./reais</span>
                            <span className={`text-[10px] font-bold ${text}`}>{fmtH(area.estH)} / {fmtH(area.realH)}</span>
                          </div>
                        )}
                      </div>
                    </Card>
                  )
                })}
              </div>
            </section>
          )}

          {/* ══════════════════════════════════════════════════════
              BLOCO 9 — TIMELINE (MINI GANTT)
          ════════════════════════════════════════════════════════ */}
          {m.ganttData.length > 0 && data.project.expectedStart && data.project.expectedEnd && (
            <section>
              <SectionHeader icon={Calendar} title="Linha do Tempo — Mini Gantt" subtitle="Planejado vs. realizado por módulo" color="#F59E0B" dark={dark} />
              <Card dark={dark}>
                {(() => {
                  const projStart = new Date(data.project.expectedStart!)
                  const projEnd   = new Date(data.project.expectedEnd!)
                  const totalSpan = differenceInDays(projEnd, projStart)
                  if (totalSpan <= 0) return <p className={`text-sm ${sub}`}>Datas insuficientes</p>

                  const todayOff = Math.max(0, Math.min(100, (differenceInDays(today, projStart) / totalSpan) * 100))

                  function toOffset(dateStr: string | null): number {
                    if (!dateStr) return 0
                    return Math.max(0, Math.min(100, (differenceInDays(new Date(dateStr), projStart) / totalSpan) * 100))
                  }
                  function toWidth(s: string | null, e: string | null): number {
                    if (!s || !e) return 0
                    return Math.max(0.5, Math.min(100, toOffset(e) - toOffset(s)))
                  }

                  return (
                    <div className="space-y-3">
                      {/* Header: dates */}
                      <div className="flex justify-between text-[10px] font-bold px-32">
                        <span className={sub}>{format(projStart, "dd/MM/yy")}</span>
                        <span className={sub}>{format(projEnd, "dd/MM/yy")}</span>
                      </div>
                      {/* Rows */}
                      {m.ganttData.map((row, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className="w-28 shrink-0 text-right">
                            <span className={`text-[10px] font-semibold ${text} line-clamp-1`}>{row.name}</span>
                          </div>
                          <div className="flex-1 relative h-8">
                            {/* Background track */}
                            <div className={`absolute inset-y-0 w-full rounded-lg ${dark ? "bg-[#334155]" : "bg-slate-100"}`} />
                            {/* Planned bar */}
                            {row.planned[0] && row.planned[1] && (
                              <div className="absolute top-1 h-3 rounded-full opacity-40"
                                style={{ left: `${toOffset(row.planned[0])}%`, width: `${toWidth(row.planned[0], row.planned[1])}%`, background: row.color ?? "#7B2FBE" }} />
                            )}
                            {/* Actual bar */}
                            {row.actual[0] && (
                              <div className="absolute bottom-1 h-3 rounded-full"
                                style={{ left: `${toOffset(row.actual[0])}%`, width: `${Math.max(0.5, toWidth(row.actual[0], row.actual[1] ?? today.toISOString()))}%`, background: row.color ?? "#7B2FBE" }} />
                            )}
                            {/* Progress fill */}
                            {row.planned[0] && row.planned[1] && (
                              <div className="absolute bottom-1 h-3 rounded-full"
                                style={{ left: `${toOffset(row.planned[0])}%`, width: `${toWidth(row.planned[0], row.planned[1]) * row.progress / 100}%`, background: "#10B981", opacity: 0.8 }} />
                            )}
                            {/* Today line */}
                            <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 opacity-80"
                              style={{ left: `${todayOff}%` }}>
                              <div className="w-1 h-1 rounded-full bg-red-500 -translate-x-[1px] -translate-y-[1px]" />
                            </div>
                          </div>
                          <span className="w-8 shrink-0 text-[10px] font-black" style={{ color: row.progress >= 80 ? "#10B981" : row.progress >= 50 ? "#F59E0B" : "#EF4444" }}>
                            {Math.round(row.progress)}%
                          </span>
                        </div>
                      ))}
                      {/* Legend */}
                      <div className="flex items-center gap-4 pt-2 flex-wrap">
                        {[
                          { color: "#7B2FBE", label: "Planejado (opaco)", opacity: 0.4 },
                          { color: "#7B2FBE", label: "Real" },
                          { color: "#10B981", label: "Concluído" },
                          { color: "#EF4444", label: "Hoje" },
                        ].map((l, i) => (
                          <div key={i} className="flex items-center gap-1.5">
                            <div className="w-4 h-2 rounded-full" style={{ background: l.color, opacity: l.opacity ?? 1 }} />
                            <span className={`text-[10px] ${sub}`}>{l.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </Card>
            </section>
          )}

          {/* ══════════════════════════════════════════════════════
              BLOCO 10 — ALERTAS
          ════════════════════════════════════════════════════════ */}
          {m.alerts.length > 0 && (
            <section>
              <SectionHeader icon={Bell} title="Alertas Automáticos" subtitle={`${m.alerts.length} alertas identificados`} color="#EF4444" dark={dark} />
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {m.alerts.map((alert) => {
                  const color = severityColors[alert.severity]
                  const label = severityLabels[alert.severity]
                  return (
                    <div key={alert.id}
                      className={`p-4 rounded-2xl border cursor-pointer hover:shadow-md transition-all ${dark ? "bg-[#1E293B] border-[#334155]" : "bg-white border-slate-200"}`}
                      style={{ borderLeftWidth: 4, borderLeftColor: color }}
                      onClick={() => alert.tasks?.length ? openDrill(alert.title, alert.tasks) : undefined}>
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color }} />
                          <span className="text-xs font-black" style={{ color }}>{label}</span>
                        </div>
                        {alert.tasks?.length ? <ChevronRight className={`w-3.5 h-3.5 ${sub} shrink-0`} /> : null}
                      </div>
                      <p className={`text-sm font-bold mb-1 ${text}`}>{alert.title}</p>
                      <p className={`text-xs leading-relaxed ${sub}`}>{alert.desc}</p>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* ══════════════════════════════════════════════════════
              BLOCO 11 — KPIs (EARNED VALUE MANAGEMENT)
          ════════════════════════════════════════════════════════ */}
          <section>
            <SectionHeader icon={TrendingUp} title="KPIs — Earned Value Management" subtitle="Métricas PMBOK calculadas automaticamente" color="#2463FF" dark={dark} />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {[
                { key: "BAC",  value: fmtBRLFull(m.bac),  color: "#7B2FBE", desc: "Budget at Completion — orçamento total do projeto" },
                { key: "EV",   value: fmtBRLFull(m.ev),   color: "#3B82F6", desc: "Earned Value — valor do trabalho efetivamente realizado" },
                { key: "PV",   value: fmtBRLFull(m.pv),   color: "#F59E0B", desc: "Planned Value — valor que deveria ter sido realizado até hoje" },
                { key: "AC",   value: fmtBRLFull(m.ac),   color: m.ac > m.bac && m.bac > 0 ? "#EF4444" : "#10B981", desc: "Actual Cost — custo real acumulado até hoje" },
                { key: "CPI",  value: m.cpi !== null ? m.cpi.toFixed(2) : "N/A", color: m.cpi === null ? "#94A3B8" : m.cpi >= 1 ? "#10B981" : m.cpi >= 0.85 ? "#F59E0B" : "#EF4444", desc: "Cost Performance Index = EV÷AC. >1: economia; <1: estouro" },
                { key: "SPI",  value: m.spi !== null ? m.spi.toFixed(2) : "N/A", color: m.spi === null ? "#94A3B8" : m.spi >= 1 ? "#10B981" : m.spi >= 0.85 ? "#F59E0B" : "#EF4444", desc: "Schedule Performance Index = EV÷PV. >1: adiantado; <1: atrasado" },
                { key: "CV",   value: m.cv !== null ? fmtBRLFull(m.cv) : "N/A", color: m.cv === null ? "#94A3B8" : (m.cv ?? 0) >= 0 ? "#10B981" : "#EF4444", desc: "Cost Variance = EV−AC. Positivo: economia; negativo: estouro" },
                { key: "SV",   value: m.sv !== null ? fmtBRLFull(m.sv) : "N/A", color: m.sv === null ? "#94A3B8" : (m.sv ?? 0) >= 0 ? "#10B981" : "#EF4444", desc: "Schedule Variance = EV−PV. Positivo: adiantado; negativo: atrasado" },
                { key: "EAC",  value: fmtBRLFull(m.eac),  color: m.eac > m.bac && m.bac > 0 ? "#EF4444" : "#10B981", desc: "Estimate at Completion = BAC÷CPI — projeção final de custo" },
                { key: "ETC",  value: fmtBRLFull(m.etc),  color: "#0891B2", desc: "Estimate to Complete = EAC−AC — custo restante estimado" },
                { key: "VAC",  value: fmtBRLFull(m.vac),  color: m.vac >= 0 ? "#10B981" : "#EF4444", desc: "Variance at Completion = BAC−EAC — variação ao encerramento" },
                { key: "% Real", value: fmtPct(m.avgProgress),   color: "#7B2FBE", desc: "Percentual concluído — média do progresso de todas as atividades" },
                { key: "% Plan", value: fmtPct(m.expectedProgress), color: "#F59E0B", desc: "Percentual planejado — o quanto deveria estar concluído pelo cronograma" },
                { key: "Δ %",    value: (m.progressDelta >= 0 ? "+" : "") + m.progressDelta.toFixed(1) + "%", color: m.progressDelta >= 0 ? "#10B981" : "#EF4444", desc: "Variação de progresso: Real menos Planejado" },
              ].map((kpi) => (
                <Card key={kpi.key} dark={dark}>
                  <div className="flex items-start justify-between gap-1 mb-2">
                    <span className={`text-[10px] font-black uppercase tracking-widest ${sub}`}>{kpi.key}</span>
                    <button title={kpi.desc} className={`p-0.5 ${sub} hover:text-violet-500 transition-colors shrink-0`} onClick={(e) => { e.preventDefault() }}>
                      <Info className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="text-lg font-black leading-tight" style={{ color: kpi.color }}>{kpi.value}</p>
                  <p className={`text-[10px] mt-1 leading-snug ${sub}`}>{kpi.desc}</p>
                </Card>
              ))}
            </div>
          </section>

          {/* Footer */}
          <div className={`text-center py-6 border-t ${divider}`}>
            <p className={`text-xs ${sub}`}>
              Indicadores calculados em tempo real a partir do cronograma · {filteredTasks.length} de {data.tasks.length} atividades exibidas
            </p>
          </div>

        </div>
      </div>

      {/* Drill-down modal */}
      <DrillModal drill={drill} dark={dark} onClose={() => setDrill(null)} />
    </div>
  )
}
