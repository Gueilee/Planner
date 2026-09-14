import { describe, expect, it } from "vitest"
import { computeCriticalPath } from "../critical-path"
import type { Dependency, SchedItem, WorkCalendar } from "../types"

// Mesmo calendário/estilo de fixture de scheduler.test.ts — segunda a
// sexta, sem feriado (exceto onde indicado).
const CAL: WorkCalendar = { diasUteis: [1, 2, 3, 4, 5], holidays: [] }

function item(overrides: Partial<SchedItem> & { id: string }): SchedItem {
  return {
    parentId: null,
    duracaoDiasUteis: 1,
    inicioEstimado: null,
    terminoEstimado: null,
    schedulingMode: "auto",
    ...overrides,
  }
}

function of(result: ReturnType<typeof computeCriticalPath>, id: string) {
  const r = result.find((x) => x.itemId === id)
  if (!r) throw new Error(`sem resultado para ${id}`)
  return r
}

describe("caminho crítico — cadeia simples (FS) toda crítica", () => {
  // A1(âncora,1d,seg 20/04) -> A2(fs,1d) -> A3(fs,1d) -> A4(fs,1d) — datas já
  // resolvidas como o motor as teria gravado (sem pular fim de semana aqui).
  const items = [
    item({ id: "A1", duracaoDiasUteis: 1, inicioEstimado: "2026-04-20", terminoEstimado: "2026-04-20" }),
    item({ id: "A2", duracaoDiasUteis: 1, inicioEstimado: "2026-04-21", terminoEstimado: "2026-04-21" }),
    item({ id: "A3", duracaoDiasUteis: 1, inicioEstimado: "2026-04-22", terminoEstimado: "2026-04-22" }),
    item({ id: "A4", duracaoDiasUteis: 1, inicioEstimado: "2026-04-23", terminoEstimado: "2026-04-23" }),
  ]
  const deps: Dependency[] = [
    { successorId: "A2", predecessorId: "A1", type: "FS", lag: 0 },
    { successorId: "A3", predecessorId: "A2", type: "FS", lag: 0 },
    { successorId: "A4", predecessorId: "A3", type: "FS", lag: 0 },
  ]
  const result = computeCriticalPath(items, deps, CAL)

  it("uma cadeia sem bifurcação é inteira crítica — folga zero em todo mundo", () => {
    for (const id of ["A1", "A2", "A3", "A4"]) {
      expect(of(result, id).totalFloatDays).toBe(0)
      expect(of(result, id).critical).toBe(true)
    }
  })

  it("lateStart/lateFinish coincidem com earlyStart/earlyFinish quando não há folga", () => {
    const a2 = of(result, "A2")
    expect(a2.lateStart).toBe(a2.earlyStart)
    expect(a2.lateFinish).toBe(a2.earlyFinish)
  })
})

describe("caminho crítico — bifurcação convergente: um ramo tem folga, o outro não", () => {
  // A1 (âncora) -> A2 (fs, 1d, ramo curto) e A1 -> A3 (fs, 3d, ramo longo) ->
  // ambos convergem em A4 (fs). Regra 9 do passo de ida ("vence o mais
  // tardio") já fez A4 nascer do ramo LONGO (A3) — logo A3/A4/A1 formam o
  // caminho crítico, e A2 (o ramo curto) sobra com folga.
  const items = [
    item({ id: "A1", duracaoDiasUteis: 1, inicioEstimado: "2026-04-20", terminoEstimado: "2026-04-20" }), // seg
    item({ id: "A2", duracaoDiasUteis: 1, inicioEstimado: "2026-04-21", terminoEstimado: "2026-04-21" }), // ter
    item({ id: "A3", duracaoDiasUteis: 3, inicioEstimado: "2026-04-21", terminoEstimado: "2026-04-23" }), // ter-qui
    item({ id: "A4", duracaoDiasUteis: 1, inicioEstimado: "2026-04-24", terminoEstimado: "2026-04-24" }), // sex (vence o ramo longo)
  ]
  const deps: Dependency[] = [
    { successorId: "A2", predecessorId: "A1", type: "FS", lag: 0 },
    { successorId: "A3", predecessorId: "A1", type: "FS", lag: 0 },
    { successorId: "A4", predecessorId: "A2", type: "FS", lag: 0 },
    { successorId: "A4", predecessorId: "A3", type: "FS", lag: 0 },
  ]
  const result = computeCriticalPath(items, deps, CAL)

  it("A1, A3 e A4 (o ramo longo) são críticos, folga zero", () => {
    expect(of(result, "A1").critical).toBe(true)
    expect(of(result, "A3").critical).toBe(true)
    expect(of(result, "A4").critical).toBe(true)
  })

  it("A2 (o ramo curto) tem 2 dias úteis de folga e NÃO é crítico", () => {
    const a2 = of(result, "A2")
    expect(a2.totalFloatDays).toBe(2)
    expect(a2.critical).toBe(false)
  })
})

