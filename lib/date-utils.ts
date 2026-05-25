/**
 * Parse a "yyyy-MM-dd" date string as LOCAL midnight.
 * date-fns parseISO treats date-only strings as UTC midnight,
 * which shifts the display date by one day in UTC-offset timezones.
 */
export function parseDateStr(ds: string): Date {
  const [y, m, d] = ds.slice(0, 10).split("-").map(Number)
  return new Date(y!, m! - 1, d!)
}

/** Format ISO date string as "dd/MM/yy" with no timezone shift. */
export function fmtDateShort(ds: string | null | undefined): string {
  if (!ds) return "—"
  const [y, m, d] = ds.slice(0, 10).split("-")
  if (!y || !m || !d) return "—"
  return `${d}/${m}/${y.slice(2)}`
}

/** Format ISO date string as "dd/MM/yyyy" with no timezone shift. */
export function fmtDateLong(ds: string | null | undefined): string {
  if (!ds) return "—"
  const [y, m, d] = ds.slice(0, 10).split("-")
  if (!y || !m || !d) return "—"
  return `${d}/${m}/${y}`
}

/** Today as "yyyy-MM-dd" in local time. */
export function todayStr(): string {
  const now = new Date()
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-")
}
