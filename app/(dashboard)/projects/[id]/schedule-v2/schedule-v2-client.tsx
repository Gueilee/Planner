"use client"

import { useMemo, useState, useTransition } from "react"
import {
  createItemV2, updateItemV2, deleteItemV2, reorderItemsV2, setDependenciesV2, getScheduleV2,
} from "@/lib/actions/schedule-v2"
import type { ScheduleV2Payload, ItemV2 } from "@/lib/actions/schedule-v2"
import { fmtDateLong } from "@/lib/date-utils"
import {
  ChevronRight, ChevronDown, Plus, Trash2, IndentIncrease, IndentDecrease,
  ArrowUp, ArrowDown, AlertTriangle, Milestone, Info,
} from "lucide-react"

// ─── Helpers ────────────────────────────────────────────────────────────────

function siblingsOf(items: ItemV2[], parentId: string | null): ItemV2[] {
  return items.filter((i) => i.parentId === parentId).sort((a, b) => a.order - b.order)
}

function childrenOf(items: ItemV2[], id: string): ItemV2[] {
  return siblingsOf(items, id)
}

function depsTextFor(itemId: string, data: ScheduleV2Payload): string {
  const codeById = new Map(data.items.map((i) => [i.id, i.code]))
  return data.dependencies
    .filter((d) => d.successorId === itemId)
    .map((d) => {
      const code = codeById.get(d.predecessorId) ?? "?"
      const suffix = d.type === "FS" && d.lagDiasUteis === 0 ? "" : d.type.toLowerCase() + (d.lagDiasUteis !== 0 ? (d.lagDiasUteis > 0 ? `+${d.lagDiasUteis}` : `${d.lagDiasUteis}`) : "")
      return code + suffix
    })
    .join("; ")
}

function dateRange(items: ItemV2[]): { min: string; max: string } | null {
  const starts = items.map((i) => i.inicioEstimado).filter((d): d is string => d !== null)
  const ends = items.map((i) => i.terminoEstimado).filter((d): d is string => d !== null)
  if (starts.length === 0 || ends.length === 0) return null
  return { min: starts.reduce((a, b) => (b < a ? b : a)), max: ends.reduce((a, b) => (b > a ? b : a)) }
}

function pct(date: string, range: { min: string; max: string }): number {
  const toTs = (d: string) => new Date(`${d}T00:00:00Z`).getTime()
  const span = toTs(range.max) - toTs(range.min)
  if (span <= 0) return 0
  return ((toTs(date) - toTs(range.min)) / span) * 100
}

// ─── Main ─────────────────────────────────────────────────────────────────

