import { describe, expect, it } from "vitest"
import { dropUnknownCodes, parsePredecessorToken, parsePredecessors, wouldCreateCycle } from "../dependency-parser"

describe("dependency-parser — sintaxe de predecessor", () => {
  it("T5: sigla omitida normaliza para FS", () => {
    expect(parsePredecessorToken("A3")).toEqual({ code: "A3", type: "FS", lag: 0 })
  })

  it("reconhece FS explícito", () => {
    expect(parsePredecessorToken("A1fs")).toEqual({ code: "A1", type: "FS", lag: 0 })
  })

  it("reconhece SS com lag positivo", () => {
    expect(parsePredecessorToken("A1ss+2")).toEqual({ code: "A1", type: "SS", lag: 2 })
  })

  it("reconhece FF com lag negativo", () => {
    expect(parsePredecessorToken("A1ff-1")).toEqual({ code: "A1", type: "FF", lag: -1 })
  })

  it("reconhece SF (aceito no parser, ainda não implementado no scheduler)", () => {
    expect(parsePredecessorToken("A1sf")).toEqual({ code: "A1", type: "SF", lag: 0 })
  })

  it("aceita código de EAP com pontos", () => {
    expect(parsePredecessorToken("3.1.1fs")).toEqual({ code: "3.1.1", type: "FS", lag: 0 })
  })

  it("é case-insensitive para a sigla", () => {
    expect(parsePredecessorToken("A1SS+2")).toEqual({ code: "A1", type: "SS", lag: 2 })
  })

  it("token vazio retorna null", () => {
    expect(parsePredecessorToken("")).toBeNull()
    expect(parsePredecessorToken("   ")).toBeNull()
  })

  it("parsePredecessors separa por ; e , ignorando espaços", () => {
    expect(parsePredecessors("A1; A2fs, A3ss+2")).toEqual([
      { code: "A1", type: "FS", lag: 0 },
      { code: "A2", type: "FS", lag: 0 },
      { code: "A3", type: "SS", lag: 2 },
    ])
  })

  it("T6: código de predecessor inexistente é ignorado (não lança erro)", () => {
    const parsed = parsePredecessors("A1; 1; A2")
    const valid = new Set(["A1", "A2"])
    expect(dropUnknownCodes(parsed, valid)).toEqual([
      { code: "A1", type: "FS", lag: 0 },
      { code: "A2", type: "FS", lag: 0 },
    ])
  })
})

describe("dependency-parser — detecção de ciclo (T9)", () => {
  it("rejeita auto-referência (S == P)", () => {
    expect(wouldCreateCycle("A1", "A1", new Map())).toBe(true)
  })

  it("rejeita ciclo direto A -> B -> A", () => {
    // B já depende de A (edges: successorId -> [predecessorIds])
    const edges = new Map([["B", ["A"]]])
    // Tentando gravar: A depende de B (successor=A, predecessor=B) fecharia o ciclo
    expect(wouldCreateCycle("A", "B", edges)).toBe(true)
  })

  it("rejeita ciclo indireto A -> B -> C -> A", () => {
    const edges = new Map([
      ["B", ["A"]],
      ["C", ["B"]],
    ])
    expect(wouldCreateCycle("A", "C", edges)).toBe(true)
  })

  it("aceita dependência válida sem ciclo", () => {
    const edges = new Map([["B", ["A"]]])
    expect(wouldCreateCycle("C", "B", edges)).toBe(false)
  })
})
