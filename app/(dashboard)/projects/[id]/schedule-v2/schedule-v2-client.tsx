"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import {
  createItemV2, updateItemV2, deleteItemV2, duplicateItemV2, reorderItemsV2, setDependenciesV2, getScheduleV2,
  hasUndoV2, hasRedoV2, undoLastChangeV2, redoLastChangeV2,
} from "@/lib/actions/schedule-v2"
import type { ScheduleV2Payload, ItemV2 } from "@/lib/actions/schedule-v2"
import { updateProjectDetails } from "@/lib/actions/projects"
import { fmtDateLong } from "@/lib/date-utils"
import {
  ChevronRight, ChevronDown, Plus, IndentIncrease, IndentDecrease,
  ArrowUp, ArrowDown, ArrowUpDown, AlertTriangle, Milestone, Info,
  Circle, CircleX, CirclePlus, Pencil, Undo2, Redo2, GripVertical, GripHorizontal,
} from "lucide-react"

// ─── Helpers de árvore ──────────────────────────────────────────────────────

function siblingsOf(items: ItemV2[], parentId: string | null): ItemV2[] {
  return items.filter((i) => i.parentId === parentId).sort((a, b) => a.order - b.order)
}

// true se `targetId` é o próprio `ofId` ou está dentro da subárvore dele —
// usado para impedir que um item vire filho de um descendente seu (ciclo).
function isSelfOrDescendant(items: ItemV2[], targetId: string, ofId: string): boolean {
  if (targetId === ofId) return true
  let cur = items.find((i) => i.id === targetId)
  while (cur?.parentId) {
    if (cur.parentId === ofId) return true
    cur = items.find((i) => i.id === cur!.parentId)
  }
  return false
}

// ─── Ordenação por coluna (só na exibição — não mexe no `order` persistido) ──

type SortColumn = ColKey | "title" | null
type SortState = { column: SortColumn; dir: "asc" | "desc" }

