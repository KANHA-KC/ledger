// Exports: Excel-compatible CSV (UTF-8 BOM so Devanagari opens correctly), printable PDF, full JSON backup.
import { db } from '../db/db'
import type { Account, Category, Party, Txn } from '../db/types'

export function download(name: string, data: BlobPart, type: string) {
  const blob = new Blob([data], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

const csvCell = (v: unknown) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCSV(rows: unknown[][]) {
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n')
}

/** Entries with accounting columns for the CA view (debit/credit appear only in exports). */
export function entriesRows(
  txns: Txn[], ctx: { cats: Map<string, Category>; accounts: Map<string, Account>; parties: Map<string, Party>; lang: string },
  head: string[],
) {
  const name = (o?: { name_en: string; name_hi: string }) => (o ? (ctx.lang === 'hi' ? o.name_hi : o.name_en) : '')
  return [
    head,
    ...txns.map((t) => [
      t.date,
      t.direction === 'in' ? 'Money In' : t.direction === 'out' ? 'Money Out' : 'TRANSFER',
      name(ctx.cats.get(t.categoryId ?? '')),
      (t.amount / 100).toFixed(2),
      name(ctx.accounts.get(t.accountId ?? '')) || 'Cash',
      ctx.parties.get(t.partyId ?? '')?.name ?? '',
      t.note,
      t.tags.join(' '),
      t.direction === 'out' ? (t.amount / 100).toFixed(2) : '',
      t.direction === 'in' ? (t.amount / 100).toFixed(2) : '',
    ]),
  ]
}

export function printHTML(title: string, bodyHtml: string, lang: string) {
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.write(`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Mukta:wght@400;700&display=swap" rel="stylesheet">
<style>body{font-family:Mukta,'Noto Sans Devanagari',sans-serif;margin:24px;color:#111}h1{font-size:22px;margin:0 0 4px}
.sub{color:#555;margin-bottom:16px}table{border-collapse:collapse;width:100%;font-size:13px;margin:12px 0}
th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
.cards{display:flex;gap:12px}.card{border:1px solid #ccc;border-radius:8px;padding:10px 14px;flex:1}.card b{font-size:20px;display:block}
.in{color:#15803d}.out{color:#c2410c}@media print{button{display:none}}</style></head><body>${bodyHtml}
<script>window.onload=()=>setTimeout(()=>window.print(),400)</script></body></html>`)
  w.document.close()
  return true
}

export async function exportAll() {
  const [businesses, accounts, categories, parties, txns, lines, dict] = await Promise.all([
    db.businesses.toArray(), db.accounts.toArray(), db.categories.toArray(), db.parties.toArray(),
    db.txns.toArray(), db.lines.toArray(), db.dict.toArray(),
  ])
  download(`hisaab-backup-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), businesses, accounts, categories, parties, txns, lines, dict }, null, 2),
    'application/json')
}

export async function shareText(text: string) {
  if (navigator.share) {
    try { await navigator.share({ text }); return } catch { /* cancelled */ return }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
}

export async function shareFile(file: File, text: string) {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], text }); return true } catch { return true }
  }
  return false
}
