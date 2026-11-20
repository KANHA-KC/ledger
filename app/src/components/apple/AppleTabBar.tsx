'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import {
  Home,
  BookOpen,
  Plus,
  BarChart3,
  Tags,
  ArrowDownLeft,
  ArrowUpRight,
  X,
  User,
} from 'lucide-react'
import { useData } from '../../store'
import { CategoryNav } from '../CategoryNav'

export function AppleTabBar() {
  const pathname = usePathname()
  const router = useRouter()
  const { t } = useTranslation()
  const { business } = useData()
  const [showAddMenu, setShowAddMenu] = useState(false)

  const businessName = business?.name || 'Hisaab'
  const avatarInitial = businessName.trim() ? businessName.trim().charAt(0).toUpperCase() : 'H'

  // Don't show bottom bar on add entry page to give full room to numpad & direct focus
  const isAddPage = pathname.startsWith('/add')

  const navItems = [
    { href: '/', label: t('nav.home') || 'Home', icon: Home, match: (p: string) => p === '/' },
    { href: '/entries', label: t('nav.entries') || 'Entries', icon: BookOpen, match: (p: string) => p.startsWith('/entries') },
    // Center add button is rendered separately
    { href: '/reports', label: t('nav.reports') || 'Reports', icon: BarChart3, match: (p: string) => p.startsWith('/reports') },
    {
      href: '/more',
      label: t('nav.profile') || 'Profile',
      match: (p: string) => p.startsWith('/more') || p.startsWith('/categories'),
      customIcon: (active: boolean) => (
        <div
          className={`relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#007AFF] text-[10px] font-bold leading-none text-white shadow-sm transition-all ${
            active ? 'ring-2 ring-[#007AFF] dark:ring-[#0A84FF]' : 'opacity-85'
          }`}
        >
          {avatarInitial || <User className="h-3 w-3 text-white" />}
          <span className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-[#34C759] ring-1 ring-white dark:ring-[#1C1C1E]" />
        </div>
      ),
    },
  ]

  const sidebarItems = [
    { href: '/', label: t('nav.home') || 'Home', icon: Home, match: (p: string) => p === '/' },
    { href: '/entries', label: t('nav.entries') || 'Entries', icon: BookOpen, match: (p: string) => p.startsWith('/entries') },
    { href: '/reports', label: t('nav.reports') || 'Reports', icon: BarChart3, match: (p: string) => p.startsWith('/reports') },
    { href: '/categories', label: t('nav.categories') || 'Categories', icon: Tags, match: (p: string) => p.startsWith('/categories') },
  ]

  return (
    <>
      {/* Desktop Sidebar (macOS style) */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-black/[0.06] bg-white/70 p-4 backdrop-blur-2xl dark:border-white/[0.08] dark:bg-[#1C1C1E]/80 md:flex">
        {/* Brand */}
        <div className="mb-6 flex items-center gap-3 px-2 pt-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#007AFF] text-xl font-extrabold text-white shadow-md">
            ₹
          </div>
          <div>
            <div className="apple-headline text-neutral-900 dark:text-white">Hisaab</div>
            <div className="text-xs font-medium text-neutral-500">Business Ledger</div>
          </div>
        </div>

        {/* Quick Add Buttons on Desktop */}
        <div className="mb-6 grid grid-cols-2 gap-2">
          <button
            onClick={() => router.push('/add/in')}
            className="apple-press flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[#34C759] text-sm font-bold text-white shadow-sm"
          >
            <ArrowDownLeft className="h-4 w-4 stroke-[2.5]" />
            <span>{t('act.in') || 'Money In'}</span>
          </button>
          <button
            onClick={() => router.push('/add/out')}
            className="apple-press flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[#FF3B30] text-sm font-bold text-white shadow-sm"
          >
            <ArrowUpRight className="h-4 w-4 stroke-[2.5]" />
            <span>{t('act.out') || 'Money Out'}</span>
          </button>
        </div>

        {/* Navigation Links */}
        <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
          <div className="px-2 text-[11px] font-semibold text-[#8E8E93] dark:text-[#A1A1A6]">
            Menu
          </div>
          {sidebarItems.map((item) => {
            const active = item.match(pathname)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`apple-press flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-[#007AFF] text-white shadow-sm'
                    : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-[#2C2C2E]'
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? 'text-white' : 'text-[#8E8E93] dark:text-[#A1A1A6]'}`} />
                <span>{item.label}</span>
              </Link>
            )
          })}

          <div className="mb-1 mt-5 flex items-center justify-between px-2 text-[11px] font-semibold text-[#8E8E93] dark:text-[#A1A1A6]">
            <span>{t('nav.categories') || 'Categories'}</span>
            <Link href="/categories" className="text-[#007AFF] dark:text-[#0A84FF]">Edit</Link>
          </div>
          <CategoryNav />
        </div>
      </aside>

      {/* Mobile Floating Island Tab Bar (iOS Style) */}
      {!isAddPage && (
        <nav
          aria-label="Mobile Navigation"
          className="fixed bottom-3 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-black/[0.08] bg-white/85 p-1.5 shadow-[0_12px_36px_rgba(0,0,0,0.15)] backdrop-blur-2xl transition-all dark:border-white/[0.12] dark:bg-[#1C1C1E]/90 md:hidden"
        >
          {/* Left 2 tabs */}
          {navItems.slice(0, 2).map((item) => {
            const active = item.match(pathname)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`apple-press flex flex-col items-center justify-center rounded-full px-4 py-1.5 transition-colors ${
                  active ? 'text-[#007AFF] dark:text-[#0A84FF]' : 'text-[#8E8E93] hover:text-black dark:text-[#A1A1A6] dark:hover:text-white'
                }`}
              >
                {item.customIcon ? (
                  item.customIcon(active)
                ) : Icon ? (
                  <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
                ) : null}
                <span className="text-[10px] font-semibold tracking-tight">{item.label}</span>
              </Link>
            )
          })}

          {/* Center Quick Add Floating Button */}
          <button
            onClick={() => setShowAddMenu(true)}
            type="button"
            aria-label="Add transaction"
            className="apple-press mx-1 flex h-11 w-11 items-center justify-center rounded-full bg-[#007AFF] text-white shadow-[0_4px_14px_rgba(0,122,255,0.4)]"
          >
            <Plus className="h-6 w-6 stroke-[2.5]" />
          </button>

          {/* Right 2 tabs */}
          {navItems.slice(2).map((item) => {
            const active = item.match(pathname)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`apple-press flex flex-col items-center justify-center rounded-full px-4 py-1.5 transition-colors ${
                  active ? 'text-[#007AFF] dark:text-[#0A84FF]' : 'text-[#8E8E93] hover:text-black dark:text-[#A1A1A6] dark:hover:text-white'
                }`}
              >
                {item.customIcon ? (
                  item.customIcon(active)
                ) : Icon ? (
                  <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
                ) : null}
                <span className="text-[10px] font-semibold tracking-tight">{item.label}</span>
              </Link>
            )
          })}
        </nav>
      )}

      {/* iOS Action Sheet for Quick Add */}
      {showAddMenu && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Quick Add Menu"
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50 backdrop-blur-sm transition-opacity"
          onClick={() => setShowAddMenu(false)}
        >
          <div
            className="apple-card mx-auto mb-6 w-[92%] max-w-sm rounded-[28px] p-4 shadow-2xl dark:bg-[#1C1C1E] border border-black/5 dark:border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Grab handle */}
            <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-neutral-300 dark:bg-neutral-600" />

            <div className="mb-4 text-center">
              <h3 className="apple-headline text-neutral-900 dark:text-white">
                New Transaction / नया हिसाब
              </h3>
              <p className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">Choose money direction</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setShowAddMenu(false)
                  router.push('/add/in')
                }}
                className="apple-press flex flex-col items-center justify-center gap-2 rounded-2xl bg-[#34C759] p-4 text-white shadow-lg shadow-[#34C759]/25 hover:bg-[#30B752]"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20">
                  <ArrowDownLeft className="h-6 w-6 stroke-[3]" />
                </div>
                <span className="text-base font-bold">{t('act.in') || 'Money In'}</span>
                <span className="text-[11px] opacity-90">बिक्री / आमदनी</span>
              </button>

              <button
                onClick={() => {
                  setShowAddMenu(false)
                  router.push('/add/out')
                }}
                className="apple-press flex flex-col items-center justify-center gap-2 rounded-2xl bg-[#FF3B30] p-4 text-white shadow-lg shadow-[#FF3B30]/25 hover:bg-[#E0352A]"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20">
                  <ArrowUpRight className="h-6 w-6 stroke-[3]" />
                </div>
                <span className="text-base font-bold">{t('act.out') || 'Money Out'}</span>
                <span className="text-[11px] opacity-90">खर्च / भुगतान</span>
              </button>
            </div>

            <button
              onClick={() => setShowAddMenu(false)}
              className="apple-press mt-4 flex h-11 w-full items-center justify-center rounded-xl bg-neutral-100 text-sm font-semibold text-neutral-800 dark:bg-[#2C2C2E] dark:text-neutral-200 dark:hover:bg-[#3A3A3C]"
            >
              <X className="mr-1.5 h-4 w-4" /> Cancel
            </button>
          </div>
        </div>
      )}
    </>
  )
}
