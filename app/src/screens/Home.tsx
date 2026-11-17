'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useNavigate } from '../lib/navigation'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  Sparkles,
  Wallet,
  Calendar,
} from 'lucide-react'
import { useData } from '../store'
import { computeBalances, isCashIn, isCashOut } from '../db/ledger'
import { getSetting, setSetting, db } from '../db/db'
import {
  addDaysISO,
  addMonthsISO,
  daysBetween,
  endOfMonthISO,
  startOfMonthISO,
  formatMonth,
  fromISO,
  money,
  moneyShort,
  periodRange,
  previousRange,
  todayISO,
  type PeriodKey,
  type Range,
} from '../lib/format'
import { filterHref } from '../lib/filters'
import { Card, CatIcon, Empty, Heading, Money, SpeakBtn, cx, inputCls } from '../components/ui'
import { AppleCard } from '../components/apple/AppleCard'
import { AppleSegmentedControl } from '../components/apple/AppleSegmentedControl'
import { EntryRow } from '../components/EntryRow'

const PERIODS: PeriodKey[] = ['toDate', 'today', 'week', 'month', 'lastMonth', 'custom']

function sumIn(txns: { amount: number }[]) {
  return txns.reduce((s, x) => s + x.amount, 0)
}

export function Home() {
  const { t } = useTranslation()
  const nav = useNavigate()
  const { live, balances, accounts, categories, lines, maps, nm, lang } = useData()
  const [period, setPeriod] = useState<PeriodKey>('month')
  const [custom, setCustom] = useState<Range>({
    from: addDaysISO(todayISO(), -30),
    to: todayISO(),
  })
  const guide = useLiveQuery(() => getSetting('guide', false), [])
  const pending = useLiveQuery(() => db.txns.where('syncStatus').equals('pending').count(), [])

  useEffect(() => {
    try {
      const p = sessionStorage.getItem('period') as PeriodKey
      if (p) setPeriod(p)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    try {
      sessionStorage.setItem('period', period)
    } catch {
      /* ignore */
    }
  }, [period])

  const range = periodRange(period, custom)
  const prev = previousRange(period, range)
  const inRange = (r: Range) =>
    period === 'toDate'
      ? live.filter((x) => x.date <= r.to)
      : live.filter((x) => x.date >= r.from && x.date <= r.to)
  const cur = inRange(range)
  const aaya = sumIn(cur.filter(isCashIn))
  const gaya = sumIn(cur.filter(isCashOut))
  const bacha = aaya - gaya
  const periodLabel = period === 'custom' ? `${range.from} – ${range.to}` : (t(`period.${period}`) || (period === 'toDate' ? 'To date' : period))

  // Cash flow buckets: per day for ≤ 14 days, otherwise per week (or 6-month breakdown for toDate)
  const buckets = useMemo(() => {
    if (period === 'toDate') {
      const t = todayISO()
      const out: { label: string; from: string; to: string; in: number; out: number }[] = []
      for (let i = 5; i >= 0; i--) {
        const mStart = startOfMonthISO(addMonthsISO(t, -i))
        const mEnd = endOfMonthISO(mStart)
        const to = mEnd > t ? t : mEnd
        const xs = live.filter((x) => x.date >= mStart && x.date <= to)
        const label = fromISO(mStart).toLocaleDateString(
          lang === 'hi' ? 'hi-IN' : 'en-IN',
          { month: 'short' }
        )
        out.push({ label, from: mStart, to, in: sumIn(xs.filter(isCashIn)), out: sumIn(xs.filter(isCashOut)) })
      }
      return out
    }
    const days = daysBetween(range.from, range.to) + 1
    const step = days <= 14 ? 1 : 7
    const out: { label: string; from: string; to: string; in: number; out: number }[] = []
    for (let d = range.from; d <= range.to; d = addDaysISO(d, step)) {
      const to = addDaysISO(d, step - 1) > range.to ? range.to : addDaysISO(d, step - 1)
      const xs = cur.filter((x) => x.date >= d && x.date <= to)
      const label =
        step === 1
          ? fromISO(d).toLocaleDateString(
              lang === 'hi' ? 'hi-IN' : 'en-IN',
              days <= 7 ? { weekday: 'short' } : { day: 'numeric' }
            )
          : `${fromISO(d).getDate()}–${fromISO(to).getDate()}`
      out.push({ label, from: d, to, in: sumIn(xs.filter(isCashIn)), out: sumIn(xs.filter(isCashOut)) })
    }
    return out
  }, [cur, range.from, range.to, lang, period, live])
  const maxBar = Math.max(1, ...buckets.flatMap((b) => [b.in, b.out]))

  // Top 5 spend categories (by parent), rest grouped as "Baaki"
  const spend = useMemo(() => {
    const m = new Map<string, number>()
    for (const x of cur.filter(isCashOut)) {
      const c = maps.cats.get(x.categoryId ?? '')
      const key = c?.parentId ?? c?.id ?? 'none'
      m.set(key, (m.get(key) ?? 0) + x.amount)
    }
    const rows = [...m.entries()].sort((a, b) => b[1] - a[1])
    const top = rows.slice(0, 5)
    const rest = rows.slice(5).reduce((s, [, v]) => s + v, 0)
    return { top, rest, total: rows.reduce((s, [, v]) => s + v, 0) }
  }, [cur, maps.cats])

  // Incoming money categories breakdown (by parent category)
  const incomeCats = useMemo(() => {
    const inTxns = cur.filter((x) => x.direction === 'in' && !x.deletedAt)
    const m = new Map<string, number>()
    for (const x of inTxns) {
      const c = maps.cats.get(x.categoryId ?? '')
      const key = c?.parentId ?? c?.id ?? 'none'
      m.set(key, (m.get(key) ?? 0) + x.amount)
    }

    // Top-level active incoming categories
    const active = categories.filter((c) => c.direction === 'in' && !c.hidden && !c.parentId)

    // Build list of category items with current period income amount
    const items = active
      .map((c) => ({
        category: c,
        amount: m.get(c.id) ?? 0,
      }))
      .sort((a, b) => b.amount - a.amount || a.category.sort - b.category.sort)

    const noneAmount = m.get('none') ?? 0

    return { items, noneAmount, total: sumIn(inTxns) }
  }, [cur, categories, maps.cats])

  // Net worth, 6-month line
  const openingSet = accounts.some((a) => a.opening !== 0) || live.length > 5
  const nwSeries = useMemo(() => {
    const out: { label: string; v: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const m = addMonthsISO(todayISO(), -i)
      const end = i === 0 ? todayISO() : endOfMonthISO(m)
      out.push({
        label: formatMonth(m, lang).split(' ')[0].slice(0, 3),
        v: computeBalances(accounts, lines, end).netWorth,
      })
    }
    return out
  }, [accounts, lines, lang])

  const recent = live.slice(0, 5)
  const isEmpty = live.length === 0

  return (
    <div className="flex flex-col gap-4">
      {/* First-time Guide Callout */}
      {guide && (
        <div className="apple-card flex items-center justify-between border-l-4 border-l-[#007AFF] p-4 bg-blue-50/40 dark:bg-blue-950/20">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#007AFF]/15 text-[#007AFF]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="apple-headline text-neutral-900 dark:text-white">
                {t('onb.guideTitle') || 'Welcome to Hisaab!'}
              </div>
              <p className="text-xs text-neutral-600 dark:text-neutral-400">
                {t('onb.guideBody') || 'Tap below to record your first Money In or Money Out.'}
              </p>
            </div>
          </div>
          <button
            className="apple-press text-xs font-semibold text-neutral-500 hover:text-neutral-800"
            onClick={() => setSetting('guide', false)}
          >
            {t('act.skip') || 'Dismiss'}
          </button>
        </div>
      )}

      {/* Two Big Primary Action Buttons (Mobile) */}
      <div className="grid grid-cols-2 gap-3 md:hidden">
        <button
          onClick={() => nav('/add/in')}
          className="apple-press flex h-20 flex-col items-center justify-center gap-1 rounded-2xl bg-[#34C759] p-3 text-white shadow-lg shadow-[#34C759]/25"
        >
          <div className="flex items-center gap-1.5 text-xl font-bold">
            <ArrowDownLeft className="h-6 w-6 stroke-[3]" />
            <span>{t('act.in') || 'Money In'}</span>
          </div>
          <span className="text-[11px] font-medium opacity-90">Money In / बिक्री</span>
        </button>

        <button
          onClick={() => nav('/add/out')}
          className="apple-press flex h-20 flex-col items-center justify-center gap-1 rounded-2xl bg-[#FF3B30] p-3 text-white shadow-lg shadow-[#FF3B30]/25"
        >
          <div className="flex items-center gap-1.5 text-xl font-bold">
            <ArrowUpRight className="h-6 w-6 stroke-[3]" />
            <span>{t('act.out') || 'Money Out'}</span>
          </div>
          <span className="text-[11px] font-medium opacity-90">Money Out / खर्च</span>
        </button>
      </div>

      {/* Apple Segmented Period Control & Custom Date Range in a Single Row */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="w-full sm:w-[620px] sm:max-w-2xl shrink-0">
          <AppleSegmentedControl
            value={period}
            onChange={setPeriod}
            options={PERIODS.map((k) => ({
              value: k,
              label: t(`period.${k}`) || k,
            }))}
          />
        </div>

        {period === 'custom' && (
          <div className="flex items-center gap-1.5 shrink-0 bg-neutral-200/70 dark:bg-[#1C1C1E] p-1 rounded-xl border border-black/[0.04] dark:border-white/10 shadow-sm animate-in fade-in duration-150">
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-semibold text-neutral-500 pl-1.5 whitespace-nowrap">
                {t('period.from') || 'From'}
              </span>
              <input
                type="date"
                aria-label={t('period.from') || 'From'}
                className="h-8 w-32 sm:w-36 rounded-lg border border-black/[0.08] dark:border-white/10 bg-white dark:bg-[#2C2C2E] px-2 text-xs font-semibold text-neutral-800 dark:text-neutral-200 shadow-sm outline-none focus:border-[#007AFF] focus:ring-1 focus:ring-[#007AFF]"
                value={custom.from}
                onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })}
              />
            </div>
            <span className="text-neutral-400 font-bold text-xs">–</span>
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-semibold text-neutral-500 whitespace-nowrap">
                {t('period.to') || 'To'}
              </span>
              <input
                type="date"
                aria-label={t('period.to') || 'To'}
                className="h-8 w-32 sm:w-36 rounded-lg border border-black/[0.08] dark:border-white/10 bg-white dark:bg-[#2C2C2E] px-2 text-xs font-semibold text-neutral-800 dark:text-neutral-200 shadow-sm outline-none focus:border-[#007AFF] focus:ring-1 focus:ring-[#007AFF]"
                value={custom.to}
                onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })}
              />
            </div>
          </div>
        )}
      </div>

      {/* Hero Financial Health Card (Apple Wallet style) */}
      <div className="apple-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-[#6E6E73] dark:text-[#A1A1A6]">
              {periodLabel}
            </span>
            <SpeakBtn
              text={
                t('hero.speak', {
                  period: periodLabel,
                  in: money(aaya),
                  out: money(gaya),
                  left: money(bacha),
                }) || `Summary: Money In ${money(aaya)}, Money Out ${money(gaya)}, Balance ${money(bacha)}`
              }
            />
          </div>
        </div>

        {/* Large Net Savings Display & In/Out Tiles */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          <div className="mb-2 md:mb-0 text-center md:text-left">
            <div className="text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]">
              {t('hero.left') || 'Remaining / बचा'}
            </div>
            <div className="mt-1">
              <Money paise={bacha} tone="auto" size="xl" />
            </div>
          </div>

          <Link
            href={filterHref({ from: range.from, to: range.to, dir: 'in' })}
            className="apple-press flex flex-col rounded-2xl bg-emerald-500/10 p-4 transition-colors hover:bg-emerald-500/15 dark:bg-emerald-500/20"
          >
            <div className="flex items-center gap-1 text-xs font-bold text-[#1C7430] dark:text-[#30D158]">
              <ArrowDownLeft className="h-4 w-4 stroke-[2.5]" />
              <span>{t('hero.in') || 'Money In'}</span>
            </div>
            <div className="mt-1">
              <Money paise={aaya} tone="in" size="lg" />
            </div>
          </Link>

          <Link
            href={filterHref({ from: range.from, to: range.to, dir: 'out' })}
            className="apple-press flex flex-col rounded-2xl bg-rose-500/10 p-4 transition-colors hover:bg-rose-500/15 dark:bg-rose-500/20"
          >
            <div className="flex items-center gap-1 text-xs font-bold text-[#D70015] dark:text-[#FF453A]">
              <ArrowUpRight className="h-4 w-4 stroke-[2.5]" />
              <span>{t('hero.out') || 'Money Out'}</span>
            </div>
            <div className="mt-1">
              <Money paise={gaya} tone="out" size="lg" />
            </div>
          </Link>
        </div>
      </div>

      {/* Income Categories Strip */}
      <div className="apple-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowDownLeft className="h-4 w-4 text-[#34C759] stroke-[2.5]" />
            <h3 className="apple-headline text-neutral-900 dark:text-white">
              {t('home.incomeCategories') || 'Money In'}
            </h3>
          </div>
          <Link
            href="/categories?dir=in"
            className="apple-press text-xs font-semibold text-[#007AFF] hover:underline"
          >
            {t('act.seeAll') || 'Manage'} →
          </Link>
        </div>

        {incomeCats.items.length === 0 && incomeCats.noneAmount === 0 ? (
          <div className="py-4 text-center">
            <p className="text-xs text-neutral-400">
              {t('home.noIncomeCats') || 'No Money In categories yet'}
            </p>
            <Link
              href="/categories?dir=in"
              className="apple-press mt-2 inline-block text-xs font-semibold text-[#007AFF] hover:underline"
            >
              + {t('cat.new') || 'Add category'}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
            {incomeCats.items.slice(0, 6).map((item) => (
              <Link
                key={item.category.id}
                href={filterHref({
                  from: range.from,
                  to: range.to,
                  cats: [item.category.id],
                  dir: 'in',
                })}
                className="apple-press flex flex-col items-center justify-center rounded-xl bg-neutral-100/70 p-2.5 text-center dark:bg-neutral-800/60"
              >
                <CatIcon icon={item.category.icon} color={item.category.color} size="md" />
                <span className="mt-1.5 truncate text-xs font-semibold text-neutral-600 dark:text-neutral-300 w-full px-1">
                  {nm(item.category)}
                </span>
                <span className="tabular-numbers mt-1 text-xs font-bold text-neutral-900 dark:text-white">
                  {moneyShort(item.amount)}
                </span>
              </Link>
            ))}
            {incomeCats.noneAmount > 0 && incomeCats.items.length < 6 && (
              <Link
                href={filterHref({
                  from: range.from,
                  to: range.to,
                  dir: 'in',
                })}
                className="apple-press flex flex-col items-center justify-center rounded-xl bg-neutral-100/70 p-2.5 text-center dark:bg-neutral-800/60"
              >
                <CatIcon icon="HelpCircle" color="#8E8E93" size="md" />
                <span className="mt-0.5 truncate text-xs font-semibold text-neutral-600 dark:text-neutral-300 w-full px-1">
                  {t('misc.noCategory') || 'Other'}
                </span>
                <span className="tabular-numbers mt-1 text-xs font-bold text-neutral-900 dark:text-white">
                  {moneyShort(incomeCats.noneAmount)}
                </span>
              </Link>
            )}
          </div>
        )}
      </div>

      {isEmpty ? (
        <div className="apple-card p-8">
          <Empty
            icon="BookOpen"
            title={t('home.emptyTitle') || 'No Entries Yet'}
            body={t('home.emptyBody') || 'Start recording your daily Money In and Money Out.'}
          />
        </div>
      ) : (
        <>
          {/* Cash Flow Activity Chart (Apple Health Bars) */}
          <div className="apple-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="apple-headline text-neutral-900 dark:text-white">
                {t('home.cashflow') || 'Money In vs Money Out'}
              </h3>
              <div className="flex items-center gap-3 text-xs font-semibold">
                <span className="flex items-center gap-1 text-[#1C7430] dark:text-[#30D158]">
                  <span className="h-2 w-2 rounded-full bg-[#1C7430] dark:bg-[#30D158]" />
                  {t('hero.in') || 'Money In'}
                </span>
                <span className="flex items-center gap-1 text-[#D70015] dark:text-[#FF453A]">
                  <span className="h-2 w-2 rounded-full bg-[#D70015] dark:bg-[#FF453A]" />
                  {t('hero.out') || 'Money Out'}
                </span>
              </div>
            </div>

            <div className="flex h-36 items-end gap-1 border-b border-black/[0.06] pb-1 dark:border-white/[0.08]">
              {buckets.map((b) => (
                <Link
                  key={b.from}
                  href={filterHref({ from: b.from, to: b.to })}
                  className="group flex h-full flex-1 flex-col justify-end"
                  title={`${b.label}: ↓ ${money(b.in)} ↑ ${money(b.out)}`}
                >
                  <div className="flex h-full items-end justify-center gap-0.5">
                    <div
                      className="w-1/2 max-w-[14px] rounded-t-sm bg-[#34C759] transition-all group-hover:opacity-80"
                      style={{ height: `${(b.in / maxBar) * 100}%` }}
                    />
                    <div
                      className="w-1/2 max-w-[14px] rounded-t-sm bg-[#FF3B30] transition-all group-hover:opacity-80"
                      style={{ height: `${(b.out / maxBar) * 100}%` }}
                    />
                  </div>
                </Link>
              ))}
            </div>
            <div className="mt-1.5 flex gap-1">
              {buckets.map((b, i) => (
                <span
                  key={b.from}
                  className="flex-1 truncate text-center text-[10px] text-[#8E8E93] dark:text-[#A1A1A6]"
                >
                  {buckets.length > 16 && i % 2 ? '' : b.label}
                </span>
              ))}
            </div>
          </div>

          {/* Spend Categories & Net Worth Grid */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Where the Money Went */}
            <div className="apple-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="apple-headline text-neutral-900 dark:text-white">
                  {t('home.whereSpent') || 'Where the money went'}
                </h3>
              </div>

              {spend.total === 0 ? (
                <p className="text-xs text-neutral-400">—</p>
              ) : (
                <div className="space-y-2.5">
                  {spend.top.map(([id, v]) => {
                    const c = maps.cats.get(id)
                    const pct = Math.round((v / spend.total) * 100)
                    return (
                      <Link
                        key={id}
                        href={filterHref({
                          from: range.from,
                          to: range.to,
                          cats: [id],
                          dir: 'out',
                        })}
                        className="apple-press block"
                      >
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 truncate">
                            <CatIcon icon={c?.icon ?? 'Tag'} color={c?.color ?? '#FF3B30'} size="sm" />
                            <span className="truncate font-semibold text-neutral-800 dark:text-neutral-200">
                              {nm(c) || t('misc.noCategory') || 'Other'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-neutral-900 dark:text-white">
                              {money(v)}
                            </span>
                            <span className="w-8 text-right font-medium text-neutral-400">
                              {pct}%
                            </span>
                          </div>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${(v / spend.top[0][1]) * 100}%`,
                              backgroundColor: c?.color ?? '#FF3B30',
                            }}
                          />
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Net Worth Card */}
            <div className="apple-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="apple-headline text-neutral-900 dark:text-white">
                  {t('home.netWorth') || 'Net Worth'}
                </h3>
              </div>

              {!openingSet ? (
                <div>
                  <p className="mb-3 text-xs text-neutral-500">
                    {t('home.setOpening') || 'Set opening balance to track business net worth'}
                  </p>
                  <Link
                    href="/wallets"
                    className="apple-press inline-flex h-9 items-center rounded-xl bg-[#007AFF] px-3.5 text-xs font-bold text-white shadow-sm"
                  >
                    {t('home.setNow') || 'Set Opening Balance'} →
                  </Link>
                </div>
              ) : (
                <>
                  <div className="mb-3 grid grid-cols-3 gap-1 rounded-xl bg-neutral-100/70 p-2.5 text-center dark:bg-neutral-800/60">
                    <div>
                      <div className="text-[10px] text-[#6E6E73] dark:text-[#A1A1A6]">
                        {t('home.youHave') || 'Assets'}
                      </div>
                      <div className="tabular-numbers text-xs font-bold text-[#1C7430] dark:text-[#30D158]">
                        {money(balances.netWorth + balances.payable + balances.loans)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[#6E6E73] dark:text-[#A1A1A6]">
                        {t('home.youOwe') || 'Liabilities'}
                      </div>
                      <div className="tabular-numbers text-xs font-bold text-[#D70015] dark:text-[#FF453A]">
                        {money(balances.payable + balances.loans)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[#6E6E73] dark:text-[#A1A1A6]">Total Net</div>
                      <div className="tabular-numbers text-xs font-bold text-neutral-900 dark:text-white">
                        {money(balances.netWorth)}
                      </div>
                    </div>
                  </div>
                  <Sparkline data={nwSeries} />
                </>
              )}
            </div>
          </div>

          {/* Recent Entries Grouped Inset List */}
          <div className="apple-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-3 dark:border-white/[0.08]">
              <h3 className="apple-headline text-neutral-900 dark:text-white">
                {t('home.recent') || 'Recent Entries'}
              </h3>
              <Link
                href="/entries"
                className="apple-press text-xs font-semibold text-[#007AFF] hover:underline"
              >
                {t('act.seeAll') || 'See All'} →
              </Link>
            </div>
            <div className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
              {recent.map((x) => (
                <EntryRow key={x.id} t={x} showDate />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Sparkline({ data }: { data: { label: string; v: number }[] }) {
  const w = 300
  const h = 70
  const min = Math.min(0, ...data.map((d) => d.v))
  const max = Math.max(1, ...data.map((d) => d.v))
  const x = (i: number) => (i / (data.length - 1)) * (w - 20) + 10
  const y = (v: number) => h - 14 - ((v - min) / (max - min || 1)) * (h - 28)
  const pts = data.map((d, i) => `${x(i)},${y(d.v)}`).join(' ')
  return (
    <svg
      viewBox={`0 0 ${w} ${h + 14}`}
      className="w-full"
      role="img"
      aria-label={data.map((d) => `${d.label} ${moneyShort(d.v)}`).join(', ')}
    >
      {min < 0 && (
        <line
          x1="0"
          x2={w}
          y1={y(0)}
          y2={y(0)}
          stroke="rgba(0,0,0,0.1)"
          strokeDasharray="4 4"
        />
      )}
      <polyline
        points={pts}
        fill="none"
        stroke="#007AFF"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(d.v)} r="3.5" fill="#007AFF" />
          <text
            x={x(i)}
            y={h + 10}
            fontSize="10"
            fontWeight="500"
            textAnchor="middle"
            fill="#8E8E93"
          >
            {d.label}
          </text>
        </g>
      ))}
    </svg>
  )
}
