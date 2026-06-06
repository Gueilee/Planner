-- Modelos de Cronograma (Schedule Templates)
CREATE TABLE IF NOT EXISTS "ScheduleTemplate" (
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
);

CREATE TABLE IF NOT EXISTS "ScheduleTemplateTask" (
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
);

CREATE INDEX IF NOT EXISTS "ScheduleTemplate_createdById_idx"   ON "ScheduleTemplate"("createdById");
CREATE INDEX IF NOT EXISTS "ScheduleTemplateTask_templateId_idx" ON "ScheduleTemplateTask"("templateId");
