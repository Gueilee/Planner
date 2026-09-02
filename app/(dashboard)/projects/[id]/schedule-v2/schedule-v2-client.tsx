"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import {
  createItemV2, updateItemV2, deleteItemV2, reorderItemsV2, setDependenciesV2, getScheduleV2,
  hasUndoV2, undoLastChangeV2,
} from "@/lib/actions/schedule-v2"
import type { ScheduleV2Payload, ItemV2 } from "@/lib/actions/schedule-v2"
import { updateProjectDetails } from "@/lib/actions/projects"
import { fmtDateLong } from "@/lib/date-utils"
import {
  ChevronRight, ChevronDown, Plus, IndentIncrease, IndentDecrease,
  ArrowUp, ArrowDown, ArrowUpDown, AlertTriangle, Milestone, Info,
  Circle, CircleX, CirclePlus, Pencil, Undo2,
} from "lucide-react"

// ─── Helpers ────────────────────────────────────────────────────────────────

function siblingsOf(items: ItemV2[], parentId: string | null): ItemV2[] {
  return items.filter((i) => i.parentId === parentId).sort((a, b) => a.order - b.order)
}

// ─── Ordenação por coluna (só na exibição — não mexe no `order` persistido) ──

type SortColumn = "title" | "duracao" | "inicio" | "termino" | "pct" | "modo" | null
type SortState = { column: SortColumn; dir: "asc" | "desc" }

function sortValue(item: ItemV2, col: SortColumn): string | number {
  switch (col) {
    case "title": return item.title.toLowerCase()
    case "duracao": return item.duracaoDiasUteis ?? -1
    case "inicio": return item.inicioEstimado ?? ""
    case "termino": return item.terminoEstimado ?? ""
    case "pct": return item.percentualCompleto
    case "modo": return item.schedulingMode
    default: return 0
  }
}

