import NextAuth from "next-auth"
import { authConfig } from "@/auth.config"

export default NextAuth(authConfig).auth

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|favicon\\.png|logo\\.png|logo_v4\\.png|login_V4\\.png|next\\.svg|vercel\\.svg).*)"],
}
