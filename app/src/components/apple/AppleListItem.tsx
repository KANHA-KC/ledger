import React from 'react'
import { ChevronRight } from 'lucide-react'

interface AppleListItemProps {
  icon?: React.ReactNode
  iconBg?: string
  iconColor?: string
  title: React.ReactNode
  subtitle?: React.ReactNode
  value?: React.ReactNode
  chevron?: boolean
  onClick?: () => void
  disabled?: boolean
  className?: string
  isFirst?: boolean
  isLast?: boolean
}

export function AppleListItem({
  icon,
  iconBg = 'bg-[#007AFF]',
  iconColor = 'text-white',
  title,
  subtitle,
  value,
  chevron = false,
  onClick,
  disabled = false,
  className = '',
}: AppleListItemProps) {
  const isClickable = !!onClick && !disabled

  return (
    <div
      onClick={isClickable ? onClick : undefined}
      className={`relative flex min-h-[52px] items-center gap-3 px-4 py-2.5 transition-colors ${
        isClickable
          ? 'apple-press cursor-pointer hover:bg-neutral-50 active:bg-neutral-100 dark:hover:bg-[#2C2C2E] dark:active:bg-[#3A3A3C]'
          : ''
      } ${disabled ? 'opacity-50 pointer-events-none' : ''} ${className}`}
    >
      {/* Leading Icon Badge */}
      {icon && (
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold shadow-sm ${iconBg} ${iconColor}`}
        >
          {icon}
        </div>
      )}

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="truncate text-base font-semibold text-neutral-900 dark:text-white">
          {title}
        </div>
        {subtitle && (
          <div className="truncate text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]">
            {subtitle}
          </div>
        )}
      </div>

      {/* Trailing Value */}
      {value && (
        <div className="shrink-0 text-right text-sm font-semibold text-neutral-900 dark:text-white">
          {value}
        </div>
      )}

      {/* Chevron */}
      {chevron && (
        <ChevronRight className="h-4 w-4 shrink-0 text-[#8E8E93] dark:text-[#A1A1A6]" />
      )}
    </div>
  )
}
