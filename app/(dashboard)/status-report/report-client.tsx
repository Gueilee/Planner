"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import Link from "next/link"
import {
  ChevronLeft, ChevronRight, Maximize2, Minimize2,
  Users, Calendar, TrendingUp, AlertTriangle,
  CheckCircle2, Clock, ArrowLeft, ArrowRight, Zap,
  CheckCheck, ListTodo, Play, Search, BarChart3,
  DollarSign, Activity, Target, MapPin, RefreshCw,
} from "lucide-react"

// ─── Types ───────────────────────────────────────────────────────────────────

export type ProjectSlideData = {
  id: string
  title: string
  status: string
  sponsor: string | null
  progress: number
  tasks: {
    total: number; completed: number; inProgress: number; delayed: number; planning: number
    completedTitles: string[]; inProgressTitles: string[]; plannedTitles: string[]
  }
  risks: {
    critical: number; high: number
    items: { level: string; description: string; mitigation: string | null; owner: string | null }[]
  }
  team: number
  members: { name: string; role: string }[]
  daysLeft: number | null
  economy: number | null
  budget: number | null
  lastCheckpoint: {
    date: string; title: string; location: string | null
    highlights: string | null; decisions: string | null; nextSteps: string[]
  } | null
  atRiskTasks: {
    title: string; type: "NOT_STARTED" | "OVERDUE" | "LATE_RUNNING"
    date: string; daysLate: number; responsible: string | null
    startDate: string | null; endDate: string | null
  }[]
  wbsAreas: { name: string; color: string | null; total: number; done: number; pct: number }[]
  dates: { start: string | null; end: string | null; goLive: string | null }
  reportStatus: {
    cost: "GREEN" | "YELLOW" | "RED"; schedule: "GREEN" | "YELLOW" | "RED"
    resources: "GREEN" | "YELLOW" | "RED"; overall: "GREEN" | "YELLOW" | "RED"
    notes: string | null
  }
  idc: number | null; idp: number | null
  timelineProgress: number | null; meetingsCount: number
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  IN_PROGRESS: { label: "Em Andamento", color: "#60A5FA", bg: "rgba(96,165,250,0.15)" },
  PILOT:       { label: "Em Validação", color: "#22D3EE", bg: "rgba(34,211,238,0.15)" },
  RAMP_UP:     { label: "Ramp-Up",      color: "#C084FC", bg: "rgba(192,132,252,0.15)" },
  GO_LIVE:     { label: "GO LIVE",      color: "#34D399", bg: "rgba(52,211,153,0.18)" },
  POST_GOLIVE: { label: "Pós GO LIVE",  color: "#67E8F9", bg: "rgba(103,232,249,0.15)" },
}

const slideVariants = {
  enter: (dir: number) => ({ opacity: 0, x: dir > 0 ? 70 : -70, scale: 0.98 }),
  center: { opacity: 1, x: 0, scale: 1, transition: { duration: 0.48, ease: "easeOut" as const } },
  exit: (dir: number) => ({ opacity: 0, x: dir > 0 ? -70 : 70, scale: 0.98, transition: { duration: 0.30, ease: "easeIn" as const } }),
}

// ─── CSS Keyframes ────────────────────────────────────────────────────────────

const KEYFRAMES = `
  @keyframes shimmerSlide {
    0%   { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }
  @keyframes pulseGlow {
    0%, 100% { opacity: 0.6; }
    50%       { opacity: 1.0; }
  }
  @keyframes floatUp {
    0%   { opacity: 0; transform: translateY(0) scale(1); }
    10%  { opacity: 0.7; }
    90%  { opacity: 0.3; }
    100% { opacity: 0; transform: translateY(-90px) scale(0.5); }
  }
  @keyframes ringGrow {
    0%   { opacity: 0.4; transform: translate(-50%,-50%) scale(0.8); }
    60%  { opacity: 0.1; }
    100% { opacity: 0;   transform: translate(-50%,-50%) scale(1.25); }
  }
  @keyframes logoGlow {
    0%, 100% { box-shadow: 0 0 0 1px rgba(96,165,250,0.35), 0 0 40px rgba(36,99,255,0.25), 0 8px 40px rgba(0,0,0,0.55); }
    50%       { box-shadow: 0 0 0 1px rgba(96,165,250,0.55), 0 0 70px rgba(36,99,255,0.40), 0 8px 50px rgba(0,0,0,0.60); }
  }
  @keyframes gradientShift {
    0%   { background-position: 0% 50%; }
    50%  { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(18px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes scanH {
    0%   { top: -3px; opacity: 0; }
    5%   { opacity: 0.06; }
    95%  { opacity: 0.03; }
    100% { top: 100%; opacity: 0; }
  }
`

// ─── Background ───────────────────────────────────────────────────────────────

function SlideBackground({ accent = "#3B82F6" }: { accent?: string }) {
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ zIndex: 0 }}>
      <style>{KEYFRAMES}</style>

      {/* Base — royal navy, noticeably lighter than before */}
      <div className="absolute inset-0" style={{
        background: "linear-gradient(145deg, #0B1D3A 0%, #0F2550 40%, #152E60 75%, #0C2248 100%)",
      }} />

      {/* Subtle grid */}
      <div className="absolute inset-0" style={{
        backgroundImage: "linear-gradient(rgba(96,165,250,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(96,165,250,0.04) 1px, transparent 1px)",
        backgroundSize: "48px 48px",
      }} />

      {/* Corner glow top-left */}
      <div className="absolute pointer-events-none" style={{
        top: -120, left: -120, width: 480, height: 480, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(36,99,255,0.30) 0%, transparent 68%)",
        filter: "blur(60px)", animation: "pulseGlow 7s ease-in-out infinite",
      }} />

      {/* Corner glow bottom-right */}
      <div className="absolute pointer-events-none" style={{
        bottom: -100, right: -100, width: 420, height: 420, borderRadius: "50%",
        background: `radial-gradient(circle, ${accent}44 0%, transparent 68%)`,
        filter: "blur(55px)", animation: "pulseGlow 9s ease-in-out 3s infinite",
      }} />

      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0" style={{
        height: 3,
        background: "linear-gradient(90deg, transparent 0%, #3B82F6 20%, #8B5CF6 50%, #22D3EE 80%, transparent 100%)",
      }} />

      {/* Subtle scan line */}
      <div className="absolute left-0 right-0" style={{
        height: 2,
        background: "linear-gradient(90deg, transparent, rgba(99,179,255,0.08), transparent)",
        animation: "scanH 18s linear infinite",
        pointerEvents: "none",
      }} />

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0" style={{
        height: 90,
        background: "linear-gradient(to top, rgba(8,18,40,0.55) 0%, transparent 100%)",
      }} />
    </div>
  )
}

