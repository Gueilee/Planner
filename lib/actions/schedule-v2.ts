"use server"

// Server Actions do motor de Cronograma v2 (beta/teste) — conecta a camada
// de domínio pura (lib/domain/schedule-v2) às tabelas isoladas
// ScheduleV2Item/ScheduleV2Dependency/WorkCalendarV2 (ver plano de
// implementação e CLAUDE.md). Não toca ScheduleTask/WbsArea nem nenhum
// consumidor do cronograma atual.

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { recalcular } from "@/lib/domain/schedule-v2/scheduler"
import { workingDaysBetween } from "@/lib/domain/schedule-v2/calendar"
import { rollupGroups, rollupProgress, projectEndDate as computeProjectEndDate } from "@/lib/domain/schedule-v2/rollup"
import { parsePredecessors, dropUnknownCodes, wouldCreateCycle } from "@/lib/domain/schedule-v2/dependency-parser"
import type { Dependency, LinkType, SchedItem, SchedulingMode, WorkCalendar } from "@/lib/domain/schedule-v2/types"

// ─── Acesso ─────────────────────────────────────────────────────────────────
// Feature em teste/beta — restrita ao mesmo padrão CAN_MANAGE já usado em
// outras telas do app (lib/actions/templates.ts, lib/actions/s-curve.ts),
// em vez de criar uma chave de permissão nova só para isto.

const CAN_MANAGE_V2 = new Set(["ADMIN", "PROJECT_MANAGER"])

async function requireAccess() {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")
  if (!CAN_MANAGE_V2.has(session.user.role ?? "")) {
    throw new Error("Cronograma v2 (beta) é restrito a Administradores e Gerentes de Projeto.")
  }
  return session
}

// ─── Datas: Date (Prisma) <-> string "yyyy-MM-dd" (domínio) ─────────────────

function dstr(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null
}

function ddate(s: string | null | undefined): Date | null {
  return s ? new Date(`${s}T00:00:00.000Z`) : null
}

// ─── Tipos expostos à UI ──────────────────────────────────────────────────

export type ItemV2 = {
  id: string
  code: string
  projectId: string
  parentId: string | null
  order: number
  title: string
  status: string
  duracaoDiasUteis: number | null
  inicioEstimado: string | null
  terminoEstimado: string | null
  inicioReal: string | null
  terminoReal: string | null
  esforcoEstimadoH: number
  esforcoRealH: number
  percentualCompleto: number
  schedulingMode: SchedulingMode
  constraintType: string | null
  constraintDate: string | null
  isGroup: boolean
}

export type DependencyV2 = {
  id: string
  successorId: string
  predecessorId: string
  type: LinkType
  lagDiasUteis: number
}

export type ConflictV2 = {
  itemId: string
  suggestedInicio: string | null
  suggestedTermino: string | null
}

export type ScheduleV2Payload = {
  items: ItemV2[]
  dependencies: DependencyV2[]
  conflicts: ConflictV2[]
  projectEndDate: string | null
}

// ─── Carregamento de estado (Postgres -> domínio) ────────────────────────────

type ItemRow = Awaited<ReturnType<typeof db.scheduleV2Item.findMany>>[number]
type DepRow = Awaited<ReturnType<typeof db.scheduleV2Dependency.findMany>>[number]

function toSchedItem(r: ItemRow): SchedItem {
  return {
    id: r.id,
    parentId: r.parentId,
    duracaoDiasUteis: r.duracaoDiasUteis,
    inicioEstimado: dstr(r.inicioEstimado),
    terminoEstimado: dstr(r.terminoEstimado),
    schedulingMode: r.schedulingMode as SchedulingMode,
  }
}

function toDependency(d: DepRow): Dependency {
  return { successorId: d.successorId, predecessorId: d.predecessorId, type: d.type as LinkType, lag: d.lagDiasUteis }
}

