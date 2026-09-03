// Migração de dados ScheduleTask/WbsArea (legado) -> ScheduleV2Item/
// ScheduleV2Dependency (motor v2) — Fase 2 do plano de adoção do v2.
//
// Princípio inegociável: NUNCA apaga/edita ScheduleTask, WbsArea, ou
// qualquer linha ligada a elas (TimeEntry/Comment/Attachment). É uma cópia
// aditiva. As datas dos itens-folha são copiadas como estavam (fonte da
// verdade histórica) — o motor v2 NÃO recalcula a partir de dependências
// aqui (isso ficaria para uma edição futura do usuário); só o rollup de
// grupo (min/max de datas e média de progresso dos filhos) é aplicado, por
// ser puramente derivado e obrigatório (CLAUDE.md §3.7) — nunca sobrescreve
// dado de folha, só resume o que já foi copiado.
//
// Mapeamento de área: WbsArea vira um item de topo sintético no v2 (título
// = nome da área) só quando pelo menos 1 tarefa-RAIZ do projeto usa aquela
// área — as tarefas-raiz daquela área entram como filhas dele. Tarefa-raiz
// sem área vira ela mesma um item de topo. Tarefas não-raiz sempre mantêm
// o parentId real da árvore legada, ignorando wbsAreaId (que ali é só
// informativo, herdado da UI antiga).
//
// Uso:
//   npx tsx scripts/migrate-scheduletask-to-v2.ts --project=<id> [--apply] [--force]
//   npx tsx scripts/migrate-scheduletask-to-v2.ts --all [--apply]
//
// Sem --apply, roda em modo DRY-RUN (só relatório, nada é gravado). Sem
// --force, pula projetos que já têm ScheduleV2Item (idempotente).

import { db } from "../lib/db"
import { getHolidaysForYear } from "../lib/working-days"
import { workingDaysBetween, somarDuracao } from "../lib/domain/schedule-v2/calendar"
import { rollupGroups, rollupProgress } from "../lib/domain/schedule-v2/rollup"
import type { WorkCalendar, SchedItem } from "../lib/domain/schedule-v2/types"

type LegacyTask = Awaited<ReturnType<typeof db.scheduleTask.findMany>>[number]

// 6 valores, 1:1 com o TaskStatus legado (Fase 5 — Kanban precisa da
// distinção real de VALIDATION/ON_HOLD, não só das 4 cores que o dropdown
// do Cronograma v2 tinha originalmente). Mesma tabela de
// lib/utils/schedule-v2-adapter.ts::LEGACY_STATUS_TO_V2.
const STATUS_MAP: Record<string, string> = {
  INITIATIVE: "A_INICIAR",
  PLANNING: "A_INICIAR",
  IN_PROGRESS: "EM_ANDAMENTO",
  VALIDATION: "VALIDACAO",
  COMPLETED: "CONCLUIDO",
  ON_HOLD: "PAUSADO",
  DELAYED: "ATRASADO",
}

function dstr(d: Date | null | undefined): string | null {
  if (!d) return null
  try { return d.toISOString().slice(0, 10) } catch { return null }
}
function ddate(s: string | null | undefined): Date | null {
  if (!s) return null
  return new Date(`${s}T00:00:00.000Z`)
}

// ── Args ─────────────────────────────────────────────────────────────────

function parseArgs() {
  const argv = process.argv.slice(2)
  return {
    project: argv.find((a) => a.startsWith("--project="))?.split("=")[1] ?? null,
    all: argv.includes("--all"),
    apply: argv.includes("--apply"),
    force: argv.includes("--force"),
  }
}

// ── Calendário (mesma lógica de ensureCalendarSeeded em lib/actions/schedule-v2.ts) ──

