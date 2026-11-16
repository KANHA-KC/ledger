import { db, uuid } from '../db/db'
import { saveTxn } from '../db/ledger'
import { todayISO, addDaysISO } from './format'
import type { Category, Account, Party, Txn } from '../db/types'

// Category-specific realistic templates for Indian small business / kirana / agro
const DUMMY_TEMPLATES: Record<string, { note: string; amount: number }[]> = {
  labor: [
    { note: 'मजदूरों की दैनिक दिहाड़ी भुगतान (Daily wage payment to labor helpers)', amount: 450000 },
    { note: 'लोडिंग व अनलोडिंग हमाली खर्च (Loading & unloading labor charges)', amount: 280000 },
    { note: 'सुपरवाइजर साप्ताहिक भुगतान (Weekly payment to supervisor)', amount: 600000 },
    { note: 'गन्ना कटाई व छिलाई लेबर (Sugarcane cutting & peeling labor)', amount: 850000 },
    { note: 'कोल्हू मशीन ऑपरेटर वेतन (Crusher machine operator wage)', amount: 520000 },
    { note: 'ट्रॉली खाली करने की मजदूरी (Trolley unloading labor charges)', amount: 180000 },
  ],
  equip: [
    { note: 'कोल्हू मशीन बेल्ट व ग्रीसिंग सर्विस (Crusher machine belt & greasing)', amount: 340000 },
    { note: 'डीजल पंप स्पेयर पार्ट्स खरीद (Diesel water pump spare parts)', amount: 260000 },
    { note: 'कढ़ाई व गुड़ पकाने के बर्तन मरम्मत (Jaggery boiling pans repair & welding)', amount: 480000 },
    { note: 'कांटा वजन मशीन कैलिब्रेशन व बैटरी (Weighing scale repair & new battery)', amount: 120000 },
    { note: 'गियर बॉक्स ऑयल व फिल्टर बदलाव (Gearbox oil & filter replacement)', amount: 390000 },
    { note: 'दुकान टूलकिट व रिंच सेट खरीद (Tool kit & spanner set purchase)', amount: 175000 },
  ],
  running_cost: [
    { note: 'जनरेटर व कोल्हू के लिए 60L डीजल (60L Diesel for generator & crusher)', amount: 564000 },
    { note: 'ट्रैक्टर ट्रॉली डीजल खर्च (Tractor trolley diesel fuel)', amount: 320000 },
    { note: 'बिजली बिल कमर्शियल मीटर भुगतान (Commercial electric power bill payment)', amount: 745000 },
    { note: 'गुड़ भट्टी के लिए सूखी खोई व लकड़ी (Dry bagasse & firewood for furnace)', amount: 820000 },
    { note: 'मशीनरी मोबिल ऑयल व लुब्रिकेंट (Mobil oil & machinery lubricants)', amount: 210000 },
    { note: 'दैनिक परिचालन व ईंधन खर्च (Daily operational fuel expense)', amount: 165000 },
  ],
  other_expense: [
    { note: 'दुकान सफाई सामग्री व झाड़ू फिनाइल (Cleaning supplies & phenyl)', amount: 85000 },
    { note: 'चाय-नाश्ता व पानी केन खर्च (Staff tea, refreshments & water jars)', amount: 142000 },
    { note: 'बिल बुक, मुनीम रजिस्टर व पेन (Bill books, ledger registers & stationery)', amount: 95000 },
    { note: 'पैकिंग रस्सियां व प्लास्टिक थैली (Jute ropes & packing plastic bags)', amount: 180000 },
    { note: 'मंडी समिति टैक्स व पर्ची शुल्क (Mandi samiti cess & gate receipt tax)', amount: 210000 },
    { note: 'दुकान विविध आकस्मिक खर्च (Miscellaneous shop incidentals)', amount: 115000 },
  ],
  sugarcane_bought: [
    { note: 'रामपाल किसान से 2 ट्रॉली गन्ना खरीद (2 Trolley sugarcane bought from Rampal)', amount: 2850000 },
    { note: 'मंडी से ताजा गन्ना लॉट 1 खरीद (Fresh sugarcane lot 1 purchased from mandi)', amount: 3400000 },
    { note: 'सुभाष किसान से गन्ना तौल भुगतान (Sugarcane weight cash settlement with Subhash)', amount: 1920000 },
    { note: '30 क्विंटल गन्ना नकद खरीद (30 Quintal sugarcane spot cash purchase)', amount: 4200000 },
    { note: 'गन्ना लोडिंग व कांटे की तोल रसीद (Sugarcane procurement lot weighbridge payment)', amount: 2480000 },
    { note: 'किसान हरपाल से गन्ना लॉट 3 (Sugarcane lot 3 from farmer Harpal)', amount: 3150000 },
  ],
  tins: [
    { note: 'बालाजी ट्रेडर्स से 50 नए टीन खरीद (50 New tin containers from Balaji Traders)', amount: 650000 },
    { note: 'गुड़ पैकिंग के लिए 40 स्टील टीन डिब्बे (40 Tin boxes for jaggery packaging)', amount: 520000 },
    { note: 'टीन ढक्कन व सीलिंग क्लिप्स खरीद (Tin lids, caps & sealing clips)', amount: 185000 },
    { note: 'पुराने साफ किए हुए टीन 30 नग (30 Reconditioned clean tins purchase)', amount: 330000 },
    { note: 'टीन प्रिंटिंग व मार्का लेबल खर्च (Tin branding stamp & label printing)', amount: 120000 },
  ],
  sugarcane_sales: [
    { note: 'थोक व्यापारी को 25 पेटी देसी गुड़ बिक्री (25 Boxes pure desi gur wholesale sale)', amount: 3800000 },
    { note: 'मंडी में 15 क्विंटल गुड़ लॉट बिक्री (15 Quintal gur lot sale in mandi)', amount: 4850000 },
    { note: 'शक्कर व राबड़ी खुदरा नकद बिक्री (Jaggery powder & rabri counter cash sale)', amount: 1240000 },
    { note: 'गुप्ता मिष्ठान भंडार को गुड़ सप्लाई (Desi gur supply to Gupta Sweets)', amount: 2900000 },
    { note: 'ताजा गन्ने का रस व गुड़ नकद बिक्री (Fresh cane juice & jaggery daily cash)', amount: 850000 },
  ],
  bikri: [
    { note: 'दुकान की दैनिक नकद बिक्री (Daily counter sales)', amount: 1450000 },
    { note: 'PhonePe QR से नकद व ऑनलाइन बिक्री (PhonePe QR customer payments)', amount: 980000 },
    { note: 'थोक ऑर्डर सप्लाई भुगतान (Wholesale store supply settlement)', amount: 2200000 },
    { note: 'किराना सामान काउंटर बिक्री (Retail counter grocery sales)', amount: 1120000 },
  ],
  anya_in: [
    { note: 'गन्ना खोई (Bagasse) पेपर मिल को बिक्री (Cane bagasse sold to paper board mill)', amount: 1200000 },
    { note: 'पुराने खाली बारदाने व बोरियां बिक्री (Old gunny bags scrap sale)', amount: 350000 },
    { note: 'कमीशन व ब्रोकरेज आमदनी (Sales commission received)', amount: 550000 },
  ],
  malik: [
    { note: 'मालिक ने व्यापार विस्तार हेतु पैसा डाला (Owner capital infusion for business)', amount: 5000000 },
  ],
  udhaar_mila: [
    { note: 'रमेश कुमार से बकाया राशि प्राप्त हुई (Payment received from Ramesh)', amount: 800000 },
    { note: 'सुरेश भाई से शेष भुगतान मिला (Outstanding payment from Suresh)', amount: 650000 },
  ],
  dhaan: [
    { note: 'मंडी में 10 क्विंटल धान बिक्री (Mandi 10 quintal dhaan sale)', amount: 2250000 },
    { note: 'राइस मिल से धान का अग्रिम भुगतान (Rice mill advance payment)', amount: 1500000 },
    { note: 'धान तौल व लोडिंग कमीशन (Dhaan loading & weighing charge)', amount: 350000 },
    { note: 'मंडी धान लॉट 2 ऑनलाइन आरटीजीएस (Dhaan lot 2 RTGS payment)', amount: 2800000 },
    { note: 'धान की भूसी व बाई-प्रोडक्ट बिक्री (Paddy husk byproduct sale)', amount: 450000 },
    { note: 'किसान से धान बिक्री कमीशन (Farmer dhaan sales commission)', amount: 520000 },
    { note: 'लोकल मिलर को 5 बोरी धान सप्लाई (Local miller 5 bags paddy sale)', amount: 880000 },
    { note: 'धान कटाई सीजन थोक भुगतान (Paddy harvest bulk cash payment)', amount: 1950000 },
  ],
  ghar: [
    { note: 'घर से दुकान गल्ले में पैसा जमा (Cash added from home savings)', amount: 500000 },
    { note: 'घर का किराया मिला (House rent received)', amount: 850000 },
    { note: 'घरेलू पुराना सामान बिक्री (Old household appliances sold)', amount: 180000 },
    { note: 'पारिवारिक बचत से दुकान में निवेश (Family savings investment)', amount: 1200000 },
    { note: 'घर के डेयरी दूध व घी की बिक्री (Home dairy ghee & milk sales)', amount: 340000 },
    { note: 'घर के खाते से बैंक ट्रांसफर (Bank transfer from personal account)', amount: 450000 },
    { note: 'किरायेदार से बिजली बिल का शेयर मिला (Tenant electricity bill share)', amount: 125000 },
    { note: 'घरेलू बचत जमा (Personal household savings deposit)', amount: 620000 },
  ],
  cold: [
    { note: 'कोल्ड ड्रिंक्स थोक बिक्री (Cold drinks wholesale sale)', amount: 650000 },
    { note: 'कोल्ड स्टोरेज आलू लॉट डिलीवरी भुगतान (Cold storage potato delivery)', amount: 1400000 },
    { note: 'फ्रिज आइसक्रीम व कोल्ड ड्रिंक नकद बिक्री (Counter cold drinks & ice-cream cash)', amount: 280000 },
    { note: 'शादी कैटरिंग के लिए कोल्ड ड्रिंक सप्लाई (Event cold drinks catering supply)', amount: 950000 },
    { note: 'कोल्ड ड्रिंक क्रेट्स डिपॉजिट व रिफंड (Crates deposit & refund received)', amount: 120000 },
    { note: 'कोल्ड स्टोरेज स्पेस रेंट शेयर (Cold storage rental share income)', amount: 550000 },
    { note: 'लोकल पार्टी को 8 पेटी कोल्ड ड्रिंक सप्लाई (8 crates cold drinks party order)', amount: 420000 },
    { note: 'कोल्ड स्टोरेज आलू पैकेट बिक्री (Cold storage potato packets sale)', amount: 760000 },
  ],
}

