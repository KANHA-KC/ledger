// Rule-based Hinglish → Devanagari transliteration (offline fallback engine).
// Suggestion order: personal dictionary → built-in common words → rule variants.
// The plan's preferred engine (AI4Bharat IndicXlit) can be plugged in behind `suggest()` later.

import { db } from '../db/db'

const VOWELS: [string, string, string][] = [
  // roman, independent, matra
  ['aa', 'आ', 'ा'], ['ai', 'ऐ', 'ै'], ['au', 'औ', 'ौ'], ['ee', 'ई', 'ी'], ['ii', 'ई', 'ी'],
  ['oo', 'ऊ', 'ू'], ['uu', 'ऊ', 'ू'], ['ei', 'ऐ', 'ै'], ['ou', 'औ', 'ौ'], ['ri', 'ऋ', 'ृ'],
  ['a', 'अ', ''], ['i', 'इ', 'ि'], ['u', 'उ', 'ु'], ['e', 'ए', 'े'], ['o', 'ओ', 'ो'],
]
// 'ri' is only a vowel at word start (rishi); elsewhere r + i.

const CONS: [string, string][] = [
  ['ksh', 'क्ष'], ['chh', 'छ'], ['shh', 'ष'], ['gy', 'ज्ञ'],
  ['kh', 'ख'], ['gh', 'घ'], ['ch', 'च'], ['jh', 'झ'], ['Th', 'ठ'], ['Dh', 'ढ'], ['th', 'थ'], ['dh', 'ध'],
  ['ph', 'फ'], ['bh', 'भ'], ['sh', 'श'], ['ng', 'ङ'], ['Rh', 'ढ़'],
  ['k', 'क'], ['g', 'ग'], ['c', 'क'], ['j', 'ज'], ['T', 'ट'], ['D', 'ड'], ['N', 'ण'], ['t', 'त'], ['d', 'द'],
  ['n', 'न'], ['p', 'प'], ['b', 'ब'], ['m', 'म'], ['y', 'य'], ['r', 'र'], ['l', 'ल'], ['v', 'व'], ['w', 'व'],
  ['s', 'स'], ['h', 'ह'], ['z', 'ज़'], ['f', 'फ़'], ['q', 'क़'], ['x', 'क्स'], ['R', 'ड़'],
]

const HALANT = '्'
const ANUSVARA = 'ं'
const NO_ANUSVARA_BEFORE = new Set(['y', 'r', 'h', 'v', 'w', 'l', 'n', 'm'])

type Tok = { t: 'c'; roman: string; dev: string } | { t: 'v'; roman: string; ind: string; matra: string }

function tokenize(word: string): Tok[] {
  // Hinglish word-final 'y' after a consonant is a long ee: "pinky" → पिंकी, "party" → पार्टी
  if (/[^aeiouy]y$/i.test(word) && word.length > 2) word = word.slice(0, -1) + 'ee'
  const out: Tok[] = []
  let i = 0
  while (i < word.length) {
    let matched = false
    // vowels (ri only at start)
    for (const [r, ind, matra] of VOWELS) {
      if (r === 'ri' && i !== 0) continue
      if (word.startsWith(r, i)) {
        out.push({ t: 'v', roman: r, ind, matra })
        i += r.length
        matched = true
        break
      }
    }
    if (matched) continue
    for (const [r, dev] of CONS) {
      if (word.startsWith(r, i)) {
        out.push({ t: 'c', roman: r, dev })
        i += r.length
        matched = true
        break
      }
    }
    if (!matched) {
      // case-insensitive retry for capitals that are not special
      const lower = word[i].toLowerCase()
      const c = CONS.find(([r]) => r === lower)
      const v = VOWELS.find(([r]) => r === lower)
      if (c) out.push({ t: 'c', roman: lower, dev: c[1] })
      else if (v) out.push({ t: 'v', roman: lower, ind: v[1], matra: v[2] })
      i++
    }
  }
  return out
}

interface Opts {
  longFinalA: boolean // Hinglish "kiraya" → किराया (final a = ा)
  longFinalI: boolean // "bijli" → बिजली
  anusvara: boolean // "hindi" → हिंदी vs हिन्दी
  longMedialA: number // bitmask: which medial short 'a's become ा (for alternates)
}

