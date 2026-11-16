import React from 'react'

export interface AppleButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'destructive' | 'glass' | 'tinted'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  fullWidth?: boolean
  icon?: React.ReactNode
  trailingIcon?: React.ReactNode
  children?: React.ReactNode
}

export function AppleButton({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  icon,
  trailingIcon,
  children,
  className = '',
  disabled,
  onClick,
  ...props
}: AppleButtonProps) {
  const base =
    'apple-press inline-flex items-center justify-center font-semibold rounded-2xl transition-all duration-150 select-none cursor-pointer focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none'

  const variants = {
    primary:
      'bg-[#007AFF] text-white hover:bg-[#0071E3] active:bg-[#0062C4] shadow-[0_2px_8px_rgba(0,122,255,0.25)]',
    success:
      'bg-[#34C759] text-white hover:bg-[#30B752] active:bg-[#28A745] shadow-[0_2px_8px_rgba(52,199,89,0.25)]',
    destructive:
      'bg-[#FF3B30] text-white hover:bg-[#E0352A] active:bg-[#C92F25] shadow-[0_2px_8px_rgba(255,59,48,0.25)]',
    secondary:
      'bg-neutral-100 text-neutral-900 hover:bg-neutral-200 active:bg-neutral-300 dark:bg-[#2C2C2E] dark:text-white dark:hover:bg-[#3A3A3C]',
    glass:
      'apple-glass text-neutral-900 dark:text-white hover:bg-white/90 active:bg-white/70 shadow-sm',
    tinted:
      'bg-[#007AFF]/10 text-[#007AFF] hover:bg-[#007AFF]/15 active:bg-[#007AFF]/20 dark:bg-[#007AFF]/20 dark:text-[#0A84FF]',
  }[variant]

  const sizes = {
    sm: 'h-9 px-3 text-xs gap-1.5 rounded-xl',
    md: 'h-11 px-4 text-sm gap-2 rounded-xl',
    lg: 'h-12 px-5 text-base gap-2.5 rounded-2xl py-3',
    xl: 'h-14 px-6 text-lg gap-3 rounded-2xl py-3.5',
  }[size]

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    try {
      navigator.vibrate?.(12)
    } catch {
      /* noop */
    }
    if (onClick) onClick(e)
  }

  return (
    <button
      className={`${base} ${variants} ${sizes} ${fullWidth ? 'w-full' : ''} ${className}`}
      disabled={disabled}
      onClick={handleClick}
      {...props}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children && <span>{children}</span>}
      {trailingIcon && <span className="shrink-0">{trailingIcon}</span>}
    </button>
  )
}