// Ordena os irmãos de um mesmo pai pelo valor da coluna ativa — a hierarquia
// (quem é filho de quem) nunca muda, só a sequência dentro de cada nível.
function sortedSiblingsOf(items: ItemV2[], parentId: string | null, sort: SortState): ItemV2[] {
  const base = siblingsOf(items, parentId)
  if (!sort.column) return base
  const factor = sort.dir === "asc" ? 1 : -1
  const col = sort.column
  return [...base].sort((a, b) => {
    const va = sortValue(a, col)
    const vb = sortValue(b, col)
    if (va < vb) return -1 * factor
    if (va > vb) return 1 * factor
    return 0
  })
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

function hasPredecessor(itemId: string, data: ScheduleV2Payload): boolean {
  return data.dependencies.some((d) => d.successorId === itemId)
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

export function ScheduleV2Client({ projectId, initial, initialProjectDates }: {
  projectId: string
  initial: ScheduleV2Payload
  initialProjectDates: { expectedStart: string | null; expectedEnd: string | null }
}) {
  const [data, setData] = useState<ScheduleV2Payload>(initial)
  const [expanded, setExpanded] = useState<Set<string>>(new Set(initial.items.filter((i) => i.isGroup).map((i) => i.id)))
  const [pending, startTransition] = useTransition()
  const [newTitle, setNewTitle] = useState("")
  const [addingUnder, setAddingUnder] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sort, setSort] = useState<SortState>({ column: null, dir: "asc" })
  const [projectDates, setProjectDates] = useState(initialProjectDates)
  const [hasUndo, setHasUndo] = useState(false)

  const range = useMemo(() => dateRange(data.items), [data.items])
  const conflictByItem = useMemo(() => new Map(data.conflicts.map((c) => [c.itemId, c])), [data.conflicts])

  useEffect(() => {
    hasUndoV2(projectId).then(setHasUndo).catch(() => {})
  }, [projectId])

  function refresh() {
    startTransition(async () => {
      const fresh = await getScheduleV2(projectId)
      setData(fresh)
      setHasUndo(true)
    })
  }

  function handleUndo() {
    startTransition(async () => {
      const result = await undoLastChangeV2(projectId)
      if (result.ok) {
        const fresh = await getScheduleV2(projectId)
        setData(fresh)
      }
      setHasUndo(false)
    })
  }

  function handleProjectDate(field: "expectedStart" | "expectedEnd", value: string | null) {
    setProjectDates((prev) => ({ ...prev, [field]: value }))
    startTransition(async () => {
      await updateProjectDetails(projectId, { [field]: value })
    })
  }

  function toggleSort(column: Exclude<SortColumn, null>) {
    setSort((prev) => prev.column === column ? { column, dir: prev.dir === "asc" ? "desc" : "asc" } : { column, dir: "asc" })
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
    if (selectedId === id) setSelectedId(null)
    startTransition(async () => {
      await deleteItemV2(id, projectId)
      refresh()
    })
  }

  // "+" da linha (igual ao Artia): insere uma atividade nova logo depois
  // desta, no mesmo nível — não dentro dela.
  function handleAddSibling(item: ItemV2) {
    startTransition(async () => {
      const created = await createItemV2({ projectId, parentId: item.parentId, title: "Nova atividade" })
      const sibs = siblingsOf(data.items, item.parentId)
      const idx = sibs.findIndex((s) => s.id === item.id)
      const orderedIds = [
        ...sibs.slice(0, idx + 1).map((s) => s.id),
        created.id,
        ...sibs.slice(idx + 1).map((s) => s.id),
      ]
      await reorderItemsV2(projectId, orderedIds)
      refresh()
    })
  }

  function handleEditTitle(id: string) {
    const el = document.getElementById(`sv2-title-${id}`) as HTMLInputElement | null
    el?.focus()
    el?.select()
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

  const roots = sortedSiblingsOf(data.items, null, sort)
  const selectedItem = selectedId ? data.items.find((i) => i.id === selectedId) ?? null : null

  return (
    <div className="min-h-full text-slate-700" style={{ background: "#F8F9FC" }}>
      {/* Header stats — Início/Término do projeto ficam editáveis desde a
          abertura do cronograma (igual ao "Data de início/término" do
          Artia), independente de já existir alguma atividade lançada. */}
      <div className="px-5 py-4 border-b border-slate-200 bg-white flex items-center gap-6 flex-wrap">
        <Stat label="Itens" value={data.items.length} />
        <EditableDateStat
          label="Início"
          value={projectDates.expectedStart}
          onChange={(v) => handleProjectDate("expectedStart", v)}
        />
        <EditableDateStat
          label="Término"
          value={projectDates.expectedEnd}
          onChange={(v) => handleProjectDate("expectedEnd", v)}
        />
        <Stat label="Conflitos" value={data.conflicts.length} color={data.conflicts.length > 0 ? "#D97706" : undefined} />
        <div className="ml-auto flex items-center gap-2 text-[11px] text-slate-400 max-w-xs">
          <Info className="w-3.5 h-3.5 shrink-0" />
          Predecessores usam a sintaxe do Artia (ex.: <code className="text-slate-600 font-mono">A2</code>, <code className="text-slate-600 font-mono">A2fs</code>).
        </div>
      </div>

      {/* Barra de ações estruturais — agem sobre o item selecionado (círculo
          cinza na frente da linha); "Voltar" desfaz a última alteração feita
          (igual ao Ctrl+Z do Excel). */}
      <div className="px-5 py-2 border-b border-slate-200 bg-white flex items-center gap-2">
        <ToolbarBtn wide disabled={!hasUndo} onClick={handleUndo} title="Voltar — desfaz a última alteração feita">
          <Undo2 className="w-3.5 h-3.5" /> Voltar
        </ToolbarBtn>
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mr-1">
          {selectedItem ? <>Selecionado: <span className="text-slate-600 normal-case">{selectedItem.title}</span></> : "Selecione uma linha para mover/indentar"}
        </span>
        <ToolbarBtn disabled={!selectedItem || sort.column !== null} onClick={() => selectedItem && handleMove(selectedItem, -1)} title={sort.column ? "Limpe a ordenação da coluna para reestruturar manualmente" : "Mover para cima"}><ArrowUp className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn disabled={!selectedItem || sort.column !== null} onClick={() => selectedItem && handleMove(selectedItem, 1)} title={sort.column ? "Limpe a ordenação da coluna para reestruturar manualmente" : "Mover para baixo"}><ArrowDown className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn disabled={!selectedItem || sort.column !== null} onClick={() => selectedItem && handleIndent(selectedItem)} title={sort.column ? "Limpe a ordenação da coluna para reestruturar manualmente" : "Indentar (virar filho do anterior)"}><IndentIncrease className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn disabled={!selectedItem || selectedItem.parentId === null || sort.column !== null} onClick={() => selectedItem && handleOutdent(selectedItem)} title={sort.column ? "Limpe a ordenação da coluna para reestruturar manualmente" : "Promover (sair do grupo)"}><IndentDecrease className="w-3.5 h-3.5" /></ToolbarBtn>
        {sort.column && (
          <button onClick={() => setSort({ column: null, dir: "asc" })} className="text-[10px] font-bold text-slate-400 hover:text-[#7B2FBE] ml-1">
            Limpar ordenação
          </button>
        )}
      </div>

      {/* Column headers — clique ordena os irmãos daquele nível pela coluna */}
      <div className="flex items-center px-4 py-2 border-b border-slate-200 bg-slate-50 text-[9px] font-black uppercase tracking-widest text-slate-400">
        <div style={{ width: 92 }} />
        <SortableHeader width={300} label="Atividade" column="title" sort={sort} onSort={toggleSort} />
        <SortableHeader width={60} center label="Duração" column="duracao" sort={sort} onSort={toggleSort} />
        <SortableHeader width={110} center label="Início" column="inicio" sort={sort} onSort={toggleSort} />
        <SortableHeader width={90} center label="Término" column="termino" sort={sort} onSort={toggleSort} />
        <SortableHeader width={70} center label="%" column="pct" sort={sort} onSort={toggleSort} />
        <div style={{ width: 150 }}>Predecessores</div>
        <SortableHeader width={80} center label="Modo" column="modo" sort={sort} onSort={toggleSort} />
        <div className="flex-1">Barra</div>
      </div>

      {/* Rows */}
      <div className={`bg-white ${pending ? "opacity-60 pointer-events-none transition-opacity" : "transition-opacity"}`}>
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
            onAddSibling={handleAddSibling}
            onEditTitle={handleEditTitle}
            selectedId={selectedId}
            onSelect={setSelectedId}
            sort={sort}
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
      <div className="px-4 py-3 border-t border-slate-200 bg-white">
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
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#7B2FBE] hover:text-[#9333EA] transition-colors"
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
      <p className="text-lg font-black" style={{ color: color ?? "#1E293B" }}>{value}</p>
      <p className="text-[9px] uppercase tracking-widest text-slate-400 font-bold">{label}</p>
    </div>
  )
}

// Início/Término do projeto — editável desde a abertura do cronograma
// (Project.expectedStart/expectedEnd), igual ao "Data de início/término"
// do topo do Artia. Independe de já haver alguma atividade lançada.
function EditableDateStat({ label, value, onChange }: {
  label: string; value: string | null; onChange: (v: string | null) => void
}) {
  return (
    <div>
      <input
        key={`projdate:${label}:${value}`}
        type="date"
        defaultValue={value ?? ""}
        onBlur={(e) => {
          const v = e.target.value || null
          if (v !== value) onChange(v)
        }}
        className="text-lg font-black bg-transparent outline-none rounded -mx-1 px-1 focus:bg-violet-50"
        style={{ color: "#1E293B" }}
      />
      <p className="text-[9px] uppercase tracking-widest text-slate-400 font-bold">{label}</p>
    </div>
  )
}

function ToolbarBtn({ children, onClick, title, disabled, wide }: {
  children: React.ReactNode; onClick: () => void; title: string; disabled?: boolean; wide?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`${wide ? "px-2.5 gap-1.5 text-xs font-bold" : "w-7 justify-center"} h-7 rounded-lg flex items-center border border-slate-200 text-slate-500 bg-white transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white`}
    >
      {children}
    </button>
  )
}

// Cabeçalho de coluna clicável — ordena os irmãos do nível pelo valor da
// coluna (não mexe na hierarquia nem no `order` persistido no banco).
function SortableHeader({ label, column, sort, onSort, width, center }: {
  label: string; column: Exclude<SortColumn, null>; sort: SortState; onSort: (c: Exclude<SortColumn, null>) => void
  width: number; center?: boolean
}) {
  const active = sort.column === column
  return (
    <button
      onClick={() => onSort(column)}
      style={{ width }}
      className={`group flex items-center gap-0.5 hover:text-slate-600 transition-colors ${center ? "justify-center" : ""} ${active ? "text-[#7B2FBE]" : ""}`}
    >
      {label}
      {active && (sort.dir === "asc" ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />)}
      {!active && <ArrowUpDown className="w-2.5 h-2.5 opacity-0 group-hover:opacity-40" />}
    </button>
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
        className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-sm text-slate-700 outline-none focus:border-[#7B2FBE] focus:ring-2 focus:ring-[#7B2FBE]/15 w-64"
      />
      <button onClick={onSubmit} className="text-xs font-bold text-[#7B2FBE] hover:text-[#9333EA]">Adicionar</button>
      <button onClick={onCancel} className="text-xs text-slate-400 hover:text-slate-600">Cancelar</button>
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
  onAddSibling: (item: ItemV2) => void
  onEditTitle: (id: string) => void
  selectedId: string | null
  onSelect: (id: string | null) => void
  sort: SortState
  range: { min: string; max: string } | null
  conflictByItem: Map<string, ScheduleV2Payload["conflicts"][number]>
  addingUnder: string | null
  setAddingUnder: (id: string | null) => void
  newTitle: string
  setNewTitle: (v: string) => void
  onCreate: (parentId: string | null) => void
}

function RowGroup({ item, depth, ...h }: { item: ItemV2; depth: number } & RowHandlers) {
  const kids = sortedSiblingsOf(h.data.items, item.id, h.sort)
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
        <div className="py-1.5" style={{ paddingLeft: 92 + 16 + (depth + 1) * 20 }}>
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
            style={{ paddingLeft: 92 + 16 + (depth + 1) * 20 }}
            className="flex items-center gap-1 py-1 text-[10px] font-bold text-slate-400 hover:text-[#7B2FBE] transition-colors"
          >
            <Plus className="w-3 h-3" /> Sub-item
          </button>
        )
      )}
    </div>
  )
}

