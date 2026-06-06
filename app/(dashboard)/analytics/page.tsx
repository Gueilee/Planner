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
  devio: number | null
  idp: number | null
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

// Nesses status o projeto ainda não iniciou ou está pausado — não calcular IDP/IDC
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

    // ── Progresso médio ───────────────────────────────────────────
    const progress =
      tasks.length > 0
        ? Math.round(tasks.reduce((s, t) => s + t.progress, 0) / tasks.length)
        : p.status === "COMPLETED" ? 100 : 0

    // ── Desvio / IDP / scheduleStatus ────────────────────────────
    let devio:          number | null = null
    let plannedPct:     number | null = null
    let idp:            number | null = null
    let scheduleStatus: ProjectIndicator["scheduleStatus"] = "ND"

    if (p.status === "COMPLETED") {
      // Projeto concluído: sempre classificado como no prazo
      scheduleStatus = "ON_TIME"
      idp = 1.0

    } else if (!skipKpi) {
      // Passo 1: % planejado no nível do projeto (linha de base = expectedStart)
      if (p.expectedStart && p.expectedEnd) {
        const totalDays   = differenceInDays(p.expectedEnd, p.expectedStart)
        const elapsedDays = differenceInDays(today, p.expectedStart)
        if (totalDays > 0 && elapsedDays > 0) {
          const pct = Math.min(100, (elapsedDays / totalDays) * 100)
          plannedPct = Math.round(pct)
          devio      = (progress - pct) / 100
        }
      }

      // Passo 2: IDP por tarefa individual (mais preciso)
      const tasksWithDates = tasks.filter((t) => t.startDate && t.endDate)
      if (tasksWithDates.length >= 2) {
        let sumActual = 0, sumPlanned = 0, count = 0
        for (const t of tasksWithDates) {
          const totalD  = differenceInDays(t.endDate!, t.startDate!)
          const elapsed = differenceInDays(today, t.startDate!)
          let planned: number
          if (elapsed <= 0)     planned = 0   // tarefa ainda não começou
          else if (totalD <= 0) planned = 100 // duração zero
          else                  planned = Math.min(100, (elapsed / totalD) * 100)
          sumActual  += t.progress
          sumPlanned += planned
          count++
        }
        if (count > 0 && sumPlanned > 0) {
          idp = Math.round((sumActual / sumPlanned) * 100) / 100
        }
      } else if (plannedPct !== null && plannedPct > 5) {
        // Fallback: IDP no nível do projeto
        idp = Math.round((progress / plannedPct) * 100) / 100
      }

      // Passo 3: classificação baseada no IDP
      if (idp !== null) {
        if (idp >= 0.95)      scheduleStatus = "ON_TIME"
        else if (idp >= 0.80) scheduleStatus = "AT_RISK"
        else                  scheduleStatus = "DELAYED"
      } else if (devio !== null) {
        if (devio >= 0)          scheduleStatus = "ON_TIME"
        else if (devio >= -0.15) scheduleStatus = "AT_RISK"
        else                     scheduleStatus = "DELAYED"
      }
    }

    // ── IDC — EVM: Valor Agregado / Custo Real ────────────────────
    // IDC = EV / AC  onde EV = Σ(custo_orçado × % progresso) e AC = Σ(custo_real)
    let idc: number | null = null
    if (!skipKpi) {
      const earnedValue   = tasks.reduce((s, t) => s + (t.budgetedCost ?? 0) * (t.progress / 100), 0)
      const actualCostSum = tasks.reduce((s, t) => s + (t.actualCost  ?? 0), 0)
      if (actualCostSum > 0) {
        idc = Math.round((earnedValue / actualCostSum) * 100) / 100
      }
    }

    // ── Riscos ───────────────────────────────────────────────────
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
