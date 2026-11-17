'use client'

import { useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Paperclip, ArrowLeftRight, Check } from 'lucide-react'
import type { Txn } from '../db/types'
import { useData } from '../store'
import { CatIcon, Money } from './ui'
import { formatDate } from '../lib/format'
import { useNavigate } from '../lib/navigation'

export interface EntryRowProps {
  t: Txn
  showDate?: boolean
  selected?: boolean
  selectionMode?: boolean
  onSelect?: () => void
  onLongPress?: () => void
  onClick?: () => void
}

export function EntryRow({
  t: x,
  showDate,
  selected,
  selectionMode,
  onSelect,
  onLongPress,
  onClick,
}: EntryRowProps) {
  const { t } = useTranslation()
  const { maps, nm, lang } = useData()
  const navigate = useNavigate()

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

  // Long press handling
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const isLongPressRef = useRef(false)
  const touchStartPos = useRef<{ x: number; y: number } | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const handleTouchStart = (e: React.TouchEvent) => {
    isLongPressRef.current = false
    const touch = e.touches[0]
    touchStartPos.current = { x: touch.clientX, y: touch.clientY }

    clearTimer()
    timerRef.current = setTimeout(() => {
      isLongPressRef.current = true
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(40)
        } catch {}
      }
      onLongPress?.()
    }, 450)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPos.current) return
    const touch = e.touches[0]
    const dx = touch.clientX - touchStartPos.current.x
    const dy = touch.clientY - touchStartPos.current.y
    // If movement > 10px, it's a scroll: cancel long press
    if (Math.hypot(dx, dy) > 10) {
      clearTimer()
    }
  }

  const handleTouchEnd = () => {
    clearTimer()
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only respond to left button
    if (e.button !== 0) return
    isLongPressRef.current = false
    touchStartPos.current = { x: e.clientX, y: e.clientY }

    clearTimer()
    timerRef.current = setTimeout(() => {
      isLongPressRef.current = true
      onLongPress?.()
    }, 500)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!touchStartPos.current) return
    const dx = e.clientX - touchStartPos.current.x
    const dy = e.clientY - touchStartPos.current.y
    if (Math.hypot(dx, dy) > 10) {
      clearTimer()
    }
  }

  const handleMouseUp = () => {
    clearTimer()
  }

  const handleClick = (e: React.MouseEvent) => {
    clearTimer()
    // Suppress click if long press just fired
    if (isLongPressRef.current) {
      e.preventDefault()
      e.stopPropagation()
      setTimeout(() => {
        isLongPressRef.current = false
      }, 100)
      return
    }

    if (selectionMode) {
      e.preventDefault()
      e.stopPropagation()
      onSelect?.()
      return
    }

    if (onClick) {
      e.preventDefault()
      onClick()
      return
    }

    navigate(isTransfer ? `/entries` : `/add/${x.direction}?edit=${x.id}`)
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    if (onLongPress) {
      onLongPress()
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onContextMenu={handleContextMenu}
      className={`apple-press select-none [-webkit-touch-callout:none] flex min-h-[58px] cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors ${
        selected
          ? 'bg-[#007AFF]/10 dark:bg-[#0A84FF]/15'
          : 'hover:bg-neutral-50/70 dark:hover:bg-[#2C2C2E]/60'
      }`}
    >
      {/* Animated Selection Checkbox */}
      {selectionMode && (
        <div className="flex shrink-0 items-center justify-center pr-0.5 animate-in fade-in zoom-in-75 duration-150">
          <div
            className={`flex h-5 w-5 items-center justify-center rounded-full transition-all ${
              selected
                ? 'bg-[#007AFF] text-white shadow-sm ring-2 ring-[#007AFF]/30 dark:bg-[#0A84FF]'
                : 'border-2 border-neutral-300 dark:border-neutral-600 bg-transparent'
            }`}
          >
            {selected && <Check className="h-3 w-3 stroke-[3]" />}
          </div>
        </div>
      )}

      {isTransfer ? (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#007AFF] text-white dark:bg-[#0A84FF] shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.1]">
          <ArrowLeftRight className="h-5 w-5 stroke-[2.2]" />
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
    </div>
  )
}
