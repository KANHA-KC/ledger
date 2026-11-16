'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, Globe, WifiOff } from 'lucide-react'
import { setLanguage } from '../../i18n'
import { useData } from '../../store'

interface AppleHeaderProps {
  title?: string
  subtitle?: string
  showBack?: boolean
  onBack?: () => void
  rightAction?: React.ReactNode
  largeTitle?: boolean
}

export function AppleHeader({
  title,
  subtitle,
  showBack = false,
  onBack,
  rightAction,
  largeTitle = false,
}: AppleHeaderProps) {
  const router = useRouter()
  const { t, i18n } = useTranslation()
  const { business } = useData()
  const [online, setOnline] = useState(true)
  const [userName, setUserName] = useState('Dilip Chandravanshi')

  useEffect(() => {
    setOnline(navigator.onLine)
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)

    try {
      const stored = localStorage.getItem('hisaab_user_name')
      if (stored) setUserName(stored)
    } catch {
      /* ignore */
    }

    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  const currentLang = i18n.language === 'hi' ? 'hi' : 'en'
  const toggleLang = () => {
    const next = currentLang === 'hi' ? 'en' : 'hi'
    setLanguage(next)
  }

  const handleBack = () => {
    if (onBack) {
      onBack()
    } else {
      router.back()
    }
  }

  const businessName = business?.name || 'Hisaab'
  const displayTitle = title || businessName
  const avatarInitial = businessName.trim() ? businessName.trim().charAt(0).toUpperCase() : 'H'

  return (
    <header className="sticky top-0 z-30 w-full border-b border-black/[0.05] bg-white/80 backdrop-blur-2xl transition-colors dark:border-white/[0.08] dark:bg-black/80">
      <div className="flex h-14 w-full items-center justify-between px-4 md:px-6">
        {/* Left item */}
        <div className="flex items-center gap-2">
          {showBack ? (
            <button
              onClick={handleBack}
              aria-label="Back"
              className="apple-press -ml-1 flex h-10 items-center gap-1 rounded-full px-2 text-[#007AFF] hover:bg-neutral-100 dark:text-[#0A84FF] dark:hover:bg-neutral-800"
            >
              <ChevronLeft className="h-6 w-6 stroke-[2.5]" />
              <span className="text-base font-medium">{t('act.cancel') || 'Back'}</span>
            </button>
          ) : (
            /* Brand badge for mobile when sidebar is hidden */
            <div className="flex items-center gap-2 md:hidden">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-[#34C759] to-[#30B0C7] text-sm font-bold text-white shadow-sm">
                ₹
              </div>
              <span className="text-base font-bold tracking-tight text-neutral-900 dark:text-white">
                Hisaab
              </span>
            </div>
          )}
        </div>

        {/* Right side items: Offline status, Language Switcher, and Profile Section */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          {!online && (
            <div className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
              <WifiOff className="h-3.5 w-3.5" />
              <span>Offline</span>
            </div>
          )}

          {/* Language Switcher pill */}
          <button
            onClick={toggleLang}
            type="button"
            className="apple-press flex h-8 items-center gap-1.5 rounded-full border border-black/[0.08] bg-neutral-100/80 px-2.5 text-xs font-semibold text-neutral-800 hover:bg-neutral-200 dark:border-white/[0.1] dark:bg-[#2C2C2E] dark:text-neutral-200 dark:hover:bg-[#3A3A3C]"
            title="Toggle Hindi / English"
          >
            <Globe className="h-3.5 w-3.5 text-neutral-500 dark:text-neutral-400" />
            <span>{currentLang === 'hi' ? 'English' : 'हिंदी'}</span>
          </button>

          {/* Profile Pill on Right Side (Avatar only, no text) */}
          <Link
            href="/more"
            className="apple-press flex items-center justify-center rounded-full p-0.5 transition-transform hover:scale-105 active:scale-95"
            title={`${businessName} (${userName}) — ${t('nav.more') || 'Profile & Settings'}`}
            aria-label={t('nav.more') || 'Profile & Settings'}
          >
            {/* Circular Profile Avatar Pill */}
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#34C759] to-[#007AFF] text-sm font-bold text-white shadow-sm ring-2 ring-black/[0.06] dark:ring-white/[0.1]">
              {avatarInitial}
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-[#34C759] ring-2 ring-white dark:ring-[#1C1C1E]" />
            </div>
          </Link>

          {rightAction}
        </div>
      </div>

      {largeTitle && (
        <div className="w-full px-4 pb-2 pt-1 md:px-6">
          <h1 className="apple-large-title text-neutral-950 dark:text-white">
            {displayTitle}
          </h1>
          {subtitle && (
            <p className="mt-0.5 text-sm text-[#6E6E73] dark:text-[#A1A1A6]">
              {subtitle}
            </p>
          )}
        </div>
      )}
    </header>
  )
}
