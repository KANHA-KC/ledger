import { db, getSetting, setSetting } from '../db/db'
import type { Account, Category, Party, Txn } from '../db/types'
import { isCloudEnabled, syncPullCloud, syncPushCloud } from './supabase'
import { systemAccounts, buildLines } from '../db/ledger'

export const syncEnabled = isCloudEnabled()

let syncInProgress = false
let debounceTimer: ReturnType<typeof setTimeout> | null = null

/** Push all pending outbox entries and pending txns to Supabase */
export async function pushPending(targetBusinessId?: string): Promise<number> {
  if (!isCloudEnabled() || !navigator.onLine) return 0
  if (syncInProgress) return 0

  syncInProgress = true
  try {
    const outboxItems = await db.outbox.toArray()

    // If outbox is empty, check for any un-synced legacy txns
    if (!outboxItems.length) {
      const pendingTxns = await db.txns.where('syncStatus').equals('pending').toArray()
      if (!pendingTxns.length) return 0

      // Group txns by businessId
      const byBiz: Record<string, Txn[]> = {}
      for (const t of pendingTxns) {
        if (!byBiz[t.businessId]) byBiz[t.businessId] = []
        byBiz[t.businessId].push(t)
      }

      for (const [bizId, txns] of Object.entries(byBiz)) {
        if (targetBusinessId && bizId !== targetBusinessId) continue
        const cleanTxns = txns.map((t) => ({ ...t, photoId: undefined }))
        const newVer = await syncPushCloud(bizId, { txns: cleanTxns })
        if (newVer !== null) {
          await db.txns.bulkUpdate(
            txns.map((t) => ({ key: t.id, changes: { syncStatus: 'synced' as const } }))
          )
        }
      }
      return pendingTxns.length
    }

    // Group outbox items by businessId
    const bizGroups: Record<string, typeof outboxItems> = {}
    for (const item of outboxItems) {
      if (!bizGroups[item.businessId]) bizGroups[item.businessId] = []
      bizGroups[item.businessId].push(item)
    }

    let pushedCount = 0

    for (const [bizId, items] of Object.entries(bizGroups)) {
      if (targetBusinessId && bizId !== targetBusinessId) continue

      const changes: Record<string, any[]> = {
        accounts: [],
        categories: [],
        parties: [],
        txns: [],
      }

      for (const item of items) {
        if (item.table in changes) {
          const payload = { ...item.payload }
          if (item.action === 'delete') {
            payload.deleted_at = new Date().toISOString()
          }
          changes[item.table].push(payload)
        }
      }

      const hasChanges = Object.values(changes).some((arr) => arr.length > 0)
      if (!hasChanges) continue

      const newVer = await syncPushCloud(bizId, changes)
      if (newVer !== null) {
        const itemIds = items.map((i) => i.id)
        await db.outbox.bulkDelete(itemIds)

        // Mark associated txns as synced
        const txnIds = items.filter((i) => i.table === 'txns').map((i) => i.payload.id)
        if (txnIds.length) {
          await db.txns.bulkUpdate(
            txnIds.map((id) => ({ key: id, changes: { syncStatus: 'synced' as const } }))
          )
        }
        pushedCount += items.length
      }
    }

    return pushedCount
  } catch (err) {
    console.warn('[Sync] Push failed:', err)
    return 0
  } finally {
    syncInProgress = false
  }
}

