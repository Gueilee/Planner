import { db } from "@/lib/db"
import { auth } from "@/auth"
import { Header } from "@/components/layout/header"
import { NotificationsList } from "./notifications-list"
import { Bell } from "lucide-react"

export default async function NotificationsPage() {
  const session = await auth()
  if (!session?.user?.id) return null

  const notifications = await db.notification.findMany({
    where:   { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take:    100,
  })

  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Notificações"
        subtitle={unreadCount > 0 ? `${unreadCount} notificação${unreadCount > 1 ? "ões" : ""} não lida${unreadCount > 1 ? "s" : ""}` : "Todas as notificações lidas"}
      />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto">
          {notifications.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[--kronex-border] p-12 text-center shadow-sm">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-[--kronex-light]">
                <Bell className="w-7 h-7 text-[--kronex-gray]" />
              </div>
              <h3 className="text-lg font-bold text-[--kronex-dark] mb-2">Tudo em dia!</h3>
              <p className="text-sm text-[--kronex-gray]">Você não tem notificações no momento.</p>
            </div>
          ) : (
            <NotificationsList notifications={notifications} unreadCount={unreadCount} />
          )}
        </div>
      </div>
    </div>
  )
}
