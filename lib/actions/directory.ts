"use server"

// Busca de pessoas no diretório do Azure AD (Microsoft Graph) e criação/
// vínculo automático de usuário local do Kronex a partir do resultado
// escolhido — usado pelo componente PeoplePicker (components/kronex/
// people-picker.tsx) em qualquer campo que hoje só aceita nome digitado
// (ex.: Responsável de atividade no Cronograma).

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { searchAzureUsers, type AzureDirectoryUser } from "@/lib/graph/client"

async function requireAccess() {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")
  return session
}

export type DirectoryUser = AzureDirectoryUser

export async function searchDirectoryUsers(query: string): Promise<DirectoryUser[]> {
  await requireAccess()
  return searchAzureUsers(query)
}

export type LinkedUser = { id: string; name: string; email: string }

// Se já existe um usuário do Kronex com esse e-mail, devolve ele sem alterar
// nada (papel/filial de quem já existe não são tocados por aqui). Senão,
// cria um usuário novo — mesmo padrão de
// lib/actions/organizations.ts::createUserInOrganization (bcrypt, role
// default PROJECT_MEMBER, active: true), com senha aleatória que ninguém
// usa pra logar: esse cadastro existe só para a pessoa aparecer certinho em
// relatórios de alocação, filtros por responsável etc. Se um dia ela
// precisar acessar o Kronex de verdade, um admin usa "Resetar senha"
// (organizations.ts::resetUserPassword, já existe) ou o convite normal.
export async function getOrCreateUserFromDirectory(
  person: { azureId: string; name: string; email: string },
  organizationId?: string
): Promise<LinkedUser> {
  const session = await requireAccess()

  const email = person.email.trim().toLowerCase()
  if (!email) throw new Error("Usuário do Azure AD sem e-mail — não é possível vincular")

  const existing = await db.user.findUnique({ where: { email }, select: { id: true, name: true, email: true } })
  if (existing) return existing

  const targetOrgId = organizationId || session.user.organizationId
  const bcrypt = (await import("bcryptjs")).default
  // Senha aleatória e descartável — ver comentário acima; nunca é exibida
  // nem enviada a ninguém.
  const randomPassword = crypto.randomUUID() + crypto.randomUUID()
  const hash = await bcrypt.hash(randomPassword, 10)

  const created = await db.user.create({
    data: {
      name: person.name.trim(),
      email,
      password: hash,
      role: "PROJECT_MEMBER",
      active: true,
      organizationId: targetOrgId,
    },
    select: { id: true, name: true, email: true },
  })
  return created
}
