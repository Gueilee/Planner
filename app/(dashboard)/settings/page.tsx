import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { Header } from "@/components/layout/header"
import { getMyProfile, getAllUsers } from "@/lib/actions/profile"
import { getNotificationPreferences } from "@/lib/actions/notification-preferences"
import { getMyNotifications } from "@/lib/actions/notifications"
import { getOrgConfig } from "@/lib/actions/org-config"
import { listOrganizations } from "@/lib/actions/organizations"
import { SettingsClient } from "./settings-client"

export const metadata = { title: "Configurações — Planner" }

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const isAdmin     = session.user.role === "ADMIN"
  const isRootAdmin = isAdmin && session.user.organizationId === "org_vendemmia"

  const [profile, allUsers, preferences, notifications, orgConfig, initialOrgs] = await Promise.all([
    getMyProfile(),
    isAdmin ? getAllUsers() : Promise.resolve([]),
    getNotificationPreferences(),
    getMyNotifications(50),
    getOrgConfig(),
    isRootAdmin ? listOrganizations() : Promise.resolve([]),
  ])

  if (!profile) redirect("/login")

  return (
    <div className="flex flex-col h-full">
      <Header title="Configurações" subtitle="Gestão centralizada do sistema" />
      <SettingsClient
        profile={profile}
        allUsers={allUsers}
        isAdmin={isAdmin}
        isRootAdmin={isRootAdmin}
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
        currentUserId={profile.id}
        currentOrgId={session.user.organizationId ?? ""}
        initialOrgs={initialOrgs}
      />
    </div>
  )
}
