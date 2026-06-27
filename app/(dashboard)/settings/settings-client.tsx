"use client"

import { useState } from "react"
import { User, Bell, Building2, Users, ChevronRight, Lock } from "lucide-react"
import { ProfileTab } from "./profile-tab"
import { NotificationsTab } from "./notifications-tab"
import { OrganizationTab } from "./organization-tab"
import { UsersTab } from "./users-tab"
import type { NotificationPreferenceData } from "@/lib/actions/notification-preferences"
import type { OrgConfigData } from "@/lib/types/org-config"

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserProfile = {
  id:         string
  name:       string
  email:      string
  department: string | null
  phone:      string | null
  image:      string | null
  role:       string
  active:     boolean
  createdAt?: Date
}

type NotifItem = { id: string; type: string; title: string; message: string; link: string | null; read: boolean; createdAt: string }

type Props = {
  profile:       UserProfile
  allUsers:      UserProfile[]
  isAdmin:       boolean
  preferences:   NotificationPreferenceData
  notifications: NotifItem[]
  orgConfig:     OrgConfigData
  currentUserId: string
}

// ─── Tab config ───────────────────────────────────────────────────────────────

type TabId = "profile" | "notifications" | "organization" | "users"

type Tab = {
  id:       TabId
  label:    string
  icon:     React.ElementType
  adminOnly?: boolean
  ready:    boolean
}

const TABS: Tab[] = [
  { id: "profile",       label: "Meu Perfil",    icon: User,      ready: true  },
  { id: "notifications", label: "Notificações",  icon: Bell,      ready: true  },
  { id: "organization",  label: "Organização",   icon: Building2, ready: true,  adminOnly: true },
  { id: "users",         label: "Usuários",      icon: Users,     ready: true,  adminOnly: true },
]

// ─── Main Component ───────────────────────────────────────────────────────────

export function SettingsClient({ profile, allUsers, isAdmin, preferences, notifications, orgConfig, currentUserId }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("profile")

  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin)

  return (
    <div className="flex-1 min-h-0 overflow-auto" style={{ background: "#F7F6F2" }}>
      <div className={`mx-auto px-6 py-8 ${activeTab === "users" ? "max-w-6xl" : "max-w-5xl"}`}>
        <div className="flex gap-6 items-start">

          {/* ── Sidebar nav ───────────────────────────────────────────────── */}
          <aside className="w-56 shrink-0 sticky top-0">
            <nav className="bg-white rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
              {visibleTabs.map((tab, i) => {
                const Icon    = tab.icon
                const active  = activeTab === tab.id
                const isLast  = i === visibleTabs.length - 1
                return (
                  <button
                    key={tab.id}
                    onClick={() => tab.ready && setActiveTab(tab.id)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-all group"
                    style={{
                      background:  active ? "linear-gradient(135deg, rgba(123,47,190,0.06), rgba(36,99,255,0.06))" : "transparent",
                      borderBottom: isLast ? "none" : "1px solid rgba(0,0,0,0.05)",
                      cursor: tab.ready ? "pointer" : "default",
                    }}
                  >
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all"
                      style={{
                        background: active
                          ? "linear-gradient(135deg, #7B2FBE, #2463FF)"
                          : "rgba(0,0,0,0.04)",
                      }}
                    >
                      <Icon className="w-3.5 h-3.5" style={{ color: active ? "#fff" : "#94A3B8" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-xs font-semibold truncate"
                        style={{ color: active ? "#0F172A" : tab.ready ? "#475569" : "#CBD5E1" }}
                      >
                        {tab.label}
                      </p>
                      {tab.adminOnly && (
                        <p className="text-[9px] text-slate-300 flex items-center gap-0.5 mt-0.5">
                          <Lock className="w-2 h-2" /> Admin
                        </p>
                      )}
                      {!tab.ready && (
                        <p className="text-[9px] text-slate-300 mt-0.5">Em breve</p>
                      )}
                    </div>
                    {active && <ChevronRight className="w-3 h-3 text-violet-400 shrink-0" />}
                  </button>
                )
              })}
            </nav>
          </aside>

          {/* ── Content area ──────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0">
            {activeTab === "profile" && (
              <ProfileTab profile={profile} allUsers={allUsers} isAdmin={isAdmin} />
            )}
            {activeTab === "notifications" && (
              <NotificationsTab preferences={preferences} notifications={notifications} />
            )}
            {activeTab === "organization" && isAdmin && (
              <OrganizationTab initial={orgConfig} />
            )}
            {activeTab === "users" && isAdmin && (
              <UsersTab initialUsers={allUsers} currentUserId={currentUserId} />
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
