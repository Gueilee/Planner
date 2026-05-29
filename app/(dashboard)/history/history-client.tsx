"use client"

import { useState, useTransition, useCallback } from "react"
import { getProjectFullHistory } from "@/lib/actions/history"
import { format, differenceInDays, formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import Link from "next/link"
import {
  Search, X, Clock, AlertTriangle, Users, TrendingUp,
  Calendar, FileText, Star, Rocket, BookOpen, Target,
  Play, RefreshCw, Flag, Loader2, ChevronRight, ExternalLink,
  ThumbsUp, ThumbsDown, BarChart3, Layers, Info, ArrowUpRight,
  CircleDot, GitBranch, CheckCircle2, Paperclip, Download,
  FileImage, FileArchive, File, DollarSign,
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProjectSummary = {
  id: string
  title: string
  description: string | null
  status: string
  priority: number | null
  priorityLabel: string | null
  projectArea: string
  origin: string | null
  progress: number
  tasksDone: number
  tasksTotal: number
  teamSize: number
  meetingCount: number
  riskCount: number
  economy: number | null
  budget: number | null
  sponsor: string
  projectCreatedAt: string
  expectedStart: string | null
  expectedEnd: string | null
  daysLeft: number | null
}

type FullHistory = Awaited<ReturnType<typeof getProjectFullHistory>>

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; border: string; pill: string }> = {
  PLANNING:        { label: "Planejamento",  color: "#475569", bg: "#F8FAFC", border: "#CBD5E1", pill: "bg-slate-100 text-slate-600 border-slate-200" },
  IN_PROGRESS:     { label: "Em Andamento",  color: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE", pill: "bg-blue-50 text-blue-700 border-blue-200" },
  PILOT:           { label: "Em Validação",   color: "#0891B2", bg: "#ECFEFF", border: "#A5F3FC", pill: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  RAMP_UP:         { label: "Ramp-Up",        color: "#D97706", bg: "#FFFBEB", border: "#FDE68A", pill: "bg-amber-50 text-amber-700 border-amber-200" },
  GO_LIVE:         { label: "GO LIVE",        color: "#059669", bg: "#ECFDF5", border: "#A7F3D0", pill: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  POST_GOLIVE:     { label: "Pós GO LIVE",    color: "#047857", bg: "#D1FAE5", border: "#6EE7B7", pill: "bg-green-50 text-green-700 border-green-200" },
  COMPLETED:       { label: "Concluído",      color: "#0D9488", bg: "#F0FDFA", border: "#99F6E4", pill: "bg-teal-50 text-teal-700 border-teal-200" },
  ON_HOLD:         { label: "Em Espera",      color: "#EA580C", bg: "#FFF7ED", border: "#FED7AA", pill: "bg-orange-50 text-orange-700 border-orange-200" },
  CANCELLED:       { label: "Cancelado",      color: "#DC2626", bg: "#FEF2F2", border: "#FECACA", pill: "bg-red-50 text-red-700 border-red-200" },
  FUTURE_ANALYSIS: { label: "Análise Futura", color: "#7C3AED", bg: "#F5F3FF", border: "#DDD6FE", pill: "bg-violet-50 text-violet-700 border-violet-200" },
}

const MEETING_CFG: Record<string, { label: string; color: string; icon: typeof Play; bg: string }> = {
  GO_NO_GO:        { label: "Reunião Go/No-Go",  color: "#7C3AED", icon: Flag,       bg: "#F5F3FF" },
  KICKOFF:         { label: "Kick-Off",           color: "#059669", icon: Play,       bg: "#ECFDF5" },
  CHECKPOINT:      { label: "Checkpoint",         color: "#2563EB", icon: RefreshCw,  bg: "#EFF6FF" },
  STATUS_REPORT:   { label: "Status Report",      color: "#0284C7", icon: BarChart3,  bg: "#F0F9FF" },
  GO_LIVE:         { label: "GO LIVE",            color: "#059669", icon: Rocket,     bg: "#ECFDF5" },
  POST_GOLIVE:     { label: "Pós GO LIVE",        color: "#047857", icon: TrendingUp, bg: "#D1FAE5" },
  LESSONS_LEARNED: { label: "Lições Aprendidas",  color: "#D97706", icon: BookOpen,   bg: "#FFFBEB" },
  PILOT:           { label: "Reunião de Piloto",  color: "#7C3AED", icon: Target,     bg: "#F5F3FF" },
  OTHER:           { label: "Reunião",            color: "#64748B", icon: Users,      bg: "#F8FAFC" },
}

const TASK_STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  PLANNING:    { label: "Planejamento",  color: "#64748B", bg: "#F8FAFC" },
  IN_PROGRESS: { label: "Em Andamento", color: "#2563EB", bg: "#EFF6FF" },
  COMPLETED:   { label: "Concluída",    color: "#059669", bg: "#ECFDF5" },
  VALIDATION:  { label: "Validação",    color: "#7C3AED", bg: "#F5F3FF" },
  ON_HOLD:     { label: "Pausada",      color: "#EA580C", bg: "#FFF7ED" },
  DELAYED:     { label: "Atrasada",     color: "#DC2626", bg: "#FEF2F2" },
  INITIATIVE:  { label: "Iniciativa",   color: "#64748B", bg: "#F8FAFC" },
}

const RISK_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  LOW:      { label: "Baixo",   color: "#059669", bg: "#ECFDF5", border: "#A7F3D0" },
  MEDIUM:   { label: "Médio",   color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
  HIGH:     { label: "Alto",    color: "#EA580C", bg: "#FFF7ED", border: "#FED7AA" },
  CRITICAL: { label: "Crítico", color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
}

const PRIORITY_CFG: Record<string, { color: string; bg: string; border: string }> = {
  P1: { color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
  P2: { color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
  P3: { color: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE" },
  P4: { color: "#64748B", bg: "#F8FAFC", border: "#CBD5E1" },
}

const ORIGIN_LABELS: Record<string, string> = {
  SPONSOR: "Liderança / Sponsor", CLIENT: "Cliente Externo", INTERNAL: "Demanda Interna",
}

const ACTIVE_STATUSES = ["PLANNING", "IN_PROGRESS", "PILOT", "RAMP_UP", "GO_LIVE", "POST_GOLIVE"]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(d: string | Date | null | undefined): string {
  if (!d) return "—"
  return format(new Date(d as string), "dd/MM/yyyy", { locale: ptBR })
}
function currency(v: number | null | undefined): string {
  if (!v) return "—"
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
}
function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
}
function avatarColor(name: string): string {
  const hues = [221, 262, 142, 32, 168, 316, 199]
  return `hsl(${hues[name.charCodeAt(0) % hues.length]},60%,48%)`
}

// ─── Left Panel — Project Card ────────────────────────────────────────────────

function ProjectListCard({ project, selected, onClick }: {
  project: ProjectSummary
  selected: boolean
  onClick: () => void
}) {
  const cfg  = STATUS_CFG[project.status] ?? STATUS_CFG.PLANNING
  const pCfg = project.priorityLabel ? PRIORITY_CFG[project.priorityLabel] : null
  const isDelayed = project.daysLeft !== null && project.daysLeft < 0

  return (
    <button onClick={onClick} className="w-full text-left rounded-2xl p-3.5 transition-all duration-200 group"
      style={{
        background: selected ? cfg.bg : "white",
        border:     `1px solid ${selected ? cfg.border : "#E5E7EB"}`,
        boxShadow:  selected ? `0 2px 12px ${cfg.color}18` : "0 1px 3px rgba(0,0,0,0.04)",
      }}>

      {/* Status + priority */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${cfg.pill}`}>
            {cfg.label}
          </span>
          {pCfg && project.priorityLabel && (
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md border"
              style={{ background: pCfg.bg, color: pCfg.color, borderColor: pCfg.border }}>
              {project.priorityLabel}
            </span>
          )}
        </div>
        <ChevronRight className="w-3.5 h-3.5 shrink-0 transition-transform group-hover:translate-x-0.5"
          style={{ color: selected ? cfg.color : "#D1D5DB" }} />
      </div>

      {/* Title */}
      <p className="text-sm font-bold leading-snug mb-0.5 text-gray-900">{project.title}</p>
      <p className="text-[10px] text-gray-400 mb-2.5">{project.sponsor}</p>

      {/* Progress */}
      {project.tasksTotal > 0 && (
        <div className="mb-2.5">
          <div className="flex justify-between text-[9px] mb-1">
            <span className="text-gray-400">{project.tasksDone}/{project.tasksTotal} tarefas</span>
            <span className="font-bold" style={{ color: cfg.color }}>{project.progress}%</span>
          </div>
          <div className="h-1 rounded-full bg-gray-100">
            <div className="h-full rounded-full transition-all" style={{ width: `${project.progress}%`, background: cfg.color }} />
          </div>
        </div>
      )}

      {/* Meta row */}
      <div className="flex items-center gap-2 text-[9px] text-gray-400">
        <span className="flex items-center gap-1"><Users className="w-2.5 h-2.5" />{project.teamSize}</span>
        <span>·</span>
        <span className="flex items-center gap-1"><RefreshCw className="w-2.5 h-2.5" />{project.meetingCount}</span>
        {project.riskCount > 0 && (
          <><span>·</span>
          <span className="flex items-center gap-1 text-orange-500">
            <AlertTriangle className="w-2.5 h-2.5" />{project.riskCount}
          </span></>
        )}
        {project.daysLeft !== null && (
          <><span>·</span>
          <span style={{ color: isDelayed ? "#DC2626" : "#6B7280" }}>
            {isDelayed ? `-${Math.abs(project.daysLeft)}d` : `${project.daysLeft}d`}
          </span></>
        )}
      </div>
    </button>
  )
}

// ─── Section Title ────────────────────────────────────────────────────────────

function SectionTitle({ icon: Icon, title }: { icon: typeof Info; title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-7 h-7 rounded-xl flex items-center justify-center"
        style={{ background: "linear-gradient(135deg, rgba(123,47,190,0.10), rgba(147,51,234,0.15))" }}>
        <Icon className="w-3.5 h-3.5 text-violet-600" />
      </div>
      <span className="text-sm font-bold text-gray-700">{title}</span>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  )
}

// ─── Timeline card ────────────────────────────────────────────────────────────

function TCard({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <div className="rounded-xl mt-2 bg-white overflow-hidden"
      style={{ border: `1px solid ${color}25`, borderLeft: `3px solid ${color}` }}>
      {children}
    </div>
  )
}

// ─── Timeline Event ───────────────────────────────────────────────────────────

function TimelineEvent({
  date, title, subtitle, color, icon: Icon, iconBg,
  children, isFirst = false, isLast = false, isPending = false,
}: {
  date: string | Date | null
  title: string
  subtitle?: string
  color: string
  icon: typeof Play
  iconBg: string
  children?: React.ReactNode
  isFirst?: boolean
  isLast?: boolean
  isPending?: boolean
}) {
  return (
    <div className="flex gap-4" style={{ opacity: isPending ? 0.50 : 1 }}>
      {/* Connector + node */}
      <div className="flex flex-col items-center shrink-0" style={{ width: "36px" }}>
        {!isFirst && (
          <div className="w-px flex-none" style={{ height: "16px", background: `${color}40` }} />
        )}
        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
          style={{
            background: isPending ? "#F9FAFB" : iconBg,
            border: `2px solid ${isPending ? "#E5E7EB" : color + "60"}`,
            boxShadow: isPending ? "none" : `0 0 10px ${color}25`,
          }}>
          <Icon className="w-4 h-4" style={{ color: isPending ? "#D1D5DB" : color }} />
        </div>
        {!isLast && (
          <div className="w-px flex-1 mt-1" style={{
            minHeight: "24px",
            background: isPending ? "#E5E7EB" : `linear-gradient(to bottom, ${color}30, #E5E7EB)`,
            borderLeft: isPending ? "1px dashed #E5E7EB" : "none",
          }} />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 pb-8 min-w-0">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div>
            <p className="text-sm font-bold text-gray-800">
              {title}
              {isPending && (
                <span className="ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-400">PENDENTE</span>
              )}
            </p>
            {subtitle && <p className="text-xs mt-0.5 text-gray-400">{subtitle}</p>}
          </div>
          {date && !isPending && (
            <span className="text-[10px] font-semibold shrink-0 mt-0.5 text-gray-400">{fmt(date)}</span>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-12 text-center">
      <div className="w-20 h-20 rounded-3xl flex items-center justify-center"
        style={{ background: "linear-gradient(135deg, rgba(123,47,190,0.07), rgba(147,51,234,0.10))" }}>
        <Search className="w-9 h-9 text-violet-300" />
      </div>
      <div>
        <p className="text-base font-bold text-gray-600">Selecione um projeto</p>
        <p className="text-sm mt-1 text-gray-400">Clique em qualquer projeto à esquerda para ver seu histórico completo</p>
      </div>
    </div>
  )
}

// ─── Full Project History View ────────────────────────────────────────────────

function printAtaFromHistory(content: string, title: string) {
  const win = window.open("", "_blank")
  if (!win) return
  const logoUrl = window.location.origin + "/logo_v4.png"
  const now = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })

  const processTable = (tableLines: string[]) => {
    const rows = tableLines.filter(l => !l.match(/^\|[\s\-|:]+\|$/))
    if (!rows.length) return ""
    return "<table>" + rows.map((row, ri) => {
      const cells = row.split("|").slice(1, -1).map(c => c.trim())
      const tag = ri === 0 ? "th" : "td"
      return "<tr>" + cells.map(c => `<${tag}>${c}</${tag}>`).join("") + "</tr>"
    }).join("") + "</table>"
  }

  const lines = content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").split("\n")
  const parts: string[] = []
  let i = 0
  while (i < lines.length) {
    const l = lines[i]
    if (l.startsWith("# "))  { parts.push(`<h1>${l.slice(2)}</h1>`);  i++; continue }
    if (l.startsWith("## ")) { parts.push(`<h2>${l.slice(3)}</h2>`); i++; continue }
    if (l.trim() === "---")  { parts.push("<hr>"); i++; continue }
    if (l.startsWith("|")) {
      const tl: string[] = []
      while (i < lines.length && lines[i].startsWith("|")) { tl.push(lines[i]); i++ }
      parts.push(processTable(tl)); continue
    }
    if (l.startsWith("- ") || l.startsWith("* ")) {
      const items: string[] = []
      while (i < lines.length && (lines[i].startsWith("- ") || lines[i].startsWith("* "))) {
        items.push(`<li>${lines[i].slice(2).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</li>`)
        i++
      }
      parts.push("<ul>" + items.join("") + "</ul>"); continue
    }
    if (l.trim() === "") { parts.push("<div style='margin:3pt'></div>"); i++; continue }
    parts.push(`<p>${l.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/_(.+?)_/g, "<em>$1</em>")}</p>`)
    i++
  }

  win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${title}</title>
<style>
@page { size: A4; margin: 2.2cm 2cm 2.5cm 2cm; }
* { box-sizing: border-box; }
body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10.5pt; color: #1a1a1a; margin: 0; line-height: 1.55; }
.hdr { display:flex; align-items:center; justify-content:space-between; padding-bottom:14pt; margin-bottom:10pt; border-bottom:2.5pt solid #0F172A; }
.hdr img { height:42pt; width:auto; }
.hdr-r { text-align:right; }
.hdr-t { font-size:14pt; font-weight:800; color:#0F172A; margin:0 0 2pt; }
.hdr-m { font-size:8pt; color:#64748B; margin:0; }
h1 { font-size:13pt; font-weight:800; color:#0F172A; border-left:4pt solid #2463FF; padding-left:8pt; margin:20pt 0 8pt; }
h2 { font-size:9.5pt; font-weight:700; color:#1E3A5F; text-transform:uppercase; letter-spacing:.8pt; margin:16pt 0 5pt; border-bottom:1pt solid #CBD5E1; padding-bottom:3pt; }
hr { border:none; border-top:1pt solid #E2E8F0; margin:12pt 0; }
p { margin:3pt 0 5pt; } ul { margin:4pt 0 6pt 18pt; } li { margin:2pt 0; }
table { width:100%; border-collapse:collapse; font-size:9.5pt; margin:8pt 0; }
th { background:#0F172A; color:#fff; padding:5pt 7pt; text-align:left; font-weight:700; font-size:8.5pt; text-transform:uppercase; }
td { padding:4.5pt 7pt; border-bottom:.5pt solid #E2E8F0; } tr:nth-child(even) td { background:#F8FAFC; }
.ftr { position:fixed; bottom:0; left:0; right:0; border-top:1pt solid #E2E8F0; display:flex; justify-content:space-between; padding:5pt 0 0; font-size:7.5pt; color:#94A3B8; }
</style></head><body>
<div class="hdr">
  <img src="${logoUrl}" alt="Kronex" onerror="this.style.display='none'" />
  <div class="hdr-r"><p class="hdr-t">${title}</p><p class="hdr-m">Documento oficial &nbsp;|&nbsp; ${now}</p></div>
</div>
${parts.join("\n")}
<div class="ftr"><span>Kronex — Sistema de Gestão de Projetos</span><span>${now}</span></div>
</body></html>`)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print() }, 400)
}

function ProjectHistoryView({ data }: { data: NonNullable<FullHistory> }) {
  const p   = data
  const cfg = STATUS_CFG[p.status] ?? STATUS_CFG.PLANNING

  const tasks       = p.tasks
  const total       = tasks.length
  const done        = tasks.filter((t) => t.status === "COMPLETED").length
  const inProg      = tasks.filter((t) => t.status === "IN_PROGRESS").length
  const delayed     = tasks.filter((t) => t.status === "DELAYED").length
  const progress    = total > 0 ? Math.round(tasks.reduce((s, t) => s + t.progress, 0) / total) : p.status === "COMPLETED" ? 100 : 0
  const highRisks   = p.risks.filter((r) => r.status === "HIGH" || r.status === "CRITICAL").length
  const goodLessons = p.lessonsLearned.filter((l) => l.influence === "POSITIVE").length
  const badLessons  = p.lessonsLearned.filter((l) => l.influence === "NEGATIVE").length
  const meetings    = p.meetings
  const isOpen      = !["COMPLETED", "CANCELLED"].includes(p.status)
  const startDate   = p.expectedStart ? new Date(p.expectedStart) : p.createdAt
  const lifetimeDays = differenceInDays(new Date(), startDate)

  return (
    <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#E5E7EB transparent" }}>

      {/* ── Hero header ── */}
      <div className="relative overflow-hidden bg-white border-b border-gray-100">
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: `linear-gradient(135deg, ${cfg.bg} 0%, white 60%)` }} />
        <div className="relative px-8 py-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className={`text-[10px] font-bold px-3 py-1 rounded-full border ${cfg.pill}`}>
                  {cfg.label}
                </span>
                <span className="text-[10px] text-gray-400">
                  Iniciado {formatDistanceToNow(startDate, { locale: ptBR, addSuffix: true })}
                </span>
              </div>
              <h2 className="text-2xl font-black text-gray-900 leading-tight">{p.title}</h2>
              {p.description && (
                <p className="text-sm mt-1.5 text-gray-500 leading-relaxed">{p.description}</p>
              )}
            </div>
            <Link href={`/projects/${p.id}`}
              className="flex items-center gap-2 px-4 h-9 rounded-xl text-sm font-bold shrink-0 transition-all hover:opacity-90 border"
              style={{ background: cfg.bg, color: cfg.color, borderColor: cfg.border }}>
              Abrir <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Progress bar */}
          {total > 0 && (
            <div className="mb-4">
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-gray-400">{done}/{total} tarefas concluídas</span>
                <span className="font-black" style={{ color: cfg.color }}>{progress}%</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100">
                <div className="h-full rounded-full transition-all duration-1000"
                  style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${cfg.color}88, ${cfg.color})` }} />
              </div>
            </div>
          )}

          {/* Metric chips */}
          <div className="flex flex-wrap gap-2">
            {[
              { icon: Users,         value: `${p.members.length} membros`,    color: "#7C3AED", bg: "#F5F3FF" },
              { icon: Clock,         value: `${lifetimeDays}d de projeto`,    color: "#0284C7", bg: "#F0F9FF" },
              { icon: RefreshCw,     value: `${meetings.length} reuniões`,    color: "#2563EB", bg: "#EFF6FF" },
              { icon: AlertTriangle, value: `${p.risks.length} riscos${highRisks > 0 ? ` (${highRisks} altos)` : ""}`, color: highRisks > 0 ? "#DC2626" : "#059669", bg: highRisks > 0 ? "#FEF2F2" : "#ECFDF5" },
              { icon: BookOpen,      value: `${p.lessonsLearned.length} lições`, color: "#D97706", bg: "#FFFBEB" },
            ].map(({ icon: Icon, value, color, bg }) => (
              <div key={value} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-gray-100"
                style={{ background: bg, color }}>
                <Icon className="w-3 h-3" />
                {value}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Sections ── */}
      <div className="px-8 py-7 space-y-10">

        {/* 1. Identificação */}
        <section>
          <SectionTitle icon={Info} title="Identificação e Contexto" />
          <div className="grid grid-cols-2 gap-4 mt-4">
            {/* Left: key-value table */}
            <div className="rounded-2xl overflow-hidden border border-gray-100 bg-white shadow-sm">
              {[
                { label: "Sponsor",          value: p.sponsor ? p.sponsor.name + (p.sponsor.department ? ` · ${p.sponsor.department}` : "") : "—" },
                { label: "Origem",           value: ORIGIN_LABELS[p.origin ?? ""] ?? (p.origin ?? "—") },
                { label: "Início Previsto",  value: fmt(p.expectedStart) },
                { label: "Término Previsto", value: fmt(p.expectedEnd) },
                { label: "GO LIVE Previsto", value: fmt(p.goLiveDate) },
                { label: "GO LIVE Real",     value: fmt(p.goLiveActual) },
                { label: "Fim Real",         value: fmt(p.actualEnd) },
              ].map(({ label, value }, i, arr) => (
                <div key={label} className="flex items-center justify-between px-4 py-2.5"
                  style={{ borderBottom: i < arr.length - 1 ? "1px solid #F3F4F6" : "none" }}>
                  <span className="text-xs font-medium text-gray-500">{label}</span>
                  <span className="text-xs font-bold text-gray-800 text-right max-w-[60%] truncate">{value}</span>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              {/* Financial */}
              <div className="rounded-2xl p-4 bg-white border border-gray-100 shadow-sm">
                <p className="text-[9px] font-bold uppercase tracking-widest mb-3 text-gray-400">Financeiro</p>
                {[
                  { label: "Budget",           value: currency(p.budget),         color: "#059669" },
                  { label: "Custo Estimado",   value: currency(p.estimatedCosts), color: "#D97706" },
                  { label: "Economia Esperada", value: currency(p.economy),        color: "#2563EB" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex justify-between items-center py-1.5">
                    <span className="text-xs text-gray-500">{label}</span>
                    <span className="text-sm font-black" style={{ color }}>{value}</span>
                  </div>
                ))}
              </div>

              {/* Tasks summary */}
              <div className="rounded-2xl p-4 bg-white border border-gray-100 shadow-sm">
                <p className="text-[9px] font-bold uppercase tracking-widest mb-2.5 text-gray-400">Status das Tarefas</p>
                {[
                  { label: "Concluídas",   value: done,   color: "#059669" },
                  { label: "Em Andamento", value: inProg, color: "#2563EB" },
                  { label: "Atrasadas",    value: delayed, color: "#DC2626" },
                  { label: "Total",        value: total,   color: cfg.color },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex justify-between items-center py-1">
                    <span className="text-[10px] text-gray-500">{label}</span>
                    <span className="text-sm font-black" style={{ color }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Scope blocks */}
          {(p.scope || p.asIs || p.toBe) && (
            <div className="grid grid-cols-1 gap-3 mt-4">
              {[
                { label: "Escopo", value: p.scope },
                { label: "AS IS",  value: p.asIs  },
                { label: "TO BE",  value: p.toBe  },
              ].filter((x) => x.value).map(({ label, value }) => (
                <div key={label} className="rounded-xl p-4 bg-white border border-gray-100 shadow-sm">
                  <p className="text-[9px] font-bold uppercase tracking-widest mb-2 text-gray-400">{label}</p>
                  <p className="text-sm leading-relaxed text-gray-600">{value}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 2. Timeline */}
        <section>
          <SectionTitle icon={GitBranch} title="Linha do Tempo do Projeto" />
          <div className="mt-6">

            <TimelineEvent
              date={p.createdAt}
              title="Criação do Projeto"
              subtitle={`Projeto registrado${p.sponsor ? ` · Sponsor: ${p.sponsor.name}` : ""}${p.origin ? ` · ${ORIGIN_LABELS[p.origin] ?? p.origin}` : ""}`}
              color="#7C3AED" icon={Target} iconBg="#F5F3FF" isFirst>
              {(p.scope || p.risks.length > 0) && (
                <TCard color="#7C3AED">
                  <div className="px-4 py-3 space-y-1.5">
                    {p.scope && <p className="text-xs leading-relaxed text-gray-600"><span className="font-bold text-gray-700">Escopo:</span> {p.scope.slice(0, 200)}{p.scope.length > 200 ? "…" : ""}</p>}
                    {p.risks.length > 0 && <p className="text-xs text-gray-500"><span className="font-bold text-gray-700">{p.risks.length} riscos</span> identificados</p>}
                  </div>
                </TCard>
              )}
            </TimelineEvent>

            {meetings.map((mtg, idx) => {
              const mcfg  = MEETING_CFG[mtg.type] ?? MEETING_CFG.OTHER
              const isLast = idx === meetings.length - 1 && p.lessonsLearned.length === 0 && p.documents.length === 0
              return (
                <TimelineEvent key={mtg.id} date={mtg.date}
                  title={mtg.title}
                  subtitle={`${mcfg.label} · ${mtg._count.participants} participantes · Por ${mtg.createdBy.name}`}
                  color={mcfg.color} icon={mcfg.icon} iconBg={mcfg.bg} isLast={isLast && !isOpen}>
                  {(mtg.content || mtg.decisions || mtg.nextActions || mtg.location) && (
                    <TCard color={mcfg.color}>
                      <div className="px-4 py-3 space-y-2 text-xs text-gray-600">
                        {mtg.location    && <p><span className="font-bold text-gray-700">Local:</span> {mtg.location}</p>}
                        {mtg.content     && <p className="leading-relaxed"><span className="font-bold text-gray-700">Pauta:</span> {mtg.content.slice(0, 300)}{mtg.content.length > 300 ? "…" : ""}</p>}
                        {mtg.decisions   && <p className="leading-relaxed"><span className="font-bold text-gray-700">Decisões:</span> {mtg.decisions.slice(0, 300)}{mtg.decisions.length > 300 ? "…" : ""}</p>}
                        {mtg.nextActions && <p><span className="font-bold text-gray-700">Próximas ações:</span> {mtg.nextActions}</p>}
                      </div>
                    </TCard>
                  )}
                </TimelineEvent>
              )
            })}

            {p.lessonsLearned.length > 0 && (
              <TimelineEvent
                date={p.lessonsLearned[0].createdAt}
                title={`Lições Aprendidas (${p.lessonsLearned.length})`}
                subtitle={`${goodLessons} boas práticas · ${badLessons} pontos de melhoria`}
                color="#D97706" icon={BookOpen} iconBg="#FFFBEB"
                isLast={p.documents.length === 0 && !isOpen}>
                <TCard color="#D97706">
                  <div className="px-4 py-3 space-y-2">
                    {p.lessonsLearned.slice(0, 4).map((l) => (
                      <div key={l.id} className="flex items-start gap-2">
                        <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                          style={{ background: l.influence === "POSITIVE" ? "#ECFDF5" : "#FFF7ED" }}>
                          {l.influence === "POSITIVE"
                            ? <ThumbsUp   className="w-2 h-2 text-emerald-600" />
                            : <ThumbsDown className="w-2 h-2 text-orange-600" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          {l.area && <span className="text-[9px] font-bold mr-1.5"
                            style={{ color: l.influence === "POSITIVE" ? "#059669" : "#EA580C" }}>{l.area}</span>}
                          <span className="text-xs text-gray-600">{l.occurrence.slice(0, 120)}{l.occurrence.length > 120 ? "…" : ""}</span>
                        </div>
                      </div>
                    ))}
                    {p.lessonsLearned.length > 4 && (
                      <p className="text-[10px] text-gray-400">+{p.lessonsLearned.length - 4} mais lições registradas</p>
                    )}
                  </div>
                </TCard>
              </TimelineEvent>
            )}

            {p.documents.filter((doc) => doc.type !== "KICKOFF").map((doc, idx, arr) => {
              const isAta     = doc.type === "MEETING_ATA"
              const isClosure = doc.type === "PROJECT_CLOSURE"
              const isOpening = doc.type === "PROJECT_OPENING"
              const docColor  = isClosure ? "#0D9488" : isAta ? "#2463FF" : "#7C3AED"
              const docBg     = isClosure ? "#F0FDFA" : isAta ? "#EFF6FF" : "#F5F3FF"
              const subtitle  = isClosure ? "Documento de Encerramento" : isOpening ? "Termo de Abertura" : isAta ? "ATA de Reunião" : "Documento"
              return (
                <TimelineEvent key={doc.id} date={doc.createdAt}
                  title={doc.title}
                  subtitle={subtitle}
                  color={docColor} icon={FileText} iconBg={docBg}
                  isLast={idx === arr.length - 1 && !isOpen}>
                  <TCard color={docColor}>
                    <div className="px-4 py-3 space-y-2">
                      {isAta && doc.content ? (
                        <>
                          <p className="text-xs leading-relaxed text-gray-600 line-clamp-3">{doc.content.slice(0, 200)}{doc.content.length > 200 ? "…" : ""}</p>
                          <button
                            onClick={() => printAtaFromHistory(doc.content!, doc.title)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all hover:opacity-80"
                            style={{ background: "#EFF6FF", color: "#2463FF", border: "1px solid #BFDBFE" }}
                          >
                            <Download className="w-3 h-3" /> Baixar PDF da ATA
                          </button>
                        </>
                      ) : doc.content ? (
                        <p className="text-xs leading-relaxed text-gray-600">{doc.content.slice(0, 250)}{doc.content.length > 250 ? "…" : ""}</p>
                      ) : null}
                    </div>
                  </TCard>
                </TimelineEvent>
              )
            })}

            {isOpen && (
              <>
                {!meetings.some((m) => m.type === "LESSONS_LEARNED") && (
                  <TimelineEvent date={null} title="Lições Aprendidas"
                    subtitle="Reunião de encerramento com aprendizados do time"
                    color="#D97706" icon={BookOpen} iconBg="#FFFBEB" isPending />
                )}
                {!meetings.some((m) => m.type === "GO_LIVE") && (
                  <TimelineEvent date={null} title="GO LIVE"
                    subtitle={p.goLiveDate ? `Previsto para ${fmt(p.goLiveDate)}` : "Data não definida"}
                    color="#059669" icon={Rocket} iconBg="#ECFDF5" isPending />
                )}
                <TimelineEvent date={null} title="Encerramento do Projeto"
                  subtitle={p.expectedEnd ? `Prazo: ${fmt(p.expectedEnd)}` : "A definir"}
                  color="#0D9488" icon={Flag} iconBg="#F0FDFA" isPending isLast />
              </>
            )}
          </div>
        </section>

        {/* 3. WBS */}
        {p.wbsAreas.length > 0 && (
          <section>
            <SectionTitle icon={Layers} title="Escopo e Cronograma (WBS)" />
            <div className="mt-4 space-y-3">
              {p.wbsAreas.map((area) => {
                const aTotal = area.tasks.length
                const aDone  = area.tasks.filter((t) => t.status === "COMPLETED").length
                const aPct   = aTotal > 0 ? Math.round((aDone / aTotal) * 100) : 0
                return (
                  <div key={area.id} className="rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-50">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: area.color ?? "#64748B" }} />
                      <span className="text-sm font-bold text-gray-800 flex-1">{area.name}</span>
                      <div className="flex items-center gap-3 text-[10px]">
                        <span className="text-gray-400">{aDone}/{aTotal}</span>
                        <span className="font-black" style={{ color: area.color ?? "#64748B" }}>{aPct}%</span>
                      </div>
                    </div>
                    {area.tasks.slice(0, 6).map((task, i) => {
                      const tcfg = TASK_STATUS_CFG[task.status] ?? TASK_STATUS_CFG.PLANNING
                      return (
                        <div key={task.id} className="flex items-center gap-3 px-4 py-2.5"
                          style={{ borderBottom: i < Math.min(area.tasks.length, 6) - 1 ? "1px solid #F9FAFB" : "none" }}>
                          <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: tcfg.color }} />
                          <span className="text-xs flex-1 truncate text-gray-700">{task.title}</span>
                          {task.responsible && (
                            <span className="text-[9px] hidden lg:block text-gray-400">{task.responsible.name}</span>
                          )}
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md shrink-0 border"
                            style={{ background: tcfg.bg, color: tcfg.color, borderColor: tcfg.color + "30" }}>{tcfg.label}</span>
                          <span className="text-[9px] font-black w-8 text-right" style={{ color: tcfg.color }}>{task.progress}%</span>
                        </div>
                      )
                    })}
                    {area.tasks.length > 6 && (
                      <div className="px-4 py-2 text-[10px] text-gray-400">+{area.tasks.length - 6} tarefas adicionais</div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* 4. Equipe */}
        {p.members.length > 0 && (
          <section>
            <SectionTitle icon={Users} title={`Equipe do Projeto (${p.members.length})`} />
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              {p.members.map((m) => (
                <div key={m.id} className="flex items-center gap-3 rounded-xl px-4 py-3 bg-white border border-gray-100 shadow-sm">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black text-white shrink-0"
                    style={{ background: avatarColor(m.user.name) }}>
                    {initials(m.user.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-800 truncate">{m.user.name}</p>
                    <p className="text-[9px] text-gray-400 truncate">{m.role}{m.user.department ? ` · ${m.user.department}` : ""}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 5. Riscos */}
        {p.risks.length > 0 && (
          <section>
            <SectionTitle icon={AlertTriangle} title={`Registro de Riscos (${p.risks.length})`} />
            <div className="mt-4 space-y-2">
              {p.risks.map((r) => {
                const rcfg = RISK_CFG[r.status] ?? RISK_CFG.LOW
                return (
                  <div key={r.id} className="rounded-xl px-4 py-3 bg-white flex items-start gap-3 border shadow-sm"
                    style={{ borderColor: rcfg.border, borderLeft: `3px solid ${rcfg.color}` }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-700 leading-relaxed">{r.description}</p>
                      {r.mitigation && (
                        <p className="text-[10px] mt-1 leading-relaxed text-gray-500">
                          <span className="font-bold" style={{ color: rcfg.color }}>Mitigação:</span> {r.mitigation}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full border"
                        style={{ background: rcfg.bg, color: rcfg.color, borderColor: rcfg.border }}>{rcfg.label}</span>
                      {r.owner && <span className="text-[9px] text-gray-400">{r.owner}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* 6. Controle Orçamentário */}
        {(() => {
          const budget       = p.budget ?? 0
          const totalOrc     = p.tasks.reduce((s, t) => s + ((t as any).budgetedCost ?? 0), 0)
          const totalReal    = p.tasks.reduce((s, t) => s + ((t as any).actualCost   ?? 0), 0)
          const ve           = p.tasks.reduce((s, t) => s + (((t as any).budgetedCost ?? 0) * (t.progress / 100)), 0)
          const idc          = totalReal > 0 ? ve / totalReal : null
          const hasData      = budget > 0 || totalOrc > 0 || totalReal > 0
          if (!hasData) return null

          function fmtBRL(v: number) {
            return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
          }
          const idcColor = idc === null ? "#94A3B8" : idc >= 1.0 ? "#059669" : idc >= 0.85 ? "#D97706" : "#DC2626"
          const idcBg    = idc === null ? "#F8FAFC" : idc >= 1.0 ? "#ECFDF5" : idc >= 0.85 ? "#FFFBEB" : "#FEF2F2"

          return (
            <section>
              <SectionTitle icon={BarChart3} title="Controle Orçamentário" />
              <div className="mt-4 rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-sm">
                {/* header */}
                <div className="px-5 py-4 flex items-center justify-between"
                  style={{ background: "linear-gradient(135deg, #0F172A 0%, #1E1B4B 100%)" }}>
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-white/40 mb-0.5">IDC — Índice de Desempenho de Custo</p>
                    {budget > 0 && <p className="text-sm font-black text-white">Budget: {fmtBRL(budget)}</p>}
                  </div>
                  {idc !== null ? (
                    <div className="flex flex-col items-center px-4 py-2 rounded-xl" style={{ background: idcBg, border: `1.5px solid ${idcColor}40` }}>
                      <span className="text-[8px] font-black uppercase tracking-widest" style={{ color: idcColor }}>IDC</span>
                      <span className="text-[9px] font-semibold mb-1" style={{ color: idcColor + "BB" }}>Desempenho de Custo</span>
                      <span className="text-2xl font-black" style={{ color: idcColor }}>{idc.toFixed(2)}</span>
                      <span className="text-[9px] font-semibold mt-1" style={{ color: idcColor }}>
                        {idc >= 1.0 ? "▲ Dentro do orçamento" : idc >= 0.85 ? "▼ Atenção" : "✕ Em risco"}
                      </span>
                    </div>
                  ) : (
                    <div className="px-4 py-2 rounded-xl bg-white/10">
                      <span className="text-xs font-semibold text-white/40">Sem dados de custo</span>
                    </div>
                  )}
                </div>

                {/* metrics */}
                <div className="grid grid-cols-3 divide-x divide-gray-100">
                  {[
                    { label: "Orçado (atividades)", value: totalOrc > 0 ? fmtBRL(totalOrc) : "—", sub: budget > 0 && totalOrc > 0 ? `${Math.round((totalOrc/budget)*100)}% do budget` : "—", color: "#059669", bg: "#F0FDF4" },
                    { label: "Valor Agregado (VE)", value: ve > 0 ? fmtBRL(ve) : "—", sub: totalOrc > 0 && ve > 0 ? `${Math.round((ve/totalOrc)*100)}% do orçado` : "—", color: "#2463FF", bg: "#EFF6FF" },
                    { label: "Gasto Real (CR)", value: totalReal > 0 ? fmtBRL(totalReal) : "—", sub: totalOrc > 0 && totalReal > 0 ? `${Math.round((totalReal/totalOrc)*100)}% do orçado` : "—", color: totalReal > totalOrc && totalOrc > 0 ? "#DC2626" : "#D97706", bg: totalReal > totalOrc && totalOrc > 0 ? "#FEF2F2" : "#FFFBEB" },
                  ].map(({ label, value, sub, color, bg }) => (
                    <div key={label} className="px-4 py-4 text-center" style={{ background: bg }}>
                      <p className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color }}>{label}</p>
                      <p className="text-lg font-black" style={{ color }}>{value}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: color + "90" }}>{sub}</p>
                    </div>
                  ))}
                </div>

                {/* consumption bar */}
                {budget > 0 && totalReal > 0 && (
                  <div className="px-5 py-3 bg-gray-50" style={{ borderTop: "1px solid #F1F5F9" }}>
                    <div className="flex justify-between text-[9px] font-semibold mb-1.5 text-gray-400">
                      <span>Consumo do Budget</span>
                      <span style={{ color: totalReal > budget ? "#DC2626" : "#64748B" }}>
                        {Math.round((totalReal / budget) * 100)}% utilizado
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{
                        width: `${Math.min(100, Math.round((totalReal / budget) * 100))}%`,
                        background: totalReal > budget ? "linear-gradient(90deg,#EF4444,#DC2626)"
                          : totalReal > budget * 0.85 ? "linear-gradient(90deg,#D97706,#F59E0B)"
                          : "linear-gradient(90deg,#059669,#10B981)",
                      }} />
                    </div>
                  </div>
                )}
              </div>
            </section>
          )
        })()}

        {/* 7. ATAs das Reuniões */}
        {(() => {
          const atas = p.documents.filter(d => d.type === "MEETING_ATA" && d.content)
          if (!atas.length) return null
          return (
            <section>
              <SectionTitle icon={FileText} title={`ATAs das Reuniões (${atas.length})`} />
              <div className="mt-4 grid grid-cols-1 gap-2">
                {atas.map(ata => (
                  <div key={ata.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white border border-gray-100 shadow-sm hover:border-blue-200 transition-all group">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: "linear-gradient(135deg, rgba(36,99,255,0.08), rgba(96,165,250,0.12))" }}>
                      <FileText className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate group-hover:text-blue-700 transition-colors">{ata.title}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        ATA de Reunião · {new Date(ata.createdAt).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <button
                      onClick={() => printAtaFromHistory(ata.content!, ata.title)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold shrink-0 transition-all hover:opacity-80"
                      style={{ background: "#EFF6FF", color: "#2463FF", border: "1px solid #BFDBFE" }}
                    >
                      <Download className="w-3 h-3" /> Baixar PDF
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )
        })()}

        {/* 8. Documentos */}
        <section>
          <SectionTitle icon={FileText} title="Documentos e Relatórios" />
          <div className="mt-4 flex flex-wrap gap-3">
            {[
              { label: "Termo de Abertura",         href: `/charter/${p.id}`,  color: "#3730A3", bg: "#EEF2FF", border: "#C7D2FE" },
              { label: "Relatório de Encerramento", href: `/closure/${p.id}`,  color: "#7C3AED", bg: "#F5F3FF", border: "#DDD6FE" },
            ].map(({ label, href, color, bg, border }) => (
              <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-80 border"
                style={{ background: bg, color, borderColor: border }}>
                <FileText className="w-3.5 h-3.5" />
                {label}
                <ArrowUpRight className="w-3 h-3 opacity-60" />
              </a>
            ))}
          </div>
        </section>

        {/* 7. Anexos */}
        {p.attachments.length > 0 && (
          <section>
            <SectionTitle icon={Paperclip} title={`Anexos do Projeto (${p.attachments.length})`} />
            <div className="mt-4 grid grid-cols-1 gap-2">
              {p.attachments.map((att) => {
                const ext  = att.fileName.split(".").pop()?.toLowerCase() ?? ""
                const isImg = ["jpg","jpeg","png","gif","webp","svg"].includes(ext)
                const isZip = ["zip","rar","7z","tar"].includes(ext)
                const Icon  = isImg ? FileImage : isZip ? FileArchive : ["pdf","doc","docx","xls","xlsx","ppt","pptx"].includes(ext) ? FileText : File
                const sizeFmt = att.fileSize
                  ? att.fileSize < 1024 * 1024
                    ? `${(att.fileSize / 1024).toFixed(1)} KB`
                    : `${(att.fileSize / (1024 * 1024)).toFixed(1)} MB`
                  : ""
                const taskTitle = "task" in att && att.task ? (att.task as { title: string }).title : null
                return (
                  <a
                    key={att.id}
                    href={att.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={att.fileName}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white border border-gray-100 shadow-sm hover:border-violet-200 hover:shadow-md transition-all group"
                  >
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: "linear-gradient(135deg, rgba(123,47,190,0.08), rgba(147,51,234,0.12))" }}>
                      <Icon className="w-4 h-4 text-violet-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate group-hover:text-violet-700 transition-colors">
                        {att.fileName}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {taskTitle && (
                          <span className="inline-flex items-center gap-0.5 mr-1.5 px-1.5 py-0.5 rounded-md font-bold text-violet-500 bg-violet-50">
                            Evidência · {taskTitle}
                          </span>
                        )}
                        {att.fileType.toUpperCase()}{sizeFmt ? ` · ${sizeFmt}` : ""}
                        {" · "}{new Date(att.uploadedAt).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <Download className="w-4 h-4 text-gray-300 group-hover:text-violet-500 transition-colors shrink-0" />
                  </a>
                )
              })}
            </div>
          </section>
        )}

        <div className="h-8" />
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

const AREA_CFG: Record<string, { label: string; color: string; icon: string }> = {
  TECNOLOGIA:  { label: "Tecnologia",            color: "#0891B2", icon: "💻" },
  QUALIDADE:   { label: "Qualidade",             color: "#059669", icon: "✅" },
  ESTRATEGICO: { label: "Projetos Estratégicos", color: "#7B2FBE", icon: "🎯" },
}

const ORIGIN_CFG: Record<string, { label: string; icon: string; color: string }> = {
  INTERNAL: { label: "Interna",   icon: "🏢", color: "#059669" },
  SPONSOR:  { label: "Liderança", icon: "👤", color: "#7B2FBE" },
  CLIENT:   { label: "Cliente",   icon: "🌐", color: "#2563EB" },
}

export function HistoryClient({ projects }: { projects: ProjectSummary[] }) {
  const [search,        setSearch]        = useState("")
  const [filter,        setFilter]        = useState("ALL")
  const [filterArea,    setFilterArea]    = useState("ALL")
  const [filterPriority,setFilterPriority]= useState("ALL")
  const [filterSponsor, setFilterSponsor] = useState("ALL")
  const [filterOrigin,  setFilterOrigin]  = useState("ALL")
  const [selected, setSelected] = useState<string | null>(null)
  const [history,  setHistory]  = useState<NonNullable<FullHistory> | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [, startTransition] = useTransition()

  const STATUS_FILTERS = [
    { value: "ALL",       label: "Todos" },
    { value: "ACTIVE",    label: "Ativos" },
    { value: "COMPLETED", label: "Concluídos" },
    { value: "ON_HOLD",   label: "Em Espera" },
  ]

  const allSponsors = [...new Set(projects.map((p) => p.sponsor).filter((s) => s && s !== "—"))].sort()
  const hasFilters  = !!(search || filter !== "ALL" || filterArea !== "ALL" || filterPriority !== "ALL" || filterSponsor !== "ALL" || filterOrigin !== "ALL")

  const filtered = projects.filter((p) => {
    const q = search.toLowerCase()
    const matchesSearch   = p.title.toLowerCase().includes(q) || p.sponsor.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q)
    const matchesStatus   = filter === "ALL" ? true : filter === "ACTIVE" ? ACTIVE_STATUSES.includes(p.status) : filter === "COMPLETED" ? p.status === "COMPLETED" : filter === "ON_HOLD" ? p.status === "ON_HOLD" : true
    const matchesArea     = filterArea     === "ALL" || p.projectArea === filterArea
    const matchesPriority = filterPriority === "ALL" || p.priorityLabel === filterPriority
    const matchesSponsor  = filterSponsor  === "ALL" || p.sponsor === filterSponsor
    const matchesOrigin   = filterOrigin   === "ALL" || p.origin === filterOrigin
    return matchesSearch && matchesStatus && matchesArea && matchesPriority && matchesSponsor && matchesOrigin
  })

  const handleSelect = useCallback((id: string) => {
    if (id === selected) return
    setSelected(id)
    setHistory(null)
    setLoading(true)
    startTransition(async () => {
      try {
        const data = await getProjectFullHistory(id)
        setHistory(data ?? null)
      } finally {
        setLoading(false)
      }
    })
  }, [selected])

  return (
    <div className="flex flex-col h-full" style={{ background: "#F7F6F2" }}>

      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 shrink-0 flex items-center gap-4"
        style={{ background: "linear-gradient(135deg, #ffffff, #faf8ff)" }}>
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-md"
          style={{ background: "linear-gradient(135deg, #7B2FBE, #9333EA)" }}>
          <Search className="w-4.5 h-4.5 text-white" style={{ width: "18px", height: "18px" }} />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">PORTFÓLIO</p>
          <h1 className="text-lg font-black text-gray-900 leading-tight">Consulta de Projetos</h1>
        </div>
        <div className="w-px h-6 mx-1 bg-gray-200" />
        <span className="text-xs font-semibold text-gray-400">
          {projects.length} projetos · {projects.filter((p) => ACTIVE_STATUSES.includes(p.status)).length} ativos
        </span>
      </div>

      {/* ── Split body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left sidebar ── */}
        <div className="flex flex-col shrink-0 bg-white border-r border-gray-150"
          style={{ width: "320px", borderRight: "1px solid #E5E7EB" }}>

          {/* Search + filters */}
          <div className="p-3.5 space-y-3 border-b border-gray-100 overflow-y-auto shrink-0"
            style={{ maxHeight: "52%", scrollbarWidth: "thin", scrollbarColor: "#E5E7EB transparent" }}>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, sponsor…"
                className="w-full pl-9 pr-8 h-9 rounded-xl text-sm outline-none bg-gray-50 border border-gray-200 text-gray-800 placeholder-gray-300 focus:ring-2 focus:ring-violet-200 focus:border-violet-400 transition-all" />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  <X className="w-3.5 h-3.5 text-gray-400" />
                </button>
              )}
            </div>

            {/* Status */}
            <div>
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Status</p>
              <div className="flex gap-1 flex-wrap">
                {STATUS_FILTERS.map((f) => (
                  <button key={f.value} onClick={() => setFilter(f.value)}
                    className="px-2.5 h-6 rounded-full text-[10px] font-bold transition-all border"
                    style={{
                      background:  filter === f.value ? "rgba(123,47,190,0.08)" : "transparent",
                      color:       filter === f.value ? "#7B2FBE" : "#9CA3AF",
                      borderColor: filter === f.value ? "#DDD6FE" : "#E5E7EB",
                    }}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Portfólio / Área */}
            <div>
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Portfólio</p>
              <div className="flex flex-col gap-1">
                <button onClick={() => setFilterArea("ALL")}
                  className="text-left px-2.5 h-7 rounded-lg text-[10px] font-semibold transition-all border"
                  style={{ background: filterArea === "ALL" ? "rgba(100,116,139,0.10)" : "transparent", color: filterArea === "ALL" ? "#475569" : "#9CA3AF", borderColor: filterArea === "ALL" ? "#CBD5E1" : "#E5E7EB" }}>
                  Todos os portfólios
                </button>
                {Object.entries(AREA_CFG).map(([key, cfg]) => {
                  const count = projects.filter((p) => p.projectArea === key).length
                  return (
                    <button key={key} onClick={() => setFilterArea(key)}
                      className="flex items-center gap-2 px-2.5 h-7 rounded-lg text-[10px] font-semibold transition-all border"
                      style={{ background: filterArea === key ? `${cfg.color}10` : "transparent", color: filterArea === key ? cfg.color : "#9CA3AF", borderColor: filterArea === key ? `${cfg.color}30` : "#E5E7EB" }}>
                      <span>{cfg.icon}</span>
                      <span className="flex-1 text-left truncate">{cfg.label}</span>
                      <span className="text-[9px] opacity-60">{count}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Prioridade */}
            <div>
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Prioridade</p>
              <div className="flex gap-1 flex-wrap">
                {["ALL", "P1", "P2", "P3", "P4"].map((v) => {
                  const active = filterPriority === v
                  const pCfg = v !== "ALL" ? PRIORITY_CFG[v] : null
                  return (
                    <button key={v} onClick={() => setFilterPriority(v)}
                      className="px-2.5 h-6 rounded-full text-[10px] font-bold transition-all border"
                      style={{
                        background:  active ? (pCfg ? `${pCfg.bg}` : "rgba(123,47,190,0.08)") : "transparent",
                        color:       active ? (pCfg ? pCfg.color : "#7B2FBE") : "#9CA3AF",
                        borderColor: active ? (pCfg ? pCfg.border : "#DDD6FE") : "#E5E7EB",
                      }}>
                      {v === "ALL" ? "Todas" : v}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Origem */}
            <div>
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Origem</p>
              <div className="flex gap-1 flex-wrap">
                <button onClick={() => setFilterOrigin("ALL")}
                  className="px-2.5 h-6 rounded-full text-[10px] font-bold transition-all border"
                  style={{ background: filterOrigin === "ALL" ? "rgba(123,47,190,0.08)" : "transparent", color: filterOrigin === "ALL" ? "#7B2FBE" : "#9CA3AF", borderColor: filterOrigin === "ALL" ? "#DDD6FE" : "#E5E7EB" }}>
                  Todas
                </button>
                {Object.entries(ORIGIN_CFG).map(([key, cfg]) => (
                  <button key={key} onClick={() => setFilterOrigin(key)}
                    className="flex items-center gap-1 px-2.5 h-6 rounded-full text-[10px] font-bold transition-all border"
                    style={{ background: filterOrigin === key ? `${cfg.color}12` : "transparent", color: filterOrigin === key ? cfg.color : "#9CA3AF", borderColor: filterOrigin === key ? `${cfg.color}30` : "#E5E7EB" }}>
                    <span>{cfg.icon}</span>{cfg.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Sponsor */}
            {allSponsors.length > 0 && (
              <div>
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Sponsor / Solicitante</p>
                <select value={filterSponsor} onChange={(e) => setFilterSponsor(e.target.value)}
                  className="w-full h-8 pl-2 pr-6 text-[11px] rounded-xl border border-gray-200 bg-gray-50 outline-none focus:ring-2 focus:ring-violet-200 text-gray-700 appearance-none cursor-pointer">
                  <option value="ALL">Todos</option>
                  {allSponsors.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}

            {/* Limpar */}
            {hasFilters && (
              <button
                onClick={() => { setSearch(""); setFilter("ALL"); setFilterArea("ALL"); setFilterPriority("ALL"); setFilterSponsor("ALL"); setFilterOrigin("ALL") }}
                className="w-full flex items-center justify-center gap-1.5 h-7 rounded-xl text-[10px] font-bold text-red-500 border border-red-100 hover:bg-red-50 transition-colors">
                <X className="w-3 h-3" /> Limpar filtros ({filtered.length}/{projects.length})
              </button>
            )}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2"
            style={{ scrollbarWidth: "thin", scrollbarColor: "#E5E7EB transparent" }}>
            {filtered.length === 0 ? (
              <div className="text-center py-10">
                <CircleDot className="w-6 h-6 mx-auto mb-2 text-gray-200" />
                <p className="text-xs text-gray-400">Nenhum projeto encontrado</p>
              </div>
            ) : filtered.map((p) => (
              <ProjectListCard key={p.id} project={p} selected={selected === p.id} onClick={() => handleSelect(p.id)} />
            ))}
          </div>
        </div>

        {/* ── Right panel ── */}
        <div className="flex-1 overflow-hidden flex flex-col" style={{ background: "#F7F6F2" }}>
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
              <p className="text-sm font-semibold text-gray-400">Carregando histórico…</p>
            </div>
          ) : history ? (
            <ProjectHistoryView data={history} />
          ) : (
            <EmptyState />
          )}
        </div>

      </div>
    </div>
  )
}
