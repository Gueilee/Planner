"use client"

import { useState, useId } from "react"
import { saveLessonsLearned, type LessonItem } from "@/lib/actions/lessons-learned"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  ArrowLeft, Plus, Trash2, ThumbsUp, ThumbsDown, CheckCircle2,
  Loader2, Calendar, MapPin, Users, Lightbulb, BookOpen, History,
  Star, AlertOctagon, X, ChevronDown, ChevronUp,
} from "lucide-react"
import Link from "next/link"

// ─── Types ────────────────────────────────────────────────────────────────────

type Member = { id: string; name: string; department: string | null }

type ExistingLesson = {
  id: string
  type: "GOOD_PRACTICE" | "PROBLEM"
  area: string | null
  description: string
  impact: string | null
  recommendation: string | null
  createdBy: string
  createdAt: string
}

type HistoryItem = { id: string; title: string; date: string; participants: number }

interface LessonsClientProps {
  project: { id: string; title: string; status: string }
  members: Member[]
  history: HistoryItem[]
  existingLessons: ExistingLesson[]
}

type DraftLesson = {
  uid: string
  type: "GOOD_PRACTICE" | "PROBLEM"
  area: string
  description: string
  impact: string
  recommendation: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const AREAS = [
  "Gestão do Projeto",
  "Comunicação",
  "Equipe",
  "Técnico / Tecnologia",
  "Processos",
  "Stakeholders",
  "Recursos / Orçamento",
  "Qualidade",
  "Outro",
]

function uid() {
  return Math.random().toString(36).slice(2)
}

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
}

function emptyLesson(type: "GOOD_PRACTICE" | "PROBLEM"): DraftLesson {
  return { uid: uid(), type, area: "", description: "", impact: "", recommendation: "" }
}

// ─── Background ───────────────────────────────────────────────────────────────

function DarkBackground() {
  return (
    <div className="fixed inset-0 -z-10" style={{ background: "#060C1A" }}>
      <div className="absolute inset-0"
        style={{
          backgroundImage: `radial-gradient(ellipse at 20% 20%, rgba(16,185,129,0.12) 0%, transparent 55%),
                            radial-gradient(ellipse at 80% 25%, rgba(239,68,68,0.10) 0%, transparent 50%),
                            radial-gradient(ellipse at 50% 80%, rgba(36,99,255,0.08) 0%, transparent 45%)`,
        }}
      />
      <svg className="absolute inset-0 w-full h-full opacity-[0.025]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
    </div>
  )
}

// ─── Card Editor ──────────────────────────────────────────────────────────────

