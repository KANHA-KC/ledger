// Double-entry layer. The user only ever sees "Paisa Aaya / Paisa Gaya"; every entry is
// also written as balanced ledger lines so balances, udhaar and net worth come from one place.

import { db, queueOutbox, uuid } from './db'
import type { Account, AccountKind, Category, LedgerLine, Txn, TxnSnapshot } from './types'
import { addDaysISO, todayISO } from '../lib/format'
import { triggerSync } from '../lib/sync'

type SysAccounts = Record<'receivable' | 'payable' | 'income' | 'expense' | 'equity', string>

export async function systemAccounts(businessId: string): Promise<SysAccounts> {
  const all = await db.accounts.where('businessId').equals(businessId).toArray()
  const find = (k: AccountKind) => all.find((a) => a.kind === k)!.id
  return {
    receivable: find('receivable'),
    payable: find('payable'),
    income: find('income'),
    expense: find('expense'),
    equity: find('equity'),
  }
}

export function buildLines(t: Txn, cat: Category | undefined, sys: SysAccounts): LedgerLine[] {
  const line = (accountId: string, debit: number, credit: number, partyId: string | null = null): LedgerLine => ({
    id: uuid(), businessId: t.businessId, txnId: t.id, date: t.date, accountId, partyId, debit, credit,
  })
  const a = t.amount
  if (t.direction === 'transfer') {
    return [line(t.toAccountId!, a, 0), line(t.accountId!, 0, a)]
  }
  const special = cat?.special
  const party = t.partyId
  if (t.direction === 'in') {
    if (t.onCredit) return [line(sys.receivable, a, 0, party), line(sys.income, 0, a)] // sold on udhaar
    const w = t.accountId!
    if (special === 'udhaar_mila') return [line(w, a, 0), line(sys.receivable, 0, a, party)]
    if (special === 'udhaar_liya') return [line(w, a, 0), line(sys.payable, 0, a, party)]
    if (cat?.key === 'malik') return [line(w, a, 0), line(sys.equity, 0, a)]
    return [line(w, a, 0), line(sys.income, 0, a)]
  }
  if (t.onCredit) return [line(sys.expense, a, 0), line(sys.payable, 0, a, party)] // bought on udhaar
  const w = t.accountId!
  if (special === 'udhaar_diya') return [line(sys.receivable, a, 0, party), line(w, 0, a)]
  if (special === 'udhaar_chukaya') return [line(sys.payable, a, 0, party), line(w, 0, a)]
  if (cat?.key === 'ghar') return [line(sys.equity, a, 0), line(w, 0, a)] // owner drawings
  return [line(sys.expense, a, 0), line(w, 0, a)]
}

const snapshot = (t: Txn): TxnSnapshot => ({
  at: t.updatedAt, date: t.date, amount: t.amount, direction: t.direction as 'in' | 'out',
  categoryId: t.categoryId ?? '', accountId: t.accountId, partyId: t.partyId, note: t.note, onCredit: t.onCredit,
})

/** Insert or update a transaction and regenerate its ledger lines atomically. Returns previous version (for undo). */
export async function saveTxn(t: Txn): Promise<Txn | undefined> {
  const sys = await systemAccounts(t.businessId)
  const cat = t.categoryId ? await db.categories.get(t.categoryId) : undefined
  let prev: Txn | undefined
  await db.transaction('rw', db.txns, db.lines, async () => {
    prev = await db.txns.get(t.id)
    const now = new Date().toISOString()
    const next: Txn = {
      ...t,
      updatedAt: now,
      syncStatus: 'pending',
      createdOfflineAt: prev ? prev.createdOfflineAt : navigator.onLine ? null : now,
      history: prev ? [...prev.history, snapshot(prev)] : [],
    }
    await db.txns.put(next)
    await db.lines.where('txnId').equals(t.id).delete()
    if (!next.deletedAt) await db.lines.bulkAdd(buildLines(next, cat, sys))
    await queueOutbox('txns', 'upsert', next.businessId, next)
  })
  triggerSync(t.businessId)
  return prev
}

/** Restore an exact previous version (used by Undo after an edit). */
export async function restoreVersion(prev: Txn) {
  const sys = await systemAccounts(prev.businessId)
  const cat = prev.categoryId ? await db.categories.get(prev.categoryId) : undefined
  await db.transaction('rw', db.txns, db.lines, db.outbox, async () => {
    await db.txns.put({ ...prev, syncStatus: 'pending' })
    await db.lines.where('txnId').equals(prev.id).delete()
    if (!prev.deletedAt) await db.lines.bulkAdd(buildLines(prev, cat, sys))
    await queueOutbox('txns', 'upsert', prev.businessId, prev)
  })
  triggerSync(prev.businessId)
}

