"use client"

import {
  useState, useRef, useMemo, useTransition, useCallback, useEffect, useLayoutEffect, Fragment,
} from "react"
import Link from "next/link"
import {
  format, differenceInDays, startOfMonth, endOfMonth,
  eachMonthOfInterval, addMonths, subMonths, addDays, subDays,
  isSaturday, isSunday, min, max, isAfter, isBefore, eachWeekOfInterval, parseISO,
} from "date-fns"
import { parseDateStr, fmtDateShort, todayStr } from "@/lib/date-utils"
import { ptBR } from "date-fns/locale"
import {
  ArrowLeft, Plus, ChevronRight, ChevronDown, Pencil, Trash2,
  Loader2, X, Check, CalendarDays, AlertTriangle, Layers,
  List, BarChart2, Search, FolderOpen, Paperclip, MessageSquare,
  Link2, Lock, ArrowRight, GripVertical, FileSpreadsheet, ArrowUpDown,
  Upload, Download, FileText, FileImage, FileArchive, Users,
  LayoutTemplate, Milestone, Zap, Award, Star, Globe2, TrendingUp, Clock, Send,
} from "lucide-react"
import { SCurveClient, type SCurveData } from "../s-curve/s-curve-client"
import {
  createTask, updateTask, deleteTask, createArea, deleteArea,
  reorderAreas, reorderTasks,
  getTaskAttachments, addTaskAttachments,
  type AttachmentUpload,
  type SuccessorUpdate,
} from "@/lib/actions/schedule"
import { getTemplates, applyTemplate, type Template } from "@/lib/actions/templates"
import { getTaskDetail, addTaskComment } from "@/lib/actions/kanban"
import { deriveStatus, deriveProgress, type AncestorUpdate } from "@/lib/utils/task-progress"
import { isHoliday, isWeekend as isWknd, getHolidayName, nextWorkingDay } from "@/lib/working-days"
import { WorkingDayPicker } from "@/components/working-day-picker"
import { UserAvatar } from "@/components/ui/user-avatar"

// ─── Constants ────────────────────────────────────────────────────────────────

const ROW_H   = 40
const HDR_H   = 64
const LEFT_W  = 600
// List view — resizable column system
type ColKey = 'eap' | 'name' | 'status' | 'responsible' | 'startDate' | 'endDate' | 'actualStart' | 'actualEnd' | 'estH' | 'realH' | 'pctEst' | 'pctReal' | 'predecessors' | 'budgeted' | 'actual'
const COL_DEFAULTS: Record<ColKey, number> = {
  eap: 56, name: 280, status: 130, responsible: 160,
  startDate: 88, endDate: 88, actualStart: 88, actualEnd: 88,
  estH: 64, realH: 64, pctEst: 68, pctReal: 68,
  predecessors: 100, budgeted: 84, actual: 84,
}
const COL_MIN: Record<ColKey, number> = {
  eap: 40, name: 140, status: 90, responsible: 110,
  startDate: 64, endDate: 64, actualStart: 64, actualEnd: 64,
  estH: 40, realH: 40, pctEst: 40, pctReal: 40,
  predecessors: 72, budgeted: 56, actual: 56,
}
const DEFAULT_COL_ORDER: ColKey[] = ['eap', 'name', 'status', 'responsible', 'startDate', 'endDate', 'actualStart', 'actualEnd', 'estH', 'realH', 'pctEst', 'pctReal', 'predecessors', 'budgeted', 'actual']
const COL_HEADER_META: Record<ColKey, { label: string; cls: string }> = {
  eap:          { label: "EAP",               cls: "text-white/40 text-center" },
  name:         { label: "Nome da Atividade",  cls: "text-white/40 px-2" },
  status:       { label: "Status",            cls: "text-white/40 text-center" },
  responsible:  { label: "Responsável",       cls: "text-white/40 px-3" },
  startDate:    { label: "Início Plan.",      cls: "text-white/40 text-center" },
  endDate:      { label: "Fim Plan.",         cls: "text-white/40 text-center" },
  actualStart:  { label: "Início Real",       cls: "text-emerald-400/60 text-center" },
  actualEnd:    { label: "Fim Real",          cls: "text-emerald-400/60 text-center" },
  estH:         { label: "Est.h",             cls: "text-violet-400/70 text-center" },
  realH:        { label: "Real h",            cls: "text-violet-400/70 text-center" },
  pctEst:       { label: "% Est.",            cls: "text-amber-400/70 text-center" },
  pctReal:      { label: "% Real",            cls: "text-white/40 text-center" },
  predecessors: { label: "Predecessoras",     cls: "text-indigo-400/70 text-center" },
  budgeted:     { label: "R$ Orç.",           cls: "text-emerald-400/80 text-center" },
  actual:       { label: "R$ Real",           cls: "text-orange-400/80 text-center" },
}
const BAR_H   = 24
const BAR_PAD = 8

const DAY_PX = { month: 5, week: 16, day: 30 } as const
type Zoom = keyof typeof DAY_PX

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  PLANNING:    { label: "A Iniciar",       color: "#64748B", bg: "#F8FAFC", dot: "#94A3B8" },
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
  responsible: { id: string; name: string; image: string | null } | null
  wbsArea: { id: string; name: string; color: string | null } | null
  startDate: string | null; endDate: string | null
  actualStart: string | null; actualEnd: string | null
  estimatedEffort: number | null; actualEffort: number | null
  budgetedCost: number | null; actualCost: number | null
  status: string; progress: number; order: number; dependencies: string[]
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
  return t.endDate.slice(0, 10) < todayStr()
}

function fmtDate(ds: string | null) {
  return fmtDateShort(ds)
}

