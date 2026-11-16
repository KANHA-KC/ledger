import { db, setSetting, uuid } from '../db/db'
import { createBusiness } from '../db/seed'
import type { Business, Category, Party, Txn } from '../db/types'
import { setPin, DEMO_PIN } from './auth'
import { todayISO, addDaysISO } from './format'
import { saveTxn } from '../db/ledger'
import { seedDummyEntriesForCategory } from './dummyData'

export const DEMO_BUSINESS_ID = 'demo-sharma-kirana'
export const DEMO_BUSINESS_NAME = 'Jai Gurudev Traders (जय गुरुदेव ट्रेडर्स)'
export const DEMO_PHONE = '9876543210'

/**
 * Default dummy categories requested by user:
 * Exactly matching the 6 Money Out categories in test login
 */
export const DEFAULT_DEMO_OUT_CATEGORIES = [
  {
    key: 'labor',
    name_en: 'Labor',
    name_hi: 'लघोर',
    icon: '🧱',
    color: '#c2410c',
    dir: 'out' as const,
    sort: 0,
  },
  {
    key: 'equip',
    name_en: 'Equip',
    name_hi: 'एकुइप',
    icon: '🔧',
    color: '#475569',
    dir: 'out' as const,
    sort: 1,
  },
  {
    key: 'running_cost',
    name_en: 'Running cost',
    name_hi: 'रूनिङ कोस्त',
    icon: '⛽',
    color: '#15803d',
    dir: 'out' as const,
    sort: 2,
  },
  {
    key: 'other_expense',
    name_en: 'Other Expense',
    name_hi: 'ओथेर एक्स्पेंसे',
    icon: '🧾',
    color: '#475569',
    dir: 'out' as const,
    sort: 3,
  },
  {
    key: 'sugarcane_bought',
    name_en: 'Sugarcane Baought',
    name_hi: 'सुगर्कने बऔघ्त',
    icon: '🌾',
    color: '#be185d',
    dir: 'out' as const,
    sort: 4,
  },
  {
    key: 'tins',
    name_en: 'Tins',
    name_hi: 'टिंस',
    icon: '📦',
    color: '#4d7c0f',
    dir: 'out' as const,
    sort: 5,
  },
]

export const DEFAULT_DEMO_IN_CATEGORIES = [
  {
    key: 'bikri',
    name_en: 'Sales',
    name_hi: 'बिक्री',
    icon: '🛒',
    color: '#15803d',
    dir: 'in' as const,
    sort: 0,
  },
  {
    key: 'sugarcane_sales',
    name_en: 'Sugarcane / Gur Sales',
    name_hi: 'गुड़ / गन्ना बिक्री',
    icon: '🌾',
    color: '#b45309',
    dir: 'in' as const,
    sort: 1,
  },
  {
    key: 'udhaar_mila',
    name_en: 'Udhaar received back',
    name_hi: 'उधार वापस मिला',
    icon: '🤝',
    color: '#0f766e',
    special: 'udhaar_mila' as const,
    dir: 'in' as const,
    sort: 2,
  },
  {
    key: 'anya_in',
    name_en: 'Other income',
    name_hi: 'अन्य आमद',
    icon: '➕',
    color: '#0369a1',
    dir: 'in' as const,
    sort: 3,
  },
  {
    key: 'malik',
    name_en: 'Owner added cash',
    name_hi: 'मालिक ने पैसा डाला',
    icon: '💼',
    color: '#4338ca',
    dir: 'in' as const,
    sort: 4,
  },
]

/**
 * Ensures the demo business has the exact requested dummy categories.
 */
