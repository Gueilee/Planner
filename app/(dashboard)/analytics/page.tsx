import { db } from "@/lib/db"
import { requireScreenView } from "@/lib/permissions-guard"
import { computeProjectProgress } from "@/lib/utils/project-progress"
import { DEFAULT_RISK_THRESHOLD_PCT, type ScheduleStatus } from "@/lib/utils/schedule-status"
import { computeScheduleCascade } from "@/lib/utils/schedule-cascade"
import { ProjectStatus } from "@/lib/generated/prisma/enums"
import { AnalyticsClient } from "./analytics-client"

export const dynamic = "force-dynamic"

export const metadata = { title: "Indicadores de Gestão" }

export type UserOption = { id: string; name: string }

export type TaskDashData = {
  id: string
  title: string
  wbsAreaId: string | null
  parentId: string | null
  status: string
  progress: number
  startDate: string | null
  endDate: string | null
  actualStart: string | null
  actualEnd: string | null
  completedAt: string | null
  budgetedCost: number | null
  actualCost: number | null
  estimatedEffort: number | null
  actualEffort: number | null
  riskStatus: string
  responsibleName: string | null
  responsibleId: string | null
  expectedPct: number | null
  scheduleStatus: ScheduleStatus
}

export type AreaDashData = {
  id: string
  name: string
  color: string | null
  weight: number | null
  actualPct: number | null
  expectedPct: number | null
  scheduleStatus: ScheduleStatus | null
}

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
  tasks: TaskDashData[]
  areas: AreaDashData[]
}

// Nesses status o projeto ainda não iniciou ou está pausado — não calcular KPIs de progresso
const SKIP_KPI_STATUSES = new Set([
  "PLANNING", "FUTURE_ANALYSIS", "ON_HOLD", "PAUSED", "PENDING_GO_NO_GO",
])

export default async function AnalyticsPage() {
  const { session } = await requireScreenView("analytics")

  const today = new Date()
  const userRole = (session.user.role ?? "PROJECT_MEMBER") as string

  let userArea: string | null = null
  if (userRole === "DIRECTOR") {
    const dbUser = await db.user.findUnique({
      where:  { id: session.user.id ?? "" },
      select: { department: true },
    })
    const dept = (dbUser?.department ?? "").toUpperCase().trim()
    if (dept === "TECNOLOGIA")            userArea = "TECNOLOGIA"
    else if (dept === "QUALIDADE")        userArea = "QUALIDADE"
    else if (dept === "ARMAZÉNS" || dept === "ARMAZENS" || dept === "ARMAZEM") userArea = "ARMAZEM"
    else if (dept)                        userArea = "ESTRATEGICO"
  }

  const [projectsRaw, users, org] = await Promise.all([
    db.project.findMany({
      where:   { status: { not: ProjectStatus.CANCELLED }, organizationId: session.user.organizationId },
      orderBy: { createdAt: "asc" },
      include: {
        sponsor: { select: { name: true } },
        tasks: {
          select: {
            id: true,
            title: true,
            wbsAreaId: true,
            parentId: true,
            status: true,
            progress: true,
            startDate: true,
            endDate: true,
            actualStart: true,
            actualEnd: true,
            completedAt: true,
            budgetedCost: true,
            actualCost: true,
            estimatedEffort: true,
            actualEffort: true,
            riskStatus: true,
            responsible: { select: { id: true, name: true } },
          },
        },
        risks:    { select: { status: true } },
        wbsAreas: {
          select: { id: true, name: true, color: true, weight: true },
          orderBy: { order: "asc" },
        },
      },
    }),
    db.user.findMany({
      where:   { active: true, organizationId: session.user.organizationId },
      select:  { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.organization.findUnique({
      where:  { id: session.user.organizationId },
      select: { riskThresholdPct: true },
    }),
  ])

  const riskThresholdPct = org?.riskThresholdPct ?? DEFAULT_RISK_THRESHOLD_PCT

  const data: ProjectIndicator[] = projectsRaw.map((p) => {
    const tasks   = p.tasks
    const skipKpi = SKIP_KPI_STATUSES.has(p.status)

    const progress =
      tasks.length > 0
        ? computeProjectProgress(tasks, p.wbsAreas)
        : p.status === "COMPLETED" ? 100 : 0

    // ── Desvio de prazo ───────────────────────────────────────────────────────
    // Cascata Tarefa → Módulo → Projeto (lib/utils/schedule-cascade.ts): cada
    // tarefa tem seu próprio % esperado pelo calendário, agregado em cascata —
    // em vez de comparar só a data de início/fim do projeto como um todo.
    const cascade = computeScheduleCascade(tasks, p.wbsAreas, riskThresholdPct, today)
    const cascadeByTask = new Map(cascade.tasks.map((t) => [t.id, t]))
    const cascadeByArea = new Map(cascade.areas.map((a) => [a.id, a]))

    let plannedPct:     number | null = cascade.expectedPct
    let devio:          number | null = cascade.expectedPct !== null ? progress - cascade.expectedPct : null
    let idp:            number | null = (cascade.expectedPct !== null && cascade.expectedPct > 0)
      ? Math.round((progress / cascade.expectedPct) * 100) / 100
      : null
    let scheduleStatus: ProjectIndicator["scheduleStatus"] = cascade.scheduleStatus

    if (p.status === "COMPLETED") {
      // Projeto concluído: considerado no prazo independente de quando finalizou
      scheduleStatus = "ON_TIME"
      plannedPct     = 100
      devio          = progress - 100
      idp            = 1.0
    } else if (skipKpi) {
      scheduleStatus = "ND"
      plannedPct     = null
      devio          = null
      idp            = null
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

    // ── Serialização de tarefas ───────────────────────────────────────────────
    const serializedTasks: TaskDashData[] = tasks.map((t) => ({
      id:               t.id,
      title:            t.title,
      wbsAreaId:        t.wbsAreaId ?? null,
      parentId:         t.parentId ?? null,
      status:           t.status,
      progress:         t.progress,
      startDate:        t.startDate?.toISOString() ?? null,
      endDate:          t.endDate?.toISOString() ?? null,
      actualStart:      t.actualStart?.toISOString() ?? null,
      actualEnd:        t.actualEnd?.toISOString() ?? null,
      completedAt:      t.completedAt?.toISOString() ?? null,
      budgetedCost:     t.budgetedCost ?? null,
      actualCost:       t.actualCost ?? null,
      estimatedEffort:  t.estimatedEffort ?? null,
      actualEffort:     t.actualEffort ?? null,
      riskStatus:       t.riskStatus,
      responsibleName:  t.responsible?.name ?? null,
      responsibleId:    t.responsible?.id ?? null,
      expectedPct:      cascadeByTask.get(t.id)?.expectedPct ?? null,
      scheduleStatus:   cascadeByTask.get(t.id)?.scheduleStatus ?? "ND",
    }))

    // ── Serialização de áreas WBS ─────────────────────────────────────────────
    const serializedAreas: AreaDashData[] = p.wbsAreas.map((a) => ({
      id:     a.id,
      name:   a.name,
      color:  a.color ?? null,
      weight: a.weight ?? null,
      actualPct:      cascadeByArea.get(a.id)?.actualPct ?? null,
      expectedPct:    cascadeByArea.get(a.id)?.expectedPct ?? null,
      scheduleStatus: cascadeByArea.get(a.id)?.scheduleStatus ?? null,
    }))

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
      tasks:  serializedTasks,
      areas:  serializedAreas,
    }
  })

  return <AnalyticsClient projects={data} users={users} userRole={userRole} userArea={userArea} />
}
