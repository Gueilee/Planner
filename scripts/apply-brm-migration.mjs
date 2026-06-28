import { createClient } from "@libsql/client"
import { readFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))

const url = process.env.DATABASE_URL?.startsWith("libsql://")
  ? process.env.DATABASE_URL.replace("libsql://", "https://")
  : process.env.DATABASE_URL

const authToken = process.env.TURSO_AUTH_TOKEN

if (!url || !authToken) {
  console.error("DATABASE_URL and TURSO_AUTH_TOKEN are required")
  process.exit(1)
}

const client = createClient({ url, authToken })

const sql = readFileSync(
  resolve(__dirname, "../prisma/migrations/20260628000001_enhance_benefits_brm/migration.sql"),
  "utf-8"
)

const cleaned = sql
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n")

const statements = cleaned
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0)

console.log(`Applying ${statements.length} statements to Turso...`)

for (const stmt of statements) {
  try {
    await client.execute(stmt)
    console.log("  ✓", stmt.slice(0, 80).replace(/\s+/g, " "))
  } catch (err) {
    if (
      err.message?.includes("already exists") ||
      err.message?.includes("duplicate column") ||
      err.message?.includes("duplicate table")
    ) {
      console.log("  ⚠ already exists, skipping:", stmt.slice(0, 60).replace(/\s+/g, " "))
    } else {
      console.error("  ✗ ERROR:", err.message)
      console.error("    Statement:", stmt.slice(0, 120))
    }
  }
}

console.log("\nDone.")
