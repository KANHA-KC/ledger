'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from '../lib/navigation'
import { useTranslation } from 'react-i18next'
import { useData } from '../store'
import { setLanguage } from '../i18n'
import { AppleTabBar } from './apple/AppleTabBar'
import { AppleHeader } from './apple/AppleHeader'

export function Layout({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation()
  const { business } = useData()
  const nav = useNavigate()
  const loc = useLocation()

  // Keyboard shortcuts: I = money in, O = money out, / = search
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || e.metaKey || e.ctrlKey || e.altKey) return
      if (loc.pathname.startsWith('/add')) return
      if (e.key === 'i' || e.key === 'I') {
        e.preventDefault()
        nav('/add/in')
      } else if (e.key === 'o' || e.key === 'O') {
        e.preventDefault()
        nav('/add/out')
      } else if (e.key === '/') {
        e.preventDefault()
        nav('/entries?focus=1')
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [nav, loc.pathname])

  const isAddPage = loc.pathname.startsWith('/add')

  return (
    <div className="min-h-screen bg-[#F2F2F7] text-neutral-900 antialiased dark:bg-black dark:text-white md:flex">
      {/* Navigation (Desktop Sidebar & Mobile Floating Tab Bar) */}
      <AppleTabBar />

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col pb-24 md:pb-6">
        {/* Sticky Translucent Header */}
        {!isAddPage && <AppleHeader subtitle={t('app.name') || 'Hisaab'} />}

        {/* Page Content */}
        <main className="w-full flex-1 px-4 py-4 md:px-6 md:py-6">
          {children}
        </main>
      </div>
    </div>
  )
}
