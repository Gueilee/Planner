import { auth } from "@/auth"
import { notFound, redirect } from "next/navigation"
import { db } from "@/lib/db"
import { getScheduleV2 } from "@/lib/actions/schedule-v2"
import { ScheduleV2Client } from "../schedule-v2/schedule-v2-client"
import { DEFAULT_RISK_THRESHOLD_PCT } from "@/lib/utils/schedule-status"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export const dynamic = "force-dynamic"
export const metadata = { title: "Cronograma" }

// Defesa: Date.prototype.toISOString() lança RangeError para uma data já
// corrompida no banco (ano com dígitos a mais — bug real que já derrubou
// esta página). As bordas de escrita já validam antes de gravar; isto aqui
// é só para uma data antiga/corrompida nunca mais quebrar a leitura.
function safeDateStr(d: Date | null | undefined): string | null {
  if (!d) return null
  try {
    return d.toISOString().slice(0, 10)
  } catch {
    return null
  }
}

export default async function SchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) redirect("/login")

  const [project, data, members, org] = await Promise.all([
    db.project.findUnique({ where: { id }, select: { id: true, title: true, expectedStart: true, expectedEnd: true } }),
    getScheduleV2(id),
    db.user.findMany({
      where: { active: true, organizationId: session.user.organizationId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.organization.findUnique({ where: { id: session.user.organizationId }, select: { riskThresholdPct: true } }),
  ])
  if (!project) notFound()

  return (
    <div className="flex flex-col h-full" style={{ background: "#F8F9FC" }}>
      {/* Topbar */}
      <div className="shrink-0 flex items-center gap-3 px-5 py-3 border-b border-slate-200 bg-white z-20">
        <Link href={`/projects/${id}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>
        <div className="w-px h-5 bg-slate-200" />
        <span className="text-sm font-black text-slate-800 truncate">{project.title}</span>
        <span className="text-xs text-slate-400 shrink-0">— Cronograma</span>
      </div>

      {/* Corpo com rolagem própria — o layout do dashboard é h-screen
          overflow-hidden, então quem faz scroll é este container, não a
          página inteira (senão o conteúdo mais comprido que a tela fica
          cortado sem barra de rolagem nenhuma). */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <ScheduleV2Client
          projectId={id}
          projectTitle={project.title}
          initial={data}
          projectPlannedDates={{
            expectedStart: safeDateStr(project.expectedStart),
            expectedEnd: safeDateStr(project.expectedEnd),
          }}
          members={members}
          riskThresholdPct={org?.riskThresholdPct ?? DEFAULT_RISK_THRESHOLD_PCT}
        />
      </div>
    </div>
  )
}
