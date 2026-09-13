import { db } from "@/lib/db"
import { requireScreenView } from "@/lib/permissions-guard"
import { ProjectStatus } from "@/lib/generated/prisma/enums"
import { STATUS_REPORT_PROJECT_INCLUDE, buildProjectSlideData } from "@/lib/utils/status-report-slide"
import { ReportClient } from "./report-client"

// Garante que a página sempre busca dados frescos do banco (sem cache estático)
export const dynamic = "force-dynamic"

export const metadata = { title: "Status Report" }

const ACTIVE_STATUSES: ProjectStatus[] = [
  ProjectStatus.IN_PROGRESS, ProjectStatus.PILOT, ProjectStatus.RAMP_UP,
  ProjectStatus.GO_LIVE, ProjectStatus.POST_GOLIVE,
]

export default async function StatusReportPage() {
  const { session } = await requireScreenView("status_report")

  const projects = await db.project.findMany({
    where:   { status: { in: ACTIVE_STATUSES }, organizationId: session.user.organizationId },
    orderBy: { createdAt: "asc" },
    include: STATUS_REPORT_PROJECT_INCLUDE,
  })

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const slides = projects.map((p) => buildProjectSlideData(p, today))

  const totalMeetings = slides.reduce((s, p) => s + p.meetingsCount, 0)
  const canCloseMonth = new Set(["ADMIN", "PROJECT_MANAGER", "SPONSOR"]).has(session.user.role ?? "")

  return <ReportClient slides={slides} totalMeetings={totalMeetings} canCloseMonth={canCloseMonth} />
}
