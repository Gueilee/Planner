// Shared types and constants for org config — NOT a server action file

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

export const DEFAULT_AREA_CONFIGS: AreaConfigs = {
  TECNOLOGIA:  { label: "Tecnologia",            color: "#0891B2", description: "Sistemas, TI e projetos digitais",  icon: "💻" },
  QUALIDADE:   { label: "Qualidade",             color: "#059669", description: "Melhoria contínua e certificações", icon: "✅" },
  ESTRATEGICO: { label: "Projetos Estratégicos", color: "#7B2FBE", description: "Iniciativas de alto impacto",       icon: "🎯" },
}