async function ensureCalendarSeeded(projectId: string): Promise<WorkCalendar> {
  let calendar = await db.workCalendarV2.findUnique({ where: { projectId }, include: { holidays: true } })
  if (!calendar) {
    const created = await db.workCalendarV2.create({ data: { projectId, diasUteis: [1, 2, 3, 4, 5] } })
    const anoAtual = new Date().getFullYear()
    const holidays = []
    for (let ano = anoAtual - 1; ano <= anoAtual + 3; ano++) holidays.push(...getHolidaysForYear(ano))
    await db.holidayV2.createMany({
      data: holidays.map((h) => ({ calendarId: created.id, dia: new Date(`${h.date}T00:00:00.000Z`), descricao: h.name })),
      skipDuplicates: true,
    })
    calendar = await db.workCalendarV2.findUnique({ where: { projectId }, include: { holidays: true } })
  }
  return {
    diasUteis: calendar!.diasUteis,
    holidays: calendar!.holidays.map((h) => ({ date: dstr(h.dia)!, name: h.descricao ?? undefined })),
  }
}

// ── Duração a partir de início/término copiados (mesma fórmula já usada em
// updateItemV2 para traduzir término -> duração: dias úteis no intervalo
// [início, término] inclusive) — garante consistência com a regra §3.3. ──

function computeDuration(start: string, end: string, cal: WorkCalendar): number {
  return Math.max(1, workingDaysBetween(start, end, cal) + 1)
}

// ── Migração de 1 projeto ───────────────────────────────────────────────

type PlanRow = {
  legacyId: string
  code: string
  parentCode: string | null // código v2 do pai (ou marcador de área sintética)
  title: string
  status: string
  responsavelId: string | null
  duracaoDiasUteis: number | null
  inicioEstimado: string | null
  terminoEstimado: string | null
  inicioReal: string | null
  terminoReal: string | null
  esforcoEstimadoH: number
  esforcoRealH: number
  budgetedCost: number | null
  actualCost: number | null
  percentualCompleto: number
  isSyntheticArea: boolean
}

async function buildPlan(projectId: string): Promise<{ rows: PlanRow[]; deps: { successorCode: string; predecessorCode: string }[] }> {
  const [tasks, areas] = await Promise.all([
    db.scheduleTask.findMany({ where: { projectId }, orderBy: { order: "asc" } }),
    db.wbsArea.findMany({ where: { projectId }, orderBy: { order: "asc" } }),
  ])

  const rootTasks = tasks.filter((t) => !t.parentId)
  const areaIdsInUse = new Set(rootTasks.filter((t) => t.wbsAreaId).map((t) => t.wbsAreaId as string))
  const areasInUse = areas.filter((a) => areaIdsInUse.has(a.id))

  let codeCounter = 0
  const nextCode = () => `A${++codeCounter}`

  const rows: PlanRow[] = []
  const legacyIdToCode = new Map<string, string>()
  const areaIdToCode = new Map<string, string>()

  // 1) itens sintéticos de área (só as em uso)
  for (const area of areasInUse) {
    const code = nextCode()
    areaIdToCode.set(area.id, code)
    rows.push({
      legacyId: `__area__${area.id}`, code, parentCode: null, title: area.name,
      status: "A_INICIAR", responsavelId: null, duracaoDiasUteis: null,
      inicioEstimado: null, terminoEstimado: null, inicioReal: null, terminoReal: null,
      esforcoEstimadoH: 0, esforcoRealH: 0, budgetedCost: null, actualCost: null,
      percentualCompleto: 0, isSyntheticArea: true,
    })
  }

  // 2) tarefas — pais antes de filhos (recursão a partir das raízes, mesma
  // ordem relativa do campo `order` legado, preservada via childrenByParent).
  const childrenByParent = new Map<string, LegacyTask[]>()
  for (const t of tasks) {
    if (!t.parentId) continue
    childrenByParent.set(t.parentId, [...(childrenByParent.get(t.parentId) ?? []), t])
  }

  function visit(task: LegacyTask, parentCode: string | null) {
    const code = nextCode()
    legacyIdToCode.set(task.id, code)

    const startStr = dstr(task.startDate)
    const endStr = dstr(task.endDate)
    // calendário é resolvido depois (durationDays exige o calendário do
    // projeto) — placeholder aqui, preenchido na 2ª passada abaixo.
    rows.push({
      legacyId: task.id, code, parentCode, title: task.title,
      status: STATUS_MAP[task.status] ?? "A_INICIAR",
      responsavelId: task.responsibleId,
      duracaoDiasUteis: null, // preenchido depois
      inicioEstimado: startStr, terminoEstimado: endStr,
      inicioReal: dstr(task.actualStart), terminoReal: dstr(task.actualEnd),
      esforcoEstimadoH: task.estimatedEffort ?? 0, esforcoRealH: task.actualEffort ?? 0,
      budgetedCost: task.budgetedCost ?? null, actualCost: task.actualCost ?? null,
      percentualCompleto: task.progress,
      isSyntheticArea: false,
    })

    for (const child of childrenByParent.get(task.id) ?? []) visit(child, code)
  }

  for (const root of rootTasks) {
    const areaCode = root.wbsAreaId ? areaIdToCode.get(root.wbsAreaId) ?? null : null
    visit(root, areaCode)
  }

  // dependências (só existiam nas folhas do legado) — resolve por ID legado -> código v2
  const deps: { successorCode: string; predecessorCode: string }[] = []
  for (const t of tasks) {
    if (!t.dependencies) continue
    const successorCode = legacyIdToCode.get(t.id)
    if (!successorCode) continue
    let predIds: string[] = []
    try { predIds = JSON.parse(t.dependencies) as string[] } catch { predIds = [] }
    for (const predId of predIds) {
      const predecessorCode = legacyIdToCode.get(predId)
      if (predecessorCode && predecessorCode !== successorCode) deps.push({ successorCode, predecessorCode })
    }
  }

  return { rows, deps }
}

