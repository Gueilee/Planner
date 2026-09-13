"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { format } from "date-fns"

export async function getProjectForCharter(projectId: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")
  return db.project.findUnique({
    where: { id: projectId },
    include: {
      sponsor: { select: { name: true, email: true, department: true } },
      members: {
        include: {
          user: { select: { id: true, name: true, email: true, department: true, role: true } },
        },
      },
      risks: {
        orderBy: { status: "asc" },
      },
      meetings: {
        where: { type: "GO_NO_GO" },
        orderBy: { date: "desc" },
        take: 1,
        include: {
          participants: true,
          createdBy: { select: { name: true } },
        },
      },
    },
  })
}

// Termo de Abertura vira um documento de verdade no repositório do projeto
// (Consulta de Projetos), em vez de só existir como página impressa ao
// vivo (app/(print)/charter/[id]). "Editar" = reabrir e regerar a partir
// dos dados atuais do projeto (não é um editor de texto livre) — regerar
// substitui a versão salva anterior, igual a um upsert por projeto.
export async function generateCharterDocument(projectId: string): Promise<{ id: string }> {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const project = await getProjectForCharter(projectId)
  if (!project) throw new Error("Projeto não encontrado")

  const goNoGo = project.meetings[0] ?? null
  const pm = project.members.find((m) =>
    ["PROJECT_MANAGER", "Gerente", "PM", "Gerente de Projeto"].some((r) =>
      m.role.toUpperCase().includes(r.toUpperCase()) || m.user.role === "PROJECT_MANAGER"
    )
  )
  const fmt = (d: Date | null) => (d ? format(d, "dd/MM/yyyy") : "—")

  const lines: string[] = []
  lines.push(`# Termo de Abertura — ${project.title}`)
  lines.push("")
  lines.push(`Sponsor: ${project.sponsor?.name ?? "—"}`)
  lines.push(`Gerente do Projeto: ${pm?.user.name ?? "A definir"}`)
  lines.push(`Início Previsto: ${fmt(project.expectedStart)}`)
  lines.push(`Término Previsto: ${fmt(project.expectedEnd)}`)
  if (goNoGo) lines.push(`Reunião Go/No-Go: ${fmt(goNoGo.date)}`)
  if (project.scope) { lines.push(""); lines.push("## Escopo"); lines.push(project.scope) }
  if (project.justification) { lines.push(""); lines.push("## Justificativa"); lines.push(project.justification) }
  if (project.assumptions) { lines.push(""); lines.push("## Premissas"); lines.push(project.assumptions) }
  if (project.restrictions) { lines.push(""); lines.push("## Restrições"); lines.push(project.restrictions) }
  if (project.risks.length > 0) {
    lines.push("")
    lines.push("## Riscos identificados")
    for (const r of project.risks) lines.push(`- ${r.description} (grau ${r.riskGrade})`)
  }

  const content = lines.join("\n")
  const title = `Termo de Abertura — ${project.title}`

  const existing = await db.projectDocument.findFirst({ where: { projectId, type: "PROJECT_OPENING" } })
  const doc = existing
    ? await db.projectDocument.update({
        where: { id: existing.id },
        data: { title, content, version: { increment: 1 } },
      })
    : await db.projectDocument.create({
        data: { projectId, type: "PROJECT_OPENING", title, content, createdById: session.user.id! },
      })

  revalidatePath("/history")
  revalidatePath(`/projects/${projectId}`)
  return { id: doc.id }
}
