"use server"

import { randomBytes } from "crypto"
import bcrypt from "bcryptjs"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { sendPasswordResetEmail } from "@/lib/email"

// ── Self-service: user requests reset by email ───────────────────────────────

export async function requestPasswordReset(email: string) {
  const user = await db.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  })
  // Always return success to avoid email enumeration
  if (!user || !user.active) return { success: true }

  const token     = randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours

  await db.passwordResetToken.create({
    data: { userId: user.id, token, expiresAt },
  })

  try {
    await sendPasswordResetEmail(user.email, user.name, token)
  } catch (err) {
    console.error("[password-reset] Falha ao enviar e-mail:", err)
  }

  return { success: true }
}

// ── Admin: send reset email to an existing user ───────────────────────────────

export async function sendResetToUser(userId: string) {
  const session = await auth()
  if (!session?.user || session.user.role !== "ADMIN") {
    return { error: "Sem permissão" }
  }

  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user)        return { error: "Usuário não encontrado" }
  if (!user.active) return { error: "Usuário inativo" }

  const token     = randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

  await db.passwordResetToken.create({
    data: { userId: user.id, token, expiresAt },
  })

  try {
    await sendPasswordResetEmail(user.email, user.name, token)
  } catch (err) {
    console.error("[password-reset] Falha ao enviar e-mail:", err)
    return { error: "Falha ao enviar e-mail. Verifique as configurações SMTP." }
  }

  return { success: true }
}

// ── Validate token ────────────────────────────────────────────────────────────

export async function validateResetToken(token: string) {
  const record = await db.passwordResetToken.findUnique({ where: { token } })

  if (!record)                      return { error: "Link inválido ou expirado" }
  if (record.usedAt)                return { error: "Este link já foi utilizado" }
  if (record.expiresAt < new Date()) return { error: "Este link expirou" }

  const user = await db.user.findUnique({ where: { id: record.userId } })
  if (!user || !user.active) return { error: "Usuário não encontrado" }

  return { name: user.name, email: user.email }
}

// ── Reset password ────────────────────────────────────────────────────────────

export async function resetPassword(token: string, password: string) {
  if (password.length < 6) return { error: "Senha deve ter no mínimo 6 caracteres" }

  const record = await db.passwordResetToken.findUnique({ where: { token } })

  if (!record)                      return { error: "Link inválido ou expirado" }
  if (record.usedAt)                return { error: "Este link já foi utilizado" }
  if (record.expiresAt < new Date()) return { error: "Este link expirou" }

  const hashed = await bcrypt.hash(password, 12)

  await db.$transaction([
    db.user.update({
      where: { id: record.userId },
      data:  { password: hashed },
    }),
    db.passwordResetToken.update({
      where: { token },
      data:  { usedAt: new Date() },
    }),
  ])

  return { success: true }
}
