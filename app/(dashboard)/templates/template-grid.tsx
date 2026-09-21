"use client"

// Grade de edição de atividades do modelo — mesma linguagem visual e mesma
// interação do Cronograma v2 real (app/(dashboard)/projects/[id]/schedule-v2/
// schedule-v2-client.tsx: Row/RowGroup, gutter de ícones, arrastar pra
// reordenar/indentar/encaixar, edição inline sem modal). Pedido direto do
// usuário: o editor antigo (árvore + modal por campo) era lento pra ajustar
// modelo antes de iniciar um projeto — isto substitui.
//
// Diferenças deliberadas em relação ao Cronograma real: não existem colunas
// de data/responsável/custo/status (modelo não tem projeto nem calendário
// ainda — CLAUDE.md §3.10, "item nasce sem datas" — aqui nem chega a existir
// um projeto), então as únicas colunas editáveis são Duração (dias),
// Esforço estimado (h) e Predecessores (mesma sintaxe "1.2fs+1" do motor
// real). Marco vira um ícone no gutter (estrela ocupava esse lugar no
// Cronograma real pro "Macro Cronograma", que não existe aqui).

import { useState, useTransition } from "react"
import {
  GripVertical, Circle, CircleX, CirclePlus, ChevronDown, ChevronRight,
  Milestone, Plus, Loader2,
} from "lucide-react"
import {
  updateTemplateTask, deleteTemplateTask, duplicateTemplateTask,
  addTemplateTaskRoot, addTemplateTaskAbove, addTemplateTaskChild, moveTemplateTaskDrag,
} from "@/lib/actions/templates"
import type { TemplateTask } from "@/lib/actions/templates"

const GUTTER_WIDTH = 96
const COL_DURACAO  = 72
const COL_ESFORCO  = 84
const COL_PREDEC   = 176

interface Props {
  templateId: string
  tasks:      TemplateTask[]
  readOnly:   boolean
  // Chamado depois de qualquer mutação — o pai recarrega o modelo do
  // servidor (mesma estratégia de sempre neste arquivo: reordenar/indentar/
  // promover mexem em wbsCode/parentCode de OUTRAS linhas, então remendar o
  // array local não é confiável). focusTaskId foca o título da linha nova
  // depois do recarregamento, igual ao "+ Nova atividade" do Cronograma real.
  onMutated: (focusTaskId?: string) => void
}

type DropZone = "before" | "after" | "inside"

