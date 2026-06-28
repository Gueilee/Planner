import { Suspense } from "react"
import { db } from "@/lib/db"
import { auth } from "@/auth"
import { Header } from "@/components/layout/header"
import { FolderKanban, Layers, Clock, CheckCircle2, BarChart3, PauseCircle } from "lucide-react"
import { ProjectsClient, type ProjectRow } from "./projects-client"

const KPI_GRADIENTS = [
  { gradient: "linear-gradient(135deg, #1E40AF, #3B82F6)", glow: "rgba(59,130,246,0.3)"  },
  { gradient: "linear-gradient(135deg, #1E3A5F, #2463FF)", glow: "rgba(36,99,255,0.3)"   },
  { gradient: "linear-gradient(135deg, #065F46, #10B981)", glow: "rgba(16,185,129,0.3)"  },
  { gradient: "linear-gradient(135deg, #064E3B, #059669)", glow: "rgba(5,150,105,0.3)"   },
  { gradient: "linear-gradient(135deg, #4C1D95, #7C3AED)", glow: "rgba(124,58,237,0.35)" },
  { gradient: "linear-gradient(135deg, #92400E, #F59E0B)", glow: "rgba(245,158,11,0.3)"  },
]

export default async function ProjectsPage() {
  const session = await auth()
  if (!session?.user) return null

  const [projects, counts] = await Promise.all([
    db.project.findMany({
      where: { organizationId: session.user.organizationId },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        projectArea: true,
        requestNumber: true,
        members: {
          take: 5,
          select: {
            id: true,
            user: { select: { name: true, image: true } },
          },
        },
        tasks: { select: { status: true, progress: true, wbsAreaId: true } },
        wbsAreas: { select: { id: true, weight: true }, orderBy: { order: "asc" } },
        _count: { select: { tasks: true, risks: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.project.groupBy({ by: ["status"], where: { organizationId: session.user.organizationId }, _count: true }),
  ])

  const byStatus       = Object.fromEntries(counts.map((c) => [c.status, c._count]))
  const total          = projects.length
  const active         = (byStatus["IN_PROGRESS"] ?? 0) + (byStatus["PILOT"] ?? 0) + (byStatus["RAMP_UP"] ?? 0)
  const planning       = byStatus["PLANNING"] ?? 0
  const completed      = byStatus["COMPLETED"] ?? 0
  const futureAnalysis = byStatus["FUTURE_ANALYSIS"] ?? 0
  const paused         = byStatus["PAUSED"] ?? 0

  const kpis = [
    { label: "Total Projetos",  value: total,          icon: FolderKanban },
    { label: "Planejamento",    value: planning,       icon: Layers },
    { label: "Em Execução",     value: active,         icon: Clock },
    { label: "Concluídos",      value: completed,      icon: CheckCircle2 },
    { label: "Pausados",        value: paused,         icon: PauseCircle },
    { label: "Análise Futura",  value: futureAnalysis, icon: BarChart3 },
  ]

  const serialized: ProjectRow[] = projects.map((p) => ({
    id:            p.id,
    title:         p.title,
    description:   p.description,
    status:        p.status,
    projectArea:   p.projectArea,
    requestNumber: p.requestNumber,
    members:       p.members,
    tasks:         p.tasks,
    wbsAreas:      p.wbsAreas,
    _count:        p._count,
  }))

  return (
    <div className="flex flex-col h-full">
      <Header title="Projetos" subtitle="Portfólio completo de projetos da organização" />

      <div className="flex-1 overflow-auto p-6 space-y-6">

        {/* KPIs */}
        <div className="grid grid-cols-2 xl:grid-cols-6 gap-4">
          {kpis.map(({ label, value, icon: Icon }, i) => {
            const { gradient, glow } = KPI_GRADIENTS[i]
            return (
              <div
                key={label}
                className="relative overflow-hidden rounded-2xl p-5 transition-all duration-300 group"
                style={{ background: gradient, boxShadow: `0 4px 20px ${glow}` }}
              >
                <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full opacity-15"
                  style={{ background: "radial-gradient(circle, white 0%, transparent 70%)" }} />
                <div className="flex items-start justify-between mb-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/60">{label}</p>
                  <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                </div>
                <p className="text-3xl font-black text-white leading-none">{value}</p>
              </div>
            )
          })}
        </div>

        {/* Interactive filter + list */}
        <Suspense fallback={null}>
          <ProjectsClient projects={serialized} />
        </Suspense>

      </div>
    </div>
  )
}
