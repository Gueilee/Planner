"use client"

import { useState, useTransition, useRef } from "react"
import {
  LayoutTemplate, Plus, Pencil, Trash2, ChevronRight, ChevronDown,
  Loader2, X, Check, Milestone, Clock, Copy, Star,
  FolderTree, Zap, Award, Globe2, Layers, BookOpen,
} from "lucide-react"
import {
  createTemplate, updateTemplate, deleteTemplate,
  addTemplateTask, updateTemplateTask, deleteTemplateTask,
} from "@/lib/actions/templates"
import type { Template, TemplateTask } from "@/lib/actions/templates"

// ─── Config ───────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string; border: string }> = {
  AUTOMACAO:    { label: "Automação / TI",    icon: Zap,        color: "#7B2FBE", bg: "rgba(123,47,190,0.08)",  border: "rgba(123,47,190,0.25)" },
  QUALIDADE:    { label: "Qualidade",          icon: Award,      color: "#10B981", bg: "rgba(16,185,129,0.08)",  border: "rgba(16,185,129,0.25)" },
  CERTIFICACAO: { label: "Certificações",      icon: Star,       color: "#F59E0B", bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.25)" },
  EXTERNO:      { label: "Externo / Cliente",  icon: Globe2,     color: "#2463FF", bg: "rgba(36,99,255,0.08)",   border: "rgba(36,99,255,0.25)"  },
  CUSTOM:       { label: "Personalizado",      icon: Layers,     color: "#64748B", bg: "rgba(100,116,139,0.08)", border: "rgba(100,116,139,0.25)"},
}