export function TemplateGrid({ templateId, tasks, readOnly, onMutated }: Props) {
  const [expanded, setExpanded]     = useState<Set<string>>(new Set())
  const [dragRowId, setDragRowId]   = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; zone: DropZone } | null>(null)
  const [pending, startTransition]  = useTransition()

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function runMutation(fn: () => Promise<{ id: string } | void>) {
    startTransition(async () => {
      const result = await fn()
      onMutated(result && "id" in result ? result.id : undefined)
    })
  }

  function handleUpdate(id: string, patch: Parameters<typeof updateTemplateTask>[1]) {
    runMutation(() => updateTemplateTask(id, patch))
  }
  function handleDelete(id: string) {
    if (!confirm("Excluir esta atividade? As subatividades (se houver) sobem um nível, para o pai desta.")) return
    runMutation(() => deleteTemplateTask(id))
  }
  function handleDuplicate(id: string) {
    runMutation(() => duplicateTemplateTask(templateId, id))
  }
  function handleAddRoot() {
    runMutation(() => addTemplateTaskRoot(templateId))
  }
  function handleAddAbove(id: string) {
    runMutation(() => addTemplateTaskAbove(templateId, id))
  }
  function handleAddChild(id: string) {
    setExpanded((prev) => new Set(prev).add(id))
    runMutation(() => addTemplateTaskChild(templateId, id))
  }

  function handleRowDragStart(id: string) {
    if (readOnly) return
    setDragRowId(id)
  }
  function handleRowDragOver(e: React.DragEvent, targetId: string) {
    if (readOnly || !dragRowId || dragRowId === targetId) { setDropTarget(null); return }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const ratio = (e.clientY - rect.top) / rect.height
    const zone: DropZone = ratio < 0.28 ? "before" : ratio > 0.72 ? "after" : "inside"
    setDropTarget({ id: targetId, zone })
  }
  function handleRowDrop(targetId: string) {
    const sourceId = dragRowId
    const target = dropTarget?.id === targetId ? dropTarget : null
    setDragRowId(null)
    setDropTarget(null)
    if (readOnly || !sourceId || !target) return
    runMutation(() => moveTemplateTaskDrag(templateId, sourceId, target.id, target.zone))
  }
  function handleRowDragEnd() {
    setDragRowId(null)
    setDropTarget(null)
  }

  const roots = tasks.filter((t) => !t.parentCode)
  const childrenOf = (code: string) => tasks.filter((t) => t.parentCode === code)

  const handlers: RowHandlers = {
    tasks, expanded, onToggle: toggle, onUpdate: handleUpdate, onDelete: handleDelete,
    onDuplicate: handleDuplicate, onAddAbove: handleAddAbove, onAddChild: handleAddChild,
    childrenOf, readOnly,
    dragRowId, dropTarget, onRowDragStart: handleRowDragStart, onRowDragOver: handleRowDragOver,
    onRowDrop: handleRowDrop, onRowDragEnd: handleRowDragEnd,
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {/* Cabeçalho das colunas */}
      <div className="flex items-center px-4 py-2 border-b border-slate-200 bg-slate-50 text-[9px] font-black uppercase tracking-widest text-slate-400">
        <div className="shrink-0" style={{ width: GUTTER_WIDTH }} />
        <div className="flex-1 min-w-0">Atividade</div>
        <div className="shrink-0 text-center" style={{ width: COL_DURACAO }}>Duração</div>
        <div className="shrink-0 text-center" style={{ width: COL_ESFORCO }}>Esforço</div>
        <div className="shrink-0 pl-2" style={{ width: COL_PREDEC }}>Predecessoras</div>
      </div>

      {/* Linhas */}
      <div className={`${pending ? "opacity-60 pointer-events-none transition-opacity" : "transition-opacity"}`}>
        {roots.length > 0 ? (
          roots.map((t) => <RowGroup key={t.id} task={t} depth={0} {...handlers} />)
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <p className="text-sm font-semibold text-slate-400">Nenhuma atividade ainda</p>
          </div>
        )}
      </div>

      {/* Rodapé: adicionar atividade raiz */}
      {!readOnly && (
        <div className="px-4 py-2 border-t border-slate-100">
          <button
            onClick={handleAddRoot}
            disabled={pending}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#7B2FBE] hover:text-[#6a28a8] disabled:opacity-50 transition-colors"
          >
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Nova atividade
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Linha + recursão de filhos ─────────────────────────────────────────────

type RowHandlers = {
  tasks: TemplateTask[]
  expanded: Set<string>
  onToggle: (id: string) => void
  onUpdate: (id: string, patch: Parameters<typeof updateTemplateTask>[1]) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  onAddAbove: (id: string) => void
  onAddChild: (id: string) => void
  childrenOf: (code: string) => TemplateTask[]
  readOnly: boolean
  dragRowId: string | null
  dropTarget: { id: string; zone: DropZone } | null
  onRowDragStart: (id: string) => void
  onRowDragOver: (e: React.DragEvent, targetId: string) => void
  onRowDrop: (targetId: string) => void
  onRowDragEnd: () => void
}

function RowGroup({ task, depth, ...h }: { task: TemplateTask; depth: number } & RowHandlers) {
  const kids = h.childrenOf(task.wbsCode)
  const isOpen = h.expanded.has(task.id)

  return (
    <div>
      <Row task={task} depth={depth} hasChildren={kids.length > 0} isOpen={isOpen} {...h} />
      {kids.length > 0 && isOpen && (
        <div>{kids.map((c) => <RowGroup key={c.id} task={c} depth={depth + 1} {...h} />)}</div>
      )}
    </div>
  )
}

function Row({ task, depth, hasChildren, isOpen, ...h }: {
  task: TemplateTask; depth: number; hasChildren: boolean; isOpen: boolean
} & RowHandlers) {
  const isDragging = h.dragRowId === task.id
  const dropHere = h.dropTarget?.id === task.id ? h.dropTarget.zone : null

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); h.onRowDragOver(e, task.id) }}
      onDrop={(e) => { e.preventDefault(); h.onRowDrop(task.id) }}
      onDragEnd={h.onRowDragEnd}
      className="flex items-center px-4 py-1.5 border-b border-slate-100 hover:bg-slate-50 group transition-colors"
      style={{
        background: dropHere === "inside" ? "rgba(123,47,190,0.10)" : undefined,
        opacity: isDragging ? 0.4 : 1,
        borderTop: dropHere === "before" ? "2px solid #7B2FBE" : "2px solid transparent",
        borderBottom: dropHere === "after" ? "2px solid #7B2FBE" : undefined,
        outline: dropHere === "inside" ? "2px dashed #7B2FBE" : undefined,
        outlineOffset: dropHere === "inside" ? "-2px" : undefined,
      }}
    >
      {/* Gutter: arrastar, excluir, adicionar/duplicar, marco */}
      <div style={{ width: GUTTER_WIDTH }} className="flex items-center gap-1 shrink-0">
        {!h.readOnly && (
          <span
            draggable
            onDragStart={(e) => { e.stopPropagation(); h.onRowDragStart(task.id) }}
            onDragEnd={h.onRowDragEnd}
            title="Arrastar para mover, reordenar ou encaixar em outra atividade"
            className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 transition-colors"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </span>
        )}
        {!h.readOnly && (
          <button onClick={() => h.onDelete(task.id)} title="Excluir">
            <CircleX className="w-3.5 h-3.5 text-red-300 hover:text-red-500 transition-colors" />
          </button>
        )}
        {!h.readOnly && (
          <AddMenuButton task={task} onDuplicate={h.onDuplicate} onAddAbove={h.onAddAbove} onAddChild={h.onAddChild} />
        )}
        {!hasChildren && (
          <button
            onClick={() => !h.readOnly && h.onUpdate(task.id, { isMilestone: !task.isMilestone })}
            disabled={h.readOnly}
            title={task.isMilestone ? "Remover marco" : "Marcar como marco do projeto"}
          >
            <Milestone className={`w-3.5 h-3.5 transition-colors ${task.isMilestone ? "text-amber-500 fill-amber-500/30" : "text-slate-300 hover:text-amber-400"}`} />
          </button>
        )}
      </div>

      {/* Título + hierarquia */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0" style={{ paddingLeft: depth * 20 }}>
        <button onClick={() => hasChildren && h.onToggle(task.id)} className="w-4 h-4 flex items-center justify-center shrink-0">
          {hasChildren
            ? (isOpen ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />)
            : <Circle className="w-1.5 h-1.5 text-slate-300 fill-slate-300 mx-auto" />}
        </button>
        <span className="text-[9px] font-mono font-bold text-slate-400 shrink-0 w-9">{task.wbsCode}</span>
        {h.readOnly ? (
          <span className={`flex-1 min-w-0 truncate text-sm ${hasChildren ? "font-bold text-slate-800" : "text-slate-600"}`}>{task.title}</span>
        ) : (
          <input
            id={`tmpl-title-${task.id}`}
            key={`title:${task.id}:${task.title}`}
            defaultValue={task.title}
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (v && v !== task.title) h.onUpdate(task.id, { title: v })
            }}
            className={`bg-transparent outline-none text-sm flex-1 min-w-0 truncate rounded px-1 -mx-1 focus:bg-violet-50 ${hasChildren ? "font-bold text-slate-800" : "text-slate-700"}`}
          />
        )}
      </div>

      {/* Duração */}
      <div className="shrink-0 text-center" style={{ width: COL_DURACAO }}>
        {!hasChildren ? (
          h.readOnly ? (
            <span className="text-xs text-slate-600">{task.durationDays}d</span>
          ) : (
            <input
              key={`dur:${task.id}:${task.durationDays}`}
              type="number" min={1}
              defaultValue={task.durationDays}
              onBlur={(e) => {
                const v = e.target.value === "" ? 1 : Math.max(1, parseInt(e.target.value, 10) || 1)
                if (v !== task.durationDays) h.onUpdate(task.id, { durationDays: v })
              }}
              className="w-12 text-center bg-transparent outline-none text-xs text-slate-700 rounded border-b border-transparent focus:border-[#7B2FBE] focus:bg-violet-50"
            />
          )
        ) : <span className="text-[10px] text-slate-300">—</span>}
      </div>

      {/* Esforço estimado (h) */}
      <div className="shrink-0 text-center" style={{ width: COL_ESFORCO }}>
        {!hasChildren ? (
          h.readOnly ? (
            <span className="text-xs text-slate-500">{task.estimatedEffort != null ? `${task.estimatedEffort}h` : "—"}</span>
          ) : (
            <input
              key={`eff:${task.id}:${task.estimatedEffort}`}
              type="number" min={0} step={0.1}
              placeholder="—"
              defaultValue={task.estimatedEffort ?? ""}
              onBlur={(e) => {
                const v = e.target.value === "" ? null : parseFloat(e.target.value)
                if (v !== task.estimatedEffort) h.onUpdate(task.id, { estimatedEffort: v })
              }}
              className="w-14 text-center bg-transparent outline-none text-xs text-slate-700 placeholder-slate-300 rounded border-b border-transparent focus:border-[#7B2FBE] focus:bg-violet-50"
            />
          )
        ) : <span className="text-[10px] text-slate-300">—</span>}
      </div>

      {/* Predecessoras */}
      <div className="shrink-0 pl-2" style={{ width: COL_PREDEC }}>
        {!hasChildren ? (
          h.readOnly ? (
            <span className="text-[10px] font-mono text-slate-500">{task.predecessorCodes.join("; ") || "—"}</span>
          ) : (
            <input
              key={`pred:${task.id}:${task.predecessorCodes.join(",")}`}
              defaultValue={task.predecessorCodes.join("; ")}
              onBlur={(e) => {
                const codes = e.target.value.split(/[;,]/).map((s) => s.trim()).filter(Boolean)
                const changed = codes.length !== task.predecessorCodes.length || codes.some((c, i) => c !== task.predecessorCodes[i])
                if (changed) h.onUpdate(task.id, { predecessorCodes: codes })
              }}
              placeholder="Ex.: 1.2; 2.1ss+1"
              className="w-full bg-transparent outline-none text-[10px] font-mono text-slate-700 placeholder-slate-300 rounded border-b border-transparent focus:border-[#7B2FBE] focus:bg-violet-50"
            />
          )
        ) : null}
      </div>
    </div>
  )
}

function AddMenuButton({ task, onDuplicate, onAddAbove, onAddChild }: {
  task: TemplateTask
  onDuplicate: (id: string) => void
  onAddAbove: (id: string) => void
  onAddChild: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} title="Adicionar / duplicar">
        <CirclePlus className="w-3.5 h-3.5 text-emerald-400 hover:text-emerald-600 transition-colors" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-5 z-50 w-64 bg-white rounded-xl border border-slate-200 py-1" style={{ boxShadow: "0 12px 32px rgba(15,23,42,0.14)" }}>
            <MenuItem onClick={() => { setOpen(false); onDuplicate(task.id) }}>Duplicar linha</MenuItem>
            <div className="h-px bg-slate-100 my-1 mx-2" />
            <MenuItem onClick={() => { setOpen(false); onAddAbove(task.id) }}>Adicionar nova linha acima</MenuItem>
            <div className="h-px bg-slate-100 my-1 mx-2" />
            <MenuItem onClick={() => { setOpen(false); onAddChild(task.id) }}>Adicionar nova linha como última filha</MenuItem>
          </div>
        </>
      )}
    </div>
  )
}

function MenuItem({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full text-left px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
      {children}
    </button>
  )
}