export function ScheduleV2Client({ projectId, initial }: { projectId: string; initial: ScheduleV2Payload }) {
  const [data, setData] = useState<ScheduleV2Payload>(initial)
  const [expanded, setExpanded] = useState<Set<string>>(new Set(initial.items.filter((i) => i.isGroup).map((i) => i.id)))
  const [pending, startTransition] = useTransition()
  const [newTitle, setNewTitle] = useState("")
  const [addingUnder, setAddingUnder] = useState<string | null>(null)

  const range = useMemo(() => dateRange(data.items), [data.items])
  const conflictByItem = useMemo(() => new Map(data.conflicts.map((c) => [c.itemId, c])), [data.conflicts])

  function refresh() {
    startTransition(async () => {
      const fresh = await getScheduleV2(projectId)
      setData(fresh)
    })
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function handleCreate(parentId: string | null) {
    const title = newTitle.trim()
    if (!title) return
    startTransition(async () => {
      await createItemV2({ projectId, parentId, title })
      setNewTitle("")
      setAddingUnder(null)
      refresh()
    })
  }

  function handleUpdate(id: string, patch: Parameters<typeof updateItemV2>[2]) {
    startTransition(async () => {
      await updateItemV2(id, projectId, patch)
      refresh()
    })
  }

  function handleDeps(id: string, raw: string) {
    startTransition(async () => {
      await setDependenciesV2(id, projectId, raw)
      refresh()
    })
  }

  function handleDelete(id: string) {
    if (!confirm("Excluir este item e todos os seus filhos?")) return
    startTransition(async () => {
      await deleteItemV2(id, projectId)
      refresh()
    })
  }

  function handleMove(item: ItemV2, dir: -1 | 1) {
    const sibs = siblingsOf(data.items, item.parentId)
    const idx = sibs.findIndex((s) => s.id === item.id)
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= sibs.length) return
    const reordered = [...sibs]
    ;[reordered[idx], reordered[swapIdx]] = [reordered[swapIdx]!, reordered[idx]!]
    startTransition(async () => {
      await reorderItemsV2(projectId, reordered.map((s) => s.id))
      refresh()
    })
  }

  function handleIndent(item: ItemV2) {
    const sibs = siblingsOf(data.items, item.parentId)
    const idx = sibs.findIndex((s) => s.id === item.id)
    const newParent = sibs[idx - 1]
    if (!newParent) return
    startTransition(async () => {
      await updateItemV2(item.id, projectId, { parentId: newParent.id })
      refresh()
    })
  }

  function handleOutdent(item: ItemV2) {
    if (item.parentId === null) return
    const parent = data.items.find((i) => i.id === item.parentId)
    if (!parent) return
    startTransition(async () => {
      await updateItemV2(item.id, projectId, { parentId: parent.parentId })
      refresh()
    })
  }

  const roots = siblingsOf(data.items, null)

  return (
    <div className="min-h-full text-slate-200">
      {/* Header stats */}
      <div className="px-5 py-4 border-b border-[#1E293B] flex items-center gap-6">
        <Stat label="Itens" value={data.items.length} />
        <Stat label="Início" value={data.items.length ? fmtDateLong(range?.min) : "—"} />
        <Stat label="Término" value={fmtDateLong(data.projectEndDate)} />
        <Stat label="Conflitos" value={data.conflicts.length} color={data.conflicts.length > 0 ? "#F59E0B" : undefined} />
        <div className="ml-auto flex items-center gap-2 text-[11px] text-slate-500">
          <Info className="w-3.5 h-3.5" />
          Ambiente de teste do novo motor — duração é a fonte da verdade da barra; predecessores usam a sintaxe do Artia (ex.: <code className="text-slate-300">A2</code>, <code className="text-slate-300">A2fs</code>, <code className="text-slate-300">A2ss+1</code>).
        </div>
      </div>

      {/* Column headers */}
      <div className="flex items-center px-4 py-2 border-b border-[#1E293B] bg-[#111827] text-[9px] font-black uppercase tracking-widest text-slate-500">
        <div style={{ width: 340 }}>Atividade</div>
        <div style={{ width: 60 }} className="text-center">Duração</div>
        <div style={{ width: 110 }} className="text-center">Início</div>
        <div style={{ width: 90 }} className="text-center">Término</div>
        <div style={{ width: 70 }} className="text-center">%</div>
        <div style={{ width: 150 }}>Predecessores</div>
        <div style={{ width: 80 }} className="text-center">Modo</div>
        <div className="flex-1">Barra</div>
        <div style={{ width: 130 }} className="text-center">Ações</div>
      </div>

      {/* Rows */}
      <div className={pending ? "opacity-60 pointer-events-none transition-opacity" : "transition-opacity"}>
        {roots.map((item) => (
          <RowGroup
            key={item.id}
            item={item}
            depth={0}
            data={data}
            expanded={expanded}
            onToggle={toggle}
            onUpdate={handleUpdate}
            onDeps={handleDeps}
            onDelete={handleDelete}
            onMove={handleMove}
            onIndent={handleIndent}
            onOutdent={handleOutdent}
            range={range}
            conflictByItem={conflictByItem}
            addingUnder={addingUnder}
            setAddingUnder={setAddingUnder}
            newTitle={newTitle}
            setNewTitle={setNewTitle}
            onCreate={handleCreate}
          />
        ))}
      </div>

      {/* Novo item de topo */}
      <div className="px-4 py-3 border-t border-[#1E293B]">
        {addingUnder === "__root__" ? (
          <NewItemInput
            value={newTitle}
            onChange={setNewTitle}
            onSubmit={() => handleCreate(null)}
            onCancel={() => { setAddingUnder(null); setNewTitle("") }}
          />
        ) : (
          <button
            onClick={() => setAddingUnder("__root__")}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-400 hover:text-violet-300 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Nova atividade de topo
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Stat pill ────────────────────────────────────────────────────────────

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div>
      <p className="text-lg font-black" style={{ color: color ?? "#E2E8F0" }}>{value}</p>
      <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">{label}</p>
    </div>
  )
}

// ─── New item inline input ──────────────────────────────────────────────────

function NewItemInput({ value, onChange, onSubmit, onCancel }: {
  value: string; onChange: (v: string) => void; onSubmit: () => void; onCancel: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onSubmit(); if (e.key === "Escape") onCancel() }}
        placeholder="Título da atividade..."
        className="px-2 py-1 rounded-lg bg-[#1E293B] border border-[#334155] text-sm text-slate-100 outline-none focus:border-violet-500 w-64"
      />
      <button onClick={onSubmit} className="text-xs font-bold text-violet-400 hover:text-violet-300">Adicionar</button>
      <button onClick={onCancel} className="text-xs text-slate-500 hover:text-slate-300">Cancelar</button>
    </div>
  )
}