function render(toks: Tok[], o: Opts): string {
  let s = ''
  let medialA = 0
  // collapse doubled final consonant: "bill" → बिल, "mall" → मॉल-ish
  if (toks.length >= 3) {
    const a = toks[toks.length - 1]
    const b = toks[toks.length - 2]
    if (a.t === 'c' && b.t === 'c' && a.roman === b.roman) toks = toks.slice(0, -1)
  }
  for (let i = 0; i < toks.length; i++) {
    const tk = toks[i]
    const next = toks[i + 1]
    if (tk.t === 'v') {
      const prev = toks[i - 1]
      if (prev && prev.t === 'c') continue // handled with the consonant
      s += tk.ind
      continue
    }
    // consonant
    if ((tk.roman === 'n' || tk.roman === 'm') && o.anusvara && next?.t === 'c' && !NO_ANUSVARA_BEFORE.has(next.roman) && i > 0 && toks[i - 1].t === 'v') {
      s += ANUSVARA
      continue
    }
    s += tk.dev
    if (!next) continue // final consonant: schwa deletion, no halant
    if (next.t === 'c') {
      s += HALANT
      continue
    }
    // consonant + vowel
    const v = next
    const vIsLast = i + 1 === toks.length - 1
    if (v.roman === 'a') {
      if (vIsLast && o.longFinalA && toks.length > 2) s += 'ा'
      else if (!vIsLast) {
        if (o.longMedialA & (1 << medialA)) s += 'ा'
        medialA++
      }
    } else if (v.roman === 'i' && vIsLast && o.longFinalI) s += 'ी'
    else s += v.matra
  }
  return s
}

// Common words where rules alone get it wrong. Kept small; the personal dictionary learns the rest.
const BUILTIN: Record<string, string> = {
  bijli: 'बिजली', kiraya: 'किराया', doodh: 'दूध', dudh: 'दूध', saaman: 'सामान', saman: 'सामान', samaan: 'सामान',
  bikri: 'बिक्री', udhaar: 'उधार', udhar: 'उधार', kharcha: 'खर्चा', kharch: 'खर्च', bill: 'बिल', bank: 'बैंक',
  upi: 'यूपीआई', galla: 'गल्ला', paisa: 'पैसा', paise: 'पैसे', rupaye: 'रुपये', rupay: 'रुपये', maal: 'माल',
  ghar: 'घर', dukaan: 'दुकान', dukan: 'दुकान', ramesh: 'रमेश', suresh: 'सुरेश', sunita: 'सुनीता', gupta: 'गुप्ता',
  sharma: 'शर्मा', verma: 'वर्मा', sahu: 'साहू', patel: 'पटेल', yadav: 'यादव', singh: 'सिंह', kumar: 'कुमार',
  traders: 'ट्रेडर्स', store: 'स्टोर', kirana: 'किराना', raipur: 'रायपुर', bilaspur: 'बिलासपुर', durg: 'दुर्ग',
  bhilai: 'भिलाई', dhamtari: 'धमतरी', korba: 'कोरबा', chhattisgarh: 'छत्तीसगढ़', diwali: 'दिवाली', holi: 'होली',
  salary: 'सैलरी', majdoori: 'मजदूरी', transport: 'ट्रांसपोर्ट', recharge: 'रिचार्ज', phone: 'फ़ोन', mobile: 'मोबाइल',
  chai: 'चाय', aaj: 'आज', kal: 'कल', diya: 'दिया', liya: 'लिया', mila: 'मिला', gaya: 'गया', aaya: 'आया',
  ka: 'का', ki: 'की', ke: 'के', ko: 'को', se: 'से', me: 'में', mein: 'में', aur: 'और', hai: 'है', tha: 'था',
  shop: 'शॉप', sabzi: 'सब्ज़ी', sabji: 'सब्जी', chawal: 'चावल', aata: 'आटा', atta: 'आटा', tel: 'तेल', cheeni: 'चीनी',
  chini: 'चीनी', dal: 'दाल', namak: 'नमक', sabun: 'साबुन', gas: 'गैस', diesel: 'डीज़ल', petrol: 'पेट्रोल',
  bhaiya: 'भैया', didi: 'दीदी', ji: 'जी', seth: 'सेठ', mistri: 'मिस्त्री', auto: 'ऑटो', rent: 'रेंट', loan: 'लोन',
  marammat: 'मरम्मत', kapda: 'कपड़ा', silai: 'सिलाई', chara: 'चारा', khaad: 'खाद', beej: 'बीज', dhaan: 'धान',
  hisaab: 'हिसाब', hisab: 'हिसाब', naya: 'नया', purana: 'पुराना', wapas: 'वापस', baki: 'बाकी', baaki: 'बाकी',
  shadi: 'शादी', dawai: 'दवाई', doctor: 'डॉक्टर', school: 'स्कूल', fees: 'फीस', fee: 'फीस', emi: 'ईएमआई',
  jama: 'जमा', nikala: 'निकाला', becha: 'बेचा', kharida: 'खरीदा', mahina: 'महीना', mahine: 'महीने',
}

