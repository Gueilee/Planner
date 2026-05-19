import { UserRole } from "@/lib/generated/prisma/enums"

export type { UserRole }

export interface SessionUser {
  id: string
  name: string
  email: string
  role: UserRole
  department?: string | null
  image?: string | null
}

export interface KronexSession {
  user: SessionUser
  expires: string
}

// ─── UI Types ───────────────────────────────────────────────────────────────

export type StatusColor = "green" | "yellow" | "red" | "blue" | "gray"

export interface NavItem {
  label: string
  href: string
  icon: string
  badge?: number
  children?: NavItem[]
}

// ─── Dashboard Stats ─────────────────────────────────────────────────────────

export interface DashboardStats {
  totalProjects: number
  inProgress: number
  pendingApproval: number
  completed: number
  successRate: number

}
