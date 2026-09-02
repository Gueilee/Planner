// Cria o projeto real dedicado ao teste do motor de Cronograma v2 (Fase 4
// do plano) — idempotente: se o projeto já existe (mesmo título na mesma
// organização), não duplica, só garante o calendário e um exemplo inicial.
//
// Uso: npx tsx scripts/create-schedule-v2-test-project.ts

import { db } from "../lib/db"
import { getHolidaysForYear } from "../lib/working-days"
import { recalcular } from "../lib/domain/schedule-v2/scheduler"
import { rollupGroups, rollupProgress } from "../lib/domain/schedule-v2/rollup"
import type { Dependency, LinkType, SchedItem, SchedulingMode, WorkCalendar } from "../lib/domain/schedule-v2/types"

const TITLE = "Cronograma V2 — Ambiente de Teste"

function dstr(d: Date | null | undefined): string | null { return d ? d.toISOString().slice(0, 10) : null }
function ddate(s: string | null): Date | null { return s ? new Date(`${s}T00:00:00.000Z`) : null }

// Mesma lógica de recomputeAndPersist em lib/actions/schedule-v2.ts — script
// roda fora de uma requisição autenticada, então não pode chamar as Server
// Actions diretamente (auth() não resolve sessão aqui).
async function recompute(projectId: string) {
  const [rows, deps] = await Promise.all([
    db.scheduleV2Item.findMany({ where: { projectId } }),
    db.scheduleV2Dependency.findMany({ where: { successor: { projectId } } }),
  ])
  const calRow = await db.workCalendarV2.findUnique({ where: { projectId }, include: { holidays: true } })
  const cal: WorkCalendar = calRow
    ? { diasUteis: calRow.diasUteis, holidays: calRow.holidays.map((h) => ({ date: dstr(h.dia)! })) }
    : { diasUteis: [1, 2, 3, 4, 5], holidays: [] }

  const childrenCount = new Map<string, number>()
  for (const r of rows) if (r.parentId) childrenCount.set(r.parentId, (childrenCount.get(r.parentId) ?? 0) + 1)
  const groups = new Set([...childrenCount.entries()].filter(([, n]) => n > 0).map(([id]) => id))

  const toSchedItem = (r: (typeof rows)[number]): SchedItem => ({
    id: r.id, parentId: r.parentId, duracaoDiasUteis: r.duracaoDiasUteis,
    inicioEstimado: dstr(r.inicioEstimado), terminoEstimado: dstr(r.terminoEstimado),
    schedulingMode: r.schedulingMode as SchedulingMode,
  })

  const leafRows = rows.filter((r) => !groups.has(r.id))
  const leafIds = new Set(leafRows.map((r) => r.id))
  const leafItems = leafRows.map(toSchedItem)
  const leafDeps: Dependency[] = deps
    .filter((d) => leafIds.has(d.successorId) && leafIds.has(d.predecessorId))
    .map((d) => ({ successorId: d.successorId, predecessorId: d.predecessorId, type: d.type as LinkType, lag: d.lagDiasUteis }))

  const { updates } = recalcular(leafItems, leafDeps, cal, [...leafIds])
  const updatesById = new Map(updates.map((u) => [u.itemId, u]))

  const merged: SchedItem[] = rows.map((r) => {
    const u = updatesById.get(r.id)
    return u ? { ...toSchedItem(r), inicioEstimado: u.inicioEstimado, terminoEstimado: u.terminoEstimado } : toSchedItem(r)
  })
  const rolledDates = rollupGroups(merged)
  const rolledProgress = rollupProgress(rows.map((r) => ({ id: r.id, parentId: r.parentId, percentualCompleto: r.percentualCompleto })))

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
      targetInicio = null
      targetTermino = null
      targetProgresso = r.percentualCompleto
    } else {
      targetInicio = updatesById.get(r.id)?.inicioEstimado ?? dstr(r.inicioEstimado)
      targetTermino = updatesById.get(r.id)?.terminoEstimado ?? dstr(r.terminoEstimado)
      targetProgresso = r.percentualCompleto
    }
    if (targetInicio !== dstr(r.inicioEstimado) || targetTermino !== dstr(r.terminoEstimado) || targetProgresso !== r.percentualCompleto) {
      await db.scheduleV2Item.update({ where: { id: r.id }, data: { inicioEstimado: ddate(targetInicio), terminoEstimado: ddate(targetTermino), percentualCompleto: targetProgresso } })
    }
  }
}