export async function ensureDemoCategories(businessId: string) {
  try {
    const existing = await db.categories.where('businessId').equals(businessId).toArray()

    if (existing.length === 0) {
      // Initialize categories for demo business
      const demoCategories: Category[] = [
        ...DEFAULT_DEMO_OUT_CATEGORIES.map((c) => ({
          id: uuid(),
          businessId,
          parentId: null,
          direction: c.dir,
          key: c.key,
          name_en: c.name_en,
          name_hi: c.name_hi,
          icon: c.icon,
          color: c.color,
          isDefault: true,
          sort: c.sort,
        })),
        ...DEFAULT_DEMO_IN_CATEGORIES.map((c) => ({
          id: uuid(),
          businessId,
          parentId: null,
          direction: c.dir,
          key: c.key,
          name_en: c.name_en,
          name_hi: c.name_hi,
          icon: c.icon,
          color: c.color,
          isDefault: true,
          special: c.special,
          sort: c.sort,
        })),
      ]

      await db.categories.bulkAdd(demoCategories)

      // Ensure 1 entry in Tins to match the user's screen state
      const tinsCat = demoCategories.find((c) => c.key === 'tins')
      if (tinsCat) {
        const existingTinsCount = await db.txns.where('categoryId').equals(tinsCat.id).count()
        if (existingTinsCount === 0) {
          const bankAcc = await db.accounts.where({ businessId, kind: 'bank' }).first()
          const balajiParty = await db.parties.where({ businessId, type: 'supplier' }).first()
          const tinsTxn: Txn = {
            id: uuid(),
            businessId,
            date: addDaysISO(todayISO(), -1),
            amount: 650000, // ₹6,500
            direction: 'out',
            categoryId: tinsCat.id,
            accountId: bankAcc?.id || null,
            partyId: balajiParty?.id || null,
            onCredit: false,
            note: 'खाली टीन खरीद (50 Tins purchased)',
            tags: ['tins', 'stock'],
            createdBy: 'Demo User',
            createdAt: new Date(Date.now() - 86400000).toISOString(),
            updatedAt: new Date(Date.now() - 86400000).toISOString(),
            syncStatus: 'synced',
            history: [],
          }
          await saveTxn(tinsTxn)
        }
      }
    }

    // Ensure all categories have realistic dummy entries if empty
    const cats = await db.categories
      .where('businessId')
      .equals(businessId)
      .filter((c) => !c.deletedAt)
      .toArray()
    const accs = await db.accounts.where('businessId').equals(businessId).toArray()
    const prts = await db.parties.where('businessId').equals(businessId).toArray()

    for (const cat of cats) {
      const cnt = await db.txns
        .where('categoryId')
        .equals(cat.id)
        .filter((x) => !x.deletedAt)
        .count()
      if (cnt === 0) {
        await seedDummyEntriesForCategory(cat, accs, prts, 4)
      }
    }
  } catch (err) {
    console.error('ensureDemoCategories error:', err)
  }
}

/**
 * Creates or activates a rich demo business with pre-populated transactions,
 * realistic wallet balances, customer udhaar, supplier credit, and passes PIN 1234.
 */
