'use client'

// Text field with built-in Hinglish → Devanagari typing (Google Indic style), no keyboard install needed.
// Type "bijli bill" in अ mode → suggestions appear; space accepts the top one, tap picks another,
// backspace right after a conversion reverts it to Roman.

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { learn, suggest } from '../lib/translit'
import { cx, inputCls } from './ui'

const modeKey = 'translitMode'
const readMode = (lang: string): 'hi' | 'en' => {
  try {
    if (typeof localStorage !== 'undefined') {
      const m = localStorage.getItem(modeKey)
      if (m === 'hi' || m === 'en') return m
    }
  } catch {
    /* ignore */
  }
  return lang === 'hi' ? 'hi' : 'en'
}

export function TranslitInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  className,
  inputRef,
  onEnter,
  ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
  className?: string
  inputRef?: React.RefObject<HTMLInputElement | null>
  onEnter?: () => void
  ariaLabel?: string
}) {
  const { i18n } = useTranslation()
  const [mode, setMode] = useState<'hi' | 'en'>('en')
  const [last, setLast] = useState<{ roman: string; hi: string } | null>(null)
  const ownRef = useRef<HTMLInputElement>(null)
  const ref = inputRef ?? ownRef

  useEffect(() => {
    setMode(readMode(i18n.language))
  }, [i18n.language])

  const word = mode === 'hi' ? (value.match(/[A-Za-z]+$/)?.[0] ?? '') : ''
  const sugg = word ? suggest(word) : []

  useEffect(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(modeKey, mode)
      }
    } catch {
      /* ignore */
    }
  }, [mode])

  // Track the latest value we emitted: fast typing can fire several input events before React re-renders.
  const valRef = useRef(value)
  valRef.current = value
  const emit = (v: string) => {
    valRef.current = v
    onChange(v)
  }

  const commit = (choice: string, trailing = '', from = value) => {
    const w = mode === 'hi' ? (from.match(/[A-Za-z]+$/)?.[0] ?? '') : ''
    const base = from.slice(0, from.length - w.length)
    learn(w, choice)
    setLast({ roman: w, hi: choice })
    emit(base + choice + trailing)
  }

  const handleChange = (next: string) => {
    const value = valRef.current
    const word = mode === 'hi' ? (value.match(/[A-Za-z]+$/)?.[0] ?? '') : ''
    const sugg = word ? suggest(word) : []
    if (mode === 'hi' && word && next === value + ' ' && sugg[0]) {
      commit(sugg[0], ' ', value)
      return
    }
    if (
      mode === 'hi' &&
      word &&
      /^[.,?!।]$/.test(next.slice(value.length)) &&
      next.length === value.length + 1 &&
      sugg[0]
    ) {
      commit(sugg[0], next.slice(-1), value)
      return
    }
    // several words arrived at once (paste, swipe typing, keyboard autocomplete): convert every finished Roman word
    if (
      mode === 'hi' &&
      next.startsWith(value) &&
      next.length - value.length > 1 &&
      /[\s.,?!।]/.test(next.slice(value.length))
    ) {
      const start = value.length - word.length
      const tail = next.slice(start).replace(/[A-Za-z]+(?=[\s.,?!।])/g, (w) => {
        const hi = suggest(w, 1)[0] ?? w
        learn(w, hi)
        return hi
      })
      setLast(null)
      emit(next.slice(0, start) + tail)
      return
    }
    // backspace right after a conversion → back to Roman
    if (
      last &&
      next.length === value.length - 1 &&
      value.endsWith(last.hi + ' ') &&
      next === value.slice(0, -1)
    ) {
      emit(value.slice(0, value.length - last.hi.length - 1) + last.roman)
      setLast(null)
      return
    }
    setLast(null)
    emit(next)
  }

  return (
    <div className={cx('relative', className)}>
      <div className="flex gap-2">
        <input
          ref={ref}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (word && sugg[0]) {
                e.preventDefault()
                commit(sugg[0])
              } else onEnter?.()
            }
          }}
          onBlur={() => {
            if (word && sugg[0]) commit(sugg[0])
          }}
          placeholder={placeholder}
          autoFocus={autoFocus}
          aria-label={ariaLabel ?? placeholder}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className={inputCls}
          lang={mode}
        />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setMode(mode === 'hi' ? 'en' : 'hi')}
          className={cx(
            'apple-press flex h-[46px] w-12 shrink-0 items-center justify-center rounded-xl text-base font-bold transition-all',
            mode === 'hi'
              ? 'bg-[#007AFF] text-white shadow-sm'
              : 'border border-black/[0.08] bg-white text-neutral-600 hover:bg-neutral-50 dark:border-white/[0.1] dark:bg-[#1C1C1E] dark:text-neutral-300'
          )}
          aria-label={mode === 'hi' ? 'Hindi transliteration on' : 'English transliteration'}
          title="Toggle Hindi Transliteration (अ / A)"
        >
          {mode === 'hi' ? 'अ' : 'A'}
        </button>
      </div>

      {/* Apple Predictive Ribbon */}
      {sugg.length > 0 && (
        <div
          className="no-scrollbar mt-1.5 flex gap-1.5 overflow-x-auto rounded-xl border border-black/[0.05] bg-neutral-100/90 p-1.5 backdrop-blur-md dark:border-white/[0.08] dark:bg-neutral-800/90"
          role="listbox"
        >
          {sugg.map((s, i) => (
            <button
              key={s}
              type="button"
              role="option"
              aria-selected={i === 0}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                commit(s, ' ')
                ref.current?.focus()
              }}
              className={cx(
                'apple-press flex h-9 shrink-0 items-center rounded-lg px-3 text-sm transition-all',
                i === 0
                  ? 'bg-white font-bold text-[#007AFF] shadow-sm ring-1 ring-[#007AFF]/30 dark:bg-[#2C2C2E] dark:text-[#0A84FF]'
                  : 'bg-white/60 font-medium text-neutral-800 hover:bg-white dark:bg-neutral-700/60 dark:text-neutral-200'
              )}
            >
              {s}
            </button>
          ))}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => commit(word, ' ')}
            className="apple-press flex h-9 shrink-0 items-center rounded-lg px-2.5 text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
          >
            {word} (as is)
          </button>
        </div>
      )}
    </div>
  )
}
