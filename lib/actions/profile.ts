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

// Admin de filial só vê a própria filial; admin global (isGlobalAdmin) vê
// todo mundo, de todas as filiais — usado tanto pelo painel de usuários
// (Configurações → Usuários) quanto pelo seletor "editar perfil de outro
// usuário" já existente na aba Meu Perfil.
export async function getAllUsers() {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")
  if (session.user.role !== "ADMIN") throw new Error("Acesso restrito a administradores")
  return db.user.findMany({
    where:   session.user.isGlobalAdmin ? {} : { organizationId: session.user.organizationId },
    orderBy: [{ organization: { name: "asc" } }, { name: "asc" }],
    select:  {
      id: true, name: true, email: true, department: true, phone: true, image: true, role: true, active: true,
      profileId: true,
      accessProfile: { select: { id: true, name: true, color: true } },
      organizationId: true,
      organization: { select: { name: true } },
    },
  })
}

// Confere se quem está chamando pode gerenciar ESTE usuário: admin global
// pode qualquer um; admin comum só quem é da própria filial. Lança erro
// (não retorna boolean) porque toda função abaixo já segue esse padrão de
// interromper a operação — mais simples que cada uma repetir o if/throw.
async function assertCanManageUser(sessionUser: { isGlobalAdmin: boolean; organizationId: string }, targetUserId: string) {
  if (sessionUser.isGlobalAdmin) return
  const target = await db.user.findUnique({ where: { id: targetUserId }, select: { organizationId: true } })
  if (!target || target.organizationId !== sessionUser.organizationId) {
    throw new Error("Você só pode gerenciar usuários da sua própria filial")
  }
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

export type UpdateUserResult =
  | { success: true;  user: NonNullable<Awaited<ReturnType<typeof updateUserRow>>> }
  | { success: false; error: string }

async function updateUserRow(userId: string, data: Record<string, unknown>) {
  return db.user.update({
    where: { id: userId },
    data,
    select: {
      id: true, name: true, email: true, phone: true, image: true, department: true, role: true, active: true,
      profileId: true,
      accessProfile: { select: { id: true, name: true, color: true } },
      organizationId: true,
      organization: { select: { name: true } },
    },
  })
}

// Next.js redige a mensagem de qualquer erro lançado (throw) de uma Server Action em
// produção, mostrando só um texto genérico ao usuário — por isso essas validações
// esperadas (e-mail duplicado, campo obrigatório etc.) retornam {success:false,error}
// em vez de lançar exceção, pra mensagem real chegar até a tela.
export async function updateUserById(
  userId: string,
  data: ProfileInput & { role?: string; active?: boolean; profileId?: string | null; organizationId?: string }
): Promise<UpdateUserResult> {
  const session = await auth()
  if (!session?.user) return { success: false, error: "Não autorizado" }
  if (session.user.role !== "ADMIN") return { success: false, error: "Acesso restrito a administradores" }

  try {
    await assertCanManageUser(session.user, userId)
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Não autorizado" }
  }

  // Só admin global pode mover a filial principal de alguém — admin comum
  // não administra outra filial pra mandar alguém pra lá.
  if (data.organizationId !== undefined && !session.user.isGlobalAdmin) {
    return { success: false, error: "Só um admin global pode trocar a filial principal de um usuário" }
  }

  // Um perfil de acesso é sempre de UMA filial (AccessProfile.organizationId)
  // — sem essa checagem, dava pra atribuir o perfil de uma filial pra
  // usuário de outra sem nenhum aviso.
  if (data.profileId) {
    const targetOrgId = data.organizationId ?? (await db.user.findUnique({ where: { id: userId }, select: { organizationId: true } }))?.organizationId
    const profile = await db.accessProfile.findUnique({ where: { id: data.profileId }, select: { organizationId: true } })
    if (!profile || profile.organizationId !== targetOrgId) {
      return { success: false, error: "Este perfil de acesso não pertence à filial deste usuário" }
    }
  }

  const newEmail = data.email?.trim().toLowerCase()

  // Check email uniqueness before attempting the update
  if (newEmail) {
    const conflict = await db.user.findFirst({
      where: { email: { equals: newEmail }, NOT: { id: userId } },
      select: { id: true },
    })
    if (conflict) return { success: false, error: "Já existe outro usuário com este e-mail. Verifique os cadastros duplicados." }
  }

  try {
    const updated = await updateUserRow(userId, {
      name:       data.name.trim(),
      department: data.department.trim() || null,
      phone:      data.phone.trim()      || null,
      image:      data.image             || null,
      ...(newEmail                       && { email: newEmail }),
      ...(data.role      !== undefined   && { role:  data.role   as never }),
      ...(data.active     !== undefined  && { active: data.active }),
      ...(data.profileId !== undefined   && { profileId: data.profileId }),
      ...(data.organizationId !== undefined && { organizationId: data.organizationId }),
    })

    // Revalidate only after a confirmed successful update
    revalidatePath("/settings")
    return { success: true, user: updated }
  } catch (err: unknown) {
    // Prisma P2002 = unique constraint violation (email collision at DB level)
    const msg = err instanceof Error ? err.message : ""
    if (msg.includes("P2002") || msg.includes("Unique constraint")) {
      return { success: false, error: "Já existe outro usuário com este e-mail. Verifique os cadastros duplicados." }
    }
    return { success: false, error: "Erro ao salvar as alterações. Tente novamente." }
  }
}

// ─── Admin: create new user ───────────────────────────────────────────────────

export type CreateUserResult =
  | { success: true;  user: NonNullable<Awaited<ReturnType<typeof updateUserRow>>> }
  | { success: false; error: string }

export async function createUser(data: {
  name:         string
  email?:       string
  password:     string
  role:         string
  department?:  string
  phone?:       string
  extraOrgIds?: string[]
  profileId?:   string | null
  /** Só respeitado se quem chama for admin global — senão, sempre a própria filial. */
  organizationId?: string
}): Promise<CreateUserResult> {
  const session = await auth()
  if (!session?.user) return { success: false, error: "Não autorizado" }
  if (session.user.role !== "ADMIN") return { success: false, error: "Acesso restrito a administradores" }

  if (!data.name.trim())        return { success: false, error: "Nome é obrigatório" }
  const typedEmail = data.email?.trim().toLowerCase()
  if (!typedEmail && data.role !== "CLIENT") return { success: false, error: "E-mail é obrigatório" }
  if (data.password.length < 6) return { success: false, error: "Senha deve ter no mínimo 6 caracteres" }

  const targetOrgId = session.user.isGlobalAdmin && data.organizationId ? data.organizationId : session.user.organizationId

  if (data.profileId) {
    const profile = await db.accessProfile.findUnique({ where: { id: data.profileId }, select: { organizationId: true } })
    if (!profile || profile.organizationId !== targetOrgId) {
      return { success: false, error: "Este perfil de acesso não pertence à filial escolhida" }
    }
  }

  // Cliente (usuário terceiro) pode não ter e-mail ainda — gera um
  // sintético "@ext.planner", mesmo padrão já usado para convidados
  // externos de Kick-off (lib/actions/kickoff.ts::syncExternalAttendees) e
  // já reconhecido como "sem e-mail definido" na listagem (isSynthetic em
  // users-tab.tsx/users-client.tsx).
  const slug  = data.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30).replace(/-$/, "")
  const email = typedEmail || `ext-${slug}-${crypto.randomUUID().slice(0, 8)}@ext.planner`

  const exists = await db.user.findUnique({ where: { email } })
  if (exists) return { success: false, error: "Já existe um usuário com este e-mail" }

  const hash = await bcrypt.hash(data.password, 10)
  const user = await db.user.create({
    data: {
      name:           data.name.trim(),
      email,
      password:       hash,
      role:           data.role as never,
      department:     data.department?.trim() || null,
      phone:          data.phone?.trim()      || null,
      active:         true,
      organizationId: targetOrgId,
      profileId:      data.profileId || null,
    },
    select: {
      id: true, name: true, email: true, department: true, phone: true, image: true, role: true, active: true,
      profileId: true,
      accessProfile: { select: { id: true, name: true, color: true } },
      organizationId: true,
      organization: { select: { name: true } },
    },
  })

  if (data.extraOrgIds?.length) {
    await db.userOrganizationAccess.createMany({
      data: data.extraOrgIds.map((organizationId) => ({ userId: user.id, organizationId })),
    })
  }

  revalidatePath("/settings")
  return { success: true, user }
}

// ─── Admin: toggle active ─────────────────────────────────────────────────────

export async function toggleUserActive(userId: string, active: boolean) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")
  if (session.user.role !== "ADMIN") throw new Error("Acesso restrito a administradores")
  if (userId === session.user.id && !active) throw new Error("Você não pode desativar sua própria conta")
  await assertCanManageUser(session.user, userId)

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
    await assertCanManageUser(session.user, userId)
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : "Não autorizado" }
  }

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
  await assertCanManageUser(session.user, userId)

  const hash = await bcrypt.hash(newPassword, 10)
  await db.user.update({ where: { id: userId }, data: { password: hash } })
  return { success: true }
}

// ─── Admin: vincular vários usuários já cadastrados a um perfil de uma vez ────

export async function bulkAssignProfile(userIds: string[], profileId: string | null) {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")
  if (session.user.role !== "ADMIN") throw new Error("Acesso restrito a administradores")
  if (userIds.length === 0) return { success: true, count: 0 }

  const result = await db.user.updateMany({
    where: { id: { in: userIds }, organizationId: session.user.organizationId },
    data:  { profileId },
  })

  revalidatePath("/settings")
  return { success: true, count: result.count }
}