const GENERIC_INCOME_TEMPLATES = [
  { note: 'दुकान से नकद बिक्री (Counter cash sales)', amount: 120000 },
  { note: 'ग्राहक से यूपीआई भुगतान (Customer UPI payment)', amount: 250000 },
  { note: 'थोक ऑर्डर एडवांस (Wholesale order advance)', amount: 500000 },
  { note: 'पुराना सामान/कबाड़ बिक्री (Scrap/carton box sale)', amount: 45000 },
  { note: 'कमीशन आय (Sales commission received)', amount: 180000 },
  { note: 'स्पेशल आर्डर सप्लाई (Special custom order delivery)', amount: 320000 },
  { note: 'दैनिक गल्ला नकद आमद (Daily counter cash)', amount: 410000 },
  { note: 'थोक पार्टी से शेष भुगतान (Balance payment from wholesale party)', amount: 680000 },
]

const GENERIC_EXPENSE_TEMPLATES = [
  { note: 'दुकान का किराया (Shop rent payment)', amount: 600000 },
  { note: 'बिजली बिल भुगतान (Electricity bill payment)', amount: 185000 },
  { note: 'दुकान का नया माल खरीदा (Stock inventory purchase)', amount: 850000 },
  { note: 'सफाई व चाय नाश्ता खर्च (Tea, snacks & cleaning expenses)', amount: 45000 },
  { note: 'स्टाफ दैनिक मजदूरी (Staff helper daily wages)', amount: 60000 },
  { note: 'पैकिंग थैली व टेप खरीदारी (Packing materials & plastic bags)', amount: 95000 },
  { note: 'दुकान मरम्मत व रखरखाव (Shop repair & maintenance)', amount: 150000 },
  { note: 'ट्रांसपोर्ट व टेम्पो भाड़ा (Transport & delivery tempo charge)', amount: 120000 },
]

