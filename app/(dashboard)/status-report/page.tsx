import { db } from "@/lib/db"
import { requireScreenView } from "@/lib/permissions-guard"
import { ACTIVE_STATUSES, STATUS_REPORT_PROJECT_INCLUDE, buildProjectSlideData } from "@/lib/utils/status-report-slide"
import { ReportClient } from "./report-client"

// Garante que a página sempre busca dados frescos do banco (sem cache estático)
export const dynamic = "force-dynamic"

export const metadata = { title: "Status Report" }

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
  // Indicadores da Diretoria (visão cross-filial) — só Diretor/Admin; mesmo
  // gate de lib/actions/director-indicators.ts, checado de novo aqui só
  // pra decidir se mostra a tela de escolha (a busca cross-org em si só
  // acontece se a pessoa realmente clicar, via getDirectorIndicators).
  const canSeeDirectorView = new Set(["DIRECTOR", "ADMIN"]).has(session.user.role ?? "")

  return <ReportClient slides={slides} totalMeetings={totalMeetings} canCloseMonth={canCloseMonth} canSeeDirectorView={canSeeDirectorView} />
}
