// Tipos puros do motor de Cronograma v2 — sem dependência de Prisma/Next.
// Datas trafegam como string "yyyy-MM-dd" (sem hora, sem fuso) em toda a
// camada de domínio — granularidade é DIA (CLAUDE.md §3.2).

export type LinkType = "FS" | "SS" | "FF" | "SF"

export type SchedulingMode = "auto" | "manual"

export type Holiday = { date: string; name?: string }

export type WorkCalendar = {
  /** ISO: 1=segunda .. 7=domingo. Default: seg-sex. */
  diasUteis: number[]
  holidays: Holiday[]
}

export type SchedItem = {
  id: string
  parentId: string | null
  /** dias úteis, fonte da verdade da barra. null = não agendado. 0 = marco. */
  duracaoDiasUteis: number | null
  inicioEstimado: string | null
  terminoEstimado: string | null
  schedulingMode: SchedulingMode
}

export type Dependency = {
  successorId: string
  predecessorId: string
  type: LinkType
  /** dias úteis; pode ser negativo (sobreposição). */
  lag: number
}

/** Resultado do recálculo para um item que teve suas datas recalculadas. */
export type ScheduleUpdate = {
  itemId: string
  inicioEstimado: string | null
  terminoEstimado: string | null
  /**
   * true quando o item está em modo manual e o vínculo sugere datas
   * diferentes das atuais — a data NÃO é sobrescrita (regra §6), só
   * sinalizada para a UI.
   */
  conflict: boolean
  suggestedInicio?: string | null
  suggestedTermino?: string | null
}