let personal = new Map<string, { hi: string; count: number }[]>()

export async function loadPersonalDict() {
  const rows = await db.dict.toArray()
  personal = new Map()
  for (const r of rows) {
    const [roman] = r.roman.split('|')
    const list = personal.get(roman) ?? []
    list.push({ hi: r.hi, count: r.count })
    personal.set(roman, list)
  }
}

/** Learn a word the user accepted, so local names come up first next time. */
export async function learn(roman: string, hi: string) {
  roman = roman.toLowerCase()
  if (!roman || !hi) return
  const key = `${roman}|${hi}`
  const existing = await db.dict.get(key)
  const count = (existing?.count ?? 0) + 1
  await db.dict.put({ roman: key, hi, count })
  const list = (personal.get(roman) ?? []).filter((x) => x.hi !== hi)
  list.push({ hi, count })
  personal.set(roman, list)
}

export function suggest(word: string, max = 5): string[] {
  if (!word) return []
  const lower = word.toLowerCase()
  const out: string[] = []
  const add = (s: string) => { if (s && !out.includes(s)) out.push(s) }
  ;(personal.get(lower) ?? []).sort((a, b) => b.count - a.count).forEach((x) => add(x.hi))
  if (BUILTIN[lower]) add(BUILTIN[lower])
  // keep user-typed capitals (T, D, N, R) as retroflex hints; otherwise lowercase
  const w = /[TDNR]/.test(word) && word !== word.toUpperCase() ? word : lower
  const toks = tokenize(w)
  const medialCount = toks.filter((t, i) => t.t === 'v' && t.roman === 'a' && i > 0 && toks[i - 1].t === 'c' && i < toks.length - 1).length
  const base: Opts = { longFinalA: true, longFinalI: true, anusvara: true, longMedialA: 0 }
  add(render(toks, base))
  add(render(toks, { ...base, longFinalA: false }))
  // try lengthening each medial 'a' one at a time ("kirana" → किराना)
  for (let m = 0; m < Math.min(medialCount, 3); m++) add(render(toks, { ...base, longMedialA: 1 << m }))
  add(render(toks, { ...base, anusvara: false }))
  add(render(toks, { ...base, longFinalI: false }))
  return out.slice(0, max)
}

/** Transliterate a whole phrase with the top suggestion per word (used for search and storage). */
export function toDevanagari(text: string): string {
  return text.replace(/[A-Za-z]+/g, (w) => suggest(w, 1)[0] ?? w)
}

// ---- reverse (Devanagari → rough Roman), so "किराया" is findable by "kiraya" and vice versa ----
const REV: Record<string, string> = {
  'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'ऋ': 'ri',
  'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ृ': 'ri', 'ं': 'n', 'ँ': 'n', 'ः': 'h', 'ॉ': 'o',
}
for (const [r, d] of CONS) if (!(d in REV) && d.length === 1) REV[d] = r.toLowerCase()
Object.assign(REV, { 'क़': 'q', 'ज़': 'z', 'फ़': 'f', 'ड़': 'r', 'ढ़': 'rh', 'क्ष': 'ksh', 'ज्ञ': 'gy', '़': '' })

export function toRoman(text: string): string {
  let s = ''
  const chars = [...text.normalize('NFC')]
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]
    const n = chars[i + 1]
    if (c === HALANT) continue
    const r = REV[c]
    if (r === undefined) { s += c; continue }
    s += r
    const isCons = /[क-हक़-य़]/.test(c)
    if (isCons && n && !/[ा-्ंःँ़]/.test(n) && /[ऀ-ॿ]/.test(n)) s += 'a'
  }
  return s
}

export const hasDevanagari = (s: string) => /[ऀ-ॿ]/.test(s)

/** Normalised forms for bilingual search. */
export function searchKeys(s: string): string[] {
  const lower = s.toLowerCase().trim()
  if (!lower) return []
  if (hasDevanagari(lower)) return [lower, squash(toRoman(lower))]
  return [lower, toDevanagari(lower), squash(lower)]
}

/** Loose Roman comparison: collapse vowel length so "kiraya" ≈ "kiraaya". */
export const squash = (s: string) => s.toLowerCase().replace(/aa/g, 'a').replace(/ee|ii/g, 'i').replace(/oo|uu/g, 'u').replace(/(.)\1/g, '$1')

export function matches(haystack: string, query: string): boolean {
  if (!query.trim()) return true
  const h = haystack.toLowerCase()
  const hr = squash(hasDevanagari(h) ? toRoman(h) : h)
  return searchKeys(query).some((k) => h.includes(k) || hr.includes(squash(k)))
}
