"use client"

import { useState, useTransition, useRef } from "react"
import { ProjectTasksKanban } from "./project-tasks-kanban"
import {
  DndContext, DragOverlay, closestCorners,
  PointerSensor, KeyboardSensor, useSensor, useSensors,
  useDroppable, useDraggable,
  type DragStartEvent, type DragEndEvent, type DragOverEvent,
} from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"
import { updateProjectStatusKanban } from "@/lib/actions/kanban"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import Link from "next/link"
import {
  LayoutGrid, List, Search, X, Users, AlertTriangle,
  TrendingUp, Calendar, ExternalLink,
  ChevronRight, CheckCircle2, Loader2,
  Clock, Layers, CircleCheck, ArrowRight, Zap,
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

export type KanbanProject = {
  id: string
  title: string
  description: string | null
  status: string
  priority: number | null
  priorityLabel: string | null
  progress: number
  tasksDone: number
  tasksTotal: number
  teamSize: number
  members: { id: string; name: string }[]
  riskCount: number
  highRisks: number
  economy: number | null
  budget: number | null
  expectedEnd: string | null
  expectedStart: string | null
  sponsor: string
  daysLeft: number | null
}

// ─── Column Config ────────────────────────────────────────────────────────────

const COLUMNS = [
  {
    id: "PENDING_GO_NO_GO",
    label: "Aguard. Go/No-Go",
    dropStatus: "PENDING_GO_NO_GO",
    displayStatuses: ["PENDING_GO_NO_GO"],
    color: "#D97706",
    glow: "rgba(217,119,6,0.25)",
    icon: ArrowRight,
    gradient: "linear-gradient(135deg, #D97706, #F59E0B)",
  },
  {
    id: "PLANNING",
    label: "Planejamento",
    dropStatus: "PLANNING",
    displayStatuses: ["PLANNING", "FUTURE_ANALYSIS"],
    color: "#64748B",
    glow: "rgba(100,116,139,0.25)",
    icon: Clock,
    gradient: "linear-gradient(135deg, #64748B, #94A3B8)",
  },
  {
    id: "IN_PROGRESS",
    label: "Em Andamento",
    dropStatus: "IN_PROGRESS",
    displayStatuses: ["IN_PROGRESS", "RAMP_UP"],
    color: "#2463FF",
    glow: "rgba(36,99,255,0.25)",
    icon: Layers,
    gradient: "linear-gradient(135deg, #2463FF, #60A5FA)",
  },
  {
    id: "ON_HOLD",
    label: "Em Validação",
    dropStatus: "PILOT",
    displayStatuses: ["PILOT", "ON_HOLD"],
    color: "#8B5CF6",
    glow: "rgba(139,92,246,0.25)",
    icon: CheckCircle2,
    gradient: "linear-gradient(135deg, #8B5CF6, #C4B5FD)",
  },
  {
    id: "GO_LIVE",
    label: "Go Live / Pós",
    dropStatus: "GO_LIVE",
    displayStatuses: ["GO_LIVE", "POST_GOLIVE"],
    color: "#059669",
    glow: "rgba(5,150,105,0.25)",
    icon: Zap,
    gradient: "linear-gradient(135deg, #059669, #34D399)",
  },
  {
    id: "COMPLETED",
    label: "Concluído",
    dropStatus: "COMPLETED",
    displayStatuses: ["COMPLETED"],
    color: "#0891B2",
    glow: "rgba(8,145,178,0.25)",
    icon: CircleCheck,
    gradient: "linear-gradient(135deg, #0891B2, #67E8F9)",
  },
] as const

type ColumnId = typeof COLUMNS[number]["id"]

const COL_BY_STATUS: Record<string, typeof COLUMNS[number]> = {}
for (const col of COLUMNS) {
  for (const s of col.displayStatuses) {
    COL_BY_STATUS[s] = col
  }
}
const COL_BY_ID = Object.fromEntries(COLUMNS.map((c) => [c.id, c])) as Record<string, typeof COLUMNS[number]>

const PRIORITY_CFG: Record<string, { color: string; bg: string; label: string }> = {
  P1: { color: "#EF4444", bg: "rgba(239,68,68,0.12)", label: "P1" },
  P2: { color: "#F97316", bg: "rgba(249,115,22,0.12)", label: "P2" },
  P3: { color: "#2463FF", bg: "rgba(36,99,255,0.12)", label: "P3" },
  P4: { color: "#64748B", bg: "rgba(100,116,139,0.10)", label: "P4" },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(d: string | null) {
  if (!d) return "—"
  return format(new Date(d), "dd/MM/yyyy", { locale: ptBR })
}
function currency(v: number | null) {
  if (!v) return "—"
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
}
function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
}
function memberColor(name: string) {
  const hue = (name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) * 37) % 360
  return `hsl(${hue},55%,42%)`
}

