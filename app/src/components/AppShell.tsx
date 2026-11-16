'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { db, getSetting } from '../db/db'
import type { Business } from '../db/types'
import { purgeBin } from '../db/ledger'
import { loadPersonalDict } from '../lib/translit'
import { setNumerals } from '../lib/format'
import { startSyncLoop } from '../lib/sync'
import { checkAndRunScheduledBackup } from '../lib/backup'
import { ensureDemoCategories, DEMO_BUSINESS_ID, DEMO_BUSINESS_NAME } from '../lib/demo'
import { seedDummyEntriesForAllCategories, removeAllUdhaarTransactions } from '../lib/dummyData'
import { DataProvider, ToastProvider } from '../store'
import { Layout } from './Layout'
import { Onboarding } from '../screens/Onboarding'
import { Lock } from '../screens/Lock'
import '../i18n'

const RELOCK_AFTER_MS = 2 * 60 * 1000

export function AppShell({ children }: { children: React.ReactNode }) {
  const { i18n } = useTranslation()
  const [business, setBusiness] = useState<Business | null | undefined>(undefined)
  const [locked, setLocked] = useState(true)
  const [hc, setHc] = useState(false)
  const [renderKey, force] = useState(0)
  const hiddenAt = useRef<number | null>(null)

  useEffect(() => {
    // Theme synchronization: default to Apple Light Mode unless explicitly set to 'dark'
    const syncTheme = () => {
      try {
        const stored = localStorage.getItem('theme')
        // Default to clean Apple Light Mode
        if (stored === 'dark') {
          document.documentElement.classList.add('dark')
        } else {
          document.documentElement.classList.remove('dark')
        }
      } catch {
        /* ignore */
      }
    }
    syncTheme()

    ;(async () => {
      await loadPersonalDict()
      setNumerals(await getSetting('numerals', 'latn'))
      setHc(await getSetting('highContrast', false))
      const id = await getSetting<string>('activeBusiness', '')
      let b = id ? await db.businesses.get(id) : undefined
      if (b) {
        if (b.name.includes('Sharma Enterprises') || b.id === DEMO_BUSINESS_ID) {
          if (b.name !== DEMO_BUSINESS_NAME) {
            await db.businesses.update(b.id, { name: DEMO_BUSINESS_NAME })
            b = { ...b, name: DEMO_BUSINESS_NAME }
          }
        }
        if (typeof window !== 'undefined') {
          const currentOwner = localStorage.getItem('hisaab_user_name')
          if (!currentOwner || currentOwner === 'Ramesh Sharma') {
            localStorage.setItem('hisaab_user_name', 'Dilip Chandravanshi')
          }
        }
        if (b.id === DEMO_BUSINESS_ID) {
          await ensureDemoCategories(b.id)
        }
        seedDummyEntriesForAllCategories(b.id, 4).catch((err) =>
          console.error('seedDummyEntriesForAllCategories error:', err)
        )
      }
      setBusiness(b ?? null)
      purgeBin().catch(() => {})
      startSyncLoop()
      checkAndRunScheduledBackup().catch((err) => console.error('Scheduled backup error:', err))
    })()
  }, [])

  // Passcode lock on app open and after 2 min in background
  useEffect(() => {
    const h = () => {
      if (document.hidden) {
        hiddenAt.current = Date.now()
      } else if (hiddenAt.current && Date.now() - hiddenAt.current > RELOCK_AFTER_MS) {
        setLocked(true)
      }
    }
    document.addEventListener('visibilitychange', h)
    return () => document.removeEventListener('visibilitychange', h)
  }, [])

  const onSettings = useCallback((s: { numerals: 'latn' | 'deva'; highContrast: boolean }) => {
    setNumerals(s.numerals)
    setHc(s.highContrast)
    force((n) => n + 1)
  }, [])

  if (business === undefined) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F2F2F7] dark:bg-black">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#34C759] to-[#007AFF] text-2xl font-bold text-white shadow-md">
            ₹
          </div>
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#007AFF] border-t-transparent" />
        </div>
      </div>
    )
  }

  if (business === null) {
    return (
      <Onboarding
        onDone={(b) => {
          setBusiness(b)
          setLocked(false)
        }}
      />
    )
  }

  return (
    <div className={hc ? 'hc h-full' : 'h-full'} key={`${i18n.language}-${renderKey}`}>
      {locked && (
        <Lock
          businessName={business.name}
          phone={business.ownerPhone}
          onUnlock={() => setLocked(false)}
        />
      )}
      {!locked && (
        <ToastProvider>
          <DataProvider business={business}>
            <Layout>{children}</Layout>
          </DataProvider>
        </ToastProvider>
      )}
    </div>
  )
}
