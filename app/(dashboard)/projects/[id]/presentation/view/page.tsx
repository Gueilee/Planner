import { auth } from "@/auth"
import { redirect, notFound } from "next/navigation"
import { getPresentation } from "@/lib/actions/presentation"
import { ViewerClient } from "./viewer-client"

export const metadata = { title: "Apresentação" }

export default async function PresentationViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ id?: string }>
}) {
  const { id: projectId } = await params
  const { id: presId } = await searchParams
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (!presId) notFound()

  const presentation = await getPresentation(projectId)
  if (!presentation) notFound()

  return <ViewerClient presentation={presentation} projectId={projectId} />
}