async function loadCalendar(projectId: string): Promise<WorkCalendar> {
  const cal = await db.workCalendarV2.findUnique({ where: { projectId }, include: { holidays: true } })
  if (!cal) return { diasUteis: [1, 2, 3, 4, 5], holidays: [] }
  return {
    diasUteis: cal.diasUteis,
    holidays: cal.holidays.map((h) => ({ date: dstr(h.dia)!, name: h.descricao ?? undefined })),
  }
}

async function loadRows(projectId: string): Promise<{ rows: ItemRow[]; deps: DepRow[] }> {
  const [rows, deps] = await Promise.all([
    db.scheduleV2Item.findMany({ where: { projectId }, orderBy: { order: "asc" } }),
    db.scheduleV2Dependency.findMany({ where: { successor: { projectId } } }),
  ])
  return { rows, deps }
}

function groupIdSet(rows: ItemRow[]): Set<string> {
  const childrenCount = new Map<string, number>()
  for (const r of rows) {
    if (r.parentId) childrenCount.set(r.parentId, (childrenCount.get(r.parentId) ?? 0) + 1)
  }
  return new Set([...childrenCount.entries()].filter(([, n]) => n > 0).map(([id]) => id))
}

// ─── Desfazer (1 nível, igual a Ctrl+Z) ─────────────────────────────────────
// Guarda o estado completo (itens + dependências) de ANTES da mutação que
// está prestes a acontecer. Cada ação mutante chama isto no início, antes
// de qualquer escrita — sobrescreve o snapshot anterior (não é uma pilha
// profunda, é "desfazer a última alteração", por decisão de escopo).

type ItemSnapshotRow = {
  id: string; code: string; parentId: string | null; order: number; title: string; status: string
  duracaoDiasUteis: number | null
  inicioEstimado: string | null; terminoEstimado: string | null
  inicioReal: string | null; terminoReal: string | null
  esforcoEstimadoH: number; esforcoRealH: number; percentualCompleto: number
  schedulingMode: string; constraintType: string | null; constraintDate: string | null
}
type DepSnapshotRow = { id: string; successorId: string; predecessorId: string; type: string; lagDiasUteis: number }
type SnapshotPayload = { items: ItemSnapshotRow[]; dependencies: DepSnapshotRow[] }

async function saveSnapshot(projectId: string): Promise<void> {
  const { rows, deps } = await loadRows(projectId)
  const payload: SnapshotPayload = {
    items: rows.map((r) => ({
      id: r.id, code: r.code, parentId: r.parentId, order: r.order, title: r.title, status: r.status,
      duracaoDiasUteis: r.duracaoDiasUteis,
      inicioEstimado: dstr(r.inicioEstimado), terminoEstimado: dstr(r.terminoEstimado),
      inicioReal: dstr(r.inicioReal), terminoReal: dstr(r.terminoReal),
      esforcoEstimadoH: r.esforcoEstimadoH, esforcoRealH: r.esforcoRealH, percentualCompleto: r.percentualCompleto,
      schedulingMode: r.schedulingMode, constraintType: r.constraintType, constraintDate: dstr(r.constraintDate),
    })),
    dependencies: deps.map((d) => ({
      id: d.id, successorId: d.successorId, predecessorId: d.predecessorId, type: d.type, lagDiasUteis: d.lagDiasUteis,
    })),
  }
  await db.scheduleV2Snapshot.upsert({
    where: { projectId },
    update: { payload: JSON.stringify(payload) },
    create: { projectId, payload: JSON.stringify(payload) },
  })
}

export async function hasUndoV2(projectId: string): Promise<boolean> {
  await requireAccess()
  const snap = await db.scheduleV2Snapshot.findUnique({ where: { projectId }, select: { id: true } })
  return snap !== null
}

