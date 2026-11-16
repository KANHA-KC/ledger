'use client'

import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { Paperclip, ArrowLeftRight } from 'lucide-react'
import type { Txn } from '../db/types'
import { useData } from '../store'
import { CatIcon, Money } from './ui'
import { formatDate } from '../lib/format'

export function EntryRow({ t: x, showDate }: { t: Txn; showDate?: boolean }) {
  const { t } = useTranslation()
  const { maps, nm, lang } = useData()
  const c = x.categoryId ? maps.cats.get(x.categoryId) : undefined
  const p = x.partyId ? maps.parties.get(x.partyId) : undefined
  const w = x.accountId ? maps.accounts.get(x.accountId) : undefined
  const to = x.toAccountId ? maps.accounts.get(x.toAccountId) : undefined
  const isTransfer = x.direction === 'transfer'
  const title = isTransfer ? `${nm(w)} → ${nm(to)}` : nm(c) || t('misc.noCategory') || 'Uncategorized'
  const sub = [
    showDate && formatDate(x.date, lang),
    p?.name,
    x.note,
    !isTransfer && w && nm(w),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Link
      href={isTransfer ? `/entries` : `/add/${x.direction}?edit=${x.id}`}
      className="apple-press flex min-h-[58px] items-center gap-3.5 px-4 py-2.5 transition-colors hover:bg-neutral-50/70 dark:hover:bg-[#2C2C2E]/60"
    >
      {isTransfer ? (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-200/80 text-neutral-700 dark:bg-[#2C2C2E] dark:text-neutral-200">
          <ArrowLeftRight className="h-5 w-5" />
        </div>
      ) : (
        <CatIcon icon={c?.icon ?? 'Tag'} color={c?.color ?? '#007AFF'} size="md" />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-base font-semibold text-neutral-900 dark:text-white">
            {title}
          </span>
          {x.photoId && (
            <Paperclip className="h-3.5 w-3.5 shrink-0 text-[#8E8E93] dark:text-[#A1A1A6]" />
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
          paise={x.amount}
          tone={isTransfer ? 'plain' : x.direction === 'in' ? 'in' : 'out'}
          arrow={!isTransfer}
          size="md"
        />
      </div>
    </Link>
  )
}