function sortValue(item: ItemV2, col: SortColumn): string | number {
  switch (col) {
    case "title": return item.title.toLowerCase()
    case "duracao": return item.duracaoDiasUteis ?? -1
    case "inicio": return item.inicioEstimado ?? ""
    case "termino": return item.terminoEstimado ?? ""
    case "pct": return item.percentualCompleto
    case "responsavel": return (item.responsavel ?? "").toLowerCase()
    case "status": return statusLabel(item.status).label
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

// ─── Status ─────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "A_INICIAR", label: "A iniciar", color: "#64748B", bg: "#F1F5F9" },
  { value: "EM_ANDAMENTO", label: "Em Andamento", color: "#2563EB", bg: "#EFF6FF" },
  { value: "CONCLUIDO", label: "Concluído", color: "#059669", bg: "#ECFDF5" },
  { value: "ATRASADO", label: "Atrasado", color: "#DC2626", bg: "#FEF2F2" },
] as const

function statusLabel(status: string) {
  if (status === "pendente") return STATUS_OPTIONS[0] // valor legado do default antigo
  return STATUS_OPTIONS.find((o) => o.value === status) ?? STATUS_OPTIONS[0]
}

// ─── Colunas configuráveis (redimensionar + reordenar, igual ao Excel) ──────
// "Atividade" (título+hierarquia) fica fixa à esquerda — todo o resto é
// livre para o usuário reordenar e redimensionar.

type ColKey = "duracao" | "inicio" | "termino" | "pct" | "predecessores" | "responsavel" | "status"

const COL_LABELS: Record<ColKey, string> = {
  duracao: "Duração", inicio: "Início", termino: "Término", pct: "%",
  predecessores: "Predecessores", responsavel: "Responsável", status: "Status",
}
const DEFAULT_COL_ORDER: ColKey[] = ["duracao", "inicio", "termino", "pct", "predecessores", "responsavel", "status"]
const DEFAULT_COL_WIDTHS: Record<ColKey, number> = {
  duracao: 70, inicio: 110, termino: 100, pct: 60, predecessores: 150, responsavel: 140, status: 130,
}
const COL_ALIGN: Record<ColKey, "center" | "left"> = {
  duracao: "center", inicio: "center", termino: "center", pct: "center",
  predecessores: "left", responsavel: "left", status: "left",
}
const DEFAULT_TITLE_WIDTH = 320
const GUTTER_WIDTH = 112

function colPrefsKey(projectId: string) { return `sv2-columns-${projectId}` }

// ─── Main ─────────────────────────────────────────────────────────────────

export function ScheduleV2Client({ projectId, initial, initialProjectDates }: {
  projectId: string
  initial: ScheduleV2Payload
  initialProjectDates: { expectedStart: string | null; expectedEnd: string | null }
}) {
  const [data, setData] = useState<ScheduleV2Payload>(initial)
  const [expanded, setExpanded] = useState<Set<string>>(new Set(initial.items.filter((i) => i.isGroup).map((i) => i.id)))
  const [pending, startTransition] = useTransition()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sort, setSort] = useState<SortState>({ column: null, dir: "asc" })
  const [projectDates, setProjectDates] = useState(initialProjectDates)
  const [hasUndo, setHasUndo] = useState(false)
  const [hasRedo, setHasRedo] = useState(false)

  // Layout de colunas (larguras + ordem) — preferência pessoal, salva no
  // navegador (não é dado do cronograma, é só a visão de quem está olhando).
  const [colWidths, setColWidths] = useState<Record<ColKey, number>>(DEFAULT_COL_WIDTHS)
  const [colOrder, setColOrder] = useState<ColKey[]>(DEFAULT_COL_ORDER)
  const [titleWidth, setTitleWidth] = useState(DEFAULT_TITLE_WIDTH)
  const [colsLoaded, setColsLoaded] = useState(false)
  const [dragCol, setDragCol] = useState<ColKey | null>(null)

  // Arrastar linha (encaixar antes/depois/dentro) — igual ao Artia.
  const [dragRowId, setDragRowId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; zone: "before" | "after" | "inside" } | null>(null)

  const conflictByItem = useMemo(() => new Map(data.conflicts.map((c) => [c.itemId, c])), [data.conflicts])

  useEffect(() => {
    hasUndoV2(projectId).then(setHasUndo).catch(() => {})
    hasRedoV2(projectId).then(setHasRedo).catch(() => {})
  }, [projectId])

  // Carrega preferências de coluna salvas (só no cliente — evita divergir da
  // renderização do servidor). Só grava de volta depois de já ter lido.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(colPrefsKey(projectId))
      if (raw) {
        const parsed = JSON.parse(raw) as { widths?: Partial<Record<ColKey, number>>; order?: ColKey[]; titleWidth?: number }
        if (parsed.widths) setColWidths((w) => ({ ...w, ...parsed.widths }))
        if (Array.isArray(parsed.order) && parsed.order.length === DEFAULT_COL_ORDER.length) setColOrder(parsed.order)
        if (typeof parsed.titleWidth === "number") setTitleWidth(parsed.titleWidth)
      }
    } catch { /* localStorage indisponível — segue com o padrão */ }
    setColsLoaded(true)
  }, [projectId])

  useEffect(() => {
    if (!colsLoaded) return
    try { localStorage.setItem(colPrefsKey(projectId), JSON.stringify({ widths: colWidths, order: colOrder, titleWidth })) } catch { /* noop */ }
  }, [colsLoaded, colWidths, colOrder, titleWidth, projectId])

  // `focusId`: depois de recarregar, foca e seleciona o título da linha nova
  // (criada, duplicada) para o usuário já poder renomear direto.
  function refresh(focusId?: string) {
    startTransition(async () => {
      const fresh = await getScheduleV2(projectId)
      setData(fresh)
      setHasUndo(true)
      setHasRedo(false)
      if (focusId) {
        requestAnimationFrame(() => {
          const el = document.getElementById(`sv2-title-${focusId}`) as HTMLInputElement | null
          el?.focus()
          el?.select()
        })
      }
    })
  }

  function handleUndo() {
    startTransition(async () => {
      const result = await undoLastChangeV2(projectId)
      if (result.ok) {
        const fresh = await getScheduleV2(projectId)
        setData(fresh)
        setHasRedo(true)
      }
      setHasUndo(false)
    })
  }

  function handleRedo() {
    startTransition(async () => {
      const result = await redoLastChangeV2(projectId)
      if (result.ok) {
        const fresh = await getScheduleV2(projectId)
        setData(fresh)
        setHasUndo(true)
      }
      setHasRedo(false)
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

  function handleColResize(col: ColKey, width: number) {
    setColWidths((prev) => ({ ...prev, [col]: width }))
  }

  function handleColDrop(targetCol: ColKey) {
    setColOrder((prev) => {
      if (!dragCol || dragCol === targetCol) return prev
      const next = prev.filter((c) => c !== dragCol)
      const idx = next.indexOf(targetCol)
      next.splice(idx, 0, dragCol)
      return next
    })
    setDragCol(null)
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
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

  // ── Menu do "+" da linha (igual ao Artia): duplicar, adicionar acima,
  //    adicionar como última filha — qualquer linha pode ganhar filhas,
  //    seja atividade, tarefa ou subtarefa. ─────────────────────────────

  function handleDuplicate(item: ItemV2) {
    startTransition(async () => {
      const result = await duplicateItemV2(item.id, projectId)
      refresh(result.newId)
    })
  }

  function handleAddAbove(item: ItemV2) {
    startTransition(async () => {
      const created = await createItemV2({ projectId, parentId: item.parentId, title: "Nova atividade" })
      const sibs = siblingsOf(data.items, item.parentId)
      const idx = sibs.findIndex((s) => s.id === item.id)
      const orderedIds = [...sibs.slice(0, idx).map((s) => s.id), created.id, ...sibs.slice(idx).map((s) => s.id)]
      await reorderItemsV2(projectId, orderedIds)
      refresh(created.id)
    })
  }

  function handleAddChild(item: ItemV2) {
    startTransition(async () => {
      const created = await createItemV2({ projectId, parentId: item.id, title: "Nova atividade" })
      setExpanded((prev) => new Set(prev).add(item.id))
      refresh(created.id)
    })
  }

  function handleAddRoot() {
    startTransition(async () => {
      const created = await createItemV2({ projectId, parentId: null, title: "Nova atividade" })
      refresh(created.id)
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

  // ── Arrastar linha para encaixar (antes/depois/dentro) — igual ao Artia ──

  function handleRowDragStart(id: string) {
    setDragRowId(id)
  }

  function handleRowDragOver(e: React.DragEvent, targetId: string) {
    if (!dragRowId || dragRowId === targetId || isSelfOrDescendant(data.items, targetId, dragRowId)) {
      setDropTarget(null)
      return
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const ratio = (e.clientY - rect.top) / rect.height
    const zone: "before" | "after" | "inside" = ratio < 0.28 ? "before" : ratio > 0.72 ? "after" : "inside"
    setDropTarget({ id: targetId, zone })
  }

  function handleRowDrop(targetId: string) {
    const sourceId = dragRowId
    const target = dropTarget?.id === targetId ? dropTarget : null
    setDragRowId(null)
    setDropTarget(null)
    if (!sourceId || !target) return
    if (isSelfOrDescendant(data.items, target.id, sourceId)) return

    startTransition(async () => {
      if (target.zone === "inside") {
        await updateItemV2(sourceId, projectId, { parentId: target.id })
        const kidsAfter = siblingsOf(
          data.items.map((i) => (i.id === sourceId ? { ...i, parentId: target.id } : i)),
          target.id
        )
        await reorderItemsV2(projectId, kidsAfter.map((k) => k.id))
        setExpanded((prev) => new Set(prev).add(target.id))
      } else {
        const targetItem = data.items.find((i) => i.id === target.id)
        const newParentId = targetItem ? targetItem.parentId : null
        await updateItemV2(sourceId, projectId, { parentId: newParentId })
        const projected = data.items
          .map((i) => (i.id === sourceId ? { ...i, parentId: newParentId } : i))
          .filter((i) => i.id !== sourceId)
        const sibs = siblingsOf(projected, newParentId)
        const idx = sibs.findIndex((s) => s.id === target.id)
        const insertAt = target.zone === "before" ? idx : idx + 1
        const finalIds = [...sibs.slice(0, insertAt).map((s) => s.id), sourceId, ...sibs.slice(insertAt).map((s) => s.id)]
        await reorderItemsV2(projectId, finalIds)
      }
      refresh()
    })
  }

  function handleRowDragEnd() {
    setDragRowId(null)
    setDropTarget(null)
  }

  const roots = sortedSiblingsOf(data.items, null, sort)
  const selectedItem = selectedId ? data.items.find((i) => i.id === selectedId) ?? null : null

  const rowHandlers: RowHandlers = {
    data, expanded, onToggle: toggle, onUpdate: handleUpdate, onDeps: handleDeps, onDelete: handleDelete,
    onDuplicate: handleDuplicate, onAddAbove: handleAddAbove, onAddChild: handleAddChild, onEditTitle: handleEditTitle,
    selectedId, onSelect: setSelectedId, sort, conflictByItem,
    colOrder, colWidths, titleWidth,
    dragRowId, dropTarget, onRowDragStart: handleRowDragStart, onRowDragOver: handleRowDragOver,
    onRowDrop: handleRowDrop, onRowDragEnd: handleRowDragEnd,
  }

  return (
    <div className="min-h-full text-slate-700" style={{ background: "#F8F9FC" }}>
      {/* Header stats — Início/Término do projeto ficam editáveis desde a
          abertura do cronograma (igual ao "Data de início/término" do
          Artia), independente de já existir alguma atividade lançada. */}
      <div className="px-5 py-4 border-b border-slate-200 bg-white flex items-center gap-6 flex-wrap">
        <Stat label="Itens" value={data.items.length} />
        <EditableDateStat label="Início" value={projectDates.expectedStart} onChange={(v) => handleProjectDate("expectedStart", v)} />
        <EditableDateStat label="Término" value={projectDates.expectedEnd} onChange={(v) => handleProjectDate("expectedEnd", v)} />
        <Stat label="Conflitos" value={data.conflicts.length} color={data.conflicts.length > 0 ? "#D97706" : undefined} />
        <div className="ml-auto flex items-center gap-2 text-[11px] text-slate-400 max-w-xs">
          <Info className="w-3.5 h-3.5 shrink-0" />
          Predecessores usam a sintaxe do Artia (ex.: <code className="text-slate-600 font-mono">A2</code>, <code className="text-slate-600 font-mono">A2fs</code>).
        </div>
      </div>

      {/* Barra de ações estruturais — agem sobre o item selecionado (círculo
          cinza na frente da linha); "Voltar"/"Avançar" desfazem/refazem a
          última alteração (igual Ctrl+Z / Ctrl+Y do Excel). Arrastar pela
          alcinha (⠿) também reestrutura, direto na linha — veja abaixo. */}
      <div className="px-5 py-2 border-b border-slate-200 bg-white flex items-center gap-2">
        <ToolbarBtn wide disabled={!hasUndo} onClick={handleUndo} title="Voltar — desfaz a última alteração feita">
          <Undo2 className="w-3.5 h-3.5" /> Voltar
        </ToolbarBtn>
        <ToolbarBtn wide disabled={!hasRedo} onClick={handleRedo} title="Avançar — refaz a última alteração desfeita">
          <Redo2 className="w-3.5 h-3.5" /> Avançar
        </ToolbarBtn>
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mr-1">
          {selectedItem ? <>Selecionado: <span className="text-slate-600 normal-case">{selectedItem.title}</span></> : "Selecione uma linha (círculo) ou arraste pela alcinha ⠿"}
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

      {/* Column headers — clique ordena; arraste a mãozinha (✥) para
          reordenar a coluna; arraste a borda direita para redimensionar. */}
      <div className="flex items-center px-4 py-2 border-b border-slate-200 bg-slate-50 text-[9px] font-black uppercase tracking-widest text-slate-400">
        <div style={{ width: GUTTER_WIDTH }} />
        <div className="relative" style={{ width: titleWidth }}>
          <SortableHeaderLabel label="Atividade" column="title" sort={sort} onSort={toggleSort} />
          <ColResizeHandle width={titleWidth} onResize={(w) => setTitleWidth(w)} />
        </div>
        {colOrder.map((col) => (
          <div
            key={col}
            className="relative flex items-center gap-1 group/col"
            style={{ width: colWidths[col] }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); handleColDrop(col) }}
          >
            <span
              draggable
              onDragStart={() => setDragCol(col)}
              onDragEnd={() => setDragCol(null)}
              title="Arrastar para reordenar a coluna"
              className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 opacity-0 group-hover/col:opacity-100 transition-opacity shrink-0"
            >
              <GripHorizontal className="w-3 h-3" />
            </span>
            <SortableHeaderLabel
              label={COL_LABELS[col]}
              column={col}
              sort={sort}
              onSort={toggleSort}
              center={COL_ALIGN[col] === "center"}
            />
            <ColResizeHandle width={colWidths[col]} onResize={(w) => handleColResize(col, w)} />
          </div>
        ))}
      </div>

      {/* Rows */}
      <div className={`bg-white ${pending ? "opacity-60 pointer-events-none transition-opacity" : "transition-opacity"}`}>
        {roots.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm font-semibold text-slate-400 mb-3">Nenhuma atividade ainda</p>
            <button
              onClick={handleAddRoot}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #7B2FBE, #9333EA)" }}
            >
              <Plus className="w-4 h-4" /> Adicionar primeira atividade
            </button>
          </div>
        ) : (
          roots.map((item) => <RowGroup key={item.id} item={item} depth={0} {...rowHandlers} />)
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

// Rótulo de cabeçalho clicável — ordena os irmãos do nível pelo valor da
// coluna (não mexe na hierarquia nem no `order` persistido no banco).
function SortableHeaderLabel({ label, column, sort, onSort, center }: {
  label: string; column: Exclude<SortColumn, null>; sort: SortState; onSort: (c: Exclude<SortColumn, null>) => void
  center?: boolean
}) {
  const active = sort.column === column
  return (
    <button
      onClick={() => onSort(column)}
      className={`group flex items-center gap-0.5 hover:text-slate-600 transition-colors flex-1 min-w-0 ${center ? "justify-center" : ""} ${active ? "text-[#7B2FBE]" : ""}`}
    >
      <span className="truncate">{label}</span>
      {active && (sort.dir === "asc" ? <ArrowUp className="w-2.5 h-2.5 shrink-0" /> : <ArrowDown className="w-2.5 h-2.5 shrink-0" />)}
      {!active && <ArrowUpDown className="w-2.5 h-2.5 shrink-0 opacity-0 group-hover:opacity-40" />}
    </button>
  )
}

// Alça de redimensionar coluna (arrastar a borda direita), igual ao Excel.
function ColResizeHandle({ width, onResize }: { width: number; onResize: (w: number) => void }) {
  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startWidth = width
    function onMove(ev: MouseEvent) {
      onResize(Math.max(40, startWidth + (ev.clientX - startX)))
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }
  return (
    <div
      onMouseDown={onMouseDown}
      title="Arrastar para redimensionar"
      className="absolute -right-1 top-0 h-full w-2 cursor-col-resize z-10 group/resize flex justify-center"
    >
      <div className="w-px h-full bg-transparent group-hover/resize:bg-[#7B2FBE]/50 transition-colors" />
    </div>
  )
}

// Menu do botão "+" da linha — igual ao Artia: duplicar, adicionar acima,
// adicionar como última filha (qualquer linha pode virar grupo).
function AddMenuButton({ item, onDuplicate, onAddAbove, onAddChild }: {
  item: ItemV2
  onDuplicate: (item: ItemV2) => void
  onAddAbove: (item: ItemV2) => void
  onAddChild: (item: ItemV2) => void
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
            <MenuItem onClick={() => { setOpen(false); onDuplicate(item) }}>Duplicar linha</MenuItem>
            <div className="h-px bg-slate-100 my-1 mx-2" />
            <MenuItem onClick={() => { setOpen(false); onAddAbove(item) }}>Adicionar nova linha acima</MenuItem>
            <div className="h-px bg-slate-100 my-1 mx-2" />
            <MenuItem onClick={() => { setOpen(false); onAddChild(item) }}>Adicionar nova linha como última filha</MenuItem>
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

// ─── Row + recursive children ────────────────────────────────────────────────

type RowHandlers = {
  data: ScheduleV2Payload
  expanded: Set<string>
  onToggle: (id: string) => void
  onUpdate: (id: string, patch: Parameters<typeof updateItemV2>[2]) => void
  onDeps: (id: string, raw: string) => void
  onDelete: (id: string) => void
  onDuplicate: (item: ItemV2) => void
  onAddAbove: (item: ItemV2) => void
  onAddChild: (item: ItemV2) => void
  onEditTitle: (id: string) => void
  selectedId: string | null
  onSelect: (id: string | null) => void
  sort: SortState
  conflictByItem: Map<string, ScheduleV2Payload["conflicts"][number]>
  colOrder: ColKey[]
  colWidths: Record<ColKey, number>
  titleWidth: number
  dragRowId: string | null
  dropTarget: { id: string; zone: "before" | "after" | "inside" } | null
  onRowDragStart: (id: string) => void
  onRowDragOver: (e: React.DragEvent, targetId: string) => void
  onRowDrop: (targetId: string) => void
  onRowDragEnd: () => void
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
    </div>
  )
}

function Row({ item, depth, hasChildren, isOpen, ...h }: { item: ItemV2; depth: number; hasChildren: boolean; isOpen: boolean } & RowHandlers) {
  const conflict = h.conflictByItem.get(item.id)
  const selected = h.selectedId === item.id
  const isDragging = h.dragRowId === item.id
  const dropHere = h.dropTarget?.id === item.id ? h.dropTarget.zone : null

  const rowBg = dropHere === "inside"
    ? "rgba(123,47,190,0.10)"
    : selected ? "rgba(123,47,190,0.05)" : conflict ? "rgba(245,158,11,0.06)" : undefined

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); h.onRowDragOver(e, item.id) }}
      onDrop={(e) => { e.preventDefault(); h.onRowDrop(item.id) }}
      onDragEnd={h.onRowDragEnd}
      className="flex items-center px-4 py-1.5 border-b border-slate-100 hover:bg-slate-50 group transition-colors"
      style={{
        background: rowBg,
        opacity: isDragging ? 0.4 : 1,
        borderTop: dropHere === "before" ? "2px solid #7B2FBE" : "2px solid transparent",
        borderBottom: dropHere === "after" ? "2px solid #7B2FBE" : undefined,
        outline: dropHere === "inside" ? "2px dashed #7B2FBE" : undefined,
        outlineOffset: dropHere === "inside" ? "-2px" : undefined,
      }}
    >
      {/* Gutter fixo (igual ao Artia): arrastar, selecionar, excluir, +, editar */}
      <div style={{ width: GUTTER_WIDTH }} className="flex items-center gap-1 shrink-0">
        <span
          draggable
          onDragStart={(e) => { e.stopPropagation(); h.onRowDragStart(item.id) }}
          onDragEnd={h.onRowDragEnd}
          title="Arrastar para mover, indentar ou encaixar em outra atividade"
          className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 transition-colors"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </span>
        <button onClick={() => h.onSelect(selected ? null : item.id)} title="Selecionar (para mover/indentar)">
          <Circle className={`w-3.5 h-3.5 transition-colors ${selected ? "text-[#7B2FBE] fill-[#7B2FBE]/25" : "text-slate-300 hover:text-slate-400"}`} />
        </button>
        <button onClick={() => h.onDelete(item.id)} title="Excluir">
          <CircleX className="w-3.5 h-3.5 text-red-300 hover:text-red-500 transition-colors" />
        </button>
        <AddMenuButton item={item} onDuplicate={h.onDuplicate} onAddAbove={h.onAddAbove} onAddChild={h.onAddChild} />
        {!hasChildren && (
          <button onClick={() => h.onEditTitle(item.id)} title="Editar título">
            <Pencil className="w-3 h-3 text-blue-300 hover:text-blue-500 transition-colors" />
          </button>
        )}
      </div>

      {/* Título + hierarquia (coluna fixa) */}
      <div className="flex items-center gap-1.5" style={{ width: h.titleWidth, paddingLeft: depth * 20 }}>
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

      {/* Colunas configuráveis (ordem e largura vêm do estado do cliente) */}
      {h.colOrder.map((col) => (
        <div key={col} style={{ width: h.colWidths[col] }} className={COL_ALIGN[col] === "center" ? "text-center" : ""}>
          {renderCell(col, item, hasChildren, h)}
        </div>
      ))}
    </div>
  )
}

// Conteúdo de cada coluna configurável — separado da estrutura da linha para
// poder ser reordenado livremente (h.colOrder) sem duplicar JSX.
function renderCell(col: ColKey, item: ItemV2, hasChildren: boolean, h: RowHandlers): React.ReactNode {
  switch (col) {
    case "duracao":
      return !hasChildren ? (
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
      ) : <span className="text-[10px] text-slate-300">—</span>

    case "inicio":
      return (
        <input
          key={`inicio:${item.id}:${item.inicioEstimado}`}
          type="date"
          defaultValue={item.inicioEstimado ?? ""}
          title={
            hasChildren
              ? "Data de grupo — as subatividades definem o período; um valor digitado aqui é descartado ao salvar"
              : item.schedulingMode === "auto" && hasPredecessor(item.id, h.data)
                ? "Data controlada pelo predecessor — um valor digitado aqui é descartado ao salvar"
                : undefined
          }
          onBlur={(e) => {
            const v = e.target.value || null
            if (v !== item.inicioEstimado) h.onUpdate(item.id, { inicioEstimado: v })
          }}
          className="bg-transparent outline-none text-[10px] text-slate-700 w-full text-center rounded focus:bg-violet-50"
        />
      )

    case "termino":
      return (
        <input
          key={`termino:${item.id}:${item.terminoEstimado}`}
          type="date"
          defaultValue={item.terminoEstimado ?? ""}
          title={hasChildren ? "Data de grupo — as subatividades definem o período; um valor digitado aqui é descartado ao salvar" : "Editar aqui recalcula a duração (início fica fixo)"}
          onBlur={(e) => {
            const v = e.target.value || null
            if (v !== item.terminoEstimado) h.onUpdate(item.id, { terminoEstimado: v })
          }}
          className="bg-transparent outline-none text-[10px] text-slate-700 w-full text-center rounded focus:bg-violet-50"
        />
      )

    case "pct":
      return !hasChildren ? (
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
      ) : <span className="text-xs font-bold text-[#7B2FBE]">{item.percentualCompleto}%</span>

    case "predecessores":
      return !hasChildren ? (
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
      ) : null

    case "responsavel":
      return (
        <input
          key={`resp:${item.id}:${item.responsavel}`}
          defaultValue={item.responsavel ?? ""}
          onBlur={(e) => {
            const v = e.target.value.trim() || null
            if (v !== item.responsavel) h.onUpdate(item.id, { responsavel: v })
          }}
          placeholder="Sem responsável"
          className="w-full bg-transparent outline-none text-xs text-slate-700 placeholder-slate-300 rounded border-b border-transparent focus:border-[#7B2FBE] focus:bg-violet-50"
        />
      )

    case "status": {
      const st = statusLabel(item.status)
      return (
        <select
          value={st.value}
          onChange={(e) => h.onUpdate(item.id, { status: e.target.value })}
          className="text-[10px] font-bold px-1.5 py-0.5 rounded-full outline-none cursor-pointer appearance-none text-center"
          style={{ background: st.bg, color: st.color, border: `1px solid ${st.color}33` }}
        >
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )
    }

    default:
      return null
  }
}
