"use client"

import { useSession, signOut } from "next-auth/react"
import { useEffect, useState, useCallback } from "react"
import { Bell, Search, Plus, ChevronDown, Settings, LogOut, FolderKanban, CheckCheck, Inbox, Building2, Check } from "lucide-react"
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
import { getHeaderNotifications, markAllRead, markRead } from "@/lib/actions/notifications"
import { getOrgsForSwitch, type OrgSwitchItem } from "@/lib/actions/organizations"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"

// Notification type → visual config
const NOTIF_CFG: Record<string, { emoji: string; dot: string; bg: string }> = {
  SUBMISSION_RECEIVED: { emoji: "💡", dot: "#2463FF", bg: "#EFF6FF" },
  DECISION_NEEDED:     { emoji: "⚠️",  dot: "#F59E0B", bg: "#FFFBEB" },
  INITIATIVE_APPROVED: { emoji: "✅",  dot: "#10B981", bg: "#ECFDF5" },
  INITIATIVE_REJECTED: { emoji: "❌",  dot: "#EF4444", bg: "#FEF2F2" },
  DEADLINE_ALERT:      { emoji: "📅",  dot: "#F97316", bg: "#FFF7ED" },
  TASK_OVERDUE:        { emoji: "⏰",  dot: "#EF4444", bg: "#FEF2F2" },
  TASK_ASSIGNED:       { emoji: "👤",  dot: "#8B5CF6", bg: "#F5F3FF" },
  CHECKPOINT_ADDED:    { emoji: "📋",  dot: "#0891B2", bg: "#ECFEFF" },
  MEETING_ADDED:       { emoji: "🤝",  dot: "#059669", bg: "#ECFDF5" },
  CRITICAL_RISK:       { emoji: "🚨",  dot: "#DC2626", bg: "#FEF2F2" },
  DEFAULT:             { emoji: "🔔",  dot: "#94A3B8", bg: "#F8FAFC" },
}

interface HeaderProps {
  title?: string
  subtitle?: string
}

const ROOT_ADMIN_EMAIL = "gppereira@vendemmia.com.br"

