import { auth } from "@/auth"
import { db } from "@/lib/db"
import { notFound, redirect } from "next/navigation"
import { getCheckpointHistory } from "@/lib/actions/checkpoint"
import { getProjectParticipants, getAllActiveUsers } from "@/lib/actions/meeting-participants"
import { V2_STATUS_TO_LEGACY, areasFromV2, topLevelAncestorId } from "@/lib/utils/schedule-v2-adapter"
import { CheckpointClient } from "./checkpoint-client"

export const metadata = { title: "Checkpoint" }

export default async function CheckpointPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) redirect("/login")

  const [project, items, projectParticipants, allUsers, history] = await Promise.all([
    db.project.findUnique({
      where: { id },
      select: { id: true, title: true, status: true },
    }),
    db.scheduleV2Item.findMany({
      where: { projectId: id },
      select: {
        id: true, parentId: true, title: true, status: true, percentualCompleto: true,
        inicioEstimado: true, terminoEstimado: true, budgetedCost: true, actualCost: true,
        responsavelId: true, responsavelNome: true, responsavel: { select: { id: true, name: true } },
        comments: {
          orderBy: { createdAt: "asc" },
          select: { id: true, content: true, createdAt: true, user: { select: { name: true } } },
        },
        _count: { select: { attachments: true } },
      },
      orderBy: { order: "asc" },
    }),
    getProjectParticipants(id),
    getAllActiveUsers(),
    getCheckpointHistory(id),
  ])

  if (!project) notFound()

  const taskTitleMap = new Map(items.map((t) => [t.id, t.title]))
  // "Área" v2 = item de topo da árvore (ver lib/utils/schedule-v2-adapter.ts)
  const parentById = new Map(items.map((t) => [t.id, t.parentId]))
  const areas       = areasFromV2(items)
  const areaById    = new Map(areas.map((a) => [a.id, a]))

  return (
    <CheckpointClient
      project={{ id: project.id, title: project.title }}
      areas={areas.map((a) => ({ id: a.id, name: a.name, color: a.color }))}
      tasks={items.map((t) => {
        const areaId = topLevelAncestorId(t.id, parentById)
        // Item de topo (a própria "área") não tem área própria — mesmo
        // comportamento do legado quando wbsAreaId é null.
        const area = areaId !== t.id ? areaById.get(areaId) ?? null : null
        return {
          id:          t.id,
          title:       t.title,
          status:      V2_STATUS_TO_LEGACY[t.status] ?? "PLANNING",
          progress:    t.percentualCompleto,
          startDate:   t.inicioEstimado?.toISOString().slice(0, 10) ?? null,
          endDate:     t.terminoEstimado?.toISOString().slice(0, 10) ?? null,
          wbsAreaId:   area?.id ?? null,
          wbsArea:     area ? { id: area.id, name: area.name, color: area.color } : null,
          responsible: t.responsavel ?? (t.responsavelNome ? { id: "", name: t.responsavelNome } : null),
          parentId:     t.parentId ?? null,
          parentTitle:  t.parentId ? (taskTitleMap.get(t.parentId) ?? null) : null,
          budgetedCost:    t.budgetedCost ?? null,
          actualCost:      t.actualCost   ?? null,
          attachmentCount: t._count.attachments,
          comments:        t.comments.map(c => ({
            id:        c.id,
            content:   c.content,
            createdAt: c.createdAt.toISOString(),
            user:      { name: c.user.name },
          })),
        }
      })}
      projectParticipants={projectParticipants}
      allUsers={allUsers}
      history={history}
    />
  )
}
