import { describe, expect, it } from "vitest"
import { projectEndDate, projectStartDate, rollupGroups, rollupProgress, rollupStatus } from "../rollup"
import type { ProgressItem, StatusItem } from "../rollup"
import type { SchedItem } from "../types"

function item(over: Partial<SchedItem> & { id: string }): SchedItem {
  return {
    parentId: null,
    duracaoDiasUteis: null,
    inicioEstimado: null,
    terminoEstimado: null,
    schedulingMode: "auto",
    ...over,
  }
}

describe("rollup — datas de grupo (§3.7)", () => {
  it("grupo com filhos = min(início)/max(término); folha mantém a própria data", () => {
    const items: SchedItem[] = [
      item({ id: "G1" }),
      item({ id: "T1", parentId: "G1", inicioEstimado: "2026-04-20", terminoEstimado: "2026-04-21" }),
      item({ id: "T2", parentId: "G1", inicioEstimado: "2026-04-22", terminoEstimado: "2026-04-24" }),
    ]
    const rolled = rollupGroups(items)
    expect(rolled.get("G1")).toEqual({ id: "G1", inicioEstimado: "2026-04-20", terminoEstimado: "2026-04-24" })
    expect(rolled.get("T1")).toEqual({ id: "T1", inicioEstimado: "2026-04-20", terminoEstimado: "2026-04-21" })
  })

  it("ignora filhos não agendados (§3.10) no min/max do grupo", () => {
    const items: SchedItem[] = [
      item({ id: "G1" }),
      item({ id: "T1", parentId: "G1", inicioEstimado: "2026-04-20", terminoEstimado: "2026-04-20" }),
      item({ id: "T2", parentId: "G1" }), // sem data
    ]
    expect(rollupGroups(items).get("G1")?.terminoEstimado).toBe("2026-04-20")
  })

  it("grupo sem nenhum filho agendado fica sem data", () => {
    const items: SchedItem[] = [item({ id: "G1" }), item({ id: "T1", parentId: "G1" })]
    expect(rollupGroups(items).get("G1")).toEqual({ id: "G1", inicioEstimado: null, terminoEstimado: null })
  })

  it("recursivo em árvore de 3 níveis (grupo de grupos)", () => {
    const items: SchedItem[] = [
      item({ id: "P" }),
      item({ id: "G1", parentId: "P" }),
      item({ id: "T1", parentId: "G1", inicioEstimado: "2026-04-20", terminoEstimado: "2026-04-20" }),
      item({ id: "T2", parentId: "G1", inicioEstimado: "2026-04-27", terminoEstimado: "2026-04-27" }),
    ]
    const rolled = rollupGroups(items)
    expect(rolled.get("G1")?.terminoEstimado).toBe("2026-04-27")
    expect(rolled.get("P")?.terminoEstimado).toBe("2026-04-27") // sobe até o topo
  })
})

describe("rollup — progresso de grupo (média dos filhos diretos)", () => {
  it("grupo = média simples dos filhos diretos", () => {
    const items: ProgressItem[] = [
      { id: "G1", parentId: null, percentualCompleto: 0 },
      { id: "T1", parentId: "G1", percentualCompleto: 40 },
      { id: "T2", parentId: "G1", percentualCompleto: 60 },
    ]
    expect(rollupProgress(items).get("G1")).toBe(50)
  })

  it("folha mantém o próprio percentual", () => {
    const items: ProgressItem[] = [{ id: "T1", parentId: null, percentualCompleto: 73 }]
    expect(rollupProgress(items).get("T1")).toBe(73)
  })

  it("recursivo: grupo de grupos usa a média já resolvida dos filhos diretos", () => {
    const items: ProgressItem[] = [
      { id: "P", parentId: null, percentualCompleto: 0 },
      { id: "G1", parentId: "P", percentualCompleto: 0 },
      { id: "G2", parentId: "P", percentualCompleto: 0 },
      { id: "T1", parentId: "G1", percentualCompleto: 100 },
      { id: "T2", parentId: "G2", percentualCompleto: 0 },
    ]
    const rolled = rollupProgress(items)
    expect(rolled.get("G1")).toBe(100)
    expect(rolled.get("G2")).toBe(0)
    expect(rolled.get("P")).toBe(50) // média de G1(100) e G2(0), não das folhas direto
  })
})

