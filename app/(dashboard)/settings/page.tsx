import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { Header } from "@/components/layout/header"
import { getMyProfile, getAllUsers } from "@/lib/actions/profile"
import { getNotificationPreferences } from "@/lib/actions/notification-preferences"
import { getMyNotifications } from "@/lib/actions/notifications"
import { getOrgConfig } from "@/lib/actions/org-config"
import { SettingsClient } from "./settings-client"

export const metadata = { title: "Configurações — Planner" }

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const [profile, allUsers, preferences, notifications, orgConfig] = await Promise.all([
    getMyProfile(),
    session.user.role === "ADMIN" ? getAllUsers() : Promise.resolve([]),
    getNotificationPreferences(),
    getMyNotifications(50),
    getOrgConfig(),
  ])

  if (!profile) redirect("/login")

  return (
    <div className="flex flex-col h-full">
      <Header title="Configurações" subtitle="Preferências e configurações da sua conta" />
      <SettingsClient
        profile={profile}
        allUsers={allUsers}
        isAdmin={session.user.role === "ADMIN"}
        preferences={{
          projectDeadline:  preferences.projectDeadline,
          projectOnHold:    preferences.projectOnHold,
          projectCompleted: preferences.projectCompleted,
          taskOverdue:      preferences.taskOverdue,
          taskAssigned:     preferences.taskAssigned,
          checkpointAdded:  preferences.checkpointAdded,
          meetingAdded:     preferences.meetingAdded,
          criticalRisk:     preferences.criticalRisk,
        }}
        notifications={notifications}
        orgConfig={orgConfig}
      />
    </div>
  )
}
