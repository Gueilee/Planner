import { auth } from "@/auth"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import { differenceInDays } from "date-fns"
import { ProjectStatus } from "@/lib/generated/prisma/enums"
import { AnalyticsClient } from "./analytics-client"

export const metadata = { title: "Indicadores de Gestão" }

export type ProjectIndicator = {
  id: string
  title: string
  status: string
  sponsor: string | null
  progress: number
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
}

export default async function AnalyticsPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const today = new Date()

  const projects = await db.project.findMany({
    where: { status: { not: ProjectStatus.CANCELLED } },
    orderBy: { createdAt: "asc" },
    include: {
      sponsor: { select: { name: true } },
      tasks:   { select: { status: true, progress: true } },
      risks:   { select: { status: true } },
    },
  })

  const data: ProjectIndicator[] = projects.map((p) => {
    // ── Progress ──────────────────────────────────────────────────
    const tasks = p.tasks
    const progress =
      tasks.length > 0
        ? Math.round(tasks.reduce((s, t) => s + t.progress, 0) / tasks.length)
        : p.status === "COMPLETED"
        ? 100
        : 0

    // ── Devio de Prazo ────────────────────────────────────────────
    let devio: number | null = null
    let scheduleStatus: ProjectIndicator["scheduleStatus"] = "ND"

    if (p.status === "COMPLETED" && !p.expectedStart && !p.expectedEnd) {
      scheduleStatus = "ON_TIME"
    } else if (p.expectedStart && p.expectedEnd) {
      const referenceEnd = p.actualEnd ?? today
      const totalDays = differenceInDays(p.expectedEnd, p.expectedStart)
      if (totalDays > 0) {
        devio = differenceInDays(referenceEnd, p.expectedEnd) / totalDays
        if (devio <= 0) scheduleStatus = "ON_TIME"
        else if (devio <= 0.2) scheduleStatus = "AT_RISK"
        else scheduleStatus = "DELAYED"
      }
    }

    // ── IDP ──────────────────────────────────────────────────────
    let idp: number | null = null
    if (p.expectedStart && p.expectedEnd) {
      const totalDays = differenceInDays(p.expectedEnd, p.expectedStart)
      const elapsedDays = differenceInDays(today, p.expectedStart)
      if (totalDays > 0) {
        const plannedPct = Math.min(Math.max((elapsedDays / totalDays) * 100, 0), 100)
        if (plannedPct > 5) {
          idp = progress / plannedPct
        }
      }
    }

    // ── IDC ──────────────────────────────────────────────────────
    let idc: number | null = null
    if (p.budget != null && p.estimatedCosts != null && p.estimatedCosts > 0) {
      idc = p.budget / p.estimatedCosts
    }

    // ── Risks ─────────────────────────────────────────────────────
    const risks = {
      critical: p.risks.filter((r) => r.status === "CRITICAL").length,
      high:     p.risks.filter((r) => r.status === "HIGH").length,
      medium:   p.risks.filter((r) => r.status === "MEDIUM").length,
      low:      p.risks.filter((r) => r.status === "LOW").length,
    }

    return {
      id:             p.id,
      title:          p.title,
      status:         p.status,
      sponsor:        p.sponsor?.name ?? null,
      progress,
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

  return <AnalyticsClient projects={data} />
}
