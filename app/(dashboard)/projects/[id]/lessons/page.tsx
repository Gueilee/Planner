import { auth } from "@/auth"
import { db } from "@/lib/db"
import { notFound, redirect } from "next/navigation"
import { getProjectLessons } from "@/lib/actions/lessons"
import { LessonsClient } from "./lessons-client"

export const metadata = { title: "Lições Aprendidas" }

export default async function LessonsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) redirect("/login")

  const [project, members, lessons] = await Promise.all([
    db.project.findUnique({
      where: { id },
      select: { id: true, title: true, status: true },
    }),
    db.projectMember.findMany({
      where: { projectId: id },
      include: { user: { select: { id: true, name: true } } },
    }),
    getProjectLessons(id),
  ])

  if (!project) notFound()

  return (
    <LessonsClient
      project={{ id: project.id, title: project.title, status: project.status }}
      members={members.map((m) => ({ id: m.user.id, name: m.user.name }))}
      initialLessons={lessons}
    />
  )
}
