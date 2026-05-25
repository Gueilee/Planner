"use client"

import { useState, useTransition, useEffect, useRef } from "react"
import {
  DndContext, DragOverlay, closestCorners,
  PointerSensor, useSensor, useSensors,
  useDroppable, useDraggable,
  type DragStartEvent, type DragEndEvent, type DragOverEvent,
} from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  X, LayoutGrid, List, Loader2, ExternalLink,
  Clock, Layers, CheckCircle2, PauseCircle, ClipboardCheck,
  ChevronRight, TrendingUp, AlertTriangle, Users,
  Play, Pause, Send, Paperclip,
} from "lucide-react"
import Link from "next/link"
import { WorkingDayPicker } from "@/components/working-day-picker"
import {
  getProjectTasksForKanban, updateTaskStatusKanban,
  getTaskDetail, updateTaskKanban, addTaskComment,
} from "@/lib/actions/kanban"
import { todayStr } from "@/lib/date-utils"
import { TaskStatus } from "@/lib/generated/prisma/enums"
import type { KanbanProject } from "./kanban-client"

// ─── Types ────────────────────────────────────────────────────────────────────

export type TaskItem = {
  id:          string
  title:       string
  status:      string
  progress:    number
  startDate:   string | null
  endDate:     string | null
  wbsArea:     { name: string; color: string | null } | null
  responsible: { id: string; name: string } | null
  parentId:    string | null
  childCount:  number
}

// ─── Column Config ────────────────────────────────────────────────────────────

const TASK_COLS = [
  { id: "PLANNING",    label: "A Fazer",       color: "#64748B", glow: "rgba(100,116,139,0.25)", gradient: "linear-gradient(135deg,#64748B,#94A3B8)", icon: Clock },
  { id: "IN_PROGRESS", label: "Em Andamento",  color: "#2463FF", glow: "rgba(36,99,255,0.25)",   gradient: "linear-gradient(135deg,#2463FF,#60A5FA)", icon: Layers },
  { id: "DELAYED",     label: "Atrasada",      color: "#EF4444", glow: "rgba(239,68,68,0.25)",   gradient: "linear-gradient(135deg,#EF4444,#F87171)", icon: AlertTriangle },
  { id: "VALIDATION",  label: "Em Validação",  color: "#8B5CF6", glow: "rgba(139,92,246,0.25)",  gradient: "linear-gradient(135deg,#8B5CF6,#C4B5FD)", icon: ClipboardCheck },
  { id: "COMPLETED",   label: "Concluída",     color: "#059669", glow: "rgba(5,150,105,0.25)",   gradient: "linear-gradient(135deg,#059669,#34D399)", icon: CheckCircle2 },
  { id: "ON_HOLD",     label: "Pausada",       color: "#F59E0B", glow: "rgba(245,158,11,0.25)",  gradient: "linear-gradient(135deg,#D97706,#F59E0B)", icon: PauseCircle },
] as const

type ColId = typeof TASK_COLS[number]["id"]
const COL_BY_ID = Object.fromEntries(TASK_COLS.map((c) => [c.id, c])) as Record<string, typeof TASK_COLS[number]>

// Statuses not in TASK_COLS → map to nearest column
const STATUS_REMAP: Record<string, string> = { INITIATIVE: "PLANNING" }
function resolveColId(status: string): string {
  return STATUS_REMAP[status] ?? status
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
}
function memberColor(name: string) {
  const hue = (name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) * 37) % 360
  return `hsl(${hue},55%,42%)`
}
function calcProgress(tasks: TaskItem[]) {
  if (!tasks.length) return 0
  return Math.round(tasks.reduce((s, t) => s + t.progress, 0) / tasks.length)
}

// ─── Task Card ────────────────────────────────────────────────────────────────

