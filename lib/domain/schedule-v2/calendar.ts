// Calendário de dias úteis — CLAUDE.md §3.1: TODO cálculo de data passa por
// aqui. Ao contrário de lib/working-days.ts (feriados fixos em código), aqui
// o calendário (dias úteis da semana + feriados) é um parâmetro — vem do
// banco (WorkCalendarV2/HolidayV2) e pode variar por projeto/filial.

import { addDays, format, parseISO } from "date-fns"
import type { WorkCalendar } from "./types"

const DEFAULT_DIAS_UTEIS = [1, 2, 3, 4, 5] // seg-sex

// Trava de segurança para os laços dia-a-dia abaixo — nenhum cronograma
// legítimo passa disso (~274 anos). Sem isto, uma data corrompida (ano com
// dígitos a mais, digitado sem querer no <input type="date"> do navegador)
// faz o laço rodar por uma distância astronômica e trava o servidor
// inteiro (bug real que já aconteceu). As bordas de entrada já validam o
// formato da data antes de chegar aqui — isto é só o último cinto de
// segurança, para nunca mais travar mesmo que algo escape da validação.
const MAX_ITERACOES_DIA_A_DIA = 100_000

function assertDentroDoLimite(iteracoes: number, contexto: string): void {
  if (iteracoes > MAX_ITERACOES_DIA_A_DIA) {
    throw new Error(`${contexto}: intervalo de datas grande demais (mais de ${MAX_ITERACOES_DIA_A_DIA} dias) — data inválida?`)
  }
}

function isoDayOfWeek(dt: Date): number {
  const jsDay = dt.getDay() // 0=dom..6=sáb
  return jsDay === 0 ? 7 : jsDay
}

function toDate(dateStr: string): Date {
  return parseISO(dateStr)
}

function toStr(dt: Date): string {
  return format(dt, "yyyy-MM-dd")
}

function holidaySet(cal: WorkCalendar): Set<string> {
  return new Set(cal.holidays.map((h) => h.date))
}

export function isWeekend(dateStr: string, cal: WorkCalendar): boolean {
  const diasUteis = cal.diasUteis.length > 0 ? cal.diasUteis : DEFAULT_DIAS_UTEIS
  return !diasUteis.includes(isoDayOfWeek(toDate(dateStr)))
}

export function isHoliday(dateStr: string, cal: WorkCalendar): boolean {
  return holidaySet(cal).has(dateStr)
}

export function isWorkingDay(dateStr: string, cal: WorkCalendar): boolean {
  return !isWeekend(dateStr, cal) && !isHoliday(dateStr, cal)
}

/** Retorna o próximo dia útil APÓS a data informada (nunca a própria data). */
export function nextWorkingDay(afterDateStr: string, cal: WorkCalendar): string {
  let dt = addDays(toDate(afterDateStr), 1)
  let i = 0
  while (!isWorkingDay(toStr(dt), cal)) {
    dt = addDays(dt, 1)
    assertDentroDoLimite(++i, "nextWorkingDay")
  }
  return toStr(dt)
}

/** Retorna o dia útil mais próximo, na própria data ou depois. */
export function nearestWorkingDay(dateStr: string, cal: WorkCalendar): string {
  return isWorkingDay(dateStr, cal) ? dateStr : nextWorkingDay(dateStr, cal)
}

/**
 * Soma (ou subtrai, se n < 0) N dias úteis a partir de uma data — a própria
 * data de partida NÃO é contada. addWorkingDays(d, 0) retorna d.
 */
export function addWorkingDays(fromDateStr: string, n: number, cal: WorkCalendar): string {
  assertDentroDoLimite(Math.abs(n), "addWorkingDays")
  let dt = toDate(fromDateStr)
  const step = n >= 0 ? 1 : -1
  let remaining = Math.abs(n)
  let i = 0
  while (remaining > 0) {
    dt = addDays(dt, step)
    if (isWorkingDay(toStr(dt), cal)) remaining--
    assertDentroDoLimite(++i, "addWorkingDays")
  }
  return toStr(dt)
}

/** Conta dias úteis entre duas datas (intervalo [start, end), exclusivo do fim). */
export function workingDaysBetween(startStr: string, endStr: string, cal: WorkCalendar): number {
  let dt = toDate(startStr)
  const end = toDate(endStr)
  let count = 0
  let i = 0
  const forward = dt <= end
  while (forward ? dt < end : dt > end) {
    if (isWorkingDay(toStr(dt), cal)) count++
    dt = addDays(dt, forward ? 1 : -1)
    assertDentroDoLimite(++i, "workingDaysBetween")
  }
  return forward ? count : -count
}

/**
 * Término a partir do início + duração em dias úteis — duração INCLUSIVA
 * (CLAUDE.md §5: tarefa de 1 dia ⇒ início == término). Marco (duração 0)
 * também retorna início == término. Assume que `inicioStr` já é um dia útil
 * válido (responsabilidade de quem chama).
 */
export function somarDuracao(inicioStr: string, duracaoDiasUteis: number, cal: WorkCalendar): string {
  if (duracaoDiasUteis <= 0) return inicioStr
  return addWorkingDays(inicioStr, duracaoDiasUteis - 1, cal)
}

/** Inverso de somarDuracao: dado o término e a duração, deriva o início. */
export function subtrairDuracao(terminoStr: string, duracaoDiasUteis: number, cal: WorkCalendar): string {
  if (duracaoDiasUteis <= 0) return terminoStr
  return addWorkingDays(terminoStr, -(duracaoDiasUteis - 1), cal)
}
