import { db } from "@/lib/db"
import { auth } from "@/auth"
import { notFound } from "next/navigation"
import { Header } from "@/components/layout/header"
import { StatusBadge } from "@/components/kronex/status-badge"
import { StatusActions } from "./status-actions"
import { ReportStatusWidget } from "./report-status-widget"
import { ProjectEditModal } from "./project-edit-modal"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  ArrowLeft, Users, Calendar, AlertTriangle, CheckCircle2,
  Clock, BarChart3, Layers, TrendingUp, Play, Timer, CalendarDays, RefreshCw,
  Rocket, FileDown, BookOpen, Shield,
} from "lucide-react"
import { DeleteProjectButton } from "./delete-project-button"
import { SuggestedDatesPanel } from "./suggested-dates-panel"
import Link from "next/link"
import { format, differenceInDays } from "date-fns"
import { ptBR } from "date-fns/locale"

const RISK_COLORS: Record<string, string> = {
  LOW:      "text-green-600 bg-green-50 border-green-200",
  MEDIUM:   "text-amber-600 bg-amber-50 border-amber-200",
  HIGH:     "text-orange-600 bg-orange-50 border-orange-200",
  CRITICAL: "text-red-600 bg-red-50 border-red-200",
}
const RISK_LABELS: Record<string, string> = {
  LOW: "Baixo", MEDIUM: "Médio", HIGH: "Alto", CRITICAL: "Crítico"
}
const TASK_STATUS_LABELS: Record<string, string> = {
  PLANNING: "Planejamento", IN_PROGRESS: "Em Andamento", COMPLETED: "Concluída",
  VALIDATION: "Validação", ON_HOLD: "Pausada", INITIATIVE: "Iniciativa",
}
const TASK_STATUS_COLORS: Record<string, string> = {
  PLANNING:   "bg-slate-100 text-slate-600",
  IN_PROGRESS:"bg-blue-100 text-blue-700",
  COMPLETED:  "bg-green-100 text-green-700",
  VALIDATION: "bg-purple-100 text-purple-700",
  ON_HOLD:    "bg-orange-100 text-orange-700",
}

function formatDate(d: Date | null) {
  if (!d) return "—"
  return format(d, "dd/MM/yyyy", { locale: ptBR })
}

