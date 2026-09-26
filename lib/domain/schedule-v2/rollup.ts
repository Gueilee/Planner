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

/** Início do projeto = min(início) de todos os itens agendados (raízes ou não). */
export function projectStartDate(items: readonly SchedItem[]): string | null {
  const starts = items.map((i) => i.inicioEstimado).filter((d): d is string => d !== null)
  return starts.length > 0 ? starts.reduce((min, d) => (d < min ? d : min)) : null
}

export type StatusItem = { id: string; parentId: string | null; status: string }

// Prioridade de rollup de status (do mais crítico ao menos): um grupo
// herda o status mais crítico entre os filhos DIRETOS. CONCLUIDO fica por
// último de propósito — como "nenhum status mais crítico" é o único jeito
// de chegar até ele, o grupo só vira CONCLUIDO quando TODOS os filhos
// estiverem CONCLUIDO, sem precisar de um caso especial separado.
// CANCELADO por último de propósito — só vira status do grupo quando TODOS
// os filhos diretos estão cancelados (nenhum dos outros valores aparece
// entre eles); um só filho ativo já basta pro grupo não ser "cancelado".
const STATUS_PRIORITY = ["ATRASADO", "PAUSADO", "EM_ANDAMENTO", "VALIDACAO", "A_INICIAR", "CONCLUIDO", "CANCELADO"] as const

/**
 * Status de grupo = o mais crítico entre os filhos diretos, bottom-up
 * (mesmo padrão memoizado de rollupGroups/rollupProgress). Item-folha
 * mantém o próprio status — nunca é sobrescrito por rollup, só o de um
 * item COM filhos é derivado aqui.
 */
export function rollupStatus(items: readonly StatusItem[]): Map<string, string> {
  const byId = new Map(items.map((i) => [i.id, i]))
  const childrenOf = new Map<string, StatusItem[]>()
  for (const item of items) {
    if (item.parentId === null) continue
    const arr = childrenOf.get(item.parentId) ?? []
    arr.push(item)
    childrenOf.set(item.parentId, arr)
  }

  const result = new Map<string, string>()

  function resolve(id: string): string {
    const cached = result.get(id)
    if (cached !== undefined) return cached

    const children = childrenOf.get(id) ?? []
    if (children.length === 0) {
      const value = byId.get(id)?.status ?? "A_INICIAR"
      result.set(id, value)
      return value
    }

    const childStatuses = children.map((c) => resolve(c.id))
    const winner = STATUS_PRIORITY.find((s) => childStatuses.includes(s)) ?? "A_INICIAR"
    result.set(id, winner)
    return winner
  }

  for (const item of items) resolve(item.id)
  return result
}

export type ProgressItem = { id: string; parentId: string | null; percentualCompleto: number; cancelled?: boolean }

/**
 * Progresso de grupo = média simples dos filhos DIRETOS, recursivo
 * bottom-up (mesmo padrão de propagateParentUp do motor atual — grupo sem
 * filhos fica com o próprio valor, nunca 0 por padrão). Filho CANCELADO
 * fica de fora da média (nem 0% nem 100%) — se todos os filhos diretos
 * estiverem cancelados, cai no mesmo fallback de "sem filhos" (valor
 * próprio do grupo).
 */
export function rollupProgress(items: readonly ProgressItem[]): Map<string, number> {
  const byId = new Map(items.map((i) => [i.id, i]))
  const childrenOf = new Map<string, ProgressItem[]>()
  for (const item of items) {
    if (item.parentId === null) continue
    const arr = childrenOf.get(item.parentId) ?? []
    arr.push(item)
    childrenOf.set(item.parentId, arr)
  }

  const result = new Map<string, number>()

  function resolve(id: string): number {
    const cached = result.get(id)
    if (cached !== undefined) return cached

    const children = (childrenOf.get(id) ?? []).filter((c) => !c.cancelled)
    if (children.length === 0) {
      const value = byId.get(id)?.percentualCompleto ?? 0
      result.set(id, value)
      return value
    }

    const childValues = children.map((c) => resolve(c.id))
    const avg = Math.round(childValues.reduce((s, v) => s + v, 0) / childValues.length)
    result.set(id, avg)
    return avg
  }

  for (const item of items) resolve(item.id)
  return result
}
