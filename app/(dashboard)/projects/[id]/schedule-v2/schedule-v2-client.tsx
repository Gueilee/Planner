"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import {
  createItemV2, updateItemV2, deleteItemV2, duplicateItemV2, reorderItemsV2, setDependenciesV2, getScheduleV2,
  hasUndoV2, hasRedoV2, undoLastChangeV2, redoLastChangeV2, applyTemplateV2, getChangeLogV2,
} from "@/lib/actions/schedule-v2"
import type { ScheduleV2Payload, ItemV2, ChangeLogEntryV2 } from "@/lib/actions/schedule-v2"
import { computeProjectProgress } from "@/lib/utils/project-progress"
import { computeExpectedPct, computeScheduleStatus, DEFAULT_RISK_THRESHOLD_PCT, type ScheduleStatus } from "@/lib/utils/schedule-status"
import { exportScheduleToExcel } from "@/lib/export-schedule"
import { getTemplates } from "@/lib/actions/templates"
import type { Template } from "@/lib/actions/templates"
import { createBaselineForProject, getLatestBaselineByItem } from "@/lib/actions/baseline"
import { getOrCreatePublicScheduleToken, revokePublicScheduleToken } from "@/lib/actions/public-links"
import { fmtDateLong, isValidDateStr } from "@/lib/date-utils"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  ChevronRight, ChevronDown, Plus, IndentIncrease, IndentDecrease,
  ArrowUp, ArrowDown, ArrowUpDown, AlertTriangle, Milestone,
  Circle, CircleX, CirclePlus, Pencil, Undo2, Redo2, GripVertical, GripHorizontal, LayoutTemplate, FileSpreadsheet, BookmarkPlus, History,
  Link2, Copy, Check, X, Star,
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

function sortValue(item: ItemV2, col: SortColumn, membersById?: Map<string, string>): string | number {
  switch (col) {
    case "title": return item.title.toLowerCase()
    case "duracao": return item.duracaoDiasUteis ?? -1
    case "inicio": return item.inicioEstimado ?? ""
    case "termino": return item.terminoEstimado ?? ""
    case "inicioReal": return item.inicioReal ?? ""
    case "terminoReal": return item.terminoReal ?? ""
    case "pctEstimado": return computeExpectedPct(
      item.inicioEstimado ? new Date(`${item.inicioEstimado}T00:00:00.000Z`) : null,
      item.terminoEstimado ? new Date(`${item.terminoEstimado}T00:00:00.000Z`) : null,
    ) ?? -1
    case "pct": return item.percentualCompleto
    case "responsavel": return ((item.responsavelId ? membersById?.get(item.responsavelId) : item.responsavelNome) ?? "").toLowerCase()
    case "status": return statusLabel(item.status).label
    default: return 0
  }
}

