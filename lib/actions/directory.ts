"use server"

// Busca de pessoas pra preencher campos como Responsável de atividade —
// combina duas fontes: o diretório do Azure AD (colaboradores Vendemmia,
// via Microsoft Graph) e os usuários já cadastrados localmente no Kronex
// (ex.: contatos de CLIENTE, cadastrados manualmente em /users ou
// Configurações → Usuários, que nunca vão aparecer no Azure AD da
// Vendemmia). Usado pelo componente PeoplePicker (components/kronex/
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

export type DirectoryUser =
  | (AzureDirectoryUser & { source: "azure" })
  | { source: "local"; id: string; azureId: null; name: string; email: string; jobTitle: string | null; department: string | null }

const MIN_QUERY_LENGTH = 2
const MAX_LOCAL_RESULTS = 8

export async function searchDirectoryUsers(query: string, organizationId?: string): Promise<DirectoryUser[]> {
  const session = await requireAccess()
  const term = query.trim()
  if (term.length < MIN_QUERY_LENGTH) return []

  const targetOrgId = organizationId || session.user.organizationId

  // Azure é uma integração externa (rede, rate limit) — se falhar, ainda
  // devolve o que achar localmente, em vez de derrubar a busca inteira.
  const [azureResults, localUsers] = await Promise.all([
    searchAzureUsers(term).catch(() => [] as AzureDirectoryUser[]),
    db.user.findMany({
      where: {
        active: true,
        OR: [
          { organizationId: targetOrgId },
          { organizationAccess: { some: { organizationId: targetOrgId } } },
        ],
        AND: [
          { OR: [
            { name:  { contains: term, mode: "insensitive" } },
            { email: { contains: term, mode: "insensitive" } },
          ] },
        ],
      },
      select: { id: true, name: true, email: true, department: true },
      orderBy: { name: "asc" },
      take: MAX_LOCAL_RESULTS,
    }),
  ])

  const azureEmails = new Set(azureResults.map((u) => u.email.toLowerCase()))

  const azure: DirectoryUser[] = azureResults.map((u) => ({ ...u, source: "azure" as const }))
  // Um usuário local com o mesmo e-mail de um resultado do Azure não entra
  // duplicado — escolher a entrada do Azure já resolve pro mesmo cadastro
  // (getOrCreateUserFromDirectory casa por e-mail).
  const local: DirectoryUser[] = localUsers
    .filter((u) => !azureEmails.has(u.email.toLowerCase()))
    .map((u) => ({
      source: "local" as const,
      id: u.id,
      azureId: null,
      name: u.name,
      email: u.email,
      jobTitle: null,
      department: u.department,
    }))

  return [...azure, ...local]
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
