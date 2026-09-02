import { describe, expect, it } from "vitest"
import { recalcular } from "../scheduler"
import { rollupGroups, projectEndDate } from "../rollup"
import type { Dependency, SchedItem, WorkCalendar } from "../types"

// Calendário sem feriados para T1-T4 (só precisamos do comportamento de
// fim de semana); T10 usa um calendário com feriado à parte.
const CAL: WorkCalendar = { diasUteis: [1, 2, 3, 4, 5], holidays: [] }

// Cadeia base do CLAUDE.md §9: A1 (âncora, sem predecessor) -> A2(A1?) ->
// A3(A2fs) -> A4(A3fs), A2/A3/A4 com 1 dia de duração.
// A1 termina numa quinta-feira (2026-04-23) de propósito, para que o
// próximo dia útil caia numa sexta e o encadeamento seguinte "pule" o
// fim de semana — replicando exatamente o cenário descrito no §9.
function baseItems(overrides: Partial<Record<"A2type" | "A2lag", unknown>> = {}): SchedItem[] {
  return [
    { id: "A1", parentId: null, duracaoDiasUteis: 4, inicioEstimado: "2026-04-20", terminoEstimado: "2026-04-23", schedulingMode: "auto" },
    { id: "A2", parentId: null, duracaoDiasUteis: 1, inicioEstimado: null, terminoEstimado: null, schedulingMode: "auto" },
    { id: "A3", parentId: null, duracaoDiasUteis: 1, inicioEstimado: null, terminoEstimado: null, schedulingMode: "auto" },
    { id: "A4", parentId: null, duracaoDiasUteis: 1, inicioEstimado: null, terminoEstimado: null, schedulingMode: "auto" },
  ]
}

function updateOf(result: ReturnType<typeof recalcular>, id: string) {
  const u = result.updates.find((x) => x.itemId === id)
  if (!u) throw new Error(`sem update para ${id}`)
  return u
}

describe("scheduler — cadeia base T1/T2 (FS)", () => {
  const items = baseItems()
  const deps: Dependency[] = [
    { successorId: "A2", predecessorId: "A1", type: "FS", lag: 0 },
    { successorId: "A3", predecessorId: "A2", type: "FS", lag: 0 },
    { successorId: "A4", predecessorId: "A3", type: "FS", lag: 0 },
  ]
  const result = recalcular(items, deps, CAL, ["A1"])

  it("T1: A2 = A1fs, A1 termina quinta -> A2 inicia sexta (dia útil seguinte)", () => {
    expect(updateOf(result, "A2").inicioEstimado).toBe("2026-04-24") // sexta
    expect(updateOf(result, "A2").terminoEstimado).toBe("2026-04-24")
  })

  it("T2: A3 = A2fs, A2 termina sexta -> A3 inicia segunda (pula fim de semana)", () => {
    expect(updateOf(result, "A3").inicioEstimado).toBe("2026-04-27") // segunda
    expect(updateOf(result, "A3").terminoEstimado).toBe("2026-04-27")
  })

  it("cascata continua corretamente até A4", () => {
    expect(updateOf(result, "A4").inicioEstimado).toBe("2026-04-28") // terça
  })

  it("A1 (âncora, editada diretamente) não tem suas datas alteradas pelo recálculo", () => {
    // A1 é o próprio item alterado (sem predecessor) — pode aparecer no
    // resultado (eco), mas com as MESMAS datas que já tinha antes.
    const a1 = result.updates.find((u) => u.itemId === "A1")
    if (a1) {
      expect(a1.inicioEstimado).toBe("2026-04-20")
      expect(a1.terminoEstimado).toBe("2026-04-23")
    }
  })
})

