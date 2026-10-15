import { cache } from "react"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { ALL_SCREEN_KEYS } from "@/lib/constants/features"
import type { FeaturePermission, PermissionsMap } from "@/lib/actions/access-profiles"
import { assertProjectAccess } from "@/lib/actions/project-access"
import type { Session } from "next-auth"

type SessionUser = {
  id:        string
  role:      string
  profileId?: string | null
}

const DENIED: FeaturePermission = { canView: false, canCreate: false, canEdit: false, canDelete: false }
const GRANTED: FeaturePermission = { canView: true, canCreate: true, canEdit: true, canDelete: true }

// ADMIN sempre passa em tudo (bypass) — evita que um erro de configuração de
// perfil tranque o próprio administrador para fora do sistema.
// Usuário sem perfil vinculado fica fail-closed: nenhuma tela liberada.
export const getEffectivePermissions = cache(async (user: SessionUser | undefined | null): Promise<PermissionsMap> => {
  if (!user) return {}

  if (user.role === "ADMIN") {
    const all: PermissionsMap = {}
    for (const key of ALL_SCREEN_KEYS) all[key] = GRANTED
    return all
  }

  // Cliente só pode acessar o Kanban — auth.config.ts (middleware) já
  // bloqueia qualquer outra rota. Essa liberação não pode depender de um
  // Perfil de Acesso configurado à parte: sem isso, um Cliente sem perfil
  // vinculado cairia no fail-closed abaixo (nenhuma tela), requireScreenView
  // ("kanban") mandaria pra /dashboard, e o middleware mandaria de volta pra
  // /kanban — loop infinito de redirecionamento, login impossível.
  if (user.role === "CLIENT") return { kanban: GRANTED }

  if (!user.profileId) return {}

  const profile = await db.accessProfile.findUnique({ where: { id: user.profileId } })
  if (!profile) return {}

  try {
    return JSON.parse(profile.permissions || "{}") as PermissionsMap
  } catch {
    return {}
  }
})

export function canView(perms: PermissionsMap, screenKey: string): boolean {
  return perms[screenKey]?.canView ?? false
}

export function canCreate(perms: PermissionsMap, screenKey: string): boolean {
  return perms[screenKey]?.canCreate ?? false
}

export function canEditScreen(perms: PermissionsMap, screenKey: string): boolean {
  return perms[screenKey]?.canEdit ?? false
}

export function canDelete(perms: PermissionsMap, screenKey: string): boolean {
  return perms[screenKey]?.canDelete ?? false
}

// Guard de página: redireciona para /login sem sessão, e para /dashboard
// quando a tela pedida não está liberada no perfil do usuário.
export async function requireScreenView(screenKey: string) {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const perms = await getEffectivePermissions(session.user as SessionUser)
  if (!canView(perms, screenKey)) redirect("/dashboard")

  return { session, perms }
}

// Guard de SERVER ACTION (não de página — lança erro em vez de redirecionar,
// já que uma action não pode redirecionar o usuário). Até aqui, Ver era a
// ÚNICA permissão do Perfil de Acesso de fato checada em algum lugar —
// Criar/Editar/Excluir ficavam só guardados na matriz (Configurações ›
// Perfis de Acesso) e nenhuma mutação do sistema os consultava: um perfil
// marcado "só visualizar" no Cronograma (ou em qualquer outra tela)
// conseguia editar/criar/excluir livremente, porque a mutação em si só
// conferia acesso à FILIAL (assertProjectAccess), nunca a PERMISSÃO.
// Reportado por um usuário com perfil "só ver" editando datas/responsável
// do Cronograma à vontade — corrigido aqui: todo caller de uma mutação do
// Cronograma (lib/actions/schedule-v2.ts) e do Kanban (lib/actions/
// kanban.ts, kanban-columns.ts) agora passa por este guard antes de
// escrever qualquer coisa.
function checkAction(perms: PermissionsMap, screenKey: string, action: "create" | "edit" | "delete"): boolean {
  return action === "create" ? canCreate(perms, screenKey)
    : action === "edit"       ? canEditScreen(perms, screenKey)
    :                           canDelete(perms, screenKey)
}

function actionVerb(action: "create" | "edit" | "delete"): string {
  return action === "create" ? "criar" : action === "edit" ? "editar" : "excluir"
}

export async function requireScreenAction(
  projectId:  string,
  screenKey:  string,
  action:     "create" | "edit" | "delete",
): Promise<Session> {
  const session = await assertProjectAccess(projectId)
  const perms   = await getEffectivePermissions(session.user as SessionUser)
  if (!checkAction(perms, screenKey, action)) {
    throw new Error(`Seu perfil de acesso não permite ${actionVerb(action)} nesta tela.`)
  }
  return session
}

// Mesma checagem de Criar/Editar/Excluir, mas pra mutações que NÃO giram em
// torno de um único projeto (ex.: reordenar Priorização inteira, Modelos de
// Cronograma, Base de Conhecimento) — sem projectId não dá pra confirmar
// filial por assertProjectAccess, só sessão + perfil mesmo.
export async function requireScreenPermission(
  screenKey: string,
  action:    "create" | "edit" | "delete",
): Promise<Session> {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")
  const perms = await getEffectivePermissions(session.user as SessionUser)
  if (!checkAction(perms, screenKey, action)) {
    throw new Error(`Seu perfil de acesso não permite ${actionVerb(action)} nesta tela.`)
  }
  return session
}
