"use client"

import { useState, useTransition } from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { parseDateStr } from "@/lib/date-utils"
import {
  Plus, Trash2, Pencil, TrendingUp, TrendingDown, Minus,
  Lightbulb, X, Save, ExternalLink, BookOpen,
} from "lucide-react"
import {
  createLesson, updateLesson, deleteLesson,
  type LessonInput,
} from "@/lib/actions/lessons"
import { ProjectPhase, LessonInfluence, LessonImpact } from "@/lib/generated/prisma/enums"
import Link from "next/link"

// ─── Types ───────────────────────────────────────────────────────────────────

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
  project: { id: string; title: string; status: string }
  members: { id: string; name: string }[]
  initialLessons: Lesson[]
}

// ─── Config ──────────────────────────────────────────────────────────────────

const PHASE_LABELS: Record<ProjectPhase, string> = {
  INITIATION: "Iniciação",
  PLANNING:   "Planejamento",
  EXECUTION:  "Execução",
  MONITORING: "Monitoramento",
  CLOSURE:    "Encerramento",
}
const PHASE_COLORS: Record<ProjectPhase, { bg: string; text: string; border: string }> = {
  INITIATION: { bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE" },
  PLANNING:   { bg: "#F5F3FF", text: "#6D28D9", border: "#DDD6FE" },
  EXECUTION:  { bg: "#FFFBEB", text: "#B45309", border: "#FDE68A" },
  MONITORING: { bg: "#ECFEFF", text: "#0E7490", border: "#A5F3FC" },
  CLOSURE:    { bg: "#F0FDF4", text: "#15803D", border: "#BBF7D0" },
}
const INFLUENCE_CFG: Record<LessonInfluence, { label: string; bg: string; text: string; border: string; icon: React.ElementType; dot: string }> = {
  POSITIVE: { label: "Boa Prática",  bg: "#F0FDF4", text: "#15803D", border: "#BBF7D0", icon: TrendingUp,   dot: "#22C55E" },
  NEGATIVE: { label: "Problema",     bg: "#FEF2F2", text: "#B91C1C", border: "#FECACA", icon: TrendingDown, dot: "#EF4444" },
  NEUTRAL:  { label: "Neutra",       bg: "#F8FAFC", text: "#475569", border: "#E2E8F0", icon: Minus,        dot: "#94A3B8" },
}
const IMPACT_CFG: Record<LessonImpact, { label: string; bg: string; text: string; border: string }> = {
  HIGH:   { label: "Alto",  bg: "#FEF2F2", text: "#B91C1C", border: "#FECACA" },
  MEDIUM: { label: "Médio", bg: "#FFFBEB", text: "#B45309", border: "#FDE68A" },
  LOW:    { label: "Baixo", bg: "#F0FDF4", text: "#15803D", border: "#BBF7D0" },
}

const EMPTY_FORM: Omit<LessonInput, "projectId"> = {
  phase:        "EXECUTION",
  area:         "",
  responsible:  "",
  occurrence:   "",
  influence:    "POSITIVE",
  impact:       "MEDIUM",
  lesson:       "",
  identifiedAt: new Date().toISOString().slice(0, 10),
  tags:         [],
}

// ─── Form Component ───────────────────────────────────────────────────────────

function LessonForm({
  projectId,
  initial,
  members,
  onSave,
  onCancel,
  saving,
}: {
  projectId: string
  initial: Omit<LessonInput, "projectId">
  members: { id: string; name: string }[]
  onSave: (data: LessonInput) => void
  onCancel: () => void
  saving: boolean
}) {
  const [form, setForm] = useState({ ...initial })

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  const labelCls = "block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1"
  const inputCls = "w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-50 transition-colors"
  const selectCls = "w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-50 transition-colors cursor-pointer"

  return (
    <div
      className="rounded-xl p-5 space-y-4"
      style={{ background: "#FAFBFC", border: "1px solid #E2E8F0" }}
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Fase</label>
          <select className={selectCls} value={form.phase} onChange={(e) => set("phase", e.target.value as ProjectPhase)}>
            {Object.entries(PHASE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Área / Módulo</label>
          <input className={inputCls} value={form.area} onChange={(e) => set("area", e.target.value)} placeholder="Ex: Integração, Dados, UX..." />
        </div>
        <div>
          <label className={labelCls}>Influência</label>
          <select className={selectCls} value={form.influence} onChange={(e) => set("influence", e.target.value as LessonInfluence)}>
            <option value="POSITIVE">Boa Prática</option>
            <option value="NEGATIVE">Problema</option>
            <option value="NEUTRAL">Neutra</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Impacto</label>
          <select className={selectCls} value={form.impact} onChange={(e) => set("impact", e.target.value as LessonImpact)}>
            <option value="HIGH">Alto</option>
            <option value="MEDIUM">Médio</option>
            <option value="LOW">Baixo</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Responsável</label>
          {members.length > 0 ? (
            <select className={selectCls} value={form.responsible} onChange={(e) => set("responsible", e.target.value)}>
              <option value="">Selecione...</option>
              {members.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
              <option value="Equipe">Equipe</option>
            </select>
          ) : (
            <input className={inputCls} value={form.responsible} onChange={(e) => set("responsible", e.target.value)} placeholder="Nome do responsável..." />
          )}
        </div>
        <div>
          <label className={labelCls}>Data Identificação</label>
          <input type="date" className={inputCls} value={form.identifiedAt} onChange={(e) => set("identifiedAt", e.target.value)} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Ocorrência / Contexto</label>
        <textarea
          className={`${inputCls} resize-none`}
          rows={2}
          value={form.occurrence}
          onChange={(e) => set("occurrence", e.target.value)}
          placeholder="Descreva o que aconteceu ou o contexto da lição..."
        />
      </div>
      <div>
        <label className={labelCls}>Lição / Recomendação</label>
        <textarea
          className={`${inputCls} resize-none`}
          rows={3}
          value={form.lesson}
          onChange={(e) => set("lesson", e.target.value)}
          placeholder="O que aprendemos? Qual é a recomendação para projetos futuros?"
        />
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          Cancelar
        </button>
        <button
          type="button"
          disabled={saving || !form.area.trim() || !form.occurrence.trim() || !form.lesson.trim()}
          onClick={() => onSave({ ...form, projectId })}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white transition-colors disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #7B2FBE, #2463FF)" }}
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? "Salvando..." : "Salvar Lição"}
        </button>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ProjectLessonsTab({ project, members, initialLessons }: Props) {
  const [lessons, setLessons] = useState<Lesson[]>(initialLessons)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleCreate(data: LessonInput) {
    startTransition(async () => {
      const created = await createLesson(data)
      setLessons((prev) => [created as Lesson, ...prev])
      setShowForm(false)
    })
  }

  function handleUpdate(id: string, data: LessonInput) {
    startTransition(async () => {
      const updated = await updateLesson(id, project.id, data)
      setLessons((prev) => prev.map((l) => l.id === id ? updated as Lesson : l))
      setEditId(null)
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteLesson(id, project.id)
      setLessons((prev) => prev.filter((l) => l.id !== id))
    })
  }

  const positives = lessons.filter((l) => l.influence === "POSITIVE").length
  const negatives = lessons.filter((l) => l.influence === "NEGATIVE").length

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-2xl p-5 flex items-center justify-between" style={{ border: "1px solid #E2E8F0" }}>
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, #7B2FBE, #2463FF)" }}>
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-[#0F172A]">Lições Aprendidas</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {lessons.length} lição{lessons.length !== 1 ? "ões" : ""} registrada{lessons.length !== 1 ? "s" : ""}
              {lessons.length > 0 && (
                <> · <span className="text-emerald-600 font-semibold">{positives} boa{positives !== 1 ? "s práticas" : " prática"}</span> · <span className="text-red-500 font-semibold">{negatives} problema{negatives !== 1 ? "s" : ""}</span></>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/projects/${project.id}/lessons`}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 hover:bg-white transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            Ver Completo
          </Link>
          <button
            onClick={() => { setShowForm(true); setEditId(null) }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white transition-all hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #7B2FBE, #2463FF)" }}
          >
            <Plus className="w-3.5 h-3.5" />
            Adicionar Lição
          </button>
        </div>
      </div>

      {/* Create form */}
      {showForm && !editId && (
        <LessonForm
          projectId={project.id}
          initial={EMPTY_FORM}
          members={members}
          onSave={handleCreate}
          onCancel={() => setShowForm(false)}
          saving={isPending}
        />
      )}

      {/* Empty state */}
      {lessons.length === 0 && !showForm && (
        <div
          className="bg-white rounded-2xl p-12 text-center"
          style={{ border: "1px solid #E2E8F0" }}
        >
          <Lightbulb className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-400">Nenhuma lição aprendida registrada</p>
          <p className="text-xs text-slate-300 mt-1">Registre aprendizados para fortalecer a Base de Conhecimento</p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white"
            style={{ background: "linear-gradient(135deg, #7B2FBE, #2463FF)" }}
          >
            <Plus className="w-3.5 h-3.5" />
            Registrar Primeira Lição
          </button>
        </div>
      )}

      {/* Lessons list */}
      {lessons.length > 0 && (
        <div className="space-y-3">
          {lessons.map((lesson) => {
            const infl = INFLUENCE_CFG[lesson.influence]
            const InfluenceIcon = infl.icon
            const phase = PHASE_COLORS[lesson.phase]
            const impact = IMPACT_CFG[lesson.impact]

            if (editId === lesson.id) {
              return (
                <div key={lesson.id}>
                  <LessonForm
                    projectId={project.id}
                    initial={{
                      phase:        lesson.phase,
                      area:         lesson.area,
                      responsible:  lesson.responsible,
                      occurrence:   lesson.occurrence,
                      influence:    lesson.influence,
                      impact:       lesson.impact,
                      lesson:       lesson.lesson,
                      identifiedAt: lesson.identifiedAt.slice(0, 10),
                      tags:         lesson.tags,
                    }}
                    members={members}
                    onSave={(data) => handleUpdate(lesson.id, data)}
                    onCancel={() => setEditId(null)}
                    saving={isPending}
                  />
                </div>
              )
            }

            return (
              <div
                key={lesson.id}
                className="bg-white rounded-2xl p-5 group hover:shadow-sm transition-all"
                style={{ border: "1px solid #E2E8F0", borderLeftWidth: 4, borderLeftColor: infl.dot }}
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: infl.bg, border: `1px solid ${infl.border}` }}
                  >
                    <InfluenceIcon className="w-4 h-4" style={{ color: infl.text }} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Badges */}
                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border"
                        style={{ background: infl.bg, color: infl.text, borderColor: infl.border }}
                      >
                        {infl.label}
                      </span>
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border"
                        style={{ background: phase.bg, color: phase.text, borderColor: phase.border }}
                      >
                        {PHASE_LABELS[lesson.phase]}
                      </span>
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border"
                        style={{ background: impact.bg, color: impact.text, borderColor: impact.border }}
                      >
                        Impacto {impact.label}
                      </span>
                      {lesson.area && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-50 text-slate-500 border border-slate-200">
                          {lesson.area}
                        </span>
                      )}
                    </div>

                    {/* Occurrence */}
                    <p className="text-xs text-slate-500 leading-relaxed mb-2 line-clamp-2">
                      <span className="font-semibold text-slate-600">Ocorrência: </span>
                      {lesson.occurrence}
                    </p>

                    {/* Lesson */}
                    <p className="text-sm font-medium text-[#0F172A] leading-relaxed line-clamp-3">
                      {lesson.lesson}
                    </p>

                    {/* Footer */}
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-50">
                      <span className="text-[10px] text-slate-400">
                        Por <span className="font-semibold text-slate-500">{lesson.createdBy?.name ?? "—"}</span>
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {format(parseDateStr(lesson.identifiedAt), "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setEditId(lesson.id)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(lesson.id)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Knowledge base link */}
      {lessons.length > 0 && (
        <div
          className="rounded-xl p-4 flex items-center justify-between"
          style={{ background: "linear-gradient(135deg, #F5F3FF, #EFF6FF)", border: "1px solid #DDD6FE" }}
        >
          <div>
            <p className="text-xs font-bold text-violet-700">Base de Conhecimento</p>
            <p className="text-[11px] text-violet-500 mt-0.5">
              Estas lições estão disponíveis na Base de Conhecimento organizacional
            </p>
          </div>
          <Link
            href="/knowledge"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white shrink-0"
            style={{ background: "linear-gradient(135deg, #7B2FBE, #2463FF)" }}
          >
            <BookOpen className="w-3 h-3" />
            Ver Base de Conhecimento
          </Link>
        </div>
      )}
    </div>
  )
}
