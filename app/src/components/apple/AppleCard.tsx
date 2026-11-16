import React from 'react'

interface AppleCardProps {
  children: React.ReactNode
  className?: string
  title?: string
  subtitle?: string
  action?: React.ReactNode
  footer?: React.ReactNode
  inset?: boolean
  onClick?: () => void
}

export function AppleCard({
  children,
  className = '',
  title,
  subtitle,
  action,
  footer,
  inset = false,
  onClick,
}: AppleCardProps) {
  return (
    <div className={`flex flex-col ${inset ? 'px-4' : ''}`}>
      {(title || action) && (
        <div className="mb-2 flex items-center justify-between px-1">
          <div>
            {title && (
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#6E6E73] dark:text-[#A1A1A6]">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-xs text-[#8E8E93] dark:text-[#A1A1A6]">
                {subtitle}
              </p>
            )}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}

      <div
        onClick={onClick}
        className={`apple-card overflow-hidden ${
          onClick ? 'apple-press cursor-pointer' : ''
        } ${className}`}
      >
        {children}
      </div>

      {footer && (
        <div className="mt-1.5 px-3 text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
          {footer}
        </div>
      )}
    </div>
  )
}