describe("caminho crítico — vínculo SS", () => {
  // A1 (âncora, 2d) -> A2 (ss, lag 2, 1d) — sem sucessor depois de A2:
  // cadeia sem bifurcação, então crítica (folga 0), mas o valor exercita a
  // conversão específica do SS (restringe o INÍCIO do predecessor).
  const items = [
    item({ id: "A1", duracaoDiasUteis: 1, inicioEstimado: "2026-04-20", terminoEstimado: "2026-04-20" }),
    item({ id: "A2", duracaoDiasUteis: 1, inicioEstimado: "2026-04-22", terminoEstimado: "2026-04-22" }),
  ]
  const deps: Dependency[] = [{ successorId: "A2", predecessorId: "A1", type: "SS", lag: 2 }]
  const result = computeCriticalPath(items, deps, CAL)

  it("A1 fica com lateStart/lateFinish iguais ao earlyStart/earlyFinish (crítico)", () => {
    const a1 = of(result, "A1")
    expect(a1.lateStart).toBe("2026-04-20")
    expect(a1.lateFinish).toBe("2026-04-20")
    expect(a1.critical).toBe(true)
  })
})

describe("caminho crítico — vínculo FF", () => {
  // A1 (âncora, 2d) -> A2 (ff, lag 0, 1d) — término de A2 amarrado ao
  // término de A1; exercita a conversão específica do FF.
  const items = [
    item({ id: "A1", duracaoDiasUteis: 2, inicioEstimado: "2026-04-20", terminoEstimado: "2026-04-21" }),
    item({ id: "A2", duracaoDiasUteis: 1, inicioEstimado: "2026-04-21", terminoEstimado: "2026-04-21" }),
  ]
  const deps: Dependency[] = [{ successorId: "A2", predecessorId: "A1", type: "FF", lag: 0 }]
  const result = computeCriticalPath(items, deps, CAL)

  it("A1 é crítico com lateStart derivado corretamente (2026-04-20)", () => {
    const a1 = of(result, "A1")
    expect(a1.lateStart).toBe("2026-04-20")
    expect(a1.lateFinish).toBe("2026-04-21")
    expect(a1.critical).toBe(true)
  })
})

describe("caminho crítico — item com data manual cria folga pra quem vem antes", () => {
  // A2 é "manual": o usuário arrastou pra sexta (24/04) em vez do dia
  // seguinte útil que a cascata pura faria nascer (22/04) — o motor nunca
  // move um item manual (regra §6), então isto é exatamente o que fica
  // persistido. O módulo não olha pra `schedulingMode` — só lê a data que
  // JÁ está resolvida; A3 nasce a partir da data manual de A2 (23... na
  // real seria recalculado pelo motor a partir de A2, aqui já simulado).
  const items = [
    item({ id: "A1", duracaoDiasUteis: 1, inicioEstimado: "2026-04-20", terminoEstimado: "2026-04-20" }),
    item({ id: "A2", duracaoDiasUteis: 1, schedulingMode: "manual", inicioEstimado: "2026-04-24", terminoEstimado: "2026-04-24" }),
    item({ id: "A3", duracaoDiasUteis: 1, inicioEstimado: "2026-04-27", terminoEstimado: "2026-04-27" }),
  ]
  const deps: Dependency[] = [
    { successorId: "A2", predecessorId: "A1", type: "FS", lag: 0 },
    { successorId: "A3", predecessorId: "A2", type: "FS", lag: 0 },
  ]
  const result = computeCriticalPath(items, deps, CAL)

  it("A2 e A3 continuam críticos (a cadeia deles é apertada)", () => {
    expect(of(result, "A2").critical).toBe(true)
    expect(of(result, "A3").critical).toBe(true)
  })

  it("A1 ganha 3 dias úteis de folga — o atraso manual de A2 não aperta mais A1", () => {
    const a1 = of(result, "A1")
    expect(a1.totalFloatDays).toBe(3)
    expect(a1.critical).toBe(false)
  })
})