function LessonCard({
  lesson,
  onChange,
  onRemove,
}: {
  lesson: DraftLesson
  onChange: (patch: Partial<DraftLesson>) => void
  onRemove: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const isGood = lesson.type === "GOOD_PRACTICE"

  const accentColor   = isGood ? "#10B981" : "#F97316"
  const accentBg      = isGood ? "rgba(16,185,129,0.10)" : "rgba(249,115,22,0.10)"
  const accentBorder  = isGood ? "rgba(16,185,129,0.22)" : "rgba(249,115,22,0.22)"

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: `1px solid ${accentBorder}`,
        boxShadow: `0 4px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)`,
      }}
    >
      {/* colored top bar */}
      <div className="h-1" style={{ background: `linear-gradient(90deg, ${accentColor}, transparent)` }} />

      <div className="p-4 space-y-3">
        {/* Area + delete row */}
        <div className="flex items-center gap-2">
          <select
            value={lesson.area}
            onChange={(e) => onChange({ area: e.target.value })}
            className="flex-1 text-xs font-semibold rounded-lg px-3 py-2 outline-none transition-all"
            style={{
              background: accentBg,
              border: `1px solid ${accentBorder}`,
              color: accentColor,
            }}
          >
            <option value="">Área / Categoria…</option>
            {AREAS.map((a) => (
              <option key={a} value={a} style={{ background: "#0F172A", color: "#E2E8F0" }}>{a}</option>
            ))}
          </select>
          <button
            onClick={onRemove}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/20"
            style={{ border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.30)" }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Description */}
        <textarea
          value={lesson.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder={isGood ? "O que funcionou bem? Descreva a boa prática…" : "O que não funcionou? Descreva o problema ou desafio…"}
          rows={3}
          className="w-full text-sm rounded-xl px-3 py-2.5 outline-none resize-none placeholder:text-white/20 transition-all focus:ring-1"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.09)",
            color: "rgba(255,255,255,0.90)",
          }}
        />

        {/* Toggle extra fields */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold transition-colors"
          style={{ color: "rgba(255,255,255,0.35)" }}
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {expanded ? "Menos detalhes" : "Adicionar impacto e recomendação"}
        </button>

        {expanded && (
          <div className="space-y-2.5 pt-1">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" style={{ color: "rgba(255,255,255,0.30)" }}>
                Impacto no Projeto
              </label>
              <textarea
                value={lesson.impact}
                onChange={(e) => onChange({ impact: e.target.value })}
                placeholder="Qual foi o impacto desta situação no projeto?"
                rows={2}
                className="w-full text-sm rounded-xl px-3 py-2.5 outline-none resize-none placeholder:text-white/20 transition-all"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.80)" }}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" style={{ color: "rgba(255,255,255,0.30)" }}>
                Recomendação para Próximos Projetos
              </label>
              <textarea
                value={lesson.recommendation}
                onChange={(e) => onChange({ recommendation: e.target.value })}
                placeholder={isGood ? "Como replicar esta boa prática?" : "Como evitar ou mitigar este problema?"}
                rows={2}
                className="w-full text-sm rounded-xl px-3 py-2.5 outline-none resize-none placeholder:text-white/20 transition-all"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.80)" }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Existing Lesson Card (read-only history) ─────────────────────────────────

function ExistingLessonCard({ lesson }: { lesson: ExistingLesson }) {
  const isGood = lesson.type === "GOOD_PRACTICE"
  const accentColor  = isGood ? "#10B981" : "#F97316"
  const accentBorder = isGood ? "rgba(16,185,129,0.20)" : "rgba(249,115,22,0.20)"

  return (
    <div
      className="rounded-xl p-4 space-y-2"
      style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${accentBorder}` }}
    >
      <div className="flex items-start gap-2">
        <div
          className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: isGood ? "rgba(16,185,129,0.15)" : "rgba(249,115,22,0.15)" }}
        >
          {isGood
            ? <ThumbsUp className="w-2.5 h-2.5" style={{ color: accentColor }} />
            : <ThumbsDown className="w-2.5 h-2.5" style={{ color: accentColor }} />
          }
        </div>
        <div className="flex-1 min-w-0">
          {lesson.area && (
            <span
              className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full mb-1 inline-block"
              style={{ background: isGood ? "rgba(16,185,129,0.12)" : "rgba(249,115,22,0.12)", color: accentColor }}
            >
              {lesson.area}
            </span>
          )}
          <p className="text-sm text-white/80 leading-relaxed">{lesson.description}</p>
          {lesson.recommendation && (
            <p className="text-xs mt-1.5 leading-relaxed" style={{ color: "rgba(255,255,255,0.40)" }}>
              <span className="font-bold" style={{ color: accentColor }}>→</span> {lesson.recommendation}
            </p>
          )}
        </div>
      </div>
      <p className="text-[10px] font-medium pl-7" style={{ color: "rgba(255,255,255,0.25)" }}>
        {lesson.createdBy} · {format(new Date(lesson.createdAt), "dd/MM/yyyy", { locale: ptBR })}
      </p>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function LessonsClient({ project, members, history, existingLessons }: LessonsClientProps) {
  const today = format(new Date(), "yyyy-MM-dd")

  // Meeting meta
  const [date, setDate]               = useState(today)
  const [location, setLocation]       = useState("Sala de Reuniões")
  const [generalNotes, setNotes]      = useState("")
  const [attendeeIds, setAttendeeIds] = useState<string[]>(members.map((m) => m.id))

  // Lesson drafts
  const [goodItems, setGoodItems] = useState<DraftLesson[]>([emptyLesson("GOOD_PRACTICE")])
  const [badItems,  setBadItems]  = useState<DraftLesson[]>([emptyLesson("PROBLEM")])

  // UI state
  const [saving, setSaving]     = useState(false)
  const [saved,  setSaved]      = useState(false)
  const [error,  setError]      = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  // ── helpers ──────────────────────────────────────────────────────────────────

  function toggleMember(id: string) {
    setAttendeeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  function updateGood(uid: string, patch: Partial<DraftLesson>) {
    setGoodItems((prev) => prev.map((l) => l.uid === uid ? { ...l, ...patch } : l))
  }
  function removeGood(uid: string) {
    setGoodItems((prev) => prev.filter((l) => l.uid !== uid))
  }
  function addGood() {
    setGoodItems((prev) => [...prev, emptyLesson("GOOD_PRACTICE")])
  }

  function updateBad(uid: string, patch: Partial<DraftLesson>) {
    setBadItems((prev) => prev.map((l) => l.uid === uid ? { ...l, ...patch } : l))
  }
  function removeBad(uid: string) {
    setBadItems((prev) => prev.filter((l) => l.uid !== uid))
  }
  function addBad() {
    setBadItems((prev) => [...prev, emptyLesson("PROBLEM")])
  }

  const allLessons: LessonItem[] = [
    ...goodItems.filter((l) => l.description.trim()).map(({ type, area, description, impact, recommendation }) => ({ type, area, description, impact, recommendation })),
    ...badItems.filter((l) => l.description.trim()).map(({ type, area, description, impact, recommendation }) => ({ type, area, description, impact, recommendation })),
  ]

  const filledGood = goodItems.filter((l) => l.description.trim()).length
  const filledBad  = badItems.filter((l) => l.description.trim()).length

  // ── submit ───────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!date) { setError("Defina a data da reunião."); return }
    if (allLessons.length === 0) { setError("Registre ao menos uma lição aprendida."); return }
    setSaving(true)
    setError(null)
    try {
      await saveLessonsLearned({ projectId: project.id, date, location, generalNotes, attendeeIds, lessons: allLessons })
      setSaved(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.")
    } finally {
      setSaving(false)
    }
  }

  // ── Success screen ───────────────────────────────────────────────────────────

  if (saved) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 relative overflow-hidden">
        <DarkBackground />

        {/* Glow rings */}
        <div className="absolute w-96 h-96 rounded-full opacity-20 animate-ping"
          style={{ background: "radial-gradient(circle, rgba(16,185,129,0.4) 0%, transparent 70%)", animationDuration: "3s" }} />
        <div className="absolute w-80 h-80 rounded-full opacity-30"
          style={{ background: "radial-gradient(circle, rgba(16,185,129,0.25) 0%, transparent 70%)" }} />

        <div className="relative z-10 text-center max-w-lg">
          <div
            className="w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-6"
            style={{ background: "linear-gradient(135deg, #059669, #10B981)", boxShadow: "0 20px 60px rgba(16,185,129,0.50)" }}
          >
            <BookOpen className="w-12 h-12 text-white" />
          </div>

          <h1
            className="text-5xl font-black mb-3 tracking-tight"
            style={{ background: "linear-gradient(135deg, #10B981, #34D399, #6EE7B7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
          >
            Lições Registradas!
          </h1>
          <p className="text-white/50 text-lg mb-10">
            A reunião de lições aprendidas foi salva no histórico do projeto.
          </p>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-10">
            {[
              { label: "Boas Práticas", value: filledGood, color: "#10B981", icon: ThumbsUp },
              { label: "Pontos de Melhoria", value: filledBad, color: "#F97316", icon: ThumbsDown },
              { label: "Participantes", value: attendeeIds.length, color: "#2463FF", icon: Users },
            ].map(({ label, value, color, icon: Icon }) => (
              <div
                key={label}
                className="rounded-2xl p-4 text-center"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}
              >
                <div className="w-8 h-8 rounded-xl flex items-center justify-center mx-auto mb-2"
                  style={{ background: `rgba(${color === "#10B981" ? "16,185,129" : color === "#F97316" ? "249,115,22" : "36,99,255"},0.15)` }}>
                  <Icon className="w-4 h-4" style={{ color }} />
                </div>
                <p className="text-2xl font-black text-white">{value}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wider mt-0.5" style={{ color: "rgba(255,255,255,0.40)" }}>{label}</p>
              </div>
            ))}
          </div>

          <div className="flex gap-3 justify-center">
            <Link
              href={`/projects/${project.id}`}
              className="inline-flex items-center gap-2 px-6 h-11 rounded-xl font-semibold text-sm text-white/80 transition-all hover:text-white"
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}
            >
              <ArrowLeft className="w-4 h-4" />
              Ver Projeto
            </Link>
            <a
              href={`/closure/${project.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 h-11 rounded-xl font-semibold text-sm text-white transition-all hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #7C3AED, #A855F7)", boxShadow: "0 4px 20px rgba(124,58,237,0.40)" }}
            >
              <BookOpen className="w-4 h-4" />
              Relatório de Encerramento
            </a>
          </div>
        </div>
      </div>
    )
  }

  // ── Main UI ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen relative" style={{ color: "rgba(255,255,255,0.90)" }}>
      <DarkBackground />

      {/* ── Top bar ── */}
      <div
        className="sticky top-0 z-30 flex items-center justify-between px-6 h-16"
        style={{ background: "rgba(6,12,26,0.85)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div className="flex items-center gap-4">
          <Link
            href={`/projects/${project.id}`}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-white/10"
            style={{ border: "1px solid rgba(255,255,255,0.10)" }}
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>LIÇÕES APRENDIDAS</p>
            <p className="text-sm font-bold text-white/90 leading-none mt-0.5 truncate max-w-xs">{project.title}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* lesson count badges */}
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-3 h-7 rounded-full text-xs font-bold"
              style={{ background: "rgba(16,185,129,0.15)", color: "#10B981", border: "1px solid rgba(16,185,129,0.25)" }}>
              <ThumbsUp className="w-3 h-3" /> {filledGood}
            </span>
            <span className="flex items-center gap-1.5 px-3 h-7 rounded-full text-xs font-bold"
              style={{ background: "rgba(249,115,22,0.15)", color: "#F97316", border: "1px solid rgba(249,115,22,0.25)" }}>
              <ThumbsDown className="w-3 h-3" /> {filledBad}
            </span>
          </div>

          {error && (
            <span className="text-xs font-semibold px-3 py-1 rounded-lg" style={{ background: "rgba(239,68,68,0.15)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.25)" }}>
              {error}
            </span>
          )}

          <button
            onClick={handleSave}
            disabled={saving || allLessons.length === 0}
            className="flex items-center gap-2 px-5 h-9 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, #059669, #10B981)", boxShadow: "0 4px 20px rgba(16,185,129,0.35)" }}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Salvar Reunião
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex gap-0 h-[calc(100vh-64px)]">

        {/* ─── Left Sidebar ─────────────────────────────────────────────────── */}
        <div
          className="w-72 shrink-0 flex flex-col overflow-y-auto"
          style={{ borderRight: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}
        >
          <div className="p-5 space-y-5">

            {/* Date */}
            <div>
              <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "rgba(255,255,255,0.35)" }}>
                <Calendar className="w-3 h-3" /> Data
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full text-sm rounded-xl px-3 py-2.5 outline-none transition-all"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.90)", colorScheme: "dark" }}
              />
            </div>

            {/* Location */}
            <div>
              <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "rgba(255,255,255,0.35)" }}>
                <MapPin className="w-3 h-3" /> Local
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Sala de Reuniões, Online…"
                className="w-full text-sm rounded-xl px-3 py-2.5 outline-none transition-all placeholder:text-white/20"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.90)" }}
              />
            </div>

            {/* Notes */}
            <div>
              <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "rgba(255,255,255,0.35)" }}>
                <Lightbulb className="w-3 h-3" /> Observações Gerais
              </label>
              <textarea
                value={generalNotes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Contexto, destaques da reunião…"
                rows={3}
                className="w-full text-sm rounded-xl px-3 py-2.5 outline-none resize-none transition-all placeholder:text-white/20"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.90)" }}
              />
            </div>

            {/* Participants */}
            <div>
              <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.35)" }}>
                <Users className="w-3 h-3" /> Participantes ({attendeeIds.length})
              </label>
              <div className="space-y-1.5">
                {members.map((m) => {
                  const active = attendeeIds.includes(m.id)
                  return (
                    <button
                      key={m.id}
                      onClick={() => toggleMember(m.id)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all text-left"
                      style={{
                        background: active ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.03)",
                        border: `1px solid ${active ? "rgba(16,185,129,0.30)" : "rgba(255,255,255,0.07)"}`,
                      }}
                    >
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0"
                        style={{ background: active ? "linear-gradient(135deg,#059669,#10B981)" : "rgba(255,255,255,0.08)", color: "white" }}
                      >
                        {initials(m.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate" style={{ color: active ? "#10B981" : "rgba(255,255,255,0.60)" }}>{m.name}</p>
                        {m.department && <p className="text-[10px] truncate" style={{ color: "rgba(255,255,255,0.25)" }}>{m.department}</p>}
                      </div>
                      {active && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: "#10B981" }} />}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Summary pill */}
            <div
              className="rounded-2xl p-4 space-y-2"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.30)" }}>Resumo da Sessão</p>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold" style={{ color: "#10B981" }}>Boas Práticas</span>
                <span
                  className="text-sm font-black px-2.5 py-0.5 rounded-full"
                  style={{ background: "rgba(16,185,129,0.12)", color: "#10B981" }}
                >
                  {filledGood}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold" style={{ color: "#F97316" }}>Pontos de Melhoria</span>
                <span
                  className="text-sm font-black px-2.5 py-0.5 rounded-full"
                  style={{ background: "rgba(249,115,22,0.12)", color: "#F97316" }}
                >
                  {filledBad}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.40)" }}>Total de lições</span>
                <span className="text-sm font-black" style={{ color: "rgba(255,255,255,0.70)" }}>{allLessons.length}</span>
              </div>
            </div>

            {/* History */}
            {history.length > 0 && (
              <div>
                <button
                  onClick={() => setHistoryOpen((v) => !v)}
                  className="flex items-center justify-between w-full text-[10px] font-bold uppercase tracking-widest mb-2 transition-colors"
                  style={{ color: "rgba(255,255,255,0.35)" }}
                >
                  <span className="flex items-center gap-1.5"><History className="w-3 h-3" /> Histórico ({history.length})</span>
                  {historyOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
                {historyOpen && (
                  <div className="space-y-1.5">
                    {history.map((h) => (
                      <div key={h.id} className="rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <p className="text-xs font-semibold text-white/60 truncate">{h.title}</p>
                        <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.25)" }}>
                          {format(new Date(h.date), "dd/MM/yyyy", { locale: ptBR })} · {h.participants} participantes
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ─── Board area ───────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 max-w-5xl mx-auto">

            {/* Instruction banner */}
            <div
              className="rounded-2xl p-5 mb-6 flex items-start gap-4"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.20), rgba(249,115,22,0.20))", border: "1px solid rgba(255,255,255,0.10)" }}>
                <Star className="w-5 h-5" style={{ color: "#FBBF24" }} />
              </div>
              <div>
                <p className="text-sm font-bold text-white/80">Reunião de Lições Aprendidas</p>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: "rgba(255,255,255,0.40)" }}>
                  Registre o que o time aprendeu ao longo do projeto. Separe em <span style={{ color: "#10B981" }}>boas práticas</span> — o que funcionou e deve ser repetido — e <span style={{ color: "#F97316" }}>pontos de melhoria</span> — o que não funcionou e deve ser evitado. Quanto mais detalhado, mais valioso para projetos futuros.
                </p>
              </div>
            </div>

            {/* Two-column board */}
            <div className="grid grid-cols-2 gap-5">

              {/* ── Good Practices column ── */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.25)" }}
                  >
                    <ThumbsUp className="w-4 h-4" style={{ color: "#10B981" }} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold" style={{ color: "#10B981" }}>O que funcionou bem</h2>
                    <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>Boas práticas a repetir</p>
                  </div>
                  <span
                    className="ml-auto text-xs font-black px-2.5 py-1 rounded-full"
                    style={{ background: "rgba(16,185,129,0.12)", color: "#10B981" }}
                  >
                    {filledGood}
                  </span>
                </div>

                <div className="space-y-3">
                  {goodItems.map((l) => (
                    <LessonCard
                      key={l.uid}
                      lesson={l}
                      onChange={(p) => updateGood(l.uid, p)}
                      onRemove={() => removeGood(l.uid)}
                    />
                  ))}
                </div>

                <button
                  onClick={addGood}
                  className="mt-3 w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold transition-all hover:opacity-80"
                  style={{
                    border: "2px dashed rgba(16,185,129,0.30)",
                    color: "rgba(16,185,129,0.70)",
                    background: "rgba(16,185,129,0.04)",
                  }}
                >
                  <Plus className="w-4 h-4" />
                  Adicionar Boa Prática
                </button>
              </div>

              {/* ── Problems column ── */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ background: "rgba(249,115,22,0.15)", border: "1px solid rgba(249,115,22,0.25)" }}
                  >
                    <AlertOctagon className="w-4 h-4" style={{ color: "#F97316" }} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold" style={{ color: "#F97316" }}>O que pode melhorar</h2>
                    <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>Problemas e desafios encontrados</p>
                  </div>
                  <span
                    className="ml-auto text-xs font-black px-2.5 py-1 rounded-full"
                    style={{ background: "rgba(249,115,22,0.12)", color: "#F97316" }}
                  >
                    {filledBad}
                  </span>
                </div>

                <div className="space-y-3">
                  {badItems.map((l) => (
                    <LessonCard
                      key={l.uid}
                      lesson={l}
                      onChange={(p) => updateBad(l.uid, p)}
                      onRemove={() => removeBad(l.uid)}
                    />
                  ))}
                </div>

                <button
                  onClick={addBad}
                  className="mt-3 w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold transition-all hover:opacity-80"
                  style={{
                    border: "2px dashed rgba(249,115,22,0.30)",
                    color: "rgba(249,115,22,0.70)",
                    background: "rgba(249,115,22,0.04)",
                  }}
                >
                  <Plus className="w-4 h-4" />
                  Adicionar Ponto de Melhoria
                </button>
              </div>
            </div>

            {/* ── Existing lessons (history, read-only) ── */}
            {existingLessons.length > 0 && (
              <div className="mt-10">
                <div
                  className="flex items-center gap-3 mb-5 pb-4"
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
                >
                  <History className="w-4 h-4" style={{ color: "rgba(255,255,255,0.35)" }} />
                  <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>
                    Lições já registradas neste projeto ({existingLessons.length})
                  </h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {existingLessons.map((l) => (
                    <ExistingLessonCard key={l.id} lesson={l} />
                  ))}
                </div>
              </div>
            )}

            {/* bottom padding */}
            <div className="h-16" />
          </div>
        </div>
      </div>
    </div>
  )
}
