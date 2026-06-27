import { auth } from "@/auth"
import { redirect, notFound } from "next/navigation"
import { getKickOffPresentation } from "@/lib/actions/kickoff-presentation"
import { KOViewerClient } from "./viewer-client"

export const metadata = { title: "Apresentação de Kick-Off" }

export default async function KickOffViewerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) redirect("/login")

  const presentation = await getKickOffPresentation(id)
  if (!presentation) redirect(`/projects/${id}/kickoff-presentation`)

  return <KOViewerClient presentation={presentation} projectId={id} />
}
