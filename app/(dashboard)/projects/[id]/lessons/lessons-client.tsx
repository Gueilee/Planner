"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  ArrowLeft, Plus, Trash2, Pencil, BookOpen, CheckCircle2,
  AlertTriangle, Minus, ChevronDown, X, Save, Lightbulb,
  Users, CalendarDays, TrendingUp, TrendingDown, Activity,
  Search, Filter,
} from "lucide-react"
import {
  createLesson, updateLesson, deleteLesson,
  type LessonInput,
} from "@/lib/actions/lessons"
import {
  ProjectPhase, LessonInfluence, LessonImpact,
} from "@/lib/generated/prisma/enums"

// ─── Types ────────────────────────────────────────────────────────────────────

type Lesson = {
  id: string
  phase: ProjectPhase
  area: string
  responsible: string
  occurrence: string
  influence: LessonInfluence
  impact: LessonImpact
  lesson: string
  identifiedAt: string
  tags: string[]
  project: { id: string; title: string }
  createdBy: { id: string; name: string }
}

type Props = {
  project:        { id: string; title: string; status: string }
  members:        { id: string; name: string }[]
  initialLessons: Lesson[]
}

// ─── Config ───────────────────────────────────────────────────────────────────

const PHASE_LABELS: Record<ProjectPhase, string> = {
  INITIATION: "Iniciação",
  PLANNING:   "Planejamento",
  EXECUTION:  "Execução",
  MONITORING: "Monitoramento",
  CLOSURE:    "Encerramento",
}
const PHASE_COLORS: Record<ProjectPhase, string> = {
  INITIATION: "bg-blue-50 text-blue-700 border-blue-200",
  PLANNING:   "bg-violet-50 text-violet-700 border-violet-200",
  EXECUTION:  "bg-amber-50 text-amber-700 border-amber-200",
  MONITORING: "bg-cyan-50 text-cyan-700 border-cyan-200",
  CLOSURE:    "bg-emerald-50 text-emerald-700 border-emerald-200",
}
const INFLUENCE_CFG = {
  POSITIVE: { label: "Positiva",  icon: TrendingUp,   cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  NEGATIVE: { label: "Negativa",  icon: TrendingDown, cls: "bg-red-50 text-red-700 border-red-200",             dot: "bg-red-500" },
  NEUTRAL:  { label: "Neutra",    icon: Minus,        cls: "bg-slate-50 text-slate-600 border-slate-200",       dot: "bg-slate-400" },
}
const IMPACT_CFG = {
  HIGH:   { label: "Alto",   cls: "bg-red-50 text-red-700 border-red-200" },
  MEDIUM: { label: "Médio",  cls: "bg-amber-50 text-amber-700 border-amber-200" },
  LOW:    { label: "Baixo",  cls: "bg-green-50 text-green-700 border-green-200" },
}

const EMPTY_FORM: Omit<LessonInput, "projectId"> = {
  phase:       "EXECUTION",
  area:        "",
  responsible: "",
  occurrence:  "",
  influence:   "POSITIVE",
  impact:      "MEDIUM",
  lesson:      "",
  identifiedAt: new Date().toISOString().slice(0, 10),
  tags:        [],
}

// ─── Badge helpers ────────────────────────────────────────────────────────────

function PhaseBadge({ phase }: { phase: ProjectPhase }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${PHASE_COLORS[phase]}`}>
      {PHASE_LABELS[phase]}
    </span>
  )
}
function InfluenceBadge({ influence }: { influence: LessonInfluence }) {
  const cfg = INFLUENCE_CFG[influence]
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${cfg.cls}`}>
      <Icon className="w-2.5 h-2.5" />
      {cfg.label}
    </span>
  )
}
function ImpactBadge({ impact }: { impact: LessonImpact }) {
  const cfg = IMPACT_CFG[impact]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

// ─── Form ─────────────────────────────────────────────────────────────────────

function LessonForm({
  projectId, members, initial, onSave, onCancel,
}: {
  projectId: string
  members:   { id: string; name: string }[]
  initial?:  Omit<LessonInput, "projectId">
  onSave:    (lesson: Lesson) => void
  onCancel?: () => void
}) {
  const [form, setForm] = useState<Omit<LessonInput, "projectId">>(initial ?? EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [tagInput, setTagInput] = useState("")

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const addTag = () => {
    const t = tagInput.trim()
    if (t && !(form.tags ?? []).includes(t)) set("tags", [...(form.tags ?? []), t])
    setTagInput("")
  }
  const removeTag = (t: string) => set("tags", (form.tags ?? []).filter((x) => x !== t))

  const valid = form.area.trim() && form.responsible.trim() && form.occurrence.trim() && form.lesson.trim()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    setSaving(true)
    try {
      const result = initial
        ? await updateLesson((initial as any).__id, projectId, { ...form, projectId })
        : await createLesson({ ...form, projectId })
      onSave(result as Lesson)
      if (!initial) setForm(EMPTY_FORM)
    } finally {
      setSaving(false)
    }
  }

  const InfluenceBtn = ({ v }: { v: LessonInfluence }) => {
    const cfg = INFLUENCE_CFG[v]
    const Icon = cfg.icon
    const active = form.influence === v
    return (
      <button type="button" onClick={() => set("influence", v)}
        className={`flex-1 flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 text-xs font-semibold transition-all ${
          active ? `${cfg.cls} border-current shadow-sm scale-[1.02]` : "border-gray-200 text-gray-400 hover:border-gray-300"
        }`}>
        <Icon className="w-4 h-4" />
        {cfg.label}
      </button>
    )
  }

  const ImpactBtn = ({ v }: { v: LessonImpact }) => {
    const cfg = IMPACT_CFG[v]
    const active = form.impact === v
    return (
      <button type="button" onClick={() => set("impact", v)}
        className={`flex-1 py-2.5 px-2 rounded-xl border-2 text-xs font-semibold transition-all ${
          active ? `${cfg.cls} border-current shadow-sm scale-[1.02]` : "border-gray-200 text-gray-400 hover:border-gray-300"
        }`}>
        {cfg.label}
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">

      {/* Phase + Date */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Fase do Projeto</label>
          <div className="relative">
            <select value={form.phase} onChange={(e) => set("phase", e.target.value as ProjectPhase)}
              className="w-full appearance-none border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 pr-8">
              {Object.entries(PHASE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Data de Identificação</label>
          <input type="date" value={form.identifiedAt ?? ""} onChange={(e) => set("identifiedAt", e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400" />
        </div>
      </div>

      {/* Area + Responsible */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Área</label>
          <input type="text" value={form.area} onChange={(e) => set("area", e.target.value)}
            placeholder="Ex: Tecnologia, Operações..." required
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 placeholder-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Responsável</label>
          <div className="relative">
            <input type="text" value={form.responsible} onChange={(e) => set("responsible", e.target.value)}
              list="members-list" placeholder="Nome do responsável" required
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 placeholder-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400" />
            <datalist id="members-list">
              {members.map((m) => <option key={m.id} value={m.name} />)}
            </datalist>
          </div>
        </div>
      </div>

      {/* Occurrence */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1.5">
          Fato ou Ocorrência <span className="text-gray-400 font-normal">(o que aconteceu)</span>
        </label>
        <textarea value={form.occurrence} onChange={(e) => set("occurrence", e.target.value)}
          rows={3} required placeholder="Descreva o fato ou ocorrência que gerou esta lição..."
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 placeholder-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 resize-none" />
      </div>

      {/* Influence */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1.5">Influência</label>
        <div className="flex gap-2">
          <InfluenceBtn v="POSITIVE" />
          <InfluenceBtn v="NEGATIVE" />
          <InfluenceBtn v="NEUTRAL" />
        </div>
      </div>

      {/* Impact */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1.5">Impacto</label>
        <div className="flex gap-2">
          <ImpactBtn v="HIGH" />
          <ImpactBtn v="MEDIUM" />
          <ImpactBtn v="LOW" />
        </div>
      </div>

      {/* Lesson */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1.5">
          Lição Aprendida <span className="text-gray-400 font-normal">(o que fazer diferente)</span>
        </label>
        <textarea value={form.lesson} onChange={(e) => set("lesson", e.target.value)}
          rows={4} required placeholder="Descreva a lição aprendida e a recomendação para projetos futuros..."
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 placeholder-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 resize-none" />
      </div>

      {/* Tags */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1.5">Tags</label>
        <div className="flex gap-2 flex-wrap mb-2">
          {(form.tags ?? []).map((t) => (
            <span key={t} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-50 text-violet-700 text-xs font-medium border border-violet-200">
              {t}
              <button type="button" onClick={() => removeTag(t)} className="hover:text-red-500 transition-colors">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={tagInput} onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag() } }}
            placeholder="Ex: comunicação, prazo..." type="text"
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 placeholder-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300" />
          <button type="button" onClick={addTag}
            className="px-3 py-2 rounded-xl bg-violet-50 text-violet-700 text-xs font-semibold border border-violet-200 hover:bg-violet-100 transition-colors">
            + Adicionar
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        {onCancel && (
          <button type="button" onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-500 hover:bg-gray-50 transition-colors">
            Cancelar
          </button>
        )}
        <button type="submit" disabled={!valid || saving}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #7B2FBE, #9333EA)" }}>
          <Save className="w-4 h-4" />
          {saving ? "Salvando..." : initial ? "Atualizar" : "Registrar Lição"}
        </button>
      </div>
    </form>
  )
}

// ─── Lesson Card ──────────────────────────────────────────────────────────────

function LessonCard({
  lesson, onEdit, onDelete,
}: {
  lesson:   Lesson
  onEdit:   () => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const infl = INFLUENCE_CFG[lesson.influence]
  const InfIcon = infl.icon

  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all overflow-hidden ${
      lesson.influence === "POSITIVE" ? "border-l-4 border-l-emerald-400" :
      lesson.influence === "NEGATIVE" ? "border-l-4 border-l-red-400" :
      "border-l-4 border-l-gray-300"
    }`}>
      <div className="p-4">
        {/* Top row */}
        <div className="flex items-start gap-2 mb-3">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
            lesson.influence === "POSITIVE" ? "bg-emerald-50" :
            lesson.influence === "NEGATIVE" ? "bg-red-50" : "bg-gray-50"
          }`}>
            <InfIcon className={`w-4 h-4 ${
              lesson.influence === "POSITIVE" ? "text-emerald-600" :
              lesson.influence === "NEGATIVE" ? "text-red-500" : "text-gray-400"
            }`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <PhaseBadge phase={lesson.phase} />
              <InfluenceBadge influence={lesson.influence} />
              <ImpactBadge impact={lesson.impact} />
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-violet-50 text-gray-400 hover:text-violet-600 transition-colors">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Area + Responsible */}
        <div className="flex items-center gap-3 mb-2.5">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">{lesson.area}</span>
          <span className="text-gray-200">·</span>
          <span className="text-[11px] text-gray-500">{lesson.responsible}</span>
        </div>

        {/* Occurrence */}
        <p className="text-[12px] font-semibold text-gray-700 leading-relaxed mb-2.5 line-clamp-2">
          {lesson.occurrence}
        </p>

        {/* Lesson preview / expanded */}
        <div className={`text-[11.5px] text-gray-500 leading-relaxed ${expanded ? "" : "line-clamp-2"}`}>
          <span className="font-semibold text-violet-600">Lição: </span>
          {lesson.lesson}
        </div>

        {/* Tags */}
        {lesson.tags.length > 0 && (
          <div className="flex gap-1 flex-wrap mt-2.5">
            {lesson.tags.map((t) => (
              <span key={t} className="px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-600 text-[9px] font-semibold border border-violet-100">
                {t}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-gray-50">
          <span className="text-[10px] text-gray-400">
            {format(new Date(lesson.identifiedAt), "dd/MM/yyyy", { locale: ptBR })}
          </span>
          <button onClick={() => setExpanded(!expanded)}
            className="text-[10px] font-semibold text-violet-500 hover:text-violet-700 transition-colors">
            {expanded ? "Menos" : "Ver completo"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Client ─────────────────────────────────────────────────────────────

export function LessonsClient({ project, members, initialLessons }: Props) {
  const [lessons, setLessons] = useState<Lesson[]>(initialLessons)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [filterInfluence, setFilterInfluence] = useState<LessonInfluence | "">("")
  const [filterPhase, setFilterPhase] = useState<ProjectPhase | "">("")

  const positive  = lessons.filter((l) => l.influence === "POSITIVE").length
  const negative  = lessons.filter((l) => l.influence === "NEGATIVE").length
  const highImpact = lessons.filter((l) => l.impact === "HIGH").length

  const filtered = useMemo(() => lessons.filter((l) => {
    if (filterInfluence && l.influence !== filterInfluence) return false
    if (filterPhase     && l.phase     !== filterPhase)     return false
    if (search) {
      const q = search.toLowerCase()
      return l.occurrence.toLowerCase().includes(q) ||
             l.lesson.toLowerCase().includes(q) ||
             l.area.toLowerCase().includes(q) ||
             l.responsible.toLowerCase().includes(q)
    }
    return true
  }), [lessons, filterInfluence, filterPhase, search])

  async function handleSave(lesson: Lesson) {
    setLessons((prev) => {
      const idx = prev.findIndex((l) => l.id === lesson.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = lesson; return next }
      return [lesson, ...prev]
    })
    setEditingId(null)
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir esta lição aprendida?")) return
    await deleteLesson(id, project.id)
    setLessons((prev) => prev.filter((l) => l.id !== id))
  }

  const editingLesson = editingId ? lessons.find((l) => l.id === editingId) : null

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "#F7F6F2" }}>

      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-100 px-8 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={`/projects/${project.id}`}
              className="flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-gray-700 transition-colors">
              <ArrowLeft className="w-4 h-4" />
              <span>{project.title}</span>
            </Link>
            <span className="text-gray-200">/</span>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #7B2FBE, #9333EA)" }}>
                <BookOpen className="w-3.5 h-3.5 text-white" />
              </div>
              <h1 className="text-lg font-black text-gray-900">Lições Aprendidas</h1>
            </div>
          </div>
          <Link href="/knowledge"
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-violet-200 text-violet-700 text-sm font-semibold hover:bg-violet-50 transition-colors">
            <Lightbulb className="w-4 h-4" />
            Ver Base de Conhecimento
          </Link>
        </div>
      </div>

      <div className="px-8 py-6 max-w-[1400px] mx-auto">

        {/* ── Stats bar ── */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total de Lições",  value: lessons.length, icon: BookOpen,   color: "text-violet-600",  bg: "bg-violet-50" },
            { label: "Boas Práticas",    value: positive,        icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "Problemas",        value: negative,        icon: AlertTriangle, color: "text-red-500",   bg: "bg-red-50" },
            { label: "Alto Impacto",     value: highImpact,      icon: Activity,   color: "text-amber-600",   bg: "bg-amber-50" },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 shadow-sm">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bg}`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <div>
                <p className="text-2xl font-black text-gray-900">{value}</p>
                <p className="text-[11px] text-gray-400 font-medium">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Main layout ── */}
        <div className="grid grid-cols-[400px_1fr] gap-6 items-start">

          {/* ── Left: Form panel ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden sticky top-6">
            <div className="px-5 py-4 border-b border-gray-50"
              style={{ background: "linear-gradient(135deg, rgba(123,47,190,0.04), rgba(147,51,234,0.06))" }}>
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, #7B2FBE, #9333EA)" }}>
                  <Plus className="w-3.5 h-3.5 text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-gray-900">
                    {editingId ? "Editar Lição" : "Registrar Lição"}
                  </h2>
                  <p className="text-[10px] text-gray-400">Preencha os dados da lição aprendida</p>
                </div>
              </div>
            </div>
            <div className="p-5 max-h-[calc(100vh-240px)] overflow-y-auto">
              {editingLesson ? (
                <LessonForm
                  projectId={project.id}
                  members={members}
                  initial={{ ...editingLesson, identifiedAt: editingLesson.identifiedAt.slice(0, 10), __id: editingLesson.id } as any}
                  onSave={handleSave}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <LessonForm
                  projectId={project.id}
                  members={members}
                  onSave={handleSave}
                />
              )}
            </div>
          </div>

          {/* ── Right: Lessons list ── */}
          <div className="flex flex-col gap-4">

            {/* Filter bar */}
            <div className="flex gap-3 items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por ocorrência, lição, área ou responsável..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm bg-white text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-300" />
              </div>
              <div className="relative">
                <select value={filterInfluence} onChange={(e) => setFilterInfluence(e.target.value as any)}
                  className="appearance-none border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-300 pr-7">
                  <option value="">Todas influências</option>
                  <option value="POSITIVE">Positiva</option>
                  <option value="NEGATIVE">Negativa</option>
                  <option value="NEUTRAL">Neutra</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
              <div className="relative">
                <select value={filterPhase} onChange={(e) => setFilterPhase(e.target.value as any)}
                  className="appearance-none border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-300 pr-7">
                  <option value="">Todas as fases</option>
                  {Object.entries(PHASE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                  style={{ background: "linear-gradient(135deg, rgba(123,47,190,0.08), rgba(147,51,234,0.12))" }}>
                  <BookOpen className="w-7 h-7 text-violet-400" />
                </div>
                <p className="text-base font-bold text-gray-700 mb-1">
                  {lessons.length === 0 ? "Nenhuma lição registrada" : "Nenhum resultado"}
                </p>
                <p className="text-sm text-gray-400">
                  {lessons.length === 0
                    ? "Registre a primeira lição aprendida deste projeto"
                    : "Tente ajustar os filtros de busca"}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {filtered.map((lesson) => (
                  <LessonCard
                    key={lesson.id}
                    lesson={lesson}
                    onEdit={() => setEditingId(lesson.id)}
                    onDelete={() => handleDelete(lesson.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
