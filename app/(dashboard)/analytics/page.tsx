import { auth } from "@/auth"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import { differenceInDays } from "date-fns"
import { ProjectStatus } from "@/lib/generated/prisma/enums"
import { AnalyticsClient } from "./analytics-client"

export const dynamic = "force-dynamic"

export const metadata = { title: "Indicadores de Gestão" }

export type UserOption = { id: string; name: string }

export type ProjectIndicator = {
  id: string
  title: string
  status: string
  projectArea: string
  sponsor: string | null
  progress: number
  plannedPct: number | null
  devio: number | null          // Desvio em pp (pontos percentuais): progress - plannedPct
  idp: number | null            // Mantido para compatibilidade: progress / plannedPct
  idc: number | null
  budget: number | null
  estimatedCosts: number | null
  economy: number | null
  scheduleStatus: "ON_TIME" | "AT_RISK" | "DELAYED" | "ND"
  risks: { critical: number; high: number; medium: number; low: number }
  expectedEnd: string | null
  reportStatus: { cost: string; schedule: string; resources: string; overall: string }
  taskResponsibles: string[]
}

// Nesses status o projeto ainda não iniciou ou está pausado — não calcular KPIs de progresso
const SKIP_KPI_STATUSES = new Set([
  "PLANNING", "FUTURE_ANALYSIS", "ON_HOLD", "PAUSED", "PENDING_GO_NO_GO",
])

