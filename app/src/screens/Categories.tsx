'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from '../lib/navigation'
import { Plus, Edit3, ArrowLeftRight, Eye, EyeOff, Trash2, Check, ChevronRight, AlertTriangle, Search, X } from 'lucide-react'
import { filterHref } from '../lib/filters'
import { db, uuid } from '../db/db'
import { saveTxn, softDeleteCategory, undeleteCategory } from '../db/ledger'
import type { Category, Direction, Account, Party } from '../db/types'
import { ICONS, PALETTE } from '../db/seed'
import { useData, useToast } from '../store'
import { hasDevanagari, toDevanagari, toRoman } from '../lib/translit'
import { Btn, CatIcon, Chip, Confirm, Field, Sheet, cx } from '../components/ui'
import { AppleSegmentedControl } from '../components/apple/AppleSegmentedControl'
import { TranslitInput } from '../components/TranslitInput'
import { AppIcon } from '../components/AppIcon'

export function Categories() {
  const { t } = useTranslation()
  const [sp] = useSearchParams()
  const { categories, nm, business, txns, accounts, parties } = useData()
  const toast = useToast()
  const initialDir = sp?.get('dir') === 'out' ? 'out' : 'in'
  const [dir, setDir] = useState<Direction>(initialDir)

  useEffect(() => {
    const d = sp?.get('dir')
    if (d === 'in' || d === 'out') {
      setDir(d)
    }
  }, [sp])
  const [edit, setEdit] = useState<Category | 'new' | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null)
  const [switchSheetCat, setSwitchSheetCat] = useState<Category | null>(null)
  const [selectedSwitchCat, setSelectedSwitchCat] = useState<Category | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [search, setSearch] = useState('')

  const list = categories.filter((c) => c.direction === dir)
  const query = search.trim().toLowerCase()
  const queryDeva = hasDevanagari(query) ? query : toDevanagari(query).toLowerCase()

  const filteredList = query
    ? list.filter((c) => {
        const nameEn = (c.name_en || '').toLowerCase()
        const nameHi = (c.name_hi || '').toLowerCase()
        const nameCurr = (nm(c) || '').toLowerCase()
        return (
          nameEn.includes(query) ||
          nameHi.includes(query) ||
          nameHi.includes(queryDeva) ||
          nameCurr.includes(query)
        )
      })
    : list

  const parents = query
    ? filteredList
    : filteredList.filter((c) => !c.parentId)

  const displayItems = query
    ? filteredList
    : parents.flatMap((p) => [p, ...list.filter((k) => k.parentId === p.id)])

  const count = (id: string) => txns.filter((x) => x.categoryId === id && !x.deletedAt).length

  const handleRequestDelete = (c: Category) => {
    const cCount = count(c.id)
    if (cCount === 0) {
      setDeleteTarget(c)
    } else {
      setSwitchSheetCat(c)
      setSelectedSwitchCat(null)
    }
  }

  const handleConfirmEmptyDelete = async () => {
    if (!deleteTarget) return
    const cat = deleteTarget
    setDeleteTarget(null)
    try {
      await db.categories
        .where('parentId')
        .equals(cat.id)
        .modify({ parentId: null })
      await softDeleteCategory(cat.id)
      toast({
        text: t('cat.movedToBin') || `"${nm(cat)}" moved to Recycle Bin`,
        tone: 'ok',
        undo: () => undeleteCategory(cat.id),
      })
    } catch (err) {
      console.error(err)
      toast({ text: 'Error moving category to bin', tone: 'info' })
    }
  }

  const handleConfirmSwitchAndDelete = async () => {
    if (!switchSheetCat || !selectedSwitchCat) return
    setIsProcessing(true)
    try {
      const from = switchSheetCat
      const to = selectedSwitchCat
      const affected = txns.filter((x) => x.categoryId === from.id && !x.deletedAt)
      for (const x of affected) {
        await saveTxn({ ...x, categoryId: to.id })
      }
      await db.categories
        .where('parentId')
        .equals(from.id)
        .modify({ parentId: to.parentId ?? to.id })
      await softDeleteCategory(from.id)
      setSwitchSheetCat(null)
      setSelectedSwitchCat(null)
      toast({
        text:
          t('cat.switchAndDeleted', {
            target: nm(to),
            name: nm(from),
          }) || `Moved entries to "${nm(to)}" and moved "${nm(from)}" to Recycle Bin`,
        tone: 'ok',
        undo: () => undeleteCategory(from.id),
      })
    } catch (err) {
      console.error(err)
      toast({ text: 'Error moving category to bin', tone: 'info' })
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Title & Add Category Button */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h1 className="apple-large-title text-neutral-900 dark:text-white">
            {t('cat.title') || 'Categories'}
          </h1>
          <p className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">Organize your Money In and Money Out categories</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEdit('new')}
            className="apple-press flex h-9 items-center gap-1.5 rounded-full bg-[#007AFF] px-3.5 text-xs font-bold text-white shadow-sm hover:bg-[#0071E3]"
          >
            <Plus className="h-4 w-4 stroke-[2.5]" />
            <span>{t('cat.new') || 'New Category'}</span>
          </button>
        </div>
      </div>

      {/* Controls Bar: Search Bar on Left (like in Entries page) & Segmented Direction Picker on Right */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        {/* Search Bar on the Left (using TranslitInput, identical to Entries page) */}
        <div className="relative flex-1 min-w-0">
          <TranslitInput
            value={search}
            onChange={setSearch}
            placeholder={t('cat.searchPh') || 'Search categories…'}
          />
        </div>

        {/* Segmented Direction Picker on the Right */}
        <div className="w-full sm:w-auto sm:shrink-0">
          <AppleSegmentedControl
            size="lg"
            value={dir}
            onChange={(d) => {
              setDir(d)
              setSearch('')
            }}
            options={[
              { value: 'in', label: `↓ ${t('cat.in') || 'Money In'}` },
              { value: 'out', label: `↑ ${t('cat.out') || 'Money Out'}` },
            ]}
          />
        </div>
      </div>

      {/* Grouped Inset Category List */}
      <div className="apple-card overflow-hidden">
        <div className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
          {displayItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 dark:bg-[#2C2C2E] text-neutral-400 mb-3">
                <Search className="h-6 w-6 stroke-[1.75]" />
              </div>
              <h3 className="apple-headline text-neutral-800 dark:text-neutral-200">
                {t('cat.noResults') || 'No categories found'}
              </h3>
              <p className="mt-1 text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
                {search ? `No category matching "${search}" in ${dir === 'in' ? 'Money In' : 'Money Out'}` : 'No categories in this section yet'}
              </p>
              {search && (() => {
                const otherDir = dir === 'in' ? 'out' : 'in'
                const otherMatches = categories.filter(
                  (c) =>
                    c.direction === otherDir &&
                    ((c.name_en || '').toLowerCase().includes(query) ||
                      (c.name_hi || '').toLowerCase().includes(query) ||
                      (c.name_hi || '').toLowerCase().includes(queryDeva) ||
                      (nm(c) || '').toLowerCase().includes(query))
                )
                return (
                  <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                    {otherMatches.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setDir(otherDir)}
                        className="apple-press rounded-lg bg-[#007AFF] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#0066D6]"
                      >
                        Switch to {otherDir === 'in' ? (t('cat.in') || 'Money In') : (t('cat.out') || 'Money Out')} ({otherMatches.length})
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      className="apple-press rounded-lg border border-black/[0.08] dark:border-white/10 bg-white dark:bg-[#2C2C2E] px-3 py-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50"
                    >
                      {t('act.clearSearch') || 'Clear search'}
                    </button>
                  </div>
                )
              })()}
            </div>
          ) : (
            displayItems.map((c) => (
              <div
                key={c.id}
                className={`group flex w-full items-center gap-3.5 p-3.5 text-left transition-colors hover:bg-neutral-50/70 dark:hover:bg-[#2C2C2E]/60 ${
                  c.parentId ? 'pl-10' : ''
                } ${c.hidden ? 'opacity-40' : ''}`}
              >
                <Link
                  href={filterHref({ cats: [c.id], dir: c.direction })}
                  className="apple-press flex min-w-0 flex-1 items-center gap-3.5 text-left"
                >
                  <CatIcon icon={c.icon} color={c.color} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-base font-semibold text-neutral-900 group-hover:text-[#007AFF] transition-colors dark:text-white dark:group-hover:text-[#0A84FF]">
                        {nm(c)}
                      </span>
                      {c.hidden && (
                        <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-bold text-neutral-700 dark:bg-[#2C2C2E] dark:text-[#A1A1A6]">
                          {t('cat.hidden') || 'Hidden'}
                        </span>
                      )}
                    </div>
                    <div className="truncate text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
                      {c.name_en === nm(c) ? c.name_hi : c.name_en} · {count(c.id)} entries
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-neutral-300 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all dark:text-neutral-600 dark:group-hover:text-neutral-400 shrink-0" />
                </Link>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setEdit(c)
                    }}
                    className="apple-press flex h-8 w-8 items-center justify-center rounded-full text-[#8E8E93] hover:bg-black/5 hover:text-neutral-900 dark:text-[#A1A1A6] dark:hover:bg-white/10 dark:hover:text-white"
                    aria-label={t('act.edit') || 'Edit'}
                    title={t('act.edit') || 'Edit'}
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRequestDelete(c)
                    }}
                    className="apple-press flex h-8 w-8 items-center justify-center rounded-full text-[#8E8E93] hover:bg-[#FF3B30]/10 hover:text-[#FF3B30] dark:text-[#A1A1A6] dark:hover:bg-[#FF453A]/15 dark:hover:text-[#FF453A]"
                    aria-label={t('act.delete') || 'Delete'}
                    title={t('cat.delete') || 'Delete'}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {edit && (
        <CategoryEditor
          key={edit === 'new' ? 'new' : edit.id}
          cat={edit === 'new' ? null : edit}
          dir={dir}
          parents={parents.filter((p) => edit === 'new' || p.id !== edit.id)}
          siblings={list.filter((c) => edit !== 'new' && c.id !== edit.id)}
          accounts={accounts}
          parties={parties}
          onClose={() => setEdit(null)}
          onDelete={(c) => handleRequestDelete(c)}
          onSave={async (c) => {
            await db.categories.put(c)
            setEdit(null)
          }}
          onMerge={async (from, to) => {
            const affected = txns.filter((x) => x.categoryId === from.id && !x.deletedAt)
            for (const x of affected) await saveTxn({ ...x, categoryId: to.id })
            await db.categories
              .where('parentId')
              .equals(from.id)
              .modify({ parentId: to.parentId ?? to.id })
            await softDeleteCategory(from.id)
            setEdit(null)
            toast({
              text: t('cat.mergeDone') || 'Categories merged successfully',
              tone: 'ok',
              undo: () => undeleteCategory(from.id),
            })
          }}
          businessId={business.id}
          sort={categories.length}
        />
      )}

      {/* Delete Confirmation for Empty Category */}
      <Confirm
        open={!!deleteTarget}
        icon="Trash2"
        yesTone="danger"
        text={
          t('cat.deleteConfirm', {
            name: deleteTarget ? nm(deleteTarget) : '',
          }) ||
          `Are you sure you want to delete "${deleteTarget ? nm(deleteTarget) : ''}"? It will be moved to the Recycle Bin for 30 days.`
        }
        onNo={() => setDeleteTarget(null)}
        onYes={handleConfirmEmptyDelete}
      />

      {/* Switch Category & Delete Sheet for Category With Existing Entries */}
      {switchSheetCat && (
        <Sheet
          open
          onClose={() => {
            if (!isProcessing) {
              setSwitchSheetCat(null)
              setSelectedSwitchCat(null)
            }
          }}
          title={t('cat.deleteWithDataTitle') || 'Switch Category & Delete'}
          footer={
            <div className="grid grid-cols-2 gap-2.5">
              <Btn
                tone="ghost"
                disabled={isProcessing}
                onClick={() => {
                  setSwitchSheetCat(null)
                  setSelectedSwitchCat(null)
                }}
              >
                {t('act.cancel') || 'Cancel'}
              </Btn>
              <Btn
                tone="danger"
                disabled={!selectedSwitchCat || isProcessing}
                onClick={handleConfirmSwitchAndDelete}
              >
                {isProcessing
                  ? 'Processing…'
                  : t('cat.switchAndDelete', { count: count(switchSheetCat.id) }) || 'Move & Delete'}
              </Btn>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Warning Banner */}
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 dark:border-amber-500/30 dark:bg-amber-500/15">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                    {t('cat.hasDataWarning', {
                      name: nm(switchSheetCat),
                      count: count(switchSheetCat.id),
                    }) ||
                      `"${nm(switchSheetCat)}" has ${count(switchSheetCat.id)} ${
                        count(switchSheetCat.id) === 1 ? 'entry' : 'entries'
                      }.`}
                  </h3>
                  <p className="mt-1 text-xs text-amber-800/90 dark:text-amber-300/90">
                    {t('cat.switchInstructions') ||
                      'To delete this category, please select another category to move these entries to:'}
                  </p>
                </div>
              </div>
            </div>

            {/* Target Category Selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-500">
                {switchSheetCat.direction === 'in'
                  ? (t('cat.in') || 'Money In')
                  : (t('cat.out') || 'Money Out')}
              </label>
              {(() => {
                const targets = categories.filter(
                  (c) => c.direction === switchSheetCat.direction && c.id !== switchSheetCat.id
                )
                if (targets.length === 0) {
                  return (
                    <p className="py-4 text-center text-sm text-neutral-500">
                      {t('cat.noOtherCategories') ||
                        'No other categories available. Please create another category first.'}
                    </p>
                  )
                }
                return (
                  <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                    {targets.map((tg) => {
                      const isSelected = selectedSwitchCat?.id === tg.id
                      return (
                        <button
                          key={tg.id}
                          type="button"
                          onClick={() => setSelectedSwitchCat(tg)}
                          className={`apple-press flex w-full items-center justify-between rounded-2xl border p-3.5 text-left transition-all ${
                            isSelected
                              ? 'border-[#007AFF] bg-[#007AFF]/10 shadow-sm ring-1 ring-[#007AFF] dark:bg-[#007AFF]/20'
                              : 'border-black/[0.06] bg-neutral-50/70 hover:bg-neutral-100/80 dark:border-white/[0.08] dark:bg-neutral-800/60 dark:hover:bg-neutral-800'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <CatIcon icon={tg.icon} color={tg.color} size="md" />
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-neutral-900 dark:text-white">
                                {nm(tg)}
                              </div>
                              <div className="text-xs text-neutral-500">
                                {tg.name_en === nm(tg) ? tg.name_hi : tg.name_en} · {count(tg.id)} entries
                              </div>
                            </div>
                          </div>
                          <div
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all ${
                              isSelected
                                ? 'border-[#007AFF] bg-[#007AFF] text-white'
                                : 'border-neutral-300 dark:border-neutral-600'
                            }`}
                          >
                            {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          </div>
        </Sheet>
      )}
    </div>
  )
}

function CategoryEditor({
  cat,
  dir,
  parents,
  siblings,
  accounts,
  parties,
  onClose,
  onDelete,
  onSave,
  onMerge,
  businessId,
  sort,
}: {
  cat: Category | null
  dir: Direction
  parents: Category[]
  siblings: Category[]
  accounts: Account[]
  parties: Party[]
  onClose: () => void
  onDelete?: (c: Category) => void
  onSave: (c: Category) => void
  onMerge: (from: Category, to: Category) => void
  businessId: string
  sort: number
}) {
  const { t, i18n } = useTranslation()
  const { nm } = useData()
  const [name, setName] = useState(
    cat ? (i18n.language === 'hi' ? cat.name_hi : cat.name_en) : ''
  )
  const [icon, setIcon] = useState(cat?.icon ?? ICONS[0])
  const [color, setColor] = useState(cat?.color ?? PALETTE[sort % PALETTE.length])
  const [parentId, setParentId] = useState<string | null>(cat?.parentId ?? null)
  const [mergeTo, setMergeTo] = useState<Category | null>(null)
  const [showMerge, setShowMerge] = useState(false)

  const save = (hidden = cat?.hidden) => {
    const n = name.trim()
    if (!n) return
    const roman = hasDevanagari(n) ? toRoman(n).replace(/^./, (c) => c.toUpperCase()) : n
    const deva = hasDevanagari(n) ? n : toDevanagari(n)
    const isHi = i18n.language === 'hi'
    const unchanged = !!cat && n === (isHi ? cat.name_hi : cat.name_en)
    onSave({
      id: cat?.id ?? uuid(),
      businessId,
      parentId,
      direction: cat?.direction ?? dir,
      key: cat?.key,
      name_hi: isHi ? n : unchanged ? cat!.name_hi : deva,
      name_en: isHi ? (unchanged ? cat!.name_en : roman) : n,
      icon,
      color,
      isDefault: cat?.isDefault ?? false,
      hidden,
      special: cat?.special,
      sort: cat?.sort ?? sort,
    })
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={cat ? nm(cat) : t('cat.new') || 'New Category'}
      footer={
        <div className="grid grid-cols-2 gap-2.5">
          {cat ? (
            <Btn tone="ghost" onClick={() => save(!cat.hidden)}>
              {cat.hidden ? t('cat.show') || 'Unhide' : t('cat.hide') || 'Hide'}
            </Btn>
          ) : (
            <Btn tone="ghost" onClick={onClose}>
              {t('act.cancel') || 'Cancel'}
            </Btn>
          )}
          <Btn tone="blue" disabled={!name.trim()} onClick={() => save()}>
            {t('act.save') || 'Save'}
          </Btn>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex justify-center py-2">
          <CatIcon icon={icon} color={color} size="lg" />
        </div>

        <Field label={t('cat.name') || 'Category Name'}>
          <TranslitInput value={name} onChange={setName} autoFocus={!cat} />
        </Field>

        <Field label={t('cat.icon') || 'Choose Icon'}>
          <div className="grid grid-cols-8 gap-1.5 max-h-36 overflow-y-auto rounded-xl border border-black/[0.06] bg-neutral-50 p-2 dark:border-white/[0.08] dark:bg-neutral-800">
            {ICONS.map((ic) => (
              <button
                key={ic}
                type="button"
                onClick={() => setIcon(ic)}
                className={`apple-press flex h-9 w-9 items-center justify-center rounded-lg text-lg transition-all ${
                  icon === ic
                    ? 'bg-[#007AFF] text-white shadow-sm ring-2 ring-[#007AFF]'
                    : 'hover:bg-neutral-200/60 dark:hover:bg-neutral-700'
                }`}
              >
                <AppIcon name={ic} className="h-4 w-4" />
              </button>
            ))}
          </div>
        </Field>

        <Field label={t('cat.color') || 'Choose Color'}>
          <div className="flex flex-wrap gap-2">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={c}
                className={`h-8 w-8 rounded-full transition-transform ${
                  color === c ? 'scale-115 ring-2 ring-offset-2 ring-black dark:ring-white' : ''
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </Field>

        <Field label={t('cat.parent') || 'Parent Category (Optional)'}>
          <div className="flex flex-wrap gap-1.5">
            <Chip active={!parentId} onClick={() => setParentId(null)}>
              {t('cat.none') || 'None (Main Category)'}
            </Chip>
            {parents.map((p) => (
              <Chip
                key={p.id}
                active={parentId === p.id}
                color={p.color}
                onClick={() => setParentId(p.id)}
              >
                <AppIcon name={p.icon} className="h-3.5 w-3.5 shrink-0" /> {nm(p)}
              </Chip>
            ))}
          </div>
        </Field>

        {cat && (
          <div className="border-t border-black/[0.06] pt-3 dark:border-white/[0.08]">
            <button
              type="button"
              className="apple-press text-xs font-semibold text-[#007AFF] hover:underline"
              onClick={() => setShowMerge(!showMerge)}
            >
              ⇄ {t('cat.merge') || 'Merge with another category'}
            </button>
            {showMerge && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {siblings.map((s) => (
                  <Chip key={s.id} onClick={() => setMergeTo(s)}>
                    <AppIcon name={s.icon} className="h-3.5 w-3.5 shrink-0" /> {nm(s)}
                  </Chip>
                ))}
              </div>
            )}
          </div>
        )}

        {cat && (
          <div className="space-y-2 border-t border-black/[0.06] pt-3 dark:border-white/[0.08]">
            <button
              type="button"
              className="apple-press flex w-full items-center justify-center gap-2 rounded-xl py-2 text-sm font-semibold text-[#FF3B30] hover:bg-[#FF3B30]/10 dark:text-[#FF453A] dark:hover:bg-[#FF453A]/15"
              onClick={() => {
                onClose()
                onDelete?.(cat)
              }}
            >
              <Trash2 className="h-4 w-4" />
              <span>{t('cat.delete') || 'Delete category'}</span>
            </button>
          </div>
        )}

        <Confirm
          open={!!mergeTo}
          icon="⇄"
          yesTone="blue"
          text={
            t('cat.mergeConfirm', {
              from: nm(cat),
              to: nm(mergeTo),
            }) || `Move all entries from "${nm(cat)}" into "${nm(mergeTo)}"?`
          }
          onNo={() => setMergeTo(null)}
          onYes={() => {
            if (cat && mergeTo) onMerge(cat, mergeTo)
          }}
        />
      </div>
    </Sheet>
  )
}
