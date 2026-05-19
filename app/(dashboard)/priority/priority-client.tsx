"use client"

import { useState, useCallback } from "react"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { savePriorities } from "@/lib/actions/priority"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  GripVertical, CheckCircle2, Loader2, Users, TrendingUp,
  Star, ChevronDown, ChevronUp, Save, ArrowUpDown,
  RefreshCw, Target, Info, AlertTriangle, BarChart3,
  Layers,
} from "lucide-react"
import Link from "next/link"

// ─── Types ────────────────────────────────────────────────────────────────────

type ProjectRow = {
  id: string
  title: string
  status: string
  priority: number | null
  priorityLabel: string | null
  priorityNotes: string | null
  priorityUpdatedAt: string | null
  sponsor: string
  expectedEnd: string | null
  economy: number | null
  teamSize: number
  tasksDone: number
  tasksTotal: number
  progress: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIORITY_LEVELS = [
  { label: "P1", name: "Crítico",  color: "#DC2626", bg: "#FEF2F2",  border: "#FECACA",  text: "text-red-700",   accent: "#EF4444" },
  { label: "P2", name: "Alto",     color: "#D97706", bg: "#FFFBEB",  border: "#FDE68A",  text: "text-amber-700", accent: "#F59E0B" },
  { label: "P3", name: "Médio",    color: "#2563EB", bg: "#EFF6FF",  border: "#BFDBFE",  text: "text-blue-700",  accent: "#3B82F6" },
  { label: "P4", name: "Baixo",    color: "#475569", bg: "#F8FAFC",  border: "#CBD5E1",  text: "text-slate-600", accent: "#64748B" },
]

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  PLANNING:    { label: "Planejamento", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  IN_PROGRESS: { label: "Em Andamento", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  PILOT:       { label: "Piloto",       cls: "bg-violet-50 text-violet-700 border-violet-200" },
  RAMP_UP:     { label: "Ramp-Up",      cls: "bg-amber-50 text-amber-700 border-amber-200" },
  GO_LIVE:     { label: "GO LIVE",      cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  POST_GOLIVE: { label: "Pós GO LIVE",  cls: "bg-green-50 text-green-700 border-green-200" },
}

function getLevelCfg(label: string | null) {
  return PRIORITY_LEVELS.find((l) => l.label === label) ?? null
}

// ─── Sortable Card ────────────────────────────────────────────────────────────

function SortableCard({
  project, rank, onLabelChange, onNotesChange,
}: {
  project: ProjectRow
  rank: number
  onLabelChange: (id: string, label: string) => void
  onNotesChange: (id: string, notes: string) => void
}) {
  const [notesOpen, setNotesOpen] = useState(false)
  const levelCfg = getLevelCfg(project.priorityLabel)
  const statusCfg = STATUS_CFG[project.status] ?? { label: project.status, cls: "bg-gray-100 text-gray-600 border-gray-200" }

  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: project.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 50 : "auto",
  }

  const progressColor = project.progress >= 70 ? "#059669" : project.progress >= 30 ? "#2563EB" : "#D97706"

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className="bg-white rounded-2xl overflow-hidden transition-all"
        style={{
          border: levelCfg ? `1px solid ${levelCfg.border}` : "1px solid #E5E7EB",
          boxShadow: isDragging
            ? "0 20px 60px rgba(0,0,0,0.15), 0 4px 16px rgba(0,0,0,0.08)"
            : "0 1px 4px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.04)",
        }}
      >
        {/* Priority color strip */}
        <div className="h-1" style={{
          background: levelCfg
            ? `linear-gradient(90deg, ${levelCfg.accent}, ${levelCfg.accent}44)`
            : "linear-gradient(90deg, #E5E7EB, transparent)",
        }} />

        <div className="flex items-center gap-3 px-4 py-3.5">

          {/* Drag handle */}
          <div
            {...attributes}
            {...listeners}
            className="flex items-center justify-center w-7 h-7 rounded-lg shrink-0 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-400 hover:bg-gray-50 transition-colors border border-gray-150"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </div>

          {/* Rank badge */}
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black shrink-0"
            style={{
              background: levelCfg?.bg ?? "#F9FAFB",
              color: levelCfg?.color ?? "#9CA3AF",
              border: `1.5px solid ${levelCfg?.border ?? "#E5E7EB"}`,
            }}
          >
            {rank}
          </div>

          {/* Title + meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-bold border ${statusCfg.cls}`}>
                {statusCfg.label}
              </span>
              {levelCfg && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold border"
                  style={{ background: levelCfg.bg, color: levelCfg.color, borderColor: levelCfg.border }}>
                  {levelCfg.label} · {levelCfg.name}
                </span>
              )}
            </div>
            <p className="text-sm font-bold text-gray-900 truncate leading-tight">{project.title}</p>
            <p className="text-[10px] text-gray-400 mt-0.5 truncate">
              {project.sponsor}
              {project.expectedEnd && ` · Prazo: ${format(new Date(project.expectedEnd), "MM/yyyy", { locale: ptBR })}`}
            </p>
          </div>

          {/* Progress bar */}
          <div className="shrink-0 w-24 hidden md:block">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold" style={{ color: progressColor }}>{project.progress}%</span>
              <span className="text-[9px] text-gray-400">{project.tasksDone}/{project.tasksTotal}</span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${project.progress}%`, background: `linear-gradient(90deg, ${progressColor}, ${progressColor}bb)` }} />
            </div>
          </div>

          {/* Team size */}
          <div className="shrink-0 hidden lg:flex items-center gap-1 text-gray-400">
            <Users className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">{project.teamSize}</span>
          </div>

          {/* Priority selector */}
          <div className="flex items-center gap-1 shrink-0">
            {PRIORITY_LEVELS.map((l) => {
              const active = project.priorityLabel === l.label
              return (
                <button key={l.label}
                  onClick={() => onLabelChange(project.id, active ? "" : l.label)}
                  title={`${l.label} — ${l.name}`}
                  className="w-8 h-8 rounded-lg text-[10px] font-black transition-all hover:scale-105 active:scale-95 border"
                  style={{
                    background: active ? l.bg : "#F9FAFB",
                    color: active ? l.color : "#D1D5DB",
                    borderColor: active ? l.border : "#E5E7EB",
                    boxShadow: active ? `0 0 0 2px ${l.border}` : "none",
                  }}>
                  {l.label}
                </button>
              )
            })}
          </div>

          {/* Notes toggle */}
          <button
            onClick={() => setNotesOpen((v) => !v)}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-gray-50 shrink-0 border"
            style={{
              borderColor: project.priorityNotes ? "#C4B5FD" : "#E5E7EB",
              color: project.priorityNotes ? "#7C3AED" : "#9CA3AF",
            }}>
            {notesOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Notes panel */}
        {notesOpen && (
          <div className="px-4 pb-4 pt-0">
            <div className="rounded-xl p-3 bg-gray-50 border border-gray-100">
              <label className="text-[9px] font-bold uppercase tracking-widest block mb-1.5 text-gray-400">
                Justificativa / Notas de Prioridade
              </label>
              <textarea
                value={project.priorityNotes ?? ""}
                onChange={(e) => onNotesChange(project.id, e.target.value)}
                placeholder="Por que este projeto tem esta prioridade? Contexto para a equipe…"
                rows={2}
                className="w-full text-sm rounded-lg px-3 py-2 outline-none resize-none bg-white border border-gray-200 text-gray-700 placeholder-gray-300 focus:ring-2 focus:ring-violet-200 focus:border-violet-400 transition-all"
              />
              {project.priorityUpdatedAt && (
                <p className="text-[9px] mt-1.5 text-gray-400">
                  Última atualização: {format(new Date(project.priorityUpdatedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PriorityClient({ projects: initial }: { projects: ProjectRow[] }) {
  const [items, setItems]     = useState<ProjectRow[]>(initial)
  const [saving, setSaving]   = useState(false)
  const [saved,  setSaved]    = useState(false)
  const [dirty,  setDirty]    = useState(false)
  const [error,  setError]    = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setItems((prev) => {
        const oldIdx = prev.findIndex((p) => p.id === active.id)
        const newIdx = prev.findIndex((p) => p.id === over.id)
        return arrayMove(prev, oldIdx, newIdx)
      })
      setDirty(true)
      setSaved(false)
    }
  }

  const handleLabelChange = useCallback((id: string, label: string) => {
    setItems((prev) => prev.map((p) => p.id === id ? { ...p, priorityLabel: label || null } : p))
    setDirty(true)
    setSaved(false)
  }, [])

  const handleNotesChange = useCallback((id: string, notes: string) => {
    setItems((prev) => prev.map((p) => p.id === id ? { ...p, priorityNotes: notes || null } : p))
    setDirty(true)
    setSaved(false)
  }, [])

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await savePriorities(
        items.map((p, idx) => ({
          id:            p.id,
          priority:      idx + 1,
          priorityLabel: p.priorityLabel ?? "",
          priorityNotes: p.priorityNotes ?? "",
        }))
      )
      setSaved(true)
      setDirty(false)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.")
    } finally {
      setSaving(false)
    }
  }

  const counts = PRIORITY_LEVELS.map((l) => ({
    ...l,
    count: items.filter((p) => p.priorityLabel === l.label).length,
  }))

  const avgProgress = Math.round(items.reduce((s, p) => s + p.progress, 0) / Math.max(items.length, 1))
  const classified  = items.filter((p) => p.priorityLabel).length

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "#F7F6F2" }}>

      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-100 px-8 py-5 sticky top-0 z-30"
        style={{ background: "linear-gradient(135deg, #ffffff, #faf8ff)" }}>
        <div className="max-w-5xl mx-auto flex items-center justify-between">

          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg"
              style={{ background: "linear-gradient(135deg, #7B2FBE, #9333EA)" }}>
              <Star className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">PORTFÓLIO</p>
              <h1 className="text-xl font-black text-gray-900 leading-tight">Priorização de Projetos</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Priority pills */}
            <div className="hidden md:flex items-center gap-2">
              {counts.map((l) => l.count > 0 && (
                <span key={l.label}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border"
                  style={{ background: l.bg, color: l.color, borderColor: l.border }}>
                  {l.label} · {l.count}
                </span>
              ))}
            </div>

            {error && (
              <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-red-50 text-red-600 border border-red-200">
                {error}
              </span>
            )}

            {saved && !dirty && (
              <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5" /> Salvo
              </span>
            )}

            <button onClick={handleSave} disabled={saving || !dirty}
              className="flex items-center gap-2 px-5 h-9 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40 shadow-md"
              style={{ background: dirty ? "linear-gradient(135deg, #7B2FBE, #9333EA)" : "#E5E7EB", color: dirty ? "white" : "#9CA3AF", boxShadow: dirty ? "0 4px 16px rgba(123,47,190,0.30)" : "none" }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {dirty ? "Salvar Prioridades" : "Sem alterações"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="max-w-5xl mx-auto px-8 py-6">

        {/* ── KPI strip ── */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total de Projetos", value: items.length,    icon: Target,     color: "#7B2FBE", bg: "rgba(123,47,190,0.08)" },
            { label: "Classificados",     value: classified,       icon: Star,       color: "#059669", bg: "rgba(5,150,105,0.08)"  },
            { label: "Sem Prioridade",    value: items.length - classified, icon: AlertTriangle, color: "#D97706", bg: "rgba(217,119,6,0.08)" },
            { label: "Progresso Médio",   value: `${avgProgress}%`, icon: BarChart3, color: "#2563EB", bg: "rgba(37,99,235,0.08)"  },
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

        {/* ── Instructions banner ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6 flex items-start gap-4">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, rgba(123,47,190,0.10), rgba(147,51,234,0.15))" }}>
            <ArrowUpDown className="w-4 h-4 text-violet-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-gray-800">Arraste para reordenar · Clique em P1–P4 para classificar</p>
            <p className="text-xs mt-0.5 text-gray-400 leading-relaxed">
              A ordem define a prioridade de acompanhamento do portfólio. Use P1 (Crítico), P2 (Alto), P3 (Médio) e P4 (Baixo) para classificar cada projeto. Adicione uma nota de justificativa clicando na seta de cada card.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {PRIORITY_LEVELS.map((l) => (
              <div key={l.label} className="text-center">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black mb-1 border"
                  style={{ background: l.bg, color: l.color, borderColor: l.border }}>
                  {l.label}
                </div>
                <p className="text-[8px] font-semibold text-gray-400">{l.name}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Priority groups ── */}
        {items.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
            <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, rgba(123,47,190,0.08), rgba(147,51,234,0.12))" }}>
              <RefreshCw className="w-6 h-6 text-violet-400" />
            </div>
            <p className="text-base font-bold text-gray-700 mb-1">Nenhum projeto ativo encontrado</p>
            <p className="text-sm text-gray-400 mb-4">Crie projetos para começar a priorizar o portfólio</p>
            <Link href="/projects"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white"
              style={{ background: "linear-gradient(135deg, #7B2FBE, #9333EA)" }}>
              Ver projetos →
            </Link>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2.5">
                {items.map((project, idx) => (
                  <SortableCard
                    key={project.id}
                    project={project}
                    rank={idx + 1}
                    onLabelChange={handleLabelChange}
                    onNotesChange={handleNotesChange}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        <div className="h-8" />
      </div>
    </div>
  )
}