// Ordena os irmãos de um mesmo pai pelo valor da coluna ativa — a hierarquia
// (quem é filho de quem) nunca muda, só a sequência dentro de cada nível.
function sortedSiblingsOf(items: ItemV2[], parentId: string | null, sort: SortState, membersById?: Map<string, string>): ItemV2[] {
  const base = siblingsOf(items, parentId)
  if (!sort.column) return base
  const factor = sort.dir === "asc" ? 1 : -1
  const col = sort.column
  return [...base].sort((a, b) => {
    const va = sortValue(a, col, membersById)
    const vb = sortValue(b, col, membersById)
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

// Faixa de datas aceitável nos campos de data — o <input type="date"> do
// navegador deixa digitar mais de 4 dígitos no ano (ex.: "092026"), o que
// gera um valor que corrompe o registro e derruba a página inteira ao
// formatar essa data (RangeError). min/max ajudam o seletor nativo; a
// validação real é feita no blur, revertendo o campo se o valor for
// inválido, antes mesmo de chamar o servidor.
const DATE_MIN = "1900-01-01"
const DATE_MAX = "2100-12-31"

function isSaneDateInput(raw: string): boolean {
  if (raw === "") return true // campo vazio = limpar a data, sempre válido
  return isValidDateStr(raw) && raw >= DATE_MIN && raw <= DATE_MAX
}

// ─── Status ─────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "A_INICIAR", label: "A iniciar", color: "#64748B", bg: "#F1F5F9" },
  { value: "EM_ANDAMENTO", label: "Em Andamento", color: "#2563EB", bg: "#EFF6FF" },
  { value: "VALIDACAO", label: "Em Validação", color: "#7C3AED", bg: "#F5F3FF" },
  { value: "CONCLUIDO", label: "Concluído", color: "#059669", bg: "#ECFDF5" },
  { value: "PAUSADO", label: "Pausado", color: "#D97706", bg: "#FFFBEB" },
  { value: "ATRASADO", label: "Atrasado", color: "#DC2626", bg: "#FEF2F2" },
] as const

// Real vs. esperado (comparação do cabeçalho) — mesmas 3 faixas usadas em
// Analytics/Status Report (lib/utils/schedule-status.ts).
const SCHEDULE_STATUS_STYLE: Record<ScheduleStatus, { label: string; color: string; bg: string }> = {
  ON_TIME: { label: "No Prazo", color: "#059669", bg: "#ECFDF5" },
  AT_RISK: { label: "Em Risco", color: "#D97706", bg: "#FFFBEB" },
  DELAYED: { label: "Atrasado", color: "#DC2626", bg: "#FEF2F2" },
  ND: { label: "Sem datas", color: "#94A3B8", bg: "#F1F5F9" },
}

function statusLabel(status: string) {
  if (status === "pendente") return STATUS_OPTIONS[0] // valor legado do default antigo
  return STATUS_OPTIONS.find((o) => o.value === status) ?? STATUS_OPTIONS[0]
}

// ─── Colunas configuráveis (redimensionar + reordenar, igual ao Excel) ──────
// "Atividade" (título+hierarquia) fica fixa à esquerda — todo o resto é
// livre para o usuário reordenar e redimensionar.

type ColKey = "duracao" | "inicio" | "termino" | "inicioReal" | "terminoReal" | "baselineInicio" | "baselineTermino" | "pctEstimado" | "pct" | "predecessores" | "restricao" | "responsavel" | "participantes" | "status"

const COL_LABELS: Record<ColKey, string> = {
  duracao: "Duração", inicio: "Início", termino: "Término",
  inicioReal: "Início Real", terminoReal: "Término Real",
  // Datas congeladas na última linha de base salva (botão "Salvar Linha de
  // Base" na barra de ferramentas) — somente leitura, pra comparar contra
  // o planejado atual sem trocar de tela (só a Curva S mostrava isso antes,
  // de forma agregada).
  baselineInicio: "Início Base", baselineTermino: "Término Base",
  // "% Estimado" (quanto já deveria ter avançado hoje, calculado a partir do
  // período planejado) ao lado de "% Real" (o que foi digitado de verdade) —
  // pedido explícito: os dois lado a lado pra comparar.
  pctEstimado: "% Estimado", pct: "% Real",
  predecessores: "Predecessores",
  // Restrição de data — só "não iniciar antes de" está implementado (ver
  // scheduler.ts); o campo já existia gravado no banco, mas o motor nunca
  // lia e não havia como editar (a causa real da "regra do predecessor por
  // data não funciona").
  restricao: "Restrição",
  responsavel: "Responsável",
  // Além do responsável principal: outras pessoas ligadas à atividade
  // ("participantes"/"informados") — texto livre, vários nomes por vírgula.
  participantes: "Participantes", status: "Status",
}
const DEFAULT_COL_ORDER: ColKey[] = ["duracao", "inicio", "termino", "inicioReal", "terminoReal", "baselineInicio", "baselineTermino", "pctEstimado", "pct", "predecessores", "restricao", "responsavel", "participantes", "status"]
const DEFAULT_COL_WIDTHS: Record<ColKey, number> = {
  duracao: 70, inicio: 110, termino: 100, inicioReal: 110, terminoReal: 110, baselineInicio: 100, baselineTermino: 100, pctEstimado: 70, pct: 60, predecessores: 150, restricao: 150, responsavel: 140, participantes: 160, status: 130,
}
const COL_ALIGN: Record<ColKey, "center" | "left"> = {
  duracao: "center", inicio: "center", termino: "center", inicioReal: "center", terminoReal: "center",
  baselineInicio: "center", baselineTermino: "center", pctEstimado: "center", pct: "center",
  predecessores: "left", restricao: "left", responsavel: "left", participantes: "left", status: "left",
}
const DEFAULT_TITLE_WIDTH = 320
const GUTTER_WIDTH = 112

function colPrefsKey(projectId: string) { return `sv2-columns-${projectId}` }

// ─── Main ─────────────────────────────────────────────────────────────────

export function ScheduleV2Client({ projectId, projectTitle, initial, projectPlannedDates, members, riskThresholdPct = DEFAULT_RISK_THRESHOLD_PCT, initialBaselineByItem = {}, initialPublicScheduleToken = null }: {
  projectId: string
  projectTitle: string
  initial: ScheduleV2Payload
  // Datas "planejadas" do projeto (Project.expectedStart/expectedEnd) —
  // linha de base oficial, editada na tela de detalhe do projeto, usada
  // só para calcular o progresso ESPERADO (mesma base do Kanban/Status
  // Report). O início/término exibidos nesta tela vêm do cronograma em si
  // (ver projectStartDate/projectEndDate abaixo) — não deste prop.
  projectPlannedDates: { expectedStart: string | null; expectedEnd: string | null }
  members: { id: string; name: string }[]
  riskThresholdPct?: number
  // Datas congeladas na última linha de base (ver lib/actions/baseline.ts),
  // indexadas por ScheduleV2Item.id — colunas "Início Base"/"Término Base".
  initialBaselineByItem?: Record<string, { plannedStart: string | null; plannedEnd: string | null }>
  // Token do link público (Project.publicScheduleToken) — null = nenhum
  // link ativo ainda.
  initialPublicScheduleToken?: string | null
}) {
  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members])
  const [data, setData] = useState<ScheduleV2Payload>(initial)
  const [expanded, setExpanded] = useState<Set<string>>(new Set(initial.items.filter((i) => i.isGroup).map((i) => i.id)))
  const [pending, startTransition] = useTransition()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sort, setSort] = useState<SortState>({ column: null, dir: "asc" })
  const [hasUndo, setHasUndo] = useState(false)
  const [hasRedo, setHasRedo] = useState(false)

  // "Aplicar modelo" — reaproveita os modelos de cronograma já cadastrados
  // (/templates), mas cria a árvore direto no motor v2 (dias úteis reais,
  // não addDays corrido — ver applyTemplateV2 em lib/actions/schedule-v2.ts).
  const [templates, setTemplates] = useState<Template[]>([])
  const [tplModalOpen, setTplModalOpen] = useState(false)
  const [tplSelected, setTplSelected] = useState<string>("")
  const [tplStartDate, setTplStartDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [exporting, setExporting] = useState(false)

  // Linha de base — "Salvar Linha de Base" congela início/término
  // planejados de hoje; as colunas Início/Término Base mostram a última
  // salva, pra comparar contra o planejado atual sem trocar de tela.
  const [baselineByItem, setBaselineByItem] = useState(initialBaselineByItem)
  const [savingBaseline, setSavingBaseline] = useState(false)
  const [baselineMsg, setBaselineMsg] = useState<string | null>(null)

  // Histórico de alterações — "quem mudou o quê, quando" (lib/actions/
  // schedule-v2.ts::getChangeLogV2), carregado sob demanda ao abrir o modal.
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyEntries, setHistoryEntries] = useState<ChangeLogEntryV2[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Link público (token permanente) — lib/actions/public-links.ts. Modal
  // só abre depois do token existir (gera na hora se ainda não tiver um).
  const [publicToken, setPublicToken] = useState(initialPublicScheduleToken)
  const [publicLinkOpen, setPublicLinkOpen] = useState(false)
  const [publicLinkLoading, setPublicLinkLoading] = useState(false)
  const [copied, setCopied] = useState(false)

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

  // Progresso do projeto — mesma função canônica usada em Analytics,
  // Status Report, Dashboard etc. (lib/utils/project-progress.ts), para
  // nunca divergir do que já é mostrado nas outras telas.
  const projectProgress = useMemo(
    () => computeProjectProgress(data.items.map((i) => ({ id: i.id, progress: i.percentualCompleto, parentId: i.parentId }))),
    [data.items]
  )

  // Progresso esperado ("quanto deveria estar hoje") — mesma conta canônica
  // usada em Analytics/Status Report (lib/utils/schedule-status.ts): tempo
  // decorrido ÷ duração total do período planejado do projeto. Comparado
  // com o progresso real acima para saber se está adiantado ou atrasado.
  const plannedPct = useMemo(
    () => computeExpectedPct(
      projectPlannedDates.expectedStart ? new Date(`${projectPlannedDates.expectedStart}T00:00:00.000Z`) : null,
      projectPlannedDates.expectedEnd ? new Date(`${projectPlannedDates.expectedEnd}T00:00:00.000Z`) : null,
    ),
    [projectPlannedDates.expectedStart, projectPlannedDates.expectedEnd]
  )
  const scheduleStatus: ScheduleStatus = useMemo(
    () => computeScheduleStatus(projectProgress, plannedPct, riskThresholdPct),
    [projectProgress, plannedPct, riskThresholdPct]
  )

  useEffect(() => {
    hasUndoV2(projectId).then(setHasUndo).catch(() => {})
    hasRedoV2(projectId).then(setHasRedo).catch(() => {})
    getTemplates().then(setTemplates).catch(() => {})
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

  function handleApplyTemplate() {
    if (!tplSelected || !isSaneDateInput(tplStartDate) || tplStartDate === "") return
    startTransition(async () => {
      await applyTemplateV2(projectId, tplSelected, tplStartDate)
      setTplModalOpen(false)
      setTplSelected("")
      refresh()
    })
  }

  function handleExportExcel() {
    setExporting(true)
    exportScheduleToExcel(projectTitle, data.items, data.dependencies, membersById)
      .finally(() => setExporting(false))
  }

  function handleSaveBaseline() {
    setSavingBaseline(true)
    setBaselineMsg(null)
    startTransition(async () => {
      const result = await createBaselineForProject(projectId, {})
      if (result.error) {
        setBaselineMsg(result.error)
      } else {
        const fresh = await getLatestBaselineByItem(projectId)
        setBaselineByItem(fresh)
        setBaselineMsg("Linha de base salva.")
      }
      setSavingBaseline(false)
      setTimeout(() => setBaselineMsg(null), 5000)
    })
  }

  function handleOpenHistory() {
    setHistoryOpen(true)
    setHistoryLoading(true)
    startTransition(async () => {
      const entries = await getChangeLogV2(projectId)
      setHistoryEntries(entries)
      setHistoryLoading(false)
    })
  }

  function handleOpenPublicLink() {
    setPublicLinkOpen(true)
    setCopied(false)
    if (publicToken) return
    setPublicLinkLoading(true)
    startTransition(async () => {
      const token = await getOrCreatePublicScheduleToken(projectId)
      setPublicToken(token)
      setPublicLinkLoading(false)
    })
  }

  function handleRevokePublicLink() {
    setPublicLinkLoading(true)
    startTransition(async () => {
      await revokePublicScheduleToken(projectId)
      setPublicToken(null)
      setPublicLinkLoading(false)
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

  const roots = sortedSiblingsOf(data.items, null, sort, membersById)
  const selectedItem = selectedId ? data.items.find((i) => i.id === selectedId) ?? null : null

  const rowHandlers: RowHandlers = {
    data, expanded, onToggle: toggle, onUpdate: handleUpdate, onDeps: handleDeps, onDelete: handleDelete,
    onDuplicate: handleDuplicate, onAddAbove: handleAddAbove, onAddChild: handleAddChild, onEditTitle: handleEditTitle,
    selectedId, onSelect: setSelectedId, sort, conflictByItem,
    colOrder, colWidths, titleWidth, members, membersById, baselineByItem,
    dragRowId, dropTarget, onRowDragStart: handleRowDragStart, onRowDragOver: handleRowDragOver,
    onRowDrop: handleRowDrop, onRowDragEnd: handleRowDragEnd,
  }

  return (
    <div className="min-h-full text-slate-700" style={{ background: "#F8F9FC" }}>
      {/* Sugestões do campo Responsável (célula "responsavel" abaixo) —
          declarada uma única vez para todas as linhas, não trava a
          digitação a esta lista (ver renderCell). */}
      <datalist id="sv2-members-list">
        {members.map((m) => <option key={m.id} value={m.name} />)}
      </datalist>

      {/* Header stats — Início/Término aqui são o próprio cronograma (min
          início / max término entre todos os itens, regra §3.7 de rollup),
          calculados no servidor a cada carregamento — nunca um campo solto
          para digitar, que ficava desatualizado e não refletia as
          atividades reais. Editar a data planejada oficial do projeto
          continua na tela de detalhe do projeto. */}
      <div className="px-5 py-4 border-b border-slate-200 bg-white flex items-center gap-6 flex-wrap">
        <Stat label="Itens" value={data.items.length} />
        <Stat label="Início" value={fmtDateLong(data.projectStartDate)} />
        <Stat label="Término" value={fmtDateLong(data.projectEndDate)} />
        <Stat label="Conflitos" value={data.conflicts.length} color={data.conflicts.length > 0 ? "#D97706" : undefined} />
        <div className="ml-auto flex items-center gap-4">
          <div className="w-32">
            <div className="flex justify-between text-[9px] mb-1">
              <span className="text-slate-400 uppercase tracking-widest font-bold">Real</span>
              <span className="font-black" style={{ color: "#7B2FBE" }}>{projectProgress}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${projectProgress}%`, background: "linear-gradient(90deg, #7B2FBE, #2463FF)" }}
              />
            </div>
          </div>
          <div className="w-32">
            <div className="flex justify-between text-[9px] mb-1">
              <span className="text-slate-400 uppercase tracking-widest font-bold">Esperado</span>
              <span className="font-black text-slate-500">{plannedPct !== null ? `${plannedPct}%` : "—"}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${plannedPct ?? 0}%`, background: "#94A3B8" }}
              />
            </div>
          </div>
          <div
            className="flex flex-col items-center px-3 py-1 rounded-xl shrink-0"
            style={{ background: SCHEDULE_STATUS_STYLE[scheduleStatus].bg, border: `1px solid ${SCHEDULE_STATUS_STYLE[scheduleStatus].color}33` }}
            title="Real menos esperado — quanto o projeto está adiantado (positivo) ou atrasado (negativo) em relação ao período planejado"
          >
            <span className="text-[9px] font-black uppercase tracking-wide" style={{ color: SCHEDULE_STATUS_STYLE[scheduleStatus].color }}>
              {SCHEDULE_STATUS_STYLE[scheduleStatus].label}
            </span>
            {plannedPct !== null && (
              <span className="text-[10px] font-bold" style={{ color: SCHEDULE_STATUS_STYLE[scheduleStatus].color }}>
                {projectProgress - plannedPct > 0 ? "+" : ""}{projectProgress - plannedPct} pp
              </span>
            )}
          </div>
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
        <ToolbarBtn wide disabled={templates.length === 0} onClick={() => setTplModalOpen(true)} title="Aplicar um modelo de cronograma pronto a este projeto">
          <LayoutTemplate className="w-3.5 h-3.5" /> Aplicar modelo
        </ToolbarBtn>
        <ToolbarBtn wide disabled={exporting || data.items.length === 0} onClick={handleExportExcel} title="Exportar este cronograma para uma planilha Excel formatada">
          <FileSpreadsheet className="w-3.5 h-3.5" /> {exporting ? "Exportando…" : "Exportar Excel"}
        </ToolbarBtn>
        <ToolbarBtn wide disabled={savingBaseline || data.items.length === 0} onClick={handleSaveBaseline} title="Congela o início/término planejado de hoje — compare depois nas colunas Início Base/Término Base">
          <BookmarkPlus className="w-3.5 h-3.5" /> {savingBaseline ? "Salvando…" : "Salvar Linha de Base"}
        </ToolbarBtn>
        {baselineMsg && <span className="text-[10px] font-bold text-[#7B2FBE]">{baselineMsg}</span>}
        <ToolbarBtn wide onClick={handleOpenHistory} title="Ver quem alterou o quê e quando neste cronograma">
          <History className="w-3.5 h-3.5" /> Histórico
        </ToolbarBtn>
        <ToolbarBtn wide onClick={handleOpenPublicLink} title="Gerar um link público (sem login) para acompanhar este cronograma">
          <Link2 className="w-3.5 h-3.5" /> Link Público
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

      {tplModalOpen && (
        <ApplyTemplateModal
          templates={templates}
          selected={tplSelected}
          onSelect={setTplSelected}
          startDate={tplStartDate}
          onStartDate={setTplStartDate}
          onApply={handleApplyTemplate}
          onClose={() => setTplModalOpen(false)}
        />
      )}

      {historyOpen && (
        <HistoryModal loading={historyLoading} entries={historyEntries} onClose={() => setHistoryOpen(false)} />
      )}

      {publicLinkOpen && (
        <PublicLinkModal
          token={publicToken}
          loading={publicLinkLoading}
          copied={copied}
          onCopy={() => {
            if (!publicToken) return
            navigator.clipboard.writeText(`${window.location.origin}/public/schedule/${publicToken}`).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            })
          }}
          onRevoke={handleRevokePublicLink}
          onClose={() => setPublicLinkOpen(false)}
        />
      )}
    </div>
  )
}

// ─── Modal "Histórico" ────────────────────────────────────────────────────
function HistoryModal({ loading, entries, onClose }: {
  loading: boolean
  entries: ChangeLogEntryV2[]
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl bg-white shadow-xl border border-slate-200 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-1 shrink-0">
          <History className="w-4 h-4 text-[#7B2FBE]" />
          <h3 className="text-sm font-black text-slate-800">Histórico de alterações</h3>
        </div>
        <p className="text-xs text-slate-400 mb-4 shrink-0">
          Quem mudou o quê e quando neste cronograma — mais recentes primeiro.
        </p>

        <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
          {loading ? (
            <p className="text-xs text-slate-400 text-center py-6">Carregando…</p>
          ) : entries.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">Nenhuma alteração registrada ainda.</p>
          ) : (
            <ul className="space-y-2">
              {entries.map((e) => (
                <li key={e.id} className="text-xs border-b border-slate-100 pb-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-bold text-slate-700">{e.userName}</span>
                    <span
                      className="text-[10px] text-slate-400 shrink-0"
                      title={new Date(e.createdAt).toLocaleString("pt-BR")}
                    >
                      {formatDistanceToNow(new Date(e.createdAt), { addSuffix: true, locale: ptBR })}
                    </span>
                  </div>
                  <p className="text-slate-600 mt-0.5">{e.description}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 mt-4 shrink-0">
          <button onClick={onClose} className="px-3.5 py-2 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-100 transition-colors">
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal "Link Público" ─────────────────────────────────────────────────
// Token permanente (lib/actions/public-links.ts) — a view pública (app/
// (print)/public/schedule/[token]) não mostra custo/orçamento, só datas/
// status/responsável/predecessores, e é somente leitura.
function PublicLinkModal({ token, loading, copied, onCopy, onRevoke, onClose }: {
  token: string | null
  loading: boolean
  copied: boolean
  onCopy: () => void
  onRevoke: () => void
  onClose: () => void
}) {
  const url = token && typeof window !== "undefined" ? `${window.location.origin}/public/schedule/${token}` : ""
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-1">
          <Link2 className="w-4 h-4 text-[#7B2FBE]" />
          <h3 className="text-sm font-black text-slate-800">Link público do Cronograma</h3>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Qualquer pessoa com este link vê o cronograma (datas, status, responsável, predecessores) sem precisar de login — sem custo/orçamento. Fica ativo até você revogar.
        </p>

        {loading ? (
          <p className="text-xs text-slate-400 text-center py-4">Gerando link…</p>
        ) : url ? (
          <>
            <div className="flex items-center gap-2 mb-4">
              <input readOnly value={url} onFocus={(e) => e.target.select()}
                className="flex-1 h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-600 bg-slate-50 outline-none" />
              <button onClick={onCopy} title="Copiar link"
                className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="flex items-center justify-between">
              <button onClick={onRevoke}
                className="flex items-center gap-1.5 text-xs font-bold text-red-500 hover:text-red-600 transition-colors">
                <X className="w-3.5 h-3.5" /> Revogar link
              </button>
              <button onClick={onClose} className="px-3.5 py-2 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-100 transition-colors">
                Fechar
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-end">
            <button onClick={onClose} className="px-3.5 py-2 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-100 transition-colors">
              Fechar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Modal "Aplicar modelo" ───────────────────────────────────────────────
function ApplyTemplateModal({ templates, selected, onSelect, startDate, onStartDate, onApply, onClose }: {
  templates: Template[]
  selected: string
  onSelect: (id: string) => void
  startDate: string
  onStartDate: (v: string) => void
  onApply: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-1">
          <LayoutTemplate className="w-4 h-4 text-[#7B2FBE]" />
          <h3 className="text-sm font-black text-slate-800">Aplicar modelo de cronograma</h3>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Cria a estrutura do modelo neste projeto. As datas são calculadas a partir do início escolhido, respeitando dias úteis e feriados.
        </p>

        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Modelo</label>
        <select
          value={selected}
          onChange={(e) => onSelect(e.target.value)}
          className="w-full mb-3 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 outline-none focus:border-[#7B2FBE]"
        >
          <option value="">Selecione um modelo…</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>

        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Início</label>
        <input
          type="date"
          min={DATE_MIN}
          max={DATE_MAX}
          value={startDate}
          onChange={(e) => onStartDate(e.target.value)}
          className="w-full mb-5 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 outline-none focus:border-[#7B2FBE]"
        />

        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3.5 py-2 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-100 transition-colors">
            Cancelar
          </button>
          <button
            onClick={onApply}
            disabled={!selected || !isSaneDateInput(startDate) || startDate === ""}
            className="px-3.5 py-2 rounded-lg text-xs font-bold text-white transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "linear-gradient(135deg, #7B2FBE, #9333EA)" }}
          >
            Aplicar modelo
          </button>
        </div>
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
  members: { id: string; name: string }[]
  membersById: Map<string, string>
  baselineByItem: Record<string, { plannedStart: string | null; plannedEnd: string | null }>
  dragRowId: string | null
  dropTarget: { id: string; zone: "before" | "after" | "inside" } | null
  onRowDragStart: (id: string) => void
  onRowDragOver: (e: React.DragEvent, targetId: string) => void
  onRowDrop: (targetId: string) => void
  onRowDragEnd: () => void
}

function RowGroup({ item, depth, ...h }: { item: ItemV2; depth: number } & RowHandlers) {
  const kids = sortedSiblingsOf(h.data.items, item.id, h.sort, h.membersById)
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
        {!hasChildren && (
          <button
            onClick={() => h.onUpdate(item.id, { isMacroMilestone: !item.isMacroMilestone })}
            title={item.isMacroMilestone ? "Remover do Macro Cronograma (Status Report)" : "Marcar para o Macro Cronograma (Status Report)"}
          >
            <Star className={`w-3 h-3 transition-colors ${item.isMacroMilestone ? "text-amber-400 fill-amber-400" : "text-slate-300 hover:text-amber-400"}`} />
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
          min={DATE_MIN}
          max={DATE_MAX}
          defaultValue={item.inicioEstimado ?? ""}
          title={
            hasChildren
              ? "Data de grupo — as subatividades definem o período; um valor digitado aqui é descartado ao salvar"
              : item.schedulingMode === "auto" && hasPredecessor(item.id, h.data)
                ? "Data controlada pelo predecessor — um valor digitado aqui é descartado ao salvar"
                : undefined
          }
          onBlur={(e) => {
            if (!isSaneDateInput(e.target.value)) {
              e.target.value = item.inicioEstimado ?? "" // reverte — ano com formato inválido
              return
            }
            const v = e.target.value || null
            if (v !== item.inicioEstimado) h.onUpdate(item.id, { inicioEstimado: v })
          }}
          className="bg-transparent outline-none text-[10px] text-slate-700 w-full text-right pr-0.5 rounded focus:bg-violet-50"
        />
      )

    case "termino":
      return (
        <input
          key={`termino:${item.id}:${item.terminoEstimado}`}
          type="date"
          min={DATE_MIN}
          max={DATE_MAX}
          defaultValue={item.terminoEstimado ?? ""}
          title={hasChildren ? "Data de grupo — as subatividades definem o período; um valor digitado aqui é descartado ao salvar" : "Editar aqui recalcula a duração (início fica fixo)"}
          onBlur={(e) => {
            if (!isSaneDateInput(e.target.value)) {
              e.target.value = item.terminoEstimado ?? "" // reverte — ano com formato inválido
              return
            }
            const v = e.target.value || null
            if (v !== item.terminoEstimado) h.onUpdate(item.id, { terminoEstimado: v })
          }}
          className="bg-transparent outline-none text-[10px] text-slate-700 w-full text-right pr-0.5 rounded focus:bg-violet-50"
        />
      )

    case "inicioReal":
      return (
        <input
          key={`inicioReal:${item.id}:${item.inicioReal}`}
          type="date"
          min={DATE_MIN}
          max={DATE_MAX}
          defaultValue={item.inicioReal ?? ""}
          title="Data em que a atividade realmente começou — preencher muda o Status para Em Andamento"
          onBlur={(e) => {
            if (!isSaneDateInput(e.target.value)) {
              e.target.value = item.inicioReal ?? "" // reverte — ano com formato inválido
              return
            }
            const v = e.target.value || null
            if (v !== item.inicioReal) {
              h.onUpdate(item.id, {
                inicioReal: v,
                // Preencher o início real é o mesmo sinal de "começou de
                // verdade" — muda o Status automaticamente (pedido do time).
                ...(v !== null && { status: "EM_ANDAMENTO" }),
              })
            }
          }}
          className="bg-transparent outline-none text-[10px] text-slate-700 w-full text-right pr-0.5 rounded focus:bg-violet-50"
        />
      )

    case "terminoReal":
      return (
        <input
          key={`terminoReal:${item.id}:${item.terminoReal}`}
          type="date"
          min={DATE_MIN}
          max={DATE_MAX}
          defaultValue={item.terminoReal ?? ""}
          title="Data em que a atividade realmente terminou — preencher muda o Status para Concluído e o % para 100"
          onBlur={(e) => {
            if (!isSaneDateInput(e.target.value)) {
              e.target.value = item.terminoReal ?? "" // reverte — ano com formato inválido
              return
            }
            const v = e.target.value || null
            if (v !== item.terminoReal) {
              h.onUpdate(item.id, {
                terminoReal: v,
                // Preencher o término real é o mesmo sinal de "terminou de
                // verdade" — muda Status e % automaticamente (pedido do time).
                ...(v !== null && { status: "CONCLUIDO", percentualCompleto: 100 }),
              })
            }
          }}
          className="bg-transparent outline-none text-[10px] text-slate-700 w-full text-right pr-0.5 rounded focus:bg-violet-50"
        />
      )

    case "baselineInicio": {
      const base = h.baselineByItem[item.id]?.plannedStart
      return <span className="text-[10px] text-slate-400">{base ? fmtDateLong(base) : "—"}</span>
    }

    case "baselineTermino": {
      const base = h.baselineByItem[item.id]?.plannedEnd
      return <span className="text-[10px] text-slate-400">{base ? fmtDateLong(base) : "—"}</span>
    }

    case "pctEstimado": {
      // Quanto a atividade JÁ deveria ter avançado hoje, dado o período
      // planejado dela — mesma conta do "Esperado" do cabeçalho
      // (computeExpectedPct), só que por linha em vez de agregada no
      // projeto inteiro. Sempre somente leitura (não é uma entrada
      // manual, é derivado das datas planejadas).
      const estimado = computeExpectedPct(
        item.inicioEstimado ? new Date(`${item.inicioEstimado}T00:00:00.000Z`) : null,
        item.terminoEstimado ? new Date(`${item.terminoEstimado}T00:00:00.000Z`) : null,
      )
      return <span className="text-xs text-slate-400">{estimado !== null ? `${estimado}%` : "—"}</span>
    }

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

    case "restricao": {
      // Só "não iniciar antes de" existe hoje (decisão de escopo) — a
      // presença de uma data já implica esse tipo; limpar a data remove a
      // restrição inteira. Participa do cálculo como mais um candidato de
      // início (junto com predecessor/data manual), vence o mais tardio.
      if (hasChildren) return null
      return (
        <input
          key={`restricao:${item.id}:${item.constraintDate}`}
          type="date"
          min={DATE_MIN}
          max={DATE_MAX}
          defaultValue={item.constraintDate ?? ""}
          title="Não iniciar antes de — data mínima de início, mesmo que o predecessor calcule uma data mais cedo"
          onBlur={(e) => {
            if (!isSaneDateInput(e.target.value)) {
              e.target.value = item.constraintDate ?? ""
              return
            }
            const v = e.target.value || null
            if (v !== item.constraintDate) {
              h.onUpdate(item.id, { constraintDate: v, constraintType: v !== null ? "nao_iniciar_antes_de" : null })
            }
          }}
          className="w-full bg-transparent outline-none text-[10px] text-slate-700 rounded border-b border-transparent focus:border-[#7B2FBE] focus:bg-violet-50"
        />
      )
    }

    case "responsavel": {
      // Campo livre — aceita qualquer nome digitado, mesmo de quem ainda não
      // é usuário do sistema (ex.: Millena). Sugere os membros cadastrados
      // via <datalist> (id="sv2-members-list", declarada uma única vez no
      // topo do componente), mas não trava a digitação a essa lista. Quando
      // o texto digitado bate com um nome cadastrado, salva a FK
      // (responsavelId) — senão salva o texto solto (responsavelNome).
      const currentName = item.responsavelId ? (h.membersById.get(item.responsavelId) ?? "") : (item.responsavelNome ?? "")
      return (
        <input
          key={`resp:${item.id}:${item.responsavelId}:${item.responsavelNome}`}
          list="sv2-members-list"
          defaultValue={currentName}
          placeholder="Sem responsável"
          onBlur={(e) => {
            const typed = e.target.value.trim()
            if (typed === currentName) return
            if (typed === "") {
              h.onUpdate(item.id, { responsavelId: null })
              return
            }
            const match = h.members.find((m) => m.name.toLowerCase() === typed.toLowerCase())
            if (match) h.onUpdate(item.id, { responsavelId: match.id })
            else h.onUpdate(item.id, { responsavelNome: typed })
          }}
          className="w-full bg-transparent outline-none text-xs text-slate-700 placeholder-slate-300 rounded border-b border-transparent focus:border-[#7B2FBE] focus:bg-violet-50"
        />
      )
    }

    case "participantes": {
      // Além do responsável (acima): outras pessoas ligadas à atividade,
      // texto livre separado por vírgula (mesmo datalist de sugestão do
      // Responsável, sem travar a digitação a ele).
      const current = item.participantes.join(", ")
      return (
        <input
          key={`part:${item.id}:${current}`}
          list="sv2-members-list"
          defaultValue={current}
          placeholder="Sem participantes"
          onBlur={(e) => {
            const typed = e.target.value.trim()
            if (typed === current) return
            const list = typed === "" ? [] : typed.split(",").map((s) => s.trim()).filter(Boolean)
            h.onUpdate(item.id, { participantes: list })
          }}
          className="w-full bg-transparent outline-none text-xs text-slate-700 placeholder-slate-300 rounded border-b border-transparent focus:border-[#7B2FBE] focus:bg-violet-50"
        />
      )
    }

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
