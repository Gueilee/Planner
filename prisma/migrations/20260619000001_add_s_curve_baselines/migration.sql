-- CreateTable ProjectBaseline
CREATE TABLE IF NOT EXISTS "ProjectBaseline" (
  "id"          TEXT     NOT NULL PRIMARY KEY,
  "projectId"   TEXT     NOT NULL,
  "number"      INTEGER  NOT NULL,
  "name"        TEXT     NOT NULL,
  "description" TEXT,
  "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectBaseline_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProjectBaseline_projectId_number_key" ON "ProjectBaseline"("projectId", "number");
CREATE INDEX IF NOT EXISTS "ProjectBaseline_projectId_idx" ON "ProjectBaseline"("projectId");

-- CreateTable BaselineSnap
CREATE TABLE IF NOT EXISTS "BaselineSnap" (
  "id"         TEXT     NOT NULL PRIMARY KEY,
  "baselineId" TEXT     NOT NULL,
  "taskId"     TEXT     NOT NULL,
  "taskTitle"  TEXT     NOT NULL,
  "plannedEnd" DATETIME NOT NULL,
  CONSTRAINT "BaselineSnap_baselineId_fkey" FOREIGN KEY ("baselineId") REFERENCES "ProjectBaseline"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "BaselineSnap_baselineId_idx" ON "BaselineSnap"("baselineId");
