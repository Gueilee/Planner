-- CreateTable ProjectBenefit
CREATE TABLE IF NOT EXISTS "ProjectBenefit" (
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
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProjectBenefit_projectId_idx"  ON "ProjectBenefit"("projectId");
CREATE INDEX IF NOT EXISTS "ProjectBenefit_category_idx"   ON "ProjectBenefit"("category");
CREATE INDEX IF NOT EXISTS "ProjectBenefit_status_idx"     ON "ProjectBenefit"("status");

-- CreateTable BenefitMeasurement
CREATE TABLE IF NOT EXISTS "BenefitMeasurement" (
  "id"            TEXT     NOT NULL PRIMARY KEY,
  "benefitId"     TEXT     NOT NULL,
  "measuredAt"    DATETIME NOT NULL,
  "measuredValue" REAL     NOT NULL,
  "notes"         TEXT,
  "createdById"   TEXT     NOT NULL,
  "createdAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BenefitMeasurement_benefitId_fkey"   FOREIGN KEY ("benefitId")   REFERENCES "ProjectBenefit"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BenefitMeasurement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id")           ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BenefitMeasurement_benefitId_idx" ON "BenefitMeasurement"("benefitId");

-- AlterTable Attachment — add benefitId column
ALTER TABLE "Attachment" ADD COLUMN "benefitId" TEXT REFERENCES "ProjectBenefit"("id") ON DELETE CASCADE;

-- AlterTable Project — add investment column
ALTER TABLE "Project" ADD COLUMN "investment" REAL NOT NULL DEFAULT 0;