// ─── Row + recursive children ────────────────────────────────────────────────

type RowHandlers = {
  data: ScheduleV2Payload
  expanded: Set<string>
  onToggle: (id: string) => void
  onUpdate: (id: string, patch: Parameters<typeof updateItemV2>[2]) => void
  onDeps: (id: string, raw: string) => void
  onDelete: (id: string) => void
  onMove: (item: ItemV2, dir: -1 | 1) => void
  onIndent: (item: ItemV2) => void
  onOutdent: (item: ItemV2) => void
  range: { min: string; max: string } | null
  conflictByItem: Map<string, ScheduleV2Payload["conflicts"][number]>
  addingUnder: string | null
  setAddingUnder: (id: string | null) => void
  newTitle: string
  setNewTitle: (v: string) => void
  onCreate: (parentId: string | null) => void
}

function RowGroup({ item, depth, ...h }: { item: ItemV2; depth: number } & RowHandlers) {
  const kids = childrenOf(h.data.items, item.id)
  const isOpen = h.expanded.has(item.id)

  return (
    <div>
      <Row item={item} depth={depth} hasChildren={kids.length > 0} isOpen={isOpen} {...h} />
      {kids.length > 0 && isOpen && (
        <div>
          {kids.map((c) => <RowGroup key={c.id} item={c} depth={depth + 1} {...h} />)}
        </div>
      )}
      {h.addingUnder === item.id ? (
        <div className="pl-4 py-1.5" style={{ paddingLeft: 16 + (depth + 1) * 20 }}>
          <NewItemInput
            value={h.newTitle}
            onChange={h.setNewTitle}
            onSubmit={() => h.onCreate(item.id)}
            onCancel={() => { h.setAddingUnder(null); h.setNewTitle("") }}
          />
        </div>
      ) : (
        isOpen && (
          <button
            onClick={() => h.setAddingUnder(item.id)}
            style={{ paddingLeft: 16 + (depth + 1) * 20 }}
            className="flex items-center gap-1 py-1 text-[10px] font-bold text-slate-600 hover:text-violet-400 transition-colors"
          >
            <Plus className="w-3 h-3" /> Sub-item
          </button>
        )
      )}
    </div>
  )
}

