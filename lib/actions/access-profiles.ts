"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"

export type FeaturePermission = { canView: boolean; canEdit: boolean }
export type PermissionsMap    = Record<string, FeaturePermission>

export type ProfileRow = {
  id:             string
  name:           string
  description:    string | null
  color:          string
  isSystem:       boolean
  permissions:    PermissionsMap
  organizationId: string
  createdAt:      Date
  _count:         { users: number }
}

type RawProfile = {
  id:             string
  name:           string
  description:    string | null
  color:          string
  isSystem:       boolean
  organizationId: string
  createdAt:      Date
  permissions:    string
  _count:         { users: number }
}

function parse(p: RawProfile): ProfileRow {
  return { ...p, permissions: JSON.parse(p.permissions || "{}") as PermissionsMap }
}

export async function listAccessProfiles(): Promise<ProfileRow[]> {
  const session = await auth()
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Não autorizado")

  const rows = await db.accessProfile.findMany({
    where:   { organizationId: session.user.organizationId },
    include: { _count: { select: { users: true } } },
    orderBy: { createdAt: "asc" },
  })
  return rows.map(parse)
}

export async function createAccessProfile(data: {
  name:        string
  description: string
  color:       string
  permissions: PermissionsMap
}): Promise<ProfileRow> {
  const session = await auth()
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Não autorizado")
  if (!data.name.trim()) throw new Error("Nome é obrigatório")

  const row = await db.accessProfile.create({
    data: {
      name:           data.name.trim(),
      description:    data.description.trim() || null,
      color:          data.color,
      permissions:    JSON.stringify(data.permissions),
      organizationId: session.user.organizationId,
    },
    include: { _count: { select: { users: true } } },
  })
  revalidatePath("/settings")
  return parse(row)
}

export async function updateAccessProfile(id: string, data: {
  name?:        string
  description?: string
  color?:       string
  permissions?: PermissionsMap
}): Promise<void> {
  const session = await auth()
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Não autorizado")

  await db.accessProfile.update({
    where: { id },
    data: {
      ...(data.name        !== undefined && { name:        data.name.trim() }),
      ...(data.description !== undefined && { description: data.description?.trim() || null }),
      ...(data.color       !== undefined && { color:       data.color }),
      ...(data.permissions !== undefined && { permissions: JSON.stringify(data.permissions) }),
    },
  })
  revalidatePath("/settings")
}

export async function deleteAccessProfile(id: string): Promise<{ success: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user || session.user.role !== "ADMIN") return { success: false, error: "Não autorizado" }

  const profile = await db.accessProfile.findFirst({
    where: { id, organizationId: session.user.organizationId },
  })
  if (!profile)          return { success: false, error: "Perfil não encontrado" }
  if (profile.isSystem)  return { success: false, error: "Este perfil do sistema não pode ser excluído" }

  await db.accessProfile.delete({ where: { id } })
  revalidatePath("/settings")
  return { success: true }
}
