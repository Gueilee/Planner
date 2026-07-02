import type { NextAuthConfig } from "next-auth"

const PUBLIC_ROUTES = ["/login", "/api/auth", "/invite", "/reset-password", "/reset"]

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
