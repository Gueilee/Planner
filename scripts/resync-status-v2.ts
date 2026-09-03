// Fase 5 — correção pontual: a Fase 2 (migrate-scheduletask-to-v2.ts) gravou
// o status de cada item usando um vocabulário de 4 valores (A_INICIAR/
// EM_ANDAMENTO/CONCLUIDO/ATRASADO). Depois disso o time decidiu expandir
// para 6 valores (o Kanban precisa da distinção real de "Em Validação" e
// "Pausada", não só de uma cor) — o que colapsou VALIDATION->EM_ANDAMENTO e
// ON_HOLD->EM_ANDAMENTO nos itens já migrados.
//
// Este script corrige isso: para cada linha do mapa de migração (Fase 2),
// relê o status ORIGINAL do ScheduleTask legado (nunca apagado) e regrava o
// status do ScheduleV2Item correspondente com o mapeamento de 6 valores —
// sem tocar em mais nenhum campo (datas, hierarquia, dependências). Aditivo
// e idempotente: só ajusta linhas cujo status esperado é diferente do atual.
//
// Uso: npx tsx scripts/resync-status-v2.ts [--apply]
// Sem --apply, roda em modo dry-run (só relatório).

import { db } from "../lib/db"
import { LEGACY_STATUS_TO_V2 } from "../lib/utils/schedule-v2-adapter"

async function main() {
  const apply = process.argv.includes("--apply")
  console.log(apply ? "=== MODO APLICAR (grava no banco) ===" : "=== MODO DRY-RUN (só relatório, nada é gravado) ===")

  const map = await db.scheduleV2MigrationMap.findMany({ select: { legacyTaskId: true, newItemId: true } })
  if (map.length === 0) { console.log("Nenhuma linha no mapa de migração — nada a fazer."); return }

  const legacyTasks = await db.scheduleTask.findMany({
    where: { id: { in: map.map((m) => m.legacyTaskId) } },
    select: { id: true, status: true },
  })
  const legacyStatusById = new Map(legacyTasks.map((t) => [t.id, t.status as string]))

  const v2Items = await db.scheduleV2Item.findMany({
    where: { id: { in: map.map((m) => m.newItemId) } },
    select: { id: true, status: true },
  })
  const v2StatusById = new Map(v2Items.map((i) => [i.id, i.status]))

  const toFix: { id: string; from: string; to: string }[] = []
  for (const m of map) {
    const legacyStatus = legacyStatusById.get(m.legacyTaskId)
    if (!legacyStatus) continue
    const expected = LEGACY_STATUS_TO_V2[legacyStatus] ?? "A_INICIAR"
    const current = v2StatusById.get(m.newItemId)
    if (current !== undefined && current !== expected) {
      toFix.push({ id: m.newItemId, from: current, to: expected })
    }
  }

  const byTransition = new Map<string, number>()
  for (const f of toFix) {
    const key = `${f.from} -> ${f.to}`
    byTransition.set(key, (byTransition.get(key) ?? 0) + 1)
  }
  console.log(`${toFix.length} item(ns) a corrigir:`)
  for (const [key, n] of byTransition) console.log(`  ${key}: ${n}`)

  if (!apply || toFix.length === 0) return

  await db.$transaction(toFix.map((f) => db.scheduleV2Item.update({ where: { id: f.id }, data: { status: f.to } })))
  console.log("✓ corrigido")
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