// ─── Vendemmia Logo ───────────────────────────────────────────────────────────

function VendemmiaLogo({ size = "md" }: { size?: "sm" | "md" | "lg" | "xl" }) {
  const cfg = {
    sm: { h: 22, w: 110, p: "6px 14px", r: "12px" },
    md: { h: 28, w: 140, p: "8px 20px", r: "14px" },
    lg: { h: 38, w: 190, p: "10px 24px", r: "16px" },
    xl: { h: 60, w: 300, p: "16px 40px", r: "22px" },
  }[size]
  return (
    <div style={{
      background: "rgba(255,255,255,0.96)",
      backdropFilter: "blur(20px)",
      borderRadius: cfg.r,
      padding: cfg.p,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      animation: "logoGlow 4s ease-in-out infinite",
      position: "relative",
    }}>
      <div style={{
        position: "absolute", inset: 0, borderRadius: cfg.r,
        background: "linear-gradient(135deg, rgba(59,130,246,0.08) 0%, rgba(139,92,246,0.06) 100%)",
        pointerEvents: "none",
      }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/vendemmia.png" alt="Vendemmia"
        style={{ height: cfg.h, width: cfg.w, objectFit: "contain", position: "relative" }} />
    </div>
  )
}

// ─── EVM Gauge ───────────────────────────────────────────────────────────────

function EVMGauge({ value, label }: { value: number | null; label: string }) {
  const [anim, setAnim] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setAnim(value ?? 0), 300)
    return () => clearTimeout(t)
  }, [value])

  const MAX = 2.0
  const clamped = Math.min(MAX, Math.max(0, anim))
  const pct = clamped / MAX

  const { color, glow, status } = value === null
    ? { color: "#64748B", glow: "rgba(100,116,139,0.3)", status: "Sem dados" }
    : value >= 1.0
    ? { color: "#10B981", glow: "rgba(16,185,129,0.6)", status: "Dentro do prazo" }
    : value >= 0.85
    ? { color: "#F59E0B", glow: "rgba(245,158,11,0.6)", status: "Atenção" }
    : { color: "#EF4444", glow: "rgba(239,68,68,0.6)", status: "Em risco" }

  const size = 110
  const cx = size / 2, cy = size * 0.66
  const r  = size * 0.38
  const sw = 8
  const half = Math.PI * r
  const fill = pct * half

  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg width={size} height={cy + sw / 2 + 6} viewBox={`0 0 ${size} ${cy + sw / 2 + 6}`}>
        {/* Track */}
        <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 0 ${cx+r} ${cy}`}
          fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={sw} />
        {/* Threshold ticks */}
        {[0.85, 1.0].map((thr) => {
          const a = (180 + (thr / MAX) * 180) * Math.PI / 180
          return <circle key={thr}
            cx={cx + r * Math.cos(a)} cy={cy + r * Math.sin(a)} r={3}
            fill={thr === 1.0 ? "#10B981" : "#F59E0B"} opacity={0.8} />
        })}
        {/* Fill arc */}
        <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 0 ${cx+r} ${cy}`}
          fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round"
          strokeDasharray={`${fill} ${half}`}
          style={{ filter: `drop-shadow(0 0 6px ${glow})`, transition: "stroke-dasharray 1.2s cubic-bezier(0.22,1,0.36,1)" }} />
        {/* Value text */}
        <text x={cx} y={cy - 2} textAnchor="middle" fill={color}
          style={{ fontSize: 17, fontWeight: 800, fontFamily: "Inter,sans-serif", filter: `drop-shadow(0 0 8px ${glow})` }}>
          {value !== null ? value.toFixed(2) : "N/A"}
        </text>
      </svg>
      <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: "rgba(200,220,255,0.60)" }}>{label}</p>
      <span style={{
        fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
        background: `${color}22`, color, border: `1px solid ${color}44`,
      }}>{status}</span>
    </div>
  )
}

// ─── Progress Ring ────────────────────────────────────────────────────────────

function ProgressRing({ value, color = "#3B82F6", size = 100 }: { value: number; color?: string; size?: number }) {
  const [anim, setAnim] = useState(0)
  useEffect(() => { const t = setTimeout(() => setAnim(value), 200); return () => clearTimeout(t) }, [value])
  const r = size * 0.40
  const circ = 2 * Math.PI * r
  const offset = circ - (anim / 100) * circ
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={size * 0.08} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={size * 0.08}
        strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
        style={{ filter: `drop-shadow(0 0 6px ${color}88)`, transition: "stroke-dashoffset 1.2s cubic-bezier(0.22,1,0.36,1)" }} />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        style={{ transform: "rotate(90deg)", transformOrigin: `${size/2}px ${size/2}px`,
          fill: "white", fontSize: size * 0.22, fontWeight: 900, fontFamily: "Inter,sans-serif" }}>
        {anim}%
      </text>
    </svg>
  )
}

// ─── Glass Card ───────────────────────────────────────────────────────────────

function GCard({ children, style, className }: { children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
  return (
    <div className={className} style={{
      background: "rgba(255,255,255,0.06)",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 14,
      backdropFilter: "blur(12px)",
      ...style,
    }}>
      {children}
    </div>
  )
}

// ─── Section Label ────────────────────────────────────────────────────────────

function SLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.16em",
      color: "rgba(148,185,255,0.50)", marginBottom: 8,
    }}>{children}</p>
  )
}

// ─── Traffic Light ────────────────────────────────────────────────────────────

type TLight = "GREEN" | "YELLOW" | "RED"
const LIGHT: Record<TLight, { color: string; glow: string; label: string }> = {
  GREEN:  { color: "#10B981", glow: "rgba(16,185,129,0.70)",  label: "Em Linha"  },
  YELLOW: { color: "#F59E0B", glow: "rgba(245,158,11,0.70)",  label: "Atenção"   },
  RED:    { color: "#EF4444", glow: "rgba(239,68,68,0.70)",   label: "Risco"     },
}
function toLight(v: string | null | undefined): TLight {
  return (v && v in LIGHT) ? v as TLight : "GREEN"
}
function TrafficDot({ light, label }: { light: TLight; label: string }) {
  const c = LIGHT[light]
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: `linear-gradient(135deg, ${c.color}EE, ${c.color}99)`,
        boxShadow: `0 0 16px ${c.glow}, 0 0 32px ${c.glow}60, inset 0 1px 0 rgba(255,255,255,0.35)`,
        border: `1.5px solid ${c.color}80`,
      }} />
      <span style={{ fontSize: 8.5, fontWeight: 700, color: "rgba(200,220,255,0.55)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
    </div>
  )
}

