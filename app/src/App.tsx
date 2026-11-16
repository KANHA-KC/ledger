import { useCallback, useEffect, useRef, useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { db, getSetting } from './db/db'
import type { Business } from './db/types'
import { purgeBin } from './db/ledger'
import { loadPersonalDict } from './lib/translit'
import { setNumerals } from './lib/format'
import { startSyncLoop } from './lib/sync'
import { DataProvider, ToastProvider } from './store'
import { Layout } from './components/Layout'
import { Onboarding } from './screens/Onboarding'
import { Lock } from './screens/Lock'
import { Home } from './screens/Home'
import { AddEntry } from './screens/AddEntry'
import { Entries } from './screens/Entries'
import { PartyDetail } from './screens/PartyDetail'
import { Reports } from './screens/Reports'
import { Categories } from './screens/Categories'
import { More } from './screens/More'
import { Bin } from './screens/Bin'

const RELOCK_AFTER_MS = 2 * 60 * 1000

export default function App() {
  const { i18n } = useTranslation()
  const [business, setBusiness] = useState<Business | null | undefined>(undefined)
  const [locked, setLocked] = useState(true)
  const [hc, setHc] = useState(false)
  const [renderKey, force] = useState(0)
  const hiddenAt = useRef<number | null>(null)

  useEffect(() => {
    ;(async () => {
      await loadPersonalDict()
      setNumerals(await getSetting('numerals', 'latn'))
      setHc(await getSetting('highContrast', false))
      const id = await getSetting<string>('activeBusiness', '')
      const b = id ? await db.businesses.get(id) : undefined
      setBusiness(b ?? null)
      purgeBin().catch(() => {})
      startSyncLoop()
    })()
  }, [])

  // PIN lock on app open and after being in the background for a while
  useEffect(() => {
    const h = () => {
      if (document.hidden) hiddenAt.current = Date.now()
      else if (hiddenAt.current && Date.now() - hiddenAt.current > RELOCK_AFTER_MS) setLocked(true)
    }
    document.addEventListener('visibilitychange', h)
    return () => document.removeEventListener('visibilitychange', h)
  }, [])

  const onSettings = useCallback((s: { numerals: 'latn' | 'deva'; highContrast: boolean }) => {
    setNumerals(s.numerals)
    setHc(s.highContrast)
    force((n) => n + 1)
  }, [])

  if (business === undefined) return null
  if (business === null) return <Onboarding onDone={(b) => { setBusiness(b); setLocked(false) }} />

  return (
    <div className={hc ? 'hc h-full' : 'h-full'} key={`${i18n.language}-${renderKey}`}>
      {locked && <Lock businessName={business.name} phone={business.ownerPhone} onUnlock={() => setLocked(false)} />}
      {!locked && (
        <BrowserRouter>
          <ToastProvider>
            <DataProvider business={business}>
              <Layout>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/add/:dir" element={<AddEntry />} />
                  <Route path="/entries" element={<Entries />} />
                  <Route path="/party/:id" element={<PartyDetail />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/categories" element={<Categories />} />
                  <Route path="/more" element={<More onLock={() => setLocked(true)} onSettings={onSettings} />} />
                  <Route path="/bin" element={<Bin />} />
                  <Route path="*" element={<Home />} />
                </Routes>
              </Layout>
            </DataProvider>
          </ToastProvider>
        </BrowserRouter>
      )}
    </div>
  )
}
