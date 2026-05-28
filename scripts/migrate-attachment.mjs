import { createClient } from "@libsql/client"
import dotenv from "dotenv"
import { fileURLToPath } from "url"
import { join, dirname } from "path"

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, "..", ".env") })

const rawUrl    = process.env.DATABASE_URL ?? ""
const authToken = process.env.TURSO_AUTH_TOKEN
const url       = rawUrl.startsWith("libsql://") ? rawUrl.replace("libsql://", "https://") : rawUrl

const client = createClient({ url, authToken })

const info = await client.execute("PRAGMA table_info(Attachment)")
const cols  = info.rows.map(r => r[1])
console.log("Attachment columns:", cols)

if (!cols.includes("projectId")) {
  await client.execute(
    "ALTER TABLE Attachment ADD COLUMN projectId TEXT REFERENCES Project(id) ON DELETE CASCADE"
  )
  console.log("SUCCESS: projectId added to Attachment table")
} else {
  console.log("SKIP: projectId already exists")
}

await client.close()
