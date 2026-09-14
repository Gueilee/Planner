import { auth } from "@/auth"
import { notFound } from "next/navigation"
import { getSCurveData } from "@/lib/actions/s-curve"
import { SCurveClient } from "./s-curve-client"
import { db } from "@/lib/db"
import Link from "next/link"
import { ArrowLeft, BarChart3, CalendarRange, GanttChartSquare } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function SCurvePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) notFound()

  const [data, project] = await Promise.all([
    getSCurveData(id),
    db.project.findUnique({ where: { id }, select: { id: true, title: true } }),
  ])

  if (!project) notFound()

  return (
    <div className="flex flex-col min-h-screen bg-[#0F172A]">
      {/* Topbar */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-[#334155] bg-[#0F172A]/95 sticky top-0 z-20 backdrop-blur">
        <Link href={`/projects/${id}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>
        <div className="w-px h-5 bg-[#334155]" />
        <BarChart3 className="w-4 h-4 text-violet-400 shrink-0" />
        <span className="text-sm font-black text-white truncate">{project.title}</span>
        <span className="text-xs text-slate-500 shrink-0">— Curva S</span>
        <div className="ml-auto flex items-center gap-2">
          <Link href={`/projects/${id}/schedule`}
            title="Ver o Cronograma (grade de atividades) deste projeto"
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border border-violet-500/30 text-violet-300 bg-violet-500/10 hover:bg-violet-500/20 transition-colors">
            <CalendarRange className="w-3.5 h-3.5" /> Ver Cronograma
          </Link>
          <Link href={`/projects/${id}/gantt`}
            title="Ver o Gantt deste projeto (linha do tempo, barras e dependências)"
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border border-violet-500/30 text-violet-300 bg-violet-500/10 hover:bg-violet-500/20 transition-colors">
            <GanttChartSquare className="w-3.5 h-3.5" /> Ver Gantt
          </Link>
        </div>
      </div>
      {/* Full chart */}
      <div className="flex-1">
        <SCurveClient projectId={id} initialData={data} />
      </div>
    </div>
  )
}
