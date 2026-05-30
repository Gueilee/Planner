"use client"

import { useState, useMemo, useRef } from "react"
import { saveCheckpoint, type CheckpointFrequency, type TaskAttachmentInput } from "@/lib/actions/checkpoint"
import { updateTask as updateScheduleTask } from "@/lib/actions/schedule"
import { deriveStatus, deriveProgress } from "@/lib/utils/task-progress"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  ArrowLeft, CheckCircle2, AlertTriangle, MessageSquare,
  ChevronDown, ChevronRight, Loader2, Check, BarChart3,
  History, RefreshCw, X, Paperclip, CalendarDays, Filter, Plus,
  FileText, Users, Clock, Lock, Play,
} from "lucide-react"
import Link from "next/link"
import {
  ParticipantCard, NewParticipantForm, NewParticipantTrigger,
  type NewParticipant, type ParticipantKind,
} from "@/components/meeting-new-participant"
import { MeetingAtaModal } from "@/components/meeting-ata-modal"

// ─── Types ────────────────────────────────────────────────────────────────────

type Area   = { id: string; name: string; color: string | null }
type Member = { id: string; name: string; department: string | null }
type Task   = {
  id:           string
  title:        string
  status:       string
  progress:     number
  startDate:    string | null
  endDate:      string | null
  wbsAreaId:    string | null
  wbsArea:      { id: string; name: string; color: string | null } | null
  responsible:  { id: string; name: string } | null
  parentId:     string | null
  parentTitle:  string | null
  budgetedCost: number | null
  actualCost:   number | null
}
type HistoryItem = {
  id:       string
  title:    string
  date:     string
  location: string | null
  _count:   { participants: number }
}

import type { PickerUser } from "@/components/meeting-participant-picker"
import { MeetingParticipantPicker } from "@/components/meeting-participant-picker"

interface CheckpointClientProps {
  project:             { id: string; title: string }
  areas:               Area[]
  tasks:               Task[]
  /** @deprecated use projectParticipants */
  members?:            Member[]
  projectParticipants: PickerUser[]
  allUsers:            PickerUser[]
  history:             HistoryItem[]
}

type TaskState = {
  status:       string
  progress:     number
  comment:      string
  commentOpen:  boolean
  attachments:  TaskAttachmentInput[]
  uploading:    boolean
  startDate:    string
  endDate:      string
  budgetedCost: number | null
  actualCost:   number | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FREQ_OPTIONS: { value: CheckpointFrequency; label: string }[] = [
  { value: "DAILY",    label: "Diário"     },
  { value: "WEEKLY",   label: "Semanal"    },
  { value: "BIWEEKLY", label: "Quinzenal"  },
  { value: "MONTHLY",  label: "Mensal"     },
]

const FREQ_LABELS: Record<CheckpointFrequency, string> = {
  DAILY: "Diário", WEEKLY: "Semanal", BIWEEKLY: "Quinzenal", MONTHLY: "Mensal",
}

const STATUS_CFG = [
  { value: "PLANNING",    label: "A Iniciar",    hex: "#64748B", bg: "#F8FAFC" },
  { value: "IN_PROGRESS", label: "Em Andamento", hex: "#2463FF", bg: "#EFF6FF" },
  { value: "VALIDATION",  label: "Validação",    hex: "#8B5CF6", bg: "#F5F3FF" },
  { value: "COMPLETED",   label: "Concluído",    hex: "#10B981", bg: "#ECFDF5" },
  { value: "DELAYED",     label: "Atrasado",     hex: "#EF4444", bg: "#FEF2F2" },
  { value: "ON_HOLD",     label: "Pausado",      hex: "#F59E0B", bg: "#FFFBEB" },
]

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
}

function avatarColor(name: string) {
  const hues = [221, 262, 142, 32, 168, 316, 199]
  return `hsl(${hues[name.charCodeAt(0) % hues.length]},60%,45%)`
}

function fmtDate(d: string | null): string {
  if (!d) return "—"
  return format(parseISO(d), "dd/MM/yy", { locale: ptBR })
}

function isOverdue(endDate: string | null, status: string): boolean {
  if (!endDate || status === "COMPLETED") return false
  return parseISO(endDate) < new Date()
}

// ─── TaskCard ─────────────────────────────────────────────────────────────────

