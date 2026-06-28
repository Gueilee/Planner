-- Multi-tenant: Organization model + organizationId on User and Project
-- Existing data is automatically assigned to the default "Vendemmia" org

CREATE TABLE IF NOT EXISTS "Organization" (
  "id"        TEXT NOT NULL PRIMARY KEY,
  "name"      TEXT NOT NULL,
  "slug"      TEXT NOT NULL,
  "logoUrl"   TEXT,
  "active"    INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "Organization_slug_key" ON "Organization"("slug");

-- Seed the default Vendemmia organization
INSERT OR IGNORE INTO "Organization" ("id", "name", "slug", "active", "createdAt", "updatedAt")
VALUES ('org_vendemmia', 'Vendemmia', 'vendemmia', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Add organizationId to User (all existing users → Vendemmia)
ALTER TABLE "User" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org_vendemmia';

-- Add organizationId to Project (all existing projects → Vendemmia)
ALTER TABLE "Project" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org_vendemmia';

-- Indexes for efficient tenant-scoped queries
CREATE INDEX IF NOT EXISTS "User_organizationId_idx"    ON "User"("organizationId");
CREATE INDEX IF NOT EXISTS "Project_organizationId_idx" ON "Project"("organizationId");