export async function undoLastChangeV2(projectId: string): Promise<{ ok: boolean; message?: string }> {
  await requireAccess()

  const snap = await db.scheduleV2Snapshot.findUnique({ where: { projectId } })
  if (!snap) return { ok: false, message: "Nada para desfazer." }

  const payload = JSON.parse(snap.payload) as SnapshotPayload

  await db.$transaction(async (tx) => {
    await tx.scheduleV2Dependency.deleteMany({ where: { successor: { projectId } } })
    await tx.scheduleV2Item.deleteMany({ where: { projectId } })

    // Passe 1: cria todos sem parentId — evita depender da ordem (um filho
    // pode vir antes do pai no array serializado).
    for (const it of payload.items) {
      await tx.scheduleV2Item.create({
        data: {
          id: it.id, projectId, code: it.code, parentId: null, order: it.order, title: it.title, status: it.status,
          duracaoDiasUteis: it.duracaoDiasUteis,
          inicioEstimado: ddate(it.inicioEstimado), terminoEstimado: ddate(it.terminoEstimado),
          inicioReal: ddate(it.inicioReal), terminoReal: ddate(it.terminoReal),
          esforcoEstimadoH: it.esforcoEstimadoH, esforcoRealH: it.esforcoRealH, percentualCompleto: it.percentualCompleto,
          schedulingMode: it.schedulingMode, constraintType: it.constraintType, constraintDate: ddate(it.constraintDate),
        },
      })
    }
    // Passe 2: religa a hierarquia.
    for (const it of payload.items) {
      if (it.parentId) await tx.scheduleV2Item.update({ where: { id: it.id }, data: { parentId: it.parentId } })
    }
    for (const d of payload.dependencies) {
      await tx.scheduleV2Dependency.create({
        data: { id: d.id, successorId: d.successorId, predecessorId: d.predecessorId, type: d.type, lagDiasUteis: d.lagDiasUteis },
      })
    }
    await tx.scheduleV2Snapshot.delete({ where: { projectId } })
  })

  revalidatePath(`/projects/${projectId}/schedule-v2`)
  return { ok: true }
}

async function nextCode(projectId: string): Promise<string> {
  const rows = await db.scheduleV2Item.findMany({ where: { projectId }, select: { code: true } })
  const max = rows.reduce((m, r) => {
    const n = parseInt(r.code.replace(/^A/i, ""), 10)
    return Number.isFinite(n) && n > m ? n : m
  }, 0)
  return `A${max + 1}`
}

