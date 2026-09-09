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
import { isValidDateStr } from "@/lib/date-utils"
import { getHolidaysForYear } from "@/lib/working-days"
import { rollupGroups, rollupProgress, projectEndDate as computeProjectEndDate } from "@/lib/domain/schedule-v2/rollup"
import { parsePredecessors, dropUnknownCodes, wouldCreateCycle } from "@/lib/domain/schedule-v2/dependency-parser"
import type { Dependency, LinkType, SchedItem, SchedulingMode, WorkCalendar } from "@/lib/domain/schedule-v2/types"

// ─── Acesso ─────────────────────────────────────────────────────────────────
// Fase 6 (corte): o Cronograma antigo sempre foi aberto a qualquer usuário
// logado (sem checagem de perfil) — a restrição a Admin/Gerente de Projeto
// era só uma cautela da fase Beta, não uma decisão definitiva de produto
// (decisão do time ao cortar a rota). Mantém o mesmo padrão de acesso de
// sempre, igual ao lib/actions/schedule.ts que este motor substitui.

async function requireAccess() {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")
  return session
}

// ─── Datas: Date (Prisma) <-> string "yyyy-MM-dd" (domínio) ─────────────────
// isValidDateStr (lib/date-utils.ts) exige ano com EXATAMENTE 4 dígitos —
// <input type="date"> do navegador aceita digitar mais dígitos no ano, o
// que corrompe o registro e derruba a página ao formatar (RangeError).
// Qualquer valor fora do formato é ignorado (vira null) em vez de gravado.

function dstr(d: Date | null | undefined): string | null {
  if (!d) return null
  try {
    return d.toISOString().slice(0, 10)
  } catch {
    return null // defesa: uma data já corrompida no banco não derruba a leitura
  }
}

