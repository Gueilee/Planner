// Fase 3 do plano de adoção do v2: repontar TimeEntry/Comment/Attachment
// para o ScheduleV2Item correspondente, usando o mapa de auditoria gravado
// pela Fase 2 (scripts/migrate-scheduletask-to-v2.ts).
//
// Aditivo e idempotente: só PREENCHE scheduleV2ItemId onde ainda está nulo;
// nunca toca taskId (o vínculo com o legado continua intacto para sempre).
// Pode rodar de novo com segurança a qualquer momento (ex.: depois de
// migrar mais projetos), sem duplicar nem sobrescrever nada.
//
// Uso: npx tsx scripts/repoint-legacy-history-to-v2.ts [--apply]
// Sem --apply, roda em modo dry-run (só relatório).

import { db } from "../lib/db"

async function main() {
  const apply = process.argv.includes("--apply")
  console.log(apply ? "=== MODO APLICAR (grava no banco) ===" : "=== MODO DRY-RUN (só relatório, nada é gravado) ===")

  const map = await db.scheduleV2MigrationMap.findMany({ select: { legacyTaskId: true, newItemId: true } })
  const legacyIds = map.map((m) => m.legacyTaskId)
  const newIdByLegacy = new Map(map.map((m) => [m.legacyTaskId, m.newItemId]))

  const [timeEntries, comments, attachments] = await Promise.all([
    db.timeEntry.findMany({ where: { taskId: { in: legacyIds }, scheduleV2ItemId: null }, select: { id: true, taskId: true } }),
    db.comment.findMany({ where: { taskId: { in: legacyIds }, scheduleV2ItemId: null }, select: { id: true, taskId: true } }),
    db.attachment.findMany({ where: { taskId: { in: legacyIds }, scheduleV2ItemId: null }, select: { id: true, taskId: true } }),
  ])

  console.log(`TimeEntry a repontar: ${timeEntries.length}`)
  console.log(`Comment a repontar:   ${comments.length}`)
  console.log(`Attachment a repontar: ${attachments.length}`)

  if (!apply) return

  await db.$transaction([
    ...timeEntries.map((t) => db.timeEntry.update({ where: { id: t.id }, data: { scheduleV2ItemId: newIdByLegacy.get(t.taskId!)! } })),
    ...comments.map((c) => db.comment.update({ where: { id: c.id }, data: { scheduleV2ItemId: newIdByLegacy.get(c.taskId!)! } })),
    ...attachments.map((a) => db.attachment.update({ where: { id: a.id }, data: { scheduleV2ItemId: newIdByLegacy.get(a.taskId!)! } })),
  ])

  console.log("✓ repontado")
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
