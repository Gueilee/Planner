"use client"

import { useState, useMemo, useRef } from "react"
import { saveCheckpoint, type CheckpointFrequency, type TaskAttachmentInput } from "@/lib/actions/checkpoint"
import { updateTask as updateScheduleTask } from "@/lib/actions/schedule"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  ArrowLeft, CheckCircle2, AlertTriangle, MessageSquare,
  ChevronDown, ChevronRight, Loader2, Check, BarChart3,
  History, RefreshCw, X, Paperclip, CalendarDays, Filter, Plus,
} from "lucide-react"
import Link from "next/link"

// ─── Types ────────────────────────────────────────────────────────────────────

type Area   = { id: string; name: string; color: string | null }
type Member = { id: string; name: string; department: string | null }
type Task   = {
  id: string
  title: string
  status: string
  progress: number
  startDate: string | null
  endDate:   string | null
  wbsAreaId: string | null
  wbsArea:   { id: string; name: string; color: string | null } | null
  responsible: { id: string; name: string } | null
}
type HistoryItem = {
  id: string
  title: string
  date: string
  location: string | null
  _count: { participants: number }
}

interface CheckpointClientProps {
  project: { id: string; title: string }
  areas: Area[]
  tasks: Task[]
  members: Member[]
  history: HistoryItem[]
}

type TaskState = {
  status: string
  progress: number
  comment: string
  commentOpen: boolean
  attachments: TaskAttachmentInput[]
  uploading: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FREQ_OPTIONS: { value: CheckpointFrequency; label: string }[] = [
  { value: "DAILY",    label: "Diário" },
  { value: "WEEKLY",   label: "Semanal" },
  { value: "BIWEEKLY", label: "Quinzenal" },
  { value: "MONTHLY",  label: "Mensal" },
]

const FREQ_LABELS: Record<CheckpointFrequency, string> = {
  DAILY: "Diário", WEEKLY: "Semanal", BIWEEKLY: "Quinzenal", MONTHLY: "Mensal",
}

const STATUS_CFG = [
  { value: "PLANNING",    label: "Planejamento", hex: "#64748B" },
  { value: "IN_PROGRESS", label: "Em Andamento", hex: "#2463FF" },
  { value: "COMPLETED",   label: "Concluído",    hex: "#10B981" },
  { value: "DELAYED",     label: "Atrasado",     hex: "#EF4444" },
]

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
}

// ─── TaskRow ──────────────────────────────────────────────────────────────────

