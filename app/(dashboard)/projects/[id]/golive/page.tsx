import { auth } from "@/auth"
import { db } from "@/lib/db"
import { notFound, redirect } from "next/navigation"
import { canAccessOrg } from "@/lib/actions/project-access"
import { getProjectParticipants, getAllActiveUsers } from "@/lib/actions/meeting-participants"
import { GoLiveClient } from "./golive-client"

export const metadata = { title: "GO LIVE" }

export default async function GoLivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) redirect("/login")

  // Projeto buscado ANTES do Promise.all — getAllActiveUsers precisa da
  // filial dele (pode diferir da filial ativa de quem está vendo) pra
  // incluir quem tem acesso concedido a ela.
  const project = await db.project.findUnique({
    where: { id },
    select: { id: true, title: true, status: true, goLiveDate: true, postGoLiveEndDate: true, organizationId: true },
  })
  if (!project) notFound()
  if (!(await canAccessOrg(session, project.organizationId))) notFound()

  const [projectParticipants, allUsers] = await Promise.all([
    getProjectParticipants(id),
    getAllActiveUsers(project.organizationId),
  ])

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