// ─── Núcleo: recalcula (scheduler) + rollup (grupos) e persiste ─────────────
// Todo fluxo do CLAUDE.md §6 (criar/editar data ou duração, criar/editar/
// remover dependência, mover/reparentar, mudar schedulingMode/constraint)
// termina chamando isto — recalcula toda a árvore do projeto (escala de
// projeto de teste, sem necessidade de otimizar para milhares de itens).
async function recomputeAndPersist(
  projectId: string,
  changedItemIds: string[]
): Promise<{ conflicts: ConflictV2[]; cycleItemIds: string[] }> {
  const { rows, deps } = await loadRows(projectId)
  const cal = await loadCalendar(projectId)
  const groups = groupIdSet(rows)

  const leafRows = rows.filter((r) => !groups.has(r.id))
  const leafIds = new Set(leafRows.map((r) => r.id))
  const leafItems = leafRows.map(toSchedItem)
  const leafDeps = deps.filter((d) => leafIds.has(d.successorId) && leafIds.has(d.predecessorId)).map(toDependency)

  const { updates, cycleItemIds } = recalcular(
    leafItems,
    leafDeps,
    cal,
    changedItemIds.filter((id) => leafIds.has(id))
  )
  const updatesById = new Map(updates.map((u) => [u.itemId, u]))

  // Funde as datas recém-calculadas das folhas nos itens, para o rollup de
  // grupo (§3.7) refletir o estado mais atual, não o persistido antes.
  const merged: SchedItem[] = rows.map((r) => {
    const u = updatesById.get(r.id)
    return u
      ? { id: r.id, parentId: r.parentId, duracaoDiasUteis: r.duracaoDiasUteis, inicioEstimado: u.inicioEstimado, terminoEstimado: u.terminoEstimado, schedulingMode: r.schedulingMode as SchedulingMode }
      : toSchedItem(r)
  })
  const rolledDates = rollupGroups(merged)
  const rolledProgress = rollupProgress(rows.map((r) => ({ id: r.id, parentId: r.parentId, percentualCompleto: r.percentualCompleto })))

  const writes: { id: string; inicio: string | null; termino: string | null; progresso: number }[] = []
  for (const r of rows) {
    const isGroup = groups.has(r.id)
    const hasDeps = leafDeps.some((d) => d.successorId === r.id)

    let targetInicio: string | null
    let targetTermino: string | null
    let targetProgresso: number

    if (isGroup) {
      targetInicio = rolledDates.get(r.id)?.inicioEstimado ?? null
      targetTermino = rolledDates.get(r.id)?.terminoEstimado ?? null
      targetProgresso = rolledProgress.get(r.id) ?? r.percentualCompleto
    } else if (!hasDeps && r.duracaoDiasUteis === null) {
      // Não é grupo, não tem vínculo, não tem duração própria — sem base
      // legítima para uma data. Cobre o caso de um grupo que acabou de
      // ficar sem filhos (rule §3.7): a data que ele carregava era só o
      // rollup dos filhos, nunca "sua própria", e não deve sobreviver.
      targetInicio = null
      targetTermino = null
      targetProgresso = r.percentualCompleto
    } else {
      targetInicio = updatesById.get(r.id)?.inicioEstimado ?? dstr(r.inicioEstimado)
      targetTermino = updatesById.get(r.id)?.terminoEstimado ?? dstr(r.terminoEstimado)
      targetProgresso = r.percentualCompleto
    }

    const changed =
      targetInicio !== dstr(r.inicioEstimado) || targetTermino !== dstr(r.terminoEstimado) || targetProgresso !== r.percentualCompleto
    if (changed) writes.push({ id: r.id, inicio: targetInicio, termino: targetTermino, progresso: targetProgresso })
  }

  if (writes.length > 0) {
    await db.$transaction(
      writes.map((w) =>
        db.scheduleV2Item.update({
          where: { id: w.id },
          data: { inicioEstimado: ddate(w.inicio), terminoEstimado: ddate(w.termino), percentualCompleto: w.progresso },
        })
      )
    )
  }

  const conflicts: ConflictV2[] = updates
    .filter((u) => u.conflict)
    .map((u) => ({ itemId: u.itemId, suggestedInicio: u.suggestedInicio ?? null, suggestedTermino: u.suggestedTermino ?? null }))

  return { conflicts, cycleItemIds }
}

// ─── Leitura ──────────────────────────────────────────────────────────────

export async function getScheduleV2(projectId: string): Promise<ScheduleV2Payload> {
  await requireAccess()

  const { rows, deps } = await loadRows(projectId)
  const groups = groupIdSet(rows)

  // Sinaliza divergência de itens manuais sem persistir nada — leitura pura.
  const cal = await loadCalendar(projectId)
  const leafRows = rows.filter((r) => !groups.has(r.id))
  const leafIds = new Set(leafRows.map((r) => r.id))
  const leafItems = leafRows.map(toSchedItem)
  const leafDeps = deps.filter((d) => leafIds.has(d.successorId) && leafIds.has(d.predecessorId)).map(toDependency)
  const { updates } = recalcular(leafItems, leafDeps, cal, [...leafIds])
  const conflicts: ConflictV2[] = updates
    .filter((u) => u.conflict)
    .map((u) => ({ itemId: u.itemId, suggestedInicio: u.suggestedInicio ?? null, suggestedTermino: u.suggestedTermino ?? null }))

  const items: ItemV2[] = rows.map((r) => ({
    id: r.id,
    code: r.code,
    projectId: r.projectId,
    parentId: r.parentId,
    order: r.order,
    title: r.title,
    status: r.status,
    duracaoDiasUteis: r.duracaoDiasUteis,
    inicioEstimado: dstr(r.inicioEstimado),
    terminoEstimado: dstr(r.terminoEstimado),
    inicioReal: dstr(r.inicioReal),
    terminoReal: dstr(r.terminoReal),
    esforcoEstimadoH: r.esforcoEstimadoH,
    esforcoRealH: r.esforcoRealH,
    percentualCompleto: r.percentualCompleto,
    schedulingMode: r.schedulingMode as SchedulingMode,
    constraintType: r.constraintType,
    constraintDate: dstr(r.constraintDate),
    isGroup: groups.has(r.id),
  }))

  const dependencies: DependencyV2[] = deps.map((d) => ({
    id: d.id,
    successorId: d.successorId,
    predecessorId: d.predecessorId,
    type: d.type as LinkType,
    lagDiasUteis: d.lagDiasUteis,
  }))

  return { items, dependencies, conflicts, projectEndDate: computeProjectEndDate(rows.map(toSchedItem)) }
}

