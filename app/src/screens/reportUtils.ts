import type { TFunction } from 'i18next'
import type { Txn } from '../db/types'
import type { useData } from '../store'
import { download, entriesRows, printHTML, toCSV } from '../lib/export'
import { formatDate, money } from '../lib/format'

type D = ReturnType<typeof useData>

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export function entryHead(t: TFunction) {
  return [t('reports.date_col'), t('reports.type_col'), t('reports.category_col'), t('reports.amount_col'), t('reports.wallet_col'),
    t('reports.party_col'), t('reports.note_col'), t('filter.tag'), t('reports.debit'), t('reports.credit')]
}

export function downloadEntriesCSV(list: Txn[], d: D, t: TFunction, name = 'hisaab-entries') {
  const rows = entriesRows([...list].reverse(), { ...d.maps, lang: d.lang }, entryHead(t))
  download(`${name}-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows), 'text/csv;charset=utf-8')
}

export function entriesTable(list: Txn[], d: D, t: TFunction) {
  const rows = list.map((x) => {
    const c = d.maps.cats.get(x.categoryId ?? '')
    const p = d.maps.parties.get(x.partyId ?? '')
    const cls = x.direction === 'in' ? 'in' : x.direction === 'out' ? 'out' : ''
    return `<tr><td>${formatDate(x.date, d.lang)}</td><td>${esc(d.nm(c) || (x.direction === 'transfer' ? (t('entries.transfer') || 'Transfer') : ''))}</td><td>${esc(p?.name ?? '')}</td><td>${esc(x.note)}</td>
<td class="n ${cls}">${x.direction === 'in' ? '+' : x.direction === 'out' ? '−' : ''}${money(x.amount)}</td></tr>`
  }).join('')
  return `<table><thead><tr><th>${t('reports.date_col')}</th><th>${t('reports.category_col')}</th><th>${t('reports.party_col')}</th><th>${t('reports.note_col')}</th><th class="n">${t('reports.amount_col')}</th></tr></thead><tbody>${rows}</tbody></table>`
}

export function printEntries(list: Txn[], d: D, t: TFunction, summary: string) {
  printHTML(`${d.business.name} — ${t('entries.title')}`,
    `<h1>${esc(d.business.name)}</h1><div class="sub">${esc(summary)}</div>${entriesTable(list, d, t)}`, d.lang)
}
