import { auth } from "@/auth"
import { db } from "@/lib/db"
import { notFound, redirect } from "next/navigation"
import { getCheckpointHistory } from "@/lib/actions/checkpoint"
import { CheckpointClient } from "./checkpoint-client"

export const metadata = { title: "Checkpoint" }

export default async function CheckpointPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) redirect("/login")

  const [project, areas, tasks, memberships, history] = await Promise.all([
    db.project.findUnique({
      where: { id },
      select: { id: true, title: true, status: true },
    }),
    db.wbsArea.findMany({
      where: { projectId: id },
      orderBy: { order: "asc" },
      select: { id: true, name: true, color: true },
    }),
    db.scheduleTask.findMany({
      where: { projectId: id },
      include: {
        responsible: { select: { id: true, name: true } },
        wbsArea: { select: { id: true, name: true, color: true } },
      },
      orderBy: { order: "asc" },
    }),
    db.projectMember.findMany({
      where: { projectId: id },
      include: { user: { select: { id: true, name: true, department: true } } },
    }),
    getCheckpointHistory(id),
  ])

  if (!project) notFound()

  return (
    <CheckpointClient
      project={{ id: project.id, title: project.title }}
      areas={areas.map((a) => ({ id: a.id, name: a.name, color: a.color }))}
      tasks={tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        progress: t.progress,
        startDate: t.startDate?.toISOString().slice(0, 10) ?? null,
        endDate:   t.endDate?.toISOString().slice(0, 10)   ?? null,
        wbsAreaId: t.wbsAreaId,
        wbsArea:   t.wbsArea,
        responsible: t.responsible,
      }))}
      members={memberships.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        department: m.user.department,
      }))}
      history={history}
    />
  )
}