export default async function AnalyticsPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const today = new Date()
  const userRole = (session.user.role ?? "PROJECT_MEMBER") as string

  let userArea: string | null = null
  if (userRole === "DIRECTOR") {
    const dbUser = await db.user.findUnique({
      where:  { id: session.user.id ?? "" },
      select: { department: true },
    })
    const dept = (dbUser?.department ?? "").toUpperCase().trim()
    if (dept === "TECNOLOGIA")       userArea = "TECNOLOGIA"
    else if (dept === "QUALIDADE")   userArea = "QUALIDADE"
    else if (dept)                   userArea = "ESTRATEGICO"
  }

  const [projectsRaw, users] = await Promise.all([
    db.project.findMany({
      where:   { status: { not: ProjectStatus.CANCELLED } },
      orderBy: { createdAt: "asc" },
      include: {
        sponsor: { select: { name: true } },
        tasks: {
          select: {
            status: true, progress: true,
            startDate: true, endDate: true,
            budgetedCost: true, actualCost: true,
            responsible: { select: { name: true } },
          },
        },
        risks: { select: { status: true } },
      },
    }),
    db.user.findMany({
      where:   { active: true },
      select:  { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ])

  const data: ProjectIndicator[] = projectsRaw.map((p) => {
    const tasks   = p.tasks
    const skipKpi = SKIP_KPI_STATUSES.has(p.status)

    // ── Progresso real: média do progresso de todas as tarefas ────────────────
    // Tarefas concluídas contam como 100%, pendentes como seu % atual
    const progress =
      tasks.length > 0
        ? Math.round(tasks.reduce((s, t) => s + t.progress, 0) / tasks.length)
        : p.status === "COMPLETED" ? 100 : 0

    // ── Desvio de prazo ───────────────────────────────────────────────────────
    //
    // Estratégia de cálculo do % planejado (em ordem de prioridade):
    //
    // MÉTODO 1 — Baseado nas datas das tarefas (mais preciso):
    //   Pergunta: "Qual % das tarefas já deveriam estar concluídas até hoje?"
    //   plannedPct = (tarefas com endDate ≤ hoje) / (total de tarefas) × 100
    //   Vantagem: reflete o cronograma real do projeto, não interpolação linear.
    //
    // MÉTODO 2 — Calendário (fallback quando tarefas não têm datas):
    //   plannedPct = (dias decorridos / duração total do projeto) × 100
    //   Limitação: assume progresso linear, pode super-estimar para projetos
    //              com trabalho concentrado no final.
    //
    // Desvio (devio) = progress - plannedPct  [em pontos percentuais]
    //   +15pp = 15pp adiantado do planejado
    //   -10pp = 10pp atrás do planejado
    //
    // Classificação (thresholds baseados em tolerância prática de PMO):
    //   devio ≥ -15pp  → No Prazo  (tolerância de 15pp)
    //   devio ≥ -30pp  → Em Risco  (15–30pp atrás)
    //   devio <  -30pp → Atrasado  (mais de 30pp atrás)

    let plannedPct:     number | null = null
    let devio:          number | null = null
    let idp:            number | null = null
    let scheduleStatus: ProjectIndicator["scheduleStatus"] = "ND"

    if (p.status === "COMPLETED") {
      // Projeto concluído: considerado no prazo independente de quando finalizou
      scheduleStatus = "ON_TIME"
      plannedPct     = 100
      devio          = progress - 100
      idp            = 1.0

    } else if (!skipKpi) {

      // ── MÉTODO 1: baseado em datas das tarefas ────────────────────────────
      const tasksWithEnd = tasks.filter((t) => t.endDate !== null)

      if (tasksWithEnd.length >= 2) {
        // Tarefas cujo prazo planejado já chegou (independente do status)
        const tasksDue    = tasksWithEnd.filter((t) => t.endDate! <= today).length
        // plannedPct em relação ao TOTAL de tarefas do projeto
        const base        = tasks.length > 0 ? tasks.length : tasksWithEnd.length
        plannedPct        = Math.round((tasksDue / base) * 100)
        devio             = progress - plannedPct
      }

      // ── MÉTODO 2: interpolação calendário (fallback) ──────────────────────
      if (plannedPct === null && p.expectedStart && p.expectedEnd) {
        const totalDays   = differenceInDays(p.expectedEnd, p.expectedStart)
        const elapsedDays = differenceInDays(today, p.expectedStart)

        if (totalDays > 0 && elapsedDays > 0) {
          // Limita a 100% mesmo que o projeto já tenha passado do prazo
          plannedPct = Math.min(100, Math.round((elapsedDays / totalDays) * 100))
          devio      = progress - plannedPct
        }
      }

      // ── Classificação por desvio em pp ────────────────────────────────────
      if (devio !== null) {
        if      (devio >= -15) scheduleStatus = "ON_TIME"
        else if (devio >= -30) scheduleStatus = "AT_RISK"
        else                   scheduleStatus = "DELAYED"
      }

      // IDP mantido como referência auxiliar (progress / plannedPct)
      if (plannedPct !== null && plannedPct > 0) {
        idp = Math.round((progress / plannedPct) * 100) / 100
      }
    }

    // ── IDC — EVM: Valor Agregado / Custo Real ────────────────────────────────
    let idc: number | null = null
    if (!skipKpi) {
      const earnedValue   = tasks.reduce((s, t) => s + (t.budgetedCost ?? 0) * (t.progress / 100), 0)
      const actualCostSum = tasks.reduce((s, t) => s + (t.actualCost  ?? 0), 0)
      if (actualCostSum > 0) {
        idc = Math.round((earnedValue / actualCostSum) * 100) / 100
      }
    }

    // ── Riscos ────────────────────────────────────────────────────────────────
    const risks = {
      critical: p.risks.filter((r) => r.status === "CRITICAL").length,
      high:     p.risks.filter((r) => r.status === "HIGH").length,
      medium:   p.risks.filter((r) => r.status === "MEDIUM").length,
      low:      p.risks.filter((r) => r.status === "LOW").length,
    }

    const taskResponsibles = [
      ...new Set(tasks.map((t) => t.responsible?.name).filter((n): n is string => Boolean(n)))
    ]

    return {
      id:             p.id,
      title:          p.title,
      status:         p.status,
      projectArea:    p.projectArea,
      sponsor:        p.sponsor?.name ?? null,
      taskResponsibles,
      progress,
      plannedPct,
      devio,
      idp,
      idc,
      budget:         p.budget,
      estimatedCosts: p.estimatedCosts,
      economy:        p.economy,
      scheduleStatus,
      risks,
      expectedEnd:    p.expectedEnd?.toISOString() ?? null,
      reportStatus: {
        cost:      p.reportStatusCost,
        schedule:  p.reportStatusSchedule,
        resources: p.reportStatusResources,
        overall:   p.reportStatusOverall,
      },
    }
  })

  return <AnalyticsClient projects={data} users={users} userRole={userRole} userArea={userArea} />
}