function TaskCard({
  task,
  state,
  original,
  isChild,
  onUpdate,
  onOpenDetail,
}: {
  task:         Task
  state:        TaskState
  original:     { status: string; progress: number }
  isChild:      boolean
  onUpdate:     (id: string, patch: Partial<TaskState>) => void
  onOpenDetail: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const changed =
    state.status !== original.status ||
    state.progress !== original.progress ||
    state.comment.trim() !== "" ||
    state.attachments.length > 0

  const cfg      = STATUS_CFG.find((s) => s.value === state.status)
  const overdue  = isOverdue(task.endDate, state.status)
  const today    = new Date().toISOString().slice(0, 10)
  const notStarted = state.status === "PLANNING" && task.startDate && task.startDate < today

  function handleStatus(value: string) {
    const newProgress = deriveProgress(value, state.progress)
    onUpdate(task.id, { status: value, progress: newProgress })
  }

  function handleProgress(prog: number) {
    const newStatus = deriveStatus(prog, state.status)
    onUpdate(task.id, { progress: prog, status: newStatus })
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
      className="rounded-2xl overflow-hidden transition-all duration-200"
      style={{
        marginLeft:  isChild ? 24 : 0,
        border:      changed ? "1.5px solid #BFDBFE" : "1px solid #E2E8F0",
        background:  changed ? "#F0F7FF" : isChild ? "#FAFBFD" : "#FFFFFF",
        boxShadow:   changed ? "0 2px 12px rgba(36,99,255,0.08)" : "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      {/* Task header */}
      <div className="px-4 py-3 flex items-start gap-3">
        {/* Type indicator */}
        <div
          className="w-2.5 h-2.5 rounded-full shrink-0 mt-1.5"
          style={{ background: isChild ? "#A78BFA" : (task.wbsArea?.color ?? "#CBD5E1") }}
        />

        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <button
              onClick={onOpenDetail}
              className="text-sm font-bold text-[#0F172A] text-left hover:text-[#2463FF] transition-colors leading-snug flex-1 min-w-0"
              title="Clique para abrir detalhes completos"
            >
              {task.title}
            </button>
            <div className="flex items-center gap-2 shrink-0">
              {changed && (
                <span className="text-[10px] font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                  alterada
                </span>
              )}
              {/* Status badge */}
              <span
                className="text-[10px] font-bold px-2.5 py-1 rounded-full border whitespace-nowrap"
                style={{ background: cfg?.bg, color: cfg?.hex, borderColor: `${cfg?.hex}30` }}
              >
                {cfg?.label ?? state.status}
              </span>
            </div>
          </div>

          {/* Meta: responsible + dates */}
          <div className="flex flex-wrap items-center gap-3 mb-3">
            {task.responsible ? (
              <div className="flex items-center gap-1.5">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black text-white shrink-0"
                  style={{ background: avatarColor(task.responsible.name) }}
                >
                  {initials(task.responsible.name)}
                </div>
                <span className="text-[11px] font-semibold text-slate-500">{task.responsible.name}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-[11px] text-slate-300">
                <Users className="w-3 h-3" />
                <span>Sem responsável</span>
              </div>
            )}
            {(task.startDate || task.endDate) && (
              <div
                className="flex items-center gap-1 text-[11px] font-semibold"
                style={{ color: overdue ? "#EF4444" : notStarted ? "#F59E0B" : "#64748B" }}
              >
                <CalendarDays className="w-3 h-3 shrink-0" />
                {fmtDate(task.startDate)} → {fmtDate(task.endDate)}
                {overdue && <span className="text-[9px] font-black text-red-500 ml-1">(ATRASADO)</span>}
                {notStarted && !overdue && <span className="text-[9px] font-black text-amber-500 ml-1">(NÃO INICIADO)</span>}
              </div>
            )}
          </div>

          {/* Status selector */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {STATUS_CFG.map((opt) => {
              const active = state.status === opt.value
              return (
                <button
                  key={opt.value}
                  onClick={() => handleStatus(opt.value)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border"
                  style={active
                    ? { background: opt.hex, color: "#fff", borderColor: "transparent", boxShadow: `0 2px 8px ${opt.hex}40` }
                    : { background: opt.bg, color: opt.hex, borderColor: `${opt.hex}25` }
                  }
                >
                  {active && <Check className="w-2.5 h-2.5" />}
                  {opt.label}
                </button>
              )
            })}
          </div>

          {/* Progress bar */}
          <div className="flex items-center gap-3 mb-2">
            <div className="relative flex-1 h-6 flex items-center">
              <div className="w-full h-2 bg-slate-200 rounded-full absolute" />
              <div
                className="h-2 rounded-full absolute left-0 transition-all duration-150"
                style={{ width: `${state.progress}%`, background: cfg?.hex ?? "#2463FF" }}
              />
              <div
                className="absolute w-4 h-4 rounded-full bg-white shadow-sm border-2 -translate-x-1/2 transition-all duration-150"
                style={{ left: `${state.progress}%`, borderColor: cfg?.hex ?? "#2463FF" }}
              />
              <input
                type="range" min={0} max={100} value={state.progress}
                onChange={(e) => handleProgress(+e.target.value)}
                className="absolute inset-0 w-full opacity-0 cursor-pointer"
              />
            </div>
            <span className="text-sm font-black w-9 text-right shrink-0" style={{ color: cfg?.hex ?? "#2463FF" }}>
              {state.progress}%
            </span>

            {/* Action buttons */}
            <button
              onClick={() => onUpdate(task.id, { commentOpen: !state.commentOpen })}
              className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg transition-colors shrink-0"
              style={state.commentOpen || state.comment.trim()
                ? { background: "#EFF6FF", color: "#2463FF", border: "1px solid #BFDBFE" }
                : { background: "#F8FAFC", color: "#94A3B8", border: "1px solid #E2E8F0" }
              }
            >
              {state.comment.trim() ? <Check className="w-3 h-3" /> : <MessageSquare className="w-3 h-3" />}
              Nota
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={state.uploading}
              className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg transition-colors shrink-0 disabled:opacity-50"
              style={state.attachments.length > 0
                ? { background: "#F0FDF4", color: "#059669", border: "1px solid #BBF7D0" }
                : { background: "#F8FAFC", color: "#94A3B8", border: "1px solid #E2E8F0" }
              }
            >
              {state.uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paperclip className="w-3 h-3" />}
              {state.attachments.length > 0 ? `Anexo (${state.attachments.length})` : "Anexo"}
            </button>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFiles} />
          </div>

          {/* Comment area */}
          {state.commentOpen && (
            <div className="mt-1 relative">
              <textarea
                value={state.comment}
                onChange={(e) => onUpdate(task.id, { comment: e.target.value })}
                placeholder="Observação sobre esta tarefa neste checkpoint..."
                rows={2}
                className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-50 placeholder:text-slate-300"
              />
              {state.comment && (
                <button
                  onClick={() => onUpdate(task.id, { comment: "" })}
                  className="absolute top-2 right-2 text-slate-300 hover:text-slate-500"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {/* Attachment chips */}
          {state.attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {state.attachments.map((att, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium"
                  style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}
                >
                  <Paperclip className="w-2.5 h-2.5 text-emerald-500 shrink-0" />
                  <span className="text-emerald-700 truncate max-w-[140px]">{att.fileName}</span>
                  <button
                    onClick={() => onUpdate(task.id, { attachments: state.attachments.filter((_, j) => j !== i) })}
                    className="text-emerald-400 hover:text-red-500 transition-colors"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Task Detail Panel ────────────────────────────────────────────────────────

function TaskDetailPanel({
  task, state, projectId, onSave, onClose,
}: {
  task:      Task
  state:     TaskState
  projectId: string
  onSave:    (patch: Partial<TaskState>) => void
  onClose:   () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [saving,           setSaving]          = useState(false)
  const [localStatus,      setLocalStatus]     = useState(state.status)
  const [localProgress,    setLocalProgress]   = useState(state.progress)
  const [localComment,     setLocalComment]    = useState(state.comment)
  const [localAtts,        setLocalAtts]       = useState<TaskAttachmentInput[]>(state.attachments)
  const [uploading,        setUploading]       = useState(false)
  const [localStartDate,   setLocalStartDate]  = useState(task.startDate ?? "")
  const [localEndDate,     setLocalEndDate]    = useState(task.endDate   ?? "")
  const [localBudgetedCost,setLocalBudgetedCost] = useState<string>(state.budgetedCost?.toString() ?? "")
  const [localActualCost,  setLocalActualCost]   = useState<string>(state.actualCost?.toString() ?? "")

  const cfg = STATUS_CFG.find((s) => s.value === localStatus)

  function handleStatus(value: string) {
    const newProg = deriveProgress(value, localProgress)
    setLocalStatus(value)
    setLocalProgress(newProg)
  }

  function handleProgress(prog: number) {
    const newStatus = deriveStatus(prog, localStatus)
    setLocalProgress(prog)
    setLocalStatus(newStatus)
  }

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
        fileName: f.name, fileUrl: f.url,
        fileType: files[i]?.type ?? "application/octet-stream", fileSize: f.size,
      }))
      setLocalAtts((prev) => [...prev, ...uploaded])
    } catch { /* ignore */ }
    setUploading(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const bc = localBudgetedCost === "" ? null : Number(localBudgetedCost)
      const ac = localActualCost   === "" ? null : Number(localActualCost)
      const dateChanged = localStartDate !== (task.startDate ?? "") || localEndDate !== (task.endDate ?? "")
      const costChanged = bc !== (task.budgetedCost ?? null) || ac !== (task.actualCost ?? null)
      if (dateChanged || costChanged) {
        await updateScheduleTask(task.id, projectId, {
          ...(dateChanged && { startDate: localStartDate || null, endDate: localEndDate || null }),
          ...(costChanged && { budgetedCost: bc, actualCost: ac }),
        })
      }
      onSave({ status: localStatus, progress: localProgress, comment: localComment, attachments: localAtts, budgetedCost: bc, actualCost: ac })
      onClose()
    } catch { /* ignore */ }
    setSaving(false)
  }

  const overdue   = isOverdue(task.endDate, localStatus)
  const lbl = "block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2"

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex flex-col bg-white shadow-2xl" style={{ width: 480, borderLeft: "1px solid #E2E8F0" }}>

        {/* Header */}
        <div className="shrink-0 px-6 py-5 border-b border-slate-100"
          style={{ background: "linear-gradient(135deg, rgba(36,99,255,0.03), rgba(139,47,255,0.04))" }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {task.wbsArea && (
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-2 h-2 rounded-full" style={{ background: task.wbsArea.color ?? "#CBD5E1" }} />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{task.wbsArea.name}</span>
                </div>
              )}
              {task.parentTitle && (
                <p className="text-xs text-slate-400 mb-1">
                  <span className="font-semibold">Atividade:</span> {task.parentTitle}
                </p>
              )}
              <h3 className="text-base font-black text-[#0F172A] leading-snug">{task.title}</h3>
              {task.responsible && (
                <div className="flex items-center gap-2 mt-2">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black text-white"
                    style={{ background: avatarColor(task.responsible.name) }}>
                    {initials(task.responsible.name)}
                  </div>
                  <span className="text-xs text-slate-500 font-medium">{task.responsible.name}</span>
                </div>
              )}
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-[#0F172A] transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6" style={{ scrollbarWidth: "thin" }}>

          {/* Status */}
          <div>
            <label className={lbl}>Status</label>
            <div className="flex flex-wrap gap-2">
              {STATUS_CFG.map((opt) => {
                const active = localStatus === opt.value
                return (
                  <button key={opt.value} onClick={() => handleStatus(opt.value)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border"
                    style={active
                      ? { background: opt.hex, color: "#fff", borderColor: "transparent", boxShadow: `0 2px 10px ${opt.hex}40` }
                      : { background: opt.bg, color: opt.hex, borderColor: `${opt.hex}25` }
                    }>
                    {active && <Check className="w-3 h-3" />}
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Progress */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className={lbl} style={{ marginBottom: 0 }}>Progresso</label>
              <span className="text-xl font-black" style={{ color: cfg?.hex ?? "#2463FF" }}>{localProgress}%</span>
            </div>
            <div className="relative h-7 flex items-center">
              <div className="w-full h-3 bg-slate-200 rounded-full absolute" />
              <div className="h-3 rounded-full absolute left-0 transition-all" style={{ width: `${localProgress}%`, background: cfg?.hex ?? "#2463FF" }} />
              <div className="absolute w-5 h-5 rounded-full bg-white shadow-md border-2 -translate-x-1/2"
                style={{ left: `${localProgress}%`, borderColor: cfg?.hex ?? "#2463FF", transition: "left 0.1s" }} />
              <input type="range" min={0} max={100} value={localProgress}
                onChange={(e) => handleProgress(+e.target.value)}
                className="absolute inset-0 w-full opacity-0 cursor-pointer" />
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 mt-1.5 font-medium">
              <span>0%</span><span>50%</span><span>100%</span>
            </div>
          </div>

          {/* Dates */}
          <div>
            <label className={lbl}>Datas Planejadas</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-400 font-semibold mb-1.5">Início</label>
                <input type="date" value={localStartDate} onChange={(e) => setLocalStartDate(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-white text-[#0F172A] outline-none focus:border-[#2463FF] focus:ring-2 focus:ring-blue-50 transition-colors" />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 font-semibold mb-1.5">
                  Fim {overdue && <span className="text-red-500 font-bold">(ATRASADO)</span>}
                </label>
                <input type="date" value={localEndDate} onChange={(e) => setLocalEndDate(e.target.value)}
                  className={`w-full px-3 py-2.5 text-sm rounded-xl border outline-none focus:ring-2 transition-colors ${overdue ? "border-red-300 focus:border-red-400 focus:ring-red-50 bg-red-50" : "border-slate-200 bg-white focus:border-[#2463FF] focus:ring-blue-50"}`} />
              </div>
            </div>
          </div>

          {/* Financeiro */}
          <div>
            <label className={lbl}>Financeiro</label>
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #E2E8F0" }}>
              <div className="flex items-center gap-3 px-4 py-2.5" style={{ background: "#F0FDF4", borderBottom: "1px solid #E2E8F0" }}>
                <span className="text-[10px] font-bold text-emerald-700 w-28 shrink-0">R$ Orçado</span>
                <input
                  type="number" min={0} step={100}
                  value={localBudgetedCost}
                  onChange={(e) => setLocalBudgetedCost(e.target.value)}
                  placeholder="0,00"
                  className="flex-1 text-sm font-bold text-emerald-700 bg-transparent outline-none"
                />
                <span className="text-[10px] text-emerald-400 font-semibold">BRL</span>
              </div>
              <div className="flex items-center gap-3 px-4 py-2.5" style={{ background: "#FFFBEB" }}>
                <span className="text-[10px] font-bold text-amber-700 w-28 shrink-0">R$ Gasto Real</span>
                <input
                  type="number" min={0} step={100}
                  value={localActualCost}
                  onChange={(e) => setLocalActualCost(e.target.value)}
                  placeholder="0,00"
                  className="flex-1 text-sm font-bold text-amber-700 bg-transparent outline-none"
                />
                <span className="text-[10px] text-amber-400 font-semibold">BRL</span>
              </div>
            </div>
          </div>

          {/* Comment */}
          <div>
            <label className={lbl}>Observação desta Reunião</label>
            <textarea value={localComment} onChange={(e) => setLocalComment(e.target.value)}
              placeholder="Decisões, observações e apontamentos desta tarefa neste checkpoint..."
              rows={4}
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-3 resize-none focus:outline-none focus:border-[#2463FF] focus:ring-2 focus:ring-blue-50 text-[#0F172A] placeholder:text-slate-300" />
          </div>

          {/* Attachments */}
          <div>
            <label className={lbl}>Anexos / Evidências</label>
            {localAtts.length > 0 && (
              <div className="space-y-2 mb-3">
                {localAtts.map((att, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50">
                    <Paperclip className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="flex-1 text-xs text-emerald-700 truncate font-medium">{att.fileName}</span>
                    <button onClick={() => setLocalAtts((p) => p.filter((_, j) => j !== i))}
                      className="text-emerald-400 hover:text-red-500 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
              className="w-full flex items-center justify-center gap-2 h-11 rounded-xl border-2 border-dashed border-slate-200 text-sm font-semibold text-slate-400 hover:border-[#2463FF] hover:text-[#2463FF] hover:bg-blue-50/30 transition-all disabled:opacity-50">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
              {uploading ? "Enviando arquivo..." : "Adicionar evidência"}
            </button>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFiles} />
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-6 py-4 border-t border-slate-100 flex gap-3">
          <button onClick={onClose}
            className="flex-1 h-11 text-sm font-semibold rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 inline-flex items-center justify-center gap-2 h-11 text-sm font-bold rounded-xl text-white transition-all disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #2463FF, #8B2FFF)", boxShadow: "0 4px 20px rgba(36,99,255,0.25)" }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Salvar
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CheckpointClient({ project, areas, tasks, projectParticipants, allUsers, history }: CheckpointClientProps) {
  const today = new Date().toISOString().split("T")[0]

  const [frequency,        setFrequency]        = useState<CheckpointFrequency>("WEEKLY")
  const [meetingDate,      setMeetingDate]       = useState(today)
  const [location,         setLocation]         = useState("")
  const [highlights,       setHighlights]       = useState("")
  const [blockers,         setBlockers]         = useState("")
  const [nextSteps,        setNextSteps]        = useState("")
  const [observations,     setObservations]     = useState("")
  // Pré-seleciona automaticamente todos os participantes do projeto
  const [attendeeIds,      setAttendeeIds]       = useState<string[]>(() => projectParticipants.map((p) => p.id))
  const [externalAttendees,setExternalAttendees] = useState<NewParticipant[]>([])
  const [expandedAreas,    setExpandedAreas]    = useState<Set<string>>(new Set(areas.map((a) => a.id)))
  const [saving,           setSaving]           = useState(false)
  const [saved,            setSaved]            = useState(false)
  const [error,            setError]            = useState("")
  const [ataContent,       setAtaContent]       = useState<string | null>(null)
  const [showAta,          setShowAta]          = useState(false)
  const [filterAreaId,     setFilterAreaId]     = useState<string | null>(null)
  const [filterRespId,     setFilterRespId]     = useState<string | null>(null)
  const [filterChanged,    setFilterChanged]    = useState(false)
  const [detailTaskId,     setDetailTaskId]     = useState<string | null>(null)

  const [taskStates, setTaskStates] = useState<Record<string, TaskState>>(() => {
    const init: Record<string, TaskState> = {}
    for (const t of tasks) {
      init[t.id] = {
        status: t.status, progress: t.progress,
        comment: "", commentOpen: false, attachments: [], uploading: false,
        startDate: t.startDate ?? "", endDate: t.endDate ?? "",
        budgetedCost: t.budgetedCost ?? null, actualCost: t.actualCost ?? null,
      }
    }
    return init
  })

  const changedTasks = useMemo(
    () => tasks.filter((t) => {
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

  // Build task hierarchy: top-level tasks per area, with their children
  const taskHierarchy = useMemo(() => {
    const childrenOf = new Map<string | null, Task[]>()
    for (const t of tasks) {
      const key = t.parentId ?? null
      if (!childrenOf.has(key)) childrenOf.set(key, [])
      childrenOf.get(key)!.push(t)
    }
    return childrenOf
  }, [tasks])

  // Group top-level tasks by area
  const topByArea = useMemo(() => {
    const map = new Map<string | null, Task[]>()
    map.set(null, [])
    for (const a of areas) map.set(a.id, [])
    const topLevel = taskHierarchy.get(null) ?? []
    for (const t of topLevel) {
      const key = t.wbsAreaId ?? null
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(t)
    }
    return map
  }, [areas, taskHierarchy])

  function updateTask(id: string, patch: Partial<TaskState>) {
    setTaskStates((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  function toggleArea(id: string) {
    setExpandedAreas((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleAttendee(id: string) {
    setAttendeeIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }


  // Filter tasks helper
  function matchesFilters(t: Task): boolean {
    if (filterAreaId && t.wbsAreaId !== filterAreaId) return false
    if (filterRespId && t.responsible?.id !== filterRespId) return false
    if (filterChanged) {
      const s = taskStates[t.id]
      if (!s || (s.status === t.status && s.progress === t.progress && !s.comment.trim() && !s.attachments.length)) return false
    }
    return true
  }

  async function handleSave() {
    if (saving) return
    setSaving(true)
    setError("")
    try {
      const result = await saveCheckpoint({
        projectId: project.id,
        date:      meetingDate,
        frequency,
        location,
        highlights,
        blockers,
        nextSteps,
        observations,
        attendeeIds,
        externalAttendeesStr: externalAttendees.map((e) => `${e.name}${e.area ? ` (${e.area})` : ""}`).join(", "),
        taskUpdates: changedTasks.map((t) => ({
          taskId:      t.id,
          title:       t.title,
          areaName:    t.wbsArea?.name ?? "—",
          responsible: t.responsible?.name ?? "—",
          startDate:   t.startDate ?? null,
          endDate:     t.endDate   ?? null,
          oldStatus:   t.status,
          oldProgress: t.progress,
          status:      taskStates[t.id].status,
          progress:    taskStates[t.id].progress,
          comment:     taskStates[t.id].comment.trim() || undefined,
          attachments: taskStates[t.id].attachments.length ? taskStates[t.id].attachments : undefined,
        })),
      })
      if (result.ataContent) setAtaContent(result.ataContent)
      setSaved(true)
    } catch (e) {
      console.error(e)
      setError("Erro ao registrar o checkpoint. Tente novamente.")
    } finally {
      setSaving(false)
    }
  }

  // ── Success screen ──────────────────────────────────────────────────────────

  if (saved) {
    return (
      <>
        <div className="flex-1 flex flex-col items-center justify-center gap-8 p-8 bg-[#F8FAFC]">
          <div className="w-24 h-24 rounded-3xl flex items-center justify-center shadow-2xl"
            style={{ background: "linear-gradient(135deg, #10B981, #059669)", boxShadow: "0 20px 60px rgba(16,185,129,0.35)" }}>
            <CheckCircle2 className="w-12 h-12 text-white" />
          </div>

          <div className="text-center">
            <h2 className="text-3xl font-black text-[#0F172A]">Checkpoint Registrado!</h2>
            <p className="text-slate-400 mt-2 font-medium">
              {FREQ_LABELS[frequency]} · {format(new Date(meetingDate + "T12:00:00"), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </p>
          </div>

          {stats.changed > 0 && (
            <div className="flex gap-4 flex-wrap justify-center">
              {[
                { label: "Atualizadas", value: stats.changed,    color: "#2463FF", bg: "#EFF6FF", border: "#BFDBFE" },
                { label: "Concluídas",  value: stats.completed,  color: "#10B981", bg: "#ECFDF5", border: "#A7F3D0" },
                { label: "Atrasadas",   value: stats.delayed,    color: "#EF4444", bg: "#FEF2F2", border: "#FECACA" },
                { label: "Em Andamento",value: stats.inProgress, color: "#F59E0B", bg: "#FFFBEB", border: "#FDE68A" },
              ].filter((s) => s.value > 0).map(({ label, value, color, bg, border }) => (
                <div key={label} className="px-6 py-4 rounded-2xl text-center" style={{ background: bg, border: `1px solid ${border}` }}>
                  <p className="text-3xl font-black" style={{ color }}>{value}</p>
                  <p className="text-xs text-slate-500 mt-1 font-semibold">{label}</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3 flex-wrap justify-center">
            <Link href={`/projects/${project.id}`}
              className="inline-flex items-center gap-2 px-6 h-11 rounded-xl border border-slate-200 text-sm font-semibold text-[#0F172A] hover:bg-slate-50 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Voltar ao Projeto
            </Link>
            {ataContent && (
              <button onClick={() => setShowAta(true)}
                className="inline-flex items-center gap-2 px-6 h-11 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #2463FF, #1d4ed8)", boxShadow: "0 4px 20px rgba(36,99,255,0.3)" }}>
                <FileText className="w-4 h-4" /> Ver ATA Gerada
              </button>
            )}
            <Link href={`/projects/${project.id}/schedule`}
              className="inline-flex items-center gap-2 px-6 h-11 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #0F172A, #1E293B)", boxShadow: "0 4px 20px rgba(15,23,42,0.25)" }}>
              Ver Cronograma <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {showAta && ataContent && (
          <MeetingAtaModal
            content={ataContent}
            title={`ATA — Checkpoint ${FREQ_LABELS[frequency]} — ${format(new Date(meetingDate + "T12:00:00"), "dd/MM/yyyy")}`}
            onClose={() => setShowAta(false)}
          />
        )}
      </>
    )
  }

  // ── Main UI ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-[#F0F4F8]">

      {/* ── Header ── */}
      <div className="shrink-0 bg-white border-b border-slate-100 px-6 py-3.5" style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <div className="max-w-7xl mx-auto flex items-center gap-4 flex-wrap">
          <Link href={`/projects/${project.id}`}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-[#0F172A] transition-colors font-medium group shrink-0">
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            Projeto
          </Link>
          <div className="w-px h-5 bg-slate-200 shrink-0" />
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #2463FF, #8B2FFF)" }}>
              <RefreshCw className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest leading-none">CHECKPOINT</p>
              <p className="text-sm font-black text-[#0F172A] leading-tight">{project.title}</p>
            </div>
          </div>
          <div className="flex-1" />

          {/* Frequency */}
          <div className="flex items-center gap-0.5 p-1 rounded-xl bg-slate-100 shrink-0">
            {FREQ_OPTIONS.map((f) => (
              <button key={f.value} onClick={() => setFrequency(f.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${frequency === f.value ? "bg-white text-[#0F172A] shadow-sm" : "text-slate-400 hover:text-slate-600"}`}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Changed stats */}
          {stats.changed > 0 && (
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-bold border border-blue-100">{stats.changed} alteradas</span>
              {stats.completed > 0 && <span className="px-2.5 py-1 bg-green-50 text-green-700 rounded-full text-xs font-bold border border-green-100">✓ {stats.completed}</span>}
              {stats.delayed   > 0 && <span className="px-2.5 py-1 bg-red-50 text-red-700 rounded-full text-xs font-bold border border-red-100">! {stats.delayed}</span>}
            </div>
          )}

          <button onClick={handleSave} disabled={saving}
            className="inline-flex items-center gap-2 px-5 h-9 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 shrink-0"
            style={{ background: "linear-gradient(135deg, #10B981, #059669)", boxShadow: "0 4px 20px rgba(16,185,129,0.30)" }}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            Registrar Checkpoint
          </button>
        </div>
      </div>

      {error && (
        <div className="px-6 py-3 bg-red-50 border-b border-red-100 text-sm text-red-700 font-medium flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />{error}
          <button onClick={() => setError("")} className="ml-auto text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ── Body ── */}
      <div className="flex-1 overflow-hidden flex">

        {/* Left sidebar */}
        <div className="w-[300px] shrink-0 bg-white border-r border-slate-100 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          <div className="p-5 space-y-5">

            {/* Meeting details */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1.5">
                <Clock className="w-3 h-3" /> Detalhes da Reunião
              </p>
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1.5">Data</label>
                  <input type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)}
                    className="w-full h-9 px-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-50 bg-white" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1.5">Local / Link</label>
                  <input type="text" value={location} onChange={(e) => setLocation(e.target.value)}
                    placeholder="Sala de reuniões, Teams, Zoom..."
                    className="w-full h-9 px-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-50 placeholder:text-slate-300" />
                </div>
              </div>
            </div>

            {/* Highlights */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 block mb-1.5">Destaques e Conquistas</label>
              <textarea value={highlights} onChange={(e) => setHighlights(e.target.value)}
                placeholder="O que foi entregue? Pontos positivos..."
                rows={3}
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-50 placeholder:text-slate-300" />
            </div>

            {/* Blockers */}
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
                <label className="text-[11px] font-semibold text-slate-500">Impedimentos</label>
              </div>
              <textarea value={blockers} onChange={(e) => setBlockers(e.target.value)}
                placeholder="O que está bloqueando o progresso?"
                rows={3}
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-50 placeholder:text-slate-300" />
            </div>

            {/* Next steps */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 block mb-1.5">Próximos Passos</label>
              <textarea value={nextSteps} onChange={(e) => setNextSteps(e.target.value)}
                placeholder="O que será feito até o próximo checkpoint?"
                rows={3}
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-50 placeholder:text-slate-300" />
            </div>

            {/* Observations */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 block mb-1.5">Observações</label>
              <textarea value={observations} onChange={(e) => setObservations(e.target.value)}
                placeholder="Comentários livres sobre esta reunião (aparecerá na ATA)..."
                rows={3}
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-50 placeholder:text-slate-300" />
            </div>

            {/* Attendees — novo picker com fotos e pré-seleção */}
            <MeetingParticipantPicker
              projectParticipants={projectParticipants}
              allUsers={allUsers}
              selectedIds={attendeeIds}
              onChange={setAttendeeIds}
              externalAttendees={externalAttendees}
              onAddExternal={(p) => setExternalAttendees((prev) => [...prev, p])}
              onRemoveExternal={(id) => setExternalAttendees((p) => p.filter((e) => e.id !== id))}
            />

            {/* Stats */}
            <div className="pt-3 border-t border-slate-100">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Resumo da Reunião</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Total",      value: stats.total,     hex: "#64748B" },
                  { label: "Alteradas",  value: stats.changed,   hex: "#2463FF" },
                  { label: "Concluídas", value: stats.completed, hex: "#10B981" },
                  { label: "Atrasadas",  value: stats.delayed,   hex: "#EF4444" },
                ].map(({ label, value, hex }) => (
                  <div key={label} className="p-3 rounded-xl" style={{ background: "#F8FAFC", border: "1px solid #F1F5F9" }}>
                    <p className="text-xl font-black" style={{ color: hex }}>{value}</p>
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
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Histórico</p>
                </div>
                <div className="space-y-2">
                  {history.slice(0, 5).map((h) => (
                    <div key={h.id} className="flex items-start gap-2.5 p-2.5 rounded-xl" style={{ background: "#F8FAFC" }}>
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[#0F172A] truncate">{h.title}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {format(new Date(h.date), "dd/MM/yyyy", { locale: ptBR })} · {h._count.participants} part.
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: task area */}
        <div className="flex-1 flex flex-col min-h-0">

          {/* Filter bar */}
          {tasks.length > 0 && (
            <div className="shrink-0 bg-white border-b border-slate-100 px-5 py-3 flex flex-wrap gap-x-5 gap-y-2 items-center">
              <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-wider shrink-0">
                <Filter className="w-3 h-3" /> Filtros
              </div>

              {areas.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-slate-400 font-semibold shrink-0">Área:</span>
                  <button onClick={() => setFilterAreaId(null)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ${filterAreaId === null ? "text-white border-transparent bg-[#0F172A]" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                    Todas
                  </button>
                  {areas.map((area) => {
                    const active = filterAreaId === area.id
                    return (
                      <button key={area.id} onClick={() => setFilterAreaId(active ? null : area.id)}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ${active ? "text-white border-transparent" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"}`}
                        style={active ? { background: area.color ?? "#6B7280" } : {}}>
                        {!active && <div className="w-1.5 h-1.5 rounded-full" style={{ background: area.color ?? "#CBD5E1" }} />}
                        {area.name}
                      </button>
                    )
                  })}
                </div>
              )}

              {uniqueResponsibles.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-slate-400 font-semibold shrink-0">Responsável:</span>
                  <button onClick={() => setFilterRespId(null)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ${filterRespId === null ? "bg-[#0F172A] text-white border-transparent" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                    Todos
                  </button>
                  {uniqueResponsibles.map((r) => {
                    const active = filterRespId === r.id
                    return (
                      <button key={r.id} onClick={() => setFilterRespId(active ? null : r.id)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ${active ? "text-white border-transparent" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"}`}
                        style={active ? { background: "linear-gradient(135deg, #2463FF, #8B2FFF)" } : {}}>
                        <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-black ${active ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"}`}>
                          {initials(r.name)}
                        </span>
                        {r.name.split(" ")[0]}
                      </button>
                    )
                  })}
                </div>
              )}

              <button
                onClick={() => setFilterChanged(!filterChanged)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ml-auto ${filterChanged ? "bg-blue-600 text-white border-transparent" : "bg-white border-slate-200 text-slate-500 hover:border-blue-300"}`}>
                {filterChanged ? <Check className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                Só alteradas
              </button>
            </div>
          )}

          {/* Task list */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4" style={{ scrollbarWidth: "thin" }}>
            {tasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 gap-3 bg-white rounded-2xl" style={{ border: "1px solid #E2E8F0" }}>
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
                  const areaTopTasks = (topByArea.get(area.id) ?? []).filter((t) => {
                    // Area task matches if it itself or any child matches filters
                    const selfMatch = !filterRespId || t.responsible?.id === filterRespId
                    const children  = taskHierarchy.get(t.id) ?? []
                    const childMatch = children.some((c) => !filterRespId || c.responsible?.id === filterRespId)
                    return selfMatch || childMatch
                  })
                  if (areaTopTasks.length === 0) return null

                  const isExpanded = expandedAreas.has(area.id)
                  const areaChanged = areaTopTasks.reduce((sum, t) => {
                    const direct = (taskStates[t.id] && (taskStates[t.id].status !== t.status || taskStates[t.id].progress !== t.progress || taskStates[t.id].comment.trim() || taskStates[t.id].attachments.length)) ? 1 : 0
                    const children = (taskHierarchy.get(t.id) ?? []).filter((c) => taskStates[c.id] && (taskStates[c.id].status !== c.status || taskStates[c.id].progress !== c.progress || taskStates[c.id].comment.trim() || taskStates[c.id].attachments.length)).length
                    return sum + direct + children
                  }, 0)

                  return (
                    <div key={area.id} className="rounded-2xl overflow-hidden bg-white" style={{ border: "1px solid #E2E8F0", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                      {/* Area header */}
                      <button onClick={() => toggleArea(area.id)}
                        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50/80 transition-colors"
                        style={{ borderBottom: isExpanded ? "1px solid #F1F5F9" : "none" }}>
                        <div className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: area.color ?? "#6B7280" }} />
                        <span className="text-sm font-bold text-[#0F172A]">{area.name}</span>
                        <span className="text-xs text-slate-400 font-medium">{areaTopTasks.length} atividade{areaTopTasks.length !== 1 ? "s" : ""}</span>
                        {areaChanged > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100">
                            {areaChanged} alteradas
                          </span>
                        )}
                        <div className="flex-1" />
                        {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                      </button>

                      {isExpanded && (
                        <div className="p-3 space-y-2">
                          {areaTopTasks.map((parentTask) => {
                            const children = taskHierarchy.get(parentTask.id) ?? []
                            const parentState = taskStates[parentTask.id] ?? { status: parentTask.status, progress: parentTask.progress, comment: "", commentOpen: false, attachments: [], uploading: false, startDate: parentTask.startDate ?? "", endDate: parentTask.endDate ?? "" }
                            if (filterChanged && !changedTasks.find(ct => ct.id === parentTask.id) && !children.some(c => changedTasks.find(ct => ct.id === c.id))) return null

                            return (
                              <div key={parentTask.id} className="space-y-2">
                                {/* Parent task */}
                                <TaskCard
                                  task={parentTask}
                                  state={parentState}
                                  original={{ status: parentTask.status, progress: parentTask.progress }}
                                  isChild={false}
                                  onUpdate={updateTask}
                                  onOpenDetail={() => setDetailTaskId(parentTask.id)}
                                />

                                {/* Children tasks */}
                                {children.filter((c) => {
                                  if (filterRespId && c.responsible?.id !== filterRespId) return false
                                  if (filterChanged && !changedTasks.find(ct => ct.id === c.id)) return false
                                  return true
                                }).map((childTask) => {
                                  const childState = taskStates[childTask.id] ?? { status: childTask.status, progress: childTask.progress, comment: "", commentOpen: false, attachments: [], uploading: false, startDate: childTask.startDate ?? "", endDate: childTask.endDate ?? "" }
                                  return (
                                    <TaskCard
                                      key={childTask.id}
                                      task={childTask}
                                      state={childState}
                                      original={{ status: childTask.status, progress: childTask.progress }}
                                      isChild
                                      onUpdate={updateTask}
                                      onOpenDetail={() => setDetailTaskId(childTask.id)}
                                    />
                                  )
                                })}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Unassigned area tasks */}
                {!filterAreaId && (() => {
                  const unassigned = (topByArea.get(null) ?? []).filter((t) => !filterRespId || t.responsible?.id === filterRespId)
                  if (unassigned.length === 0) return null
                  return (
                    <div className="rounded-2xl overflow-hidden bg-white" style={{ border: "1px solid #E2E8F0" }}>
                      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-50 bg-slate-50/80">
                        <Lock className="w-3.5 h-3.5 text-slate-300" />
                        <span className="text-sm font-bold text-[#0F172A]">Sem Área</span>
                        <span className="text-xs text-slate-400 font-medium">{unassigned.length} atividade{unassigned.length !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="p-3 space-y-2">
                        {unassigned.map((t) => {
                          const state = taskStates[t.id] ?? { status: t.status, progress: t.progress, comment: "", commentOpen: false, attachments: [], uploading: false, startDate: t.startDate ?? "", endDate: t.endDate ?? "" }
                          return (
                            <TaskCard key={t.id} task={t} state={state} original={{ status: t.status, progress: t.progress }}
                              isChild={false} onUpdate={updateTask} onOpenDetail={() => setDetailTaskId(t.id)} />
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Task Detail Panel */}
      {detailTaskId && (() => {
        const dt = tasks.find((t) => t.id === detailTaskId)
        if (!dt) return null
        return (
          <TaskDetailPanel
            task={dt}
            state={taskStates[detailTaskId] ?? { status: dt.status, progress: dt.progress, comment: "", commentOpen: false, attachments: [], uploading: false, startDate: dt.startDate ?? "", endDate: dt.endDate ?? "" }}
            projectId={project.id}
            onSave={(patch) => updateTask(detailTaskId, patch)}
            onClose={() => setDetailTaskId(null)}
          />
        )
      })()}
    </div>
  )
}