function TaskRow({
  task,
  state,
  original,
  onUpdate,
  onOpenDetail,
}: {
  task: Task
  state: TaskState
  original: { status: string; progress: number }
  onUpdate: (id: string, patch: Partial<TaskState>) => void
  onOpenDetail: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const changed =
    state.status !== original.status ||
    state.progress !== original.progress ||
    state.comment.trim() !== "" ||
    state.attachments.length > 0

  const cfg = STATUS_CFG.find((s) => s.value === state.status)

  function handleStatus(value: string) {
    const patch: Partial<TaskState> = { status: value }
    if (value === "COMPLETED") patch.progress = 100
    onUpdate(task.id, patch)
  }

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    e.target.value = ""

    onUpdate(task.id, { uploading: true })
    try {
      const form = new FormData()
      for (const f of files) form.append("files", f)

      const res  = await fetch("/api/upload", { method: "POST", body: form })
      const json = await res.json() as { files: { name: string; url: string; size: number }[] }

      const uploaded: TaskAttachmentInput[] = json.files.map((f, i) => ({
        fileName: f.name,
        fileUrl:  f.url,
        fileType: files[i]?.type ?? "application/octet-stream",
        fileSize: f.size,
      }))

      onUpdate(task.id, { attachments: [...state.attachments, ...uploaded], uploading: false })
    } catch {
      onUpdate(task.id, { uploading: false })
    }
  }

  return (
    <div
      className={`px-5 py-4 transition-colors ${changed ? "bg-blue-50/40" : "hover:bg-slate-50/60"}`}
      style={changed ? { borderLeft: "3px solid #2463FF" } : { borderLeft: "3px solid transparent" }}
    >
      {/* Task title + responsible */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={onOpenDetail}
          className="text-sm font-bold text-[#0F172A] flex-1 min-w-0 truncate text-left hover:text-[#2463FF] transition-colors group/title"
          title="Clique para abrir detalhes"
        >
          {task.title}
        </button>
        {task.responsible && (
          <span className="text-[10px] text-slate-400 font-semibold shrink-0 px-2 py-0.5 bg-slate-100 rounded-full">
            {task.responsible.name.split(" ")[0]}
          </span>
        )}
        {changed && (
          <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full shrink-0">
            alterada
          </span>
        )}
      </div>

      {/* Status buttons */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {STATUS_CFG.map((opt) => {
          const active = state.status === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => handleStatus(opt.value)}
              className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold transition-all border ${
                active
                  ? "text-white border-transparent shadow-sm scale-[1.02]"
                  : "bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50"
              }`}
              style={active ? { background: opt.hex } : {}}
            >
              {active && <Check className="w-3 h-3" />}
              {opt.label}
            </button>
          )
        })}
      </div>

      {/* Progress slider + action buttons */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 h-5 flex items-center">
          <div className="w-full h-2 bg-slate-200 rounded-full absolute" />
          <div
            className="h-2 rounded-full absolute left-0"
            style={{ width: `${state.progress}%`, background: cfg?.hex ?? "#2463FF", transition: "width 0.1s ease" }}
          />
          <div
            className="absolute w-4 h-4 rounded-full bg-white shadow border-2 -translate-x-1/2"
            style={{
              left: `${state.progress}%`,
              borderColor: cfg?.hex ?? "#2463FF",
              transition: "left 0.1s ease",
            }}
          />
          <input
            type="range"
            min={0}
            max={100}
            value={state.progress}
            onChange={(e) => onUpdate(task.id, { progress: +e.target.value })}
            className="absolute inset-0 w-full opacity-0 cursor-pointer"
          />
        </div>

        <span className="text-xs font-black text-[#0F172A] w-9 text-right shrink-0">
          {state.progress}%
        </span>

        <button
          onClick={() => onUpdate(task.id, { commentOpen: !state.commentOpen })}
          className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors shrink-0 ${
            state.commentOpen || state.comment.trim()
              ? "bg-blue-50 text-blue-600 border border-blue-200"
              : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          }`}
        >
          {state.comment.trim() ? <Check className="w-3 h-3" /> : <MessageSquare className="w-3 h-3" />}
          Nota
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={state.uploading}
          className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors shrink-0 disabled:opacity-50 ${
            state.attachments.length > 0
              ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
              : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          }`}
        >
          {state.uploading
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <Paperclip className="w-3 h-3" />
          }
          Anexo{state.attachments.length > 0 && ` (${state.attachments.length})`}
        </button>
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFiles} />
      </div>

      {/* Comment area */}
      {state.commentOpen && (
        <div className="mt-3 relative">
          <textarea
            value={state.comment}
            onChange={(e) => onUpdate(task.id, { comment: e.target.value })}
            placeholder="Adicione uma observação sobre esta tarefa..."
            rows={2}
            className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-50 text-[#0F172A] placeholder:text-slate-300 pr-8"
          />
          {state.comment && (
            <button
              onClick={() => onUpdate(task.id, { comment: "" })}
              className="absolute top-2.5 right-2.5 text-slate-300 hover:text-slate-500 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Attachments chips */}
      {state.attachments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {state.attachments.map((att, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
              style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}
            >
              <Paperclip className="w-3 h-3 text-emerald-500 shrink-0" />
              <span className="text-emerald-700 truncate max-w-[160px]">{att.fileName}</span>
              <button
                onClick={() => onUpdate(task.id, { attachments: state.attachments.filter((_, j) => j !== i) })}
                className="text-emerald-400 hover:text-red-500 transition-colors ml-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Task Detail Panel ────────────────────────────────────────────────────────

function TaskDetailPanel({
  task,
  state,
  projectId,
  onSave,
  onClose,
}: {
  task: Task
  state: TaskState
  projectId: string
  onSave: (patch: Partial<TaskState>) => void
  onClose: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [saving,        setSaving]       = useState(false)
  const [localStatus,   setLocalStatus]  = useState(state.status)
  const [localProgress, setLocalProgress]= useState(state.progress)
  const [localComment,  setLocalComment] = useState(state.comment)
  const [localAtts,     setLocalAtts]    = useState<TaskAttachmentInput[]>(state.attachments)
  const [uploading,     setUploading]    = useState(false)
  const [startDate,     setStartDate]    = useState(task.startDate ?? "")
  const [endDate,       setEndDate]      = useState(task.endDate   ?? "")

  const cfg = STATUS_CFG.find((s) => s.value === localStatus)

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    e.target.value = ""
    setUploading(true)
    try {
      const form = new FormData()
      for (const f of files) form.append("files", f)
      const res  = await fetch("/api/upload", { method: "POST", body: form })
      const json = await res.json() as { files: { name: string; url: string; size: number }[] }
      const uploaded: TaskAttachmentInput[] = json.files.map((f, i) => ({
        fileName: f.name,
        fileUrl:  f.url,
        fileType: files[i]?.type ?? "application/octet-stream",
        fileSize: f.size,
      }))
      setLocalAtts((prev) => [...prev, ...uploaded])
    } catch { /* ignore */ }
    setUploading(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const datesChanged =
        startDate !== (task.startDate ?? "") || endDate !== (task.endDate ?? "")
      if (datesChanged) {
        await updateScheduleTask(task.id, projectId, {
          startDate: startDate || null,
          endDate:   endDate   || null,
        })
      }
      onSave({ status: localStatus, progress: localProgress, comment: localComment, attachments: localAtts })
      onClose()
    } catch { /* ignore */ }
    setSaving(false)
  }

  const labelCls = "block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5"

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className="fixed inset-y-0 right-0 z-50 flex flex-col bg-white shadow-2xl"
        style={{ width: 460, borderLeft: "1px solid #E2E8F0" }}
      >
        {/* Header */}
        <div
          className="shrink-0 px-5 py-4 border-b border-slate-100"
          style={{
            background: "linear-gradient(135deg, rgba(36,99,255,0.04), rgba(139,47,255,0.04))",
            borderBottom: "1px solid #E2E8F0",
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {task.wbsArea && (
                <div className="flex items-center gap-1.5 mb-1">
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: task.wbsArea.color ?? "#CBD5E1" }}
                  />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">
                    {task.wbsArea.name}
                  </span>
                </div>
              )}
              <h3 className="text-sm font-black text-[#0F172A] leading-snug">{task.title}</h3>
              {task.responsible && (
                <p className="text-xs text-slate-400 mt-1 font-medium">{task.responsible.name}</p>
              )}
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-[#0F172A] transition-colors shrink-0 mt-0.5">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5" style={{ scrollbarWidth: "thin" }}>

          {/* Status */}
          <div>
            <label className={labelCls}>Status</label>
            <div className="flex flex-wrap gap-2">
              {STATUS_CFG.map((opt) => {
                const active = localStatus === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setLocalStatus(opt.value)
                      if (opt.value === "COMPLETED") setLocalProgress(100)
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                      active
                        ? "text-white border-transparent shadow-sm"
                        : "bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                    style={active ? { background: opt.hex, boxShadow: `0 2px 8px ${opt.hex}40` } : {}}
                  >
                    {active && <Check className="w-3 h-3" />}
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Progress */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={labelCls} style={{ marginBottom: 0 }}>Progresso</label>
              <span className="text-lg font-black" style={{ color: cfg?.hex ?? "#2463FF" }}>{localProgress}%</span>
            </div>
            <div className="relative h-6 flex items-center">
              <div className="w-full h-2.5 bg-slate-200 rounded-full absolute" />
              <div
                className="h-2.5 rounded-full absolute left-0 transition-all"
                style={{ width: `${localProgress}%`, background: cfg?.hex ?? "#2463FF" }}
              />
              <div
                className="absolute w-5 h-5 rounded-full bg-white shadow-md border-2 -translate-x-1/2"
                style={{ left: `${localProgress}%`, borderColor: cfg?.hex ?? "#2463FF", transition: "left 0.1s" }}
              />
              <input
                type="range" min={0} max={100} value={localProgress}
                onChange={(e) => setLocalProgress(+e.target.value)}
                className="absolute inset-0 w-full opacity-0 cursor-pointer"
              />
            </div>
          </div>

          {/* Dates */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <CalendarDays className="w-3 h-3 text-slate-400" />
              <label className={labelCls} style={{ marginBottom: 0 }}>Datas da Tarefa</label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] text-slate-400 font-semibold mb-1">Início</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white text-[#0F172A] outline-none focus:border-[#2463FF] transition-colors"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 font-semibold mb-1">Fim</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white text-[#0F172A] outline-none focus:border-[#2463FF] transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Comment */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <MessageSquare className="w-3 h-3 text-slate-400" />
              <label className={labelCls} style={{ marginBottom: 0 }}>Comentário da Reunião</label>
            </div>
            <textarea
              value={localComment}
              onChange={(e) => setLocalComment(e.target.value)}
              placeholder="Anote as decisões, observações e próximos passos desta tarefa..."
              rows={4}
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:border-[#2463FF] focus:ring-2 focus:ring-blue-50 text-[#0F172A] placeholder:text-slate-300"
            />
          </div>

          {/* Attachments */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Paperclip className="w-3 h-3 text-slate-400" />
              <label className={labelCls} style={{ marginBottom: 0 }}>Anexos</label>
            </div>

            {localAtts.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {localAtts.map((att, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50"
                  >
                    <Paperclip className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span className="flex-1 text-xs text-emerald-700 truncate font-medium">{att.fileName}</span>
                    <button
                      onClick={() => setLocalAtts((prev) => prev.filter((_, j) => j !== i))}
                      className="text-emerald-400 hover:text-red-500 transition-colors shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full flex items-center justify-center gap-2 h-9 rounded-xl border border-dashed border-slate-300 text-xs font-semibold text-slate-400 hover:border-[#2463FF] hover:text-[#2463FF] transition-all disabled:opacity-50"
            >
              {uploading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Paperclip className="w-3.5 h-3.5" />
              }
              {uploading ? "Enviando..." : "Adicionar arquivo"}
            </button>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFiles} />
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-4 border-t border-slate-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 h-10 text-sm font-semibold rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 inline-flex items-center justify-center gap-2 h-10 text-sm font-bold rounded-xl text-white transition-all disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #2463FF, #8B2FFF)", boxShadow: "0 4px 20px rgba(36,99,255,0.30)" }}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Salvar
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CheckpointClient({ project, areas, tasks, members, history }: CheckpointClientProps) {
  const today = new Date().toISOString().split("T")[0]

  const [frequency, setFrequency]   = useState<CheckpointFrequency>("WEEKLY")
  const [meetingDate, setMeetingDate] = useState(today)
  const [location, setLocation]     = useState("")
  const [highlights, setHighlights] = useState("")
  const [blockers, setBlockers]     = useState("")
  const [nextSteps, setNextSteps]   = useState("")
  const [attendeeIds, setAttendeeIds] = useState<string[]>([])
  const [externalAttendees, setExternalAttendees] = useState<{ id: string; name: string; role: string }[]>([])
  const [addingExternal, setAddingExternal] = useState(false)
  const [extName, setExtName] = useState("")
  const [extRole, setExtRole] = useState("")
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set(areas.map((a) => a.id)))
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [error, setError]         = useState("")
  const [filterAreaId, setFilterAreaId]   = useState<string | null>(null)
  const [filterRespId, setFilterRespId]   = useState<string | null>(null)
  const [detailTaskId, setDetailTaskId]   = useState<string | null>(null)

  const [taskStates, setTaskStates] = useState<Record<string, TaskState>>(() => {
    const init: Record<string, TaskState> = {}
    for (const t of tasks) {
      init[t.id] = { status: t.status, progress: t.progress, comment: "", commentOpen: false, attachments: [], uploading: false }
    }
    return init
  })

  // Derived state
  const changedTasks = useMemo(
    () =>
      tasks.filter((t) => {
        const s = taskStates[t.id]
        return s && (s.status !== t.status || s.progress !== t.progress || s.comment.trim() !== "" || s.attachments.length > 0)
      }),
    [tasks, taskStates],
  )

  const stats = useMemo(() => ({
    total:      tasks.length,
    changed:    changedTasks.length,
    completed:  changedTasks.filter((t) => taskStates[t.id]?.status === "COMPLETED").length,
    delayed:    changedTasks.filter((t) => taskStates[t.id]?.status === "DELAYED").length,
    inProgress: changedTasks.filter((t) => taskStates[t.id]?.status === "IN_PROGRESS").length,
  }), [tasks.length, changedTasks, taskStates])

  const uniqueResponsibles = useMemo(() => {
    const seen = new Set<string>()
    const result: { id: string; name: string }[] = []
    for (const t of tasks) {
      if (t.responsible && !seen.has(t.responsible.id)) {
        seen.add(t.responsible.id)
        result.push(t.responsible)
      }
    }
    return result
  }, [tasks])

  const tasksByArea = useMemo(() => {
    const map = new Map<string | null, Task[]>()
    map.set(null, [])
    for (const a of areas) map.set(a.id, [])
    for (const t of tasks) {
      const key = t.wbsAreaId && areas.find((a) => a.id === t.wbsAreaId) ? t.wbsAreaId : null
      map.get(key)!.push(t)
    }
    return map
  }, [areas, tasks])

  function updateTask(id: string, patch: Partial<TaskState>) {
    setTaskStates((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  function toggleArea(id: string) {
    setExpandedAreas((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  function toggleAttendee(id: string) {
    setAttendeeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  function confirmExternal() {
    if (!extName.trim()) return
    setExternalAttendees((prev) => [...prev, { id: Math.random().toString(36).slice(2), name: extName.trim(), role: extRole.trim() }])
    setExtName(""); setExtRole(""); setAddingExternal(false)
  }

  async function handleSave() {
    if (saving) return
    setSaving(true)
    setError("")
    try {
      await saveCheckpoint({
        projectId: project.id,
        date: meetingDate,
        frequency,
        location,
        highlights,
        blockers,
        nextSteps: nextSteps + (externalAttendees.length ? "\n\nParticipantes externos: " + externalAttendees.map((e) => `${e.name}${e.role ? ` (${e.role})` : ""}`).join(", ") : ""),
        attendeeIds,
        taskUpdates: changedTasks.map((t) => ({
          taskId:      t.id,
          status:      taskStates[t.id].status,
          progress:    taskStates[t.id].progress,
          comment:     taskStates[t.id].comment.trim() || undefined,
          attachments: taskStates[t.id].attachments.length ? taskStates[t.id].attachments : undefined,
        })),
      })
      setSaved(true)
    } catch (e) {
      console.error(e)
      setError("Erro ao registrar o checkpoint. Tente novamente.")
    } finally {
      setSaving(false)
    }
  }

  // ── Success screen ────────────────────────────────────────────────────────

  if (saved) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-8 p-8">
        <div
          className="w-24 h-24 rounded-3xl flex items-center justify-center"
          style={{
            background: "linear-gradient(135deg, #10B981, #059669)",
            boxShadow: "0 20px 60px rgba(16,185,129,0.35)",
          }}
        >
          <CheckCircle2 className="w-12 h-12 text-white" />
        </div>

        <div className="text-center">
          <h2 className="text-3xl font-black text-[#0F172A]">Checkpoint Registrado!</h2>
          <p className="text-slate-400 mt-2 font-medium">
            {FREQ_LABELS[frequency]}
            {" · "}
            {format(new Date(meetingDate + "T12:00:00"), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </p>
        </div>

        {stats.changed > 0 && (
          <div className="flex gap-4 flex-wrap justify-center">
            <div className="px-5 py-4 rounded-2xl text-center" style={{ background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
              <p className="text-2xl font-black text-[#2463FF]">{stats.changed}</p>
              <p className="text-xs text-slate-500 mt-1 font-semibold">Atualizadas</p>
            </div>
            {stats.completed > 0 && (
              <div className="px-5 py-4 rounded-2xl text-center" style={{ background: "#ECFDF5", border: "1px solid #A7F3D0" }}>
                <p className="text-2xl font-black text-[#10B981]">{stats.completed}</p>
                <p className="text-xs text-slate-500 mt-1 font-semibold">Concluídas</p>
              </div>
            )}
            {stats.delayed > 0 && (
              <div className="px-5 py-4 rounded-2xl text-center" style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}>
                <p className="text-2xl font-black text-[#EF4444]">{stats.delayed}</p>
                <p className="text-xs text-slate-500 mt-1 font-semibold">Atrasadas</p>
              </div>
            )}
            {stats.inProgress > 0 && (
              <div className="px-5 py-4 rounded-2xl text-center" style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}>
                <p className="text-2xl font-black text-[#F59E0B]">{stats.inProgress}</p>
                <p className="text-xs text-slate-500 mt-1 font-semibold">Em Andamento</p>
              </div>
            )}
          </div>
        )}

        {stats.changed === 0 && (
          <p className="text-sm text-slate-400 font-medium">Reunião registrada sem alterações nas tarefas.</p>
        )}

        <div className="flex gap-3 mt-2">
          <Link
            href={`/projects/${project.id}`}
            className="inline-flex items-center gap-2 px-6 h-10 rounded-xl border border-slate-200 text-sm font-semibold text-[#0F172A] hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar ao Projeto
          </Link>
          <Link
            href={`/projects/${project.id}/schedule`}
            className="inline-flex items-center gap-2 px-6 h-10 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
            style={{
              background: "linear-gradient(135deg, #0F172A, #1E293B)",
              boxShadow: "0 4px 20px rgba(15,23,42,0.25)",
            }}
          >
            Ver Cronograma
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    )
  }

  // ── Main UI ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-[#F8FAFC]">
      {/* ── Header ── */}
      <div
        className="shrink-0 bg-white border-b border-slate-100 px-6 py-3.5"
        style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
      >
        <div className="max-w-7xl mx-auto flex items-center gap-4 flex-wrap">
          <Link
            href={`/projects/${project.id}`}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-[#0F172A] transition-colors font-medium group shrink-0"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            Projeto
          </Link>

          <div className="w-px h-5 bg-slate-200 shrink-0" />

          <div className="flex items-center gap-2 shrink-0">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #2463FF, #8B2FFF)" }}
            >
              <RefreshCw className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-medium leading-none">Checkpoint</p>
              <p className="text-sm font-black text-[#0F172A] leading-tight">{project.title}</p>
            </div>
          </div>

          <div className="flex-1" />

          {/* Frequency selector */}
          <div className="flex items-center gap-0.5 p-1 rounded-xl bg-slate-100 shrink-0">
            {FREQ_OPTIONS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFrequency(f.value)}
                className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${
                  frequency === f.value
                    ? "bg-white text-[#0F172A] shadow-sm"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Live stats pills */}
          {stats.changed > 0 && (
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-bold border border-blue-100">
                {stats.changed} alteradas
              </span>
              {stats.completed > 0 && (
                <span className="px-2.5 py-1 bg-green-50 text-green-700 rounded-full text-xs font-bold border border-green-100">
                  ✓ {stats.completed}
                </span>
              )}
              {stats.delayed > 0 && (
                <span className="px-2.5 py-1 bg-red-50 text-red-700 rounded-full text-xs font-bold border border-red-100">
                  ! {stats.delayed}
                </span>
              )}
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 h-9 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 shrink-0"
            style={{
              background: "linear-gradient(135deg, #10B981, #059669)",
              boxShadow: "0 4px 20px rgba(16,185,129,0.30)",
            }}
          >
            {saving
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <CheckCircle2 className="w-3.5 h-3.5" />
            }
            Registrar Checkpoint
          </button>
        </div>
      </div>

      {error && (
        <div className="px-6 py-3 bg-red-50 border-b border-red-100 text-sm text-red-700 font-medium flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
          <button onClick={() => setError("")} className="ml-auto text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Body ── */}
      <div className="flex-1 overflow-hidden flex">

        {/* Left sidebar */}
        <div
          className="w-80 shrink-0 bg-white border-r border-slate-100 overflow-y-auto"
          style={{ scrollbarWidth: "thin", scrollbarColor: "#E2E8F0 transparent" }}
        >
          <div className="p-5 space-y-5">

            {/* Meeting details */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">
                Detalhes da Reunião
              </p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1.5" htmlFor="cp-date">
                    Data
                  </label>
                  <input
                    id="cp-date"
                    type="date"
                    value={meetingDate}
                    onChange={(e) => setMeetingDate(e.target.value)}
                    className="w-full h-9 px-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-50 text-[#0F172A] bg-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1.5" htmlFor="cp-loc">
                    Local / Link
                  </label>
                  <input
                    id="cp-loc"
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Sala de reuniões, Teams, Zoom..."
                    className="w-full h-9 px-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-50 text-[#0F172A] placeholder:text-slate-300"
                  />
                </div>
              </div>
            </div>

            {/* Highlights */}
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5" htmlFor="cp-hl">
                Destaques
              </label>
              <textarea
                id="cp-hl"
                value={highlights}
                onChange={(e) => setHighlights(e.target.value)}
                placeholder="Conquistas e pontos positivos..."
                rows={3}
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-50 text-[#0F172A] placeholder:text-slate-300"
              />
            </div>

            {/* Blockers */}
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <AlertTriangle className="w-3 h-3 text-orange-400" />
                <label className="text-xs font-semibold text-slate-500" htmlFor="cp-bl">
                  Impedimentos
                </label>
              </div>
              <textarea
                id="cp-bl"
                value={blockers}
                onChange={(e) => setBlockers(e.target.value)}
                placeholder="O que está bloqueando o progresso?"
                rows={3}
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-50 text-[#0F172A] placeholder:text-slate-300"
              />
            </div>

            {/* Next steps */}
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5" htmlFor="cp-ns">
                Próximos Passos
              </label>
              <textarea
                id="cp-ns"
                value={nextSteps}
                onChange={(e) => setNextSteps(e.target.value)}
                placeholder="O que será feito até o próximo checkpoint?"
                rows={3}
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-50 text-[#0F172A] placeholder:text-slate-300"
              />
            </div>

            {/* Attendees */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">
                Participantes ({attendeeIds.length + externalAttendees.length}{members.length > 0 ? `/${members.length}` : ""})
              </p>
              <div className="flex flex-wrap gap-2">
                {members.map((m) => {
                  const selected = attendeeIds.includes(m.id)
                  return (
                    <button
                      key={m.id}
                      onClick={() => toggleAttendee(m.id)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                        selected ? "text-white border-transparent" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                      style={selected ? { background: "linear-gradient(135deg, #2463FF, #8B2FFF)", boxShadow: "0 2px 8px rgba(36,99,255,0.25)" } : {}}
                    >
                      <span className={`w-5 h-5 rounded-lg flex items-center justify-center text-[9px] font-black shrink-0 ${selected ? "bg-white/20 text-white" : "bg-slate-100 text-[#0F172A]"}`}>
                        {initials(m.name)}
                      </span>
                      {m.name.split(" ")[0]}
                    </button>
                  )
                })}

                {/* External attendees */}
                {externalAttendees.map((ext) => (
                  <span
                    key={ext.id}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-white border-transparent"
                    style={{ background: "linear-gradient(135deg, #059669, #0891B2)", boxShadow: "0 2px 8px rgba(5,150,105,0.25)" }}
                  >
                    <span className="w-5 h-5 rounded-lg flex items-center justify-center text-[9px] font-black bg-white/20 shrink-0">
                      {ext.name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase()}
                    </span>
                    {ext.name.split(" ")[0]}
                    <span className="text-[8px] bg-white/20 px-1 rounded">Ext.</span>
                    <button onClick={() => setExternalAttendees((p) => p.filter((e) => e.id !== ext.id))} className="ml-0.5 hover:bg-white/20 rounded p-0.5">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}

                {/* Add external button / inline form */}
                {addingExternal ? (
                  <div className="flex items-center gap-1.5 p-1.5 rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50">
                    <input autoFocus value={extName} onChange={(e) => setExtName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && confirmExternal()} placeholder="Nome" className="w-24 px-2 py-0.5 text-xs rounded-lg border border-emerald-200 bg-white outline-none focus:border-emerald-400 placeholder-slate-300" />
                    <input value={extRole} onChange={(e) => setExtRole(e.target.value)} onKeyDown={(e) => e.key === "Enter" && confirmExternal()} placeholder="Área / Empresa" className="w-28 px-2 py-0.5 text-xs rounded-lg border border-emerald-200 bg-white outline-none focus:border-emerald-400 placeholder-slate-300" />
                    <button onClick={confirmExternal} disabled={!extName.trim()} className="px-2 py-0.5 text-[11px] font-black rounded-lg text-white disabled:opacity-40" style={{ background: "linear-gradient(135deg,#059669,#0891B2)" }}>OK</button>
                    <button onClick={() => { setAddingExternal(false); setExtName(""); setExtRole("") }} className="px-1.5 py-0.5 text-[11px] rounded-lg bg-slate-100 text-slate-400 hover:bg-slate-200"><X className="w-3 h-3" /></button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingExternal(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border-2 border-dashed border-slate-200 text-slate-400 hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50 transition-all"
                  >
                    <Plus className="w-3 h-3" /> Externo
                  </button>
                )}
              </div>
            </div>

            {/* Stats summary */}
            <div className="pt-3 border-t border-slate-100">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Resumo</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Total",      value: stats.total,     hex: "#64748B" },
                  { label: "Alteradas",  value: stats.changed,   hex: "#2463FF" },
                  { label: "Concluídas", value: stats.completed, hex: "#10B981" },
                  { label: "Atrasadas",  value: stats.delayed,   hex: "#EF4444" },
                ].map(({ label, value, hex }) => (
                  <div
                    key={label}
                    className="p-2.5 rounded-xl"
                    style={{ background: "#F8FAFC", border: "1px solid #F1F5F9" }}
                  >
                    <p className="text-lg font-black" style={{ color: hex }}>{value}</p>
                    <p className="text-[10px] text-slate-400 font-semibold">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* History */}
            {history.length > 0 && (
              <div className="pt-3 border-t border-slate-100">
                <div className="flex items-center gap-1.5 mb-3">
                  <History className="w-3 h-3 text-slate-400" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Histórico</p>
                </div>
                <div className="space-y-2">
                  {history.slice(0, 5).map((h) => (
                    <div
                      key={h.id}
                      className="flex items-start gap-2.5 p-2.5 rounded-xl"
                      style={{ background: "#F8FAFC" }}
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[#0F172A] truncate">{h.title}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {format(new Date(h.date), "dd/MM/yyyy", { locale: ptBR })}
                          {" · "}
                          {h._count.participants} part.
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Right: task updates */}
        <div className="flex-1 flex flex-col min-h-0">

          {/* ── Filter bar ─────────────────────────────────────────────── */}
          {tasks.length > 0 && (
            <div
              className="shrink-0 bg-white border-b border-slate-100 px-5 py-3 flex flex-wrap gap-x-5 gap-y-2 items-center"
              style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
            >
              <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-wider shrink-0">
                <Filter className="w-3 h-3" />
                Filtros
              </div>

              {/* Area chips */}
              {areas.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-slate-400 font-semibold shrink-0">Área:</span>
                  <button
                    onClick={() => setFilterAreaId(null)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ${filterAreaId === null ? "text-white border-transparent bg-[#0F172A]" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"}`}
                  >
                    Todas
                  </button>
                  {areas.map((area) => {
                    const active = filterAreaId === area.id
                    return (
                      <button
                        key={area.id}
                        onClick={() => setFilterAreaId(active ? null : area.id)}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ${active ? "text-white border-transparent" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"}`}
                        style={active ? { background: area.color ?? "#6B7280" } : {}}
                      >
                        {!active && <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: area.color ?? "#CBD5E1" }} />}
                        {area.name}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Responsible chips */}
              {uniqueResponsibles.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-slate-400 font-semibold shrink-0">Responsável:</span>
                  <button
                    onClick={() => setFilterRespId(null)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ${filterRespId === null ? "bg-[#0F172A] text-white border-transparent" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"}`}
                  >
                    Todos
                  </button>
                  {uniqueResponsibles.map((r) => {
                    const active = filterRespId === r.id
                    return (
                      <button
                        key={r.id}
                        onClick={() => setFilterRespId(active ? null : r.id)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ${active ? "text-white border-transparent" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"}`}
                        style={active ? { background: "linear-gradient(135deg, #2463FF, #8B2FFF)" } : {}}
                      >
                        <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-black shrink-0 ${active ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"}`}>
                          {initials(r.name)}
                        </span>
                        {r.name.split(" ")[0]}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Task list ───────────────────────────────────────────────── */}
          <div
            className="flex-1 overflow-y-auto p-4 space-y-3"
            style={{ scrollbarWidth: "thin", scrollbarColor: "#E2E8F0 transparent" }}
          >
            {tasks.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center h-64 gap-3 bg-white rounded-2xl"
                style={{ border: "1px solid #E2E8F0" }}
              >
                <BarChart3 className="w-10 h-10 text-slate-300" />
                <p className="text-sm text-slate-400 font-medium">Nenhuma tarefa no cronograma deste projeto</p>
                <Link href={`/projects/${project.id}/schedule`} className="text-sm text-[#2463FF] font-semibold hover:underline">
                  Adicionar tarefas ao Cronograma →
                </Link>
              </div>
            ) : (
              <>
                {areas.map((area) => {
                  if (filterAreaId && filterAreaId !== area.id) return null
                  const allAreaTasks = tasksByArea.get(area.id) ?? []
                  const areaTasks = filterRespId
                    ? allAreaTasks.filter((t) => t.responsible?.id === filterRespId)
                    : allAreaTasks
                  if (areaTasks.length === 0) return null

                  const isExpanded = expandedAreas.has(area.id)
                  const areaChanged = areaTasks.filter((t) => {
                    const s = taskStates[t.id]
                    return s && (s.status !== t.status || s.progress !== t.progress || s.comment.trim() || s.attachments.length > 0)
                  }).length

                  return (
                    <div key={area.id} className="bg-white rounded-2xl overflow-hidden" style={{ border: "1px solid #E2E8F0", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                      <button
                        onClick={() => toggleArea(area.id)}
                        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50/80 transition-colors"
                        style={{ borderBottom: isExpanded ? "1px solid #F1F5F9" : "none" }}
                      >
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ background: area.color ?? "#6B7280" }} />
                        <span className="text-sm font-bold text-[#0F172A]">{area.name}</span>
                        <span className="text-xs text-slate-400 font-medium">{areaTasks.length} tarefa{areaTasks.length !== 1 ? "s" : ""}</span>
                        {areaChanged > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100">
                            {areaChanged} alteradas
                          </span>
                        )}
                        <div className="flex-1" />
                        {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                      </button>
                      {isExpanded && (
                        <div className="divide-y divide-slate-50">
                          {areaTasks.map((t) => (
                            <TaskRow
                              key={t.id}
                              task={t}
                              state={taskStates[t.id] ?? { status: t.status, progress: t.progress, comment: "", commentOpen: false, attachments: [], uploading: false }}
                              original={{ status: t.status, progress: t.progress }}
                              onUpdate={updateTask}
                              onOpenDetail={() => setDetailTaskId(t.id)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Unassigned tasks */}
                {(() => {
                  if (filterAreaId) return null
                  const allUnassigned = tasksByArea.get(null) ?? []
                  const unassigned = filterRespId ? allUnassigned.filter((t) => t.responsible?.id === filterRespId) : allUnassigned
                  if (unassigned.length === 0) return null
                  return (
                    <div className="bg-white rounded-2xl overflow-hidden" style={{ border: "1px solid #E2E8F0", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                      <div className="flex items-center gap-3 px-5 py-3.5" style={{ borderBottom: "1px solid #F1F5F9", background: "#FAFBFC" }}>
                        <div className="w-3 h-3 rounded-full bg-slate-300" />
                        <span className="text-sm font-bold text-[#0F172A]">Sem Área</span>
                        <span className="text-xs text-slate-400 font-medium ml-1">{unassigned.length} tarefa{unassigned.length !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="divide-y divide-slate-50">
                        {unassigned.map((t) => (
                          <TaskRow
                            key={t.id}
                            task={t}
                            state={taskStates[t.id] ?? { status: t.status, progress: t.progress, comment: "", commentOpen: false, attachments: [], uploading: false }}
                            original={{ status: t.status, progress: t.progress }}
                            onUpdate={updateTask}
                            onOpenDetail={() => setDetailTaskId(t.id)}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Task Detail Panel ──────────────────────────────────────────── */}
      {detailTaskId && (() => {
        const detailTask = tasks.find((t) => t.id === detailTaskId)
        if (!detailTask) return null
        return (
          <TaskDetailPanel
            task={detailTask}
            state={taskStates[detailTaskId] ?? { status: detailTask.status, progress: detailTask.progress, comment: "", commentOpen: false, attachments: [], uploading: false }}
            projectId={project.id}
            onSave={(patch) => updateTask(detailTaskId, patch)}
            onClose={() => setDetailTaskId(null)}
          />
        )
      })()}
    </div>
  )
}
