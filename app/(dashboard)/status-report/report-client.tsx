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
  DollarSign, Target, RefreshCw, Activity,
} from "lucide-react"

// ─── Types ───────────────────────────────────────────────────────────────────

export type ProjectSlideData = {
  id: string; title: string; status: string; sponsor: string | null; progress: number
  tasks: {
    total: number; completed: number; inProgress: number; delayed: number; planning: number
    completedTitles: string[]; inProgressTitles: string[]; plannedTitles: string[]
  }
  taskDetails: {
    recentlyCompleted: { title: string }[]
    inProgress:  { title: string; responsible: string | null; endDate: string | null }[]
    delayed:     { title: string; responsible: string | null; endDate: string | null; daysLate: number }[]
    upcoming:    { title: string; responsible: string | null; daysUntil: number; endDate: string | null }[]
  }
  risks: {
    critical: number; high: number
    items: { level: string; description: string; mitigation: string | null; owner: string | null }[]
  }
  team: number; members: { name: string; role: string }[]
  daysLeft: number | null; economy: number | null; budget: number | null
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
  idc: number | null; idp: number | null; timelineProgress: number | null; meetingsCount: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  IN_PROGRESS: { label: "Em Andamento", color: "#60A5FA", bg: "rgba(96,165,250,0.15)" },
  PILOT:       { label: "Em Validação", color: "#22D3EE", bg: "rgba(34,211,238,0.15)" },
  RAMP_UP:     { label: "Ramp-Up",      color: "#C084FC", bg: "rgba(192,132,252,0.15)" },
  GO_LIVE:     { label: "GO LIVE",      color: "#34D399", bg: "rgba(52,211,153,0.18)" },
  POST_GOLIVE: { label: "Pós GO LIVE",  color: "#67E8F9", bg: "rgba(103,232,249,0.15)" },
}

const slideVariants = {
  enter: (dir: number) => ({ opacity: 0, x: dir > 0 ? 70 : -70, scale: 0.98 }),
  center: { opacity: 1, x: 0, scale: 1, transition: { duration: 0.46, ease: "easeOut" as const } },
  exit:  (dir: number) => ({ opacity: 0, x: dir > 0 ? -70 : 70, scale: 0.98, transition: { duration: 0.28, ease: "easeIn" as const } }),
}

// ─── CSS Keyframes ────────────────────────────────────────────────────────────

const KF = `
  @keyframes orbitA1 {
    0%   { transform: translate(-50%,-50%) rotate(0deg)   translateX(280px); }
    100% { transform: translate(-50%,-50%) rotate(360deg) translateX(280px); }
  }
  @keyframes orbitA2 {
    0%   { transform: translate(-50%,-50%) rotate(0deg)   translateX(220px); }
    100% { transform: translate(-50%,-50%) rotate(360deg) translateX(220px); }
  }
  @keyframes orbitB1 {
    0%   { transform: translate(-50%,-50%) rotate(0deg)    translateX(165px) translateY(-55px); }
    100% { transform: translate(-50%,-50%) rotate(-360deg) translateX(165px) translateY(-55px); }
  }
  @keyframes orbitB2 {
    0%   { transform: translate(-50%,-50%) rotate(0deg)   translateX(125px) translateY(50px); }
    100% { transform: translate(-50%,-50%) rotate(360deg) translateX(125px) translateY(50px); }
  }
  @keyframes aurora1 {
    0%,100% { opacity:0.65; transform:scale(1) rotate(-3deg) translateY(0); }
    50%     { opacity:1;    transform:scale(1.10) rotate(2deg) translateY(-18px); }
  }
  @keyframes aurora2 {
    0%,100% { opacity:0.50; transform:scale(1.08) rotate(2deg) translateX(0); }
    50%     { opacity:0.85; transform:scale(1)    rotate(-3deg) translateX(28px); }
  }
  @keyframes coreGlow {
    0%,100% { opacity:0.55; transform:translate(-50%,-50%) scale(1); }
    50%     { opacity:0.95; transform:translate(-50%,-50%) scale(1.38); }
  }
  @keyframes beamSweep {
    0%   { left:-18%; opacity:0; }
    8%   { opacity:1; }
    88%  { opacity:1; }
    100% { left:116%; opacity:0; }
  }
  @keyframes orbPulse {
    0%,100% { opacity:0.65; transform:scale(1); }
    50%     { opacity:1;    transform:scale(1.15); }
  }
  @keyframes ringGrow {
    0%   { opacity:0.4; transform:translate(-50%,-50%) scale(0.82); }
    60%  { opacity:0.1; }
    100% { opacity:0;   transform:translate(-50%,-50%) scale(1.22); }
  }
  @keyframes floatUp {
    0%   { opacity:0; transform:translateY(0) scale(1); }
    10%  { opacity:0.7; }
    90%  { opacity:0.3; }
    100% { opacity:0; transform:translateY(-85px) scale(0.5); }
  }
  @keyframes scanLine {
    0%   { top:-3px; opacity:0; }
    5%   { opacity:0.06; }
    95%  { opacity:0.03; }
    100% { top:100%; opacity:0; }
  }
  @keyframes glowPulse {
    0%,100% { box-shadow:0 0 0 1px rgba(96,165,250,0.35),0 0 40px rgba(36,99,255,0.22),0 8px 40px rgba(0,0,0,0.55); }
    50%     { box-shadow:0 0 0 1px rgba(96,165,250,0.55),0 0 70px rgba(36,99,255,0.40),0 8px 50px rgba(0,0,0,0.62); }
  }
`

// ─── Background with orbs ─────────────────────────────────────────────────────

