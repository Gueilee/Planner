CREATE TABLE "Invitation" (
    "id"             TEXT NOT NULL PRIMARY KEY,
    "email"          TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "role"           TEXT NOT NULL DEFAULT 'PROJECT_MEMBER',
    "token"          TEXT NOT NULL,
    "expiresAt"      DATETIME NOT NULL,
    "usedAt"         DATETIME,
    "organizationId" TEXT NOT NULL,
    "createdById"    TEXT NOT NULL,
    "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Invitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Invitation_token_key" ON "Invitation"("token");