const CAN_MANAGE = new Set(["ADMIN", "PROJECT_MANAGER"])

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  templates: Template[]
  userRole:  string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function TaskTree({ tasks, depth = 0, expandedSet, onToggle, onEdit, onDelete, canManage }: {
  tasks: TemplateTask[]
  depth?: number
  expandedSet: Set<string>
  onToggle: (id: string) => void
  onEdit: (t: TemplateTask) => void
  onDelete: (id: string) => void
  canManage: boolean
}) {
  const roots = tasks.filter((t) => depth === 0 ? !t.parentCode : false)

  function renderNode(task: TemplateTask, lvl: number): React.ReactNode {
    const children = tasks.filter((t) => t.parentCode === task.wbsCode)
    const hasChildren = children.length > 0
    const isOpen = expandedSet.has(task.id)

    return (
      <div key={task.id}>
        <div
          className="flex items-center gap-2 group hover:bg-slate-50 rounded-lg px-2 py-1.5 transition-colors"
          style={{ paddingLeft: 8 + lvl * 20 }}
        >
          {/* Toggle / indent */}
          <button
            onClick={() => hasChildren && onToggle(task.id)}
            className="shrink-0 w-4 h-4 flex items-center justify-center"
          >
            {hasChildren
              ? isOpen
                ? <ChevronDown className="w-3 h-3 text-slate-400" />
                : <ChevronRight className="w-3 h-3 text-slate-400" />
              : <span className="w-3 h-3 flex items-center justify-center">
                  {task.isMilestone
                    ? <Milestone className="w-2.5 h-2.5 text-amber-500" />
                    : <span className="w-1.5 h-1.5 rounded-full bg-slate-200" />}
                </span>
            }
          </button>

          {/* WBS code */}
          <span className="shrink-0 text-[10px] font-mono font-bold text-slate-400 w-10">{task.wbsCode}</span>

          {/* Title */}
          <span className={`flex-1 text-sm truncate ${hasChildren ? "font-semibold text-slate-700" : "text-slate-600"}`}>
            {task.title}
          </span>

          {/* Milestone badge */}
          {task.isMilestone && (
            <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Marco</span>
          )}

          {/* Effort */}
          {task.estimatedEffort != null && (
            <span className="shrink-0 flex items-center gap-0.5 text-[10px] text-slate-400">
              <Clock className="w-2.5 h-2.5" />{task.estimatedEffort}h
            </span>
          )}

          {/* Duration */}
          {!hasChildren && task.durationDays > 1 && (
            <span className="shrink-0 text-[10px] text-slate-400">{task.durationDays}d</span>
          )}

          {/* Actions */}
          {canManage && (
            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
              <button onClick={() => onEdit(task)}
                className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors">
                <Pencil className="w-3 h-3" />
              </button>
              <button onClick={() => onDelete(task.id)}
                className="p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {hasChildren && isOpen && (
          <div>{children.map((c) => renderNode(c, lvl + 1))}</div>
        )}
      </div>
    )
  }

  return (
    <div>
      {tasks.filter((t) => !t.parentCode).map((t) => renderNode(t, 0))}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function TemplatesClient({ templates: initialTemplates, userRole }: Props) {
  const [templates, setTemplates] = useState<Template[]>(initialTemplates)
  const [selected, setSelected]   = useState<Template | null>(null)
  const [expanded, setExpanded]   = useState<Set<string>>(new Set())
  const [pending, start]          = useTransition()

  // New / edit template modal
  const [templateModal, setTemplateModal] = useState<"create" | "edit" | null>(null)
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)
  const [tplForm, setTplForm] = useState({ name: "", description: "", projectType: "CUSTOM", color: "#7B2FBE" })

  // Task edit modal
  const [taskModal, setTaskModal] = useState(false)
  const [editingTask, setEditingTask] = useState<TemplateTask | null>(null)
  const [taskForm, setTaskForm] = useState({
    wbsCode: "", parentCode: "", title: "", estimatedEffort: "",
    isMilestone: false, predecessorCodes: "", durationDays: "1",
  })

  const canManage = CAN_MANAGE.has(userRole)

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function openCreateTemplate() {
    setTplForm({ name: "", description: "", projectType: "CUSTOM", color: "#7B2FBE" })
    setEditingTemplate(null)
    setTemplateModal("create")
  }

  function openEditTemplate(t: Template) {
    setTplForm({ name: t.name, description: t.description ?? "", projectType: t.projectType, color: t.color ?? "#7B2FBE" })
    setEditingTemplate(t)
    setTemplateModal("edit")
  }

  function handleSaveTemplate() {
    start(async () => {
      if (templateModal === "create") {
        const created = await createTemplate(tplForm)
        setTemplates((prev) => [...prev, created])
        setSelected(created)
      } else if (editingTemplate) {
        await updateTemplate(editingTemplate.id, tplForm)
        setTemplates((prev) => prev.map((t) => t.id === editingTemplate.id ? { ...t, ...tplForm } : t))
        if (selected?.id === editingTemplate.id) setSelected((s) => s ? { ...s, ...tplForm } : s)
      }
      setTemplateModal(null)
    })
  }

  function handleDeleteTemplate(id: string) {
    if (!confirm("Excluir este modelo? Esta ação não pode ser desfeita.")) return
    start(async () => {
      await deleteTemplate(id)
      setTemplates((prev) => prev.filter((t) => t.id !== id))
      if (selected?.id === id) setSelected(null)
    })
  }

  function openAddTask(tpl: Template) {
    setEditingTask(null)
    setTaskForm({ wbsCode: "", parentCode: "", title: "", estimatedEffort: "", isMilestone: false, predecessorCodes: "", durationDays: "1" })
    setTaskModal(true)
  }

  function openEditTask(task: TemplateTask) {
    setEditingTask(task)
    setTaskForm({
      wbsCode: task.wbsCode,
      parentCode: task.parentCode ?? "",
      title: task.title,
      estimatedEffort: task.estimatedEffort != null ? String(task.estimatedEffort) : "",
      isMilestone: task.isMilestone,
      predecessorCodes: task.predecessorCodes.join("; "),
      durationDays: String(task.durationDays),
    })
    setTaskModal(true)
  }

  function handleSaveTask() {
    if (!selected) return
    const preds = taskForm.predecessorCodes
      .split(/[;,]/).map((s) => s.trim()).filter(Boolean)

    start(async () => {
      if (editingTask) {
        await updateTemplateTask(editingTask.id, {
          wbsCode: taskForm.wbsCode || editingTask.wbsCode,
          parentCode: taskForm.parentCode || null,
          title: taskForm.title,
          estimatedEffort: taskForm.estimatedEffort ? parseFloat(taskForm.estimatedEffort) : null,
          isMilestone: taskForm.isMilestone,
          predecessorCodes: preds,
          durationDays: parseInt(taskForm.durationDays) || 1,
        })
      } else {
        await addTemplateTask(selected.id, {
          wbsCode: taskForm.wbsCode,
          parentCode: taskForm.parentCode || null,
          title: taskForm.title,
          estimatedEffort: taskForm.estimatedEffort ? parseFloat(taskForm.estimatedEffort) : null,
          isMilestone: taskForm.isMilestone,
          predecessorCodes: preds,
          durationDays: parseInt(taskForm.durationDays) || 1,
        })
      }
      // Refresh selected template
      const { getTemplates: refresh } = await import("@/lib/actions/templates")
      const fresh = await refresh()
      setTemplates(fresh)
      const freshSelected = fresh.find((t) => t.id === selected.id)
      if (freshSelected) setSelected(freshSelected)
      setTaskModal(false)
    })
  }

  function handleDeleteTask(taskId: string) {
    if (!selected) return
    start(async () => {
      await deleteTemplateTask(taskId)
      const updated: Template = { ...selected, tasks: selected.tasks.filter((t) => t.id !== taskId) }
      setSelected(updated)
      setTemplates((prev) => prev.map((t) => t.id === selected.id ? updated : t))
    })
  }

  const typeKeys = ["AUTOMACAO", "QUALIDADE", "CERTIFICACAO", "EXTERNO", "CUSTOM"]

  return (
    <div className="flex flex-col h-full bg-[#F8F9FC]">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-8 py-6" style={{
        background: "linear-gradient(135deg, #0F172A 0%, #1E1B4B 100%)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #7B2FBE, #9333EA)", boxShadow: "0 8px 24px rgba(123,47,190,0.4)" }}>
              <LayoutTemplate className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight">Modelos de Cronograma</h1>
              <p className="text-sm text-white/50 mt-0.5">
                {templates.length} modelo{templates.length !== 1 ? "s" : ""} disponíve{templates.length !== 1 ? "is" : "l"}
                {" · "}Use estes modelos ao iniciar o cronograma de um projeto
              </p>
            </div>
          </div>
          {canManage && (
            <button onClick={openCreateTemplate}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.97]"
              style={{ background: "linear-gradient(135deg, #7B2FBE, #2463FF)", boxShadow: "0 4px 16px rgba(123,47,190,0.4)" }}>
              <Plus className="w-4 h-4" /> Novo Modelo
            </button>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-6 mt-5">
          {[
            { label: "Modelos Padrão", value: templates.filter((t) => t.isBuiltIn).length, color: "#A78BFA" },
            { label: "Personalizados", value: templates.filter((t) => !t.isBuiltIn).length, color: "#34D399" },
            { label: "Total de Atividades", value: templates.reduce((s, t) => s + t.tasks.length, 0), color: "#60A5FA" },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-2">
              <span className="text-2xl font-black" style={{ color: s.color }}>{s.value}</span>
              <span className="text-xs text-white/40 font-medium">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Body: 2-column layout ──────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* ── Left: template cards ───────────────────────────────── */}
        <div className="w-[380px] flex-shrink-0 border-r border-slate-200 bg-white overflow-y-auto">
          <div className="p-4 space-y-3">

            {templates.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <BookOpen className="w-12 h-12 text-slate-200 mb-3" />
                <p className="text-sm font-semibold text-slate-400">Nenhum modelo criado ainda</p>
                {canManage && (
                  <button onClick={openCreateTemplate}
                    className="mt-4 text-sm font-bold text-[#7B2FBE] hover:underline">
                    + Criar primeiro modelo
                  </button>
                )}
              </div>
            )}

            {/* Built-in */}
            {templates.filter((t) => t.isBuiltIn).length > 0 && (
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400 px-1 mb-2">Modelos Padrão</p>
                <div className="space-y-2">
                  {templates.filter((t) => t.isBuiltIn).map((t) => <TemplateCard key={t.id} t={t} selected={selected} setSelected={setSelected} setExpanded={setExpanded} canManage={canManage} onEdit={openEditTemplate} onDelete={handleDeleteTemplate} />)}
                </div>
              </div>
            )}

            {/* Custom */}
            {templates.filter((t) => !t.isBuiltIn).length > 0 && (
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400 px-1 mb-2 mt-4">Personalizados</p>
                <div className="space-y-2">
                  {templates.filter((t) => !t.isBuiltIn).map((t) => <TemplateCard key={t.id} t={t} selected={selected} setSelected={setSelected} setExpanded={setExpanded} canManage={canManage} onEdit={openEditTemplate} onDelete={handleDeleteTemplate} />)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: template detail ────────────────────────────── */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-20">
              <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-4"
                style={{ background: "linear-gradient(135deg, rgba(123,47,190,0.06), rgba(36,99,255,0.06))" }}>
                <FolderTree className="w-9 h-9 text-slate-300" />
              </div>
              <h3 className="text-base font-bold text-slate-400">Selecione um modelo</h3>
              <p className="text-sm text-slate-300 mt-1">Clique em um modelo à esquerda para ver e editar suas atividades</p>
            </div>
          ) : (
            <div className="p-6">
              {/* Detail header */}
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <TypeBadge type={selected.projectType} size="lg" />
                  <div>
                    <h2 className="text-xl font-black text-slate-800">{selected.name}</h2>
                    {selected.description && (
                      <p className="text-sm text-slate-500 mt-0.5 max-w-xl">{selected.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-slate-400">{selected.tasks.length} atividades</span>
                      <span className="text-xs text-slate-400">
                        {selected.tasks.filter((t) => t.isMilestone).length} marcos
                      </span>
                      <span className="text-xs text-slate-400">
                        {selected.isBuiltIn ? "Modelo padrão" : "Modelo personalizado"}
                      </span>
                    </div>
                  </div>
                </div>
                {canManage && !selected.isBuiltIn && (
                  <button onClick={() => openAddTask(selected)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
                    style={{ background: "linear-gradient(135deg, #7B2FBE, #9333EA)" }}>
                    <Plus className="w-3.5 h-3.5" /> Nova Atividade
                  </button>
                )}
                {canManage && selected.isBuiltIn && (
                  <span className="text-xs text-slate-400 italic">Modelos padrão não podem ser editados</span>
                )}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 mb-4 px-3 py-2 rounded-xl bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Milestone className="w-3 h-3 text-amber-500" />Marco do projeto
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Clock className="w-3 h-3 text-slate-400" />Esforço estimado
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <ChevronRight className="w-3 h-3 text-slate-400" />Clique para expandir grupos
                </div>
              </div>

              {/* Task tree */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                {/* Column headers */}
                <div className="flex items-center px-3 py-2 border-b border-slate-100 bg-slate-50">
                  <div className="w-4 shrink-0" />
                  <div className="w-10 shrink-0 text-[9px] font-black uppercase tracking-widest text-slate-400 ml-2">EAP</div>
                  <div className="flex-1 text-[9px] font-black uppercase tracking-widest text-slate-400 ml-2">Atividade</div>
                  <div className="w-14 shrink-0 text-[9px] font-black uppercase tracking-widest text-slate-400 text-center">Duração</div>
                  <div className="w-16 shrink-0 text-[9px] font-black uppercase tracking-widest text-slate-400 text-center">Esforço</div>
                  {canManage && !selected.isBuiltIn && <div className="w-14 shrink-0" />}
                </div>

                <div className="p-2">
                  <TaskTree
                    tasks={selected.tasks}
                    expandedSet={expanded}
                    onToggle={toggleExpand}
                    onEdit={openEditTask}
                    onDelete={handleDeleteTask}
                    canManage={canManage && !selected.isBuiltIn}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Template Modal ────────────────────────────────────────── */}
      {templateModal && (
        <Modal title={templateModal === "create" ? "Novo Modelo" : "Editar Modelo"} onClose={() => setTemplateModal(null)}>
          <div className="space-y-4">
            <Field label="Nome do modelo *">
              <input value={tplForm.name} onChange={(e) => setTplForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex.: Projetos de Infraestrutura"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#7B2FBE]/30" />
            </Field>
            <Field label="Descrição">
              <textarea value={tplForm.description} onChange={(e) => setTplForm((f) => ({ ...f, description: e.target.value }))}
                rows={2} placeholder="Contexto e objetivo do modelo"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#7B2FBE]/30 resize-none" />
            </Field>
            <Field label="Tipo de projeto">
              <div className="grid grid-cols-2 gap-2">
                {typeKeys.map((k) => {
                  const cfg = TYPE_CONFIG[k]
                  const Icon = cfg.icon
                  const active = tplForm.projectType === k
                  return (
                    <button key={k} type="button" onClick={() => setTplForm((f) => ({ ...f, projectType: k, color: cfg.color }))}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium text-left transition-all"
                      style={{
                        borderColor: active ? cfg.color : "#E2E8F0",
                        background: active ? cfg.bg : "white",
                        color: active ? cfg.color : "#64748B",
                      }}>
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{cfg.label}</span>
                    </button>
                  )
                })}
              </div>
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setTemplateModal(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={handleSaveTemplate} disabled={!tplForm.name || pending}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50 transition-all hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #7B2FBE, #9333EA)" }}>
                {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Salvar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Task Modal ────────────────────────────────────────────── */}
      {taskModal && (
        <Modal title={editingTask ? "Editar Atividade" : "Nova Atividade"} onClose={() => setTaskModal(false)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Código EAP *">
                <input value={taskForm.wbsCode} onChange={(e) => setTaskForm((f) => ({ ...f, wbsCode: e.target.value }))}
                  placeholder="Ex.: 3.1.1"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#7B2FBE]/30" />
              </Field>
              <Field label="Código Pai">
                <input value={taskForm.parentCode} onChange={(e) => setTaskForm((f) => ({ ...f, parentCode: e.target.value }))}
                  placeholder="Ex.: 3.1 (ou vazio)"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#7B2FBE]/30" />
              </Field>
            </div>
            <Field label="Título da atividade *">
              <input value={taskForm.title} onChange={(e) => setTaskForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Ex.: Construção do Cronograma"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#7B2FBE]/30" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Duração (dias)">
                <input type="number" min="1" value={taskForm.durationDays} onChange={(e) => setTaskForm((f) => ({ ...f, durationDays: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#7B2FBE]/30" />
              </Field>
              <Field label="Esforço estimado (h)">
                <input type="number" step="0.1" value={taskForm.estimatedEffort} onChange={(e) => setTaskForm((f) => ({ ...f, estimatedEffort: e.target.value }))}
                  placeholder="Ex.: 0.5"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#7B2FBE]/30" />
              </Field>
            </div>
            <Field label="Predecessoras (códigos EAP separados por ; )">
              <input value={taskForm.predecessorCodes} onChange={(e) => setTaskForm((f) => ({ ...f, predecessorCodes: e.target.value }))}
                placeholder="Ex.: 2.3; 2.4"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#7B2FBE]/30" />
            </Field>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={taskForm.isMilestone} onChange={(e) => setTaskForm((f) => ({ ...f, isMilestone: e.target.checked }))}
                className="w-4 h-4 rounded accent-[#7B2FBE]" />
              <span className="text-sm font-medium text-slate-600">Marco do projeto</span>
              <Milestone className="w-3.5 h-3.5 text-amber-500" />
            </label>
            <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-500 border border-slate-100">
              <strong>Regra de predecessoras (FS):</strong> a atividade sucessora inicia 1 dia após o término da predecessora.
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setTaskModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={handleSaveTask} disabled={!taskForm.wbsCode || !taskForm.title || pending}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50 transition-all hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #7B2FBE, #9333EA)" }}>
                {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Salvar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TypeBadge({ type, size = "sm" }: { type: string; size?: "sm" | "lg" }) {
  const cfg = TYPE_CONFIG[type] ?? TYPE_CONFIG.CUSTOM
  const Icon = cfg.icon
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-xl font-bold ${size === "lg" ? "px-3 py-1.5 text-sm" : "px-2 py-1 text-xs"}`}
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
      <Icon className={size === "lg" ? "w-4 h-4" : "w-3 h-3"} />
      {cfg.label}
    </div>
  )
}

function TemplateCard({ t, selected, setSelected, setExpanded, canManage, onEdit, onDelete }: {
  t: Template
  selected: Template | null
  setSelected: (t: Template) => void
  setExpanded: (fn: (prev: Set<string>) => Set<string>) => void
  canManage: boolean
  onEdit: (t: Template) => void
  onDelete: (id: string) => void
}) {
  const isActive = selected?.id === t.id
  const cfg = TYPE_CONFIG[t.projectType] ?? TYPE_CONFIG.CUSTOM
  const milestones = t.tasks.filter((tk) => tk.isMilestone).length
  const parents = t.tasks.filter((tk) => !tk.parentCode).length

  return (
    <div
      onClick={() => { setSelected(t); setExpanded(() => new Set<string>()) }}
      className="group relative cursor-pointer rounded-2xl border p-4 transition-all duration-200"
      style={{
        borderColor: isActive ? cfg.color : "#E2E8F0",
        background: isActive ? cfg.bg : "white",
        boxShadow: isActive ? `0 0 0 2px ${cfg.color}30, 0 4px 12px rgba(0,0,0,0.06)` : "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      <div className="flex items-start gap-3">
        <TypeBadge type={t.projectType} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-700 truncate">{t.name}</p>
          {t.description && (
            <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">{t.description}</p>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3 mt-3">
        <span className="text-[11px] text-slate-500 flex items-center gap-1">
          <Layers className="w-3 h-3" />{t.tasks.length} atividades
        </span>
        {milestones > 0 && (
          <span className="text-[11px] text-amber-600 flex items-center gap-1">
            <Milestone className="w-3 h-3" />{milestones} marcos
          </span>
        )}
        {t.isBuiltIn && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-500">Padrão</span>
        )}
      </div>

      {/* Actions — only for custom, non built-in templates */}
      {canManage && !t.isBuiltIn && (
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity"
          onClick={(e) => e.stopPropagation()}>
          <button onClick={() => onEdit(t)}
            className="p-1.5 rounded-lg hover:bg-white text-slate-400 hover:text-slate-600 transition-colors">
            <Pencil className="w-3 h-3" />
          </button>
          <button onClick={() => onDelete(t.id)}
            className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(15,23,42,0.6)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="font-black text-[#0F172A] text-base">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-600 mb-1.5">{label}</label>
      {children}
    </div>
  )
}
