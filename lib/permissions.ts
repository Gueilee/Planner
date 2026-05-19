import { UserRole } from "@/lib/generated/prisma/enums"

export { UserRole }

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Administrador",
  DIRECTOR: "Diretor",
  PROJECT_MANAGER: "Gerente de Projetos",
  PROJECT_MEMBER: "Membro de Projeto",
  SPONSOR: "Sponsor",
  CLIENT: "Cliente",
}

export const ROLE_COLORS: Record<UserRole, string> = {
  ADMIN: "bg-red-100 text-red-700",
  DIRECTOR: "bg-purple-100 text-purple-700",
  PROJECT_MANAGER: "bg-blue-100 text-blue-700",
  PROJECT_MEMBER: "bg-green-100 text-green-700",
  SPONSOR: "bg-orange-100 text-orange-700",
  CLIENT: "bg-gray-100 text-gray-700",
}

const includes = (roles: UserRole[], role: UserRole) =>
  (roles as string[]).includes(role as string)

export const canManageRoadmap = (role: UserRole) =>
  includes([UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PROJECT_MANAGER], role)

export const canEditSchedule = (role: UserRole) =>
  includes([UserRole.ADMIN, UserRole.PROJECT_MANAGER], role)

export const canCreateProjects = (role: UserRole) =>
  includes([UserRole.ADMIN, UserRole.PROJECT_MANAGER], role)

export const canManageUsers = (role: UserRole) =>
  includes([UserRole.ADMIN], role)

export const canSeeAllProjects = (role: UserRole) =>
  includes([UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PROJECT_MANAGER], role)

export const canGenerateReports = (role: UserRole) =>
  includes([UserRole.ADMIN, UserRole.PROJECT_MANAGER], role)
