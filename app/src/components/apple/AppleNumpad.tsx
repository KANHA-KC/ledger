'use client'

import React, { useEffect } from 'react'
import { Delete } from 'lucide-react'
import { toDevaDigits } from '../../lib/format'
import { clickFeedback } from '../../lib/speak'

interface AppleNumpadProps {
  value: string
  onChange: (val: string) => void
  onDone?: () => void
  disabled?: boolean
  useDeva?: boolean
}

const KEYS: { key: string; sub?: string }[] = [
  { key: '1' },
  { key: '2', sub: 'ABC' },
  { key: '3', sub: 'DEF' },
  { key: '4', sub: 'GHI' },
  { key: '5', sub: 'JKL' },
  { key: '6', sub: 'MNO' },
  { key: '7', sub: 'PQRS' },
  { key: '8', sub: 'TUV' },
  { key: '9', sub: 'WXYZ' },
  { key: '.' },
  { key: '0' },
  { key: 'back' },
]

export function AppleNumpad({
  value,
  onChange,
  onDone,
  disabled = false,
  useDeva = false,
}: AppleNumpadProps) {
  const push = (k: string) => {
    clickFeedback()
    if (k === 'back') {
      onChange(value.slice(0, -1))
      return
    }
    if (k === '.' && value.includes('.')) return
    if (value === '0' && k !== '.') {
      onChange(k)
      return
    }
    // Limit to 2 decimals if decimal entered
    if (value.includes('.') && value.split('.')[1].length >= 2) return
    onChange(value + k)
  }

  // Keyboard support for desktop / laptop
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (['INPUT', 'TEXTAREA'].includes(el.tagName)) return
      if (e.key >= '0' && e.key <= '9') push(e.key)
      else if (e.key === '.') push('.')
      else if (e.key === 'Backspace') push('back')
      else if (e.key === 'Enter' && onDone) onDone()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [value, onDone])

  return (
    <div className="w-full max-w-sm select-none">
      {/* Quick ₹ multipliers */}
      <div className="mb-2.5 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            clickFeedback()
            if (!value || value === '0') onChange('100')
            else onChange(value + '00')
          }}
          disabled={disabled}
          className="apple-press flex h-10 items-center justify-center rounded-xl bg-neutral-200/80 text-sm font-bold text-neutral-900 hover:bg-neutral-300 dark:bg-[#2C2C2E] dark:text-white dark:border dark:border-white/10 dark:hover:bg-[#3A3A3C]"
        >
          +00 (Hundreds)
        </button>
        <button
          type="button"
          onClick={() => {
            clickFeedback()
            if (!value || value === '0') onChange('1000')
            else onChange(value + '000')
          }}
          disabled={disabled}
          className="apple-press flex h-10 items-center justify-center rounded-xl bg-neutral-200/80 text-sm font-bold text-neutral-900 hover:bg-neutral-300 dark:bg-[#2C2C2E] dark:text-white dark:border dark:border-white/10 dark:hover:bg-[#3A3A3C]"
        >
          +000 (Thousands)
        </button>
      </div>

      {/* Main keypad grid */}
      <div className="grid grid-cols-3 gap-2.5">
        {KEYS.map(({ key, sub }) => {
          const isBack = key === 'back'
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => push(key)}
              className={`apple-press relative flex h-16 flex-col items-center justify-center rounded-2xl transition-all ${
                isBack
                  ? 'bg-neutral-200/70 text-neutral-800 hover:bg-neutral-300 active:bg-neutral-300 dark:bg-[#2C2C2E] dark:text-white dark:border dark:border-white/10 dark:hover:bg-[#3A3A3C]'
                  : 'bg-white text-neutral-900 shadow-sm hover:bg-neutral-50 active:bg-neutral-200 dark:bg-[#1C1C1E] dark:text-white dark:border dark:border-white/10 dark:hover:bg-[#2C2C2E]'
              }`}
            >
              {isBack ? (
                <Delete className="h-6 w-6 stroke-[2.2]" />
              ) : (
                <>
                  <span className="apple-title-1 font-semibold leading-none">
                    {useDeva ? toDevaDigits(key) : key}
                  </span>
                  {sub && (
                    <span className="mt-0.5 text-[9px] font-bold tracking-widest text-[#8E8E93] dark:text-[#A1A1A6]">
                      {sub}
                    </span>
                  )}
                </>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
