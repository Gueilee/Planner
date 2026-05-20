"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import Link from "next/link"
import {
  ChevronLeft, ChevronRight, Maximize2, Minimize2,
  Users, Calendar, TrendingUp, AlertTriangle,
  CheckCircle2, Clock, ArrowLeft, Zap, Shield,
  CircleDot, CheckCheck, ListTodo, ArrowRight,
  Play, Search, BarChart3, RefreshCw, MapPin,
} from "lucide-react"

// ─── Types ─────────────────────────────────────────────────────────────────

export type ProjectSlideData = {
  id: string
  title: string
  status: string
  sponsor: string | null
  progress: number
  tasks: {
    total: number
    completed: number
    inProgress: number
    delayed: number
    planning: number
    completedTitles: string[]
    inProgressTitles: string[]
    plannedTitles: string[]
  }
  risks: {
    critical: number
    high: number
    items: { level: string; description: string; mitigation: string | null; owner: string | null }[]
  }
  team: number
  daysLeft: number | null
  economy: number | null
  budget: number | null
  lastCheckpoint: {
    date: string
    title: string
    location: string | null
    highlights: string | null
    decisions: string | null
    nextSteps: string[]
  } | null
  wbsAreas: { name: string; color: string | null; total: number; done: number; pct: number }[]
  dates: { start: string | null; end: string | null; goLive: string | null }
  reportStatus: {
    cost:      "GREEN" | "YELLOW" | "RED"
    schedule:  "GREEN" | "YELLOW" | "RED"
    resources: "GREEN" | "YELLOW" | "RED"
    overall:   "GREEN" | "YELLOW" | "RED"
    notes:     string | null
  }
}

// ─── Constants ─────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; color: string; glow: string }> = {
  IN_PROGRESS: { label: "Em Andamento", color: "#60A5FA", glow: "rgba(96,165,250,0.35)" },
  PILOT:       { label: "Em Validação", color: "#22D3EE", glow: "rgba(34,211,238,0.30)" },
  RAMP_UP:     { label: "Ramp-Up",      color: "#C084FC", glow: "rgba(192,132,252,0.30)" },
  GO_LIVE:     { label: "GO LIVE",      color: "#34D399", glow: "rgba(52,211,153,0.40)" },
  POST_GOLIVE: { label: "Pós GO LIVE",  color: "#67E8F9", glow: "rgba(103,232,249,0.30)" },
}

const RISK_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  CRITICAL: { label: "Crítico", color: "#FCA5A5", bg: "rgba(239,68,68,0.14)",  border: "rgba(239,68,68,0.30)" },
  HIGH:     { label: "Alto",    color: "#FCD34D", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.28)" },
  MEDIUM:   { label: "Médio",   color: "#86EFAC", bg: "rgba(16,185,129,0.10)", border: "rgba(16,185,129,0.22)" },
  LOW:      { label: "Baixo",   color: "#94A3B8", bg: "rgba(148,163,184,0.08)",border: "rgba(148,163,184,0.18)" },
}

// ─── Slide variants ─────────────────────────────────────────────────────────

const slideVariants = {
  enter: (dir: number) => ({ opacity: 0, x: dir > 0 ? 80 : -80, scale: 0.97 }),
  center: { opacity: 1, x: 0, scale: 1, transition: { duration: 0.50, ease: "easeOut" as const } },
  exit: (dir: number) => ({ opacity: 0, x: dir > 0 ? -80 : 80, scale: 0.97, transition: { duration: 0.32, ease: "easeIn" as const } }),
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function currency(v: number | null) {
  if (!v) return null
  return v >= 1_000_000
    ? `R$ ${(v / 1_000_000).toFixed(1)}M`
    : `R$ ${(v / 1_000).toFixed(0)}K`
}

// ─── Global Keyframes ────────────────────────────────────────────────────────

const KEYFRAMES = `
  @keyframes auroraA {
    0%   { opacity: 0.70; transform: scale(1)    rotate(-3deg) translateY(0px); }
    50%  { opacity: 1.00; transform: scale(1.12) rotate(2deg)  translateY(-20px); }
    100% { opacity: 0.75; transform: scale(1.05) rotate(-1deg) translateY(10px); }
  }
  @keyframes auroraB {
    0%   { opacity: 0.50; transform: scale(1.10) rotate(2deg)  translateX(0px); }
    50%  { opacity: 0.85; transform: scale(1)    rotate(-3deg) translateX(30px); }
    100% { opacity: 0.60; transform: scale(1.08) rotate(1deg)  translateX(-15px); }
  }
  @keyframes auroraC {
    0%   { opacity: 0.40; transform: scale(1) rotate(0deg); }
    60%  { opacity: 0.80; transform: scale(1.15) rotate(-2deg); }
    100% { opacity: 0.45; transform: scale(0.95) rotate(3deg); }
  }
  @keyframes orbPulse {
    0%, 100% { opacity: 0.70; transform: scale(1); }
    50%      { opacity: 1.00; transform: scale(1.18); }
  }
  @keyframes ringExpand {
    0%   { opacity: 0.45; transform: translate(-50%,-50%) scale(0.85); }
    60%  { opacity: 0.15; }
    100% { opacity: 0;    transform: translate(-50%,-50%) scale(1.30); }
  }
  @keyframes particleDrift {
    0%   { transform: translateY(0)    scale(1);    opacity: 0; }
    8%   { opacity: 1; }
    88%  { opacity: 0.6; }
    100% { transform: translateY(-110px) scale(0.55); opacity: 0; }
  }
  @keyframes scanLine {
    0%   { top: -4px; opacity: 0; }
    5%   { opacity: 0.07; }
    95%  { opacity: 0.04; }
    100% { top: 100%; opacity: 0; }
  }
  @keyframes shimmer {
    0%   { background-position: -200% center; }
    100% { background-position: 200% center; }
  }
  @keyframes beamPulse {
    0%, 100% { opacity: 0.04; }
    50%      { opacity: 0.11; }
  }
  @keyframes glowPulse {
    0%, 100% { box-shadow: 0 0 20px rgba(36,99,255,0.25), 0 0 60px rgba(139,47,255,0.12); }
    50%      { box-shadow: 0 0 30px rgba(36,99,255,0.40), 0 0 80px rgba(139,47,255,0.22); }
  }
  @keyframes coreGlow {
    0%, 100% { opacity: 0.60; transform: translate(-50%,-50%) scale(1); }
    50%      { opacity: 1;    transform: translate(-50%,-50%) scale(1.42); }
  }
  @keyframes orbitA1 {
    0%   { transform: translate(-50%,-50%) rotate(0deg)   translateX(330px); }
    100% { transform: translate(-50%,-50%) rotate(360deg) translateX(330px); }
  }
  @keyframes orbitA2 {
    0%   { transform: translate(-50%,-50%) rotate(0deg)   translateX(265px); }
    100% { transform: translate(-50%,-50%) rotate(360deg) translateX(265px); }
  }
  @keyframes orbitB1 {
    0%   { transform: translate(-50%,-50%) rotate(0deg)    translateX(200px) translateY(-75px); }
    100% { transform: translate(-50%,-50%) rotate(-360deg) translateX(200px) translateY(-75px); }
  }
  @keyframes orbitB2 {
    0%   { transform: translate(-50%,-50%) rotate(0deg)   translateX(155px) translateY(60px); }
    100% { transform: translate(-50%,-50%) rotate(360deg) translateX(155px) translateY(60px); }
  }
  @keyframes beamSweep {
    0%   { left: -20%; opacity: 0; }
    10%  { opacity: 1; }
    88%  { opacity: 1; }
    100% { left: 118%; opacity: 0; }
  }
  @keyframes cornerPulse {
    0%, 100% { opacity: 0.55; transform: scale(1); }
    50%      { opacity: 1;    transform: scale(1.22); }
  }
  @keyframes cornerPulse2 {
    0%, 100% { opacity: 0.42; transform: scale(1.10); }
    50%      { opacity: 0.88; transform: scale(0.90); }
  }
`

// ─── Star field (deterministic) ───────────────────────────────────────────────

function StarField() {
  const stars = useMemo(() => Array.from({ length: 120 }, (_, i) => ({
    cx: `${((i * 137.508) % 100).toFixed(2)}%`,
    cy: `${((i * 97.313 + i * 31) % 100).toFixed(2)}%`,
    r:  0.6 + (i % 4) * 0.35,
    op: (0.20 + (i % 6) * 0.10).toFixed(2),
    big: i % 17 === 0,
  })), [])

  return (
    <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }}>
      {stars.map((s, i) => (
        <circle key={i} cx={s.cx} cy={s.cy} r={s.big ? s.r * 1.8 : s.r}
          fill="white" opacity={Number(s.op) * (s.big ? 1.4 : 1)} />
      ))}
    </svg>
  )
}