// ─── Floating particles ───────────────────────────────────────────────────────

function Particles({ n = 12 }: { n?: number }) {
  const pts = useMemo(() => Array.from({ length: n }, (_, i) => ({
    left: `${((i * 83.7 + 11) % 100).toFixed(1)}%`,
    top:  `${((i * 61.3 + 17) % 100).toFixed(1)}%`,
    size: 2 + (i % 3),
    dur:  `${6 + (i % 5) * 1.2}s`,
    del:  `${(i % 6) * 0.9}s`,
  })), [n])
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {pts.map((p, i) => (
        <div key={i} style={{
          position: "absolute", left: p.left, top: p.top,
          width: p.size, height: p.size, borderRadius: "50%",
          background: "rgba(148,185,255,0.45)",
          animation: `floatUp ${p.dur} ease-in-out ${p.del} infinite`,
        }} />
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// COVER SLIDE
// ═══════════════════════════════════════════════════════════════════════════════

function CoverSlide({ slides, date, totalMeetings }: { slides: ProjectSlideData[]; date: string; totalMeetings: number }) {
  const count       = slides.length
  const avgProgress = count > 0 ? Math.round(slides.reduce((s, p) => s + p.progress, 0) / count) : 0
  const critRisks   = slides.reduce((s, p) => s + p.risks.critical, 0)
  const highRisks   = slides.reduce((s, p) => s + p.risks.high, 0)
  const totalTasks  = slides.reduce((s, p) => s + p.tasks.total, 0)
  const doneTasks   = slides.reduce((s, p) => s + p.tasks.completed, 0)

  const stats = [
    { icon: Zap,           val: count,            label: count === 1 ? "Projeto Ativo" : "Projetos Ativos",    color: "#60A5FA" },
    { icon: Calendar,      val: totalMeetings,    label: "Reuniões Realizadas",                                color: "#C084FC" },
    { icon: TrendingUp,    val: `${avgProgress}%`, label: "Conclusão Média",                                   color: "#34D399" },
    { icon: CheckCheck,    val: `${doneTasks}/${totalTasks}`, label: "Tarefas Concluídas",                     color: "#22D3EE" },
    {
      icon: AlertTriangle,
      val: critRisks > 0 ? critRisks : highRisks > 0 ? highRisks : "✓",
      label: critRisks > 0 ? "Riscos Críticos" : highRisks > 0 ? "Riscos Altos" : "Sem Riscos Críticos",
      color: critRisks > 0 ? "#FCA5A5" : highRisks > 0 ? "#FCD34D" : "#34D399",
    },
    { icon: Users,         val: slides.reduce((s, p) => s + p.team, 0), label: "Participantes",               color: "#FB923C" },
  ]

  return (
    <div className="relative flex flex-col items-center justify-center h-full select-none overflow-hidden">
      <SlideBackground />
      <Particles n={16} />

      {/* Expanding rings */}
      {[0, 1, 2].map((i) => (
        <div key={i} className="absolute pointer-events-none" style={{
          top: "50%", left: "50%",
          width: 320 + i * 240, height: 320 + i * 240, borderRadius: "50%",
          border: `1px solid rgba(59,130,246,${0.12 - i * 0.03})`,
          animation: `ringGrow ${5 + i * 1.3}s cubic-bezier(0.4,0,0.6,1) ${i * 1.2}s infinite`,
        }} />
      ))}

      <div className="relative z-10 flex flex-col items-center gap-6 text-center w-full px-12 max-w-5xl">

        {/* Logo — centered, XL */}
        <motion.div
          initial={{ opacity: 0, y: -24, scale: 0.90 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.08, duration: 0.70, ease: "easeOut" }}
        >
          <VendemmiaLogo size="xl" />
        </motion.div>

        {/* Chip + Title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.60 }}
          className="space-y-3"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full"
            style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(96,165,250,0.24)" }}>
            <BarChart3 className="w-3 h-3" style={{ color: "rgba(148,185,255,0.65)" }} />
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.20em", textTransform: "uppercase", color: "rgba(148,185,255,0.65)" }}>
              Gestão de Projetos · Portfólio
            </span>
          </div>
          <h1 style={{
            fontSize: "clamp(3rem,5.5vw,4.8rem)", fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.05,
            background: "linear-gradient(135deg, #ffffff 0%, #C7DEFF 45%, rgba(255,255,255,0.65) 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            filter: "drop-shadow(0 0 40px rgba(59,130,246,0.40))",
          }}>
            Status Report
          </h1>
        </motion.div>

        {/* Stats grid — 3 × 2 */}
        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.42, duration: 0.60, ease: "easeOut" }}
          className="w-full grid gap-3"
          style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
        >
          {stats.map(({ icon: Icon, val, label, color }) => (
            <GCard key={label} style={{ padding: "18px 14px", textAlign: "center" }}>
              <div className="flex items-center justify-center mb-2">
                <Icon style={{ width: 16, height: 16, color }} />
              </div>
              <p style={{ fontSize: "2.2rem", fontWeight: 900, color, lineHeight: 1, filter: `drop-shadow(0 0 10px ${color}80)` }}>
                {val}
              </p>
              <p style={{ fontSize: 9.5, fontWeight: 700, marginTop: 6, textTransform: "uppercase", letterSpacing: "0.10em", color: "rgba(180,210,255,0.50)" }}>
                {label}
              </p>
            </GCard>
          ))}
        </motion.div>

        {/* Date + hint */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.65, duration: 0.50 }}
          className="flex flex-col items-center gap-2">
          <p style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(255,255,255,0.28)" }}>
            {date}
          </p>
          <p className="flex items-center gap-2" style={{ fontSize: 11, color: "rgba(148,185,255,0.35)" }}>
            <ChevronRight className="w-3.5 h-3.5" />
            Pressione → ou clique para avançar · F para tela cheia
          </p>
        </motion.div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROJECT SLIDE
// ═══════════════════════════════════════════════════════════════════════════════

function ProjectSlide({ data, index, total }: { data: ProjectSlideData; index: number; total: number }) {
  const status = STATUS_CFG[data.status] ?? { label: data.status, color: "#94A3B8", bg: "rgba(148,163,184,0.12)" }

  const costLight     = toLight(data.reportStatus.cost)
  const scheduleLight = toLight(data.reportStatus.schedule)
  const resourceLight = toLight(data.reportStatus.resources)
  const overallLight  = toLight(data.reportStatus.overall)

  const daysStr = data.daysLeft === null ? null
    : data.daysLeft < 0  ? `${Math.abs(data.daysLeft)}d atrasado`
    : data.daysLeft === 0 ? "Vence hoje"
    : `${data.daysLeft}d restantes`

  const fmt = (d: string | null) => d ? format(new Date(d), "dd/MM/yy") : "—"

  const overallCfg = LIGHT[overallLight]

  return (
    <div className="relative flex flex-col h-full select-none overflow-hidden">
      <SlideBackground accent={status.color} />
      <Particles n={8} />

      {/* ── Header ── */}
      <div className="relative z-10 flex items-start justify-between px-8 pt-6 pb-4 shrink-0">
        <div className="flex-1 min-w-0 pr-6">
          {/* Status + index */}
          <div className="flex items-center gap-2 mb-2">
            <span style={{
              fontSize: 9, fontWeight: 800, padding: "3px 10px", borderRadius: 20,
              background: status.bg, color: status.color, border: `1px solid ${status.color}40`,
              textTransform: "uppercase", letterSpacing: "0.12em",
            }}>{status.label}</span>
            <span style={{ fontSize: 9, color: "rgba(180,210,255,0.35)", fontWeight: 600 }}>
              {index} de {total}
            </span>
          </div>
          <h2 style={{
            fontSize: "clamp(1.4rem,2.8vw,2.2rem)", fontWeight: 900, color: "#ffffff",
            lineHeight: 1.15, letterSpacing: "-0.01em",
            textShadow: "0 2px 20px rgba(0,0,0,0.50)",
          }}>
            {data.title}
          </h2>
          {data.sponsor && (
            <p style={{ fontSize: 11, color: "rgba(180,210,255,0.50)", marginTop: 4, fontWeight: 500 }}>
              Sponsor: {data.sponsor}
            </p>
          )}
        </div>

        {/* Progress ring */}
        <div className="shrink-0 flex flex-col items-center gap-1">
          <ProgressRing value={data.progress} color={status.color} size={88} />
          <p style={{ fontSize: 9, color: "rgba(180,210,255,0.45)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.10em" }}>
            Progresso
          </p>
        </div>
      </div>

      {/* ── Body — 3 columns ── */}
      <div className="relative z-10 flex-1 grid gap-3 px-8 pb-4 min-h-0 overflow-hidden"
        style={{ gridTemplateColumns: "1.1fr 1fr 1fr" }}>

        {/* COL 1 — Semaphore + Tasks */}
        <div className="flex flex-col gap-3 min-h-0 overflow-hidden">

          {/* Semaphore — 4 indicators */}
          <GCard style={{ padding: "14px 16px" }}>
            <SLabel>Semáforo de Saúde</SLabel>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <TrafficDot light={costLight}     label="Custo"     />
              <TrafficDot light={scheduleLight}  label="Prazo"     />
              <TrafficDot light={resourceLight}  label="Recursos"  />
              <TrafficDot light={overallLight}   label="Geral"     />
            </div>
            {data.reportStatus.notes && (
              <p style={{ fontSize: 9, color: "rgba(200,220,255,0.50)", marginTop: 8, lineHeight: 1.5, borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 8 }}>
                {data.reportStatus.notes}
              </p>
            )}
          </GCard>

          {/* Task summary */}
          <GCard style={{ padding: "14px 16px" }}>
            <SLabel>Tarefas ({data.tasks.total})</SLabel>
            <div className="space-y-2">
              {[
                { icon: CheckCheck, label: "Concluídas", val: data.tasks.completed,  color: "#10B981" },
                { icon: Activity,   label: "Em andamento",val: data.tasks.inProgress, color: "#60A5FA" },
                { icon: AlertTriangle, label: "Atrasadas",val: data.tasks.delayed,   color: "#EF4444" },
                { icon: ListTodo,   label: "Planejadas",  val: data.tasks.planning,  color: "#94A3B8" },
              ].map(({ icon: Icon, label, val, color }) => (
                <div key={label} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Icon style={{ width: 10, height: 10, color }} />
                    <span style={{ fontSize: 10, color: "rgba(200,220,255,0.65)", fontWeight: 500 }}>{label}</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 800, color }}>{val}</span>
                </div>
              ))}
            </div>
            {/* Progress bar */}
            {data.tasks.total > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ height: 5, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 3,
                    width: `${Math.round((data.tasks.completed / data.tasks.total) * 100)}%`,
                    background: "linear-gradient(90deg, #10B981, #34D399)",
                    boxShadow: "0 0 8px rgba(16,185,129,0.60)",
                    transition: "width 1.2s ease",
                  }} />
                </div>
              </div>
            )}
          </GCard>

          {/* WBS */}
          {data.wbsAreas.length > 0 && (
            <GCard style={{ padding: "12px 16px", flex: 1, minHeight: 0, overflow: "hidden" }}>
              <SLabel>Áreas do Projeto</SLabel>
              <div className="space-y-2">
                {data.wbsAreas.slice(0, 4).map((a) => (
                  <div key={a.name}>
                    <div className="flex justify-between items-center mb-1">
                      <span style={{ fontSize: 9.5, color: "rgba(200,220,255,0.70)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "70%" }}>
                        {a.name}
                      </span>
                      <span style={{ fontSize: 9.5, fontWeight: 800, color: a.color ?? "#60A5FA" }}>{a.pct}%</span>
                    </div>
                    <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{
                        height: "100%", borderRadius: 2,
                        width: `${a.pct}%`,
                        background: a.color ?? "#60A5FA",
                        boxShadow: `0 0 6px ${a.color ?? "#60A5FA"}80`,
                        transition: "width 1.2s ease",
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </GCard>
          )}
        </div>

        {/* COL 2 — EVM Gauges + Budget + Dates */}
        <div className="flex flex-col gap-3 min-h-0 overflow-hidden">

          {/* IDC + IDP — ALWAYS shown */}
          <GCard style={{ padding: "14px 16px" }}>
            <SLabel>Indicadores EVM</SLabel>
            <div className="flex justify-around items-start">
              <EVMGauge value={data.idc} label="IDC · Custo" />
              <EVMGauge value={data.idp} label="IDP · Prazo" />
            </div>
            {(data.idc === null && data.idp === null) && (
              <p style={{ fontSize: 9, color: "rgba(180,210,255,0.35)", textAlign: "center", marginTop: 6 }}>
                Preencha orçamento e custo real nas tarefas para calcular
              </p>
            )}
            {data.timelineProgress !== null && (
              <p style={{ fontSize: 9.5, color: "rgba(180,210,255,0.50)", textAlign: "center", marginTop: 6, fontWeight: 600 }}>
                {data.timelineProgress}% do prazo decorrido
              </p>
            )}
          </GCard>

          {/* Budget */}
          <GCard style={{ padding: "14px 16px" }}>
            <SLabel>Orçamento</SLabel>
            <div className="space-y-2">
              {[
                { label: "Aprovado",  val: data.budget,  color: "#60A5FA" },
                { label: "Economia",  val: data.economy, color: "#34D399" },
              ].map(({ label, val, color }) => (
                <div key={label} className="flex items-center justify-between">
                  <span style={{ fontSize: 10, color: "rgba(200,220,255,0.55)" }}>{label}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color }}>
                    {val ? (val >= 1e6 ? `R$ ${(val/1e6).toFixed(1)}M` : `R$ ${(val/1e3).toFixed(0)}K`) : "—"}
                  </span>
                </div>
              ))}
            </div>
          </GCard>

          {/* Dates */}
          <GCard style={{ padding: "14px 16px" }}>
            <SLabel>Cronograma</SLabel>
            <div className="space-y-2">
              {[
                { label: "Início",   val: fmt(data.dates.start)  },
                { label: "Término",  val: fmt(data.dates.end)    },
                { label: "Go Live",  val: fmt(data.dates.goLive) },
              ].map(({ label, val }) => (
                <div key={label} className="flex items-center justify-between">
                  <span style={{ fontSize: 10, color: "rgba(200,220,255,0.55)" }}>{label}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: "rgba(220,235,255,0.80)" }}>{val}</span>
                </div>
              ))}
              {daysStr && (
                <div style={{
                  marginTop: 8, padding: "5px 10px", borderRadius: 8, textAlign: "center",
                  background: data.daysLeft !== null && data.daysLeft < 0 ? "rgba(239,68,68,0.15)" : "rgba(59,130,246,0.12)",
                  border: `1px solid ${data.daysLeft !== null && data.daysLeft < 0 ? "rgba(239,68,68,0.30)" : "rgba(96,165,250,0.22)"}`,
                  fontSize: 10, fontWeight: 800,
                  color: data.daysLeft !== null && data.daysLeft < 0 ? "#FCA5A5" : "#93C5FD",
                }}>
                  {daysStr}
                </div>
              )}
            </div>
          </GCard>

          {/* Meetings */}
          <GCard style={{ padding: "14px 16px" }}>
            <SLabel>Reuniões</SLabel>
            <div className="flex items-center gap-3">
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: "linear-gradient(135deg, rgba(192,132,252,0.20), rgba(192,132,252,0.10))",
                border: "1px solid rgba(192,132,252,0.30)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Calendar style={{ width: 18, height: 18, color: "#C084FC" }} />
              </div>
              <div>
                <p style={{ fontSize: "1.6rem", fontWeight: 900, color: "#C084FC", lineHeight: 1, filter: "drop-shadow(0 0 8px rgba(192,132,252,0.60))" }}>
                  {data.meetingsCount}
                </p>
                <p style={{ fontSize: 9, color: "rgba(180,210,255,0.45)", fontWeight: 600 }}>reuniões realizadas</p>
              </div>
            </div>
            {data.lastCheckpoint && (
              <p style={{ fontSize: 9, color: "rgba(180,210,255,0.40)", marginTop: 8, borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 8 }}>
                Último: {format(new Date(data.lastCheckpoint.date), "dd/MM/yy", { locale: ptBR })} — {data.lastCheckpoint.title}
              </p>
            )}
          </GCard>
        </div>

        {/* COL 3 — Team + Risks + Checkpoint */}
        <div className="flex flex-col gap-3 min-h-0 overflow-hidden">

          {/* Team members */}
          <GCard style={{ padding: "14px 16px" }}>
            <SLabel>Equipe ({data.team} participantes)</SLabel>
            <div className="space-y-1.5">
              {data.members.slice(0, 7).map((m, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                    background: `hsl(${(i * 53 + 210) % 360}, 70%, 45%)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 8.5, fontWeight: 800, color: "white",
                  }}>
                    {m.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p style={{ fontSize: 10.5, fontWeight: 600, color: "rgba(220,235,255,0.85)", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {m.name}
                    </p>
                    {m.role && (
                      <p style={{ fontSize: 8.5, color: "rgba(148,185,255,0.45)", lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {m.role}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {data.members.length > 7 && (
                <p style={{ fontSize: 9, color: "rgba(148,185,255,0.40)", fontStyle: "italic" }}>
                  +{data.members.length - 7} participantes
                </p>
              )}
              {data.members.length === 0 && (
                <p style={{ fontSize: 9.5, color: "rgba(148,185,255,0.35)" }}>Sem membros cadastrados</p>
              )}
            </div>
          </GCard>

          {/* Risks */}
          {data.risks.items.length > 0 && (
            <GCard style={{ padding: "14px 16px", flex: 1, minHeight: 0, overflow: "hidden" }}>
              <SLabel>Riscos ({data.risks.items.length})</SLabel>
              <div className="space-y-2">
                {data.risks.items.slice(0, 4).map((r, i) => {
                  const rCfg: Record<string, { color: string; label: string }> = {
                    CRITICAL: { color: "#FCA5A5", label: "Crítico" },
                    HIGH:     { color: "#FCD34D", label: "Alto"    },
                    MEDIUM:   { color: "#86EFAC", label: "Médio"   },
                    LOW:      { color: "#94A3B8", label: "Baixo"   },
                  }
                  const rc = rCfg[r.level] ?? { color: "#94A3B8", label: r.level }
                  return (
                    <div key={i} style={{ borderLeft: `2px solid ${rc.color}`, paddingLeft: 8 }}>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span style={{ fontSize: 8, fontWeight: 800, color: rc.color, textTransform: "uppercase", letterSpacing: "0.08em" }}>{rc.label}</span>
                        {r.owner && <span style={{ fontSize: 8, color: "rgba(180,210,255,0.40)" }}>· {r.owner}</span>}
                      </div>
                      <p style={{ fontSize: 9.5, color: "rgba(200,220,255,0.70)", lineHeight: 1.4 }}>
                        {r.description.length > 70 ? r.description.slice(0, 70) + "…" : r.description}
                      </p>
                    </div>
                  )
                })}
              </div>
            </GCard>
          )}

          {/* At-risk tasks */}
          {data.atRiskTasks.length > 0 && (
            <GCard style={{ padding: "14px 16px" }}>
              <SLabel>Alertas de Prazo ({data.atRiskTasks.length})</SLabel>
              <div className="space-y-2">
                {data.atRiskTasks.slice(0, 3).map((t, i) => {
                  const typeColor = t.type === "OVERDUE" ? "#FCA5A5" : t.type === "NOT_STARTED" ? "#FCD34D" : "#FB923C"
                  const typeLabel = t.type === "OVERDUE" ? "Atrasada" : t.type === "NOT_STARTED" ? "Não iniciada" : "Em atraso"
                  return (
                    <div key={i} style={{ paddingBottom: 6, borderBottom: i < data.atRiskTasks.slice(0,3).length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span style={{ fontSize: 8, fontWeight: 800, color: typeColor }}>{typeLabel}</span>
                        <span style={{ fontSize: 8, color: typeColor, fontWeight: 700 }}>{t.daysLate}d</span>
                      </div>
                      <p style={{ fontSize: 9.5, color: "rgba(200,220,255,0.70)", lineHeight: 1.3 }}>
                        {t.title.length > 55 ? t.title.slice(0, 55) + "…" : t.title}
                      </p>
                      {t.responsible && (
                        <p style={{ fontSize: 8.5, color: "rgba(148,185,255,0.45)", marginTop: 2 }}>{t.responsible}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </GCard>
          )}

          {/* Last checkpoint highlights */}
          {data.lastCheckpoint?.nextSteps && data.lastCheckpoint.nextSteps.length > 0 && (
            <GCard style={{ padding: "14px 16px" }}>
              <SLabel>Próximos Passos</SLabel>
              <div className="space-y-1.5">
                {data.lastCheckpoint.nextSteps.slice(0, 4).map((step, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <ArrowRight style={{ width: 10, height: 10, color: "#60A5FA", flexShrink: 0, marginTop: 2 }} />
                    <p style={{ fontSize: 9.5, color: "rgba(200,220,255,0.70)", lineHeight: 1.4 }}>
                      {step.length > 60 ? step.slice(0, 60) + "…" : step}
                    </p>
                  </div>
                ))}
              </div>
            </GCard>
          )}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUMMARY SLIDE
// ═══════════════════════════════════════════════════════════════════════════════

function SummarySlide({ projects, totalMeetings }: { projects: ProjectSlideData[]; totalMeetings: number }) {
  const avgProgress = projects.length > 0
    ? Math.round(projects.reduce((s, p) => s + p.progress, 0) / projects.length) : 0
  const idcList = projects.map((p) => p.idc).filter((v): v is number => v !== null)
  const idpList = projects.map((p) => p.idp).filter((v): v is number => v !== null)
  const avgIdc  = idcList.length > 0 ? Math.round(idcList.reduce((a, b) => a + b, 0) / idcList.length * 100) / 100 : null
  const avgIdp  = idpList.length > 0 ? Math.round(idpList.reduce((a, b) => a + b, 0) / idpList.length * 100) / 100 : null
  const totalTasks = projects.reduce((s, p) => s + p.tasks.total, 0)
  const doneTasks  = projects.reduce((s, p) => s + p.tasks.completed, 0)
  const critRisks  = projects.reduce((s, p) => s + p.risks.critical, 0)
  const totalMembers = projects.reduce((s, p) => s + p.team, 0)

  const kpis = [
    { label: "Projetos Ativos",    val: String(projects.length),       color: "#60A5FA",  icon: Zap },
    { label: "Reuniões Realizadas", val: String(totalMeetings),         color: "#C084FC",  icon: Calendar },
    { label: "Conclusão Média",    val: `${avgProgress}%`,             color: "#34D399",  icon: TrendingUp },
    { label: "Tarefas Concluídas", val: `${doneTasks}/${totalTasks}`,  color: "#22D3EE",  icon: CheckCheck },
    { label: "IDC Médio",          val: avgIdc !== null ? String(avgIdc) : "N/A",  color: avgIdc !== null ? (avgIdc >= 1 ? "#10B981" : avgIdc >= 0.85 ? "#F59E0B" : "#EF4444") : "#64748B", icon: DollarSign },
    { label: "IDP Médio",          val: avgIdp !== null ? String(avgIdp) : "N/A",  color: avgIdp !== null ? (avgIdp >= 1 ? "#10B981" : avgIdp >= 0.85 ? "#F59E0B" : "#EF4444") : "#64748B", icon: Target },
    { label: "Riscos Críticos",    val: String(critRisks),             color: critRisks > 0 ? "#FCA5A5" : "#10B981", icon: AlertTriangle },
    { label: "Participantes",      val: String(totalMembers),          color: "#FB923C",  icon: Users },
  ]

  return (
    <div className="relative flex flex-col h-full select-none overflow-hidden">
      <SlideBackground />
      <Particles n={10} />

      <div className="relative z-10 flex flex-col h-full px-8 py-6 gap-5">

        {/* Title */}
        <div className="text-center">
          <VendemmiaLogo size="sm" />
          <h2 style={{
            fontSize: "clamp(1.8rem,3.5vw,2.8rem)", fontWeight: 900, color: "#fff", marginTop: 16,
            letterSpacing: "-0.02em",
            background: "linear-gradient(135deg, #fff 0%, #C7DEFF 50%, rgba(255,255,255,0.65) 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            Resumo do Portfólio
          </h2>
        </div>

        {/* KPI grid */}
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          {kpis.map(({ label, val, color, icon: Icon }) => (
            <GCard key={label} style={{ padding: "16px 12px", textAlign: "center" }}>
              <Icon style={{ width: 15, height: 15, color, marginBottom: 6 }} />
              <p style={{ fontSize: "2rem", fontWeight: 900, color, lineHeight: 1, filter: `drop-shadow(0 0 10px ${color}70)` }}>{val}</p>
              <p style={{ fontSize: 8.5, color: "rgba(180,210,255,0.50)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 5 }}>{label}</p>
            </GCard>
          ))}
        </div>

        {/* Project cards grid */}
        <div className="flex-1 grid gap-3 min-h-0 overflow-hidden"
          style={{ gridTemplateColumns: `repeat(${Math.min(projects.length, 3)}, 1fr)` }}>
          {projects.map((p) => {
            const st = STATUS_CFG[p.status] ?? { label: p.status, color: "#94A3B8", bg: "rgba(148,163,184,0.12)" }
            const overall = LIGHT[toLight(p.reportStatus.overall)]
            return (
              <GCard key={p.id} style={{ padding: "14px 16px", overflow: "hidden" }}>
                <div className="flex items-start justify-between mb-2">
                  <span style={{
                    fontSize: 8, fontWeight: 800, padding: "2px 8px", borderRadius: 20,
                    background: st.bg, color: st.color, textTransform: "uppercase", letterSpacing: "0.10em",
                  }}>{st.label}</span>
                  <div style={{
                    width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                    background: overall.color, boxShadow: `0 0 8px ${overall.glow}`,
                  }} />
                </div>
                <p style={{ fontSize: 12, fontWeight: 800, color: "#fff", lineHeight: 1.3, marginBottom: 8, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>
                  {p.title}
                </p>
                {/* mini progress bar */}
                <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, marginBottom: 4 }}>
                  <div style={{
                    height: "100%", borderRadius: 2, width: `${p.progress}%`,
                    background: st.color, boxShadow: `0 0 6px ${st.color}80`, transition: "width 1.2s ease",
                  }} />
                </div>
                <div className="flex justify-between items-center">
                  <span style={{ fontSize: 9, color: "rgba(180,210,255,0.50)" }}>
                    {p.tasks.completed}/{p.tasks.total} tarefas · {p.team} membros
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: st.color }}>{p.progress}%</span>
                </div>
              </GCard>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Nav Dots ─────────────────────────────────────────────────────────────────

function NavDots({ total, current, goto }: { total: number; current: number; goto: (i: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <button key={i} onClick={() => goto(i)} style={{
          width: i === current ? 20 : 6, height: 6, borderRadius: 3,
          transition: "all 0.3s ease",
          background: i === current
            ? "linear-gradient(90deg, #3B82F6, #8B5CF6)"
            : "rgba(255,255,255,0.20)",
          boxShadow: i === current ? "0 0 10px rgba(59,130,246,0.60)" : "none",
          border: "none", cursor: "pointer",
        }} />
      ))}
    </div>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center px-12"
      style={{ background: "linear-gradient(145deg, #0B1D3A, #0F2550)" }}>
      <style>{KEYFRAMES}</style>
      <BarChart3 style={{ width: 56, height: 56, color: "rgba(96,165,250,0.35)" }} />
      <div>
        <h2 style={{ fontSize: "1.8rem", fontWeight: 900, color: "#fff", marginBottom: 8 }}>Nenhum Projeto em Andamento</h2>
        <p style={{ fontSize: 14, color: "rgba(180,210,255,0.50)" }}>
          Projetos com status Em Andamento, Piloto, Ramp-Up, Go Live ou Pós Go Live aparecerão aqui.
        </p>
      </div>
      <Link href="/projects" style={{
        padding: "12px 28px", borderRadius: 12, fontSize: 13, fontWeight: 700, color: "white",
        background: "linear-gradient(135deg, #3B82F6, #8B5CF6)",
        textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8,
      }}>
        <RefreshCw style={{ width: 14, height: 14 }} /> Ver todos os projetos
      </Link>
    </div>
  )
}

// ─── Project Selector ─────────────────────────────────────────────────────────

function ProjectSelector({ slides, onStart }: { slides: ProjectSlideData[]; onStart: (s: ProjectSlideData[]) => void }) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(slides.map((s) => s.id)))
  const [search, setSearch] = useState("")

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return q ? slides.filter((s) => s.title.toLowerCase().includes(q)) : slides
  }, [slides, search])

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next
  })
  const toggleAll = () => setSelected(selected.size === slides.length ? new Set() : new Set(slides.map((s) => s.id)))

  const date = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background: "linear-gradient(145deg, #0B1D3A, #0F2550)" }}>
      <style>{KEYFRAMES}</style>
      {/* Top */}
      <div className="flex items-center justify-between px-8 py-4 shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <VendemmiaLogo size="sm" />
        <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(148,185,255,0.40)" }}>
          Status Report · {date}
        </p>
        <div style={{ width: 110 }} />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-8 py-8" style={{ scrollbarWidth: "none" }}>
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="text-center space-y-2">
            <h1 style={{
              fontSize: "clamp(2rem,4vw,3rem)", fontWeight: 900,
              background: "linear-gradient(135deg, #fff 0%, #C7DEFF 45%, rgba(255,255,255,0.65) 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              filter: "drop-shadow(0 0 25px rgba(59,130,246,0.30))",
            }}>Selecionar Projetos</h1>
            <p style={{ fontSize: 13, color: "rgba(148,185,255,0.45)", fontWeight: 500 }}>
              Escolha quais projetos serão apresentados
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "rgba(148,185,255,0.35)" }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar projeto…" className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl outline-none"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(200,225,255,0.85)" }} />
            </div>
            <button onClick={toggleAll}
              className="px-4 py-2.5 rounded-xl text-xs font-bold tracking-wide transition-all"
              style={{
                background: selected.size === slides.length ? "rgba(59,130,246,0.20)" : "rgba(255,255,255,0.06)",
                border: `1px solid ${selected.size === slides.length ? "rgba(96,165,250,0.40)" : "rgba(255,255,255,0.12)"}`,
                color: selected.size === slides.length ? "#93C5FD" : "rgba(148,185,255,0.55)",
              }}>
              {selected.size === slides.length ? "Limpar" : "Selecionar todos"}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {filtered.map((p) => {
              const isSelected = selected.has(p.id)
              const st = STATUS_CFG[p.status] ?? { label: p.status, color: "#94A3B8", bg: "rgba(148,163,184,0.12)" }
              return (
                <button key={p.id} onClick={() => toggle(p.id)} className="text-left rounded-2xl p-5 transition-all duration-200"
                  style={{
                    background: isSelected ? `linear-gradient(135deg, ${st.color}14, ${st.color}07)` : "rgba(255,255,255,0.04)",
                    border: `1px solid ${isSelected ? st.color + "40" : "rgba(255,255,255,0.09)"}`,
                    boxShadow: isSelected ? `0 0 20px ${st.color}14` : "none",
                  }}>
                  <div className="flex items-start gap-3">
                    <div style={{
                      width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 2,
                      background: isSelected ? st.color : "rgba(255,255,255,0.08)",
                      border: `1.5px solid ${isSelected ? st.color : "rgba(255,255,255,0.20)"}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {isSelected && <CheckCheck style={{ width: 11, height: 11, color: "white" }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p style={{ fontSize: 13, fontWeight: 700, color: "#fff", lineHeight: 1.25, marginBottom: 4 }}>{p.title}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 8px", borderRadius: 20, background: st.bg, color: st.color, textTransform: "uppercase", letterSpacing: "0.10em" }}>
                          {st.label}
                        </span>
                        <span style={{ fontSize: 10, color: "rgba(148,185,255,0.45)" }}>{p.progress}% · {p.team} membros · {p.meetingsCount} reuniões</span>
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Bottom */}
      <div className="shrink-0 px-8 py-5 flex items-center justify-between"
        style={{ background: "rgba(8,20,50,0.95)", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
        <Link href="/projects" className="flex items-center gap-1.5 text-xs font-semibold transition-colors"
          style={{ color: "rgba(148,185,255,0.35)", textDecoration: "none" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(148,185,255,0.70)" }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(148,185,255,0.35)" }}>
          <ArrowLeft className="w-3.5 h-3.5" /> Projetos
        </Link>
        <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(148,185,255,0.45)" }}>
          {selected.size} de {slides.length} selecionado{selected.size !== 1 ? "s" : ""}
        </span>
        <button onClick={() => { const chosen = slides.filter((s) => selected.has(s.id)); if (chosen.length > 0) onStart(chosen) }}
          disabled={selected.size === 0}
          className="flex items-center gap-2 px-7 py-3 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: "linear-gradient(135deg, #2563EB, #7C3AED)",
            boxShadow: selected.size > 0 ? "0 0 28px rgba(59,130,246,0.45), 0 0 55px rgba(124,58,237,0.25)" : "none",
          }}>
          <Play className="w-4 h-4 fill-white" /> Iniciar Apresentação
        </button>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ReportClient({ slides: allSlides, totalMeetings }: { slides: ProjectSlideData[]; totalMeetings: number }) {
  const [started,      setStarted]  = useState(false)
  const [activeSlides, setActive]   = useState<ProjectSlideData[]>(allSlides)
  const [current,      setCurrent]  = useState(0)
  const [dir,          setDir]      = useState(1)
  const [isFullscreen, setIsFs]     = useState(false)
  const [idle,         setIdle]     = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const idleTimer    = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const resetIdle = useCallback(() => {
    setIdle(false)
    clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => setIdle(true), 4500)
  }, [])

  const allList = ["cover" as const, ...activeSlides.map(() => "project" as const), ...(activeSlides.length > 1 ? ["summary" as const] : [])]
  const total   = allList.length

  const go = useCallback((idx: number) => {
    if (idx < 0 || idx >= total) return
    setDir(idx > current ? 1 : -1)
    setCurrent(idx)
    resetIdle()
  }, [current, total, resetIdle])

  const next = useCallback(() => go(current + 1), [current, go])
  const prev = useCallback(() => go(current - 1), [current, go])

  useEffect(() => {
    if (!started) return
    resetIdle()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); next() }
      if (e.key === "ArrowLeft")  { e.preventDefault(); prev() }
      if (e.key.toLowerCase() === "f") toggleFullscreen()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [started, next, prev, resetIdle])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {})
      setIsFs(true)
    } else {
      document.exitFullscreen().catch(() => {})
      setIsFs(false)
    }
  }

  const slideType  = allList[current]
  const projectIdx = current - 1

  const date = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })

  if (allSlides.length === 0) return <EmptyState />

  if (!started) {
    return <ProjectSelector slides={allSlides} onStart={(chosen) => { setActive(chosen); setCurrent(0); setStarted(true) }} />
  }

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-hidden cursor-pointer"
      onClick={(e) => { if ((e.target as HTMLElement).closest("button,a")) return; next() }}
      onMouseMove={resetIdle}
    >
      <AnimatePresence custom={dir} initial={false}>
        <motion.div key={current} custom={dir} variants={slideVariants}
          initial="enter" animate="center" exit="exit"
          className="absolute inset-0"
          style={{ paddingBottom: 64 }}
        >
          {slideType === "cover" && <CoverSlide slides={activeSlides} date={date} totalMeetings={totalMeetings} />}
          {slideType === "project" && projectIdx >= 0 && projectIdx < activeSlides.length && (
            <ProjectSlide data={activeSlides[projectIdx]} index={projectIdx + 1} total={activeSlides.length} />
          )}
          {slideType === "summary" && <SummarySlide projects={activeSlides} totalMeetings={totalMeetings} />}
        </motion.div>
      </AnimatePresence>

      {/* Nav bar */}
      <motion.div
        animate={{ opacity: idle ? 0 : 1, y: idle ? 6 : 0 }}
        transition={{ duration: 0.30 }}
        className="absolute bottom-0 left-0 right-0 h-16 flex items-center justify-between px-8"
        style={{
          background: "linear-gradient(to top, rgba(8,18,50,0.98) 0%, rgba(8,18,50,0.60) 70%, transparent 100%)",
          zIndex: 50, borderTop: "1px solid rgba(255,255,255,0.05)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={() => { setStarted(false); setCurrent(0) }}
          className="flex items-center gap-1.5 text-xs font-semibold transition-all"
          style={{ color: "rgba(148,185,255,0.30)", border: "none", background: "none", cursor: "pointer" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(148,185,255,0.70)" }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(148,185,255,0.30)" }}>
          <ArrowLeft className="w-3.5 h-3.5" /> Seleção
        </button>

        <div className="flex items-center gap-4">
          <button onClick={prev} disabled={current === 0}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all disabled:opacity-20"
            style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(180,210,255,0.70)", cursor: "pointer" }}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <NavDots total={total} current={current} goto={go} />
          <button onClick={next} disabled={current === total - 1}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all disabled:opacity-20"
            style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(180,210,255,0.70)", cursor: "pointer" }}>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span style={{ fontSize: 11, color: "rgba(148,185,255,0.25)" }}>
            {current + 1} / {total} · F tela cheia
          </span>
          <button onClick={toggleFullscreen}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
            style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(180,210,255,0.50)", cursor: "pointer" }}>
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </motion.div>

      {/* Edge hints */}
      {current > 0 && (
        <motion.div animate={{ opacity: idle ? 0 : 0.30 }}
          className="absolute left-0 top-0 bottom-16 w-12 flex items-center justify-start pl-3 pointer-events-none" style={{ zIndex: 40 }}>
          <div className="w-7 h-7 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)" }}>
            <ChevronLeft className="w-4 h-4 text-white" />
          </div>
        </motion.div>
      )}
      {current < total - 1 && (
        <motion.div animate={{ opacity: idle ? 0 : 0.30 }}
          className="absolute right-0 top-0 bottom-16 w-12 flex items-center justify-end pr-3 pointer-events-none" style={{ zIndex: 40 }}>
          <div className="w-7 h-7 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)" }}>
            <ChevronRight className="w-4 h-4 text-white" />
          </div>
        </motion.div>
      )}
    </div>
  )
}
