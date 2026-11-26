import { db, uuid } from './db'
import type { Account, AccountKind, Business, BusinessType, Category, CategorySpecial, Direction, Lang } from './types'
import { todayISO, addDaysISO } from '../lib/format'

/** 12-colour palette; a category keeps its colour across lists, charts and filters. */
export const PALETTE = [
  '#15803d', '#0f766e', '#0369a1', '#4338ca', '#7e22ce', '#be185d',
  '#c2410c', '#b45309', '#4d7c0f', '#475569', '#9f1239', '#1e40af',
]

export const ICONS = [
  '🛒', '📦', '🏠', '💡', '👷', '🛺', '📱', '🏡', '🤲', '🤝', '🏦', '💸', '🔧', '🥛', '🧵', '🍲',
  '🌾', '🌿', '🌱', '⛽', '🔥', '🥬', '🧾', '💼', '➕', '➖', '🪙', '🚚', '🧹', '🎉', '🏥', '📚',
  '🧂', '🍚', '🧴', '🪔', '🔩', '🧱', '🐄', '✂️',
]

type Def = {
  key: string
  dir: Direction
  en: string
  hi: string
  icon: string
  special?: CategorySpecial
  /** voice keywords (Roman + Devanagari) */
  kw: string[]
}

const COMMON_IN: Def[] = [
  { key: 'bikri', dir: 'in', en: 'Sales', hi: 'बिक्री', icon: '🛒', kw: ['bikri', 'becha', 'bech', 'sale', 'बिक्री', 'बेचा', 'बेची', 'बिका'] },
  { key: 'udhaar_mila', dir: 'in', en: 'Udhaar received back', hi: 'उधार वापस मिला', icon: '🤝', special: 'udhaar_mila', kw: ['wapas', 'वापस', 'udhaar mila', 'उधार मिला', 'लौटाया'] },
  { key: 'udhaar_liya', dir: 'in', en: 'Loan / Udhaar taken', hi: 'उधार / लोन लिया', icon: '🏦', special: 'udhaar_liya', kw: ['loan', 'लोन', 'karz', 'कर्ज', 'उधार लिया', 'udhaar liya'] },
  { key: 'malik', dir: 'in', en: 'Owner added cash', hi: 'मालिक ने पैसा डाला', icon: '💼', kw: ['malik', 'मालिक', 'apna paisa', 'अपना पैसा'] },
  { key: 'anya_in', dir: 'in', en: 'Other income', hi: 'अन्य आमद', icon: '➕', kw: ['anya', 'अन्य', 'other'] },
]

