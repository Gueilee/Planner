import { NextRequest, NextResponse } from "next/server"
import { getToken } from "next-auth/jwt"

const PUBLIC_ROUTES = ["/login", "/api/auth", "/invite", "/reset-password", "/reset"]

export default async function middleware(req: NextRequest) {
  const { nextUrl } = req
  const isPublic = PUBLIC_ROUTES.some((r) => nextUrl.pathname.startsWith(r))

  // NextAuth v5 changed the cookie name from "next-auth.session-token" (v4)
  // to "authjs.session-token" (v5), prefixed with "__Secure-" on HTTPS.
  const useSecure = nextUrl.protocol === "https:"
  const cookieName = `${useSecure ? "__Secure-" : ""}authjs.session-token`

  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    cookieName,
  })

  if (!token && !isPublic) {
    return NextResponse.redirect(new URL("/login", nextUrl))
  }

  if (token && nextUrl.pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", nextUrl))
  }

  // Admin-only routes
  if (token && nextUrl.pathname.startsWith("/docs") && token.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/dashboard", nextUrl))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|favicon\\.png|logo\\.png|logo_v4\\.png|login_V4\\.png|next\\.svg|vercel\\.svg).*)"],
}