function TaskCard({
  task,
  isDragOverlay = false,
  onCardClick,
}: {
  task: TaskItem
  isDragOverlay?: boolean
  onCardClick?: () => void
}) {
  const col = COL_BY_ID[resolveColId(task.status)] ?? TASK_COLS[0]
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id:       task.id,
    data:     { status: task.status },
    disabled: isDragOverlay,
  })

  const isDelayed = task.endDate && new Date(task.endDate) < new Date() && task.status !== "COMPLETED"

  const cardBg     = isDelayed ? "#fff8f8" : "#ffffff"
  const cardBorder = isDragOverlay
    ? `1px solid ${col.color}40`
    : isDelayed
      ? "1px solid rgba(239,68,68,0.22)"
      : "1px solid rgba(15,23,42,0.07)"

  return (
    <div
      ref={isDragOverlay ? undefined : setNodeRef}
      style={{
        transform:  isDragOverlay ? undefined : CSS.Translate.toString(transform),
        opacity:    isDragging && !isDragOverlay ? 0.35 : 1,
        cursor:     isDragOverlay ? "grabbing" : "grab",
        transition: isDragging ? "none" : "opacity 0.15s",
      }}
      {...(!isDragOverlay ? attributes : {})}
      {...(!isDragOverlay ? listeners : {})}
      className={isDragOverlay ? "rotate-2 scale-105" : ""}
    >
      <div
        className="select-none rounded-xl overflow-hidden group/card"
        onClick={onCardClick}
        style={{
          background: cardBg,
          border:     cardBorder,
          boxShadow:  isDragOverlay
            ? `0 20px 48px rgba(0,0,0,0.18), 0 0 0 2px ${col.color}35`
            : "0 1px 3px rgba(15,23,42,0.05)",
          transition: "transform 0.15s, box-shadow 0.15s",
        }}
        onMouseEnter={(e) => {
          if (!isDragOverlay) {
            const el = e.currentTarget as HTMLElement
            el.style.transform = "translateY(-1px)"
            el.style.boxShadow = `0 6px 20px rgba(15,23,42,0.10), 0 0 0 1px ${col.color}25`
          }
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLElement
          el.style.transform = ""
          el.style.boxShadow = "0 1px 3px rgba(15,23,42,0.05)"
        }}
      >
        {/* Color strip — WBS color or column color */}
        <div
          className="h-[3px]"
          style={{ background: task.wbsArea?.color ?? col.gradient }}
        />

        <div className="p-3">
          {/* WBS area badge */}
          {task.wbsArea && (
            <div className="flex items-center gap-1.5 mb-2">
              <div
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: task.wbsArea.color ?? col.color }}
              />
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 truncate">
                {task.wbsArea.name}
              </span>
            </div>
          )}

          {/* Title */}
          <p className="text-[12.5px] font-bold text-slate-800 leading-snug mb-2.5 line-clamp-2">
            {task.title}
          </p>

          {/* Progress */}
          <div className="mb-2.5">
            <div className="flex justify-between text-[9px] mb-1">
              <span className="text-slate-400">Progresso</span>
              <span className="font-black" style={{ color: col.color }}>{task.progress}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${task.progress}%`, background: col.gradient }}
              />
            </div>
          </div>

          {/* Bottom row */}
          <div className="flex items-center justify-between">
            {task.responsible ? (
              <div className="flex items-center gap-1.5">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-black text-white shrink-0"
                  style={{ background: memberColor(task.responsible.name) }}
                >
                  {initials(task.responsible.name)}
                </div>
                <span className="text-[10px] text-slate-400 truncate max-w-[90px]">
                  {task.responsible.name.split(" ")[0]}
                </span>
              </div>
            ) : (
              <span className="text-[10px] text-slate-300">—</span>
            )}

            {task.endDate && (
              <span
                className="text-[9px] font-bold"
                style={{ color: isDelayed ? "#DC2626" : "#94A3B8" }}
              >
                {format(new Date(task.endDate), "dd/MM", { locale: ptBR })}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Task Column ──────────────────────────────────────────────────────────────

function TaskColumn({
  col,
  tasks,
  isOver,
  onTaskClick,
}: {
  col: typeof TASK_COLS[number]
  tasks: TaskItem[]
  isOver: boolean
  onTaskClick: (t: TaskItem) => void
}) {
  const { setNodeRef } = useDroppable({ id: col.id })
  const Icon = col.icon

  return (
    <div
      className="flex flex-col rounded-xl overflow-hidden shrink-0"
      style={{
        width:      "210px",
        background: isOver ? `${col.color}08` : "#F8FAFC",
        border:     `1.5px solid ${isOver ? col.color + "50" : "rgba(15,23,42,0.07)"}`,
        boxShadow:  isOver ? `0 0 0 3px ${col.color}18` : "0 1px 4px rgba(15,23,42,0.04)",
        transition: "border-color 0.2s, box-shadow 0.2s, background 0.2s",
      }}
    >
      {/* Header */}
      <div style={{ borderBottom: `1.5px solid ${isOver ? col.color + "20" : "rgba(15,23,42,0.06)"}` }}>
        <div className="h-[3px]" style={{ background: col.gradient }} />
        <div
          className="flex items-center gap-2 px-3 py-2.5"
          style={{ background: isOver ? `${col.color}06` : "rgba(255,255,255,0.80)" }}
        >
          <div
            className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: `${col.color}12` }}
          >
            <Icon className="w-3 h-3" style={{ color: col.color }} />
          </div>
          <span className="text-[11px] font-bold flex-1 truncate" style={{ color: "#1E293B" }}>
            {col.label}
          </span>
          <span
            className="text-[10px] font-black px-1.5 py-0.5 rounded-full shrink-0"
            style={{ background: `${col.color}15`, color: col.color }}
          >
            {tasks.length}
          </span>
        </div>
      </div>

      {/* Cards */}
      <div
        ref={setNodeRef}
        className="flex-1 overflow-y-auto p-2.5 space-y-2"
        style={{ scrollbarWidth: "thin", scrollbarColor: `${col.color}20 transparent` }}
      >
        {tasks.map((t) => <TaskCard key={t.id} task={t} onCardClick={() => onTaskClick(t)} />)}
        {tasks.length === 0 && (
          <div
            className="flex items-center justify-center py-8 rounded-xl"
            style={{ border: `2px dashed ${col.color}20`, background: `${col.color}04` }}
          >
            <p className="text-[10px] font-semibold text-slate-400">Arraste aqui</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── List View ────────────────────────────────────────────────────────────────

function TaskListView({ tasks, onTaskClick }: { tasks: TaskItem[]; onTaskClick: (t: TaskItem) => void }) {
  const byWbs: Record<string, { label: string; color: string | null; items: TaskItem[] }> = {}

  for (const t of tasks) {
    const key   = t.wbsArea?.name ?? "__sem_area"
    const label = t.wbsArea?.name ?? "Sem Área WBS"
    const color = t.wbsArea?.color ?? null
    if (!byWbs[key]) byWbs[key] = { label, color, items: [] }
    byWbs[key].items.push(t)
  }

  const groups = Object.values(byWbs)

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-300 py-20">
        <Layers className="w-10 h-10 mb-3 opacity-40" />
        <p className="text-sm font-semibold">Nenhuma atividade cadastrada</p>
        <p className="text-xs mt-1">Acesse o projeto para adicionar tarefas</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5" style={{ scrollbarWidth: "thin" }}>
      {groups.map(({ label, color, items }) => (
        <div key={label}>
          {/* Group header */}
          <div className="flex items-center gap-3 mb-2">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ background: color ?? "#94A3B8" }} />
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: color ?? "#94A3B8" }}>
              {label}
            </span>
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: `${color ?? "#94A3B8"}15`, color: color ?? "#94A3B8" }}
            >
              {items.length}
            </span>
            <div className="flex-1 h-px" style={{ background: `${color ?? "#94A3B8"}20` }} />
          </div>

          {/* Task rows */}
          <div
            className="rounded-xl overflow-hidden bg-white"
            style={{ border: "1px solid rgba(15,23,42,0.07)", boxShadow: "0 1px 4px rgba(15,23,42,0.04)" }}
          >
            {items.map((t, i) => {
              const col       = COL_BY_ID[resolveColId(t.status)] ?? TASK_COLS[0]
              const isDelayed = t.endDate && new Date(t.endDate) < new Date() && t.status !== "COMPLETED"
              return (
                <div
                  key={t.id}
                  onClick={() => onTaskClick(t)}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer"
                  style={{ borderBottom: i < items.length - 1 ? "1px solid rgba(15,23,42,0.05)" : "none" }}
                >
                  {/* Status dot */}
                  <div className="w-1 h-8 rounded-full shrink-0" style={{ background: col.gradient }} />

                  {/* Title */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{t.title}</p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {t.responsible?.name ?? "Sem responsável"}
                    </p>
                  </div>

                  {/* Status badge */}
                  <span
                    className="text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 hidden md:inline"
                    style={{ background: `${col.color}12`, color: col.color }}
                  >
                    {col.label}
                  </span>

                  {/* Progress */}
                  <div className="w-24 shrink-0 hidden sm:block">
                    <div className="flex justify-between text-[9px] mb-1">
                      <span className="text-slate-400">{t.progress}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${t.progress}%`, background: col.gradient }} />
                    </div>
                  </div>

                  {/* Date */}
                  {t.endDate ? (
                    <span
                      className="text-[10px] font-semibold w-14 text-right shrink-0 hidden lg:block"
                      style={{ color: isDelayed ? "#DC2626" : "#94A3B8" }}
                    >
                      {format(new Date(t.endDate), "dd/MM", { locale: ptBR })}
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-300 w-14 text-right shrink-0 hidden lg:block">—</span>
                  )}

                  <ChevronRight className="w-4 h-4 text-slate-200 shrink-0" />
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Task Detail Panel ────────────────────────────────────────────────────────

