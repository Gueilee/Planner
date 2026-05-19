import { PrismaClient } from "@/lib/generated/prisma/client"
import { PrismaLibSql } from "@prisma/adapter-libsql"
import { createClient } from "@libsql/client"

function createPrismaClient() {
  const rawUrl    = process.env.DATABASE_URL ?? "file:./dev.db"
  const authToken = process.env.TURSO_AUTH_TOKEN

  // libsql:// uses WebSocket which may not work in serverless — use https:// instead
  const url = rawUrl.startsWith("libsql://")
    ? rawUrl.replace("libsql://", "https://")
    : rawUrl

  const libsql  = createClient({ url, authToken })
  const adapter = new PrismaLibSql(libsql as any)
  return new PrismaClient({ adapter } as any)
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db
