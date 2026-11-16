// All money is stored in paise (integer). All ids are device-generated UUIDs.

export type Lang = 'hi' | 'en'
export type Direction = 'in' | 'out'
export type BusinessType = 'kirana' | 'kapda' | 'hardware' | 'dairy' | 'khana' | 'seva' | 'kheti' | 'other'

export interface Business {
  id: string
  name: string
  type: BusinessType
  ownerPhone: string
  language: Lang
  plan: 'free' | 'basic' | 'pro'
  trialEndsAt: string // ISO date
  fyStartMonth: number // 1-12, India = 4
  createdAt: string
}

export type AccountKind =
  | 'cash' | 'bank' | 'upi' // wallets (khata) the user sees
  | 'receivable' | 'payable' // udhaar, one system account each; party is a dimension on the ledger line
  | 'asset' | 'stock' | 'loan' // manual-valued, for net worth
  | 'income' | 'expense' | 'equity' // system accounts, never shown to the user

export interface Account {
  id: string
  businessId: string
  kind: AccountKind
  name_en: string
  name_hi: string
  icon: string
  opening: number // paise; for asset/stock/loan this is the current manual value
  hidden?: boolean
  system?: boolean
}

/** Special categories move money to/from a party's udhaar instead of income/expense. */
export type CategorySpecial = 'udhaar_diya' | 'udhaar_mila' | 'udhaar_liya' | 'udhaar_chukaya'

export interface Category {
  id: string
  businessId: string
  parentId: string | null
  direction: Direction
  key?: string // stable key for default categories (used by voice parsing)
  name_en: string
  name_hi: string
  icon: string
  color: string
  isDefault: boolean
  hidden?: boolean
  special?: CategorySpecial
  sort: number
  deletedAt?: string | null
}

export interface Party {
  id: string
  businessId: string
  name: string // as typed
  nameAlt: string // transliterated copy (other script), for search
  phone: string
  type: 'customer' | 'supplier' | 'worker' | 'lender' | 'other'
  createdAt: string
  deletedAt?: string | null
}

export interface TxnSnapshot {
  at: string
  date: string
  amount: number
  direction: Direction
  categoryId: string
  accountId: string | null
  partyId: string | null
  note: string
  onCredit: boolean
}

export interface Txn {
  id: string
  businessId: string
  date: string // YYYY-MM-DD (local)
  amount: number // paise
  direction: Direction | 'transfer'
  categoryId: string | null // null for transfers
  accountId: string | null // wallet; null when onCredit
  toAccountId?: string | null // transfers only
  partyId: string | null
  onCredit: boolean // sale/purchase on udhaar: no wallet movement
  note: string
  tags: string[]
  photoId?: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  createdOfflineAt?: string | null
  deletedAt?: string | null
  syncStatus: 'pending' | 'synced'
  history: TxnSnapshot[]
}

export interface LedgerLine {
  id: string
  businessId: string
  txnId: string
  date: string
  accountId: string
  partyId: string | null
  debit: number
  credit: number
}

export interface Photo {
  id: string
  blob: Blob
  createdAt: string
}

export interface DictWord {
  roman: string
  hi: string
  count: number
}

export interface Setting {
  key: string
  value: unknown
}
