import { auth } from "@/auth"
import { redirect, notFound } from "next/navigation"
import { db } from "@/lib/db"
import { getKickOffPresentation } from "@/lib/actions/kickoff-presentation"
import { KOViewerClient } from "./viewer-client"

export const metadata = { title: "Apresentação de Kick-Off" }

export default async function KickOffViewerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) redirect("/login")

  const [presentation, project, orgConfig] = await Promise.all([
    getKickOffPresentation(id),
    db.project.findUnique({ where: { id }, select: { organization: { select: { logoUrl: true } } } }),
    db.orgConfig.findUnique({ where: { id: "singleton" }, select: { logoUrl: true } }),
  ])
  if (!presentation) redirect(`/projects/${id}/kickoff-presentation`)

  return (
    <KOViewerClient
      presentation={presentation}
      projectId={id}
      vendemmiaLogoUrl={orgConfig?.logoUrl ?? null}
      clientLogoUrl={project?.organization?.logoUrl ?? null}
    />
  )
}
