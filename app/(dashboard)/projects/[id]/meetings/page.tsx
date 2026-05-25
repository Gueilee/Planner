import { auth } from "@/auth"
import { db } from "@/lib/db"
import { notFound, redirect } from "next/navigation"
import { getAllMeetingsForProject } from "@/lib/actions/ata"
import { MeetingsClient } from "./meetings-client"

export const metadata = { title: "Histórico de Reuniões" }

export default async function MeetingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) redirect("/login")

  const [project, meetings] = await Promise.all([
    db.project.findUnique({
      where: { id },
      select: { id: true, title: true },
    }),
    getAllMeetingsForProject(id),
  ])

  if (!project) notFound()

  return <MeetingsClient project={project} meetings={meetings} />
}