const COMMON_OUT: Def[] = [
  { key: 'maal', dir: 'out', en: 'Stock purchase', hi: 'माल खरीद', icon: '📦', kw: ['maal', 'saaman', 'saman', 'stock', 'kharida', 'माल', 'सामान', 'खरीदा', 'खरीदी'] },
  { key: 'kiraya', dir: 'out', en: 'Rent', hi: 'किराया', icon: '🏠', kw: ['kiraya', 'rent', 'किराया', 'भाड़ा'] },
  { key: 'bijli', dir: 'out', en: 'Electricity', hi: 'बिजली', icon: '💡', kw: ['bijli', 'light', 'bill', 'बिजली', 'लाइट'] },
  { key: 'majdoori', dir: 'out', en: 'Wages / Salary', hi: 'मजदूरी / तनख्वाह', icon: '👷', kw: ['majdoori', 'salary', 'tankhwah', 'मजदूरी', 'तनख्वाह', 'सैलरी', 'पगार'] },
  { key: 'transport', dir: 'out', en: 'Transport', hi: 'भाड़ा / गाड़ी', icon: '🛺', kw: ['transport', 'auto', 'rickshaw', 'gaadi', 'ऑटो', 'रिक्शा', 'गाड़ी', 'ट्रांसपोर्ट'] },
  { key: 'phone', dir: 'out', en: 'Phone / Recharge', hi: 'फ़ोन / रिचार्ज', icon: '📱', kw: ['phone', 'recharge', 'mobile', 'फोन', 'फ़ोन', 'रिचार्ज', 'मोबाइल'] },
  { key: 'marammat', dir: 'out', en: 'Repair', hi: 'मरम्मत', icon: '🔧', kw: ['marammat', 'repair', 'मरम्मत', 'रिपेयर'] },
  { key: 'ghar', dir: 'out', en: 'Home expense', hi: 'घर खर्च', icon: '🏡', kw: ['ghar', 'घर'] },
  { key: 'labor', dir: 'out', en: 'Labor', hi: 'लघोर', icon: '🧱', kw: ['labor', 'labour', 'majdoor', 'majdoori', 'लेबर', 'लघोर', 'मजदूर', 'मजदूरी'] },
  { key: 'equip', dir: 'out', en: 'Equip', hi: 'एकुइप', icon: '🔧', kw: ['equip', 'equipment', 'tool', 'tools', 'औजार', 'एकुइप', 'इक्विप'] },
  { key: 'running_cost', dir: 'out', en: 'Running cost', hi: 'रूनिङ कोस्त', icon: '⛽', kw: ['running cost', 'fuel', 'petrol', 'diesel', 'खर्च', 'रूनिङ कोस्त', 'डीजल', 'पेट्रोल'] },
  { key: 'other_expense', dir: 'out', en: 'Other Expense', hi: 'ओथेर एक्स्पेंसे', icon: '🧾', kw: ['other', 'other expense', 'anya', 'अन्य खर्च', 'ओथेर एक्स्पेंसे'] },
  { key: 'sugarcane_bought', dir: 'out', en: 'Dhan / Paddy Bought', hi: 'धान खरीद', icon: '🌾', kw: ['dhan', 'paddy', 'dhan kharida', 'धान', 'धान खरीद'] },
  { key: 'tins', dir: 'out', en: 'Tins', hi: 'टिंस', icon: '📦', kw: ['tin', 'tins', 'dabba', 'dappe', 'टीन', 'टिंस', 'डिब्बा'] },
  { key: 'udhaar_diya', dir: 'out', en: 'Udhaar given', hi: 'उधार दिया', icon: '🤲', special: 'udhaar_diya', kw: ['udhaar diya', 'उधार दिया', 'udhar diya'] },
  { key: 'udhaar_chukaya', dir: 'out', en: 'Udhaar repaid', hi: 'उधार चुकाया', icon: '💸', special: 'udhaar_chukaya', kw: ['chukaya', 'चुकाया', 'किस्त', 'kisht', 'emi'] },
  { key: 'anya_out', dir: 'out', en: 'Other expense', hi: 'अन्य खर्च', icon: '➖', kw: ['anya', 'अन्य', 'other'] },
]

const BY_TYPE: Record<BusinessType, Def[]> = {
  kirana: [],
  kapda: [
    { key: 'silai', dir: 'in', en: 'Stitching', hi: 'सिलाई', icon: '✂️', kw: ['silai', 'सिलाई', 'stitching'] },
    { key: 'kapda', dir: 'out', en: 'Cloth purchase', hi: 'कपड़ा खरीद', icon: '🧵', kw: ['kapda', 'कपड़ा', 'cloth'] },
  ],
  hardware: [{ key: 'majdoori_in', dir: 'in', en: 'Fitting / Labour', hi: 'फिटिंग / मजदूरी', icon: '🔩', kw: ['fitting', 'फिटिंग'] }],
  dairy: [
    { key: 'doodh', dir: 'in', en: 'Milk sales', hi: 'दूध बिक्री', icon: '🥛', kw: ['doodh', 'dudh', 'milk', 'दूध'] },
    { key: 'chara', dir: 'out', en: 'Fodder', hi: 'चारा', icon: '🌿', kw: ['chara', 'चारा', 'bhusa', 'भूसा', 'fodder'] },
    { key: 'pashu', dir: 'out', en: 'Animal care', hi: 'पशु दवाई', icon: '🐄', kw: ['dawai', 'दवाई', 'doctor', 'पशु'] },
  ],
  khana: [
    { key: 'gas', dir: 'out', en: 'Gas / Fuel', hi: 'गैस', icon: '🔥', kw: ['gas', 'cylinder', 'गैस', 'सिलेंडर'] },
    { key: 'sabzi', dir: 'out', en: 'Vegetables', hi: 'सब्ज़ी', icon: '🥬', kw: ['sabzi', 'sabji', 'सब्जी', 'सब्ज़ी'] },
  ],
  seva: [{ key: 'seva', dir: 'in', en: 'Service charge', hi: 'सेवा शुल्क', icon: '🛠️', kw: ['seva', 'service', 'सेवा'] }],
  kheti: [
    { key: 'fasal', dir: 'in', en: 'Crop sales', hi: 'फसल बिक्री', icon: '🌾', kw: ['fasal', 'dhaan', 'फसल', 'धान', 'गेहूं'] },
    { key: 'beej', dir: 'out', en: 'Seeds / Fertiliser', hi: 'बीज-खाद', icon: '🌱', kw: ['beej', 'khaad', 'बीज', 'खाद', 'यूरिया'] },
    { key: 'diesel', dir: 'out', en: 'Diesel', hi: 'डीज़ल', icon: '⛽', kw: ['diesel', 'डीजल', 'डीज़ल', 'petrol', 'पेट्रोल'] },
  ],
  other: [],
}