/** Pull changes from Supabase since local cursor and apply to Dexie */
export async function pullUpdates(businessId: string): Promise<number> {
  if (!isCloudEnabled() || !navigator.onLine) return 0

  try {
    const cursorKey = `sync_cursor_${businessId}`
    const since = await getSetting<number>(cursorKey, 0)
    const result = await syncPullCloud(businessId, since)
    if (!result) return 0

    const { accounts, categories, parties, txns, server_version } = result
    let appliedCount = 0

    // 1. Accounts
    if (accounts && accounts.length) {
      for (const a of accounts) {
        const localAcc: Account = {
          id: a.id,
          businessId: a.business_id,
          orgId: a.org_id,
          kind: a.kind,
          name_en: a.name_en,
          name_hi: a.name_hi,
          icon: a.icon,
          opening: 0,
          hidden: a.hidden,
          system: a.kind === 'income' || a.kind === 'expense' || a.kind === 'equity',
          deletedAt: a.deleted_at,
          serverVersion: a.server_version,
          updatedAt: a.updated_at,
        }
        await db.accounts.put(localAcc)
        appliedCount++
      }
    }

    // 2. Categories
    if (categories && categories.length) {
      for (const c of categories) {
        const localCat: Category = {
          id: c.id,
          businessId: c.business_id,
          orgId: c.org_id,
          parentId: c.parent_id,
          direction: c.direction,
          key: c.key,
          name_en: c.name_en,
          name_hi: c.name_hi,
          icon: c.icon,
          color: c.color,
          isDefault: c.is_default,
          hidden: c.hidden,
          special: c.special,
          sort: c.sort ?? 0,
          deletedAt: c.deleted_at,
          serverVersion: c.server_version,
          updatedAt: c.updated_at,
        }
        await db.categories.put(localCat)
        appliedCount++
      }
    }

    // 3. Parties
    if (parties && parties.length) {
      for (const p of parties) {
        const localParty: Party = {
          id: p.id,
          businessId: p.business_id,
          orgId: p.org_id,
          name: p.name,
          nameAlt: p.name_alt || '',
          phone: p.phone,
          type: p.type || 'customer',
          createdAt: p.created_at,
          deletedAt: p.deleted_at,
          serverVersion: p.server_version,
          updatedAt: p.updated_at,
        }
        await db.parties.put(localParty)
        appliedCount++
      }
    }

    // 4. Txns
    if (txns && txns.length) {
      const sys = await systemAccounts(businessId)
      for (const t of txns) {
        const cat = t.category_id ? await db.categories.get(t.category_id) : undefined
        const localTxn: Txn = {
          id: t.id,
          businessId: t.business_id,
          orgId: t.org_id,
          date: t.date,
          amount: Number(t.amount),
          direction: t.direction,
          categoryId: t.category_id,
          accountId: t.account_id,
          toAccountId: t.to_account_id,
          partyId: t.party_id,
          onCredit: Boolean(t.on_credit),
          note: t.note || '',
          tags: t.tags || [],
          photoId: t.photo_id,
          createdBy: t.created_by || '',
          createdAt: t.created_at,
          updatedAt: t.updated_at,
          deletedAt: t.deleted_at,
          syncStatus: 'synced',
          serverVersion: t.server_version,
          history: [],
        }

        await db.txns.put(localTxn)
        await db.lines.where('txnId').equals(localTxn.id).delete()
        if (!localTxn.deletedAt) {
          const lines = buildLines(localTxn, cat, sys)
          await db.lines.bulkAdd(lines)
        }
        appliedCount++
      }
    }

    if (server_version && server_version > since) {
      await setSetting(cursorKey, server_version)
    }

    return appliedCount
  } catch (err) {
    console.warn('[Sync] Pull failed:', err)
    return 0
  }
}

/** Synchronize both directions (push then pull) */
export async function fullSync(businessId?: string) {
  if (!isCloudEnabled() || !navigator.onLine) return
  await pushPending(businessId)
  if (businessId) {
    await pullUpdates(businessId)
  } else {
    const bizs = await db.businesses.toArray()
    for (const b of bizs) {
      await pullUpdates(b.id)
    }
  }
}

/** Debounced sync trigger to call after user saves/edits/deletes */
export function triggerSync(businessId?: string) {
  if (!isCloudEnabled()) return
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    fullSync(businessId).catch(() => {})
  }, 1500)
}

/** Background sync loop */
export function startSyncLoop() {
  if (!isCloudEnabled()) return
  const run = () => {
    fullSync().catch(() => {})
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', run)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') run()
    })
    setInterval(run, 60_000)
    // Run initial sync after a short delay to let app settle
    setTimeout(run, 2000)
  }
}