// ─── Criar ────────────────────────────────────────────────────────────────

export type CreateItemV2Input = {
  projectId: string
  parentId?: string | null
  title: string
  duracaoDiasUteis?: number | null
  esforcoEstimadoH?: number
  schedulingMode?: SchedulingMode
  constraintType?: string | null
  constraintDate?: string | null
}

export async function createItemV2(input: CreateItemV2Input): Promise<ItemV2> {
  await requireAccess()
  await saveSnapshot(input.projectId)

  const [maxOrder, code] = await Promise.all([
    db.scheduleV2Item.aggregate({ _max: { order: true }, where: { projectId: input.projectId, parentId: input.parentId ?? null } }),
    nextCode(input.projectId),
  ])

  // Item nasce sem datas (CLAUDE.md §3.10) — só ganha data ao ligar um
  // predecessor ou por edição manual (item de topo/âncora).
  const row = await db.scheduleV2Item.create({
    data: {
      projectId: input.projectId,
      code,
      parentId: input.parentId ?? null,
      title: input.title,
      duracaoDiasUteis: input.duracaoDiasUteis ?? null,
      esforcoEstimadoH: input.esforcoEstimadoH ?? 0,
      schedulingMode: input.schedulingMode ?? "auto",
      constraintType: input.constraintType ?? null,
      constraintDate: ddate(input.constraintDate),
      order: (maxOrder._max.order ?? -1) + 1,
    },
  })

  // Item novo não muda datas de ninguém, mas pode mudar a média de
  // progresso do grupo-pai (um filho a 0% entra na conta) — atualiza rollup.
  await recomputeAndPersist(input.projectId, [])
  revalidatePath(`/projects/${input.projectId}/schedule-v2`)

  return {
    id: row.id, code: row.code, projectId: row.projectId, parentId: row.parentId, order: row.order,
    title: row.title, status: row.status, duracaoDiasUteis: row.duracaoDiasUteis,
    inicioEstimado: null, terminoEstimado: null, inicioReal: null, terminoReal: null,
    esforcoEstimadoH: row.esforcoEstimadoH, esforcoRealH: row.esforcoRealH,
    percentualCompleto: row.percentualCompleto, schedulingMode: row.schedulingMode as SchedulingMode,
    constraintType: row.constraintType, constraintDate: dstr(row.constraintDate),
    isGroup: false,
  }
}

// ─── Atualizar ────────────────────────────────────────────────────────────

export type UpdateItemV2Input = Partial<{
  title: string
  duracaoDiasUteis: number | null
  inicioEstimado: string | null
  // Sem coluna própria — regra §3.3, término é sempre derivado de
  // início+duração. Editar este campo direto na UI é traduzido aqui para
  // uma nova `duracaoDiasUteis` (mesmo efeito de arrastar o fim da barra
  // no Artia), não para uma escrita direta na data.
  terminoEstimado: string | null
  inicioReal: string | null
  terminoReal: string | null
  esforcoEstimadoH: number
  esforcoRealH: number
  percentualCompleto: number
  status: string
  schedulingMode: SchedulingMode
  constraintType: string | null
  constraintDate: string | null
  parentId: string | null
  order: number
}>

