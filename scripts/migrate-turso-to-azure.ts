// One-off data migration: Turso (libSQL/SQLite) -> Azure PostgreSQL (schema "planner").
// Safe to re-run: truncates the destination tables (empty schema, nothing to lose) before copying.
//
// Usage:
//   AZURE_DATABASE_URL='postgresql://user:pass@host:5432/db?sslmode=require' npx tsx scripts/migrate-turso-to-azure.ts
//
// Reads source (Turso) credentials from the current .env (DATABASE_URL / TURSO_AUTH_TOKEN),
// which at this point in the migration still point at the old libSQL database.

import "dotenv/config"
import { createClient, type Row } from "@libsql/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../lib/generated/prisma/client"

const sourceUrl = (process.env.DATABASE_URL ?? "").replace("libsql://", "https://")
const sourceToken = process.env.TURSO_AUTH_TOKEN
const destUrl = process.env.AZURE_DATABASE_URL

if (!sourceUrl.startsWith("https://")) throw new Error("DATABASE_URL não parece apontar para o Turso (esperado libsql://...)")
if (!destUrl) throw new Error("AZURE_DATABASE_URL não definida")

const turso = createClient({ url: sourceUrl, authToken: sourceToken })
const adapter = new PrismaPg(
  { connectionString: destUrl, ssl: { rejectUnauthorized: false } },
  { schema: "planner" }
)
const db = new PrismaClient({ adapter })

function toDate(v: unknown): Date | null {
  if (v === null || v === undefined) return null
  return new Date(v as string | number)
}
function toBool(v: unknown): boolean | null {
  if (v === null || v === undefined) return null
  return Boolean(Number(v))
}
function fixBigints(obj: Record<string, unknown>) {
  for (const k in obj) if (typeof obj[k] === "bigint") obj[k] = Number(obj[k])
  return obj
}

async function selectAll(table: string): Promise<Record<string, unknown>[]> {
  const r = await turso.execute(`SELECT * FROM "${table}"`)
  return r.rows.map((row: Row) => {
    const obj: Record<string, unknown> = {}
    r.columns.forEach((c, i) => { obj[c] = row[i] })
    return fixBigints(obj)
  })
}

type TableCfg = {
  name:  string
  model: keyof typeof db
  bool:  string[]
  date:  string[]
  selfRef?: string // FK column referencing the same table — inserted as null, patched after
}

const TABLES: TableCfg[] = [
  { name: "Organization",           model: "organization",           bool: ["active"],  date: ["createdAt", "updatedAt"] },
  { name: "AccessProfile",          model: "accessProfile",          bool: ["isSystem"], date: ["createdAt", "updatedAt"] },
  { name: "User",                   model: "user",                   bool: ["active"],  date: ["emailVerified", "createdAt", "updatedAt"] },
  { name: "Invitation",             model: "invitation",             bool: [],          date: ["expiresAt", "usedAt", "createdAt"] },
  { name: "UserOrganizationAccess", model: "userOrganizationAccess", bool: [],          date: ["createdAt"] },
  { name: "PasswordResetToken",     model: "passwordResetToken",     bool: [],          date: ["expiresAt", "usedAt", "createdAt"] },
  { name: "Project",                model: "project",                bool: ["reportStatusManual"], date: [
    "expectedStart", "expectedEnd", "suggestedStart", "suggestedEnd", "actualStart", "actualEnd",
    "goLiveDate", "goLiveActual", "postGoLiveEndDate", "priorityUpdatedAt", "createdAt", "updatedAt",
  ] },
  { name: "ProjectMember",          model: "projectMember",          bool: [], date: ["addedAt"] },
  { name: "WbsArea",                model: "wbsArea",                bool: [], date: ["createdAt"] },
  { name: "ScheduleTask",           model: "scheduleTask",           bool: [], date: ["startDate", "endDate", "actualStart", "actualEnd", "completedAt", "createdAt", "updatedAt"], selfRef: "parentId" },
  { name: "TimeEntry",              model: "timeEntry",              bool: [], date: ["date", "createdAt"] },
  { name: "Risk",                   model: "risk",                   bool: [], date: ["createdAt", "updatedAt"] },
  { name: "Meeting",                model: "meeting",                bool: [], date: ["date", "createdAt", "updatedAt"] },
  { name: "MeetingParticipant",     model: "meetingParticipant",     bool: [], date: [] },
  { name: "StatusReport",           model: "statusReport",           bool: [], date: ["periodStart", "periodEnd", "createdAt"] },
  { name: "ProjectDocument",        model: "projectDocument",        bool: [], date: ["createdAt", "updatedAt"] },
  { name: "PostGoLiveItem",         model: "postGoLiveItem",         bool: [], date: ["date", "createdAt"] },
  { name: "LessonLearned",          model: "lessonLearned",          bool: [], date: ["identifiedAt", "createdAt", "updatedAt"] },
  { name: "Comment",                model: "comment",                bool: [], date: ["createdAt", "updatedAt"] },
  { name: "ScheduleTemplate",       model: "scheduleTemplate",       bool: ["isBuiltIn"], date: ["createdAt", "updatedAt"] },
  { name: "ScheduleTemplateTask",   model: "scheduleTemplateTask",   bool: ["isMilestone"], date: [] },
  { name: "ProjectBenefit",         model: "projectBenefit",         bool: [], date: ["baselineDate", "targetDate", "realizationDate", "createdAt", "updatedAt"] },
  { name: "Attachment",             model: "attachment",             bool: [], date: ["uploadedAt"] },
  { name: "Notification",           model: "notification",           bool: ["read"], date: ["createdAt"] },
  { name: "NotificationPreference", model: "notificationPreference", bool: [
    "projectDeadline", "projectOnHold", "projectCompleted", "taskOverdue", "taskAssigned",
    "checkpointAdded", "meetingAdded", "criticalRisk",
  ], date: ["createdAt", "updatedAt"] },
  { name: "BenefitMeasurement",     model: "benefitMeasurement",     bool: [], date: ["measuredAt", "createdAt"] },
  { name: "BenefitAuditLog",        model: "benefitAuditLog",        bool: [], date: ["createdAt"] },
  { name: "ProjectBaseline",        model: "projectBaseline",        bool: [], date: ["createdAt"] },
  { name: "BaselineSnap",           model: "baselineSnap",           bool: [], date: ["plannedStart", "plannedEnd"] },
  { name: "OrgConfig",              model: "orgConfig",              bool: [], date: ["createdAt", "updatedAt"] },
]

