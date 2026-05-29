import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { Header } from "@/components/layout/header"
import { getMyProfile, getAllUsers } from "@/lib/actions/profile"
import { SettingsClient } from "./settings-client"

export const metadata = { title: "Configurações — Planner" }

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const [profile, allUsers] = await Promise.all([
    getMyProfile(),
    session.user.role === "ADMIN" ? getAllUsers() : Promise.resolve([]),
  ])

  if (!profile) redirect("/login")

  return (
    <div className="flex flex-col h-full">
      <Header title="Configurações" subtitle="Preferências e configurações da sua conta" />
      <SettingsClient
        profile={profile}
        allUsers={allUsers}
        isAdmin={session.user.role === "ADMIN"}
      />
    </div>
  )
}