function Row({ item, depth, hasChildren, isOpen, ...h }: { item: ItemV2; depth: number; hasChildren: boolean; isOpen: boolean } & RowHandlers) {
  const [title, setTitle] = useState(item.title)
  const [depsText, setDepsText] = useState(() => depsTextFor(item.id, h.data))
  const conflict = h.conflictByItem.get(item.id)

  return (
    <div
      className="flex items-center px-4 py-1.5 border-b border-[#1E293B]/60 hover:bg-[#111827] group"
      style={{ background: conflict ? "rgba(245,158,11,0.06)" : undefined }}
    >
      {/* Título + hierarquia */}
      <div className="flex items-center gap-1.5" style={{ width: 340, paddingLeft: depth * 20 }}>
        <button onClick={() => hasChildren && h.onToggle(item.id)} className="w-4 h-4 flex items-center justify-center shrink-0">
          {hasChildren
            ? (isOpen ? <ChevronDown className="w-3 h-3 text-slate-500" /> : <ChevronRight className="w-3 h-3 text-slate-500" />)
            : item.duracaoDiasUteis === 0
              ? <Milestone className="w-3 h-3 text-amber-400" />
              : <span className="w-1 h-1 rounded-full bg-slate-600 mx-auto" />
          }
        </button>
        <span className="text-[9px] font-mono font-bold text-slate-600 shrink-0 w-8">{item.code}</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== item.title && h.onUpdate(item.id, { title })}
          className={`bg-transparent outline-none text-sm flex-1 min-w-0 truncate ${hasChildren ? "font-bold text-slate-100" : "text-slate-300"} focus:text-white`}
        />
        {conflict && (
          <span title={`Vínculo sugere ${conflict.suggestedInicio ?? "?"} — item está em modo manual`}>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          </span>
        )}
      </div>

      {/* Duração */}
      <div style={{ width: 60 }} className="text-center">
        {!hasChildren ? (
          <input
            type="number" min={0}
            defaultValue={item.duracaoDiasUteis ?? ""}
            onBlur={(e) => {
              const v = e.target.value === "" ? null : parseInt(e.target.value, 10)
              if (v !== item.duracaoDiasUteis) h.onUpdate(item.id, { duracaoDiasUteis: v })
            }}
            className="w-10 text-center bg-transparent outline-none text-xs text-slate-300 focus:text-white border-b border-transparent focus:border-violet-500"
          />
        ) : <span className="text-[10px] text-slate-600">—</span>}
      </div>

      {/* Início */}
      <div style={{ width: 110 }} className="text-center">
        {!hasChildren ? (
          <input
            type="date"
            defaultValue={item.inicioEstimado ?? ""}
            onBlur={(e) => {
              const v = e.target.value || null
              if (v !== item.inicioEstimado) h.onUpdate(item.id, { inicioEstimado: v })
            }}
            className="bg-transparent outline-none text-[10px] text-slate-300 focus:text-white w-full text-center"
            style={{ colorScheme: "dark" }}
          />
        ) : <span className="text-[10px] text-slate-500">{fmtDateLong(item.inicioEstimado)}</span>}
      </div>

      {/* Término (sempre derivado) */}
      <div style={{ width: 90 }} className="text-center text-[10px] text-slate-500">
        {fmtDateLong(item.terminoEstimado)}
      </div>

      {/* % completo */}
      <div style={{ width: 70 }} className="text-center">
        {!hasChildren ? (
          <input
            type="number" min={0} max={100}
            defaultValue={item.percentualCompleto}
            onBlur={(e) => {
              const v = Math.max(0, Math.min(100, parseInt(e.target.value || "0", 10)))
              if (v !== item.percentualCompleto) h.onUpdate(item.id, { percentualCompleto: v })
            }}
            className="w-10 text-center bg-transparent outline-none text-xs text-slate-300 focus:text-white border-b border-transparent focus:border-violet-500"
          />
        ) : <span className="text-xs font-bold text-violet-400">{item.percentualCompleto}%</span>}
      </div>

      {/* Predecessores */}
      <div style={{ width: 150 }}>
        {!hasChildren && (
          <input
            value={depsText}
            onChange={(e) => setDepsText(e.target.value)}
            onBlur={() => depsText !== depsTextFor(item.id, h.data) && h.onDeps(item.id, depsText)}
            placeholder="Ex.: A2; A3ss+1"
            className="w-full bg-transparent outline-none text-[10px] font-mono text-slate-300 placeholder-slate-700 focus:text-white border-b border-transparent focus:border-violet-500"
          />
        )}
      </div>

      {/* Modo */}
      <div style={{ width: 80 }} className="text-center">
        {!hasChildren && (
          <button
            onClick={() => h.onUpdate(item.id, { schedulingMode: item.schedulingMode === "auto" ? "manual" : "auto" })}
            className="text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full transition-colors"
            style={item.schedulingMode === "manual"
              ? { background: "rgba(245,158,11,0.15)", color: "#F59E0B" }
              : { background: "rgba(148,163,184,0.12)", color: "#94A3B8" }}
          >
            {item.schedulingMode === "manual" ? "Manual" : "Auto"}
          </button>
        )}
      </div>

      {/* Barra */}
      <div className="flex-1 pr-3">
        {h.range && item.inicioEstimado && item.terminoEstimado && (
          <div className="relative h-3 bg-[#1E293B] rounded-full overflow-hidden">
            <div
              className="absolute top-0 h-full rounded-full"
              style={{
                left: `${pct(item.inicioEstimado, h.range)}%`,
                width: `${Math.max(1.5, pct(item.terminoEstimado, h.range) - pct(item.inicioEstimado, h.range))}%`,
                background: conflict ? "#F59E0B" : hasChildren ? "#475569" : "linear-gradient(90deg,#7B2FBE,#2463FF)",
              }}
            />
          </div>
        )}
      </div>

      {/* Ações */}
      <div style={{ width: 130 }} className="flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <IconBtn onClick={() => h.onMove(item, -1)} title="Mover para cima"><ArrowUp className="w-3 h-3" /></IconBtn>
        <IconBtn onClick={() => h.onMove(item, 1)} title="Mover para baixo"><ArrowDown className="w-3 h-3" /></IconBtn>
        <IconBtn onClick={() => h.onIndent(item)} title="Indentar (virar filho do anterior)"><IndentIncrease className="w-3 h-3" /></IconBtn>
        <IconBtn onClick={() => h.onOutdent(item)} title="Promover (sair do grupo)" disabled={item.parentId === null}><IndentDecrease className="w-3 h-3" /></IconBtn>
        <IconBtn onClick={() => h.onDelete(item.id)} title="Excluir" danger><Trash2 className="w-3 h-3" /></IconBtn>
      </div>
    </div>
  )
}

function IconBtn({ children, onClick, title, danger, disabled }: {
  children: React.ReactNode; onClick: () => void; title: string; danger?: boolean; disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`w-5 h-5 rounded flex items-center justify-center transition-colors disabled:opacity-20 disabled:cursor-not-allowed ${
        danger ? "text-slate-500 hover:text-red-400 hover:bg-red-500/10" : "text-slate-500 hover:text-white hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  )
}
