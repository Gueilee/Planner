"use client"

import Link from "next/link"
import { format, differenceInDays, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  FolderKanban, TrendingUp, CheckCircle2, Activity, Target,
  ChevronRight, AlertTriangle, CalendarClock, Zap,
  ArrowRight, Clock, User, CircleDot, PauseCircle, ShieldAlert,
} from "lucide-react"
import { Button } from "@/components/ui/button"

// ─── Types ────────────────────────────────────────────────────────────────────

type TaskItem = {
  id: string
  title: string
  endDate: string | null
  status: string
  project: { id: string; title: string } | null
  responsible: { name: string } | null
  wbsArea: { name: string; color: string | null } | null
}

interface DashboardClientProps {
  user: { name: string; email: string; role: string }
  stats: { totalProjects: number; inProgress: number; completed: number; successRate: number }
  countByStatus: Record<string, number>
  overdueProjects:  Array<{ id: string; title: string; status: string; expectedEnd: string | null; sponsorName?: string | null }>
  upcomingProjects: Array<{ id: string; title: string; status: string; expectedEnd: string | null }>
  overdueTasks:     TaskItem[]
  upcomingTasks:    TaskItem[]
  onHoldProjects:   Array<{ id: string; title: string; expectedEnd: string | null; sponsorName?: string | null }>
  riskProjects:     Array<{ id: string; title: string; status: string; criticalCount: number; highCount: number }>
}

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  PLANNING:    "Planejamento",
  IN_PROGRESS: "Em Andamento",
  PILOT:       "Em Validação",
  RAMP_UP:     "Ramp-up",
  GO_LIVE:     "Go Live",
  POST_GOLIVE: "Pós Go Live",
  COMPLETED:   "Concluído",
  CANCELLED:   "Cancelado",
  ON_HOLD:     "Em Espera",
  FUTURE_ANALYSIS: "Análise Futura",
  PAUSED:      "Pausado",
}

const STATUS_COLOR: Record<string, string> = {
  PLANNING:    "#2463FF",
  IN_PROGRESS: "#10B981",
  PILOT:       "#10B981",
  RAMP_UP:     "#10B981",
  GO_LIVE:     "#059669",
  POST_GOLIVE: "#0891B2",
  COMPLETED:   "#64748B",
  CANCELLED:   "#EF4444",
  ON_HOLD:     "#8B5CF6",
  FUTURE_ANALYSIS: "#9333EA",
  PAUSED:      "#94A3B8",
}

// 6 pipeline stages. statusKeys = DB statuses that count towards each stage.
// filterKey = query param ?filter= usado na tela de projetos
const PIPELINE = [
  { key: "PLANNING",    filterKey: "PLANNING",    statusKeys: ["PLANNING"],              label: "Planejamento",  color: "#2463FF" },
  { key: "IN_PROGRESS", filterKey: "IN_PROGRESS", statusKeys: ["IN_PROGRESS", "RAMP_UP"],label: "Em Andamento",  color: "#10B981" },
  { key: "ON_HOLD",     filterKey: "ON_HOLD",     statusKeys: ["ON_HOLD", "PILOT"],      label: "Em Validação",  color: "#8B5CF6" },
  { key: "GO_LIVE",     filterKey: "GO_LIVE",     statusKeys: ["GO_LIVE"],               label: "Go Live",       color: "#059669" },
  { key: "POST_GOLIVE", filterKey: "GO_LIVE",     statusKeys: ["POST_GOLIVE"],           label: "Pós Go Live",   color: "#0891B2" },
  { key: "COMPLETED",   filterKey: "COMPLETED",   statusKeys: ["COMPLETED"],             label: "Concluído",     color: "#64748B" },
  { key: "PAUSED",      filterKey: "PAUSED",      statusKeys: ["PAUSED"],                label: "Pausado",       color: "#94A3B8" },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysFromNow(ds: string | null): number {
  if (!ds) return 0
  return differenceInDays(parseISO(ds), new Date())
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
}

function urgencyColor(days: number): string {
  if (days < -30) return "#EF4444"
  if (days < 0)   return "#F97316"
  if (days <= 14) return "#EF4444"
  if (days <= 30) return "#F59E0B"
  return "#10B981"
}

function urgencyBg(days: number): string {
  if (days < 0)   return "#FEF2F2"
  if (days <= 14) return "#FEF2F2"
  if (days <= 30) return "#FFFBEB"
  return "#ECFDF5"
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, gradient, glow,
}: {
  label: string; value: string | number; sub: string
  icon: React.ElementType; gradient: string; glow: string
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-5 h-36 flex flex-col justify-between"
      style={{
        background: gradient,
        boxShadow: `0 4px 20px ${glow}30, 0 1px 4px rgba(0,0,0,0.08)`,
      }}
    >
      <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-20"
        style={{ background: "radial-gradient(circle, rgba(255,255,255,0.8) 0%, transparent 70%)" }} />
      <div className="relative flex items-start justify-between">
        <p className="text-[11px] font-bold text-white/70 uppercase tracking-widest">{label}</p>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/15">
          <Icon className="w-4.5 h-4.5 text-white" style={{ width: 18, height: 18 }} />
        </div>
      </div>
      <div className="relative">
        <p className="text-4xl font-black text-white leading-none mb-1">{value}</p>
        <p className="text-xs text-white/60 font-medium">{sub}</p>
      </div>
    </div>
  )
}

