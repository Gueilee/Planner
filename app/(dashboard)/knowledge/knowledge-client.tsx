"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  BookOpen, Search, Filter, TrendingUp, TrendingDown, Minus,
  CheckCircle2, AlertTriangle, Activity, X, ChevronDown,
  Lightbulb, LayoutGrid, List, ExternalLink, Tag,
  BarChart3, Layers, Users, Plus,
} from "lucide-react"
import type { ProjectPhase, LessonInfluence, LessonImpact } from "@/lib/generated/prisma/enums"

// ─── Types ─────────────────────────────────────────────────────────────────────

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

type Stats = {
  total: number
  byInfluence: { influence: LessonInfluence; _count: number }[]
  byPhase:     { phase: ProjectPhase; _count: number }[]
}

type Props = {
  lessons:  Lesson[]
  stats:    Stats
  projects: { id: string; title: string }[]
}

// ─── Config ───────────────────────────────────────────────────────────────────

const PHASE_LABELS: Record<string, string> = {
  INITIATION: "Iniciação", PLANNING: "Planejamento",
  EXECUTION:  "Execução",  MONITORING: "Monitoramento", CLOSURE: "Encerramento",
}
const PHASE_COLORS: Record<string, string> = {
  INITIATION: "bg-blue-50 text-blue-700 border-blue-200",
  PLANNING:   "bg-violet-50 text-violet-700 border-violet-200",
  EXECUTION:  "bg-amber-50 text-amber-700 border-amber-200",
  MONITORING: "bg-cyan-50 text-cyan-700 border-cyan-200",
  CLOSURE:    "bg-emerald-50 text-emerald-700 border-emerald-200",
}
const INFLUENCE_CFG: Record<string, { label: string; iconEl: React.ReactNode; cls: string; bar: string; light: string }> = {
  POSITIVE: { label: "Boas Práticas",  iconEl: <TrendingUp  className="w-4 h-4" />, cls: "text-emerald-700 bg-emerald-50 border-emerald-200", bar: "bg-emerald-400", light: "bg-emerald-50" },
  NEGATIVE: { label: "Problemas",      iconEl: <TrendingDown className="w-4 h-4" />, cls: "text-red-700 bg-red-50 border-red-200",             bar: "bg-red-400",     light: "bg-red-50"     },
  NEUTRAL:  { label: "Neutras",        iconEl: <Minus        className="w-4 h-4" />, cls: "text-slate-600 bg-slate-50 border-slate-200",       bar: "bg-slate-300",   light: "bg-slate-50"   },
}
const IMPACT_CFG: Record<string, { label: string; cls: string }> = {
  HIGH:   { label: "Alto",  cls: "bg-red-50 text-red-700 border-red-200" },
  MEDIUM: { label: "Médio", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  LOW:    { label: "Baixo", cls: "bg-green-50 text-green-700 border-green-200" },
}

// ─── Modal / Drawer ────────────────────────────────────────────────────────────

function LessonModal({ lesson, onClose }: { lesson: Lesson; onClose: () => void }) {
  const infl = INFLUENCE_CFG[lesson.influence]
  const imp  = IMPACT_CFG[lesson.impact]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="px-7 py-5 border-b border-gray-100"
          style={{ background: "linear-gradient(135deg, rgba(123,47,190,0.04), rgba(147,51,234,0.07))" }}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${PHASE_COLORS[lesson.phase]}`}>
                  {PHASE_LABELS[lesson.phase]}
                </span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${infl.cls}`}>
                  {infl.iconEl} {infl.label}
                </span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${imp.cls}`}>
                  Impacto {imp.label}
                </span>
              </div>
              <h2 className="text-base font-black text-gray-900">{lesson.project.title}</h2>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-7 py-6 space-y-5 max-h-[70vh] overflow-y-auto">

          {/* Meta */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-gray-50">
              <Layers className="w-4 h-4 text-violet-500 shrink-0" />
              <div>
                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wide mb-0.5">Área</p>
                <p className="text-sm font-semibold text-gray-800">{lesson.area}</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-gray-50">
              <Users className="w-4 h-4 text-violet-500 shrink-0" />
              <div>
                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wide mb-0.5">Responsável</p>
                <p className="text-sm font-semibold text-gray-800">{lesson.responsible}</p>
              </div>
            </div>
          </div>

          {/* Occurrence */}
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Fato ou Ocorrência</p>
            <div className="p-4 rounded-2xl border border-gray-100 bg-gray-50/60">
              <p className="text-sm text-gray-700 leading-relaxed">{lesson.occurrence}</p>
            </div>
          </div>

          {/* Lesson */}
          <div>
            <p className="text-[10px] font-bold text-violet-500 uppercase tracking-wide mb-2">Lição Aprendida</p>
            <div className="p-4 rounded-2xl border border-violet-100"
              style={{ background: "linear-gradient(135deg, rgba(123,47,190,0.04), rgba(147,51,234,0.06))" }}>
              <p className="text-sm text-gray-800 leading-relaxed font-medium">{lesson.lesson}</p>
            </div>
          </div>

          {/* Tags */}
          {lesson.tags.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Tags</p>
              <div className="flex gap-2 flex-wrap">
                {lesson.tags.map((t) => (
                  <span key={t} className="px-2.5 py-1 rounded-lg bg-violet-50 text-violet-600 text-xs font-semibold border border-violet-100">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Footer meta */}
          <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-gray-50">
            <span>Identificada em {format(new Date(lesson.identifiedAt), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</span>
            <Link href={`/projects/${lesson.project.id}/lessons`}
              className="flex items-center gap-1 text-violet-600 font-semibold hover:underline">
              Ver projeto <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Lesson Grid Card ─────────────────────────────────────────────────────────

function LessonGridCard({ lesson, onClick }: { lesson: Lesson; onClick: () => void }) {
  const infl = INFLUENCE_CFG[lesson.influence]
  const imp  = IMPACT_CFG[lesson.impact]
  return (
    <button onClick={onClick} className="text-left group">
      <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all overflow-hidden h-full flex flex-col ${
        lesson.influence === "POSITIVE" ? "border-t-4 border-t-emerald-400" :
        lesson.influence === "NEGATIVE" ? "border-t-4 border-t-red-400" :
        "border-t-4 border-t-gray-200"
      }`}>
        <div className="p-4 flex flex-col flex-1">
          <div className="flex items-center gap-1.5 flex-wrap mb-3">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-semibold border ${PHASE_COLORS[lesson.phase]}`}>
              {PHASE_LABELS[lesson.phase]}
            </span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-semibold border ${infl.cls}`}>
              {infl.iconEl} {infl.label}
            </span>
          </div>

          <p className="text-xs font-bold text-violet-700 mb-1 truncate">{lesson.project.title}</p>
          <p className="text-sm font-semibold text-gray-800 leading-snug mb-2 line-clamp-2">{lesson.occurrence}</p>
          <div className="flex-1">
            <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-3">{lesson.lesson}</p>
          </div>

          <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-50">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">{lesson.area}</span>
            </div>
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold border ${imp.cls}`}>
              {imp.label}
            </span>
          </div>
        </div>
      </div>
    </button>
  )
}

// ─── Lesson List Row ──────────────────────────────────────────────────────────

function LessonListRow({ lesson, onClick }: { lesson: Lesson; onClick: () => void }) {
  const infl = INFLUENCE_CFG[lesson.influence]
  const imp  = IMPACT_CFG[lesson.impact]
  return (
    <button onClick={onClick}
      className="w-full text-left bg-white rounded-2xl border border-gray-100 px-5 py-4 hover:shadow-md hover:border-violet-100 transition-all flex items-start gap-4 group">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${infl.light}`}>
        <span className={infl.cls.split(" ")[0]}>{infl.iconEl}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-semibold border ${PHASE_COLORS[lesson.phase]}`}>
            {PHASE_LABELS[lesson.phase]}
          </span>
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold border ${imp.cls}`}>
            {imp.label}
          </span>
          <span className="text-[10px] font-bold text-violet-600">{lesson.project.title}</span>
        </div>
        <p className="text-sm font-semibold text-gray-800 truncate">{lesson.occurrence}</p>
        <p className="text-[11px] text-gray-400 truncate mt-0.5">{lesson.lesson}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[10px] font-semibold text-gray-500">{lesson.area}</p>
        <p className="text-[9px] text-gray-400 mt-1">
          {format(new Date(lesson.identifiedAt), "dd/MM/yy", { locale: ptBR })}
        </p>
      </div>
    </button>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function KnowledgeClient({ lessons, stats, projects }: Props) {
  const [search,          setSearch]          = useState("")
  const [filterProject,   setFilterProject]   = useState("")
  const [filterInfluence, setFilterInfluence] = useState<LessonInfluence | "">("")
  const [filterImpact,    setFilterImpact]    = useState<LessonImpact | "">("")
  const [filterPhase,     setFilterPhase]     = useState<ProjectPhase | "">("")
  const [filterArea,      setFilterArea]      = useState("")
  const [view,            setView]            = useState<"grid" | "list">("grid")
  const [modal,           setModal]           = useState<Lesson | null>(null)

  const positive = stats.byInfluence.find((x) => x.influence === "POSITIVE")?._count ?? 0
  const negative = stats.byInfluence.find((x) => x.influence === "NEGATIVE")?._count ?? 0
  const neutral  = stats.byInfluence.find((x) => x.influence === "NEUTRAL")?._count  ?? 0

  const allAreas = useMemo(() =>
    [...new Set(lessons.map((l) => l.area).filter(Boolean))].sort()
  , [lessons])

  const filtered = useMemo(() => lessons.filter((l) => {
    if (filterProject   && l.project.id !== filterProject)   return false
    if (filterInfluence && l.influence  !== filterInfluence) return false
    if (filterImpact    && l.impact     !== filterImpact)    return false
    if (filterPhase     && l.phase      !== filterPhase)     return false
    if (filterArea      && l.area       !== filterArea)      return false
    if (search) {
      const q = search.toLowerCase()
      return l.occurrence.toLowerCase().includes(q) || l.lesson.toLowerCase().includes(q) ||
             l.area.toLowerCase().includes(q) || l.responsible.toLowerCase().includes(q) ||
             l.project.title.toLowerCase().includes(q)
    }
    return true
  }), [lessons, filterProject, filterInfluence, filterImpact, filterPhase, filterArea, search])

  const hasFilters = !!(search || filterProject || filterInfluence || filterImpact || filterPhase || filterArea)

  function clearFilters() {
    setSearch(""); setFilterProject(""); setFilterInfluence("")
    setFilterImpact(""); setFilterPhase(""); setFilterArea("")
  }

  const topAreas = useMemo(() => {
    const map: Record<string, number> = {}
    lessons.forEach((l) => { map[l.area] = (map[l.area] ?? 0) + 1 })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [lessons])

  const topTags = useMemo(() => {
    const map: Record<string, number> = {}
    lessons.forEach((l) => l.tags.forEach((t) => { map[t] = (map[t] ?? 0) + 1 }))
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [lessons])

  const [registerOpen, setRegisterOpen] = useState(false)

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "#F7F6F2" }}>

      {modal && <LessonModal lesson={modal} onClose={() => setModal(null)} />}

      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-100 px-8 py-6"
        style={{ background: "linear-gradient(135deg, #ffffff, #faf8ff)" }}>
        <div className="max-w-[1400px] mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg"
                style={{ background: "linear-gradient(135deg, #7B2FBE, #9333EA)" }}>
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-gray-900">Base de Conhecimento</h1>
                <p className="text-sm text-gray-400">Lições aprendidas de todos os projetos</p>
              </div>
            </div>

            {/* ── Register button ── */}
            <div className="relative">
              <button onClick={() => setRegisterOpen(!registerOpen)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all"
                style={{ background: "linear-gradient(135deg, #7B2FBE, #9333EA)" }}>
                <Plus className="w-4 h-4" />
                Registrar Lição
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${registerOpen ? "rotate-180" : ""}`} />
              </button>
              {registerOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-xl border border-gray-100 z-30 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-50">
                    <p className="text-xs font-bold text-gray-700">Selecione o projeto</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">Registre lições durante a reunião de encerramento</p>
                  </div>
                  <div className="max-h-64 overflow-y-auto py-1">
                    {projects.length === 0 ? (
                      <p className="text-xs text-gray-400 px-4 py-3">Nenhum projeto disponível</p>
                    ) : projects.map((p) => (
                      <Link key={p.id} href={`/projects/${p.id}/lessons`}
                        onClick={() => setRegisterOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-violet-50 transition-colors group">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-violet-50 group-hover:bg-violet-100 transition-colors">
                          <BookOpen className="w-3.5 h-3.5 text-violet-500" />
                        </div>
                        <span className="text-sm font-medium text-gray-700 truncate">{p.title}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {registerOpen && (
                <div className="fixed inset-0 z-20" onClick={() => setRegisterOpen(false)} />
              )}
            </div>
          </div>

          {/* ── KPI strip ── */}
          <div className="grid grid-cols-5 gap-4">
            {[
              { label: "Total de Lições",  value: stats.total, icon: BookOpen,      color: "#7B2FBE", bg: "rgba(123,47,190,0.07)" },
              { label: "Boas Práticas",    value: positive,    icon: TrendingUp,    color: "#059669", bg: "rgba(5,150,105,0.07)"  },
              { label: "Problemas",        value: negative,    icon: TrendingDown,  color: "#DC2626", bg: "rgba(220,38,38,0.07)"  },
              { label: "Neutras",          value: neutral,     icon: Minus,         color: "#6B7280", bg: "rgba(107,114,128,0.07)"},
              { label: "Projetos cobertos",value: new Set(lessons.map((l) => l.project.id)).size, icon: BarChart3, color: "#0284C7", bg: "rgba(2,132,199,0.07)" },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 shadow-sm">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: bg }}>
                  <Icon className="w-5 h-5" style={{ color }} />
                </div>
                <div>
                  <p className="text-2xl font-black text-gray-900">{value}</p>
                  <p className="text-[10px] text-gray-400 font-medium leading-tight">{label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="px-8 py-6 max-w-[1400px] mx-auto">
        <div className="grid grid-cols-[260px_1fr] gap-6 items-start">

          {/* ── Left sidebar: filters + insights ── */}
          <div className="flex flex-col gap-4 sticky top-6">

            {/* Filter panel */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3.5 border-b border-gray-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-violet-500" />
                  <span className="text-sm font-black text-gray-800">Filtros</span>
                </div>
                {hasFilters && (
                  <button onClick={clearFilters} className="text-[10px] font-bold text-red-500 hover:text-red-700 flex items-center gap-1">
                    <X className="w-3 h-3" /> Limpar
                  </button>
                )}
              </div>
              <div className="p-4 flex flex-col gap-3">

                {/* Project */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Projeto</label>
                  <div className="relative">
                    <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)}
                      className="w-full appearance-none border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 pr-7">
                      <option value="">Todos os projetos</option>
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                {/* Phase */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Fase</label>
                  <div className="relative">
                    <select value={filterPhase} onChange={(e) => setFilterPhase(e.target.value as any)}
                      className="w-full appearance-none border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 pr-7">
                      <option value="">Todas as fases</option>
                      {Object.entries(PHASE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                {/* Influence */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Influência</label>
                  <div className="flex flex-col gap-1.5">
                    {(["", "POSITIVE", "NEGATIVE", "NEUTRAL"] as const).map((v) => {
                      const active = filterInfluence === v
                      const cfg = v ? INFLUENCE_CFG[v] : null
                      return (
                        <button key={v} onClick={() => setFilterInfluence(v as any)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                            active ? "border-violet-300 bg-violet-50 text-violet-700" : "border-gray-100 hover:border-gray-200 text-gray-500"
                          }`}>
                          {cfg ? cfg.iconEl : <Minus className="w-3.5 h-3.5 text-gray-300" />}
                          {cfg ? cfg.label : "Todas"}
                          {cfg && <span className="ml-auto text-[9px] font-bold text-gray-400">
                            {lessons.filter((l) => l.influence === v).length}
                          </span>}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Impact */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Impacto</label>
                  <div className="relative">
                    <select value={filterImpact} onChange={(e) => setFilterImpact(e.target.value as any)}
                      className="w-full appearance-none border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 pr-7">
                      <option value="">Todos os impactos</option>
                      <option value="HIGH">Alto</option>
                      <option value="MEDIUM">Médio</option>
                      <option value="LOW">Baixo</option>
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                {/* Area */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Área</label>
                  <div className="relative">
                    <select value={filterArea} onChange={(e) => setFilterArea(e.target.value)}
                      className="w-full appearance-none border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 pr-7">
                      <option value="">Todas as áreas</option>
                      {allAreas.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>

            {/* Top areas */}
            {topAreas.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-3">Top Áreas</p>
                <div className="flex flex-col gap-2">
                  {topAreas.map(([area, count]) => (
                    <div key={area} className="flex items-center gap-2">
                      <p className="text-xs text-gray-700 font-medium flex-1 truncate">{area}</p>
                      <div className="w-20 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full rounded-full" style={{
                          width: `${(count / lessons.length) * 100}%`,
                          background: "linear-gradient(90deg, #7B2FBE, #9333EA)",
                        }} />
                      </div>
                      <span className="text-[10px] font-bold text-gray-400 w-4 text-right">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top tags */}
            {topTags.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <Tag className="w-3 h-3" /> Tags Frequentes
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {topTags.map(([tag, count]) => (
                    <button key={tag} onClick={() => setSearch(tag)}
                      className="px-2 py-0.5 rounded-lg bg-violet-50 text-violet-600 text-[10px] font-semibold border border-violet-100 hover:bg-violet-100 transition-colors">
                      {tag} <span className="opacity-60">{count}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Right: results ── */}
          <div className="flex flex-col gap-4">

            {/* Search + view toggle */}
            <div className="flex gap-3 items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar lições, ocorrências, áreas, projetos..."
                  className="w-full pl-10 pr-4 py-3 rounded-2xl border border-gray-200 bg-white text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-300 shadow-sm" />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="flex bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <button onClick={() => setView("grid")}
                  className={`p-2.5 transition-colors ${view === "grid" ? "bg-violet-50 text-violet-700" : "text-gray-400 hover:text-gray-600"}`}>
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button onClick={() => setView("list")}
                  className={`p-2.5 transition-colors ${view === "list" ? "bg-violet-50 text-violet-700" : "text-gray-400 hover:text-gray-600"}`}>
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Results count */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500 font-medium">
                {filtered.length === lessons.length
                  ? `${lessons.length} lições encontradas`
                  : `${filtered.length} de ${lessons.length} lições`}
              </p>
              {hasFilters && (
                <button onClick={clearFilters}
                  className="text-xs font-semibold text-violet-600 hover:text-violet-800 flex items-center gap-1">
                  <X className="w-3 h-3" /> Limpar filtros
                </button>
              )}
            </div>

            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-3xl border border-gray-100">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                  style={{ background: "linear-gradient(135deg, rgba(123,47,190,0.08), rgba(147,51,234,0.12))" }}>
                  <Lightbulb className="w-7 h-7 text-violet-400" />
                </div>
                <p className="text-base font-bold text-gray-700 mb-1">
                  {lessons.length === 0 ? "Base de conhecimento vazia" : "Nenhum resultado"}
                </p>
                <p className="text-sm text-gray-400 max-w-xs">
                  {lessons.length === 0
                    ? "Registre lições nos projetos durante as reuniões de encerramento"
                    : "Tente ajustar os filtros ou termos de busca"}
                </p>
                {lessons.length === 0 && (
                  <Link href="/projects"
                    className="mt-5 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white"
                    style={{ background: "linear-gradient(135deg, #7B2FBE, #9333EA)" }}>
                    Ir para Projetos
                  </Link>
                )}
              </div>
            ) : view === "grid" ? (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {filtered.map((l) => (
                  <LessonGridCard key={l.id} lesson={l} onClick={() => setModal(l)} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {filtered.map((l) => (
                  <LessonListRow key={l.id} lesson={l} onClick={() => setModal(l)} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