export async function updateItemV2(
  id: string,
  projectId: string,
  data: UpdateItemV2Input
): Promise<{ conflicts: ConflictV2[]; cycleItemIds: string[] }> {
  await requireAccess()
  await saveSnapshot(projectId)

  const current = await db.scheduleV2Item.findUnique({ where: { id }, select: { id: true, inicioEstimado: true } })
  if (!current) throw new Error("Item não encontrado")

  const hasChildren = (await db.scheduleV2Item.count({ where: { parentId: id } })) > 0
  // Regra §3.7: grupo NÃO tem datas/progresso próprios — edição direta é
  // ignorada silenciosamente em vez de dar erro (evita travar a UI por um
  // clique num campo desabilitado).

  // Término não tem coluna própria (regra §3.3) — editar o campo na UI
  // vira uma nova duração, calculada a partir do início EFETIVO (o que o
  // usuário acabou de digitar nesta mesma chamada, se for o caso) e do
  // calendário de dias úteis do projeto (igual a "arrastar o fim da
  // barra" no Artia). Só se aplica a item-folha; num grupo, o cálculo é
  // descartado do mesmo jeito que início/duração diretos (rollup manda).
  let duracaoFromTermino: number | null | undefined
  if (!hasChildren && data.terminoEstimado !== undefined && data.duracaoDiasUteis === undefined) {
    if (data.terminoEstimado === null) {
      duracaoFromTermino = null // término apagado -> sem duração/data (§3.10)
    } else {
      const inicioEfetivo = data.inicioEstimado !== undefined ? data.inicioEstimado : dstr(current.inicioEstimado)
      if (inicioEfetivo) {
        const cal = await loadCalendar(projectId)
        const dias = workingDaysBetween(inicioEfetivo, data.terminoEstimado, cal) + 1
        duracaoFromTermino = Math.max(1, dias)
      }
      // sem início ainda: não há como derivar duração — ignora em silêncio
    }
  }

  await db.scheduleV2Item.update({
    where: { id },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(!hasChildren && data.duracaoDiasUteis !== undefined && { duracaoDiasUteis: data.duracaoDiasUteis }),
      ...(!hasChildren && duracaoFromTermino !== undefined && { duracaoDiasUteis: duracaoFromTermino }),
      ...(!hasChildren && data.inicioEstimado !== undefined && { inicioEstimado: ddate(data.inicioEstimado) }),
      ...(data.inicioReal !== undefined && { inicioReal: ddate(data.inicioReal) }),
      ...(data.terminoReal !== undefined && { terminoReal: ddate(data.terminoReal) }),
      ...(data.esforcoEstimadoH !== undefined && { esforcoEstimadoH: data.esforcoEstimadoH }),
      ...(data.esforcoRealH !== undefined && { esforcoRealH: data.esforcoRealH }),
      ...(!hasChildren && data.percentualCompleto !== undefined && { percentualCompleto: data.percentualCompleto }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.schedulingMode !== undefined && { schedulingMode: data.schedulingMode }),
      ...(data.constraintType !== undefined && { constraintType: data.constraintType }),
      ...(data.constraintDate !== undefined && { constraintDate: ddate(data.constraintDate) }),
      ...(data.parentId !== undefined && { parentId: data.parentId }),
      ...(data.order !== undefined && { order: data.order }),
    },
  })

  const result = await recomputeAndPersist(projectId, [id])
  revalidatePath(`/projects/${projectId}/schedule-v2`)
  return result
}

// ─── Excluir ──────────────────────────────────────────────────────────────