/**
 * Seeds a given number (e.g. 7-8) of realistic dummy transactions for a specific category.
 */
export async function seedDummyEntriesForCategory(
  category: Category,
  accounts: Account[],
  parties: Party[] = [],
  count = 7
): Promise<number> {
  const key = category.key || ''
  const nameLower = `${category.key || ''} ${category.name_en || ''} ${category.name_hi || ''}`.toLowerCase()
  let templates = category.direction === 'in' ? GENERIC_INCOME_TEMPLATES : GENERIC_EXPENSE_TEMPLATES

  if (key === 'labor' || nameLower.includes('labor') || nameLower.includes('मजदूर') || nameLower.includes('लघोर') || nameLower.includes('लेबर')) {
    templates = DUMMY_TEMPLATES.labor
  } else if (key === 'equip' || nameLower.includes('equip') || nameLower.includes('औजार') || nameLower.includes('एकुइप') || nameLower.includes('इक्विप')) {
    templates = DUMMY_TEMPLATES.equip
  } else if (key === 'running_cost' || nameLower.includes('running') || nameLower.includes('रूनिङ') || nameLower.includes('रनिंग')) {
    templates = DUMMY_TEMPLATES.running_cost
  } else if (key === 'other_expense' || nameLower.includes('other expense') || nameLower.includes('ओथेर')) {
    templates = DUMMY_TEMPLATES.other_expense
  } else if (key === 'sugarcane_bought' || nameLower.includes('sugarcane b') || nameLower.includes('गन्ना खरीद') || nameLower.includes('बऔघ्त')) {
    templates = DUMMY_TEMPLATES.sugarcane_bought
  } else if (key === 'tins' || nameLower.includes('tin') || nameLower.includes('टीन') || nameLower.includes('टिंस')) {
    templates = DUMMY_TEMPLATES.tins
  } else if (key === 'sugarcane_sales' || nameLower.includes('gur') || nameLower.includes('गुड़') || (nameLower.includes('sugarcane') && category.direction === 'in')) {
    templates = DUMMY_TEMPLATES.sugarcane_sales
  } else if (key === 'bikri' || nameLower.includes('bikri') || nameLower.includes('बिक्री') || nameLower.includes('sale')) {
    templates = DUMMY_TEMPLATES.bikri
  } else if (key === 'anya_in' || nameLower.includes('anya') || nameLower.includes('other income') || nameLower.includes('आमद')) {
    templates = DUMMY_TEMPLATES.anya_in
  } else if (key === 'malik' || nameLower.includes('malik') || nameLower.includes('मालिक')) {
    templates = DUMMY_TEMPLATES.malik
  } else if (key === 'udhaar_mila' || nameLower.includes('udhaar mila') || nameLower.includes('उधार वापस') || nameLower.includes('wapas')) {
    templates = DUMMY_TEMPLATES.udhaar_mila
  } else if (nameLower.includes('dhaan') || nameLower.includes('धान') || nameLower.includes('paddy')) {
    templates = DUMMY_TEMPLATES.dhaan
  } else if (nameLower.includes('ghar') || nameLower.includes('घर') || nameLower.includes('home')) {
    templates = DUMMY_TEMPLATES.ghar
  } else if (nameLower.includes('cold') || nameLower.includes('कोल्ड')) {
    templates = DUMMY_TEMPLATES.cold
  }

  // Find wallets
  const cashWallet = accounts.find((a) => a.kind === 'cash') || accounts[0]
  const upiWallet = accounts.find((a) => a.kind === 'upi') || cashWallet
  const bankWallet = accounts.find((a) => a.kind === 'bank') || cashWallet
  const wallets = [cashWallet, upiWallet, bankWallet].filter(Boolean)

  const limit = Math.min(count, templates.length)
  let created = 0

  for (let i = 0; i < limit; i++) {
    const item = templates[i]
    const wallet = wallets[i % wallets.length]
    const party = parties.length > 0 ? parties[i % parties.length] : null
    const date = addDaysISO(todayISO(), -((i * 2) % 12))

    const txn: Txn = {
      id: uuid(),
      businessId: category.businessId,
      date,
      amount: item.amount,
      direction: category.direction,
      categoryId: category.id,
      accountId: wallet ? wallet.id : (cashWallet ? cashWallet.id : null),
      partyId: party ? party.id : null,
      onCredit: false,
      note: item.note,
      tags: ['dummy-sample'],
      createdBy: 'Sample Data Generator',
      createdAt: new Date(Date.now() - (i + 1) * 3600000).toISOString(),
      updatedAt: new Date(Date.now() - (i + 1) * 3600000).toISOString(),
      syncStatus: 'synced',
      history: [],
    }

    await saveTxn(txn)
    created++
  }

  return created
}

