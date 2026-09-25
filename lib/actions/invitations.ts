"use server"

import { randomBytes } from "crypto"
import bcrypt from "bcryptjs"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { sendInviteEmail } from "@/lib/email"
import { UserRole } from "@/lib/generated/prisma/enums"

// ── Create invitation ────────────────────────────────────────────────────────

export async function createInvitation(data: {
  email:           string
  name:            string
  role:            UserRole
  organizationId?: string
  extraOrgIds?:    string[]
}): Promise<{ error: string } | { success: true; token: string; emailSent: boolean }> {
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

  // Admin de filial só convida pra própria filial; admin global pode
  // escolher (mesmo padrão de createUser em lib/actions/profile.ts).
  const organizationId = session.user.isGlobalAdmin && data.organizationId
    ? data.organizationId
    : session.user.organizationId

  const token     = randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  // Cria o `User` JÁ AGORA, no convite — não mais só quando a pessoa aceita
  // (definia senha) em /invite/[token]. Antes disso, quem ainda não tinha
  // clicado no link simplesmente não existia como `User`, e por isso nunca
  // aparecia na busca de "Responsável" do Cronograma (searchDirectoryUsers
  // busca em `db.user`) — travava exatamente o caso de uso pedido: alocar um
  // cliente convidado como responsável de uma atividade antes dele acessar o
  // link. Senha aleatória e descartável (mesmo padrão de
  // getOrCreateUserFromDirectory em lib/actions/directory.ts) — ninguém usa
  // pra logar; acceptInvitation troca por uma de verdade quando a pessoa
  // aceita o convite.
  const randomPassword = randomBytes(32).toString("hex")
  const passwordHash    = await bcrypt.hash(randomPassword, 10)

  await db.$transaction([
    db.invitation.create({
      data: {
        email:          data.email,
        name:           data.name,
        role:           data.role,
        token,
        expiresAt,
        organizationId,
        createdById:    session.user.id,
        extraOrgIds:    data.extraOrgIds?.length ? JSON.stringify(data.extraOrgIds) : null,
      },
    }),
    db.user.create({
      data: {
        name:           data.name,
        email:          data.email,
        password:       passwordHash,
        role:           data.role,
        organizationId,
        active:         true,
      },
    }),
  ])

  // O acesso a filiais extras precisa do id do `User` recém-criado, que só
  // existe depois do transaction acima (createMany dentro do array não
  // consegue referenciar o id gerado por outra operação do mesmo batch) —
  // resolvido separadamente, buscando o usuário pelo e-mail único.
  if (data.extraOrgIds?.length) {
    const created = await db.user.findUnique({ where: { email: data.email }, select: { id: true } })
    if (created) {
      await db.userOrganizationAccess.createMany({
        data: data.extraOrgIds.map((orgId) => ({ userId: created.id, organizationId: orgId })),
      })
    }
  }

  // O convite já está válido a partir daqui (gravado acima) — o e-mail é
  // só uma forma de ENTREGAR o link, não uma condição pra ele existir.
  // Antes, uma falha de e-mail (SMTP não configurado, por exemplo) fazia
  // a tela mostrar só um erro genérico e o link ficava preso no banco,
  // sem nenhum jeito de recuperá-lo pela UI. Agora devolvemos o token
  // sempre que o convite é criado, pra tela montar o link e a pessoa
  // poder copiar e mandar na mão (Teams, WhatsApp etc.) mesmo se o
  // e-mail não sair.
  let emailSent = false
  try {
    emailSent = await sendInviteEmail(data.email, data.name, token)
  } catch (err) {
    console.error("[invitation] Falha ao enviar e-mail (o link continua válido, pode ser copiado manualmente):", err)
  }

  return { success: true as const, token, emailSent }
}

// ── Pending invitations (listar / revogar) ──────────────────────────────────
// Cobre o caso de a pessoa fechar a tela antes de copiar o link, ou quando
// o e-mail nunca chegou e ninguém percebeu na hora — sem isso, o convite
// ficava "perdido" no banco (bloqueando inclusive um novo convite pro
// mesmo e-mail, por causa da checagem de convite pendente acima).

export type PendingInvitation = {
  id: string
  email: string
  name: string
  role: UserRole
  token: string
  expiresAt: string
  createdAt: string
  organizationName: string
}

export async function listPendingInvitations(): Promise<PendingInvitation[]> {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")
  if (session.user.role !== "ADMIN") throw new Error("Acesso restrito a administradores")

  const rows = await db.invitation.findMany({
    where: {
      usedAt: null,
      expiresAt: { gt: new Date() },
      ...(session.user.isGlobalAdmin ? {} : { organizationId: session.user.organizationId }),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, email: true, name: true, role: true, token: true, expiresAt: true, createdAt: true,
      organization: { select: { name: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id, email: r.email, name: r.name, role: r.role, token: r.token,
    expiresAt: r.expiresAt.toISOString(), createdAt: r.createdAt.toISOString(),
    organizationName: r.organization.name,
  }))
}

export async function revokeInvitation(id: string): Promise<void> {
  const session = await auth()
  if (!session?.user) throw new Error("Não autorizado")
  if (session.user.role !== "ADMIN") throw new Error("Acesso restrito a administradores")

  const inv = await db.invitation.findUnique({ where: { id }, select: { organizationId: true } })
  if (!inv) return
  if (!session.user.isGlobalAdmin && inv.organizationId !== session.user.organizationId) {
    throw new Error("Você só pode revogar convites da sua própria filial")
  }
  await db.invitation.delete({ where: { id } })
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

  // O `User` já existe desde createInvitation (senha descartável, pra já
  // aparecer em buscas de Responsável antes de aceitar) — aceitar o convite
  // troca só a senha pela que a pessoa escolheu, não cria um novo. Convites
  // já pendentes de ANTES dessa mudança (gerados sem o `User` prévio) caem
  // no `else`, que mantém o comportamento antigo (cria na hora) — sem isso,
  // um convite já enviado antes do deploy quebraria ao ser aceito.
  const existing = await db.user.findUnique({ where: { email: inv.email }, select: { id: true } })
  const hashed   = await bcrypt.hash(password, 12)

  let userId: string
  if (existing) {
    userId = existing.id
    await db.$transaction([
      db.user.update({ where: { id: existing.id }, data: { password: hashed } }),
      db.invitation.update({ where: { token }, data: { usedAt: new Date() } }),
    ])
  } else {
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
      db.invitation.update({ where: { token }, data: { usedAt: new Date() } }),
    ])
    userId = newUser.id
  }

  if (inv.extraOrgIds) {
    const orgIds = JSON.parse(inv.extraOrgIds) as string[]
    if (orgIds.length > 0) {
      await db.userOrganizationAccess.createMany({
        data: orgIds.map((organizationId) => ({ userId, organizationId })),
        skipDuplicates: true,
      })
    }
  }

  return { success: true }
}
