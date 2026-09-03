import { auth } from "@/auth"
import { db } from "@/lib/db"
import { DashboardClient } from "./dashboard-client"
import { Header } from "@/components/layout/header"
import { redirect } from "next/navigation"
import { addDays } from "date-fns"
import { ProjectStatus } from "@/lib/generated/prisma/enums"
import { getEffectivePermissions, canView } from "@/lib/permissions-guard"
import { V2_STATUS_TO_LEGACY } from "@/lib/utils/schedule-v2-adapter"
import { ShieldAlert } from "lucide-react"

// "Área" v2 = ancestral de topo (ver lib/utils/schedule-v2-adapter.ts) — aqui
// resolvida sob demanda (no máximo 6+6 linhas no Dashboard) em vez de
// carregar a árvore inteira de cada projeto só para um badge cosmético. Item
// que já é raiz não tem "área" (mesmo comportamento do legado quando
// wbsAreaId é null — sem badge).
async function resolveAreaTitle(parentId: string | null): Promise<string | null> {
  if (!parentId) return null
  let curParentId: string | null = parentId
  let lastTitle: string | null = null
  let guard = 0
  while (curParentId && guard++ < 20) {
    const parent: { parentId: string | null; title: string } | null =
      await db.scheduleV2Item.findUnique({ where: { id: curParentId }, select: { parentId: true, title: true } })
    if (!parent) break
    lastTitle = parent.title
    curParentId = parent.parentId
  }
  return lastTitle
}

export const metadata = { title: "Dashboard" }

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  // Única tela que não redireciona quando negada — evita loop, já que as
  // demais páginas caem de volta pro Dashboard quando o usuário não tem acesso.
  const perms = await getEffectivePermissions(session.user)
  if (!canView(perms, "dashboard")) {
    return (
      <div className="flex flex-col h-full">
        <Header />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="flex flex-col items-center gap-3 text-center max-w-sm">
            <ShieldAlert className="w-10 h-10 text-slate-300" />
            <p className="text-sm font-bold text-slate-700">Nenhuma tela liberada para o seu usuário</p>
            <p className="text-xs text-slate-400">
              Fale com o administrador do sistema para vincular um perfil de acesso à sua conta.
            </p>
          </div>
        </div>
      </div>
    )
  }

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

  const itemSel = {
    id: true, parentId: true, title: true, terminoEstimado: true, status: true,
    project:     { select: { id: true, title: true } },
    responsavel: { select: { name: true } },
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

    db.scheduleV2Item.findMany({
      where: { status: { notIn: ["CONCLUIDO"] }, terminoEstimado: { lt: today }, project: { organizationId: session.user.organizationId } },
      orderBy: { terminoEstimado: "asc" },
      take: 6,
      select: itemSel,
    }),

    db.scheduleV2Item.findMany({
      where: { status: { in: ["EM_ANDAMENTO", "A_INICIAR"] }, terminoEstimado: { gte: today, lte: in14 }, project: { organizationId: session.user.organizationId } },
      orderBy: { terminoEstimado: "asc" },
      take: 6,
      select: itemSel,
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

  const [overdueAreas, upcomingAreas] = await Promise.all([
    Promise.all(overdueTasks.map((t) => resolveAreaTitle(t.parentId))),
    Promise.all(upcomingTasks.map((t) => resolveAreaTitle(t.parentId))),
  ])

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
          overdueTasks={overdueTasks.map((t, i) => ({
            id: t.id, title: t.title, status: V2_STATUS_TO_LEGACY[t.status] ?? "PLANNING",
            endDate:     toISO(t.terminoEstimado),
            project:     t.project,
            responsible: t.responsavel,
            wbsArea:     overdueAreas[i] ? { name: overdueAreas[i]!, color: null } : null,
          }))}
          upcomingTasks={upcomingTasks.map((t, i) => ({
            id: t.id, title: t.title, status: V2_STATUS_TO_LEGACY[t.status] ?? "PLANNING",
            endDate:     toISO(t.terminoEstimado),
            project:     t.project,
            responsible: t.responsavel,
            wbsArea:     upcomingAreas[i] ? { name: upcomingAreas[i]!, color: null } : null,
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
