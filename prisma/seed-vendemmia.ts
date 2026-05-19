/**
 * Seed com dados reais da Vendemmia — Roadmap 2025
 * Execute: npx ts-node --esm prisma/seed-vendemmia.ts
 */

import "dotenv/config"
import { PrismaClient } from "../lib/generated/prisma/client"
import { PrismaLibSql } from "@prisma/adapter-libsql"
import { ProjectStatus } from "../lib/generated/prisma/enums"

const rawUrl    = process.env.DATABASE_URL ?? "file:./dev.db"
const authToken = process.env.TURSO_AUTH_TOKEN
const dbUrl = rawUrl.startsWith("libsql://") ? rawUrl.replace("libsql://", "https://") : rawUrl
const adapter = new PrismaLibSql({ url: dbUrl, authToken })
const db = new PrismaClient({ adapter })

async function upsertProject(
  id: string,
  title: string,
  status: ProjectStatus,
  managerId: string,
  adminId: string,
) {
  return db.project.upsert({
    where: { id },
    update: {},
    create: {
      id,
      title,
      status,
      members: {
        create: [
          { userId: managerId, role: "Gerente de Projeto" },
          { userId: adminId,   role: "Sponsor" },
        ],
      },
    },
  })
}

async function main() {
  console.log("🌱 Carregando dados reais da Vendemmia...\n")

  const admin   = await db.user.findFirst({ where: { role: "ADMIN" } })
  const manager = await db.user.findFirst({ where: { role: "PROJECT_MANAGER" } })
  const sponsor = await db.user.findFirst({ where: { role: "SPONSOR" } })

  if (!admin || !manager) {
    throw new Error("Execute o seed base primeiro: npx prisma db seed")
  }

  const sponsorId = sponsor?.id ?? admin.id
  const managerId = manager.id
  const adminId   = admin.id

  // ── Planejamento ──────────────────────────────────────────────────────────
  console.log("📐 Criando projetos em planejamento...")
  const planejando: Array<[string, string]> = [
    ["vnd-p01", "Programa 5S"],
    ["vnd-p02", "Desenvolvimento de BOT para fluxo do WhatsApp"],
    ["vnd-p03", "Automatização da Rentabilidade por Cliente"],
    ["vnd-p04", "Automatização do Fluxo de Caixa Operacional"],
    ["vnd-p05", "Automatização do processo de Forecast Operacional"],
    ["vnd-p06", "Módulo para Gestão da Frota Vendemmia"],
    ["vnd-p07", "Novo Sistema de Compras"],
    ["vnd-p08", "Desenvolvimento de documentação sobre cargos e responsabilidades de Operações"],
    ["vnd-p09", "Sistema para Gestão de Documentos (SGQ / SGI)"],
    ["vnd-p10", "Controle de Licenças Office"],
    ["vnd-p11", "Controle de Armazenamento do SharePoint"],
    ["vnd-p12", "FAQ de HDs Conexos (Perguntas Frequentes)"],
    ["vnd-p13", "Nova versão do sistema OPERAH"],
    ["vnd-p14", "Desenvolvimento do sistema VERIXIS"],
    ["vnd-p15", "Novo site da Vendemmia"],
    ["vnd-p16", "SGI — Sistema de Gestão Integrado"],
    ["vnd-p17", "Certificação ISO 14001"],
    ["vnd-p18", "Certificação ISO 27001"],
    ["vnd-p19", "Módulo para Gestão de Chamados"],
  ]
  for (const [id, title] of planejando) {
    await upsertProject(id, title, ProjectStatus.PLANNING, managerId, adminId)
    process.stdout.write(".")
  }
  console.log(`\n✅ ${planejando.length} projetos em planejamento`)

  // ── Em Andamento ──────────────────────────────────────────────────────────
  console.log("\n🚀 Criando projetos em andamento...")
  const emAndamento: Array<[string, string]> = [
    ["vnd-a01", "Automação do processo de Consulta Tributária"],
    ["vnd-a02", "Malha Last Mile Motul"],
    ["vnd-a03", "Embalagem Retornável Viscofan"],
    ["vnd-a04", "Automação do Processo de Faturamento — Armazém"],
    ["vnd-a05", "Automação do Processo de Faturamento — VCI"],
    ["vnd-a06", "Controle do Planejamento Estratégico 2030"],
    ["vnd-a07", "Implantação do sistema LeverPro"],
    ["vnd-a08", "Desenvolvimento de processos para o sistema REPOM"],
    ["vnd-a09", "Revisão dos processos — Transporte"],
    ["vnd-a10", "Integração Vexpenses x Conexos"],
  ]
  for (const [id, title] of emAndamento) {
    await upsertProject(id, title, ProjectStatus.IN_PROGRESS, managerId, adminId)
    process.stdout.write(".")
  }
  console.log(`\n✅ ${emAndamento.length} projetos em andamento`)

  // ── Piloto / Validação ────────────────────────────────────────────────────
  console.log("\n🔍 Criando projetos em validação...")
  const emValidacao: Array<[string, string]> = [
    ["vnd-v01", "Análise de Crédito (PowerApps)"],
    ["vnd-v02", "Auditoria Tricon (TFS)"],
  ]
  for (const [id, title] of emValidacao) {
    await upsertProject(id, title, ProjectStatus.PILOT, managerId, adminId)
    process.stdout.write(".")
  }
  console.log(`\n✅ ${emValidacao.length} projetos em validação`)

  // ── Concluídos ────────────────────────────────────────────────────────────
  console.log("\n✅ Criando projetos concluídos...")
  const concluidos: Array<[string, string]> = [
    ["vnd-c01", "Revitalização Conexos (Treinamentos e Revisão de Processo)"],
    ["vnd-c02", "Desenvolvimento do Pipeline Comercial"],
    ["vnd-c03", "Dashboard Automatizado para a área de Compras"],
    ["vnd-c04", "Controle de Equipamentos"],
    ["vnd-c05", "Certificado 4ª Estrela OCS"],
    ["vnd-c06", "Distribuição Timbro — Estudo Inicial"],
    ["vnd-c07", "Envio de Anexo nos e-mails de Requisição de Compra"],
    ["vnd-c08", "Licença Anvisa Garuva"],
    ["vnd-c09", "Semana da Qualidade"],
    ["vnd-c10", "Cronograma de Auditorias Internas"],
    ["vnd-c11", "Plano Anual de Treinamentos das Certificações"],
  ]
  for (const [id, title] of concluidos) {
    await upsertProject(id, title, ProjectStatus.COMPLETED, managerId, adminId)
    process.stdout.write(".")
  }
  console.log(`\n✅ ${concluidos.length} projetos concluídos`)

  const totPrj = await db.project.count()
  console.log("\n" + "─".repeat(50))
  console.log("🎉 Dados da Vendemmia carregados com sucesso!")
  console.log(`   🗂️  Total de projetos no banco: ${totPrj}`)
  console.log("─".repeat(50))
  console.log(`\n   Planejamento: ${planejando.length}`)
  console.log(`   Em Andamento: ${emAndamento.length}`)
  console.log(`   Validação:    ${emValidacao.length}`)
  console.log(`   Concluídos:   ${concluidos.length}`)
}

main()
  .catch((e) => {
    console.error("❌ Erro:", e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
