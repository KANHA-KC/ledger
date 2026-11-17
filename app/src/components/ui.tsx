'use client'

import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Volume2, X } from 'lucide-react'
import { money } from '../lib/format'
import { speak, clickFeedback } from '../lib/speak'
import { AppIcon } from './AppIcon'

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

/** Money with arrow + colour + word never colour alone. */
export function Money({
  paise,
  tone,
  size = 'md',
  arrow = false,
  className,
}: {
  paise: number
  tone?: 'in' | 'out' | 'auto' | 'plain'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  arrow?: boolean
  className?: string
}) {
  const tn = tone === 'auto' ? (paise >= 0 ? 'in' : 'out') : tone ?? 'plain'
  const color =
    tn === 'in'
      ? 'text-[#1C7430] dark:text-[#30D158]'
      : tn === 'out'
      ? 'text-[#D70015] dark:text-[#FF453A]'
      : 'text-neutral-900 dark:text-white'
  const sz = {
    sm: 'text-sm font-semibold',
    md: 'text-lg font-bold',
    lg: 'text-2xl font-bold tracking-tight',
    xl: 'apple-display text-3xl md:text-5xl font-extrabold',
  }[size]

  return (
    <span className={cx('tabular-numbers select-text', color, sz, className)}>
      {arrow && tn === 'in' && <span aria-hidden>↓ </span>}
      {arrow && tn === 'out' && <span aria-hidden>↑ </span>}
      {money(paise)}
    </span>
  )
}

export function SpeakBtn({ text, className }: { text: string; className?: string }) {
  const { t, i18n } = useTranslation()
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        clickFeedback()
        speak(text, i18n.language)
      }}
      className={cx(
        'apple-press grid h-8 w-8 shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-600 hover:bg-neutral-200 active:bg-neutral-300 dark:bg-[#2C2C2E] dark:text-[#A1A1A6] dark:hover:text-white',
        className
      )}
      aria-label={t('act.listen') || 'Listen'}
      title={t('act.listen') || 'Listen'}
    >
      <Volume2 className="h-4 w-4" />
    </button>
  )
}

export function Card({
  children,
  className,
  onClick,
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
      className={cx(
        'apple-card block w-full p-4 text-left transition-all',
        onClick && 'apple-press cursor-pointer hover:bg-neutral-50/50 dark:hover:bg-[#2C2C2E]/50',
        className
      )}
    >
      {children}
    </div>
  )
}

export function Heading({
  children,
  right,
}: {
  children: ReactNode
  right?: ReactNode
}) {
  return (
    <div className="mb-2.5 flex items-center gap-1.5 px-0.5">
      <h2 className="apple-headline text-neutral-900 dark:text-white">{children}</h2>
      <div className="ml-auto">{right}</div>
    </div>
  )
}

export function Chip({
  active,
  onClick,
  children,
  color,
  className,
}: {
  active?: boolean
  onClick?: () => void
  children: ReactNode
  color?: string
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={() => {
        clickFeedback()
        if (onClick) onClick()
      }}
      aria-pressed={active}
      className={cx(
        'apple-press inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-all',
        active
          ? 'bg-[#007AFF] text-white shadow-sm'
          : 'border border-black/[0.08] bg-white text-neutral-800 hover:bg-neutral-50 dark:border-white/[0.1] dark:bg-[#2C2C2E] dark:text-neutral-200 dark:hover:bg-[#3A3A3C]',
        className
      )}
      style={active && color ? { background: color } : undefined}
    >
      {children}
    </button>
  )
}

export function Btn({
  children,
  onClick,
  tone = 'blue',
  className,
  type = 'button',
  disabled,
}: {
  children: ReactNode
  onClick?: () => void
  tone?: 'blue' | 'in' | 'out' | 'ghost' | 'amber' | 'danger'
  className?: string
  type?: 'button' | 'submit'
  disabled?: boolean
}) {
  const tones = {
    blue: 'bg-[#007AFF] text-white hover:bg-[#0071E3] active:bg-[#0062C4] shadow-sm',
    in: 'bg-[#34C759] text-white hover:bg-[#30B752] active:bg-[#28A745] shadow-sm',
    out: 'bg-[#FF3B30] text-white hover:bg-[#E0352A] active:bg-[#C92F25] shadow-sm',
    amber: 'bg-[#FF9500] text-white hover:bg-[#E58600] active:bg-[#C97400] shadow-sm',
    danger: 'bg-[#FF3B30] text-white hover:bg-[#E0352A] active:bg-[#C92F25] shadow-sm',
    ghost:
      'bg-neutral-100 text-neutral-800 hover:bg-neutral-200 active:bg-neutral-300 dark:bg-[#2C2C2E] dark:text-neutral-200 dark:hover:bg-[#3A3A3C]',
  }
  return (
    <button
      type={type}
      onClick={() => {
        clickFeedback()
        if (onClick) onClick()
      }}
      disabled={disabled}
      className={cx(
        'apple-press inline-flex min-h-[46px] items-center justify-center rounded-2xl px-5 text-base font-bold transition-all disabled:opacity-40 disabled:pointer-events-none',
        tones[tone],
        className
      )}
    >
      {children}
    </button>
  )
}

