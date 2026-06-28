"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"

export type ProjectParticipant = {
  id:         string
  name:       string
  image:      string | null
  department: string | null
  badge:      string   // role/badge label
}

/**
 * Retorna todos os participantes relevantes para um projeto:
 * membros do time + responsáveis por tarefas + sponsor.
 * Deduplicado, ordenado por nome.
 */
export async function getProjectParticipants(projectId: string): Promise<ProjectParticipant[]> {
  const [memberships, tasks, project] = await Promise.all([
    db.projectMember.findMany({
      where: { projectId },
      include: {
        user: { select: { id: true, name: true, department: true, image: true } },
      },
    }),
    db.scheduleTask.findMany({
      where:  { projectId, responsibleId: { not: null } },
      select: { responsible: { select: { id: true, name: true, department: true, image: true } } },
    }),
    db.project.findUnique({
      where:  { id: projectId },
      select: { sponsor: { select: { id: true, name: true, department: true, image: true } } },
    }),
  ])

  const seen = new Map<string, ProjectParticipant>()

  // Membros do projeto (com seu cargo)
  for (const m of memberships) {
    seen.set(m.user.id, { ...m.user, badge: m.role || "Membro" })
  }

  // Responsáveis por tarefas que ainda não estão na lista
  for (const t of tasks) {
    if (t.responsible && !seen.has(t.responsible.id)) {
      seen.set(t.responsible.id, { ...t.responsible, badge: "Responsável" })
    }
  }

  // Sponsor
  if (project?.sponsor && !seen.has(project.sponsor.id)) {
    seen.set(project.sponsor.id, { ...project.sponsor, badge: "Sponsor" })
  }

  return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Retorna todos os usuários ativos do sistema (para busca/adição).
 */
export async function getAllActiveUsers(): Promise<ProjectParticipant[]> {
  const session = await auth()
  if (!session?.user) return []
  const users = await db.user.findMany({
    where:   { active: true, organizationId: session.user.organizationId },
    select:  { id: true, name: true, department: true, image: true },
    orderBy: { name: "asc" },
  })
  return users.map((u) => ({ ...u, badge: u.department ?? "" }))
}