/**
 * Permanently removes all dummy sample transactions and their ledger lines
 * across the local database (or for a specific business).
 */
export async function removeAllDummyData(businessId?: string): Promise<number> {
  try {
    const dummyTxns = await db.txns
      .filter((t) => {
        const isDummy =
          (Array.isArray(t.tags) && t.tags.includes('dummy-sample')) ||
          (Array.isArray(t.tags) && t.tags.includes('dummy')) ||
          t.createdBy === 'Sample Data Generator'
        if (!isDummy) return false
        if (businessId && t.businessId !== businessId) return false
        return true
      })
      .toArray()

    if (dummyTxns.length === 0) return 0

    const ids = dummyTxns.map((t) => t.id)
    // Delete all associated ledger lines
    await db.lines.where('txnId').anyOf(ids).delete()
    // Delete the dummy txns
    await db.txns.bulkDelete(ids)

    console.log(`[dummyData] Successfully removed ${ids.length} dummy transactions`)
    return ids.length
  } catch (err) {
    console.error('removeAllDummyData error:', err)
    return 0
  }
}

/**
 * Ensures all active categories in a business have dummy transactions.
 */
export async function seedDummyEntriesForAllCategories(
  businessId: string,
  minCount = 4
): Promise<number> {
  const cats = await db.categories
    .where('businessId')
    .equals(businessId)
    .filter((c) => !c.deletedAt)
    .toArray()
  const accounts = await db.accounts.where('businessId').equals(businessId).toArray()
  const parties = await db.parties.where('businessId').equals(businessId).toArray()

  let totalCreated = 0
  for (const cat of cats) {
    const existingCount = await db.txns
      .where('categoryId')
      .equals(cat.id)
      .filter((t) => !t.deletedAt)
      .count()
    if (existingCount < minCount) {
      const needed = minCount - existingCount
      const created = await seedDummyEntriesForCategory(cat, accounts, parties, needed)
      totalCreated += created
    }
  }
  return totalCreated
}

