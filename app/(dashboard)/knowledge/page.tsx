import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { getAllLessons, getKnowledgeStats } from "@/lib/actions/lessons"
import { KnowledgeClient } from "./knowledge-client"

export const metadata = { title: "Base de Conhecimento" }

export default async function KnowledgePage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const [lessons, stats, projects] = await Promise.all([
    getAllLessons(),
    getKnowledgeStats(),
    db.project.findMany({
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    }),
  ])

  return <KnowledgeClient lessons={lessons} stats={stats} projects={projects} />
}