// ─── Mini Progress Ring ───────────────────────────────────────────────────────

function MiniProgressRing({
  pct, total, done, colColor, colId,
}: {
  pct: number; total: number; done: number; colColor: string; colId: string
}) {
  const size   = 40
  const stroke = 3.5
  const r      = (size - stroke) / 2
  const circ   = 2 * Math.PI * r
  const dash   = total > 0 ? (pct / 100) * circ : 0
  const gid    = `krx-ring-${colId}`

  return (
    <div className="flex flex-col items-center gap-0.5 shrink-0">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
          style={{ transform: "rotate(-90deg)" }}>
          <defs>
            <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={colColor} stopOpacity="0.55" />
              <stop offset="100%" stopColor={colColor} />
            </linearGradient>
          </defs>
          {/* Track */}
          <circle cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke="#F1F5F9" strokeWidth={stroke} />
          {/* Arc */}
          {total > 0 && (
            <circle cx={size / 2} cy={size / 2} r={r}
              fill="none" stroke={`url(#${gid})`} strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circ}`}
              style={{ transition: "stroke-dasharray 0.8s cubic-bezier(0.22,1,0.36,1)" }}
            />
          )}
        </svg>
        {/* Center label */}
        <div className="absolute inset-0 flex items-center justify-center">
          {total > 0 ? (
            <span style={{ fontSize: 9, fontWeight: 900, color: colColor, lineHeight: 1 }}>
              {pct}%
            </span>
          ) : (
            <span style={{ fontSize: 12, fontWeight: 700, color: "#CBD5E1", lineHeight: 1 }}>—</span>
          )}
        </div>
      </div>
      {/* Tasks fraction below ring */}
      <span style={{ fontSize: 8, fontWeight: 600, color: total > 0 ? "#94A3B8" : "#CBD5E1", lineHeight: 1 }}>
        {total > 0 ? `${done}/${total}` : "sem tarefas"}
      </span>
    </div>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function ProjectCard({
  project,
  onClick,
  isDragOverlay = false,
}: {
  project: KanbanProject
  onClick?: () => void
  isDragOverlay?: boolean
}) {
  const col  = COL_BY_STATUS[project.status] ?? COLUMNS[0]
  const pCfg = project.priorityLabel ? PRIORITY_CFG[project.priorityLabel] : null

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id:       project.id,
    data:     { status: project.status },
    disabled: isDragOverlay,
  })

  const isDelayed = project.daysLeft !== null && project.daysLeft < 0
  const isUrgent  = !isDelayed && project.daysLeft !== null && project.daysLeft <= 14

  const cardBg     = isDelayed ? "#fff8f8" : isUrgent ? "#fffcf0" : "#ffffff"
  const cardBorder = isDragOverlay
    ? `1px solid ${col.color}40`
    : isDelayed
      ? "1px solid rgba(239,68,68,0.22)"
      : isUrgent
        ? "1px solid rgba(245,158,11,0.22)"
        : "1px solid rgba(15,23,42,0.07)"

  return (
    <div
      ref={isDragOverlay ? undefined : setNodeRef}
      style={{
        transform:  isDragOverlay ? undefined : CSS.Translate.toString(transform),
        opacity:    isDragging && !isDragOverlay ? 0.35 : 1,
        transition: isDragging ? "none" : "opacity 0.15s",
        cursor:     isDragOverlay ? "grabbing" : "grab",
      }}
      {...(!isDragOverlay ? attributes : {})}
      {...(!isDragOverlay ? listeners : {})}
      onClick={isDragOverlay ? undefined : onClick}
      className={isDragOverlay ? "rotate-2 scale-105" : ""}
    >
      <div
        className="group/card select-none rounded-2xl overflow-hidden"
        style={{
          background: cardBg,
          border:     cardBorder,
          boxShadow:  isDragOverlay
            ? `0 24px 60px rgba(0,0,0,0.20), 0 0 0 2px ${col.color}35`
            : "0 1px 3px rgba(15,23,42,0.05), 0 4px 12px rgba(15,23,42,0.04)",
          transition: "transform 0.18s ease, box-shadow 0.18s ease",
        }}
        onMouseEnter={(e) => {
          if (!isDragOverlay) {
            const el = e.currentTarget as HTMLElement
            el.style.transform = "translateY(-2px)"
            el.style.boxShadow = `0 8px 24px rgba(15,23,42,0.10), 0 2px 6px rgba(15,23,42,0.06), 0 0 0 1px ${col.color}20`
          }
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLElement
          el.style.transform = ""
          el.style.boxShadow = "0 1px 3px rgba(15,23,42,0.05), 0 4px 12px rgba(15,23,42,0.04)"
        }}
      >
        {/* Top accent bar */}
        <div className="h-[3px]" style={{ background: col.gradient }} />

        <div className="p-4">
          {/* Top row: badges */}
          <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
            {pCfg && project.priorityLabel && (
              <span
                className="text-[9px] font-black px-2 py-0.5 rounded-full tracking-wide"
                style={{ background: pCfg.bg, color: pCfg.color }}
              >
                {pCfg.label}
              </span>
            )}
            {isDelayed && (
              <span
                className="text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                style={{ background: "rgba(239,68,68,0.10)", color: "#DC2626" }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block animate-pulse" />
                {Math.abs(project.daysLeft!)}d atrasado
              </span>
            )}
            {isUrgent && (
              <span
                className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: "rgba(245,158,11,0.10)", color: "#D97706" }}
              >
                ⚡ {project.daysLeft}d restantes
              </span>
            )}
          </div>

          {/* Title */}
          <p className="text-[13px] font-bold text-slate-800 leading-snug mb-1 line-clamp-2">
            {project.title}
          </p>

          {/* Sponsor */}
          <p className="text-[11px] mb-3.5 truncate text-slate-400 font-medium">
            {project.sponsor}
          </p>

          {/* Progress accent bar — thin, only when tasks exist */}
          {project.tasksTotal > 0 && (
            <div className="mb-3 h-1 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${project.progress}%`, background: col.gradient }}
              />
            </div>
          )}

          {/* Bottom row */}
          <div className="flex items-end justify-between gap-2">
            {/* Left: avatars + optional risk + date stacked */}
            <div className="flex flex-col gap-1.5 min-w-0">
              <div className="flex items-center">
                {project.members.slice(0, 4).map((m, i) => (
                  <div
                    key={m.id}
                    title={m.name}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-black text-white ring-2 ring-white shrink-0"
                    style={{
                      background: memberColor(m.name),
                      marginLeft: i > 0 ? "-6px" : "0",
                      zIndex:     20 - i,
                      boxShadow:  "0 1px 3px rgba(0,0,0,0.15)",
                    }}
                  >
                    {initials(m.name)}
                  </div>
                ))}
                {project.teamSize > 4 && (
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold ring-2 ring-white -ml-1.5 bg-slate-100 text-slate-500 shrink-0"
                    style={{ zIndex: 1 }}
                  >
                    +{project.teamSize - 4}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Risk */}
                {project.riskCount > 0 && (
                  <div
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold"
                    style={{
                      background: project.highRisks > 0 ? "rgba(220,38,38,0.09)" : "rgba(217,119,6,0.09)",
                      color:      project.highRisks > 0 ? "#DC2626" : "#D97706",
                    }}
                  >
                    <AlertTriangle className="w-2.5 h-2.5" />
                    {project.riskCount}
                  </div>
                )}
                {/* End date */}
                {project.expectedEnd && (
                  <span
                    className="text-[9px] font-semibold"
                    style={{ color: isDelayed ? "#DC2626" : isUrgent ? "#D97706" : "#94A3B8" }}
                  >
                    {format(new Date(project.expectedEnd), "dd/MM", { locale: ptBR })}
                  </span>
                )}
              </div>
            </div>

            {/* Right: mini progress ring */}
            <MiniProgressRing
              pct={project.progress}
              total={project.tasksTotal}
              done={project.tasksDone}
              colColor={col.color}
              colId={col.id}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Column ───────────────────────────────────────────────────────────────────

function KanbanColumn({
  col,
  projects,
  isOver,
  onCardClick,
}: {
  col: typeof COLUMNS[number]
  projects: KanbanProject[]
  isOver: boolean
  onCardClick: (p: KanbanProject) => void
}) {
  const { setNodeRef } = useDroppable({ id: col.id })
  const Icon = col.icon

  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden"
      style={{
        flex:       "1 1 0",
        minWidth:   "210px",
        background: isOver ? `${col.color}08` : "#F8FAFC",
        border:     `1.5px solid ${isOver ? col.color + "50" : "rgba(15,23,42,0.07)"}`,
        boxShadow:  isOver
          ? `0 0 0 3px ${col.color}18, 0 4px 20px ${col.glow}`
          : "0 1px 4px rgba(15,23,42,0.04)",
        transition: "border-color 0.2s, box-shadow 0.2s, background 0.2s",
      }}
    >
      {/* Column header */}
      <div
        className="shrink-0"
        style={{ borderBottom: `1.5px solid ${isOver ? col.color + "20" : "rgba(15,23,42,0.06)"}` }}
      >
        {/* Color strip */}
        <div className="h-[3px]" style={{ background: col.gradient }} />

        <div
          className="flex items-center gap-2.5 px-4 py-3"
          style={{ background: isOver ? `${col.color}06` : "rgba(255,255,255,0.80)" }}
        >
          <div
            className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `${col.color}12` }}
          >
            <Icon className="w-3.5 h-3.5" style={{ color: col.color }} />
          </div>
          <span className="text-[12px] font-bold flex-1 truncate" style={{ color: "#1E293B" }}>
            {col.label}
          </span>
          <span
            className="text-[11px] font-black px-2 py-0.5 rounded-full shrink-0"
            style={{ background: `${col.color}15`, color: col.color }}
          >
            {projects.length}
          </span>
        </div>
      </div>

      {/* Card list */}
      <div
        ref={setNodeRef}
        className="flex-1 overflow-y-auto p-3 space-y-2.5"
        style={{
          maxHeight:      "calc(100vh - 180px)",
          scrollbarWidth: "thin",
          scrollbarColor: `${col.color}25 transparent`,
        }}
      >
        {projects.map((p) => (
          <ProjectCard
            key={p.id}
            project={p}
            onClick={() => onCardClick(p)}
          />
        ))}

        {projects.length === 0 && (
          <div
            className="flex flex-col items-center justify-center rounded-xl py-10 px-4 text-center"
            style={{
              border:     `2px dashed ${col.color}20`,
              background: `${col.color}04`,
            }}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center mb-2.5"
              style={{ background: `${col.color}10` }}
            >
              <Icon className="w-4.5 h-4.5" style={{ color: col.color, opacity: 0.5, width: 18, height: 18 }} />
            </div>
            <p className="text-[11px] font-semibold text-slate-400">Arraste um card aqui</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Detail Drawer ────────────────────────────────────────────────────────────

function DetailDrawer({ project, onClose }: { project: KanbanProject; onClose: () => void }) {
  const col       = COL_BY_STATUS[project.status] ?? COLUMNS[0]
  const pCfg      = project.priorityLabel ? PRIORITY_CFG[project.priorityLabel] : null
  const isDelayed = project.daysLeft !== null && project.daysLeft < 0
  const isUrgent  = !isDelayed && project.daysLeft !== null && project.daysLeft <= 14

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ background: "rgba(15,23,42,0.35)", backdropFilter: "blur(3px)" }}
        onClick={onClose}
      />
      <div
        className="fixed right-0 top-0 h-full z-50 flex flex-col overflow-hidden"
        style={{
          width:      "460px",
          background: "#ffffff",
          borderLeft: "1.5px solid rgba(15,23,42,0.08)",
          boxShadow:  "-12px 0 48px rgba(15,23,42,0.12)",
          animation:  "slideIn 0.25s cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        {/* Color bar */}
        <div className="h-1 shrink-0" style={{ background: col.gradient }} />

        {/* Header */}
        <div className="px-6 pt-5 pb-5 shrink-0" style={{ borderBottom: "1px solid rgba(15,23,42,0.07)" }}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span
                  className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                  style={{ background: `${col.color}12`, color: col.color, border: `1px solid ${col.color}20` }}
                >
                  {col.label}
                </span>
                {pCfg && project.priorityLabel && (
                  <span
                    className="text-[10px] font-black px-2.5 py-1 rounded-full"
                    style={{ background: pCfg.bg, color: pCfg.color }}
                  >
                    {project.priorityLabel}
                  </span>
                )}
                {isDelayed && (
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                    style={{ background: "rgba(239,68,68,0.10)", color: "#DC2626" }}>
                    {Math.abs(project.daysLeft!)}d atrasado
                  </span>
                )}
              </div>
              <h2 className="text-lg font-black text-slate-800 leading-tight">{project.title}</h2>
              {project.description && (
                <p className="text-xs mt-2 leading-relaxed text-slate-500">{project.description}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all hover:bg-slate-100"
              style={{ border: "1px solid rgba(15,23,42,0.09)", color: "#94A3B8" }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div
          className="flex-1 overflow-y-auto p-6 space-y-5"
          style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(0,0,0,0.08) transparent" }}
        >
          {/* Progress */}
          {project.tasksTotal > 0 && (
            <div
              className="rounded-2xl p-5"
              style={{ background: `${col.color}06`, border: `1.5px solid ${col.color}14` }}
            >
              <div className="flex items-end justify-between mb-4">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest mb-1 text-slate-400">Progresso</p>
                  <p className="text-4xl font-black leading-none" style={{ color: col.color }}>
                    {project.progress}%
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-slate-700">{project.tasksDone}</p>
                  <p className="text-[10px] text-slate-400">de {project.tasksTotal} tarefas</p>
                </div>
              </div>
              <div className="h-3 rounded-full bg-white overflow-hidden" style={{ boxShadow: "inset 0 1px 3px rgba(0,0,0,0.08)" }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${project.progress}%`, background: col.gradient }}
                />
              </div>
            </div>
          )}

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                label: "Equipe",
                value: `${project.teamSize} membros`,
                icon: Users,
                color: "#8B5CF6",
                bg:    "rgba(139,92,246,0.08)",
              },
              {
                label: project.highRisks > 0 ? "Riscos Críticos" : "Riscos",
                value: project.riskCount > 0 ? `${project.riskCount} risco${project.riskCount !== 1 ? "s" : ""}` : "Sem riscos",
                icon:  AlertTriangle,
                color: project.highRisks > 0 ? "#DC2626" : project.riskCount > 0 ? "#D97706" : "#10B981",
                bg:    project.highRisks > 0 ? "rgba(220,38,38,0.07)" : project.riskCount > 0 ? "rgba(217,119,6,0.07)" : "rgba(16,185,129,0.07)",
              },
              {
                label: isDelayed ? "Atrasado" : isUrgent ? "Urgente" : "Prazo",
                value: project.daysLeft === null ? "Não definido" : isDelayed ? `${Math.abs(project.daysLeft)} dias` : `${project.daysLeft} dias`,
                icon:  Calendar,
                color: isDelayed ? "#DC2626" : isUrgent ? "#D97706" : "#10B981",
                bg:    isDelayed ? "rgba(220,38,38,0.07)" : isUrgent ? "rgba(217,119,6,0.07)" : "rgba(16,185,129,0.07)",
              },
              {
                label: "Economia",
                value: currency(project.economy),
                icon:  TrendingUp,
                color: "#10B981",
                bg:    "rgba(16,185,129,0.07)",
              },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <div
                key={label}
                className="rounded-2xl p-4"
                style={{ background: bg, border: `1px solid ${color}15` }}
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <Icon className="w-3 h-3" style={{ color, opacity: 0.75 }} />
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
                </div>
                <p className="text-sm font-black" style={{ color }}>{value}</p>
              </div>
            ))}
          </div>

          {/* Timeline */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{ border: "1px solid rgba(15,23,42,0.07)" }}
          >
            {[
              { label: "Início Previsto",  value: fmt(project.expectedStart) },
              { label: "Término Previsto", value: fmt(project.expectedEnd) },
              { label: "Sponsor",          value: project.sponsor },
            ].map(({ label, value }, i) => (
              <div
                key={label}
                className="flex items-center justify-between px-5 py-3.5"
                style={{
                  background:   i % 2 === 0 ? "#F8FAFC" : "#ffffff",
                  borderBottom: i < 2 ? "1px solid rgba(15,23,42,0.05)" : "none",
                }}
              >
                <span className="text-xs font-semibold text-slate-400">{label}</span>
                <span className="text-xs font-bold text-slate-700">{value}</span>
              </div>
            ))}
          </div>

          {/* Team */}
          {project.members.length > 0 && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest mb-3 text-slate-400">Equipe</p>
              <div className="flex flex-wrap gap-2">
                {project.members.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
                    style={{ background: "#F8FAFC", border: "1px solid rgba(15,23,42,0.07)" }}
                  >
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black text-white"
                      style={{ background: memberColor(m.name) }}
                    >
                      {initials(m.name)}
                    </div>
                    <span className="text-xs font-semibold text-slate-600">{m.name}</span>
                  </div>
                ))}
                {project.teamSize > 5 && (
                  <div className="flex items-center px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 bg-slate-100">
                    +{project.teamSize - 5} mais
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="p-5 shrink-0 flex gap-3"
          style={{ borderTop: "1px solid rgba(15,23,42,0.07)" }}
        >
          <Link
            href={`/projects/${project.id}`}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]"
            style={{
              background: col.gradient,
              boxShadow:  `0 4px 16px ${col.glow}`,
            }}
          >
            Abrir Projeto
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </>
  )
}

// ─── List View ────────────────────────────────────────────────────────────────

function ListView({ projects, onRowClick }: { projects: KanbanProject[]; onRowClick: (p: KanbanProject) => void }) {
  const grouped = COLUMNS.map((col) => ({
    col,
    items: projects.filter((p) => col.displayStatuses.includes(p.status as never)),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {grouped.map(({ col, items }) => (
          <div key={col.id}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: col.color }} />
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: col.color }}>
                {col.label}
              </span>
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: `${col.color}12`, color: col.color }}
              >
                {items.length}
              </span>
              <div className="flex-1 h-px" style={{ background: `${col.color}18` }} />
            </div>
            <div
              className="rounded-2xl overflow-hidden bg-white"
              style={{ border: "1px solid rgba(15,23,42,0.07)", boxShadow: "0 1px 4px rgba(15,23,42,0.05)" }}
            >
              {items.map((p, i) => {
                const pCfg      = p.priorityLabel ? PRIORITY_CFG[p.priorityLabel] : null
                const isDelayed = p.daysLeft !== null && p.daysLeft < 0
                return (
                  <div
                    key={p.id}
                    onClick={() => onRowClick(p)}
                    className="flex items-center gap-4 px-5 py-3.5 cursor-pointer transition-all hover:bg-slate-50"
                    style={{ borderBottom: i < items.length - 1 ? "1px solid rgba(15,23,42,0.05)" : "none" }}
                  >
                    <div
                      className="w-1 h-10 rounded-full shrink-0"
                      style={{ background: col.gradient }}
                    />
                    <div className="w-8 shrink-0">
                      {pCfg && p.priorityLabel
                        ? <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
                            style={{ background: pCfg.bg, color: pCfg.color }}>{p.priorityLabel}</span>
                        : <span className="text-[9px] text-slate-300">—</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{p.title}</p>
                      <p className="text-[10px] truncate text-slate-400">{p.sponsor}</p>
                    </div>
                    <div className="w-28 shrink-0 hidden md:block">
                      <div className="flex justify-between text-[10px] mb-1">
                        <span className="text-slate-400">{p.tasksDone}/{p.tasksTotal}</span>
                        <span style={{ color: col.color }} className="font-bold">{p.progress}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${p.progress}%`, background: col.gradient }} />
                      </div>
                    </div>
                    <div className="w-12 shrink-0 hidden lg:flex items-center gap-1">
                      <Users className="w-3 h-3 text-slate-300" />
                      <span className="text-xs text-slate-500">{p.teamSize}</span>
                    </div>
                    <div className="w-14 shrink-0 hidden lg:block">
                      {p.riskCount > 0
                        ? <span className="flex items-center gap-1 text-[10px] font-bold"
                            style={{ color: p.highRisks > 0 ? "#DC2626" : "#D97706" }}>
                            <AlertTriangle className="w-3 h-3" /> {p.riskCount}
                          </span>
                        : <span className="text-[10px] text-slate-300">—</span>}
                    </div>
                    <div className="w-20 shrink-0 text-right hidden xl:block">
                      <span className="text-xs font-bold"
                        style={{ color: isDelayed ? "#DC2626" : p.daysLeft !== null && p.daysLeft <= 14 ? "#D97706" : "#94A3B8" }}>
                        {p.daysLeft === null ? "—" : isDelayed ? `-${Math.abs(p.daysLeft)}d` : `${p.daysLeft}d`}
                      </span>
                    </div>
                    <ChevronRight className="w-4 h-4 shrink-0 text-slate-300" />
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        {projects.length === 0 && (
          <div className="text-center py-20 text-slate-300">
            <LayoutGrid className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-semibold">Nenhum projeto encontrado</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Client ──────────────────────────────────────────────────────────────

export function KanbanClient({ projects: initial }: { projects: KanbanProject[] }) {
  const [projects,  setProjects]  = useState<KanbanProject[]>(initial)
  const [activeId,  setActiveId]  = useState<string | null>(null)
  const [overId,    setOverId]    = useState<string | null>(null)
  const [view,      setView]      = useState<"kanban" | "list">("kanban")
  const [search,    setSearch]    = useState("")
  const [selected,  setSelected]  = useState<KanbanProject | null>(null)
  const [saving,    setSaving]    = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const prevStatuses = useRef<Record<string, string>>({})

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  )

  const filtered = projects.filter((p) =>
    p.title.toLowerCase().includes(search.toLowerCase()) ||
    p.sponsor.toLowerCase().includes(search.toLowerCase())
  )

  const activeProject = activeId ? projects.find((p) => p.id === activeId) ?? null : null

  function handleDragStart(e: DragStartEvent) {
    const id = e.active.id as string
    setActiveId(id)
    prevStatuses.current[id] = projects.find((p) => p.id === id)?.status ?? ""
  }

  function handleDragOver(e: DragOverEvent) {
    setOverId((e.over?.id as string) ?? null)
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    setActiveId(null)
    setOverId(null)
    if (!over) return

    const projectId   = active.id as string
    const columnId    = over.id as ColumnId
    const targetCol   = COL_BY_ID[columnId]
    if (!targetCol) return

    const newStatus  = targetCol.dropStatus
    const current    = projects.find((p) => p.id === projectId)?.status ?? ""
    const prev       = prevStatuses.current[projectId]
    const prevColId  = prev ? COL_BY_STATUS[prev]?.id : undefined
    if (prevColId === columnId) return

    setProjects((ps) => ps.map((p) => p.id === projectId ? { ...p, status: newStatus } : p))
    setSaving(projectId)

    startTransition(async () => {
      try {
        await updateProjectStatusKanban(projectId, newStatus)
      } catch {
        setProjects((ps) => ps.map((p) => p.id === projectId ? { ...p, status: current } : p))
      } finally {
        setSaving(null)
      }
    })
  }

  return (
    <div className="flex flex-col h-full" style={{ background: "#F1F5F9" }}>

      {/* ── Top Bar ── */}
      <div
        className="flex items-center gap-4 px-6 h-16 shrink-0 bg-white"
        style={{ borderBottom: "1.5px solid rgba(15,23,42,0.07)", boxShadow: "0 1px 6px rgba(15,23,42,0.05)" }}
      >
        {/* Brand */}
        <div className="flex items-center gap-3 mr-2 shrink-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, #7B2FBE, #9333EA)", boxShadow: "0 4px 12px rgba(123,47,190,0.30)" }}
          >
            <LayoutGrid className="text-white" style={{ width: 18, height: 18 }} />
          </div>
          <div className="hidden sm:block">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">PORTFÓLIO</p>
            <p className="text-sm font-black text-slate-800 leading-tight">Kanban de Projetos</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar projeto ou sponsor…"
            className="w-full pl-9 pr-3 h-9 rounded-xl text-sm outline-none text-slate-700 placeholder:text-slate-300"
            style={{ background: "#F8FAFC", border: "1.5px solid rgba(15,23,42,0.09)" }}
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2">
              <X className="w-3.5 h-3.5 text-slate-400" />
            </button>
          )}
        </div>

        {/* Counts */}
        <div className="hidden lg:flex items-center gap-2">
          <span
            className="text-xs font-semibold px-3 h-7 rounded-full flex items-center"
            style={{ background: "#F1F5F9", color: "#64748B", border: "1px solid rgba(15,23,42,0.08)" }}
          >
            {filtered.length} projetos
          </span>
          {saving && (
            <span
              className="text-xs font-semibold px-3 h-7 rounded-full flex items-center gap-1.5"
              style={{ background: "rgba(123,47,190,0.08)", color: "#7B2FBE", border: "1px solid rgba(123,47,190,0.15)" }}
            >
              <Loader2 className="w-3 h-3 animate-spin" /> Salvando…
            </span>
          )}
        </div>

        {/* Pipeline mini-stats */}
        <div className="hidden xl:flex items-center gap-1.5 ml-auto">
          {COLUMNS.map((col) => {
            const count = filtered.filter((p) => col.displayStatuses.includes(p.status as never)).length
            return (
              <div
                key={col.id}
                className="flex items-center gap-1.5 px-2.5 h-7 rounded-full text-[10px] font-bold"
                style={{ background: `${col.color}10`, color: col.color }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: col.color }}
                />
                {count}
              </div>
            )
          })}
        </div>

        {/* View toggle */}
        <div className="flex items-center ml-auto xl:ml-3">
          <div
            className="flex items-center p-1 rounded-xl"
            style={{ background: "#F1F5F9", border: "1.5px solid rgba(15,23,42,0.08)" }}
          >
            {([["kanban", LayoutGrid], ["list", List]] as const).map(([v, Icon]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                style={{
                  background: view === v ? "#ffffff" : "transparent",
                  color:      view === v ? "#7B2FBE" : "#94A3B8",
                  boxShadow:  view === v ? "0 1px 4px rgba(15,23,42,0.10)" : "none",
                }}
              >
                <Icon className="w-4 h-4" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Board / List ── */}
      {view === "list" ? (
        <ListView projects={filtered} onRowClick={setSelected} />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          {/* Outer: full width, scrolls horizontally only if viewport < min-width of columns */}
          <div
            className="flex-1 overflow-x-auto"
            style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(15,23,42,0.12) transparent" }}
          >
            {/* Inner: always fills full width, columns flex-grow to share space */}
            <div
              className="flex gap-3 p-4 h-full"
              style={{ minWidth: "100%", minHeight: "100%" }}
            >
              {COLUMNS.map((col) => (
                <KanbanColumn
                  key={col.id}
                  col={col}
                  projects={filtered.filter((p) => col.displayStatuses.includes(p.status as never))}
                  isOver={overId === col.id}
                  onCardClick={setSelected}
                />
              ))}
            </div>
          </div>

          <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.22,1,0.36,1)" }}>
            {activeProject && <ProjectCard project={activeProject} isDragOverlay />}
          </DragOverlay>
        </DndContext>
      )}

      {selected && <ProjectTasksKanban project={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
