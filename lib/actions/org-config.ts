"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"

// ─── Types ────────────────────────────────────────────────────────────────────

export type AreaConfigItem = {
  label:       string
  color:       string
  description: string
  icon:        string
}

export type AreaConfigs = Record<"TECNOLOGIA" | "QUALIDADE" | "ESTRATEGICO", AreaConfigItem>

export type OrgConfigData = {
  name:        string
  logoUrl:     string | null
  sector:      string | null
  website:     string | null
  areaConfigs: AreaConfigs
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_AREA_CONFIGS: AreaConfigs = {
  TECNOLOGIA:  { label: "Tecnologia",            color: "#0891B2", description: "Sistemas, TI e projetos digitais",  icon: "💻" },
  QUALIDADE:   { label: "Qualidade",             color: "#059669", description: "Melhoria contínua e certificações", icon: "✅" },
  ESTRATEGICO: { label: "Projetos Estratégicos", color: "#7B2FBE", description: "Iniciativas de alto impacto",       icon: "🎯" },
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getOrgConfig(): Promise<OrgConfigData> {
  const row = await db.orgConfig.findUnique({ where: { id: "singleton" } })

  let areaConfigs = DEFAULT_AREA_CONFIGS
  if (row?.areaConfigs) {
    try { areaConfigs = { ...DEFAULT_AREA_CONFIGS, ...JSON.parse(row.areaConfigs) } } catch { /* ignore */ }
  }

  return {
    name:        row?.name    ?? "Planner",
    logoUrl:     row?.logoUrl ?? null,
    sector:      row?.sector  ?? null,
    website:     row?.website ?? null,
    areaConfigs,
  }
}

// ─── Write (admin only) ───────────────────────────────────────────────────────

export async function saveOrgConfig(data: OrgConfigData) {
  const session = await auth()
  if (!session?.user)               throw new Error("Não autorizado")
  if (session.user.role !== "ADMIN") throw new Error("Acesso restrito a administradores")

  await db.orgConfig.upsert({
    where:  { id: "singleton" },
    create: {
      id:          "singleton",
      name:        data.name.trim() || "Planner",
      logoUrl:     data.logoUrl  || null,
      sector:      data.sector?.trim()  || null,
      website:     data.website?.trim() || null,
      areaConfigs: JSON.stringify(data.areaConfigs),
    },
    update: {
      name:        data.name.trim() || "Planner",
      logoUrl:     data.logoUrl  || null,
      sector:      data.sector?.trim()  || null,
      website:     data.website?.trim() || null,
      areaConfigs: JSON.stringify(data.areaConfigs),
    },
  })

  revalidatePath("/settings")
  revalidatePath("/dashboard")
  revalidatePath("/projects")
  return { success: true }
}
