'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import {
  ChevronLeft,
  ChevronRight,
  Printer,
  FileSpreadsheet,
  MessageCircle,
  BarChart3,
  Download,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react'
import { useData } from '../store'
import { isCashIn, isCashOut } from '../db/ledger'
import { addMonthsISO, endOfMonthISO, formatMonth, money, startOfMonthISO, todayISO } from '../lib/format'
import { filterHref } from '../lib/filters'
import { download, printHTML, shareText, toCSV } from '../lib/export'
import { Btn, Card, CatIcon, Chip, Heading, Money } from '../components/ui'
import { AppleSegmentedControl } from '../components/apple/AppleSegmentedControl'
import { downloadEntriesCSV, entriesTable } from './reportUtils'

export function Reports() {
  const { t } = useTranslation()
  const d = useData()
  const { live, maps, nm, lang, business } = d
  const [month, setMonth] = useState(startOfMonthISO(todayISO()))
  const [dir, setDir] = useState<'out' | 'in'>('in')
  const from = month
  const to = endOfMonthISO(month)
  const inMonth = live.filter((x) => x.date >= from && x.date <= to)
  const aaya = inMonth.filter(isCashIn).reduce((s, x) => s + x.amount, 0)
  const gaya = inMonth.filter(isCashOut).reduce((s, x) => s + x.amount, 0)

  // Last 6 months summary
  const months = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const m = addMonthsISO(todayISO(), -i)
        const xs = live.filter((x) => x.date >= m && x.date <= endOfMonthISO(m))
        const a = xs.filter(isCashIn).reduce((s, x) => s + x.amount, 0)
        const g = xs.filter(isCashOut).reduce((s, x) => s + x.amount, 0)
        return { m, a, g, b: a - g }
      }),
    [live]
  )

  const byCat = useMemo(() => {
    const m = new Map<string, { amt: number; n: number }>()
    for (const x of inMonth.filter((x) => x.direction === dir)) {
      const k = x.categoryId ?? 'none'
      const e = m.get(k) ?? { amt: 0, n: 0 }
      m.set(k, { amt: e.amt + x.amount, n: e.n + 1 })
    }
    return [...m.entries()].sort((a, b) => b[1].amt - a[1].amt)
  }, [inMonth, dir])

  const catTotal = byCat.reduce((s, [, v]) => s + v.amt, 0)
  const mLabel = formatMonth(month, lang)
  const shareLine =
    t('reports.shareText', {
      business: business.name,
      period: mLabel,
      in: money(aaya),
      out: money(gaya),
      left: money(aaya - gaya),
    }) ||
    `${business.name} Monthly Summary (${mLabel}): Money In ${money(aaya)}, Money Out ${money(gaya)}, Balance ${money(aaya - gaya)}`

  const pdf = () => {
    const catRows = byCat
      .map(
        ([id, v]) =>
          `<tr><td>${maps.cats.get(id)?.icon ?? ''} ${nm(maps.cats.get(id))}</td><td class="n">${
            v.n
          }</td><td class="n">${money(v.amt)}</td><td class="n">${
            catTotal ? Math.round((v.amt / catTotal) * 100) : 0
          }%</td></tr>`
      )
      .join('')
    printHTML(
      `${business.name} — ${mLabel}`,
      `<h1>${business.name}</h1><div class="sub">${t('reports.monthly')} · ${mLabel}</div>
<div class="cards"><div class="card">${t('reports.in')}<b class="in">${money(aaya)}</b></div><div class="card">${t('reports.out')}<b class="out">${money(gaya)}</b></div><div class="card">${t('reports.left')}<b>${money(aaya - gaya)}</b></div></div>
<h3>${t('reports.category')} — ${dir === 'in' ? t('act.in') : t('act.out')}</h3>
<table><thead><tr><th>${t('reports.category_col')}</th><th class="n">${t('reports.entries_col')}</th><th class="n">${t('reports.amount_col')}</th><th class="n">${t('reports.share_col')}</th></tr></thead><tbody>${catRows}</tbody></table>
<h3>${t('entries.title')}</h3>${entriesTable(inMonth, d, t)}`,
      lang
    )
  }

  const excelSummary = () => {
    const rows: unknown[][] = [
      [t('reports.monthly') || 'Monthly Report'],
      ['Month', t('reports.in') || 'Money In', t('reports.out') || 'Money Out', t('reports.left') || 'Balance'],
      ...months.map((r) => [formatMonth(r.m, lang), r.a / 100, r.g / 100, r.b / 100]),
      [],
      [t('reports.category') || 'Category Breakdown', mLabel],
      [
        t('reports.category_col') || 'Category',
        t('reports.type_col') || 'Type',
        t('reports.entries_col') || 'Entries',
        t('reports.amount_col') || 'Amount',
      ],
      ...(['in', 'out'] as const).flatMap((dd) => {
        const m = new Map<string, { amt: number; n: number }>()
        for (const x of inMonth.filter((x) => x.direction === dd)) {
          const e = m.get(x.categoryId ?? '') ?? { amt: 0, n: 0 }
          m.set(x.categoryId ?? '', { amt: e.amt + x.amount, n: e.n + 1 })
        }
        return [...m.entries()].map(([id, v]) => [
          nm(maps.cats.get(id)),
          dd.toUpperCase(),
          v.n,
          v.amt / 100,
        ])
      }),
    ]
    download(`hisaab-report-${month.slice(0, 7)}.csv`, toCSV(rows), 'text/csv;charset=utf-8')
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="apple-large-title text-neutral-900 dark:text-white">
          {t('reports.title') || 'Reports & Analysis'}
        </h1>
        <p className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">Business performance and financial statements</p>
      </div>

      {/* Month Navigator (Apple Style) */}
      <div className="apple-card flex items-center justify-between p-2">
        <button
          type="button"
          onClick={() => setMonth(addMonthsISO(month, -1))}
          className="apple-press flex h-10 w-10 items-center justify-center rounded-xl text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-[#2C2C2E]"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="text-base font-bold text-neutral-900 dark:text-white">{mLabel}</span>
        <button
          type="button"
          disabled={month >= startOfMonthISO(todayISO())}
          onClick={() => setMonth(addMonthsISO(month, 1))}
          className="apple-press flex h-10 w-10 items-center justify-center rounded-xl text-neutral-700 hover:bg-neutral-100 disabled:opacity-30 dark:text-neutral-300 dark:hover:bg-[#2C2C2E]"
          aria-label="Next month"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Monthly Financial Health Card */}
      <div className="apple-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-xs font-semibold text-[#6E6E73] dark:text-[#A1A1A6]">
            {mLabel}
          </span>
          <span className="tabular-numbers text-sm font-bold text-neutral-900 dark:text-white">
            {inMonth.length} entries
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2.5 text-center">
          <Link
            href={filterHref({ from, to, dir: 'in' })}
            className="apple-press rounded-xl bg-emerald-500/10 p-3 dark:bg-emerald-500/20"
          >
            <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-[#1C7430] dark:text-[#30D158]">
              <ArrowDownLeft className="h-3.5 w-3.5 stroke-[2.5]" />
              <span>{t('reports.in') || 'Money In'}</span>
            </div>
            <div className="mt-1">
              <Money paise={aaya} tone="in" size="sm" />
            </div>
          </Link>

          <Link
            href={filterHref({ from, to, dir: 'out' })}
            className="apple-press rounded-xl bg-rose-500/10 p-3 dark:bg-rose-500/20"
          >
            <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-[#D70015] dark:text-[#FF453A]">
              <ArrowUpRight className="h-3.5 w-3.5 stroke-[2.5]" />
              <span>{t('reports.out') || 'Money Out'}</span>
            </div>
            <div className="mt-1">
              <Money paise={gaya} tone="out" size="sm" />
            </div>
          </Link>

          <div className="rounded-xl bg-neutral-100 p-3 dark:bg-[#2C2C2E]">
            <div className="text-[11px] font-semibold text-[#6E6E73] dark:text-[#A1A1A6]">
              ＝ {t('reports.left') || 'Bacha'}
            </div>
            <div className="mt-1">
              <Money paise={aaya - gaya} tone="auto" size="sm" />
            </div>
          </div>
        </div>

        {/* Export Buttons Strip */}
        <div className="mt-4 flex flex-wrap gap-2 pt-2 border-t border-black/[0.04] dark:border-white/[0.06]">
          <button
            type="button"
            onClick={pdf}
            className="apple-press inline-flex h-9 items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-3 text-xs font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50 dark:border-white/[0.1] dark:bg-[#2C2C2E] dark:text-white"
          >
            <Printer className="h-3.5 w-3.5 text-[#007AFF]" />
            <span>{t('reports.pdf') || 'PDF Print'}</span>
          </button>

          <button
            type="button"
            onClick={excelSummary}
            className="apple-press inline-flex h-9 items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-3 text-xs font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50 dark:border-white/[0.1] dark:bg-[#2C2C2E] dark:text-white"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-[#34C759]" />
            <span>{t('reports.excel') || 'Excel CSV'}</span>
          </button>

          <button
            type="button"
            onClick={() => shareText(shareLine)}
            className="apple-press inline-flex h-9 items-center gap-1.5 rounded-full bg-[#25D366] px-3.5 text-xs font-bold text-white shadow-sm hover:bg-[#20BA5A]"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            <span>{t('act.whatsapp') || 'Share WhatsApp'}</span>
          </button>
        </div>
      </div>

      {/* Category Breakdown & 6-Month History Grid */}
      <div className="grid gap-4 md:grid-cols-2 items-start">
        {/* Category Breakdown Card */}
        <div className="apple-card p-4 min-w-0 overflow-hidden">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="apple-headline min-w-0 truncate text-neutral-900 dark:text-white">
              {t('reports.category') || 'Category Breakdown'}
            </h3>
            <div className="w-52 shrink-0">
              <AppleSegmentedControl
                size="sm"
                value={dir}
                onChange={setDir}
                options={[
                  { value: 'in', label: t('act.in') || 'Money In' },
                  { value: 'out', label: t('act.out') || 'Money Out' },
                ]}
              />
            </div>
          </div>

        {byCat.length === 0 ? (
          <p className="py-4 text-center text-xs text-neutral-400">— No transactions for this month —</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-black/[0.06] text-neutral-400 dark:border-white/[0.08]">
                  <th className="pb-2 text-left font-semibold">
                    {t('reports.category_col') || 'Category'}
                  </th>
                  <th className="pb-2 text-right font-semibold">
                    {t('reports.entries_col') || 'Entries'}
                  </th>
                  <th className="pb-2 text-right font-semibold">
                    {t('reports.amount_col') || 'Amount'}
                  </th>
                  <th className="pb-2 text-right font-semibold">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
                {byCat.map(([id, v]) => {
                  const c = maps.cats.get(id)
                  const pct = catTotal ? Math.round((v.amt / catTotal) * 100) : 0
                  return (
                    <tr key={id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30">
                      <td className="py-2.5">
                        <Link
                          href={filterHref({ from, to, cats: [id] })}
                          className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-white"
                        >
                          <CatIcon icon={c?.icon ?? 'Tag'} color={c?.color ?? '#007AFF'} size="sm" />
                          <span className="truncate">{nm(c) || t('misc.noCategory') || 'Other'}</span>
                        </Link>
                      </td>
                      <td className="tabular-numbers py-2.5 text-right text-neutral-500">{v.n}</td>
                      <td className="tabular-numbers py-2.5 text-right font-bold text-neutral-900 dark:text-white">
                        {money(v.amt)}
                      </td>
                      <td className="tabular-numbers py-2.5 text-right font-medium text-neutral-400">
                        {pct}%
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 6-Month Comparison Table */}
      <div className="apple-card p-4 min-w-0 overflow-hidden">
        <h3 className="apple-headline mb-3 text-neutral-900 dark:text-white">
          6-Month History / पिछले ६ महीने
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-black/[0.06] text-[#6E6E73] dark:border-white/[0.08] dark:text-[#A1A1A6]">
                <th className="pb-2 text-left font-semibold">Month</th>
                <th className="pb-2 text-right font-semibold">↓ {t('reports.in') || 'Money In'}</th>
                <th className="pb-2 text-right font-semibold">↑ {t('reports.out') || 'Money Out'}</th>
                <th className="pb-2 text-right font-semibold">{t('reports.left') || 'Balance'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
              {months.map((r) => (
                <tr
                  key={r.m}
                  onClick={() => setMonth(r.m)}
                  className="apple-press cursor-pointer hover:bg-neutral-50/70 dark:hover:bg-[#2C2C2E]/60"
                >
                  <td className="py-2.5 font-semibold text-neutral-900 dark:text-white">
                    {formatMonth(r.m, lang)}
                  </td>
                  <td className="tabular-numbers py-2.5 text-right font-semibold text-[#1C7430] dark:text-[#30D158]">
                    {money(r.a)}
                  </td>
                  <td className="tabular-numbers py-2.5 text-right font-semibold text-[#D70015] dark:text-[#FF453A]">
                    {money(r.g)}
                  </td>
                  <td className="tabular-numbers py-2.5 text-right font-bold">
                    <Money paise={r.b} tone="auto" size="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </div>
  )
}
