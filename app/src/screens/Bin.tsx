'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  RotateCcw,
  Trash2,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Search,
  X,
  Download,
  Printer,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Table as TableIcon,
  LayoutList,
  Check,
  CheckSquare,
  Square,
  Filter,
  Tag,
  CreditCard,
  AlertTriangle,
} from 'lucide-react'
import { AppIcon } from '../components/AppIcon'
import { useData, useToast } from '../store'
import { undelete, hardDelete, undeleteCategory, hardDeleteCategory } from '../db/ledger'
import { syncOrphanedCategoriesToBin } from '../db/seed'
import { addDaysISO, daysBetween, formatDate, money, todayISO } from '../lib/format'
import { download, printHTML, toCSV } from '../lib/export'
import { CatIcon, Empty, Money, Confirm, Btn } from '../components/ui'
import type { Category, Txn } from '../db/types'

type SortField = 'name' | 'kind' | 'category' | 'direction' | 'amount' | 'deletedAt' | 'daysLeft'
type SortOrder = 'asc' | 'desc'
type TypeFilter = 'all' | 'categories' | 'txns'
type DirFilter = 'all' | 'in' | 'out'
type ExpiryFilter = 'all' | 'soon' | 'safe'

interface BinUnifiedItem {
  key: string
  id: string
  kind: 'cat' | 'txn'
  name: string
  nameAlt?: string
  categoryName: string
  categoryIcon: string
  categoryColor: string
  walletName?: string
  partyName?: string
  paymentType?: string
  note?: string
  icon: string
  color?: string
  direction?: 'in' | 'out' | 'transfer'
  amount?: number
  deletedAt: string
  daysLeft: number
  rawCat?: Category
  rawTxn?: Txn
}