// ─── Background ─────────────────────────────────────────────────────────────

function SlideBackground({ accent = "#2463FF" }: { accent?: string }) {
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ zIndex: 0 }}>
      <style>{KEYFRAMES}</style>

      {/* Deep space base */}
      <div className="absolute inset-0" style={{
        background: "radial-gradient(ellipse 120% 80% at 50% -10%, #091428 0%, #040B1C 45%, #020509 100%)",
      }} />

      {/* Star field */}
      <div style={{ opacity: 0.80 }}><StarField /></div>

      {/* ── Corner glows ── */}
      <div className="absolute pointer-events-none" style={{
        width: 520, height: 520, top: -140, left: -140, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(36,99,255,0.48) 0%, transparent 70%)",
        filter: "blur(58px)",
        animation: "cornerPulse 7s ease-in-out infinite",
      }} />
      <div className="absolute pointer-events-none" style={{
        width: 440, height: 440, bottom: -110, right: -110, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(139,47,255,0.45) 0%, transparent 70%)",
        filter: "blur(56px)",
        animation: "cornerPulse 7s ease-in-out 3.5s infinite",
      }} />
      <div className="absolute pointer-events-none" style={{
        width: 360, height: 360, top: -85, right: -85, borderRadius: "50%",
        background: `radial-gradient(circle, ${accent}55 0%, transparent 70%)`,
        filter: "blur(52px)",
        animation: "cornerPulse2 6s ease-in-out 1.5s infinite",
      }} />
      <div className="absolute pointer-events-none" style={{
        width: 300, height: 300, bottom: -72, left: -72, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(16,185,129,0.38) 0%, transparent 70%)",
        filter: "blur(46px)",
        animation: "cornerPulse2 6s ease-in-out 4s infinite",
      }} />

      {/* Aurora layer 1 — blue top-left */}
      <div className="absolute inset-0" style={{
        background: "radial-gradient(ellipse 90% 55% at -10% 5%, rgba(24,80,220,0.28) 0%, transparent 65%)",
        animation: "auroraA 10s ease-in-out infinite alternate",
        transformOrigin: "20% 10%",
      }} />

      {/* Aurora layer 2 — purple bottom-right */}
      <div className="absolute inset-0" style={{
        background: "radial-gradient(ellipse 75% 55% at 105% 95%, rgba(110,30,220,0.25) 0%, transparent 60%)",
        animation: "auroraB 14s ease-in-out infinite alternate",
        transformOrigin: "90% 85%",
      }} />

      {/* Aurora layer 3 — cyan mid */}
      <div className="absolute inset-0" style={{
        background: "radial-gradient(ellipse 50% 40% at 60% 110%, rgba(0,196,224,0.14) 0%, transparent 60%)",
        animation: "auroraC 17s ease-in-out infinite alternate",
        transformOrigin: "55% 90%",
      }} />

      {/* ── Central core glow ── */}
      <div className="absolute pointer-events-none" style={{
        top: "50%", left: "50%",
        width: 820, height: 700,
        borderRadius: "50%",
        background: `radial-gradient(circle, rgba(36,99,255,0.20) 0%, rgba(139,47,255,0.14) 30%, ${accent}0A 55%, transparent 72%)`,
        filter: "blur(44px)",
        animation: "coreGlow 6s ease-in-out infinite",
      }} />

      {/* ── Orbiting orbs ── */}
      <div className="absolute pointer-events-none" style={{
        top: "50%", left: "50%",
        width: 210, height: 210, borderRadius: "50%",
        background: `radial-gradient(circle, ${accent}99 0%, transparent 70%)`,
        filter: "blur(20px)",
        animation: "orbitA1 9s linear infinite",
      }} />
      <div className="absolute pointer-events-none" style={{
        top: "50%", left: "50%",
        width: 170, height: 170, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(36,99,255,0.80) 0%, transparent 70%)",
        filter: "blur(16px)",
        animation: "orbitA2 14s linear infinite reverse",
        animationDelay: "-5s",
      }} />
      <div className="absolute pointer-events-none" style={{
        top: "50%", left: "50%",
        width: 130, height: 130, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(16,185,129,0.75) 0%, transparent 70%)",
        filter: "blur(13px)",
        animation: "orbitB1 8s linear infinite",
        animationDelay: "-2s",
      }} />
      <div className="absolute pointer-events-none" style={{
        top: "50%", left: "50%",
        width: 100, height: 100, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(248,244,255,0.65) 0%, transparent 70%)",
        filter: "blur(10px)",
        animation: "orbitB2 11s linear infinite reverse",
        animationDelay: "-6s",
      }} />

      {/* ── Sweeping light beams ── */}
      <div className="absolute pointer-events-none" style={{
        top: 0, width: 190, height: "100%",
        background: "linear-gradient(to right, transparent, rgba(36,99,255,0.20), rgba(139,47,255,0.14), transparent)",
        filter: "blur(30px)",
        animation: "beamSweep 9s ease-in-out infinite",
      }} />
      <div className="absolute pointer-events-none" style={{
        top: 0, width: 130, height: "100%",
        background: `linear-gradient(to right, transparent, ${accent}22, transparent)`,
        filter: "blur(24px)",
        animation: "beamSweep 13s ease-in-out 4s infinite",
      }} />
      <div className="absolute pointer-events-none" style={{
        top: 0, width: 85, height: "100%",
        background: "linear-gradient(to right, transparent, rgba(16,185,129,0.18), transparent)",
        filter: "blur(22px)",
        animation: "beamSweep 7.5s ease-in-out 7.5s infinite",
      }} />

      {/* Accent orb — status color top-right */}
      <div className="absolute pointer-events-none" style={{
        top: "8%", right: "5%",
        width: 520, height: 520,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${accent}2E 0%, transparent 70%)`,
        filter: "blur(55px)",
        animation: "orbPulse 7s ease-in-out infinite",
      }} />

      {/* Diagonal beam lines */}
      <div className="absolute" style={{
        top: 0, left: "25%", width: 1, height: "100%",
        background: "linear-gradient(to bottom, transparent 0%, rgba(36,99,255,0.14) 25%, rgba(139,47,255,0.10) 75%, transparent 100%)",
        animation: "beamPulse 8s ease-in-out infinite",
      }} />
      <div className="absolute" style={{
        top: 0, right: "30%", width: 1, height: "100%",
        background: "linear-gradient(to bottom, transparent 0%, rgba(139,47,255,0.10) 30%, rgba(36,99,255,0.12) 70%, transparent 100%)",
        animation: "beamPulse 11s ease-in-out 2s infinite",
      }} />

      {/* Horizontal light accent top */}
      <div className="absolute top-0 left-0 right-0" style={{ height: 1,
        background: "linear-gradient(90deg, transparent 0%, rgba(36,99,255,0.70) 25%, rgba(100,180,255,0.90) 50%, rgba(139,47,255,0.70) 75%, transparent 100%)",
      }} />

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0" style={{ height: 120,
        background: "linear-gradient(to top, rgba(2,5,9,0.60) 0%, transparent 100%)",
      }} />

      {/* Scan line */}
      <div className="absolute left-0 right-0" style={{
        height: 3,
        background: "linear-gradient(90deg, transparent, rgba(96,165,250,0.07), rgba(192,132,252,0.07), transparent)",
        animation: "scanLine 14s linear infinite",
        pointerEvents: "none",
      }} />
    </div>
  )
}

// ─── Logo ────────────────────────────────────────────────────────────────────

function VendemmiaLogo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const h = size === "lg" ? 34 : size === "sm" ? 20 : 26
  const w = size === "lg" ? 160 : size === "sm" ? 100 : 130

  return (
    <div style={{
      position: "relative",
      background: "rgba(255,255,255,0.92)",
      backdropFilter: "blur(24px)",
      borderRadius: "14px",
      padding: size === "sm" ? "5px 12px" : "7px 18px",
      boxShadow: "0 0 0 1px rgba(96,165,250,0.40), 0 0 28px rgba(36,99,255,0.22), 0 0 70px rgba(139,47,255,0.14), 0 6px 24px rgba(0,0,0,0.55)",
      animation: "glowPulse 4s ease-in-out infinite",
      display: "inline-flex",
      alignItems: "center",
    }}>
      <div style={{
        position: "absolute", inset: 0, borderRadius: "14px", pointerEvents: "none",
        background: "linear-gradient(135deg, rgba(96,165,250,0.10) 0%, rgba(192,132,252,0.08) 100%)",
      }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/vendemmia.png" alt="Vendemmia" style={{ height: h, width: w, objectFit: "contain", position: "relative" }} />
    </div>
  )
}

// ─── Progress Ring ────────────────────────────────────────────────────────────

function ProgressRing({ percent, size = 160, accent = "#2463FF" }: { percent: number; size?: number; accent?: string }) {
  const [anim, setAnim] = useState(0)
  const stroke = size > 80 ? 10 : 7
  const r      = (size - stroke) / 2
  const circ   = 2 * Math.PI * r
  const dash   = (anim / 100) * circ
  const uid    = `ring-${size}-${percent}`

  useEffect(() => {
    const t = setTimeout(() => setAnim(percent), 120)
    return () => clearTimeout(t)
  }, [percent])

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <defs>
          <linearGradient id={`${uid}-g`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00C4E0" />
            <stop offset="50%" stopColor="#2463FF" />
            <stop offset="100%" stopColor="#8B2FFF" />
          </linearGradient>
          <filter id={`${uid}-glow`}>
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {/* Track */}
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        {/* Glow arc (behind) */}
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke={`url(#${uid}-g)`} strokeWidth={stroke + 4} strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ opacity: 0.25, filter: "blur(6px)", transition: "stroke-dasharray 1.3s cubic-bezier(0.22,1,0.36,1)" }}
        />
        {/* Main arc */}
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke={`url(#${uid}-g)`} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          filter={`url(#${uid}-glow)`}
          style={{ transition: "stroke-dasharray 1.3s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-black leading-none" style={{ fontSize: size * 0.22, color: "white", textShadow: "0 0 20px rgba(36,99,255,0.60)" }}>
          {percent}%
        </span>
        {size > 80 && (
          <span className="text-[10px] font-semibold mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
            completo
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Floating Particles ───────────────────────────────────────────────────────

function FloatingParticles({ count = 18, colors = ["rgba(96,165,250,0.9)", "rgba(192,132,252,0.9)", "rgba(52,211,153,0.80)", "rgba(248,244,255,0.75)"] }) {
  const particles = useMemo(() => Array.from({ length: count }, (_, i) => ({
    left: `${4 + i * (92 / count)}%`,
    bottom: `${3 + (i * 17) % 40}%`,
    size: 1.8 + (i % 4) * 1.1,
    color: colors[i % colors.length],
    duration: 6 + (i % 5) * 2.2,
    delay: -(i * 0.9),
  })), [count, colors])

  return (
    <>
      {particles.map((p, i) => (
        <div key={i} className="absolute rounded-full pointer-events-none" style={{
          width: p.size, height: p.size,
          left: p.left, bottom: p.bottom,
          background: p.color,
          boxShadow: `0 0 ${p.size * 4}px ${p.size * 1.5}px ${p.color}`,
          animation: `particleDrift ${p.duration}s ease-in-out ${p.delay}s infinite`,
        }} />
      ))}
    </>
  )
}

// ─── Glass Panel ─────────────────────────────────────────────────────────────

function GlassPanel({
  children, className = "", accent,
  style = {},
}: {
  children: React.ReactNode
  className?: string
  accent?: string
  style?: React.CSSProperties
}) {
  return (
    <div className={className} style={{
      background: accent
        ? `linear-gradient(135deg, ${accent}09 0%, ${accent}04 100%)`
        : "rgba(255,255,255,0.045)",
      border: `1px solid ${accent ? accent + "28" : "rgba(255,255,255,0.09)"}`,
      boxShadow: accent
        ? `0 0 30px ${accent}10, inset 0 1px 0 rgba(255,255,255,0.06)`
        : "inset 0 1px 0 rgba(255,255,255,0.05)",
      backdropFilter: "blur(20px)",
      borderRadius: "20px",
      ...style,
    }}>
      {children}
    </div>
  )
}

// ─── Cover Slide ─────────────────────────────────────────────────────────────

function CoverSlide({ count, date }: { count: number; date: string }) {
  return (
    <div className="relative flex flex-col items-center justify-center h-full select-none overflow-hidden">
      <SlideBackground />
      <FloatingParticles count={16} />

      {/* Expanding rings */}
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="absolute pointer-events-none" style={{
          top: "50%", left: "50%",
          width: 280 + i * 220, height: 280 + i * 220,
          borderRadius: "50%",
          border: `1px solid rgba(36,99,255,${0.14 - i * 0.025})`,
          boxShadow: `0 0 18px rgba(36,99,255,${0.08 - i * 0.015}), inset 0 0 18px rgba(36,99,255,${0.04})`,
          animation: `ringExpand ${4.5 + i * 1.2}s cubic-bezier(0.4,0,0.6,1) ${i * 1.1}s infinite`,
        }} />
      ))}

      {/* Central core glow */}
      <div className="absolute pointer-events-none" style={{
        top: "50%", left: "50%",
        width: 750, height: 750,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(36,99,255,0.22) 0%, rgba(139,47,255,0.16) 28%, rgba(245,48,102,0.08) 55%, transparent 72%)",
        filter: "blur(40px)",
        animation: "coreGlow 5s ease-in-out infinite",
      }} />

      {/* Orbiting orbs — cover specific, larger radius */}
      <div className="absolute pointer-events-none" style={{
        top: "50%", left: "50%",
        width: 220, height: 220, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(245,48,102,0.85) 0%, transparent 70%)",
        filter: "blur(18px)",
        animation: "orbitA1 9s linear infinite",
      }} />
      <div className="absolute pointer-events-none" style={{
        top: "50%", left: "50%",
        width: 175, height: 175, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(36,99,255,0.82) 0%, transparent 70%)",
        filter: "blur(16px)",
        animation: "orbitA2 14s linear infinite reverse",
        animationDelay: "-5s",
      }} />
      <div className="absolute pointer-events-none" style={{
        top: "50%", left: "50%",
        width: 135, height: 135, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(16,185,129,0.78) 0%, transparent 70%)",
        filter: "blur(13px)",
        animation: "orbitB1 8s linear infinite",
        animationDelay: "-2s",
      }} />
      <div className="absolute pointer-events-none" style={{
        top: "50%", left: "50%",
        width: 95, height: 95, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(248,244,255,0.70) 0%, transparent 70%)",
        filter: "blur(10px)",
        animation: "orbitB2 11s linear infinite reverse",
        animationDelay: "-7s",
      }} />

      <div className="relative z-10 flex flex-col items-center gap-7 text-center px-12">
        {/* Logo */}
        <motion.div initial={{ opacity: 0, y: -30, scale: 0.90 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.10, duration: 0.70, ease: "easeOut" }}>
          <VendemmiaLogo size="lg" />
        </motion.div>

        {/* Label + Title */}
        <motion.div initial={{ opacity: 0, y: 25 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28, duration: 0.65 }} className="space-y-4">
          <h1 className="font-black tracking-tight leading-none" style={{
            fontSize: "clamp(3.2rem, 6vw, 5rem)",
            background: "linear-gradient(135deg, #ffffff 0%, #E0EAFF 40%, rgba(255,255,255,0.65) 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            textShadow: "none",
            filter: "drop-shadow(0 0 40px rgba(36,99,255,0.35))",
          }}>
            Status Report
          </h1>
          <p className="text-xl font-semibold tracking-wide" style={{ color: "rgba(150,185,255,0.50)" }}>
            Gestão de Projetos&nbsp;·&nbsp;Portfólio
          </p>
        </motion.div>

        {/* Counter card */}
        <motion.div initial={{ opacity: 0, scale: 0.88, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 0.48, duration: 0.60, ease: "easeOut" }}>
          <GlassPanel style={{
            padding: "28px 52px",
            textAlign: "center",
            boxShadow: "0 0 0 1px rgba(96,165,250,0.18), 0 0 50px rgba(36,99,255,0.18), 0 0 120px rgba(139,47,255,0.10), inset 0 1px 0 rgba(255,255,255,0.08)",
          }}>
            <p className="font-black leading-none" style={{
              fontSize: "4.5rem",
              background: "linear-gradient(135deg, #00C4E0 0%, #2463FF 50%, #8B2FFF 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              filter: "drop-shadow(0 0 30px rgba(36,99,255,0.50))",
            }}>
              {count}
            </p>
            <p className="text-sm font-semibold mt-2.5 tracking-wide" style={{ color: "rgba(150,185,255,0.55)" }}>
              {count === 1 ? "projeto em andamento" : "projetos em andamento"}
            </p>
          </GlassPanel>
        </motion.div>

        {/* Date */}
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.65, duration: 0.50 }}
          className="text-sm font-medium tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.25)", letterSpacing: "0.18em" }}>
          {date}
        </motion.p>

        {/* Hint */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.50 }} transition={{ delay: 1.3, duration: 0.60 }}
          className="flex items-center gap-2 text-sm" style={{ color: "rgba(150,185,255,0.50)" }}>
          <ChevronRight className="w-4 h-4" />
          <span>Pressione → ou clique para avançar · F para tela cheia</span>
        </motion.div>
      </div>
    </div>
  )
}

