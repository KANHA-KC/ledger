'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { Check, RotateCcw } from 'lucide-react'
import { db } from './db/db'
import type { Account, Business, Category, LedgerLine, Party, Txn } from './db/types'
import { computeBalances, restoreVersion, hardDelete, type Balances } from './db/ledger'

interface Data {
  business: Business
  accounts: Account[]
  categories: Category[]
  deletedCategories: Category[]
  allCategories: Category[]
  parties: Party[]
  txns: Txn[] // includes deleted (bin); filter with !deletedAt
  live: Txn[]
  lines: LedgerLine[]
  balances: Balances
  maps: { cats: Map<string, Category>; accounts: Map<string, Account>; parties: Map<string, Party> }
  lang: 'hi' | 'en'
  /** Localised name of anything that carries name_en / name_hi. */
  nm: (o?: { name_en: string; name_hi: string } | null) => string
}

const DataCtx = createContext<Data | null>(null)

export function useData() {
  const d = useContext(DataCtx)
  if (!d) throw new Error('useData outside provider')
  return d
}

export function DataProvider({ business, children }: { business: Business; children: ReactNode }) {
  const { i18n } = useTranslation()
  const lang = (i18n.language === 'en' ? 'en' : 'hi') as 'hi' | 'en'
  const id = business.id
  const accountsRaw = useLiveQuery(() => db.accounts.where('businessId').equals(id).toArray(), [id])
  const categoriesRaw = useLiveQuery(() => db.categories.where('businessId').equals(id).sortBy('sort'), [id])
  const parties = useLiveQuery(() => db.parties.where('businessId').equals(id).toArray(), [id])
  const txns = useLiveQuery(() => db.txns.where('businessId').equals(id).toArray(), [id])
  const lines = useLiveQuery(() => db.lines.where('businessId').equals(id).toArray(), [id])

  const value = useMemo<Data | null>(() => {
    if (!accountsRaw || !categoriesRaw || !parties || !txns || !lines) return null
    const KIND = ['cash', 'upi', 'bank', 'receivable', 'payable', 'stock', 'asset', 'loan', 'income', 'expense', 'equity']
    const accounts = [...accountsRaw].sort((a, b) => KIND.indexOf(a.kind) - KIND.indexOf(b.kind))
    const sorted = [...txns].sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)))
    const activeCategories = categoriesRaw.filter((c) => !c.deletedAt)
    const deletedCategories = categoriesRaw.filter((c) => !!c.deletedAt)
    return {
      business,
      accounts,
      categories: activeCategories,
      deletedCategories,
      allCategories: categoriesRaw,
      parties,
      txns: sorted,
      live: sorted.filter((t) => !t.deletedAt),
      lines,
      balances: computeBalances(accounts, lines),
      maps: {
        cats: new Map(categoriesRaw.map((c) => [c.id, c])),
        accounts: new Map(accounts.map((a) => [a.id, a])),
        parties: new Map(parties.map((p) => [p.id, p])),
      },
      lang,
      nm: (o) => (o ? (lang === 'hi' ? o.name_hi : o.name_en) : ''),
    }
  }, [business, accountsRaw, categoriesRaw, parties, txns, lines, lang])

  if (!value) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F2F2F7] dark:bg-black">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#007AFF] border-t-transparent" />
          <span className="text-sm font-medium text-neutral-500">Loading Hisaab...</span>
        </div>
      </div>
    )
  }

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>
}

// ---------- Apple Dynamic Island Toast with 10-second undo ----------

export interface ToastState {
  id: number
  text: string
  undo?: () => Promise<void> | void
  tone?: 'ok' | 'info'
}

const ToastCtx = createContext<{
  (t: Omit<ToastState, 'id'>): void
  toast?: ToastState | null
  dismissToast?: () => void
}>((() => {}) as any)

export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [toast, setToast] = useState<ToastState | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const show = useCallback((x: Omit<ToastState, 'id'>) => {
    if (typeof window !== 'undefined') {
      window.clearTimeout(timer.current)
      setToast({ ...x, id: Date.now() })
      timer.current = window.setTimeout(() => setToast(null), x.undo ? 10_000 : 3000)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined') window.clearTimeout(timer.current)
    }
  }, [])

  return (
    <ToastCtx.Provider value={show as any}>
      {children}
      {toast && (
        <div
          className="pointer-events-none fixed top-4 inset-x-0 z-50 flex justify-center px-4 animate-in fade-in slide-in-from-top-4 duration-200"
          role="status"
          aria-live="polite"
        >
          <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-full border border-black/10 bg-neutral-900/90 px-4 py-2.5 text-white shadow-2xl backdrop-blur-2xl dark:border-white/20 dark:bg-neutral-800/90">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#34C759] text-white">
              <Check className="h-3.5 w-3.5 stroke-[3]" />
            </div>
            <span className="flex-1 truncate text-sm font-semibold tracking-tight">{toast.text}</span>
            {toast.undo && (
              <button
                type="button"
                className="apple-press relative flex shrink-0 items-center gap-1.5 overflow-hidden rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white hover:bg-white/30"
                onClick={async () => {
                  await toast.undo?.()
                  setToast(null)
                }}
              >
                <RotateCcw className="h-3 w-3" />
                <span>{t('act.undo') || 'Undo'}</span>
                <span
                  key={toast.id}
                  className="absolute bottom-0 left-0 h-0.5 bg-white/70"
                  style={{ animation: 'shrink 10s linear forwards' }}
                />
              </button>
            )}
          </div>
          <style>{`@keyframes shrink { from { width: 100% } to { width: 0% } }`}</style>
        </div>
      )}
    </ToastCtx.Provider>
  )
}

/** Undo helper after saveTxn: delete a new entry or restore the previous version. */
export function undoSave(id: string, prev: Txn | undefined) {
  return prev ? restoreVersion(prev) : hardDelete(id)
}
