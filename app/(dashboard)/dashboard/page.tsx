import { auth } from "@/auth"
import { db } from "@/lib/db"
import { DashboardClient } from "./dashboard-client"
import { Header } from "@/components/layout/header"
import { redirect } from "next/navigation"
import { addDays } from "date-fns"
import { ProjectStatus } from "@/lib/generated/prisma/enums"

export const metadata = { title: "Dashboard" }

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const today = new Date()
  const in60  = addDays(today, 60)
  const in14  = addDays(today, 14)

  const NOT_DONE: ProjectStatus[] = [
    ProjectStatus.PENDING_GO_NO_GO,
    ProjectStatus.PLANNING, ProjectStatus.IN_PROGRESS, ProjectStatus.PILOT,
    ProjectStatus.RAMP_UP, ProjectStatus.GO_LIVE, ProjectStatus.POST_GOLIVE,
    ProjectStatus.ON_HOLD, ProjectStatus.FUTURE_ANALYSIS, ProjectStatus.PAUSED,
  ]

  const ACTIVE: ProjectStatus[] = [
    ProjectStatus.IN_PROGRESS, ProjectStatus.PILOT, ProjectStatus.RAMP_UP,
    ProjectStatus.GO_LIVE, ProjectStatus.POST_GOLIVE,
  ]

  const taskSel = {
    id: true, title: true, endDate: true, status: true,
    project:     { select: { id: true, title: true } },
    responsible: { select: { name: true } },
    wbsArea:     { select: { name: true, color: true } },
  } as const

  const [
    allStatuses,
    overdueProjects,
    upcomingProjects,
    overdueTasks,
    upcomingTasks,
    onHoldProjects,
    riskProjects,
  ] = await Promise.all([
    db.project.findMany({ where: { organizationId: session.user.organizationId }, select: { status: true } }),

    db.project.findMany({
      where: { organizationId: session.user.organizationId, expectedEnd: { lt: today }, status: { in: NOT_DONE } },
      orderBy: { expectedEnd: "asc" },
      take: 6,
      select: {
        id: true, title: true, status: true, expectedEnd: true,
        sponsor: { select: { name: true } },
      },
    }),

    db.project.findMany({
      where: { organizationId: session.user.organizationId, expectedEnd: { gte: today, lte: in60 }, status: { in: NOT_DONE } },
      orderBy: { expectedEnd: "asc" },
      take: 8,
      select: { id: true, title: true, status: true, expectedEnd: true },
    }),

    db.scheduleTask.findMany({
      where: { status: { notIn: ["COMPLETED"] }, endDate: { lt: today }, project: { organizationId: session.user.organizationId } },
      orderBy: { endDate: "asc" },
      take: 6,
      select: taskSel,
    }),

    db.scheduleTask.findMany({
      where: { status: { in: ["IN_PROGRESS", "PLANNING"] }, endDate: { gte: today, lte: in14 }, project: { organizationId: session.user.organizationId } },
      orderBy: { endDate: "asc" },
      take: 6,
      select: taskSel,
    }),

    // Projetos em espera (ON_HOLD)
    db.project.findMany({
      where: { organizationId: session.user.organizationId, status: ProjectStatus.ON_HOLD },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, title: true, expectedEnd: true, sponsor: { select: { name: true } } },
    }),

    // Projetos ativos com pelo menos 1 risco ALTO ou CRÍTICO
    db.project.findMany({
      where: {
        organizationId: session.user.organizationId,
        status: { in: ACTIVE },
        risks: { some: { status: { in: ["HIGH", "CRITICAL"] } } },
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true, title: true, status: true,
        risks: {
          where: { status: { in: ["HIGH", "CRITICAL"] } },
          select: { status: true },
        },
      },
    }),
  ])

  const countByStatus: Record<string, number> = {}
  for (const p of allStatuses) {
    countByStatus[p.status] = (countByStatus[p.status] ?? 0) + 1
  }

  const totalProjects = allStatuses.length
  const inProgress    = ACTIVE.reduce((s, k) => s + (countByStatus[k] ?? 0), 0)
  const completed     = countByStatus[ProjectStatus.COMPLETED] ?? 0
  const successRate   = totalProjects > 0 ? Math.round((completed / totalProjects) * 100) : 0

  const toISO = (d: Date | null) => d?.toISOString() ?? null

  return (
    <div className="flex flex-col h-full">
      <Header />
      <div className="flex-1 overflow-auto p-6">
        <DashboardClient
          user={session.user}
          stats={{ totalProjects, inProgress, completed, successRate }}
          countByStatus={countByStatus}
          overdueProjects={overdueProjects.map((p) => ({
            id: p.id, title: p.title, status: p.status,
            expectedEnd:  toISO(p.expectedEnd),
            sponsorName:  p.sponsor?.name ?? null,
          }))}
          upcomingProjects={upcomingProjects.map((p) => ({
            id: p.id, title: p.title, status: p.status,
            expectedEnd: toISO(p.expectedEnd),
          }))}
          overdueTasks={overdueTasks.map((t) => ({
            id: t.id, title: t.title, status: t.status,
            endDate:     toISO(t.endDate),
            project:     t.project,
            responsible: t.responsible,
            wbsArea:     t.wbsArea,
          }))}
          upcomingTasks={upcomingTasks.map((t) => ({
            id: t.id, title: t.title, status: t.status,
            endDate:     toISO(t.endDate),
            project:     t.project,
            responsible: t.responsible,
            wbsArea:     t.wbsArea,
          }))}
          onHoldProjects={onHoldProjects.map((p) => ({
            id: p.id, title: p.title,
            expectedEnd: toISO(p.expectedEnd),
            sponsorName: p.sponsor?.name ?? null,
          }))}
          riskProjects={riskProjects.map((p) => ({
            id:           p.id,
            title:        p.title,
            status:       p.status,
            criticalCount: p.risks.filter((r) => r.status === "CRITICAL").length,
            highCount:     p.risks.filter((r) => r.status === "HIGH").length,
          }))}
        />
      </div>
    </div>
  )
}
