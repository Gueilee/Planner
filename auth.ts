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
            sql:  `SELECT id, name, email, password, role, department, image, active
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

          return {
            id:         row.id         as string,
            name:       row.name       as string,
            email:      row.email      as string,
            role:       row.role       as UserRole,
            department: row.department as string | null,
            image:      row.image      as string | null,
          }
        } catch (err) {
          console.error("[auth] authorize error:", err)
          return null
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id ?? token.sub ?? ""
        token.role = (user as { role: UserRole }).role
        token.department = (user as { department?: string | null }).department
      }
      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as UserRole
        session.user.department = token.department as string | null
      }
      return session
    },
  },
})

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      name: string
      email: string
      role: UserRole
      department?: string | null
      image?: string | null
    }
  }

  interface User {
    role: UserRole
    department?: string | null
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    role: UserRole
    department?: string | null
  }
}
