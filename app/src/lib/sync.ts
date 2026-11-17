// Offline-first cloud sync with Supabase.
//
// Every local write lands in IndexedDB first and records "(table, id) is dirty" in the outbox.
// When online and signed in:
//   1. ensureCloudOrg: a shop created offline/before sign-in is registered on the server
//      with the SAME id the device uses (create_org is idempotent).
//   2. push: for each dirty (table, id) we send the row's CURRENT local state (or a tombstone
//      if it was hard-deleted). Server applies last-write-wins on updated_at.
//   3. pull: rows changed on the server since our cursor are merged in — unless we have a newer
//      local edit or an unsent change for that row.
// Status (signed in? last success? last error?) is stored in the `syncState` setting for the UI.

import { db, getSetting, setSetting } from '../db/db'
import type { Account, Business, Category, OutboxItem, OutboxTable, Party, Txn } from '../db/types'
import { buildLines, systemAccounts } from '../db/ledger'
import {
  createOrgCloud,
  isCloudEnabled,
  supabase,
  syncPullCloud,
  syncPushCloud,
  type CloudBusinessRow,
  type CloudSyncPullResult,
} from './supabase'

export const syncEnabled = isCloudEnabled()

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Demo / sample shops use non-UUID ids and must never be uploaded. */
export const isSyncableBusiness = (id: string) => UUID_RE.test(id)

// Re-fetch a small window behind the cursor so rows committed concurrently are never missed.
const PULL_OVERLAP = 200

export interface SyncState {
  signedIn: boolean
  lastOkAt: string | null
  lastError: string | null
  pending: number
}

let syncInProgress = false
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let loopStarted = false

async function setState(patch: Partial<SyncState>) {
  const prev = await getSetting<SyncState>('syncState', { signedIn: false, lastOkAt: null, lastError: null, pending: 0 })
  const pending = await db.outbox.count()
  await setSetting('syncState', { ...prev, ...patch, pending })
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('hisaab_sync_state'))
}

export async function getSyncState(): Promise<SyncState> {
  const s = await getSetting<SyncState>('syncState', { signedIn: false, lastOkAt: null, lastError: null, pending: 0 })
  return { ...s, pending: await db.outbox.count() }
}

async function hasSession(): Promise<boolean> {
  if (!supabase) return false
  const { data } = await supabase.auth.getSession()
  return !!data.session
}

// ---------------------------------------------------------------------------
// Marking rows dirty (call after any local write)
// ---------------------------------------------------------------------------

