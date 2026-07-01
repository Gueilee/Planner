"use server"

import { randomBytes } from "crypto"
import bcrypt from "bcryptjs"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { sendInviteEmail } from "@/lib/email"
import { UserRole } from "@/lib/generated/prisma/enums"

// ── Create invitation ────────────────────────────────────────────────────────

export async function createInvitation(data: {
  email:        string
  name:         string
  role:         UserRole
  extraOrgIds?: string[]
}) {
  const session = await auth()
  if (!session?.user || session.user.role !== "ADMIN") {
    return { error: "Sem permissão" }
  }

  // Check if user already exists
  const existing = await db.user.findUnique({ where: { email: data.email } })
  if (existing) return { error: "Já existe um usuário com este e-mail" }

  // Check for pending invitation
  const pending = await db.invitation.findFirst({
    where: { email: data.email, usedAt: null, expiresAt: { gt: new Date() } },
  })
  if (pending) return { error: "Já existe um convite pendente para este e-mail" }

  const token     = randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  await db.invitation.create({
    data: {
      email:          data.email,
      name:           data.name,
      role:           data.role,
      token,
      expiresAt,
      organizationId: session.user.organizationId,
      createdById:    session.user.id,
      extraOrgIds:    data.extraOrgIds?.length ? JSON.stringify(data.extraOrgIds) : null,
    },
  })

  try {
    await sendInviteEmail(data.email, data.name, token)
  } catch (err) {
    console.error("[invitation] Falha ao enviar e-mail:", err)
    return { error: "Convite criado, mas falha ao enviar e-mail. Verifique as configurações SMTP." }
  }

  return { success: true }
}

// ── Validate token ───────────────────────────────────────────────────────────

export async function validateInvitation(token: string) {

  const inv = await db.invitation.findUnique({ where: { token } })

  if (!inv)            return { error: "Convite inválido" }
  if (inv.usedAt)      return { error: "Este convite já foi utilizado" }
  if (inv.expiresAt < new Date()) return { error: "Este convite expirou" }

  return { invitation: { name: inv.name, email: inv.email, role: inv.role } }
}

// ── Accept invitation (set password) ────────────────────────────────────────

export async function acceptInvitation(token: string, password: string) {
  if (password.length < 6) return { error: "Senha deve ter no mínimo 6 caracteres" }


  const inv = await db.invitation.findUnique({ where: { token } })

  if (!inv)            return { error: "Convite inválido" }
  if (inv.usedAt)      return { error: "Este convite já foi utilizado" }
  if (inv.expiresAt < new Date()) return { error: "Este convite expirou" }

  const existing = await db.user.findUnique({ where: { email: inv.email } })
  if (existing) return { error: "Já existe um usuário com este e-mail" }

  const hashed = await bcrypt.hash(password, 12)

  const [newUser] = await db.$transaction([
    db.user.create({
      data: {
        name:           inv.name,
        email:          inv.email,
        password:       hashed,
        role:           inv.role as UserRole,
        organizationId: inv.organizationId,
        active:         true,
      },
    }),
    db.invitation.update({
      where: { token },
      data:  { usedAt: new Date() },
    }),
  ])

  if (inv.extraOrgIds) {
    const orgIds = JSON.parse(inv.extraOrgIds) as string[]
    if (orgIds.length > 0) {
      await db.userOrganizationAccess.createMany({
        data: orgIds.map((organizationId) => ({ userId: newUser.id, organizationId })),
      })
    }
  }

  return { success: true }
}
