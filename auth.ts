import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { createClient } from "@libsql/client"
import bcrypt from "bcryptjs"
import { UserRole } from "@/lib/generated/prisma/enums"

function getTursoClient() {
  const rawUrl    = process.env.DATABASE_URL ?? "file:./dev.db"
  const authToken = process.env.TURSO_AUTH_TOKEN
  const url = rawUrl.startsWith("libsql://")
    ? rawUrl.replace("libsql://", "https://")
    : rawUrl
  return createClient({ url, authToken })
}

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

          const turso = getTursoClient()
          const result = await turso.execute({
            sql:  `SELECT id, name, email, password, role, department, image, active, organizationId
                   FROM "User" WHERE email = ? LIMIT 1`,
            args: [credentials.email as string],
          })
          await turso.close()

          if (result.rows.length === 0) return null

          const row = result.rows[0]
          if (!row.active) return null

          const passwordMatch = await bcrypt.compare(
            credentials.password as string,
            row.password as string
          )

          if (!passwordMatch) return null

          const uid = row.id as string
          const rawImage = row.image as string | null
          return {
            id:             uid,
            name:           row.name           as string,
            email:          row.email          as string,
            role:           row.role           as UserRole,
            department:     row.department     as string | null,
            organizationId: (row.organizationId as string | null) ?? "org_vendemmia",
            // Armazena só o path — nunca o base64 — para o JWT não estourar o cookie
            image:          rawImage ? `/api/avatar/${uid}` : null,
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
        token.image          = (user as { image?: string | null }).image ?? null
        token.name           = user.name ?? null
        token.organizationId = (user as { organizationId?: string }).organizationId ?? "org_vendemmia"
      }
      if (trigger === "update" && token.id) {
        const payload = updateData as Record<string, unknown> | null
        // Root-admin org switch — update organizationId without DB round-trip
        if (payload?.switchToOrgId && token.email === "gppereira@vendemmia.com.br") {
          token.organizationId = payload.switchToOrgId as string
        } else {
          // Regular profile refresh from DB (e.g. after avatar/name save)
          try {
            const turso = getTursoClient()
            const res = await turso.execute({
              sql:  `SELECT name, image, department FROM "User" WHERE id = ? LIMIT 1`,
              args: [token.id],
            })
            await turso.close()
            if (res.rows.length > 0) {
              const row = res.rows[0]
              token.name       = (row.name       as string | null) ?? token.name
              token.department = (row.department as string | null) ?? null
              const rawImg = row.image as string | null
              token.image  = rawImg ? `/api/avatar/${token.id}` : null
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
        session.user.image          = (token.image as string | null) ?? null
        session.user.organizationId = (token.organizationId as string | null) ?? "org_vendemmia"
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
      image?:         string | null
      organizationId: string
    }
  }

  interface User {
    role:            UserRole
    department?:     string | null
    organizationId?: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id:              string
    role:            UserRole
    department?:     string | null
    image?:          string | null
    name?:           string | null
    organizationId?: string | null
  }
}
