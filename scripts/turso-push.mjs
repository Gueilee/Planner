/**
 * Aplica o schema do dev.db local para o Turso.
 * Uso: node scripts/turso-push.mjs
 */
import { createClient as createTurso } from "@libsql/client"
import { createClient as createLocal } from "@libsql/client"
import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import "dotenv/config"

const __dir = dirname(fileURLToPath(import.meta.url))
const root  = join(__dir, "..")

// ── Lê o .env.local manualmente se existir ──────────────────────────────────
try {
  const raw = readFileSync(join(root, ".env.local"), "utf8")
  for (const line of raw.split("\n")) {
    const [k, ...rest] = line.split("=")
    if (k && rest.length) {
      const v = rest.join("=").trim().replace(/^"|"$/g, "")
      if (!process.env[k.trim()]) process.env[k.trim()] = v
    }
  }
} catch {}

const TURSO_URL   = process.env.DATABASE_URL
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN
const LOCAL_DB    = join(root, "dev.db")

if (!TURSO_URL || !TURSO_URL.startsWith("libsql://")) {
  console.error("❌  DATABASE_URL não é uma URL Turso válida:", TURSO_URL)
  process.exit(1)
}

// ── Conecta ao SQLite local ──────────────────────────────────────────────────
const local = createLocal({ url: `file:${LOCAL_DB}` })

// ── Conecta ao Turso ──────────────────────────────────────────────────────────
const turso = createTurso({ url: TURSO_URL, authToken: TURSO_TOKEN })

async function main() {
  console.log("📡  Conectando ao Turso:", TURSO_URL)

  // Busca todas as tabelas e índices do SQLite local
  const { rows } = await local.execute(
    `SELECT type, name, sql FROM sqlite_master
     WHERE sql IS NOT NULL
       AND name NOT LIKE 'sqlite_%'
       AND name NOT LIKE '_prisma_%'
     ORDER BY
       CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END,
       name`
  )

  console.log(`📋  ${rows.length} objetos encontrados no schema local`)

  // Verifica tabelas já existentes no Turso
  let existing = new Set()
  try {
    const { rows: ex } = await turso.execute(
      `SELECT name FROM sqlite_master WHERE type='table'`
    )
    existing = new Set(ex.map(r => r.name))
    if (existing.size > 0) {
      console.log(`⚠️   Turso já tem ${existing.size} tabela(s): ${[...existing].join(", ")}`)
    }
  } catch {}

  let created = 0, skipped = 0, errors = 0

  for (const row of rows) {
    const { type, name, sql } = row
    if (type === "table" && existing.has(name)) {
      console.log(`  ⏭  tabela já existe: ${name}`)
      skipped++
      continue
    }

    try {
      await turso.execute(sql)
      console.log(`  ✅  ${type} criado: ${name}`)
      created++
    } catch (err) {
      const msg = err?.message ?? String(err)
      if (msg.includes("already exists")) {
        console.log(`  ⏭  já existe: ${name}`)
        skipped++
      } else {
        console.error(`  ❌  erro em ${name}: ${msg}`)
        errors++
      }
    }
  }

  await local.close()
  await turso.close()

  console.log(`\n🎉  Concluído: ${created} criados, ${skipped} ignorados, ${errors} erros`)
  if (errors > 0) process.exit(1)
}

main().catch(err => {
  console.error("Erro fatal:", err)
  process.exit(1)
})