/**
 * Migrates any existing credit/udhaar transactions to normal cash transactions,
 * completely removing the concept of Udhaar from existing and new data.
 */
export async function removeAllUdhaarTransactions(businessId: string) {
  try {
    const cashWallet =
      (await db.accounts.where('businessId').equals(businessId).filter((a) => a.kind === 'cash').first()) ||
      (await db.accounts.where('businessId').equals(businessId).first())

    const defaultAccountId = cashWallet?.id ?? null

    const txns = await db.txns
      .where('businessId')
      .equals(businessId)
      .filter((t) => !t.deletedAt && (t.onCredit || !t.accountId))
      .toArray()

    for (const t of txns) {
      t.onCredit = false
      if (!t.accountId) {
        t.accountId = defaultAccountId
      }
      await saveTxn(t)
    }
  } catch (err) {
    console.error('removeAllUdhaarTransactions error:', err)
  }
}

/**
 * Removes any roles in parentheses from party names (e.g. "Ramesh Kumar (Customer)" -> "Ramesh Kumar")
 */
export async function cleanPartyNames(businessId: string) {
  try {
    const parties = await db.parties.where('businessId').equals(businessId).toArray()
    for (const p of parties) {
      const cleaned = p.name.replace(/\s*\([^)]*\)$/, '').trim()
      if (cleaned !== p.name) {
        p.name = cleaned
        await db.parties.put(p)
      }
    }
  } catch (err) {
    console.error('cleanPartyNames error:', err)
  }
}

// Deprecated alias for backwards compatibility
export const fixDummyCreditEntries = removeAllUdhaarTransactions

