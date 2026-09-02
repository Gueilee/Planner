// Motor de agendamento — CLAUDE.md §5 (scheduler.ts) e §3 (regras 1,3,4,5,
// 6,8,9,10). Fluxo de recalcular(): fecho transitivo de sucessores →
// ordenação topológica (Kahn, detecta ciclo) → agendarItem para cada, na
// ordem → chamador aplica rollup.ts para os resumos.
//
// Contrato: `items` já reflete qualquer edição direta (data/duração) feita
// pelo chamador ANTES de invocar recalcular — esta função só propaga o
// efeito dessa edição para os sucessores; não redescobre o que mudou.

import { addWorkingDays, somarDuracao, subtrairDuracao } from "./calendar"
import type { Dependency, SchedItem, ScheduleUpdate, WorkCalendar } from "./types"

type ResolvedDates = { inicioEstimado: string | null; terminoEstimado: string | null }

function candidateStart(
  item: SchedItem,
  dep: Dependency,
  resolved: ReadonlyMap<string, ResolvedDates>,
  cal: WorkCalendar
): string | null {
  const pred = resolved.get(dep.predecessorId)
  if (!pred) return null

  switch (dep.type) {
    case "FS": {
      if (pred.terminoEstimado === null) return null
      // regra 1: "+1 dia" do FS é 1 dia útil; lag soma dias úteis extras.
      return addWorkingDays(pred.terminoEstimado, 1 + dep.lag, cal)
    }
    case "SS": {
      if (pred.inicioEstimado === null) return null
      return addWorkingDays(pred.inicioEstimado, dep.lag, cal)
    }
    case "FF": {
      if (pred.terminoEstimado === null) return null
      const candTermino = addWorkingDays(pred.terminoEstimado, dep.lag, cal)
      const duracao = item.duracaoDiasUteis ?? 0
      return subtrairDuracao(candTermino, duracao, cal)
    }
    case "SF":
      // Fora de escopo do v1 (ver plano) — ignorado, não derruba o cálculo.
      return null
  }
}

// regra 3: término = somar_duracao(início, duração) SEMPRE — mesmo para um
// item âncora (sem predecessor) cujo início veio de edição direta, não só
// para os que têm data derivada de um vínculo.
function deriveTermino(item: SchedItem, cal: WorkCalendar): string | null {
  if (item.inicioEstimado !== null && item.duracaoDiasUteis !== null) {
    return somarDuracao(item.inicioEstimado, item.duracaoDiasUteis, cal)
  }
  return item.terminoEstimado
}

function agendarItem(
  item: SchedItem,
  deps: readonly Dependency[],
  resolved: ReadonlyMap<string, ResolvedDates>,
  cal: WorkCalendar
): ScheduleUpdate {
  if (deps.length === 0) {
    // Sem predecessor — âncora ou item ainda não vinculado: início vem do
    // que já está no item de entrada (edição direta do usuário, ou null);
    // término sempre recalculado a partir de início + duração.
    return {
      itemId: item.id,
      inicioEstimado: item.inicioEstimado,
      terminoEstimado: deriveTermino(item, cal),
      conflict: false,
    }
  }

  const candidates = deps
    .map((d) => candidateStart(item, d, resolved, cal))
    .filter((s): s is string => s !== null)

  if (candidates.length === 0) {
    return {
      itemId: item.id,
      inicioEstimado: item.inicioEstimado,
      terminoEstimado: deriveTermino(item, cal),
      conflict: false,
    }
  }

  // regra 9: múltiplos predecessores ⇒ vence a restrição mais tardia.
  const finalStart = candidates.reduce((max, s) => (s > max ? s : max))
  const finalTermino = item.duracaoDiasUteis !== null ? somarDuracao(finalStart, item.duracaoDiasUteis, cal) : null

  if (item.schedulingMode === "manual") {
    // regra §6: vínculo não move item manual, só sinaliza divergência.
    const conflict = finalStart !== item.inicioEstimado || finalTermino !== item.terminoEstimado
    return {
      itemId: item.id,
      inicioEstimado: item.inicioEstimado,
      terminoEstimado: item.terminoEstimado,
      conflict,
      suggestedInicio: conflict ? finalStart : undefined,
      suggestedTermino: conflict ? finalTermino : undefined,
    }
  }

  return { itemId: item.id, inicioEstimado: finalStart, terminoEstimado: finalTermino, conflict: false }
}

