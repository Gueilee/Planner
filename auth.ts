import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { UserRole } from "@/lib/generated/prisma/enums"

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || !credentials?.password) return null

          const row = await db.user.findUnique({
            where:  { email: credentials.email as string },
            select: {
              id: true, name: true, email: true, password: true, role: true,
              department: true, image: true, active: true, organizationId: true, profileId: true,
              isGlobalAdmin: true,
            },
          })

          if (!row || !row.active) return null

          const passwordMatch = await bcrypt.compare(
            credentials.password as string,
            row.password
          )

          if (!passwordMatch) return null

          const uid = row.id
          return {
            id:             uid,
            name:           row.name,
            email:          row.email,
            role:           row.role,
            department:     row.department,
            profileId:      row.profileId,
            organizationId: row.organizationId ?? "org_vendemmia",
            isGlobalAdmin:  row.isGlobalAdmin,
            // Armazena só o path — nunca o base64 — para o JWT não estourar o cookie
            image:          row.image ? `/api/avatar/${uid}` : null,
          }
        } catch (err) {
          console.error("[auth] authorize error:", err)
          return null
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session: updateData }) {
      // First login: persist all fields
      if (user) {
        token.id             = user.id ?? token.sub ?? ""
        token.role           = (user as { role: UserRole }).role
        token.department     = (user as { department?: string | null }).department ?? null
        token.profileId      = (user as { profileId?: string | null }).profileId ?? null
        token.image          = (user as { image?: string | null }).image ?? null
        token.name           = user.name ?? null
        token.organizationId = (user as { organizationId?: string }).organizationId ?? "org_vendemmia"
        token.isGlobalAdmin  = (user as { isGlobalAdmin?: boolean }).isGlobalAdmin ?? false
      }
      if (trigger === "update" && token.id) {
        const payload = updateData as Record<string, unknown> | null
        // Troca de filial — validado contra o banco a cada troca (admin global
        // vê todas; usuário comum só as filiais que tem acesso concedido em
        // UserOrganizationAccess), não mais uma lista de e-mails fixa no código.
        if (payload?.switchToOrgId) {
          const targetOrgId = payload.switchToOrgId as string
          const isGlobalAdmin = Boolean(token.isGlobalAdmin)
          const hasAccess = isGlobalAdmin
            ? await db.organization.findUnique({ where: { id: targetOrgId }, select: { id: true } }).then((o) => !!o)
            : targetOrgId === token.organizationId ||
              await db.userOrganizationAccess.findUnique({
                where: { userId_organizationId: { userId: token.id as string, organizationId: targetOrgId } },
                select: { id: true },
              }).then((r) => !!r)
          if (hasAccess) token.organizationId = targetOrgId
        } else {
          // Regular profile refresh from DB (e.g. after avatar/name save)
          try {
            const row = await db.user.findUnique({
              where:  { id: token.id as string },
              select: { name: true, image: true, department: true },
            })
            if (row) {
              token.name       = row.name ?? token.name
              token.department = row.department ?? null
              token.image       = row.image ? `/api/avatar/${token.id}` : null
            }
          } catch { /* best effort */ }
        }
      }
      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id             = token.id as string
        session.user.role           = token.role as UserRole
        session.user.department     = token.department as string | null
        session.user.profileId      = (token.profileId as string | null) ?? null
        session.user.image          = (token.image as string | null) ?? null
        session.user.organizationId = (token.organizationId as string | null) ?? "org_vendemmia"
        session.user.isGlobalAdmin  = Boolean(token.isGlobalAdmin)
        if (token.name) session.user.name = token.name as string
      }
      return session
    },
  },
})

declare module "next-auth" {
  interface Session {
    user: {
      id:             string
      name:           string
      email:          string
      role:           UserRole
      department?:    string | null
      profileId?:     string | null
      image?:         string | null
      organizationId: string
      isGlobalAdmin:  boolean
    }
  }

  interface User {
    role:            UserRole
    department?:     string | null
    profileId?:      string | null
    organizationId?: string
    isGlobalAdmin?:  boolean
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id:              string
    role:            UserRole
    department?:     string | null
    profileId?:      string | null
    image?:          string | null
    name?:           string | null
    organizationId?: string | null
    isGlobalAdmin?:  boolean
  }
}