function SlideBackground({ accent = "#2463FF" }: { accent?: string }) {
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ zIndex: 0 }}>
      <style>{KF}</style>

      {/* Base navy — lighter than pitch black */}
      <div className="absolute inset-0" style={{
        background: "radial-gradient(ellipse 120% 80% at 50% -10%, #0E2040 0%, #081528 45%, #040C1C 100%)",
      }} />

      {/* Subtle grid */}
      <div className="absolute inset-0" style={{
        backgroundImage: "linear-gradient(rgba(36,99,255,0.035) 1px,transparent 1px),linear-gradient(90deg,rgba(36,99,255,0.035) 1px,transparent 1px)",
        backgroundSize: "50px 50px",
      }} />

      {/* Aurora layers */}
      <div className="absolute inset-0" style={{
        background: "radial-gradient(ellipse 85% 50% at -8% 8%, rgba(20,70,210,0.28) 0%, transparent 65%)",
        animation: "aurora1 11s ease-in-out infinite alternate",
        transformOrigin: "18% 8%",
      }} />
      <div className="absolute inset-0" style={{
        background: `radial-gradient(ellipse 70% 50% at 106% 95%, ${accent}2A 0%, transparent 62%)`,
        animation: "aurora2 15s ease-in-out infinite alternate",
        transformOrigin: "90% 88%",
      }} />

      {/* Central core glow */}
      <div className="absolute pointer-events-none" style={{
        top: "50%", left: "50%", width: 780, height: 680, borderRadius: "50%",
        background: `radial-gradient(circle, rgba(36,99,255,0.18) 0%, rgba(139,47,255,0.12) 30%, ${accent}0A 55%, transparent 72%)`,
        filter: "blur(42px)", animation: "coreGlow 6s ease-in-out infinite",
      }} />

      {/* ── Orbiting colored orbs ── */}
      <div className="absolute pointer-events-none" style={{
        top: "50%", left: "50%", width: 190, height: 190, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(239,68,68,0.88) 0%, transparent 70%)",
        filter: "blur(18px)", animation: "orbitA1 9s linear infinite",
      }} />
      <div className="absolute pointer-events-none" style={{
        top: "50%", left: "50%", width: 155, height: 155, borderRadius: "50%",
        background: `radial-gradient(circle, ${accent}CC 0%, transparent 70%)`,
        filter: "blur(15px)", animation: "orbitA2 14s linear infinite reverse", animationDelay: "-5s",
      }} />
      <div className="absolute pointer-events-none" style={{
        top: "50%", left: "50%", width: 115, height: 115, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(16,185,129,0.80) 0%, transparent 70%)",
        filter: "blur(12px)", animation: "orbitB1 8s linear infinite", animationDelay: "-2s",
      }} />
      <div className="absolute pointer-events-none" style={{
        top: "50%", left: "50%", width: 88, height: 88, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(248,244,255,0.70) 0%, transparent 70%)",
        filter: "blur(10px)", animation: "orbitB2 11s linear infinite reverse", animationDelay: "-6s",
      }} />

      {/* ── Sweeping light beams ── */}
      <div className="absolute pointer-events-none" style={{
        top: 0, width: 170, height: "100%",
        background: "linear-gradient(to right,transparent,rgba(36,99,255,0.16),rgba(139,47,255,0.11),transparent)",
        filter: "blur(28px)", animation: "beamSweep 9s ease-in-out infinite",
      }} />
      <div className="absolute pointer-events-none" style={{
        top: 0, width: 110, height: "100%",
        background: `linear-gradient(to right,transparent,${accent}1E,transparent)`,
        filter: "blur(22px)", animation: "beamSweep 13s ease-in-out 4.5s infinite",
      }} />

      {/* Corner glows */}
      <div className="absolute pointer-events-none" style={{
        top: -130, left: -130, width: 480, height: 480, borderRadius: "50%",
        background: "radial-gradient(circle,rgba(36,99,255,0.32) 0%,transparent 68%)",
        filter: "blur(58px)", animation: "orbPulse 7s ease-in-out infinite",
      }} />
      <div className="absolute pointer-events-none" style={{
        bottom: -100, right: -100, width: 420, height: 420, borderRadius: "50%",
        background: `radial-gradient(circle,${accent}40 0%,transparent 68%)`,
        filter: "blur(54px)", animation: "orbPulse 9s ease-in-out 3s infinite",
      }} />

      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0" style={{
        height: 3,
        background: "linear-gradient(90deg,transparent 0%,#3B82F6 22%,#8B5CF6 50%,#22D3EE 78%,transparent 100%)",
      }} />

      {/* Scan line */}
      <div className="absolute left-0 right-0" style={{
        height: 2,
        background: "linear-gradient(90deg,transparent,rgba(99,179,255,0.07),transparent)",
        animation: "scanLine 16s linear infinite",
        pointerEvents: "none",
      }} />

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0" style={{
        height: 100,
        background: "linear-gradient(to top,rgba(4,12,28,0.65) 0%,transparent 100%)",
      }} />
    </div>
  )
}

// ─── Particles ────────────────────────────────────────────────────────────────

function Particles({ n = 10 }: { n?: number }) {
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
          background: "rgba(148,185,255,0.40)",
          animation: `floatUp ${p.dur} ease-in-out ${p.del} infinite`,
        }} />
      ))}
    </div>
  )
}

// ─── Vendemmia Logo ───────────────────────────────────────────────────────────

