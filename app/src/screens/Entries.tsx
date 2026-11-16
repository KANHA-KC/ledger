'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from '../lib/navigation'
import { useTranslation } from 'react-i18next'
import {
  SlidersHorizontal,
  FileSpreadsheet,
  Printer,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Trash2,
  FolderInput,
  Pencil,
  Paperclip,
  ArrowLeftRight,
  Check,
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  ChevronDown,
} from 'lucide-react'
import { AppIcon } from '../components/AppIcon'
import { useData, useToast } from '../store'
import { activeCount, applyFilter, emptyFilter, filterToParams, parseFilter, type Filter } from '../lib/filters'
import { formatDate, money, periodRange, rupeesToPaise, todayISO } from '../lib/format'
import { Btn, CatIcon, Chip, Empty, Field, Sheet, Money, inputCls } from '../components/ui'
import { TranslitInput } from '../components/TranslitInput'
import { downloadEntriesCSV, printEntries } from './reportUtils'
import { saveTxn, softDelete, undelete } from '../db/ledger'
import type { Txn } from '../db/types'
import { EntryRow } from '../components/EntryRow'

type SortField = 'date' | 'category' | 'note' | 'amount'
type SortDir = 'asc' | 'desc'

export function Entries() {
  const { t } = useTranslation()
  const [sp, setSp] = useSearchParams()
  const data = useData()
  const { live, maps, nm, lang, categories, accounts, parties, txns } = data
  const toast = useToast()

  const f = parseFilter(sp)
  const [filterOpen, setFilterOpen] = useState(false)
  const [categorySheetOpen, setCategorySheetOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [singleDeleteTarget, setSingleDeleteTarget] = useState<Txn | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Sorting state
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const searchRef = useRef<HTMLInputElement>(null)
  const masterCheckRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (sp.get('focus')) searchRef.current?.focus()
  }, [sp])

  const setF = (next: Filter) => setSp(filterToParams(next))

  // Filtered entries
  const filteredList = useMemo(
    () => applyFilter(live, f, { ...maps, lang }),
    [live, sp.toString(), maps, lang]
  )

  // Sorted entries
  const list = useMemo(() => {
    const res = [...filteredList]
    res.sort((a, b) => {
      let diff = 0
      if (sortField === 'date') {
        diff = a.date.localeCompare(b.date)
        if (diff === 0) diff = (a.createdAt || '').localeCompare(b.createdAt || '')
      } else if (sortField === 'amount') {
        diff = a.amount - b.amount
      } else if (sortField === 'category') {
        const cA = a.categoryId ? (nm(maps.cats.get(a.categoryId)) || '') : ''
        const cB = b.categoryId ? (nm(maps.cats.get(b.categoryId)) || '') : ''
        diff = cA.localeCompare(cB)
      } else if (sortField === 'note') {
        const nA = (a.note || maps.parties.get(a.partyId ?? '')?.name || '').toLowerCase()
        const nB = (b.note || maps.parties.get(b.partyId ?? '')?.name || '').toLowerCase()
        diff = nA.localeCompare(nB)
      }
      return sortDir === 'asc' ? diff : -diff
    })
    return res
  }, [filteredList, sortField, sortDir, maps, nm])

  const totalIn = list.filter((x) => x.direction === 'in').reduce((s, x) => s + x.amount, 0)
  const totalOut = list.filter((x) => x.direction === 'out').reduce((s, x) => s + x.amount, 0)
  const net = totalIn - totalOut

  // Multi-selection calculations
  const allSelected = list.length > 0 && list.every((x) => selectedIds.has(x.id))
  const someSelected = list.some((x) => selectedIds.has(x.id))
  const isIndeterminate = someSelected && !allSelected

  useEffect(() => {
    if (masterCheckRef.current) {
      masterCheckRef.current.indeterminate = isIndeterminate
    }
  }, [isIndeterminate])

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(list.map((x) => x.id)))
    }
  }

  const toggleSelect = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedTxns = useMemo(
    () => live.filter((x) => selectedIds.has(x.id)),
    [live, selectedIds]
  )

  const selectedTotalAmount = useMemo(
    () => selectedTxns.reduce((s, x) => s + x.amount, 0),
    [selectedTxns]
  )

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir(field === 'amount' || field === 'date' ? 'desc' : 'asc')
    }
  }

  // Bulk Delete
  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    setIsProcessing(true)
    try {
      for (const id of ids) {
        await softDelete(id)
      }
      setSelectedIds(new Set())
      setDeleteConfirmOpen(false)
      toast({
        text: t('entries.bulkDeleted', { count: ids.length }) || `Moved ${ids.length} entries to Recycle Bin`,
        tone: 'ok',
        undo: async () => {
          for (const id of ids) {
            await undelete(id)
          }
        },
      })
    } finally {
      setIsProcessing(false)
    }
  }

  // Bulk Change Category
  const handleBulkChangeCategory = async (newCategoryId: string) => {
    if (selectedTxns.length === 0) return
    setIsProcessing(true)
    try {
      for (const txn of selectedTxns) {
        await saveTxn({ ...txn, categoryId: newCategoryId })
      }
      const count = selectedTxns.length
      setSelectedIds(new Set())
      setCategorySheetOpen(false)
      toast({
        text: t('entries.bulkCategoryUpdated', { count }) || `Updated category for ${count} entries`,
        tone: 'ok',
      })
    } finally {
      setIsProcessing(false)
    }
  }

  // Removable chips for active filters
  type ActiveChip = {
    label: string
    iconName?: string
    lucideIcon?: any
    remove: () => void
  }
  const chips: ActiveChip[] = []
  if (f.from || f.to) {
    chips.push({
      lucideIcon: Calendar,
      label: `${f.from ? formatDate(f.from, lang) : '…'} – ${f.to ? formatDate(f.to, lang) : '…'}`,
      remove: () => setF({ ...f, from: undefined, to: undefined }),
    })
  }
  if (f.dir) {
    chips.push({
      lucideIcon: f.dir === 'in' ? ArrowDownLeft : ArrowUpRight,
      label: f.dir === 'in' ? (t('act.in') || 'Money In') : (t('act.out') || 'Money Out'),
      remove: () => setF({ ...f, dir: undefined }),
    })
  }
  f.cats.forEach((id) => {
    const c = maps.cats.get(id)
    chips.push({
      iconName: c?.icon,
      label: nm(c),
      remove: () => setF({ ...f, cats: f.cats.filter((x) => x !== id) }),
    })
  })
  f.wallets.forEach((id) => {
    const a = maps.accounts.get(id)
    chips.push({
      iconName: a?.icon,
      label: nm(a),
      remove: () => setF({ ...f, wallets: f.wallets.filter((x) => x !== id) }),
    })
  })
  f.parties.forEach((id) => {
    const p = maps.parties.get(id)
    chips.push({
      label: p ? p.name.replace(/\s*\([^)]*\)$/, '').trim() : '',
      remove: () => setF({ ...f, parties: f.parties.filter((x) => x !== id) }),
    })
  })
  f.tags.forEach((tg) =>
    chips.push({
      label: `# ${tg}`,
      remove: () => setF({ ...f, tags: f.tags.filter((x) => x !== tg) }),
    })
  )
  if (f.min !== undefined || f.max !== undefined) {
    chips.push({
      label: `₹ ${f.min !== undefined ? money(f.min) : '0'} – ${f.max !== undefined ? money(f.max) : '∞'}`,
      remove: () => setF({ ...f, min: undefined, max: undefined }),
    })
  }

  const summary =
    t('entries.summary', {
      count: list.length,
      total: money(f.dir === 'out' ? totalOut : f.dir === 'in' ? totalIn : net),
    }) || `${list.length} entries · Total: ${money(net)}`

  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3 w-3 opacity-30 group-hover:opacity-70 transition-opacity ml-1" />
    }
    return sortDir === 'asc' ? (
      <ArrowUp className="h-3 w-3 text-[#007AFF] ml-1" />
    ) : (
      <ArrowDown className="h-3 w-3 text-[#007AFF] ml-1" />
    )
  }

  return (
    <div className="space-y-4 pb-20">
      {/* Top Header Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="apple-large-title text-neutral-900 dark:text-white">
            {t('entries.title') || 'Entries'}
          </h1>
          <p className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">{summary}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => downloadEntriesCSV(list, data, t)}
            className="apple-press flex h-9 items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-3 text-xs font-semibold text-neutral-800 shadow-sm hover:bg-neutral-50 dark:border-white/[0.1] dark:bg-[#2C2C2E] dark:text-white"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-[#34C759]" />
            <span>{t('reports.excel') || 'Excel'}</span>
          </button>
          <button
            type="button"
            onClick={() => printEntries(list, data, t, summary)}
            className="apple-press flex h-9 items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-3 text-xs font-semibold text-neutral-800 shadow-sm hover:bg-neutral-50 dark:border-white/[0.1] dark:bg-[#2C2C2E] dark:text-white"
          >
            <Printer className="h-3.5 w-3.5 text-[#007AFF]" />
            <span>{t('reports.pdf') || 'PDF'}</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Toolbar: Native Mobile Row + Desktop Unified Row */}
      <div className="flex flex-col md:flex-row md:items-center gap-2">
        {/* Row 1 on Mobile: Search input + Filter button */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="relative flex-1 md:flex-initial md:w-80 lg:w-96 min-w-0">
            <TranslitInput
              inputRef={searchRef}
              value={f.q ?? ''}
              onChange={(q) => setF({ ...f, q: q || undefined })}
              placeholder={t('entries.searchPh') || 'Search note, person, category...'}
            />
          </div>

          {/* Direction Toggle on Desktop: immediately to the right of search */}
          <div className="hidden md:flex items-center h-[46px] p-1 bg-black/[0.05] dark:bg-white/[0.08] rounded-xl shrink-0">
            <button
              type="button"
              onClick={() => setF({ ...f, dir: undefined })}
              className={`h-full px-3 text-xs font-bold rounded-lg transition-colors ${
                !f.dir
                  ? 'bg-white text-neutral-900 shadow-sm dark:bg-[#2C2C2E] dark:text-white'
                  : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
              }`}
            >
              {t('filter.both') || 'Both'}
            </button>
            <button
              type="button"
              onClick={() => setF({ ...f, dir: 'in' })}
              className={`h-full px-3 text-xs font-bold rounded-lg transition-colors ${
                f.dir === 'in'
                  ? 'bg-[#34C759] text-white shadow-sm'
                  : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
              }`}
            >
              ↓ {t('act.in') || 'Money In'}
            </button>
            <button
              type="button"
              onClick={() => setF({ ...f, dir: 'out' })}
              className={`h-full px-3 text-xs font-bold rounded-lg transition-colors ${
                f.dir === 'out'
                  ? 'bg-[#FF3B30] text-white shadow-sm'
                  : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
              }`}
            >
              ↑ {t('act.out') || 'Money Out'}
            </button>
          </div>

          {/* Filter Button on Mobile (visible only on mobile in row 1) - Invariant fixed width */}
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            className={`apple-press md:hidden relative flex h-[46px] w-[96px] items-center justify-center gap-1.5 rounded-xl text-xs font-bold transition-colors shrink-0 ${
              activeCount(f) > 0
                ? 'bg-[#007AFF] text-white shadow-md'
                : 'border border-black/[0.08] bg-white text-neutral-800 shadow-sm hover:bg-neutral-50 dark:border-white/[0.1] dark:bg-[#1C1C1E] dark:text-neutral-200'
            }`}
          >
            <SlidersHorizontal className="h-4 w-4 shrink-0" />
            <span>{t('act.filter') || 'Filter'}</span>
            {activeCount(f) > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#FF3B30] px-1 text-[10px] font-bold text-white shadow-md ring-2 ring-white dark:ring-[#1C1C1E]">
                {activeCount(f)}
              </span>
            )}
          </button>
        </div>

        {/* Row 2 on Mobile (scrollable horizontal strip) / Right side on Desktop */}
        <div className="flex items-center justify-between md:justify-end gap-2 overflow-x-auto no-scrollbar pb-1 md:pb-0 shrink-0">
          {/* Direction Toggle on Mobile (visible only on mobile) */}
          <div className="flex md:hidden items-center h-[42px] p-1 bg-black/[0.05] dark:bg-white/[0.08] rounded-xl shrink-0">
            <button
              type="button"
              onClick={() => setF({ ...f, dir: undefined })}
              className={`h-full px-3 text-xs font-bold rounded-lg transition-colors ${
                !f.dir
                  ? 'bg-white text-neutral-900 shadow-sm dark:bg-[#2C2C2E] dark:text-white'
                  : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
              }`}
            >
              {t('filter.both') || 'Both'}
            </button>
            <button
              type="button"
              onClick={() => setF({ ...f, dir: 'in' })}
              className={`h-full px-3 text-xs font-bold rounded-lg transition-colors ${
                f.dir === 'in'
                  ? 'bg-[#34C759] text-white shadow-sm'
                  : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
              }`}
            >
              ↓ {t('act.in') || 'Money In'}
            </button>
            <button
              type="button"
              onClick={() => setF({ ...f, dir: 'out' })}
              className={`h-full px-3 text-xs font-bold rounded-lg transition-colors ${
                f.dir === 'out'
                  ? 'bg-[#FF3B30] text-white shadow-sm'
                  : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
              }`}
            >
              ↑ {t('act.out') || 'Money Out'}
            </button>
          </div>

          {/* Quick Date Shortcuts (Today | Week | Month) */}
          <div className="flex items-center h-[42px] md:h-[46px] p-1 bg-black/[0.05] dark:bg-white/[0.08] rounded-xl shrink-0">
            {(['today', 'week', 'month'] as const).map((p) => {
              const r = periodRange(p)
              const isActive = f.from === r.from && f.to === r.to
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    if (isActive) setF({ ...f, from: undefined, to: undefined })
                    else setF({ ...f, from: r.from, to: r.to })
                  }}
                  className={`h-full px-3 text-xs font-bold rounded-lg transition-colors ${
                    isActive
                      ? 'bg-[#007AFF] text-white shadow-sm'
                      : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
                  }`}
                >
                  {t(`period.${p}`) || p}
                </button>
              )
            })}
          </div>

          {/* Filter Button on Desktop - Invariant fixed width to prevent horizontal layout shift */}
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            className={`apple-press hidden md:flex relative h-[46px] w-[96px] items-center justify-center gap-1.5 rounded-xl text-xs font-bold transition-colors shrink-0 ${
              activeCount(f) > 0
                ? 'bg-[#007AFF] text-white shadow-md'
                : 'border border-black/[0.08] bg-white text-neutral-800 shadow-sm hover:bg-neutral-50 dark:border-white/[0.1] dark:bg-[#1C1C1E] dark:text-neutral-200'
            }`}
          >
            <SlidersHorizontal className="h-4 w-4 shrink-0" />
            <span>{t('act.filter') || 'Filter'}</span>
            {activeCount(f) > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#FF3B30] px-1 text-[10px] font-bold text-white shadow-md ring-2 ring-white dark:ring-[#1C1C1E]">
                {activeCount(f)}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Filter Badges Strip (Horizontally Scrollable) */}
      {chips.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-nowrap py-0.5">
          {chips.map((c, i) => {
            const IconComp = c.lucideIcon
            return (
              <button
                key={i}
                type="button"
                onClick={c.remove}
                className="apple-press inline-flex h-8 items-center gap-1.5 rounded-full bg-[#007AFF]/10 px-3 text-xs font-semibold text-[#007AFF] hover:bg-[#007AFF]/15 shrink-0"
              >
                {IconComp && <IconComp className="h-3.5 w-3.5 shrink-0" />}
                {c.iconName && <AppIcon name={c.iconName} className="h-3.5 w-3.5 shrink-0" />}
                <span>{c.label}</span>
                <X className="h-3.5 w-3.5" />
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => setF(emptyFilter())}
            className="apple-press ml-1 text-xs font-semibold text-neutral-400 hover:text-neutral-700 shrink-0"
          >
            {t('act.clear') || 'Clear all'}
          </button>
        </div>
      )}

      {/* Summary Total Card */}
      <div className="apple-card flex flex-wrap items-center justify-between p-3.5">
        <span className="text-sm font-bold text-neutral-900 dark:text-white">{summary}</span>
        {!f.dir && (
          <div className="flex items-center gap-3 text-xs font-semibold">
            <span className="text-[#1C7430] dark:text-[#30D158]">↓ {money(totalIn)}</span>
            <span className="text-[#8E8E93] dark:text-[#787880]">·</span>
            <span className="text-[#D70015] dark:text-[#FF453A]">↑ {money(totalOut)}</span>
          </div>
        )}
      </div>

      {/* Modern Interactive Data Table */}
      {list.length === 0 ? (
        <div className="apple-card p-10">
          <Empty
            icon="Search"
            title={live.length ? t('entries.empty') || 'No entries found' : t('entries.emptyAll') || 'No entries yet'}
            action={
              chips.length ? (
                <Btn tone="ghost" onClick={() => setF(emptyFilter())}>
                  {t('act.clear') || 'Clear Filters'}
                </Btn>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
          {/* Mobile Native View (< md screens): iOS Grouped Card List with EntryRow */}
          <div className="md:hidden">
            <div className="apple-card divide-y divide-black/[0.04] dark:divide-white/[0.06] overflow-hidden shadow-sm">
              {list.map((x) => (
                <EntryRow key={x.id} t={x} showDate />
              ))}
            </div>
          </div>

          {/* Desktop View (>= md screens): Full Tabular Data Grid with Sortable Columns */}
          <div className="hidden md:block apple-card overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] border-collapse text-left">
              <thead>
                <tr className="border-b border-black/[0.08] dark:border-white/[0.08] bg-neutral-50/80 dark:bg-neutral-800/60 text-xs font-semibold text-[#6E6E73] dark:text-[#A1A1A6]">
                  {/* Master Checkbox */}
                  <th className="w-12 px-4 py-3 text-center">
                    <input
                      ref={masterCheckRef}
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      aria-label={t('entries.selectAll') || 'Select all'}
                      className="h-4 w-4 rounded border-gray-300 text-[#007AFF] focus:ring-[#007AFF] cursor-pointer"
                    />
                  </th>

                  {/* Date Column (Sortable) */}
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleSort('date')}
                      className="group flex items-center text-xs font-semibold text-[#6E6E73] dark:text-[#A1A1A6] hover:text-neutral-900 dark:hover:text-white"
                    >
                      <span>{t('entries.dateCol') || 'Date'}</span>
                      {renderSortIndicator('date')}
                    </button>
                  </th>

                  {/* Type Column */}
                  <th className="px-3 py-3 w-24">
                    {t('entries.typeCol') || 'Type'}
                  </th>

                  {/* Category Column (Sortable) */}
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleSort('category')}
                      className="group flex items-center text-xs font-semibold text-[#6E6E73] dark:text-[#A1A1A6] hover:text-neutral-900 dark:hover:text-white"
                    >
                      <span>{t('entries.catCol') || 'Category'}</span>
                      {renderSortIndicator('category')}
                    </button>
                  </th>

                  {/* Note / Person Column (Sortable) */}
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleSort('note')}
                      className="group flex items-center text-xs font-semibold text-[#6E6E73] dark:text-[#A1A1A6] hover:text-neutral-900 dark:hover:text-white"
                    >
                      <span>{t('entries.noteCol') || 'Description / Note'}</span>
                      {renderSortIndicator('note')}
                    </button>
                  </th>

                  {/* Amount Column (Sortable) */}
                  <th className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort('amount')}
                      className="group ml-auto flex items-center text-xs font-semibold text-[#6E6E73] dark:text-[#A1A1A6] hover:text-neutral-900 dark:hover:text-white"
                    >
                      <span>{t('entries.amountCol') || 'Amount'}</span>
                      {renderSortIndicator('amount')}
                    </button>
                  </th>

                  {/* Action Column */}
                  <th className="w-20 px-4 py-3 text-right">
                    {t('entries.actionsCol') || 'Action'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04] dark:divide-white/[0.06] text-sm">
                {list.map((x) => {
                  const isSelected = selectedIds.has(x.id)
                  const c = x.categoryId ? maps.cats.get(x.categoryId) : undefined
                  const p = x.partyId ? maps.parties.get(x.partyId) : undefined
                  const w = x.accountId ? maps.accounts.get(x.accountId) : undefined
                  const to = x.toAccountId ? maps.accounts.get(x.toAccountId) : undefined
                  const isTransfer = x.direction === 'transfer'
                  const title = isTransfer ? `${nm(w)} → ${nm(to)}` : nm(c) || t('misc.noCategory') || 'Uncategorized'
                  const editHref = isTransfer ? `/entries` : `/add/${x.direction}?edit=${x.id}`

                  return (
                    <tr
                      key={x.id}
                      onClick={() => toggleSelect(x.id)}
                      className={`group cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-[#007AFF]/[0.08] dark:bg-[#007AFF]/20 hover:bg-[#007AFF]/[0.12]'
                          : 'hover:bg-neutral-50/70 dark:hover:bg-[#2C2C2E]/60'
                      }`}
                    >
                      {/* Selection Checkbox Cell */}
                      <td
                        className="px-4 py-3 text-center"
                        onClick={(e) => toggleSelect(x.id, e)}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}} // Handled by onClick
                          aria-label={`Select entry ${title}`}
                          className="h-4 w-4 rounded border-gray-300 text-[#007AFF] focus:ring-[#007AFF] cursor-pointer"
                        />
                      </td>

                      {/* Date */}
                      <td className="px-4 py-3 text-xs font-semibold whitespace-nowrap text-neutral-600 dark:text-neutral-400">
                        {formatDate(x.date, lang)}
                      </td>

                      {/* Direction Badge */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        {isTransfer ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-2 py-0.5 text-xs font-bold text-[#007AFF]">
                            <ArrowLeftRight className="h-3 w-3" />
                            <span>{t('entries.transfer') || 'Transfer'}</span>
                          </span>
                        ) : x.direction === 'in' ? (
                          <span className="inline-flex items-center rounded-md bg-green-500/10 px-2 py-0.5 text-xs font-bold text-[#1C7430] dark:text-[#30D158]">
                            ↓ {t('act.in') || 'Money In'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-md bg-red-500/10 px-2 py-0.5 text-xs font-bold text-[#D70015] dark:text-[#FF453A]">
                            ↑ {t('act.out') || 'Money Out'}
                          </span>
                        )}
                      </td>

                      {/* Category */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {isTransfer ? (
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-neutral-200/80 text-neutral-700 dark:bg-[#2C2C2E] dark:text-neutral-200">
                              <ArrowLeftRight className="h-3.5 w-3.5" />
                            </div>
                          ) : (
                            <CatIcon icon={c?.icon ?? 'Tag'} color={c?.color ?? '#007AFF'} size="sm" />
                          )}
                          <span className="font-semibold text-neutral-900 dark:text-white truncate max-w-[160px]">
                            {title}
                          </span>
                        </div>
                      </td>

                      {/* Note / Details / Person */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5 max-w-[280px]">
                          {x.note && (
                            <span className="truncate text-xs font-medium text-neutral-800 dark:text-neutral-200">
                              {x.note}
                            </span>
                          )}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {p && (
                              <span className="inline-flex items-center text-[11px] font-semibold text-amber-800 dark:text-amber-400 bg-amber-500/10 rounded px-1.5 py-0.2">
                                <span>{p.name.replace(/\s*\([^)]*\)$/, '').trim()}</span>
                              </span>
                            )}
                            {x.tags && x.tags.length > 0 && (
                              x.tags.map((tg) => (
                                <span
                                  key={tg}
                                  className="text-[10px] text-[#6E6E73] dark:text-[#A1A1A6] bg-neutral-100 dark:bg-neutral-800 rounded px-1"
                                >
                                  #{tg}
                                </span>
                              ))
                            )}
                            {x.photoId && (
                              <Paperclip className="h-3 w-3 text-[#8E8E93] dark:text-[#A1A1A6]" />
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Money
                          paise={x.amount}
                          tone={isTransfer ? 'plain' : x.direction === 'in' ? 'in' : 'out'}
                          arrow={!isTransfer}
                          size="sm"
                        />
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href={editHref}
                            className="apple-press inline-flex h-7 w-7 items-center justify-center rounded-lg border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#2C2C2E] text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white shadow-sm"
                            title={t('entries.edit') || 'Edit'}
                          >
                            <Pencil className="h-3 w-3" />
                          </Link>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSingleDeleteTarget(x)
                            }}
                            className="apple-press inline-flex h-7 w-7 items-center justify-center rounded-lg border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#2C2C2E] text-neutral-600 hover:text-[#FF3B30] hover:border-rose-500/30 dark:text-neutral-300 dark:hover:text-[#FF453A] shadow-sm"
                            title={t('act.delete') || 'Delete'}
                            aria-label={t('act.delete') || 'Delete'}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}

      {/* Bulk Action Floating Toolbar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-2.5 sm:py-3 rounded-2xl bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-xl border border-black/10 dark:border-white/10 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center gap-2 pr-2 border-r border-black/10 dark:border-white/10 text-xs sm:text-sm font-bold text-neutral-900 dark:text-white whitespace-nowrap">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#007AFF] text-[10px] text-white">
              {selectedIds.size}
            </span>
            <span>{money(selectedTotalAmount)}</span>
          </div>

          {/* Change Category Action */}
          <button
            type="button"
            onClick={() => setCategorySheetOpen(true)}
            disabled={isProcessing}
            className="apple-press flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-xs font-semibold text-neutral-800 dark:text-neutral-200"
          >
            <FolderInput className="h-3.5 w-3.5 text-[#007AFF]" />
            <span className="hidden sm:inline">{t('entries.changeCategory') || 'Change Category'}</span>
          </button>

          {/* Export Selected to CSV */}
          <button
            type="button"
            onClick={() => downloadEntriesCSV(selectedTxns, data, t, 'selected-entries')}
            disabled={isProcessing}
            className="apple-press flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-xs font-semibold text-neutral-800 dark:text-neutral-200"
            title="Export Selected to Excel/CSV"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-[#34C759]" />
            <span className="hidden md:inline">Excel</span>
          </button>

          {/* Export Selected to PDF */}
          <button
            type="button"
            onClick={() => printEntries(selectedTxns, data, t, `${selectedTxns.length} entries selected`)}
            disabled={isProcessing}
            className="apple-press flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-xs font-semibold text-neutral-800 dark:text-neutral-200"
            title="Export Selected to PDF"
          >
            <Printer className="h-3.5 w-3.5 text-[#007AFF]" />
            <span className="hidden md:inline">PDF</span>
          </button>

          {/* Delete Action (Moves to Bin) */}
          <button
            type="button"
            onClick={() => setDeleteConfirmOpen(true)}
            disabled={isProcessing}
            className="apple-press flex items-center justify-center p-2 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/50 text-[#FF3B30] transition-colors"
            title={t('entries.bulkDelete', { count: selectedIds.size }) || `Delete (${selectedIds.size})`}
            aria-label={t('entries.bulkDelete', { count: selectedIds.size }) || `Delete (${selectedIds.size})`}
          >
            <Trash2 className="h-4 w-4" />
          </button>

          {/* Cancel / Deselect */}
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="apple-press p-1.5 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-white"
            title={t('entries.clearSelection') || 'Cancel'}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Bulk Delete Confirmation Dialog */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="apple-card w-full max-w-sm p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-[#FF3B30] dark:bg-red-950/50">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                  {t('entries.bulkDelete', { count: selectedIds.size }) || `Delete ${selectedIds.size} Entries`}
                </h3>
                <p className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
                  {t('entries.bulkDeleteConfirm', { count: selectedIds.size }) ||
                    `Move ${selectedIds.size} entries to Recycle Bin? They can be restored within 30 days.`}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <Btn tone="ghost" onClick={() => setDeleteConfirmOpen(false)} disabled={isProcessing}>
                {t('entries.clearSelection') || 'Cancel'}
              </Btn>
              <Btn tone="danger" onClick={handleBulkDelete} disabled={isProcessing}>
                {t('entries.bulkDelete', { count: selectedIds.size }) || 'Delete'}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* Single Delete Confirmation Dialog */}
      {singleDeleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="apple-card w-full max-w-sm p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-[#FF3B30] dark:bg-red-950/50">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                  {t('entries.deleteEntry') || 'Delete Entry'}
                </h3>
                <p className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
                  {t('entries.deleteConfirm') || 'Move this entry to Recycle Bin? It can be restored within 30 days.'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <Btn tone="ghost" onClick={() => setSingleDeleteTarget(null)} disabled={isProcessing}>
                {t('act.cancel') || 'Cancel'}
              </Btn>
              <Btn
                tone="danger"
                onClick={async () => {
                  if (!singleDeleteTarget) return
                  const id = singleDeleteTarget.id
                  setSingleDeleteTarget(null)
                  try {
                    await softDelete(id)
                    toast({
                      text: t('entries.movedToBin') || 'Moved entry to Recycle Bin',
                      tone: 'ok',
                      undo: async () => {
                        await undelete(id)
                      },
                    })
                  } catch (err) {
                    console.error(err)
                    toast({ text: 'Error deleting entry', tone: 'info' })
                  }
                }}
                disabled={isProcessing}
              >
                {t('act.delete') || 'Delete'}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Change Category Sheet */}
      <BulkCategorySheet
        open={categorySheetOpen}
        onClose={() => setCategorySheetOpen(false)}
        onSelect={handleBulkChangeCategory}
        categories={categories}
        nm={nm}
      />

      {/* Advanced Filter Bottom Sheet */}
      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        value={f}
        onApply={(nf) => {
          setF(nf)
          setFilterOpen(false)
        }}
        ctx={{
          categories,
          accounts,
          parties,
          nm,
          tags: [...new Set(txns.flatMap((x) => x.tags))],
          count: (nf) => applyFilter(live, nf, { ...maps, lang }).length,
        }}
      />
    </div>
  )
}

function BulkCategorySheet({
  open,
  onClose,
  onSelect,
  categories,
  nm,
}: {
  open: boolean
  onClose: () => void
  onSelect: (categoryId: string) => void
  categories: ReturnType<typeof useData>['categories']
  nm: ReturnType<typeof useData>['nm']
}) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<'in' | 'out'>('out')
  const availableCategories = categories.filter((c) => !c.deletedAt && c.direction === activeTab)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('entries.chooseNewCategory') || 'Choose category for selected entries'}
    >
      <div className="space-y-4">
        {/* Direction Switch */}
        <div className="flex rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800">
          <button
            type="button"
            onClick={() => setActiveTab('out')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'out'
                ? 'bg-white text-[#D70015] shadow-sm dark:bg-[#2C2C2E] dark:text-[#FF453A]'
                : 'text-neutral-600 dark:text-neutral-400'
            }`}
          >
            ↑ {t('act.out') || 'Money Out'}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('in')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'in'
                ? 'bg-white text-[#1C7430] shadow-sm dark:bg-[#2C2C2E] dark:text-[#30D158]'
                : 'text-neutral-600 dark:text-neutral-400'
            }`}
          >
            ↓ {t('act.in') || 'Money In'}
          </button>
        </div>

        {/* Categories Grid */}
        <div className="grid grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto pr-1">
          {availableCategories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              className="apple-press flex items-center gap-2.5 p-3 rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#2C2C2E] text-left hover:border-[#007AFF] transition-all"
            >
              <CatIcon icon={c.icon} color={c.color} size="sm" />
              <span className="text-xs font-bold text-neutral-900 dark:text-white truncate">
                {nm(c)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  )
}

function FilterSheet({
  open,
  onClose,
  value,
  onApply,
  ctx,
}: {
  open: boolean
  onClose: () => void
  value: Filter
  onApply: (f: Filter) => void
  ctx: {
    categories: ReturnType<typeof useData>['categories']
    accounts: ReturnType<typeof useData>['accounts']
    parties: ReturnType<typeof useData>['parties']
    nm: ReturnType<typeof useData>['nm']
    tags: string[]
    count: (f: Filter) => number
  }
}) {
  const { t } = useTranslation()
  const [f, setF] = useState<Filter>(value)

  useEffect(() => {
    if (open) setF(value)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (k: 'cats' | 'wallets' | 'parties' | 'tags', id: string) =>
    setF({
      ...f,
      [k]: f[k].includes(id) ? f[k].filter((x) => x !== id) : [...f[k], id],
    })

  const quick = (['today', 'week', 'month', 'lastMonth'] as const).map((p) => ({
    p,
    r: periodRange(p),
  }))
  const parents = ctx.categories.filter((c) => !c.parentId && (!f.dir || c.direction === f.dir))

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('filter.title') || 'Filter Entries'}
      footer={
        <div className="grid grid-cols-[auto_1fr] gap-2.5">
          <Btn tone="ghost" onClick={() => setF(emptyFilter())}>
            {t('act.clear') || 'Clear'}
          </Btn>
          <Btn tone="blue" onClick={() => onApply(f)}>
            {t('act.apply') || 'Apply'} ({ctx.count(f)})
          </Btn>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label={t('filter.direction') || 'Direction'}>
          <div className="flex flex-wrap gap-2">
            <Chip active={!f.dir} onClick={() => setF({ ...f, dir: undefined })}>
              {t('filter.both') || 'All'}
            </Chip>
            <Chip
              active={f.dir === 'in'}
              color="#34C759"
              onClick={() => setF({ ...f, dir: 'in' })}
            >
              ↓ {t('act.in') || 'Money In'}
            </Chip>
            <Chip
              active={f.dir === 'out'}
              color="#FF3B30"
              onClick={() => setF({ ...f, dir: 'out' })}
            >
              ↑ {t('act.out') || 'Money Out'}
            </Chip>
          </div>
        </Field>

        <Field label={t('filter.dateRange') || 'Date Range'}>
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {quick.map(({ p, r }) => (
              <Chip
                key={p}
                active={f.from === r.from && f.to === r.to}
                onClick={() => setF({ ...f, from: r.from, to: r.to })}
              >
                {t(`period.${p}`) || p}
              </Chip>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              aria-label={t('period.from')}
              className={inputCls}
              value={f.from ?? ''}
              onChange={(e) => setF({ ...f, from: e.target.value || undefined })}
            />
            <input
              type="date"
              aria-label={t('period.to')}
              className={inputCls}
              value={f.to ?? ''}
              onChange={(e) => setF({ ...f, to: e.target.value || undefined })}
            />
          </div>
        </Field>

        <Field label={t('filter.category') || 'Categories'}>
          <div className="flex flex-wrap gap-2">
            {parents
              .flatMap((c) => [c, ...ctx.categories.filter((k) => k.parentId === c.id)])
              .map((c) => (
                <Chip
                  key={c.id}
                  active={f.cats.includes(c.id)}
                  color={c.color}
                  onClick={() => toggle('cats', c.id)}
                >
                  <AppIcon name={c.icon} className="h-3.5 w-3.5 shrink-0" />
                  <span>{ctx.nm(c)}</span>
                </Chip>
              ))}
          </div>
        </Field>

        {ctx.parties.length > 0 && (
          <Field label={t('filter.party') || 'Parties'}>
            <div className="flex flex-wrap gap-1.5">
              {ctx.parties.map((p) => (
                <Chip
                  key={p.id}
                  active={f.parties.includes(p.id)}
                  color="#FF9500"
                  onClick={() => toggle('parties', p.id)}
                >
                  <span>{p.name.replace(/\s*\([^)]*\)$/, '').trim()}</span>
                </Chip>
              ))}
            </div>
          </Field>
        )}

        <Field label={t('filter.amount') || 'Amount Range'}>
          <div className="grid grid-cols-2 gap-2">
            <input
              className={inputCls}
              inputMode="numeric"
              placeholder={t('filter.min') || 'Min ₹'}
              value={f.min !== undefined ? f.min / 100 : ''}
              onChange={(e) =>
                setF({
                  ...f,
                  min: e.target.value ? rupeesToPaise(e.target.value) : undefined,
                })
              }
            />
            <input
              className={inputCls}
              inputMode="numeric"
              placeholder={t('filter.max') || 'Max ₹'}
              value={f.max !== undefined ? f.max / 100 : ''}
              onChange={(e) =>
                setF({
                  ...f,
                  max: e.target.value ? rupeesToPaise(e.target.value) : undefined,
                })
              }
            />
          </div>
        </Field>
      </div>
    </Sheet>
  )
}
