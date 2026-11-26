'use client'

// One category's entries as a table: date, sub-category, party, note, wallet, amount.
// Includes entries of its sub-categories. Period filter, search, sortable columns, CSV export.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, Download, Search } from 'lucide-react'
import { useData } from '../store'
import { useNavigate, useParams } from '../lib/navigation'
import { formatDate, money, periodRange, type PeriodKey } from '../lib/format'
import { CatIcon, Empty, cx, inputCls } from '../components/ui'
import { AppleSegmentedControl } from '../components/apple/AppleSegmentedControl'
import type { Txn } from '../db/types'

type SortKey = 'date' | 'amount'

export function CategoryDetail() {
  const { id } = useParams<{ id: string }>()
  const { categories, maps, live, nm, lang } = useData()
  const navigate = useNavigate()
  const [period, setPeriod] = useState<PeriodKey>('toDate')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'date', desc: true })
  const hi = lang === 'hi'

  const cat = maps.cats.get(id)
  const parent = cat?.parentId ? maps.cats.get(cat.parentId) : undefined
  const kids = useMemo(() => categories.filter((c) => c.parentId === id), [categories, id])
  const hasKids = kids.length > 0

  const rows = useMemo(() => {
    const ids = new Set([id, ...kids.map((k) => k.id)])
    const r = periodRange(period)
    const needle = q.trim().toLowerCase()
    const list = live.filter((t) => {
      if (!t.categoryId || !ids.has(t.categoryId)) return false
      if (t.date < r.from || t.date > r.to) return false
      if (!needle) return true
      const p = t.partyId ? maps.parties.get(t.partyId) : undefined
      return [t.note, p?.name, p?.nameAlt, String(t.amount / 100)].some((s) => s && s.toLowerCase().includes(needle))
    })
    const dir = sort.desc ? -1 : 1
    return list.sort((a, b) =>
      sort.key === 'amount'
        ? (a.amount - b.amount) * dir
        : (a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date)) * dir
    )
  }, [id, kids, live, period, q, sort, maps.parties])

  if (!cat) {
    return <Empty icon="Tag" title={hi ? 'श्रेणी नहीं मिली' : 'Category not found'} />
  }

  const total = rows.reduce((s, t) => s + t.amount, 0)
  const isIn = cat.direction === 'in'
  const tone = isIn ? 'text-[#1C7430] dark:text-[#30D158]' : 'text-[#D70015] dark:text-[#FF453A]'

  const cols = {
    date: hi ? 'तारीख' : 'Date',
    sub: hi ? 'उप-श्रेणी' : 'Sub-category',
    party: hi ? 'पार्टी' : 'Party',
    note: hi ? 'विवरण' : 'Note',
    wallet: hi ? 'खाता' : 'Wallet',
    amount: hi ? 'रकम' : 'Amount',
  }

  const walletOf = (t: Txn) => (t.onCredit ? (hi ? 'उधार' : 'On credit') : nm(t.accountId ? maps.accounts.get(t.accountId) : undefined))
  const subOf = (t: Txn) => (t.categoryId && t.categoryId !== id ? nm(maps.cats.get(t.categoryId)) : '—')
  const partyOf = (t: Txn) => (t.partyId ? maps.parties.get(t.partyId)?.name ?? '' : '')

  const exportCsv = () => {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
    const head = [cols.date, ...(hasKids ? [cols.sub] : []), cols.party, cols.note, cols.wallet, cols.amount]
    const body = rows.map((t) =>
      [t.date, ...(hasKids ? [subOf(t)] : []), partyOf(t), t.note, walletOf(t), (t.amount / 100).toFixed(2)].map(esc).join(',')
    )
    const blob = new Blob(['﻿' + [head.map(esc).join(','), ...body].join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${nm(cat).replace(/[^\p{L}\p{N}]+/gu, '_')}_${period}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const sortBtn = (key: SortKey, label: string, right = false) => (
    <button
      type="button"
      onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : true }))}
      className={cx('inline-flex items-center gap-1 font-semibold', right && 'flex-row-reverse')}
    >
      {label}
      {sort.key === key && (sort.desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
    </button>
  )

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {/* Title */}
      <div className="flex items-center gap-3">
        <CatIcon icon={cat.icon} size="lg" />
        <div className="min-w-0 flex-1">
          {parent && (
            <Link href={`/category/${parent.id}`} className="text-xs font-semibold text-[#007AFF]">
              {nm(parent)} ›
            </Link>
          )}
          <h1 className="apple-title-2 truncate text-neutral-900 dark:text-white">{nm(cat)}</h1>
          <p className="text-xs text-neutral-500">{isIn ? (hi ? 'पैसा आया' : 'Money In') : hi ? 'पैसा गया' : 'Money Out'}</p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="apple-card p-4">
          <div className="text-xs font-medium text-neutral-500">{hi ? 'कुल रकम' : 'Total'}</div>
          <div className={cx('tabular-numbers text-2xl font-bold tracking-tight', tone)}>{money(total)}</div>
        </div>
        <div className="apple-card p-4">
          <div className="text-xs font-medium text-neutral-500">{hi ? 'एंट्री' : 'Entries'}</div>
          <div className="tabular-numbers text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">{rows.length}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <AppleSegmentedControl
          size="sm"
          className="md:w-[420px]"
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'toDate', label: hi ? 'सब' : 'All' },
            { value: 'today', label: hi ? 'आज' : 'Today' },
            { value: 'week', label: hi ? 'हफ़्ता' : 'Week' },
            { value: 'month', label: hi ? 'महीना' : 'Month' },
            { value: 'lastMonth', label: hi ? 'पिछला' : 'Last mo.' },
          ]}
        />
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            className={cx(inputCls, 'h-9 pl-9 text-sm')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={hi ? 'पार्टी, विवरण या रकम खोजें' : 'Search party, note or amount'}
            aria-label={hi ? 'खोजें' : 'Search'}
          />
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={rows.length === 0}
          className="apple-press inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-neutral-100 px-3 text-sm font-semibold text-neutral-800 disabled:opacity-40 dark:bg-[#2C2C2E] dark:text-neutral-200"
        >
          <Download className="h-4 w-4" /> CSV
        </button>
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <div className="apple-card p-8 text-center text-sm text-neutral-500">
          {hi ? 'इस अवधि में कोई एंट्री नहीं' : 'No entries in this period'}
          <div className="mt-3">
            <Link href={`/add/${cat.direction}`} className="font-semibold text-[#007AFF]">
              + {hi ? 'नई एंट्री' : 'Add entry'}
            </Link>
          </div>
        </div>
      ) : (
        <div className="apple-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm sm:min-w-[560px]">
              <thead>
                <tr className="border-b border-black/[0.06] bg-neutral-50 text-left text-xs text-neutral-500 dark:border-white/[0.08] dark:bg-[#2C2C2E]/60">
                  <th className="px-3 py-2.5 sm:px-4">{sortBtn('date', cols.date)}</th>
                  {hasKids && <th className="px-3 py-2.5 font-semibold">{cols.sub}</th>}
                  <th className="px-3 py-2.5 font-semibold">{cols.party}</th>
                  <th className="px-3 py-2.5 font-semibold">{cols.note}</th>
                  <th className="hidden px-3 py-2.5 font-semibold sm:table-cell">{cols.wallet}</th>
                  <th className="px-4 py-2.5 text-right">{sortBtn('amount', cols.amount, true)}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => navigate(`/add/${t.direction}?edit=${t.id}`)}
                    className="cursor-pointer border-b border-black/[0.04] last:border-0 hover:bg-[#007AFF]/5 dark:border-white/[0.06]"
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 text-neutral-600 sm:px-4 dark:text-neutral-300">{formatDate(t.date, lang)}</td>
                    {hasKids && <td className="px-3 py-2.5 text-neutral-700 dark:text-neutral-200">{subOf(t)}</td>}
                    <td className="px-3 py-2.5 font-medium text-neutral-900 dark:text-white">{partyOf(t) || '—'}</td>
                    <td className="max-w-[110px] truncate px-3 sm:max-w-[240px] py-2.5 text-neutral-600 dark:text-neutral-300" title={t.note}>
                      {t.note || '—'}
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-2.5 text-neutral-600 dark:text-neutral-300 sm:table-cell">{walletOf(t) || '—'}</td>
                    <td className={cx('tabular-numbers whitespace-nowrap px-4 py-2.5 text-right font-semibold', tone)}>{money(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-black/[0.08] bg-neutral-50 font-bold dark:border-white/[0.1] dark:bg-[#2C2C2E]/60">
                  <td className="px-3 py-2.5 text-neutral-700 dark:text-neutral-200 sm:px-4" colSpan={hasKids ? 4 : 3}>
                    {hi ? 'कुल' : 'Total'} · {rows.length}
                  </td>
                  <td className="hidden sm:table-cell" />
                  <td className={cx('tabular-numbers whitespace-nowrap px-4 py-2.5 text-right', tone)}>{money(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
