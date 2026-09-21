import { auth } from "@/auth"
import { notFound, redirect } from "next/navigation"
import { db } from "@/lib/db"
import { canAccessOrg } from "@/lib/actions/project-access"
import { getScheduleV2 } from "@/lib/actions/schedule-v2"
import { getLatestBaselineByItem } from "@/lib/actions/baseline"
import { ScheduleV2Client } from "../schedule-v2/schedule-v2-client"
import { DEFAULT_RISK_THRESHOLD_PCT } from "@/lib/utils/schedule-status"
import Link from "next/link"
import { ArrowLeft, TrendingUp, GanttChartSquare } from "lucide-react"

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

  const project = await db.project.findUnique({ where: { id }, select: { id: true, title: true, expectedStart: true, expectedEnd: true, publicScheduleToken: true, organizationId: true } })
  if (!project) notFound()
  if (!(await canAccessOrg(session, project.organizationId))) notFound()

  const [data, members, org, baselineByItem] = await Promise.all([
    getScheduleV2(id),
    // Elegível como Responsável: filial DO PROJETO (não a filial ativa de
    // quem está vendo — pode ser diferente, esta página permite ver
    // projetos de outra filial via acesso concedido) OU acesso extra
    // concedido àquela filial (UserOrganizationAccess) — antes só olhava a
    // própria filial ativa da sessão, então quem tinha acesso concedido a
    // outra filial nunca aparecia pra ser escolhido como responsável nela
    // (relatado pela PMO).
    db.user.findMany({
      where: {
        active: true,
        OR: [
          { organizationId: project.organizationId },
          { organizationAccess: { some: { organizationId: project.organizationId } } },
        ],
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.organization.findUnique({ where: { id: project.organizationId }, select: { riskThresholdPct: true } }),
    getLatestBaselineByItem(id),
  ])

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
        <div className="ml-auto flex items-center gap-2">
          <Link href={`/projects/${id}/gantt`}
            title="Ver o Gantt deste projeto (linha do tempo, barras e dependências)"
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border border-violet-200 text-[#7B2FBE] bg-violet-50 hover:bg-violet-100 transition-colors">
            <GanttChartSquare className="w-3.5 h-3.5" /> Ver Gantt
          </Link>
          <Link href={`/projects/${id}/s-curve`}
            title="Ver a Curva S deste projeto (planejado vs. realizado)"
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border border-violet-200 text-[#7B2FBE] bg-violet-50 hover:bg-violet-100 transition-colors">
            <TrendingUp className="w-3.5 h-3.5" /> Ver Curva S
          </Link>
        </div>
      </div>

      {/* Corpo com altura própria (sem overflow-y aqui) — o layout do
          dashboard é h-screen overflow-hidden, e agora é o ScheduleV2Client
          quem controla a própria rolagem internamente (cabeçalho/barra de
          ferramentas fixos, só a grade rola, nos dois eixos, com o
          cabeçalho de colunas sticky). Antes este wrapper rolava a página
          inteira verticalmente, o que empurrava a barra de rolagem
          horizontal da grade pro fim de todas as N linhas — praticamente
          inacessível num cronograma grande (79 itens na Aptissen). */}
      <div className="flex-1 min-h-0 overflow-hidden">
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
          initialBaselineByItem={baselineByItem}
          initialPublicScheduleToken={project.publicScheduleToken}
        />
      </div>
    </div>
  )
}
