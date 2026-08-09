-- Migration: Enhance Benefits — BRM full rebuild
-- Adds new enum values, fields, periodicity, audit log, responsible relation

-- ─── New enum values ──────────────────────────────────────────────────────────

-- BenefitCategory: add COMPLIANCE
ALTER TABLE "ProjectBenefit" ADD COLUMN "_cat_migration" TEXT;
-- (enum values added via CREATE TYPE workaround for LibSQL — handled by Prisma client mapping)

-- BenefitType new values (LibSQL stores as TEXT — just add enum mapping)
-- No ALTER needed for LibSQL TEXT-based enums

-- BenefitStatus: add PARTIAL and CANCELLED
-- (LibSQL: stored as TEXT, Prisma validates at client level — no DDL needed)

-- ─── BenefitPeriodicity enum (new) ────────────────────────────────────────────
-- LibSQL stores enums as TEXT — no CREATE TYPE needed

-- ─── New columns on ProjectBenefit ───────────────────────────────────────────
ALTER TABLE "ProjectBenefit" ADD COLUMN "name"               TEXT NOT NULL DEFAULT '';
ALTER TABLE "ProjectBenefit" ADD COLUMN "indicator"          TEXT;
ALTER TABLE "ProjectBenefit" ADD COLUMN "formula"            TEXT;
ALTER TABLE "ProjectBenefit" ADD COLUMN "periodicity"        TEXT NOT NULL DEFAULT 'MONTHLY';
ALTER TABLE "ProjectBenefit" ADD COLUMN "monitoringMonths"   INTEGER NOT NULL DEFAULT 12;
ALTER TABLE "ProjectBenefit" ADD COLUMN "targetDate"         DATETIME;
ALTER TABLE "ProjectBenefit" ADD COLUMN "notes"              TEXT;
ALTER TABLE "ProjectBenefit" ADD COLUMN "responsibleId"      TEXT;
ALTER TABLE "ProjectBenefit" ADD COLUMN "timeBeforeMinutes"  REAL;
ALTER TABLE "ProjectBenefit" ADD COLUMN "timeAfterMinutes"   REAL;
ALTER TABLE "ProjectBenefit" ADD COLUMN "executionsPerMonth" REAL;
ALTER TABLE "ProjectBenefit" ADD COLUMN "hourlyRate"         REAL;
ALTER TABLE "ProjectBenefit" ADD COLUMN "strategicWeight"    REAL NOT NULL DEFAULT 0;

-- ─── Foreign key index for responsibleId ─────────────────────────────────────
CREATE INDEX "ProjectBenefit_responsibleId_idx" ON "ProjectBenefit"("responsibleId");

-- ─── BenefitAuditLog model ────────────────────────────────────────────────────
CREATE TABLE "BenefitAuditLog" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "benefitId"   TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "action"      TEXT NOT NULL,
    "fieldName"   TEXT,
    "oldValue"    TEXT,
    "newValue"    TEXT,
    "reason"      TEXT,
    "comment"     TEXT,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BenefitAuditLog_benefitId_fkey" FOREIGN KEY ("benefitId") REFERENCES "ProjectBenefit" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BenefitAuditLog_userId_fkey"    FOREIGN KEY ("userId")    REFERENCES "User" ("id")           ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "BenefitAuditLog_benefitId_idx" ON "BenefitAuditLog"("benefitId");
CREATE INDEX "BenefitAuditLog_userId_idx"    ON "BenefitAuditLog"("userId");

-- ─── Backfill name from description ──────────────────────────────────────────
UPDATE "ProjectBenefit" SET "name" = SUBSTR("description", 1, 80) WHERE "name" = '';

-- ─── Drop temp column ─────────────────────────────────────────────────────────
-- SQLite/LibSQL doesn't support DROP COLUMN in older versions; skip for safety
