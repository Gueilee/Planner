import { auth } from "@/auth"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import { differenceInDays } from "date-fns"
import { ProjectStatus } from "@/lib/generated/prisma/enums"
import { ReportClient, type ProjectSlideData } from "./report-client"

export const metadata = { title: "Status Report" }

const ACTIVE_STATUSES: ProjectStatus[] = [
  ProjectStatus.IN_PROGRESS,
  ProjectStatus.PILOT,
  ProjectStatus.RAMP_UP,
  ProjectStatus.GO_LIVE,
  ProjectStatus.POST_GOLIVE,
]

export default async function StatusReportPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const projects = await db.project.findMany({
    where:   { status: { in: ACTIVE_STATUSES } },
    orderBy: { createdAt: "asc" },
    include: {
      sponsor: { select: { name: true } },
      members: {
        select: {
          role: true,
          user: { select: { name: true } },
        },
      },
      tasks: {
        select: {
          title: true, status: true, progress: true,
          startDate: true, endDate: true,
          budgetedCost: true, actualCost: true,
          responsible: { select: { name: true } },
        },
        orderBy: { order: "asc" },
      },
      risks: {
        select: { status: true, description: true, mitigation: true, owner: true },
        orderBy: { status: "asc" },
        take: 8,
      },
      wbsAreas: {
        orderBy: { order: "asc" },
        include: { tasks: { select: { status: true, title: true } } },
      },
      meetings: {
        where:   { type: "CHECKPOINT" },
        orderBy: { date: "desc" },
        take: 1,
        select: { date: true, title: true, location: true, content: true, decisions: true, nextActions: true },
      },
      _count: {
        select: { meetings: true },
      },
    },
  })

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const slides: ProjectSlideData[] = projects.map((p) => {
    const tasks      = p.tasks
    const total      = tasks.length
    const completed  = tasks.filter((t) => t.status === "COMPLETED")
    const inProgress = tasks.filter((t) => t.status === "IN_PROGRESS")
    const delayed    = tasks.filter((t) => t.status === "DELAYED")
    const planning   = tasks.filter((t) => t.status === "PLANNING")
    const avgProgress = total > 0
      ? Math.round(tasks.reduce((s, t) => s + t.progress, 0) / total)
      : (p.status === "COMPLETED" ? 100 : 0)

    // EVM
    const earnedValue   = tasks.reduce((s, t) => s + (t.budgetedCost ?? 0) * (t.progress / 100), 0)
    const actualCostSum = tasks.reduce((s, t) => s + (t.actualCost ?? 0), 0)
    const idc = actualCostSum > 0 ? Math.round((earnedValue / actualCostSum) * 100) / 100 : null

    let idp: number | null = null
    let timelineProgress: number | null = null
    if (p.expectedStart && p.expectedEnd) {
      const totalDays   = differenceInDays(p.expectedEnd, p.expectedStart)
      const elapsedDays = differenceInDays(today, p.expectedStart)
      if (totalDays > 0) {
        const plannedPct = Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100))
        timelineProgress = Math.round(plannedPct)
        if (plannedPct > 5) idp = Math.round((avgProgress / plannedPct) * 100) / 100
      }
    }

    // At-risk tasks
    const atRiskTasks: ProjectSlideData["atRiskTasks"] = []
    for (const t of tasks) {
      const responsible = t.responsible?.name ?? null
      const startDate   = t.startDate?.toISOString() ?? null
      const endDate     = t.endDate?.toISOString()   ?? null
      if (t.status === "PLANNING" && t.startDate) {
        const start = new Date(t.startDate); start.setHours(0, 0, 0, 0)
        if (start < today)
          atRiskTasks.push({ title: t.title, type: "NOT_STARTED", date: t.startDate.toISOString(), daysLate: differenceInDays(today, start), responsible, startDate, endDate })
      } else if (t.status === "DELAYED") {
        const ref = t.endDate ?? t.startDate
        const daysLate = ref ? Math.max(0, differenceInDays(today, new Date(ref))) : 0
        atRiskTasks.push({ title: t.title, type: "OVERDUE", date: (ref ?? new Date()).toISOString(), daysLate, responsible, startDate, endDate })
      } else if (t.status === "IN_PROGRESS" && t.endDate) {
        const end = new Date(t.endDate); end.setHours(0, 0, 0, 0)
        if (end < today)
          atRiskTasks.push({ title: t.title, type: "LATE_RUNNING", date: t.endDate.toISOString(), daysLate: differenceInDays(today, end), responsible, startDate, endDate })
      }
    }
    atRiskTasks.sort((a, b) => b.daysLate - a.daysLate)

    const daysLeft   = p.expectedEnd ? differenceInDays(p.expectedEnd, today) : null
    const lastMtg    = p.meetings[0] ?? null
    const rawSteps   = lastMtg?.nextActions || lastMtg?.decisions || null
    const nextSteps  = rawSteps
      ?.split("\n").map((l) => l.replace(/^[-•*\d.]\s*/, "").trim()).filter(Boolean).slice(0, 5) ?? []

    const wbsSummary = p.wbsAreas
      .filter((a) => a.tasks.length > 0)
      .map((a) => ({
        name: a.name, color: a.color,
        total: a.tasks.length,
        done:  a.tasks.filter((t) => t.status === "COMPLETED").length,
        pct:   Math.round((a.tasks.filter((t) => t.status === "COMPLETED").length / a.tasks.length) * 100),
      }))

    return {
      id: p.id, title: p.title, status: p.status,
      sponsor:  p.sponsor?.name ?? null,
      progress: avgProgress,
      idc, idp, timelineProgress,
      meetingsCount: p._count.meetings,
      team: p.members.length,
      members: p.members.map((m) => ({ name: m.user.name, role: m.role })),
      tasks: {
        total, completed: completed.length, inProgress: inProgress.length,
        delayed: delayed.length, planning: planning.length,
        completedTitles:  completed.slice(-5).map((t) => t.title),
        inProgressTitles: inProgress.slice(0, 5).map((t) => t.title),
        plannedTitles:    planning.slice(0, 4).map((t) => t.title),
      },
      risks: {
        critical: p.risks.filter((r) => r.status === "CRITICAL").length,
        high:     p.risks.filter((r) => r.status === "HIGH").length,
        items:    p.risks.map((r) => ({ level: r.status, description: r.description, mitigation: r.mitigation ?? null, owner: r.owner ?? null })),
      },
      daysLeft,
      economy: p.economy,
      budget:  p.budget,
      lastCheckpoint: lastMtg ? {
        date:       lastMtg.date.toISOString(),
        title:      lastMtg.title,
        location:   lastMtg.location ?? null,
        highlights: lastMtg.content  ?? null,
        decisions:  lastMtg.decisions ?? null,
        nextSteps,
      } : null,
      atRiskTasks: atRiskTasks.slice(0, 6),
      wbsAreas: wbsSummary,
      dates: {
        start:  p.actualStart?.toISOString()  ?? p.expectedStart?.toISOString() ?? null,
        end:    p.expectedEnd?.toISOString()   ?? null,
        goLive: p.goLiveDate?.toISOString()    ?? null,
      },
      reportStatus: {
        cost:      p.reportStatusCost      as "GREEN" | "YELLOW" | "RED",
        schedule:  p.reportStatusSchedule  as "GREEN" | "YELLOW" | "RED",
        resources: p.reportStatusResources as "GREEN" | "YELLOW" | "RED",
        overall:   p.reportStatusOverall   as "GREEN" | "YELLOW" | "RED",
        notes:     p.reportStatusNotes ?? null,
      },
    }
  })

  const totalMeetings = slides.reduce((s, p) => s + p.meetingsCount, 0)
  return <ReportClient slides={slides} totalMeetings={totalMeetings} />
}
