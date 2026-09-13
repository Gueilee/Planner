"use server"

// Link público (token permanente, sem senha) — pedido da Millena pro
// Cronograma ("gerar um link público/PDF"). Mesmo espírito do token de
// convite (Invitation) já usado no sistema: uma string aleatória gravada
// no Project, sem relação com sessão/login — a rota pública (app/(print)/
// public/schedule/[token]) só confia no token, adicionado a PUBLIC_ROUTES
// em auth.config.ts pra pular o middleware de autenticação.
import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { randomBytes } from "crypto"

// Mesmo padrão de geração de token já usado em lib/actions/invitations.ts.
function generateToken(): string {
  return randomBytes(32).toString("hex")
}

export async function getOrCreatePublicScheduleToken(projectId: string): Promise<string> {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const project = await db.project.findUnique({ where: { id: projectId }, select: { publicScheduleToken: true } })
  if (project?.publicScheduleToken) return project.publicScheduleToken

  const token = generateToken()
  await db.project.update({ where: { id: projectId }, data: { publicScheduleToken: token } })
  revalidatePath(`/projects/${projectId}/schedule`)
  return token
}

export async function revokePublicScheduleToken(projectId: string): Promise<void> {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")
  await db.project.update({ where: { id: projectId }, data: { publicScheduleToken: null } })
  revalidatePath(`/projects/${projectId}/schedule`)
}