export type RecalcResult = {
  updates: ScheduleUpdate[]
  /** itens que não puderam ser ordenados — indício de ciclo não detectado na escrita. */
  cycleItemIds: string[]
}

export function recalcular(
  items: readonly SchedItem[],
  dependencies: readonly Dependency[],
  cal: WorkCalendar,
  changedItemIds: readonly string[]
): RecalcResult {
  const byId = new Map(items.map((i) => [i.id, i]))

  const depsBySuccessor = new Map<string, Dependency[]>()
  const succByPredecessor = new Map<string, string[]>()
  for (const d of dependencies) {
    if (!byId.has(d.successorId) || !byId.has(d.predecessorId)) continue // regra 5: ID inexistente ignorado
    if (!depsBySuccessor.has(d.successorId)) depsBySuccessor.set(d.successorId, [])
    depsBySuccessor.get(d.successorId)!.push(d)
    if (!succByPredecessor.has(d.predecessorId)) succByPredecessor.set(d.predecessorId, [])
    succByPredecessor.get(d.predecessorId)!.push(d.successorId)
  }

  // 1. Fecho transitivo de sucessores a partir dos itens alterados.
  const closure = new Set<string>()
  const queue: string[] = [...changedItemIds].filter((id) => byId.has(id))
  while (queue.length > 0) {
    const id = queue.shift()!
    if (closure.has(id)) continue
    closure.add(id)
    for (const succId of succByPredecessor.get(id) ?? []) {
      if (!closure.has(succId)) queue.push(succId)
    }
  }

  // 2. Ordenação topológica (Kahn) restrita ao fecho — arestas vindas de
  //    fora do fecho são entradas fixas, não entram no grau de entrada.
  const inDegree = new Map<string, number>()
  for (const id of closure) inDegree.set(id, 0)
  for (const d of dependencies) {
    if (closure.has(d.successorId) && closure.has(d.predecessorId)) {
      inDegree.set(d.successorId, (inDegree.get(d.successorId) ?? 0) + 1)
    }
  }

  const ready = [...closure].filter((id) => (inDegree.get(id) ?? 0) === 0)
  const order: string[] = []
  while (ready.length > 0) {
    const id = ready.shift()!
    order.push(id)
    for (const succId of succByPredecessor.get(id) ?? []) {
      if (!closure.has(succId)) continue
      const remaining = (inDegree.get(succId) ?? 0) - 1
      inDegree.set(succId, remaining)
      if (remaining === 0) ready.push(succId)
    }
  }

  const orderedSet = new Set(order)
  const cycleItemIds = order.length < closure.size ? [...closure].filter((id) => !orderedSet.has(id)) : []

  // 3. Agenda cada item na ordem topológica, acumulando datas resolvidas
  //    para servirem de entrada aos sucessores seguintes na mesma passada.
  const resolved = new Map<string, ResolvedDates>()
  for (const item of items) {
    if (!closure.has(item.id)) {
      resolved.set(item.id, { inicioEstimado: item.inicioEstimado, terminoEstimado: item.terminoEstimado })
    }
  }

  const updates: ScheduleUpdate[] = []
  for (const id of order) {
    const item = byId.get(id)
    if (!item) continue
    const deps = depsBySuccessor.get(id) ?? []
    const update = agendarItem(item, deps, resolved, cal)
    updates.push(update)
    resolved.set(id, { inicioEstimado: update.inicioEstimado, terminoEstimado: update.terminoEstimado })
  }

  return { updates, cycleItemIds }
}
