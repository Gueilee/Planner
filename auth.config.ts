import type { NextAuthConfig } from "next-auth"

// /public/* — links públicos permanentes (token, sem senha), ex.:
// /public/schedule/[token] (Cronograma). O token em si é a autorização;
// a rota confere isso sozinha, não depende de sessão nenhuma.
const PUBLIC_ROUTES = ["/login", "/api/auth", "/invite", "/reset-password", "/reset", "/public"]

export const authConfig: NextAuthConfig = {
  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isPublic  = PUBLIC_ROUTES.some(r => nextUrl.pathname.startsWith(r))

      if (!isPublic && !isLoggedIn) return false

      if (isLoggedIn && nextUrl.pathname === "/login")
        return Response.redirect(new URL("/dashboard", nextUrl))

      if (isLoggedIn && nextUrl.pathname.startsWith("/docs") && (auth.user as any).role !== "ADMIN")
        return Response.redirect(new URL("/dashboard", nextUrl))

      return true
    },
  },
}