export async function deleteItemV2(id: string, projectId: string): Promise<{ deletedIds: string[] }> {
  await requireAccess()
  await saveSnapshot(projectId)

  // Sem CASCADE na auto-relação (mesmo motivo do ScheduleTask original:
  // Postgres não permite múltiplos caminhos de CASCADE ambíguos) — coleta
  // os descendentes manualmente antes de apagar.
  const all = await db.scheduleV2Item.findMany({ where: { projectId }, select: { id: true, parentId: true } })
  const childrenOf = new Map<string, string[]>()
  for (const r of all) {
    if (!r.parentId) continue
    childrenOf.set(r.parentId, [...(childrenOf.get(r.parentId) ?? []), r.id])
  }

  const toDelete = [id]
  const queue = [id]
  while (queue.length > 0) {
    const cur = queue.shift()!
    for (const childId of childrenOf.get(cur) ?? []) {
      toDelete.push(childId)
      queue.push(childId)
    }
  }

  // Sucessores de qualquer item apagado perdem um predecessor — precisam
  // recalcular a partir dos que sobraram (ScheduleV2Dependency é apagada em
  // cascata pelo FK, mas as datas já persistidas nos sucessores ficariam
  // desatualizadas sem isto).
  const affected = await db.scheduleV2Dependency.findMany({
    where: { predecessorId: { in: toDelete } },
    select: { successorId: true },
  })
  const affectedSuccessors = [...new Set(affected.map((d) => d.successorId))].filter((sid) => !toDelete.includes(sid))

  await db.scheduleV2Item.deleteMany({ where: { id: { in: toDelete } } })
  await recomputeAndPersist(projectId, affectedSuccessors)
  revalidatePath(`/projects/${projectId}/schedule-v2`)

  return { deletedIds: toDelete }
}

// ─── Reordenar ────────────────────────────────────────────────────────────

export async function reorderItemsV2(projectId: string, orderedIds: string[]): Promise<void> {
  await requireAccess()
  await saveSnapshot(projectId)
  await db.$transaction(orderedIds.map((id, i) => db.scheduleV2Item.update({ where: { id }, data: { order: i } })))
  revalidatePath(`/projects/${projectId}/schedule-v2`)
}

// ─── Predecessores (sintaxe "A3", "A3fs", "A3ss+2") ──────────────────────────

export async function setDependenciesV2(
  itemId: string,
  projectId: string,
  raw: string
): Promise<{ accepted: number; rejected: number; conflicts: ConflictV2[]; cycleItemIds: string[] }> {
  await requireAccess()
  await saveSnapshot(projectId)

  const rows = await db.scheduleV2Item.findMany({ where: { projectId }, select: { id: true, code: true } })
  const idByCode = new Map(rows.map((r) => [r.code, r.id]))
  const validCodes = new Set(rows.map((r) => r.code))

  // Regra §3.5: código de predecessor inexistente é ignorado, nunca lança erro.
  const parsed = dropUnknownCodes(parsePredecessors(raw), validCodes)

  const existingDeps = await db.scheduleV2Dependency.findMany({
    where: { successor: { projectId } },
    select: { successorId: true, predecessorId: true },
  })
  const edgesBySuccessor = new Map<string, string[]>()
  for (const d of existingDeps) {
    if (d.successorId === itemId) continue // este lote substitui as antigas de itemId
    edgesBySuccessor.set(d.successorId, [...(edgesBySuccessor.get(d.successorId) ?? []), d.predecessorId])
  }

  // Regra §3.6: valida ciclo (DFS) ANTES de gravar — inclui os candidatos já
  // aceitos neste mesmo lote, para pegar ciclo entre múltiplos predecessores
  // digitados de uma vez.
  const accepted: { predecessorId: string; type: LinkType; lag: number }[] = []
  for (const p of parsed) {
    const predecessorId = idByCode.get(p.code)
    if (!predecessorId || predecessorId === itemId) continue
    if (wouldCreateCycle(itemId, predecessorId, edgesBySuccessor)) continue
    accepted.push({ predecessorId, type: p.type, lag: p.lag })
    edgesBySuccessor.set(itemId, [...(edgesBySuccessor.get(itemId) ?? []), predecessorId])
  }

  await db.$transaction([
    db.scheduleV2Dependency.deleteMany({ where: { successorId: itemId } }),
    ...accepted.map((a) =>
      db.scheduleV2Dependency.create({
        data: { successorId: itemId, predecessorId: a.predecessorId, type: a.type, lagDiasUteis: a.lag },
      })
    ),
  ])

  const result = await recomputeAndPersist(projectId, [itemId])
  revalidatePath(`/projects/${projectId}/schedule-v2`)

  return { accepted: accepted.length, rejected: parsed.length - accepted.length, ...result }
}
