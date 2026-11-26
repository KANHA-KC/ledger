'use client'

// Every category the shop has, as a menu: Money In / Money Out groups, sub-categories indented
// under their parent. Each item links to /category/<id>, which shows that category's entries as a table.

import { useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Category } from '../db/types'
import { useData } from '../store'
import { cx } from './ui'
import { AppIcon } from './AppIcon'

/** Kept as categories (udhaar entries, owner's capital) but not listed in the menu. */
const HIDDEN_IN_MENU = new Set(['udhaar_mila', 'udhaar_liya', 'udhaar_diya', 'udhaar_chukaya', 'malik'])

function isHiddenInMenu(c: Category): boolean {
  if (c.hidden) return true
  if (c.key && (HIDDEN_IN_MENU.has(c.key) || c.key.toLowerCase().startsWith('udhaar'))) return true
  if (c.special?.startsWith('udhaar')) return true
  return false
}

export function useCategoryStats() {
  const { live } = useData()
  return useMemo(() => {
    const m = new Map<string, { count: number; total: number }>()
    for (const t of live) {
      if (!t.categoryId) continue
      const s = m.get(t.categoryId) ?? { count: 0, total: 0 }
      s.count++
      s.total += t.amount
      m.set(t.categoryId, s)
    }
    return m
  }, [live])
}

export function CategoryNav({ onNavigate }: { onNavigate?: () => void }) {
  const { categories, nm, lang } = useData()
  const pathname = usePathname()
  const stats = useCategoryStats()

  const groups = useMemo(() => {
    const visible = categories.filter((c) => !isHiddenInMenu(c))
    const ids = new Set(visible.map((c) => c.id))
    const children = new Map<string, Category[]>()
    for (const c of visible) {
      if (c.parentId && ids.has(c.parentId)) children.set(c.parentId, [...(children.get(c.parentId) ?? []), c])
    }
    const roots = visible.filter((c) => !c.parentId || !ids.has(c.parentId))
    const tree = (dir: 'in' | 'out') =>
      roots.filter((c) => c.direction === dir).map((c) => ({ cat: c, kids: children.get(c.id) ?? [] }))
    return [
      { dir: 'in' as const, label: lang === 'hi' ? 'पैसा आया' : 'Money In', items: tree('in') },
      { dir: 'out' as const, label: lang === 'hi' ? 'पैसा गया' : 'Money Out', items: tree('out') },
    ]
  }, [categories, lang])

  const count = (c: Category, kids: Category[]) =>
    (stats.get(c.id)?.count ?? 0) + kids.reduce((n, k) => n + (stats.get(k.id)?.count ?? 0), 0)

  const item = (c: Category, n: number, child = false) => {
    const active = pathname === `/category/${c.id}`
    return (
      <Link
        key={c.id}
        href={`/category/${c.id}`}
        onClick={onNavigate}
        title={nm(c)}
        className={cx(
          'apple-press flex h-9 items-center gap-2.5 rounded-xl pr-2 text-sm transition-colors',
          child ? 'pl-8' : 'pl-3',
          active
            ? 'bg-[#007AFF] font-semibold text-white shadow-sm'
            : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-[#2C2C2E]'
        )}
      >
        <AppIcon
          name={c.icon}
          className={cx('h-4 w-4 shrink-0', active ? 'text-white' : child ? 'text-[#8E8E93]' : 'text-[#007AFF] dark:text-[#0A84FF]')}
        />
        <span className="min-w-0 flex-1 truncate">{nm(c)}</span>
        {n > 0 && (
          <span
            className={cx(
              'tabular-numbers rounded-full px-1.5 text-[11px] font-semibold',
              active ? 'bg-white/25 text-white' : 'bg-neutral-100 text-neutral-500 dark:bg-[#2C2C2E] dark:text-neutral-400'
            )}
          >
            {n}
          </span>
        )}
      </Link>
    )
  }

  return (
    <nav aria-label={lang === 'hi' ? 'श्रेणियाँ' : 'Categories'} className="flex flex-col gap-0.5">
      {groups.map((g) => (
        <div key={g.dir} className="mb-3">
          <div className="mb-1 flex items-center gap-1.5 px-2 text-[11px] font-semibold text-[#8E8E93] dark:text-[#A1A1A6]">
            <span className={cx('h-1.5 w-1.5 rounded-full', g.dir === 'in' ? 'bg-[#34C759]' : 'bg-[#FF3B30]')} />
            {g.label}
          </div>
          {g.items.length === 0 && (
            <div className="px-3 py-1 text-xs text-neutral-400">{lang === 'hi' ? 'कोई श्रेणी नहीं' : 'No categories'}</div>
          )}
          {g.items.map(({ cat, kids }) => (
            <div key={cat.id} className="flex flex-col gap-0.5">
              {item(cat, count(cat, kids))}
              {kids.map((k) => item(k, stats.get(k.id)?.count ?? 0, true))}
            </div>
          ))}
        </div>
      ))}
    </nav>
  )
}
