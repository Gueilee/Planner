"use client"

import {
  useState, useRef, useMemo, useTransition, useCallback, useEffect,
} from "react"
import Link from "next/link"
import {
  parseISO, format, differenceInDays, startOfMonth, endOfMonth,
  eachMonthOfInterval, addMonths, subMonths, addDays, subDays,
  isSaturday, isSunday, min, max, isAfter, isBefore, eachWeekOfInterval,
} from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  ArrowLeft, Plus, ChevronRight, ChevronDown, Pencil, Trash2,
  Loader2, X, Check, CalendarDays, AlertTriangle, Layers,
  List, BarChart2, Search, FolderOpen, Paperclip,
} from "lucide-react"
import {
  createTask, updateTask, deleteTask, createArea,
  getTaskAttachments, addTaskAttachments,
  type AttachmentUpload,
} from "@/lib/actions/schedule"

// ─── Constants ────────────────────────────────────────────────────────────────

const ROW_H   = 40
const HDR_H   = 64
const LEFT_W  = 600
const BAR_H   = 24
const BAR_PAD = 8

const DAY_PX = { month: 5, week: 16, day: 30 } as const
type Zoom = keyof typeof DAY_PX

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  PLANNING:    { label: "Em Planejamento", color: "#64748B", bg: "#F8FAFC", dot: "#94A3B8" },
  IN_PROGRESS: { label: "Em Andamento",   color: "#2463FF", bg: "#EFF6FF", dot: "#2463FF" },
  COMPLETED:   { label: "Concluído",      color: "#10B981", bg: "#ECFDF5", dot: "#10B981" },
  DELAYED:     { label: "Atrasado",       color: "#EF4444", bg: "#FEF2F2", dot: "#EF4444" },
  VALIDATION:  { label: "Validação",      color: "#8B5CF6", bg: "#F5F3FF", dot: "#8B5CF6" },
  ON_HOLD:     { label: "Pausada",        color: "#F59E0B", bg: "#FFFBEB", dot: "#F59E0B" },
}

const STATUS_CYCLE = ["PLANNING", "IN_PROGRESS", "VALIDATION", "COMPLETED", "DELAYED", "ON_HOLD"] as const
const FORM_STATUSES = ["PLANNING", "IN_PROGRESS", "COMPLETED", "DELAYED", "VALIDATION", "ON_HOLD"] as const

const AREA_PALETTE = [
  "#7B2FBE","#2463FF","#10B981","#F59E0B",
  "#EF4444","#0891B2","#8B5CF6","#EC4899",
  "#16A34A","#EA580C","#0D9488","#9333EA",
]

// ─── Types ────────────────────────────────────────────────────────────────────

type Task = {
  id: string; projectId: string; wbsAreaId: string | null; parentId: string | null
  title: string; description: string | null; responsibleId: string | null
  responsible: { id: string; name: string } | null
  wbsArea: { id: string; name: string; color: string | null } | null
  startDate: string | null; endDate: string | null; status: string
  progress: number; order: number; dependencies: string[]
  _count: { comments: number; attachments: number }
}
type FlatTask = Task & { depth: number; hasChildren: boolean }
type Area   = { id: string; name: string; color: string | null }
type Member = { id: string; name: string; department: string | null }

type ARow = { kind: "area"; id: string; name: string; color: string | null; eap: string; taskCount: number; doneCount: number }
type TRow = { kind: "task"; task: Task; eap: string; depth: number; hasChildren: boolean; areaColor: string | null }
type Row = ARow | TRow

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
}

function taskColor(t: Task): string {
  if (t.status === "DELAYED") return "#EF4444"
  if (t.status === "COMPLETED") return "#10B981"
  return t.wbsArea?.color ?? STATUS_CFG[t.status]?.color ?? "#64748B"
}

function isAutoDelayed(t: Task): boolean {
  if (t.status === "COMPLETED" || t.status === "DELAYED") return false
  if (!t.endDate) return false
  return new Date(t.endDate) < new Date()
}

function fmtDate(ds: string | null) {
  return ds ? format(parseISO(ds), "dd/MM/yy") : "—"
}

function flattenTasks(tasks: Task[], expanded: Set<string>): FlatTask[] {
  const children = new Map<string | null, Task[]>()
  for (const t of tasks) {
    const k = t.parentId ?? null
    if (!children.has(k)) children.set(k, [])
    children.get(k)!.push(t)
  }
  const sort = (arr: Task[]) => [...arr].sort((a, b) => a.order - b.order)
  const result: FlatTask[] = []
  function walk(pid: string | null, depth: number) {
    for (const t of sort(children.get(pid) ?? [])) {
      const hasChildren = (children.get(t.id) ?? []).length > 0
      result.push({ ...t, depth, hasChildren })
      if (hasChildren && expanded.has(t.id)) walk(t.id, depth + 1)
    }
  }
  walk(null, 0)
  return result
}

function buildListRows(
  areas: Area[],
  tasks: Task[],
  expandedAreas: Set<string>,
  expandedTasks: Set<string>,
  search: string,
  hideDone: boolean,
): Row[] {
  const q = search.trim().toLowerCase()
  const result: Row[] = []

  const childrenMap = new Map<string, Task[]>()
  for (const t of tasks) {
    if (!t.parentId) continue
    if (!childrenMap.has(t.parentId)) childrenMap.set(t.parentId, [])
    childrenMap.get(t.parentId)!.push(t)
  }
  const sortBy = (arr: Task[]) => [...arr].sort((a, b) => a.order - b.order)

  function matches(t: Task) {
    if (hideDone && t.status === "COMPLETED") return false
    if (q && !t.title.toLowerCase().includes(q)) return false
    return true
  }

  function walkTask(t: Task, depth: number, eap: string, areaColor: string | null) {
    const kids = sortBy(childrenMap.get(t.id) ?? [])
    result.push({ kind: "task", task: t, eap, depth, hasChildren: kids.length > 0, areaColor })
    if (kids.length > 0 && expandedTasks.has(t.id)) {
      kids.forEach((k, i) => {
        if (matches(k)) walkTask(k, depth + 1, `${eap}.${i + 1}`, areaColor)
      })
    }
  }

  const topByArea = new Map<string | null, Task[]>()
  for (const t of tasks) {
    if (t.parentId) continue
    const k = t.wbsAreaId ?? null
    if (!topByArea.has(k)) topByArea.set(k, [])
    topByArea.get(k)!.push(t)
  }

  areas.forEach((area, aIdx) => {
    const eapArea = `${aIdx + 1}`
    const areaTasks = tasks.filter((t) => t.wbsAreaId === area.id)
    const doneCount = areaTasks.filter((t) => t.status === "COMPLETED").length
    result.push({ kind: "area", id: area.id, name: area.name, color: area.color, eap: eapArea, taskCount: areaTasks.length, doneCount })
    if (!expandedAreas.has(area.id)) return
    sortBy(topByArea.get(area.id) ?? []).forEach((t, i) => {
      if (matches(t)) walkTask(t, 0, `${eapArea}.${i + 1}`, area.color)
    })
  })

  const ungrouped = sortBy(topByArea.get(null) ?? [])
  if (ungrouped.length > 0) {
    const ugId = "__ungrouped__"
    const ugEap = `${areas.length + 1}`
    result.push({ kind: "area", id: ugId, name: "Sem Área", color: null, eap: ugEap, taskCount: ungrouped.length, doneCount: ungrouped.filter((t) => t.status === "COMPLETED").length })
    if (expandedAreas.has(ugId)) {
      ungrouped.forEach((t, i) => {
        if (matches(t)) walkTask(t, 0, `${ugEap}.${i + 1}`, null)
      })
    }
  }

  return result
}

