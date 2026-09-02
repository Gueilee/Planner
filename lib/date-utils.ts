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

/**
 * Valida "yyyy-MM-dd" com ano de EXATAMENTE 4 dígitos.
 *
 * Bug real encontrado: o <input type="date"> do navegador deixa digitar
 * mais de 4 dígitos no campo do ano (ex.: "092026"), o que produz um Date
 * válido só que com ano estendido — e Date.prototype.toISOString() nesse
 * caso lança RangeError, derrubando qualquer página que tente formatar
 * essa data (500 em produção). Usar isto em toda borda que recebe uma data
 * digitada pelo usuário, antes de gravar — rejeita em vez de corromper.
 */
export function isValidDateStr(s: string | null | undefined): s is string {
  if (!s) return false
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  return !Number.isNaN(new Date(`${s}T00:00:00.000Z`).getTime())
}
