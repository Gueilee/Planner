import { auth } from "@/auth"
import { db } from "@/lib/db"
import { notFound, redirect } from "next/navigation"
import { ScheduleClient } from "./schedule-client"

export const metadata = { title: "Cronograma" }

export default async function SchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) redirect("/login")

  const [project, areas, tasks, memberships] = await Promise.all([
    db.project.findUnique({ where: { id }, select: { id: true, title: true, status: true } }),
    db.wbsArea.findMany({ where: { projectId: id }, orderBy: { order: "asc" } }),
    db.scheduleTask.findMany({
      where: { projectId: id },
      include: {
        responsible: { select: { id: true, name: true } },
        wbsArea: { select: { id: true, name: true, color: true } },
        _count: { select: { comments: true, attachments: true } },
      },
      orderBy: { order: "asc" },
    }),
    db.projectMember.findMany({
      where: { projectId: id },
      include: { user: { select: { id: true, name: true, department: true } } },
    }),
  ])

  if (!project) notFound()

  const serializedTasks = tasks.map((t) => ({
    ...t,
    startDate: t.startDate?.toISOString() ?? null,
    endDate: t.endDate?.toISOString() ?? null,
    actualStart: t.actualStart?.toISOString() ?? null,
    actualEnd: t.actualEnd?.toISOString() ?? null,
    completedAt: t.completedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    dependencies: t.dependencies ? (JSON.parse(t.dependencies) as string[]) : ([] as string[]),
  }))

  return (
    <ScheduleClient
      project={{ id: project.id, title: project.title, status: project.status }}
      initialAreas={areas.map((a) => ({ id: a.id, name: a.name, color: a.color }))}
      initialTasks={serializedTasks}
      members={memberships.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        department: m.user.department,
      }))}
    />
  )
}
