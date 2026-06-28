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
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Não autorizado")

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
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Não autorizado")

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
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Não autorizado")

  await db.organization.update({
    where: { id },
    data: { name: data.name.trim(), logoUrl: data.logoUrl?.trim() || null },
  })

  revalidatePath("/organizations")
}

export async function toggleOrganizationActive(id: string): Promise<{ active: boolean }> {
  const session = await auth()
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Não autorizado")

  // Protect the default Vendemmia org
  if (id === "org_vendemmia") throw new Error("Não é possível desativar a organização principal")

  const current = await db.organization.findUnique({ where: { id }, select: { active: true } })
  if (!current) throw new Error("Organização não encontrada")

  await db.organization.update({ where: { id }, data: { active: !current.active } })

  revalidatePath("/organizations")
  return { active: !current.active }
}

export async function createUserInOrganization(data: {
  organizationId: string
  name: string
  email: string
  department?: string | null
  role: string
  phone?: string | null
}): Promise<void> {
  const session = await auth()
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Não autorizado")

  const bcrypt = (await import("bcryptjs")).default
  const email = data.email.trim().toLowerCase()
  const existing = await db.user.findUnique({ where: { email } })
  if (existing) throw new Error("Já existe um usuário com este e-mail")

  const hash = await bcrypt.hash(crypto.randomUUID(), 10)

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
