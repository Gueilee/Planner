"use client"

import { useSession, signOut } from "next-auth/react"
import { Bell, Search, Plus, ChevronDown, Settings, LogOut, FolderKanban } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useRouter } from "next/navigation"
import { ROLE_LABELS } from "@/lib/permissions"
import { UserRole } from "@/lib/generated/prisma/enums"

interface HeaderProps {
  title?: string
  subtitle?: string
}

export function Header({ title, subtitle }: HeaderProps) {
  const { data: session } = useSession()
  const router = useRouter()

  const initials = session?.user?.name
    ?.split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() ?? "U"

  return (
    <header
      className="h-16 flex items-center px-6 gap-4 shrink-0 relative"
      style={{
        background: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(15,23,42,0.08)",
        boxShadow: "0 1px 0 rgba(36,99,255,0.04), 0 2px 12px rgba(15,23,42,0.04)",
      }}
    >
      {/* Subtle gradient accent line at bottom */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent 0%, rgba(0,196,224,0.3) 20%, rgba(36,99,255,0.4) 50%, rgba(139,47,255,0.3) 80%, transparent 100%)" }}
      />

      {/* Page Title or Search */}
      <div className="flex-1 min-w-0">
        {title ? (
          <div className="animate-fade-in">
            <h1 className="text-lg font-bold text-[#0F172A] truncate tracking-tight">{title}</h1>
            {subtitle && (
              <p className="text-xs text-slate-400 truncate mt-0.5">{subtitle}</p>
            )}
          </div>
        ) : (
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <Input
              placeholder="Buscar projetos, iniciativas..."
              className="pl-9 h-9 text-sm rounded-xl transition-all duration-200"
              style={{
                background: "#F8FAFC",
                border: "1px solid #E2E8F0",
                color: "#0F172A",
              }}
              onFocus={(e) => {
                e.currentTarget.style.background = "#ffffff"
                e.currentTarget.style.border = "1px solid rgba(36,99,255,0.4)"
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(36,99,255,0.08)"
              }}
              onBlur={(e) => {
                e.currentTarget.style.background = "#F8FAFC"
                e.currentTarget.style.border = "1px solid #E2E8F0"
                e.currentTarget.style.boxShadow = "none"
              }}
            />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5">

        {/* Quick Create */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-xl text-white text-xs font-semibold hover:opacity-90 active:scale-[0.97] transition-all focus:outline-none"
            style={{
              background: "linear-gradient(135deg, #00C4E0 0%, #2463FF 55%, #8B2FFF 100%)",
              boxShadow: "0 2px 12px rgba(36,99,255,0.30), inset 0 1px 0 rgba(255,255,255,0.2)",
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            Novo
            <ChevronDown className="w-3 h-3 opacity-70" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 rounded-xl border-[#E2E8F0] shadow-xl">
            <div className="px-1.5 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Criar novo
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => router.push("/projects/new")}
              className="gap-2.5 rounded-lg cursor-pointer"
            >
              <div className="w-6 h-6 rounded-md flex items-center justify-center bg-blue-100">
                <FolderKanban className="w-3.5 h-3.5 text-blue-600" />
              </div>
              Projeto
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="relative h-9 w-9 rounded-xl flex items-center justify-center hover:bg-slate-100 transition-colors focus:outline-none"
          >
            <Bell className="w-4 h-4 text-slate-500" />
            {/* Pulse dot */}
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full flex items-center justify-center">
              <span className="absolute w-2 h-2 rounded-full animate-ping opacity-50"
                style={{ background: "linear-gradient(135deg, #00C4E0, #8B2FFF)" }} />
              <span className="relative w-1.5 h-1.5 rounded-full"
                style={{ background: "linear-gradient(135deg, #00C4E0, #8B2FFF)" }} />
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 rounded-xl border-[#E2E8F0] shadow-xl p-0 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #F1F5F9" }}>
              <p className="text-sm font-bold text-[#0F172A]">Notificações</p>
              <Badge
                className="text-[10px] px-2 py-0.5 rounded-full border-0 font-semibold"
                style={{ background: "rgba(36,99,255,0.1)", color: "#2463FF" }}
              >
                3 novas
              </Badge>
            </div>
            <div className="py-2 px-2 space-y-1">
              {[
                { title: "Nova iniciativa enviada", time: "há 5 min", type: "info", icon: "💡" },
                { title: "Tarefa vence hoje: Deploy API", time: "há 1h", type: "warning", icon: "⚠️" },
                { title: "Status Report pendente", time: "há 2h", type: "action", icon: "📋" },
              ].map((n, i) => (
                <div
                  key={i}
                  className="flex gap-3 items-start px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-sm ${
                    n.type === "warning" ? "bg-amber-50" : n.type === "action" ? "bg-blue-50" : "bg-emerald-50"
                  }`}>
                    {n.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#0F172A] leading-tight">{n.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{n.time}</p>
                  </div>
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                    n.type === "warning" ? "bg-amber-400" : n.type === "action" ? "bg-blue-400" : "bg-emerald-400"
                  }`} />
                </div>
              ))}
            </div>
            <div style={{ borderTop: "1px solid #F1F5F9" }} className="p-2">
              <button
                onClick={() => router.push("/notifications")}
                className="w-full py-2 text-xs font-semibold text-[#2463FF] hover:bg-blue-50 rounded-lg transition-colors"
              >
                Ver todas as notificações
              </button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Divider */}
        <div className="w-px h-6 bg-slate-200 mx-1" />

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-slate-100 transition-colors focus:outline-none"
          >
            <Avatar className="w-7 h-7 ring-2 ring-white shadow-sm">
              <AvatarImage src={session?.user?.image ?? undefined} />
              <AvatarFallback
                className="text-white text-[10px] font-bold"
                style={{ background: "linear-gradient(135deg, #2463FF, #8B2FFF)" }}
              >
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="hidden md:block text-left">
              <p className="text-sm font-semibold text-[#0F172A] leading-tight">
                {session?.user?.name?.split(" ")[0]}
              </p>
              <p className="text-[9px] text-slate-400 leading-tight font-medium tracking-wide uppercase">
                {ROLE_LABELS[session?.user?.role as UserRole] ?? ""}
              </p>
            </div>
            <ChevronDown className="w-3 h-3 text-slate-400 hidden md:block" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-xl border-[#E2E8F0] shadow-xl p-0 overflow-hidden">
            <div className="px-4 py-3" style={{ background: "linear-gradient(135deg, rgba(0,196,224,0.06), rgba(36,99,255,0.06), rgba(139,47,255,0.06))", borderBottom: "1px solid #F1F5F9" }}>
              <div className="flex items-center gap-3">
                <Avatar className="w-9 h-9 ring-2 ring-white shadow">
                  <AvatarImage src={session?.user?.image ?? undefined} />
                  <AvatarFallback
                    className="text-white text-xs font-bold"
                    style={{ background: "linear-gradient(135deg, #2463FF, #8B2FFF)" }}
                  >
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="font-bold text-sm text-[#0F172A] truncate">{session?.user?.name}</p>
                  <p className="text-[10px] text-slate-400 truncate">{session?.user?.email}</p>
                </div>
              </div>
            </div>
            <div className="p-1.5">
              <DropdownMenuItem
                onClick={() => router.push("/settings/profile")}
                className="gap-2.5 rounded-lg cursor-pointer text-sm font-medium"
              >
                <Settings className="h-4 w-4 text-slate-400" />
                Configurações
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-1" />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="gap-2.5 rounded-lg cursor-pointer text-sm font-medium"
              >
                <LogOut className="h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
