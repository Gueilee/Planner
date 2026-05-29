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

// Attachment.projectId
const attInfo = await client.execute("PRAGMA table_info(Attachment)")
const attCols  = attInfo.rows.map(r => r[1])
if (!attCols.includes("projectId")) {
  await client.execute("ALTER TABLE Attachment ADD COLUMN projectId TEXT REFERENCES Project(id) ON DELETE CASCADE")
  console.log("SUCCESS: projectId added to Attachment")
} else {
  console.log("SKIP: Attachment.projectId already exists")
}

// ScheduleTask.budgetedCost + actualCost
const taskInfo = await client.execute("PRAGMA table_info(ScheduleTask)")
const taskCols  = taskInfo.rows.map(r => r[1])
if (!taskCols.includes("budgetedCost")) {
  await client.execute("ALTER TABLE ScheduleTask ADD COLUMN budgetedCost REAL")
  console.log("SUCCESS: budgetedCost added to ScheduleTask")
} else {
  console.log("SKIP: ScheduleTask.budgetedCost already exists")
}
if (!taskCols.includes("actualCost")) {
  await client.execute("ALTER TABLE ScheduleTask ADD COLUMN actualCost REAL")
  console.log("SUCCESS: actualCost added to ScheduleTask")
} else {
  console.log("SKIP: ScheduleTask.actualCost already exists")
}

await client.close()
