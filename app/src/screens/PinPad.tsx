'use client'

import { useEffect, useRef, useState } from 'react'
import { Delete } from 'lucide-react'
import { clickFeedback } from '../lib/speak'

const DIGIT_SUBS: Record<string, string> = {
  '1': '',
  '2': 'ABC',
  '3': 'DEF',
  '4': 'GHI',
  '5': 'JKL',
  '6': 'MNO',
  '7': 'PQRS',
  '8': 'TUV',
  '9': 'WXYZ',
  '0': '',
}

/** Authentic iOS Passcode Pad */
export function PinPad({
  title,
  subtitle,
  error,
  onDone,
  length = 4,
}: {
  title: string
  subtitle?: string
  error?: string
  onDone: (pin: string) => void
  length?: number
}) {
  const [pin, setPin] = useState('')
  const [shake, setShake] = useState(false)
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => {
    if (error) {
      setShake(true)
      const t = setTimeout(() => setShake(false), 500)
      return () => clearTimeout(t)
    }
  }, [error])

  useEffect(() => {
    if (pin.length !== length) return
    const id = setTimeout(() => {
      setPin('')
      doneRef.current(pin)
    }, 140)
    return () => clearTimeout(id)
  }, [pin, length])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) {
        clickFeedback()
        setPin((p) => (p.length < length ? p + e.key : p))
      } else if (e.key === 'Backspace') {
        clickFeedback()
        setPin((p) => p.slice(0, -1))
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [length])

  const pressDigit = (k: string) => {
    clickFeedback()
    if (k === '⌫') {
      setPin((p) => p.slice(0, -1))
    } else if (pin.length < length) {
      setPin((p) => p + k)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-xs flex-col items-center">
      <h1 className="apple-title-2 mb-1 text-center font-bold text-neutral-900 dark:text-white">
        {title}
      </h1>
      {subtitle && (
        <p className="mb-4 text-center text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]">{subtitle}</p>
      )}

      {/* iOS Passcode Dots */}
      <div
        className={`mb-6 flex justify-center gap-4 transition-transform ${
          shake ? 'animate-shake' : ''
        }`}
      >
        {Array.from({ length }).map((_, i) => {
          const filled = i < pin.length
          return (
            <span
              key={i}
              className={`h-3.5 w-3.5 rounded-full transition-all duration-150 ${
                filled
                  ? 'scale-110 bg-neutral-900 shadow-sm dark:bg-white'
                  : 'border border-neutral-400 bg-transparent dark:border-neutral-500'
              }`}
            />
          )
        })}
      </div>

      {error ? (
        <p className="mb-4 min-h-[20px] text-center text-xs font-semibold text-[#D70015] dark:text-[#FF453A]">
          {error}
        </p>
      ) : (
        <div className="mb-4 h-5" />
      )}

      {/* iOS Circular Keypad */}
      <div className="grid grid-cols-3 gap-x-6 gap-y-4">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) => {
          if (!k) return <div key={i} className="h-18 w-18" />
          const isDel = k === '⌫'
          const sub = DIGIT_SUBS[k]
          return (
            <button
              key={i}
              type="button"
              onClick={() => pressDigit(k)}
              className={`apple-press flex h-[72px] w-[72px] flex-col items-center justify-center rounded-full transition-colors ${
                isDel
                  ? 'bg-transparent text-neutral-600 hover:text-neutral-900 dark:text-[#A1A1A6] dark:hover:text-white'
                  : 'border border-black/[0.06] bg-white/90 text-neutral-900 shadow-sm hover:bg-neutral-100 active:bg-neutral-200 dark:border-white/[0.12] dark:bg-[#2C2C2E] dark:text-white dark:hover:bg-[#3A3A3C]'
              }`}
              aria-label={isDel ? 'Delete' : k}
            >
              {isDel ? (
                <Delete className="h-6 w-6 stroke-[2]" />
              ) : (
                <>
                  <span className="text-2xl font-semibold leading-none">{k}</span>
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