describe("scheduler — T3 (SS)", () => {
  const items = baseItems()
  const deps: Dependency[] = [
    { successorId: "A2", predecessorId: "A1", type: "SS", lag: 0 },
    { successorId: "A3", predecessorId: "A2", type: "FS", lag: 0 },
    { successorId: "A4", predecessorId: "A3", type: "FS", lag: 0 },
  ]
  const result = recalcular(items, deps, CAL, ["A1"])

  it("A2 = A1ss inicia no mesmo dia que A1 (28/09 equivalente)", () => {
    expect(updateOf(result, "A2").inicioEstimado).toBe("2026-04-20")
    expect(updateOf(result, "A2").terminoEstimado).toBe("2026-04-20")
  })

  it("cascata A3/A4 segue a partir do novo término de A2", () => {
    expect(updateOf(result, "A3").inicioEstimado).toBe("2026-04-21")
    expect(updateOf(result, "A4").inicioEstimado).toBe("2026-04-22")
  })

  it("fim do projeto = max(término) = término de A1 (a âncora domina)", () => {
    const merged = items.map((i) => {
      const u = result.updates.find((x) => x.itemId === i.id)
      return u ? { ...i, inicioEstimado: u.inicioEstimado, terminoEstimado: u.terminoEstimado } : i
    })
    expect(projectEndDate(merged)).toBe("2026-04-23")
  })
})

describe("scheduler — T4 (FF)", () => {
  const items = baseItems()
  const deps: Dependency[] = [
    { successorId: "A2", predecessorId: "A1", type: "FF", lag: 0 },
    { successorId: "A3", predecessorId: "A2", type: "FS", lag: 0 },
    { successorId: "A4", predecessorId: "A3", type: "FS", lag: 0 },
  ]
  const result = recalcular(items, deps, CAL, ["A1"])

  it("A2 = A1ff termina no mesmo dia que A1 termina", () => {
    expect(updateOf(result, "A2").terminoEstimado).toBe("2026-04-23")
    expect(updateOf(result, "A2").inicioEstimado).toBe("2026-04-23") // duração 1 dia
  })

  it("cascata A3 (sexta) e A4 pula fim de semana (segunda)", () => {
    expect(updateOf(result, "A3").inicioEstimado).toBe("2026-04-24")
    expect(updateOf(result, "A4").inicioEstimado).toBe("2026-04-27")
  })
})

describe("scheduler — lag em SS/FF e regra 9 (múltiplos predecessores)", () => {
  it("SS+2: sucessor inicia 2 dias úteis depois do início do predecessor", () => {
    const items = baseItems()
    const deps: Dependency[] = [{ successorId: "A2", predecessorId: "A1", type: "SS", lag: 2 }]
    const result = recalcular(items, deps, CAL, ["A1"])
    // A1 início segunda 20/04 + 2 dias úteis = quarta 22/04
    expect(updateOf(result, "A2").inicioEstimado).toBe("2026-04-22")
  })

  it("regra 9: múltiplos predecessores -> vence a restrição mais tardia (max)", () => {
    const items: SchedItem[] = [
      { id: "A1", parentId: null, duracaoDiasUteis: 1, inicioEstimado: "2026-04-20", terminoEstimado: "2026-04-20", schedulingMode: "auto" },
      { id: "B1", parentId: null, duracaoDiasUteis: 1, inicioEstimado: "2026-04-22", terminoEstimado: "2026-04-22", schedulingMode: "auto" },
      { id: "C1", parentId: null, duracaoDiasUteis: 1, inicioEstimado: null, terminoEstimado: null, schedulingMode: "auto" },
    ]
    const deps: Dependency[] = [
      { successorId: "C1", predecessorId: "A1", type: "FS", lag: 0 }, // candidato: 21/04 (terça)
      { successorId: "C1", predecessorId: "B1", type: "FS", lag: 0 }, // candidato: 23/04 (quinta) — mais tardio
    ]
    const result = recalcular(items, deps, CAL, ["A1", "B1"])
    expect(updateOf(result, "C1").inicioEstimado).toBe("2026-04-23")
  })
})