describe("caminho crítico — marco (duração 0) no meio da cadeia crítica", () => {
  const items = [
    item({ id: "A1", duracaoDiasUteis: 2, inicioEstimado: "2026-04-20", terminoEstimado: "2026-04-21" }),
    item({ id: "A2", duracaoDiasUteis: 0, inicioEstimado: "2026-04-22", terminoEstimado: "2026-04-22" }), // marco
    item({ id: "A3", duracaoDiasUteis: 1, inicioEstimado: "2026-04-23", terminoEstimado: "2026-04-23" }),
  ]
  const deps: Dependency[] = [
    { successorId: "A2", predecessorId: "A1", type: "FS", lag: 0 },
    { successorId: "A3", predecessorId: "A2", type: "FS", lag: 0 },
  ]
  const result = computeCriticalPath(items, deps, CAL)

  it("o marco entra no caminho crítico igual a qualquer outra atividade, sem quebrar por duração 0", () => {
    const marco = of(result, "A2")
    expect(marco.lateStart).toBe(marco.earlyStart)
    expect(marco.lateFinish).toBe(marco.earlyFinish)
    expect(marco.critical).toBe(true)
  })

  it("A1 e A3 também ficam críticos", () => {
    expect(of(result, "A1").critical).toBe(true)
    expect(of(result, "A3").critical).toBe(true)
  })
})

describe("caminho crítico — item não agendado é ignorado, não derruba o cálculo", () => {
  const items = [
    item({ id: "A1", duracaoDiasUteis: 1, inicioEstimado: "2026-04-20", terminoEstimado: "2026-04-20" }),
    item({ id: "A2", duracaoDiasUteis: null, inicioEstimado: null, terminoEstimado: null }), // não agendado
  ]
  const result = computeCriticalPath(items, [], CAL)

  it("item sem data simplesmente não aparece no resultado", () => {
    expect(result.find((r) => r.itemId === "A2")).toBeUndefined()
  })

  it("item agendado continua sendo calculado normalmente", () => {
    expect(of(result, "A1").critical).toBe(true)
  })
})

describe("caminho crítico — dependência com ID de predecessor inexistente é ignorada (regra 5)", () => {
  const items = [item({ id: "A1", duracaoDiasUteis: 1, inicioEstimado: "2026-04-20", terminoEstimado: "2026-04-20" })]
  const deps: Dependency[] = [{ successorId: "A1", predecessorId: "FANTASMA", type: "FS", lag: 0 }]

  it("não lança erro e trata A1 como se não tivesse esse vínculo", () => {
    const result = computeCriticalPath(items, deps, CAL)
    expect(of(result, "A1").critical).toBe(true)
  })
})

describe("caminho crítico — ciclo não detectado na escrita não trava o cálculo", () => {
  // A rigor, dependency-parser.ts já bloqueia isto na gravação — este teste
  // cobre a segunda linha de defesa (mesma postura de scheduler.ts).
  const items = [
    item({ id: "A1", duracaoDiasUteis: 1, inicioEstimado: "2026-04-20", terminoEstimado: "2026-04-20" }),
    item({ id: "A2", duracaoDiasUteis: 1, inicioEstimado: "2026-04-21", terminoEstimado: "2026-04-21" }),
    item({ id: "A3", duracaoDiasUteis: 1, inicioEstimado: "2026-04-22", terminoEstimado: "2026-04-22" }), // independente do ciclo
  ]
  const deps: Dependency[] = [
    { successorId: "A1", predecessorId: "A2", type: "FS", lag: 0 },
    { successorId: "A2", predecessorId: "A1", type: "FS", lag: 0 },
  ]
  const result = computeCriticalPath(items, deps, CAL)

  it("os itens em ciclo ficam de fora do resultado", () => {
    expect(result.find((r) => r.itemId === "A1")).toBeUndefined()
    expect(result.find((r) => r.itemId === "A2")).toBeUndefined()
  })

  it("o item independente do ciclo é calculado normalmente", () => {
    expect(of(result, "A3").critical).toBe(true)
  })
})
