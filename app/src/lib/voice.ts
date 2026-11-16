// Basic voice entry: browser speech recognition (hi-IN / en-IN) + a keyword parser.
// "500 rupaye ka saaman kharida" → { amount: 50000 paise, direction: 'out', categoryKey: 'maal' }

import { CATEGORY_KEYWORDS } from '../db/seed'
import type { Direction } from '../db/types'

type SR = {
  lang: string; interimResults: boolean; maxAlternatives: number; continuous: boolean
  start(): void; stop(): void; abort(): void
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}

export function speechSupported() {
  const w = window as unknown as Record<string, unknown>
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition)
}

export function listen(lang: 'hi' | 'en', onText: (text: string) => void, onEnd: (err?: string) => void): () => void {
  const w = window as unknown as Record<string, new () => SR>
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition
  if (!Ctor) { onEnd('unsupported'); return () => {} }
  const r = new Ctor()
  r.lang = lang === 'hi' ? 'hi-IN' : 'en-IN'
  r.interimResults = false
  r.maxAlternatives = 1
  r.continuous = false
  let done = false
  r.onresult = (e) => { onText(e.results[0][0].transcript) }
  r.onerror = (e) => { if (!done) { done = true; onEnd(e.error) } }
  r.onend = () => { if (!done) { done = true; onEnd() } }
  r.start()
  return () => r.abort()
}

const DEVA_DIGITS = '०१२३४५६७८९'
const WORD_NUM: Record<string, number> = {
  ek: 1, एक: 1, do: 2, दो: 2, teen: 3, तीन: 3, char: 4, chaar: 4, चार: 4, paanch: 5, panch: 5, पांच: 5, पाँच: 5,
  chhe: 6, chhah: 6, छह: 6, छः: 6, saat: 7, सात: 7, aath: 8, आठ: 8, nau: 9, नौ: 9, das: 10, दस: 10, bees: 20, बीस: 20,
  pachaas: 50, pachas: 50, पचास: 50, dedh: 1.5, डेढ़: 1.5, dhai: 2.5, ढाई: 2.5, sava: 1.25, सवा: 1.25,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twenty: 20, fifty: 50,
}
const MULT: Record<string, number> = {
  sau: 100, सौ: 100, hundred: 100, hazaar: 1000, hazar: 1000, हज़ार: 1000, हजार: 1000, thousand: 1000,
  lakh: 100000, लाख: 100000, lac: 100000, crore: 10000000, करोड़: 10000000,
}

const IN_WORDS = ['becha', 'beche', 'bechi', 'bikri', 'mila', 'mile', 'aaya', 'aya', 'jama', 'received', 'sold', 'बेचा', 'बेची', 'बेचे', 'बिक्री', 'मिला', 'मिले', 'आया', 'आए', 'जमा', 'बिका']
const OUT_WORDS = ['kharida', 'kharidi', 'kharcha', 'diya', 'diye', 'gaya', 'bhara', 'chukaya', 'paid', 'bought', 'spent', 'खरीदा', 'खरीदी', 'खरीदे', 'खर्च', 'खर्चा', 'दिया', 'दिए', 'गया', 'भरा', 'चुकाया']

export interface Parsed { amount: number | null; direction: Direction | null; categoryKey: string | null; note: string }

export function parseVoice(raw: string): Parsed {
  const text = raw.toLowerCase().replace(/[०-९]/g, (d) => String(DEVA_DIGITS.indexOf(d))).replace(/(\d),(?=\d)/g, '$1')
  const tokens = text.split(/[\s,।.?!]+/).filter(Boolean)

  // amount: "1500", "5 hazaar", "paanch sau", "dedh lakh", "2 हज़ार 500"
  let total = 0
  let current = 0
  let found = false
  for (const tk of tokens) {
    const n = /^\d+(\.\d+)?$/.test(tk) ? Number(tk) : WORD_NUM[tk]
    if (n !== undefined) { current += n; found = true; continue }
    const m = MULT[tk]
    if (m && found) { total += (current || 1) * m; current = 0; continue }
    if (found && (tk.startsWith('rup') || tk.startsWith('रु') || tk === '₹' || tk === 'rs')) continue
    if (found && (total || current) && !m) break // stop at first non-number word after the amount
  }
  total += current
  const amount = found && total > 0 ? Math.round(total * 100) : null

  const has = (list: string[]) => list.some((w) => text.includes(w))
  let direction: Direction | null = has(IN_WORDS) ? 'in' : null
  if (has(OUT_WORDS)) direction = direction && text.search(/बेच|bech|bikri|बिक्री/) >= 0 ? 'in' : 'out'

  let categoryKey: string | null = null
  let best = 0
  for (const [key, kws] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of kws) {
      if (text.includes(kw.toLowerCase()) && kw.length > best) { best = kw.length; categoryKey = key }
    }
  }
  if (!direction && categoryKey) direction = null // category decides later
  return { amount, direction, categoryKey, note: raw.trim() }
}