function VendemmiaLogo({ size = "md" }: { size?: "sm" | "md" | "lg" | "xl" }) {
  const cfg = {
    sm: { h: 22, w: 110, p: "6px 14px", r: "12px" },
    md: { h: 28, w: 140, p: "8px 20px", r: "14px" },
    lg: { h: 38, w: 190, p: "10px 24px", r: "16px" },
    xl: { h: 58, w: 295, p: "15px 40px", r: "22px" },
  }[size]
  return (
    <div style={{
      background: "rgba(255,255,255,0.95)", backdropFilter: "blur(20px)",
      borderRadius: cfg.r, padding: cfg.p,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      animation: "glowPulse 4s ease-in-out infinite", position: "relative",
    }}>
      <div style={{
        position: "absolute", inset: 0, borderRadius: cfg.r, pointerEvents: "none",
        background: "linear-gradient(135deg,rgba(59,130,246,0.09) 0%,rgba(139,92,246,0.06) 100%)",
      }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/vendemmia.png" alt="Vendemmia"
        style={{ height: cfg.h, width: cfg.w, objectFit: "contain", position: "relative" }} />
    </div>
  )
}

// ─── EVM Gauge ────────────────────────────────────────────────────────────────

function EVMGauge({ value, label }: { value: number | null; label: string }) {
  const [anim, setAnim] = useState(0)
  useEffect(() => { const t = setTimeout(() => setAnim(value ?? 0), 300); return () => clearTimeout(t) }, [value])

  const MAX = 2.0
  const pct = Math.min(MAX, Math.max(0, anim)) / MAX
  const { color, glow, badge } = value === null
    ? { color: "#475569", glow: "rgba(71,85,105,0.3)",   badge: "Sem dados" }
    : value >= 1.0  ? { color: "#10B981", glow: "rgba(16,185,129,0.6)",  badge: "Em linha" }
    : value >= 0.85 ? { color: "#F59E0B", glow: "rgba(245,158,11,0.6)", badge: "Atenção" }
    : { color: "#EF4444", glow: "rgba(239,68,68,0.6)",   badge: "Em risco" }

  const S = 96; const cx = S/2; const cy = S*0.65; const r = S*0.38; const sw = 7
  const half = Math.PI * r; const fill = pct * half

  return (
    <div className="flex flex-col items-center" style={{ gap: 4 }}>
      <svg width={S} height={cy + sw/2 + 5} viewBox={`0 0 ${S} ${cy + sw/2 + 5}`}>
        <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 0 ${cx+r} ${cy}`} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth={sw} />
        {[0.85,1.0].map((thr) => {
          const a = (180+(thr/MAX)*180)*Math.PI/180
          return <circle key={thr} cx={cx+r*Math.cos(a)} cy={cy+r*Math.sin(a)} r={2.5}
            fill={thr===1?"#10B981":"#F59E0B"} opacity={0.8} />
        })}
        <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 0 ${cx+r} ${cy}`} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round"
          strokeDasharray={`${fill} ${half}`}
          style={{ filter:`drop-shadow(0 0 5px ${glow})`, transition:"stroke-dasharray 1.2s cubic-bezier(0.22,1,0.36,1)" }} />
        <text x={cx} y={cy-3} textAnchor="middle" fill={color}
          style={{ fontSize:15, fontWeight:800, fontFamily:"Inter,sans-serif", filter:`drop-shadow(0 0 6px ${glow})` }}>
          {value !== null ? value.toFixed(2) : "N/A"}
        </text>
      </svg>
      <p style={{ fontSize:9, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.14em", color:"rgba(200,220,255,0.55)" }}>{label}</p>
      <span style={{ fontSize:8, fontWeight:700, padding:"2px 7px", borderRadius:20, background:`${color}22`, color, border:`1px solid ${color}44` }}>{badge}</span>
    </div>
  )
}

// ─── Progress Ring ────────────────────────────────────────────────────────────

function ProgressRing({ value, color="#3B82F6", size=86 }: { value:number; color?:string; size?:number }) {
  const [anim, setAnim] = useState(0)
  useEffect(() => { const t = setTimeout(()=>setAnim(value),200); return ()=>clearTimeout(t) }, [value])
  const r = size*0.40; const c = 2*Math.PI*r; const off = c-(anim/100)*c
  return (
    <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={size*0.08} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={size*0.08}
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
        style={{ filter:`drop-shadow(0 0 6px ${color}88)`, transition:"stroke-dashoffset 1.2s cubic-bezier(0.22,1,0.36,1)" }} />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        style={{ transform:`rotate(90deg)`, transformOrigin:`${size/2}px ${size/2}px`,
          fill:"white", fontSize:size*0.22, fontWeight:900, fontFamily:"Inter,sans-serif" }}>
        {anim}%
      </text>
    </svg>
  )
}

// ─── Glass Card ───────────────────────────────────────────────────────────────

function GCard({ children, style, className }: { children:React.ReactNode; style?:React.CSSProperties; className?:string }) {
  return (
    <div className={className} style={{
      background:"rgba(255,255,255,0.055)", border:"1px solid rgba(255,255,255,0.11)",
      borderRadius:12, backdropFilter:"blur(10px)", ...style,
    }}>{children}</div>
  )
}

// ─── Section Label ────────────────────────────────────────────────────────────

function SL({ children, right }: { children:React.ReactNode; right?:React.ReactNode }) {
  return (
    <div className="flex items-center justify-between" style={{ marginBottom:7 }}>
      <p style={{ fontSize:8.5, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.16em", color:"rgba(148,185,255,0.48)" }}>{children}</p>
      {right}
    </div>
  )
}

// ─── Traffic Light ────────────────────────────────────────────────────────────

type TL = "GREEN"|"YELLOW"|"RED"
const LIGHT: Record<TL,{color:string;glow:string;label:string}> = {
  GREEN:  {color:"#10B981",glow:"rgba(16,185,129,0.70)",label:"Em Linha"},
  YELLOW: {color:"#F59E0B",glow:"rgba(245,158,11,0.70)",label:"Atenção"},
  RED:    {color:"#EF4444",glow:"rgba(239,68,68,0.70)",label:"Risco"},
}
function toTL(v:string|null|undefined):TL{ return (v&&v in LIGHT)?v as TL:"GREEN" }

function TDot({light,label}:{light:TL;label:string}) {
  const c=LIGHT[light]
  return (
    <div className="flex flex-col items-center gap-1">
      <div style={{ width:32,height:32,borderRadius:9,
        background:`linear-gradient(135deg,${c.color}EE,${c.color}99)`,
        boxShadow:`0 0 14px ${c.glow},0 0 28px ${c.glow}55,inset 0 1px 0 rgba(255,255,255,0.32)`,
        border:`1.5px solid ${c.color}70` }} />
      <span style={{fontSize:8,fontWeight:700,color:"rgba(200,220,255,0.50)",textTransform:"uppercase",letterSpacing:"0.08em"}}>{label}</span>
    </div>
  )
}

// ─── Date formatter ───────────────────────────────────────────────────────────

function fmt(d:string|null) { return d ? format(new Date(d),"dd/MM/yy") : "—" }

// ═══════════════════════════════════════════════════════════════════════════════
// COVER SLIDE
// ═══════════════════════════════════════════════════════════════════════════════

function CoverSlide({slides,date,totalMeetings}:{slides:ProjectSlideData[];date:string;totalMeetings:number}) {
  const count      = slides.length
  const avgProg    = count>0 ? Math.round(slides.reduce((s,p)=>s+p.progress,0)/count) : 0
  const critRisks  = slides.reduce((s,p)=>s+p.risks.critical,0)
  const highRisks  = slides.reduce((s,p)=>s+p.risks.high,0)
  const totalTasks = slides.reduce((s,p)=>s+p.tasks.total,0)
  const doneTasks  = slides.reduce((s,p)=>s+p.tasks.completed,0)
  const totalMembers = slides.reduce((s,p)=>s+p.team,0)

  const stats = [
    { icon:Zap,        val:count,             label:count===1?"Projeto Ativo":"Projetos Ativos", color:"#60A5FA" },
    { icon:Calendar,   val:totalMeetings,     label:"Reuniões Realizadas",                       color:"#C084FC" },
    { icon:TrendingUp, val:`${avgProg}%`,     label:"Conclusão Média",                           color:"#34D399" },
    { icon:CheckCheck, val:`${doneTasks}/${totalTasks}`, label:"Tarefas Concluídas",            color:"#22D3EE" },
    {
      icon:AlertTriangle,
      val: critRisks>0?critRisks:highRisks>0?highRisks:"✓",
      label: critRisks>0?"Riscos Críticos":highRisks>0?"Riscos Altos":"Sem Riscos Críticos",
      color: critRisks>0?"#FCA5A5":highRisks>0?"#FCD34D":"#34D399",
    },
    { icon:Users, val:totalMembers, label:"Participantes", color:"#FB923C" },
  ]

  return (
    <div className="relative flex flex-col items-center justify-center h-full select-none overflow-hidden">
      <SlideBackground />
      <Particles n={18} />
      {[0,1,2].map((i)=>(
        <div key={i} className="absolute pointer-events-none" style={{
          top:"50%",left:"50%", width:320+i*230,height:320+i*230,borderRadius:"50%",
          border:`1px solid rgba(36,99,255,${0.13-i*0.03})`,
          animation:`ringGrow ${5+i*1.3}s cubic-bezier(0.4,0,0.6,1) ${i*1.2}s infinite`,
        }}/>
      ))}

      <div className="relative z-10 flex flex-col items-center gap-5 text-center w-full px-12 max-w-5xl">
        <motion.div initial={{opacity:0,y:-24,scale:0.90}} animate={{opacity:1,y:0,scale:1}} transition={{delay:0.08,duration:0.70,ease:"easeOut"}}>
          <VendemmiaLogo size="xl" />
        </motion.div>

        <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.25,duration:0.60}} className="space-y-3">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full"
            style={{background:"rgba(59,130,246,0.12)",border:"1px solid rgba(96,165,250,0.24)"}}>
            <BarChart3 className="w-3 h-3" style={{color:"rgba(148,185,255,0.65)"}}/>
            <span style={{fontSize:10.5,fontWeight:800,letterSpacing:"0.20em",textTransform:"uppercase",color:"rgba(148,185,255,0.65)"}}>
              Gestão de Projetos · Portfólio
            </span>
          </div>
          <h1 style={{
            fontSize:"clamp(3rem,5.5vw,4.6rem)", fontWeight:900, letterSpacing:"-0.02em", lineHeight:1.05,
            background:"linear-gradient(135deg,#ffffff 0%,#C7DEFF 45%,rgba(255,255,255,0.65) 100%)",
            WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
            filter:"drop-shadow(0 0 40px rgba(59,130,246,0.40))",
          }}>Status Report</h1>
        </motion.div>

        <motion.div initial={{opacity:0,y:18,scale:0.96}} animate={{opacity:1,y:0,scale:1}} transition={{delay:0.42,duration:0.60,ease:"easeOut"}}
          className="w-full grid gap-3" style={{gridTemplateColumns:"repeat(3,1fr)"}}>
          {stats.map(({icon:Icon,val,label,color})=>(
            <GCard key={label} style={{padding:"16px 12px",textAlign:"center"}}>
              <Icon style={{width:15,height:15,color,marginBottom:6}}/>
              <p style={{fontSize:"2.1rem",fontWeight:900,color,lineHeight:1,filter:`drop-shadow(0 0 10px ${color}80)`}}>{val}</p>
              <p style={{fontSize:9,fontWeight:700,marginTop:5,textTransform:"uppercase",letterSpacing:"0.10em",color:"rgba(180,210,255,0.48)"}}>{label}</p>
            </GCard>
          ))}
        </motion.div>

        <motion.div initial={{opacity:0}} animate={{opacity:1}} transition={{delay:0.65,duration:0.50}} className="flex flex-col items-center gap-2">
          <p style={{fontSize:11.5,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.18em",color:"rgba(255,255,255,0.25)"}}>{date}</p>
          <p className="flex items-center gap-2" style={{fontSize:11,color:"rgba(148,185,255,0.32)"}}>
            <ChevronRight className="w-3.5 h-3.5"/>Pressione → ou clique para avançar · F para tela cheia
          </p>
        </motion.div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROJECT SLIDE
// ═══════════════════════════════════════════════════════════════════════════════

function ProjectSlide({data,index,total}:{data:ProjectSlideData;index:number;total:number}) {
  const status = STATUS_CFG[data.status]??{label:data.status,color:"#94A3B8",bg:"rgba(148,163,184,0.12)"}
  const costL = toTL(data.reportStatus.cost)
  const schL  = toTL(data.reportStatus.schedule)
  const resL  = toTL(data.reportStatus.resources)
  const ovL   = toTL(data.reportStatus.overall)

  const daysStr = data.daysLeft===null ? null
    : data.daysLeft<0  ? `${Math.abs(data.daysLeft)}d atrasado`
    : data.daysLeft===0 ? "Vence hoje"
    : `${data.daysLeft}d restantes`

  const td = data.taskDetails

  return (
    <div className="relative flex flex-col h-full select-none overflow-hidden">
      <SlideBackground accent={status.color}/>
      <Particles n={6}/>

      {/* ── Header ── */}
      <div className="relative z-10 flex items-start justify-between px-7 pt-5 pb-3 shrink-0">
        <div className="flex-1 min-w-0 pr-4">
          <div className="flex items-center gap-2 mb-1.5">
            <span style={{fontSize:8.5,fontWeight:800,padding:"3px 10px",borderRadius:20,
              background:status.bg,color:status.color,border:`1px solid ${status.color}40`,
              textTransform:"uppercase",letterSpacing:"0.12em"}}>{status.label}</span>
            <span style={{fontSize:8.5,color:"rgba(180,210,255,0.35)",fontWeight:600}}>{index} de {total}</span>
            {data.sponsor && <span style={{fontSize:9,color:"rgba(180,210,255,0.40)",fontWeight:500}}>· Sponsor: {data.sponsor}</span>}
          </div>
          <h2 style={{fontSize:"clamp(1.3rem,2.5vw,2rem)",fontWeight:900,color:"#fff",lineHeight:1.15,letterSpacing:"-0.01em",
            textShadow:"0 2px 20px rgba(0,0,0,0.50)"}}>
            {data.title}
          </h2>
        </div>
        <div className="shrink-0 flex flex-col items-center gap-1">
          <ProgressRing value={data.progress} color={status.color} size={82}/>
          <p style={{fontSize:8.5,color:"rgba(180,210,255,0.42)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.10em"}}>Progresso</p>
        </div>
      </div>

      {/* ── Body — 2 columns ── */}
      <div className="relative z-10 flex-1 grid gap-2.5 px-7 pb-3 min-h-0 overflow-hidden" style={{gridTemplateColumns:"1fr 1.3fr"}}>

        {/* ── LEFT: Semaphore + EVM + Budget + Team ── */}
        <div className="flex flex-col gap-2 min-h-0 overflow-hidden">

          {/* Semaphore */}
          <GCard style={{padding:"10px 12px",flexShrink:0}}>
            <SL>Semáforo de Saúde</SL>
            <div className="grid grid-cols-4 gap-2">
              <TDot light={costL} label="Custo"/>
              <TDot light={schL}  label="Prazo"/>
              <TDot light={resL}  label="Recursos"/>
              <TDot light={ovL}   label="Geral"/>
            </div>
            {data.reportStatus.notes && (
              <p style={{fontSize:8.5,color:"rgba(200,220,255,0.45)",marginTop:6,lineHeight:1.4,
                borderTop:"1px solid rgba(255,255,255,0.07)",paddingTop:6}}>
                {data.reportStatus.notes}
              </p>
            )}
          </GCard>

          {/* EVM — sempre visível */}
          <GCard style={{padding:"10px 12px",flexShrink:0}}>
            <SL right={data.timelineProgress!==null ? (
              <span style={{fontSize:8.5,color:"rgba(180,210,255,0.45)",fontWeight:600}}>{data.timelineProgress}% do prazo</span>
            ) : undefined}>EVM — Desempenho</SL>
            <div className="flex justify-around">
              <EVMGauge value={data.idc} label="IDC · Custo"/>
              <EVMGauge value={data.idp} label="IDP · Prazo"/>
            </div>
          </GCard>

          {/* Budget — só se tiver dados */}
          {(data.budget || data.economy || data.dates.start || data.dates.end) && (
            <GCard style={{padding:"10px 12px",flexShrink:0}}>
              <SL>Orçamento & Prazo</SL>
              <div className="space-y-1.5">
                {data.budget && (
                  <div className="flex justify-between">
                    <span style={{fontSize:10,color:"rgba(200,220,255,0.55)"}}>Orçamento</span>
                    <span style={{fontSize:10.5,fontWeight:800,color:"#60A5FA"}}>
                      {data.budget>=1e6?`R$ ${(data.budget/1e6).toFixed(1)}M`:`R$ ${(data.budget/1e3).toFixed(0)}K`}
                    </span>
                  </div>
                )}
                {data.economy && (
                  <div className="flex justify-between">
                    <span style={{fontSize:10,color:"rgba(200,220,255,0.55)"}}>Economia</span>
                    <span style={{fontSize:10.5,fontWeight:800,color:"#34D399"}}>
                      {data.economy>=1e6?`R$ ${(data.economy/1e6).toFixed(1)}M`:`R$ ${(data.economy/1e3).toFixed(0)}K`}
                    </span>
                  </div>
                )}
                {(data.dates.start||data.dates.end) && (
                  <div className="flex justify-between">
                    <span style={{fontSize:10,color:"rgba(200,220,255,0.55)"}}>Período</span>
                    <span style={{fontSize:10,fontWeight:700,color:"rgba(220,235,255,0.75)"}}>
                      {fmt(data.dates.start)} → {fmt(data.dates.end)}
                    </span>
                  </div>
                )}
                {daysStr && (
                  <div style={{
                    marginTop:4,padding:"4px 8px",borderRadius:7,textAlign:"center",
                    background:data.daysLeft!==null&&data.daysLeft<0?"rgba(239,68,68,0.14)":"rgba(59,130,246,0.11)",
                    border:`1px solid ${data.daysLeft!==null&&data.daysLeft<0?"rgba(239,68,68,0.28)":"rgba(96,165,250,0.22)"}`,
                    fontSize:10,fontWeight:800,
                    color:data.daysLeft!==null&&data.daysLeft<0?"#FCA5A5":"#93C5FD",
                  }}>{daysStr}</div>
                )}
              </div>
            </GCard>
          )}

          {/* Team + Meetings — compact */}
          <GCard style={{padding:"10px 12px",flex:1,minHeight:0,overflow:"hidden"}}>
            <SL right={<span style={{fontSize:9,color:"#C084FC",fontWeight:800}}>{data.meetingsCount} reuniões</span>}>
              Equipe ({data.team})
            </SL>
            <div className="flex flex-col gap-1 overflow-hidden">
              {data.members.slice(0,6).map((m,i)=>(
                <div key={i} className="flex items-center gap-1.5">
                  <div style={{
                    width:18,height:18,borderRadius:"50%",flexShrink:0,
                    background:`hsl(${(i*53+210)%360},65%,42%)`,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:7.5,fontWeight:800,color:"white",
                  }}>{m.name.charAt(0).toUpperCase()}</div>
                  <span style={{fontSize:9.5,color:"rgba(220,235,255,0.80)",fontWeight:500,
                    whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                    {m.name}{m.role?<span style={{color:"rgba(148,185,255,0.40)",fontSize:8.5}}> · {m.role}</span>:null}
                  </span>
                </div>
              ))}
              {data.members.length>6&&(
                <p style={{fontSize:8.5,color:"rgba(148,185,255,0.38)",fontStyle:"italic"}}>+{data.members.length-6} participantes</p>
              )}
            </div>
          </GCard>
        </div>

        {/* ── RIGHT: Task lists ── */}
        <div className="flex flex-col gap-2 min-h-0 overflow-hidden">

          {/* Fallback quando projeto não tem nenhum dado de atividades ainda */}
          {td.recentlyCompleted.length===0 && td.inProgress.length===0 && td.delayed.length===0 && td.upcoming.length===0 && data.wbsAreas.length===0 && data.risks.items.length===0 && (
            <GCard style={{padding:"18px 16px",flex:1,display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",gap:14,textAlign:"center"}}>
              <div style={{
                width:52,height:52,borderRadius:16,
                background:"linear-gradient(135deg,rgba(59,130,246,0.15),rgba(139,92,246,0.10))",
                border:"1px solid rgba(96,165,250,0.22)",
                display:"flex",alignItems:"center",justifyContent:"center",
              }}>
                <Activity style={{width:22,height:22,color:"rgba(148,185,255,0.55)"}}/>
              </div>
              <div>
                <p style={{fontSize:13,fontWeight:800,color:"rgba(220,235,255,0.70)",marginBottom:6}}>
                  Projeto em Configuração
                </p>
                <p style={{fontSize:10.5,color:"rgba(148,185,255,0.42)",lineHeight:1.55,maxWidth:220}}>
                  Adicione tarefas ao cronograma para acompanhar atividades, responsáveis e prazos aqui.
                </p>
              </div>
              {data.lastCheckpoint?.nextSteps && data.lastCheckpoint.nextSteps.length>0 && (
                <div style={{width:"100%",padding:"10px 12px",background:"rgba(255,255,255,0.04)",borderRadius:10,border:"1px solid rgba(255,255,255,0.08)"}}>
                  <p style={{fontSize:8.5,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.14em",color:"rgba(148,185,255,0.45)",marginBottom:8}}>Próximos Passos (último checkpoint)</p>
                  <div className="flex flex-col gap-1.5">
                    {data.lastCheckpoint.nextSteps.slice(0,4).map((s,i)=>(
                      <div key={i} className="flex items-start gap-2">
                        <ArrowRight style={{width:9,height:9,color:"#60A5FA",flexShrink:0,marginTop:2}}/>
                        <span style={{fontSize:9.5,color:"rgba(200,220,255,0.70)",lineHeight:1.4}}>{s}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{display:"flex",gap:12,flexWrap:"wrap",justifyContent:"center"}}>
                {data.meetingsCount>0&&<div style={{padding:"5px 12px",borderRadius:20,background:"rgba(192,132,252,0.12)",border:"1px solid rgba(192,132,252,0.22)",fontSize:10,color:"#C084FC",fontWeight:700}}>
                  📅 {data.meetingsCount} reunião{data.meetingsCount!==1?"ões":" realizada"}
                </div>}
                {data.team>0&&<div style={{padding:"5px 12px",borderRadius:20,background:"rgba(251,146,60,0.12)",border:"1px solid rgba(251,146,60,0.22)",fontSize:10,color:"#FB923C",fontWeight:700}}>
                  👥 {data.team} participante{data.team!==1?"s":""}
                </div>}
                {daysStr&&<div style={{padding:"5px 12px",borderRadius:20,
                  background:data.daysLeft!==null&&data.daysLeft<0?"rgba(239,68,68,0.12)":"rgba(59,130,246,0.11)",
                  border:`1px solid ${data.daysLeft!==null&&data.daysLeft<0?"rgba(239,68,68,0.24)":"rgba(96,165,250,0.20)"}`,
                  fontSize:10,color:data.daysLeft!==null&&data.daysLeft<0?"#FCA5A5":"#93C5FD",fontWeight:700}}>
                  ⏱ {daysStr}
                </div>}
              </div>
            </GCard>
          )}

          {/* Atividades concluídas */}
          {td.recentlyCompleted.length>0 && (
            <GCard style={{padding:"10px 12px",flexShrink:0}}>
              <SL right={<span style={{fontSize:9,color:"#10B981",fontWeight:800}}>{data.tasks.completed}</span>}>
                ✅ Atividades Concluídas
              </SL>
              <div className="flex flex-col gap-1">
                {td.recentlyCompleted.slice(0,4).map((t,i)=>(
                  <div key={i} className="flex items-start gap-1.5">
                    <CheckCircle2 style={{width:10,height:10,color:"#10B981",flexShrink:0,marginTop:2}}/>
                    <span style={{fontSize:9.5,color:"rgba(200,220,255,0.68)",lineHeight:1.35,
                      overflow:"hidden",display:"-webkit-box",WebkitLineClamp:1,WebkitBoxOrient:"vertical" as const}}>
                      {t.title}
                    </span>
                  </div>
                ))}
              </div>
            </GCard>
          )}

          {/* Em andamento */}
          {td.inProgress.length>0 && (
            <GCard style={{padding:"10px 12px",flexShrink:0}}>
              <SL right={<span style={{fontSize:9,color:"#60A5FA",fontWeight:800}}>{data.tasks.inProgress}</span>}>
                🔵 Em Andamento
              </SL>
              <div className="flex flex-col gap-1.5">
                {td.inProgress.slice(0,4).map((t,i)=>(
                  <div key={i} style={{paddingBottom:i<td.inProgress.slice(0,4).length-1?6:0,
                    borderBottom:i<td.inProgress.slice(0,4).length-1?"1px solid rgba(255,255,255,0.055)":"none"}}>
                    <p style={{fontSize:9.5,color:"rgba(200,220,255,0.80)",lineHeight:1.3,fontWeight:500,
                      overflow:"hidden",display:"-webkit-box",WebkitLineClamp:1,WebkitBoxOrient:"vertical" as const}}>
                      {t.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {t.responsible&&<span style={{fontSize:8.5,color:"rgba(148,185,255,0.55)"}}>👤 {t.responsible}</span>}
                      {t.endDate&&<span style={{fontSize:8.5,color:"rgba(148,185,255,0.45)"}}>· Vence {fmt(t.endDate)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </GCard>
          )}

          {/* Em atraso */}
          {td.delayed.length>0 && (
            <GCard style={{padding:"10px 12px",flexShrink:0}}>
              <SL right={<span style={{fontSize:9,color:"#EF4444",fontWeight:800}}>{data.tasks.delayed}</span>}>
                🔴 Em Atraso
              </SL>
              <div className="flex flex-col gap-1.5">
                {td.delayed.slice(0,4).map((t,i)=>(
                  <div key={i} style={{paddingBottom:i<td.delayed.slice(0,4).length-1?6:0,
                    borderBottom:i<td.delayed.slice(0,4).length-1?"1px solid rgba(255,255,255,0.055)":"none"}}>
                    <div className="flex items-start justify-between gap-2">
                      <p style={{fontSize:9.5,color:"rgba(252,165,165,0.85)",lineHeight:1.3,flex:1,
                        overflow:"hidden",display:"-webkit-box",WebkitLineClamp:1,WebkitBoxOrient:"vertical" as const}}>
                        {t.title}
                      </p>
                      <span style={{fontSize:8.5,fontWeight:800,color:"#FCA5A5",flexShrink:0}}>
                        {t.daysLate}d
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {t.responsible&&<span style={{fontSize:8.5,color:"rgba(252,165,165,0.50)"}}>👤 {t.responsible}</span>}
                      {t.endDate&&<span style={{fontSize:8.5,color:"rgba(252,165,165,0.40)"}}>· Venceu {fmt(t.endDate)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </GCard>
          )}

          {/* Próximas atividades a vencer */}
          {td.upcoming.length>0 && (
            <GCard style={{padding:"10px 12px",flex:1,minHeight:0,overflow:"hidden"}}>
              <SL>📅 Próximas a Vencer</SL>
              <div className="flex flex-col gap-1.5">
                {td.upcoming.slice(0,5).map((t,i)=>(
                  <div key={i} style={{paddingBottom:i<td.upcoming.slice(0,5).length-1?6:0,
                    borderBottom:i<td.upcoming.slice(0,5).length-1?"1px solid rgba(255,255,255,0.055)":"none"}}>
                    <div className="flex items-start justify-between gap-2">
                      <p style={{fontSize:9.5,color:"rgba(200,220,255,0.78)",lineHeight:1.3,flex:1,
                        overflow:"hidden",display:"-webkit-box",WebkitLineClamp:1,WebkitBoxOrient:"vertical" as const}}>
                        {t.title}
                      </p>
                      <span style={{fontSize:8.5,fontWeight:800,
                        color:t.daysUntil===0?"#FCA5A5":t.daysUntil<=3?"#FCD34D":"#86EFAC",flexShrink:0}}>
                        {t.daysUntil===0?"Hoje":`${t.daysUntil}d`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {t.responsible&&<span style={{fontSize:8.5,color:"rgba(148,185,255,0.50)"}}>👤 {t.responsible}</span>}
                      {t.endDate&&<span style={{fontSize:8.5,color:"rgba(148,185,255,0.40)"}}>· {fmt(t.endDate)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </GCard>
          )}

          {/* WBS — só se tiver áreas */}
          {data.wbsAreas.length>0 && (
            <GCard style={{padding:"10px 12px",flexShrink:0}}>
              <SL>Áreas do Projeto</SL>
              <div className="space-y-1.5">
                {data.wbsAreas.slice(0,4).map((a)=>(
                  <div key={a.name}>
                    <div className="flex justify-between mb-0.5">
                      <span style={{fontSize:9,color:"rgba(200,220,255,0.68)",fontWeight:500}}>{a.name}</span>
                      <span style={{fontSize:9,fontWeight:800,color:a.color??"#60A5FA"}}>{a.pct}%</span>
                    </div>
                    <div style={{height:3,background:"rgba(255,255,255,0.08)",borderRadius:2,overflow:"hidden"}}>
                      <div style={{height:"100%",borderRadius:2,width:`${a.pct}%`,
                        background:a.color??"#60A5FA",boxShadow:`0 0 5px ${a.color??"#60A5FA"}80`,
                        transition:"width 1.2s ease"}}/>
                    </div>
                  </div>
                ))}
              </div>
            </GCard>
          )}

          {/* Riscos — compacto, só se tiver */}
          {data.risks.items.length>0 && (
            <GCard style={{padding:"10px 12px",flexShrink:0}}>
              <SL right={
                <div className="flex gap-1.5">
                  {data.risks.critical>0&&<span style={{fontSize:8,fontWeight:800,padding:"1px 6px",borderRadius:10,background:"rgba(239,68,68,0.15)",color:"#FCA5A5"}}>⚠ {data.risks.critical} crítico</span>}
                  {data.risks.high>0&&<span style={{fontSize:8,fontWeight:800,padding:"1px 6px",borderRadius:10,background:"rgba(245,158,11,0.12)",color:"#FCD34D"}}>{data.risks.high} alto</span>}
                </div>
              }>Riscos</SL>
              <div className="space-y-1">
                {data.risks.items.slice(0,3).map((r,i)=>{
                  const rc:{[k:string]:{color:string}}={CRITICAL:{color:"#FCA5A5"},HIGH:{color:"#FCD34D"},MEDIUM:{color:"#86EFAC"},LOW:{color:"#94A3B8"}}
                  const col=(rc[r.level]??{color:"#94A3B8"}).color
                  return (
                    <div key={i} style={{borderLeft:`2px solid ${col}`,paddingLeft:7}}>
                      <p style={{fontSize:9,color:"rgba(200,220,255,0.68)",lineHeight:1.35}}>
                        {r.description.length>65?r.description.slice(0,65)+"…":r.description}
                      </p>
                    </div>
                  )
                })}
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

function SummarySlide({projects,totalMeetings}:{projects:ProjectSlideData[];totalMeetings:number}) {
  const avgProg    = projects.length>0 ? Math.round(projects.reduce((s,p)=>s+p.progress,0)/projects.length) : 0
  const idcList    = projects.map((p)=>p.idc).filter((v):v is number=>v!==null)
  const idpList    = projects.map((p)=>p.idp).filter((v):v is number=>v!==null)
  const avgIdc     = idcList.length>0 ? Math.round(idcList.reduce((a,b)=>a+b,0)/idcList.length*100)/100 : null
  const avgIdp     = idpList.length>0 ? Math.round(idpList.reduce((a,b)=>a+b,0)/idpList.length*100)/100 : null
  const totalTasks = projects.reduce((s,p)=>s+p.tasks.total,0)
  const doneTasks  = projects.reduce((s,p)=>s+p.tasks.completed,0)
  const critRisks  = projects.reduce((s,p)=>s+p.risks.critical,0)
  const totalDelay = projects.reduce((s,p)=>s+p.tasks.delayed,0)

  const kpis=[
    {label:"Projetos Ativos", val:String(projects.length), color:"#60A5FA", icon:Zap},
    {label:"Reuniões",        val:String(totalMeetings),   color:"#C084FC", icon:Calendar},
    {label:"Conclusão Média", val:`${avgProg}%`,           color:"#34D399", icon:TrendingUp},
    {label:"Tarefas Done",    val:`${doneTasks}/${totalTasks}`, color:"#22D3EE", icon:CheckCheck},
    {label:"IDC Médio", val:avgIdc!==null?String(avgIdc):"N/A",
      color:avgIdc!==null?(avgIdc>=1?"#10B981":avgIdc>=0.85?"#F59E0B":"#EF4444"):"#64748B", icon:DollarSign},
    {label:"IDP Médio", val:avgIdp!==null?String(avgIdp):"N/A",
      color:avgIdp!==null?(avgIdp>=1?"#10B981":avgIdp>=0.85?"#F59E0B":"#EF4444"):"#64748B", icon:Target},
    {label:"Riscos Críticos", val:String(critRisks), color:critRisks>0?"#FCA5A5":"#10B981", icon:AlertTriangle},
    {label:"Em Atraso",       val:String(totalDelay), color:totalDelay>0?"#FCD34D":"#10B981", icon:Clock},
  ]

  return (
    <div className="relative flex flex-col h-full select-none overflow-hidden">
      <SlideBackground/>
      <Particles n={10}/>
      <div className="relative z-10 flex flex-col h-full px-8 py-5 gap-4">
        <div className="text-center">
          <VendemmiaLogo size="sm"/>
          <h2 style={{fontSize:"clamp(1.7rem,3vw,2.6rem)",fontWeight:900,color:"#fff",marginTop:14,
            background:"linear-gradient(135deg,#fff 0%,#C7DEFF 50%,rgba(255,255,255,0.65) 100%)",
            WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
            Resumo do Portfólio
          </h2>
        </div>

        <div className="grid gap-2.5" style={{gridTemplateColumns:"repeat(4,1fr)"}}>
          {kpis.map(({label,val,color,icon:Icon})=>(
            <GCard key={label} style={{padding:"14px 10px",textAlign:"center"}}>
              <Icon style={{width:14,height:14,color,marginBottom:5}}/>
              <p style={{fontSize:"1.9rem",fontWeight:900,color,lineHeight:1,filter:`drop-shadow(0 0 9px ${color}70)`}}>{val}</p>
              <p style={{fontSize:8,color:"rgba(180,210,255,0.48)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginTop:4}}>{label}</p>
            </GCard>
          ))}
        </div>

        <div className="flex-1 grid gap-2.5 min-h-0 overflow-hidden"
          style={{gridTemplateColumns:`repeat(${Math.min(projects.length,3)},1fr)`}}>
          {projects.map((p)=>{
            const st=STATUS_CFG[p.status]??{label:p.status,color:"#94A3B8",bg:"rgba(148,163,184,0.12)"}
            const ol=LIGHT[toTL(p.reportStatus.overall)]
            return (
              <GCard key={p.id} style={{padding:"12px 14px",overflow:"hidden"}}>
                <div className="flex items-start justify-between mb-1.5">
                  <span style={{fontSize:7.5,fontWeight:800,padding:"2px 7px",borderRadius:20,background:st.bg,color:st.color,textTransform:"uppercase",letterSpacing:"0.10em"}}>{st.label}</span>
                  <div style={{width:9,height:9,borderRadius:"50%",background:ol.color,boxShadow:`0 0 8px ${ol.glow}`}}/>
                </div>
                <p style={{fontSize:11.5,fontWeight:800,color:"#fff",lineHeight:1.3,marginBottom:6,
                  overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical" as const}}>
                  {p.title}
                </p>
                <div style={{height:3.5,background:"rgba(255,255,255,0.08)",borderRadius:2,marginBottom:5}}>
                  <div style={{height:"100%",borderRadius:2,width:`${p.progress}%`,background:st.color,boxShadow:`0 0 5px ${st.color}80`,transition:"width 1.2s ease"}}/>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex gap-2" style={{fontSize:8.5,color:"rgba(180,210,255,0.45)"}}>
                    <span>✅ {p.tasks.completed}</span>
                    {p.tasks.delayed>0&&<span style={{color:"#FCA5A5"}}>🔴 {p.tasks.delayed}</span>}
                    <span>👥 {p.team}</span>
                    <span>📅 {p.meetingsCount}</span>
                  </div>
                  <span style={{fontSize:10.5,fontWeight:800,color:st.color}}>{p.progress}%</span>
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

function NavDots({total,current,goto}:{total:number;current:number;goto:(i:number)=>void}) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({length:total}).map((_,i)=>(
        <button key={i} onClick={()=>goto(i)} style={{
          width:i===current?20:6, height:6, borderRadius:3,
          transition:"all 0.3s ease",
          background:i===current?"linear-gradient(90deg,#3B82F6,#8B5CF6)":"rgba(255,255,255,0.20)",
          boxShadow:i===current?"0 0 10px rgba(59,130,246,0.60)":"none",
          border:"none",cursor:"pointer",
        }}/>
      ))}
    </div>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center px-12"
      style={{background:"linear-gradient(145deg,#0B1D3A,#0F2550)"}}>
      <style>{KF}</style>
      <BarChart3 style={{width:52,height:52,color:"rgba(96,165,250,0.32)"}}/>
      <div>
        <h2 style={{fontSize:"1.7rem",fontWeight:900,color:"#fff",marginBottom:8}}>Nenhum Projeto em Andamento</h2>
        <p style={{fontSize:13.5,color:"rgba(180,210,255,0.48)"}}>
          Projetos com status Em Andamento, Piloto, Ramp-Up, Go Live ou Pós Go Live aparecerão aqui.
        </p>
      </div>
      <Link href="/projects" style={{padding:"11px 26px",borderRadius:12,fontSize:13,fontWeight:700,color:"white",
        background:"linear-gradient(135deg,#3B82F6,#8B5CF6)",textDecoration:"none",
        display:"inline-flex",alignItems:"center",gap:8}}>
        <RefreshCw style={{width:14,height:14}}/> Ver todos os projetos
      </Link>
    </div>
  )
}

// ─── Project Selector ─────────────────────────────────────────────────────────

function ProjectSelector({slides,onStart}:{slides:ProjectSlideData[];onStart:(s:ProjectSlideData[])=>void}) {
  const [selected,setSelected]=useState<Set<string>>(()=>new Set(slides.map((s)=>s.id)))
  const [search,setSearch]=useState("")
  const filtered=useMemo(()=>{
    const q=search.toLowerCase(); return q?slides.filter((s)=>s.title.toLowerCase().includes(q)):slides
  },[slides,search])
  const toggle=(id:string)=>setSelected((prev)=>{const next=new Set(prev);next.has(id)?next.delete(id):next.add(id);return next})
  const toggleAll=()=>setSelected(selected.size===slides.length?new Set():new Set(slides.map((s)=>s.id)))
  const date=format(new Date(),"dd 'de' MMMM 'de' yyyy",{locale:ptBR})

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{background:"linear-gradient(145deg,#0B1D3A,#0F2550)"}}>
      <style>{KF}</style>
      <div className="flex items-center justify-between px-8 py-4 shrink-0"
        style={{borderBottom:"1px solid rgba(255,255,255,0.07)"}}>
        <VendemmiaLogo size="sm"/>
        <p style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.18em",color:"rgba(148,185,255,0.40)"}}>
          Status Report · {date}
        </p>
        <div style={{width:110}}/>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-8" style={{scrollbarWidth:"none"}}>
        <div className="max-w-4xl mx-auto space-y-5">
          <div className="text-center space-y-2">
            <h1 style={{fontSize:"clamp(2rem,4vw,3rem)",fontWeight:900,
              background:"linear-gradient(135deg,#fff 0%,#C7DEFF 45%,rgba(255,255,255,0.65) 100%)",
              WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",
              filter:"drop-shadow(0 0 25px rgba(59,130,246,0.30))"}}>Selecionar Projetos</h1>
            <p style={{fontSize:13,color:"rgba(148,185,255,0.45)",fontWeight:500}}>Escolha quais projetos serão apresentados</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{color:"rgba(148,185,255,0.35)"}}/>
              <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Buscar projeto…"
                className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl outline-none"
                style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",color:"rgba(200,225,255,0.85)"}}/>
            </div>
            <button onClick={toggleAll} className="px-4 py-2.5 rounded-xl text-xs font-bold"
              style={{background:selected.size===slides.length?"rgba(59,130,246,0.18)":"rgba(255,255,255,0.06)",
                border:`1px solid ${selected.size===slides.length?"rgba(96,165,250,0.38)":"rgba(255,255,255,0.12)"}`,
                color:selected.size===slides.length?"#93C5FD":"rgba(148,185,255,0.55)"}}>
              {selected.size===slides.length?"Limpar":"Selecionar todos"}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {filtered.map((p)=>{
              const isSelected=selected.has(p.id)
              const st=STATUS_CFG[p.status]??{label:p.status,color:"#94A3B8",bg:"rgba(148,163,184,0.12)"}
              return (
                <button key={p.id} onClick={()=>toggle(p.id)} className="text-left rounded-2xl p-4 transition-all duration-200"
                  style={{background:isSelected?`linear-gradient(135deg,${st.color}14,${st.color}07)`:"rgba(255,255,255,0.04)",
                    border:`1px solid ${isSelected?st.color+"40":"rgba(255,255,255,0.09)"}`,
                    boxShadow:isSelected?`0 0 18px ${st.color}14`:"none"}}>
                  <div className="flex items-start gap-3">
                    <div style={{width:19,height:19,borderRadius:6,flexShrink:0,marginTop:2,
                      background:isSelected?st.color:"rgba(255,255,255,0.08)",
                      border:`1.5px solid ${isSelected?st.color:"rgba(255,255,255,0.20)"}`,
                      display:"flex",alignItems:"center",justifyContent:"center"}}>
                      {isSelected&&<CheckCheck style={{width:10,height:10,color:"white"}}/>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p style={{fontSize:12.5,fontWeight:700,color:"#fff",lineHeight:1.25,marginBottom:4}}>{p.title}</p>
                      <div className="flex flex-wrap gap-1.5">
                        <span style={{fontSize:8.5,fontWeight:800,padding:"2px 8px",borderRadius:20,background:st.bg,color:st.color,textTransform:"uppercase",letterSpacing:"0.10em"}}>{st.label}</span>
                        <span style={{fontSize:9.5,color:"rgba(148,185,255,0.45)"}}>{p.progress}% · {p.team} membros · {p.meetingsCount} reuniões</span>
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="shrink-0 px-8 py-4 flex items-center justify-between"
        style={{background:"rgba(8,20,50,0.95)",borderTop:"1px solid rgba(255,255,255,0.07)"}}>
        <Link href="/projects" className="flex items-center gap-1.5 text-xs font-semibold"
          style={{color:"rgba(148,185,255,0.35)",textDecoration:"none"}}
          onMouseEnter={(e)=>{(e.currentTarget as HTMLElement).style.color="rgba(148,185,255,0.70)"}}
          onMouseLeave={(e)=>{(e.currentTarget as HTMLElement).style.color="rgba(148,185,255,0.35)"}}>
          <ArrowLeft className="w-3.5 h-3.5"/> Projetos
        </Link>
        <span style={{fontSize:13,fontWeight:600,color:"rgba(148,185,255,0.42)"}}>
          {selected.size} de {slides.length} selecionado{selected.size!==1?"s":""}
        </span>
        <button onClick={()=>{const c=slides.filter((s)=>selected.has(s.id));if(c.length>0)onStart(c)}}
          disabled={selected.size===0}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-40 disabled:cursor-not-allowed"
          style={{background:"linear-gradient(135deg,#2563EB,#7C3AED)",
            boxShadow:selected.size>0?"0 0 26px rgba(59,130,246,0.42),0 0 52px rgba(124,58,237,0.22)":"none"}}>
          <Play className="w-4 h-4 fill-white"/> Iniciar Apresentação
        </button>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ReportClient({slides:allSlides,totalMeetings}:{slides:ProjectSlideData[];totalMeetings:number}) {
  const [started,setStarted]   =useState(false)
  const [activeSlides,setActive]=useState<ProjectSlideData[]>(allSlides)
  const [current,setCurrent]   =useState(0)
  const [dir,setDir]           =useState(1)
  const [isFullscreen,setIsFs] =useState(false)
  const [idle,setIdle]         =useState(false)
  const containerRef=useRef<HTMLDivElement>(null)
  const idleTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined)

  const resetIdle=useCallback(()=>{
    setIdle(false); clearTimeout(idleTimer.current)
    idleTimer.current=setTimeout(()=>setIdle(true),4500)
  },[])

  const allList=["cover" as const,...activeSlides.map(()=>"project" as const),...(activeSlides.length>1?["summary" as const]:[])]
  const total=allList.length

  const go=useCallback((idx:number)=>{
    if(idx<0||idx>=total)return
    setDir(idx>current?1:-1); setCurrent(idx); resetIdle()
  },[current,total,resetIdle])
  const next=useCallback(()=>go(current+1),[current,go])
  const prev=useCallback(()=>go(current-1),[current,go])

  useEffect(()=>{
    if(!started)return; resetIdle()
    const onKey=(e:KeyboardEvent)=>{
      if(e.key==="ArrowRight"||e.key===" "){e.preventDefault();next()}
      if(e.key==="ArrowLeft"){e.preventDefault();prev()}
      if(e.key.toLowerCase()==="f")toggleFullscreen()
    }
    window.addEventListener("keydown",onKey)
    return ()=>window.removeEventListener("keydown",onKey)
  },[started,next,prev,resetIdle])

  const toggleFullscreen=()=>{
    if(!document.fullscreenElement){containerRef.current?.requestFullscreen().catch(()=>{});setIsFs(true)}
    else{document.exitFullscreen().catch(()=>{});setIsFs(false)}
  }

  const slideType=allList[current]; const projectIdx=current-1
  const date=format(new Date(),"dd 'de' MMMM 'de' yyyy",{locale:ptBR})

  if(allSlides.length===0)return <EmptyState/>
  if(!started){
    return <ProjectSelector slides={allSlides} onStart={(chosen)=>{setActive(chosen);setCurrent(0);setStarted(true)}}/>
  }

  return (
    <div ref={containerRef} className="relative flex-1 overflow-hidden cursor-pointer"
      onClick={(e)=>{if((e.target as HTMLElement).closest("button,a"))return;next()}}
      onMouseMove={resetIdle}>
      <AnimatePresence custom={dir} initial={false}>
        <motion.div key={current} custom={dir} variants={slideVariants}
          initial="enter" animate="center" exit="exit"
          className="absolute inset-0" style={{paddingBottom:62}}>
          {slideType==="cover"&&<CoverSlide slides={activeSlides} date={date} totalMeetings={totalMeetings}/>}
          {slideType==="project"&&projectIdx>=0&&projectIdx<activeSlides.length&&(
            <ProjectSlide data={activeSlides[projectIdx]} index={projectIdx+1} total={activeSlides.length}/>
          )}
          {slideType==="summary"&&<SummarySlide projects={activeSlides} totalMeetings={totalMeetings}/>}
        </motion.div>
      </AnimatePresence>

      {/* Nav bar */}
      <motion.div animate={{opacity:idle?0:1,y:idle?6:0}} transition={{duration:0.28}}
        className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-8"
        style={{height:62,background:"linear-gradient(to top,rgba(4,12,28,0.97) 0%,rgba(4,12,28,0.55) 70%,transparent 100%)",
          zIndex:50,borderTop:"1px solid rgba(255,255,255,0.05)"}}
        onClick={(e)=>e.stopPropagation()}>
        <button onClick={()=>{setStarted(false);setCurrent(0)}}
          className="flex items-center gap-1.5 text-xs font-semibold"
          style={{color:"rgba(148,185,255,0.28)",border:"none",background:"none",cursor:"pointer"}}
          onMouseEnter={(e)=>{(e.currentTarget as HTMLElement).style.color="rgba(148,185,255,0.68)"}}
          onMouseLeave={(e)=>{(e.currentTarget as HTMLElement).style.color="rgba(148,185,255,0.28)"}}>
          <ArrowLeft className="w-3.5 h-3.5"/> Seleção
        </button>
        <div className="flex items-center gap-4">
          <button onClick={prev} disabled={current===0}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all disabled:opacity-20"
            style={{background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.11)",color:"rgba(180,210,255,0.70)",cursor:"pointer"}}>
            <ChevronLeft className="w-4 h-4"/>
          </button>
          <NavDots total={total} current={current} goto={go}/>
          <button onClick={next} disabled={current===total-1}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all disabled:opacity-20"
            style={{background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.11)",color:"rgba(180,210,255,0.70)",cursor:"pointer"}}>
            <ChevronRight className="w-4 h-4"/>
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span style={{fontSize:11,color:"rgba(148,185,255,0.22)"}}>{current+1}/{total} · F tela cheia</span>
          <button onClick={toggleFullscreen}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.11)",color:"rgba(180,210,255,0.45)",cursor:"pointer"}}>
            {isFullscreen?<Minimize2 className="w-3.5 h-3.5"/>:<Maximize2 className="w-3.5 h-3.5"/>}
          </button>
        </div>
      </motion.div>

      {current>0&&(
        <motion.div animate={{opacity:idle?0:0.28}} className="absolute left-0 top-0 bottom-16 w-12 flex items-center justify-start pl-3 pointer-events-none" style={{zIndex:40}}>
          <div className="w-7 h-7 rounded-full flex items-center justify-center"
            style={{background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.10)"}}>
            <ChevronLeft className="w-4 h-4 text-white"/>
          </div>
        </motion.div>
      )}
      {current<total-1&&(
        <motion.div animate={{opacity:idle?0:0.28}} className="absolute right-0 top-0 bottom-16 w-12 flex items-center justify-end pr-3 pointer-events-none" style={{zIndex:40}}>
          <div className="w-7 h-7 rounded-full flex items-center justify-center"
            style={{background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.10)"}}>
            <ChevronRight className="w-4 h-4 text-white"/>
          </div>
        </motion.div>
      )}
    </div>
  )
}
