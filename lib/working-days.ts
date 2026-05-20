import { addDays, format, getDay, parseISO } from "date-fns"

export type HolidayEntry = { date: string; name: string }

// Meeus/Jones/Butcher algorithm for Easter Sunday
function getEaster(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1
  const day   = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month, day)
}

function d(date: Date): string {
  return format(date, "yyyy-MM-dd")
}

export function getHolidaysForYear(year: number): HolidayEntry[] {
  const easter = getEaster(year)
  return [
    { date: `${year}-01-01`, name: "Ano Novo" },
    { date: d(addDays(easter, -48)), name: "Carnaval — 2ª feira" },
    { date: d(addDays(easter, -47)), name: "Carnaval — 3ª feira" },
    { date: d(addDays(easter, -2)),  name: "Sexta-feira Santa" },
    { date: d(easter),               name: "Páscoa" },
    { date: `${year}-04-21`,         name: "Tiradentes" },
    { date: `${year}-05-01`,         name: "Dia do Trabalho" },
    { date: d(addDays(easter, 60)),  name: "Corpus Christi" },
    { date: `${year}-09-07`,         name: "Independência do Brasil" },
    { date: `${year}-10-12`,         name: "Nossa Sra. Aparecida" },
    { date: `${year}-11-02`,         name: "Finados" },
    { date: `${year}-11-15`,         name: "Proclamação da República" },
    { date: `${year}-11-20`,         name: "Consciência Negra" },
    { date: `${year}-12-25`,         name: "Natal" },
  ]
}

const cache = new Map<number, Map<string, string>>()

function holidayMap(year: number): Map<string, string> {
  if (!cache.has(year)) {
    const m = new Map<string, string>()
    for (const h of getHolidaysForYear(year)) m.set(h.date, h.name)
    cache.set(year, m)
  }
  return cache.get(year)!
}

export function getHolidayName(dateStr: string): string | null {
  const year = parseInt(dateStr.slice(0, 4), 10)
  return holidayMap(year).get(dateStr) ?? null
}

export function isWeekend(dateStr: string): boolean {
  const dow = getDay(parseISO(dateStr))
  return dow === 0 || dow === 6
}

export function isHoliday(dateStr: string): boolean {
  return getHolidayName(dateStr) !== null
}

export function isWorkingDay(dateStr: string): boolean {
  return !isWeekend(dateStr) && !isHoliday(dateStr)
}

/** Returns the next working day AFTER the given date */
export function nextWorkingDay(afterDateStr: string): string {
  let dt = parseISO(afterDateStr)
  do { dt = addDays(dt, 1) } while (!isWorkingDay(format(dt, "yyyy-MM-dd")))
  return format(dt, "yyyy-MM-dd")
}

/** Returns the nearest working day on or after the given date */
export function nearestWorkingDay(dateStr: string): string {
  if (isWorkingDay(dateStr)) return dateStr
  return nextWorkingDay(dateStr)
}

/** Add N working days to a date */
export function addWorkingDays(fromDateStr: string, n: number): string {
  let dt = parseISO(fromDateStr)
  let remaining = n
  while (remaining > 0) {
    dt = addDays(dt, 1)
    if (isWorkingDay(format(dt, "yyyy-MM-dd"))) remaining--
  }
  return format(dt, "yyyy-MM-dd")
}

/** Count working days between two dates (exclusive of end) */
export function workingDaysBetween(startStr: string, endStr: string): number {
  let dt = parseISO(startStr)
  const end = parseISO(endStr)
  let count = 0
  while (dt < end) {
    if (isWorkingDay(format(dt, "yyyy-MM-dd"))) count++
    dt = addDays(dt, 1)
  }
  return count
}
