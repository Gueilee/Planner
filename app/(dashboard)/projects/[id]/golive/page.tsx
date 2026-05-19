import { auth } from "@/auth"
import { db } from "@/lib/db"
import { notFound, redirect } from "next/navigation"
import { GoLiveClient } from "./golive-client"

export const metadata = { title: "GO LIVE" }

export default async function GoLivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) redirect("/login")

  const [project, memberships] = await Promise.all([
    db.project.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        status: true,
        goLiveDate: true,
        postGoLiveEndDate: true,
      },
    }),
    db.projectMember.findMany({
      where: { projectId: id },
      include: { user: { select: { id: true, name: true, department: true } } },
    }),
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
      members={memberships.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        department: m.user.department,
      }))}
    />
  )
}
