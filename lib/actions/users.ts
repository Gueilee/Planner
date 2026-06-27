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
  email: string
  department?: string | null
  role: UserRole
  phone?: string | null
}): Promise<UserRow> {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const email = data.email.trim().toLowerCase()
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
    email: string
    department: string | null
    role: UserRole
    phone: string | null
  }
): Promise<UserRow> {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const email = data.email.trim().toLowerCase()
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
