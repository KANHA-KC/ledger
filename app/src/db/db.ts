import Dexie, { type Table } from 'dexie'
import type {
  Account,
  Business,
  Category,
  DictWord,
  LedgerLine,
  OutboxAction,
  OutboxItem,
  OutboxTable,
  Party,
  Photo,
  Setting,
  Txn,
} from './types'

export class HisaabDB extends Dexie {
  businesses!: Table<Business, string>
  accounts!: Table<Account, string>
  categories!: Table<Category, string>
  parties!: Table<Party, string>
  txns!: Table<Txn, string>
  lines!: Table<LedgerLine, string>
  photos!: Table<Photo, string>
  dict!: Table<DictWord, string>
  settings!: Table<Setting, string>
  outbox!: Table<OutboxItem, string>

  constructor() {
    super('hisaab')
    this.version(1).stores({
      businesses: 'id',
      accounts: 'id, businessId, kind',
      categories: 'id, businessId, direction, parentId, key',
      parties: 'id, businessId, name',
      txns: 'id, businessId, date, categoryId, accountId, partyId, syncStatus, deletedAt, *tags',
      lines: 'id, businessId, txnId, accountId, partyId, date',
      photos: 'id',
      dict: 'roman',
      settings: 'key',
    })

    this.version(2)
      .stores({
        businesses: 'id, orgId, serverVersion',
        accounts: 'id, businessId, orgId, kind, serverVersion',
        categories: 'id, businessId, orgId, direction, parentId, key, serverVersion',
        parties: 'id, businessId, orgId, name, serverVersion',
        txns: 'id, businessId, orgId, date, categoryId, accountId, partyId, syncStatus, deletedAt, serverVersion, *tags',
        lines: 'id, businessId, orgId, txnId, accountId, partyId, date',
        photos: 'id, orgId, businessId',
        dict: 'roman',
        settings: 'key',
        outbox: 'id, table, businessId, createdAt',
      })
      .upgrade(() => {
        // Safe migration: all existing v1 tables remain intact
      })
  }
}

export const db = new HisaabDB()

export const uuid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
      })

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key)
  return row ? (row.value as T) : fallback
}

export async function setSetting(key: string, value: unknown) {
  await db.settings.put({ key, value })
}

/** Queue a mutation into the outbox for background sync to Supabase */
export async function queueOutbox(
  table: OutboxTable,
  action: OutboxAction,
  businessId: string,
  payload: any
) {
  try {
    const item: OutboxItem = {
      id: uuid(),
      table,
      action,
      businessId,
      payload,
      createdAt: new Date().toISOString(),
    }
    await db.outbox.put(item)
  } catch (err) {
    console.error('[Outbox] Failed to queue item:', err)
  }
}

/** Claim pre-login or offline local data when an org is created or joined */
export async function claimLocalDataForOrg(orgId: string, businessId: string) {
  try {
    await db.transaction('rw', [db.businesses, db.accounts, db.categories, db.parties, db.txns, db.lines, db.outbox], async () => {
      // 1. Update business
      const b = await db.businesses.get(businessId)
      if (b) {
        await db.businesses.update(businessId, { orgId })
        await db.outbox.put({
          id: uuid(),
          table: 'businesses',
          action: 'upsert',
          businessId,
          payload: { ...b, orgId },
          createdAt: new Date().toISOString(),
        })
      }

      // 2. Accounts
      const accs = await db.accounts.where('businessId').equals(businessId).toArray()
      for (const a of accs) {
        await db.accounts.update(a.id, { orgId })
        await db.outbox.put({
          id: uuid(),
          table: 'accounts',
          action: 'upsert',
          businessId,
          payload: { ...a, orgId },
          createdAt: new Date().toISOString(),
        })
      }

      // 3. Categories
      const cats = await db.categories.where('businessId').equals(businessId).toArray()
      for (const c of cats) {
        await db.categories.update(c.id, { orgId })
        await db.outbox.put({
          id: uuid(),
          table: 'categories',
          action: 'upsert',
          businessId,
          payload: { ...c, orgId },
          createdAt: new Date().toISOString(),
        })
      }

      // 4. Parties
      const parties = await db.parties.where('businessId').equals(businessId).toArray()
      for (const p of parties) {
        await db.parties.update(p.id, { orgId })
        await db.outbox.put({
          id: uuid(),
          table: 'parties',
          action: 'upsert',
          businessId,
          payload: { ...p, orgId },
          createdAt: new Date().toISOString(),
        })
      }

      // 5. Txns
      const txns = await db.txns.where('businessId').equals(businessId).toArray()
      for (const t of txns) {
        await db.txns.update(t.id, { orgId, syncStatus: 'pending' })
        await db.outbox.put({
          id: uuid(),
          table: 'txns',
          action: 'upsert',
          businessId,
          payload: { ...t, orgId },
          createdAt: new Date().toISOString(),
        })
      }

      // 6. Lines
      const lines = await db.lines.where('businessId').equals(businessId).toArray()
      for (const l of lines) {
        await db.lines.update(l.id, { orgId })
      }
    })
  } catch (err) {
    console.error('[claimLocalDataForOrg] Error claiming data:', err)
  }
}