export function Bin() {
  const { t } = useTranslation()
  const { txns, maps, nm, lang, deletedCategories, business } = useData()
  const toast = useToast()

  // State
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [dirFilter, setDirFilter] = useState<DirFilter>('all')
  const [expiryFilter, setExpiryFilter] = useState<ExpiryFilter>('all')
  const [sortField, setSortField] = useState<SortField>('deletedAt')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table')
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())

  const [emptyConfirmOpen, setEmptyConfirmOpen] = useState(false)
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false)
  const [isRecovering, setIsRecovering] = useState(false)
  const [deletePermanentTarget, setDeletePermanentTarget] = useState<{
    type: 'txn' | 'cat'
    id: string
    title: string
  } | null>(null)

  // Automatically sync any missing default categories or orphan categories on mount
  useEffect(() => {
    if (business?.id && business?.type) {
      syncOrphanedCategoriesToBin(business.id, business.type).catch((err) => {
        console.error('Failed to sync orphaned categories to bin:', err)
      })
    }
  }, [business?.id, business?.type])

  // Normalize all deleted categories and transactions into a unified list
  const allItems = useMemo<BinUnifiedItem[]>(() => {
    const catItems: BinUnifiedItem[] = (deletedCategories ?? []).map((cat) => {
      const deletedDate = cat.deletedAt || todayISO()
      const daysLeft = Math.max(
        0,
        daysBetween(todayISO(), addDaysISO(deletedDate.slice(0, 10), 30))
      )
      const catName = nm(cat)
      const alt = cat.name_en === catName ? cat.name_hi : cat.name_en
      return {
        key: `cat-${cat.id}`,
        id: cat.id,
        kind: 'cat',
        name: catName,
        nameAlt: alt || (cat.direction === 'in' ? (t('cat.in') || 'Money in') : (t('cat.out') || 'Money out')),
        categoryName: catName,
        categoryIcon: cat.icon,
        categoryColor: cat.color || '#007AFF',
        paymentType: cat.direction === 'in' ? 'Money In' : 'Money Out',
        icon: cat.icon,
        color: cat.color,
        direction: cat.direction,
        amount: undefined,
        deletedAt: deletedDate,
        daysLeft,
        rawCat: cat,
      }
    })

    const txnItems: BinUnifiedItem[] = txns
      .filter((x) => x.deletedAt)
      .map((x) => {
        const c = maps.cats.get(x.categoryId ?? '')
        const p = maps.parties.get(x.partyId ?? '')
        const w = maps.accounts.get(x.accountId ?? '')
        const to = maps.accounts.get(x.toAccountId ?? '')
        const deletedDate = x.deletedAt || todayISO()
        const daysLeft = Math.max(
          0,
          daysBetween(todayISO(), addDaysISO(deletedDate.slice(0, 10), 30))
        )
        const isTransfer = x.direction === 'transfer'
        const catName = nm(c) || (isTransfer ? (t('entries.transfer') || 'Transfer') : (t('misc.noCategory') || 'Uncategorized'))
        const walletLabel = isTransfer && w && to ? `${nm(w)} → ${nm(to)}` : w ? nm(w) : undefined

        // Left-most primary name: note or person name or category/wallet
        const primaryName = x.note || (p ? p.name : '') || `${catName}${walletLabel ? ` (${walletLabel})` : ''}`
        const subtitleParts = [
          formatDate(x.date, lang),
          p && x.note ? p.name : undefined,
          walletLabel,
        ].filter(Boolean).join(' · ')

        return {
          key: `txn-${x.id}`,
          id: x.id,
          kind: 'txn',
          name: primaryName,
          nameAlt: subtitleParts,
          categoryName: catName,
          categoryIcon: c?.icon ?? (isTransfer ? 'repeat' : 'creditcard'),
          categoryColor: c?.color ?? '#007AFF',
          walletName: walletLabel,
          partyName: p?.name,
          paymentType: isTransfer ? 'Transfer' : x.direction === 'in' ? 'Money In' : 'Money Out',
          note: x.note,
          icon: c?.icon ?? (isTransfer ? 'repeat' : 'creditcard'),
          color: c?.color ?? '#007AFF',
          direction: x.direction === 'in' ? 'in' : x.direction === 'out' ? 'out' : undefined,
          amount: x.amount,
          deletedAt: deletedDate,
          daysLeft,
          rawTxn: x,
        }
      })

    return [...catItems, ...txnItems]
  }, [deletedCategories, txns, maps, nm, lang, t])

  const totalCount = allItems.length
  const totalCatsCount = (deletedCategories ?? []).length
  const totalTxnsCount = txns.filter((x) => x.deletedAt).length

  // Filter items
  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      // Type filter
      if (typeFilter === 'categories' && item.kind !== 'cat') return false
      if (typeFilter === 'txns' && item.kind !== 'txn') return false

      // Direction filter
      if (dirFilter !== 'all' && item.direction !== dirFilter) return false

      // Expiry filter
      if (expiryFilter === 'soon' && item.daysLeft >= 7) return false
      if (expiryFilter === 'safe' && item.daysLeft < 7) return false

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const inName = item.name.toLowerCase().includes(q)
        const inNameAlt = item.nameAlt ? item.nameAlt.toLowerCase().includes(q) : false
        const inCat = item.categoryName ? item.categoryName.toLowerCase().includes(q) : false
        const inNote = item.note ? item.note.toLowerCase().includes(q) : false
        const inAmount =
          item.amount !== undefined ? (item.amount / 100).toString().includes(q) : false
        if (!inName && !inNameAlt && !inCat && !inNote && !inAmount) return false
      }

      return true
    })
  }, [allItems, typeFilter, dirFilter, expiryFilter, searchQuery])

  // Sort items
  const sortedItems = useMemo(() => {
    return [...filteredItems].sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name)
          break
        case 'kind':
          cmp = a.kind.localeCompare(b.kind)
          break
        case 'category':
          cmp = (a.categoryName || '').localeCompare(b.categoryName || '')
          break
        case 'direction':
          cmp = (a.direction || '').localeCompare(b.direction || '')
          break
        case 'amount':
          cmp = (a.amount ?? -1) - (b.amount ?? -1)
          break
        case 'daysLeft':
          cmp = a.daysLeft - b.daysLeft
          break
        case 'deletedAt':
        default:
          cmp = a.deletedAt.localeCompare(b.deletedAt)
          break
      }
      return sortOrder === 'asc' ? cmp : -cmp
    })
  }, [filteredItems, sortField, sortOrder])

  const hasActiveFilters =
    searchQuery.trim() !== '' || dirFilter !== 'all' || expiryFilter !== 'all' || typeFilter !== 'all'

  const clearAllFilters = () => {
    setSearchQuery('')
    setTypeFilter('all')
    setDirFilter('all')
    setExpiryFilter('all')
  }

  // Column sort toggle handler
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortOrder(field === 'deletedAt' || field === 'amount' ? 'desc' : 'asc')
    }
  }

  // Selection handlers
  const allSelected =
    sortedItems.length > 0 && sortedItems.every((item) => selectedKeys.has(item.key))

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedKeys(new Set())
    } else {
      const next = new Set<string>()
      sortedItems.forEach((item) => next.add(item.key))
      setSelectedKeys(next)
    }
  }

  const toggleSelectItem = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Batch actions
  const handleBulkRestore = async () => {
    const itemsToRestore = allItems.filter((item) => selectedKeys.has(item.key))
    if (itemsToRestore.length === 0) return

    for (const item of itemsToRestore) {
      if (item.kind === 'cat') {
        await undeleteCategory(item.id)
      } else {
        await undelete(item.id)
      }
    }

    toast({
      text:
        t('bin.bulkRestoreDone', { count: itemsToRestore.length }) ||
        `Restored ${itemsToRestore.length} items`,
      tone: 'ok',
    })
    setSelectedKeys(new Set())
  }

  const handleBulkDeletePermanent = async () => {
    const itemsToDelete = allItems.filter((item) => selectedKeys.has(item.key))
    setBulkDeleteConfirmOpen(false)
    if (itemsToDelete.length === 0) return

    for (const item of itemsToDelete) {
      if (item.kind === 'cat') {
        await hardDeleteCategory(item.id)
      } else {
        await hardDelete(item.id)
      }
    }

    toast({
      text:
        t('bin.bulkDeleteDone', { count: itemsToDelete.length }) ||
        `Permanently deleted ${itemsToDelete.length} items`,
      tone: 'ok',
    })
    setSelectedKeys(new Set())
  }

  // Single actions
  const handleRestoreItem = async (item: BinUnifiedItem) => {
    if (item.kind === 'cat') {
      await undeleteCategory(item.id)
      toast({
        text: t('cat.restored') || `"${item.name}" restored`,
        tone: 'ok',
      })
    } else {
      await undelete(item.id)
      toast({
        text: t('act.restore') || 'Entry restored',
        tone: 'ok',
      })
    }
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      next.delete(item.key)
      return next
    })
  }

  const handleManualRecover = async () => {
    if (!business?.id || !business?.type) return
    setIsRecovering(true)
    try {
      const count = await syncOrphanedCategoriesToBin(business.id, business.type)
      if (count > 0) {
        toast({
          text: t('bin.recoverDone', { count }) || `Recovered ${count} category to Recycle Bin`,
          tone: 'ok',
        })
      } else {
        toast({
          text: t('bin.noNewRecovered') || 'No additional deleted categories found',
          tone: 'info',
        })
      }
    } catch (err) {
      console.error(err)
      toast({ text: 'Error searching for missing categories', tone: 'info' })
    } finally {
      setIsRecovering(false)
    }
  }

  const handleEmptyBin = async () => {
    setEmptyConfirmOpen(false)
    try {
      for (const item of allItems) {
        if (item.kind === 'cat') {
          await hardDeleteCategory(item.id)
        } else {
          await hardDelete(item.id)
        }
      }
      setSelectedKeys(new Set())
      toast({
        text: t('bin.emptied') || 'Recycle Bin emptied',
        tone: 'ok',
      })
    } catch (err) {
      console.error(err)
      toast({ text: 'Error emptying bin', tone: 'info' })
    }
  }

  const handleConfirmPermanentDelete = async () => {
    if (!deletePermanentTarget) return
    const target = deletePermanentTarget
    setDeletePermanentTarget(null)
    try {
      if (target.type === 'txn') {
        await hardDelete(target.id)
        toast({
          text: t('bin.entryPermanentlyDeleted') || 'Entry permanently deleted',
          tone: 'ok',
        })
      } else {
        await hardDeleteCategory(target.id)
        toast({
          text: t('bin.categoryPermanentlyDeleted') || 'Category permanently deleted',
          tone: 'ok',
        })
      }
      setSelectedKeys((prev) => {
        const next = new Set(prev)
        next.delete(`${target.type}-${target.id}`)
        return next
      })
    } catch (err) {
      console.error(err)
      toast({ text: 'Error permanently deleting item', tone: 'info' })
    }
  }

  // Export handlers
  const handleExportCSV = () => {
    const header = [
      t('bin.colItem') || 'Item / Payment Name',
      t('bin.colCategory') || 'Category',
      t('bin.colPaymentType') || 'Type (Money In / Money Out)',
      t('bin.colAmount') || 'Amount (₹)',
      t('bin.colDeleted') || 'Deleted Date',
      t('bin.colExpires') || 'Days Left',
      t('reports.note_col') || 'Note / Subtitle',
    ]

    const rows = [
      header,
      ...sortedItems.map((item) => [
        item.name,
        item.categoryName,
        item.direction === 'in'
          ? (lang === 'hi' ? 'Money In (पैसा आया)' : 'Money In')
          : item.direction === 'out'
          ? (lang === 'hi' ? 'Money Out (पैसा गया)' : 'Money Out')
          : '—',
        item.amount !== undefined ? (item.amount / 100).toFixed(2) : '—',
        item.deletedAt.slice(0, 10),
        `${item.daysLeft} days`,
        item.note || item.nameAlt || '',
      ]),
    ]

    download(`hisaab-recycle-bin-${todayISO()}.csv`, toCSV(rows), 'text/csv;charset=utf-8')
    toast({ text: t('bin.exportCSV') || 'CSV exported successfully', tone: 'ok' })
  }

  const handlePrintPDF = () => {
    const rowsHtml = sortedItems
      .map(
        (item) => `<tr>
        <td><b>${item.name}</b>${item.note ? ` <br><small style="color:#666">${item.note}</small>` : ''}</td>
        <td>${item.categoryName}</td>
        <td>${
          item.direction === 'in'
            ? '<span class="in">↑ Money In</span>'
            : item.direction === 'out'
            ? '<span class="out">↓ Money Out</span>'
            : '—'
        }${item.walletName ? ` <small>(${item.walletName})</small>` : ''}</td>
        <td class="n">${item.amount !== undefined ? money(item.amount) : '—'}</td>
        <td>${item.deletedAt.slice(0, 10)}</td>
        <td>${item.daysLeft} days left</td>
      </tr>`
      )
      .join('')

    const tableHtml = `
      <div style="margin-bottom:12px;font-size:13px;color:#555">
        Total Deleted Items: <b>${sortedItems.length}</b> (Generated on ${todayISO()})
      </div>
      <table>
        <thead>
          <tr>
            <th>${t('bin.colItem') || 'Item / Payment Name'}</th>
            <th>${t('bin.colCategory') || 'Category'}</th>
            <th>${t('bin.colPaymentType') || 'Type (Money In / Money Out)'}</th>
            <th class="n">${t('bin.colAmount') || 'Amount'}</th>
            <th>${t('bin.colDeleted') || 'Deleted Date'}</th>
            <th>${t('bin.colExpires') || 'Expires'}</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    `

    printHTML(
      `${business?.name || 'Hisaab'} — ${t('bin.title') || 'Recycle Bin'}`,
      `<h1>${business?.name || 'Hisaab'} — ${t('bin.title') || 'Recycle Bin'}</h1>${tableHtml}`,
      lang
    )
  }

  // Sort Icon renderer helper
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3 w-3 opacity-30 group-hover:opacity-75 transition-opacity" />
    }
    return sortOrder === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5 text-[#007AFF]" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-[#007AFF]" />
    )
  }

  return (
    <div className="w-full space-y-4">
      {/* Header with Title and Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="apple-large-title text-neutral-900 dark:text-white">
            {t('bin.title') || 'Recycle Bin'}
          </h1>
          <p className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
            {t('bin.note') ||
              'Deleted entries and categories stay here for 30 days before permanent removal'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Export CSV Button */}
          {totalCount > 0 && (
            <button
              type="button"
              onClick={handleExportCSV}
              className="apple-press flex h-9 items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-3.5 text-xs font-semibold text-neutral-800 shadow-sm hover:bg-neutral-50 dark:border-white/10 dark:bg-[#1C1C1E] dark:text-neutral-200 dark:hover:bg-[#2C2C2E]"
              title={t('bin.exportCSV') || 'Export CSV'}
            >
              <Download className="h-3.5 w-3.5 text-[#007AFF]" />
              <span className="hidden sm:inline">{t('bin.exportCSV') || 'Export CSV'}</span>
            </button>
          )}

          {/* Print / PDF Button */}
          {totalCount > 0 && (
            <button
              type="button"
              onClick={handlePrintPDF}
              className="apple-press flex h-9 items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-3.5 text-xs font-semibold text-neutral-800 shadow-sm hover:bg-neutral-50 dark:border-white/10 dark:bg-[#1C1C1E] dark:text-neutral-200 dark:hover:bg-[#2C2C2E]"
              title={t('bin.printPDF') || 'Print / PDF'}
            >
              <Printer className="h-3.5 w-3.5 text-neutral-600 dark:text-neutral-300" />
              <span className="hidden sm:inline">{t('bin.printPDF') || 'Print'}</span>
            </button>
          )}

          {/* Check Missing Categories Button */}
          <button
            type="button"
            disabled={isRecovering}
            onClick={handleManualRecover}
            title={t('bin.recoverMissing') || 'Check for Missing Categories'}
            className="apple-press flex h-9 items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-3 text-xs font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50 dark:border-white/[0.1] dark:bg-[#1C1C1E] dark:text-neutral-200"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRecovering ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{t('bin.recoverMissing') || 'Check Missing'}</span>
          </button>

          {/* Empty Bin Button */}
          {totalCount > 0 && (
            <button
              type="button"
              onClick={() => setEmptyConfirmOpen(true)}
              className="apple-press flex h-9 items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-3.5 text-xs font-semibold text-[#FF3B30] transition-colors hover:bg-rose-500/15 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-[#FF453A]"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{t('bin.emptyBin') || 'Empty Bin'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Modern Filter Toolbar */}
      {totalCount > 0 && (
        <div className="space-y-3">
          {/* Search bar & View mode toggle */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  t('bin.searchPh') || 'Search deleted items, notes, or amounts…'
                }
                className="w-full rounded-2xl border border-black/[0.08] bg-white py-2.5 pl-10 pr-9 text-sm text-neutral-900 shadow-sm outline-none transition-all placeholder:text-neutral-400 focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 dark:border-white/[0.1] dark:bg-[#1C1C1E] dark:text-white"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* View Mode Toggle (Table vs Cards) */}
            <div className="flex items-center gap-1 self-end sm:self-auto rounded-2xl border border-black/[0.08] bg-neutral-100 p-1 dark:border-white/[0.1] dark:bg-[#1C1C1E]">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                title={t('bin.tableView') || 'Table View'}
                className={`apple-press flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                  viewMode === 'table'
                    ? 'bg-white text-neutral-900 shadow-sm dark:bg-[#2C2C2E] dark:text-white'
                    : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
                }`}
              >
                <TableIcon className="h-3.5 w-3.5" />
                <span>{t('bin.tableView') || 'Table'}</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                title={t('bin.cardsView') || 'Cards View'}
                className={`apple-press flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                  viewMode === 'cards'
                    ? 'bg-white text-neutral-900 shadow-sm dark:bg-[#2C2C2E] dark:text-white'
                    : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
                }`}
              >
                <LayoutList className="h-3.5 w-3.5" />
                <span>{t('bin.cardsView') || 'Cards'}</span>
              </button>
            </div>
          </div>

          {/* Quick Filter Pills Row */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Type Filter */}
            <div className="flex items-center rounded-xl bg-neutral-100 p-0.5 dark:bg-[#1C1C1E] border border-black/[0.04] dark:border-white/[0.06]">
              <button
                type="button"
                onClick={() => setTypeFilter('all')}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                  typeFilter === 'all'
                    ? 'bg-white text-neutral-900 shadow-sm dark:bg-[#2C2C2E] dark:text-white font-semibold'
                    : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400'
                }`}
              >
                {t('bin.all') || 'All'} ({totalCount})
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('categories')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                  typeFilter === 'categories'
                    ? 'bg-white text-neutral-900 shadow-sm dark:bg-[#2C2C2E] dark:text-white font-semibold'
                    : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400'
                }`}
              >
                <Tag className="h-3.5 w-3.5" />
                <span>{t('bin.categories') || 'Categories'} ({totalCatsCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('txns')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                  typeFilter === 'txns'
                    ? 'bg-white text-neutral-900 shadow-sm dark:bg-[#2C2C2E] dark:text-white font-semibold'
                    : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400'
                }`}
              >
                <CreditCard className="h-3.5 w-3.5" />
                <span>{t('bin.transactions') || 'Entries'} ({totalTxnsCount})</span>
              </button>
            </div>

            {/* Direction Filter */}
            <select
              value={dirFilter}
              onChange={(e) => setDirFilter(e.target.value as DirFilter)}
              className="apple-press rounded-xl border border-black/[0.08] bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-sm outline-none hover:bg-neutral-50 dark:border-white/[0.1] dark:bg-[#1C1C1E] dark:text-neutral-200"
            >
              <option value="all">{t('bin.allDirections') || 'All Directions'}</option>
              <option value="in">{t('cat.in') || 'Money In'}</option>
              <option value="out">{t('cat.out') || 'Money Out'}</option>
            </select>

            {/* Expiry Filter */}
            <select
              value={expiryFilter}
              onChange={(e) => setExpiryFilter(e.target.value as ExpiryFilter)}
              className="apple-press rounded-xl border border-black/[0.08] bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-sm outline-none hover:bg-neutral-50 dark:border-white/[0.1] dark:bg-[#1C1C1E] dark:text-neutral-200"
            >
              <option value="all">{t('bin.allExpiry') || 'All Expiry'}</option>
              <option value="soon">{t('bin.expiringSoon') || 'Expiring soon (< 7 days)'}</option>
              <option value="safe">{t('bin.safeExpiry') || '7+ days left'}</option>
            </select>

            {/* Clear Filters Button */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="apple-press flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-[#FF3B30] hover:bg-rose-500/10 dark:text-[#FF453A]"
              >
                <X className="h-3 w-3" />
                <span>{t('bin.clearFilters') || 'Clear filters'}</span>
              </button>
            )}

            {/* Result count stats */}
            <span className="ml-auto text-xs text-neutral-500">
              {sortedItems.length} of {totalCount} items
            </span>
          </div>
        </div>
      )}

      {/* Floating / Sticky Bulk Action Bar */}
      {selectedKeys.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#007AFF]/25 bg-[#007AFF]/10 p-3.5 shadow-md backdrop-blur-md dark:border-[#007AFF]/40 dark:bg-[#007AFF]/15">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#007AFF] text-xs font-bold text-white">
              {selectedKeys.size}
            </span>
            <span className="text-sm font-semibold text-neutral-900 dark:text-white">
              {t('bin.selectedCount', { count: selectedKeys.size }) ||
                `${selectedKeys.size} items selected`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleBulkRestore}
              className="apple-press flex items-center gap-1.5 rounded-full bg-[#007AFF] px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-[#0071E3]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>
                {t('bin.restoreSelected') || 'Restore Selected'} ({selectedKeys.size})
              </span>
            </button>
            <button
              type="button"
              onClick={() => setBulkDeleteConfirmOpen(true)}
              className="apple-press flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-500/15 px-3.5 py-1.5 text-xs font-bold text-[#FF3B30] hover:bg-rose-500/25 dark:text-[#FF453A]"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{t('bin.deleteSelected') || 'Delete Forever'}</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedKeys(new Set())}
              className="apple-press px-2 text-xs font-semibold text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white"
            >
              Deselect
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="apple-card overflow-hidden">
        {totalCount === 0 ? (
          <div className="p-12 text-center">
            <Empty
              icon="Trash2"
              title={t('bin.empty') || 'Recycle Bin is Empty'}
              body={t('bin.emptyBody') || 'No deleted transactions or categories found'}
            />
          </div>
        ) : sortedItems.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-base font-semibold text-neutral-900 dark:text-white">
              {t('bin.noMatches') || 'No matching deleted items found'}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              Try adjusting your search query or filter options.
            </p>
            <button
              type="button"
              onClick={clearAllFilters}
              className="apple-press mt-3 rounded-full bg-[#007AFF] px-4 py-1.5 text-xs font-semibold text-white"
            >
              {t('bin.clearFilters') || 'Clear filters'}
            </button>
          </div>
        ) : viewMode === 'table' ? (
          /* ============================================================ */
          /* Modern Tabular View with Sortable Columns                   */
          /* ============================================================ */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/[0.06] bg-neutral-50/70 text-xs font-semibold text-neutral-600 dark:border-white/[0.08] dark:bg-neutral-800/40 dark:text-neutral-300">
                  {/* Select All Checkbox */}
                  <th className="w-10 px-4 py-3.5 text-center">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      aria-label="Select all items"
                      className="h-4 w-4 rounded border-neutral-300 text-[#007AFF] focus:ring-[#007AFF] dark:border-neutral-600 dark:bg-[#2C2C2E]"
                    />
                  </th>

                  {/* Column: Item / Payment Name */}
                  <th
                    onClick={() => handleSort('name')}
                    className="group cursor-pointer select-none px-4 py-3.5 hover:text-[#007AFF]"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{t('bin.colItem') || 'Item / Payment Name'}</span>
                      <SortIcon field="name" />
                    </div>
                  </th>

                  {/* Column: Category */}
                  <th
                    onClick={() => handleSort('category')}
                    className="group cursor-pointer select-none px-4 py-3.5 hover:text-[#007AFF]"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{t('bin.colCategory') || 'Category'}</span>
                      <SortIcon field="category" />
                    </div>
                  </th>

                  {/* Column: Payment Type (Debit / Credit) */}
                  <th
                    onClick={() => handleSort('direction')}
                    className="group cursor-pointer select-none px-4 py-3.5 hover:text-[#007AFF]"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{t('bin.colPaymentType') || 'Type (Money In / Money Out)'}</span>
                      <SortIcon field="direction" />
                    </div>
                  </th>

                  {/* Column: Amount */}
                  <th
                    onClick={() => handleSort('amount')}
                    className="group cursor-pointer select-none px-4 py-3.5 text-right hover:text-[#007AFF]"
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>{t('bin.colAmount') || 'Amount'}</span>
                      <SortIcon field="amount" />
                    </div>
                  </th>

                  {/* Column: Expiry / Days Left */}
                  <th
                    onClick={() => handleSort('daysLeft')}
                    className="group cursor-pointer select-none px-4 py-3.5 hover:text-[#007AFF]"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{t('bin.colExpires') || 'Expires'}</span>
                      <SortIcon field="daysLeft" />
                    </div>
                  </th>

                  {/* Column: Actions */}
                  <th className="px-4 py-3.5 text-right font-semibold">
                    {t('bin.colActions') || 'Actions'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
                {sortedItems.map((item) => {
                  const isSelected = selectedKeys.has(item.key)

                  return (
                    <tr
                      key={item.key}
                      className={`transition-colors hover:bg-neutral-50/70 dark:hover:bg-[#2C2C2E]/60 ${
                        isSelected
                          ? 'bg-[#007AFF]/5 dark:bg-[#007AFF]/10'
                          : ''
                      }`}
                    >
                      {/* Checkbox Cell */}
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectItem(item.key)}
                          aria-label={`Select ${item.name}`}
                          className="h-4 w-4 rounded border-neutral-300 text-[#007AFF] focus:ring-[#007AFF] dark:border-neutral-600 dark:bg-[#2C2C2E]"
                        />
                      </td>

                      {/* Item / Payment Name Cell */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <CatIcon
                            icon={item.icon}
                            color={item.color || '#8E8E93'}
                            size="md"
                          />
                          <div className="min-w-0 max-w-[280px]">
                            <div className="truncate font-semibold text-neutral-900 dark:text-white">
                              {item.name}
                            </div>
                            <div className="truncate text-xs text-neutral-500">
                              {item.nameAlt || item.note || (item.kind === 'cat' ? 'Category' : 'Entry')}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Category Badge Cell */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
                          style={{
                            backgroundColor: `${item.categoryColor || '#007AFF'}18`,
                            color: item.categoryColor || '#007AFF',
                          }}
                        >
                          <AppIcon name={item.categoryIcon || 'folder'} className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate max-w-[150px]">{item.categoryName}</span>
                        </span>
                      </td>

                      {/* Payment Type (Debit / Credit) Cell */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {item.direction === 'in' ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#34C759]/15 px-2.5 py-0.5 text-[11px] font-bold text-[#1C7430] dark:text-[#30D158] w-fit">
                              ↑ {lang === 'hi' ? 'Money In (पैसा आया)' : 'Money In'}
                            </span>
                            {item.walletName && (
                              <span className="text-[10px] text-neutral-500 pl-1 font-medium">
                                {item.walletName}
                              </span>
                            )}
                          </div>
                        ) : item.direction === 'out' ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#FF3B30]/15 px-2.5 py-0.5 text-[11px] font-bold text-[#D70015] dark:text-[#FF453A] w-fit">
                              ↓ {lang === 'hi' ? 'Money Out (पैसा गया)' : 'Money Out'}
                            </span>
                            {item.walletName && (
                              <span className="text-[10px] text-neutral-500 pl-1 font-medium">
                                {item.walletName}
                              </span>
                            )}
                          </div>
                        ) : item.rawTxn?.direction === 'transfer' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2.5 py-0.5 text-[11px] font-bold text-[#007AFF] w-fit">
                            ↔ Transfer
                          </span>
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </td>

                      {/* Amount Cell */}
                      <td className="px-4 py-3 text-right">
                        {item.amount !== undefined ? (
                          <Money
                            paise={item.amount}
                            tone={item.direction === 'in' ? 'in' : 'out'}
                            size="sm"
                          />
                        ) : (
                          <span className="text-xs text-neutral-400">—</span>
                        )}
                      </td>

                      {/* Expires / Days Left Cell */}
                      <td className="px-4 py-3">
                        <div
                          className={`flex items-center gap-1.5 text-xs font-semibold ${
                            item.daysLeft <= 3
                              ? 'text-rose-600 dark:text-rose-400'
                              : item.daysLeft <= 7
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-neutral-500'
                          }`}
                        >
                          <Clock className="h-3.5 w-3.5 shrink-0" />
                          <span>{item.daysLeft} days left</span>
                        </div>
                        <div className="text-[10px] text-neutral-400">
                          Deleted {item.deletedAt.slice(0, 10)}
                        </div>
                      </td>

                      {/* Actions Cell */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleRestoreItem(item)}
                            className="apple-press flex h-8 items-center gap-1 rounded-full border border-black/[0.08] bg-white px-3 text-xs font-semibold text-[#007AFF] shadow-sm hover:bg-neutral-50 dark:border-white/[0.1] dark:bg-[#2C2C2E] dark:text-[#0A84FF] dark:hover:bg-[#3A3A3C]"
                            title={t('act.restore') || 'Restore'}
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span>{t('act.restore') || 'Restore'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeletePermanentTarget({
                                type: item.kind,
                                id: item.id,
                                title: `${item.kind === 'cat' ? 'category' : 'entry'} "${item.name}"`,
                              })
                            }}
                            aria-label={t('act.delete') || 'Delete Permanently'}
                            title={t('bin.deleteForever') || 'Delete Forever'}
                            className="apple-press flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 hover:bg-rose-500/10 hover:text-[#FF3B30] dark:hover:bg-rose-500/20 dark:hover:text-[#FF453A]"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* ============================================================ */
          /* Cards / List View Mode                                      */
          /* ============================================================ */
          <div className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
            {sortedItems.map((item) => {
              const isSelected = selectedKeys.has(item.key)

              return (
                <div
                  key={item.key}
                  className={`flex items-center gap-3.5 p-3.5 transition-colors hover:bg-neutral-50/70 dark:hover:bg-[#2C2C2E]/60 ${
                    isSelected ? 'bg-[#007AFF]/5 dark:bg-[#007AFF]/10' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelectItem(item.key)}
                    aria-label={`Select ${item.name}`}
                    className="h-4 w-4 rounded border-neutral-300 text-[#007AFF] focus:ring-[#007AFF] dark:border-neutral-600 dark:bg-[#2C2C2E]"
                  />

                  <CatIcon
                    icon={item.icon}
                    color={item.color || '#8E8E93'}
                    size="md"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-neutral-900 dark:text-white">
                        {item.name}
                      </span>
                      {/* Category Badge */}
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{
                          backgroundColor: `${item.categoryColor || '#007AFF'}18`,
                          color: item.categoryColor || '#007AFF',
                        }}
                      >
                        <AppIcon name={item.categoryIcon || 'folder'} className="h-3 w-3 shrink-0" />
                        <span className="truncate max-w-[120px]">{item.categoryName}</span>
                      </span>
                      {/* Payment Type Badge */}
                      {item.direction && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            item.direction === 'in'
                              ? 'bg-[#34C759]/15 text-[#1C7430] dark:text-[#30D158]'
                              : 'bg-[#FF3B30]/15 text-[#D70015] dark:text-[#FF453A]'
                          }`}
                        >
                          {item.direction === 'in'
                            ? (lang === 'hi' ? '↑ Money In (पैसा आया)' : '↑ Money In')
                            : (lang === 'hi' ? '↓ Money Out (पैसा गया)' : '↓ Money Out')}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#8E8E93] dark:text-[#A1A1A6]">
                      <Clock className="h-3 w-3" />
                      <span>{item.daysLeft} days left</span>
                      <span>·</span>
                      <span>Deleted {item.deletedAt.slice(0, 10)}</span>
                      {item.note && (
                        <>
                          <span>·</span>
                          <span className="truncate max-w-[150px]">{item.note}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {item.amount !== undefined && (
                    <div className="shrink-0 text-right mr-1">
                      <Money
                        paise={item.amount}
                        tone={item.direction === 'in' ? 'in' : 'out'}
                        size="sm"
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleRestoreItem(item)}
                      className="apple-press flex h-8 items-center gap-1 rounded-full border border-black/[0.08] bg-white px-3 text-xs font-semibold text-[#007AFF] shadow-sm hover:bg-neutral-50 dark:border-white/[0.1] dark:bg-[#2C2C2E] dark:text-[#0A84FF] dark:hover:bg-[#3A3A3C]"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>{t('act.restore') || 'Restore'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeletePermanentTarget({
                          type: item.kind,
                          id: item.id,
                          title: `${item.kind === 'cat' ? 'category' : 'entry'} "${item.name}"`,
                        })
                      }}
                      aria-label={t('act.delete') || 'Delete Permanently'}
                      title={t('bin.deleteForever') || 'Delete Forever'}
                      className="apple-press flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 hover:bg-rose-500/10 hover:text-[#FF3B30] dark:hover:bg-rose-500/20 dark:hover:text-[#FF453A]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Confirmation Modal for Empty Entire Bin */}
      <Confirm
        open={emptyConfirmOpen}
        icon="Trash2"
        yesTone="danger"
        text={
          t('bin.emptyBinConfirm') ||
          'Are you sure you want to permanently delete all items in the Recycle Bin? This action cannot be undone.'
        }
        onNo={() => setEmptyConfirmOpen(false)}
        onYes={handleEmptyBin}
      />

      {/* Confirmation Modal for Bulk Delete */}
      <Confirm
        open={bulkDeleteConfirmOpen}
        icon="AlertTriangle"
        yesTone="danger"
        text={
          t('bin.bulkDeleteConfirm', { count: selectedKeys.size }) ||
          `Permanently delete ${selectedKeys.size} selected items? This action cannot be undone.`
        }
        onNo={() => setBulkDeleteConfirmOpen(false)}
        onYes={handleBulkDeletePermanent}
      />

      {/* Confirmation Modal for Single Delete Forever */}
      <Confirm
        open={!!deletePermanentTarget}
        icon="AlertTriangle"
        yesTone="danger"
        text={
          deletePermanentTarget
            ? `Permanently delete this ${deletePermanentTarget.title}? This action cannot be undone.`
            : ''
        }
        onNo={() => setDeletePermanentTarget(null)}
        onYes={handleConfirmPermanentDelete}
      />
    </div>
  )
}
