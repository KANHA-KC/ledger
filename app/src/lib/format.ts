// Dates are local YYYY-MM-DD strings; money is integer paise.

const pad = (n: number) => String(n).padStart(2, '0')

export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const fromISO = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const todayISO = () => toISO(new Date())
export const addDaysISO = (s: string, n: number) => {
  const d = fromISO(s)
  d.setDate(d.getDate() + n)
  return toISO(d)
}
export const startOfMonthISO = (s: string) => s.slice(0, 8) + '01'
export const endOfMonthISO = (s: string) => {
  const d = fromISO(s)
  return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}
export const addMonthsISO = (s: string, n: number) => {
  const d = fromISO(startOfMonthISO(s))
  return toISO(new Date(d.getFullYear(), d.getMonth() + n, 1))
}
export const daysBetween = (a: string, b: string) =>
  Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86400000)

export type PeriodKey = 'today' | 'week' | 'month' | 'lastMonth' | 'custom'
export interface Range { from: string; to: string }

export function periodRange(p: PeriodKey, custom?: Range): Range {
  const t = todayISO()
  switch (p) {
    case 'today': return { from: t, to: t }
    case 'week': {
      const d = fromISO(t)
      const dow = (d.getDay() + 6) % 7 // Monday = 0
      return { from: addDaysISO(t, -dow), to: addDaysISO(t, 6 - dow) }
    }
    case 'month': return { from: startOfMonthISO(t), to: endOfMonthISO(t) }
    case 'lastMonth': {
      const s = addMonthsISO(t, -1)
      return { from: s, to: endOfMonthISO(s) }
    }
    case 'custom': return custom ?? { from: startOfMonthISO(t), to: t }
  }
}

/** The same-length period immediately before `r`, for "compared to last ..." lines. */
export function previousRange(p: PeriodKey, r: Range): Range {
  if (p === 'month' || p === 'lastMonth') {
    const s = addMonthsISO(r.from, -1)
    return { from: s, to: endOfMonthISO(s) }
  }
  const len = daysBetween(r.from, r.to) + 1
  return { from: addDaysISO(r.from, -len), to: addDaysISO(r.from, -1) }
}

let numerals: 'latn' | 'deva' = 'latn'
export const setNumerals = (n: 'latn' | 'deva') => { numerals = n }

export function toDevaDigits(s: string) {
  const deva = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९']
  return s.replace(/\d/g, (d) => deva[Number(d)] ?? d)
}

const nf = () => new Intl.NumberFormat(numerals === 'deva' ? 'hi-IN-u-nu-deva' : 'en-IN', { maximumFractionDigits: 2 })

/** ₹1,25,000 style (Indian grouping). */
export function money(paise: number, opts: { sign?: boolean } = {}) {
  const rupees = Math.abs(paise) / 100
  const s = nf().format(rupees)
  const sign = paise < 0 ? '−' : opts.sign && paise > 0 ? '+' : ''
  return `${sign}₹${s}`
}

export const num = (n: number) => nf().format(n)

/** Short form for chart axes: ₹1.2L, ₹3.4K */
export function moneyShort(paise: number) {
  const r = paise / 100
  const a = Math.abs(r)
  const f = (v: number, u: string) => `₹${nf().format(Math.round(v * 10) / 10)}${u}`
  if (a >= 1e7) return f(r / 1e7, 'Cr')
  if (a >= 1e5) return f(r / 1e5, 'L')
  if (a >= 1e3) return f(r / 1e3, 'K')
  return `₹${nf().format(Math.round(r))}`
}

export function formatDate(s: string, lang: string, style: 'short' | 'long' = 'short') {
  const loc = lang === 'hi' ? (numerals === 'deva' ? 'hi-IN-u-nu-deva' : 'hi-IN-u-nu-latn') : 'en-IN'
  return fromISO(s).toLocaleDateString(loc, style === 'long'
    ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
    : { day: 'numeric', month: 'short' })
}

export function formatMonth(s: string, lang: string) {
  const loc = lang === 'hi' ? 'hi-IN-u-nu-latn' : 'en-IN'
  return fromISO(s).toLocaleDateString(loc, { month: 'long', year: 'numeric' })
}

export const rupeesToPaise = (r: string | number) => Math.round(Number(r) * 100)

/** Go back inside the app; if the page was opened directly (no in-app history), go Home instead of leaving. */
export function goBack(nav: { (to: string): void; (delta: number): void } | { back: () => void; push: (to: string) => void }) {
  if (typeof window === 'undefined') return
  if ('back' in nav && typeof nav.back === 'function') {
    nav.back()
    return
  }
  const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
  if (idx > 0) (nav as (delta: number) => void)(-1)
  else (nav as (to: string) => void)('/')
}