export async function loginWithDemoAccount(forceFresh = false): Promise<Business> {
  let biz = await db.businesses.get(DEMO_BUSINESS_ID)

  if (!biz || forceFresh) {
    if (biz && forceFresh) {
      await db.transaction('rw', [db.businesses, db.accounts, db.categories, db.parties, db.txns, db.lines], async () => {
        await db.businesses.delete(DEMO_BUSINESS_ID)
        await db.accounts.where('businessId').equals(DEMO_BUSINESS_ID).delete()
        await db.categories.where('businessId').equals(DEMO_BUSINESS_ID).delete()
        await db.parties.where('businessId').equals(DEMO_BUSINESS_ID).delete()
        await db.txns.where('businessId').equals(DEMO_BUSINESS_ID).delete()
        await db.lines.where('businessId').equals(DEMO_BUSINESS_ID).delete()
      })
    }

    // 1. Create Business with ₹25,000 cash in Galla
    biz = await createBusiness({
      id: DEMO_BUSINESS_ID,
      name: DEMO_BUSINESS_NAME,
      type: 'kirana',
      ownerPhone: DEMO_PHONE,
      language: 'hi',
      openingCash: 2500000, // ₹25,000 in paise
    })
    const bizId = biz.id

    // 2. Set opening balances for Bank (₹45,000) and UPI (₹12,000)
    const bankAcc = await db.accounts.where({ businessId: biz.id, kind: 'bank' }).first()
    if (bankAcc) {
      bankAcc.opening = 4500000
      await db.accounts.put(bankAcc)
    }

    const upiAcc = await db.accounts.where({ businessId: biz.id, kind: 'upi' }).first()
    if (upiAcc) {
      upiAcc.opening = 1200000
      await db.accounts.put(upiAcc)
    }

    const cashAcc = await db.accounts.where({ businessId: biz.id, kind: 'cash' }).first()

    // 3. Populate default dummy categories (Exact match with user requirements)
    await db.categories.where('businessId').equals(bizId).delete()

    const demoCategories: Category[] = [
      ...DEFAULT_DEMO_OUT_CATEGORIES.map((c) => ({
        id: uuid(),
        businessId: bizId,
        parentId: null,
        direction: c.dir,
        key: c.key,
        name_en: c.name_en,
        name_hi: c.name_hi,
        icon: c.icon,
        color: c.color,
        isDefault: true,
        sort: c.sort,
      })),
      ...DEFAULT_DEMO_IN_CATEGORIES.map((c) => ({
        id: uuid(),
        businessId: bizId,
        parentId: null,
        direction: c.dir,
        key: c.key,
        name_en: c.name_en,
        name_hi: c.name_hi,
        icon: c.icon,
        color: c.color,
        isDefault: true,
        special: c.special,
        sort: c.sort,
      })),
    ]

    await db.categories.bulkAdd(demoCategories)

    const catMap = new Map(demoCategories.map((c) => [c.key || c.special || '', c.id]))
    const bikriCat = catMap.get('bikri')
    const tinsCat = catMap.get('tins')
    const udhaarMilaCat = catMap.get('udhaar_mila')

    // 4. Sample Parties
    const today = todayISO()
    const yesterday = addDaysISO(today, -1)
    const twoDaysAgo = addDaysISO(today, -2)
    const threeDaysAgo = addDaysISO(today, -3)

    const partyRamesh: Party = {
      id: uuid(),
      businessId: bizId,
      name: 'Ramesh Kumar (Customer)',
      nameAlt: 'रमेश कुमार',
      phone: '9811223344',
      type: 'customer',
      createdAt: threeDaysAgo,
    }

    const partySuresh: Party = {
      id: uuid(),
      businessId: bizId,
      name: 'Suresh Verma (Customer)',
      nameAlt: 'सुरेश वर्मा',
      phone: '9822334455',
      type: 'customer',
      createdAt: threeDaysAgo,
    }

    const partyBalaji: Party = {
      id: uuid(),
      businessId: bizId,
      name: 'Balaji Wholesale Traders',
      nameAlt: 'बालाजी होलसेल ट्रेडर्स',
      phone: '9833445566',
      type: 'supplier',
      createdAt: threeDaysAgo,
    }

    const partyAmit: Party = {
      id: uuid(),
      businessId: bizId,
      name: 'Amit Sharma (Staff)',
      nameAlt: 'अमित शर्मा',
      phone: '9844556677',
      type: 'worker',
      createdAt: threeDaysAgo,
    }

    await db.parties.bulkAdd([partyRamesh, partySuresh, partyBalaji, partyAmit])

    // 5. Pre-populated sample transactions:
    // Only 1 out transaction in 'Tins' so Tins has 1 entry, while the other 5 categories have 0 entries
    const txns: Txn[] = [
      // 2 days ago: Cash sales
      {
        id: uuid(),
        businessId: bizId,
        date: twoDaysAgo,
        amount: 320000, // ₹3,200
        direction: 'in',
        categoryId: bikriCat || null,
        accountId: cashAcc?.id || null,
        partyId: null,
        onCredit: false,
        note: 'दिन की नकद बिक्री (Daily cash sales)',
        tags: ['sales'],
        createdBy: 'Demo User',
        createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
        updatedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
        syncStatus: 'synced',
        history: [],
      },
      // 3 days ago: Udhaar given to Suresh Verma (tracks on party)
      {
        id: uuid(),
        businessId: bizId,
        date: threeDaysAgo,
        amount: 270000, // ₹2,700
        direction: 'out',
        categoryId: null,
        accountId: cashAcc?.id || null,
        partyId: partySuresh.id,
        onCredit: false,
        note: 'सामान बिक्री (Goods sale to Suresh)',
        tags: ['sale'],
        createdBy: 'Demo User',
        createdAt: new Date(Date.now() - 3 * 86400000 + 3600000).toISOString(),
        updatedAt: new Date(Date.now() - 3 * 86400000 + 3600000).toISOString(),
        syncStatus: 'synced',
        history: [],
      },
      // Yesterday: Suresh Verma payment in cash
      {
        id: uuid(),
        businessId: bizId,
        date: yesterday,
        amount: 150000, // ₹1,500
        direction: 'in',
        categoryId: udhaarMilaCat || null,
        accountId: cashAcc?.id || null,
        partyId: partySuresh.id,
        onCredit: false,
        note: 'सुरेश भाई से भुगतान प्राप्त हुआ (Payment received from Suresh)',
        tags: ['payment'],
        createdBy: 'Demo User',
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        updatedAt: new Date(Date.now() - 86400000).toISOString(),
        syncStatus: 'synced',
        history: [],
      },
      // Yesterday: UPI QR sales
      {
        id: uuid(),
        businessId: bizId,
        date: yesterday,
        amount: 215000, // ₹2,150
        direction: 'in',
        categoryId: bikriCat || null,
        accountId: upiAcc?.id || null,
        partyId: null,
        onCredit: false,
        note: 'PhonePe QR से बिक्री (UPI sales)',
        tags: ['upi', 'sales'],
        createdBy: 'Demo User',
        createdAt: new Date(Date.now() - 86400000 + 3600000).toISOString(),
        updatedAt: new Date(Date.now() - 86400000 + 3600000).toISOString(),
        syncStatus: 'synced',
        history: [],
      },
      // Yesterday: 50 Tins purchased from Balaji (The 1 entry in Tins)
      {
        id: uuid(),
        businessId: bizId,
        date: yesterday,
        amount: 650000, // ₹6,500
        direction: 'out',
        categoryId: tinsCat || null,
        accountId: bankAcc?.id || null,
        partyId: partyBalaji.id,
        onCredit: false,
        note: 'खाली टीन खरीद (50 Tins purchased)',
        tags: ['tins', 'stock'],
        createdBy: 'Demo User',
        createdAt: new Date(Date.now() - 86400000 + 7200000).toISOString(),
        updatedAt: new Date(Date.now() - 86400000 + 7200000).toISOString(),
        syncStatus: 'synced',
        history: [],
      },
      // Today: Morning cash sale
      {
        id: uuid(),
        businessId: bizId,
        date: today,
        amount: 185000, // ₹1,850
        direction: 'in',
        categoryId: bikriCat || null,
        accountId: cashAcc?.id || null,
        partyId: null,
        onCredit: false,
        note: 'सुबह की बिक्री (Morning sales)',
        tags: ['sales'],
        createdBy: 'Demo User',
        createdAt: new Date(Date.now() - 14400000).toISOString(),
        updatedAt: new Date(Date.now() - 14400000).toISOString(),
        syncStatus: 'synced',
        history: [],
      },
      // Today: Udhaar given to Ramesh Kumar
      {
        id: uuid(),
        businessId: bizId,
        date: today,
        amount: 125000, // ₹1,250
        direction: 'out',
        categoryId: null,
        accountId: cashAcc?.id || null,
        partyId: partyRamesh.id,
        onCredit: false,
        note: 'सामान बिक्री (Groceries sale)',
        tags: ['sale'],
        createdBy: 'Demo User',
        createdAt: new Date(Date.now() - 7200000).toISOString(),
        updatedAt: new Date(Date.now() - 7200000).toISOString(),
        syncStatus: 'synced',
        history: [],
      },
      // Today: Afternoon UPI sale
      {
        id: uuid(),
        businessId: bizId,
        date: today,
        amount: 98000, // ₹980
        direction: 'in',
        categoryId: bikriCat || null,
        accountId: upiAcc?.id || null,
        partyId: null,
        onCredit: false,
        note: 'UPI QR पेमेंट (PhonePe)',
        tags: ['sales', 'upi'],
        createdBy: 'Demo User',
        createdAt: new Date(Date.now() - 3600000).toISOString(),
        updatedAt: new Date(Date.now() - 3600000).toISOString(),
        syncStatus: 'synced',
        history: [],
      },
    ]

    for (const t of txns) {
      await saveTxn(t)
    }
  }

  // Ensure all categories exist and have dummy entries
  await ensureDemoCategories(biz.id)

  // Activate demo account & default demo PIN
  await setSetting('activeBusiness', biz.id)
  await setPin(DEMO_PIN)
  await setSetting('guide', false)
  if (typeof window !== 'undefined') {
    localStorage.setItem('hisaab_user_name', 'Dilip Chandravanshi')
  }

  return biz
}
