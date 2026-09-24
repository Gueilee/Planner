import { describe, expect, it } from "vitest"
import { computeExpectedPct, computeScheduleStatus } from "../schedule-status"

describe("computeExpectedPct", () => {
  it("tarefa de 1 dia (início == término) não vira null — degrau 0/100", () => {
    const start = new Date("2026-09-15T00:00:00.000Z")
    const end   = new Date("2026-09-15T00:00:00.000Z")
    expect(computeExpectedPct(start, end, new Date("2026-09-10T00:00:00.000Z"))).toBe(0)   // ainda não chegou
    expect(computeExpectedPct(start, end, new Date("2026-09-15T00:00:00.000Z"))).toBe(100) // é hoje
    expect(computeExpectedPct(start, end, new Date("2026-09-20T00:00:00.000Z"))).toBe(100) // já passou
  })

  it("tarefa de vários dias — proporção normal, sem regressão", () => {
    const start = new Date("2026-09-01T00:00:00.000Z")
    const end   = new Date("2026-09-11T00:00:00.000Z") // 10 dias de janela
    expect(computeExpectedPct(start, end, new Date("2026-09-01T00:00:00.000Z"))).toBe(0)
    expect(computeExpectedPct(start, end, new Date("2026-09-06T00:00:00.000Z"))).toBe(50)
    expect(computeExpectedPct(start, end, new Date("2026-09-11T00:00:00.000Z"))).toBe(100)
    expect(computeExpectedPct(start, end, new Date("2026-09-30T00:00:00.000Z"))).toBe(100) // nunca passa de 100
  })

  it("término antes do início (dado inconsistente) devolve null", () => {
    const start = new Date("2026-09-15T00:00:00.000Z")
    const end   = new Date("2026-09-10T00:00:00.000Z")
    expect(computeExpectedPct(start, end)).toBeNull()
  })

  it("sem início ou término devolve null", () => {
    expect(computeExpectedPct(null, new Date())).toBeNull()
    expect(computeExpectedPct(new Date(), null)).toBeNull()
  })
})

describe("computeScheduleStatus", () => {
  it("sem esperado (null) é ND, não conta como atrasado", () => {
    expect(computeScheduleStatus(40, null)).toBe("ND")
  })
  it("real >= esperado é ON_TIME", () => {
    expect(computeScheduleStatus(50, 40)).toBe("ON_TIME")
  })
  it("real bem abaixo do esperado é DELAYED", () => {
    expect(computeScheduleStatus(10, 60, 10)).toBe("DELAYED")
  })
})
