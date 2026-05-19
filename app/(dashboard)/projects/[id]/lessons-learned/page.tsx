import { redirect } from "next/navigation"

export const metadata = { title: "Lições Aprendidas" }

export default async function LessonsLearnedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/projects/${id}/lessons`)
}