/** Hard delete — only used by Undo of a brand-new entry and by the 30-day bin purge. */
export async function hardDelete(id: string) {
  let bizId: string | undefined
  await db.transaction('rw', db.txns, db.lines, db.photos, db.outbox, async () => {
    const t = await db.txns.get(id)
    if (t) {
      bizId = t.businessId
      if (t.photoId) await db.photos.delete(t.photoId)
      await db.txns.delete(id)
      await db.lines.where('txnId').equals(id).delete()
      await queueOutbox('txns', 'delete', t.businessId, { id, deleted_at: new Date().toISOString() })
    }
  })
  if (bizId) triggerSync(bizId)
}

/** Soft delete → goes to the bin for 30 days. */
export async function softDelete(id: string) {
  const t = await db.txns.get(id)
  if (!t) return
  await saveTxn({ ...t, deletedAt: new Date().toISOString() })
}

export async function undelete(id: string) {
  const t = await db.txns.get(id)
  if (!t) return
  await saveTxn({ ...t, deletedAt: null })
}

/** Soft delete a category → goes to the bin for 30 days. */
export async function softDeleteCategory(id: string) {
  const c = await db.categories.get(id)
  if (!c) return
  const now = new Date().toISOString()
  await db.categories.update(id, { deletedAt: now, updatedAt: now })
  await queueOutbox('categories', 'upsert', c.businessId, { ...c, deletedAt: now, updatedAt: now })
  triggerSync(c.businessId)
}

/** Restore a category from the bin. */
export async function undeleteCategory(id: string) {
  const c = await db.categories.get(id)
  if (!c) return
  const now = new Date().toISOString()
  await db.categories.update(id, { deletedAt: null, updatedAt: now })
  await queueOutbox('categories', 'upsert', c.businessId, { ...c, deletedAt: null, updatedAt: now })
  triggerSync(c.businessId)
}

/** Hard delete a category permanently. */
export async function hardDeleteCategory(id: string) {
  const c = await db.categories.get(id)
  if (!c) return
  await db.categories.delete(id)
  await queueOutbox('categories', 'delete', c.businessId, { id, deleted_at: new Date().toISOString() })
  triggerSync(c.businessId)
}

export async function purgeBin() {
  const cutoff = addDaysISO(todayISO(), -30)
  const oldTxns = await db.txns.filter((t) => !!t.deletedAt && t.deletedAt.slice(0, 10) < cutoff).toArray()
  for (const t of oldTxns) await hardDelete(t.id)
  const oldCats = await db.categories.filter((c) => !!c.deletedAt && c.deletedAt.slice(0, 10) < cutoff).toArray()
  for (const c of oldCats) await hardDeleteCategory(c.id)
}

// ---------- balances ----------

const WALLET_ORDER: AccountKind[] = ['cash', 'upi', 'bank']

export interface Balances {
  wallets: { account: Account; balance: number }[]
  receivable: number
  payable: number
  byParty: Map<string, number> // + means they owe me, − means I owe them
  stock: number
  assets: number
  loans: number
  netWorth: number
}

/** Balances as of a date (inclusive). Wallet = opening + debits − credits. */
export function computeBalances(accounts: Account[], lines: LedgerLine[], asOf?: string): Balances {
  const ls = asOf ? lines.filter((l) => l.date <= asOf) : lines
  const sum = new Map<string, number>()
  const byParty = new Map<string, number>()
  const kind = new Map(accounts.map((a) => [a.id, a.kind]))
  for (const l of ls) {
    sum.set(l.accountId, (sum.get(l.accountId) ?? 0) + l.debit - l.credit)
    const k = kind.get(l.accountId)
    if (l.partyId && (k === 'receivable' || k === 'payable')) {
      byParty.set(l.partyId, (byParty.get(l.partyId) ?? 0) + l.debit - l.credit)
    }
  }
  const wallets = accounts
    .filter((a) => ['cash', 'bank', 'upi'].includes(a.kind) && !a.hidden)
    .sort((a, b) => WALLET_ORDER.indexOf(a.kind) - WALLET_ORDER.indexOf(b.kind))
    .map((account) => ({ account, balance: account.opening + (sum.get(account.id) ?? 0) }))
  // Udhaar is netted per party: if I both lent to and borrowed from the same person, only the net shows.
  let receivable = 0
  let payable = 0
  for (const v of byParty.values()) {
    if (v > 0) receivable += v
    else payable += -v
  }
  const manual = (k: AccountKind) => accounts.filter((a) => a.kind === k).reduce((s, a) => s + a.opening, 0)
  const stock = manual('stock')
  const assets = manual('asset')
  const loans = manual('loan')
  const cash = wallets.reduce((s, w) => s + w.balance, 0)
  return {
    wallets, receivable, payable, byParty, stock, assets, loans,
    netWorth: cash + receivable + stock + assets - payable - loans,
  }
}

/** Entries that count on the dashboard as money in / out: real wallet movement, not transfers. */
export const isCashIn = (t: Txn) => t.direction === 'in' && !t.onCredit && !t.deletedAt
export const isCashOut = (t: Txn) => t.direction === 'out' && !t.onCredit && !t.deletedAt