export const CATEGORY_KEYWORDS: Record<string, string[]> = Object.fromEntries(
  [...COMMON_IN, ...COMMON_OUT, ...Object.values(BY_TYPE).flat()].map((d) => [d.key, d.kw]),
)

export const BUSINESS_TYPES: { type: BusinessType; icon: string }[] = [
  { type: 'kirana', icon: '🛒' },
  { type: 'kapda', icon: '🧵' },
  { type: 'hardware', icon: '🔩' },
  { type: 'dairy', icon: '🥛' },
  { type: 'khana', icon: '🍲' },
  { type: 'seva', icon: '🛠️' },
  { type: 'kheti', icon: '🌾' },
  { type: 'other', icon: '🏪' },
]

const WALLETS: { kind: AccountKind; en: string; hi: string; icon: string }[] = [
  { kind: 'cash', en: 'Galla (Cash)', hi: 'गल्ला (नकद)', icon: '🪙' },
  { kind: 'bank', en: 'Bank', hi: 'बैंक', icon: '🏦' },
  { kind: 'upi', en: 'UPI / PhonePe', hi: 'यूपीआई / फ़ोनपे', icon: '📲' },
]

const SYSTEM: { kind: AccountKind; en: string; hi: string; icon: string; hidden?: boolean }[] = [
  { kind: 'receivable', en: 'To receive', hi: 'लेना है', icon: '📥' },
  { kind: 'payable', en: 'To pay', hi: 'देना है', icon: '📤' },
  { kind: 'stock', en: 'Stock value', hi: 'स्टॉक (माल)', icon: '📦' },
  { kind: 'asset', en: 'Shop equipment', hi: 'दुकान का सामान', icon: '🧰' },
  { kind: 'loan', en: 'Bank loan', hi: 'बैंक लोन', icon: '🏛️' },
  { kind: 'income', en: 'Income', hi: 'आमद', icon: '', hidden: true },
  { kind: 'expense', en: 'Expense', hi: 'खर्च', icon: '', hidden: true },
  { kind: 'equity', en: 'Owner capital', hi: 'पूंजी', icon: '', hidden: true },
]

export async function createBusiness(opts: {
  id?: string
  name: string
  type: BusinessType
  ownerPhone: string
  language: Lang
  openingCash: number
}): Promise<Business> {
  const id = opts.id || uuid()
  const now = new Date().toISOString()
  const biz: Business = {
    id,
    name: opts.name,
    type: opts.type,
    ownerPhone: opts.ownerPhone,
    language: opts.language,
    plan: 'free',
    trialEndsAt: addDaysISO(todayISO(), 30),
    fyStartMonth: 4,
    createdAt: now,
  }
  const accounts: Account[] = [
    ...WALLETS.map((w) => ({
      id: uuid(), businessId: id, kind: w.kind, name_en: w.en, name_hi: w.hi, icon: w.icon,
      opening: w.kind === 'cash' ? opts.openingCash : 0,
    })),
    ...SYSTEM.map((s) => ({
      id: uuid(), businessId: id, kind: s.kind, name_en: s.en, name_hi: s.hi, icon: s.icon,
      opening: 0, system: true, hidden: s.hidden,
    })),
  ]
  // type-specific categories go first so they show first in the grid
  const defs = [...BY_TYPE[opts.type], ...COMMON_IN, ...COMMON_OUT]
  const categories: Category[] = defs.map((d, i) => ({
    id: uuid(), businessId: id, parentId: null, direction: d.dir, key: d.key,
    name_en: d.en, name_hi: d.hi, icon: d.icon, color: PALETTE[i % PALETTE.length],
    isDefault: true, special: d.special, sort: i,
  }))
  await db.transaction('rw', db.businesses, db.accounts, db.categories, async () => {
    await db.businesses.add(biz)
    await db.accounts.bulkAdd(accounts)
    await db.categories.bulkAdd(categories)
  })
  return biz
}