type TaskDetailData = Awaited<ReturnType<typeof getTaskDetail>>

function TaskDetailPanel({
  task: initTask,
  projectId,
  onClose,
  onUpdated,
}: {
  task: TaskItem
  projectId: string
  onClose: () => void
  onUpdated: (updates: Partial<TaskItem>) => void
}) {
  const [detail,       setDetail]       = useState<TaskDetailData>(null)
  const [loadingDetail, setLoadingDetail] = useState(true)
  const [localProgress, setLocalProgress] = useState(initTask.progress)
  const [localStatus,  setLocalStatus]  = useState(initTask.status)
  const [actualStart,  setActualStart]  = useState("")
  const [actualEnd,    setActualEnd]    = useState("")
  const [commentText,  setCommentText]  = useState("")
  const [submitting,   setSubmitting]   = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [, start] = useTransition()

  useEffect(() => {
    setLoadingDetail(true)
    getTaskDetail(initTask.id).then((d) => {
      setDetail(d)
      if (d) {
        setLocalProgress(d.progress)
        setLocalStatus(d.status)
        setActualStart(d.actualStart?.slice(0, 10) ?? "")
        setActualEnd(d.actualEnd?.slice(0, 10) ?? "")
      }
      setLoadingDetail(false)
    })
  }, [initTask.id])

  const col    = COL_BY_ID[resolveColId(localStatus)] ?? TASK_COLS[0]
  const canPlay = localStatus !== "IN_PROGRESS" && localStatus !== "COMPLETED"

  function handlePlayPause() {
    const newStatus   = canPlay ? "IN_PROGRESS" : "ON_HOLD"
    const newStart    = canPlay && !actualStart ? todayStr() : undefined
    setSaving(true)
    setLocalStatus(newStatus)
    if (newStart) setActualStart(newStart)
    start(async () => {
      await updateTaskKanban(initTask.id, projectId, {
        status: newStatus,
        ...(newStart && { actualStart: newStart }),
      })
      onUpdated({ status: newStatus })
      setSaving(false)
    })
  }

  function handleProgressBlur() {
    if (localProgress === initTask.progress) return
    start(async () => {
      await updateTaskKanban(initTask.id, projectId, { progress: localProgress })
      onUpdated({ progress: localProgress })
    })
  }

  function handleActualStartChange(v: string) {
    setActualStart(v)
    start(async () => { await updateTaskKanban(initTask.id, projectId, { actualStart: v || null }) })
  }

  function handleActualEndChange(v: string) {
    setActualEnd(v)
    start(async () => { await updateTaskKanban(initTask.id, projectId, { actualEnd: v || null }) })
  }

  async function handleSubmitComment() {
    if (!commentText.trim() || submitting) return
    setSubmitting(true)
    try {
      const newComment = await addTaskComment(initTask.id, projectId, commentText.trim())
      setDetail((d) => d ? { ...d, comments: [...d.comments, newComment] } : d)
      setCommentText("")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />

      <div
        className="fixed right-4 top-4 bottom-4 z-[60] flex flex-col overflow-hidden"
        style={{
          width:        420,
          borderRadius: 20,
          background:   "#ffffff",
          boxShadow:    "0 32px 80px rgba(0,0,0,0.28), 0 0 0 1px rgba(15,23,42,0.10)",
          animation:    "slideInRight 0.25s cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        {/* top gradient bar */}
        <div className="h-1 shrink-0" style={{ background: col.gradient }} />

        {/* header */}
        <div className="px-5 pt-4 pb-4 shrink-0" style={{ borderBottom: "1px solid rgba(15,23,42,0.07)" }}>
          {initTask.wbsArea && (
            <div className="flex items-center gap-1.5 mb-1.5">
              <div
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: initTask.wbsArea.color ?? col.color }}
              />
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                {initTask.wbsArea.name}
              </span>
            </div>
          )}
          <div className="flex items-start gap-3">
            <p className="flex-1 text-sm font-bold text-slate-800 leading-snug">{initTask.title}</p>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 hover:bg-slate-100 transition-colors"
              style={{ border: "1px solid rgba(15,23,42,0.09)", color: "#94A3B8" }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 mt-3">
            <span
              className="text-[9px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: `${col.color}12`, color: col.color }}
            >
              {col.label}
            </span>
            <button
              onClick={handlePlayPause}
              disabled={saving}
              className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full transition-all hover:opacity-80 disabled:opacity-50"
              style={{
                background: canPlay ? "rgba(36,99,255,0.10)" : "rgba(245,158,11,0.10)",
                color:      canPlay ? "#2463FF" : "#D97706",
              }}
            >
              {canPlay
                ? <Play  className="w-3 h-3 fill-current" />
                : <Pause className="w-3 h-3 fill-current" />}
              {canPlay ? "Iniciar" : "Pausar"}
            </button>
            {saving && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
          </div>
        </div>

        {/* body */}
        <div
          className="flex-1 overflow-y-auto p-5 space-y-5"
          style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(0,0,0,0.06) transparent" }}
        >
          {/* Progress */}
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">Progresso</p>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${localProgress}%`, background: col.gradient }}
                />
              </div>
              <div className="flex items-center gap-0.5">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={localProgress}
                  onChange={(e) => setLocalProgress(Math.min(100, Math.max(0, Number(e.target.value))))}
                  onBlur={handleProgressBlur}
                  className="w-10 text-right text-sm font-black outline-none border-b-2 border-transparent focus:border-[#7B2FBE]"
                  style={{ color: col.color }}
                />
                <span className="text-sm font-bold text-slate-400">%</span>
              </div>
            </div>
          </div>

          {/* Actual dates */}
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">Execução Real</p>
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: "1px solid rgba(15,23,42,0.07)" }}
            >
              <div
                className="flex items-center px-4 py-2.5"
                style={{ borderBottom: "1px solid rgba(15,23,42,0.05)" }}
              >
                <span className="text-xs text-slate-400 w-28 shrink-0">Início real</span>
                {loadingDetail
                  ? <div className="h-3 w-20 bg-slate-100 rounded animate-pulse" />
                  : <WorkingDayPicker value={actualStart} onChange={handleActualStartChange} compact placeholder="Selecionar" />}
              </div>
              <div className="flex items-center px-4 py-2.5">
                <span className="text-xs text-slate-400 w-28 shrink-0">Término real</span>
                {loadingDetail
                  ? <div className="h-3 w-20 bg-slate-100 rounded animate-pulse" />
                  : <WorkingDayPicker value={actualEnd} onChange={handleActualEndChange} compact placeholder="Selecionar" />}
              </div>
            </div>
          </div>

          {/* Comments */}
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">
              Comentários{detail?.comments.length ? ` (${detail.comments.length})` : ""}
            </p>

            {loadingDetail ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
              </div>
            ) : (
              <div className="space-y-2 mb-3">
                {detail?.comments.length === 0 && (
                  <p className="text-[11px] text-slate-300 text-center py-3">Nenhum comentário ainda</p>
                )}
                {detail?.comments.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-xl p-3"
                    style={{ background: "#F8FAFC", border: "1px solid rgba(15,23,42,0.06)" }}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-black text-white shrink-0"
                        style={{ background: memberColor(c.user.name) }}
                      >
                        {initials(c.user.name)}
                      </div>
                      <span className="text-[10px] font-bold text-slate-600">{c.user.name.split(" ")[0]}</span>
                      <span className="text-[9px] text-slate-400 ml-auto">
                        {format(new Date(c.createdAt), "dd/MM HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{c.content}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Comment input */}
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: "1.5px solid rgba(15,23,42,0.09)" }}
            >
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault()
                    handleSubmitComment()
                  }
                }}
                placeholder="Adicionar comentário… (Ctrl+Enter para enviar)"
                rows={2}
                className="w-full resize-none text-xs text-slate-700 px-3 pt-2.5 pb-1 outline-none placeholder:text-slate-300 bg-transparent"
              />
              <div className="flex justify-end px-3 pb-2.5">
                <button
                  onClick={handleSubmitComment}
                  disabled={!commentText.trim() || submitting}
                  className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all disabled:opacity-40"
                  style={{
                    background: commentText.trim() ? "linear-gradient(135deg,#7B2FBE,#2463FF)" : "#F1F5F9",
                    color:      commentText.trim() ? "white" : "#94A3B8",
                  }}
                >
                  {submitting
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <Send className="w-3 h-3" />}
                  Enviar
                </button>
              </div>
            </div>
          </div>

          {/* Attachments */}
          {!loadingDetail && detail?.attachments && detail.attachments.length > 0 && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                Anexos ({detail.attachments.length})
              </p>
              <div className="space-y-2">
                {detail.attachments.map((a) => (
                  <a
                    key={a.id}
                    href={a.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors"
                    style={{ border: "1px solid rgba(15,23,42,0.07)" }}
                  >
                    <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="text-xs text-slate-600 flex-1 truncate">{a.fileName}</span>
                    <ExternalLink className="w-3 h-3 text-slate-300 shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </>
  )
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export function ProjectTasksKanban({
  project,
  onClose,
}: {
  project: KanbanProject
  onClose: () => void
}) {
  const [tasks,        setTasks]        = useState<TaskItem[]>([])
  const [loading,      setLoading]      = useState(true)
  const [view,         setView]         = useState<"kanban" | "list">("kanban")
  const [activeId,     setActiveId]     = useState<string | null>(null)
  const [overId,       setOverId]       = useState<string | null>(null)
  const [saving,       setSaving]       = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null)
  const [, startTransition] = useTransition()
  const prevStatuses = useRef<Record<string, string>>({})

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  useEffect(() => {
    setLoading(true)
    getProjectTasksForKanban(project.id).then((data) => {
      setTasks(data)
      setLoading(false)
    })
  }, [project.id])

  // Only show tasks with no children (leaf tasks).
  // Parents that have children are managed implicitly — when all children complete,
  // the parent is auto-completed server-side.
  const visibleTasks = tasks.filter((t) => t.childCount === 0)

  const activeTask = activeId ? visibleTasks.find((t) => t.id === activeId) ?? null : null

  function handleDragStart(e: DragStartEvent) {
    const id = e.active.id as string
    setActiveId(id)
    prevStatuses.current[id] = visibleTasks.find((t) => t.id === id)?.status ?? ""
  }

  function handleDragOver(e: DragOverEvent) {
    setOverId((e.over?.id as string) ?? null)
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    setActiveId(null)
    setOverId(null)
    if (!over) return

    const taskId    = active.id as string
    const colId     = over.id as ColId
    const targetCol = COL_BY_ID[colId]
    if (!targetCol) return

    const newStatus = targetCol.id as TaskStatus
    const prev      = prevStatuses.current[taskId]
    if (prev === newStatus) return

    setTasks((ts) =>
      ts.map((t) =>
        t.id === taskId
          ? { ...t, status: newStatus, progress: newStatus === "COMPLETED" ? 100 : t.progress }
          : t,
      ),
    )
    setSaving(taskId)

    startTransition(async () => {
      try {
        await updateTaskStatusKanban(taskId, newStatus)
      } catch {
        setTasks((ts) => ts.map((t) => t.id === taskId ? { ...t, status: prev } : t))
      } finally {
        setSaving(null)
      }
    })
  }

  const progress = calcProgress(visibleTasks)
  const done     = visibleTasks.filter((t) => t.status === "COMPLETED").length

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50"
        style={{ background: "rgba(7,3,26,0.72)", backdropFilter: "blur(6px)" }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="fixed inset-4 z-50 flex flex-col rounded-2xl overflow-hidden"
        style={{
          background: "#F1F5F9",
          boxShadow:  "0 32px 80px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.08)",
          animation:  "modalIn 0.28s cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        {/* ── Header ── */}
        <div
          className="shrink-0 bg-white"
          style={{ borderBottom: "1.5px solid rgba(15,23,42,0.07)", boxShadow: "0 1px 6px rgba(15,23,42,0.05)" }}
        >
          {/* Gradient top */}
          <div
            className="h-1"
            style={{ background: "linear-gradient(90deg,#00C4E0,#2463FF,#8B2FFF)" }}
          />

          <div className="flex items-center gap-4 px-5 py-3.5">
            {/* Project info */}
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">
                Atividades do Projeto
              </p>
              <h2 className="text-base font-black text-slate-900 truncate">{project.title}</h2>
            </div>

            {/* Progress summary */}
            <div className="hidden sm:flex items-center gap-4 shrink-0">
              <div className="text-center">
                <p className="text-xl font-black text-slate-900">{progress}%</p>
                <p className="text-[9px] text-slate-400 font-medium">concluído</p>
              </div>
              <div className="w-32">
                <div className="flex justify-between text-[9px] mb-1.5">
                  <span className="text-slate-400">{done}/{visibleTasks.length} tarefas</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${progress}%`, background: "linear-gradient(90deg,#2463FF,#8B2FFF)" }}
                  />
                </div>
              </div>
              {saving && (
                <span
                  className="flex items-center gap-1.5 text-[10px] font-semibold px-3 h-7 rounded-full"
                  style={{ background: "rgba(36,99,255,0.08)", color: "#2463FF" }}
                >
                  <Loader2 className="w-3 h-3 animate-spin" /> Salvando…
                </span>
              )}
            </div>

            {/* View toggle */}
            <div
              className="flex items-center p-0.5 rounded-xl shrink-0"
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

            {/* Actions */}
            <Link
              href={`/projects/${project.id}`}
              onClick={onClose}
              className="hidden sm:inline-flex items-center gap-2 px-4 h-9 text-xs font-bold rounded-xl text-white transition-all hover:opacity-90 shrink-0"
              style={{
                background: "linear-gradient(135deg,#2463FF,#8B2FFF)",
                boxShadow:  "0 4px 16px rgba(36,99,255,0.30)",
              }}
            >
              Abrir Projeto
              <ExternalLink className="w-3 h-3" />
            </Link>

            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all hover:bg-slate-100"
              style={{ border: "1px solid rgba(15,23,42,0.09)", color: "#94A3B8" }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Stats bar */}
          <div
            className="flex items-center gap-2 px-5 py-2 overflow-x-auto"
            style={{ borderTop: "1px solid rgba(15,23,42,0.05)", scrollbarWidth: "none" }}
          >
            {TASK_COLS.map((col) => {
              const count = visibleTasks.filter((t) => resolveColId(t.status) === col.id).length
              return (
                <div
                  key={col.id}
                  className="flex items-center gap-1.5 px-2.5 h-6 rounded-full text-[10px] font-bold shrink-0"
                  style={{ background: `${col.color}10`, color: col.color }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: col.color }} />
                  {col.label}: {count}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Body ── */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#7B2FBE" }} />
              <p className="text-sm font-semibold text-slate-400">Carregando atividades…</p>
            </div>
          </div>
        ) : view === "list" ? (
          <TaskListView tasks={visibleTasks} onTaskClick={setSelectedTask} />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div
              className="flex-1 overflow-x-auto"
              style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(15,23,42,0.12) transparent" }}
            >
              <div className="flex gap-3 p-4 h-full" style={{ minWidth: "max-content", minHeight: "100%" }}>
                {TASK_COLS.map((col) => (
                  <TaskColumn
                    key={col.id}
                    col={col}
                    tasks={visibleTasks.filter((t) => resolveColId(t.status) === col.id)}
                    isOver={overId === col.id}
                    onTaskClick={setSelectedTask}
                  />
                ))}
              </div>
            </div>

            <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.22,1,0.36,1)" }}>
              {activeTask && <TaskCard task={activeTask} isDragOverlay />}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      <style>{`
        @keyframes modalIn {
          from { transform: scale(0.96) translateY(8px); opacity: 0; }
          to   { transform: scale(1)    translateY(0);   opacity: 1; }
        }
      `}</style>

      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          projectId={project.id}
          onClose={() => setSelectedTask(null)}
          onUpdated={(updates) => {
            setTasks((ts) => ts.map((t) => t.id === selectedTask.id ? { ...t, ...updates } : t))
            setSelectedTask((t) => t ? { ...t, ...updates } : null)
          }}
        />
      )}
    </>
  )
}
