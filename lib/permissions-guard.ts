import { cache } from "react"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { ALL_SCREEN_KEYS } from "@/lib/constants/features"
import type { FeaturePermission, PermissionsMap } from "@/lib/actions/access-profiles"

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