// ─── Traffic Light helpers ────────────────────────────────────────────────────

type TrafficLight = "GREEN" | "YELLOW" | "RED" | "GRAY"

const LIGHT_CFG: Record<TrafficLight, { color: string; glow: string; label: string }> = {
  GREEN:  { color: "#10B981", glow: "rgba(16,185,129,0.70)",  label: "Em Linha" },
  YELLOW: { color: "#F59E0B", glow: "rgba(245,158,11,0.70)",  label: "Atenção"  },
  RED:    { color: "#EF4444", glow: "rgba(239,68,68,0.70)",   label: "Risco"    },
  GRAY:   { color: "#475569", glow: "rgba(71,85,105,0.30)",   label: "—"        },
}

function TrafficSquare({ light }: { light: TrafficLight }) {
  const cfg = LIGHT_CFG[light]
  return (
    <div style={{
      width: 32, height: 32, borderRadius: 8,
      background: `linear-gradient(135deg, ${cfg.color}DD, ${cfg.color}99)`,
      boxShadow: `0 0 16px ${cfg.glow}, 0 0 32px ${cfg.glow}50, inset 0 1px 0 rgba(255,255,255,0.30)`,
      border: `1px solid ${cfg.color}60`,
    }} />
  )
}

// ─── Report section header ────────────────────────────────────────────────────

