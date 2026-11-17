import React from 'react'

interface Option<T extends string> {
  value: T
  label: React.ReactNode
  icon?: React.ReactNode
}

interface AppleSegmentedControlProps<T extends string> {
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function AppleSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className = '',
}: AppleSegmentedControlProps<T>) {
  const sizeClasses = {
    sm: 'p-[2px] h-[30px]',
    md: 'p-[3px] h-[38px]',
    lg: 'p-1 h-[44px]',
  }[size]

  const buttonPadding = {
    sm: 'px-1.5 text-[11px] leading-tight',
    md: 'px-2.5 text-xs',
    lg: 'px-3.5 text-sm',
  }[size]

  const buttonRadius = {
    sm: 'rounded-[9px]',
    md: 'rounded-[10px]',
    lg: 'rounded-xl',
  }[size]

  return (
    <div
      role="tablist"
      className={`relative flex w-full items-center rounded-xl bg-neutral-200/80 dark:bg-[#1C1C1E] dark:border dark:border-white/10 overflow-x-auto no-scrollbar ${sizeClasses} ${className}`}
    >
      {options.map((opt) => {
        const isActive = opt.value === value
        return (
          <button
            key={opt.value}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => {
              if (!isActive) {
                try {
                  navigator.vibrate?.(10)
                } catch {
                  /* noop */
                }
                onChange(opt.value)
              }
            }}
            className={`apple-press-sm relative z-10 flex flex-1 h-full min-w-fit sm:min-w-0 items-center justify-center gap-1 ${buttonPadding} ${buttonRadius} font-medium transition-all duration-200 ${
              isActive
                ? 'bg-white font-semibold text-black shadow-[0_2px_6px_rgba(0,0,0,0.12)] dark:bg-[#2C2C2E] dark:text-white dark:border dark:border-white/10 dark:shadow-[0_2px_8px_rgba(0,0,0,0.5)]'
                : 'text-[#6E6E73] hover:text-black dark:text-[#A1A1A6] dark:hover:text-white'
            }`}
          >
            {opt.icon && <span className="shrink-0">{opt.icon}</span>}
            <span className="truncate whitespace-nowrap">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}
