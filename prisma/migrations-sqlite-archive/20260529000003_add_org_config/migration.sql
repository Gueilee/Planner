-- Organization config singleton table
CREATE TABLE IF NOT EXISTS "OrgConfig" (
  "id"          TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
  "name"        TEXT NOT NULL DEFAULT 'Planner',
  "logoUrl"     TEXT,
  "sector"      TEXT,
  "website"     TEXT,
  "areaConfigs" TEXT,
  "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
