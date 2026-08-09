import { db } from "@/lib/db"
import { requireScreenView } from "@/lib/permissions-guard"
import { getAllLessons, getKnowledgeStats } from "@/lib/actions/lessons"
import { KnowledgeClient } from "./knowledge-client"

export const metadata = { title: "Base de Conhecimento" }

export default async function KnowledgePage() {
  const { session } = await requireScreenView("knowledge_base")

  const [lessons, stats, projects] = await Promise.all([
    getAllLessons(),
    getKnowledgeStats(),
    db.project.findMany({
      where: { organizationId: session.user.organizationId },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    }),
  ])

  return <KnowledgeClient lessons={lessons} stats={stats} projects={projects} />
}