// ─── Task Form (side panel) ───────────────────────────────────────────────────

interface TaskFormProps {
  mode: "add" | "edit"
  initial: Partial<Task> & { projectId: string }
  areas: Area[]
  members: Member[]
  allTasks: Task[]
  onSave: (t: Task) => void
  onDelete?: () => void
  onClose: () => void
}

function TaskForm({ mode, initial, areas, members, allTasks, onSave, onDelete, onClose }: TaskFormProps) {
  const [pending, start] = useTransition()
  const [form, setForm] = useState({
    title:         initial.title         ?? "",
    description:   initial.description   ?? "",
    wbsAreaId:     initial.wbsAreaId     ?? "",
    responsibleId: initial.responsibleId ?? "",
    parentId:      initial.parentId      ?? "",
    startDate:     initial.startDate?.slice(0, 10) ?? "",
    endDate:       initial.endDate?.slice(0, 10)   ?? "",
    status:        initial.status        ?? "PLANNING",
    progress:      initial.progress      ?? 0,
    dependencies:  initial.dependencies  ?? [] as string[],
  })

  // ── Attachments ──────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [existingAtts, setExistingAtts] = useState<{ id: string; fileName: string; fileUrl: string }[]>([])
  const [newAtts,      setNewAtts]      = useState<AttachmentUpload[]>([])
  const [uploading,    setUploading]    = useState(false)

  useEffect(() => {
    if (mode === "edit" && initial.id) {
      getTaskAttachments(initial.id).then(setExistingAtts).catch(() => {})
    }
  }, [mode, initial.id])

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
      const uploaded: AttachmentUpload[] = json.files.map((f, i) => ({
        fileName: f.name,
        fileUrl:  f.url,
        fileType: files[i]?.type ?? "application/octet-stream",
        fileSize: f.size,
      }))
      setNewAtts((prev) => [...prev, ...uploaded])
    } catch { /* ignore */ }
    setUploading(false)
  }

  // ─────────────────────────────────────────────────────────────────────────

  const upd = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const toggleDep = (id: string) =>
    upd("dependencies", form.dependencies.includes(id)
      ? form.dependencies.filter((d) => d !== id)
      : [...form.dependencies, id])

  function handleSubmit() {
    if (!form.title.trim()) return
    start(async () => {
      const data = {
        projectId:     initial.projectId,
        title:         form.title,
        description:   form.description || null,
        wbsAreaId:     form.wbsAreaId   || null,
        responsibleId: form.responsibleId || null,
        parentId:      form.parentId    || null,
        startDate:     form.startDate   || null,
        endDate:       form.endDate     || null,
        status:        form.status,
        progress:      form.progress,
        dependencies:  form.dependencies,
      }
      const result = mode === "edit" && initial.id
        ? await updateTask(initial.id, initial.projectId, data)
        : await createTask(data)

      if (newAtts.length > 0) {
        await addTaskAttachments(result.id, initial.projectId, newAtts)
      }

      onSave(result as Task)
    })
  }

  const parentOptions = allTasks.filter((t) => t.id !== initial.id && !t.parentId)
  const inputCls = "w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white text-[#0F172A] outline-none focus:border-[#7B2FBE] transition-colors"
  const labelCls = "block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5"

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex flex-col bg-white shadow-2xl" style={{ width: 400, borderLeft: "1px solid #E2E8F0" }}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h3 className="font-black text-[#0F172A] text-sm">
          {mode === "add" ? "Nova Atividade" : "Editar Atividade"}
        </h3>
        <button onClick={onClose} className="text-slate-400 hover:text-[#0F172A] transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div>
          <label className={labelCls}>Atividade *</label>
          <input value={form.title} onChange={(e) => upd("title", e.target.value)} className={inputCls} placeholder="Nome da atividade" />
        </div>

        <div>
          <label className={labelCls}>Área / Módulo</label>
          <select value={form.wbsAreaId} onChange={(e) => upd("wbsAreaId", e.target.value)} className={inputCls}>
            <option value="">— Sem área —</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        <div>
          <label className={labelCls}>Responsável</label>
          <select value={form.responsibleId} onChange={(e) => upd("responsibleId", e.target.value)} className={inputCls}>
            <option value="">— Sem responsável —</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}{m.department ? ` (${m.department})` : ""}</option>)}
          </select>
        </div>

        <div>
          <label className={labelCls}>Tarefa Pai (subtarefa)</label>
          <select value={form.parentId} onChange={(e) => upd("parentId", e.target.value)} className={inputCls}>
            <option value="">— Tarefa raiz —</option>
            {parentOptions.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Data Inicial</label>
            <input type="date" value={form.startDate} onChange={(e) => upd("startDate", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Data Final</label>
            <input type="date" value={form.endDate} onChange={(e) => upd("endDate", e.target.value)} className={inputCls} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Status</label>
            <select value={form.status} onChange={(e) => upd("status", e.target.value)} className={inputCls}>
              {FORM_STATUSES.map((k) => <option key={k} value={k}>{STATUS_CFG[k].label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Progresso (%)</label>
            <input type="number" min={0} max={100} value={form.progress}
              onChange={(e) => upd("progress", Math.min(100, Math.max(0, Number(e.target.value))))}
              className={inputCls} />
          </div>
        </div>

        <div>
          <label className={labelCls}>Descrição / Observações</label>
          <textarea value={form.description} onChange={(e) => upd("description", e.target.value)}
            rows={3} placeholder="Anotações, contexto, observações..."
            className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white text-[#0F172A] outline-none focus:border-[#7B2FBE] transition-colors resize-none"
          />
        </div>

        {/* ── Attachments ── */}
        <div>
          <label className={labelCls}>Anexos</label>

          {/* Existing */}
          {existingAtts.length > 0 && (
            <div className="space-y-1.5 mb-2">
              {existingAtts.map((att) => (
                <a
                  key={att.id}
                  href={att.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:border-[#7B2FBE] hover:bg-violet-50 transition-all group"
                >
                  <Paperclip className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#7B2FBE] shrink-0 transition-colors" />
                  <span className="flex-1 text-xs text-slate-600 group-hover:text-[#7B2FBE] truncate transition-colors">{att.fileName}</span>
                </a>
              ))}
            </div>
          )}

          {/* Newly added (not yet saved) */}
          {newAtts.map((att, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 mb-1.5"
            >
              <Paperclip className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span className="flex-1 text-xs text-emerald-700 truncate">{att.fileName}</span>
              <button
                type="button"
                onClick={() => setNewAtts((prev) => prev.filter((_, j) => j !== i))}
                className="text-emerald-400 hover:text-red-500 transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          {/* Upload button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full flex items-center justify-center gap-2 h-9 rounded-xl border border-dashed border-slate-300 text-xs font-semibold text-slate-400 hover:border-[#7B2FBE] hover:text-[#7B2FBE] transition-all disabled:opacity-50"
          >
            {uploading
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Paperclip className="w-3.5 h-3.5" />
            }
            {uploading ? "Enviando..." : "Adicionar arquivo"}
          </button>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFiles} />
        </div>

        {allTasks.filter((t) => t.id !== initial.id && !t.parentId).length > 0 && (
          <div>
            <label className={labelCls}>Dependências</label>
            <div className="space-y-1 max-h-40 overflow-y-auto rounded-xl border border-slate-200 p-2">
              {allTasks.filter((t) => t.id !== initial.id && !t.parentId).map((t) => {
                const sel = form.dependencies.includes(t.id)
                return (
                  <button key={t.id} onClick={() => toggleDep(t.id)}
                    className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-left text-xs transition-all ${sel ? "bg-violet-50 text-[#7B2FBE]" : "hover:bg-slate-50 text-slate-600"}`}>
                    <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${sel ? "bg-[#7B2FBE] border-[#7B2FBE]" : "border-slate-300"}`}>
                      {sel && <Check className="w-2.5 h-2.5 text-white" />}
                    </div>
                    <span className="truncate">{t.title}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div className="px-5 py-4 border-t border-slate-100 flex items-center gap-2">
        {mode === "edit" && onDelete && (
          <button onClick={onDelete} disabled={pending}
            className="p-2 rounded-xl text-slate-300 hover:text-red-400 hover:bg-red-50 transition-all">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
        <div className="flex-1" />
        <button onClick={onClose} className="px-4 h-9 text-sm font-semibold rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all">
          Cancelar
        </button>
        <button onClick={handleSubmit} disabled={pending || !form.title.trim()}
          className="inline-flex items-center gap-2 px-4 h-9 text-sm font-bold rounded-xl text-white transition-all disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #7B2FBE, #2463FF)" }}>
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {mode === "add" ? "Adicionar" : "Salvar"}
        </button>
      </div>
    </div>
  )
}

// ─── Area Form ────────────────────────────────────────────────────────────────

function AreaForm({ projectId, onSave, onClose }: { projectId: string; onSave: (a: Area) => void; onClose: () => void }) {
  const [name, setName] = useState("")
  const [color, setColor] = useState(AREA_PALETTE[0])
  const [pending, start] = useTransition()

  function handleSubmit() {
    if (!name.trim()) return
    start(async () => {
      const area = await createArea(projectId, name.trim(), color)
      onSave(area)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-96 p-6" style={{ border: "1px solid #E2E8F0" }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-black text-[#0F172A] text-sm">Nova Área / Módulo</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Nome da Área</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Infraestrutura, Treinamento..."
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none focus:border-[#7B2FBE] transition-colors"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Cor</label>
            <div className="flex flex-wrap gap-2">
              {AREA_PALETTE.map((c) => (
                <button key={c} onClick={() => setColor(c)}
                  style={{ background: c, width: 28, height: 28, borderRadius: 8, border: color === c ? "3px solid #0F172A" : "2px solid transparent", transition: "border 0.1s" }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 h-9 text-sm font-semibold rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={pending || !name.trim()}
            className="inline-flex items-center gap-2 px-4 h-9 text-sm font-bold rounded-xl text-white disabled:opacity-50 transition-all"
            style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}>
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Criar Área
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Gantt Header ─────────────────────────────────────────────────────────────

function GanttHeader({ ganttStart, ganttEnd, dayWidth, zoom }: {
  ganttStart: Date; ganttEnd: Date; dayWidth: number; zoom: Zoom
}) {
  const months = eachMonthOfInterval({ start: ganttStart, end: ganttEnd })
  const weeks  = zoom !== "day"
    ? eachWeekOfInterval({ start: ganttStart, end: ganttEnd }, { weekStartsOn: 1 })
    : null

  function dateX(d: Date) { return differenceInDays(d, ganttStart) * dayWidth }

  return (
    <div style={{ position: "relative", height: HDR_H, minWidth: "100%" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 32, background: "#0F172A", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        {months.map((m) => {
          const mStart = startOfMonth(m); const mEnd = endOfMonth(m)
          const vStart = isAfter(mStart, ganttStart) ? mStart : ganttStart
          const vEnd   = isBefore(mEnd, ganttEnd)   ? mEnd   : ganttEnd
          const left   = dateX(vStart)
          const width  = (differenceInDays(vEnd, vStart) + 1) * dayWidth
          if (width < 4) return null
          return (
            <div key={m.toISOString()} style={{ position: "absolute", left, width, top: 0, height: 32, display: "flex", alignItems: "center", paddingLeft: 10, overflow: "hidden", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: "rgba(248,250,252,0.80)", whiteSpace: "nowrap", textTransform: "capitalize" }}>
                {format(m, zoom === "month" ? "MMMM yyyy" : "MMM yyyy", { locale: ptBR })}
              </span>
            </div>
          )
        })}
      </div>

      <div style={{ position: "absolute", top: 32, left: 0, right: 0, height: 32, background: "#1E293B", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        {zoom === "day" ? (
          Array.from({ length: differenceInDays(ganttEnd, ganttStart) + 1 }).map((_, i) => {
            const d = addDays(ganttStart, i)
            const isWE = isSaturday(d) || isSunday(d)
            return (
              <div key={i} style={{ position: "absolute", left: i * dayWidth, width: dayWidth, height: 32, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", borderRight: "1px solid rgba(255,255,255,0.04)", background: isWE ? "rgba(255,255,255,0.04)" : "transparent" }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: isWE ? "rgba(248,250,252,0.35)" : "rgba(248,250,252,0.55)" }}>
                  {format(d, "EEE", { locale: ptBR }).slice(0, 1).toUpperCase()}
                </span>
                <span style={{ fontSize: 10, fontWeight: 600, color: isWE ? "rgba(248,250,252,0.30)" : "rgba(248,250,252,0.70)" }}>
                  {format(d, "d")}
                </span>
              </div>
            )
          })
        ) : (
          (weeks ?? []).map((w) => {
            const wEnd   = addDays(w, 6)
            const vStart = isAfter(w, ganttStart) ? w : ganttStart
            const vEnd   = isBefore(wEnd, ganttEnd) ? wEnd : ganttEnd
            const left   = dateX(vStart)
            const width  = (differenceInDays(vEnd, vStart) + 1) * dayWidth
            if (width < 4) return null
            return (
              <div key={w.toISOString()} style={{ position: "absolute", left, width, height: 32, display: "flex", alignItems: "center", paddingLeft: 6, borderRight: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(248,250,252,0.50)", whiteSpace: "nowrap" }}>
                  {zoom === "week" ? format(w, "d MMM", { locale: ptBR }) : `Sem ${format(w, "w")}`}
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface ScheduleClientProps {
  project: { id: string; title: string; status: string }
  initialAreas: Area[]
  initialTasks: Task[]
  members: Member[]
}

export function ScheduleClient({ project, initialAreas, initialTasks, members }: ScheduleClientProps) {
  const [tasks, setTasks]   = useState<Task[]>(initialTasks)
  const [areas, setAreas]   = useState<Area[]>(initialAreas)
  const [viewMode, setViewMode] = useState<"list" | "gantt">("list")

  // List view state
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(() => new Set(initialAreas.map((a) => a.id)))
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(() => {
    const parentIds = new Set(initialTasks.filter((t) => t.parentId).map((t) => t.parentId!))
    return new Set(initialTasks.filter((t) => parentIds.has(t.id)).map((t) => t.id))
  })
  const [search, setSearch]     = useState("")
  const [hideDone, setHideDone] = useState(false)
  const [addingArea, setAddingArea] = useState(false)

  // Gantt state
  const [expandedGantt, setExpandedGantt] = useState<Set<string>>(() =>
    new Set(initialTasks.filter((t) => !t.parentId).map((t) => t.id))
  )
  const [zoom, setZoom] = useState<Zoom>("week")

  const [panel, setPanel]         = useState<{ mode: "add" | "edit"; task: Partial<Task> & { projectId: string } } | null>(null)
  const [pending, start]          = useTransition()
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const leftBodyRef = useRef<HTMLDivElement>(null)
  const rightRef    = useRef<HTMLDivElement>(null)
  const syncing     = useRef(false)

  const onLeftScroll = useCallback(() => {
    if (syncing.current || !rightRef.current || !leftBodyRef.current) return
    syncing.current = true
    rightRef.current.scrollTop = leftBodyRef.current.scrollTop
    syncing.current = false
  }, [])

  const onRightScroll = useCallback(() => {
    if (syncing.current || !rightRef.current || !leftBodyRef.current) return
    syncing.current = true
    leftBodyRef.current.scrollTop = rightRef.current.scrollTop
    syncing.current = false
  }, [])

  // ── Gantt calculations ───────────────────────────────────────────────────

  const dayWidth = DAY_PX[zoom]
  const today    = useMemo(() => new Date(), [])

  const allDates = useMemo(() => [
    ...tasks.filter((t) => t.startDate).map((t) => parseISO(t.startDate!)),
    ...tasks.filter((t) => t.endDate).map((t) => parseISO(t.endDate!)),
  ], [tasks])

  const ganttStart = useMemo(() =>
    allDates.length ? startOfMonth(subDays(min(allDates), 14)) : startOfMonth(subMonths(today, 1))
  , [allDates, today])

  const ganttEnd = useMemo(() =>
    allDates.length ? endOfMonth(addDays(max(allDates), 30)) : endOfMonth(addMonths(today, 5))
  , [allDates, today])

  const totalDays  = differenceInDays(ganttEnd, ganttStart) + 1
  const ganttWidth = Math.max(900, totalDays * dayWidth)

  const flatTasks  = useMemo(() => flattenTasks(tasks, expandedGantt), [tasks, expandedGantt])
  const listRows   = useMemo(() => buildListRows(areas, tasks, expandedAreas, expandedTasks, search, hideDone), [areas, tasks, expandedAreas, expandedTasks, search, hideDone])

  function dateToX(ds: string) { return differenceInDays(parseISO(ds), ganttStart) * dayWidth }
  const todayX = differenceInDays(today, ganttStart) * dayWidth

  useEffect(() => {
    if (!rightRef.current) return
    rightRef.current.scrollLeft = Math.max(0, todayX - 200)
  }, [])

  // ── CRUD ─────────────────────────────────────────────────────────────────

  function openAdd(parentId?: string) {
    setPanel({ mode: "add", task: { projectId: project.id, parentId: parentId ?? null } })
  }
  function openEdit(t: Task) { setPanel({ mode: "edit", task: t }) }

  function handleSaved(t: Task) {
    setTasks((prev) => {
      const idx = prev.findIndex((x) => x.id === t.id)
      if (idx === -1) return [...prev, t]
      const next = [...prev]; next[idx] = t; return next
    })
    if (t.parentId) {
      setExpandedTasks((prev) => { const s = new Set(prev); s.add(t.parentId!); return s })
      setExpandedGantt((prev) => { const s = new Set(prev); s.add(t.parentId!); return s })
    }
    setPanel(null)
  }

  function handleDelete(id: string) {
    if (!confirm("Remover esta atividade e suas subtarefas?")) return
    start(async () => {
      await deleteTask(id, project.id)
      setTasks((prev) => prev.filter((t) => t.id !== id && t.parentId !== id))
      setPanel(null)
    })
  }

  function cycleStatus(t: Task) {
    const idx  = STATUS_CYCLE.indexOf(t.status as typeof STATUS_CYCLE[number])
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
    start(async () => {
      const updated = await updateTask(t.id, project.id, { status: next })
      setTasks((prev) => {
        const i = prev.findIndex((x) => x.id === t.id)
        if (i === -1) return prev
        const arr = [...prev]; arr[i] = updated as Task; return arr
      })
    })
  }

  function toggleArea(id: string) {
    setExpandedAreas((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  function toggleListTask(id: string) {
    setExpandedTasks((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  function toggleGanttTask(id: string) {
    setExpandedGantt((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  function expandAll() {
    setExpandedAreas(new Set([...areas.map((a) => a.id), "__ungrouped__"]))
    const parentIds = new Set(tasks.filter((t) => t.parentId).map((t) => t.parentId!))
    setExpandedTasks(new Set(tasks.filter((t) => parentIds.has(t.id)).map((t) => t.id)))
  }
  function collapseAll() {
    setExpandedAreas(new Set())
    setExpandedTasks(new Set())
  }

  // ── Dependency arrows (gantt) ────────────────────────────────────────────

  const arrows = useMemo(() => {
    const result: React.ReactNode[] = []
    const rowMap = new Map(flatTasks.map((t, i) => [t.id, i]))
    for (const task of flatTasks) {
      if (!task.dependencies.length || !task.startDate) continue
      const toIdx = rowMap.get(task.id)!
      const toX   = dateToX(task.startDate)
      const toY   = toIdx * ROW_H + ROW_H / 2
      for (const depId of task.dependencies) {
        const dep     = tasks.find((t) => t.id === depId)
        const fromIdx = rowMap.get(depId)
        if (!dep?.endDate || fromIdx === undefined) continue
        const fromX     = dateToX(dep.endDate) + dayWidth
        const fromY     = fromIdx * ROW_H + ROW_H / 2
        const violation = dep.endDate > task.startDate
        const color     = violation ? "#EF4444" : "#94A3B8"
        const mid       = fromX + 14
        const d = toY === fromY
          ? `M ${fromX} ${fromY} H ${toX}`
          : `M ${fromX} ${fromY} H ${mid} V ${toY} H ${toX}`
        result.push(
          <path key={`${depId}→${task.id}`} d={d}
            fill="none" stroke={color} strokeWidth={1.5}
            strokeDasharray={violation ? "5,3" : undefined}
            markerEnd={`url(#arr-${violation ? "red" : "gray"})`}
            opacity={0.75}
          />
        )
      }
    }
    return result
  }, [flatTasks, tasks, dayWidth, ganttStart])

  const completedCount = tasks.filter((t) => t.status === "COMPLETED").length

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full" style={{ background: "#F8FAFC" }}>

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 h-14 border-b border-slate-200 bg-white shrink-0">
        <Link href={`/projects/${project.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-[#0F172A] transition-colors font-medium">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>
        <div className="w-px h-5 bg-slate-200" />
        <div className="min-w-0">
          <p className="text-xs text-slate-400 font-medium">Cronograma</p>
          <p className="text-sm font-black text-[#0F172A] truncate">{project.title}</p>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
          <span>{tasks.length} atividades</span>
          <span className="text-slate-200">·</span>
          <span>{completedCount} concluídas</span>
        </div>

        <div className="flex-1" />

        {/* List controls */}
        {viewMode === "list" && (
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar atividade..."
                className="pl-8 pr-3 h-8 text-xs rounded-xl border border-slate-200 bg-white outline-none focus:border-[#7B2FBE] transition-colors w-48"
              />
            </div>
            <button
              onClick={() => setHideDone((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 h-8 text-xs font-semibold rounded-xl border transition-all ${hideDone ? "bg-violet-50 border-violet-200 text-[#7B2FBE]" : "border-slate-200 text-slate-500 bg-white hover:border-slate-300"}`}>
              Ocultar concluídos
            </button>
            <div className="flex items-center gap-1">
              <button onClick={expandAll} title="Expandir tudo" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all">
                <ChevronDown className="w-4 h-4" />
              </button>
              <button onClick={collapseAll} title="Recolher tudo" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </>
        )}

        {/* Gantt controls */}
        {viewMode === "gantt" && (
          <>
            <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-slate-100 border border-slate-200">
              {(["month", "week", "day"] as Zoom[]).map((z) => (
                <button key={z} onClick={() => setZoom(z)}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${zoom === z ? "bg-white text-[#0F172A] shadow-sm" : "text-slate-400 hover:text-slate-600"}`}>
                  {z === "month" ? "Mês" : z === "week" ? "Semana" : "Dia"}
                </button>
              ))}
            </div>
            <button
              onClick={() => rightRef.current && (rightRef.current.scrollLeft = Math.max(0, todayX - 250))}
              className="inline-flex items-center gap-1.5 px-3 h-8 text-xs font-semibold rounded-xl border border-slate-200 text-slate-500 hover:border-[#7B2FBE] hover:text-[#7B2FBE] transition-all bg-white">
              <CalendarDays className="w-3.5 h-3.5" /> Hoje
            </button>
          </>
        )}

        {/* View toggle */}
        <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-slate-100 border border-slate-200">
          <button onClick={() => setViewMode("list")}
            className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg transition-all ${viewMode === "list" ? "bg-white text-[#0F172A] shadow-sm" : "text-slate-400 hover:text-slate-600"}`}>
            <List className="w-3.5 h-3.5" /> Lista
          </button>
          <button onClick={() => setViewMode("gantt")}
            className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg transition-all ${viewMode === "gantt" ? "bg-white text-[#0F172A] shadow-sm" : "text-slate-400 hover:text-slate-600"}`}>
            <BarChart2 className="w-3.5 h-3.5" /> Gantt
          </button>
        </div>

        {/* Add area (list only) */}
        {viewMode === "list" && (
          <button onClick={() => setAddingArea(true)}
            className="inline-flex items-center gap-2 px-3 h-8 text-xs font-semibold rounded-xl border border-slate-200 text-slate-500 hover:border-[#7B2FBE] hover:text-[#7B2FBE] transition-all bg-white">
            <FolderOpen className="w-3.5 h-3.5" /> Nova Área
          </button>
        )}

        {/* Add task */}
        <button onClick={() => openAdd()}
          className="inline-flex items-center gap-2 px-4 h-8 text-xs font-bold rounded-xl text-white transition-all hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #7B2FBE, #2463FF)", boxShadow: "0 4px 12px rgba(123,47,190,0.30)" }}>
          <Plus className="w-3.5 h-3.5" /> Nova Atividade
        </button>
      </div>

      {/* ── LIST VIEW ────────────────────────────────────────────────────── */}
      {viewMode === "list" && (
        <div className="flex flex-col flex-1 min-h-0 bg-white">

          {/* Table header */}
          <div className="flex items-center shrink-0 border-b border-slate-100 bg-[#0F172A]" style={{ height: 44 }}>
            <div style={{ width: 72 }} className="text-[10px] font-black text-white/40 uppercase tracking-widest pl-4">EAP</div>
            <div className="flex-1 text-[10px] font-black text-white/40 uppercase tracking-widest px-2">Nome da Atividade</div>
            <div style={{ width: 140 }} className="text-[10px] font-black text-white/40 uppercase tracking-widest text-center">Status</div>
            <div style={{ width: 140 }} className="text-[10px] font-black text-white/40 uppercase tracking-widest px-3">Responsável</div>
            <div style={{ width: 80 }}  className="text-[10px] font-black text-white/40 uppercase tracking-widest text-center">Início</div>
            <div style={{ width: 80 }}  className="text-[10px] font-black text-white/40 uppercase tracking-widest text-center">Fim</div>
            <div style={{ width: 96 }}  className="text-[10px] font-black text-white/40 uppercase tracking-widest text-center">Progresso</div>
            <div style={{ width: 88 }} />
          </div>

          {/* Rows */}
          <div className="flex-1 overflow-y-auto">
            {listRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-300">
                <Layers className="w-10 h-10" />
                <p className="text-sm font-semibold">Nenhuma atividade encontrada</p>
                <button onClick={() => openAdd()} className="text-xs font-bold text-[#7B2FBE] hover:underline">
                  + Adicionar primeira atividade
                </button>
              </div>
            ) : (
              listRows.map((row, i) => {
                if (row.kind === "area") {
                  const isExp = expandedAreas.has(row.id)
                  const progress = row.taskCount > 0 ? Math.round((row.doneCount / row.taskCount) * 100) : 0
                  return (
                    <div
                      key={`area-${row.id}`}
                      className="flex items-center gap-0 border-b border-slate-100 cursor-pointer select-none group transition-colors"
                      style={{ borderLeft: `4px solid ${row.color ?? "#CBD5E1"}`, background: "#F8FAFC", minHeight: 44 }}
                      onClick={() => toggleArea(row.id)}
                    >
                      <div style={{ width: 68 }} className="flex items-center justify-end gap-1.5 pr-2">
                        <span className="text-[10px] font-mono font-bold text-slate-400">{row.eap}</span>
                        {isExp
                          ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          : <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                      </div>
                      <div className="flex-1 flex items-center gap-2.5 px-2 min-w-0">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: row.color ?? "#CBD5E1" }} />
                        <span className="font-black text-[#0F172A] text-sm truncate">{row.name}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0" style={{ background: "#EDE9FE", color: "#7C3AED" }}>Módulo</span>
                      </div>
                      <div style={{ width: 140 }} className="flex justify-center">
                        <span className="text-[10px] text-slate-400 font-medium">{row.doneCount}/{row.taskCount} concluídas</span>
                      </div>
                      <div style={{ width: 140 }} />
                      <div style={{ width: 80 }} />
                      <div style={{ width: 80 }} />
                      <div style={{ width: 96 }} className="px-3">
                        {row.taskCount > 0 && (
                          <div className="flex flex-col gap-1">
                            <span className="text-[9px] font-bold text-slate-500 text-center">{progress}%</span>
                            <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                              <div style={{ width: `${progress}%`, height: "100%", background: row.color ?? "#CBD5E1", borderRadius: "inherit", transition: "width 0.3s" }} />
                            </div>
                          </div>
                        )}
                      </div>
                      <div style={{ width: 88 }} />
                    </div>
                  )
                }

                // Task row
                const { task: t, eap, depth, hasChildren, areaColor } = row
                const color  = taskColor(t)
                const isLate = t.status === "DELAYED" || isAutoDelayed(t)
                const isDone = t.status === "COMPLETED"
                const isHov  = hoveredId === t.id
                const cfg    = STATUS_CFG[t.status]

                return (
                  <div
                    key={`task-${t.id}`}
                    style={{ height: ROW_H, display: "flex", alignItems: "center", borderBottom: "1px solid #F1F5F9", background: isHov ? "#F0F4FF" : i % 2 === 0 ? "white" : "#FAFBFD" }}
                    onMouseEnter={() => setHoveredId(t.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    {/* EAP */}
                    <div style={{ width: 72, paddingLeft: 8 + depth * 16 }} className="shrink-0 text-right">
                      <span className="text-[10px] font-mono text-slate-300 pr-2">{eap}</span>
                    </div>

                    {/* Expand / subtask connector */}
                    <div className="w-5 shrink-0 flex items-center justify-center">
                      {hasChildren ? (
                        <button onClick={(e) => { e.stopPropagation(); toggleListTask(t.id) }}
                          className="text-slate-400 hover:text-slate-700 transition-colors">
                          {expandedTasks.has(t.id)
                            ? <ChevronDown className="w-3.5 h-3.5" />
                            : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>
                      ) : depth > 0 ? (
                        <div className="w-3 border-b border-slate-200" style={{ marginLeft: 4 }} />
                      ) : null}
                    </div>

                    {/* Name */}
                    <div className="flex-1 flex items-center gap-1.5 min-w-0 cursor-pointer px-1 py-1" onClick={() => openEdit(t)}>
                      {isLate && <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />}
                      <span className={`text-xs font-semibold truncate ${isDone ? "line-through text-slate-400" : "text-[#0F172A]"}`}>
                        {t.title}
                      </span>
                      {hasChildren && (
                        <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: "#E0F2FE", color: "#0369A1" }}>
                          Grupo
                        </span>
                      )}
                      {t._count.comments > 0 && <span className="text-[9px] text-slate-300 shrink-0">💬</span>}
                      {t._count.attachments > 0 && <span className="text-[9px] text-slate-300 shrink-0">📎</span>}
                    </div>

                    {/* Status — click to cycle */}
                    <div style={{ width: 140 }} className="flex justify-center shrink-0 px-2">
                      <button
                        onClick={() => cycleStatus(t)}
                        title="Clique para avançar o status"
                        className="text-[10px] font-bold px-2.5 py-1 rounded-full transition-all hover:opacity-80 hover:shadow-sm whitespace-nowrap"
                        style={{ background: cfg?.bg ?? "#F8FAFC", color: isLate && t.status !== "DELAYED" ? "#EF4444" : cfg?.color ?? "#64748B", border: `1px solid ${cfg?.color ?? "#CBD5E1"}30` }}>
                        {cfg?.label ?? t.status}
                      </button>
                    </div>

                    {/* Responsible */}
                    <div style={{ width: 140 }} className="px-3 shrink-0">
                      {t.responsible ? (
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black text-white shrink-0"
                            style={{ background: areaColor ?? color }}>
                            {initials(t.responsible.name)}
                          </div>
                          <span className="text-[10px] text-slate-600 truncate">{t.responsible.name.split(" ")[0]}</span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-300">—</span>
                      )}
                    </div>

                    {/* Start */}
                    <div style={{ width: 80 }} className="text-center shrink-0">
                      <span className="text-[10px] text-slate-500 font-mono">{fmtDate(t.startDate)}</span>
                    </div>

                    {/* End */}
                    <div style={{ width: 80 }} className="text-center shrink-0">
                      <span className={`text-[10px] font-mono ${isLate ? "text-red-400 font-bold" : "text-slate-500"}`}>
                        {fmtDate(t.endDate)}
                      </span>
                    </div>

                    {/* Progress */}
                    <div style={{ width: 96 }} className="px-3 shrink-0">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-bold" style={{ color }}>{t.progress}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div style={{ width: `${t.progress}%`, height: "100%", background: color, borderRadius: "inherit", transition: "width 0.3s" }} />
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ width: 88, opacity: isHov ? 1 : 0, transition: "opacity 0.15s" }} className="flex items-center gap-1 px-2 shrink-0">
                      <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg text-slate-400 hover:text-[#7B2FBE] hover:bg-violet-50 transition-all">
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button onClick={() => openAdd(t.id)} title="Adicionar subtarefa" className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 transition-all">
                        <Plus className="w-3 h-3" />
                      </button>
                      <button onClick={() => handleDelete(t.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-50 transition-all">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )
              })
            )}

            {/* Footer add buttons */}
            <div className="p-4 flex items-center gap-6 border-t border-slate-100">
              <button onClick={() => setAddingArea(true)}
                className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-[#7B2FBE] transition-colors">
                <FolderOpen className="w-3.5 h-3.5" /> Nova Área / Módulo
              </button>
              <button onClick={() => openAdd()}
                className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-[#7B2FBE] transition-colors">
                <Plus className="w-3.5 h-3.5" /> Nova Atividade
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── GANTT VIEW ───────────────────────────────────────────────────── */}
      {viewMode === "gantt" && (
        <div className="flex flex-1 min-h-0">

          {/* Left panel */}
          <div className="flex flex-col shrink-0 border-r border-slate-200 bg-white" style={{ width: LEFT_W }}>
            <div className="flex items-center shrink-0 border-b border-slate-100 bg-[#0F172A]" style={{ height: HDR_H }}>
              <div style={{ width: 36 }} />
              <div style={{ width: 24 }} />
              <div className="flex-1 px-2 text-[10px] font-black text-white/50 uppercase tracking-widest">Atividade</div>
              <div style={{ width: 110 }} className="text-[10px] font-black text-white/50 uppercase tracking-widest px-2 text-right">Responsável</div>
              <div style={{ width: 76 }} className="text-[10px] font-black text-white/50 uppercase tracking-widest text-center">Início</div>
              <div style={{ width: 76 }} className="text-[10px] font-black text-white/50 uppercase tracking-widest text-center">Fim</div>
              <div style={{ width: 48 }} className="text-[10px] font-black text-white/50 uppercase tracking-widest text-center">%</div>
              <div style={{ width: 52 }} />
            </div>

            <div ref={leftBodyRef} className="flex-1 overflow-y-auto overflow-x-hidden" onScroll={onLeftScroll} style={{ scrollbarWidth: "none" }}>
              {flatTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-300 gap-3">
                  <Layers className="w-10 h-10" />
                  <p className="text-sm font-semibold">Nenhuma atividade</p>
                  <button onClick={() => openAdd()} className="text-xs font-bold text-[#7B2FBE] hover:underline">
                    + Adicionar primeira atividade
                  </button>
                </div>
              ) : (
                flatTasks.map((t, i) => {
                  const color   = taskColor(t)
                  const isHov   = hoveredId === t.id
                  const isDone  = t.status === "COMPLETED"
                  const isLate  = t.status === "DELAYED" || isAutoDelayed(t)
                  const hasWarn = t.dependencies.some((depId) => {
                    const dep = tasks.find((x) => x.id === depId)
                    return dep?.endDate && t.startDate && dep.endDate > t.startDate
                  })

                  return (
                    <div key={t.id}
                      style={{ height: ROW_H, borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", background: isHov ? "#F8FAFC" : i % 2 === 0 ? "white" : "#FAFBFD", borderLeft: `3px solid ${t.depth > 0 ? "transparent" : color}` }}
                      onMouseEnter={() => setHoveredId(t.id)}
                      onMouseLeave={() => setHoveredId(null)}
                    >
                      <div style={{ width: 36, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, paddingRight: 4, flexShrink: 0 }}>
                        <span style={{ fontSize: 9, color: "#CBD5E1", fontWeight: 700 }}>{i + 1}</span>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_CFG[t.status]?.dot ?? color }} />
                      </div>
                      <div style={{ width: 24 }} className="shrink-0 flex items-center justify-center">
                        {t.hasChildren ? (
                          <button onClick={() => toggleGanttTask(t.id)} className="text-slate-400 hover:text-slate-700 transition-colors">
                            {expandedGantt.has(t.id) ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
                        ) : t.depth > 0 ? (
                          <div className="w-3 border-b border-slate-200" style={{ marginLeft: 4 }} />
                        ) : null}
                      </div>
                      <div className="flex-1 flex items-center gap-1.5 min-w-0 px-1 cursor-pointer" style={{ paddingLeft: 4 + t.depth * 12 }} onClick={() => openEdit(t)}>
                        {hasWarn && <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />}
                        <span className={`text-xs font-semibold truncate ${isDone ? "line-through text-slate-400" : "text-[#0F172A]"}`}>{t.title}</span>
                        {(isLate || isDone) && (
                          <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{ background: STATUS_CFG[t.status]?.bg ?? "#F8FAFC", color: isLate && t.status !== "DELAYED" ? "#EF4444" : STATUS_CFG[t.status]?.color, border: `1px solid ${isLate && t.status !== "DELAYED" ? "#EF444430" : `${STATUS_CFG[t.status]?.color}30`}` }}>
                            {isLate && t.status !== "DELAYED" ? "Atrasado" : STATUS_CFG[t.status]?.label}
                          </span>
                        )}
                      </div>
                      <div style={{ width: 110 }} className="px-2 shrink-0">
                        {t.responsible ? (
                          <div className="flex items-center gap-1.5 justify-end">
                            <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black text-white shrink-0" style={{ background: color }}>
                              {initials(t.responsible.name)}
                            </div>
                            <span className="text-[10px] text-slate-500 truncate">{t.responsible.name.split(" ")[0]}</span>
                          </div>
                        ) : <span className="text-[10px] text-slate-300 block text-right">—</span>}
                      </div>
                      <div style={{ width: 76 }} className="text-center shrink-0">
                        <span className="text-[10px] text-slate-500 font-mono">{fmtDate(t.startDate)}</span>
                      </div>
                      <div style={{ width: 76 }} className="text-center shrink-0">
                        <span className="text-[10px] text-slate-500 font-mono">{fmtDate(t.endDate)}</span>
                      </div>
                      <div style={{ width: 48 }} className="px-2 shrink-0">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-[9px] font-bold" style={{ color }}>{t.progress}%</span>
                          <div className="w-6 h-1 rounded-full bg-slate-100 overflow-hidden">
                            <div style={{ width: `${t.progress}%`, height: "100%", background: color, borderRadius: "inherit" }} />
                          </div>
                        </div>
                      </div>
                      <div style={{ opacity: isHov ? 1 : 0, width: 52, display: "flex", alignItems: "center", gap: 2, padding: "0 4px", flexShrink: 0, transition: "opacity 0.15s" }}>
                        <button onClick={() => openEdit(t)} className="p-1 rounded text-slate-400 hover:text-[#7B2FBE] hover:bg-violet-50 transition-all"><Pencil className="w-3 h-3" /></button>
                        <button onClick={() => openAdd(t.id)} className="p-1 rounded text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 transition-all" title="Subtarefa"><Plus className="w-3 h-3" /></button>
                        <button onClick={() => handleDelete(t.id)} className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-red-50 transition-all"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    </div>
                  )
                })
              )}
              {flatTasks.length > 0 && (
                <div className="p-4">
                  <button onClick={() => openAdd()} className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-[#7B2FBE] transition-colors">
                    <Plus className="w-3.5 h-3.5" /> Adicionar atividade
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Gantt right panel */}
          <div ref={rightRef} className="flex-1 overflow-auto min-h-0 min-w-0" onScroll={onRightScroll}>
            <div style={{ minWidth: ganttWidth, position: "relative" }}>
              <div className="sticky top-0 z-20">
                <GanttHeader ganttStart={ganttStart} ganttEnd={ganttEnd} dayWidth={dayWidth} zoom={zoom} />
              </div>
              {flatTasks.length === 0 ? (
                <div className="flex items-center justify-center h-64">
                  <p className="text-sm text-slate-300">Adicione atividades para visualizar o Gantt</p>
                </div>
              ) : (
                <div style={{ position: "relative", width: ganttWidth, height: flatTasks.length * ROW_H }}>
                  {flatTasks.map((t, i) => (
                    <div key={`bg-${t.id}`} style={{ position: "absolute", top: i * ROW_H, left: 0, right: 0, height: ROW_H, background: i % 2 === 0 ? "white" : "#FAFBFD", borderBottom: "1px solid #F1F5F9", pointerEvents: "none" }} />
                  ))}
                  {eachMonthOfInterval({ start: ganttStart, end: ganttEnd }).map((m) => {
                    const x = differenceInDays(startOfMonth(m), ganttStart) * dayWidth
                    return <div key={m.toISOString()} style={{ position: "absolute", top: 0, bottom: 0, left: x, width: 1, background: "rgba(226,232,240,0.7)", pointerEvents: "none" }} />
                  })}
                  {zoom === "day" && Array.from({ length: totalDays }).map((_, i) => {
                    const d = addDays(ganttStart, i)
                    if (!isSaturday(d) && !isSunday(d)) return null
                    return <div key={i} style={{ position: "absolute", top: 0, bottom: 0, left: i * dayWidth, width: dayWidth, background: "rgba(241,245,249,0.60)", pointerEvents: "none" }} />
                  })}
                  {todayX >= 0 && todayX <= ganttWidth && (
                    <div style={{ position: "absolute", top: 0, bottom: 0, left: todayX, width: 2, background: "#EF4444", opacity: 0.7, zIndex: 6, pointerEvents: "none" }}>
                      <div style={{ position: "absolute", top: -4, left: -4, width: 10, height: 10, borderRadius: "50%", background: "#EF4444" }} />
                      <div style={{ position: "absolute", top: 4, left: 4, fontSize: 9, fontWeight: 800, color: "#EF4444", whiteSpace: "nowrap" }}>Hoje</div>
                    </div>
                  )}
                  {flatTasks.map((t, i) => {
                    if (!t.startDate || !t.endDate) return null
                    const barLeft  = dateToX(t.startDate)
                    const barRight = dateToX(t.endDate) + dayWidth
                    const barW     = Math.max(dayWidth, barRight - barLeft)
                    const color    = taskColor(t)
                    const isDone   = t.status === "COMPLETED"
                    const isLateB  = t.status === "DELAYED" || isAutoDelayed(t)
                    const barColor = isLateB ? "#EF4444" : color
                    const hasWarn  = t.dependencies.some((depId) => {
                      const dep = tasks.find((x) => x.id === depId)
                      return dep?.endDate && t.startDate && dep.endDate > t.startDate
                    })
                    return (
                      <div key={`bar-${t.id}`}
                        onClick={() => openEdit(t)}
                        onMouseEnter={() => setHoveredId(t.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        title={`${t.title} | ${fmtDate(t.startDate)} → ${fmtDate(t.endDate)} | ${t.progress}%`}
                        style={{
                          position: "absolute", top: i * ROW_H + BAR_PAD, left: barLeft, width: barW, height: BAR_H,
                          borderRadius: t.hasChildren ? 4 : 6, overflow: "hidden", cursor: "pointer", zIndex: 4,
                          border: isLateB ? `1.5px solid #EF444488` : hasWarn ? `1.5px dashed #F59E0B` : `1.5px solid ${barColor}55`,
                          boxShadow: hoveredId === t.id ? `0 2px 12px ${barColor}40` : "none",
                          transition: "box-shadow 0.15s",
                          background: isDone ? `${barColor}30` : isLateB ? "#FEE2E2" : `${barColor}22`,
                        }}>
                        <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: `${t.progress}%`, background: isLateB ? "#EF444490" : isDone ? `${barColor}90` : `${barColor}70`, transition: "width 0.4s ease" }} />
                        {t.hasChildren && (
                          <div style={{ position: "absolute", inset: 0, backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 3px, ${color}15 3px, ${color}15 6px)` }} />
                        )}
                        {barW > 48 && (
                          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", paddingLeft: 8, paddingRight: 4, overflow: "hidden", gap: 4 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: barColor, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</span>
                            {barW > 100 && <span style={{ fontSize: 9, color: `${barColor}99`, marginLeft: 2, flexShrink: 0 }}>{t.progress}%</span>}
                          </div>
                        )}
                        {isDone && barW > 24 && (
                          <div style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)" }}>
                            <Check style={{ width: 10, height: 10, color }} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                  <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 5 }} overflow="visible">
                    <defs>
                      <marker id="arr-gray" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                        <path d="M0,1 L6,3.5 L0,6" fill="none" stroke="#94A3B8" strokeWidth="1.5" />
                      </marker>
                      <marker id="arr-red" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                        <path d="M0,1 L6,3.5 L0,6" fill="none" stroke="#EF4444" strokeWidth="1.5" />
                      </marker>
                    </defs>
                    {arrows}
                  </svg>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Task form panel ──────────────────────────────────────────────── */}
      {panel && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]" onClick={() => setPanel(null)} />
          <TaskForm
            mode={panel.mode}
            initial={panel.task}
            areas={areas}
            members={members}
            allTasks={tasks}
            onSave={handleSaved}
            onDelete={panel.mode === "edit" && panel.task.id ? () => handleDelete(panel.task.id!) : undefined}
            onClose={() => setPanel(null)}
          />
        </>
      )}

      {/* ── Area form modal ──────────────────────────────────────────────── */}
      {addingArea && (
        <AreaForm
          projectId={project.id}
          onSave={(a) => { setAreas((prev) => [...prev, a]); setExpandedAreas((prev) => { const s = new Set(prev); s.add(a.id); return s }); setAddingArea(false) }}
          onClose={() => setAddingArea(false)}
        />
      )}

      <style jsx global>{`
        [style*="scrollbar-width: none"]::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}