function ddate(s: string | null | undefined): Date | null {
  if (!isValidDateStr(s)) return null
  return new Date(`${s}T00:00:00.000Z`)
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
  responsavelId: string | null
  // Nome digitado livremente quando a pessoa ainda não é um usuário
  // cadastrado no sistema — nunca coexiste com responsavelId (ver
  // updateItemV2/createItemV2: gravar um sempre limpa o outro).
  responsavelNome: string | null
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

// Garante que todo projeto tenha um WorkCalendarV2 semeado com feriados
// nacionais (mesma fonte de lib/working-days.ts, usada pelo Cronograma
// legado) antes de qualquer cálculo de dias úteis — sem isto, loadCalendar
// cai no fallback seg-sex sem feriado nenhum. Idempotente: só semeia se o
// projeto ainda não tiver calendário (scripts/seed-work-calendar-v2.ts
// continua disponível para re-semear/ampliar o intervalo de anos na mão).
async function ensureCalendarSeeded(projectId: string): Promise<void> {
  const existing = await db.workCalendarV2.findUnique({ where: { projectId }, select: { id: true } })
  if (existing) return

  const calendar = await db.workCalendarV2.create({ data: { projectId, diasUteis: [1, 2, 3, 4, 5] } })
  const anoAtual = new Date().getFullYear()
  const holidays = []
  for (let ano = anoAtual - 1; ano <= anoAtual + 3; ano++) holidays.push(...getHolidaysForYear(ano))
  await db.holidayV2.createMany({
    data: holidays.map((h) => ({ calendarId: calendar.id, dia: new Date(`${h.date}T00:00:00.000Z`), descricao: h.name })),
    skipDuplicates: true,
  })
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
  responsavelId: string | null
  responsavelNome: string | null
  duracaoDiasUteis: number | null
  inicioEstimado: string | null; terminoEstimado: string | null
  inicioReal: string | null; terminoReal: string | null
  esforcoEstimadoH: number; esforcoRealH: number; percentualCompleto: number
  schedulingMode: string; constraintType: string | null; constraintDate: string | null
}
type DepSnapshotRow = { id: string; successorId: string; predecessorId: string; type: string; lagDiasUteis: number }
type SnapshotPayload = { items: ItemSnapshotRow[]; dependencies: DepSnapshotRow[] }

async function capturePayload(projectId: string): Promise<SnapshotPayload> {
  const { rows, deps } = await loadRows(projectId)
  return {
    items: rows.map((r) => ({
      id: r.id, code: r.code, parentId: r.parentId, order: r.order, title: r.title, status: r.status,
      responsavelId: r.responsavelId, responsavelNome: r.responsavelNome,
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
}

async function writeSnapshot(projectId: string, kind: "undo" | "redo", payload: SnapshotPayload): Promise<void> {
  await db.scheduleV2Snapshot.upsert({
    where: { projectId_kind: { projectId, kind } },
    update: { payload: JSON.stringify(payload) },
    create: { projectId, kind, payload: JSON.stringify(payload) },
  })
}

async function clearSnapshot(projectId: string, kind: "undo" | "redo"): Promise<void> {
  await db.scheduleV2Snapshot.deleteMany({ where: { projectId, kind } })
}

// Chamado no início de toda ação que muda o cronograma: guarda o estado
// ANTES da mutação como ponto de "Voltar", e descarta o "Avançar" que
// estivesse pendente (uma edição nova invalida o redo, igual Word/Excel).
async function saveSnapshot(projectId: string): Promise<void> {
  const payload = await capturePayload(projectId)
  await writeSnapshot(projectId, "undo", payload)
  await clearSnapshot(projectId, "redo")
}

async function restorePayload(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], projectId: string, payload: SnapshotPayload): Promise<void> {
  await tx.scheduleV2Dependency.deleteMany({ where: { successor: { projectId } } })
  await tx.scheduleV2Item.deleteMany({ where: { projectId } })

  // Passe 1: cria todos sem parentId — evita depender da ordem (um filho
  // pode vir antes do pai no array serializado).
  for (const it of payload.items) {
    await tx.scheduleV2Item.create({
      data: {
        id: it.id, projectId, code: it.code, parentId: null, order: it.order, title: it.title, status: it.status,
        responsavelId: it.responsavelId, responsavelNome: it.responsavelNome,
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
}

export async function hasUndoV2(projectId: string): Promise<boolean> {
  await requireAccess()
  const snap = await db.scheduleV2Snapshot.findUnique({ where: { projectId_kind: { projectId, kind: "undo" } }, select: { id: true } })
  return snap !== null
}

export async function hasRedoV2(projectId: string): Promise<boolean> {
  await requireAccess()
  const snap = await db.scheduleV2Snapshot.findUnique({ where: { projectId_kind: { projectId, kind: "redo" } }, select: { id: true } })
  return snap !== null
}

export async function undoLastChangeV2(projectId: string): Promise<{ ok: boolean; message?: string }> {
  await requireAccess()

  const snap = await db.scheduleV2Snapshot.findUnique({ where: { projectId_kind: { projectId, kind: "undo" } } })
  if (!snap) return { ok: false, message: "Nada para desfazer." }

  const undoPayload = JSON.parse(snap.payload) as SnapshotPayload
  const redoPayload = await capturePayload(projectId) // estado atual, antes de restaurar — vira o "Avançar"

  await db.$transaction(async (tx) => {
    await restorePayload(tx, projectId, undoPayload)
    await tx.scheduleV2Snapshot.upsert({
      where: { projectId_kind: { projectId, kind: "redo" } },
      update: { payload: JSON.stringify(redoPayload) },
      create: { projectId, kind: "redo", payload: JSON.stringify(redoPayload) },
    })
    await tx.scheduleV2Snapshot.deleteMany({ where: { projectId, kind: "undo" } })
  })

  revalidatePath(`/projects/${projectId}/schedule`)
  return { ok: true }
}

export async function redoLastChangeV2(projectId: string): Promise<{ ok: boolean; message?: string }> {
  await requireAccess()

  const snap = await db.scheduleV2Snapshot.findUnique({ where: { projectId_kind: { projectId, kind: "redo" } } })
  if (!snap) return { ok: false, message: "Nada para avançar." }

  const redoPayload = JSON.parse(snap.payload) as SnapshotPayload
  const undoPayload = await capturePayload(projectId) // estado atual, antes de reaplicar — vira o "Voltar" de novo

  await db.$transaction(async (tx) => {
    await restorePayload(tx, projectId, redoPayload)
    await tx.scheduleV2Snapshot.upsert({
      where: { projectId_kind: { projectId, kind: "undo" } },
      update: { payload: JSON.stringify(undoPayload) },
      create: { projectId, kind: "undo", payload: JSON.stringify(undoPayload) },
    })
    await tx.scheduleV2Snapshot.deleteMany({ where: { projectId, kind: "redo" } })
  })

  revalidatePath(`/projects/${projectId}/schedule`)
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

  const writes: { id: string; inicio: string | null; termino: string | null; progresso: number; duracao: number | null | undefined }[] = []
  for (const r of rows) {
    const isGroup = groups.has(r.id)
    const hasDeps = leafDeps.some((d) => d.successorId === r.id)

    let targetInicio: string | null
    let targetTermino: string | null
    let targetProgresso: number
    // undefined = não mexe na duração já gravada (só grupo e "grupo que
    // ficou sem filhos" têm um valor-alvo explícito para este campo).
    let targetDuracao: number | null | undefined

    if (isGroup) {
      // Grupo não tem duração própria (regra §3.7) — um item que virou
      // grupo (reparentar/indentar) carrega a duração de quando era folha;
      // sem zerar aqui, esse resíduo desativa a proteção do próximo `else
      // if` caso ele volte a ficar sem filhos (o resíduo faria parecer que
      // ele "tem duração própria").
      targetInicio = rolledDates.get(r.id)?.inicioEstimado ?? null
      targetTermino = rolledDates.get(r.id)?.terminoEstimado ?? null
      targetProgresso = rolledProgress.get(r.id) ?? r.percentualCompleto
      targetDuracao = null
    } else if (!hasDeps && r.duracaoDiasUteis === null) {
      // Não é grupo, não tem vínculo, não tem duração própria — sem base
      // legítima para uma data. Cobre o caso de um grupo que acabou de
      // ficar sem filhos (rule §3.7): a data que ele carregava era só o
      // rollup dos filhos, nunca "sua própria", e não deve sobreviver.
      targetInicio = null
      targetTermino = null
      targetProgresso = r.percentualCompleto
      targetDuracao = undefined
    } else {
      targetInicio = updatesById.get(r.id)?.inicioEstimado ?? dstr(r.inicioEstimado)
      targetTermino = updatesById.get(r.id)?.terminoEstimado ?? dstr(r.terminoEstimado)
      targetProgresso = r.percentualCompleto
      targetDuracao = undefined
    }

    const changed =
      targetInicio !== dstr(r.inicioEstimado) || targetTermino !== dstr(r.terminoEstimado) ||
      targetProgresso !== r.percentualCompleto || (targetDuracao !== undefined && targetDuracao !== r.duracaoDiasUteis)
    if (changed) writes.push({ id: r.id, inicio: targetInicio, termino: targetTermino, progresso: targetProgresso, duracao: targetDuracao })
  }

  if (writes.length > 0) {
    await db.$transaction(
      writes.map((w) =>
        db.scheduleV2Item.update({
          where: { id: w.id },
          data: {
            inicioEstimado: ddate(w.inicio), terminoEstimado: ddate(w.termino), percentualCompleto: w.progresso,
            ...(w.duracao !== undefined && { duracaoDiasUteis: w.duracao }),
          },
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
    responsavelId: r.responsavelId,
    responsavelNome: r.responsavelNome,
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
  status?: string
  responsavelId?: string | null
  responsavelNome?: string | null
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
      status: input.status ?? "A_INICIAR",
      responsavelId: input.responsavelId ?? null,
      responsavelNome: input.responsavelNome ?? null,
      order: (maxOrder._max.order ?? -1) + 1,
    },
  })

  // Item novo não muda datas de ninguém, mas pode mudar a média de
  // progresso do grupo-pai (um filho a 0% entra na conta) — atualiza rollup.
  await recomputeAndPersist(input.projectId, [])
  revalidatePath(`/projects/${input.projectId}/schedule`)

  return {
    id: row.id, code: row.code, projectId: row.projectId, parentId: row.parentId, order: row.order,
    title: row.title, status: row.status, responsavelId: row.responsavelId, responsavelNome: row.responsavelNome, duracaoDiasUteis: row.duracaoDiasUteis,
    inicioEstimado: null, terminoEstimado: null, inicioReal: null, terminoReal: null,
    esforcoEstimadoH: row.esforcoEstimadoH, esforcoRealH: row.esforcoRealH,
    percentualCompleto: row.percentualCompleto, schedulingMode: row.schedulingMode as SchedulingMode,
    constraintType: row.constraintType, constraintDate: dstr(row.constraintDate),
    isGroup: false,
  }
}

// ─── Duplicar ─────────────────────────────────────────────────────────────
// Clona só a linha em si (título, duração, esforço, % , responsável, status
// e os predecessores DELA) — não duplica os filhos. Entra logo depois da
// original, no mesmo nível.

export async function duplicateItemV2(id: string, projectId: string): Promise<{ newId: string }> {
  await requireAccess()
  await saveSnapshot(projectId)

  const [source, sourceDeps, code] = await Promise.all([
    db.scheduleV2Item.findUnique({ where: { id } }),
    db.scheduleV2Dependency.findMany({ where: { successorId: id } }),
    nextCode(projectId),
  ])
  if (!source) throw new Error("Item não encontrado")

  const created = await db.scheduleV2Item.create({
    data: {
      projectId,
      code,
      parentId: source.parentId,
      title: `${source.title} (cópia)`,
      status: source.status,
      responsavelId: source.responsavelId,
      responsavelNome: source.responsavelNome,
      duracaoDiasUteis: source.duracaoDiasUteis,
      esforcoEstimadoH: source.esforcoEstimadoH,
      esforcoRealH: source.esforcoRealH,
      percentualCompleto: source.percentualCompleto,
      schedulingMode: source.schedulingMode,
      constraintType: source.constraintType,
      constraintDate: source.constraintDate,
      order: source.order, // provisório — reordenado logo abaixo
    },
  })

  if (sourceDeps.length > 0) {
    await db.scheduleV2Dependency.createMany({
      data: sourceDeps.map((d) => ({ successorId: created.id, predecessorId: d.predecessorId, type: d.type, lagDiasUteis: d.lagDiasUteis })),
    })
  }

  // Posiciona a cópia logo depois da original, dentro dos mesmos irmãos.
  const siblings = await db.scheduleV2Item.findMany({
    where: { projectId, parentId: source.parentId },
    orderBy: { order: "asc" },
    select: { id: true },
  })
  const withoutNew = siblings.filter((s) => s.id !== created.id)
  const idx = withoutNew.findIndex((s) => s.id === source.id)
  const orderedIds = [...withoutNew.slice(0, idx + 1).map((s) => s.id), created.id, ...withoutNew.slice(idx + 1).map((s) => s.id)]
  await db.$transaction(orderedIds.map((sid, i) => db.scheduleV2Item.update({ where: { id: sid }, data: { order: i } })))

  await recomputeAndPersist(projectId, [created.id])
  revalidatePath(`/projects/${projectId}/schedule`)
  return { newId: created.id }
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
  responsavelId: string | null
  responsavelNome: string | null
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
    } else if (isValidDateStr(data.terminoEstimado)) {
      const inicioEfetivo = data.inicioEstimado !== undefined ? data.inicioEstimado : dstr(current.inicioEstimado)
      // Ano fora do formato "yyyy-MM-dd" (4 dígitos) já foi barrado acima;
      // aqui garante que início também é válido antes de contar dias úteis
      // — um ano absurdo aqui faria addWorkingDays/workingDaysBetween
      // percorrer dia a dia por uma distância astronômica e travar o
      // servidor (o próprio bug que corrompeu o cronograma antes).
      if (inicioEfetivo && isValidDateStr(inicioEfetivo)) {
        const cal = await loadCalendar(projectId)
        const dias = workingDaysBetween(inicioEfetivo, data.terminoEstimado, cal) + 1
        duracaoFromTermino = Math.max(1, dias)
      }
      // sem início válido: não há como derivar duração — ignora em silêncio
    }
    // término inválido (ano malformado): ignora em silêncio, não grava nada
  }

  // Responsável — FK (usuário cadastrado) e nome livre nunca coexistem:
  // escolher um sempre limpa o outro (o time pode digitar qualquer nome,
  // mesmo de alguém que ainda não é usuário do sistema).
  let responsavelIdUpdate: string | null | undefined
  let responsavelNomeUpdate: string | null | undefined
  if (data.responsavelId !== undefined) {
    responsavelIdUpdate = data.responsavelId
    responsavelNomeUpdate = null
  } else if (data.responsavelNome !== undefined) {
    responsavelNomeUpdate = data.responsavelNome
    responsavelIdUpdate = null
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
      ...(responsavelIdUpdate !== undefined && { responsavelId: responsavelIdUpdate }),
      ...(responsavelNomeUpdate !== undefined && { responsavelNome: responsavelNomeUpdate }),
      ...(data.schedulingMode !== undefined && { schedulingMode: data.schedulingMode }),
      ...(data.constraintType !== undefined && { constraintType: data.constraintType }),
      ...(data.constraintDate !== undefined && { constraintDate: ddate(data.constraintDate) }),
      ...(data.parentId !== undefined && { parentId: data.parentId }),
      ...(data.order !== undefined && { order: data.order }),
    },
  })

  const result = await recomputeAndPersist(projectId, [id])
  revalidatePath(`/projects/${projectId}/schedule`)
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
  revalidatePath(`/projects/${projectId}/schedule`)

  return { deletedIds: toDelete }
}

// ─── Reordenar ────────────────────────────────────────────────────────────

export async function reorderItemsV2(projectId: string, orderedIds: string[]): Promise<void> {
  await requireAccess()
  await saveSnapshot(projectId)
  await db.$transaction(orderedIds.map((id, i) => db.scheduleV2Item.update({ where: { id }, data: { order: i } })))
  revalidatePath(`/projects/${projectId}/schedule`)
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
  revalidatePath(`/projects/${projectId}/schedule`)

  return { accepted: accepted.length, rejected: parsed.length - accepted.length, ...result }
}

// ─── Atualização de campos fora do editor do Cronograma v2 (Fase 4.6/5) ─────
// Primitivo de baixo nível reaproveitado por Checkpoint (lib/actions/
// checkpoint.ts) e Kanban (lib/actions/kanban.ts) para escrever status/
// progresso/datas-reais/custo de um ou mais itens de uma vez. Diferente de
// updateItemV2, NÃO é gate por CAN_MANAGE_V2 — Checkpoint e Kanban têm suas
// próprias regras de acesso (mais amplas: qualquer membro do projeto), então
// cada chamador aplica seu próprio requireAccess/authz antes de chamar isto.
// Ainda assim participa do undo/redo do motor (saveSnapshot) e do rollup de
// grupo (recomputeAndPersist), pela mesma razão de qualquer outra mutação.

export type ItemFieldUpdateV2 = {
  itemId: string
  status?: string // vocabulário v2 de 6 valores — ver V2_STATUS_TO_LEGACY
  percentualCompleto?: number
  inicioReal?: string | null
  terminoReal?: string | null
  budgetedCost?: number | null
  actualCost?: number | null
  // Datas PLANEJADAS (não as reais acima) — telas fora do editor do
  // Cronograma v2 (Checkpoint) também podem reagendar um item. Sempre os
  // dois juntos (não dá pra editar só um lado por aqui): término nunca tem
  // coluna própria solta (regra §3.3), então isto deriva uma nova duração a
  // partir do intervalo, igual ao término→duração de updateItemV2.
  inicioEstimado?: string | null
  terminoEstimado?: string | null
}

export async function applyItemUpdatesV2(projectId: string, updates: ItemFieldUpdateV2[]): Promise<void> {
  if (updates.length === 0) return
  await saveSnapshot(projectId)

  const ids = updates.map((u) => u.itemId)
  const children = await db.scheduleV2Item.findMany({ where: { parentId: { in: ids } }, select: { parentId: true } })
  const hasChildrenSet = new Set(children.map((c) => c.parentId as string))

  const needsCalendar = updates.some((u) => u.inicioEstimado !== undefined || u.terminoEstimado !== undefined)
  const cal = needsCalendar ? await loadCalendar(projectId) : null

  await db.$transaction(
    updates.map((u) => {
      const isGroup = hasChildrenSet.has(u.itemId)
      let datePlanUpdate: { inicioEstimado: Date | null; duracaoDiasUteis: number | null } | undefined
      if (!isGroup && (u.inicioEstimado !== undefined || u.terminoEstimado !== undefined)) {
        if (u.inicioEstimado === null || u.terminoEstimado === null) {
          datePlanUpdate = { inicioEstimado: null, duracaoDiasUteis: null } // regra §10 — sem as duas datas, item fica não agendado
        } else if (u.inicioEstimado && u.terminoEstimado && isValidDateStr(u.inicioEstimado) && isValidDateStr(u.terminoEstimado) && cal) {
          const dias = workingDaysBetween(u.inicioEstimado, u.terminoEstimado, cal) + 1
          datePlanUpdate = { inicioEstimado: ddate(u.inicioEstimado), duracaoDiasUteis: Math.max(1, dias) }
        }
      }

      return db.scheduleV2Item.update({
        where: { id: u.itemId },
        data: {
          ...(u.status !== undefined && { status: u.status }),
          // Grupo não tem progresso próprio (regra §3.7) — mesmo guard de updateItemV2.
          ...(!isGroup && u.percentualCompleto !== undefined && { percentualCompleto: u.percentualCompleto }),
          ...(u.inicioReal !== undefined && { inicioReal: ddate(u.inicioReal) }),
          ...(u.terminoReal !== undefined && { terminoReal: ddate(u.terminoReal) }),
          ...(u.budgetedCost !== undefined && { budgetedCost: u.budgetedCost }),
          ...(u.actualCost !== undefined && { actualCost: u.actualCost }),
          ...(datePlanUpdate && datePlanUpdate),
        },
      })
    })
  )

  await recomputeAndPersist(projectId, ids)
  revalidatePath(`/projects/${projectId}/schedule`)
}

// ─── Aplicar modelo de cronograma (Fase 1) ───────────────────────────────────
// Diferença central para o applyTemplate legado (lib/actions/templates.ts):
// lá as datas eram pré-calculadas em memória com addDays (dias corridos).
// Aqui só as folhas SEM predecessor ganham uma data manual (a `startDate`
// escolhida ao aplicar, igual ao legado) — todo o resto é responsabilidade
// do motor de dias úteis (recomputeAndPersist -> scheduler/calendar), que é
// quem de fato manda no cronograma a partir daqui (CLAUDE.md §3.1).

export async function applyTemplateV2(
  projectId: string,
  templateId: string,
  startDate: string
): Promise<{ count: number }> {
  await requireAccess()
  await saveSnapshot(projectId)
  await ensureCalendarSeeded(projectId)

  const template = await db.scheduleTemplate.findUnique({
    where: { id: templateId },
    include: { tasks: { orderBy: { order: "asc" } } },
  })
  if (!template) throw new Error("Modelo não encontrado")

  const tasks = template.tasks
  const parentCodes = new Set(tasks.map((t) => t.parentCode).filter(Boolean) as string[])
  const leafCodes = new Set(tasks.filter((t) => !parentCodes.has(t.wbsCode)).map((t) => t.wbsCode))

  // Códigos "A1","A2",... do projeto continuam de onde estavam (não reinicia
  // do zero se o projeto já tiver itens de outra origem).
  const existingCodeRows = await db.scheduleV2Item.findMany({ where: { projectId }, select: { code: true } })
  let codeCounter = existingCodeRows.reduce((m, r) => {
    const n = parseInt(r.code.replace(/^A/i, ""), 10)
    return Number.isFinite(n) && n > m ? n : m
  }, 0)
  function nextCodeLocal(): string {
    codeCounter += 1
    return `A${codeCounter}`
  }

  const maxOrderRoot = await db.scheduleV2Item.aggregate({ _max: { order: true }, where: { projectId, parentId: null } })
  let rootOrder = maxOrderRoot._max.order ?? -1

  // Cria todos os itens — pais antes de filhos, porque o template já vem
  // ordenado assim (mesma premissa do applyTemplate legado) — resolvendo
  // parentId via wbsCode -> id novo. Item de topo (parentCode null) vira a
  // "área" do cronograma (decisão de produto: v2 não tem WbsArea separada).
  const codeToId = new Map<string, string>()
  for (const task of tasks) {
    const parentId = task.parentCode ? (codeToId.get(task.parentCode) ?? null) : null
    const isRoot = parentId === null
    if (isRoot) rootOrder += 1

    const created = await db.scheduleV2Item.create({
      data: {
        projectId,
        code: nextCodeLocal(),
        parentId,
        title: task.title,
        // Marco (duração 0) sempre que o modelo marcar isMilestone, mesmo
        // que o template tenha durationDays:1 (CLAUDE.md: duração 0 = marco).
        duracaoDiasUteis: task.isMilestone ? 0 : task.durationDays,
        esforcoEstimadoH: task.estimatedEffort ?? 0,
        status: "A_INICIAR",
        order: isRoot ? rootOrder : task.order,
      },
    })
    codeToId.set(task.wbsCode, created.id)
  }

  // Predecessores só existiam nas folhas do template — sempre FS/lag 0
  // (mesma regra implícita do legado: finish-to-start).
  const depsToCreate: { successorId: string; predecessorId: string }[] = []
  for (const wbsCode of leafCodes) {
    const task = tasks.find((t) => t.wbsCode === wbsCode)
    const successorId = codeToId.get(wbsCode)
    if (!task || !successorId) continue
    const preds: string[] = task.predecessorCodes ? (JSON.parse(task.predecessorCodes) as string[]) : []
    for (const p of preds) {
      const predecessorId = codeToId.get(p)
      if (predecessorId) depsToCreate.push({ successorId, predecessorId })
    }
  }
  if (depsToCreate.length > 0) {
    await db.scheduleV2Dependency.createMany({
      data: depsToCreate.map((d) => ({ successorId: d.successorId, predecessorId: d.predecessorId, type: "FS", lagDiasUteis: 0 })),
    })
  }

  // Folha sem NENHUM predecessor vira âncora na data escolhida ao aplicar o
  // modelo (igual ao legado: toda folha "solta" começa em startDate) — daí
  // em diante quem propaga é o motor de dias úteis, não mais addDays corrido.
  const successorsWithDeps = new Set(depsToCreate.map((d) => d.successorId))
  const leafIds = [...leafCodes].map((c) => codeToId.get(c)).filter((id): id is string => !!id)
  const anchorIds = leafIds.filter((id) => !successorsWithDeps.has(id))
  if (anchorIds.length > 0 && isValidDateStr(startDate)) {
    await db.$transaction(
      anchorIds.map((id) => db.scheduleV2Item.update({ where: { id }, data: { inicioEstimado: ddate(startDate) } }))
    )
  }

  await recomputeAndPersist(projectId, leafIds)
  revalidatePath(`/projects/${projectId}/schedule`)

  return { count: tasks.length }
}
