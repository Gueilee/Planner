import { setDefaultResultOrder } from "node:dns"
import { PrismaClient } from "@/lib/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

// Sob o runtime do Next.js (dev e standalone), a resolução de DNS do Node às vezes
// prioriza AAAA (IPv6) para o host do Azure, e a conexão IPv6 fica pendurada até
// estourar o timeout — mesmo quando IPv4 responde instantaneamente. Força IPv4
// primeiro para evitar esse timeout intermitente no login.
setDefaultResultOrder("ipv4first")

// Schema Postgres dedicado ao Planner — o banco "vdm_projetos" no Azure é
// compartilhado com outros sistemas (schemas "compras", "malha", "reserva_reuniao"
// e tabelas legadas em "public"), por isso todas as tabelas do Planner vivem
// isoladas dentro do schema "planner".
const PLANNER_SCHEMA = "planner"

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL ?? ""

  const adapter = new PrismaPg(
    {
      connectionString,
      ssl: { rejectUnauthorized: false },
      // TCP keepalive evita que o Azure (ou algum firewall/NAT no caminho) derrube
      // conexões ociosas do pool em silêncio, o que causava timeout na 1ª query
      // depois de o servidor ficar parado por alguns segundos.
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    },
    { schema: PLANNER_SCHEMA }
  )
  return new PrismaClient({ adapter })
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db
