"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { signOut, useSession } from "next-auth/react"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard, FolderKanban,
  BookOpen, Settings, ChevronLeft, LogOut, Users, FileBarChart2, Star, Columns3, History, CheckCircle2, TrendingUp, FileText,
} from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ROLE_LABELS } from "@/lib/permissions"
import { UserRole } from "@/lib/generated/prisma/enums"

const NAV_ITEMS = [
  { label: "Dashboard",            href: "/dashboard",     icon: LayoutDashboard },
  { label: "Projetos",             href: "/projects",      icon: FolderKanban },
  { label: "Priorização",          href: "/priority",      icon: Star },
  { label: "Kanban",               href: "/kanban",        icon: Columns3 },
  { label: "Status Report",        href: "/status-report", icon: FileBarChart2 },
  { label: "Indicadores",          href: "/analytics",     icon: TrendingUp },
  { label: "Encerramento",         href: "/encerramento",  icon: CheckCircle2 },
  { label: "Base de Conhecimento", href: "/knowledge",     icon: BookOpen },
  { label: "Consulta de Projetos", href: "/history",       icon: History },
]
const SYSTEM_ITEMS = [
  { label: "Usuários",      href: "/users",    icon: Users },
  { label: "Configurações", href: "/settings", icon: Settings },
]