function SectionHeader({ title, sub, href, linkLabel = "Ver todos" }: {
  title: string; sub?: string; href?: string; linkLabel?: string
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h2 className="text-sm font-black text-[#0F172A] tracking-tight">{title}</h2>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
      {href && (
        <Link href={href} className="flex items-center gap-1 text-xs font-semibold text-[#7B2FBE] hover:text-[#9333EA] transition-colors group">
          {linkLabel} <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DashboardClient({
  user, stats, countByStatus,
  overdueProjects, upcomingProjects,
  overdueTasks, upcomingTasks,
  onHoldProjects, riskProjects,
}: DashboardClientProps) {
  const firstName = user.name.split(" ")[0]
  const hour      = new Date().getHours()
  const greeting  = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite"

  const stageCount = (s: typeof PIPELINE[number]) =>
    s.statusKeys.reduce((sum, k) => sum + (countByStatus[k] ?? 0), 0)
  const maxPipelineCount = Math.max(1, ...PIPELINE.map(stageCount))
  const futureAnalysis   = countByStatus["FUTURE_ANALYSIS"] ?? 0
  const cancelled        = countByStatus["CANCELLED"] ?? 0
  const overdueCount     = overdueProjects.length

  return (
    <div className="space-y-5 max-w-[1440px] mx-auto">

      {/* ── Welcome Banner ────────────────────────────────────────────── */}
      <div
        className="relative rounded-2xl overflow-hidden px-6 py-5"
        style={{
          background: "linear-gradient(135deg, #ffffff 0%, #faf8ff 55%, #f3f0ff 100%)",
          border: "1px solid rgba(123,47,190,0.10)",
          boxShadow: "0 2px 20px rgba(123,47,190,0.07)",
        }}
      >
        <div className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{ backgroundImage: "radial-gradient(rgba(123,47,190,0.9) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
        <div className="absolute top-0 right-1/3 w-48 h-48 rounded-full opacity-[0.06] pointer-events-none"
          style={{ background: "radial-gradient(circle, #7B2FBE 0%, transparent 70%)", filter: "blur(32px)" }} />

        <div className="relative z-10 flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest bg-[rgba(123,47,190,0.08)] text-[#7B2FBE]">
                {format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}
              </span>
              {overdueCount > 0 && (
                <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-500 border border-red-100">
                  <AlertTriangle className="w-3 h-3" />
                  {overdueCount} {overdueCount === 1 ? "projeto com prazo vencido" : "projetos com prazo vencido"}
                </span>
              )}
            </div>
            <h1 className="text-2xl font-black text-[#1a1625] leading-tight tracking-tight">
              {greeting},{" "}
              <span style={{ background: "linear-gradient(135deg, #7B2FBE, #9333EA)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                {firstName}
              </span>
            </h1>
            <p className="text-[#6b6880] text-sm mt-1">
              Portfólio com{" "}
              <span className="text-[#1a1625] font-semibold">{stats.totalProjects} projetos</span>
              {" — "}{stats.inProgress} em execução, {stats.completed} concluídos
            </p>
          </div>
          <div className="hidden md:flex items-center gap-3 shrink-0">
            <Link href="/projects">
              <Button size="sm" variant="outline"
                className="h-9 text-[#7B2FBE] border-[rgba(123,47,190,0.25)] hover:bg-[rgba(123,47,190,0.05)] gap-2 font-semibold rounded-xl text-xs">
                <FolderKanban className="w-3.5 h-3.5" /> Ver Projetos
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Total de Projetos"
          value={stats.totalProjects}
          sub="No portfólio"
          icon={FolderKanban}
          gradient="linear-gradient(135deg, #1E40AF 0%, #2563EB 55%, #3B82F6 100%)"
          glow="#2563EB"
        />
        <KpiCard
          label="Projetos Ativos"
          value={stats.inProgress}
          sub="Em execução no portfólio"
          icon={Activity}
          gradient="linear-gradient(135deg, #065F46 0%, #059669 55%, #10B981 100%)"
          glow="#10B981"
        />
        <KpiCard
          label="Concluídos"
          value={stats.completed}
          sub="Entregues com sucesso"
          icon={CheckCircle2}
          gradient="linear-gradient(135deg, #7B2FBE 0%, #9333EA 55%, #A855F7 100%)"
          glow="#9333EA"
        />
        <KpiCard
          label="Taxa de Sucesso"
          value={`${stats.successRate}%`}
          sub="Concluídos / total"
          icon={Target}
          gradient="linear-gradient(135deg, #0F172A 0%, #1E293B 55%, #334155 100%)"
          glow="#334155"
        />
      </div>

      {/* ── Pipeline de Projetos ───────────────────────────────────────── */}
      <div
        className="rounded-2xl p-5"
        style={{ background: "#fff", border: "1px solid #F1F5F9", boxShadow: "0 1px 8px rgba(0,0,0,0.04)" }}
      >
        <SectionHeader
          title="Pipeline de Execução"
          sub="Distribuição de projetos por fase"
          href="/projects"
          linkLabel="Todos os projetos"
        />

        {/* Stage cards */}
        <div className="grid grid-cols-7 gap-1.5 mb-4">
          {PIPELINE.map((stage, idx) => {
            const count  = stageCount(stage)
            const isLast = idx === PIPELINE.length - 1
            const barPct = Math.round((count / maxPipelineCount) * 100)
            const subNote = stage.key === "IN_PROGRESS"
              ? (() => {
                  const pilot  = countByStatus["PILOT"]   ?? 0
                  const rampUp = countByStatus["RAMP_UP"] ?? 0
                  return pilot + rampUp > 0 ? `${pilot} piloto · ${rampUp} ramp-up` : null
                })()
              : null
            return (
              <div key={stage.key} className="flex items-center gap-0">
                <Link href={`/projects?filter=${stage.filterKey}`} className="flex-1 group">
                  <div
                    className="rounded-xl p-3 text-center transition-all hover:shadow-md hover:-translate-y-0.5"
                    style={{ border: `1px solid ${stage.color}20`, background: `${stage.color}08` }}
                  >
                    <div className="h-1 rounded-full bg-slate-100 overflow-hidden mb-2.5">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${barPct}%`, background: stage.color }}
                      />
                    </div>
                    <p
                      className="text-2xl font-black leading-none mb-1 transition-colors"
                      style={{ color: count > 0 ? stage.color : "#CBD5E1" }}
                    >
                      {count}
                    </p>
                    <p className="text-[10px] font-semibold text-slate-500 leading-tight">
                      {stage.label}
                    </p>
                    {subNote && (
                      <p className="text-[9px] text-slate-400 mt-0.5 leading-tight">{subNote}</p>
                    )}
                  </div>
                </Link>
                {!isLast && (
                  <ArrowRight className="w-3 h-3 text-slate-200 mx-0.5 shrink-0" />
                )}
              </div>
            )
          })}
        </div>

      </div>

      {/* ── Bottom Grid ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

        {/* Atenção Necessária */}
        {(() => {
          // Build unified alert list sorted by severity
          type AlertKind = "OVERDUE" | "ON_HOLD" | "CRITICAL_RISK" | "HIGH_RISK"
          type AlertItem = { id: string; title: string; kind: AlertKind; meta: string; sub: string; severity: number }

          const alerts: AlertItem[] = [
            ...overdueProjects.map((p) => {
              const d = Math.abs(daysFromNow(p.expectedEnd))
              return {
                id: p.id, title: p.title, kind: "OVERDUE" as AlertKind,
                meta: `${d}d atraso`,
                sub:  p.sponsorName ? `${STATUS_LABEL[p.status] ?? p.status} · ${p.sponsorName}` : (STATUS_LABEL[p.status] ?? p.status),
                severity: 1,
              }
            }),
            ...riskProjects
              .filter((p) => p.criticalCount > 0)
              .map((p) => ({
                id: p.id, title: p.title, kind: "CRITICAL_RISK" as AlertKind,
                meta: `${p.criticalCount} crítico${p.criticalCount > 1 ? "s" : ""}`,
                sub:  STATUS_LABEL[p.status] ?? p.status,
                severity: 1,
              })),
            ...riskProjects
              .filter((p) => p.criticalCount === 0 && p.highCount > 0)
              .map((p) => ({
                id: p.id, title: p.title, kind: "HIGH_RISK" as AlertKind,
                meta: `${p.highCount} risco${p.highCount > 1 ? "s" : ""} alto${p.highCount > 1 ? "s" : ""}`,
                sub:  STATUS_LABEL[p.status] ?? p.status,
                severity: 2,
              })),
            ...onHoldProjects.map((p) => ({
              id: p.id, title: p.title, kind: "ON_HOLD" as AlertKind,
              meta: "Em Espera",
              sub:  p.expectedEnd ? `Prazo: ${format(parseISO(p.expectedEnd), "dd/MM/yy")}` : "Sem prazo definido",
              severity: 3,
            })),
          ].sort((a, b) => a.severity - b.severity)

          const KIND_CFG: Record<AlertKind, { color: string; bg: string; border: string; icon: React.ElementType; label: string }> = {
            OVERDUE:       { color: "#EF4444", bg: "#FEF2F2", border: "#FECACA", icon: AlertTriangle, label: "Prazo vencido"   },
            CRITICAL_RISK: { color: "#DC2626", bg: "#FEF2F2", border: "#FECACA", icon: ShieldAlert,   label: "Risco crítico"  },
            HIGH_RISK:     { color: "#F97316", bg: "#FFF7ED", border: "#FED7AA", icon: ShieldAlert,   label: "Risco alto"     },
            ON_HOLD:       { color: "#7C3AED", bg: "#F5F3FF", border: "#DDD6FE", icon: PauseCircle,   label: "Em espera"      },
          }

          const totalAlerts = alerts.length

          return (
            <div
              className="rounded-2xl p-5"
              style={{ background: "#fff", border: "1px solid #F1F5F9", boxShadow: "0 1px 8px rgba(0,0,0,0.04)" }}
            >
              <SectionHeader
                title="Atenção Necessária"
                sub={totalAlerts > 0 ? `${totalAlerts} ponto${totalAlerts > 1 ? "s" : ""} requer${totalAlerts === 1 ? "" : "em"} atenção` : "Tudo sob controle"}
                href="/projects"
              />

              {totalAlerts === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                  <p className="text-sm font-semibold text-slate-500">Tudo em dia!</p>
                  <p className="text-xs text-slate-300">Nenhum projeto com prazo vencido,<br />em espera ou com risco crítico</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {alerts.map((a) => {
                    const cfg  = KIND_CFG[a.kind]
                    const Icon = cfg.icon
                    return (
                      <Link key={`${a.kind}-${a.id}`} href={`/projects/${a.id}`}>
                        <div
                          className="flex items-center gap-3 p-3 rounded-xl transition-all hover:shadow-sm group cursor-pointer"
                          style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
                        >
                          {/* Icon */}
                          <div
                            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: `${cfg.color}15` }}
                          >
                            <Icon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-[#0F172A] truncate group-hover:text-[#7B2FBE] transition-colors">
                              {a.title}
                            </p>
                            <p className="text-[10px] text-slate-400 mt-0.5 truncate">{a.sub}</p>
                          </div>

                          {/* Badge */}
                          <span
                            className="text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap"
                            style={{ background: `${cfg.color}15`, color: cfg.color }}
                          >
                            {a.meta}
                          </span>
                        </div>
                      </Link>
                    )
                  })}

                  {/* Legend */}
                  {alerts.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-50 mt-1">
                      {(["OVERDUE","CRITICAL_RISK","HIGH_RISK","ON_HOLD"] as AlertKind[])
                        .filter((k) => alerts.some((a) => a.kind === k))
                        .map((k) => {
                          const cfg = KIND_CFG[k]
                          const count = alerts.filter((a) => a.kind === k).length
                          return (
                            <span key={k} className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: cfg.color }}>
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: cfg.color }} />
                              {cfg.label} ({count})
                            </span>
                          )
                        })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })()}

        {/* Próximas Entregas */}
        <div
          className="rounded-2xl p-5"
          style={{ background: "#fff", border: "1px solid #F1F5F9", boxShadow: "0 1px 8px rgba(0,0,0,0.04)" }}
        >
          <SectionHeader
            title="Próximas Entregas"
            sub="Projetos que vencem nos próximos 60 dias"
            href="/projects"
          />

          {upcomingProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <CalendarClock className="w-8 h-8 text-slate-200" />
              <p className="text-sm font-semibold text-slate-400">Nenhuma entrega prevista</p>
              <p className="text-xs text-slate-300">nos próximos 60 dias</p>
            </div>
          ) : (
            <div className="space-y-2">
              {upcomingProjects.map((p) => {
                const days  = daysFromNow(p.expectedEnd)
                const color = urgencyColor(days)
                const stageColor = STATUS_COLOR[p.status] ?? "#94A3B8"
                return (
                  <Link key={p.id} href={`/projects/${p.id}`}>
                    <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-violet-100 hover:shadow-sm transition-all group">
                      <div className="w-1.5 h-10 rounded-full shrink-0" style={{ background: stageColor }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-[#0F172A] truncate group-hover:text-[#7B2FBE] transition-colors">
                          {p.title}
                        </p>
                        <span
                          className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                          style={{ background: `${stageColor}15`, color: stageColor }}>
                          {STATUS_LABEL[p.status] ?? p.status}
                        </span>
                      </div>
                      <div className="shrink-0 text-right">
                        <span
                          className="text-[10px] font-black px-2 py-0.5 rounded-full"
                          style={{ background: `${color}12`, color }}>
                          {days}d
                        </span>
                        {p.expectedEnd && (
                          <p className="text-[9px] text-slate-400 mt-0.5">
                            {format(parseISO(p.expectedEnd), "dd/MM/yy")}
                          </p>
                        )}
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Radar de Tarefas */}
        <div
          className="rounded-2xl p-5"
          style={{ background: "#fff", border: "1px solid #F1F5F9", boxShadow: "0 1px 8px rgba(0,0,0,0.04)" }}
        >
          <SectionHeader
            title="Radar de Tarefas"
            sub="Vencidas e próximas do cronograma"
          />

          {/* Overdue tasks */}
          {overdueTasks.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-red-400" />
                <span className="text-[10px] font-black uppercase tracking-widest text-red-400">
                  Atrasadas ({overdueTasks.length})
                </span>
              </div>
              <div className="space-y-1.5">
                {overdueTasks.map((t) => {
                  const days = daysFromNow(t.endDate)
                  return (
                    <div key={t.id}
                      className="flex items-start gap-2.5 p-2.5 rounded-xl bg-red-50 border border-red-100">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[#0F172A] truncate">{t.title}</p>
                        <p className="text-[10px] text-slate-400 truncate">{t.project?.title}</p>
                        {t.responsible && (
                          <div className="flex items-center gap-1 mt-1">
                            <div className="w-3.5 h-3.5 rounded-full bg-red-200 flex items-center justify-center text-[7px] font-black text-red-700">
                              {initials(t.responsible.name)}
                            </div>
                            <span className="text-[9px] text-slate-400">{t.responsible.name.split(" ")[0]}</span>
                          </div>
                        )}
                      </div>
                      <span className="text-[9px] font-black text-red-500 shrink-0">
                        {Math.abs(days)}d
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Upcoming tasks */}
          {upcomingTasks.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-violet-400" />
                <span className="text-[10px] font-black uppercase tracking-widest text-violet-400">
                  Próximos 14 dias ({upcomingTasks.length})
                </span>
              </div>
              <div className="space-y-1.5">
                {upcomingTasks.map((t) => {
                  const days  = daysFromNow(t.endDate)
                  const color = urgencyColor(days)
                  return (
                    <div key={t.id}
                      className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-100 hover:border-violet-100 transition-all">
                      <Clock className="w-3.5 h-3.5 text-violet-400 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[#0F172A] truncate">{t.title}</p>
                        <p className="text-[10px] text-slate-400 truncate">{t.project?.title}</p>
                        {t.wbsArea && (
                          <span
                            className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full mt-1 inline-block"
                            style={{ background: `${t.wbsArea.color ?? "#7B2FBE"}15`, color: t.wbsArea.color ?? "#7B2FBE" }}>
                            {t.wbsArea.name}
                          </span>
                        )}
                      </div>
                      <span
                        className="text-[9px] font-black shrink-0 px-1.5 py-0.5 rounded-full"
                        style={{ background: `${color}12`, color }}>
                        {days}d
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {overdueTasks.length === 0 && upcomingTasks.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-300">
              <CheckCircle2 className="w-8 h-8 text-emerald-300" />
              <p className="text-sm font-semibold text-slate-400">Cronograma em dia</p>
              <p className="text-xs text-slate-300">Nenhuma tarefa vencida ou próxima</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