export function Header({ title, subtitle }: HeaderProps) {
  const { data: session, update } = useSession()
  const router = useRouter()

  // Org switcher state (root admin only)
  const isRootAdmin = session?.user?.email === ROOT_ADMIN_EMAIL
  const [switchOrgs,   setSwitchOrgs]   = useState<OrgSwitchItem[]>([])
  const [orgsLoaded,   setOrgsLoaded]   = useState(false)
  const [switching,    setSwitching]    = useState(false)

  async function loadOrgsForSwitch() {
    if (orgsLoaded) return
    try {
      const list = await getOrgsForSwitch()
      setSwitchOrgs(list)
      setOrgsLoaded(true)
    } catch { /* ignore */ }
  }

  async function handleSwitchOrg(orgId: string) {
    if (orgId === session?.user?.organizationId) return
    setSwitching(true)
    try {
      await update({ switchToOrgId: orgId })
      router.refresh()
    } finally {
      setSwitching(false)
    }
  }

  // Real notifications state
  type NotifItem = { id: string; type: string; title: string; message: string; link: string | null; read: boolean; createdAt: string }
  const [notifs,   setNotifs]   = useState<NotifItem[]>([])
  const [unread,   setUnread]   = useState(0)
  const [notifOpen, setNotifOpen] = useState(false)

  const loadNotifications = useCallback(async () => {
    try {
      const data = await getHeaderNotifications()
      setNotifs(data.items as NotifItem[])
      setUnread(data.unreadCount)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { if (session?.user) loadNotifications() }, [session?.user, loadNotifications])

  async function handleMarkAllRead() {
    await markAllRead()
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnread(0)
  }

  async function handleClickNotif(n: NotifItem) {
    if (!n.read) {
      await markRead(n.id)
      setNotifs((prev) => prev.map((x) => x.id === n.id ? { ...x, read: true } : x))
      setUnread((prev) => Math.max(0, prev - 1))
    }
    if (n.link) router.push(n.link)
  }

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
        <DropdownMenu open={notifOpen} onOpenChange={(o) => { setNotifOpen(o); if (o) loadNotifications() }}>
          <DropdownMenuTrigger
            className="relative h-9 w-9 rounded-xl flex items-center justify-center hover:bg-slate-100 transition-colors focus:outline-none"
          >
            <Bell className="w-4 h-4 text-slate-500" />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center">
                <span className="absolute w-4 h-4 rounded-full animate-ping opacity-30"
                  style={{ background: "linear-gradient(135deg, #2463FF, #8B2FFF)" }} />
                <span className="relative w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black text-white"
                  style={{ background: "linear-gradient(135deg, #2463FF, #8B2FFF)" }}>
                  {unread > 9 ? "9+" : unread}
                </span>
              </span>
            )}
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-80 rounded-xl border-[#E2E8F0] shadow-xl p-0 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #F1F5F9" }}>
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-[#0F172A]">Notificações</p>
                {unread > 0 && (
                  <Badge className="text-[10px] px-2 py-0.5 rounded-full border-0 font-semibold"
                    style={{ background: "rgba(36,99,255,0.1)", color: "#2463FF" }}>
                    {unread} nova{unread > 1 ? "s" : ""}
                  </Badge>
                )}
              </div>
              {unread > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="flex items-center gap-1 text-[10px] font-semibold text-slate-400 hover:text-[#2463FF] transition-colors"
                  title="Marcar todas como lidas"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Marcar todas
                </button>
              )}
            </div>

            {/* List */}
            <div className="py-2 px-2 space-y-0.5 max-h-72 overflow-y-auto">
              {notifs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2 text-slate-300">
                  <Inbox className="w-7 h-7" />
                  <p className="text-xs font-medium text-slate-400">Nenhuma notificação</p>
                </div>
              ) : notifs.map((n) => {
                const cfg = NOTIF_CFG[n.type] ?? NOTIF_CFG.DEFAULT
                return (
                  <div
                    key={n.id}
                    onClick={() => handleClickNotif(n)}
                    className="flex gap-3 items-start px-3 py-2.5 rounded-xl transition-colors cursor-pointer"
                    style={{ background: n.read ? "transparent" : `${cfg.dot}08` }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = n.read ? "transparent" : `${cfg.dot}08`)}
                  >
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-sm" style={{ background: cfg.bg }}>
                      {cfg.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs leading-snug ${n.read ? "font-medium text-slate-600" : "font-bold text-[#0F172A]"}`}>
                        {n.title}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5 truncate">{n.message}</p>
                      <p className="text-[10px] text-slate-300 mt-0.5">
                        {formatDistanceToNow(new Date(n.createdAt), { locale: ptBR, addSuffix: true })}
                      </p>
                    </div>
                    {!n.read && (
                      <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: cfg.dot }} />
                    )}
                  </div>
                )
              })}
            </div>

            {/* Footer */}
            <div style={{ borderTop: "1px solid #F1F5F9" }} className="p-2">
              <button
                onClick={() => { setNotifOpen(false); router.push("/settings?tab=notifications") }}
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
        <DropdownMenu onOpenChange={(open) => { if (open && isRootAdmin) loadOrgsForSwitch() }}>
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
          <DropdownMenuContent align="end" className="w-64 rounded-xl border-[#E2E8F0] shadow-xl p-0 overflow-hidden">
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
            {/* Org switcher — root admin only */}
            {isRootAdmin && (
              <div className="px-3 pt-3 pb-1">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 flex items-center gap-1.5">
                  <Building2 className="w-2.5 h-2.5" />
                  Organização ativa
                </p>
                {!orgsLoaded ? (
                  <div className="flex items-center gap-2 py-1.5 px-1 text-xs text-slate-400">
                    <span className="w-3 h-3 border border-slate-300 border-t-transparent rounded-full animate-spin inline-block" />
                    Carregando...
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {switchOrgs.map((org) => {
                      const active = org.id === session?.user?.organizationId
                      return (
                        <button
                          key={org.id}
                          onClick={() => handleSwitchOrg(org.id)}
                          disabled={switching}
                          className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition-colors text-left ${
                            active
                              ? "bg-blue-50 text-blue-700 font-semibold"
                              : "text-slate-600 hover:bg-slate-100"
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${active ? "bg-blue-500" : "bg-slate-300"}`} />
                          <span className="flex-1 truncate">{org.name}</span>
                          {active && <Check className="w-3 h-3 flex-shrink-0" />}
                          {!org.active && <span className="text-[9px] text-slate-400 bg-slate-100 px-1 rounded">inativa</span>}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            <div className={`p-1.5 ${isRootAdmin ? "border-t border-slate-100 mt-1" : ""}`}>
              <DropdownMenuItem
                onClick={() => router.push("/settings")}
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
