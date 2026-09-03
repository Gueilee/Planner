import { auth } from "@/auth"
import { notFound, redirect } from "next/navigation"
import { getProjectClosureData } from "@/lib/actions/encerramento"
import { getProjectParticipants, getAllActiveUsers } from "@/lib/actions/meeting-participants"
import { toLegacyLikeTasks, areasFromV2 } from "@/lib/utils/schedule-v2-adapter"
import { EncerramentoMeetingClient } from "./encerramento-client"

export const metadata = { title: "Reunião de Encerramento" }

export default async function EncerramentoMeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) redirect("/login")

  const [project, projectParticipants, allUsers] = await Promise.all([
    getProjectClosureData(id),
    getProjectParticipants(id),
    getAllActiveUsers(),
  ])
  if (!project) notFound()

  const members = project.members.map((m) => ({
    id:         m.user.id,
    name:       m.user.name,
    department: m.user.department,
    role:       m.role,
  }))

  // "Área" v2 = item de topo da árvore (ver lib/utils/schedule-v2-adapter.ts)
  const legacyTasks = toLegacyLikeTasks(project.scheduleV2Items)
  const topAreas    = areasFromV2(project.scheduleV2Items)
  const groupIds     = new Set(project.scheduleV2Items.filter((i) => i.parentId).map((i) => i.parentId as string))
  const leafTasks    = legacyTasks.filter((t) => !groupIds.has(t.id))

  const wbsAreas = topAreas.map((area) => ({
    id:   area.id,
    name: area.name,
    color: area.color,
    tasks: leafTasks
      .filter((t) => t.wbsAreaId === area.id)
      .map((t) => ({
        id:          t.id,
        title:       t.title,
        status:      t.status,
        progress:    t.progress,
        responsible: t.responsibleName,
        startDate:   t.startDate?.toISOString() ?? null,
        endDate:     t.endDate?.toISOString() ?? null,
      })),
  }))

  const risks = project.risks.map((r) => ({
    id:          r.id,
    description: r.description,
    probability: r.probability,
    impact:      r.impact,
    status:      r.status as string,
    mitigation:  r.mitigation,
    owner:       r.owner,
  }))

  const meetings = project.meetings.map((m) => ({
    id:           m.id,
    type:         m.type as string,
    title:        m.title,
    date:         m.date.toISOString(),
    participants: m._count.participants,
  }))

  const lessons = project.lessonsLearned.map((l) => ({
    id:          l.id,
    phase:       l.phase as string,
    area:        l.area,
    occurrence:  l.occurrence,
    influence:   l.influence as string,
    impact:      l.impact as string,
    lesson:      l.lesson,
    identifiedAt: l.identifiedAt.toISOString(),
    createdBy:   l.createdBy.name,
  }))

  const tasksDone  = leafTasks.filter((t) => t.status === "COMPLETED").length
  const tasksTotal = leafTasks.length

  return (
    <EncerramentoMeetingClient
      project={{
        id:               project.id,
        title:            project.title,
        description:      project.description,
        status:           project.status as string,
        actualStart:      project.actualStart?.toISOString() ?? null,
        actualEnd:        project.actualEnd?.toISOString() ?? null,
        expectedStart:    project.expectedStart?.toISOString() ?? null,
        expectedEnd:      project.expectedEnd?.toISOString() ?? null,
        goLiveDate:       project.goLiveDate?.toISOString() ?? null,
        goLiveActual:     project.goLiveActual?.toISOString() ?? null,
        budget:           project.budget,
        economy:          project.economy,
        scope:            project.scope,
        sponsor:          project.sponsor?.name ?? null,
        sponsorDept:      project.sponsor?.department ?? null,
        tasksDone,
        tasksTotal,
      }}
      members={members}
      projectParticipants={projectParticipants}
      allUsers={allUsers}
      wbsAreas={wbsAreas}
      risks={risks}
      meetings={meetings}
      lessons={lessons}
    />
  )
}