describe("scheduler — T5/T6 já cobertos em dependency-parser.test.ts; aqui validamos que o scheduler ignora dependência para ID inexistente sem lançar erro", () => {
  it("T6: dependência com predecessorId que não existe na lista de itens é ignorada", () => {
    const items = baseItems()
    const deps: Dependency[] = [{ successorId: "A2", predecessorId: "id-inexistente", type: "FS", lag: 0 }]
    expect(() => recalcular(items, deps, CAL, ["A2"])).not.toThrow()
    const result = recalcular(items, deps, CAL, ["A2"])
    // sem predecessor válido -> A2 mantém suas próprias datas (null, já que nunca foi agendado)
    expect(updateOf(result, "A2").inicioEstimado).toBeNull()
  })
})

describe("scheduler — T7 (item nasce sem data)", () => {
  it("item novo sem duração/datas/predecessor não quebra o cálculo dos demais", () => {
    const items: SchedItem[] = [
      ...baseItems(),
      { id: "NOVO", parentId: null, duracaoDiasUteis: null, inicioEstimado: null, terminoEstimado: null, schedulingMode: "auto" },
    ]
    const deps: Dependency[] = [{ successorId: "A2", predecessorId: "A1", type: "FS", lag: 0 }]
    const result = recalcular(items, deps, CAL, ["A1", "NOVO"])
    const novo = updateOf(result, "NOVO")
    expect(novo.inicioEstimado).toBeNull()
    expect(novo.terminoEstimado).toBeNull()
    expect(updateOf(result, "A2").inicioEstimado).toBe("2026-04-24") // não afetado pelo item sem data
  })
})

describe("scheduler — T8 (reparent preserva datas/vínculos; recalcula resumos)", () => {
  it("mover um item folha para dentro de outro grupo preserva suas datas e recalcula os dois grupos", () => {
    const before: SchedItem[] = [
      { id: "G1", parentId: null, duracaoDiasUteis: null, inicioEstimado: null, terminoEstimado: null, schedulingMode: "auto" },
      { id: "G2", parentId: null, duracaoDiasUteis: null, inicioEstimado: null, terminoEstimado: null, schedulingMode: "auto" },
      { id: "T1", parentId: "G1", duracaoDiasUteis: 1, inicioEstimado: "2026-04-20", terminoEstimado: "2026-04-20", schedulingMode: "auto" },
      { id: "T2", parentId: "G2", duracaoDiasUteis: 1, inicioEstimado: "2026-04-22", terminoEstimado: "2026-04-22", schedulingMode: "auto" },
    ]
    const rollupBefore = rollupGroups(before)
    expect(rollupBefore.get("G1")?.terminoEstimado).toBe("2026-04-20")
    expect(rollupBefore.get("G2")?.terminoEstimado).toBe("2026-04-22")

    // Reparent: T1 sai de G1 e entra em G2 — datas e vínculos de T1 preservados
    // (nenhum campo de data é tocado, só parentId).
    const after: SchedItem[] = before.map((i) => (i.id === "T1" ? { ...i, parentId: "G2" } : i))
    const t1After = after.find((i) => i.id === "T1")!
    expect(t1After.inicioEstimado).toBe("2026-04-20")
    expect(t1After.terminoEstimado).toBe("2026-04-20")

    const rollupAfter = rollupGroups(after)
    // Origem (G1) fica vazio -> sem datas.
    expect(rollupAfter.get("G1")?.terminoEstimado).toBeNull()
    // Destino (G2) passa a cobrir T1 e T2 -> término = max(20/04, 22/04).
    expect(rollupAfter.get("G2")?.terminoEstimado).toBe("2026-04-22")
    expect(rollupAfter.get("G2")?.inicioEstimado).toBe("2026-04-20")

    // Nota: undo/redo fica fora do escopo do v1 (ver plano) — este teste
    // valida só a preservação de datas/vínculos e o recálculo dos resumos.
  })
})

describe("scheduler — T10 (feriado no meio da cadeia)", () => {
  const CAL_COM_FERIADO: WorkCalendar = {
    diasUteis: [1, 2, 3, 4, 5],
    holidays: [{ date: "2026-04-24", name: "Feriado de teste" }], // cairia numa sexta
  }

  it("a data pula o feriado, igual pula fim de semana", () => {
    const items = baseItems()
    const deps: Dependency[] = [{ successorId: "A2", predecessorId: "A1", type: "FS", lag: 0 }]
    const result = recalcular(items, deps, CAL_COM_FERIADO, ["A1"])
    // A1 termina quinta 23/04; sexta 24/04 é feriado; sáb/dom pulados -> segunda 27/04
    expect(updateOf(result, "A2").inicioEstimado).toBe("2026-04-27")
  })
})

