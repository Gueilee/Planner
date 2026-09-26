// Migração manual (Postgres, schema "planner") — NUNCA usar `prisma db push`/
// `migrate` neste projeto: o banco "vdm_projetos" é compartilhado com outros
// sistemas da Vendemmia (schemas "compras", "malha", "reserva_reuniao",
// tabelas legadas em "public" — ver comentário em lib/db.ts), e a CLI do
// Prisma não sabe que o Planner vive isolado no schema "planner" (esse
// isolamento é feito só no adapter, em lib/db.ts, via { schema: "planner" }
// do @prisma/adapter-pg) — `prisma db push` tentou recriar tabelas de OUTRO
// sistema (public.User/public.Meeting, de um app completamente diferente) e
// pediria --force-reset, que apagaria dados de terceiros. Por isso, mudança
// de schema aqui sempre é SQL cru, explicitamente qualificado com
// planner.*, rodado através do client já configurado certo (lib/db.ts).
//
// Uso: npx tsx scripts/apply-holidays-and-cancelled-migration.ts
import "dotenv/config"
import { config } from "dotenv"
config({ path: ".env.local", override: true })
import { db } from "../lib/db"

async function main() {
  console.log("1) Adicionando CANCELLED ao enum TaskStatus...")
  const hasCancelled = await db.$queryRawUnsafe<unknown[]>(`
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'planner' AND t.typname = 'TaskStatus' AND e.enumlabel = 'CANCELLED'
  `)
  if (hasCancelled.length > 0) {
    console.log("   já existe, pulando")
  } else {
    await db.$executeRawUnsafe(`ALTER TYPE "planner"."TaskStatus" ADD VALUE 'CANCELLED'`)
    console.log("   ✓ adicionado")
  }

  console.log("2) Criando tabela OrganizationHoliday...")
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "planner"."OrganizationHoliday" (
      "id" TEXT NOT NULL,
      "organizationId" TEXT NOT NULL,
      "dia" DATE NOT NULL,
      "descricao" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "OrganizationHoliday_pkey" PRIMARY KEY ("id")
    )
  `)
  await db.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationHoliday_organizationId_dia_key"
    ON "planner"."OrganizationHoliday"("organizationId", "dia")
  `)
  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "OrganizationHoliday_organizationId_idx"
    ON "planner"."OrganizationHoliday"("organizationId")
  `)
  const hasFk = await db.$queryRawUnsafe<unknown[]>(`
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'planner' AND table_name = 'OrganizationHoliday'
    AND constraint_name = 'OrganizationHoliday_organizationId_fkey'
  `)
  if (hasFk.length > 0) {
    console.log("   FK já existe, pulando")
  } else {
    await db.$executeRawUnsafe(`
      ALTER TABLE "planner"."OrganizationHoliday"
      ADD CONSTRAINT "OrganizationHoliday_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "planner"."Organization"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    `)
  }
  console.log("   ✓ ok")

  console.log("\nDone.")
}

main().finally(() => db.$disconnect())