async function main() {
  const org = (await db.organization.findFirst({ where: { slug: "vendemmia" } })) ?? (await db.organization.findFirst())
  if (!org) throw new Error("Nenhuma organização encontrada")

  const owner = await db.user.findFirst({ where: { email: "gppereira@vendemmia.com.br" } })

  let project = await db.project.findFirst({ where: { title: TITLE, organizationId: org.id } })
  if (!project) {
    project = await db.project.create({
      data: {
        title: TITLE,
        description:
          "Projeto dedicado a testar o novo motor de Cronograma (v2) — calendário de dias úteis em banco, tipos de dependência FS/SS/FF com lag, modo manual e detecção de ciclo. Não afeta o Cronograma normal dos demais projetos.",
        projectArea: "TECNOLOGIA",
        status: "IN_PROGRESS",
        organizationId: org.id,
      },
    })
    console.log(`Projeto criado: ${project.id}`)
  } else {
    console.log(`Projeto já existia: ${project.id}`)
  }

  if (owner) {
    await db.projectMember.upsert({
      where: { projectId_userId: { projectId: project.id, userId: owner.id } },
      update: {},
      create: { projectId: project.id, userId: owner.id, role: "Gerente de Projeto" },
    })
  }

  // ── Calendário (mesmos feriados nacionais de lib/working-days.ts) ──────────
  const calendar = await db.workCalendarV2.upsert({
    where: { projectId: project.id },
    update: {},
    create: { projectId: project.id, diasUteis: [1, 2, 3, 4, 5] },
  })
  const anoAtual = new Date().getFullYear()
  for (let ano = anoAtual - 1; ano <= anoAtual + 2; ano++) {
    for (const h of getHolidaysForYear(ano)) {
      await db.holidayV2.upsert({
        where: { calendarId_dia: { calendarId: calendar.id, dia: new Date(`${h.date}T00:00:00`) } },
        update: { descricao: h.name },
        create: { calendarId: calendar.id, dia: new Date(`${h.date}T00:00:00`), descricao: h.name },
      })
    }
  }
  console.log("Calendário de feriados semeado.")

  // ── Exemplo inicial (só se o cronograma estiver vazio) ──────────────────────
  const existingCount = await db.scheduleV2Item.count({ where: { projectId: project.id } })
  if (existingCount === 0) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const grupo = await db.scheduleV2Item.create({
      data: { projectId: project.id, code: "A1", title: "1 - Exemplo: cadeia FS/SS/FF", order: 1 },
    })
    const ancora = await db.scheduleV2Item.create({
      data: {
        projectId: project.id, code: "A2", parentId: grupo.id, title: "Âncora (editar a duração/início testa a regra §3.3)",
        duracaoDiasUteis: 3, inicioEstimado: today, order: 1,
      },
    })
    // término da âncora derivado pela própria action na próxima carga da tela
    const seg = await db.scheduleV2Item.create({
      data: { projectId: project.id, code: "A3", parentId: grupo.id, title: "Sucessora FS (predecessor: A2)", duracaoDiasUteis: 2, order: 2 },
    })
    const ter = await db.scheduleV2Item.create({
      data: { projectId: project.id, code: "A4", parentId: grupo.id, title: "Sucessora SS+1 (predecessor: A2ss+1)", duracaoDiasUteis: 1, order: 3 },
    })
    await db.scheduleV2Dependency.create({ data: { successorId: seg.id, predecessorId: ancora.id, type: "FS", lagDiasUteis: 0 } })
    await db.scheduleV2Dependency.create({ data: { successorId: ter.id, predecessorId: ancora.id, type: "SS", lagDiasUteis: 1 } })
    console.log("Exemplo inicial criado (A1 grupo, A2 âncora, A3 FS, A4 SS+1).")
  } else {
    console.log("Cronograma já tem itens — não recriei o exemplo.")
  }

  await recompute(project.id)
  console.log("Datas recalculadas (término derivado, cascata FS/SS aplicada).")

  console.log(`\nAbra: /projects/${project.id}/schedule-v2`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