function RSH({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 -mx-3 rounded-t-xl mb-2" style={{
      background: "linear-gradient(135deg, rgba(36,99,255,0.22) 0%, rgba(139,47,255,0.16) 100%)",
      borderBottom: "1px solid rgba(255,255,255,0.07)",
    }}>
      <span className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: "rgba(200,220,255,0.80)" }}>{label}</span>
      {right}
    </div>
  )
}

// ─── Project Slide ────────────────────────────────────────────────────────────

function ProjectSlide({ data, index, total }: { data: ProjectSlideData; index: number; total: number }) {
  const status = STATUS_CFG[data.status] ?? { label: data.status, color: "#94A3B8", glow: "rgba(148,163,184,0.25)" }

  // Use saved indicators — normalise any unexpected DB value to GREEN
  const toLight = (v: string | null | undefined): TrafficLight =>
    (v && v in LIGHT_CFG) ? v as TrafficLight : "GREEN"

  const costLight     = toLight(data.reportStatus.cost)
  const scheduleLight = toLight(data.reportStatus.schedule)
  const resourceLight = toLight(data.reportStatus.resources)
  const overallLight  = toLight(data.reportStatus.overall)

  const nextSteps = data.lastCheckpoint?.nextSteps.length
    ? data.lastCheckpoint.nextSteps
    : data.tasks.plannedTitles

  // Unified risk table sorted by severity
  const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
  const sortedRisks = [...data.risks.items].sort(
    (a, b) => (SEVERITY_ORDER[a.level] ?? 4) - (SEVERITY_ORDER[b.level] ?? 4)
  )

  const daysStr = data.daysLeft === null ? null
    : data.daysLeft < 0  ? `${Math.abs(data.daysLeft)}d atrasado`
    : data.daysLeft === 0 ? "Vence hoje"
    : `${data.daysLeft}d restantes`

  return (
    <div className="relative flex flex-col h-full select-none overflow-hidden">
      <SlideBackground accent={status.color} />

      <div className="relative z-10 flex flex-col h-full px-5 pt-3 pb-2 gap-2.5">

        {/* ── Top bar ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between shrink-0 pb-2"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <VendemmiaLogo size="sm" />

          <div className="flex-1 mx-5 min-w-0">
            <h2 className="font-black leading-tight text-center truncate" style={{
              fontSize: "clamp(1rem, 2vw, 1.6rem)", color: "white",
              textShadow: `0 0 40px ${status.color}30`,
            }}>
              {data.title}
            </h2>
            {data.sponsor && (
              <p className="text-center text-[10px] mt-0.5" style={{ color: "rgba(150,185,255,0.40)" }}>
                Gestor / Sponsor: {data.sponsor}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{
              background: `${status.color}18`,
              border: `1px solid ${status.color}40`,
              boxShadow: `0 0 16px ${status.color}20`,
            }}>
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{
                background: status.color, boxShadow: `0 0 8px ${status.color}`,
                animation: "orbPulse 2.5s ease-in-out infinite",
              }} />
              <span className="text-[10px] font-bold tracking-wide" style={{ color: status.color }}>{status.label}</span>
            </div>
            <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.20)" }}>
              {index} / {total}
            </span>
          </div>
        </div>

        {/* ── Two-column main body ─────────────────────────────────────────── */}
        <div className="flex-1 grid min-h-0 gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>

          {/* ══ LEFT COLUMN ══ */}
          <div className="flex flex-col gap-2.5 min-h-0">

            {/* Detalhes do Projeto */}
            <GlassPanel style={{ padding: "10px 12px", flexShrink: 0 }}>
              <RSH label="Detalhes do Projeto" />
              <div className="space-y-1">
                <p className="text-[11px]" style={{ color: "rgba(200,220,255,0.70)" }}>
                  <span className="font-bold" style={{ color: "rgba(200,220,255,0.90)" }}>Projeto: </span>
                  {data.title}
                </p>
                {data.sponsor && (
                  <p className="text-[11px]" style={{ color: "rgba(200,220,255,0.70)" }}>
                    <span className="font-bold" style={{ color: "rgba(200,220,255,0.90)" }}>Gestor: </span>
                    {data.sponsor}
                  </p>
                )}
                <div className="flex gap-4 pt-0.5">
                  {data.dates.start && (
                    <p className="text-[11px]" style={{ color: "rgba(200,220,255,0.55)" }}>
                      <span className="font-bold">Início: </span>{format(new Date(data.dates.start), "dd/MM/yyyy", { locale: ptBR })}
                    </p>
                  )}
                  {data.dates.goLive && (
                    <p className="text-[11px]" style={{ color: "#34D399" }}>
                      <span className="font-bold">GO LIVE: </span>{format(new Date(data.dates.goLive), "dd/MM/yyyy", { locale: ptBR })}
                    </p>
                  )}
                  {daysStr && (
                    <p className="text-[11px] font-bold ml-auto" style={{
                      color: scheduleLight === "RED" ? "#FCA5A5" : scheduleLight === "YELLOW" ? "#FCD34D" : "#86EFAC",
                    }}>
                      {daysStr}
                    </p>
                  )}
                </div>
              </div>
            </GlassPanel>

            {/* Atividades Concluídas */}
            <GlassPanel accent="#10B981" style={{ padding: "10px 12px", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              <RSH
                label="Atividades Concluídas"
                right={
                  <span className="text-[9px] font-black" style={{ color: "#34D399" }}>
                    {data.tasks.completed}/{data.tasks.total}
                  </span>
                }
              />
              <div className="flex-1 space-y-1 overflow-hidden">
                {data.tasks.completedTitles.length > 0
                  ? data.tasks.completedTitles.slice(0, 5).map((t, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0 text-emerald-400" />
                        <span className="text-[11px] leading-snug line-clamp-1" style={{ color: "rgba(200,255,220,0.70)" }}>{t}</span>
                      </div>
                    ))
                  : data.wbsAreas.filter((a) => a.done > 0).length > 0
                    ? data.wbsAreas.filter((a) => a.done > 0).slice(0, 4).map((a, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: a.color ?? "#10B981" }} />
                          <span className="text-[11px] flex-1 truncate" style={{ color: "rgba(200,255,220,0.60)" }}>{a.name}</span>
                          <span className="text-[10px] font-bold shrink-0" style={{ color: a.color ?? "#34D399" }}>{a.pct}%</span>
                        </div>
                      ))
                    : <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.20)" }}>Nenhuma atividade concluída ainda</p>
                }
              </div>
            </GlassPanel>

            {/* Atividades em Execução */}
            <GlassPanel accent="#2463FF" style={{ padding: "10px 12px", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              <RSH
                label="Atividades em Execução"
                right={
                  <span className="text-[9px] font-black" style={{ color: "#60A5FA" }}>
                    {data.tasks.inProgress} ativa{data.tasks.inProgress !== 1 ? "s" : ""}
                    {data.tasks.delayed > 0 && (
                      <span style={{ color: "#FCA5A5" }}> · {data.tasks.delayed} atrasada{data.tasks.delayed > 1 ? "s" : ""}</span>
                    )}
                  </span>
                }
              />
              <div className="flex-1 space-y-1 overflow-hidden">
                {data.tasks.inProgressTitles.length > 0
                  ? data.tasks.inProgressTitles.slice(0, 5).map((t, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="w-2 h-2 rounded-full mt-1 shrink-0 flex-shrink-0" style={{
                          background: "#60A5FA",
                          boxShadow: "0 0 6px rgba(96,165,250,0.80)",
                          animation: "orbPulse 2s ease-in-out infinite",
                        }} />
                        <span className="text-[11px] leading-snug line-clamp-1" style={{ color: "rgba(180,210,255,0.70)" }}>{t}</span>
                      </div>
                    ))
                  : <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.20)" }}>
                      {data.tasks.total === 0 ? "Sem tarefas cadastradas" : "Nenhuma em andamento"}
                    </p>
                }
              </div>
            </GlassPanel>

            {/* Próximos Passos */}
            <GlassPanel accent="#8B2FFF" style={{ padding: "10px 12px", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              <RSH label="Próximos Passos" />
              <div className="flex-1 space-y-1 overflow-hidden">
                {nextSteps.length > 0
                  ? nextSteps.slice(0, 4).map((step, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <ArrowRight className="w-3 h-3 mt-0.5 shrink-0 text-violet-400" />
                        <span className="text-[11px] leading-snug line-clamp-1" style={{ color: "rgba(210,190,255,0.70)" }}>{step}</span>
                      </div>
                    ))
                  : data.lastCheckpoint?.highlights
                    ? <p className="text-[11px] leading-relaxed line-clamp-3" style={{ color: "rgba(210,190,255,0.45)" }}>
                        {data.lastCheckpoint.highlights.slice(0, 160)}
                      </p>
                    : <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.20)" }}>Aguardando próximo checkpoint</p>
                }
              </div>
            </GlassPanel>
          </div>

          {/* ══ RIGHT COLUMN ══ */}
          <div className="flex flex-col gap-2.5 min-h-0">

            {/* STATUS Geral do Projeto */}
            <GlassPanel style={{ padding: "10px 12px", flexShrink: 0 }}>
              <RSH
                label="STATUS Geral do Projeto"
                right={
                  <div className="flex items-center gap-2 text-[9px]" style={{ color: "rgba(150,185,255,0.40)" }}>
                    {(["GREEN", "YELLOW", "RED"] as TrafficLight[]).map((l) => (
                      <span key={l} className="flex items-center gap-1">
                        <span style={{
                          display: "inline-block", width: 8, height: 8, borderRadius: 2,
                          background: LIGHT_CFG[l].color,
                          boxShadow: `0 0 6px ${LIGHT_CFG[l].glow}`,
                        }} />
                        {LIGHT_CFG[l].label}
                      </span>
                    ))}
                  </div>
                }
              />
              <div className="flex items-center gap-3 mb-3">
                <span className="text-[10px] font-bold" style={{ color: "rgba(180,210,255,0.50)" }}>Status Geral:</span>
                <TrafficSquare light={overallLight} />
                <span className="text-[10px] font-bold" style={{ color: LIGHT_CFG[overallLight].color }}>
                  {LIGHT_CFG[overallLight].label}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { label: "Custos",      light: costLight },
                  { label: "Cronograma",  light: scheduleLight },
                  { label: "Recursos",    light: resourceLight },
                ] as { label: string; light: TrafficLight }[]).map(({ label, light }) => (
                  <div key={label} className="flex flex-col items-center gap-2 py-2.5 rounded-xl"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <span className="text-[9px] font-bold uppercase tracking-widest text-center" style={{ color: "rgba(180,210,255,0.45)" }}>
                      {label}
                    </span>
                    <TrafficSquare light={light} />
                  </div>
                ))}
              </div>
            </GlassPanel>

            {/* Último Checkpoint */}
            {data.lastCheckpoint && (
              <GlassPanel accent="#2563EB" style={{ padding: "10px 12px", flexShrink: 0 }}>
                <RSH
                  label="Último Checkpoint"
                  right={
                    <div className="flex items-center gap-1.5">
                      <RefreshCw style={{ width: 9, height: 9, color: "#60A5FA" }} />
                      <span className="text-[9px] font-semibold" style={{ color: "#60A5FA" }}>
                        {format(new Date(data.lastCheckpoint.date), "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                    </div>
                  }
                />
                <div className="space-y-1.5">
                  {data.lastCheckpoint.location && (
                    <div className="flex items-center gap-1.5">
                      <MapPin style={{ width: 10, height: 10, color: "#60A5FA", flexShrink: 0 }} />
                      <span className="text-[10px]" style={{ color: "rgba(150,185,255,0.60)" }}>
                        {data.lastCheckpoint.location}
                      </span>
                    </div>
                  )}
                  {data.lastCheckpoint.highlights && (
                    <div>
                      <p className="text-[8px] font-black uppercase tracking-widest mb-0.5" style={{ color: "rgba(96,165,250,0.45)" }}>
                        Pauta
                      </p>
                      <p className="text-[10px] leading-snug line-clamp-2" style={{ color: "rgba(180,210,255,0.70)" }}>
                        {data.lastCheckpoint.highlights}
                      </p>
                    </div>
                  )}
                  {data.lastCheckpoint.decisions && (
                    <div>
                      <p className="text-[8px] font-black uppercase tracking-widest mb-0.5" style={{ color: "rgba(96,165,250,0.45)" }}>
                        Decisões
                      </p>
                      <p className="text-[10px] leading-snug line-clamp-2" style={{ color: "rgba(180,210,255,0.70)" }}>
                        {data.lastCheckpoint.decisions}
                      </p>
                    </div>
                  )}
                </div>
              </GlassPanel>
            )}

            {/* Riscos e Problemas — unified table sorted by severity */}
            <GlassPanel style={{ padding: "10px 12px", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              <RSH
                label="Riscos e Problemas"
                right={sortedRisks.length === 0
                  ? <span className="text-[9px] font-bold" style={{ color: "#34D399" }}>Nenhum</span>
                  : <span className="text-[9px] font-bold" style={{ color: "#FCD34D" }}>
                      {sortedRisks.length} mapeado{sortedRisks.length > 1 ? "s" : ""}
                    </span>
                }
              />
              {sortedRisks.length > 0 ? (
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Table header */}
                  <div className="grid gap-1.5 mb-1.5 shrink-0" style={{ gridTemplateColumns: "auto 1fr 1fr auto" }}>
                    {["Nível", "Descrição", "Mitigação", "Resp."].map((h) => (
                      <span key={h} className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded"
                        style={{ background: "rgba(139,47,255,0.15)", color: "rgba(200,180,255,0.80)" }}>
                        {h}
                      </span>
                    ))}
                  </div>
                  <div className="flex-1 space-y-1.5 overflow-hidden">
                    {sortedRisks.slice(0, 5).map((r, i) => {
                      const cfg = RISK_CFG[r.level] ?? RISK_CFG.LOW
                      return (
                        <div key={i} className="grid gap-1.5 items-start py-1 px-1 rounded-lg"
                          style={{ gridTemplateColumns: "auto 1fr 1fr auto", background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                          <span className="text-[8px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-md shrink-0 self-center"
                            style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, whiteSpace: "nowrap" }}>
                            {cfg.label}
                          </span>
                          <p className="text-[10px] leading-snug line-clamp-2" style={{ color: "rgba(220,230,255,0.80)" }}>{r.description}</p>
                          <p className="text-[10px] leading-snug line-clamp-2" style={{ color: "rgba(180,205,255,0.55)" }}>{r.mitigation ?? "—"}</p>
                          <p className="text-[9px] truncate self-center" style={{ color: "rgba(150,185,255,0.40)" }}>{r.owner ?? "—"}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[11px]" style={{ color: "#34D399" }}>Sem riscos ou problemas identificados</span>
                </div>
              )}
            </GlassPanel>

            {/* Progresso do Projeto */}
            <GlassPanel style={{ padding: "10px 12px", flexShrink: 0 }}>
              <RSH label="Progresso do Projeto" />
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[11px] font-bold" style={{ color: "rgba(200,220,255,0.80)" }}>
                  Progresso: {data.progress}%
                </p>
                <p className="text-[10px]" style={{ color: "rgba(150,185,255,0.40)" }}>
                  {data.tasks.completed}/{data.tasks.total} tarefas concluídas
                </p>
              </div>
              <div className="h-2.5 rounded-full overflow-hidden mb-2" style={{ background: "rgba(255,255,255,0.07)" }}>
                <div className="h-full rounded-full" style={{
                  width: `${data.progress}%`,
                  background: "linear-gradient(90deg, #00C4E0, #2463FF, #8B2FFF)",
                  boxShadow: "0 0 14px rgba(36,99,255,0.70), 0 0 28px rgba(139,47,255,0.40)",
                  transition: "width 1.3s cubic-bezier(0.22,1,0.36,1)",
                }} />
              </div>
            </GlassPanel>

          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Summary Slide ────────────────────────────────────────────────────────────

function SummarySlide({ projects }: { projects: ProjectSlideData[] }) {
  const avgProgress = Math.round(projects.reduce((s, p) => s + p.progress, 0) / projects.length)
  const totalTasks  = projects.reduce((s, p) => s + p.tasks.total, 0)
  const doneTasks   = projects.reduce((s, p) => s + p.tasks.completed, 0)
  const critCount   = projects.reduce((s, p) => s + p.risks.critical, 0)
  const highCount   = projects.reduce((s, p) => s + p.risks.high, 0)

  const kpis = [
    { label: "Progresso Médio",     value: `${avgProgress}%`, color: "#60A5FA",  glow: "rgba(96,165,250,0.35)",  sub: "do portfólio" },
    { label: "Tarefas Concluídas",  value: `${doneTasks}/${totalTasks}`, color: "#34D399", glow: "rgba(52,211,153,0.35)", sub: "atividades" },
    { label: "Projetos Ativos",     value: String(projects.length), color: "#C084FC", glow: "rgba(192,132,252,0.35)", sub: "em andamento" },
    {
      label: critCount > 0 ? "Riscos Críticos" : highCount > 0 ? "Riscos Altos" : "Riscos",
      value: critCount > 0 ? String(critCount) : highCount > 0 ? String(highCount) : "0",
      color: critCount > 0 ? "#FCA5A5" : highCount > 0 ? "#FCD34D" : "#34D399",
      glow:  critCount > 0 ? "rgba(239,68,68,0.35)" : highCount > 0 ? "rgba(245,158,11,0.35)" : "rgba(52,211,153,0.30)",
      sub:   critCount > 0 ? "atenção imediata" : "identificados",
    },
  ]

  return (
    <div className="relative flex flex-col h-full select-none">
      <SlideBackground />
      <FloatingParticles count={10} />

      <div className="relative z-10 flex flex-col h-full px-7 py-5 gap-4">
        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <VendemmiaLogo size="sm" />
          <p className="text-base font-black" style={{
            background: "linear-gradient(135deg, rgba(180,210,255,0.70), rgba(210,180,255,0.50))",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            Visão Consolidada do Portfólio
          </p>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-4 gap-3 shrink-0">
          {kpis.map(({ label, value, color, glow, sub }) => (
            <GlassPanel key={label} style={{
              padding: "18px 20px",
              textAlign: "center",
              boxShadow: `0 0 0 1px ${color}20, 0 0 30px ${glow}, inset 0 1px 0 rgba(255,255,255,0.06)`,
            }}>
              <p className="font-black leading-none" style={{
                fontSize: "2.2rem", color,
                textShadow: `0 0 30px ${glow}`,
                filter: `drop-shadow(0 0 15px ${glow})`,
              }}>{value}</p>
              <p className="text-[10px] font-bold mt-1.5 uppercase tracking-wide" style={{ color: "rgba(180,210,255,0.45)" }}>{label}</p>
              <p className="text-[9px] mt-0.5" style={{ color: "rgba(255,255,255,0.22)" }}>{sub}</p>
            </GlassPanel>
          ))}
        </div>

        {/* Project grid */}
        <div className="flex-1 grid gap-3 min-h-0" style={{
          gridTemplateColumns: `repeat(${Math.min(projects.length, 3)}, 1fr)`,
          alignContent: "start",
        }}>
          {projects.map((p) => {
            const status = STATUS_CFG[p.status] ?? { label: p.status, color: "#94A3B8", glow: "" }
            return (
              <GlassPanel key={p.id} accent={status.color} style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="w-2 h-2 rounded-full" style={{
                        background: status.color,
                        boxShadow: `0 0 8px ${status.color}, 0 0 16px ${status.color}60`,
                      }} />
                      <span className="text-[9px] font-bold tracking-wide" style={{ color: status.color }}>{status.label}</span>
                    </div>
                    <h3 className="font-black text-sm leading-tight line-clamp-2 text-white">{p.title}</h3>
                    {p.sponsor && <p className="text-[9px] mt-0.5" style={{ color: "rgba(180,210,255,0.28)" }}>{p.sponsor}</p>}
                  </div>
                  <ProgressRing percent={p.progress} size={62} accent={status.color} />
                </div>

                <div>
                  <div className="flex justify-between text-[9px] mb-1.5">
                    <span style={{ color: "rgba(180,210,255,0.35)" }}>{p.tasks.completed}/{p.tasks.total} tarefas</span>
                    {p.daysLeft !== null && (
                      <span style={{ color: p.daysLeft < 0 ? "#FCA5A5" : "rgba(180,210,255,0.35)" }}>
                        {p.daysLeft < 0 ? `${Math.abs(p.daysLeft)}d atrasado` : `${p.daysLeft}d restantes`}
                      </span>
                    )}
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
                    <div className="h-full rounded-full" style={{
                      width: p.tasks.total > 0 ? `${Math.round((p.tasks.completed / p.tasks.total) * 100)}%` : "0%",
                      background: "linear-gradient(90deg, #10B981, #2463FF)",
                      boxShadow: "0 0 8px rgba(36,99,255,0.60)",
                    }} />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-[9px]" style={{ color: "#94A3B8" }}>
                    <Users className="w-2.5 h-2.5" />{p.team}
                  </span>
                  {p.risks.critical + p.risks.high > 0 && (
                    <span className="flex items-center gap-1 text-[9px] font-bold" style={{
                      color: p.risks.critical > 0 ? "#FCA5A5" : "#FCD34D",
                      textShadow: p.risks.critical > 0 ? "0 0 10px rgba(239,68,68,0.60)" : "0 0 10px rgba(245,158,11,0.50)",
                    }}>
                      <AlertTriangle className="w-2.5 h-2.5" />
                      {p.risks.critical + p.risks.high} risco{p.risks.critical + p.risks.high > 1 ? "s" : ""}
                    </span>
                  )}
                  {currency(p.economy) && (
                    <span className="flex items-center gap-1 text-[9px] ml-auto" style={{ color: "#86EFAC" }}>
                      <TrendingUp className="w-2.5 h-2.5" />{currency(p.economy)}
                    </span>
                  )}
                </div>
              </GlassPanel>
            )
          })}
        </div>

        {/* Portfolio progress */}
        <GlassPanel style={{
          padding: "14px 24px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between",
          boxShadow: "0 0 0 1px rgba(36,99,255,0.18), 0 0 40px rgba(36,99,255,0.12), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}>
          <span className="text-sm font-semibold tracking-wide" style={{ color: "rgba(150,185,255,0.45)" }}>
            Progresso Médio do Portfólio
          </span>
          <div className="flex items-center gap-5">
            <div className="w-56 h-2.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
              <div className="h-full rounded-full" style={{
                width: `${avgProgress}%`,
                background: "linear-gradient(90deg, #00C4E0, #2463FF, #8B2FFF)",
                boxShadow: "0 0 16px rgba(36,99,255,0.70), 0 0 30px rgba(139,47,255,0.40)",
                transition: "width 1.4s cubic-bezier(0.22,1,0.36,1)",
              }} />
            </div>
            <span className="text-2xl font-black" style={{
              background: "linear-gradient(135deg, #00C4E0, #2463FF, #8B2FFF)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              filter: "drop-shadow(0 0 20px rgba(36,99,255,0.50))",
            }}>
              {avgProgress}%
            </span>
          </div>
        </GlassPanel>
      </div>
    </div>
  )
}

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="relative flex flex-col items-center justify-center h-full gap-6">
      <SlideBackground />
      <div className="relative z-10 text-center space-y-5">
        <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto"
          style={{ background: "rgba(36,99,255,0.15)", border: "1px solid rgba(36,99,255,0.30)", boxShadow: "0 0 40px rgba(36,99,255,0.25)" }}>
          <Clock className="w-9 h-9 text-blue-400" />
        </div>
        <h2 className="text-2xl font-black text-white" style={{ textShadow: "0 0 30px rgba(36,99,255,0.40)" }}>
          Nenhum Projeto em Andamento
        </h2>
        <p className="text-sm" style={{ color: "rgba(150,185,255,0.40)" }}>
          Projetos com status Em Andamento, Piloto, Ramp-Up, GO LIVE ou Pós GO LIVE aparecerão aqui.
        </p>
        <Link href="/projects"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white"
          style={{ background: "linear-gradient(135deg, #2463FF, #8B2FFF)", boxShadow: "0 4px 24px rgba(36,99,255,0.45)" }}>
          <ArrowLeft className="w-4 h-4" />
          Ver Projetos
        </Link>
      </div>
    </div>
  )
}

// ─── Nav Dots ─────────────────────────────────────────────────────────────────

function NavDots({ total, current, goto }: { total: number; current: number; goto: (i: number) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <button key={i} onClick={() => goto(i)}
          className="transition-all duration-300 rounded-full"
          style={{
            width: i === current ? 22 : 6,
            height: 6,
            background: i === current
              ? "linear-gradient(90deg, #00C4E0, #2463FF, #8B2FFF)"
              : "rgba(255,255,255,0.18)",
            boxShadow: i === current ? "0 0 12px rgba(36,99,255,0.70), 0 0 24px rgba(139,47,255,0.40)" : "none",
          }}
        />
      ))}
    </div>
  )
}

// ─── Project Selector ────────────────────────────────────────────────────────

function ProjectSelector({
  slides,
  onStart,
}: {
  slides: ProjectSlideData[]
  onStart: (selected: ProjectSlideData[]) => void
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(slides.map((s) => s.id)))
  const [search,   setSearch]   = useState("")

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return q ? slides.filter((s) => s.title.toLowerCase().includes(q)) : slides
  }, [slides, search])

  const toggleAll = () => {
    if (selected.size === slides.length) setSelected(new Set())
    else setSelected(new Set(slides.map((s) => s.id)))
  }

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleStart = () => {
    const chosen = slides.filter((s) => selected.has(s.id))
    if (chosen.length === 0) return
    onStart(chosen)
  }

  const date = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })

  return (
    <div className="flex-1 relative overflow-hidden flex flex-col" style={{ background: "#020509" }}>
      <style>{KEYFRAMES}</style>

      {/* Background */}
      <div className="absolute inset-0 overflow-hidden" style={{ zIndex: 0 }}>
        <div className="absolute inset-0" style={{
          background: "radial-gradient(ellipse 120% 80% at 50% -10%, #091428 0%, #040B1C 45%, #020509 100%)",
        }} />
        <div style={{ opacity: 0.50 }}><StarField /></div>
        <div className="absolute pointer-events-none" style={{
          width: 600, height: 600, top: -150, left: -150, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(36,99,255,0.30) 0%, transparent 70%)",
          filter: "blur(70px)", animation: "cornerPulse 8s ease-in-out infinite",
        }} />
        <div className="absolute pointer-events-none" style={{
          width: 500, height: 500, bottom: -120, right: -120, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(139,47,255,0.28) 0%, transparent 70%)",
          filter: "blur(65px)", animation: "cornerPulse 8s ease-in-out 4s infinite",
        }} />
        <div className="absolute top-0 left-0 right-0" style={{ height: 1,
          background: "linear-gradient(90deg, transparent 0%, rgba(36,99,255,0.70) 25%, rgba(100,180,255,0.90) 50%, rgba(139,47,255,0.70) 75%, transparent 100%)",
        }} />
      </div>

      {/* ── Top bar ── */}
      <div className="relative z-10 flex items-center justify-between px-8 py-5 shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <VendemmiaLogo size="sm" />
        <div className="text-center">
          <p className="text-xs font-bold tracking-[0.20em] uppercase" style={{ color: "rgba(150,185,255,0.35)" }}>
            Status Report · {date}
          </p>
        </div>
        <div style={{ width: 130 }} />
      </div>

      {/* ── Body ── */}
      <div className="relative z-10 flex-1 overflow-y-auto px-8 py-8" style={{ scrollbarWidth: "none" }}>
        <div className="max-w-4xl mx-auto space-y-6">

          {/* Title */}
          <div className="text-center space-y-3">
            <h1 className="font-black tracking-tight" style={{
              fontSize: "clamp(2rem, 4vw, 3rem)",
              background: "linear-gradient(135deg, #ffffff 0%, #E0EAFF 40%, rgba(255,255,255,0.65) 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              filter: "drop-shadow(0 0 30px rgba(36,99,255,0.30))",
            }}>
              Selecionar Projetos
            </h1>
            <p className="text-sm font-medium" style={{ color: "rgba(150,185,255,0.45)" }}>
              Escolha quais projetos serão apresentados nesta reunião
            </p>
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "rgba(150,185,255,0.30)" }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar projeto…"
                className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl outline-none"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  color: "rgba(200,220,255,0.80)",
                }}
              />
            </div>

            {/* Toggle all */}
            <button
              onClick={toggleAll}
              className="px-4 py-2.5 rounded-xl text-xs font-bold tracking-wide transition-all"
              style={{
                background: selected.size === slides.length ? "rgba(36,99,255,0.20)" : "rgba(255,255,255,0.05)",
                border: `1px solid ${selected.size === slides.length ? "rgba(36,99,255,0.40)" : "rgba(255,255,255,0.10)"}`,
                color: selected.size === slides.length ? "#60A5FA" : "rgba(150,185,255,0.50)",
              }}
            >
              {selected.size === slides.length ? "Limpar seleção" : "Selecionar todos"}
            </button>
          </div>

          {/* Project grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filtered.map((p) => {
              const isSelected = selected.has(p.id)
              const status = STATUS_CFG[p.status] ?? { label: p.status, color: "#94A3B8", glow: "" }
              const progress = p.tasks.total > 0
                ? Math.round((p.tasks.completed / p.tasks.total) * 100)
                : p.progress

              return (
                <button
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  className="text-left rounded-2xl p-5 transition-all duration-200 group"
                  style={{
                    background: isSelected
                      ? `linear-gradient(135deg, ${status.color}12 0%, ${status.color}06 100%)`
                      : "rgba(255,255,255,0.03)",
                    border: `1px solid ${isSelected ? status.color + "40" : "rgba(255,255,255,0.07)"}`,
                    boxShadow: isSelected ? `0 0 25px ${status.color}12, 0 0 60px ${status.color}06` : "none",
                  }}
                >
                  <div className="flex items-start gap-4">
                    {/* Checkbox */}
                    <div className="shrink-0 mt-0.5 w-5 h-5 rounded-md flex items-center justify-center transition-all"
                      style={{
                        background: isSelected ? `linear-gradient(135deg, ${status.color}, ${status.color}CC)` : "rgba(255,255,255,0.07)",
                        border: `1px solid ${isSelected ? "transparent" : "rgba(255,255,255,0.12)"}`,
                        boxShadow: isSelected ? `0 0 12px ${status.color}60` : "none",
                      }}>
                      {isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Status + title */}
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{
                          background: status.color,
                          boxShadow: `0 0 6px ${status.color}`,
                        }} />
                        <span className="text-[10px] font-bold tracking-wide" style={{ color: status.color }}>
                          {status.label}
                        </span>
                      </div>
                      <h3 className="font-bold text-sm leading-snug line-clamp-2 transition-colors"
                        style={{ color: isSelected ? "rgba(220,235,255,0.90)" : "rgba(180,205,255,0.55)" }}>
                        {p.title}
                      </h3>
                      {p.sponsor && (
                        <p className="text-[11px] mt-0.5" style={{ color: "rgba(150,185,255,0.28)" }}>
                          {p.sponsor}
                        </p>
                      )}

                      {/* Progress bar */}
                      <div className="mt-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px]" style={{ color: "rgba(150,185,255,0.30)" }}>
                            {p.tasks.completed}/{p.tasks.total} tarefas
                          </span>
                          <span className="text-[10px] font-bold" style={{ color: isSelected ? status.color : "rgba(150,185,255,0.30)" }}>
                            {progress}%
                          </span>
                        </div>
                        <div className="h-1 rounded-full" style={{ background: "rgba(255,255,255,0.07)" }}>
                          <div className="h-full rounded-full transition-all" style={{
                            width: `${progress}%`,
                            background: isSelected
                              ? `linear-gradient(90deg, ${status.color}CC, ${status.color})`
                              : "rgba(255,255,255,0.12)",
                            boxShadow: isSelected ? `0 0 8px ${status.color}60` : "none",
                          }} />
                        </div>
                      </div>

                      {/* Meta */}
                      <div className="flex items-center gap-3 mt-2.5">
                        <span className="flex items-center gap-1 text-[10px]" style={{ color: "rgba(150,185,255,0.28)" }}>
                          <Users className="w-3 h-3" />
                          {p.team} membro{p.team !== 1 ? "s" : ""}
                        </span>
                        {(p.risks.critical + p.risks.high) > 0 && (
                          <span className="flex items-center gap-1 text-[10px] font-bold" style={{
                            color: p.risks.critical > 0 ? "#FCA5A5" : "#FCD34D",
                          }}>
                            <AlertTriangle className="w-3 h-3" />
                            {p.risks.critical + p.risks.high} risco{p.risks.critical + p.risks.high > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Bottom action bar ── */}
      <div className="relative z-10 shrink-0 px-8 py-5 flex items-center justify-between gap-6"
        style={{
          background: "linear-gradient(to top, rgba(2,5,9,0.98) 0%, rgba(2,5,9,0.80) 100%)",
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}>
        <Link href="/projects"
          className="flex items-center gap-1.5 text-xs font-semibold transition-all"
          style={{ color: "rgba(150,185,255,0.30)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(150,185,255,0.65)" }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(150,185,255,0.30)" }}
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Projetos
        </Link>

        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4" style={{ color: "rgba(150,185,255,0.28)" }} />
          <span className="text-sm font-semibold" style={{ color: "rgba(150,185,255,0.45)" }}>
            {selected.size} de {slides.length} projeto{slides.length !== 1 ? "s" : ""} selecionado{selected.size !== 1 ? "s" : ""}
          </span>
        </div>

        <button
          onClick={handleStart}
          disabled={selected.size === 0}
          className="flex items-center gap-2.5 px-7 py-3 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
          style={{
            background: "linear-gradient(135deg, #2463FF, #8B2FFF)",
            boxShadow: selected.size > 0 ? "0 0 30px rgba(36,99,255,0.45), 0 0 60px rgba(139,47,255,0.25)" : "none",
          }}
        >
          <Play className="w-4 h-4 fill-white" />
          Iniciar Apresentação
        </button>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ReportClient({ slides: allSlides }: { slides: ProjectSlideData[] }) {
  // ── All hooks unconditionally first ──────────────────────────────────────────
  const [started,      setStarted]      = useState(false)
  const [activeSlides, setActiveSlides] = useState<ProjectSlideData[]>(allSlides)
  const [current, setCurrent]           = useState(0)
  const [dir, setDir]                   = useState(1)
  const [isFullscreen, setIsFs]         = useState(false)
  const [idle, setIdle]                 = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const idleTimer    = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const resetIdle = useCallback(() => {
    setIdle(false)
    clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => setIdle(true), 4500)
  }, [])

  // allSlideList depends on activeSlides length (derived, not a hook)
  const allSlideList = [
    "cover" as const,
    ...activeSlides.map(() => "project" as const),
    ...(activeSlides.length > 1 ? ["summary" as const] : []),
  ]
  const total = allSlideList.length

  const go = useCallback((idx: number) => {
    if (idx < 0 || idx >= total) return
    setDir(idx > current ? 1 : -1)
    setCurrent(idx)
    resetIdle()
  }, [current, total, resetIdle])

  const next = useCallback(() => go(current + 1), [go, current])
  const prev = useCallback(() => go(current - 1), [go, current])

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().catch(() => {})
    } else {
      document.exitFullscreen?.().catch(() => {})
    }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); next() }
      if (e.key === "ArrowLeft") prev()
      if (e.key === "Escape" && document.fullscreenElement) document.exitFullscreen?.()
      if (e.key === "f" || e.key === "F") toggleFullscreen()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [next, prev, toggleFullscreen])

  useEffect(() => {
    function onFsChange() { setIsFs(!!document.fullscreenElement) }
    document.addEventListener("fullscreenchange", onFsChange)
    return () => document.removeEventListener("fullscreenchange", onFsChange)
  }, [])

  useEffect(() => {
    if (!started) return
    resetIdle()
    return () => clearTimeout(idleTimer.current)
  }, [resetIdle, started])

  const date = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })

  // ── Early returns after all hooks ─────────────────────────────────────────────
  if (!started) {
    if (allSlides.length === 0) {
      return (
        <div className="flex-1 relative overflow-hidden">
          <EmptyState />
        </div>
      )
    }
    return (
      <ProjectSelector
        slides={allSlides}
        onStart={(chosen) => {
          setActiveSlides(chosen)
          setCurrent(0)
          setStarted(true)
        }}
      />
    )
  }

  const slideType  = allSlideList[current]
  const projectIdx = current - 1

  return (
    <div
      ref={containerRef}
      className="flex-1 relative overflow-hidden"
      style={{ background: "#020509", cursor: "default" }}
      onMouseMove={resetIdle}
      onClick={(e) => {
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
        const x = e.clientX - rect.left
        if (x > rect.width * 0.65) next()
        else if (x < rect.width * 0.35) prev()
      }}
    >
      <AnimatePresence mode="wait" custom={dir}>
        <motion.div key={current} custom={dir} variants={slideVariants}
          initial="enter" animate="center" exit="exit"
          className="absolute inset-0"
          style={{ paddingBottom: 68 }}
        >
          {slideType === "cover" && (
            <CoverSlide count={activeSlides.length} date={date} />
          )}
          {slideType === "project" && projectIdx >= 0 && projectIdx < activeSlides.length && (
            <ProjectSlide data={activeSlides[projectIdx]} index={projectIdx + 1} total={activeSlides.length} />
          )}
          {slideType === "summary" && (
            <SummarySlide projects={activeSlides} />
          )}
        </motion.div>
      </AnimatePresence>

      {/* ── Nav Bar ── */}
      <motion.div
        animate={{ opacity: idle ? 0 : 1, y: idle ? 8 : 0 }}
        transition={{ duration: 0.35 }}
        className="absolute bottom-0 left-0 right-0 h-[68px] flex items-center justify-between px-8"
        style={{
          background: "linear-gradient(to top, rgba(2,5,9,0.97) 0%, rgba(2,5,9,0.60) 60%, transparent 100%)",
          zIndex: 50,
          borderTop: "1px solid rgba(255,255,255,0.04)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => { setStarted(false); setCurrent(0) }}
          className="flex items-center gap-1.5 text-xs font-semibold transition-all"
          style={{ color: "rgba(150,185,255,0.30)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(150,185,255,0.65)" }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(150,185,255,0.30)" }}
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Seleção
        </button>

        <div className="flex items-center gap-4">
          <button onClick={prev} disabled={current === 0}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all disabled:opacity-20 hover:opacity-80"
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(180,210,255,0.70)" }}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <NavDots total={total} current={current} goto={go} />
          <button onClick={next} disabled={current === total - 1}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all disabled:opacity-20 hover:opacity-80"
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(180,210,255,0.70)" }}>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs" style={{ color: "rgba(150,185,255,0.22)" }}>
            {current + 1} / {total} · F tela cheia
          </span>
          <button onClick={toggleFullscreen}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:opacity-80"
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(180,210,255,0.50)" }}>
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </motion.div>

      {/* Edge nav hints */}
      {current > 0 && (
        <div className="absolute left-0 top-0 bottom-16 w-16 flex items-center justify-start pl-4 pointer-events-none" style={{ zIndex: 40 }}>
          <motion.div animate={{ opacity: idle ? 0 : 0.30 }}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <ChevronLeft className="w-4 h-4 text-white" />
          </motion.div>
        </div>
      )}
      {current < total - 1 && (
        <div className="absolute right-0 top-0 bottom-16 w-16 flex items-center justify-end pr-4 pointer-events-none" style={{ zIndex: 40 }}>
          <motion.div animate={{ opacity: idle ? 0 : 0.30 }}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <ChevronRight className="w-4 h-4 text-white" />
          </motion.div>
        </div>
      )}
    </div>
  )
}
