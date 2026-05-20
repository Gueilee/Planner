"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  ArrowLeft, CheckCircle2, Calendar, Users, FileText,
  AlertTriangle, BookOpen, MessageSquare, ChevronDown,
  ChevronRight, ExternalLink, Loader2, Plus, X,
  TrendingUp, TrendingDown, Minus, Shield, BarChart3,
  Layers, Clock, Star,
} from "lucide-react"
import { registerClosureMeeting } from "@/lib/actions/encerramento"
import { createLesson } from "@/lib/actions/lessons"

// ─── Types ────────────────────────────────────────────────────────────────────

type ProjectInfo = {
  id:            string
  title:         string
  description:   string | null
  status:        string
  actualStart:   string | null
  actualEnd:     string | null
  expectedStart: string | null
  expectedEnd:   string | null
  goLiveDate:    string | null
  goLiveActual:  string | null
  budget:        number | null
  economy:       number | null
  scope:         string | null
  sponsor:       string | null
  sponsorDept:   string | null
  tasksDone:     number
  tasksTotal:    number
}

type Member   = { id: string; name: string; department: string | null; role: string }
type WbsArea  = { id: string; name: string; color: string | null; tasks: Task[] }
type Task     = { id: string; title: string; status: string; progress: number; responsible: string | null; startDate: string | null; endDate: string | null }
type Risk     = { id: string; description: string; probability: string; impact: string; status: string; mitigation: string | null; owner: string | null }
type MeetingRef = { id: string; type: string; title: string; date: string; participants: number }
type LessonRef  = { id: string; phase: string; area: string; occurrence: string; influence: string; impact: string; lesson: string; identifiedAt: string; createdBy: string }

type Props = {
  project:  ProjectInfo
  members:  Member[]
  wbsAreas: WbsArea[]
  risks:    Risk[]
  meetings: MeetingRef[]
  lessons:  LessonRef[]
}

// ─── Config ───────────────────────────────────────────────────────────────────

