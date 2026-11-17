'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Pencil,
  FileText,
  FolderInput,
  CheckSquare,
  Trash2,
  X,
  ArrowLeftRight,
  Paperclip,
} from 'lucide-react'
import type { Txn } from '../db/types'
import { useData } from '../store'
import { CatIcon, Money, Btn } from './ui'
import { TranslitInput } from './TranslitInput'
import { formatDate } from '../lib/format'

export interface EntryActionSheetProps {
  open: boolean
  txn: Txn | null
  onClose: () => void
  onEdit: (txn: Txn) => void
  onRename: (txn: Txn) => void
  onChangeCategory?: (txn: Txn) => void
  onSelectMultiple?: (txn: Txn) => void
  onDelete: (txn: Txn) => void
}

export function EntryActionSheet({
  open,
  txn,
  onClose,
  onEdit,
  onRename,
  onChangeCategory,
  onSelectMultiple,
  onDelete,
}: EntryActionSheetProps) {
  const { t } = useTranslation()
  const { maps, nm, lang } = useData()

  // Close on Escape key
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open || !txn) return null

  const c = txn.categoryId ? maps.cats.get(txn.categoryId) : undefined
  const p = txn.partyId ? maps.parties.get(txn.partyId) : undefined
  const w = txn.accountId ? maps.accounts.get(txn.accountId) : undefined
  const to = txn.toAccountId ? maps.accounts.get(txn.toAccountId) : undefined
  const isTransfer = txn.direction === 'transfer'
  const title = isTransfer ? `${nm(w)} → ${nm(to)}` : nm(c) || t('misc.noCategory') || 'Uncategorized'
  const sub = [
    formatDate(txn.date, lang),
    p?.name,
    txn.note,
    !isTransfer && w && nm(w),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('entries.actionsTitle') || 'Entry Actions'}
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="mx-auto mb-6 w-[94%] max-w-sm rounded-[28px] p-4 shadow-2xl bg-white dark:bg-[#1C1C1E] border border-black/5 dark:border-white/10 animate-in slide-in-from-bottom-8 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Grab handle */}
        <div className="mx-auto mb-3.5 h-1 w-9 rounded-full bg-neutral-300 dark:bg-neutral-600" />

        {/* Selected Entry Header Summary */}
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-neutral-100/70 p-3 dark:bg-[#2C2C2E]/60 border border-black/[0.04] dark:border-white/[0.06]">
          {isTransfer ? (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#007AFF] text-white dark:bg-[#0A84FF] shadow-sm">
              <ArrowLeftRight className="h-5 w-5 stroke-[2.2]" />
            </div>
          ) : (
            <CatIcon icon={c?.icon ?? 'Tag'} color={c?.color ?? '#007AFF'} size="md" />
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-bold text-neutral-900 dark:text-white">
                {title}
              </span>
              {txn.photoId && (
                <Paperclip className="h-3 w-3 shrink-0 text-[#8E8E93] dark:text-[#A1A1A6]" />
              )}
            </div>
            {sub && (
              <div className="truncate text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]">
                {sub}
              </div>
            )}
          </div>

          <div className="shrink-0 text-right">
            <Money
              paise={txn.amount}
              tone={isTransfer ? 'plain' : txn.direction === 'in' ? 'in' : 'out'}
              arrow={!isTransfer}
              size="sm"
            />
          </div>
        </div>

        {/* Action Options Group */}
        <div className="overflow-hidden rounded-2xl divide-y divide-black/[0.05] dark:divide-white/[0.08] bg-neutral-50 dark:bg-[#2C2C2E]/40 border border-black/[0.04] dark:border-white/[0.06]">
          {/* Edit Full Details */}
          <button
            type="button"
            onClick={() => {
              onClose()
              onEdit(txn)
            }}
            className="apple-press flex w-full items-center gap-3.5 px-4 py-3 text-left transition-colors hover:bg-neutral-100/80 dark:hover:bg-[#3A3A3C]/70"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#007AFF]/10 text-[#007AFF] dark:bg-[#0A84FF]/15 dark:text-[#0A84FF]">
              <Pencil className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-neutral-900 dark:text-white">
                {t('entries.editFull') || 'Edit Entry'}
              </div>
              <div className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
                Amount, date, wallet, photo
              </div>
            </div>
          </button>

          {/* Rename / Edit Note */}
          <button
            type="button"
            onClick={() => {
              onClose()
              onRename(txn)
            }}
            className="apple-press flex w-full items-center gap-3.5 px-4 py-3 text-left transition-colors hover:bg-neutral-100/80 dark:hover:bg-[#3A3A3C]/70"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 dark:bg-purple-500/15 dark:text-purple-400">
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-neutral-900 dark:text-white">
                {t('entries.renameNote') || 'Rename / Edit Note'}
              </div>
              <div className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
                {t('entries.renameNoteSub') || 'Quickly update description or note'}
              </div>
            </div>
          </button>

          {/* Change Category (if not transfer) */}
          {!isTransfer && onChangeCategory && (
            <button
              type="button"
              onClick={() => {
                onClose()
                onChangeCategory(txn)
              }}
              className="apple-press flex w-full items-center gap-3.5 px-4 py-3 text-left transition-colors hover:bg-neutral-100/80 dark:hover:bg-[#3A3A3C]/70"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
                <FolderInput className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-neutral-900 dark:text-white">
                  {t('entries.changeCategory') || 'Change Category'}
                </div>
                <div className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
                  Move to a different category
                </div>
              </div>
            </button>
          )}

          {/* Select Multiple */}
          {onSelectMultiple && (
            <button
              type="button"
              onClick={() => {
                onClose()
                onSelectMultiple(txn)
              }}
              className="apple-press flex w-full items-center gap-3.5 px-4 py-3 text-left transition-colors hover:bg-neutral-100/80 dark:hover:bg-[#3A3A3C]/70"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
                <CheckSquare className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-neutral-900 dark:text-white">
                  {t('entries.selectMultiple') || 'Select Multiple'}
                </div>
                <div className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
                  Select multiple rows to delete or categorize
                </div>
              </div>
            </button>
          )}

          {/* Delete Entry */}
          <button
            type="button"
            onClick={() => {
              onClose()
              onDelete(txn)
            }}
            className="apple-press flex w-full items-center gap-3.5 px-4 py-3 text-left transition-colors hover:bg-red-50/80 dark:hover:bg-red-950/40"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-[#FF3B30] dark:bg-red-500/15 dark:text-[#FF453A]">
              <Trash2 className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-[#FF3B30] dark:text-[#FF453A]">
                {t('act.delete') || 'Delete Entry'}
              </div>
              <div className="text-xs text-red-600/70 dark:text-red-400/70">
                Move to Recycle Bin (keep for 30 days)
              </div>
            </div>
          </button>
        </div>

        {/* Cancel Button */}
        <button
          type="button"
          onClick={onClose}
          className="apple-press mt-3 flex h-11 w-full items-center justify-center rounded-xl bg-neutral-100 text-sm font-semibold text-neutral-800 dark:bg-[#2C2C2E] dark:text-neutral-200 dark:hover:bg-[#3A3A3C]"
        >
          <X className="mr-1.5 h-4 w-4" />
          {t('act.cancel') || 'Cancel'}
        </button>
      </div>
    </div>
  )
}

export interface QuickRenameModalProps {
  open: boolean
  txn: Txn | null
  onClose: () => void
  onSave: (txn: Txn, newNote: string) => Promise<void>
}

export function QuickRenameModal({
  open,
  txn,
  onClose,
  onSave,
}: QuickRenameModalProps) {
  const { t } = useTranslation()
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (txn) {
      setNote(txn.note || '')
    }
  }, [txn])

  if (!open || !txn) return null

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    try {
      await onSave(txn, note)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('entries.renameNote') || 'Rename / Edit Note'}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="apple-card w-full max-w-sm p-5 space-y-4 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400">
            <FileText className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-neutral-900 dark:text-white">
              {t('entries.renameNote') || 'Rename / Edit Note'}
            </h3>
            <p className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
              {t('entries.renameNoteSub') || 'Update description or note for this entry'}
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">
            {t('add.note') || 'Note'}
          </label>
          <TranslitInput
            value={note}
            onChange={setNote}
            placeholder={t('add.notePh') || 'e.g. Morning sales, Store supplies...'}
            autoFocus
            onEnter={handleSave}
          />
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2">
          <Btn tone="ghost" onClick={onClose} disabled={saving}>
            {t('act.cancel') || 'Cancel'}
          </Btn>
          <Btn tone="blue" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : t('act.save') || 'Save'}
          </Btn>
        </div>
      </div>
    </div>
  )
}