describe("scheduler — regra §6 (modo manual não é movido pelo vínculo)", () => {
  it("item manual mantém sua data mas recebe sinalização de conflito", () => {
    const items = baseItems().map((i) =>
      i.id === "A2" ? { ...i, schedulingMode: "manual" as const, inicioEstimado: "2026-04-30", terminoEstimado: "2026-04-30" } : i
    )
    const deps: Dependency[] = [{ successorId: "A2", predecessorId: "A1", type: "FS", lag: 0 }]
    const result = recalcular(items, deps, CAL, ["A1"])
    const a2 = updateOf(result, "A2")
    expect(a2.inicioEstimado).toBe("2026-04-30") // não moveu
    expect(a2.conflict).toBe(true)
    expect(a2.suggestedInicio).toBe("2026-04-24") // o que o vínculo sugeriria
  })

  it("item manual sem divergência não sinaliza conflito", () => {
    const items = baseItems().map((i) =>
      i.id === "A2" ? { ...i, schedulingMode: "manual" as const, inicioEstimado: "2026-04-24", terminoEstimado: "2026-04-24" } : i
    )
    const deps: Dependency[] = [{ successorId: "A2", predecessorId: "A1", type: "FS", lag: 0 }]
    const result = recalcular(items, deps, CAL, ["A1"])
    expect(updateOf(result, "A2").conflict).toBe(false)
  })
})

describe("scheduler — regra 3 (término sempre derivado de início+duração, mesmo em âncora)", () => {
  it("item sem predecessor recalcula término quando a duração muda", () => {
    const items: SchedItem[] = [
      { id: "A1", parentId: null, duracaoDiasUteis: 6, inicioEstimado: "2026-04-20", terminoEstimado: "2026-04-23", schedulingMode: "auto" },
    ]
    // duração antiga (4) gerava término 23/04; nova duração (6) deve mover
    // o término, mesmo sem nenhum vínculo — a duração é a fonte da verdade.
    const result = recalcular(items, [], CAL, ["A1"])
    expect(updateOf(result, "A1").terminoEstimado).toBe("2026-04-27")
  })

  it("item sem duração definida mantém término como estava (não quebra)", () => {
    const items: SchedItem[] = [
      { id: "A1", parentId: null, duracaoDiasUteis: null, inicioEstimado: "2026-04-20", terminoEstimado: null, schedulingMode: "auto" },
    ]
    const result = recalcular(items, [], CAL, ["A1"])
    expect(updateOf(result, "A1").terminoEstimado).toBeNull()
  })
})

describe("scheduler — detecção defensiva de ciclo no recálculo", () => {
  it("itens presos num ciclo não travam o motor e voltam em cycleItemIds", () => {
    const items: SchedItem[] = [
      { id: "A", parentId: null, duracaoDiasUteis: 1, inicioEstimado: null, terminoEstimado: null, schedulingMode: "auto" },
      { id: "B", parentId: null, duracaoDiasUteis: 1, inicioEstimado: null, terminoEstimado: null, schedulingMode: "auto" },
    ]
    // Ciclo A -> B -> A (não deveria existir se wouldCreateCycle for checado
    // na escrita — este teste cobre o caso defensivo de já existir no banco).
    const deps: Dependency[] = [
      { successorId: "B", predecessorId: "A", type: "FS", lag: 0 },
      { successorId: "A", predecessorId: "B", type: "FS", lag: 0 },
    ]
    expect(() => recalcular(items, deps, CAL, ["A"])).not.toThrow()
    const result = recalcular(items, deps, CAL, ["A"])
    expect(result.cycleItemIds.sort()).toEqual(["A", "B"])
  })
})