const TASK_STATUS_CFG: Record<string, { label: string; pill: string; icon?: React.ReactNode }> = {
  PLANNING:    { label: "Planejamento",  pill: "bg-slate-100 text-slate-600 border-slate-200" },
  IN_PROGRESS: { label: "Em Andamento",  pill: "bg-blue-50 text-blue-700 border-blue-200" },
  COMPLETED:   { label: "Concluído",     pill: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  VALIDATION:  { label: "Validação",     pill: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  DELAYED:     { label: "Atrasado",      pill: "bg-red-50 text-red-700 border-red-200" },
  ON_HOLD:     { label: "Pausado",       pill: "bg-orange-50 text-orange-700 border-orange-200" },
  INITIATIVE:  { label: "Iniciativa",    pill: "bg-violet-50 text-violet-700 border-violet-200" },
}

const RISK_CFG: Record<string, { label: string; pill: string; dot: string }> = {
  LOW:      { label: "Baixo",    pill: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  MEDIUM:   { label: "Médio",    pill: "bg-amber-50 text-amber-700 border-amber-200",       dot: "bg-amber-500" },
  HIGH:     { label: "Alto",     pill: "bg-orange-50 text-orange-700 border-orange-200",    dot: "bg-orange-500" },
  CRITICAL: { label: "Crítico",  pill: "bg-red-50 text-red-700 border-red-200",            dot: "bg-red-500" },
}

const INFLUENCE_CFG: Record<string, { label: string; pill: string; Icon: React.ElementType }> = {
  POSITIVE: { label: "Positiva", pill: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: TrendingUp },
  NEGATIVE: { label: "Negativa", pill: "bg-red-50 text-red-700 border-red-200",            Icon: TrendingDown },
  NEUTRAL:  { label: "Neutra",   pill: "bg-slate-50 text-slate-600 border-slate-200",      Icon: Minus },
}

const MEETING_TYPE_LABEL: Record<string, string> = {
  CHECKPOINT: "Checkpoint", STATUS_REPORT: "Status Report", GO_NO_GO: "Go/No-Go",
  KICKOFF: "Kick-Off", PILOT: "Piloto", GO_LIVE: "GO LIVE",
  POST_GOLIVE: "Pós GO LIVE", LESSONS_LEARNED: "Lições Aprendidas",
  PROJECT_CLOSURE: "Encerramento", OTHER: "Outro",
}

function fmt(d: string | null | undefined, pattern = "dd/MM/yyyy") {
  if (!d) return "—"
  return format(new Date(d), pattern, { locale: ptBR })
}

function currency(v: number | null | undefined) {
  if (v == null) return "—"
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

// ─── Section wrapper ─────────────────────────────────────────────────────────

function Section({ title, icon: Icon, children, defaultOpen = true }: {
  title: string
  icon: React.ElementType
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-white rounded-2xl border border-black/[0.07] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-black/[0.01] transition-colors"
      >
        <div className="flex items-center gap-3">
          <Icon className="w-4.5 h-4.5 text-violet-600 w-[18px] h-[18px]" />
          <span className="font-semibold text-[#1a1625] text-sm">{title}</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-[#b0adc0] transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && <div className="px-6 pb-6">{children}</div>}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function EncerramentoMeetingClient({ project, members, wbsAreas, risks, meetings, lessons: initialLessons }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // meeting form
  const [date,        setDate]        = useState(new Date().toISOString().slice(0, 10))
  const [location,    setLocation]    = useState("")
  const [content,     setContent]     = useState("")
  const [decisions,   setDecisions]   = useState("")
  const [nextActions, setNextActions] = useState("")
  const [closingNotes, setClosingNotes] = useState("")
  const [attendeeIds, setAttendeeIds] = useState<string[]>([])
  const [externalAttendees, setExternalAttendees] = useState<{ id: string; name: string; role: string }[]>([])
  const [addingExternal, setAddingExternal] = useState(false)
  const [extName, setExtName] = useState("")
  const [extRole, setExtRole] = useState("")

  // lessons
  const [lessons,      setLessons]      = useState<LessonRef[]>(initialLessons)
  const [showLessonForm, setShowLessonForm] = useState(false)
  const [lessonPhase,   setLessonPhase]   = useState("EXECUTION")
  const [lessonArea,    setLessonArea]    = useState("")
  const [lessonResp,    setLessonResp]    = useState("")
  const [lessonOcc,     setLessonOcc]     = useState("")
  const [lessonInfl,    setLessonInfl]    = useState("POSITIVE")
  const [lessonImpact,  setLessonImpact]  = useState("MEDIUM")
  const [lessonText,    setLessonText]    = useState("")
  const [savingLesson, setSavingLesson]   = useState(false)

  // UI
  const [confirmed,  setConfirmed]  = useState(false)
  const [error,      setError]      = useState("")

  const progress = project.tasksTotal > 0
    ? Math.round((project.tasksDone / project.tasksTotal) * 100)
    : 0

  function confirmExternal() {
    if (!extName.trim()) return
    setExternalAttendees((prev) => [...prev, { id: Math.random().toString(36).slice(2), name: extName.trim(), role: extRole.trim() }])
    setExtName(""); setExtRole(""); setAddingExternal(false)
  }

  function toggleAttendee(id: string) {
    setAttendeeIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  async function handleSaveLesson() {
    if (!lessonOcc.trim() || !lessonText.trim()) return
    setSavingLesson(true)
    try {
      await createLesson({
        projectId:    project.id,
        phase:        lessonPhase as any,
        area:         lessonArea.trim() || "Geral",
        responsible:  lessonResp.trim() || "Equipe",
        occurrence:   lessonOcc.trim(),
        influence:    lessonInfl as any,
        impact:       lessonImpact as any,
        lesson:       lessonText.trim(),
        identifiedAt: new Date().toISOString().slice(0, 10),
        tags:         [],
      })
      setLessons((prev) => [
        ...prev,
        {
          id:          crypto.randomUUID(),
          phase:       lessonPhase,
          area:        lessonArea || "Geral",
          occurrence:  lessonOcc,
          influence:   lessonInfl,
          impact:      lessonImpact,
          lesson:      lessonText,
          identifiedAt: new Date().toISOString(),
          createdBy:   "Você",
        },
      ])
      setLessonArea(""); setLessonResp(""); setLessonOcc(""); setLessonText("")
      setShowLessonForm(false)
    } catch {
      setError("Erro ao salvar lição aprendida.")
    } finally {
      setSavingLesson(false)
    }
  }

  function handleFinalize() {
    if (!date) { setError("Informe a data da reunião."); return }
    setError("")
    startTransition(async () => {
      try {
        await registerClosureMeeting({
          projectId:    project.id,
          date,
          location:     location || undefined,
          content:      content || undefined,
          decisions:    decisions || undefined,
          nextActions:  (nextActions || "") + (externalAttendees.length ? (nextActions ? "\n\n" : "") + "Participantes externos: " + externalAttendees.map((e) => `${e.name}${e.role ? ` (${e.role})` : ""}`).join(", ") : "") || undefined,
          attendeeIds,
          closingNotes: closingNotes || undefined,
        })
        setConfirmed(true)
      } catch (e: any) {
        setError(e?.message ?? "Erro ao encerrar projeto.")
      }
    })
  }

  // ── Completed state ──────────────────────────────────────────────────────
  if (confirmed) {
    return (
      <div className="flex-1 overflow-y-auto flex items-center justify-center" style={{ background: "#F7F6F2" }}>
        <div className="bg-white rounded-3xl border border-black/[0.07] p-10 max-w-md w-full text-center shadow-sm">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ background: "linear-gradient(135deg, #7B2FBE, #9333EA)" }}
          >
            <CheckCircle2 className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-xl font-bold text-[#1a1625] mb-2">Projeto Encerrado!</h2>
          <p className="text-sm text-[#6b6880] mb-8">
            O projeto foi marcado como <strong>Concluído</strong> e o Termo de Encerramento foi gerado com sucesso.
          </p>
          <div className="flex flex-col gap-3">
            <a
              href={`/closure/${project.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold text-white transition hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #7B2FBE, #9333EA)" }}
            >
              <FileText className="w-4 h-4" />
              Ver Termo de Encerramento (PDF)
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <Link
              href="/encerramento"
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-medium text-[#6b6880] bg-[#F7F6F2] border border-black/[0.07] hover:bg-white transition"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar ao Encerramento
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ── Main layout ──────────────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "#F7F6F2" }}>
      {/* ── Sticky header ── */}
      <div className="bg-white border-b border-black/[0.06] sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/encerramento"
              className="p-2 rounded-xl hover:bg-[#F7F6F2] text-[#9c99b0] hover:text-[#4a4760] transition-colors shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="min-w-0">
              <h1 className="font-bold text-[#1a1625] text-base leading-tight truncate">{project.title}</h1>
              <p className="text-xs text-[#9c99b0] mt-0.5">Reunião de Encerramento</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href={`/closure/${project.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-violet-700 bg-violet-50 border border-violet-200 hover:bg-violet-100 transition"
            >
              <FileText className="w-4 h-4" />
              Pré-visualizar PDF
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-5">
        {/* ── Project summary card ── */}
        <div className="bg-white rounded-2xl border border-black/[0.07] p-6">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h2 className="text-lg font-bold text-[#1a1625]">{project.title}</h2>
              {project.description && (
                <p className="text-sm text-[#6b6880] mt-1 leading-relaxed">{project.description}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <div
                className="text-2xl font-black"
                style={{ background: "linear-gradient(135deg, #7B2FBE, #9333EA)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
              >
                {progress}%
              </div>
              <p className="text-[11px] text-[#9c99b0] mt-0.5">{project.tasksDone}/{project.tasksTotal} tarefas</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-2 bg-[#F0EFF8] rounded-full overflow-hidden mb-5">
            <div
              className="h-full rounded-full"
              style={{ width: `${progress}%`, background: "linear-gradient(90deg, #7B2FBE, #9333EA)" }}
            />
          </div>

          {/* Meta grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Patrocinador", value: project.sponsor ?? "—", sub: project.sponsorDept },
              { label: "Início Real",  value: fmt(project.actualStart ?? project.expectedStart) },
              { label: "GO LIVE",      value: fmt(project.goLiveActual ?? project.goLiveDate) },
              { label: "Término Prev.", value: fmt(project.expectedEnd) },
            ].map((m) => (
              <div key={m.label} className="bg-[#F7F6F2] rounded-xl p-3">
                <p className="text-[10px] uppercase tracking-widest text-[#b0adc0] mb-1">{m.label}</p>
                <p className="text-sm font-semibold text-[#1a1625] truncate">{m.value}</p>
                {m.sub && <p className="text-[11px] text-[#9c99b0] truncate">{m.sub}</p>}
              </div>
            ))}
          </div>

          {project.scope && (
            <div className="mt-4 p-4 bg-[#F7F6F2] rounded-xl">
              <p className="text-[10px] uppercase tracking-widest text-[#b0adc0] mb-1.5">Escopo</p>
              <p className="text-sm text-[#4a4760] leading-relaxed whitespace-pre-wrap">{project.scope}</p>
            </div>
          )}
        </div>

        {/* ── Meeting details ── */}
        <Section title="Dados da Reunião" icon={Calendar} defaultOpen>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-1">
            <div>
              <label className="text-xs font-medium text-[#6b6880] mb-1.5 block">Data da Reunião *</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-[#F7F6F2] border border-black/[0.08] rounded-xl outline-none focus:ring-2 focus:ring-violet-300/50 transition"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[#6b6880] mb-1.5 block">Local</label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Sala de reuniões, Videoconferência…"
                className="w-full px-3 py-2.5 text-sm bg-[#F7F6F2] border border-black/[0.08] rounded-xl outline-none focus:ring-2 focus:ring-violet-300/50 transition"
              />
            </div>
          </div>
        </Section>

        {/* ── Attendees ── */}
        <Section title="Participantes da Reunião" icon={Users} defaultOpen={true}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
            {members.map((m) => {
              const checked = attendeeIds.includes(m.id)
              return (
                <button
                  key={m.id}
                  onClick={() => toggleAttendee(m.id)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${checked ? "border-violet-300 bg-violet-50" : "border-black/[0.07] bg-[#F7F6F2] hover:bg-white"}`}
                >
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: checked ? "linear-gradient(135deg, #7B2FBE, #9333EA)" : "#c4c1d4" }}>
                    {m.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium truncate ${checked ? "text-violet-700" : "text-[#1a1625]"}`}>{m.name}</p>
                    {m.department && <p className="text-[11px] text-[#9c99b0] truncate">{m.department}</p>}
                  </div>
                  {checked && <CheckCircle2 className="w-4 h-4 text-violet-600 shrink-0" />}
                </button>
              )
            })}

            {/* External attendees */}
            {externalAttendees.map((ext) => (
              <div key={ext.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-emerald-200 bg-emerald-50 relative">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: "linear-gradient(135deg,#059669,#0891B2)" }}>
                  {ext.name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate text-emerald-800">{ext.name}</p>
                  <p className="text-[11px] text-emerald-500 truncate">{ext.role || "Externo"}</p>
                </div>
                <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest hidden sm:block">Ext.</span>
                <button onClick={() => setExternalAttendees((p) => p.filter((e) => e.id !== ext.id))} className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-emerald-100 hover:bg-red-100 flex items-center justify-center transition-colors">
                  <X className="w-2.5 h-2.5 text-emerald-400 hover:text-red-400" />
                </button>
              </div>
            ))}

            {/* Add external card */}
            {addingExternal ? (
              <div className="flex flex-col gap-2 p-3 rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50">
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Novo participante</p>
                <input autoFocus value={extName} onChange={(e) => setExtName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && confirmExternal()} placeholder="Nome completo" className="w-full px-2 py-1.5 text-xs rounded-lg border border-emerald-200 bg-white outline-none focus:border-emerald-400 placeholder-slate-300" />
                <input value={extRole} onChange={(e) => setExtRole(e.target.value)} onKeyDown={(e) => e.key === "Enter" && confirmExternal()} placeholder="Área / Empresa" className="w-full px-2 py-1.5 text-xs rounded-lg border border-emerald-200 bg-white outline-none focus:border-emerald-400 placeholder-slate-300" />
                <div className="flex gap-1.5">
                  <button onClick={confirmExternal} disabled={!extName.trim()} className="flex-1 py-1.5 text-[11px] font-black rounded-lg text-white disabled:opacity-40" style={{ background: "linear-gradient(135deg,#059669,#0891B2)" }}>Adicionar</button>
                  <button onClick={() => { setAddingExternal(false); setExtName(""); setExtRole("") }} className="px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200">Cancelar</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingExternal(true)} className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border-2 border-dashed border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50 transition-all group min-h-[64px]">
                <div className="w-7 h-7 rounded-full flex items-center justify-center bg-slate-100 group-hover:bg-emerald-100 transition-colors">
                  <Plus className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600 transition-colors" />
                </div>
                <p className="text-[10px] font-bold text-slate-400 group-hover:text-emerald-600 transition-colors text-center leading-tight">Participante<br />externo</p>
              </button>
            )}
          </div>
        </Section>

        {/* ── Deliverables ── */}
        <Section title="Entregas do Projeto" icon={Layers} defaultOpen={wbsAreas.length > 0}>
          {wbsAreas.length === 0 ? (
            <p className="text-sm text-[#9c99b0] mt-1">Nenhuma área WBS cadastrada.</p>
          ) : (
            <div className="mt-1 space-y-4">
              {wbsAreas.map((area) => {
                const areaColor = area.color ?? "#7B2FBE"
                const done = area.tasks.filter((t) => t.status === "COMPLETED").length
                return (
                  <div key={area.id}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ background: areaColor }} />
                      <span className="text-sm font-semibold text-[#1a1625]">{area.name}</span>
                      <span className="ml-auto text-[11px] text-[#9c99b0]">{done}/{area.tasks.length} concluídas</span>
                    </div>
                    {area.tasks.length === 0 ? (
                      <p className="text-xs text-[#b0adc0] pl-5">Sem tarefas nesta área.</p>
                    ) : (
                      <div className="space-y-1.5 pl-5">
                        {area.tasks.map((t) => {
                          const tcfg = TASK_STATUS_CFG[t.status] ?? { label: t.status, pill: "bg-slate-100 text-slate-600 border-slate-200" }
                          return (
                            <div key={t.id} className="flex items-center gap-3 py-2 px-3 bg-[#F7F6F2] rounded-xl">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-[#1a1625] truncate">{t.title}</p>
                                {t.responsible && <p className="text-[11px] text-[#9c99b0] truncate">{t.responsible}</p>}
                              </div>
                              <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${tcfg.pill}`}>
                                {tcfg.label}
                              </span>
                              <span className="text-[11px] font-semibold text-[#4a4760] w-8 text-right shrink-0">{t.progress}%</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Section>

        {/* ── Risks ── */}
        {risks.length > 0 && (
          <Section title="Riscos do Projeto" icon={Shield} defaultOpen={false}>
            <div className="mt-1 space-y-2">
              {risks.map((r) => {
                const rcfg = RISK_CFG[r.status] ?? RISK_CFG.LOW
                return (
                  <div key={r.id} className="flex items-start gap-3 py-3 px-4 bg-[#F7F6F2] rounded-xl">
                    <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${rcfg.dot}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#1a1625]">{r.description}</p>
                      {r.mitigation && <p className="text-[11px] text-[#9c99b0] mt-0.5">Mitigação: {r.mitigation}</p>}
                    </div>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium shrink-0 ${rcfg.pill}`}>
                      {rcfg.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </Section>
        )}

        {/* ── Meeting history ── */}
        {meetings.length > 0 && (
          <Section title="Histórico de Reuniões" icon={Calendar} defaultOpen={false}>
            <div className="mt-1 space-y-1.5">
              {meetings.map((m) => (
                <div key={m.id} className="flex items-center gap-3 py-2.5 px-4 bg-[#F7F6F2] rounded-xl">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#1a1625] truncate">{m.title}</p>
                    <p className="text-[11px] text-[#9c99b0]">{fmt(m.date)} · {m.participants} participante{m.participants !== 1 ? "s" : ""}</p>
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 font-medium shrink-0">
                    {MEETING_TYPE_LABEL[m.type] ?? m.type}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ── Lessons learned ── */}
        <Section title="Lições Aprendidas" icon={BookOpen} defaultOpen>
          <div className="mt-1 space-y-3">
            {lessons.map((l) => {
              const icfg = INFLUENCE_CFG[l.influence] ?? INFLUENCE_CFG.NEUTRAL
              const Icon = icfg.Icon
              return (
                <div key={l.id} className="py-3 px-4 bg-[#F7F6F2] rounded-xl">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border font-medium ${icfg.pill}`}>
                      <Icon className="w-3 h-3" />
                      {icfg.label}
                    </span>
                    <span className="text-[11px] text-[#b0adc0]">{fmt(l.identifiedAt)}</span>
                  </div>
                  <p className="text-sm font-medium text-[#1a1625]">{l.occurrence}</p>
                  <p className="text-xs text-[#6b6880] mt-1 leading-relaxed">{l.lesson}</p>
                  <p className="text-[11px] text-[#b0adc0] mt-1">{l.area} · {l.createdBy}</p>
                </div>
              )
            })}

            {/* Add lesson button / form */}
            {!showLessonForm ? (
              <button
                onClick={() => setShowLessonForm(true)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-violet-300 text-sm text-violet-600 hover:bg-violet-50 transition"
              >
                <Plus className="w-4 h-4" />
                Registrar nova lição aprendida
              </button>
            ) : (
              <div className="p-5 bg-violet-50 border border-violet-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-violet-700">Nova Lição Aprendida</p>
                  <button onClick={() => setShowLessonForm(false)} className="text-violet-400 hover:text-violet-600 transition">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] font-medium text-violet-700 mb-1 block">Fase</label>
                    <select
                      value={lessonPhase}
                      onChange={(e) => setLessonPhase(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white border border-violet-200 rounded-xl outline-none focus:ring-2 focus:ring-violet-300/50"
                    >
                      <option value="INITIATION">Iniciação</option>
                      <option value="PLANNING">Planejamento</option>
                      <option value="EXECUTION">Execução</option>
                      <option value="MONITORING">Monitoramento</option>
                      <option value="CLOSURE">Encerramento</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-violet-700 mb-1 block">Influência</label>
                    <select
                      value={lessonInfl}
                      onChange={(e) => setLessonInfl(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white border border-violet-200 rounded-xl outline-none focus:ring-2 focus:ring-violet-300/50"
                    >
                      <option value="POSITIVE">Positiva</option>
                      <option value="NEGATIVE">Negativa</option>
                      <option value="NEUTRAL">Neutra</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-violet-700 mb-1 block">Impacto</label>
                    <select
                      value={lessonImpact}
                      onChange={(e) => setLessonImpact(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white border border-violet-200 rounded-xl outline-none focus:ring-2 focus:ring-violet-300/50"
                    >
                      <option value="HIGH">Alto</option>
                      <option value="MEDIUM">Médio</option>
                      <option value="LOW">Baixo</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-medium text-violet-700 mb-1 block">Área</label>
                    <input
                      value={lessonArea}
                      onChange={(e) => setLessonArea(e.target.value)}
                      placeholder="Ex: Gestão, TI, Operações…"
                      className="w-full px-3 py-2 text-sm bg-white border border-violet-200 rounded-xl outline-none focus:ring-2 focus:ring-violet-300/50"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-violet-700 mb-1 block">Responsável</label>
                    <input
                      value={lessonResp}
                      onChange={(e) => setLessonResp(e.target.value)}
                      placeholder="Nome ou equipe"
                      className="w-full px-3 py-2 text-sm bg-white border border-violet-200 rounded-xl outline-none focus:ring-2 focus:ring-violet-300/50"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-violet-700 mb-1 block">O que ocorreu? *</label>
                  <textarea
                    value={lessonOcc}
                    onChange={(e) => setLessonOcc(e.target.value)}
                    rows={2}
                    placeholder="Descreva o que aconteceu no projeto…"
                    className="w-full px-3 py-2 text-sm bg-white border border-violet-200 rounded-xl outline-none focus:ring-2 focus:ring-violet-300/50 resize-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-medium text-violet-700 mb-1 block">Lição / Recomendação *</label>
                  <textarea
                    value={lessonText}
                    onChange={(e) => setLessonText(e.target.value)}
                    rows={2}
                    placeholder="O que aprendemos? O que recomendamos para projetos futuros?"
                    className="w-full px-3 py-2 text-sm bg-white border border-violet-200 rounded-xl outline-none focus:ring-2 focus:ring-violet-300/50 resize-none"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handleSaveLesson}
                    disabled={savingLesson || !lessonOcc.trim() || !lessonText.trim()}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white transition disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #7B2FBE, #9333EA)" }}
                  >
                    {savingLesson ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Salvar Lição
                  </button>
                </div>
              </div>
            )}
          </div>
        </Section>

        {/* ── Meeting notes ── */}
        <Section title="Anotações da Reunião" icon={MessageSquare} defaultOpen>
          <div className="mt-1 space-y-4">
            <div>
              <label className="text-xs font-medium text-[#6b6880] mb-1.5 block">Pauta / Discussões</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
                placeholder="Registre os principais tópicos discutidos na reunião de encerramento…"
                className="w-full px-4 py-3 text-sm bg-[#F7F6F2] border border-black/[0.08] rounded-xl outline-none focus:ring-2 focus:ring-violet-300/50 resize-none transition"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[#6b6880] mb-1.5 block">Decisões Tomadas</label>
              <textarea
                value={decisions}
                onChange={(e) => setDecisions(e.target.value)}
                rows={3}
                placeholder="Liste as decisões acordadas durante a reunião…"
                className="w-full px-4 py-3 text-sm bg-[#F7F6F2] border border-black/[0.08] rounded-xl outline-none focus:ring-2 focus:ring-violet-300/50 resize-none transition"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[#6b6880] mb-1.5 block">Próximas Ações (pós-encerramento)</label>
              <textarea
                value={nextActions}
                onChange={(e) => setNextActions(e.target.value)}
                rows={2}
                placeholder="Ações de acompanhamento ou handoff após o encerramento…"
                className="w-full px-4 py-3 text-sm bg-[#F7F6F2] border border-black/[0.08] rounded-xl outline-none focus:ring-2 focus:ring-violet-300/50 resize-none transition"
              />
            </div>
          </div>
        </Section>

        {/* ── Closing notes for the document ── */}
        <Section title="Considerações Finais (Termo de Encerramento)" icon={FileText} defaultOpen>
          <div className="mt-1">
            <label className="text-xs font-medium text-[#6b6880] mb-1.5 block">
              Estas notas aparecerão no documento PDF do Termo de Encerramento
            </label>
            <textarea
              value={closingNotes}
              onChange={(e) => setClosingNotes(e.target.value)}
              rows={5}
              placeholder="Descreva um resumo executivo do projeto: conquistas, desafios superados, valor entregue ao negócio…"
              className="w-full px-4 py-3 text-sm bg-[#F7F6F2] border border-black/[0.08] rounded-xl outline-none focus:ring-2 focus:ring-violet-300/50 resize-none transition"
            />
          </div>
        </Section>

        {/* ── Error ── */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* ── Finalize button ── */}
        <div
          className="bg-white rounded-2xl border p-6"
          style={{ borderColor: "rgba(123,47,190,0.2)", background: "rgba(123,47,190,0.02)" }}
        >
          <div className="flex items-start gap-4">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg, #7B2FBE, #9333EA)" }}
            >
              <CheckCircle2 className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-[#1a1625] text-sm">Finalizar Projeto</h3>
              <p className="text-xs text-[#6b6880] mt-1 leading-relaxed">
                Ao clicar em <strong>Encerrar Projeto</strong>, o projeto será marcado como <strong>Concluído</strong>,
                a reunião de encerramento será registrada e o Termo de Encerramento será criado.
                Esta ação não pode ser desfeita.
              </p>
            </div>
          </div>

          <button
            onClick={handleFinalize}
            disabled={isPending}
            className="mt-5 w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-base font-bold text-white transition disabled:opacity-60 hover:opacity-90 shadow-sm"
            style={{ background: "linear-gradient(135deg, #7B2FBE, #9333EA)" }}
          >
            {isPending ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Encerrando projeto…
              </>
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5" />
                Encerrar Projeto e Gerar Termo
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