async function migrateProject(projectId: string, opts: { apply: boolean; force: boolean }) {
  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true, title: true } })
  if (!project) { console.log(`  [pular] projeto ${projectId} não encontrado`); return }

  const taskCount = await db.scheduleTask.count({ where: { projectId } })
  if (taskCount === 0) { console.log(`  [pular] "${project.title}" — sem tarefas no legado`); return }

  const existingV2 = await db.scheduleV2Item.count({ where: { projectId } })
  if (existingV2 > 0 && !opts.force) {
    console.log(`  [pular] "${project.title}" — já tem ${existingV2} item(ns) v2 (use --force para re-migrar)`)
    return
  }

  const cal = await ensureCalendarSeeded(projectId)
  const { rows, deps } = await buildPlan(projectId)

  // preenche duração agora que temos o calendário do projeto
  for (const r of rows) {
    if (r.isSyntheticArea) continue
    if (r.inicioEstimado && r.terminoEstimado) {
      r.duracaoDiasUteis = computeDuration(r.inicioEstimado, r.terminoEstimado, cal)
      r.terminoEstimado = somarDuracao(r.inicioEstimado, r.duracaoDiasUteis, cal) // consistência §3.3
    } else if (r.inicioEstimado && !r.terminoEstimado) {
      r.duracaoDiasUteis = 1
      r.terminoEstimado = r.inicioEstimado
    } else {
      // só término (raro) ou nenhuma data -> não agendado (regra §10), não
      // fabrica uma data que o legado não tinha.
      r.inicioEstimado = null
      r.terminoEstimado = null
      r.duracaoDiasUteis = null
    }
  }

  console.log(`  "${project.title}": ${rows.length} item(ns) (${rows.filter((r) => r.isSyntheticArea).length} área(s) sintética(s)), ${deps.length} dependência(s)`)

  if (!opts.apply) return // dry-run: só o relatório acima

  if (opts.force && existingV2 > 0) {
    await db.scheduleV2Item.deleteMany({ where: { projectId } })
    await db.scheduleV2MigrationMap.deleteMany({ where: { projectId } })
  }

  await db.$transaction(async (tx) => {
    const codeToId = new Map<string, string>()
    for (const r of rows) {
      const parentId = r.parentCode ? codeToId.get(r.parentCode) ?? null : null
      const created = await tx.scheduleV2Item.create({
        data: {
          projectId, code: r.code, parentId, title: r.title, status: r.status,
          responsavelId: r.responsavelId,
          duracaoDiasUteis: r.duracaoDiasUteis,
          inicioEstimado: ddate(r.inicioEstimado), terminoEstimado: ddate(r.terminoEstimado),
          inicioReal: ddate(r.inicioReal), terminoReal: ddate(r.terminoReal),
          esforcoEstimadoH: r.esforcoEstimadoH, esforcoRealH: r.esforcoRealH,
          budgetedCost: r.budgetedCost, actualCost: r.actualCost,
          percentualCompleto: r.percentualCompleto,
          order: rows.filter((x) => x.parentCode === r.parentCode).indexOf(r),
        },
      })
      codeToId.set(r.code, created.id)
      if (!r.isSyntheticArea) {
        await tx.scheduleV2MigrationMap.create({
          data: { projectId, legacyTaskId: r.legacyId, newItemId: created.id },
        })
      }
    }

    if (deps.length > 0) {
      await tx.scheduleV2Dependency.createMany({
        data: deps.map((d) => ({
          successorId: codeToId.get(d.successorCode)!,
          predecessorId: codeToId.get(d.predecessorCode)!,
          type: "FS", lagDiasUteis: 0,
        })),
        skipDuplicates: true,
      })
    }

    // Rollup de grupo (dates + progresso) — puramente derivado dos filhos já
    // gravados acima, nunca sobrescreve dado de folha (regra §3.7).
    const allRows = await tx.scheduleV2Item.findMany({ where: { projectId } })
    const schedItems: SchedItem[] = allRows.map((r) => ({
      id: r.id, parentId: r.parentId, duracaoDiasUteis: r.duracaoDiasUteis,
      inicioEstimado: dstr(r.inicioEstimado), terminoEstimado: dstr(r.terminoEstimado),
      schedulingMode: r.schedulingMode as "auto" | "manual",
    }))
    const rolledDates = rollupGroups(schedItems)
    const rolledProgress = rollupProgress(allRows.map((r) => ({ id: r.id, parentId: r.parentId, percentualCompleto: r.percentualCompleto })))

    const childrenCount = new Map<string, number>()
    for (const r of allRows) if (r.parentId) childrenCount.set(r.parentId, (childrenCount.get(r.parentId) ?? 0) + 1)

    for (const r of allRows) {
      if (!childrenCount.has(r.id)) continue // só grupos (item com filhos)
      const rolled = rolledDates.get(r.id)
      await tx.scheduleV2Item.update({
        where: { id: r.id },
        data: {
          // Grupo não tem duração própria (regra §3.7) — zera o valor
          // copiado do legado (a tarefa-pai lá tinha suas próprias
          // startDate/endDate, mas aqui quem manda são os filhos). Sem
          // isto, um resíduo não-nulo desativaria a proteção de
          // recomputeAndPersist contra "grupo que ficou sem filhos".
          duracaoDiasUteis: null,
          inicioEstimado: ddate(rolled?.inicioEstimado ?? null),
          terminoEstimado: ddate(rolled?.terminoEstimado ?? null),
          percentualCompleto: rolledProgress.get(r.id) ?? r.percentualCompleto,
        },
      })
    }
  }, { timeout: 120_000 })

  console.log(`  ✓ migrado (${opts.force ? "re-migração forçada" : "primeira vez"})`)
}

async function main() {
  const opts = parseArgs()
  if (!opts.project && !opts.all) {
    console.error("Uso: npx tsx scripts/migrate-scheduletask-to-v2.ts --project=<id> [--apply] [--force]")
    console.error("  ou: npx tsx scripts/migrate-scheduletask-to-v2.ts --all [--apply]")
    process.exit(1)
  }

  console.log(opts.apply ? "=== MODO APLICAR (grava no banco) ===" : "=== MODO DRY-RUN (só relatório, nada é gravado) ===")

  if (opts.project) {
    await migrateProject(opts.project, opts)
  } else {
    const projects = await db.project.findMany({
      where: { tasks: { some: {} } },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    })
    console.log(`${projects.length} projeto(s) com cronograma legado.\n`)
    for (const p of projects) {
      await migrateProject(p.id, opts)
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
