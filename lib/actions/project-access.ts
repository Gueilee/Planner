"use server"

// Checagem central de "essa pessoa pode acessar ESTE projeto?" — faltava um
// equivalente disto pra projeto (o de usuário já existia, ver
// assertCanManageUser em lib/actions/profile.ts). Sem isso, dezenas de
// páginas e server actions só checavam "tem sessão?" e nunca "o projeto é
// da filial dela?" — auditoria encontrou 14 sub-telas de projeto e ~9
// server actions (cronograma inteiro, indicadores, curva S, atas,
// benefícios, excluir/editar projeto, link público) que vazavam ou
// permitiam mexer em projeto de QUALQUER filial pra qualquer usuário
// autenticado, bastando saber/adivinhar o ID.
//
// Regra: admin global sempre pode; senão, o projeto precisa ser da filial
// principal da pessoa OU ela ter acesso extra concedido (mesma tabela
// UserOrganizationAccess que já valida a troca de filial em auth.ts).

import { db } from "@/lib/db"
import { auth } from "@/auth"
import type { Session } from "next-auth"

export async function canAccessOrg(session: Session, organizationId: string): Promise<boolean> {
  if (session.user.isGlobalAdmin) return true
  if (session.user.organizationId === organizationId) return true
  const extra = await db.userOrganizationAccess.findUnique({
    where: { userId_organizationId: { userId: session.user.id, organizationId } },
    select: { id: true },
  })
  return !!extra
}

// Pra Server Components (páginas): já resolve a sessão e devolve se pode
// acessar aquela filial — a página decide o que fazer (normalmente
// notFound()) quando vier false. Não lança erro (páginas não devem
// derrubar pra tela de erro genérica por causa disto — melhor um 404, que
// nem confirma se o ID existe).
export async function getSessionAndCheckOrg(organizationId: string | null | undefined): Promise<{ session: Session | null; allowed: boolean }> {
  const session = await auth()
  if (!session?.user) return { session: null, allowed: false }
  if (!organizationId) return { session, allowed: false }
  return { session, allowed: await canAccessOrg(session, organizationId) }
}

// Pra Server Actions que recebem projectId: busca só a organizationId dele
// (consulta leve) e confere. Lança erro — é o padrão que as actions deste
// projeto já usam (ver requireAccess em lib/actions/schedule-v2.ts).
export async function assertProjectAccess(projectId: string): Promise<Session> {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const project = await db.project.findUnique({ where: { id: projectId }, select: { organizationId: true } })
  if (!project) throw new Error("Projeto não encontrado")

  if (!(await canAccessOrg(session, project.organizationId))) {
    throw new Error("Você não tem acesso a este projeto")
  }
  return session
}