/** Apple bottom sheet on mobile, modal on desktop. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  widthCls = 'md:w-[500px]',
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  widthCls?: string
}) {
  const { t } = useTranslation()
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm transition-opacity md:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal
        aria-label={title}
        className={cx(
          'flex max-h-[90vh] w-full flex-col rounded-t-[32px] bg-white shadow-2xl dark:bg-[#1C1C1E] md:max-h-[85vh] md:rounded-[28px] overflow-hidden border border-black/5 dark:border-white/10',
          widthCls
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Grab handle indicator on mobile */}
        <div className="mx-auto mt-2.5 h-1 w-9 rounded-full bg-neutral-300 dark:bg-neutral-600 md:hidden" />

        <div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-3.5 dark:border-white/[0.08]">
          <h2 className="apple-headline text-neutral-900 dark:text-white">{title}</h2>
          <button
            onClick={onClose}
            className="apple-press flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-[#2C2C2E] dark:text-[#A1A1A6] dark:hover:text-white"
            aria-label={t('act.close') || 'Close'}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && (
          <div className="border-t border-black/[0.06] bg-neutral-50/70 p-4 dark:border-white/[0.08] dark:bg-[#1C1C1E]">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

/** Apple Confirm Dialog with picture/icon for critical actions. */
export function Confirm({
  open,
  icon,
  text,
  onYes,
  onNo,
  yesTone = 'danger',
}: {
  open: boolean
  icon: string
  text: string
  onYes: () => void
  onNo: () => void
  yesTone?: 'danger' | 'blue'
}) {
  const { t } = useTranslation()
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onNo}
    >
      <div
        className="apple-card w-full max-w-sm rounded-[28px] p-6 text-center shadow-2xl dark:bg-[#1C1C1E] border border-black/5 dark:border-white/10"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
      >
        <div className="mb-4 flex justify-center" aria-hidden>
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200 shadow-sm border border-black/5 dark:border-white/10">
            <AppIcon name={icon} className="h-7 w-7 stroke-[2]" />
          </div>
        </div>
        <p className="mb-6 text-base font-semibold text-neutral-900 dark:text-white">{text}</p>
        <div className="grid grid-cols-2 gap-2.5">
          <Btn tone="ghost" onClick={onNo}>
            {t('act.cancel') || 'Cancel'}
          </Btn>
          <Btn tone={yesTone} onClick={onYes}>
            {t('act.confirm') || 'Confirm'}
          </Btn>
        </div>
      </div>
    </div>
  )
}

export function Empty({
  icon,
  title,
  body,
  action,
}: {
  icon: string
  title: string
  body?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-100 dark:bg-[#2C2C2E] shadow-inner text-neutral-400 dark:text-neutral-500" aria-hidden>
        <AppIcon name={icon} className="h-8 w-8 stroke-[1.75]" />
      </div>
      <p className="apple-headline text-neutral-900 dark:text-white">{title}</p>
      {body && <p className="max-w-xs text-xs text-[#6E6E73] dark:text-[#A1A1A6]">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function CatIcon({
  icon,
  color,
  size = 'md',
  className = '',
}: {
  icon: string
  color?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const s = {
    sm: 'h-8 w-8 rounded-xl',
    md: 'h-10 w-10 rounded-xl',
    lg: 'h-12 w-12 rounded-2xl',
  }[size]
  const iconSize = {
    sm: 'h-4 w-4 stroke-[2.2]',
    md: 'h-5 w-5 stroke-[2.2]',
    lg: 'h-6 w-6 stroke-[2.2]',
  }[size]

  return (
    <span
      className={cx(
        'grid shrink-0 place-items-center shadow-sm bg-[#007AFF] text-white dark:bg-[#0A84FF] ring-1 ring-black/[0.04] dark:ring-white/[0.1]',
        s,
        className
      )}
      aria-hidden
    >
      <AppIcon name={icon} className={cx(iconSize, 'text-white')} />
    </span>
  )
}

export function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <label className="mb-3.5 block">
      <span className="mb-1.5 block text-xs font-semibold text-[#6E6E73] dark:text-[#A1A1A6]">
        {label}
      </span>
      {children}
    </label>
  )
}

export const inputCls =
  'w-full min-h-[46px] rounded-xl border border-black/10 dark:border-white/10 bg-neutral-100/70 dark:bg-[#2C2C2E] text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-[#8E8E93] px-3.5 text-base outline-none focus:border-[#007AFF] dark:focus:border-[#0A84FF] focus:bg-white dark:focus:bg-[#1C1C1E] transition-colors'
