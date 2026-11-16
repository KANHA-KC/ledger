import Dexie, { type Table } from 'dexie'
import type { Account, Business, Category, DictWord, LedgerLine, Party, Photo, Setting, Txn } from './types'

class HisaabDB extends Dexie {
  businesses!: Table<Business, string>
  accounts!: Table<Account, string>
  categories!: Table<Category, string>
  parties!: Table<Party, string>
  txns!: Table<Txn, string>
  lines!: Table<LedgerLine, string>
  photos!: Table<Photo, string>
  dict!: Table<DictWord, string>
  settings!: Table<Setting, string>

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
