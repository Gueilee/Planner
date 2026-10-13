// Migração manual (Postgres, schema "planner") — NUNCA usar `prisma db push`/
// `migrate` neste projeto: o banco "vdm_projetos" é compartilhado com outros
// sistemas da Vendemmia, e a CLI do Prisma não sabe que o Planner vive
// isolado no schema "planner" (isolamento feito só no adapter, lib/db.ts).
// Mudança de schema aqui é sempre SQL cru, qualificado com planner.*, rodado
// pelo client já configurado certo (lib/db.ts).
//
// Cria a tabela KanbanColumn — colunas de Kanban customizadas por projeto
// (botão "+" no Kanban de Tarefas).
//
// Uso: npx tsx scripts/apply-kanban-columns-migration.ts
import "dotenv/config"
import { config } from "dotenv"
config({ path: ".env.local", override: true })
import { db } from "../lib/db"

async function main() {
  console.log("Criando tabela KanbanColumn...")
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "planner"."KanbanColumn" (
      "id"          TEXT NOT NULL,
      "projectId"   TEXT NOT NULL,
      "statusValue" TEXT NOT NULL,
      "label"       TEXT NOT NULL,
      "color"       TEXT NOT NULL DEFAULT '#8B5CF6',
      "order"       INTEGER NOT NULL DEFAULT 0,
      "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "KanbanColumn_pkey" PRIMARY KEY ("id")
    )
  `)
  await db.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "KanbanColumn_projectId_statusValue_key"
    ON "planner"."KanbanColumn"("projectId", "statusValue")
  `)
  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "KanbanColumn_projectId_idx"
    ON "planner"."KanbanColumn"("projectId")
  `)
  const hasFk = await db.$queryRawUnsafe<unknown[]>(`
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'planner' AND table_name = 'KanbanColumn'
    AND constraint_name = 'KanbanColumn_projectId_fkey'
  `)
  if (hasFk.length > 0) {
    console.log("   FK já existe, pulando")
  } else {
    await db.$executeRawUnsafe(`
      ALTER TABLE "planner"."KanbanColumn"
      ADD CONSTRAINT "KanbanColumn_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "planner"."Project"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    `)
  }
  console.log("   ✓ ok")
  console.log("\nDone.")
}

main().finally(() => db.$disconnect())