describe("projectEndDate", () => {
  it("é o max(término) entre todos os itens agendados", () => {
    const items: SchedItem[] = [
      item({ id: "A", terminoEstimado: "2026-04-20" }),
      item({ id: "B", terminoEstimado: "2026-04-27" }),
      item({ id: "C" }), // sem data, ignorado
    ]
    expect(projectEndDate(items)).toBe("2026-04-27")
  })

  it("retorna null quando nenhum item tem término", () => {
    expect(projectEndDate([item({ id: "A" })])).toBeNull()
  })
})

describe("projectStartDate", () => {
  it("é o min(início) entre todos os itens agendados", () => {
    const items: SchedItem[] = [
      item({ id: "A", inicioEstimado: "2026-04-20" }),
      item({ id: "B", inicioEstimado: "2026-04-13" }),
      item({ id: "C" }), // sem data, ignorado
    ]
    expect(projectStartDate(items)).toBe("2026-04-13")
  })

  it("retorna null quando nenhum item tem início", () => {
    expect(projectStartDate([item({ id: "A" })])).toBeNull()
  })
})

describe("rollupStatus — grupo herda o status mais crítico dos filhos diretos", () => {
  function st(over: Partial<StatusItem> & { id: string }): StatusItem {
    return { parentId: null, status: "A_INICIAR", ...over }
  }

  it("todos os filhos Concluído ⇒ grupo Concluído", () => {
    const items: StatusItem[] = [
      st({ id: "G1" }),
      st({ id: "T1", parentId: "G1", status: "CONCLUIDO" }),
      st({ id: "T2", parentId: "G1", status: "CONCLUIDO" }),
    ]
    expect(rollupStatus(items).get("G1")).toBe("CONCLUIDO")
  })

  it("um filho Em Andamento entre Concluídos ⇒ grupo Em Andamento (não fica preso em Concluído nem A Iniciar)", () => {
    const items: StatusItem[] = [
      st({ id: "G1" }),
      st({ id: "T1", parentId: "G1", status: "CONCLUIDO" }),
      st({ id: "T2", parentId: "G1", status: "EM_ANDAMENTO" }),
    ]
    expect(rollupStatus(items).get("G1")).toBe("EM_ANDAMENTO")
  })

  it("prioridade: Atrasado vence sobre Pausado, Em Andamento e A Iniciar", () => {
    const items: StatusItem[] = [
      st({ id: "G1" }),
      st({ id: "T1", parentId: "G1", status: "PAUSADO" }),
      st({ id: "T2", parentId: "G1", status: "EM_ANDAMENTO" }),
      st({ id: "T3", parentId: "G1", status: "ATRASADO" }),
      st({ id: "T4", parentId: "G1", status: "A_INICIAR" }),
    ]
    expect(rollupStatus(items).get("G1")).toBe("ATRASADO")
  })

  it("prioridade: Pausado vence sobre Em Andamento e A Iniciar (sem Atrasado)", () => {
    const items: StatusItem[] = [
      st({ id: "G1" }),
      st({ id: "T1", parentId: "G1", status: "EM_ANDAMENTO" }),
      st({ id: "T2", parentId: "G1", status: "PAUSADO" }),
      st({ id: "T3", parentId: "G1", status: "A_INICIAR" }),
    ]
    expect(rollupStatus(items).get("G1")).toBe("PAUSADO")
  })

  it("todos A Iniciar ⇒ grupo A Iniciar", () => {
    const items: StatusItem[] = [
      st({ id: "G1" }),
      st({ id: "T1", parentId: "G1", status: "A_INICIAR" }),
      st({ id: "T2", parentId: "G1", status: "A_INICIAR" }),
    ]
    expect(rollupStatus(items).get("G1")).toBe("A_INICIAR")
  })

  it("folha mantém o próprio status (nunca sobrescrita por rollup)", () => {
    const items: StatusItem[] = [st({ id: "T1", status: "PAUSADO" })]
    expect(rollupStatus(items).get("T1")).toBe("PAUSADO")
  })

  it("recursivo: grupo de grupos usa o status já resolvido dos filhos diretos", () => {
    const items: StatusItem[] = [
      st({ id: "P" }),
      st({ id: "G1", parentId: "P" }),
      st({ id: "G2", parentId: "P" }),
      st({ id: "T1", parentId: "G1", status: "CONCLUIDO" }),
      st({ id: "T2", parentId: "G2", status: "ATRASADO" }),
    ]
    const rolled = rollupStatus(items)
    expect(rolled.get("G1")).toBe("CONCLUIDO")
    expect(rolled.get("G2")).toBe("ATRASADO")
    expect(rolled.get("P")).toBe("ATRASADO") // pega o pior entre G1(Concluído) e G2(Atrasado)
  })
})
