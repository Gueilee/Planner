"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"

export type OrgRow = {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  active: boolean
  createdAt: string
  _count: { users: number; projects: number }
}

export async function listOrganizations(): Promise<OrgRow[]> {
  const session = await auth()
  if (!session?.user?.isGlobalAdmin) throw new Error("Não autorizado")

  const orgs = await db.organization.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { users: true, projects: true } } },
  })

  return orgs.map((o) => ({ ...o, createdAt: o.createdAt.toISOString() }))
}

export async function createOrganization(data: {
  name: string
  slug: string
  logoUrl?: string | null
}): Promise<OrgRow> {
  const session = await auth()
  if (!session?.user?.isGlobalAdmin) throw new Error("Não autorizado")

  const slug = data.slug.trim().toLowerCase().replace(/\s+/g, "-")
  const existing = await db.organization.findUnique({ where: { slug } })
  if (existing) throw new Error("Já existe uma organização com este slug")

  const org = await db.organization.create({
    data: { name: data.name.trim(), slug, logoUrl: data.logoUrl?.trim() || null, active: true },
    include: { _count: { select: { users: true, projects: true } } },
  })

  revalidatePath("/organizations")
  return { ...org, createdAt: org.createdAt.toISOString() }
}

export async function updateOrganization(
  id: string,
  data: { name: string; logoUrl?: string | null }
): Promise<void> {
  const session = await auth()
  if (!session?.user?.isGlobalAdmin) throw new Error("Não autorizado")

  await db.organization.update({
    where: { id },
    data: { name: data.name.trim(), logoUrl: data.logoUrl?.trim() || null },
  })

  revalidatePath("/organizations")
}

export async function toggleOrganizationActive(id: string): Promise<{ active: boolean }> {
  const session = await auth()
  if (!session?.user?.isGlobalAdmin) throw new Error("Não autorizado")

  // Protect the default Vendemmia org
  if (id === "org_vendemmia") throw new Error("Não é possível desativar a organização principal")

  const current = await db.organization.findUnique({ where: { id }, select: { active: true } })
  if (!current) throw new Error("Organização não encontrada")

  await db.organization.update({ where: { id }, data: { active: !current.active } })

  revalidatePath("/organizations")
  return { active: !current.active }
}

// ─── Regra de risco de cronograma (por organização/filial) ────────────────────

export async function getMyRiskThreshold(): Promise<number> {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const org = await db.organization.findUnique({
    where:  { id: session.user.organizationId },
    select: { riskThresholdPct: true },
  })
  return org?.riskThresholdPct ?? 10
}

export async function updateRiskThreshold(value: number): Promise<void> {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")
  if (session.user.role !== "ADMIN") throw new Error("Acesso restrito a administradores")
  if (!Number.isFinite(value) || value < 1 || value > 100) {
    throw new Error("Informe um valor entre 1 e 100")
  }

  await db.organization.update({
    where: { id: session.user.organizationId },
    data:  { riskThresholdPct: Math.round(value) },
  })

  revalidatePath("/settings")
  revalidatePath("/analytics")
  revalidatePath("/dashboard")
  revalidatePath("/status-report")
}

// ─── User management (cross-org, admin only) ──────────────────────────────────

export type OrgUserRow = {
  id: string
  name: string
  email: string
  role: string
  department: string | null
  phone: string | null
  image: string | null
  active: boolean
  createdAt: string
}

export async function getUsersByOrg(orgId: string): Promise<OrgUserRow[]> {
  const session = await auth()
  if (!session?.user?.isGlobalAdmin) throw new Error("Não autorizado")

  const users = await db.user.findMany({
    where: { organizationId: orgId },
    select: { id: true, name: true, email: true, role: true, department: true, phone: true, image: true, active: true, createdAt: true },
    orderBy: { name: "asc" },
  })

  return users.map((u) => ({ ...u, role: u.role as string, createdAt: u.createdAt.toISOString() }))
}

// ─── Gestão Global de Usuários (todas as filiais de uma vez) ───────────────────

export type GlobalUserRow = OrgUserRow & { organizationId: string; organizationName: string }

export async function getAllUsersGlobal(): Promise<GlobalUserRow[]> {
  const session = await auth()
  if (!session?.user?.isGlobalAdmin) throw new Error("Não autorizado")

  const users = await db.user.findMany({
    select: {
      id: true, name: true, email: true, role: true, department: true, phone: true, image: true, active: true, createdAt: true,
      organizationId: true, organization: { select: { name: true } },
    },
    orderBy: [{ organization: { name: "asc" } }, { name: "asc" }],
  })

  return users.map((u) => ({
    id: u.id, name: u.name, email: u.email, role: u.role as string,
    department: u.department, phone: u.phone, image: u.image, active: u.active,
    createdAt: u.createdAt.toISOString(),
    organizationId: u.organizationId, organizationName: u.organization.name,
  }))
}

