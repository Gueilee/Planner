import "dotenv/config"
import { createClient } from "@libsql/client"

const rawUrl    = process.env.DATABASE_URL ?? "file:./dev.db"
const authToken = process.env.TURSO_AUTH_TOKEN
const url = rawUrl.startsWith("libsql://") ? rawUrl : rawUrl

const client = createClient({ url, authToken })

async function main() {
  // ── Migration 1: Schedule Templates ─────────────────────────────────────────
  await client.batch([
    {
      sql: `CREATE TABLE IF NOT EXISTS "ScheduleTemplate" (
        "id"          TEXT NOT NULL PRIMARY KEY,
        "name"        TEXT NOT NULL,
        "description" TEXT,
        "projectType" TEXT NOT NULL DEFAULT 'CUSTOM',
        "color"       TEXT,
        "isBuiltIn"   INTEGER NOT NULL DEFAULT 0,
        "createdById" TEXT NOT NULL,
        "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ScheduleTemplate_createdById_fkey"
          FOREIGN KEY ("createdById") REFERENCES "User" ("id")
          ON DELETE RESTRICT ON UPDATE CASCADE
      )`,
      args: [],
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS "ScheduleTemplateTask" (
        "id"               TEXT NOT NULL PRIMARY KEY,
        "templateId"       TEXT NOT NULL,
        "wbsCode"          TEXT NOT NULL,
        "parentCode"       TEXT,
        "title"            TEXT NOT NULL,
        "estimatedEffort"  REAL,
        "isMilestone"      INTEGER NOT NULL DEFAULT 0,
        "predecessorCodes" TEXT,
        "durationDays"     INTEGER NOT NULL DEFAULT 1,
        "order"            INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT "ScheduleTemplateTask_templateId_fkey"
          FOREIGN KEY ("templateId") REFERENCES "ScheduleTemplate" ("id")
          ON DELETE CASCADE ON UPDATE CASCADE
      )`,
      args: [],
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS "ScheduleTemplate_createdById_idx" ON "ScheduleTemplate"("createdById")`,
      args: [],
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS "ScheduleTemplateTask_templateId_idx" ON "ScheduleTemplateTask"("templateId")`,
      args: [],
    },
  ], "write")

  // ── Migration 2: Project Benefits ────────────────────────────────────────────
  await client.batch([
    {
      sql: `CREATE TABLE IF NOT EXISTS "ProjectBenefit" (
        "id"              TEXT     NOT NULL PRIMARY KEY,
        "projectId"       TEXT     NOT NULL,
        "category"        TEXT     NOT NULL,
        "type"            TEXT     NOT NULL,
        "description"     TEXT     NOT NULL,
        "unit"            TEXT     NOT NULL DEFAULT 'R$',
        "plannedValue"    REAL     NOT NULL DEFAULT 0,
        "realizedValue"   REAL     NOT NULL DEFAULT 0,
        "frequency"       TEXT     NOT NULL DEFAULT 'ONCE',
        "baselineDate"    DATETIME,
        "realizationDate" DATETIME,
        "evidence"        TEXT,
        "status"          TEXT     NOT NULL DEFAULT 'PLANNED',
        "createdById"     TEXT     NOT NULL,
        "createdAt"       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ProjectBenefit_projectId_fkey"   FOREIGN KEY ("projectId")   REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "ProjectBenefit_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id")    ON DELETE RESTRICT ON UPDATE CASCADE
      )`,
      args: [],
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS "BenefitMeasurement" (
        "id"            TEXT     NOT NULL PRIMARY KEY,
        "benefitId"     TEXT     NOT NULL,
        "measuredAt"    DATETIME NOT NULL,
        "measuredValue" REAL     NOT NULL,
        "notes"         TEXT,
        "createdById"   TEXT     NOT NULL,
        "createdAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "BenefitMeasurement_benefitId_fkey"   FOREIGN KEY ("benefitId")   REFERENCES "ProjectBenefit"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "BenefitMeasurement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id")           ON DELETE RESTRICT ON UPDATE CASCADE
      )`,
      args: [],
    },
    { sql: `CREATE INDEX IF NOT EXISTS "ProjectBenefit_projectId_idx"  ON "ProjectBenefit"("projectId")`,  args: [] },
    { sql: `CREATE INDEX IF NOT EXISTS "ProjectBenefit_category_idx"   ON "ProjectBenefit"("category")`,   args: [] },
    { sql: `CREATE INDEX IF NOT EXISTS "ProjectBenefit_status_idx"     ON "ProjectBenefit"("status")`,     args: [] },
    { sql: `CREATE INDEX IF NOT EXISTS "BenefitMeasurement_benefitId_idx" ON "BenefitMeasurement"("benefitId")`, args: [] },
  ], "write")

  // ALTER TABLE — idempotent via try/catch (SQLite ignores ADD COLUMN IF NOT EXISTS)
  const alters = [
    `ALTER TABLE "Attachment" ADD COLUMN "benefitId" TEXT REFERENCES "ProjectBenefit"("id") ON DELETE CASCADE`,
    `ALTER TABLE "Project"    ADD COLUMN "investment" REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE "Project"    ADD COLUMN "reportStatusManual" INTEGER NOT NULL DEFAULT 0`,
  ]
  for (const sql of alters) {
    try {
      await client.execute(sql)
    } catch {
      // Column already exists — ignore
    }
  }

  console.log("✅ Migrations aplicadas com sucesso!")
  client.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
