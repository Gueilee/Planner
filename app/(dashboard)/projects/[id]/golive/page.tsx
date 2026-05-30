import { auth } from "@/auth"
import { db } from "@/lib/db"
import { notFound, redirect } from "next/navigation"
import { getProjectParticipants, getAllActiveUsers } from "@/lib/actions/meeting-participants"
import { GoLiveClient } from "./golive-client"

export const metadata = { title: "GO LIVE" }

export default async function GoLivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) redirect("/login")

  const [project, projectParticipants, allUsers] = await Promise.all([
    db.project.findUnique({
      where: { id },
      select: { id: true, title: true, status: true, goLiveDate: true, postGoLiveEndDate: true },
    }),
    getProjectParticipants(id),
    getAllActiveUsers(),
  ])

  if (!project) notFound()

  return (
    <GoLiveClient
      project={{
        id: project.id,
        title: project.title,
        status: project.status,
        goLiveDate: project.goLiveDate?.toISOString() ?? null,
        postGoLiveEndDate: project.postGoLiveEndDate?.toISOString() ?? null,
      }}
      projectParticipants={projectParticipants}
      allUsers={allUsers}
    />
  )
}
