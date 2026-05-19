"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { markAllRead, markRead } from "@/lib/actions/notifications"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Bell, CheckCheck, ExternalLink, CheckCircle2, AlertTriangle, Info, Star } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"

interface Notification {
  id: string
  type: string
  title: string
  message: string
  link: string | null
  read: boolean
  createdAt: Date
}

const TYPE_ICON: Record<string, { icon: typeof Bell; color: string; bg: string }> = {
  SUBMISSION_RECEIVED: { icon: Star,          color: "text-blue-600",   bg: "bg-blue-50" },
  DECISION_NEEDED:     { icon: AlertTriangle, color: "text-amber-600",  bg: "bg-amber-50" },
  INITIATIVE_APPROVED: { icon: CheckCircle2,  color: "text-green-600",  bg: "bg-green-50" },
  INITIATIVE_REJECTED: { icon: Bell,          color: "text-red-600",    bg: "bg-red-50" },
}

function getTypeConfig(type: string) {
  return TYPE_ICON[type] ?? { icon: Info, color: "text-[--kronex-gray]", bg: "bg-[--kronex-light]" }
}

interface NotificationsListProps {
  notifications: Notification[]
  unreadCount: number
}

export function NotificationsList({ notifications, unreadCount }: NotificationsListProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const handleMarkAll = () => {
    startTransition(async () => {
      await markAllRead()
      router.refresh()
    })
  }

  const handleRead = (id: string) => {
    startTransition(async () => {
      await markRead(id)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[--kronex-dark]">
            {notifications.length} notificação{notifications.length !== 1 ? "ões" : ""}
          </span>
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-[#2463FF] text-white">
              {unreadCount} nova{unreadCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAll}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 px-3 h-8 text-xs font-medium rounded-xl
              border border-[--kronex-border] bg-white text-[--kronex-gray] hover:bg-[--kronex-light] transition-all"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Marcar todas como lidas
          </button>
        )}
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-[--kronex-border] shadow-sm overflow-hidden divide-y divide-[--kronex-border]">
        {notifications.map((n) => {
          const config = getTypeConfig(n.type)
          const Icon   = config.icon
          return (
            <div
              key={n.id}
              className={cn(
                "flex items-start gap-4 px-5 py-4 transition-colors group",
                !n.read ? "bg-[#2463FF]/3 hover:bg-[#2463FF]/5" : "hover:bg-[--kronex-light]/50"
              )}
            >
              <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5", config.bg)}>
                <Icon className={cn("w-4 h-4", config.color)} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={cn("text-sm", !n.read ? "font-semibold text-[--kronex-dark]" : "font-medium text-[--kronex-dark]")}>
                      {n.title}
                      {!n.read && <span className="ml-2 inline-block w-2 h-2 rounded-full bg-[#2463FF] align-middle" />}
                    </p>
                    <p className="text-xs text-[--kronex-gray] mt-0.5 leading-relaxed">{n.message}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {n.link && (
                      <Link
                        href={n.link}
                        className="p-1.5 rounded-lg text-[--kronex-gray] hover:text-[#2463FF] hover:bg-[#2463FF]/10 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    )}
                    {!n.read && (
                      <button
                        onClick={() => handleRead(n.id)}
                        className="p-1.5 rounded-lg text-[--kronex-gray] hover:text-green-600 hover:bg-green-50 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-[--kronex-gray] mt-1.5">
                  {formatDistanceToNow(n.createdAt, { addSuffix: true, locale: ptBR })}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