const ADMIN_ITEMS = [
  { label: "Documentos", href: "/docs", icon: FileText },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname      = usePathname()
  const { data: session } = useSession()

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname.startsWith(href)

  const initials = session?.user?.name
    ?.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase() ?? "U"

  const NavLink = ({ item }: { item: typeof NAV_ITEMS[number] }) => {
    const active = isActive(item.href)
    const Icon   = item.icon
    return (
      <Link
        href={item.href}
        title={collapsed ? item.label : undefined}
        className={cn(
          "relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group overflow-hidden",
          active
            ? "text-[#7B2FBE]"
            : "text-[#6b6880] hover:text-[#1a1625] hover:bg-[rgba(123,47,190,0.05)]"
        )}
        style={active ? {
          background: "linear-gradient(135deg, rgba(123,47,190,0.08) 0%, rgba(147,51,234,0.12) 100%)",
          border: "1px solid rgba(123,47,190,0.18)",
        } : undefined}
      >
        {/* Barra lateral esquerda no item ativo */}
        {active && (
          <span
            className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
            style={{ background: "linear-gradient(to bottom, #7B2FBE, #A855F7)" }}
          />
        )}

        <Icon className={cn(
          "shrink-0 transition-all duration-200",
          collapsed ? "w-5 h-5 mx-auto" : "w-4 h-4",
          active ? "text-[#7B2FBE]" : "text-[#9c99b0] group-hover:text-[#4a4760]"
        )} />

        {!collapsed && (
          <span className="flex-1 truncate tracking-wide">{item.label}</span>
        )}

        {active && !collapsed && (
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: "linear-gradient(135deg, #7B2FBE, #A855F7)" }}
          />
        )}
      </Link>
    )
  }

  return (
    <aside
      className={cn(
        "relative flex flex-col h-full shrink-0 transition-all duration-300 ease-in-out",
        collapsed ? "w-[72px]" : "w-[260px]"
      )}
      style={{
        background:  "#faf9f5",
        borderRight: "1px solid rgba(0,0,0,0.07)",
        boxShadow:   "4px 0 24px rgba(0,0,0,0.05)",
      }}
    >
      {/* Logo */}
      <Link
        href="/dashboard"
        className={cn(
          "relative z-10 flex items-center justify-center h-16 transition-all duration-300 hover:opacity-80",
          collapsed ? "px-0" : "px-5"
        )}
        style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}
      >
        {collapsed ? (
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm"
            style={{ background: "linear-gradient(135deg, #7B2FBE, #9333EA)" }}
          >
            <span className="text-white font-black text-sm tracking-tight">P</span>
          </div>
        ) : (
          <Image
            src="/logo_v4.png"
            alt="PLANNER"
            width={120}
            height={36}
            className="object-contain"
            priority
          />
        )}
      </Link>

      {/* Botão de colapso */}
      <button
        onClick={onToggle}
        className={cn(
          "absolute -right-3 z-20 w-6 h-6 rounded-full flex items-center justify-center",
          "border border-black/10 bg-[#faf9f5] hover:bg-white",
          "text-[#9c99b0] hover:text-[#4a4760] transition-all duration-200 shadow-sm"
        )}
        style={{ top: "4.5rem" }}
      >
        <ChevronLeft className={cn("w-3 h-3 transition-transform duration-300", collapsed && "rotate-180")} />
      </button>

      {/* Navegação */}
      <nav className="relative z-10 flex-1 px-3 py-5 space-y-0.5 overflow-y-auto">
        {!collapsed && (
          <p className="px-3 mb-3 text-[9px] font-bold uppercase tracking-[0.15em] text-[#b0adc0]">
            Menu Principal
          </p>
        )}
        {collapsed && <div className="mb-3" />}

        <div className="space-y-0.5">
          {NAV_ITEMS.map((item) => <NavLink key={item.href} item={item} />)}
        </div>

        <div className="my-4 mx-2" style={{ height: "1px", background: "rgba(0,0,0,0.06)" }} />

        {!collapsed && (
          <p className="px-3 mb-3 text-[9px] font-bold uppercase tracking-[0.15em] text-[#b0adc0]">
            Sistema
          </p>
        )}
        <div className="space-y-0.5">
          {SYSTEM_ITEMS.map((item) => <NavLink key={item.href} item={item} />)}
        </div>

        {session?.user?.role === UserRole.ADMIN && (
          <>
            <div className="my-4 mx-2" style={{ height: "1px", background: "rgba(239,68,68,0.15)" }} />

            {!collapsed && (
              <p className="px-3 mb-3 text-[9px] font-bold uppercase tracking-[0.15em] flex items-center gap-1.5"
                style={{ color: "#DC2626" }}>
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
                Administrador
              </p>
            )}

            <div className="space-y-0.5">
              {ADMIN_ITEMS.map((item) => {
                const active = isActive(item.href)
                const Icon   = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group overflow-hidden",
                      active ? "text-red-600" : "text-red-400 hover:text-red-600 hover:bg-red-50/60"
                    )}
                    style={active ? {
                      background: "linear-gradient(135deg, rgba(239,68,68,0.08) 0%, rgba(220,38,38,0.12) 100%)",
                      border: "1px solid rgba(239,68,68,0.18)",
                    } : undefined}
                  >
                    {active && (
                      <span
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full bg-red-500"
                      />
                    )}
                    <Icon className={cn(
                      "shrink-0 transition-all duration-200",
                      collapsed ? "w-5 h-5 mx-auto" : "w-4 h-4",
                    )} />
                    {!collapsed && (
                      <span className="flex-1 truncate tracking-wide">{item.label}</span>
                    )}
                    {active && !collapsed && (
                      <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-red-500" />
                    )}
                  </Link>
                )
              })}
            </div>
          </>
        )}
      </nav>

      {/* Perfil do usuário */}
      <div
        className="relative z-10 p-3"
        style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}
      >
        {collapsed ? (
          <button
            title="Sair"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full flex justify-center p-2 rounded-xl hover:bg-red-50 transition-colors group"
          >
            <Avatar className="w-8 h-8 ring-2 ring-black/05">
              <AvatarImage src={session?.user?.image ?? undefined} />
              <AvatarFallback
                className="text-white text-xs font-bold"
                style={{ background: "linear-gradient(135deg, #7B2FBE, #9333EA)" }}
              >
                {initials}
              </AvatarFallback>
            </Avatar>
          </button>
        ) : (
          <div
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl group transition-all duration-200 hover:bg-white"
            style={{
              background: "rgba(0,0,0,0.025)",
              border: "1px solid rgba(0,0,0,0.06)",
            }}
          >
            <Avatar className="w-8 h-8 shrink-0 ring-2 ring-black/05">
              <AvatarImage src={session?.user?.image ?? undefined} />
              <AvatarFallback
                className="text-white text-xs font-bold"
                style={{ background: "linear-gradient(135deg, #7B2FBE, #9333EA)" }}
              >
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#1a1625] truncate leading-tight">
                {session?.user?.name}
              </p>
              <p className="text-[10px] text-[#9c99b0] truncate leading-tight mt-0.5">
                {ROLE_LABELS[session?.user?.role as UserRole] ?? ""}
              </p>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="p-1.5 rounded-lg hover:bg-red-50 text-[#b0adc0] hover:text-red-500 transition-all duration-200 opacity-0 group-hover:opacity-100"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
