import { auth } from "@/auth"
import { db } from "@/lib/db"
import { notFound, redirect } from "next/navigation"
import { canAccessOrg } from "@/lib/actions/project-access"
import { getAllMeetingsForProject } from "@/lib/actions/ata"
import { MeetingsClient } from "./meetings-client"

export const metadata = { title: "Histórico de Reuniões" }

export default async function MeetingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) redirect("/login")

  const project = await db.project.findUnique({
    where: { id },
    select: { id: true, title: true, organizationId: true },
  })
  if (!project) notFound()
  if (!(await canAccessOrg(session, project.organizationId))) notFound()

  const meetings = await getAllMeetingsForProject(id)

  return <MeetingsClient project={project} meetings={meetings} />
}
