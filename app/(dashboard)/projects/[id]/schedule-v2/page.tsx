import { auth } from "@/auth"
import { notFound, redirect } from "next/navigation"
import { db } from "@/lib/db"
import { getScheduleV2 } from "@/lib/actions/schedule-v2"
import { ScheduleV2Client } from "./schedule-v2-client"
import Link from "next/link"
import { ArrowLeft, FlaskConical } from "lucide-react"

export const dynamic = "force-dynamic"
export const metadata = { title: "Cronograma (Beta)" }

// Feature em teste — mesmo padrão CAN_MANAGE das Server Actions
// (lib/actions/schedule-v2.ts), sem depender de tela/permissão nova.
const CAN_MANAGE_V2 = new Set(["ADMIN", "PROJECT_MANAGER"])

export default async function ScheduleV2Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (!CAN_MANAGE_V2.has(session.user.role ?? "")) redirect(`/projects/${id}`)

  const [project, data] = await Promise.all([
    db.project.findUnique({ where: { id }, select: { id: true, title: true, expectedStart: true, expectedEnd: true } }),
    getScheduleV2(id),
  ])
  if (!project) notFound()

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "#F8F9FC" }}>
      {/* Topbar */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200 bg-white sticky top-0 z-20">
        <Link href={`/projects/${id}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>
        <div className="w-px h-5 bg-slate-200" />
        <FlaskConical className="w-4 h-4 text-amber-500 shrink-0" />
        <span className="text-sm font-black text-slate-800 truncate">{project.title}</span>
        <span className="text-xs text-slate-400 shrink-0">— Cronograma</span>
        <span className="ml-1 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
          Beta
        </span>
      </div>

      <div className="flex-1">
        <ScheduleV2Client
          projectId={id}
          initial={data}
          initialProjectDates={{
            expectedStart: project.expectedStart?.toISOString().slice(0, 10) ?? null,
            expectedEnd: project.expectedEnd?.toISOString().slice(0, 10) ?? null,
          }}
        />
      </div>
    </div>
  )
}
