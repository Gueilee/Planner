"use client"

import { useState } from "react"
import {
  User, Bell, Building2, Users, ChevronRight,
  FileText, Network, Settings2, Shield,
} from "lucide-react"
import { ProfileTab }      from "./profile-tab"
import { NotificationsTab } from "./notifications-tab"
import { OrganizationTab }  from "./organization-tab"
import { UsersTab }         from "./users-tab"
import { DocsTab }          from "./docs-tab"
import { FiliaisTab }       from "./filiais-tab"
import type { NotificationPreferenceData } from "@/lib/actions/notification-preferences"
import type { OrgConfigData }              from "@/lib/types/org-config"
import type { OrgRow }                     from "@/lib/actions/organizations"

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

type NotifItem = {
  id: string; type: string; title: string
  message: string; link: string | null
  read: boolean; createdAt: string
}

type Props = {
  profile:       UserProfile
  allUsers:      UserProfile[]
  isAdmin:       boolean
  isRootAdmin:   boolean
  preferences:   NotificationPreferenceData
  notifications: NotifItem[]
  orgConfig:     OrgConfigData
  currentUserId: string
  currentOrgId:  string
  initialOrgs:   OrgRow[]
}

// ─── Tab config ───────────────────────────────────────────────────────────────

type TabId = "profile" | "notifications" | "empresa" | "usuarios" | "documentos" | "filiais"

type TabSection = {
  label:   string
  badge?:  string
  color?:  string
  tabs: {
    id:            TabId
    label:         string
    description:   string
    icon:          React.ElementType
    adminOnly?:    boolean
    rootOnly?:     boolean
  }[]
}

const SECTIONS: TabSection[] = [
  {
    label: "Conta",
    tabs: [
      {
        id:          "profile",
        label:       "Meu Perfil",
        description: "Nome, foto e dados pessoais",
        icon:        User,
      },
      {
        id:          "notifications",
        label:       "Notificações",
        description: "Preferências de alertas",
        icon:        Bell,
      },
    ],
  },
  {
    label:  "Administração",
    badge:  "Admin",
    color:  "#7B2FBE",
    tabs: [
      {
        id:          "empresa",
        label:       "Identidade da Empresa",
        description: "Logo, nome e áreas do portfólio",
        icon:        Building2,
        adminOnly:   true,
      },
      {
        id:          "usuarios",
        label:       "Usuários",
        description: "Gestão de acessos e permissões",
        icon:        Users,
        adminOnly:   true,
      },
    ],
  },
  {
    label:  "Sistema",
    badge:  "Admin",
    color:  "#0891B2",
    tabs: [
      {
        id:          "documentos",
        label:       "Documentos",
        description: "Especificações técnica e funcional",
        icon:        FileText,
        adminOnly:   true,
      },
    ],
  },
  {
    label:  "Plataforma",
    badge:  "Root",
    color:  "#DC2626",
    tabs: [
      {
        id:          "filiais",
        label:       "Filiais",
        description: "Gestão de organizações e usuários",
        icon:        Network,
        rootOnly:    true,
      },
    ],
  },
]

// ─── Nav Item ─────────────────────────────────────────────────────────────────

function NavItem({
  tab, active, onClick,
}: {
  tab:     TabSection["tabs"][number]
  active:  boolean
  onClick: () => void
}) {
  const Icon = tab.icon
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all group"
      style={{
        background: active
          ? "linear-gradient(135deg, rgba(123,47,190,0.09), rgba(36,99,255,0.07))"
          : "transparent",
        border: active ? "1px solid rgba(123,47,190,0.15)" : "1px solid transparent",
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
        <p className="text-xs font-semibold leading-tight truncate" style={{ color: active ? "#0F172A" : "#475569" }}>
          {tab.label}
        </p>
        <p className="text-[10px] mt-0.5 leading-tight truncate" style={{ color: active ? "#7B2FBE" : "#94A3B8" }}>
          {tab.description}
        </p>
      </div>
      {active && <ChevronRight className="w-3.5 h-3.5 text-violet-400 shrink-0" />}
    </button>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SettingsClient({
  profile, allUsers, isAdmin, isRootAdmin,
  preferences, notifications, orgConfig,
  currentUserId, currentOrgId, initialOrgs,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("profile")

  const isWide = activeTab === "usuarios" || activeTab === "filiais" || activeTab === "documentos"

  const visibleSections = SECTIONS
    .map((section) => ({
      ...section,
      tabs: section.tabs.filter((t) => {
        if (t.rootOnly)  return isRootAdmin
        if (t.adminOnly) return isAdmin
        return true
      }),
    }))
    .filter((s) => s.tabs.length > 0)

  return (
    <div className="flex-1 min-h-0 overflow-auto" style={{ background: "#F7F6F2" }}>
      <div className={`mx-auto px-6 py-8 ${isWide ? "max-w-7xl" : "max-w-5xl"}`}>
        <div className="flex gap-6 items-start">

          {/* ── Left nav ──────────────────────────────────────────────────── */}
          <aside className="w-64 shrink-0 sticky top-0 space-y-3">

            {/* Header */}
            <div className="px-1 mb-4">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, #7B2FBE, #2463FF)" }}
                >
                  <Settings2 className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-black text-slate-800">Configurações</p>
                  <p className="text-[10px] text-slate-400">Gestão do sistema</p>
                </div>
              </div>
            </div>

            {visibleSections.map((section) => (
              <div key={section.label}>
                {/* Section label */}
                <div className="flex items-center gap-2 px-1 mb-1.5">
                  <span className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                    {section.label}
                  </span>
                  {section.badge && (
                    <span
                      className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                      style={{
                        background: `${section.color}15`,
                        color:      section.color,
                        border:     `1px solid ${section.color}25`,
                      }}
                    >
                      {section.badge}
                    </span>
                  )}
                  <div className="flex-1 h-px" style={{ background: "rgba(0,0,0,0.06)" }} />
                </div>

                {/* Tabs in this section */}
                <div className="space-y-0.5">
                  {section.tabs.map((tab) => (
                    <NavItem
                      key={tab.id}
                      tab={tab}
                      active={activeTab === tab.id}
                      onClick={() => setActiveTab(tab.id)}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Footer badge */}
            {(isAdmin || isRootAdmin) && (
              <div
                className="mt-4 rounded-xl px-3 py-2.5 flex items-center gap-2"
                style={{ background: "rgba(123,47,190,0.05)", border: "1px solid rgba(123,47,190,0.10)" }}
              >
                <Shield className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                <p className="text-[10px] text-violet-500 font-medium leading-tight">
                  {isRootAdmin ? "Acesso completo à plataforma" : "Acesso administrativo ativo"}
                </p>
              </div>
            )}
          </aside>

          {/* ── Content area ──────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0">
            {activeTab === "profile" && (
              <ProfileTab profile={profile} allUsers={allUsers} isAdmin={isAdmin} />
            )}
            {activeTab === "notifications" && (
              <NotificationsTab preferences={preferences} notifications={notifications} />
            )}
            {activeTab === "empresa" && isAdmin && (
              <OrganizationTab initial={orgConfig} />
            )}
            {activeTab === "usuarios" && isAdmin && (
              <UsersTab
                initialUsers={allUsers}
                currentUserId={currentUserId}
                orgs={isRootAdmin ? initialOrgs : []}
              />
            )}
            {activeTab === "documentos" && isAdmin && (
              <DocsTab />
            )}
            {activeTab === "filiais" && isRootAdmin && (
              <FiliaisTab initialOrgs={initialOrgs} currentOrgId={currentOrgId} />
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
