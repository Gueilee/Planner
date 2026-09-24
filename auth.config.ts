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
    // O middleware (proxy.ts) roda essa config isolada, SEM os callbacks
    // jwt/session completos de auth.ts (aquele NextAuth() é o do login/
    // server components; este aqui só decodifica o cookie pro edge). Sem
    // este `session` aqui, `auth.user` no `authorized` abaixo só tem
    // name/email/image (o padrão do NextAuth) — `role` nunca chega, e
    // qualquer checagem de role no middleware (inclusive o `/docs` que já
    // existia) nunca dispara de verdade. O token decodificado já carrega
    // `role` (gravado por auth.ts::jwt no login) — só faltava repassar.
    session({ session, token }) {
      if (token) (session.user as { role?: unknown }).role = token.role
      return session
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isPublic  = PUBLIC_ROUTES.some(r => nextUrl.pathname.startsWith(r))

      if (!isPublic && !isLoggedIn) return false

      // Perfil CLIENTE: acesso restrito ao Kanban (e só aos projetos em que
      // é responsável por alguma atividade — filtro aplicado em
      // app/(dashboard)/kanban/page.tsx). Qualquer outra rota de tela
      // redireciona pra cá, inclusive o pós-login — nunca chega a carregar
      // Projetos/Status Report/Indicadores/etc., que hoje só isolam por
      // filial, não por cliente. `/api/*` fica liberado (mesmo padrão já
      // aplicado a todo usuário logado) pra não quebrar as próprias ações
      // do Kanban.
      if (isLoggedIn && (auth.user as any).role === "CLIENT") {
        const allowed = isPublic || nextUrl.pathname.startsWith("/kanban") || nextUrl.pathname.startsWith("/api")
        if (!allowed) return Response.redirect(new URL("/kanban", nextUrl))
      }

      if (isLoggedIn && nextUrl.pathname === "/login")
        return Response.redirect(new URL(
          (auth.user as any).role === "CLIENT" ? "/kanban" : "/dashboard",
          nextUrl
        ))

      if (isLoggedIn && nextUrl.pathname.startsWith("/docs") && (auth.user as any).role !== "ADMIN")
        return Response.redirect(new URL("/dashboard", nextUrl))

      return true
    },
  },
}
