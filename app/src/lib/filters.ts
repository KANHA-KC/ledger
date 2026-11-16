// Filters live in the URL (?from=&to=&cat=a,b ...) so any dashboard number can link to a filtered list.
import type { Category, Party, Txn } from '../db/types'
import { matches } from './translit'

export interface Filter {
  from?: string
  to?: string
  dir?: 'in' | 'out'
  cats: string[]
  wallets: string[]
  parties: string[]
  tags: string[]
  min?: number // paise
  max?: number
  q?: string
}

export const emptyFilter = (): Filter => ({ cats: [], wallets: [], parties: [], tags: [] })

export function parseFilter(sp: URLSearchParams): Filter {
  const list = (k: string) => (sp.get(k) ? sp.get(k)!.split(',').filter(Boolean) : [])
  const n = (k: string) => (sp.get(k) ? Math.round(Number(sp.get(k)) * 100) : undefined)
  const dir = sp.get('dir')
  return {
    from: sp.get('from') ?? undefined,
    to: sp.get('to') ?? undefined,
    dir: dir === 'in' || dir === 'out' ? dir : undefined,
    cats: list('cat'),
    wallets: list('wallet'),
    parties: list('party'),
    tags: list('tag'),
    min: n('min'),
    max: n('max'),
    q: sp.get('q') ?? undefined,
  }
}

export function filterToParams(f: Filter): URLSearchParams {
  const sp = new URLSearchParams()
  if (f.from) sp.set('from', f.from)
  if (f.to) sp.set('to', f.to)
  if (f.dir) sp.set('dir', f.dir)
  if (f.cats.length) sp.set('cat', f.cats.join(','))
  if (f.wallets.length) sp.set('wallet', f.wallets.join(','))
  if (f.parties.length) sp.set('party', f.parties.join(','))
  if (f.tags.length) sp.set('tag', f.tags.join(','))
  if (f.min !== undefined) sp.set('min', String(f.min / 100))
  if (f.max !== undefined) sp.set('max', String(f.max / 100))
  if (f.q) sp.set('q', f.q)
  return sp
}

export const filterHref = (f: Partial<Filter>) => `/entries?${filterToParams({ ...emptyFilter(), ...f }).toString()}`

export function activeCount(f: Filter) {
  return [f.from || f.to, f.dir, f.cats.length, f.wallets.length, f.parties.length, f.tags.length, f.min !== undefined || f.max !== undefined]
    .filter(Boolean).length
}

export function applyFilter(txns: Txn[], f: Filter, ctx: { cats: Map<string, Category>; parties: Map<string, Party>; lang: string }): Txn[] {
  // a selected parent category also matches its children
  const catSet = new Set(f.cats)
  if (catSet.size) for (const c of ctx.cats.values()) if (c.parentId && catSet.has(c.parentId)) catSet.add(c.id)
  return txns.filter((t) => {
    if (t.deletedAt) return false
    if (f.from && t.date < f.from) return false
    if (f.to && t.date > f.to) return false
    if (f.dir && t.direction !== f.dir) return false
    if (catSet.size && (!t.categoryId || !catSet.has(t.categoryId))) return false
    if (f.wallets.length && !(f.wallets.includes(t.accountId ?? '') || f.wallets.includes(t.toAccountId ?? ''))) return false
    if (f.parties.length && !f.parties.includes(t.partyId ?? '')) return false
    if (f.tags.length && !f.tags.some((x) => t.tags.includes(x))) return false
    if (f.min !== undefined && t.amount < f.min) return false
    if (f.max !== undefined && t.amount > f.max) return false
    if (f.q) {
      const c = t.categoryId ? ctx.cats.get(t.categoryId) : undefined
      const p = t.partyId ? ctx.parties.get(t.partyId) : undefined
      const hay = [t.note, t.tags.join(' '), c?.name_en, c?.name_hi, p?.name, p?.nameAlt, String(t.amount / 100)].filter(Boolean).join(' ')
      if (!matches(hay, f.q)) return false
    }
    return true
  })
}