async function validColumns(table: string): Promise<Set<string>> {
  const rows = await db.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'planner' AND table_name = ${table}
  `
  return new Set(rows.map((r) => r.column_name))
}

function transformRow(row: Record<string, unknown>, cfg: TableCfg, allowed: Set<string>): Record<string, unknown> {
  // Turso pode ter colunas legadas que não existem mais no schema atual (ex.: ajustes manuais
  // feitos direto via prisma/apply-migration.ts) — descarta qualquer coluna fora do schema Postgres.
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(row)) if (allowed.has(k)) out[k] = row[k]
  for (const k of cfg.bool) out[k] = toBool(out[k])
  for (const k of cfg.date) out[k] = toDate(out[k])
  if (cfg.selfRef) out[cfg.selfRef] = null // patched in a second pass, after all rows exist
  return out
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function main() {
  console.log("── Limpando tabelas de destino (planner) para cópia idempotente ──")
  for (const cfg of [...TABLES].reverse()) {
    // @ts-expect-error - dynamic model access, all models expose deleteMany
    await db[cfg.model].deleteMany()
  }

  const sourceCounts: Record<string, number> = {}
  const selfRefValues: Record<string, { id: string; ref: string | null }[]> = {}

  console.log("── Copiando dados ──")
  for (const cfg of TABLES) {
    const rows = await selectAll(cfg.name)
    sourceCounts[cfg.name] = rows.length

    if (cfg.selfRef) {
      selfRefValues[cfg.name] = rows.map((r) => ({ id: r.id as string, ref: (r[cfg.selfRef!] as string | null) ?? null }))
    }

    const allowed = await validColumns(cfg.name)
    const data = rows.map((r) => transformRow(r, cfg, allowed))
    if (data.length > 0) {
      for (const batch of chunk(data, 500)) {
        // @ts-expect-error - dynamic model access, all models expose createMany
        await db[cfg.model].createMany({ data: batch })
      }
    }
    console.log(`  ${cfg.name}: ${data.length} linhas copiadas`)
  }

  console.log("── Corrigindo referências próprias (ScheduleTask.parentId) ──")
  for (const [tableName, refs] of Object.entries(selfRefValues)) {
    const cfg = TABLES.find((t) => t.name === tableName)!
    for (const { id, ref } of refs) {
      if (!ref) continue
      // @ts-expect-error - dynamic model access, all models expose update
      await db[cfg.model].update({ where: { id }, data: { [cfg.selfRef!]: ref } })
    }
  }

  console.log("── Conferindo contagem de linhas (Turso vs Azure) ──")
  let ok = true
  let totalSource = 0
  let totalDest = 0
  for (const cfg of TABLES) {
    // @ts-expect-error - dynamic model access, all models expose count
    const destCount: number = await db[cfg.model].count()
    const srcCount = sourceCounts[cfg.name]
    totalSource += srcCount
    totalDest += destCount
    const match = destCount === srcCount
    if (!match) ok = false
    console.log(`  ${match ? "✅" : "❌"} ${cfg.name}: turso=${srcCount} azure=${destCount}`)
  }
  console.log(`TOTAL: turso=${totalSource} azure=${totalDest}`)

  if (!ok) {
    console.error("❌ Divergência de contagem em pelo menos uma tabela — não prosseguir com o cutover.")
    process.exit(1)
  }
  console.log("✅ Migração de dados concluída — todas as tabelas batendo.")
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await turso.close(); await db.$disconnect() })