export async function updateUserAvatarInOrg(userId: string, image: string | null): Promise<void> {
  const session = await auth()
  if (!session?.user?.isGlobalAdmin) throw new Error("Não autorizado")

  await db.user.update({ where: { id: userId }, data: { image } })
  revalidatePath("/organizations")
}

export async function updateUserInOrg(
  userId: string,
  data: { name: string; email: string; role: string; department: string | null; phone: string | null }
): Promise<void> {
  const session = await auth()
  if (!session?.user?.isGlobalAdmin) throw new Error("Não autorizado")

  const email = data.email.trim().toLowerCase()
  const conflict = await db.user.findFirst({ where: { email, NOT: { id: userId } } })
  if (conflict) throw new Error("Já existe outro usuário com este e-mail")

  await db.user.update({
    where: { id: userId },
    data: {
      name:       data.name.trim(),
      email,
      role:       data.role as never,
      department: data.department?.trim() || null,
      phone:      data.phone?.trim()      || null,
    },
  })

  revalidatePath("/organizations")
}

export async function resetUserPassword(userId: string, newPassword: string): Promise<void> {
  const session = await auth()
  if (!session?.user?.isGlobalAdmin) throw new Error("Não autorizado")

  if (!newPassword || newPassword.length < 6) throw new Error("Senha deve ter no mínimo 6 caracteres")

  const bcrypt = (await import("bcryptjs")).default
  const hash = await bcrypt.hash(newPassword, 10)

  await db.user.update({ where: { id: userId }, data: { password: hash } })
}

export async function toggleUserActiveInOrg(userId: string): Promise<{ active: boolean }> {
  const session = await auth()
  if (!session?.user?.isGlobalAdmin) throw new Error("Não autorizado")

  const current = await db.user.findUnique({ where: { id: userId }, select: { active: true } })
  if (!current) throw new Error("Usuário não encontrado")

  const active = !current.active
  await db.user.update({ where: { id: userId }, data: { active } })

  revalidatePath("/organizations")
  return { active }
}

// ─── Troca de filial ────────────────────────────────────────────────────────
// Admin global (User.isGlobalAdmin) pode trocar pra qualquer filial. Usuário
// comum só pode trocar pra filiais que tem acesso concedido de verdade
// (UserOrganizationAccess, gerido em Configurações/Gestão Global de
// Usuários — ver lib/actions/user-org-access.ts). A própria filial de
// origem sempre entra na lista, mesmo sem registro em UserOrganizationAccess
// — inclusive quando é a ÚNICA filial da pessoa: antes isto devolvia []
// nesse caso (só existia pra alimentar o SELETOR de troca, que não faz
// sentido com 1 opção só), mas Header/Sidebar também usam esta mesma lista
// pra sempre MOSTRAR qual filial a pessoa está vendo agora — pedido direto:
// sem essa indicação visível, ficava fácil esquecer em qual filial se está
// depois de trocar (só aparecia dentro do menu de perfil).

export type OrgSwitchItem = { id: string; name: string; slug: string; active: boolean }

export async function getOrgsForSwitch(): Promise<OrgSwitchItem[]> {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  if (session.user.isGlobalAdmin) {
    return db.organization.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true, active: true },
    })
  }

  const access = await db.userOrganizationAccess.findMany({
    where: { userId: session.user.id },
    select: { organizationId: true },
  })
  const orgIds = [...new Set([session.user.organizationId, ...access.map((a) => a.organizationId)])]

  return db.organization.findMany({
    where:   { id: { in: orgIds } },
    orderBy: { name: "asc" },
    select:  { id: true, name: true, slug: true, active: true },
  })
}

export async function createUserInOrganization(data: {
  organizationId: string
  name: string
  email: string
  password: string
  department?: string | null
  role: string
  phone?: string | null
}): Promise<void> {
  const session = await auth()
  if (!session?.user?.isGlobalAdmin) throw new Error("Não autorizado")

  if (!data.password || data.password.length < 6)
    throw new Error("Senha deve ter no mínimo 6 caracteres")

  const bcrypt = (await import("bcryptjs")).default
  const email = data.email.trim().toLowerCase()
  const existing = await db.user.findUnique({ where: { email } })
  if (existing) throw new Error("Já existe um usuário com este e-mail")

  const hash = await bcrypt.hash(data.password, 10)

  await db.user.create({
    data: {
      name: data.name.trim(),
      email,
      department: data.department?.trim() || null,
      role: data.role as never,
      phone: data.phone?.trim() || null,
      password: hash,
      active: true,
      organizationId: data.organizationId,
    },
  })

  revalidatePath("/organizations")
}