function calcEstimatedProgress(startDate: string | null, endDate: string | null): number | null {
  if (!startDate || !endDate) return null
  const start = parseDateStr(startDate)
  const end   = parseDateStr(endDate)
  const today = new Date()
  const total = differenceInDays(end, start)
  if (total <= 0) return null
  return Math.max(0, Math.min(100, Math.round((differenceInDays(today, start) / total) * 100)))
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
  // null = sem filtro; Set de IDs = mostra apenas essas tarefas (+ ancestrais)
  visibleIds: Set<string> | null = null,
  preserveOrder: boolean = false,
): Row[] {
  const q = search.trim().toLowerCase()
  const result: Row[] = []

  const childrenMap = new Map<string, Task[]>()
  for (const t of tasks) {
    if (!t.parentId) continue
    if (!childrenMap.has(t.parentId)) childrenMap.set(t.parentId, [])
    childrenMap.get(t.parentId)!.push(t)
  }
  const sortBy = (arr: Task[]) => preserveOrder ? [...arr] : [...arr].sort((a, b) => a.order - b.order)

  function matches(t: Task) {
    if (hideDone && t.status === "COMPLETED") return false
    if (q && !t.title.toLowerCase().includes(q)) return false
    if (visibleIds !== null && !visibleIds.has(t.id)) return false
    return true
  }

  function walkTask(t: Task, depth: number, eap: string, areaColor: string | null) {
    const kids = sortBy(childrenMap.get(t.id) ?? [])
    result.push({ kind: "task", task: t, eap, depth, hasChildren: kids.length > 0, areaColor })
    // Quando filtrando por pessoa: força expansão para mostrar descendentes
    const shouldExpand = visibleIds !== null ? true : expandedTasks.has(t.id)
    if (kids.length > 0 && shouldExpand) {
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
    // Quando filtrando: auto-expande área que contenha tarefas visíveis
    const isExpanded = visibleIds !== null
      ? areaTasks.some((t) => visibleIds.has(t.id))
      : expandedAreas.has(area.id)
    if (!isExpanded) return
    sortBy(topByArea.get(area.id) ?? []).forEach((t, i) => {
      if (matches(t)) walkTask(t, 0, `${eapArea}.${i + 1}`, area.color)
    })
  })

  const ungrouped = sortBy(topByArea.get(null) ?? [])
  if (ungrouped.length > 0) {
    const ugId = "__ungrouped__"
    const ugEap = `${areas.length + 1}`
    result.push({ kind: "area", id: ugId, name: "Sem Área", color: null, eap: ugEap, taskCount: ungrouped.length, doneCount: ungrouped.filter((t) => t.status === "COMPLETED").length })
    const ugExpanded = visibleIds !== null
      ? ungrouped.some((t) => visibleIds.has(t.id))
      : expandedAreas.has(ugId)
    if (ugExpanded) {
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
  onSave: (t: Task, ancestors?: AncestorUpdate[], successors?: SuccessorUpdate[]) => void
  onDelete?: () => void
  onClose: () => void
}

function TaskForm({ mode, initial, areas, members, allTasks, onSave, onDelete, onClose }: TaskFormProps) {
  const [pending, start] = useTransition()
  const [form, setForm] = useState({
    title:           initial.title           ?? "",
    description:     initial.description     ?? "",
    wbsAreaId:       initial.wbsAreaId       ?? "",
    responsibleId:   initial.responsibleId   ?? "",
    parentId:        initial.parentId        ?? "",
    startDate:       initial.startDate?.slice(0, 10)    ?? "",
    endDate:         initial.endDate?.slice(0, 10)      ?? "",
    actualStart:     initial.actualStart?.slice(0, 10)  ?? "",
    actualEnd:       initial.actualEnd?.slice(0, 10)    ?? "",
    estimatedEffort: initial.estimatedEffort ?? ("" as number | ""),
    actualEffort:    initial.actualEffort    ?? ("" as number | ""),
    status:          initial.status          ?? "PLANNING",
    progress:        initial.progress        ?? 0,
    dependencies:    initial.dependencies    ?? [] as string[],
  })

  const [depSearch, setDepSearch] = useState("")

  const upd = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  function toggleDep(id: string) {
    setForm((f) => {
      const newDeps = f.dependencies.includes(id)
        ? f.dependencies.filter((d) => d !== id)
        : [...f.dependencies, id]
      // Auto-calculate start date from latest predecessor end date + 1 day
      let newForm: typeof f = { ...f, dependencies: newDeps }
      if (newDeps.length > 0) {
        const endDates = newDeps
          .map((depId) => allTasks.find((t) => t.id === depId)?.endDate)
          .filter((d): d is string => Boolean(d))
          .sort()
        const latestEnd = endDates.at(-1)
        if (latestEnd) {
          const suggested = nextWorkingDay(latestEnd)
          if (!f.startDate || suggested > f.startDate) {
            newForm = { ...newForm, startDate: suggested }
          }
        }
      }
      return newForm
    })
  }

  function handleSubmit() {
    if (!form.title.trim()) return
    start(async () => {
      const data = {
        projectId:       initial.projectId,
        title:           form.title,
        description:     form.description || null,
        wbsAreaId:       form.wbsAreaId   || null,
        responsibleId:   form.responsibleId || null,
        parentId:        form.parentId    || null,
        startDate:       form.startDate   || null,
        endDate:         form.endDate     || null,
        actualStart:     form.actualStart || null,
        actualEnd:       form.actualEnd   || null,
        estimatedEffort: form.estimatedEffort !== "" ? Number(form.estimatedEffort) : null,
        actualEffort:    form.actualEffort    !== "" ? Number(form.actualEffort)    : null,
        status:          form.status,
        progress:        form.progress,
        dependencies:    form.dependencies,
      }
      let task: Task
      let ancestors: AncestorUpdate[] = []
      let successors: SuccessorUpdate[] = []
      if (mode === "edit" && initial.id) {
        const res = await updateTask(initial.id, initial.projectId, data)
        task = res.task as Task
        ancestors = res.ancestors
        successors = res.successorUpdates
      } else {
        task = await createTask(data) as Task
      }

      onSave(task, ancestors, successors)
    })
  }

  const parentOptions = allTasks.filter((t) => t.id !== initial.id && !t.parentId)
  const inputCls = "w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white text-[#0F172A] outline-none focus:border-[#7B2FBE] transition-colors"
  const labelCls = "block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5"

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex flex-col bg-white shadow-2xl" style={{ width: 400, borderLeft: "1px solid #E2E8F0" }}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div>
          <h3 className="font-black text-[#0F172A] text-sm">
            {mode === "add"
              ? (form.parentId ? "Nova Tarefa" : "Nova Atividade")
              : (initial.parentId ? "Editar Tarefa" : "Editar Atividade")}
          </h3>
          {form.parentId && (
            <p className="text-[10px] text-slate-400 mt-0.5">
              Subtarefa de: {allTasks.find((t) => t.id === form.parentId)?.title ?? "—"}
            </p>
          )}
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-[#0F172A] transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div>
          <label className={labelCls}>{form.parentId ? "Tarefa *" : "Atividade *"}</label>
          <input value={form.title} onChange={(e) => upd("title", e.target.value)} className={inputCls}
            placeholder={form.parentId ? "Nome da tarefa" : "Nome da atividade"} />
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

        {/* Datas planejadas */}
        <div>
          <label className={labelCls} style={{ color: "#2463FF" }}>Datas Planejadas</label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Início Planejado</label>
              <WorkingDayPicker
                value={form.startDate}
                onChange={(v) => upd("startDate", v)}
                placeholder="dd/mm/aaaa"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Término Planejado</label>
              <WorkingDayPicker
                value={form.endDate}
                onChange={(v) => upd("endDate", v)}
                placeholder="dd/mm/aaaa"
                className={inputCls}
              />
            </div>
          </div>
        </div>

        {/* Datas reais */}
        <div>
          <label className={labelCls} style={{ color: "#059669" }}>Datas Reais</label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Início Real</label>
              <WorkingDayPicker
                value={form.actualStart}
                onChange={(v) => upd("actualStart", v)}
                placeholder="dd/mm/aaaa"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Término Real</label>
              <WorkingDayPicker
                value={form.actualEnd}
                onChange={(v) => upd("actualEnd", v)}
                placeholder="dd/mm/aaaa"
                className={inputCls}
              />
            </div>
          </div>
        </div>

        {/* Esforço */}
        <div>
          <label className={labelCls} style={{ color: "#7B2FBE" }}>Esforço (horas)</label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Estimado (analista)</label>
              <div className="relative">
                <input
                  type="number" min={0} step={0.5}
                  value={form.estimatedEffort}
                  onChange={(e) => upd("estimatedEffort", e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="0"
                  className={inputCls + " pr-8"}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-semibold">h</span>
              </div>
            </div>
            <div>
              <label className={labelCls}>Real (responsável)</label>
              <div className="relative">
                <input
                  type="number" min={0} step={0.5}
                  value={form.actualEffort}
                  onChange={(e) => upd("actualEffort", e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="0"
                  className={inputCls + " pr-8"}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-semibold">h</span>
              </div>
            </div>
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

        {/* ── Predecessoras (Dependências) ── */}
        {(() => {
          const candidatos = allTasks.filter((t) => t.id !== initial.id)
          const selecionadas = candidatos.filter((t) => form.dependencies.includes(t.id))
          const disponiveis = candidatos
            .filter((t) => !form.dependencies.includes(t.id))
            .filter((t) => !depSearch || t.title.toLowerCase().includes(depSearch.toLowerCase()))
          const successors = allTasks.filter((t) => t.id !== initial.id && t.dependencies.includes(initial.id ?? ""))
          if (candidatos.length === 0 && successors.length === 0) return null
          return (
            <div className="rounded-2xl overflow-hidden" style={{ border: "1.5px solid #E0E7FF" }}>
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2.5"
                style={{ background: "linear-gradient(135deg,#EEF2FF,#F5F3FF)" }}>
                <div className="flex items-center gap-2">
                  <Link2 className="w-3.5 h-3.5 text-[#6366F1]" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#4338CA]">Predecessoras</span>
                </div>
                <span className="text-[9px] text-indigo-400 font-medium">Ajusta início automaticamente</span>
              </div>

              <div className="p-3 space-y-3 bg-white">

                {/* Selecionadas */}
                {selecionadas.length > 0 && (
                  <div className="space-y-1.5">
                    {selecionadas.map((dep) => {
                      const cfg = STATUS_CFG[dep.status]
                      const violation = dep.endDate && form.startDate && dep.endDate >= form.startDate
                      return (
                        <div key={dep.id}
                          className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all"
                          style={{
                            background: violation ? "#FFFBEB" : "#F0FDF4",
                            border: `1px solid ${violation ? "#FDE68A" : "#BBF7D0"}`,
                          }}>
                          <ArrowRight className="w-3 h-3 shrink-0" style={{ color: violation ? "#F59E0B" : "#16A34A" }} />
                          <span className="flex-1 text-xs font-semibold truncate" style={{ color: violation ? "#92400E" : "#166534" }}>
                            {dep.title}
                          </span>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                            style={{ background: cfg?.bg, color: cfg?.color }}>
                            {cfg?.label}
                          </span>
                          {dep.endDate && (
                            <span className="text-[9px] font-mono shrink-0" style={{ color: violation ? "#B45309" : "#4ADE80" }}>
                              até {fmtDate(dep.endDate)}
                            </span>
                          )}
                          {violation && (
                            <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                          )}
                          <button onClick={() => toggleDep(dep.id)}
                            className="text-slate-300 hover:text-red-400 transition-colors shrink-0">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )
                    })}
                    {/* Auto-date hint */}
                    {form.startDate && (
                      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg"
                        style={{ background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
                        <CalendarDays className="w-3 h-3 text-blue-400 shrink-0" />
                        <span className="text-[9px] text-blue-600 font-medium">
                          Início ajustado para <strong>{fmtDate(form.startDate)}</strong>
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Buscar para adicionar */}
                {candidatos.length > selecionadas.length && (
                  <div>
                    <div className="relative mb-2">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-300" />
                      <input
                        value={depSearch}
                        onChange={(e) => setDepSearch(e.target.value)}
                        placeholder="Buscar atividade predecessora..."
                        className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl outline-none transition-colors"
                        style={{ border: "1.5px solid #E2E8F0", background: "#F8FAFC" }}
                        onFocus={(e) => (e.target.style.borderColor = "#818CF8")}
                        onBlur={(e) => (e.target.style.borderColor = "#E2E8F0")}
                      />
                    </div>
                    <div className="space-y-0.5 max-h-36 overflow-y-auto">
                      {disponiveis.length === 0 ? (
                        <p className="text-center text-[10px] text-slate-300 py-3">
                          {depSearch ? "Nenhuma atividade encontrada" : "Todas as atividades já foram selecionadas"}
                        </p>
                      ) : (
                        disponiveis.map((dep) => {
                          const cfg = STATUS_CFG[dep.status]
                          return (
                            <button key={dep.id} onClick={() => toggleDep(dep.id)}
                              className="flex items-center gap-2 w-full px-2.5 py-2 rounded-xl text-left transition-all hover:bg-indigo-50 group">
                              <div className="w-5 h-5 rounded-lg flex items-center justify-center shrink-0 border border-dashed border-slate-200 group-hover:border-indigo-300 group-hover:bg-indigo-100 transition-all">
                                <Plus className="w-2.5 h-2.5 text-slate-300 group-hover:text-indigo-500" />
                              </div>
                              <span className="flex-1 text-xs text-slate-600 truncate group-hover:text-indigo-700 font-medium">
                                {dep.title}
                              </span>
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                                style={{ background: cfg?.bg, color: cfg?.color }}>
                                {cfg?.label}
                              </span>
                              {dep.endDate && (
                                <span className="text-[9px] font-mono text-slate-400 shrink-0">{fmtDate(dep.endDate)}</span>
                              )}
                            </button>
                          )
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* Sucessoras (read-only) */}
                {successors.length > 0 && (
                  <div className="pt-2" style={{ borderTop: "1px dashed #E2E8F0" }}>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                      Sucessoras ({successors.length}) — dependem desta
                    </p>
                    <div className="space-y-1">
                      {successors.map((s) => (
                        <div key={s.id} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-slate-50">
                          <ArrowRight className="w-3 h-3 text-slate-300 shrink-0" />
                          <span className="text-[10px] text-slate-500 truncate">{s.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })()}
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
          {mode === "add" ? (form.parentId ? "Adicionar Tarefa" : "Adicionar Atividade") : "Salvar"}
        </button>
      </div>
    </div>
  )
}

// ─── Time Panel ──────────────────────────────────────────────────────────────

interface TimeEntryItem {
  id: string
  hours: number
  date: string
  note: string | null
  user: { id: string; name: string; image: string | null }
  createdAt: string
}

function TimePanel({ taskId, projectId, taskTitle, estimatedEffort, onClose, onUpdated }: {
  taskId: string
  projectId: string
  taskTitle: string
  estimatedEffort: number | null
  onClose: () => void
  onUpdated: (newActualEffort: number) => void
}) {
  const [entries, setEntries]     = useState<TimeEntryItem[]>([])
  const [loading, setLoading]     = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [date, setDate]           = useState(todayStr())
  const [hours, setHours]         = useState("")
  const [note, setNote]           = useState("")
  const [error, setError]         = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/projects/${projectId}/tasks/${taskId}/time-entries`)
      .then(r => r.json())
      .then(data => { setEntries(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [taskId, projectId])

  const totalHours = entries.reduce((s, e) => s + e.hours, 0)
  const pctEst = estimatedEffort && estimatedEffort > 0
    ? Math.round((totalHours / estimatedEffort) * 100)
    : null
  const overBudget = pctEst !== null && pctEst > 100

  async function addEntry() {
    const h = parseFloat(hours)
    if (!h || h <= 0) { setError("Informe um valor de horas válido"); return }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks/${taskId}/time-entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours: h, date, note: note || undefined }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? "Erro ao lançar horas"); return }
      setEntries(json.entries)
      setHours("")
      setNote("")
      onUpdated(json.actualEffort)
    } finally {
      setSubmitting(false)
    }
  }

  async function deleteEntry(entryId: string) {
    const res = await fetch(`/api/projects/${projectId}/tasks/${taskId}/time-entries/${entryId}`, { method: "DELETE" })
    if (res.ok) {
      const json = await res.json()
      setEntries(prev => prev.filter(e => e.id !== entryId))
      onUpdated(json.actualEffort)
    }
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex flex-col bg-white shadow-2xl"
      style={{ width: 380, borderLeft: "1px solid #E2E8F0" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
        <div className="min-w-0">
          <h3 className="font-black text-[#0F172A] text-sm flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" /> Apontamento de Horas
          </h3>
          <p className="text-xs text-slate-400 truncate mt-0.5">{taskTitle}</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Summary */}
      <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 shrink-0">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Lançado</p>
            <p className="text-2xl font-black text-[#0F172A] leading-none mt-1">{totalHours.toFixed(1)}<span className="text-sm font-semibold text-slate-400 ml-0.5">h</span></p>
          </div>
          {estimatedEffort && estimatedEffort > 0 && (
            <>
              <div className="w-px h-8 bg-slate-200" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Estimado</p>
                <p className="text-2xl font-black text-[#0F172A] leading-none mt-1">{estimatedEffort.toFixed(1)}<span className="text-sm font-semibold text-slate-400 ml-0.5">h</span></p>
              </div>
              <div className="w-px h-8 bg-slate-200" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">% Est.</p>
                <p className={`text-2xl font-black leading-none mt-1 ${overBudget ? "text-red-500" : "text-emerald-500"}`}>
                  {pctEst}%
                </p>
              </div>
            </>
          )}
        </div>
        {estimatedEffort && estimatedEffort > 0 && (
          <div className="mt-3 bg-slate-200 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${overBudget ? "bg-red-400" : "bg-amber-400"}`}
              style={{ width: `${Math.min(100, (totalHours / estimatedEffort) * 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Add entry form */}
      <div className="px-5 py-4 border-b border-slate-100 shrink-0">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Lançar Horas</p>
        <div className="flex gap-2 mb-2">
          <div className="flex-1">
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">Data</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full h-8 px-2.5 text-xs rounded-lg border border-slate-200 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-100 transition-colors"
            />
          </div>
          <div style={{ width: 88 }}>
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">Horas</label>
            <input
              type="number"
              min="0.25" max="24" step="0.25"
              value={hours}
              onChange={e => setHours(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !submitting && addEntry()}
              placeholder="0,0"
              className="w-full h-8 px-2.5 text-xs rounded-lg border border-slate-200 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-100 transition-colors text-center font-bold"
            />
          </div>
        </div>
        <input
          type="text"
          value={note}
          onChange={e => setNote(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !submitting && addEntry()}
          placeholder="O que foi feito? (opcional)"
          className="w-full h-8 px-2.5 text-xs rounded-lg border border-slate-200 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-100 transition-colors mb-2.5"
        />
        {error && <p className="text-xs text-red-500 font-medium mb-2">{error}</p>}
        <button
          onClick={addEntry}
          disabled={submitting || !hours}
          className="w-full h-8 rounded-xl text-xs font-bold text-white transition-all disabled:opacity-50 hover:opacity-90 active:scale-[0.98]"
          style={{ background: "linear-gradient(135deg, #D97706, #F59E0B)", boxShadow: "0 3px 10px rgba(217,119,6,0.25)" }}>
          {submitting
            ? <span className="flex items-center justify-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Lançando…</span>
            : <span className="flex items-center justify-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Lançar Horas</span>}
        </button>
      </div>

      {/* Entries list */}
      <div className="flex-1 overflow-y-auto px-5 py-3">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center gap-2">
            <Clock className="w-9 h-9 text-slate-200" />
            <p className="text-sm font-semibold text-slate-400">Nenhuma hora lançada</p>
            <p className="text-xs text-slate-300">Use o formulário acima para registrar horas trabalhadas</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
              Histórico ({entries.length} {entries.length === 1 ? "lançamento" : "lançamentos"})
            </p>
            {entries.map(e => (
              <div key={e.id}
                className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 hover:border-amber-200 hover:bg-amber-50/40 transition-all group">
                <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center shrink-0 text-xs font-black text-amber-700 overflow-hidden">
                  {e.user.image
                    ? <img src={e.user.image} className="w-7 h-7 object-cover" alt="" />
                    : e.user.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-xs font-semibold text-slate-700 truncate">{e.user.name}</p>
                    <span className="text-xs font-black text-amber-600 shrink-0 bg-amber-50 px-1.5 py-0.5 rounded-md">
                      {e.hours % 1 === 0 ? e.hours : e.hours.toFixed(2)}h
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {format(parseISO(e.date.slice(0, 10) + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                  </p>
                  {e.note && (
                    <p className="text-xs text-slate-500 mt-1 italic leading-relaxed">{e.note}</p>
                  )}
                </div>
                <button
                  onClick={() => deleteEntry(e.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all shrink-0"
                  title="Remover lançamento">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Evidence Panel ───────────────────────────────────────────────────────────

function EvidencePanel({ taskId, projectId, taskTitle, onClose, onUploaded }: {
  taskId: string
  projectId: string
  taskTitle: string
  onClose: () => void
  onUploaded: (count: number) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [atts, setAtts] = useState<{ id: string; fileName: string; fileUrl: string; fileType: string; fileSize: number | null }[]>([])
  const [uploading, setUploading] = useState(false)
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    getTaskAttachments(taskId).then((data) => { setAtts(data); setLoading(false) }).catch(() => setLoading(false))
  }, [taskId])

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    e.target.value = ""
    setUploading(true)
    try {
      const fd = new FormData()
      for (const f of files) fd.append("files", f)
      const res  = await fetch("/api/upload", { method: "POST", body: fd })
      const json = await res.json() as { files: { name: string; url: string; size: number }[] }
      const uploads: AttachmentUpload[] = json.files.map((f, i) => ({
        fileName: f.name,
        fileUrl:  f.url,
        fileType: files[i]?.type ?? "application/octet-stream",
        fileSize: f.size,
      }))
      await addTaskAttachments(taskId, projectId, uploads)
      const refreshed = await getTaskAttachments(taskId)
      onUploaded(refreshed.length)
      setAtts(refreshed)
    } catch {}
    setUploading(false)
  }

  function attIcon(fileName: string) {
    const ext = fileName.split(".").pop()?.toLowerCase() ?? ""
    if (["jpg","jpeg","png","gif","webp","svg"].includes(ext)) return FileImage
    if (["zip","rar","7z","tar"].includes(ext)) return FileArchive
    if (["pdf","doc","docx","xls","xlsx","ppt","pptx"].includes(ext)) return FileText
    return Paperclip
  }

  function fmtSize(bytes: number | null) {
    if (!bytes) return ""
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex flex-col bg-white shadow-2xl" style={{ width: 360, borderLeft: "1px solid #E2E8F0" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="min-w-0">
          <h3 className="font-black text-[#0F172A] text-sm flex items-center gap-2">
            <Paperclip className="w-4 h-4 text-violet-500 shrink-0" />
            Evidências da Conclusão
          </h3>
          <p className="text-[10px] text-slate-400 mt-0.5 truncate">{taskTitle}</p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-[#0F172A] transition-colors shrink-0 ml-2">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2" style={{ scrollbarWidth: "thin" }}>
        {loading ? (
          <div className="flex items-center justify-center h-24">
            <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
          </div>
        ) : atts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-300 text-center">
            <Paperclip className="w-10 h-10 mb-3" />
            <p className="text-sm font-semibold text-slate-400">Nenhuma evidência ainda</p>
            <p className="text-xs text-slate-300 mt-1">Faça upload de arquivos que comprovem a conclusão desta atividade</p>
          </div>
        ) : (
          atts.map((att) => {
            const Icon = attIcon(att.fileName)
            return (
              <a
                key={att.id}
                href={att.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                download={att.fileName}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white border border-slate-100 hover:border-violet-200 hover:shadow-sm transition-all group"
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "linear-gradient(135deg, rgba(123,47,190,0.08), rgba(147,51,234,0.12))" }}>
                  <Icon className="w-4 h-4 text-violet-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-700 truncate group-hover:text-violet-700 transition-colors">{att.fileName}</p>
                  {att.fileSize && <p className="text-[10px] text-slate-400 mt-0.5">{fmtSize(att.fileSize)}</p>}
                </div>
                <Download className="w-3.5 h-3.5 text-slate-300 group-hover:text-violet-500 transition-colors shrink-0" />
              </a>
            )
          })
        )}
      </div>

      {/* Footer upload */}
      <div className="px-4 py-4 border-t border-slate-100 space-y-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="w-full flex items-center justify-center gap-2 h-10 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50 hover:opacity-90 active:scale-[0.98]"
          style={{ background: "linear-gradient(135deg, #7B2FBE, #2463FF)", boxShadow: "0 4px 12px rgba(123,47,190,0.25)" }}
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? "Enviando..." : "Adicionar Evidência"}
        </button>
        <p className="text-center text-[10px] text-slate-300">Excel · PDF · Imagens · Word · Qualquer formato</p>
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFiles} />
      </div>
    </div>
  )
}

// ─── Area Form ────────────────────────────────────────────────────────────────

// ─── Comment Panel ────────────────────────────────────────────────────────────

type CmtItem = { id: string; content: string; createdAt: string; user: { name: string; image: string | null } }

function CommentPanel({ taskId, taskTitle, projectId, onClose, onCommentAdded }: {
  taskId:         string
  taskTitle:      string
  projectId:      string
  onClose:        () => void
  onCommentAdded: () => void
}) {
  const [comments, setComments] = useState<CmtItem[]>([])
  const [loading,  setLoading]  = useState(true)
  const [text,     setText]     = useState("")
  const [sending,  setSending]  = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getTaskDetail(taskId).then(d => {
      setComments((d?.comments ?? []) as CmtItem[])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [taskId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [comments])

  async function handleSend() {
    const content = text.trim()
    if (!content) return
    setSending(true)
    try {
      const c = await addTaskComment(taskId, projectId, content)
      setComments(prev => [...prev, c as CmtItem])
      setText("")
      onCommentAdded()
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex flex-col bg-white shadow-2xl" style={{ width: 440, borderLeft: "1px solid #E2E8F0" }}>

        {/* Header */}
        <div className="shrink-0 px-5 py-4 border-b border-slate-100" style={{ background: "linear-gradient(135deg,rgba(36,99,255,0.03),rgba(139,47,255,0.04))" }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Histórico de comentários</p>
              <h3 className="text-sm font-bold text-[#0F172A] leading-snug line-clamp-2">{taskTitle}</h3>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all shrink-0 mt-0.5">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Comment list */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {loading ? (
            <div className="flex justify-center items-center h-32">
              <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
            </div>
          ) : comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <MessageSquare className="w-8 h-8 text-slate-200" />
              <p className="text-sm text-slate-400">Nenhum comentário ainda</p>
              <p className="text-xs text-slate-300">Adicione o primeiro comentário abaixo</p>
            </div>
          ) : (
            comments.map((c) => {
              const isCP  = c.content.startsWith("[Checkpoint")
              const badge = isCP ? (c.content.match(/^\[Checkpoint ([^\]]+)\]/) ?? [])[1] ?? "" : ""
              const body  = isCP ? c.content.replace(/^\[Checkpoint [^\]]+\]\s*/, "") : c.content
              return (
                <div key={c.id} className="rounded-xl p-3" style={{ background: isCP ? "rgba(36,99,255,0.04)" : "#F8FAFC", border: isCP ? "1px solid rgba(36,99,255,0.14)" : "1px solid #E2E8F0" }}>
                  <div className="flex items-center gap-2 mb-2">
                    <UserAvatar name={c.user.name} image={c.user.image} size={22} />
                    <span className="text-xs font-bold text-slate-700">{c.user.name.split(" ")[0]}</span>
                    {isCP && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: "#EFF6FF", color: "#2463FF" }}>
                        Checkpoint {badge}
                      </span>
                    )}
                    <span className="text-[9px] text-slate-400 ml-auto shrink-0">
                      {format(new Date(c.createdAt), "dd/MM HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">{body}</p>
                </div>
              )
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* New comment input */}
        <div className="shrink-0 px-5 py-4 border-t border-slate-100" style={{ background: "#FAFAFA" }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSend() } }}
            placeholder="Escreva um comentário... (Ctrl+Enter para enviar)"
            rows={3}
            className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2.5 resize-none outline-none placeholder:text-slate-300 transition-all"
            style={{ lineHeight: "1.5" }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "#7B2FBE"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(123,47,190,0.08)" }}
            onBlur={(e)  => { e.currentTarget.style.borderColor = "#E2E8F0"; e.currentTarget.style.boxShadow = "none" }}
          />
          <div className="flex justify-between items-center mt-2">
            <span className="text-[9px] text-slate-300">Ctrl+Enter para enviar</span>
            <button
              onClick={handleSend}
              disabled={!text.trim() || sending}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "#7B2FBE", color: "#fff" }}
            >
              {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              Enviar
            </button>
          </div>
        </div>

      </div>
    </>
  )
}

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
            const d    = addDays(ganttStart, i)
            const ds   = format(d, "yyyy-MM-dd")
            const isWE = isSaturday(d) || isSunday(d)
            const isHol = !isWE && isHoliday(ds)
            const holName = isHol ? getHolidayName(ds) : null
            return (
              <div key={i} title={holName ?? undefined} style={{
                position: "absolute", left: i * dayWidth, width: dayWidth, height: 32,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                borderRight: "1px solid rgba(255,255,255,0.04)",
                background: isHol ? "rgba(249,115,22,0.18)" : isWE ? "rgba(255,255,255,0.04)" : "transparent",
              }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: isHol ? "rgba(249,115,22,0.90)" : isWE ? "rgba(248,250,252,0.35)" : "rgba(248,250,252,0.55)" }}>
                  {format(d, "EEE", { locale: ptBR }).slice(0, 1).toUpperCase()}
                </span>
                <span style={{ fontSize: 10, fontWeight: isHol ? 800 : 600, color: isHol ? "rgba(249,115,22,1)" : isWE ? "rgba(248,250,252,0.30)" : "rgba(248,250,252,0.70)" }}>
                  {format(d, "d")}
                </span>
                {isHol && <div style={{ width: 3, height: 3, borderRadius: "50%", background: "#F97316" }} />}
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

export function ScheduleClient({ project, initialAreas, initialTasks, members: initialMembers }: ScheduleClientProps) {
  const [tasks, setTasks]   = useState<Task[]>(initialTasks)
  const [areas, setAreas]   = useState<Area[]>(initialAreas)
  const [members, setMembers] = useState<Member[]>(initialMembers)
  const [viewMode, setViewMode] = useState<"list" | "gantt" | "curva-s">("list")

  // List view state
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(() => new Set(initialAreas.map((a) => a.id)))
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(() => {
    const parentIds = new Set(initialTasks.filter((t) => t.parentId).map((t) => t.parentId!))
    return new Set(initialTasks.filter((t) => parentIds.has(t.id)).map((t) => t.id))
  })
  const [search, setSearch]                 = useState("")
  const [hideDone, setHideDone]             = useState(false)
  const [filterResponsible, setFilterResponsible] = useState("")
  const [addingArea, setAddingArea]         = useState(false)

  // Gantt state
  const [expandedGantt, setExpandedGantt] = useState<Set<string>>(() =>
    new Set(initialTasks.filter((t) => !t.parentId).map((t) => t.id))
  )
  const [zoom, setZoom] = useState<Zoom>("week")

  const [panel, setPanel]         = useState<{ mode: "add" | "edit"; task: Partial<Task> & { projectId: string } } | null>(null)
  const [evidencePanel, setEvidencePanel] = useState<{ taskId: string; title: string } | null>(null)
  const [timePanel, setTimePanel] = useState<{ taskId: string; title: string; estimatedEffort: number | null } | null>(null)
  const [commentPanel, setCommentPanel] = useState<{ taskId: string; title: string } | null>(null)
  const [pending, start]          = useTransition()
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [editTitle, setEditTitle] = useState<{ id: string; val: string } | null>(null)
  const [editNum,   setEditNum]   = useState<{ id: string; field: "estimatedEffort" | "actualEffort" | "progress" | "budgetedCost" | "actualCost"; val: string } | null>(null)
  const [sortBy,    setSortBy]    = useState<"startDate" | "endDate" | null>(null)
  const [editPred,  setEditPred]  = useState<{ id: string; val: string } | null>(null)
  // ── Template modal state ─────────────────────────────────────────────────
  const [tplModalOpen,    setTplModalOpen]    = useState(false)
  const [tplLoading,      setTplLoading]      = useState(false)
  const [tplList,         setTplList]         = useState<Template[]>([])
  const [tplSelected,     setTplSelected]     = useState<Template | null>(null)
  const [tplStartDate,    setTplStartDate]    = useState<string>("")
  const [tplApplying,     setTplApplying]     = useState(false)
  const [cascadeInfo, setCascadeInfo] = useState<{ count: number; delta: number } | null>(null)

  // ── Resizable columns ────────────────────────────────────────────────────
  const [colW, setColWState] = useState<Record<ColKey, number>>(() => {
    try {
      const s = typeof window !== "undefined" ? localStorage.getItem(`kronex-col-widths-${project.id}`) : null
      if (s) return { ...COL_DEFAULTS, ...JSON.parse(s) }
    } catch {}
    return { ...COL_DEFAULTS }
  })
  const colWRef = useRef(colW)
  const listMinW = 24 + 84 + (Object.keys(COL_DEFAULTS) as ColKey[]).reduce((s, k) => s + colW[k], 0)

  function startColResize(col: ColKey, e: React.MouseEvent) {
    e.preventDefault()
    const startX = e.clientX
    const startW = colWRef.current[col]
    let raf = 0
    function onMove(ev: MouseEvent) {
      const nw = Math.max(COL_MIN[col], startW + ev.clientX - startX)
      colWRef.current = { ...colWRef.current, [col]: nw }
      if (raf) return
      raf = requestAnimationFrame(() => {
        setColWState({ ...colWRef.current })
        raf = 0
      })
    }
    function onUp() {
      if (raf) cancelAnimationFrame(raf)
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
      setColWState({ ...colWRef.current })
      try { localStorage.setItem(`kronex-col-widths-${project.id}`, JSON.stringify(colWRef.current)) } catch {}
    }
    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
  }

  // Resize handle rendered inside each resizable header cell
  function rh(col: ColKey) {
    return (
      <div
        onMouseDown={(e) => startColResize(col, e)}
        onDragStart={(e) => e.stopPropagation()}
        draggable={false}
        title="Arrastar para redimensionar"
        style={{ position: "absolute", right: -4, top: "20%", bottom: "20%", width: 9, cursor: "col-resize", zIndex: 20, borderRight: "2px solid rgba(255,255,255,0.18)", borderRadius: 2 }}
        className="hover:border-r-white/70 transition-colors"
      />
    )
  }

  // ── Column order ─────────────────────────────────────────────────────────
  const [colOrder, setColOrderState] = useState<ColKey[]>(() => {
    try {
      const s = typeof window !== "undefined" ? localStorage.getItem(`kronex-col-order-${project.id}`) : null
      if (s) {
        const parsed = JSON.parse(s) as ColKey[]
        if (parsed.length === DEFAULT_COL_ORDER.length && DEFAULT_COL_ORDER.every(k => parsed.includes(k))) return parsed
      }
    } catch {}
    return [...DEFAULT_COL_ORDER]
  })
  const [dragColFrom, setDragColFrom] = useState<ColKey | null>(null)
  const [dragColOver, setDragColOver] = useState<ColKey | null>(null)

  function saveColOrder(order: ColKey[]) {
    setColOrderState(order)
    try { localStorage.setItem(`kronex-col-order-${project.id}`, JSON.stringify(order)) } catch {}
  }
  function handleColDragStart(col: ColKey, e: React.DragEvent) {
    const rect = e.currentTarget.getBoundingClientRect()
    if (e.clientX > rect.right - 12) { e.preventDefault(); return }
    setDragColFrom(col)
    e.dataTransfer.effectAllowed = "move"
  }
  function handleColDragOver(col: ColKey, e: React.DragEvent) {
    if (!dragColFrom || dragColFrom === col) return
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    if (dragColOver !== col) setDragColOver(col)
  }
  function handleColDrop(col: ColKey, e: React.DragEvent) {
    e.preventDefault()
    if (!dragColFrom || dragColFrom === col) { setDragColFrom(null); setDragColOver(null); return }
    const from = colOrder.indexOf(dragColFrom)
    const to   = colOrder.indexOf(col)
    if (from === -1 || to === -1) { setDragColFrom(null); setDragColOver(null); return }
    const next = [...colOrder]; next.splice(from, 1); next.splice(to, 0, dragColFrom)
    saveColOrder(next)
    setDragColFrom(null)
    setDragColOver(null)
  }

  // ── Curva S view state ───────────────────────────────────────────────────
  const [sCurveData, setSCurveData]     = useState<SCurveData | null>(null)
  const [sCurveLoading, setSCurveLoading] = useState(false)
  const [sCurveKey, setSCurveKey]       = useState(0)

  // ── Baseline modal state ─────────────────────────────────────────────────
  const [baselineModal,    setBaselineModal]    = useState(false)
  const [baselineName,     setBaselineName]     = useState("")
  const [baselineDesc,     setBaselineDesc]     = useState("")
  const [baselineCreating, setBaselineCreating] = useState(false)
  const [baselineToast,    setBaselineToast]    = useState<string | null>(null)

  async function openTemplateModal() {
    setTplModalOpen(true)
    setTplSelected(null)
    setTplStartDate(new Date().toISOString().slice(0, 10))
    setTplLoading(true)
    try {
      const list = await getTemplates()
      setTplList(list)
    } finally {
      setTplLoading(false)
    }
  }

  async function handleApplyTemplate() {
    if (!tplSelected || tplApplying) return
    setTplApplying(true)
    try {
      const start = tplStartDate ? new Date(tplStartDate) : new Date()
      const result = await applyTemplate(project.id, tplSelected.id, start)
      // Reload page to show new tasks
      window.location.reload()
    } catch (e) {
      alert("Erro ao aplicar modelo: " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setTplApplying(false)
      setTplModalOpen(false)
    }
  }

  // Always-current ref — safe to read inside async callbacks
  const tasksRef = useRef(tasks)
  useLayoutEffect(() => { tasksRef.current = tasks })

  useEffect(() => {
    if (!cascadeInfo) return
    const timer = setTimeout(() => setCascadeInfo(null), 4000)
    return () => clearTimeout(timer)
  }, [cascadeInfo])

  useEffect(() => {
    if (!baselineToast) return
    const t = setTimeout(() => setBaselineToast(null), 4000)
    return () => clearTimeout(t)
  }, [baselineToast])

  useEffect(() => {
    if (viewMode !== "curva-s") return
    if (sCurveData) return
    loadSCurve()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode])

  async function loadSCurve() {
    setSCurveLoading(true)
    try {
      const res = await fetch(`/api/projects/${project.id}/s-curve`)
      const json = await res.json()
      setSCurveData(json)
    } finally {
      setSCurveLoading(false)
    }
  }

  async function createBaselineFromHeader() {
    setBaselineCreating(true)
    try {
      const res = await fetch(`/api/projects/${project.id}/baselines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:   baselineName || undefined,
          reason: baselineDesc || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) { alert(json.error ?? "Erro ao gravar baseline"); return }
      setBaselineModal(false)
      setBaselineName("")
      setBaselineDesc("")
      setBaselineToast(`${json.name} gravada com sucesso`)
      // Refresh S-Curve data (forces remount with fresh data)
      const fresh = await fetch(`/api/projects/${project.id}/s-curve`)
      const freshJson = await fresh.json()
      setSCurveData(freshJson)
      setSCurveKey(k => k + 1)
    } finally {
      setBaselineCreating(false)
    }
  }

  // Gantt-specific expand + inline edit state
  const [expandedGanttAreas, setExpandedGanttAreas] = useState<Set<string>>(
    () => new Set([...initialAreas.map((a) => a.id), "__ungrouped__"])
  )
  const [ganttInlineId,  setGanttInlineId]  = useState<string | null>(null)
  const [ganttInlineVal, setGanttInlineVal] = useState("")

  // ── Drag-and-drop state ──────────────────────────────────────────────────
  const [draggedId,  setDraggedId]  = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [dragType,   setDragType]   = useState<"area" | "task" | null>(null)

  function onDragStart(e: React.DragEvent, id: string, type: "area" | "task") {
    setDraggedId(id)
    setDragType(type)
    e.dataTransfer.effectAllowed = "move"
  }

  function onDragOver(e: React.DragEvent, id: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    if (id !== dragOverId) setDragOverId(id)
  }

  function onDrop(e: React.DragEvent, targetId: string, targetType: "area" | "task") {
    e.preventDefault()
    const fromId = draggedId
    if (!fromId || fromId === targetId) { cleanDrag(); return }

    if (dragType === "area" && targetType === "area") {
      const arr      = [...areas]
      const fromIdx  = arr.findIndex((a) => a.id === fromId)
      const toIdx    = arr.findIndex((a) => a.id === targetId)
      if (fromIdx === -1 || toIdx === -1) { cleanDrag(); return }
      const [item]   = arr.splice(fromIdx, 1)
      arr.splice(toIdx, 0, item)
      setAreas(arr)
      start(() => reorderAreas(project.id, arr.map((a) => a.id)))
    } else if (dragType === "task" && targetType === "task") {
      const dragged = tasks.find((t) => t.id === fromId)
      const target  = tasks.find((t) => t.id === targetId)
      if (!dragged || !target) { cleanDrag(); return }
      if (dragged.parentId !== target.parentId || dragged.wbsAreaId !== target.wbsAreaId) { cleanDrag(); return }

      const arr      = [...tasks]
      const fromIdx  = arr.findIndex((t) => t.id === fromId)
      const toIdx    = arr.findIndex((t) => t.id === targetId)
      const [item]   = arr.splice(fromIdx, 1)
      arr.splice(toIdx, 0, item)
      setTasks(arr.map((t, i) => ({ ...t, order: i })))

      const group    = arr.filter((t) => t.parentId === dragged.parentId && t.wbsAreaId === dragged.wbsAreaId)
      start(() => reorderTasks(project.id, group.map((t) => t.id)))
    }

    cleanDrag()
  }

  function cleanDrag() {
    setDraggedId(null)
    setDragOverId(null)
    setDragType(null)
  }

  const listHeaderRef = useRef<HTMLDivElement>(null)
  const listBodyRef   = useRef<HTMLDivElement>(null)

  const onListBodyScroll = useCallback(() => {
    if (listHeaderRef.current && listBodyRef.current) {
      listHeaderRef.current.scrollLeft = listBodyRef.current.scrollLeft
    }
  }, [])

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
    ...tasks.filter((t) => t.startDate).map((t) => parseDateStr(t.startDate!)),
    ...tasks.filter((t) => t.endDate).map((t) => parseDateStr(t.endDate!)),
  ], [tasks])

  const ganttStart = useMemo(() =>
    allDates.length ? startOfMonth(subDays(min(allDates), 14)) : startOfMonth(subMonths(today, 1))
  , [allDates, today])

  const ganttEnd = useMemo(() =>
    allDates.length ? endOfMonth(addDays(max(allDates), 30)) : endOfMonth(addMonths(today, 5))
  , [allDates, today])

  const totalDays  = differenceInDays(ganttEnd, ganttStart) + 1
  const ganttWidth = Math.max(900, totalDays * dayWidth)

  // EAP maps — always natural order so identifiers are stable
  const eapRows = useMemo(() => {
    const allAreaIds = new Set([...areas.map(a => a.id), "__ungrouped__"])
    const parentIds  = new Set(tasks.filter(t => t.parentId).map(t => t.parentId!))
    const expandedParents = new Set(tasks.filter(t => parentIds.has(t.id)).map(t => t.id))
    return buildListRows(areas, tasks, allAreaIds, expandedParents, "", false)
  }, [areas, tasks])
  const eapById = useMemo(() => {
    const m = new Map<string, string>()
    eapRows.forEach(r => { if (r.kind === "task") m.set(r.task.id, r.eap) })
    return m
  }, [eapRows])
  const idByEap = useMemo(() => {
    const m = new Map<string, string>()
    eapRows.forEach(r => { if (r.kind === "task") m.set(r.eap, r.task.id) })
    return m
  }, [eapRows])

  const sortedForList = useMemo(() => {
    if (!sortBy) return tasks
    return [...tasks].sort((a, b) => {
      const av = (a[sortBy] ?? "9999-99-99") as string
      const bv = (b[sortBy] ?? "9999-99-99") as string
      return av < bv ? -1 : av > bv ? 1 : 0
    })
  }, [tasks, sortBy])

  // IDs visíveis quando filtrando por responsável: tarefa + todos os ancestrais
  const filterVisibleIds = useMemo<Set<string> | null>(() => {
    if (!filterResponsible) return null
    const parentMap = new Map(tasks.map((t) => [t.id, t.parentId]))
    const matching  = tasks.filter((t) => t.responsibleId === filterResponsible).map((t) => t.id)
    const result    = new Set(matching)
    for (const id of matching) {
      let pid = parentMap.get(id)
      while (pid) { result.add(pid); pid = parentMap.get(pid) }
    }
    return result
  }, [tasks, filterResponsible])

  const listRows   = useMemo(
    () => buildListRows(areas, sortedForList, expandedAreas, expandedTasks, search, hideDone, filterVisibleIds, !!sortBy),
    [areas, sortedForList, expandedAreas, expandedTasks, search, hideDone, filterVisibleIds, sortBy],
  )

  // Gantt rows — area-grouped, uses its own expand sets
  const ganttRows  = useMemo(
    () => buildListRows(areas, tasks, expandedGanttAreas, expandedGantt, "", false, filterVisibleIds),
    [areas, tasks, expandedGanttAreas, expandedGantt, filterVisibleIds],
  )
  const ganttRowIndexMap = useMemo(() => {
    const m = new Map<string, number>()
    ganttRows.forEach((row, i) => { if (row.kind === "task") m.set(row.task.id, i) })
    return m
  }, [ganttRows])

  function dateToX(ds: string) { return differenceInDays(parseDateStr(ds), ganttStart) * dayWidth }
  const todayX = differenceInDays(today, ganttStart) * dayWidth

  useEffect(() => {
    if (!rightRef.current) return
    rightRef.current.scrollLeft = Math.max(0, todayX - 200)
  }, [])

  // ── CRUD ─────────────────────────────────────────────────────────────────

  function openAdd(parentId?: string, wbsAreaId?: string) {
    setPanel({ mode: "add", task: { projectId: project.id, parentId: parentId ?? null, wbsAreaId: wbsAreaId ?? null } })
  }
  function openEdit(t: Task) { setPanel({ mode: "edit", task: t }) }

  function applyAncestor(existing: Task, anc: AncestorUpdate): Task {
    return {
      ...existing,
      progress: anc.progress,
      status:   anc.status as Task["status"],
      ...(anc.startDate   !== undefined && { startDate:   anc.startDate }),
      ...(anc.endDate     !== undefined && { endDate:     anc.endDate }),
      ...(anc.actualStart !== undefined && { actualStart: anc.actualStart }),
      ...(anc.actualEnd   !== undefined && { actualEnd:   anc.actualEnd }),
    }
  }

  function applyTaskUpdates(task: Task, ancestors: AncestorUpdate[], successors: SuccessorUpdate[] = []) {
    setTasks(prev => {
      const map = new Map(prev.map(t => [t.id, t]))
      map.set(task.id, { ...map.get(task.id) ?? task, ...task })
      for (const anc of ancestors) {
        const existing = map.get(anc.id)
        if (existing) map.set(anc.id, applyAncestor(existing, anc))
      }
      for (const su of successors) {
        const existing = map.get(su.id)
        if (existing) map.set(su.id, { ...existing, startDate: su.startDate, endDate: su.endDate })
      }
      return [...map.values()]
    })
  }

  function handleSaved(t: Task, ancestors: AncestorUpdate[] = [], successors: SuccessorUpdate[] = []) {
    const latest = tasksRef.current
    const base = latest.some(x => x.id === t.id)
      ? latest.map(x => x.id === t.id ? t : x)
      : [...latest, t]
    const withAncestors = base.map(x => {
      const anc = ancestors.find(a => a.id === x.id)
      return anc ? applyAncestor(x, anc) : x
    })
    const withSuccessors = withAncestors.map(x => {
      const su = successors.find(s => s.id === x.id)
      return su ? { ...x, startDate: su.startDate, endDate: su.endDate } : x
    })
    setTasks(withSuccessors)
    if (successors.length > 0) setCascadeInfo({ count: successors.length, delta: 0 })
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

  function handleDeleteArea(areaId: string, areaName: string) {
    if (!confirm(`Excluir o módulo "${areaName}" e todas as suas atividades?`)) return
    start(async () => {
      await deleteArea(areaId, project.id)
      setAreas((prev) => prev.filter((a) => a.id !== areaId))
      setTasks((prev) => {
        const areaTaskIds = new Set(prev.filter((t) => t.wbsAreaId === areaId).map((t) => t.id))
        return prev.filter((t) => t.wbsAreaId !== areaId && !areaTaskIds.has(t.parentId ?? ""))
      })
      setExpandedAreas((prev) => { const s = new Set(prev); s.delete(areaId); return s })
      setPanel(null)
    })
  }

  function saveTaskField(taskId: string, data: Record<string, unknown>) {
    // Optimistic update with derived progress/status
    const current = tasksRef.current.find(t => t.id === taskId)
    if (current) {
      let optimistic = { ...current, ...data }
      if ("progress" in data && !("status" in data)) {
        optimistic.status = deriveStatus(optimistic.progress, current.status) as Task["status"]
      } else if ("status" in data && !("progress" in data)) {
        optimistic.progress = deriveProgress(optimistic.status, current.progress)
      }
      setTasks(prev => prev.map(t => t.id === taskId ? optimistic : t))
    }
    start(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await updateTask(taskId, project.id, data as any)
      applyTaskUpdates(result.task as Task, result.ancestors, result.successorUpdates)
      if (result.successorUpdates.length > 0) setCascadeInfo({ count: result.successorUpdates.length, delta: 0 })
    })
  }

  function saveDateField(taskId: string, field: "startDate" | "endDate", newVal: string | null) {
    const target = tasksRef.current.find(t => t.id === taskId)
    if (!target) { saveTaskField(taskId, { [field]: newVal }); return }

    const oldVal = (target[field as keyof Task] as string | null) ?? null
    if (oldVal === newVal) return

    // Optimistic: update the edited task, and if startDate changes also shift endDate
    // to preserve the visual duration (server will recalculate with working-day precision)
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t
      if (field === 'startDate' && t.endDate && newVal && t.startDate) {
        const delta = differenceInDays(new Date(newVal), new Date(t.startDate))
        const newEnd = addDays(new Date(t.endDate), delta).toISOString().slice(0, 10)
        return { ...t, startDate: newVal, endDate: newEnd }
      }
      return { ...t, [field]: newVal }
    }))

    start(async () => {
      const result = await updateTask(taskId, project.id, { [field]: newVal })
      // Apply the edited task (with server-computed endDate if startDate changed) + parents + successors
      applyTaskUpdates(result.task as Task, result.ancestors, result.successorUpdates)
      if (result.successorUpdates.length > 0) {
        setCascadeInfo({ count: result.successorUpdates.length, delta: 0 })
      }
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
  function toggleGanttArea(id: string) {
    setExpandedGanttAreas((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  function saveGanttInline(task: Task) {
    const newTitle = ganttInlineVal.trim()
    setGanttInlineId(null)
    setGanttInlineVal("")
    if (!newTitle || newTitle === task.title) return
    start(async () => {
      const updated = await updateTask(task.id, project.id, { title: newTitle })
      setTasks((prev) => {
        const i = prev.findIndex((x) => x.id === task.id)
        if (i === -1) return prev
        const arr = [...prev]; arr[i] = updated.task as Task; return arr
      })
    })
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
    for (const row of ganttRows) {
      if (row.kind !== "task") continue
      const task = row.task
      if (!task.dependencies.length || !task.startDate) continue
      const toIdx = ganttRowIndexMap.get(task.id)
      if (toIdx === undefined) continue
      const toX = dateToX(task.startDate)
      const toY = toIdx * ROW_H + ROW_H / 2
      for (const depId of task.dependencies) {
        const dep     = tasks.find((t) => t.id === depId)
        const fromIdx = ganttRowIndexMap.get(depId)
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
  }, [ganttRows, ganttRowIndexMap, tasks, dayWidth, ganttStart])

  async function handleExport() {
    setExporting(true)
    try {
      const { exportScheduleToExcel } = await import("@/lib/export-schedule")
      await exportScheduleToExcel(project.title, areas, tasks)
    } finally {
      setExporting(false)
    }
  }

  const completedCount = tasks.filter((t) => t.status === "COMPLETED").length

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full" style={{ background: "#F8FAFC" }}>

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col border-b border-slate-200 bg-white shrink-0">

        {/* Linha 1: navegação + CTA primário */}
        <div className="flex items-center gap-3 px-5 h-12">
          <Link href={`/projects/${project.id}`}
            className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-[#0F172A] transition-colors font-medium shrink-0">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Link>
          <div className="w-px h-5 bg-slate-200 shrink-0" />
          <p className="text-sm font-black text-[#0F172A] truncate min-w-0">{project.title}</p>

          <div className="flex-1" />

          {/* View toggle */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-slate-100 border border-slate-200 shrink-0">
            <button onClick={() => setViewMode("list")}
              className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg transition-all ${viewMode === "list" ? "bg-white text-[#0F172A] shadow-sm" : "text-slate-400 hover:text-slate-600"}`}>
              <List className="w-3.5 h-3.5" /> Lista
            </button>
            <button onClick={() => setViewMode("gantt")}
              className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg transition-all ${viewMode === "gantt" ? "bg-white text-[#0F172A] shadow-sm" : "text-slate-400 hover:text-slate-600"}`}>
              <BarChart2 className="w-3.5 h-3.5" /> Gantt
            </button>
            <button onClick={() => setViewMode("curva-s")}
              className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg transition-all ${viewMode === "curva-s" ? "bg-white text-[#0F172A] shadow-sm" : "text-slate-400 hover:text-slate-600"}`}>
              <TrendingUp className="w-3.5 h-3.5" /> Curva S
            </button>
          </div>

          {/* Gravar Baseline */}
          <button onClick={() => setBaselineModal(true)}
            className="inline-flex items-center gap-1.5 px-3 h-8 text-xs font-semibold rounded-xl border transition-all hover:opacity-90 shrink-0"
            style={{ borderColor: "rgba(245,158,11,0.4)", color: "#D97706", background: "rgba(245,158,11,0.07)" }}
            title="Congela as datas Início/Fim Plan. atuais como baseline de comparação">
            <Award className="w-3.5 h-3.5" /> Gravar Baseline
          </button>

          {/* Nova Atividade */}
          <button onClick={() => openAdd()}
            className="inline-flex items-center gap-2 px-4 h-8 text-xs font-bold rounded-xl text-white transition-all hover:opacity-90 shrink-0"
            style={{ background: "linear-gradient(135deg, #7B2FBE, #2463FF)", boxShadow: "0 4px 12px rgba(123,47,190,0.30)" }}>
            <Plus className="w-3.5 h-3.5" /> Nova Atividade
          </button>
        </div>

        {/* Linha 2: stats + filtros + ferramentas secundárias */}
        <div className="flex items-center gap-2 px-5 h-9 border-t border-slate-100">

          {/* Stats */}
          <div className="flex items-center gap-1.5 shrink-0 text-xs text-slate-400 font-medium">
            <span>{tasks.length} atividades</span>
            <span className="text-slate-200">·</span>
            <span>{completedCount} concluídas</span>
            {filterResponsible && filterVisibleIds !== null && (
              <>
                <span className="text-slate-200">·</span>
                <span className="text-[#7B2FBE] font-semibold">
                  {[...filterVisibleIds].filter(id => tasks.find(t => t.id === id && t.responsibleId === filterResponsible)).length} da pessoa
                </span>
              </>
            )}
          </div>

          {members.length > 0 && <div className="w-px h-3.5 bg-slate-200 mx-0.5 shrink-0" />}

          {/* Filtro por responsável */}
          {members.length > 0 && (
            <div className="flex items-center gap-1 shrink-0">
              <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <div className="relative">
                <select
                  value={filterResponsible}
                  onChange={(e) => setFilterResponsible(e.target.value)}
                  className={`h-7 pl-2 pr-6 text-xs rounded-lg border outline-none cursor-pointer transition-all appearance-none ${
                    filterResponsible
                      ? "border-[#7B2FBE] text-[#7B2FBE] bg-violet-50 font-semibold"
                      : "border-slate-200 text-slate-500 bg-white hover:border-slate-300"
                  }`}
                  style={{ minWidth: 120 }}
                >
                  <option value="">Todos</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
              </div>
              {filterResponsible && (
                <button onClick={() => setFilterResponsible("")} title="Limpar filtro"
                  className="p-0.5 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-400 transition-colors">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          <div className="flex-1" />

          {/* List-mode controls */}
          {viewMode === "list" && (
            <>
              <div className="relative shrink-0">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-300" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar atividade..."
                  className="pl-7 pr-3 h-7 text-xs rounded-lg border border-slate-200 bg-white outline-none focus:border-[#7B2FBE] transition-colors w-44"
                />
              </div>
              <button
                onClick={() => setHideDone((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-2.5 h-7 text-xs font-semibold rounded-lg border transition-all shrink-0 ${hideDone ? "bg-violet-50 border-violet-200 text-[#7B2FBE]" : "border-slate-200 text-slate-500 bg-white hover:border-slate-300"}`}>
                Ocultar concluídos
              </button>
              <button
                onClick={() => setSortBy(s => s === "startDate" ? "endDate" : s === "endDate" ? null : "startDate")}
                className={`inline-flex items-center gap-1.5 px-2.5 h-7 text-xs font-semibold rounded-lg border transition-all shrink-0 ${sortBy ? "bg-blue-50 border-blue-200 text-blue-600" : "border-slate-200 text-slate-500 bg-white hover:border-slate-300"}`}
                title="Ordenar por data">
                <ArrowUpDown className="w-3.5 h-3.5" />
                {sortBy === "startDate" ? "Início ↑" : sortBy === "endDate" ? "Fim ↑" : "Ordenar"}
              </button>
              <div className="flex items-center gap-0.5 shrink-0">
                <button onClick={expandAll} title="Expandir tudo" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all">
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                <button onClick={collapseAll} title="Recolher tudo" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all">
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="w-px h-3.5 bg-slate-200 mx-0.5 shrink-0" />
            </>
          )}

          {/* Gantt-mode controls */}
          {viewMode === "gantt" && (
            <>
              <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-slate-100 border border-slate-200 shrink-0">
                {(["month", "week", "day"] as Zoom[]).map((z) => (
                  <button key={z} onClick={() => setZoom(z)}
                    className={`px-2.5 py-0.5 text-xs font-bold rounded-lg transition-all ${zoom === z ? "bg-white text-[#0F172A] shadow-sm" : "text-slate-400 hover:text-slate-600"}`}>
                    {z === "month" ? "Mês" : z === "week" ? "Semana" : "Dia"}
                  </button>
                ))}
              </div>
              <button
                onClick={() => rightRef.current && (rightRef.current.scrollLeft = Math.max(0, todayX - 250))}
                className="inline-flex items-center gap-1.5 px-2.5 h-7 text-xs font-semibold rounded-lg border border-slate-200 text-slate-500 hover:border-[#7B2FBE] hover:text-[#7B2FBE] transition-all bg-white shrink-0">
                <CalendarDays className="w-3.5 h-3.5" /> Hoje
              </button>
              <div className="w-px h-3.5 bg-slate-200 mx-0.5 shrink-0" />
            </>
          )}

          {/* Nova Área (list only) */}
          {viewMode === "list" && (
            <button onClick={() => setAddingArea(true)}
              className="inline-flex items-center gap-1.5 px-2.5 h-7 text-xs font-semibold rounded-lg border border-slate-200 text-slate-500 hover:border-[#7B2FBE] hover:text-[#7B2FBE] transition-all bg-white shrink-0">
              <FolderOpen className="w-3.5 h-3.5" /> Nova Área
            </button>
          )}

          {/* Exportar Excel e Usar Modelo — ocultados na view Curva S */}
          {viewMode !== "curva-s" && (
            <>
              <button
                onClick={handleExport}
                disabled={exporting || tasks.length === 0}
                className="inline-flex items-center gap-1.5 px-2.5 h-7 text-xs font-semibold rounded-lg border transition-all hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                style={{ borderColor: "#D1FAE5", color: "#059669", background: "white" }}
                title="Exportar cronograma em Excel">
                {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
                {exporting ? "Exportando…" : "Excel"}
              </button>
              <button onClick={openTemplateModal}
                className="inline-flex items-center gap-1.5 px-2.5 h-7 text-xs font-semibold rounded-lg border border-slate-200 text-slate-500 hover:border-[#7B2FBE] hover:text-[#7B2FBE] transition-all bg-white shrink-0"
                title={tasks.length === 0 ? "Iniciar cronograma a partir de um modelo" : "Adicionar atividades de um modelo"}>
                <LayoutTemplate className="w-3.5 h-3.5" /> Usar Modelo
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── LIST VIEW ────────────────────────────────────────────────────── */}
      {viewMode === "list" && (
        <div className="flex flex-col flex-1 min-h-0 bg-white">

          {/* Header — overflow hidden, synced via JS to body scrollLeft */}
          <div ref={listHeaderRef} style={{ overflowX: "hidden", overflowY: "visible", flexShrink: 0 }}>
            <div className="flex items-center border-b border-white/10 bg-[#0F172A]" style={{ height: 44, minWidth: listMinW }}>
              <div style={{ width: 24, flexShrink: 0 }} />
              <div style={{ width: 84, flexShrink: 0, borderRight: "1px solid rgba(255,255,255,0.10)" }} className="text-[10px] font-black text-white/40 uppercase tracking-widest text-center h-full flex items-center justify-center">Ações</div>
              {colOrder.map(col => {
                const { label, cls } = COL_HEADER_META[col]
                const isOver = dragColOver === col && dragColFrom !== null
                const isDrag = dragColFrom === col
                return (
                  <div
                    key={col}
                    draggable
                    onDragStart={(e) => handleColDragStart(col, e)}
                    onDragOver={(e) => handleColDragOver(col, e)}
                    onDrop={(e) => handleColDrop(col, e)}
                    onDragEnd={() => { setDragColFrom(null); setDragColOver(null) }}
                    style={{
                      width: colW[col],
                      flexShrink: 0,
                      position: "relative",
                      opacity: isDrag ? 0.4 : 1,
                      background: isOver ? "rgba(36,99,255,0.22)" : undefined,
                      borderLeft: isOver ? "2px solid #2463FF" : "1px solid rgba(255,255,255,0.08)",
                      cursor: "grab",
                      userSelect: "none",
                      transition: "background 0.1s",
                    }}
                    className={`text-[10px] font-black uppercase tracking-widest ${cls}`}
                  >
                    {label}{rh(col)}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Scrollable body — drives header scrollLeft via onListBodyScroll */}
          <div ref={listBodyRef} className="flex-1 min-h-0 overflow-auto" onScroll={onListBodyScroll}>
          <div style={{ minWidth: listMinW }}>
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
                      className="flex items-center gap-0 border-b border-slate-100 select-none group transition-colors"
                      draggable
                      onDragStart={(e) => onDragStart(e, row.id, "area")}
                      onDragOver={(e) => onDragOver(e, row.id)}
                      onDrop={(e) => onDrop(e, row.id, "area")}
                      onDragEnd={cleanDrag}
                      style={{
                        borderLeft: `4px solid ${row.color ?? "#CBD5E1"}`,
                        background: dragOverId === row.id && dragType === "area" ? "#EEF2FF" : "#F8FAFC",
                        minHeight: 44,
                        outline: dragOverId === row.id && dragType === "area" ? "2px solid #7B2FBE" : "none",
                        outlineOffset: -2,
                      }}
                    >
                      {/* Drag handle */}
                      <div
                        style={{ width: 24, flexShrink: 0, cursor: "grab" }}
                        className="flex items-center justify-center text-slate-300 hover:text-slate-500 transition-colors"
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <GripVertical className="w-3.5 h-3.5" />
                      </div>

                      {/* collapse toggle */}
                      <div
                        className="flex items-center justify-end gap-1 pr-2 shrink-0 cursor-pointer"
                        style={{ width: 84 }}
                        onClick={() => toggleArea(row.id)}
                      >
                        {isExp
                          ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          : <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                      </div>

                      {/* Inline actions for area */}
                      <div style={{ width: 84 }} className="flex items-center justify-center gap-0.5 shrink-0">
                        {row.id !== "__ungrouped__" && (
                          <>
                            <button
                              onClick={() => openAdd(undefined, row.id)}
                              title="Nova atividade nesta área"
                              className="w-6 h-6 rounded-md flex items-center justify-center transition-all hover:scale-110"
                              style={{ background: "#DCFCE7", color: "#16A34A" }}
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleDeleteArea(row.id, row.name)}
                              title="Excluir módulo e todas as atividades"
                              className="w-6 h-6 rounded-md flex items-center justify-center transition-all hover:scale-110 opacity-0 group-hover:opacity-100"
                              style={{ background: "#FEE2E2", color: "#DC2626" }}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </>
                        )}
                      </div>

                      {/* Reorderable columns — area row */}
                      {(() => {
                        const areaCells: Record<ColKey, React.ReactNode> = {
                          eap: <div style={{ width: colW.eap, flexShrink: 0 }} className="flex items-center justify-center"><span className="text-[10px] font-bold text-slate-400 font-mono">{row.eap}</span></div>,
                          name: <div style={{ width: colW.name, flexShrink: 0 }} className="flex items-center gap-2.5 px-2 cursor-pointer overflow-hidden" onClick={() => toggleArea(row.id)}><div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: row.color ?? "#CBD5E1" }} /><span className="font-black text-[#0F172A] text-sm truncate">{row.name}</span><span className="text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0" style={{ background: "#EDE9FE", color: "#7C3AED" }}>Módulo</span></div>,
                          status: <div style={{ width: colW.status, flexShrink: 0 }} className="flex justify-center"><span className="text-[10px] text-slate-400 font-medium">{row.doneCount}/{row.taskCount}</span></div>,
                          responsible: <div style={{ width: colW.responsible, flexShrink: 0 }} />,
                          startDate:   <div style={{ width: colW.startDate,   flexShrink: 0 }} />,
                          endDate:     <div style={{ width: colW.endDate,     flexShrink: 0 }} />,
                          actualStart: <div style={{ width: colW.actualStart, flexShrink: 0 }} />,
                          actualEnd:   <div style={{ width: colW.actualEnd,   flexShrink: 0 }} />,
                          estH:        <div style={{ width: colW.estH,        flexShrink: 0 }} />,
                          realH:       <div style={{ width: colW.realH,       flexShrink: 0 }} />,
                          pctEst:      <div style={{ width: colW.pctEst,      flexShrink: 0 }} />,
                          pctReal: <div style={{ width: colW.pctReal, flexShrink: 0 }} className="px-3">
                            {row.taskCount > 0 && (
                              <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-bold text-slate-500 text-center">{progress}%</span>
                                <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                                  <div style={{ width: `${progress}%`, height: "100%", background: row.color ?? "#CBD5E1", borderRadius: "inherit", transition: "width 0.3s" }} />
                                </div>
                              </div>
                            )}
                          </div>,
                          predecessors: <div style={{ width: colW.predecessors, flexShrink: 0 }} />,
                          budgeted: <div style={{ width: colW.budgeted, flexShrink: 0 }} className="text-center px-1">
                            {(() => {
                              const areaTasks = tasks.filter(t => t.wbsAreaId === row.id)
                              const totalOrc  = areaTasks.reduce((s, t) => s + (t.budgetedCost ?? 0), 0)
                              const fmtK = (v: number) => v === 0 ? "—" : v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
                              return totalOrc > 0 ? <span className="text-[9px] font-bold text-emerald-600">R$ {fmtK(totalOrc)}</span> : null
                            })()}
                          </div>,
                          actual: <div style={{ width: colW.actual, flexShrink: 0 }} className="text-center px-1">
                            {(() => {
                              const areaTasks = tasks.filter(t => t.wbsAreaId === row.id)
                              const totalOrc  = areaTasks.reduce((s, t) => s + (t.budgetedCost ?? 0), 0)
                              const totalReal = areaTasks.reduce((s, t) => s + (t.actualCost   ?? 0), 0)
                              const fmtK = (v: number) => v === 0 ? "—" : v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
                              return totalReal > 0 ? <span className="text-[9px] font-bold" style={{ color: totalReal > totalOrc && totalOrc > 0 ? "#EF4444" : "#F59E0B" }}>R$ {fmtK(totalReal)}</span> : null
                            })()}
                          </div>,
                        }
                        return colOrder.map(col => <Fragment key={col}>{areaCells[col]}</Fragment>)
                      })()}
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
                const isTarefa = depth > 0
                const depViolation = t.dependencies.some((depId) => {
                  const dep = tasks.find((x) => x.id === depId)
                  return dep?.endDate && t.startDate && dep.endDate >= t.startDate
                })
                const isBlocked = !isDone && t.dependencies.some((depId) => {
                  const dep = tasks.find((x) => x.id === depId)
                  return dep && dep.status !== "COMPLETED"
                })

                return (
                  <div
                    key={`task-${t.id}`}
                    draggable
                    onDragStart={(e) => onDragStart(e, t.id, "task")}
                    onDragOver={(e) => onDragOver(e, t.id)}
                    onDrop={(e) => onDrop(e, t.id, "task")}
                    onDragEnd={cleanDrag}
                    onMouseEnter={() => setHoveredId(t.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    style={{
                      height: ROW_H,
                      display: "flex",
                      alignItems: "center",
                      borderBottom: dragOverId === t.id && dragType === "task" ? "2px solid #7B2FBE" : "1px solid #F1F5F9",
                      background: dragOverId === t.id && dragType === "task"
                        ? "#F5F3FF"
                        : isHov
                          ? "#EEF2FF"
                          : isTarefa
                            ? "#F7F5FF"
                            : i % 2 === 0 ? "white" : "#FAFBFD",
                      borderLeft: isTarefa
                        ? `3px solid ${areaColor ?? "#C4B5FD"}55`
                        : "3px solid transparent",
                      opacity: draggedId === t.id ? 0.45 : 1,
                      transition: "opacity 0.15s, background 0.1s",
                    }}
                  >
                    {/* Drag handle */}
                    <div
                      style={{ width: 24, flexShrink: 0, cursor: "grab" }}
                      className="flex items-center justify-center text-slate-200 hover:text-slate-400 transition-colors"
                    >
                      <GripVertical className="w-3.5 h-3.5" />
                    </div>

                    {/* Inline action buttons */}
                    <div style={{ width: 84 }} className="flex items-center justify-center gap-0.5 shrink-0">
                      {!isTarefa && (
                        <button
                          onClick={() => openAdd(t.id)}
                          title="Nova tarefa"
                          className="w-6 h-6 rounded-md flex items-center justify-center transition-all hover:scale-110"
                          style={{ background: "#DCFCE7", color: "#16A34A" }}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        onClick={() => openEdit(t)}
                        title="Editar"
                        className="w-6 h-6 rounded-md flex items-center justify-center transition-all hover:scale-110"
                        style={{ background: "#FEF9C3", color: "#CA8A04" }}
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => setCommentPanel({ taskId: t.id, title: t.title })}
                        title="Comentários"
                        className="w-6 h-6 rounded-md flex items-center justify-center transition-all hover:scale-110"
                        style={
                          t._count.comments > 0
                            ? { background: "#EFF6FF", color: "#2463FF" }
                            : { background: "#F1F5F9", color: "#94A3B8" }
                        }
                      >
                        <MessageSquare className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => setEvidencePanel({ taskId: t.id, title: t.title })}
                        title="Evidências da conclusão"
                        className="w-6 h-6 rounded-md flex items-center justify-center transition-all hover:scale-110"
                        style={
                          t._count.attachments > 0
                            ? { background: "#EDE9FE", color: "#7C3AED" }
                            : { background: "#F1F5F9", color: "#94A3B8" }
                        }
                      >
                        <Paperclip className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => setTimePanel({ taskId: t.id, title: t.title, estimatedEffort: t.estimatedEffort })}
                        title="Lançar horas"
                        className="w-6 h-6 rounded-md flex items-center justify-center transition-all hover:scale-110"
                        style={
                          t.actualEffort && t.actualEffort > 0
                            ? { background: "#FEF3C7", color: "#D97706" }
                            : { background: "#F1F5F9", color: "#94A3B8" }
                        }
                      >
                        <Clock className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleDelete(t.id)}
                        title="Excluir"
                        className="w-6 h-6 rounded-md flex items-center justify-center transition-all hover:scale-110"
                        style={{ background: "#FEE2E2", color: "#DC2626" }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Reorderable columns — task row */}
                    {(() => {
                      const ep = calcEstimatedProgress(t.startDate, t.endDate)
                      const epDelta = ep !== null ? ep - t.progress : null
                      const taskCells: Record<ColKey, React.ReactNode> = {
                        eap: (
                          <div style={{ width: colW.eap, flexShrink: 0 }} className="flex items-center justify-center">
                            <span className="text-[10px] font-bold text-slate-400 font-mono select-all cursor-text">{eap}</span>
                          </div>
                        ),
                        name: (
                          <div style={{ width: colW.name, flexShrink: 0 }} className="flex items-center gap-1.5 px-1 py-1 overflow-hidden">
                            {isTarefa && (
                              <div style={{ width: depth * 20, flexShrink: 0, position: "relative", alignSelf: "stretch", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                                <div style={{ position: "absolute", right: 0, top: 0, bottom: "50%", width: 10, borderBottom: "1.5px solid #DDD6FE", borderLeft: "1.5px solid #DDD6FE", borderBottomLeftRadius: 4 }} />
                              </div>
                            )}
                            <div className="w-5 shrink-0 flex items-center justify-center">
                              {hasChildren ? (
                                <button onClick={(e) => { e.stopPropagation(); toggleListTask(t.id) }} className="text-slate-400 hover:text-slate-700 transition-colors">
                                  {expandedTasks.has(t.id) ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                </button>
                              ) : (
                                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: isTarefa ? "#A78BFA" : (areaColor ?? color) }} />
                              )}
                            </div>
                            {isLate    && <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />}
                            {isBlocked && !isLate && <Lock className="w-3 h-3 text-slate-300 shrink-0" />}
                            {editTitle?.id === t.id ? (
                              <input
                                autoFocus
                                value={editTitle.val}
                                onChange={(e) => setEditTitle({ id: t.id, val: e.target.value })}
                                onBlur={() => {
                                  const val = editTitle.val.trim()
                                  setEditTitle(null)
                                  if (val && val !== t.title) saveTaskField(t.id, { title: val })
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur() }
                                  if (e.key === "Escape") setEditTitle(null)
                                  e.stopPropagation()
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="flex-1 min-w-0 text-xs font-semibold text-[#0F172A] bg-white rounded-lg px-2 py-0.5 outline-none"
                                style={{ border: "1.5px solid #7B2FBE" }}
                              />
                            ) : (
                              <span
                                className={`flex-1 text-xs truncate cursor-text ${isDone ? "line-through text-slate-400" : isTarefa ? "text-slate-500 font-medium" : "text-[#0F172A] font-semibold"}`}
                                onClick={() => setEditTitle({ id: t.id, val: t.title })}
                                title="Clique para renomear"
                              >
                                {t.title}
                              </span>
                            )}
                            <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={isTarefa ? { background: "#EDE9FE", color: "#7C3AED" } : { background: "#DBEAFE", color: "#1D4ED8" }}>
                              {isTarefa ? "Tarefa" : "Atividade"}
                            </span>
                            {t.dependencies.length > 0 && (
                              <span className="shrink-0 flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                                title={t.dependencies.map(d => `${eapById.get(d) ?? "?"} — ${tasks.find(x => x.id === d)?.title ?? d}`).join("\n")}
                                style={depViolation ? { background: "#FEF3C7", color: "#B45309", border: "1px solid #FCD34D" } : { background: "#EEF2FF", color: "#4338CA", border: "1px solid #C7D2FE" }}>
                                <Link2 className="w-2.5 h-2.5" />
                                {t.dependencies.map(d => eapById.get(d) ?? "?").join(", ")}
                              </span>
                            )}
                            {t._count.comments > 0 && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setCommentPanel({ taskId: t.id, title: t.title }) }}
                                className="flex items-center gap-0.5 shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full transition-colors hover:bg-blue-100"
                                style={{ background: "rgba(36,99,255,0.08)", color: "#2463FF" }}
                                title={`${t._count.comments} comentário${t._count.comments !== 1 ? "s" : ""} — clique para ver`}
                              >
                                <MessageSquare className="w-2.5 h-2.5" />{t._count.comments}
                              </button>
                            )}
                            {t._count.attachments > 0 && (
                              <span className="flex items-center gap-0.5 shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(100,116,139,0.08)", color: "#475569" }} title={`${t._count.attachments} anexo${t._count.attachments !== 1 ? "s" : ""}`}>
                                <Paperclip className="w-2.5 h-2.5" />{t._count.attachments}
                              </span>
                            )}
                          </div>
                        ),
                        status: (
                          <div style={{ width: colW.status, flexShrink: 0 }} className="flex justify-center px-1">
                            <select value={t.status} onChange={(e) => saveTaskField(t.id, { status: e.target.value })}
                              style={{ background: cfg?.bg ?? "#F8FAFC", color: isLate && t.status !== "DELAYED" ? "#EF4444" : cfg?.color ?? "#64748B", border: `1.5px solid ${isLate && t.status !== "DELAYED" ? "#EF4444" : cfg?.color ?? "#CBD5E1"}50`, fontSize: 10, fontWeight: 700, padding: "3px 6px", borderRadius: 20, cursor: "pointer", outline: "none", appearance: "none", textAlignLast: "center", width: "100%", maxWidth: 118 }}>
                              {STATUS_CYCLE.map(s => <option key={s} value={s}>{STATUS_CFG[s]?.label ?? s}</option>)}
                            </select>
                          </div>
                        ),
                        responsible: (
                          <div style={{ width: colW.responsible, flexShrink: 0 }} className="px-1">
                            <div className="flex items-center gap-1.5">
                              {t.responsible && (
                                <UserAvatar name={t.responsible.name} image={t.responsible.image} size={20} />
                              )}
                              <div className="relative flex-1 min-w-0">
                                <select
                                  value={t.responsibleId ?? ""}
                                  onChange={(e) => saveTaskField(t.id, { responsibleId: e.target.value || null })}
                                  className="w-full text-[10px] text-slate-600 bg-transparent border-0 outline-none cursor-pointer appearance-none pr-4"
                                  title={t.responsible?.name ?? "Sem responsável"}
                                >
                                  <option value="">— Sem responsável</option>
                                  {members.map((m) => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                  ))}
                                </select>
                                <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none shrink-0" />
                              </div>
                            </div>
                          </div>
                        ),
                        startDate: (
                          <div style={{ width: colW.startDate, flexShrink: 0 }} className="px-1">
                            <WorkingDayPicker compact value={t.startDate?.slice(0, 10) ?? ""} onChange={(v) => saveDateField(t.id, "startDate", v || null)} placeholder="—" />
                          </div>
                        ),
                        endDate: (
                          <div style={{ width: colW.endDate, flexShrink: 0 }} className="px-1">
                            <WorkingDayPicker compact value={t.endDate?.slice(0, 10) ?? ""} onChange={(v) => saveDateField(t.id, "endDate", v || null)} placeholder="—" />
                          </div>
                        ),
                        actualStart: (
                          <div style={{ width: colW.actualStart, flexShrink: 0 }} className="px-1">
                            <WorkingDayPicker compact value={t.actualStart?.slice(0, 10) ?? ""} onChange={(v) => saveTaskField(t.id, { actualStart: v || null })} placeholder="—" />
                          </div>
                        ),
                        actualEnd: (
                          <div style={{ width: colW.actualEnd, flexShrink: 0 }} className="px-1">
                            <WorkingDayPicker compact value={t.actualEnd?.slice(0, 10) ?? ""} onChange={(v) => saveTaskField(t.id, { actualEnd: v || null })} placeholder="—" />
                          </div>
                        ),
                        estH: (
                          <div style={{ width: colW.estH, flexShrink: 0 }} className="text-center px-1">
                            {editNum?.id === t.id && editNum.field === "estimatedEffort" ? (
                              <input type="number" min={0} step={0.5} autoFocus value={editNum.val}
                                onChange={(e) => setEditNum({ id: t.id, field: "estimatedEffort", val: e.target.value })}
                                onBlur={() => { const val = editNum.val === "" ? null : Number(editNum.val); setEditNum(null); saveTaskField(t.id, { estimatedEffort: val }) }}
                                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditNum(null) }}
                                className="w-full text-[10px] text-center font-mono text-violet-600 rounded outline-none bg-white" style={{ border: "1.5px solid #7B2FBE" }} />
                            ) : (
                              <span className="text-[10px] font-mono text-violet-600 cursor-text block"
                                onClick={() => setEditNum({ id: t.id, field: "estimatedEffort", val: String(t.estimatedEffort ?? "") })} title="Clique para editar">
                                {t.estimatedEffort != null ? `${t.estimatedEffort}h` : "—"}
                              </span>
                            )}
                          </div>
                        ),
                        realH: (
                          <div style={{ width: colW.realH, flexShrink: 0 }} className="text-center px-1">
                            {editNum?.id === t.id && editNum.field === "actualEffort" ? (
                              <input type="number" min={0} step={0.5} autoFocus value={editNum.val}
                                onChange={(e) => setEditNum({ id: t.id, field: "actualEffort", val: e.target.value })}
                                onBlur={() => { const val = editNum.val === "" ? null : Number(editNum.val); setEditNum(null); saveTaskField(t.id, { actualEffort: val }) }}
                                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditNum(null) }}
                                className="w-full text-[10px] text-center font-mono text-violet-600 rounded outline-none bg-white" style={{ border: "1.5px solid #7B2FBE" }} />
                            ) : (
                              (() => {
                                const over = t.estimatedEffort != null && t.actualEffort != null && t.actualEffort > t.estimatedEffort
                                return (
                                  <span className={`text-[10px] font-mono font-bold cursor-text block ${over ? "text-red-500" : t.actualEffort != null ? "text-violet-600" : "text-slate-300"}`}
                                    onClick={() => setEditNum({ id: t.id, field: "actualEffort", val: String(t.actualEffort ?? "") })} title="Clique para editar">
                                    {t.actualEffort != null ? `${t.actualEffort}h` : "—"}
                                  </span>
                                )
                              })()
                            )}
                          </div>
                        ),
                        pctEst: (
                          <div style={{ width: colW.pctEst, flexShrink: 0 }} className="text-center">
                            {ep !== null ? (
                              <div className="flex flex-col items-center gap-0.5">
                                <span className="text-[9px] font-bold text-amber-600">{ep}%</span>
                                {epDelta !== null && Math.abs(epDelta) >= 5 && (
                                  <span className={`text-[8px] font-bold ${epDelta > 0 ? "text-red-400" : "text-emerald-500"}`}>
                                    {epDelta > 0 ? `+${epDelta}` : epDelta}
                                  </span>
                                )}
                              </div>
                            ) : <span className="text-[10px] text-slate-300">—</span>}
                          </div>
                        ),
                        pctReal: (
                          <div style={{ width: colW.pctReal, flexShrink: 0 }} className="px-2">
                            {editNum?.id === t.id && editNum.field === "progress" ? (
                              <input type="number" min={0} max={100} autoFocus value={editNum.val}
                                onChange={(e) => setEditNum({ id: t.id, field: "progress", val: e.target.value })}
                                onBlur={() => { const val = Math.min(100, Math.max(0, Number(editNum.val) || 0)); setEditNum(null); saveTaskField(t.id, { progress: val }) }}
                                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditNum(null) }}
                                className="w-full text-[10px] text-center font-bold rounded outline-none bg-white" style={{ color, border: "1.5px solid #7B2FBE" }} />
                            ) : (
                              <div className="flex flex-col gap-0.5 cursor-text" onClick={() => setEditNum({ id: t.id, field: "progress", val: String(t.progress) })} title="Clique para editar">
                                <span className="text-[9px] font-bold text-center" style={{ color }}>{t.progress}%</span>
                                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                  <div style={{ width: `${t.progress}%`, height: "100%", background: color, borderRadius: "inherit", transition: "width 0.3s" }} />
                                </div>
                              </div>
                            )}
                          </div>
                        ),
                        predecessors: (
                          <div style={{ width: colW.predecessors, flexShrink: 0 }} className="flex items-center justify-center px-1">
                            {editPred?.id === t.id ? (
                              <input autoFocus value={editPred.val} placeholder="1.1, 1.2..."
                                onChange={(e) => setEditPred({ id: t.id, val: e.target.value })}
                                onBlur={() => { const raw = editPred.val; setEditPred(null); const eaps = raw.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean); const ids = eaps.map(e => idByEap.get(e)).filter((id): id is string => Boolean(id)); saveTaskField(t.id, { dependencies: ids }) }}
                                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditPred(null) }}
                                className="w-full text-[9px] text-center px-1.5 py-0.5 rounded-lg outline-none bg-white font-mono" style={{ border: "1.5px solid #4338CA" }} />
                            ) : (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full cursor-text truncate max-w-full"
                                style={t.dependencies.length > 0 ? depViolation ? { background: "#FEF3C7", color: "#B45309" } : { background: "#EEF2FF", color: "#4338CA" } : { color: "#CBD5E1" }}
                                title={t.dependencies.length > 0 ? t.dependencies.map(d => { const eapStr = eapById.get(d); const dep = tasks.find(x => x.id === d); return eapStr ? `${eapStr} — ${dep?.title ?? d}` : (dep?.title ?? d) }).join("\n") : "Clique para definir predecessoras"}
                                onClick={() => setEditPred({ id: t.id, val: t.dependencies.map(d => eapById.get(d) ?? "").filter(Boolean).join(", ") })}>
                                {t.dependencies.length > 0 ? t.dependencies.map(d => eapById.get(d) ?? "?").join(", ") : "—"}
                              </span>
                            )}
                          </div>
                        ),
                        budgeted: (
                          <div style={{ width: colW.budgeted, flexShrink: 0 }} className="text-center px-1">
                            {editNum?.id === t.id && editNum.field === "budgetedCost" ? (
                              <input autoFocus type="number" min={0} step={100} value={editNum.val}
                                onChange={(e) => setEditNum({ id: t.id, field: "budgetedCost", val: e.target.value })}
                                onBlur={() => { const v = editNum.val === "" ? null : Number(editNum.val); setEditNum(null); saveTaskField(t.id, { budgetedCost: v }) }}
                                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditNum(null) }}
                                className="w-full text-[9px] text-center px-1 py-0.5 rounded-lg outline-none font-mono" style={{ border: "1.5px solid #10B981", background: "#ECFDF5" }} />
                            ) : (
                              <span className="text-[9px] font-bold cursor-text" style={{ color: t.budgetedCost ? "#059669" : "#CBD5E1" }}
                                onClick={() => setEditNum({ id: t.id, field: "budgetedCost", val: t.budgetedCost?.toString() ?? "" })} title="Clique para editar valor orçado">
                                {t.budgetedCost != null ? `R$ ${t.budgetedCost.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}` : "—"}
                              </span>
                            )}
                          </div>
                        ),
                        actual: (
                          <div style={{ width: colW.actual, flexShrink: 0 }} className="text-center px-1">
                            {editNum?.id === t.id && editNum.field === "actualCost" ? (
                              <input autoFocus type="number" min={0} step={100} value={editNum.val}
                                onChange={(e) => setEditNum({ id: t.id, field: "actualCost", val: e.target.value })}
                                onBlur={() => { const v = editNum.val === "" ? null : Number(editNum.val); setEditNum(null); saveTaskField(t.id, { actualCost: v }) }}
                                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditNum(null) }}
                                className="w-full text-[9px] text-center px-1 py-0.5 rounded-lg outline-none font-mono" style={{ border: "1.5px solid #F59E0B", background: "#FFFBEB" }} />
                            ) : (
                              <span className="text-[9px] font-bold cursor-text"
                                style={{ color: t.actualCost == null ? "#CBD5E1" : t.actualCost > (t.budgetedCost ?? Infinity) ? "#EF4444" : "#D97706" }}
                                onClick={() => setEditNum({ id: t.id, field: "actualCost", val: t.actualCost?.toString() ?? "" })} title="Clique para editar custo real">
                                {t.actualCost != null ? `R$ ${t.actualCost.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}` : "—"}
                              </span>
                            )}
                          </div>
                        ),
                      }
                      return colOrder.map(col => <Fragment key={col}>{taskCells[col]}</Fragment>)
                    })()}

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
          </div>{/* end minWidth wrapper */}
          </div>{/* end scrollable body */}
        </div>
      )}

      {/* ── GANTT VIEW ───────────────────────────────────────────────────── */}
      {viewMode === "gantt" && (
        <div className="flex flex-1 min-h-0">

          {/* Left panel */}
          <div className="flex flex-col shrink-0 border-r border-slate-200 bg-white" style={{ width: LEFT_W }}>

            {/* Left panel header */}
            <div className="flex items-center shrink-0 border-b border-slate-100 bg-[#0F172A]" style={{ height: HDR_H }}>
              <div style={{ width: 36 }} />
              <div style={{ width: 24 }} />
              <div className="flex-1 px-2 text-[10px] font-black text-white/50 uppercase tracking-widest">Atividade</div>
              <div style={{ width: 110 }} className="text-[10px] font-black text-white/50 uppercase tracking-widest px-2 text-right">Responsável</div>
              <div style={{ width: 76 }} className="text-[10px] font-black text-white/50 uppercase tracking-widest text-center">Início</div>
              <div style={{ width: 76 }} className="text-[10px] font-black text-white/50 uppercase tracking-widest text-center">Fim</div>
              <div style={{ width: 48 }} className="text-[10px] font-black text-white/50 uppercase tracking-widest text-center">%</div>
              <div style={{ width: 56 }} className="text-[10px] font-black text-white/50 uppercase tracking-widest text-center">Ações</div>
            </div>

            {/* Left panel body — area-grouped */}
            <div ref={leftBodyRef} className="flex-1 overflow-y-auto overflow-x-hidden" onScroll={onLeftScroll} style={{ scrollbarWidth: "none" }}>
              {tasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-300 gap-3">
                  <Layers className="w-10 h-10" />
                  <p className="text-sm font-semibold">Nenhuma atividade</p>
                  <button onClick={() => openAdd()} className="text-xs font-bold text-[#7B2FBE] hover:underline">
                    + Adicionar primeira atividade
                  </button>
                </div>
              ) : (
                <>
                  {ganttRows.map((row, i) => {
                    /* ── Area header row ── */
                    if (row.kind === "area") {
                      const areaId    = row.id
                      const areaName  = row.name
                      const areaColor = row.color
                      const isExp     = expandedGanttAreas.has(areaId)
                      const progress  = row.taskCount > 0 ? Math.round((row.doneCount / row.taskCount) * 100) : 0
                      return (
                        <div
                          key={`ga-${areaId}`}
                          style={{
                            height: ROW_H, display: "flex", alignItems: "center",
                            background: areaColor ? `${areaColor}12` : "#F8FAFC",
                            borderBottom: `1px solid ${areaColor ?? "#E2E8F0"}28`,
                            borderLeft: `4px solid ${areaColor ?? "#CBD5E1"}`,
                          }}
                        >
                          {/* Expand toggle */}
                          <button
                            onClick={() => toggleGanttArea(areaId)}
                            style={{ width: 36, height: ROW_H, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                            className="text-slate-400 hover:text-slate-700 transition-colors"
                          >
                            {isExp ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
                          <div style={{ width: 24, flexShrink: 0 }} />

                          {/* Area name + count */}
                          <div
                            className="flex-1 flex items-center gap-2 min-w-0 px-1 cursor-pointer"
                            onClick={() => toggleGanttArea(areaId)}
                          >
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: areaColor ?? "#CBD5E1" }} />
                            <span className="font-black text-[#0F172A] text-xs truncate">{areaName}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold shrink-0"
                              style={{ background: areaColor ? `${areaColor}20` : "#EDE9FE", color: areaColor ?? "#7C3AED" }}>
                              {row.doneCount}/{row.taskCount} · {progress}%
                            </span>
                          </div>

                          {/* Placeholder columns */}
                          <div style={{ width: 110, flexShrink: 0 }} />
                          <div style={{ width: 76, flexShrink: 0 }} />
                          <div style={{ width: 76, flexShrink: 0 }} />
                          <div style={{ width: 48, flexShrink: 0 }} />

                          {/* Add task to this area */}
                          <div style={{ width: 56, flexShrink: 0 }} className="flex items-center justify-center gap-1 pr-2">
                            {areaId !== "__ungrouped__" && (
                              <button
                                onClick={() => openAdd(undefined, areaId)}
                                title="Nova atividade nesta área"
                                className="w-6 h-6 rounded-md flex items-center justify-center transition-all hover:scale-110"
                                style={{ background: "#DCFCE7", color: "#16A34A" }}
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    }

                    /* ── Task row ── */
                    const { task: t, depth, hasChildren, areaColor: aColor } = row
                    const color     = taskColor(t)
                    const isHov     = hoveredId === t.id
                    const isDone    = t.status === "COMPLETED"
                    const isLate    = t.status === "DELAYED" || isAutoDelayed(t)
                    const hasWarn   = t.dependencies.some((depId) => {
                      const dep = tasks.find((x) => x.id === depId)
                      return dep?.endDate && t.startDate && dep.endDate > t.startDate
                    })
                    const isEditing = ganttInlineId === t.id

                    return (
                      <div
                        key={`gt-${t.id}`}
                        style={{
                          height: ROW_H, display: "flex", alignItems: "center",
                          background: isHov ? "#EEF2FF" : i % 2 === 0 ? "white" : "#FAFBFD",
                          borderBottom: "1px solid #F1F5F9",
                          borderLeft: `3px solid ${depth > 0 ? (aColor ? `${aColor}55` : "#C4B5FD55") : color}`,
                        }}
                        onMouseEnter={() => setHoveredId(t.id)}
                        onMouseLeave={() => setHoveredId(null)}
                      >
                        {/* Row # + status dot */}
                        <div style={{ width: 36, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, paddingRight: 4, flexShrink: 0 }}>
                          <span style={{ fontSize: 9, color: "#CBD5E1", fontWeight: 700 }}>{i + 1}</span>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_CFG[t.status]?.dot ?? color }} />
                        </div>

                        {/* Expand / leaf */}
                        <div style={{ width: 24, flexShrink: 0 }} className="flex items-center justify-center">
                          {hasChildren ? (
                            <button onClick={() => toggleGanttTask(t.id)} className="text-slate-400 hover:text-slate-700 transition-colors">
                              {expandedGantt.has(t.id) ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            </button>
                          ) : depth > 0 ? (
                            <div className="w-3 border-b border-slate-200" style={{ marginLeft: 4 }} />
                          ) : null}
                        </div>

                        {/* Name — double-click to edit inline */}
                        <div
                          className="flex-1 flex items-center gap-1.5 min-w-0 px-1"
                          style={{ paddingLeft: 4 + depth * 12 }}
                        >
                          {hasWarn && !isEditing && <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />}
                          {isEditing ? (
                            <input
                              autoFocus
                              value={ganttInlineVal}
                              onChange={(e) => setGanttInlineVal(e.target.value)}
                              onBlur={() => saveGanttInline(t)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") { e.preventDefault(); saveGanttInline(t) }
                                if (e.key === "Escape") { setGanttInlineId(null); setGanttInlineVal("") }
                                e.stopPropagation()
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="flex-1 text-xs bg-white outline-none px-1.5 py-0.5 rounded border border-[#7B2FBE] font-semibold text-[#0F172A] min-w-0"
                            />
                          ) : (
                            <span
                              className={`text-xs font-semibold truncate cursor-pointer select-none ${isDone ? "line-through text-slate-400" : "text-[#0F172A]"}`}
                              onClick={() => openEdit(t)}
                              onDoubleClick={(e) => {
                                e.stopPropagation()
                                setGanttInlineId(t.id)
                                setGanttInlineVal(t.title)
                              }}
                              title="Clique para editar · Duplo-clique para renomear"
                            >
                              {t.title}
                            </span>
                          )}
                          {!isEditing && (isLate || isDone) && (
                            <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                              style={{
                                background: STATUS_CFG[t.status]?.bg ?? "#F8FAFC",
                                color: isLate && t.status !== "DELAYED" ? "#EF4444" : STATUS_CFG[t.status]?.color,
                                border: `1px solid ${isLate && t.status !== "DELAYED" ? "#EF444430" : `${STATUS_CFG[t.status]?.color}30`}`,
                              }}>
                              {isLate && t.status !== "DELAYED" ? "Atrasado" : STATUS_CFG[t.status]?.label}
                            </span>
                          )}
                          {!isEditing && t._count.comments > 0 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setCommentPanel({ taskId: t.id, title: t.title }) }}
                              className="flex items-center gap-0.5 shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full transition-colors hover:bg-blue-100"
                              style={{ background: "rgba(36,99,255,0.08)", color: "#2463FF" }}
                              title={`${t._count.comments} comentário${t._count.comments !== 1 ? "s" : ""} — clique para ver`}
                            >
                              <MessageSquare className="w-2.5 h-2.5" />
                              {t._count.comments}
                            </button>
                          )}
                          {!isEditing && t._count.attachments > 0 && (
                            <span
                              className="flex items-center gap-0.5 shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                              style={{ background: "rgba(100,116,139,0.08)", color: "#475569" }}
                              title={`${t._count.attachments} anexo${t._count.attachments !== 1 ? "s" : ""}`}
                            >
                              <Paperclip className="w-2.5 h-2.5" />
                              {t._count.attachments}
                            </span>
                          )}
                        </div>

                        {/* Responsible */}
                        <div style={{ width: 110, flexShrink: 0 }} className="px-2">
                          {t.responsible ? (
                            <div className="flex items-center gap-1.5 justify-end">
                              <UserAvatar name={t.responsible.name} image={t.responsible.image} size={20} />
                              <span className="text-[10px] text-slate-500 truncate">{t.responsible.name.split(" ")[0]}</span>
                            </div>
                          ) : <span className="text-[10px] text-slate-300 block text-right">—</span>}
                        </div>

                        {/* Start */}
                        <div style={{ width: 76, flexShrink: 0 }} className="text-center">
                          <span className="text-[10px] text-slate-500 font-mono">{fmtDate(t.startDate)}</span>
                        </div>

                        {/* End */}
                        <div style={{ width: 76, flexShrink: 0 }} className="text-center">
                          <span className={`text-[10px] font-mono ${isLate ? "text-red-400 font-bold" : "text-slate-500"}`}>{fmtDate(t.endDate)}</span>
                        </div>

                        {/* Progress % */}
                        <div style={{ width: 48, flexShrink: 0 }} className="px-2">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-[9px] font-bold" style={{ color }}>{t.progress}%</span>
                            <div className="w-6 h-1 rounded-full bg-slate-100 overflow-hidden">
                              <div style={{ width: `${t.progress}%`, height: "100%", background: color, borderRadius: "inherit" }} />
                            </div>
                          </div>
                        </div>

                        {/* Actions — always visible */}
                        <div style={{ width: 56, flexShrink: 0, display: "flex", alignItems: "center", gap: 1, padding: "0 4px" }}>
                          <button
                            onClick={() => openEdit(t)}
                            title="Editar atividade"
                            className="p-1 rounded text-slate-400 hover:text-[#7B2FBE] hover:bg-violet-50 transition-all"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => openAdd(t.id, t.wbsAreaId ?? undefined)}
                            title="Adicionar subtarefa"
                            className="p-1 rounded text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 transition-all"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDelete(t.id)}
                            title="Excluir"
                            className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-red-50 transition-all"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )
                  })}

                  {/* Footer — add buttons */}
                  <div className="p-4 flex items-center gap-5 border-t border-slate-100">
                    <button
                      onClick={() => setAddingArea(true)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-[#7B2FBE] transition-colors"
                    >
                      <FolderOpen className="w-3.5 h-3.5" /> Nova Área
                    </button>
                    <button
                      onClick={() => openAdd()}
                      className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-[#7B2FBE] transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Nova Atividade
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Gantt right panel */}
          <div ref={rightRef} className="flex-1 overflow-auto min-h-0 min-w-0" onScroll={onRightScroll}>
            <div style={{ minWidth: ganttWidth, position: "relative" }}>
              <div className="sticky top-0 z-20">
                <GanttHeader ganttStart={ganttStart} ganttEnd={ganttEnd} dayWidth={dayWidth} zoom={zoom} />
              </div>
              {tasks.length === 0 ? (
                <div className="flex items-center justify-center h-64">
                  <p className="text-sm text-slate-300">Adicione atividades para visualizar o Gantt</p>
                </div>
              ) : (
                <div style={{ position: "relative", width: ganttWidth, height: ganttRows.length * ROW_H }}>

                  {/* Background rows — area rows get tinted bg */}
                  {ganttRows.map((row, i) => {
                    const isArea   = row.kind === "area"
                    const aColor   = isArea ? row.color : null
                    const bg       = isArea
                      ? (aColor ? `${aColor}0D` : "#F8FAFC")
                      : i % 2 === 0 ? "white" : "#FAFBFD"
                    return (
                      <div
                        key={`gbg-${isArea ? row.id : row.task.id}`}
                        style={{
                          position: "absolute", top: i * ROW_H, left: 0, right: 0, height: ROW_H,
                          background: bg,
                          borderBottom: isArea
                            ? `1px solid ${aColor ?? "#E2E8F0"}25`
                            : "1px solid #F1F5F9",
                          pointerEvents: "none",
                        }}
                      />
                    )
                  })}

                  {/* Month separator lines */}
                  {eachMonthOfInterval({ start: ganttStart, end: ganttEnd }).map((m) => {
                    const x = differenceInDays(startOfMonth(m), ganttStart) * dayWidth
                    return <div key={m.toISOString()} style={{ position: "absolute", top: 0, bottom: 0, left: x, width: 1, background: "rgba(226,232,240,0.7)", pointerEvents: "none" }} />
                  })}

                  {/* Weekend / holiday shading */}
                  {zoom === "day" && Array.from({ length: totalDays }).map((_, i) => {
                    const d     = addDays(ganttStart, i)
                    const ds    = format(d, "yyyy-MM-dd")
                    const isWE  = isSaturday(d) || isSunday(d)
                    const isHol = !isWE && isHoliday(ds)
                    if (!isWE && !isHol) return null
                    return (
                      <div key={i} style={{
                        position: "absolute", top: 0, bottom: 0, left: i * dayWidth, width: dayWidth,
                        background: isHol ? "rgba(249,115,22,0.07)" : "rgba(241,245,249,0.60)",
                        pointerEvents: "none",
                      }} />
                    )
                  })}

                  {/* Today line */}
                  {todayX >= 0 && todayX <= ganttWidth && (
                    <div style={{ position: "absolute", top: 0, bottom: 0, left: todayX, width: 2, background: "#EF4444", opacity: 0.7, zIndex: 6, pointerEvents: "none" }}>
                      <div style={{ position: "absolute", top: -4, left: -4, width: 10, height: 10, borderRadius: "50%", background: "#EF4444" }} />
                      <div style={{ position: "absolute", top: 4, left: 4, fontSize: 9, fontWeight: 800, color: "#EF4444", whiteSpace: "nowrap" }}>Hoje</div>
                    </div>
                  )}

                  {/* Task bars */}
                  {ganttRows.map((row, i) => {
                    if (row.kind !== "task") return null
                    const { task: t, hasChildren } = row
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
                      <div
                        key={`bar-${t.id}`}
                        onClick={() => openEdit(t)}
                        onMouseEnter={() => setHoveredId(t.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        title={`${t.title} | ${fmtDate(t.startDate)} → ${fmtDate(t.endDate)} | ${t.progress}%`}
                        style={{
                          position: "absolute", top: i * ROW_H + BAR_PAD, left: barLeft, width: barW, height: BAR_H,
                          borderRadius: hasChildren ? 4 : 6, overflow: "hidden", cursor: "pointer", zIndex: 4,
                          border: isLateB ? `1.5px solid #EF444488` : hasWarn ? `1.5px dashed #F59E0B` : `1.5px solid ${barColor}55`,
                          boxShadow: hoveredId === t.id ? `0 2px 12px ${barColor}40` : "none",
                          transition: "box-shadow 0.15s",
                          background: isDone ? `${barColor}30` : isLateB ? "#FEE2E2" : `${barColor}22`,
                        }}
                      >
                        <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: `${t.progress}%`, background: isLateB ? "#EF444490" : isDone ? `${barColor}90` : `${barColor}70`, transition: "width 0.4s ease" }} />
                        {hasChildren && (
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

                  {/* Dependency arrows */}
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

      {/* ── Time panel ───────────────────────────────────────────────────── */}
      {timePanel && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]" onClick={() => setTimePanel(null)} />
          <TimePanel
            taskId={timePanel.taskId}
            projectId={project.id}
            taskTitle={timePanel.title}
            estimatedEffort={timePanel.estimatedEffort}
            onClose={() => setTimePanel(null)}
            onUpdated={(newActualEffort) => {
              setTasks(prev => prev.map(t =>
                t.id === timePanel.taskId ? { ...t, actualEffort: newActualEffort } : t
              ))
            }}
          />
        </>
      )}

      {/* ── Evidence panel ───────────────────────────────────────────────── */}
      {evidencePanel && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]" onClick={() => setEvidencePanel(null)} />
          <EvidencePanel
            taskId={evidencePanel.taskId}
            projectId={project.id}
            taskTitle={evidencePanel.title}
            onClose={() => setEvidencePanel(null)}
            onUploaded={(count) => {
              setTasks((prev) => prev.map((t) =>
                t.id === evidencePanel.taskId
                  ? { ...t, _count: { ...t._count, attachments: count } }
                  : t
              ))
            }}
          />
        </>
      )}

      {commentPanel && (
        <CommentPanel
          taskId={commentPanel.taskId}
          taskTitle={commentPanel.title}
          projectId={project.id}
          onClose={() => setCommentPanel(null)}
          onCommentAdded={() => {
            setTasks((prev) => prev.map((t) =>
              t.id === commentPanel.taskId
                ? { ...t, _count: { ...t._count, comments: t._count.comments + 1 } }
                : t
            ))
          }}
        />
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

      {/* ── Template modal ───────────────────────────────────────────────── */}
      {tplModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(15,23,42,0.7)", backdropFilter: "blur(6px)" }}>
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100"
              style={{ background: "linear-gradient(135deg, #0F172A, #1E1B4B)" }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, #7B2FBE, #9333EA)" }}>
                  <LayoutTemplate className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="font-black text-white text-sm">Usar Modelo de Cronograma</h3>
                  <p className="text-[11px] text-white/50">Selecione um modelo e defina a data de início</p>
                </div>
              </div>
              <button onClick={() => setTplModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex flex-1 min-h-0 overflow-hidden">
              {/* Template list */}
              <div className="w-56 flex-shrink-0 border-r border-slate-100 overflow-y-auto p-3 space-y-2 bg-slate-50">
                {tplLoading ? (
                  <div className="flex justify-center pt-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
                ) : tplList.map((t) => {
                  const TYPE_ICON: Record<string, React.ElementType> = { AUTOMACAO: Zap, QUALIDADE: Award, CERTIFICACAO: Star, EXTERNO: Globe2, CUSTOM: Layers }
                  const TYPE_COLOR: Record<string, string> = { AUTOMACAO: "#7B2FBE", QUALIDADE: "#10B981", CERTIFICACAO: "#F59E0B", EXTERNO: "#2463FF", CUSTOM: "#64748B" }
                  const Icon = TYPE_ICON[t.projectType] ?? Layers
                  const color = TYPE_COLOR[t.projectType] ?? "#64748B"
                  const active = tplSelected?.id === t.id
                  return (
                    <button key={t.id} onClick={() => setTplSelected(t)}
                      className="w-full text-left rounded-xl p-3 border transition-all"
                      style={{
                        borderColor: active ? color : "#E2E8F0",
                        background: active ? `${color}12` : "white",
                        boxShadow: active ? `0 0 0 2px ${color}30` : "none",
                      }}>
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className="w-3 h-3 shrink-0" style={{ color }} />
                        <span className="text-xs font-bold text-slate-700 truncate">{t.name}</span>
                      </div>
                      <span className="text-[10px] text-slate-400">{t.tasks.length} atividades</span>
                    </button>
                  )
                })}
              </div>

              {/* Preview + settings */}
              <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                {!tplSelected ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-8">
                    <LayoutTemplate className="w-10 h-10 text-slate-200 mb-3" />
                    <p className="text-sm text-slate-400 font-medium">Selecione um modelo à esquerda</p>
                  </div>
                ) : (
                  <>
                    {/* Start date */}
                    <div className="px-5 py-3 border-b border-slate-100 bg-white flex items-center gap-4">
                      <label className="text-xs font-bold text-slate-600 shrink-0">Data de início:</label>
                      <input type="date" value={tplStartDate}
                        onChange={(e) => setTplStartDate(e.target.value)}
                        className="flex-1 px-3 py-1.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#7B2FBE]/30" />
                      <span className="text-[11px] text-slate-400 shrink-0">
                        As datas serão calculadas automaticamente pela regra FS
                      </span>
                    </div>

                    {/* Task preview */}
                    <div className="flex-1 overflow-y-auto p-4">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Atividades do modelo</p>
                      <div className="space-y-0.5">
                        {tplSelected.tasks.map((t) => {
                          const depth = (t.wbsCode.match(/\./g) ?? []).length
                          const isParent = tplSelected.tasks.some((x) => x.parentCode === t.wbsCode)
                          return (
                            <div key={t.id} className="flex items-center gap-2 py-1 rounded px-2 hover:bg-slate-50"
                              style={{ paddingLeft: 8 + depth * 16 }}>
                              <span className="w-2 h-2 rounded-full shrink-0"
                                style={{ background: t.isMilestone ? "#F59E0B" : isParent ? "#7B2FBE" : "#CBD5E1" }} />
                              <span className="text-[11px] font-mono text-slate-400 shrink-0 w-10">{t.wbsCode}</span>
                              <span className={`text-xs truncate ${isParent ? "font-semibold text-slate-700" : "text-slate-600"}`}>{t.title}</span>
                              {t.isMilestone && <Milestone className="w-2.5 h-2.5 text-amber-500 shrink-0" />}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-white">
              <p className="text-xs text-slate-400">
                {tplSelected
                  ? `${tplSelected.tasks.length} atividades serão adicionadas ao cronograma`
                  : "Selecione um modelo para continuar"}
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => setTplModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                  Cancelar
                </button>
                <button onClick={handleApplyTemplate}
                  disabled={!tplSelected || tplApplying}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50 transition-all hover:opacity-90 active:scale-[0.97]"
                  style={{ background: "linear-gradient(135deg, #7B2FBE, #2463FF)", boxShadow: "0 4px 12px rgba(123,47,190,0.3)" }}>
                  {tplApplying
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Aplicando…</>
                    : <><Check className="w-4 h-4" /> Aplicar Modelo</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CURVA S VIEW ─────────────────────────────────────────────────── */}
      {viewMode === "curva-s" && (
        <div className="flex-1 overflow-auto p-6 bg-slate-50">
          {sCurveLoading && !sCurveData ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
              <p className="text-sm text-slate-400 font-medium">Carregando Curva S…</p>
            </div>
          ) : sCurveData ? (
            <SCurveClient key={sCurveKey} projectId={project.id} initialData={sCurveData} />
          ) : null}
        </div>
      )}

      {/* ── Baseline modal ──────────────────────────────────────────────────── */}
      {baselineModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)" }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(245,158,11,0.12)" }}>
                <Award className="w-4.5 h-4.5 text-amber-500" style={{ width: 18, height: 18 }} />
              </div>
              <h3 className="text-base font-bold text-[#0F172A]">Gravar Baseline</h3>
            </div>
            <p className="text-sm text-slate-500 mb-5 ml-12">
              Congela as datas <strong>Início/Fim Plan.</strong> atuais do cronograma como referência de comparação na Curva S.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Nome</label>
                <input
                  type="text"
                  value={baselineName}
                  onChange={(e) => setBaselineName(e.target.value)}
                  placeholder="Ex: Baseline Original, Replanejamento Mai/26…"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && !baselineCreating && createBaselineFromHeader()}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">
                  Motivo do replanejamento <span className="font-normal normal-case">— opcional</span>
                </label>
                <textarea
                  value={baselineDesc}
                  onChange={(e) => setBaselineDesc(e.target.value)}
                  rows={3}
                  placeholder="Ex: Atraso na entrega do fornecedor, extensão de escopo, mudança de prioridade…"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-all resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setBaselineModal(false); setBaselineName(""); setBaselineDesc("") }}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                Cancelar
              </button>
              <button
                onClick={createBaselineFromHeader}
                disabled={baselineCreating}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50 hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #D97706, #F59E0B)", boxShadow: "0 4px 12px rgba(217,119,6,0.30)" }}>
                {baselineCreating
                  ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Gravando…</span>
                  : <span className="flex items-center justify-center gap-2"><Award className="w-3.5 h-3.5" /> Gravar Baseline</span>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cascade date-shift toast */}
      {cascadeInfo && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl text-sm font-semibold text-white select-none"
          style={{ background: "linear-gradient(135deg, #2463FF, #7B2FBE)", boxShadow: "0 8px 24px rgba(36,99,255,0.35)" }}>
          <Zap className="w-4 h-4 shrink-0" />
          {cascadeInfo.count} atividade{cascadeInfo.count !== 1 ? "s" : ""}{" "}
          {cascadeInfo.delta !== 0
            ? <>replanejada{cascadeInfo.count !== 1 ? "s" : ""} automaticamente ({cascadeInfo.delta > 0 ? "+" : ""}{cascadeInfo.delta}d)</>
            : <>atualizada{cascadeInfo.count !== 1 ? "s" : ""} por predecessora{cascadeInfo.count !== 1 ? "s" : ""}</>
          }
        </div>
      )}

      {/* Baseline created toast */}
      {baselineToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl text-sm font-semibold text-white select-none"
          style={{ background: "linear-gradient(135deg, #D97706, #F59E0B)", boxShadow: "0 8px 24px rgba(217,119,6,0.35)" }}>
          <Award className="w-4 h-4 shrink-0" />
          {baselineToast}
        </div>
      )}
    </div>
  )
}