const DEMO_EXTRA_DEFS: Def[] = [
  { key: 'labor', dir: 'out', en: 'Labor', hi: 'लघोर', icon: '🧱', kw: ['labor'] },
  { key: 'equip', dir: 'out', en: 'Equip', hi: 'एकुइप', icon: '🔧', kw: ['equip'] },
  { key: 'running_cost', dir: 'out', en: 'Running cost', hi: 'रूनिङ कोस्त', icon: '⛽', kw: ['running'] },
  { key: 'other_expense', dir: 'out', en: 'Other Expense', hi: 'ओथेर एक्स्पेंसे', icon: '🧾', kw: ['other'] },
  { key: 'sugarcane_bought', dir: 'out', en: 'Dhan / Paddy Bought', hi: 'धान खरीद', icon: '🌾', kw: ['dhan', 'paddy'] },
  { key: 'tins', dir: 'out', en: 'Tins', hi: 'टिंस', icon: '📦', kw: ['tins'] },
  { key: 'sugarcane_sales', dir: 'in', en: 'Dhan / Paddy Sales', hi: 'धान बिक्री', icon: '🌾', kw: ['dhan', 'paddy', 'धान बिक्री'] },
]

/**
 * Automatically recovers missing default categories or orphaned categories into the Recycle Bin,
 * so previously hard-deleted categories can still be found and restored.
 */
export async function syncOrphanedCategoriesToBin(businessId: string, businessType: BusinessType): Promise<number> {
  const existing = await db.categories.where('businessId').equals(businessId).toArray()
  const existingKeys = new Set(existing.map((c) => c.key).filter(Boolean))
  const existingIds = new Set(existing.map((c) => c.id))

  const baseDefs = [...(BY_TYPE[businessType] ?? []), ...COMMON_IN, ...COMMON_OUT]
  const defs = businessId === 'demo-sharma-kirana' ? [...baseDefs, ...DEMO_EXTRA_DEFS] : baseDefs
  const missingDefs = defs.filter((d) => !existingKeys.has(d.key))

  const now = new Date().toISOString()
  const toAdd: Category[] = []

  // Add missing default categories to the Bin as deleted
  for (let i = 0; i < missingDefs.length; i++) {
    const d = missingDefs[i]
    toAdd.push({
      id: uuid(),
      businessId,
      parentId: null,
      direction: d.dir,
      key: d.key,
      name_en: d.en,
      name_hi: d.hi,
      icon: d.icon,
      color: PALETTE[i % PALETTE.length],
      isDefault: true,
      special: d.special,
      sort: 100 + i,
      deletedAt: now,
    })
  }

  // Also check transactions for any orphaned categoryId that was hard-deleted
  const txns = await db.txns.where('businessId').equals(businessId).toArray()
  const orphanCatIds = new Set<string>()
  for (const t of txns) {
    if (t.categoryId && !existingIds.has(t.categoryId)) {
      orphanCatIds.add(t.categoryId)
    }
  }

  for (const orphanId of orphanCatIds) {
    toAdd.push({
      id: orphanId,
      businessId,
      parentId: null,
      direction: 'out',
      name_en: 'Deleted Category',
      name_hi: 'हटाया गया वर्ग',
      icon: '📦',
      color: '#8E8E93',
      isDefault: false,
      sort: 999,
      deletedAt: now,
    })
  }

  if (toAdd.length > 0) {
    await db.categories.bulkAdd(toAdd)
  }

  return toAdd.length
}

/** Old default names → new ones. Only categories still carrying the old default name are renamed. */
const RENAMED_DEFAULTS: Record<string, { from: string[]; en: string; hi: string }> = {
  sugarcane_sales: { from: ['Sugarcane / Gur Sales'], en: 'Dhan / Paddy Sales', hi: 'धान बिक्री' },
  sugarcane_bought: { from: ['Sugarcane Baought', 'Sugarcane Bought'], en: 'Dhan / Paddy Bought', hi: 'धान खरीद' },
}

/** Returns the ids of the categories it renamed, so the caller can queue them for sync. */
export async function renameLegacyDefaults(businessId: string): Promise<string[]> {
  const cats = await db.categories.where('businessId').equals(businessId).toArray()
  const now = new Date().toISOString()
  const changed: string[] = []
  for (const c of cats) {
    const r = c.key ? RENAMED_DEFAULTS[c.key] : undefined
    if (!r || !r.from.includes(c.name_en)) continue
    await db.categories.update(c.id, { name_en: r.en, name_hi: r.hi, updatedAt: now })
    changed.push(c.id)
  }
  return changed
}
