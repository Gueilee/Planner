"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import bcrypt from "bcryptjs"

export type ProfileInput = {
  name:       string
  department: string
  phone:      string
  image:      string | null
  email?:     string
}

// ─── Get any user's profile (admin) or own profile ───────────────────────────

export async function getMyProfile() {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")
  return db.user.findUnique({
    where:  { id: session.user.id },
    select: { id: true, name: true, email: true, department: true, phone: true, image: true, role: true, active: true, createdAt: true },
  })
}

export async function getAllUsers() {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")
  if (session.user.role !== "ADMIN") throw new Error("Acesso restrito a administradores")
  return db.user.findMany({
    orderBy: { name: "asc" },
    select:  { id: true, name: true, email: true, department: true, phone: true, image: true, role: true, active: true },
  })
}

// ─── Update own profile ───────────────────────────────────────────────────────

export async function updateProfile(data: ProfileInput) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const updated = await db.user.update({
    where: { id: session.user.id },
    data: {
      name:       data.name.trim(),
      department: data.department.trim() || null,
      phone:      data.phone.trim()      || null,
      image:      data.image             || null,
    },
    select: { id: true, name: true, image: true, department: true },
  })

  revalidatePath("/settings")
  return updated
}

// ─── Admin: update any user's profile ────────────────────────────────────────

export async function updateUserById(userId: string, data: ProfileInput & { role?: string; active?: boolean }) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")
  if (session.user.role !== "ADMIN") throw new Error("Acesso restrito a administradores")

  const newEmail = data.email?.trim().toLowerCase()

  // Check email uniqueness before attempting the update
  if (newEmail) {
    const conflict = await db.user.findFirst({
      where: { email: { equals: newEmail }, NOT: { id: userId } },
      select: { id: true },
    })
    if (conflict) throw new Error("Já existe outro usuário com este e-mail. Verifique os cadastros duplicados.")
  }

  try {
    const updated = await db.user.update({
      where: { id: userId },
      data: {
        name:       data.name.trim(),
        department: data.department.trim() || null,
        phone:      data.phone.trim()      || null,
        image:      data.image             || null,
        ...(newEmail                       && { email: newEmail }),
        ...(data.role   !== undefined      && { role:  data.role   as never }),
        ...(data.active !== undefined      && { active: data.active }),
      },
      select: { id: true, name: true, email: true, image: true, department: true, role: true, active: true },
    })

    // Revalidate only after a confirmed successful update
    revalidatePath("/settings")
    return updated
  } catch (err: unknown) {
    // Prisma P2002 = unique constraint violation (email collision at DB level)
    const msg = err instanceof Error ? err.message : ""
    if (msg.includes("P2002") || msg.includes("Unique constraint")) {
      throw new Error("Já existe outro usuário com este e-mail. Verifique os cadastros duplicados.")
    }
    throw new Error("Erro ao salvar as alterações. Tente novamente.")
  }
}

// ─── Admin: create new user ───────────────────────────────────────────────────

export async function createUser(data: {
  name:        string
  email:       string
  password:    string
  role:        string
  department?: string
  phone?:      string
}) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")
  if (session.user.role !== "ADMIN") throw new Error("Acesso restrito a administradores")

  if (!data.name.trim())     throw new Error("Nome é obrigatório")
  if (!data.email.trim())    throw new Error("E-mail é obrigatório")
  if (data.password.length < 6) throw new Error("Senha deve ter no mínimo 6 caracteres")

  const exists = await db.user.findUnique({ where: { email: data.email.trim().toLowerCase() } })
  if (exists) throw new Error("Já existe um usuário com este e-mail")

  const hash = await bcrypt.hash(data.password, 10)
  const user = await db.user.create({
    data: {
      name:       data.name.trim(),
      email:      data.email.trim().toLowerCase(),
      password:   hash,
      role:       data.role as never,
      department: data.department?.trim() || null,
      phone:      data.phone?.trim()      || null,
      active:     true,
    },
    select: { id: true, name: true, email: true, department: true, phone: true, image: true, role: true, active: true },
  })

  revalidatePath("/settings")
  return user
}

// ─── Admin: toggle active ─────────────────────────────────────────────────────

export async function toggleUserActive(userId: string, active: boolean) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")
  if (session.user.role !== "ADMIN") throw new Error("Acesso restrito a administradores")
  if (userId === session.user.id && !active) throw new Error("Você não pode desativar sua própria conta")

  await db.user.update({ where: { id: userId }, data: { active } })
  revalidatePath("/settings")
  return { success: true }
}

// ─── Admin: delete user ───────────────────────────────────────────────────────

export async function deleteUser(userId: string): Promise<{ success: true } | { error: string }> {
  const session = await auth()
  if (!session?.user)                    return { error: "Não autorizado" }
  if (session.user.role !== "ADMIN")     return { error: "Acesso restrito a administradores" }
  if (userId === session.user.id)        return { error: "Você não pode excluir sua própria conta" }

  try {
    await db.user.delete({ where: { id: userId } })
    return { success: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (
      msg.includes("P2003") ||
      msg.toLowerCase().includes("foreign key") ||
      msg.toLowerCase().includes("constraint")
    ) {
      return { error: "FK_CONSTRAINT: Este usuário possui projetos ou tarefas vinculadas. Desative-o em vez de excluir." }
    }
    return { error: "Erro ao excluir usuário. Tente novamente." }
  }
}

// ─── Change password ──────────────────────────────────────────────────────────

export async function changePassword(currentPassword: string, newPassword: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")

  const user = await db.user.findUnique({
    where:  { id: session.user.id },
    select: { password: true },
  })
  if (!user) throw new Error("Usuário não encontrado")

  const match = await bcrypt.compare(currentPassword, user.password)
  if (!match) throw new Error("Senha atual incorreta")

  if (newPassword.length < 6) throw new Error("Nova senha deve ter no mínimo 6 caracteres")

  const hash = await bcrypt.hash(newPassword, 10)
  await db.user.update({ where: { id: session.user.id }, data: { password: hash } })
  return { success: true }
}

// ─── Admin: reset any user's password ────────────────────────────────────────

export async function resetUserPassword(userId: string, newPassword: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")
  if (session.user.role !== "ADMIN") throw new Error("Acesso restrito a administradores")
  if (newPassword.length < 6) throw new Error("Senha deve ter no mínimo 6 caracteres")

  const hash = await bcrypt.hash(newPassword, 10)
  await db.user.update({ where: { id: userId }, data: { password: hash } })
  return { success: true }
}
