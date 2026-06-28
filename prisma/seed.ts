import "dotenv/config"
import { PrismaClient } from "../lib/generated/prisma/client"
import { PrismaLibSql } from "@prisma/adapter-libsql"
import { UserRole, ProjectStatus } from "../lib/generated/prisma/enums"
import bcrypt from "bcryptjs"

const rawUrl    = process.env.DATABASE_URL ?? "file:./dev.db"
const authToken = process.env.TURSO_AUTH_TOKEN
const dbUrl = rawUrl.startsWith("libsql://") ? rawUrl.replace("libsql://", "https://") : rawUrl
const adapter = new PrismaLibSql({ url: dbUrl, authToken })
const db = new PrismaClient({ adapter })

function pStatus(s: string): ProjectStatus {
  if (s === "EM ANDAMENTO")    return ProjectStatus.IN_PROGRESS
  if (s === "CONCLUÍDO")       return ProjectStatus.COMPLETED
  if (s === "EM VALIDAÇÃO")    return ProjectStatus.PILOT
  return ProjectStatus.PLANNING
}

async function main() {
  console.log("🗑️  Limpando banco de dados...")

  await db.notification.deleteMany()
  await db.lessonLearned.deleteMany()
  await db.attachment.deleteMany()
  await db.comment.deleteMany()
  await db.postGoLiveItem.deleteMany()
  await db.projectDocument.deleteMany()
  await db.statusReport.deleteMany()
  await db.meetingParticipant.deleteMany()
  await db.meeting.deleteMany()
  await db.risk.deleteMany()
  await db.scheduleTask.deleteMany()
  await db.wbsArea.deleteMany()
  await db.projectMember.deleteMany()
  await db.project.deleteMany()
  await db.user.deleteMany()
  await db.organization.deleteMany()

  console.log("✅ Banco limpo\n")

  // ── Organização padrão ────────────────────────────────────────────────────
  await db.organization.create({ data: { id: "org_vendemmia", name: "Vendemmia", slug: "vendemmia" } })

  // ── Usuários ──────────────────────────────────────────────────────────────
  console.log("👥 Criando usuários...")
  const hash = await bcrypt.hash("Planner@2025", 12)

  const [
    gueilee, rafael, osni,
    paola, marcelo, monique, caroline,
    raquel, jose, paulo, marcos,
    jaqueline, daniel, wiverton,
  ] = await Promise.all([
    db.user.create({ data: { name: "Gueilee Pereira",    email: "gppereira@vendemmia.com.br",     password: hash, role: UserRole.ADMIN,           department: "Projetos",    organizationId: "org_vendemmia" } }),
    db.user.create({ data: { name: "Rafael Puglia",      email: "rafael.puglia@vendemmia.com.br", password: hash, role: UserRole.DIRECTOR,         department: "Diretoria",   organizationId: "org_vendemmia" } }),
    db.user.create({ data: { name: "Osni Tavares",       email: "osni.tavares@vendemmia.com.br",  password: hash, role: UserRole.DIRECTOR,         department: "Diretoria",   organizationId: "org_vendemmia" } }),
    db.user.create({ data: { name: "Paola Schreiber",    email: "paola.schreiber@vendemmia.com.br",   password: hash, role: UserRole.SPONSOR, department: "Compras",     organizationId: "org_vendemmia" } }),
    db.user.create({ data: { name: "Marcelo Barros",     email: "marcelo.barros@vendemmia.com.br",    password: hash, role: UserRole.SPONSOR, department: "Controller",  organizationId: "org_vendemmia" } }),
    db.user.create({ data: { name: "Monique Aranda",     email: "monique.aranda@vendemmia.com.br",    password: hash, role: UserRole.SPONSOR, department: "Operações",   organizationId: "org_vendemmia" } }),
    db.user.create({ data: { name: "Caroline de Souza",  email: "caroline.souza@vendemmia.com.br",    password: hash, role: UserRole.SPONSOR, department: "Qualidade",   organizationId: "org_vendemmia" } }),
    db.user.create({ data: { name: "Raquel Milsoni",     email: "raquel.milsoni@vendemmia.com.br",    password: hash, role: UserRole.PROJECT_MEMBER, department: "Marketing",   organizationId: "org_vendemmia" } }),
    db.user.create({ data: { name: "José Netto",         email: "jose.netto@vendemmia.com.br",        password: hash, role: UserRole.SPONSOR, department: "RH",          organizationId: "org_vendemmia" } }),
    db.user.create({ data: { name: "Paulo Chiaradia",    email: "paulo.chiaradia@vendemmia.com.br",   password: hash, role: UserRole.SPONSOR, department: "Financeiro",  organizationId: "org_vendemmia" } }),
    db.user.create({ data: { name: "Marcos Lima",        email: "marcos.lima@vendemmia.com.br",       password: hash, role: UserRole.SPONSOR, department: "Transportes", organizationId: "org_vendemmia" } }),
    db.user.create({ data: { name: "Jaqueline Almeida",  email: "jaqueline.almeida@vendemmia.com.br", password: hash, role: UserRole.PROJECT_MEMBER, department: "Financeiro",  organizationId: "org_vendemmia" } }),
    db.user.create({ data: { name: "Daniel Tavares",     email: "daniel.tavares@vendemmia.com.br",    password: hash, role: UserRole.SPONSOR, department: "Comercial",   organizationId: "org_vendemmia" } }),
    db.user.create({ data: { name: "Wiverton da Silva",  email: "wiverton.silva@vendemmia.com.br",    password: hash, role: UserRole.SPONSOR, department: "Transportes", organizationId: "org_vendemmia" } }),
  ])

  const byName: Record<string, typeof gueilee> = {
    "GUEILEE PEREIRA":   gueilee,
    "RAFAEL PUGLIA":     rafael,
    "OSNI TAVARES":      osni,
    "PAOLA SCHREIBER":   paola,
    "MARCELO BARROS":    marcelo,
    "MONIQUE ARANDA":    monique,
    "CAROLINE DE SOUZA": caroline,
    "RAQUEL MILSONI":    raquel,
    "JOSÉ NETTO":        jose,
    "PAULO CHIARADIA":   paulo,
    "MARCOS LIMA":       marcos,
    "JAQUELINE ALMEIDA": jaqueline,
    "DANIEL TAVARES":    daniel,
    "WIVERTON DA SILVA": wiverton,
  }

  console.log("✅ 14 usuários criados\n")

  // ── Definição dos 46 projetos ─────────────────────────────────────────────
  type Def = {
    area: string
    title: string
    solicitante: string
    areaSol: string
    status: string
    resumo: string
    actualStart?: Date
    actualEnd?: Date
    quarter: number
    order: number
  }

  const defs: Def[] = [
    // ── CONCLUÍDOS (Q1) ────────────────────────────────────────────────────
    { area: "TECNOLOGIA", title: "Desenvolvimento do Pipeline Comercial",                   solicitante: "DANIEL TAVARES",    areaSol: "COMERCIAL",  status: "CONCLUÍDO",     resumo: "Visão estratégica da área comercial com prospecção de novos clientes e metas",                             actualStart: new Date("2024-10-01"), actualEnd: new Date("2025-01-15"), quarter: 1, order: 1 },
    { area: "TECNOLOGIA", title: "Dashboard Automatizado para a Área de Compras",           solicitante: "PAOLA SCHREIBER",   areaSol: "COMPRAS",    status: "CONCLUÍDO",     resumo: "Visão geral das compras realizadas com dados de áreas, valores e tipos mensalmente",                        actualStart: new Date("2024-10-15"), actualEnd: new Date("2025-01-30"), quarter: 1, order: 2 },
    { area: "TECNOLOGIA", title: "Controle de Equipamentos",                                solicitante: "GUEILEE PEREIRA",   areaSol: "PROJETOS",   status: "CONCLUÍDO",     resumo: "Gestão de todos os equipamentos de TI utilizados na empresa com vínculo a usuários",                       actualStart: new Date("2024-09-01"), actualEnd: new Date("2024-12-20"), quarter: 1, order: 3 },
    { area: "TECNOLOGIA", title: "Integração VExpenses × Conexos",                          solicitante: "JAQUELINE ALMEIDA", areaSol: "FINANCEIRO", status: "CONCLUÍDO",     resumo: "Melhoria na integração do app com o ERP para pagamentos e reembolsos",                                     actualStart: new Date("2024-11-01"), actualEnd: new Date("2025-02-10"), quarter: 1, order: 4 },
    { area: "TECNOLOGIA", title: "Nova Layout de Assinatura",                               solicitante: "RAQUEL MILSONI",    areaSol: "MARKETING",  status: "CONCLUÍDO",     resumo: "Melhoria interna com nova identidade visual da empresa nas assinaturas de e-mail",                          actualStart: new Date("2025-01-15"), actualEnd: new Date("2025-03-10"), quarter: 1, order: 5 },
    { area: "TECNOLOGIA", title: "Envio de Anexo nos E-mails de Requisição de Compra",      solicitante: "PAOLA SCHREIBER",   areaSol: "COMPRAS",    status: "CONCLUÍDO",     resumo: "Melhoria no processo de compras para melhor visão dos requisitantes",                                       actualStart: new Date("2025-03-01"), actualEnd: new Date("2025-04-30"), quarter: 1, order: 6 },
    { area: "QUALIDADE",  title: "Semana da Qualidade",                                     solicitante: "CAROLINE DE SOUZA", areaSol: "QUALIDADE",  status: "CONCLUÍDO",     resumo: "Evento para conhecimento e motivação dos times em relação aos processos de qualidade",                       actualStart: new Date("2025-03-10"), actualEnd: new Date("2025-04-15"), quarter: 1, order: 7 },
    { area: "QUALIDADE",  title: "Cronograma de Auditorias Internas",                       solicitante: "CAROLINE DE SOUZA", areaSol: "QUALIDADE",  status: "CONCLUÍDO",     resumo: "Plano anual para garantir conformidade dos processos da empresa",                                           actualStart: new Date("2025-01-05"), actualEnd: new Date("2025-02-28"), quarter: 1, order: 8 },
    { area: "QUALIDADE",  title: "Plano Anual de Treinamentos das Certificações",            solicitante: "CAROLINE DE SOUZA", areaSol: "QUALIDADE",  status: "CONCLUÍDO",     resumo: "Plano anual para garantir conformidade e capacitação nas certificações vigentes",                           actualStart: new Date("2025-01-05"), actualEnd: new Date("2025-02-28"), quarter: 1, order: 9 },
    { area: "QUALIDADE",  title: "Auditoria Tricon (TFS)",                                  solicitante: "PAOLA SCHREIBER",   areaSol: "COMPRAS",    status: "CONCLUÍDO",     resumo: "Auditoria solicitada pelo cliente em processos — nossa unidade foi selecionada em âmbito global",          actualStart: new Date("2025-02-01"), actualEnd: new Date("2025-03-20"), quarter: 1, order: 10 },
    { area: "QUALIDADE",  title: "Certificado 4° Estrela OCS",                              solicitante: "OSNI TAVARES",      areaSol: "SÓCIO",      status: "CONCLUÍDO",     resumo: "Certificação para liberar carregamentos pelo time de transporte conforme exigência do cliente",             actualStart: new Date("2025-03-01"), actualEnd: new Date("2025-04-30"), quarter: 1, order: 11 },
    { area: "QUALIDADE",  title: "Licença ANVISA Garuva",                                   solicitante: "PAOLA SCHREIBER",   areaSol: "COMPRAS",    status: "CONCLUÍDO",     resumo: "Documentação necessária para armazenagem de clientes na nova unidade de Garuva",                            actualStart: new Date("2025-04-01"), actualEnd: new Date("2025-05-10"), quarter: 1, order: 12 },
    { area: "PROJETOS",   title: "Revitalização Conexos (Treinamentos e Revisão de Processo)", solicitante: "PAULO CHIARADIA", areaSol: "FINANCEIRO", status: "CONCLUÍDO",  resumo: "Análise e redesenho de processo utilizando o máximo das funcionalidades do Conexos",                        actualStart: new Date("2025-01-15"), actualEnd: new Date("2025-03-28"), quarter: 1, order: 13 },
    { area: "PROJETOS",   title: "Distribuição Timbro — Estudo Inicial",                    solicitante: "GUEILEE PEREIRA",   areaSol: "PROJETOS",   status: "CONCLUÍDO",     resumo: "Estudo de armazenagem de importação e distribuição final nos pontos de entrega do cliente",                 actualStart: new Date("2025-04-01"), actualEnd: new Date("2025-05-15"), quarter: 1, order: 14 },

    // ── EM ANDAMENTO (Q2) ──────────────────────────────────────────────────
    { area: "TECNOLOGIA", title: "Nova Versão do Sistema OPERAH",                           solicitante: "GUEILEE PEREIRA",   areaSol: "PROJETOS",   status: "EM ANDAMENTO",  resumo: "Melhoria para controle de equipamentos de TI, armazém e ativos fixos",                                     actualStart: new Date("2025-02-01"), quarter: 2, order: 1 },
    { area: "TECNOLOGIA", title: "Desenvolvimento do Sistema Verixis (SDR)",                solicitante: "RAFAEL PUGLIA",     areaSol: "SÓCIO",      status: "EM ANDAMENTO",  resumo: "Novo sistema para redução de custo com ferramentas terceiras de pesquisa de leads",                         actualStart: new Date("2025-01-15"), quarter: 2, order: 2 },
    { area: "TECNOLOGIA", title: "Automação do Processo de Consulta Tributária",            solicitante: "MARCELO BARROS",    areaSol: "CONTROLLER", status: "EM ANDAMENTO",  resumo: "Automatizar o processo manual em Excel realizado pelo time de operações e fiscal",                           actualStart: new Date("2025-03-01"), quarter: 2, order: 3 },
    { area: "TECNOLOGIA", title: "Automação do Processo de Faturamento — Armazém",          solicitante: "MARCELO BARROS",    areaSol: "CONTROLLER", status: "EM ANDAMENTO",  resumo: "Automatizar o processo manual em Excel realizado pelo time de contabilidade dos armazéns",                  actualStart: new Date("2025-03-01"), quarter: 2, order: 4 },
    { area: "TECNOLOGIA", title: "Automação do Processo de Faturamento — VCI",              solicitante: "MONIQUE ARANDA",    areaSol: "OPERAÇÕES",  status: "EM ANDAMENTO",  resumo: "Automatizar o processo manual em Excel realizado pelo time de operações e fiscal",                           actualStart: new Date("2025-04-01"), quarter: 2, order: 5 },
    { area: "TECNOLOGIA", title: "Implantação do Sistema LeverPro",                         solicitante: "PAULO CHIARADIA",   areaSol: "FINANCEIRO", status: "EM ANDAMENTO",  resumo: "Melhoria nos processos financeiros, fiscal e contábeis da empresa",                                         actualStart: new Date("2025-02-15"), quarter: 2, order: 6 },
    { area: "QUALIDADE",  title: "Desenvolvimento de Processos para o Sistema Repom",       solicitante: "MARCOS LIMA",       areaSol: "TRANSPORTES",status: "EM ANDAMENTO",  resumo: "Nova ferramenta para gestão de pagamentos para serviços de transporte",                                      actualStart: new Date("2025-03-15"), quarter: 2, order: 7 },
    { area: "QUALIDADE",  title: "Revisão dos Processos — Transporte",                      solicitante: "MARCOS LIMA",       areaSol: "TRANSPORTES",status: "EM ANDAMENTO",  resumo: "Melhorias em documentação para seguir o plano da certificação SASSMAQ",                                     actualStart: new Date("2025-04-01"), quarter: 2, order: 8 },
    { area: "PROJETOS",   title: "Malha Last Mile Motul",                                   solicitante: "RAFAEL PUGLIA",     areaSol: "SÓCIO",      status: "EM ANDAMENTO",  resumo: "Novo serviço exclusivo para atender o Last Mile do cliente Motul com potencial de expansão",                actualStart: new Date("2025-03-10"), quarter: 2, order: 9 },
    { area: "PROJETOS",   title: "Embalagem Retornável Viscofan",                           solicitante: "RAFAEL PUGLIA",     areaSol: "SÓCIO",      status: "EM ANDAMENTO",  resumo: "Novo serviço exclusivo para atender demanda do cliente Viscofan com potencial de expansão",                  actualStart: new Date("2025-04-01"), quarter: 2, order: 10 },
    { area: "PROJETOS",   title: "Controle do Planejamento Estratégico 2030",               solicitante: "JOSÉ NETTO",        areaSol: "RH",         status: "EM ANDAMENTO",  resumo: "Gestão dos projetos visando o planejamento estratégico de evolução da empresa em 5 anos",                    actualStart: new Date("2025-01-10"), quarter: 2, order: 11 },

    // ── EM VALIDAÇÃO (Q3) ─────────────────────────────────────────────────
    { area: "TECNOLOGIA", title: "Novo Sistema de Compras",                                 solicitante: "PAOLA SCHREIBER",   areaSol: "COMPRAS",    status: "EM VALIDAÇÃO",  resumo: "Melhoria para gestão de todos os tipos de compras realizadas dentro da empresa",                             quarter: 3, order: 1 },
    { area: "TECNOLOGIA", title: "Análise de Crédito (PowerApps)",                          solicitante: "PAULO CHIARADIA",   areaSol: "FINANCEIRO", status: "EM VALIDAÇÃO",  resumo: "Melhoria no processo de solicitações de crédito com visão aprofundada do financeiro",                       quarter: 3, order: 2 },
    { area: "TECNOLOGIA", title: "Painel de Gestão do RH",                                  solicitante: "JOSÉ NETTO",        areaSol: "RH",         status: "EM VALIDAÇÃO",  resumo: "Integração de dados para painel moderno com KPIs e visões diversas para gestão de pessoas",                quarter: 3, order: 3 },

    // ── EM PLANEJAMENTO (Q4) ──────────────────────────────────────────────
    { area: "TECNOLOGIA", title: "Desenvolvimento de Bot para Fluxo do WhatsApp",           solicitante: "PAOLA SCHREIBER",   areaSol: "COMPRAS",    status: "EM PLANEJAMENTO", resumo: "Comunicação automática entre clientes e as áreas internas via WhatsApp",                                  quarter: 4, order: 1 },
    { area: "TECNOLOGIA", title: "Automatização da Rentabilidade por Cliente",               solicitante: "MARCELO BARROS",    areaSol: "CONTROLLER", status: "EM PLANEJAMENTO", resumo: "Automatizar o processo manual em Excel realizado pelo time da contabilidade",                              quarter: 4, order: 2 },
    { area: "TECNOLOGIA", title: "Automatização do Fluxo de Caixa Operacional",             solicitante: "MONIQUE ARANDA",    areaSol: "OPERAÇÕES",  status: "EM PLANEJAMENTO", resumo: "Automatizar o processo manual em Excel realizado pelo time de operações",                                  quarter: 4, order: 3 },
    { area: "TECNOLOGIA", title: "Automatização do Processo de Forecast Operacional",       solicitante: "MONIQUE ARANDA",    areaSol: "OPERAÇÕES",  status: "EM PLANEJAMENTO", resumo: "Automatizar o processo manual em Excel realizado pelo time de operações",                                  quarter: 4, order: 4 },
    { area: "TECNOLOGIA", title: "Módulo para Gestão da Frota Vendemmia",                   solicitante: "PAOLA SCHREIBER",   areaSol: "COMPRAS",    status: "EM PLANEJAMENTO", resumo: "Controle de multas, licenciamentos e dados de todos os veículos próprios da Vendemmia",                   quarter: 4, order: 5 },
    { area: "TECNOLOGIA", title: "Controle de Licenças Office",                             solicitante: "GUEILEE PEREIRA",   areaSol: "PROJETOS",   status: "EM PLANEJAMENTO", resumo: "Gestão de custos e análise para redução de gastos com licenças Microsoft 365",                            quarter: 4, order: 6 },
    { area: "TECNOLOGIA", title: "Controle de Armazenamento do SharePoint",                 solicitante: "GUEILEE PEREIRA",   areaSol: "PROJETOS",   status: "EM PLANEJAMENTO", resumo: "Gestão de utilização de dados e capacidade de armazenamento no SharePoint",                               quarter: 4, order: 7 },
    { area: "TECNOLOGIA", title: "FAQ de HDS Conexos (Perguntas Frequentes)",               solicitante: "GUEILEE PEREIRA",   areaSol: "PROJETOS",   status: "EM PLANEJAMENTO", resumo: "Base de conhecimento para perguntas frequentes do sistema Conexos",                                       quarter: 4, order: 8 },
    { area: "TECNOLOGIA", title: "Novo Site da Vendemmia",                                  solicitante: "RAQUEL MILSONI",    areaSol: "MARKETING",  status: "EM PLANEJAMENTO", resumo: "Melhoria no site oficial deixando mais moderno e atrativo para o mercado",                                  quarter: 4, order: 9 },
    { area: "TECNOLOGIA", title: "Módulo para Gestão de Chamados",                          solicitante: "GUEILEE PEREIRA",   areaSol: "PROJETOS",   status: "EM PLANEJAMENTO", resumo: "Centralizar todos os tipos de chamados e tickets abertos em sistemas contratados",                         quarter: 4, order: 10 },
    { area: "TECNOLOGIA", title: "Gestão da Programação de Transportes",                    solicitante: "WIVERTON DA SILVA", areaSol: "TRANSPORTES",status: "EM PLANEJAMENTO", resumo: "Novo sistema para gerenciar programação diária de transporte em expedições e frete retorno",              quarter: 4, order: 11 },
    { area: "TECNOLOGIA", title: "Sistema de Pesquisa NPS",                                 solicitante: "RAFAEL PUGLIA",     areaSol: "SÓCIO",      status: "EM PLANEJAMENTO", resumo: "Novo sistema para redução de custo com ferramentas terceiras de pesquisa de satisfação",                   quarter: 4, order: 12 },
    { area: "QUALIDADE",  title: "Sistema para Gestão de Documentos (SGQ / SGI)",            solicitante: "CAROLINE DE SOUZA", areaSol: "QUALIDADE",  status: "EM PLANEJAMENTO", resumo: "Centralização de todos os documentos da qualidade em uma única plataforma",                              quarter: 4, order: 13 },
    { area: "QUALIDADE",  title: "SGI — Sistema de Gestão Integrado",                        solicitante: "CAROLINE DE SOUZA", areaSol: "QUALIDADE",  status: "EM PLANEJAMENTO", resumo: "Centralização de todos os processos e documentos em uma única gestão integrada",                         quarter: 4, order: 14 },
    { area: "QUALIDADE",  title: "Certificação ISO 14001",                                   solicitante: "CAROLINE DE SOUZA", areaSol: "QUALIDADE",  status: "EM PLANEJAMENTO", resumo: "Oportunidade estratégica para mostrar comprometimento ambiental ao mercado",                             quarter: 4, order: 15 },
    { area: "QUALIDADE",  title: "Certificação ISO 27001",                                   solicitante: "CAROLINE DE SOUZA", areaSol: "QUALIDADE",  status: "EM PLANEJAMENTO", resumo: "Oportunidade estratégica para mostrar segurança de dados ao mercado",                                    quarter: 4, order: 16 },
    { area: "QUALIDADE",  title: "Programa 5S",                                              solicitante: "CAROLINE DE SOUZA", areaSol: "QUALIDADE",  status: "EM PLANEJAMENTO", resumo: "Melhoria das áreas com visão em qualidade e organização pelos pilares do 5S",                            quarter: 4, order: 17 },
    { area: "PROJETOS",   title: "Desenvolvimento de Documentação de Cargos e Responsabilidades — Operações", solicitante: "MONIQUE ARANDA", areaSol: "OPERAÇÕES", status: "EM PLANEJAMENTO", resumo: "Visão estratégica da área de operações com cargos e funções bem definidos", quarter: 4, order: 18 },
  ]

  // ── Criar projetos ────────────────────────────────────────────────────────
  console.log(`📁 Criando ${defs.length} projetos...`)

  let created = 0
  for (const d of defs) {
    const sponsor = byName[d.solicitante]
    if (!sponsor) throw new Error(`Usuário não encontrado: ${d.solicitante}`)

    await db.project.create({
      data: {
        title:          d.title,
        description:    d.resumo,
        status:         pStatus(d.status),
        organizationId: "org_vendemmia",
        origin:         d.areaSol === "SÓCIO" ? "SPONSOR" : "INTERNAL",
        scope:          d.resumo,
        sponsorId:      sponsor.id,
        actualStart:    d.actualStart ?? null,
        actualEnd:      d.actualEnd   ?? null,
        roadmapYear:    2025,
        roadmapQuarter: d.quarter,
        roadmapOrder:   d.order,
        members: {
          create: sponsor.id === gueilee.id
            ? [{ userId: gueilee.id, role: "Gerente de Projetos / Solicitante" }]
            : [
                { userId: gueilee.id, role: "Gerente de Projetos" },
                { userId: sponsor.id, role: "Solicitante / Sponsor" },
              ],
        },
      },
    })

    created++
  }

  console.log(`✅ ${created} projetos criados\n`)
  console.log("🚀 Seed concluído com sucesso!")
  console.log("\n📧 Credenciais de acesso (senha: Planner@2025):")
  console.log("  gppereira@vendemmia.com.br   → Admin (Projetos)")
  console.log("  rafael.puglia@vendemmia.com.br  → Diretor")
  console.log("  osni.tavares@vendemmia.com.br   → Diretor")
  console.log("  paola.schreiber@vendemmia.com.br → Sponsor (Compras)")
  console.log("  marcelo.barros@vendemmia.com.br  → Sponsor (Controller)")
  console.log("  monique.aranda@vendemmia.com.br  → Sponsor (Operações)")
  console.log("  caroline.souza@vendemmia.com.br  → Sponsor (Qualidade)")
}

main()
  .catch((e) => { console.error("❌ Erro no seed:", e); process.exit(1) })
  .finally(() => db.$disconnect())
