import { describe, expect, it } from "vitest"
import { buildSearchQuery } from "../client"

describe("buildSearchQuery", () => {
  it("busca por displayName e mail ao mesmo tempo", () => {
    expect(buildSearchQuery("gueilee")).toBe('"displayName:gueilee" OR "mail:gueilee"')
  })

  it("remove espaços das pontas antes de montar a query", () => {
    expect(buildSearchQuery("  ana silva  ")).toBe('"displayName:ana silva" OR "mail:ana silva"')
  })

  it("escapa aspas duplas dentro do termo (não pode quebrar a sintaxe do Graph)", () => {
    expect(buildSearchQuery('ana "apelido" silva')).toBe('"displayName:ana \\"apelido\\" silva" OR "mail:ana \\"apelido\\" silva"')
  })
})
