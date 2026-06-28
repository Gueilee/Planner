export type TaskForProgress  = { progress: number; wbsAreaId: string | null }
export type AreaForProgress  = { id: string; weight: number | null }

/**
 * Calcula o progresso do projeto usando média ponderada por módulo WBS.
 * - Se algum módulo tem peso definido, usa esses pesos (normaliza se a soma ≠ 100%).
 * - Se nenhum módulo tem peso, distribui igual entre módulos com tarefas.
 * - Tarefas sem área são ignoradas no cálculo por módulo (incluídas apenas se não houver áreas).
 */
export function computeProjectProgress(
  tasks: TaskForProgress[],
  wbsAreas: AreaForProgress[],
): number {
  if (tasks.length === 0) return 0
  if (wbsAreas.length === 0) {
    return Math.round(tasks.reduce((s, t) => s + t.progress, 0) / tasks.length)
  }

  const hasCustom = wbsAreas.some((a) => a.weight !== null && a.weight > 0)
  const equalW    = 100 / wbsAreas.length
  let weighted = 0
  let total    = 0

  for (const area of wbsAreas) {
    const areaTasks = tasks.filter((t) => t.wbsAreaId === area.id)
    if (areaTasks.length === 0) continue
    const areaProgress = areaTasks.reduce((s, t) => s + t.progress, 0) / areaTasks.length
    const w = hasCustom ? (area.weight ?? 0) : equalW
    weighted += (w / 100) * areaProgress
    total    += w
  }

  if (total === 0) {
    return Math.round(tasks.reduce((s, t) => s + t.progress, 0) / tasks.length)
  }

  return Math.round(Math.min(100, (weighted / total) * 100))
}