function avg(arr: number[]) {
  return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()

  const [project, allUsers] = await Promise.all([
   db.project.findUnique({
    where: { id },
    include: {
      members: { include: { user: { select: { id: true, name: true, email: true, role: true, department: true } } } },
      wbsAreas: {
        orderBy: { order: "asc" },
        include: {
          tasks: {
            orderBy: { order: "asc" },
            include: { responsible: { select: { name: true } } },
          },
        },
      },
      tasks: {
        orderBy: { order: "asc" },
        include: {
          wbsArea: { select: { name: true, color: true } },
          responsible: { select: { name: true } },
        },
      },
      risks: true,
      _count: { select: { tasks: true, risks: true, meetings: true } },
    },
   }),
   db.user.findMany({
     where: { active: true },
     select: { id: true, name: true, department: true, role: true },
     orderBy: { name: "asc" },
   }),
  ])

  if (!project) notFound()

  const userRole   = session?.user?.role ?? ""
  const tasksDone  = project.tasks.filter((t) => t.status === "COMPLETED").length
  const tasksTotal = project.tasks.length
  const progress   = tasksTotal > 0 ? avg(project.tasks.map((t) => t.progress)) : (project.status === "COMPLETED" ? 100 : 0)
  const highRisks  = project.risks.filter((r) => ["HIGH", "CRITICAL"].includes(r.status)).length
  const daysLeft   = project.expectedEnd
    ? differenceInDays(project.expectedEnd, new Date())
    : null

  const STATUS_FLOW = [
    { key: "PLANNING",    label: "Planejamento" },
    { key: "IN_PROGRESS", label: "Em Andamento" },
    { key: "PILOT",       label: "Em Validação" },
    { key: "GO_LIVE",     label: "Go Live" },
    { key: "POST_GOLIVE", label: "Pós Go Live" },
    { key: "COMPLETED",   label: "Concluído" },
  ]
  // RAMP_UP sits between validation and go-live — show it at the "Em Validação" step
  const statusForFlow = project.status === "RAMP_UP" ? "PILOT" : project.status
  const flowIdx = STATUS_FLOW.findIndex((s) => s.key === statusForFlow)

  return (
    <div className="flex flex-col h-full">
      <Header />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto space-y-5">

          <Link
            href="/projects"
            className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-[#0F172A] transition-colors font-medium group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            Voltar para Projetos
          </Link>

          {/* Header card */}
          <div
            className="bg-white rounded-2xl overflow-hidden"
            style={{ border: "1px solid #E2E8F0", boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 8px 32px rgba(15,23,42,0.06)" }}
          >
            {/* Gradient top bar — violet for FUTURE_ANALYSIS */}
            <div
              className="h-1.5 w-full"
              style={{
                background: project.status === "FUTURE_ANALYSIS"
                  ? "linear-gradient(90deg, #4C1D95, #7C3AED, #A78BFA)"
                  : "linear-gradient(90deg, #00C4E0 0%, #2463FF 50%, #8B2FFF 100%)",
              }}
            />

            <div className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-3">
                    <StatusBadge status={project.status} size="md" />
                  </div>
                  <h1 className="text-2xl font-black text-[#0F172A] leading-tight tracking-tight">{project.title}</h1>
                  {project.description && (
                    <p className="text-sm text-slate-400 mt-2 max-w-2xl leading-relaxed">{project.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {/* Edit button — always visible */}
                  <ProjectEditModal
                    project={{
                      id,
                      title:         project.title,
                      description:   project.description,
                      scope:         project.scope,
                      assumptions:   project.assumptions,
                      restrictions:  project.restrictions,
                      origin:        project.origin,
                      budget:        project.budget,
                      economy:       project.economy,
                      expectedStart: project.expectedStart,
                      expectedEnd:   project.expectedEnd,
                      actualStart:   project.actualStart,
                      actualEnd:     project.actualEnd,
                      goLiveDate:    project.goLiveDate,
                    }}
                    members={project.members.map(m => ({
                      userId: m.userId,
                      role:   m.role,
                      user:   m.user,
                    }))}
                    allUsers={allUsers}
                    risks={project.risks.map(r => ({
                      id:          r.id,
                      description: r.description,
                      level:       r.status,
                      mitigation:  r.mitigation,
                    }))}
                  />

                  {/* PLANNING */}
                  {project.status === "PLANNING" && (
                    <>
                      <Link
                        href={`/projects/${id}/go-no-go`}
                        className="inline-flex items-center gap-2 px-4 h-9 text-sm font-semibold rounded-xl text-white transition-all hover:opacity-90 active:scale-[0.98]"
                        style={{ background: "linear-gradient(135deg, #7B2FBE, #2463FF)", boxShadow: "0 4px 20px rgba(123,47,190,0.35)" }}
                      >
                        <Play className="w-3.5 h-3.5" />
                        Go/No-Go
                      </Link>
                      <Link
                        href={`/projects/${id}/presentation`}
                        className="inline-flex items-center gap-2 px-4 h-9 text-sm font-semibold rounded-xl text-white transition-all hover:opacity-90 active:scale-[0.98]"
                        style={{ background: "linear-gradient(135deg, #0891B2, #06B6D4)", boxShadow: "0 4px 20px rgba(8,145,178,0.30)" }}
                      >
                        <Layers className="w-3.5 h-3.5" />
                        Ap. Técnica
                      </Link>
                      <Link
                        href={`/projects/${id}/kickoff`}
                        className="inline-flex items-center gap-2 px-4 h-9 text-sm font-semibold rounded-xl text-white transition-all hover:opacity-90 active:scale-[0.98]"
                        style={{ background: "linear-gradient(135deg, #10B981, #059669)", boxShadow: "0 4px 20px rgba(16,185,129,0.30)" }}
                      >
                        <Timer className="w-3.5 h-3.5" />
                        Kick-Off
                      </Link>
                      <StatusActions projectId={id} currentStatus={project.status} userRole={userRole} />
                    </>
                  )}

                  {/* Active: Checkpoint + Cronograma + GO LIVE only */}
                  {["IN_PROGRESS", "PILOT", "RAMP_UP"].includes(project.status) && (
                    <>
                      <Link
                        href={`/projects/${id}/checkpoint`}
                        className="inline-flex items-center gap-2 px-4 h-9 text-sm font-semibold rounded-xl transition-all hover:opacity-90 active:scale-[0.98]"
                        style={{ background: "linear-gradient(135deg, #2463FF, #8B2FFF)", boxShadow: "0 4px 20px rgba(36,99,255,0.30)", color: "white" }}
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Checkpoint
                      </Link>
                      <Link
                        href={`/projects/${id}/schedule`}
                        className="inline-flex items-center gap-2 px-4 h-9 text-sm font-semibold rounded-xl transition-all hover:opacity-90 active:scale-[0.98]"
                        style={{ background: "linear-gradient(135deg, #0F172A, #1E293B)", boxShadow: "0 4px 20px rgba(15,23,42,0.25)", color: "white" }}
                      >
                        <CalendarDays className="w-3.5 h-3.5" />
                        Cronograma
                      </Link>
                      <Link
                        href={`/projects/${id}/golive`}
                        className="inline-flex items-center gap-2 px-4 h-9 text-sm font-semibold rounded-xl transition-all hover:opacity-90 active:scale-[0.98]"
                        style={{ background: "linear-gradient(135deg, #059669, #10B981)", boxShadow: "0 4px 20px rgba(16,185,129,0.35)", color: "white" }}
                      >
                        <Rocket className="w-3.5 h-3.5" />
                        GO LIVE
                      </Link>
                      {/* Kick-Off edit — secondary, always accessible */}
                      <Link
                        href={`/projects/${id}/kickoff`}
                        className="inline-flex items-center gap-2 px-3 h-9 text-sm font-semibold rounded-xl border transition-all hover:bg-emerald-50 active:scale-[0.98]"
                        style={{ borderColor: "#A7F3D0", color: "#059669", background: "transparent" }}
                        title="Editar Kick-Off"
                      >
                        <Timer className="w-3.5 h-3.5" />
                        Kick-Off
                      </Link>
                    </>
                  )}

                  {/* Post go-live */}
                  {["GO_LIVE", "POST_GOLIVE", "COMPLETED"].includes(project.status) && (
                    <>
                      <Link
                        href={`/projects/${id}/lessons-learned`}
                        className="inline-flex items-center gap-2 px-4 h-9 text-sm font-semibold rounded-xl transition-all hover:opacity-90 active:scale-[0.98]"
                        style={{ background: "linear-gradient(135deg, #D97706, #F59E0B)", boxShadow: "0 4px 20px rgba(245,158,11,0.30)", color: "white" }}
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        Lições Aprendidas
                      </Link>
                      <a
                        href={`/closure/${id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 h-9 text-sm font-semibold rounded-xl transition-all hover:opacity-90 active:scale-[0.98]"
                        style={{ background: "linear-gradient(135deg, #7C3AED, #A855F7)", boxShadow: "0 4px 20px rgba(124,58,237,0.35)", color: "white" }}
                      >
                        <FileDown className="w-3.5 h-3.5" />
                        Encerramento
                      </a>
                      {/* Kick-Off edit — secondary, always accessible */}
                      <Link
                        href={`/projects/${id}/kickoff`}
                        className="inline-flex items-center gap-2 px-3 h-9 text-sm font-semibold rounded-xl border transition-all hover:bg-emerald-50 active:scale-[0.98]"
                        style={{ borderColor: "#A7F3D0", color: "#059669", background: "transparent" }}
                        title="Editar Kick-Off"
                      >
                        <Timer className="w-3.5 h-3.5" />
                        Kick-Off
                      </Link>
                      <StatusActions projectId={id} currentStatus={project.status} userRole={userRole} />
                    </>
                  )}
                </div>
              </div>

              {/* Status flow */}
              {!["CANCELLED", "ON_HOLD", "FUTURE_ANALYSIS"].includes(project.status) && (
                <div className="mt-6 flex items-center" style={{ gap: "0" }}>
                  {STATUS_FLOW.map((s, idx) => {
                    const done   = idx < flowIdx
                    const active = idx === flowIdx
                    const isLast = idx === STATUS_FLOW.length - 1
                    return (
                      <div key={s.key} className="flex items-center flex-1">
                        <div className="flex flex-col items-center gap-1.5">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black transition-all ${
                              active ? "text-white ring-4 ring-blue-100" : done ? "text-white" : "text-slate-400"
                            }`}
                            style={
                              active
                                ? { background: "linear-gradient(135deg, #2463FF, #8B2FFF)", boxShadow: "0 4px 12px rgba(36,99,255,0.4)" }
                                : done
                                  ? { background: "linear-gradient(135deg, #2463FF, #8B2FFF)" }
                                  : { background: "#F1F5F9" }
                            }
                          >
                            {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : idx + 1}
                          </div>
                          <span className={`text-[9px] font-bold whitespace-nowrap tracking-wide uppercase ${
                            active ? "text-[#2463FF]" : done ? "text-slate-600" : "text-slate-300"
                          }`}>
                            {s.label}
                          </span>
                        </div>
                        {!isLast && (
                          <div
                            className="flex-1 h-0.5 mx-1 mb-5 rounded-full"
                            style={idx < flowIdx
                              ? { background: "linear-gradient(90deg, #2463FF, #8B2FFF)" }
                              : { background: "#E2E8F0" }
                            }
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Overall progress */}
              {tasksTotal > 0 && (
                <div className="mt-5 p-4 rounded-xl" style={{ background: "#F8FAFC", border: "1px solid #F1F5F9" }}>
                  <div className="flex justify-between text-xs mb-2">
                    <span className="text-slate-400 font-medium">{tasksDone} de {tasksTotal} tarefas concluídas</span>
                    <span className="font-black text-[#0F172A]">{progress}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className="h-full rounded-full progress-shine transition-all duration-700"
                      style={{
                        width: `${progress}%`,
                        background: "linear-gradient(90deg, #00C4E0, #2463FF, #8B2FFF)",
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Análise Futura banner */}
          {project.status === "FUTURE_ANALYSIS" && (
            <div
              className="rounded-2xl p-5 flex items-start gap-4"
              style={{
                background: "linear-gradient(135deg, #F5F3FF, #EDE9FE)",
                border: "1px solid rgba(124,58,237,0.20)",
                boxShadow: "0 2px 16px rgba(124,58,237,0.08)",
              }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.25)" }}
              >
                <Clock className="w-5 h-5 text-violet-600" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-violet-800 text-sm">Projeto marcado para Análise Futura</p>
                <p className="text-xs text-violet-600 mt-1 leading-relaxed">
                  Este projeto foi revisado na reunião Go/No-Go e ficou reservado para execução quando o momento for ideal.
                  Ele permanece visível no portfólio e pode ser retomado a qualquer momento.
                </p>
              </div>
            </div>
          )}

          {/* Quick stats */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              {
                label: "Equipe",
                value: `${project.members.length} membros`,
                icon: Users,
                gradient: "linear-gradient(135deg, #1E40AF, #3B82F6)",
                glow: "rgba(59,130,246,0.25)",
              },
              {
                label: "Progresso",
                value: `${progress}%`,
                icon: BarChart3,
                gradient: "linear-gradient(135deg, #5B21B6, #8B5CF6)",
                glow: "rgba(139,92,246,0.25)",
              },
              {
                label: highRisks > 0 ? "Riscos Altos" : "Riscos",
                value: `${highRisks} risco${highRisks !== 1 ? "s" : ""}`,
                icon: AlertTriangle,
                gradient: highRisks > 0
                  ? "linear-gradient(135deg, #991B1B, #EF4444)"
                  : "linear-gradient(135deg, #065F46, #10B981)",
                glow: highRisks > 0 ? "rgba(239,68,68,0.25)" : "rgba(16,185,129,0.25)",
              },
              {
                label: daysLeft !== null && daysLeft < 0 ? "Atrasado" : "Prazo",
                value: daysLeft === null ? "—" : daysLeft < 0 ? `${Math.abs(daysLeft)}d` : `${daysLeft}d`,
                icon: Calendar,
                gradient: daysLeft !== null && daysLeft < 0
                  ? "linear-gradient(135deg, #991B1B, #EF4444)"
                  : "linear-gradient(135deg, #92400E, #F59E0B)",
                glow: daysLeft !== null && daysLeft < 0 ? "rgba(239,68,68,0.25)" : "rgba(245,158,11,0.25)",
              },
            ].map(({ label, value, icon: Icon, gradient, glow }) => (
              <div
                key={label}
                className="relative overflow-hidden rounded-2xl p-5"
                style={{ background: gradient, boxShadow: `0 4px 20px ${glow}` }}
              >
                <div className="absolute -top-3 -right-3 w-16 h-16 rounded-full opacity-20"
                  style={{ background: "radial-gradient(circle, white 0%, transparent 70%)" }} />
                <div className="flex items-start justify-between mb-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/60">{label}</p>
                  <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center">
                    <Icon className="w-3.5 h-3.5 text-white" />
                  </div>
                </div>
                <p className="text-2xl font-black text-white leading-none">{value}</p>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <Tabs defaultValue="overview">
            <TabsList
              variant="line"
              className="w-full rounded-none pb-0 h-auto px-0 rounded-t-2xl"
              style={{ background: "#ffffff", borderBottom: "1px solid #F1F5F9" }}
            >
              {[
                { value: "overview",  label: "Visão Geral" },
                { value: "schedule",  label: `Cronograma (${tasksTotal})` },
                { value: "risks",     label: `Riscos (${project.risks.length})` },
                { value: "team",      label: `Equipe (${project.members.length})` },
              ].map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="px-5 py-3.5 text-sm rounded-none border-b-2 border-transparent font-semibold text-slate-400
                    data-active:border-[#2463FF] data-active:text-[#2463FF] data-active:bg-transparent transition-all"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* Overview */}
            <TabsContent value="overview" className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div
                  className="bg-white rounded-2xl p-5 space-y-3"
                  style={{ border: "1px solid #E2E8F0", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
                >
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Datas</p>
                  {[
                    { label: "Início Planejado",  value: formatDate(project.expectedStart) },
                    { label: "Fim Planejado",     value: formatDate(project.expectedEnd) },
                    { label: "Início Real",       value: formatDate(project.actualStart) },
                    { label: "GO LIVE Previsto",  value: formatDate(project.goLiveDate) },
                    { label: "Fim Real",          value: formatDate(project.actualEnd) },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                      <span className="text-xs text-slate-400 font-medium">{label}</span>
                      <span className="text-xs font-bold text-[#0F172A]">{value}</span>
                    </div>
                  ))}
                </div>

                <div
                  className="bg-white rounded-2xl p-5 space-y-3"
                  style={{ border: "1px solid #E2E8F0", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
                >
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Financeiro (Iniciativa)</p>
                  {[
                    {
                      label: "Budget",
                      value: project.budget
                        ? project.budget.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                        : "—"
                    },
                    {
                      label: "Economia Esperada",
                      value: project.economy
                        ? project.economy.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                        : "—"
                    },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                      <span className="text-xs text-slate-400 font-medium">{label}</span>
                      <span className="text-xs font-bold text-[#0F172A]">{value}</span>
                    </div>
                  ))}

                  {/* Progress ring visual */}
                  {tasksTotal > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-50 flex items-center gap-4">
                      <div className="relative w-16 h-16 shrink-0">
                        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                          <circle cx="32" cy="32" r="26" fill="none" stroke="#F1F5F9" strokeWidth="8" />
                          <circle
                            cx="32" cy="32" r="26" fill="none"
                            stroke="url(#progressGrad)" strokeWidth="8"
                            strokeLinecap="round"
                            strokeDasharray={`${(progress / 100) * 163.4} 163.4`}
                          />
                          <defs>
                            <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                              <stop offset="0%" stopColor="#00C4E0" />
                              <stop offset="100%" stopColor="#8B2FFF" />
                            </linearGradient>
                          </defs>
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center text-xs font-black text-[#0F172A]">
                          {progress}%
                        </span>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[#0F172A]">{tasksDone} concluídas</p>
                        <p className="text-xs text-slate-400">de {tasksTotal} tarefas</p>
                        <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                          <TrendingUp className="w-3 h-3" />
                          {tasksTotal > 0 ? Math.round((tasksDone / tasksTotal) * 100) : 0}% completo
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Análise de prazo — visível em planejamento ou se já tiver sugestão */}
              {(project.status === "PLANNING" || project.suggestedStart || project.suggestedEnd) && (
                <SuggestedDatesPanel
                  projectId={id}
                  requestedStart={project.expectedStart}
                  requestedEnd={project.expectedEnd}
                  suggestedStart={project.suggestedStart}
                  suggestedEnd={project.suggestedEnd}
                />
              )}

              {/* WBS summary */}
              {project.wbsAreas.length > 0 && (
                <div
                  className="bg-white rounded-2xl p-5"
                  style={{ border: "1px solid #E2E8F0", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
                >
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">Áreas WBS</p>
                  <div className="space-y-3">
                    {project.wbsAreas.map((area) => {
                      const areaTasks    = area.tasks.length
                      const areaDone     = area.tasks.filter((t) => t.status === "COMPLETED").length
                      const areaProgress = areaTasks > 0 ? Math.round((areaDone / areaTasks) * 100) : 0
                      return (
                        <div key={area.id} className="flex items-center gap-3">
                          <div className="w-3 h-3 rounded-full shrink-0" style={{ background: area.color ?? "#6B7280" }} />
                          <span className="text-sm font-semibold text-[#0F172A] w-36 truncate">{area.name}</span>
                          <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${areaProgress}%`, background: area.color ?? "#6B7280" }}
                            />
                          </div>
                          <span className="text-[10px] text-slate-400 w-20 text-right font-medium">
                            {areaDone}/{areaTasks} tarefas
                          </span>
                          <span className="text-[10px] font-bold text-[#0F172A] w-10 text-right">
                            {areaProgress}%
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Status para o Report */}
              <ReportStatusWidget
                projectId={id}
                initial={{
                  cost:      (project.reportStatusCost      ?? "GREEN") as "GREEN" | "YELLOW" | "RED",
                  schedule:  (project.reportStatusSchedule  ?? "GREEN") as "GREEN" | "YELLOW" | "RED",
                  resources: (project.reportStatusResources ?? "GREEN") as "GREEN" | "YELLOW" | "RED",
                  overall:   (project.reportStatusOverall   ?? "GREEN") as "GREEN" | "YELLOW" | "RED",
                  notes:     project.reportStatusNotes ?? null,
                }}
              />
            </TabsContent>

            {/* Schedule */}
            <TabsContent value="schedule" className="mt-4">
              {tasksTotal === 0 ? (
                <div
                  className="bg-white rounded-2xl p-12 text-center"
                  style={{ border: "1px solid #E2E8F0" }}
                >
                  <Layers className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm text-slate-400 font-medium">Nenhuma tarefa cadastrada</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {project.wbsAreas.length > 0 ? (
                    project.wbsAreas.map((area) => (
                      <div
                        key={area.id}
                        className="bg-white rounded-2xl overflow-hidden"
                        style={{ border: "1px solid #E2E8F0", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
                      >
                        <div
                          className="flex items-center gap-3 px-5 py-3.5"
                          style={{ borderBottom: "1px solid #F1F5F9", background: "#FAFBFC" }}
                        >
                          <div className="w-3 h-3 rounded-full" style={{ background: area.color ?? "#6B7280" }} />
                          <span className="text-sm font-bold text-[#0F172A]">{area.name}</span>
                          <span className="ml-auto text-xs text-slate-400 font-medium">{area.tasks.length} tarefas</span>
                        </div>
                        <div className="divide-y divide-slate-50">
                          {area.tasks.map((task) => (
                            <div key={task.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50/50 transition-colors">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-[#0F172A] truncate">{task.title}</p>
                                {task.responsible && (
                                  <p className="text-xs text-slate-400 mt-0.5">{task.responsible.name}</p>
                                )}
                              </div>
                              {task.endDate && (
                                <span className="text-xs text-slate-400 font-medium shrink-0">
                                  {format(task.endDate, "dd/MM", { locale: ptBR })}
                                </span>
                              )}
                              <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full shrink-0 ${TASK_STATUS_COLORS[task.status]}`}>
                                {TASK_STATUS_LABELS[task.status]}
                              </span>
                              <div className="w-20 shrink-0">
                                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                  <div
                                    className="h-full rounded-full"
                                    style={{
                                      width: `${task.progress}%`,
                                      background: task.progress === 100
                                        ? "linear-gradient(90deg, #059669, #10B981)"
                                        : "linear-gradient(90deg, #2463FF, #8B2FFF)",
                                    }}
                                  />
                                </div>
                                <p className="text-[10px] text-right text-slate-400 mt-0.5 font-medium">{task.progress}%</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    project.tasks.map((task) => (
                      <div
                        key={task.id}
                        className="bg-white rounded-xl p-4 flex items-center gap-4"
                        style={{ border: "1px solid #E2E8F0" }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[#0F172A]">{task.title}</p>
                          {task.responsible && <p className="text-xs text-slate-400 mt-0.5">{task.responsible.name}</p>}
                        </div>
                        <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full ${TASK_STATUS_COLORS[task.status]}`}>
                          {TASK_STATUS_LABELS[task.status]}
                        </span>
                        <span className="text-xs font-bold text-[#0F172A] w-10 text-right">{task.progress}%</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </TabsContent>

            {/* Risks */}
            <TabsContent value="risks" className="mt-4 space-y-3">
              {project.risks.length === 0 ? (
                <div
                  className="bg-white rounded-2xl p-12 text-center"
                  style={{ border: "1px solid #E2E8F0" }}
                >
                  <AlertTriangle className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm text-slate-400 font-medium">Nenhum risco cadastrado</p>
                </div>
              ) : project.risks.map((risk) => (
                <div
                  key={risk.id}
                  className="bg-white rounded-2xl p-5 border-l-4 transition-all hover:shadow-sm"
                  style={{
                    border: "1px solid #E2E8F0",
                    borderLeftWidth: "4px",
                    borderLeftColor: risk.status === "CRITICAL"
                      ? "#EF4444"
                      : risk.status === "HIGH"
                        ? "#F97316"
                        : risk.status === "MEDIUM"
                          ? "#F59E0B"
                          : "#10B981",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-sm font-bold text-[#0F172A] flex-1">{risk.description}</p>
                    <div className="flex gap-2 shrink-0">
                      <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full border ${RISK_COLORS[risk.probability] ?? ""}`}>
                        P: {RISK_LABELS[risk.probability] ?? risk.probability}
                      </span>
                      <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full border ${RISK_COLORS[risk.impact] ?? ""}`}>
                        I: {RISK_LABELS[risk.impact] ?? risk.impact}
                      </span>
                    </div>
                  </div>
                  {risk.mitigation && (
                    <p className="text-xs text-slate-400 mt-3 leading-relaxed">
                      <span className="font-bold text-slate-600">Mitigação:</span> {risk.mitigation}
                    </p>
                  )}
                  {risk.owner && (
                    <p className="text-xs text-slate-400 mt-1">
                      <span className="font-bold text-slate-600">Responsável:</span> {risk.owner}
                    </p>
                  )}
                </div>
              ))}
            </TabsContent>

            {/* Team */}
            <TabsContent value="team" className="mt-4">
              <div
                className="bg-white rounded-2xl overflow-hidden"
                style={{ border: "1px solid #E2E8F0", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
              >
                <div
                  className="px-5 py-3.5"
                  style={{ borderBottom: "1px solid #F1F5F9", background: "#FAFBFC" }}
                >
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    {project.members.length} integrante{project.members.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="divide-y divide-slate-50">
                  {project.members.map((m) => (
                    <div key={m.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50/50 transition-colors">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black text-white shrink-0"
                        style={{ background: "linear-gradient(135deg, #2463FF, #8B2FFF)" }}
                      >
                        {m.user.name?.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-[#0F172A] truncate">{m.user.name}</p>
                        <p className="text-xs text-slate-400 truncate">{m.user.email}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold text-[#0F172A]">{m.role}</p>
                        {m.user.department && <p className="text-[10px] text-slate-400 mt-0.5">{m.user.department}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* Danger zone */}
          <div
            className="rounded-2xl p-5 flex items-center justify-between gap-4"
            style={{ border: "1px solid #FECACA", background: "#FFF5F5" }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "#FEE2E2", border: "1px solid #FECACA" }}
              >
                <Shield className="w-4 h-4 text-red-400" />
              </div>
              <div>
                <p className="text-xs font-bold text-red-700">Zona de Perigo</p>
                <p className="text-[11px] text-red-400 mt-0.5">A exclusão remove permanentemente todos os dados do projeto</p>
              </div>
            </div>
            <DeleteProjectButton projectId={id} projectTitle={project.title} />
          </div>

        </div>
      </div>
    </div>
  )
}
