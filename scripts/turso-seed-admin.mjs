/**
 * Cria um usuário admin inicial no Turso.
 * Uso: node scripts/turso-seed-admin.mjs
 */
import { createClient } from "@libsql/client"
import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import { createHash } from "crypto"

const __dir = dirname(fileURLToPath(import.meta.url))
const root  = join(__dir, "..")

// Lê .env.local
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

// Bcrypt não está disponível como módulo ESM puro, vamos usar import dinâmico
const { default: bcrypt } = await import("bcryptjs")

const turso = createClient({
  url:       process.env.DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

const ADMIN = {
  id:       "admin-001",
  name:     "Administrador",
  email:    "admin@vendemmia.com.br",
  password: "Vendemmia@2024",   // troque após o primeiro login
  role:     "ADMIN",
}

async function main() {
  const hash = await bcrypt.hash(ADMIN.password, 12)

  const existing = await turso.execute({
    sql:  "SELECT id FROM User WHERE email = ?",
    args: [ADMIN.email],
  })

  if (existing.rows.length > 0) {
    console.log("⚠️  Usuário admin já existe:", ADMIN.email)
    await turso.close()
    return
  }

  await turso.execute({
    sql: `INSERT INTO User (id, name, email, password, role, active, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
    args: [ADMIN.id, ADMIN.name, ADMIN.email, hash, ADMIN.role],
  })

  console.log("✅  Admin criado!")
  console.log("    Email:  ", ADMIN.email)
  console.log("    Senha:  ", ADMIN.password)
  console.log("    ⚠️  Troque a senha após o primeiro login!")

  await turso.close()
}

main().catch(err => {
  console.error("Erro:", err)
  process.exit(1)
})