/** Record that a row changed locally so the next sync uploads its current state. */
export async function markDirty(table: OutboxTable, businessId: string, id: string, tombstone = false) {
  if (!isSyncableBusiness(businessId)) return
  try {
    // stamp the edit time so last-write-wins treats this as the newest version
    if (!tombstone && table !== 'txns') {
      const tbl = table === 'businesses' ? db.businesses : db[table]
      await (tbl as typeof db.accounts).update(id, { updatedAt: new Date().toISOString() })
    }
    await db.outbox.put({
      // one outbox row per (table, id): repeated edits collapse into one upload
      id: `${table}:${id}`,
      table,
      action: tombstone ? 'delete' : 'upsert',
      businessId,
      payload: { id, deleted_at: tombstone ? new Date().toISOString() : null },
      createdAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[Sync] markDirty failed:', err)
  }
  triggerSync(businessId)
}

/** Queue every row of a shop (first upload after creating the cloud org or signing in). */
export async function markAllDirty(businessId: string) {
  if (!isSyncableBusiness(businessId)) return
  const now = new Date().toISOString()
  const items: OutboxItem[] = []
  const add = (table: OutboxTable, id: string) =>
    items.push({ id: `${table}:${id}`, table, action: 'upsert', businessId, payload: { id }, createdAt: now })
  for (const a of await db.accounts.where('businessId').equals(businessId).toArray()) add('accounts', a.id)
  for (const c of await db.categories.where('businessId').equals(businessId).toArray()) add('categories', c.id)
  for (const p of await db.parties.where('businessId').equals(businessId).toArray()) add('parties', p.id)
  for (const t of await db.txns.where('businessId').equals(businessId).toArray()) add('txns', t.id)
  add('businesses', businessId)
  await db.outbox.bulkPut(items)
}

// ---------------------------------------------------------------------------
// Local → server row mapping
// ---------------------------------------------------------------------------

const iso = (s?: string | null) => s ?? null

function accountToServer(a: Account) {
  return {
    id: a.id, kind: a.kind, name_en: a.name_en, name_hi: a.name_hi, icon: a.icon,
    opening: a.opening ?? 0, system: !!a.system, hidden: !!a.hidden,
    deleted_at: iso(a.deletedAt), updated_at: a.updatedAt ?? new Date(0).toISOString(),
  }
}
function categoryToServer(c: Category) {
  return {
    id: c.id, direction: c.direction, name_en: c.name_en, name_hi: c.name_hi, icon: c.icon, color: c.color,
    parent_id: c.parentId ?? null, is_default: !!c.isDefault, sort: c.sort ?? 0, hidden: !!c.hidden,
    special: c.special ?? null, key: c.key ?? null,
    deleted_at: iso(c.deletedAt), updated_at: c.updatedAt ?? new Date(0).toISOString(),
  }
}
function partyToServer(p: Party) {
  return {
    id: p.id, name: p.name, name_alt: p.nameAlt ?? '', phone: p.phone ?? '', type: p.type || 'customer',
    created_at: p.createdAt, deleted_at: iso(p.deletedAt), updated_at: p.updatedAt ?? p.createdAt,
  }
}
function txnToServer(t: Txn) {
  return {
    id: t.id, date: t.date, amount: t.amount, direction: t.direction,
    category_id: t.categoryId ?? null, account_id: t.accountId ?? null, to_account_id: t.toAccountId ?? null,
    party_id: t.partyId ?? null, on_credit: !!t.onCredit, note: t.note ?? '', tags: t.tags ?? [],
    photo_id: t.photoId && UUID_RE.test(t.photoId) ? t.photoId : null, created_by: t.createdBy ?? '',
    created_at: t.createdAt, deleted_at: iso(t.deletedAt), updated_at: t.updatedAt,
  }
}
function businessToServer(b: Business) {
  return {
    name: b.name, type: b.type, language: b.language, fy_start_month: b.fyStartMonth,
    owner_phone: b.ownerPhone ?? '', updated_at: b.updatedAt ?? new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// 1. Make sure the shop exists on the server
// ---------------------------------------------------------------------------

export async function ensureCloudOrg(b: Business): Promise<Business> {
  if (b.orgId || !isSyncableBusiness(b.id)) return b
  const res = await createOrgCloud({
    orgName: b.name, bizName: b.name, bizType: b.type, language: b.language,
    businessId: b.id, ownerPhone: b.ownerPhone,
  })
  if (!res) return b
  await db.businesses.update(b.id, { orgId: res.org_id })
  await markAllDirty(b.id) // first upload of everything created before sign-in
  return { ...b, orgId: res.org_id }
}

// ---------------------------------------------------------------------------
// 2. Push
// ---------------------------------------------------------------------------

async function pushBusiness(businessId: string): Promise<number> {
  const items = await db.outbox.where('businessId').equals(businessId).toArray()
  // Older builds left txns marked pending without an outbox row — include them too.
  const pendingTxns = await db.txns.where('businessId').equals(businessId).filter((t) => t.syncStatus === 'pending').toArray()
  const txnIds = new Set(items.filter((i) => i.table === 'txns').map((i) => i.payload?.id))
  for (const t of pendingTxns) {
    if (!txnIds.has(t.id)) {
      items.push({ id: `txns:${t.id}`, table: 'txns', action: 'upsert', businessId, payload: { id: t.id }, createdAt: '' })
      txnIds.add(t.id)
    }
  }
  if (!items.length) return 0

  const changes: Record<string, unknown> = { accounts: [], categories: [], parties: [], txns: [] }
  const sentVersions = new Map<string, string | undefined>() // outbox id → updatedAt we sent
  const tombstone = (id: string, item: OutboxItem) => ({ id, deleted_at: item.payload?.deleted_at ?? new Date().toISOString() })

  for (const item of items) {
    const id: string = item.payload?.id
    if (!id) continue
    if (item.table === 'businesses') {
      const b = await db.businesses.get(id)
      if (b) { changes.business = businessToServer(b); sentVersions.set(item.id, b.updatedAt) }
      continue
    }
    const list = changes[item.table] as unknown[]
    if (item.table === 'accounts') {
      const a = await db.accounts.get(id)
      list.push(a ? accountToServer(a) : tombstone(id, item)); sentVersions.set(item.id, a?.updatedAt)
    } else if (item.table === 'categories') {
      const c = await db.categories.get(id)
      list.push(c ? categoryToServer(c) : tombstone(id, item)); sentVersions.set(item.id, c?.updatedAt)
    } else if (item.table === 'parties') {
      const p = await db.parties.get(id)
      list.push(p ? partyToServer(p) : tombstone(id, item)); sentVersions.set(item.id, p?.updatedAt)
    } else if (item.table === 'txns') {
      const t = await db.txns.get(id)
      list.push(t ? txnToServer(t) : tombstone(id, item)); sentVersions.set(item.id, t?.updatedAt)
    }
  }

  await syncPushCloud(businessId, changes as Record<string, unknown[]>)

  // Clear only what didn't change again while we were uploading.
  await db.transaction('rw', [db.outbox, db.txns, db.accounts, db.categories, db.parties, db.businesses], async () => {
    for (const item of items) {
      const id: string = item.payload?.id
      const table = item.table === 'businesses' ? db.businesses : db[item.table]
      const row = (await (table as typeof db.txns).get(id)) as { updatedAt?: string } | undefined
      if ((row?.updatedAt ?? undefined) !== sentVersions.get(item.id)) continue
      await db.outbox.delete(item.id)
      if (item.table === 'txns' && row) await db.txns.update(id, { syncStatus: 'synced' })
    }
  })
  return items.length
}

// ---------------------------------------------------------------------------
// 3. Pull
// ---------------------------------------------------------------------------

/** Should a server row replace the local one? */
async function serverWins(table: OutboxTable, id: string, local: { updatedAt?: string } | undefined, remoteUpdatedAt: string) {
  if (!local) return true
  if (await db.outbox.get(`${table}:${id}`)) return false // unsent local change: it will win on push
  if (local.updatedAt && Date.parse(local.updatedAt) > Date.parse(remoteUpdatedAt)) return false
  return true
}

export async function pullUpdates(businessId: string): Promise<number> {
  const cursorKey = `sync_cursor_${businessId}`
  const cursor = await getSetting<number>(cursorKey, 0)
  const since = Math.max(0, cursor - PULL_OVERLAP)
  const result: CloudSyncPullResult | null = await syncPullCloud(businessId, since)
  if (!result) return 0
  let applied = 0

  if (result.business) {
    const b = result.business
    const local = await db.businesses.get(businessId)
    if (local && !(await db.outbox.get(`businesses:${businessId}`))) {
      await db.businesses.update(businessId, {
        name: b.name, orgId: b.org_id, language: b.language ?? local.language, fyStartMonth: b.fy_start_month ?? local.fyStartMonth,
      })
    }
  }

  for (const a of result.accounts ?? []) {
    const local = await db.accounts.get(a.id)
    if (!(await serverWins('accounts', a.id, local, a.updated_at))) continue
    await db.accounts.put({
      id: a.id, businessId: a.business_id, orgId: a.org_id, kind: a.kind, name_en: a.name_en, name_hi: a.name_hi,
      icon: a.icon, opening: Number(a.opening ?? 0), hidden: !!a.hidden,
      system: a.system ?? ['receivable', 'payable', 'income', 'expense', 'equity'].includes(a.kind),
      deletedAt: a.deleted_at, serverVersion: a.server_version, updatedAt: a.updated_at,
    })
    applied++
  }

  for (const c of result.categories ?? []) {
    const local = await db.categories.get(c.id)
    if (!(await serverWins('categories', c.id, local, c.updated_at))) continue
    await db.categories.put({
      id: c.id, businessId: c.business_id, orgId: c.org_id, parentId: c.parent_id, direction: c.direction,
      key: c.key ?? undefined, name_en: c.name_en, name_hi: c.name_hi, icon: c.icon, color: c.color,
      isDefault: !!c.is_default, hidden: !!c.hidden, special: c.special ?? undefined, sort: c.sort ?? 0,
      deletedAt: c.deleted_at, serverVersion: c.server_version, updatedAt: c.updated_at,
    })
    applied++
  }

  for (const p of result.parties ?? []) {
    const local = await db.parties.get(p.id)
    if (!(await serverWins('parties', p.id, local, p.updated_at))) continue
    await db.parties.put({
      id: p.id, businessId: p.business_id, orgId: p.org_id, name: p.name, nameAlt: p.name_alt || '',
      phone: p.phone ?? '', type: p.type || 'customer', createdAt: p.created_at,
      deletedAt: p.deleted_at, serverVersion: p.server_version, updatedAt: p.updated_at,
    })
    applied++
  }

  const txns = result.txns ?? []
  if (txns.length) {
    let sys: Awaited<ReturnType<typeof systemAccounts>> | null = null
    try { sys = await systemAccounts(businessId) } catch { sys = null }
    for (const t of txns) {
      const local = await db.txns.get(t.id)
      if (!(await serverWins('txns', t.id, local, t.updated_at))) continue
      const next: Txn = {
        id: t.id, businessId: t.business_id, orgId: t.org_id, date: t.date, amount: Number(t.amount),
        direction: t.direction, categoryId: t.category_id, accountId: t.account_id, toAccountId: t.to_account_id,
        partyId: t.party_id, onCredit: !!t.on_credit, note: t.note || '', tags: t.tags || [],
        photoId: local?.photoId ?? t.photo_id, createdBy: t.created_by || '', createdAt: t.created_at,
        updatedAt: t.updated_at, deletedAt: t.deleted_at, syncStatus: 'synced', serverVersion: t.server_version,
        history: local?.history ?? [],
      }
      const cat = next.categoryId ? await db.categories.get(next.categoryId) : undefined
      await db.transaction('rw', db.txns, db.lines, async () => {
        await db.txns.put(next)
        await db.lines.where('txnId').equals(next.id).delete()
        if (!next.deletedAt && sys) await db.lines.bulkAdd(buildLines(next, cat, sys))
      })
      applied++
    }
  }

  if (result.server_version && Number(result.server_version) > cursor) {
    await setSetting(cursorKey, Number(result.server_version))
  }
  return applied
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/** Push then pull for every syncable shop on this device. */
export async function fullSync(onlyBusinessId?: string): Promise<void> {
  if (!isCloudEnabled() || typeof navigator === 'undefined' || !navigator.onLine) return
  if (syncInProgress) return
  syncInProgress = true
  try {
    if (!(await hasSession())) {
      await setState({ signedIn: false })
      return
    }
    const bizs = (await db.businesses.toArray()).filter(
      (b) => isSyncableBusiness(b.id) && (!onlyBusinessId || b.id === onlyBusinessId),
    )
    for (let b of bizs) {
      b = await ensureCloudOrg(b)
      if (!b.orgId) continue
      await pushBusiness(b.id)
      await pullUpdates(b.id)
    }
    await setState({ signedIn: true, lastOkAt: new Date().toISOString(), lastError: null })
  } catch (err) {
    const msg = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : String(err)
    console.warn('[Sync] failed:', msg)
    await setState({ lastError: msg })
  } finally {
    syncInProgress = false
  }
}

/** Debounced sync after a local save/edit/delete. */
export function triggerSync(businessId?: string) {
  if (!isCloudEnabled()) return
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => { fullSync(businessId).catch(() => {}) }, 1200)
}

/** Background loop: on start, when back online, when the app comes to the foreground, every 30s. */
export function startSyncLoop() {
  if (!isCloudEnabled() || loopStarted || typeof window === 'undefined') return
  loopStarted = true
  const run = () => { fullSync().catch(() => {}) }
  window.addEventListener('online', run)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') run() })
  supabase?.auth.onAuthStateChange((event) => { if (event === 'SIGNED_IN') run() })
  setInterval(run, 30_000)
  setTimeout(run, 1500)
}

/**
 * New device / reinstall: create the local copy of a shop that already exists on the server
 * and download everything in it.
 */
export async function restoreFromCloud(row: CloudBusinessRow): Promise<Business> {
  let b = await db.businesses.get(row.business_id)
  if (!b) {
    const now = new Date().toISOString()
    b = {
      id: row.business_id,
      orgId: row.org_id,
      name: row.name,
      type: (row.type as Business['type']) || 'other',
      ownerPhone: row.owner_phone ?? '',
      language: row.language === 'en' ? 'en' : 'hi',
      plan: 'free',
      trialEndsAt: now.slice(0, 10),
      fyStartMonth: row.fy_start_month ?? 4,
      createdAt: row.created_at ?? now,
      updatedAt: row.created_at ?? now,
    }
    await db.businesses.put(b)
  } else if (!b.orgId) {
    await db.businesses.update(b.id, { orgId: row.org_id })
    b = { ...b, orgId: row.org_id }
  }
  await setSetting(`sync_cursor_${b.id}`, 0)
  await pullUpdates(b.id)
  await setState({ signedIn: true, lastOkAt: new Date().toISOString(), lastError: null })
  return (await db.businesses.get(b.id)) ?? b
}

/** Kept for older callers. */
export const pushPending = async (businessId?: string) => { await fullSync(businessId); return 0 }