function Row({ item, depth, hasChildren, isOpen, ...h }: { item: ItemV2; depth: number; hasChildren: boolean; isOpen: boolean } & RowHandlers) {
  const conflict = h.conflictByItem.get(item.id)
  // Regra §3.7 (CLAUDE.md): grupo não tem data própria, e um item automático
  // com predecessor tem a data ditada pelo vínculo — em ambos os casos o
  // campo fica digitável (por decisão: melhor deixar tentar e o motor
  // descartar/recalcular do que travar o campo), mas o valor sempre volta a
  // ser o calculado assim que a tela atualizar após salvar.

  const selected = h.selectedId === item.id

  return (
    <div
      className="flex items-center px-4 py-1.5 border-b border-slate-100 hover:bg-slate-50 group"
      style={{ background: selected ? "rgba(123,47,190,0.05)" : conflict ? "rgba(245,158,11,0.06)" : undefined }}
    >
      {/* Gutter fixo (igual ao Artia): selecionar, excluir, adicionar, editar */}
      <div style={{ width: 92 }} className="flex items-center gap-1 shrink-0">
        <button onClick={() => h.onSelect(selected ? null : item.id)} title="Selecionar (para mover/indentar)">
          <Circle className={`w-3.5 h-3.5 transition-colors ${selected ? "text-[#7B2FBE] fill-[#7B2FBE]/25" : "text-slate-300 hover:text-slate-400"}`} />
        </button>
        <button onClick={() => h.onDelete(item.id)} title="Excluir">
          <CircleX className="w-3.5 h-3.5 text-red-300 hover:text-red-500 transition-colors" />
        </button>
        <button onClick={() => h.onAddSibling(item)} title="Adicionar atividade">
          <CirclePlus className="w-3.5 h-3.5 text-emerald-400 hover:text-emerald-600 transition-colors" />
        </button>
        {!hasChildren && (
          <button onClick={() => h.onEditTitle(item.id)} title="Editar título">
            <Pencil className="w-3 h-3 text-blue-300 hover:text-blue-500 transition-colors" />
          </button>
        )}
      </div>

      {/* Título + hierarquia */}
      <div className="flex items-center gap-1.5" style={{ width: 300, paddingLeft: depth * 20 }}>
        <button onClick={() => hasChildren && h.onToggle(item.id)} className="w-4 h-4 flex items-center justify-center shrink-0">
          {hasChildren
            ? (isOpen ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />)
            : item.duracaoDiasUteis === 0
              ? <Milestone className="w-3 h-3 text-amber-500" />
              : <span className="w-1 h-1 rounded-full bg-slate-300 mx-auto" />
          }
        </button>
        <span className="text-[9px] font-mono font-bold text-slate-400 shrink-0 w-8">{item.code}</span>
        <input
          id={`sv2-title-${item.id}`}
          key={`title:${item.id}:${item.title}`}
          defaultValue={item.title}
          onBlur={(e) => {
            const v = e.target.value.trim()
            if (v && v !== item.title) h.onUpdate(item.id, { title: v })
          }}
          className={`bg-transparent outline-none text-sm flex-1 min-w-0 truncate rounded px-1 -mx-1 focus:bg-violet-50 ${hasChildren ? "font-bold text-slate-800" : "text-slate-700"}`}
        />
        {conflict && (
          <span title={`Vínculo sugere ${fmtDateLong(conflict.suggestedInicio)} — item está em modo manual`}>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          </span>
        )}
      </div>

      {/* Duração */}
      <div style={{ width: 60 }} className="text-center">
        {!hasChildren ? (
          <input
            key={`dur:${item.id}:${item.duracaoDiasUteis}`}
            type="number" min={0}
            defaultValue={item.duracaoDiasUteis ?? ""}
            onBlur={(e) => {
              const v = e.target.value === "" ? null : parseInt(e.target.value, 10)
              if (v !== item.duracaoDiasUteis) h.onUpdate(item.id, { duracaoDiasUteis: v })
            }}
            className="w-10 text-center bg-transparent outline-none text-xs text-slate-700 rounded border-b border-transparent focus:border-[#7B2FBE] focus:bg-violet-50"
          />
        ) : <span className="text-[10px] text-slate-300">—</span>}
      </div>

      {/* Início */}
      <div style={{ width: 110 }} className="text-center">
        <input
          key={`inicio:${item.id}:${item.inicioEstimado}`}
          type="date"
          defaultValue={item.inicioEstimado ?? ""}
          title={
            hasChildren
              ? "Data de grupo — some as subatividades definem o período; um valor digitado aqui é descartado ao salvar"
              : item.schedulingMode === "auto" && hasPredecessor(item.id, h.data)
                ? "Data controlada pelo predecessor — um valor digitado aqui é descartado ao salvar, a menos que mude para Manual"
                : undefined
          }
          onBlur={(e) => {
            const v = e.target.value || null
            if (v !== item.inicioEstimado) h.onUpdate(item.id, { inicioEstimado: v })
          }}
          className="bg-transparent outline-none text-[10px] text-slate-700 w-full text-center rounded focus:bg-violet-50"
        />
      </div>

      {/* Término — editar aqui recalcula a duração (§3.3), igual a
          arrastar o fim da barra no Artia; não é uma data solta. */}
      <div style={{ width: 90 }} className="text-center">
        <input
          key={`termino:${item.id}:${item.terminoEstimado}`}
          type="date"
          defaultValue={item.terminoEstimado ?? ""}
          title={
            hasChildren
              ? "Data de grupo — as subatividades definem o período; um valor digitado aqui é descartado ao salvar"
              : "Editar aqui recalcula a duração (início fica fixo)"
          }
          onBlur={(e) => {
            const v = e.target.value || null
            if (v !== item.terminoEstimado) h.onUpdate(item.id, { terminoEstimado: v })
          }}
          className="bg-transparent outline-none text-[10px] text-slate-700 w-full text-center rounded focus:bg-violet-50"
        />
      </div>

      {/* % completo */}
      <div style={{ width: 70 }} className="text-center">
        {!hasChildren ? (
          <input
            key={`pct:${item.id}:${item.percentualCompleto}`}
            type="number" min={0} max={100}
            defaultValue={item.percentualCompleto}
            onBlur={(e) => {
              const v = Math.max(0, Math.min(100, parseInt(e.target.value || "0", 10)))
              if (v !== item.percentualCompleto) h.onUpdate(item.id, { percentualCompleto: v })
            }}
            className="w-10 text-center bg-transparent outline-none text-xs text-slate-700 rounded border-b border-transparent focus:border-[#7B2FBE] focus:bg-violet-50"
          />
        ) : <span className="text-xs font-bold text-[#7B2FBE]">{item.percentualCompleto}%</span>}
      </div>

      {/* Predecessores */}
      <div style={{ width: 150 }}>
        {!hasChildren && (
          <input
            key={`deps:${item.id}:${depsTextFor(item.id, h.data)}`}
            defaultValue={depsTextFor(item.id, h.data)}
            onBlur={(e) => {
              const v = e.target.value
              if (v !== depsTextFor(item.id, h.data)) h.onDeps(item.id, v)
            }}
            placeholder="Ex.: A2; A3ss+1"
            className="w-full bg-transparent outline-none text-[10px] font-mono text-slate-700 placeholder-slate-300 rounded border-b border-transparent focus:border-[#7B2FBE] focus:bg-violet-50"
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
              ? { background: "#FFFBEB", color: "#D97706", border: "1px solid #FDE68A" }
              : { background: "#F1F5F9", color: "#64748B", border: "1px solid #E2E8F0" }}
          >
            {item.schedulingMode === "manual" ? "Manual" : "Auto"}
          </button>
        )}
      </div>

      {/* Barra */}
      <div className="flex-1 pr-3">
        {h.range && item.inicioEstimado && item.terminoEstimado && (
          <div className="relative h-3 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="absolute top-0 h-full rounded-full"
              style={{
                left: `${pct(item.inicioEstimado, h.range)}%`,
                width: `${Math.max(1.5, pct(item.terminoEstimado, h.range) - pct(item.inicioEstimado, h.range))}%`,
                background: conflict ? "#F59E0B" : hasChildren ? "#94A3B8" : "linear-gradient(90deg,#7B2FBE,#2463FF)",
              }}
            />
          </div>
        )}
      </div>

    </div>
  )
}
