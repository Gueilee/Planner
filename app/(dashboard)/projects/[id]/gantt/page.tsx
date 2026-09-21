import { auth } from "@/auth"
import { notFound, redirect } from "next/navigation"
import { db } from "@/lib/db"
import { canAccessOrg } from "@/lib/actions/project-access"
import { getScheduleV2, getWorkCalendarV2 } from "@/lib/actions/schedule-v2"
import { GanttClient } from "./gantt-client"
import Link from "next/link"
import { ArrowLeft, TrendingUp, CalendarRange } from "lucide-react"

export const dynamic = "force-dynamic"
export const metadata = { title: "Gantt" }

// Mesma fonte de dados do Cronograma (getScheduleV2) — o Gantt é só uma
// segunda forma de olhar pro mesmo ScheduleV2Item, nunca uma cópia; editar
// no Cronograma ou no Kanban aparece aqui na próxima vez que a página
// carregar (força "force-dynamic", sem cache de RSC entre navegações).
export default async function GanttPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) redirect("/login")

  const project = await db.project.findUnique({ where: { id }, select: { id: true, title: true, organizationId: true } })
  if (!project) notFound()
  if (!(await canAccessOrg(session, project.organizationId))) notFound()

  const [data, workCalendar, members] = await Promise.all([
    getScheduleV2(id),
    getWorkCalendarV2(id),
    // Mesmo escopo do Cronograma (schedule/page.tsx): filial do PROJETO
    // (pode diferir da filial ativa de quem está vendo) + acesso extra
    // concedido a ela — senão o nome de um responsável com acesso concedido
    // (não filial principal) não resolve aqui.
    db.user.findMany({
      where: {
        active: true,
        OR: [
          { organizationId: project.organizationId },
          { organizationAccess: { some: { organizationId: project.organizationId } } },
        ],
      },
      select: { id: true, name: true },
    }),
  ])

  const membersById = Object.fromEntries(members.map((m) => [m.id, m.name]))

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
        <span className="text-xs text-slate-400 shrink-0">— Gantt</span>
        <div className="ml-auto flex items-center gap-2">
          <Link href={`/projects/${id}/schedule`}
            title="Ver o Cronograma (grade de atividades) deste projeto"
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border border-violet-200 text-[#7B2FBE] bg-violet-50 hover:bg-violet-100 transition-colors">
            <CalendarRange className="w-3.5 h-3.5" /> Ver Cronograma
          </Link>
          <Link href={`/projects/${id}/s-curve`}
            title="Ver a Curva S deste projeto (planejado vs. realizado)"
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border border-violet-200 text-[#7B2FBE] bg-violet-50 hover:bg-violet-100 transition-colors">
            <TrendingUp className="w-3.5 h-3.5" /> Ver Curva S
          </Link>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <GanttClient
          projectTitle={project.title}
          items={data.items}
          dependencies={data.dependencies}
          workCalendar={workCalendar}
          membersById={membersById}
        />
      </div>
    </div>
  )
}
