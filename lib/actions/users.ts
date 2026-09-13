"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import bcrypt from "bcryptjs"
import type { UserRole } from "@/lib/generated/prisma/enums"

export type UserRow = {
  id: string
  name: string
  email: string
  department: string | null
  role: UserRole
  phone: string | null
  active: boolean
  image: string | null
  createdAt: string
}

export async function listUsers(): Promise<UserRow[]> {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const users = await db.user.findMany({
    where: { organizationId: session.user.organizationId },
    select: {
      id: true,
      name: true,
      email: true,
      department: true,
      role: true,
      phone: true,
      active: true,
      image: true,
      createdAt: true,
    },
    orderBy: { name: "asc" },
  })

  return users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() }))
}

export async function createUser(data: {
  name: string
  email?: string
  department?: string | null
  role: UserRole
  phone?: string | null
}): Promise<UserRow> {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const typedEmail = data.email?.trim().toLowerCase()
  if (!typedEmail && data.role !== "CLIENT") throw new Error("E-mail é obrigatório")

  // Cliente (usuário terceiro) pode não ter e-mail ainda — gera um
  // sintético "@ext.planner", mesmo padrão já usado para convidados
  // externos de Kick-off (lib/actions/kickoff.ts::syncExternalAttendees)
  // e já reconhecido como "sem e-mail definido" na listagem (isSynthetic
  // em users-client.tsx, sem precisar de um segundo domínio sintético).
  const slug  = data.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30).replace(/-$/, "")
  const email = typedEmail || `ext-${slug}-${crypto.randomUUID().slice(0, 8)}@ext.planner`

  const existing = await db.user.findUnique({ where: { email } })
  if (existing) throw new Error("Já existe um usuário com este e-mail")

  const hash = await bcrypt.hash(crypto.randomUUID(), 10)

  const user = await db.user.create({
    data: {
      name: data.name.trim(),
      email,
      department: data.department?.trim() || null,
      role: data.role,
      phone: data.phone?.trim() || null,
      password: hash,
      active: true,
      organizationId: session.user.organizationId,
    },
    select: {
      id: true, name: true, email: true, department: true,
      role: true, phone: true, active: true, image: true, createdAt: true,
    },
  })

  revalidatePath("/users")
  return { ...user, createdAt: user.createdAt.toISOString() }
}

export async function updateUser(
  id: string,
  data: {
    name: string
    email?: string
    department: string | null
    role: UserRole
    phone: string | null
  }
): Promise<UserRow> {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const typedEmail = data.email?.trim().toLowerCase()
  if (!typedEmail && data.role !== "CLIENT") throw new Error("E-mail é obrigatório")

  // Deixou em branco (Cliente sem e-mail ainda) — mantém o sintético atual
  // se já houver um, ou gera um novo (mesmo padrão de createUser).
  const current = await db.user.findUnique({ where: { id }, select: { email: true } })
  const isSynthetic = current?.email.includes("@ext.planner")
  const slug = data.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30).replace(/-$/, "")
  const email = typedEmail || (isSynthetic ? current!.email : `ext-${slug}-${crypto.randomUUID().slice(0, 8)}@ext.planner`)

  const conflict = await db.user.findFirst({ where: { email, NOT: { id } } })
  if (conflict) throw new Error("Já existe outro usuário com este e-mail")

  const user = await db.user.update({
    where: { id },
    data: {
      name: data.name.trim(),
      email,
      department: data.department?.trim() || null,
      role: data.role,
      phone: data.phone?.trim() || null,
    },
    select: {
      id: true, name: true, email: true, department: true,
      role: true, phone: true, active: true, image: true, createdAt: true,
    },
  })

  revalidatePath("/users")
  revalidatePath("/projects")
  return { ...user, createdAt: user.createdAt.toISOString() }
}

export async function toggleUserActive(id: string): Promise<{ active: boolean }> {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const current = await db.user.findUnique({ where: { id }, select: { active: true } })
  if (!current) throw new Error("Usuário não encontrado")

  await db.user.update({ where: { id }, data: { active: !current.active } })

  revalidatePath("/users")
  return { active: !current.active }
}
