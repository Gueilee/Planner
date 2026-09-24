"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import {
  createItemV2, updateItemV2, deleteItemV2, duplicateItemV2, reorderItemsV2, setDependenciesV2, getScheduleV2,
  hasUndoV2, hasRedoV2, undoLastChangeV2, redoLastChangeV2, applyTemplateV2, getChangeLogV2, bulkAssignResponsavelV2,
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
  Link2, Copy, Check, X, Star, Columns3, CalendarDays, CalendarCheck2, CalendarClock, Flame,
  Loader2, CircleCheck, CircleAlert, Wallet, Receipt, TrendingUp, TrendingDown, Minus, Save,
} from "lucide-react"
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuCheckboxItem, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { ToolbarBtn, ToolbarGroup } from "@/components/kronex/toolbar"
import { PeoplePicker } from "@/components/kronex/people-picker"
import { PeopleMultiPicker } from "@/components/kronex/people-multi-picker"

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
    case "folga": return item.totalFloatDays ?? Number.MAX_SAFE_INTEGER
    case "responsavel": return ((item.responsavelId ? membersById?.get(item.responsavelId) : item.responsavelNome) ?? "").toLowerCase()
    case "status": return statusLabel(item.status).label
    case "custoOrcado": return item.budgetedCost ?? -1
    case "custoReal": return item.actualCost ?? -1
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

type ColKey = "duracao" | "inicio" | "termino" | "inicioReal" | "terminoReal" | "baselineInicio" | "baselineTermino" | "pctEstimado" | "pct" | "folga" | "predecessores" | "restricao" | "responsavel" | "participantes" | "status" | "custoOrcado" | "custoReal"

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
  // Caminho crítico (CPM) — dias úteis de sobra antes de atrasar o projeto;
  // 0 = crítico (mesmo item já fica marcado com o ícone 🔥 ao lado do
  // título). Calculado na leitura (lib/domain/schedule-v2/critical-path.ts),
  // nunca editável.
  folga: "Folga",
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
  // Paridade com o Custo Orçado/Custo Real do cronograma antigo (ScheduleTask)
  // — só item-folha tem valor próprio (grupo soma os filhos no Indicadores,
  // ver comentário em ItemV2.budgetedCost em lib/actions/schedule-v2.ts).
  custoOrcado: "Custo Orçado", custoReal: "Custo Real",
}
const DEFAULT_COL_ORDER: ColKey[] = ["duracao", "inicio", "termino", "inicioReal", "terminoReal", "baselineInicio", "baselineTermino", "pctEstimado", "pct", "folga", "predecessores", "restricao", "responsavel", "participantes", "status", "custoOrcado", "custoReal"]
const DEFAULT_COL_WIDTHS: Record<ColKey, number> = {
  duracao: 70, inicio: 110, termino: 100, inicioReal: 110, terminoReal: 110, baselineInicio: 100, baselineTermino: 100, pctEstimado: 70, pct: 60, folga: 70, predecessores: 150, restricao: 150, responsavel: 140, participantes: 160, status: 130,
  custoOrcado: 120, custoReal: 120,
}
const COL_ALIGN: Record<ColKey, "center" | "left"> = {
  duracao: "center", inicio: "center", termino: "center", inicioReal: "center", terminoReal: "center",
  baselineInicio: "center", baselineTermino: "center", pctEstimado: "center", pct: "center", folga: "center",
  predecessores: "left", restricao: "left", responsavel: "left", participantes: "left", status: "left",
  custoOrcado: "center", custoReal: "center",
}
const DEFAULT_TITLE_WIDTH = 320
const GUTTER_WIDTH = 112

function colPrefsKey(projectId: string) { return `sv2-columns-${projectId}` }

// ─── Main ─────────────────────────────────────────────────────────────────

