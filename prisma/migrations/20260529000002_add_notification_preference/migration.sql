-- Add NotificationPreference table for per-user notification settings
CREATE TABLE IF NOT EXISTS "NotificationPreference" (
  "id"               TEXT NOT NULL PRIMARY KEY,
  "userId"           TEXT NOT NULL UNIQUE,
  "projectDeadline"  INTEGER NOT NULL DEFAULT 1,
  "projectOnHold"    INTEGER NOT NULL DEFAULT 1,
  "projectCompleted" INTEGER NOT NULL DEFAULT 0,
  "taskOverdue"      INTEGER NOT NULL DEFAULT 1,
  "taskAssigned"     INTEGER NOT NULL DEFAULT 1,
  "checkpointAdded"  INTEGER NOT NULL DEFAULT 1,
  "meetingAdded"     INTEGER NOT NULL DEFAULT 0,
  "criticalRisk"     INTEGER NOT NULL DEFAULT 1,
  "createdAt"        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
