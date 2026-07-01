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

  // ── Migration 3: S-Curve Baselines ─────────────────────────────────────────
  await client.batch([
    {
      sql: `CREATE TABLE IF NOT EXISTS "ProjectBaseline" (
        "id"          TEXT     NOT NULL PRIMARY KEY,
        "projectId"   TEXT     NOT NULL,
        "number"      INTEGER  NOT NULL,
        "name"        TEXT     NOT NULL,
        "description" TEXT,
        "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ProjectBaseline_projectId_fkey"
          FOREIGN KEY ("projectId") REFERENCES "Project" ("id")
          ON DELETE CASCADE ON UPDATE CASCADE
      )`,
      args: [],
    },
    {
      sql: `CREATE UNIQUE INDEX IF NOT EXISTS "ProjectBaseline_projectId_number_key" ON "ProjectBaseline"("projectId", "number")`,
      args: [],
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS "ProjectBaseline_projectId_idx" ON "ProjectBaseline"("projectId")`,
      args: [],
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS "BaselineSnap" (
        "id"         TEXT     NOT NULL PRIMARY KEY,
        "baselineId" TEXT     NOT NULL,
        "taskId"     TEXT     NOT NULL,
        "taskTitle"  TEXT     NOT NULL,
        "plannedEnd" DATETIME NOT NULL,
        CONSTRAINT "BaselineSnap_baselineId_fkey"
          FOREIGN KEY ("baselineId") REFERENCES "ProjectBaseline" ("id")
          ON DELETE CASCADE ON UPDATE CASCADE
      )`,
      args: [],
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS "BaselineSnap_baselineId_idx" ON "BaselineSnap"("baselineId")`,
      args: [],
    },
  ], "write")

  // ALTER TABLE — idempotent via try/catch (SQLite ignores ADD COLUMN IF NOT EXISTS)
  const alters = [
    `ALTER TABLE "Attachment"       ADD COLUMN "benefitId"    TEXT REFERENCES "ProjectBenefit"("id") ON DELETE CASCADE`,
    `ALTER TABLE "Project"          ADD COLUMN "investment"         REAL    NOT NULL DEFAULT 0`,
    `ALTER TABLE "Project"          ADD COLUMN "reportStatusManual" INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE "Project"          ADD COLUMN "requestNumber"      INTEGER`,
    `ALTER TABLE "Project"          ADD COLUMN "proposalNumber"     TEXT`,
    `ALTER TABLE "Project"          ADD COLUMN "contractNumber"     TEXT`,
    // ── Enhance S-Curve Baselines (migration 20260627000001) ──────────────────
    `ALTER TABLE "ProjectBaseline"  ADD COLUMN "reason"       TEXT`,
    `ALTER TABLE "ProjectBaseline"  ADD COLUMN "createdById"  TEXT REFERENCES "User"("id")`,
    `ALTER TABLE "BaselineSnap"     ADD COLUMN "plannedStart" DATETIME`,
    `ALTER TABLE "BaselineSnap"     ADD COLUMN "budgetedCost" REAL`,
  ]
  for (const sql of alters) {
    try {
      await client.execute(sql)
    } catch {
      // Column already exists — ignore
    }
  }

  // ── Migration 4: Invitations ──────────────────────────────────────────────────
  await client.batch([
    {
      sql: `CREATE TABLE IF NOT EXISTS "Invitation" (
        "id"             TEXT     NOT NULL PRIMARY KEY,
        "email"          TEXT     NOT NULL,
        "name"           TEXT     NOT NULL,
        "role"           TEXT     NOT NULL DEFAULT 'PROJECT_MEMBER',
        "token"          TEXT     NOT NULL,
        "expiresAt"      DATETIME NOT NULL,
        "usedAt"         DATETIME,
        "organizationId" TEXT     NOT NULL,
        "createdById"    TEXT     NOT NULL,
        "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "Invitation_createdById_fkey"    FOREIGN KEY ("createdById")    REFERENCES "User" ("id")         ON DELETE RESTRICT ON UPDATE CASCADE
      )`,
      args: [],
    },
    {
      sql: `CREATE UNIQUE INDEX IF NOT EXISTS "Invitation_token_key" ON "Invitation"("token")`,
      args: [],
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS "Invitation_email_idx" ON "Invitation"("email")`,
      args: [],
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS "Invitation_organizationId_idx" ON "Invitation"("organizationId")`,
      args: [],
    },
  ], "write")

  // ── Migration 5: Password Reset Tokens ───────────────────────────────────────
  await client.batch([
    {
      sql: `CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
        "id"        TEXT     NOT NULL PRIMARY KEY,
        "userId"    TEXT     NOT NULL,
        "token"     TEXT     NOT NULL,
        "expiresAt" DATETIME NOT NULL,
        "usedAt"    DATETIME,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PasswordResetToken_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User" ("id")
          ON DELETE CASCADE ON UPDATE CASCADE
      )`,
      args: [],
    },
    {
      sql: `CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_token_key" ON "PasswordResetToken"("token")`,
      args: [],
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId")`,
      args: [],
    },
  ], "write")

  // ── Migration 6: UserOrganizationAccess + Invitation.extraOrgIds ────────────
  await client.batch([
    {
      sql: `CREATE TABLE IF NOT EXISTS "UserOrganizationAccess" (
        "id"             TEXT     NOT NULL PRIMARY KEY,
        "userId"         TEXT     NOT NULL,
        "organizationId" TEXT     NOT NULL,
        "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "UserOrganizationAccess_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User" ("id")
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "UserOrganizationAccess_orgId_fkey"
          FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id")
          ON DELETE CASCADE ON UPDATE CASCADE
      )`,
      args: [],
    },
    {
      sql: `CREATE UNIQUE INDEX IF NOT EXISTS "UserOrganizationAccess_userId_orgId_key"
        ON "UserOrganizationAccess"("userId", "organizationId")`,
      args: [],
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS "UserOrganizationAccess_userId_idx"
        ON "UserOrganizationAccess"("userId")`,
      args: [],
    },
  ], "write")

  try {
    await client.execute(`ALTER TABLE "Invitation" ADD COLUMN "extraOrgIds" TEXT`)
  } catch {
    // Column already exists — ignore
  }

  // ── Migration 7: AccessProfile + User.profileId ──────────────────────────────
  await client.batch([
    {
      sql: `CREATE TABLE IF NOT EXISTS "AccessProfile" (
        "id"             TEXT     NOT NULL PRIMARY KEY,
        "name"           TEXT     NOT NULL,
        "description"    TEXT,
        "color"          TEXT     NOT NULL DEFAULT '#7B2FBE',
        "permissions"    TEXT     NOT NULL DEFAULT '{}',
        "isSystem"       INTEGER  NOT NULL DEFAULT 0,
        "organizationId" TEXT     NOT NULL,
        "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "AccessProfile_organizationId_fkey"
          FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id")
          ON DELETE CASCADE ON UPDATE CASCADE
      )`,
      args: [],
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS "AccessProfile_organizationId_idx"
        ON "AccessProfile"("organizationId")`,
      args: [],
    },
  ], "write")

  try {
    await client.execute(
      `ALTER TABLE "User" ADD COLUMN "profileId" TEXT REFERENCES "AccessProfile"("id") ON DELETE SET NULL`
    )
  } catch {
    // Column already exists — ignore
  }

  console.log("✅ Migrations aplicadas com sucesso!")
  client.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