export function ScheduleV2Client({ projectId, projectTitle, initial, members, riskThresholdPct = DEFAULT_RISK_THRESHOLD_PCT, initialBaselineByItem = {}, initialPublicScheduleToken = null }: {
  projectId: string
  projectTitle: string
  initial: ScheduleV2Payload
  members: { id: string; name: string }[]
  riskThresholdPct?: number
  // Datas congeladas na última linha de base (ver lib/actions/baseline.ts),
  // indexadas por ScheduleV2Item.id — colunas "Início Base"/"Término Base".
  initialBaselineByItem?: Record<string, { plannedStart: string | null; plannedEnd: string | null }>
  // Token do link público (Project.publicScheduleToken) — null = nenhum
  // link ativo ainda.
  initialPublicScheduleToken?: string | null
}) {
  // `members` só é buscado uma vez, no carregamento da página (server
  // component) — quem for vinculado via busca no Azure AD DEPOIS disso
  // (Responsável ou Participantes) não aparece ali até recarregar a
  // página. `linkedFromDirectory` guarda essas pessoas nesta sessão do
  // navegador, mesclado em `membersById`, pra o nome aparecer na hora.
  const [linkedFromDirectory, setLinkedFromDirectory] = useState<{ id: string; name: string }[]>([])
  const allMembers = useMemo(() => {
    const byId = new Map(members.map((m) => [m.id, m]))
    for (const m of linkedFromDirectory) if (!byId.has(m.id)) byId.set(m.id, m)
    return [...byId.values()]
  }, [members, linkedFromDirectory])
  const membersById = useMemo(() => new Map(allMembers.map((m) => [m.id, m.name])), [allMembers])
  function handlePersonLinked(person: { id: string; name: string }) {
    setLinkedFromDirectory((prev) => (prev.some((p) => p.id === person.id) ? prev : [...prev, person]))
  }
  const [data, setData] = useState<ScheduleV2Payload>(initial)
  const [expanded, setExpanded] = useState<Set<string>>(new Set(initial.items.filter((i) => i.isGroup).map((i) => i.id)))
  const [pending, startTransition] = useTransition()
  // Seleção de linhas: multi (bolinha de cada linha só marca/desmarca a
  // própria linha, sem afetar as outras). Mover/indentar/promover continuam
  // exigindo exatamente 1 marcada (ver selectedItem abaixo) — reestruturar
  // várias de uma vez seria ambíguo; a seleção múltipla existe pra atribuir
  // responsável em lote (handleBulkAssignResponsavel).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [sort, setSort] = useState<SortState>({ column: null, dir: "asc" })
  const [hasUndo, setHasUndo] = useState(false)
  const [hasRedo, setHasRedo] = useState(false)

  // Toda edição salva sozinha ao sair do campo (sem botão "Salvar" — não
  // existe rascunho local pra ele salvar de uma vez). O problema real que
  // isso resolve: até agora, se um salvamento falhasse (rede instável, o
  // servidor reiniciando no meio da requisição, sessão expirada), o erro
  // desaparecia em silêncio — o campo continuava mostrando o valor
  // digitado, dando a falsa impressão de que salvou, e só na próxima vez
  // que a página recarregasse é que a pessoa descobria que aquilo nunca
  // foi gravado (foi exatamente isso que aconteceu com a Millena no
  // Cronograma da Aptissen). Este indicador (mais o retry abaixo) garante
  // que uma falha SEMPRE aparece na hora, com um jeito de tentar de novo
  // sem perder o que foi digitado.
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [saveError, setSaveError] = useState<{ message: string; retry: () => void } | null>(null)
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
  // Ocultar coluna (igual "ocultar coluna" do Excel) — pedido pra deixar a
  // grade mais enxuta em reunião com cliente, sem perder o dado (só some
  // da tela; reaparece na mesma posição ao marcar de novo). Preferência
  // salva junto com largura/ordem, no mesmo localStorage por projeto.
  const [hiddenCols, setHiddenCols] = useState<ColKey[]>([])

  // Arrastar linha (encaixar antes/depois/dentro) — igual ao Artia.
  const [dragRowId, setDragRowId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; zone: "before" | "after" | "inside" } | null>(null)

  const conflictByItem = useMemo(() => new Map(data.conflicts.map((c) => [c.itemId, c])), [data.conflicts])

  // Progresso do projeto — mesma função canônica usada em Analytics, Status
  // Report, Dashboard etc. (lib/utils/project-progress.ts): média entre as
  // ATIVIDADES MÃE (cada uma ponderada por duração só entre as próprias
  // tarefas-folha), nunca achatando a árvore inteira num peso só — ver o
  // comentário de computeProjectProgress pro incidente real que motivou
  // essa mudança (uma tarefa com data errada dominando o projeto inteiro).
  const projectProgress = useMemo(
    () => computeProjectProgress(data.items.map((i) => ({ id: i.id, progress: i.percentualCompleto, parentId: i.parentId, startDate: i.inicioEstimado, endDate: i.terminoEstimado }))),
    [data.items]
  )

  // Progresso esperado — mesma árvore/agregação de computeProjectProgress
  // acima (mesma função canônica), só substituindo `progress` de cada
  // tarefa-folha pelo % Estimado dela (elapsed/total das PRÓPRIAS datas)
  // antes de agregar — igual ao truque já usado em computeScheduleCascade
  // (lib/utils/schedule-cascade.ts) pro "esperado" nunca divergir do "real"
  // por usarem contas diferentes. Tarefa sem data ainda (não agendada) fica
  // de fora do lado "esperado" (regra de domínio: item não agendado não
  // entra no cálculo dos outros), mas continua contando no "real" acima.
  const plannedPct = useMemo(() => {
    const withExpected = data.items
      .map((i) => {
        const est = computeExpectedPct(
          i.inicioEstimado ? new Date(`${i.inicioEstimado}T00:00:00.000Z`) : null,
          i.terminoEstimado ? new Date(`${i.terminoEstimado}T00:00:00.000Z`) : null,
        )
        return est === null ? null : { id: i.id, parentId: i.parentId, progress: est }
      })
      .filter((t): t is { id: string; parentId: string | null; progress: number } => t !== null)
    return withExpected.length > 0 ? computeProjectProgress(withExpected) : null
  }, [data.items])
  const scheduleStatus: ScheduleStatus = useMemo(
    () => computeScheduleStatus(projectProgress, plannedPct, riskThresholdPct),
    [projectProgress, plannedPct, riskThresholdPct]
  )

  // Data de Go Live — não é um campo próprio do projeto, é derivada da
  // atividade "Go Live" do próprio Cronograma (convenção de nomenclatura já
  // usada em todos os modelos padrão, ver DEFAULT_TEMPLATES em
  // lib/actions/templates.ts). Recalculada a cada `data.items` mudar, então
  // acompanha sozinha qualquer reagendamento (edição manual, predecessor,
  // cascata) sem precisar de nenhum campo extra gravado no banco. Havendo
  // mais de uma atividade cujo título bate (ex.: "Go Live" e "Go Live /
  // Ramp-up" no mesmo cronograma), prioriza marcos (duração 0) e, entre
  // eles, o de início mais tardio — o Go Live "de verdade" tende a ser o
  // último desses marcos no cronograma.
  const goLiveDate = useMemo(() => {
    const normalize = (s: string) => s.toLowerCase().replace(/[\s-]/g, "")
    const candidates = data.items.filter((i) => normalize(i.title).includes("golive"))
    if (candidates.length === 0) return null
    const milestones = candidates.filter((i) => i.duracaoDiasUteis === 0)
    const pool = milestones.length > 0 ? milestones : candidates
    const best = pool.reduce<ItemV2 | null>((latest, cur) => {
      const curDate = cur.inicioEstimado ?? cur.terminoEstimado
      if (!curDate) return latest
      const latestDate = latest ? (latest.inicioEstimado ?? latest.terminoEstimado) : null
      return !latestDate || curDate > latestDate ? cur : latest
    }, null)
    return best ? (best.inicioEstimado ?? best.terminoEstimado) : null
  }, [data.items])

  // Custo do projeto — soma direta das colunas Custo Orçado/Custo Real de
  // TODAS as linhas (grupo nunca tem valor próprio nesses dois campos, ver
  // updateItemV2 em lib/actions/schedule-v2.ts, então somar sem filtrar
  // hierarquia não dobra a conta — mesmo princípio do BAC/AC em
  // Indicadores, lib/actions/indicators.ts). "Economia" é o que sobrou do
  // orçado (positivo = ainda tem folga; negativo = já estourou).
  const costSummary = useMemo(() => {
    const budgeted = data.items.reduce((s, it) => s + (it.budgetedCost ?? 0), 0)
    const actual = data.items.reduce((s, it) => s + (it.actualCost ?? 0), 0)
    return { budgeted, actual, delta: budgeted - actual, hasData: budgeted > 0 || actual > 0 }
  }, [data.items])

  useEffect(() => {
    hasUndoV2(projectId).then(setHasUndo).catch(() => {})
    hasRedoV2(projectId).then(setHasRedo).catch(() => {})
    getTemplates().then(setTemplates).catch(() => {})
  }, [projectId])

  // Sair da página com um salvamento em andamento ou que falhou é
  // exatamente o cenário que causou a perda de dados relatada no
  // Cronograma da Aptissen — o navegador confirma antes de fechar/sair.
  useEffect(() => {
    if (saveStatus !== "saving" && saveStatus !== "error") return
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [saveStatus])

  // Carrega preferências de coluna salvas (só no cliente — evita divergir da
  // renderização do servidor). Só grava de volta depois de já ter lido.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(colPrefsKey(projectId))
      if (raw) {
        const parsed = JSON.parse(raw) as { widths?: Partial<Record<ColKey, number>>; order?: ColKey[]; titleWidth?: number; hidden?: ColKey[] }
        if (parsed.widths) setColWidths((w) => ({ ...w, ...parsed.widths }))
        if (Array.isArray(parsed.order) && parsed.order.length === DEFAULT_COL_ORDER.length) setColOrder(parsed.order)
        if (typeof parsed.titleWidth === "number") setTitleWidth(parsed.titleWidth)
        if (Array.isArray(parsed.hidden)) setHiddenCols(parsed.hidden.filter((c): c is ColKey => DEFAULT_COL_ORDER.includes(c)))
      }
    } catch { /* localStorage indisponível — segue com o padrão */ }
    setColsLoaded(true)
  }, [projectId])

  useEffect(() => {
    if (!colsLoaded) return
    try { localStorage.setItem(colPrefsKey(projectId), JSON.stringify({ widths: colWidths, order: colOrder, titleWidth, hidden: hiddenCols })) } catch { /* noop */ }
  }, [colsLoaded, colWidths, colOrder, titleWidth, hiddenCols, projectId])

  // Colunas realmente desenhadas na grade — mesma ordem persistida, só sem
  // as marcadas como ocultas. A "Atividade" (título) nunca pode ser
  // ocultada — é a única identificação da linha.
  const visibleColOrder = useMemo(() => colOrder.filter((c) => !hiddenCols.includes(c)), [colOrder, hiddenCols])

  // Largura total da grade (gutter + título + todas as colunas visíveis) —
  // usada como min-width do conteúdo rolável. Sem isso, cabeçalho e linhas
  // (dois flex containers irmãos, sem essa largura em comum) encolhiam cada
  // um a sua própria maneira quando a soma das colunas não cabia na tela —
  // o cabeçalho (células vazias, bem compressíveis) encolhia mais que as
  // linhas (ícones/inputs que não compressimem tanto), descasando tudo.
  // Correção: ninguém encolhe (shrink-0 em cada célula) e o excesso vira
  // scroll horizontal — igual Excel — em vez de comprimir e desalinhar.
  const gridMinWidth = useMemo(
    () => GUTTER_WIDTH + titleWidth + visibleColOrder.reduce((sum, col) => sum + colWidths[col], 0),
    [titleWidth, visibleColOrder, colWidths]
  )

  function toggleColVisibility(col: ColKey) {
    setHiddenCols((prev) => prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col])
  }

  // `focusId`: depois de recarregar, foca e seleciona o título da linha nova
  // (criada, duplicada) para o usuário já poder renomear direto. Função pura
  // (sem startTransition próprio) — quem chama já roda dentro de
  // `runMutation`, que é quem controla o status de salvamento.
  async function refreshData(focusId?: string) {
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
  }

  function extractErrorMessage(e: unknown): string {
    return e instanceof Error && e.message ? e.message : "Não foi possível salvar. Tente novamente."
  }

  // Wrapper único por onde toda mutação (editar campo, criar/excluir/mover
  // linha, desfazer/refazer) passa — mostra "Salvando..." na hora, "Tudo
  // salvo" por alguns segundos ao terminar, ou "Falha ao salvar" com um
  // botão de tentar de novo (chamando a MESMA ação, sem perder nada) se
  // der erro. `action` deve ser idempotente o bastante pra rodar de novo
  // com segurança — todas as ações abaixo já são (releem o servidor no
  // fim, não dependem de estado local que possa ter mudado).
  function runMutation(action: () => Promise<void>) {
    if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current)
    setSaveStatus("saving")
    setSaveError(null)
    startTransition(async () => {
      try {
        await action()
        setSaveStatus("saved")
        savedTimeoutRef.current = setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 3000)
      } catch (e: unknown) {
        setSaveStatus("error")
        setSaveError({ message: extractErrorMessage(e), retry: () => runMutation(action) })
      }
    })
  }

  // Botão "Salvar" — pedido explícito da PMO por segurança visual. Cada
  // campo já salva sozinho ao sair dele (onBlur), então isto não muda o
  // comportamento por trás: só força o campo em edição no momento (se
  // houver) a confirmar agora em vez de esperar o próximo clique em outro
  // lugar, e sempre mostra "Tudo salvo" na volta — reforça que já estava
  // tudo gravado, mesmo quando não havia nada pendente.
  function handleManualSave() {
    const active = document.activeElement
    if (active instanceof HTMLElement && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT")) {
      active.blur()
    }
    if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current)
    setSaveStatus("saved")
    savedTimeoutRef.current = setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 3000)
  }

  function handleUndo() {
    runMutation(async () => {
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
    runMutation(async () => {
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
    runMutation(async () => {
      await updateItemV2(id, projectId, patch)
      await refreshData()
    })
  }

  function handleBulkAssignResponsavel(patch: { responsavelId: string | null; responsavelNome: string | null }, label: string) {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    runMutation(async () => {
      await bulkAssignResponsavelV2(projectId, ids, patch, label)
      await refreshData()
      setSelectedIds(new Set())
    })
  }

  function handleDeps(id: string, raw: string) {
    runMutation(async () => {
      await setDependenciesV2(id, projectId, raw)
      await refreshData()
    })
  }

  function handleDelete(id: string) {
    if (!confirm("Excluir este item e todos os seus filhos?")) return
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    runMutation(async () => {
      await deleteItemV2(id, projectId)
      await refreshData()
    })
  }

  // ── Menu do "+" da linha (igual ao Artia): duplicar, adicionar acima,
  //    adicionar como última filha — qualquer linha pode ganhar filhas,
  //    seja atividade, tarefa ou subtarefa. ─────────────────────────────

  function handleDuplicate(item: ItemV2) {
    runMutation(async () => {
      const result = await duplicateItemV2(item.id, projectId)
      await refreshData(result.newId)
    })
  }

  function handleAddAbove(item: ItemV2) {
    runMutation(async () => {
      const created = await createItemV2({ projectId, parentId: item.parentId, title: "Nova atividade" })
      const sibs = siblingsOf(data.items, item.parentId)
      const idx = sibs.findIndex((s) => s.id === item.id)
      const orderedIds = [...sibs.slice(0, idx).map((s) => s.id), created.id, ...sibs.slice(idx).map((s) => s.id)]
      await reorderItemsV2(projectId, orderedIds)
      await refreshData(created.id)
    })
  }

  function handleAddChild(item: ItemV2) {
    runMutation(async () => {
      const created = await createItemV2({ projectId, parentId: item.id, title: "Nova atividade" })
      setExpanded((prev) => new Set(prev).add(item.id))
      await refreshData(created.id)
    })
  }

  function handleAddRoot() {
    runMutation(async () => {
      const created = await createItemV2({ projectId, parentId: null, title: "Nova atividade" })
      await refreshData(created.id)
    })
  }

  function handleApplyTemplate() {
    if (!tplSelected || !isSaneDateInput(tplStartDate) || tplStartDate === "") return
    runMutation(async () => {
      await applyTemplateV2(projectId, tplSelected, tplStartDate)
      setTplModalOpen(false)
      setTplSelected("")
      await refreshData()
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

  // Move o BLOCO inteiro de linhas marcadas (não só uma) — cada grupo de
  // irmãos (mesmo parentId) é reordenado à parte. Cada item marcado troca de
  // posição com seu vizinho atual na direção do movimento; processado de
  // cima pra baixo ao subir (e de baixo pra cima ao descer) para que o bloco
  // inteiro ande junto em vez de cada linha se embaralhar sozinha — e
  // quando esse vizinho também está marcado, pula (ainda não abriu espaço:
  // o bloco já está encostado na borda daquele lado, não tem pra onde ir).
  function handleMoveSelection(dir: -1 | 1) {
    if (selectedIds.size === 0) return
    const byParent = new Map<string | null, Set<string>>()
    for (const id of selectedIds) {
      const item = data.items.find((i) => i.id === id)
      if (!item) continue
      const set = byParent.get(item.parentId) ?? new Set<string>()
      set.add(id)
      byParent.set(item.parentId, set)
    }

    const groupsToPersist: string[][] = []
    for (const [parentId, selSet] of byParent) {
      let order = siblingsOf(data.items, parentId).map((s) => s.id)
      const positions = order.map((id, i) => ({ id, i })).filter((x) => selSet.has(x.id))
      const processingOrder = dir === -1
        ? positions.sort((a, b) => a.i - b.i)
        : positions.sort((a, b) => b.i - a.i)
      for (const { id } of processingOrder) {
        const curIdx = order.indexOf(id)
        const swapIdx = curIdx + dir
        if (swapIdx < 0 || swapIdx >= order.length) continue
        if (selSet.has(order[swapIdx]!)) continue
        const next = [...order]
        ;[next[curIdx], next[swapIdx]] = [next[swapIdx]!, next[curIdx]!]
        order = next
      }
      groupsToPersist.push(order)
    }

    runMutation(async () => {
      for (const orderedIds of groupsToPersist) await reorderItemsV2(projectId, orderedIds)
      await refreshData()
    })
  }

  function handleIndent(item: ItemV2) {
    const sibs = siblingsOf(data.items, item.parentId)
    const idx = sibs.findIndex((s) => s.id === item.id)
    const newParent = sibs[idx - 1]
    if (!newParent) return
    runMutation(async () => {
      await updateItemV2(item.id, projectId, { parentId: newParent.id })
      await refreshData()
    })
  }

  function handleOutdent(item: ItemV2) {
    if (item.parentId === null) return
    const parent = data.items.find((i) => i.id === item.parentId)
    if (!parent) return
    runMutation(async () => {
      await updateItemV2(item.id, projectId, { parentId: parent.parentId })
      await refreshData()
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

  // Ordem visual (topo-a-baixo) da árvore inteira, atravessando qualquer
  // pai — usado só pra decidir em que ORDEM as linhas de um arraste em
  // grupo entram no destino (preserva a ordem relativa entre elas mesmo
  // vindo de pais diferentes); não é a ordem que fica salva (isso quem
  // decide é reorderItemsV2 depois).
  function visualOrderIds(items: ItemV2[]): string[] {
    const result: string[] = []
    function visit(parentId: string | null) {
      for (const item of siblingsOf(items, parentId)) {
        result.push(item.id)
        visit(item.id)
      }
    }
    visit(null)
    return result
  }

  function handleRowDrop(targetId: string) {
    const sourceId = dragRowId
    const target = dropTarget?.id === targetId ? dropTarget : null
    setDragRowId(null)
    setDropTarget(null)
    if (!sourceId || !target) return

    // Arrastar uma linha que faz parte da seleção múltipla (bolinha) move o
    // GRUPO inteiro junto, preservando a ordem relativa entre elas — mesmo
    // padrão de arrastar vários arquivos selecionados de uma vez. Arrastar
    // uma linha que NÃO está selecionada continua movendo só ela (ignora a
    // seleção), igual sempre foi.
    const movingIds = selectedIds.has(sourceId) && selectedIds.size > 1
      ? visualOrderIds(data.items).filter((id) => selectedIds.has(id))
      : [sourceId]

    // Se o alvo for uma das linhas em movimento, ou descendente de alguma
    // delas, cancela a operação inteira (criaria ciclo) — mais seguro que
    // mover só as linhas "válidas" e confundir quem arrastou o grupo.
    if (movingIds.some((id) => id === target.id || isSelfOrDescendant(data.items, target.id, id))) return

    runMutation(async () => {
      if (target.zone === "inside") {
        for (const id of movingIds) await updateItemV2(id, projectId, { parentId: target.id })
        const projected = data.items.map((i) => (movingIds.includes(i.id) ? { ...i, parentId: target.id } : i))
        const kidsAfter = siblingsOf(projected, target.id)
        const alreadyChildren = kidsAfter.filter((k) => !movingIds.includes(k.id))
        const movedOrdered = movingIds
          .map((id) => kidsAfter.find((k) => k.id === id))
          .filter((k): k is ItemV2 => !!k)
        await reorderItemsV2(projectId, [...alreadyChildren.map((k) => k.id), ...movedOrdered.map((k) => k.id)])
        setExpanded((prev) => new Set(prev).add(target.id))
      } else {
        const targetItem = data.items.find((i) => i.id === target.id)
        const newParentId = targetItem ? targetItem.parentId : null
        for (const id of movingIds) await updateItemV2(id, projectId, { parentId: newParentId })
        const projected = data.items
          .map((i) => (movingIds.includes(i.id) ? { ...i, parentId: newParentId } : i))
          .filter((i) => !movingIds.includes(i.id))
        const sibs = siblingsOf(projected, newParentId)
        const idx = sibs.findIndex((s) => s.id === target.id)
        const insertAt = target.zone === "before" ? idx : idx + 1
        const finalIds = [...sibs.slice(0, insertAt).map((s) => s.id), ...movingIds, ...sibs.slice(insertAt).map((s) => s.id)]
        await reorderItemsV2(projectId, finalIds)
      }
      await refreshData()
    })
  }

  function handleRowDragEnd() {
    setDragRowId(null)
    setDropTarget(null)
  }

  const roots = sortedSiblingsOf(data.items, null, sort, membersById)
  // Mover/indentar/promover só fazem sentido com exatamente 1 linha marcada.
  const selectedItem = selectedIds.size === 1 ? data.items.find((i) => i.id === [...selectedIds][0]) ?? null : null

  function handleToggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const rowHandlers: RowHandlers = {
    data, expanded, onToggle: toggle, onUpdate: handleUpdate, onDeps: handleDeps, onDelete: handleDelete,
    onDuplicate: handleDuplicate, onAddAbove: handleAddAbove, onAddChild: handleAddChild, onEditTitle: handleEditTitle,
    selectedIds, onSelect: handleToggleSelect, sort, conflictByItem,
    colOrder: visibleColOrder, colWidths, titleWidth, members: allMembers, membersById, baselineByItem,
    dragRowId, dropTarget, onRowDragStart: handleRowDragStart, onRowDragOver: handleRowDragOver,
    onRowDrop: handleRowDrop, onRowDragEnd: handleRowDragEnd,
    onPersonLinked: handlePersonLinked,
  }

  return (
    <div className="h-full flex flex-col text-slate-700" style={{ background: "#F8F9FC" }}>
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
      <div className="shrink-0 px-5 py-4 border-b border-slate-200 bg-white flex items-center gap-6 flex-wrap">
        <Stat label="Itens" value={data.items.length} />
        <Stat label="Início" value={fmtDateLong(data.projectStartDate)} />
        <Stat label="Término" value={fmtDateLong(data.projectEndDate)} />
        <Stat label="Conflitos" value={data.conflicts.length} color={data.conflicts.length > 0 ? "#D97706" : undefined} />
        <Stat
          label="Go Live"
          value={fmtDateLong(goLiveDate)}
          color={goLiveDate ? "#7B2FBE" : undefined}
        />
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

      {/* Resumo financeiro — soma direta das colunas Custo Orçado/Custo
          Real de toda a árvore (custoSummary acima). Pedido direto: ver o
          gasto do projeto de relance, sem precisar abrir Indicadores (que
          mostra o mesmo número, só que dentro de um painel de KPIs bem
          mais denso — aqui é o resumo rápido, junto do cronograma em si,
          onde o custo é lançado linha a linha). Fundo em gradiente leve
          só pra diferenciar visualmente da barra de status acima, sem
          brigar com o roxo/azul da marca. */}
      <div
        className="shrink-0 px-5 py-3 border-b border-slate-200 flex items-center gap-3 flex-wrap"
        style={{ background: "linear-gradient(90deg, #FAF5FF, #F5F9FF)" }}
      >
        <CostCard
          icon={Wallet}
          label="Custo Orçado"
          value={costSummary.hasData ? fmtBRL(costSummary.budgeted) : "—"}
          color="#7B2FBE"
        />
        <CostCard
          icon={Receipt}
          label="Custo Real"
          value={costSummary.hasData ? fmtBRL(costSummary.actual) : "—"}
          color="#2463FF"
        />
        {costSummary.hasData ? (
          <CostCard
            icon={costSummary.delta >= 0 ? TrendingUp : TrendingDown}
            label={costSummary.delta >= 0 ? "Economia" : "Estouro de orçamento"}
            value={fmtBRL(Math.abs(costSummary.delta))}
            color={costSummary.delta >= 0 ? "#10B981" : "#EF4444"}
            sublabel={
              costSummary.budgeted > 0
                ? `${Math.abs(Math.round((costSummary.delta / costSummary.budgeted) * 100))}% ${costSummary.delta >= 0 ? "abaixo" : "acima"} do orçado`
                : undefined
            }
          />
        ) : (
          <CostCard icon={Minus} label="Economia / Estouro" value="—" color="#94A3B8" />
        )}
      </div>

      {/* Barra de ferramentas — agrupada por finalidade (histórico,
          produtividade, compartilhamento, colunas) em "cartões" leves, em
          vez de uma fileira única de botões idênticos encostados uns nos
          outros. `flex-wrap` com respiro vertical: numa tela mais estreita
          quebra em duas linhas organizadas, nunca espremido. O bloco de
          reestruturação (mover/indentar) fica à direita, agindo sobre o
          item selecionado (círculo cinza na frente da linha) — arrastar
          pela alcinha (⠿) também reestrutura, direto na linha. */}
      <div className="shrink-0 px-5 py-2.5 border-b border-slate-200 bg-white flex items-center flex-wrap gap-2">
        <ToolbarGroup>
          <ToolbarBtn ghost disabled={!hasUndo} onClick={handleUndo} title="Voltar — desfaz a última alteração feita">
            <Undo2 className="w-3.5 h-3.5" />
          </ToolbarBtn>
          <ToolbarBtn ghost disabled={!hasRedo} onClick={handleRedo} title="Avançar — refaz a última alteração desfeita">
            <Redo2 className="w-3.5 h-3.5" />
          </ToolbarBtn>
        </ToolbarGroup>

        {/* Botão "Salvar" — segurança visual (pedido da PMO). Cada edição já
            salva sozinha ao sair do campo; isto não muda esse comportamento,
            só confirma na hora (ver handleManualSave). */}
        <ToolbarGroup>
          <ToolbarBtn ghost wide onClick={handleManualSave} title="Salvar — cada edição já salva sozinha ao sair do campo; isto só confirma agora">
            <Save className="w-3.5 h-3.5" /> Salvar
          </ToolbarBtn>
        </ToolbarGroup>

        {/* Status de salvamento — cada edição salva sozinha ao sair do
            campo (sem exigir clicar em "Salvar" pra valer); isto garante que
            uma falha NUNCA passa em silêncio (ver comentário em cima de
            `saveStatus`). */}
        {saveStatus === "saving" && (
          <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 px-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando…
          </span>
        )}
        {saveStatus === "saved" && (
          <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 px-1">
            <CircleCheck className="w-3.5 h-3.5" /> Tudo salvo
          </span>
        )}
        {saveStatus === "error" && saveError && (
          <span className="flex items-center gap-1.5 text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1">
            <CircleAlert className="w-3.5 h-3.5 shrink-0" />
            <span title={saveError.message}>Falha ao salvar</span>
            <button
              onClick={saveError.retry}
              className="ml-1 px-1.5 py-0.5 rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors"
            >
              Tentar de novo
            </button>
          </span>
        )}

        <ToolbarGroup>
          <ToolbarBtn ghost wide disabled={templates.length === 0} onClick={() => setTplModalOpen(true)} title="Aplicar um modelo de cronograma pronto a este projeto">
            <LayoutTemplate className="w-3.5 h-3.5" /> Modelo
          </ToolbarBtn>
          <ToolbarBtn ghost wide disabled={savingBaseline || data.items.length === 0} onClick={handleSaveBaseline} title="Congela o início/término planejado de hoje — compare depois nas colunas Início Base/Término Base">
            <BookmarkPlus className="w-3.5 h-3.5" /> {savingBaseline ? "Salvando…" : "Linha de Base"}
          </ToolbarBtn>
          <ToolbarBtn ghost wide onClick={handleOpenHistory} title="Ver quem alterou o quê e quando neste cronograma">
            <History className="w-3.5 h-3.5" /> Histórico
          </ToolbarBtn>
        </ToolbarGroup>
        {baselineMsg && <span className="text-[10px] font-bold text-[#7B2FBE]">{baselineMsg}</span>}

        <ToolbarGroup accent>
          <ToolbarBtn ghost wide disabled={exporting || data.items.length === 0} onClick={handleExportExcel} title="Exportar este cronograma para uma planilha Excel formatada">
            <FileSpreadsheet className="w-3.5 h-3.5" /> {exporting ? "Exportando…" : "Excel"}
          </ToolbarBtn>
          <ToolbarBtn ghost wide onClick={handleOpenPublicLink} title="Gerar um link público (sem login) para acompanhar este cronograma">
            <Link2 className="w-3.5 h-3.5" /> Link Público
          </ToolbarBtn>
          <DropdownMenu>
            <DropdownMenuTrigger
              title="Escolher quais colunas aparecem na grade — útil pra deixar mais enxuto numa reunião com cliente"
              className="h-7 px-2.5 gap-1.5 text-xs font-bold rounded-lg flex items-center text-[#7B2FBE] transition-colors hover:bg-white hover:shadow-sm"
            >
              <Columns3 className="w-3.5 h-3.5" /> Colunas
              {hiddenCols.length > 0 && (
                <span className="text-[9px] font-black rounded-full px-1.5 leading-4 bg-[#7B2FBE] text-white">{hiddenCols.length}</span>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60 max-h-96 overflow-y-auto">
              {colOrder.map((col) => (
                <DropdownMenuCheckboxItem
                  key={col}
                  checked={!hiddenCols.includes(col)}
                  onCheckedChange={() => toggleColVisibility(col)}
                >
                  {COL_LABELS[col]}
                </DropdownMenuCheckboxItem>
              ))}
              {hiddenCols.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setHiddenCols([])} className="text-[#7B2FBE] font-semibold">
                    Mostrar todas as colunas
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </ToolbarGroup>

        <div className="flex-1 min-w-4" />

        <ToolbarGroup>
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 px-1.5 max-w-[220px] truncate">
            {selectedIds.size === 0
              ? "Selecione uma linha ou arraste ⠿"
              : selectedIds.size === 1
                ? <>Sel.: <span className="text-slate-600 normal-case">{selectedItem?.title}</span></>
                : `${selectedIds.size} linhas selecionadas`}
          </span>
          <ToolbarBtn ghost disabled={selectedIds.size === 0 || sort.column !== null} onClick={() => handleMoveSelection(-1)} title={sort.column ? "Limpe a ordenação da coluna para reestruturar manualmente" : selectedIds.size > 1 ? "Mover as linhas selecionadas para cima" : "Mover para cima"}><ArrowUp className="w-3.5 h-3.5" /></ToolbarBtn>
          <ToolbarBtn ghost disabled={selectedIds.size === 0 || sort.column !== null} onClick={() => handleMoveSelection(1)} title={sort.column ? "Limpe a ordenação da coluna para reestruturar manualmente" : selectedIds.size > 1 ? "Mover as linhas selecionadas para baixo" : "Mover para baixo"}><ArrowDown className="w-3.5 h-3.5" /></ToolbarBtn>
          <ToolbarBtn ghost disabled={!selectedItem || sort.column !== null} onClick={() => selectedItem && handleIndent(selectedItem)} title={sort.column ? "Limpe a ordenação da coluna para reestruturar manualmente" : selectedIds.size > 1 ? "Indentar exige exatamente 1 linha selecionada" : "Indentar (virar filho do anterior)"}><IndentIncrease className="w-3.5 h-3.5" /></ToolbarBtn>
          <ToolbarBtn ghost disabled={!selectedItem || selectedItem.parentId === null || sort.column !== null} onClick={() => selectedItem && handleOutdent(selectedItem)} title={sort.column ? "Limpe a ordenação da coluna para reestruturar manualmente" : selectedIds.size > 1 ? "Promover exige exatamente 1 linha selecionada" : "Promover (sair do grupo)"}><IndentDecrease className="w-3.5 h-3.5" /></ToolbarBtn>
        </ToolbarGroup>

        {selectedIds.size > 1 && (
          <ToolbarGroup>
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 px-1.5 whitespace-nowrap">
              Responsável p/ as {selectedIds.size}:
            </span>
            <div className="w-40">
              <PeoplePicker
                key={`bulk-resp:${selectedIds.size}`}
                placeholder="Definir responsável…"
                compact
                onSelect={(person) => {
                  handlePersonLinked(person)
                  handleBulkAssignResponsavel({ responsavelId: person.id, responsavelNome: null }, person.name)
                }}
                onFreeText={(typed) => {
                  if (typed === "") return
                  const match = allMembers.find((m) => m.name.toLowerCase() === typed.toLowerCase())
                  if (match) handleBulkAssignResponsavel({ responsavelId: match.id, responsavelNome: null }, match.name)
                  else handleBulkAssignResponsavel({ responsavelId: null, responsavelNome: typed }, typed)
                }}
              />
            </div>
            <ToolbarBtn ghost onClick={() => setSelectedIds(new Set())} title="Limpar seleção"><X className="w-3.5 h-3.5" /></ToolbarBtn>
          </ToolbarGroup>
        )}
        {sort.column && (
          <button onClick={() => setSort({ column: null, dir: "asc" })} className="text-[10px] font-bold text-slate-400 hover:text-[#7B2FBE]">
            Limpar ordenação
          </button>
        )}
      </div>

      {/* Região com rolagem própria (vertical E horizontal) para o corpo da
          grade — antes, esta área não tinha altura própria: crescia com
          as N linhas do cronograma e quem rolava a página inteira era o
          wrapper lá em cima (app/(dashboard)/projects/[id]/schedule/
          page.tsx), então a barra de rolagem horizontal (overflow-x-auto)
          ficava grudada no fim de TODAS as linhas — com 79 itens, isso é
          bem abaixo da dobra, então na prática não existia jeito visível
          de rolar pros lados sem antes descer a página inteira até o
          fim. Agora esta div é a única coisa que rola (flex-1 min-h-0
          preenche o espaço restante abaixo da barra de ferramentas) e o
          cabeçalho das colunas fica `sticky` no topo dela, então tanto a
          barra vertical quanto a horizontal ficam sempre à mão, na borda
          da tela, igual Excel/Google Sheets. */}
      <div className="flex-1 min-h-0 overflow-auto">
        <div style={{ minWidth: gridMinWidth }}>
          {/* Column headers — clique ordena; arraste a mãozinha (✥) para
              reordenar a coluna; arraste a borda direita para redimensionar.
              `sticky top-0` exige fundo opaco (bg-slate-50) pra não deixar
              as linhas "passarem por baixo" visualmente ao rolar. */}
          <div className="sticky top-0 z-10 flex items-center px-4 py-2 border-b border-slate-200 bg-slate-50 text-[9px] font-black uppercase tracking-widest text-slate-400">
            <div className="shrink-0" style={{ width: GUTTER_WIDTH }} />
            <div className="relative shrink-0" style={{ width: titleWidth }}>
              <SortableHeaderLabel label="Atividade" column="title" sort={sort} onSort={toggleSort} />
              <ColResizeHandle width={titleWidth} onResize={(w) => setTitleWidth(w)} />
            </div>
            {visibleColOrder.map((col) => (
              <div
                key={col}
                className="relative flex items-center gap-1 group/col shrink-0"
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
          {roots.length > 0 && (
            <div className={`bg-white ${pending ? "opacity-60 pointer-events-none transition-opacity" : "transition-opacity"}`}>
              {roots.map((item) => <RowGroup key={item.id} item={item} depth={0} {...rowHandlers} />)}
            </div>
          )}
        </div>

        {roots.length === 0 && (
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

// Cartão do resumo financeiro (Custo Orçado/Real/Economia) — mesmo padrão
// visual "ícone num círculo + rótulo + valor" usado nos indicadores
// financeiros de app/(dashboard)/projects/[id]/indicators/indicators-client.tsx,
// só que compacto o bastante pra caber numa fileira dentro do Cronograma.
function CostCard({ icon: Icon, label, value, color, sublabel }: {
  icon: React.ElementType
  label: string
  value: string
  color: string
  sublabel?: string
}) {
  return (
    <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-white/70 backdrop-blur-sm border border-white shadow-sm min-w-[168px]">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}1A` }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div className="min-w-0 leading-tight">
        <p className="text-[9px] uppercase tracking-widest text-slate-400 font-bold">{label}</p>
        <p className="text-sm font-black truncate" style={{ color }}>{value}</p>
        {sublabel && <p className="text-[9px] font-bold" style={{ color }}>{sublabel}</p>}
      </div>
    </div>
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
// Antes era um <div className="absolute"> desenhado à mão — numa linha perto
// do fim da grade (rolada até o fundo), o menu abria pra baixo e ficava
// cortado pelo overflow do container rolável, sem espaço pra rolar mais e
// revelar o resto (relatado pelo usuário: "abre as opções mas fica para
// baixo da tela"). Trocado pelo DropdownMenu (base-ui) já usado no "Colunas"
// da barra de ferramentas — ele renderiza num portal (fora do container
// rolável) e já vira o menu pra cima sozinho quando não cabe embaixo.
function AddMenuButton({ item, onDuplicate, onAddAbove, onAddChild }: {
  item: ItemV2
  onDuplicate: (item: ItemV2) => void
  onAddAbove: (item: ItemV2) => void
  onAddChild: (item: ItemV2) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger title="Adicionar / duplicar">
        <CirclePlus className="w-3.5 h-3.5 text-emerald-400 hover:text-emerald-600 transition-colors" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuItem onClick={() => onDuplicate(item)}>Duplicar linha</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onAddAbove(item)}>Adicionar nova linha acima</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onAddChild(item)}>Adicionar nova linha como última filha</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
  selectedIds: Set<string>
  onSelect: (id: string) => void
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
  // Chamado sempre que um PeoplePicker/PeopleMultiPicker vincula/cria
  // alguém pela busca do Azure AD — mantém membersById atualizado nesta
  // sessão sem precisar recarregar a página (ver linkedFromDirectory).
  onPersonLinked: (person: { id: string; name: string }) => void
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
  const selected = h.selectedIds.has(item.id)
  // Arrastando um grupo selecionado (não só a linha sob o cursor): todas as
  // linhas do grupo esmaecem junto, pra ficar claro que o bloco inteiro vai
  // se mover — não só a que a mãozinha está tocando.
  const isDragging = h.dragRowId !== null && (
    h.dragRowId === item.id ||
    (h.selectedIds.has(h.dragRowId) && h.selectedIds.size > 1 && selected)
  )
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
        <button onClick={() => h.onSelect(item.id)} title="Selecionar (marque várias para atribuir responsável em lote)">
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
      <div className="flex items-center gap-1.5 shrink-0" style={{ width: h.titleWidth, paddingLeft: depth * 20 }}>
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
        {!hasChildren && item.critical && (
          <span title="Caminho crítico — sem folga, um atraso aqui atrasa o projeto inteiro">
            <Flame className="w-3.5 h-3.5 text-red-600 shrink-0" />
          </span>
        )}
      </div>

      {/* Colunas configuráveis (ordem e largura vêm do estado do cliente) */}
      {h.colOrder.map((col) => (
        <div key={col} style={{ width: h.colWidths[col] }} className={`shrink-0 overflow-hidden ${COL_ALIGN[col] === "center" ? "text-center" : ""}`}>
          {renderCell(col, item, hasChildren, h)}
        </div>
      ))}
    </div>
  )
}

// Célula de data compartilhada pelas 5 colunas editáveis (Início, Término,
// Início/Término Real, Restrição) — antes cada uma só tinha o ícone nativo
// do navegador (idêntico e minúsculo nas 5), causando a confusão relatada
// ("não sei em qual clico"). Agora cada família de data tem um ícone e uma
// cor própria — planejado (violeta), real (verde, mesma leitura de "Real"
// já usada no resto do app) e restrição (âmbar) — clicável (abre o seletor
// nativo via showPicker quando o navegador suporta) além de continuar
// editável digitando direto. Também centraliza a validação/reversão de data
// inválida, que se repetia igual nas 5 colunas.
const DATE_CELL_STYLE = {
  planned:    { Icon: CalendarDays,    color: "text-violet-400" },
  real:       { Icon: CalendarCheck2,  color: "text-emerald-500" },
  constraint: { Icon: CalendarClock,   color: "text-amber-500" },
} as const

function DateCell({ value, kind, title, onCommit }: {
  value: string | null
  kind: keyof typeof DATE_CELL_STYLE
  title?: string
  onCommit: (v: string | null) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const { Icon, color } = DATE_CELL_STYLE[kind]

  function openPicker() {
    const el = ref.current
    if (!el) return
    // showPicker() é recente (Chrome/Edge); em navegadores sem suporte,
    // cai pro comportamento normal de focar o campo.
    const withPicker = el as HTMLInputElement & { showPicker?: () => void }
    if (typeof withPicker.showPicker === "function") {
      try { withPicker.showPicker() } catch { el.focus() }
    } else {
      el.focus()
    }
  }

  return (
    <div className="flex items-center gap-1 w-full group/date">
      <button
        type="button"
        tabIndex={-1}
        onClick={openPicker}
        title={title}
        className={`shrink-0 ${color} opacity-60 group-hover/date:opacity-100 transition-opacity`}
      >
        <Icon className="w-3 h-3" />
      </button>
      <input
        ref={ref}
        key={`${kind}:${value}`}
        type="date"
        min={DATE_MIN}
        max={DATE_MAX}
        defaultValue={value ?? ""}
        title={title}
        onBlur={(e) => {
          if (!isSaneDateInput(e.target.value)) {
            e.target.value = value ?? "" // reverte — ano com formato inválido
            return
          }
          const v = e.target.value || null
          if (v !== value) onCommit(v)
        }}
        className="bg-transparent outline-none text-[10px] text-slate-700 w-full text-right pr-0.5 rounded focus:bg-violet-50"
      />
    </div>
  )
}

// ─── Custo (Orçado/Real) — formato R$ brasileiro ─────────────────────────

function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

// Aceita tanto "2520.5" (o que a própria célula mostra ao entrar em edição)
// quanto "2.520,50" colado de outro lugar já no formato brasileiro — só um
// separador (`,` OU `.`) vira decimal; múltiplos pontos/vírgulas antes do
// último são tratados como separador de milhar e descartados.
function parseBRLInput(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === "") return null
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed
  const n = parseFloat(normalized)
  return Number.isNaN(n) ? null : n
}

// Mostra "R$ 1.234,56" (locale pt-BR) parada; ao focar, troca pro número cru
// (mais fácil de editar/apagar) e reformata ao sair do campo — mesmo
// princípio de "exibição ≠ edição" do DateCell acima, adaptado pra moeda
// (não dá pra usar <input type="number"> com prefixo/milhar formatado).
function CurrencyCell({ value, onCommit, highlight, title }: {
  value: number | null
  onCommit: (v: number | null) => void
  highlight?: boolean
  title?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")

  return (
    <input
      type="text"
      inputMode="decimal"
      placeholder="—"
      title={title}
      value={editing ? draft : value !== null ? fmtBRL(value) : ""}
      onFocus={() => { setDraft(value !== null ? String(value) : ""); setEditing(true) }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false)
        const v = parseBRLInput(draft)
        if (v !== value) onCommit(v)
      }}
      className={`w-24 text-center bg-transparent outline-none text-xs rounded border-b border-transparent focus:border-[#7B2FBE] focus:bg-violet-50 ${highlight ? "text-red-600 font-bold" : "text-slate-700"}`}
    />
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
        <DateCell
          value={item.inicioEstimado}
          kind="planned"
          title={
            hasChildren
              ? "Data de grupo — as subatividades definem o período; um valor digitado aqui é descartado ao salvar"
              : item.schedulingMode === "auto" && hasPredecessor(item.id, h.data)
                ? "Data controlada pelo predecessor — um valor digitado aqui é descartado ao salvar"
                : "Início planejado"
          }
          onCommit={(v) => h.onUpdate(item.id, { inicioEstimado: v })}
        />
      )

    case "termino":
      return (
        <DateCell
          value={item.terminoEstimado}
          kind="planned"
          title={hasChildren ? "Data de grupo — as subatividades definem o período; um valor digitado aqui é descartado ao salvar" : "Editar aqui recalcula a duração (início fica fixo)"}
          onCommit={(v) => h.onUpdate(item.id, { terminoEstimado: v })}
        />
      )

    case "inicioReal":
      return (
        <DateCell
          value={item.inicioReal}
          kind="real"
          title="Data em que a atividade realmente começou — preencher muda o Status para Em Andamento"
          onCommit={(v) => h.onUpdate(item.id, {
            inicioReal: v,
            // Preencher o início real é o mesmo sinal de "começou de
            // verdade" — muda o Status automaticamente (pedido do time).
            ...(v !== null && { status: "EM_ANDAMENTO" }),
          })}
        />
      )

    case "terminoReal":
      return (
        <DateCell
          value={item.terminoReal}
          kind="real"
          title="Data em que a atividade realmente terminou — preencher muda o Status para Concluído e o % para 100"
          onCommit={(v) => h.onUpdate(item.id, {
            terminoReal: v,
            // Preencher o término real é o mesmo sinal de "terminou de
            // verdade" — muda Status e % automaticamente (pedido do time).
            ...(v !== null && { status: "CONCLUIDO", percentualCompleto: 100 }),
          })}
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

    case "folga":
      if (item.totalFloatDays === null) return <span className="text-xs text-slate-300">—</span>
      return item.critical ? (
        <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600" title="Caminho crítico — sem folga">
          <Flame className="w-3 h-3" /> 0
        </span>
      ) : (
        <span className="text-xs text-slate-500">{item.totalFloatDays}d</span>
      )

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
        <DateCell
          value={item.constraintDate}
          kind="constraint"
          title="Não iniciar antes de — data mínima de início, mesmo que o predecessor calcule uma data mais cedo"
          onCommit={(v) => h.onUpdate(item.id, { constraintDate: v, constraintType: v !== null ? "nao_iniciar_antes_de" : null })}
        />
      )
    }

    case "responsavel": {
      // Busca no diretório do Azure AD (Microsoft Graph, components/kronex/
      // people-picker.tsx) — digitar mostra sugestões com foto/cargo da
      // empresa inteira, não só de quem já é usuário do Kronex. Escolher um
      // resultado cria/vincula o usuário local automaticamente (grava
      // responsavelId de verdade). Continua aceitando nome digitado sem
      // selecionar nada (ex.: prestador que não está no Azure AD): cai no
      // mesmo fallback de sempre — bate com um membro já cadastrado vira FK,
      // senão salva como texto solto (responsavelNome).
      const currentName = item.responsavelId ? (h.membersById.get(item.responsavelId) ?? "") : (item.responsavelNome ?? "")
      return (
        <PeoplePicker
          key={`resp:${item.id}:${item.responsavelId}:${item.responsavelNome}`}
          defaultValue={currentName}
          placeholder="Sem responsável"
          compact
          onSelect={(person) => { h.onPersonLinked(person); h.onUpdate(item.id, { responsavelId: person.id }) }}
          onFreeText={(typed) => {
            if (typed === "") {
              h.onUpdate(item.id, { responsavelId: null })
              return
            }
            const match = h.members.find((m) => m.name.toLowerCase() === typed.toLowerCase())
            if (match) h.onUpdate(item.id, { responsavelId: match.id })
            else h.onUpdate(item.id, { responsavelNome: typed })
          }}
        />
      )
    }

    case "participantes":
      // Dois grupos: usuários de verdade (participanteIds, achados/criados
      // via busca no Azure AD — mesma fonte do Responsável) e texto livre
      // (participantes) para fornecedor/terceiro fora do diretório da
      // empresa. Ver components/kronex/people-multi-picker.tsx.
      return (
        <PeopleMultiPicker
          linkedIds={item.participanteIds}
          resolveName={(id) => h.membersById.get(id)}
          freeText={item.participantes}
          onChange={({ linkedIds, freeText }) => h.onUpdate(item.id, { participanteIds: linkedIds, participantes: freeText })}
          onPersonLinked={h.onPersonLinked}
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

    // Custo orçado/real (R$) — paridade com o cronograma antigo. Só
    // item-folha (grupo soma os filhos no Indicadores; ver comentário em
    // ItemV2.budgetedCost, lib/actions/schedule-v2.ts).
    case "custoOrcado":
      return !hasChildren ? (
        <CurrencyCell
          value={item.budgetedCost}
          onCommit={(v) => h.onUpdate(item.id, { budgetedCost: v })}
        />
      ) : <span className="text-[10px] text-slate-300">—</span>

    case "custoReal": {
      if (hasChildren) return <span className="text-[10px] text-slate-300">—</span>
      const over = item.budgetedCost !== null && item.actualCost !== null && item.actualCost > item.budgetedCost
      return (
        <CurrencyCell
          value={item.actualCost}
          highlight={over}
          title={over ? "Custo real acima do orçado" : undefined}
          onCommit={(v) => h.onUpdate(item.id, { actualCost: v })}
        />
      )
    }

    default:
      return null
  }
}
