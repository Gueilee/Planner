// Rollup de grupo — CLAUDE.md §3.7: um item com filhos NÃO tem datas
// próprias; início = min(filhos.início), término = max(filhos.término),
// recursivo bottom-up. Itens "não agendados" (datas null) são ignorados no
// cálculo dos outros (§3.10).

import type { SchedItem } from "./types"

export type RollupResult = {
  id: string
  inicioEstimado: string | null
  terminoEstimado: string | null
}

/**
 * Recalcula início/término de todo grupo (item com filhos) na árvore,
 * bottom-up. Itens-folha (sem filhos) mantêm suas próprias datas — só
 * grupos são recalculados aqui.
 */
export function rollupGroups(items: readonly SchedItem[]): Map<string, RollupResult> {
  const byId = new Map(items.map((i) => [i.id, i]))
  const childrenOf = new Map<string, SchedItem[]>()
  for (const item of items) {
    if (item.parentId === null) continue
    const arr = childrenOf.get(item.parentId) ?? []
    arr.push(item)
    childrenOf.set(item.parentId, arr)
  }

  const result = new Map<string, RollupResult>()

  // Memoiza para evitar recomputar o mesmo grupo várias vezes em árvores
  // profundas — visitedOrder garante que filhos são resolvidos antes do pai.
  function resolve(id: string): RollupResult {
    const cached = result.get(id)
    if (cached) return cached

    const item = byId.get(id)
    const children = childrenOf.get(id) ?? []

    if (children.length === 0) {
      const leaf: RollupResult = item
        ? { id, inicioEstimado: item.inicioEstimado, terminoEstimado: item.terminoEstimado }
        : { id, inicioEstimado: null, terminoEstimado: null }
      result.set(id, leaf)
      return leaf
    }

    const childResults = children.map((c) => resolve(c.id))
    const starts = childResults.map((c) => c.inicioEstimado).filter((d): d is string => d !== null)
    const ends = childResults.map((c) => c.terminoEstimado).filter((d): d is string => d !== null)

    const group: RollupResult = {
      id,
      inicioEstimado: starts.length > 0 ? starts.reduce((min, d) => (d < min ? d : min)) : null,
      terminoEstimado: ends.length > 0 ? ends.reduce((max, d) => (d > max ? d : max)) : null,
    }
    result.set(id, group)
    return group
  }

  for (const item of items) resolve(item.id)
  return result
}

/** Término do projeto = max(término) de todos os itens agendados (raízes ou não). */
export function projectEndDate(items: readonly SchedItem[]): string | null {
  const ends = items.map((i) => i.terminoEstimado).filter((d): d is string => d !== null)
  return ends.length > 0 ? ends.reduce((max, d) => (d > max ? d : max)) : null
}
