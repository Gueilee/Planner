// Caminho crítico (CPM) — CLAUDE.md §5 citava "critical-path.ts" desde o
// início como módulo do motor, nunca implementado até agora.
//
// Só o passo de VOLTA (backward pass) do CPM clássico é feito aqui: o passo
// de IDA (earlyStart/earlyFinish) já é o que scheduler.ts::recalcular
// resolve e persiste — essas datas (as mesmas que a grade e o Gantt já
// mostram) são usadas como entrada. Isso garante que o caminho crítico
// NUNCA diverge do cronograma real: não existe um "cálculo paralelo" que
// possa discordar da tela, só uma leitura de trás pra frente sobre o que
// já está agendado.
//
// Só participam itens-folha com início/término já resolvidos — grupo não
// tem vínculo próprio (datas só vêm de rollup.ts) e item não agendado não
// tem o que analisar (regra §10). Chamador é responsável por filtrar isso
// antes de chamar (mesmo contrato de scheduler.ts::recalcular).

import { addWorkingDays, somarDuracao, subtrairDuracao, workingDaysBetween } from "./calendar"
import type { Dependency, SchedItem, WorkCalendar } from "./types"

export type CriticalPathItem = {
  itemId: string
  earlyStart: string
  earlyFinish: string
  lateStart: string
  lateFinish: string
  /** Dias úteis de sobra entre a data mais cedo e a mais tarde possíveis. */
  totalFloatDays: number
  /** totalFloatDays <= 0 — nenhuma margem, um atraso aqui atrasa o projeto. */
  critical: boolean
}

type LateDates = { lateStart: string; lateFinish: string }

// Inverso de scheduler.ts::candidateStart — em vez de "candidata de início
// pro sucessor a partir do predecessor", calcula "candidata de término
// tardio pro predecessor a partir do sucessor" (já convertida pra término,
// mesmo quando o vínculo restringe o início — via somarDuracao/
// subtrairDuracao — pra sempre comparar valores do mesmo tipo entre si).
function candidateLateFinish(
  predDuracao: number,
  dep: Dependency,
  succLate: LateDates,
  cal: WorkCalendar
): string | null {
  switch (dep.type) {
    case "FS":
      // inverso de: succ.inicio = addWorkingDays(pred.termino, 1+lag)
      return addWorkingDays(succLate.lateStart, -(1 + dep.lag), cal)
    case "SS": {
      // inverso de: succ.inicio = addWorkingDays(pred.inicio, lag) — aqui a
      // restrição é sobre o INÍCIO do predecessor, não o término; converte
      // pra término via a própria duração dele, só pra comparar candidatos
      // no mesmo tipo de valor (regra do mínimo, mais abaixo).
      const candLateStart = addWorkingDays(succLate.lateStart, -dep.lag, cal)
      return somarDuracao(candLateStart, predDuracao, cal)
    }
    case "FF":
      // inverso de: succ.termino = addWorkingDays(pred.termino, lag)
      return addWorkingDays(succLate.lateFinish, -dep.lag, cal)
    case "SF":
      // Fora de escopo do v1 (mesma decisão do passo de ida) — ignorado.
      return null
  }
}

export function computeCriticalPath(
  items: readonly SchedItem[],
  dependencies: readonly Dependency[],
  cal: WorkCalendar
): CriticalPathItem[] {
  // Defesa extra além do contrato — só itens com data resolvida participam.
  const scheduled = items.filter((i) => i.inicioEstimado !== null && i.terminoEstimado !== null)
  const byId = new Map(scheduled.map((i) => [i.id, i]))

  const succDepsByPredecessor = new Map<string, Dependency[]>()
  const inDegree = new Map<string, number>()
  for (const id of byId.keys()) inDegree.set(id, 0)
  for (const d of dependencies) {
    if (!byId.has(d.successorId) || !byId.has(d.predecessorId)) continue // regra 5: ID inexistente ignorado
    if (!succDepsByPredecessor.has(d.predecessorId)) succDepsByPredecessor.set(d.predecessorId, [])
    succDepsByPredecessor.get(d.predecessorId)!.push(d)
    inDegree.set(d.successorId, (inDegree.get(d.successorId) ?? 0) + 1)
  }

  // Ordenação topológica (Kahn) do grafo inteiro — ao contrário do
  // recalcular() (que só ordena o fecho a partir de um item alterado), o
  // caminho crítico precisa do grafo completo pra andar de trás pra frente.
  const ready = [...byId.keys()].filter((id) => (inDegree.get(id) ?? 0) === 0)
  const order: string[] = []
  while (ready.length > 0) {
    const id = ready.shift()!
    order.push(id)
    for (const dep of succDepsByPredecessor.get(id) ?? []) {
      const remaining = (inDegree.get(dep.successorId) ?? 0) - 1
      inDegree.set(dep.successorId, remaining)
      if (remaining === 0) ready.push(dep.successorId)
    }
  }
  // Item fora de `order` = indício de ciclo não detectado na escrita (devia
  // ter sido barrado antes de gravar) — fica de fora do cálculo, mesma
  // postura defensiva do scheduler: nunca derruba o resultado dos demais.
  const orderedSet = new Set(order)

  const late = new Map<string, LateDates>()
  // Passo de volta: processa em ordem REVERSA (sucessor sempre resolvido
  // antes do predecessor que depende dele).
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i]
    const item = byId.get(id)!
    const duracao = item.duracaoDiasUteis ?? 0

    const candidates = (succDepsByPredecessor.get(id) ?? [])
      .filter((d) => orderedSet.has(d.successorId))
      .map((d) => {
        const succLate = late.get(d.successorId)
        return succLate ? candidateLateFinish(duracao, d, succLate, cal) : null
      })
      .filter((s): s is string => s !== null)

    // Sem sucessor (ou nenhum vínculo suportado) ⇒ nada empurra este item
    // pra trás: sua data mais tarde possível é a própria data já resolvida.
    // Com sucessores, vence o candidato MAIS CEDO (o inverso do passo de
    // ida, que usa o mais tarde — aqui quem manda é a restrição mais
    // apertada vinda de quem depende deste item).
    const lateFinish = candidates.length > 0
      ? candidates.reduce((min, s) => (s < min ? s : min))
      : item.terminoEstimado!
    const lateStart = subtrairDuracao(lateFinish, duracao, cal)
    late.set(id, { lateStart, lateFinish })
  }

  return scheduled
    .filter((item) => orderedSet.has(item.id))
    .map((item) => {
      const l = late.get(item.id)!
      const totalFloatDays = workingDaysBetween(item.inicioEstimado!, l.lateStart, cal)
      return {
        itemId: item.id,
        earlyStart: item.inicioEstimado!,
        earlyFinish: item.terminoEstimado!,
        lateStart: l.lateStart,
        lateFinish: l.lateFinish,
        totalFloatDays,
        critical: totalFloatDays <= 0,
      }
    })
}
