import { describe, expect, it } from "vitest"
import {
  addWorkingDays,
  isHoliday,
  isWeekend,
  isWorkingDay,
  nextWorkingDay,
  somarDuracao,
  subtrairDuracao,
  workingDaysBetween,
} from "../calendar"
import type { WorkCalendar } from "../types"

const CAL: WorkCalendar = { diasUteis: [1, 2, 3, 4, 5], holidays: [{ date: "2026-04-21", name: "Tiradentes" }] }

describe("calendar — dias úteis e feriados", () => {
  it("identifica fim de semana", () => {
    expect(isWeekend("2026-04-18", CAL)).toBe(true) // sábado
    expect(isWeekend("2026-04-19", CAL)).toBe(true) // domingo
    expect(isWeekend("2026-04-20", CAL)).toBe(false) // segunda
  })

  it("identifica feriado cadastrado", () => {
    expect(isHoliday("2026-04-21", CAL)).toBe(true)
    expect(isHoliday("2026-04-20", CAL)).toBe(false)
  })

  it("dia útil = não é fim de semana nem feriado", () => {
    expect(isWorkingDay("2026-04-21", CAL)).toBe(false) // feriado (terça)
    expect(isWorkingDay("2026-04-18", CAL)).toBe(false) // sábado
    expect(isWorkingDay("2026-04-20", CAL)).toBe(true) // segunda comum
  })

  it("nextWorkingDay pula fim de semana", () => {
    // sexta 2026-04-17 -> próximo dia útil é segunda 2026-04-20
    expect(nextWorkingDay("2026-04-17", CAL)).toBe("2026-04-20")
  })

  it("nextWorkingDay pula feriado no meio da semana (T10)", () => {
    // segunda 2026-04-20 -> terça é feriado (Tiradentes) -> próximo é quarta
    expect(nextWorkingDay("2026-04-20", CAL)).toBe("2026-04-22")
  })

  it("addWorkingDays soma dias úteis pulando fds e feriado", () => {
    // sexta 2026-04-17 + 2 dias úteis: sáb/dom pulados, terça é feriado -> seg(1) + qua(2)
    expect(addWorkingDays("2026-04-17", 2, CAL)).toBe("2026-04-22")
  })

  it("addWorkingDays com n negativo anda para trás", () => {
    expect(addWorkingDays("2026-04-22", -2, CAL)).toBe("2026-04-17")
  })

  it("addWorkingDays com n=0 retorna a própria data", () => {
    expect(addWorkingDays("2026-04-20", 0, CAL)).toBe("2026-04-20")
  })

  it("workingDaysBetween conta dias úteis no intervalo [start, end)", () => {
    expect(workingDaysBetween("2026-04-17", "2026-04-22", CAL)).toBe(2) // seg e qua (terça é feriado)
  })

  it("somarDuracao: duração 1 dia = início == término (inclusiva)", () => {
    expect(somarDuracao("2026-04-20", 1, CAL)).toBe("2026-04-20")
  })

  it("somarDuracao: duração 3 dias úteis", () => {
    // seg 20/04 (dia 1), ter é feriado (pulado), qua 22 (dia 2), qui 23 (dia 3)
    expect(somarDuracao("2026-04-20", 3, CAL)).toBe("2026-04-23")
  })

  it("somarDuracao: duração 0 (marco) = início == término", () => {
    expect(somarDuracao("2026-04-20", 0, CAL)).toBe("2026-04-20")
  })

  it("subtrairDuracao é o inverso de somarDuracao", () => {
    const inicio = "2026-04-20"
    const termino = somarDuracao(inicio, 5, CAL)
    expect(subtrairDuracao(termino, 5, CAL)).toBe(inicio)
  })
})
