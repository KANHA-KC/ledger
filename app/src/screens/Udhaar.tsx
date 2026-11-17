'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useNavigate } from '../lib/navigation'
import { useTranslation } from 'react-i18next'
import { MessageCircle, Check, ArrowDownLeft, ArrowUpRight, Search, Clock, User } from 'lucide-react'
import { useData } from '../store'
import type { LedgerLine } from '../db/types'
import { daysBetween, money, todayISO } from '../lib/format'
import { matches } from '../lib/translit'
import { Btn, Card, Chip, Empty, Money } from '../components/ui'
import { AppleSegmentedControl } from '../components/apple/AppleSegmentedControl'
import { TranslitInput } from '../components/TranslitInput'

/** For each party: date since which the current balance has been open (oldest due). */
export function oldestDue(lines: LedgerLine[], recvId: string, payId: string) {
  const byParty = new Map<string, LedgerLine[]>()
  for (const l of lines)
    if (l.partyId && (l.accountId === recvId || l.accountId === payId))
      byParty.set(l.partyId, [...(byParty.get(l.partyId) ?? []), l])
  const out = new Map<string, string>()
  for (const [pid, ls] of byParty) {
    ls.sort((a, b) => a.date.localeCompare(b.date))
    let run = 0
    let since = ''
    for (const l of ls) {
      const before = run
      run += l.debit - l.credit
      if (before === 0 || Math.sign(before) !== Math.sign(run)) since = l.date
      if (run === 0) since = ''
    }
    if (since) out.set(pid, since)
  }
  return out
}

export function reminderLink(phone: string, text: string) {
  const p = phone.replace(/\D/g, '')
  return `https://wa.me/${p ? '91' + p.slice(-10) : ''}?text=${encodeURIComponent(text)}`
}

export function Udhaar() {
  const { t } = useTranslation()
  const nav = useNavigate()
  const { parties, balances, lines, accounts, categories, business } = useData()
  const [tab, setTab] = useState<'get' | 'give'>('get')
  const [q, setQ] = useState('')
  const recv = accounts.find((a) => a.kind === 'receivable')!.id
  const pay = accounts.find((a) => a.kind === 'payable')!.id
  const since = useMemo(() => oldestDue(lines, recv, pay), [lines, recv, pay])
  const catId = (key: string) => categories.find((c) => c.key === key)?.id ?? ''

  const rows = parties
    .map((p) => ({ p, bal: balances.byParty.get(p.id) ?? 0 }))
    .filter((r) => (tab === 'get' ? r.bal > 0 : r.bal < 0))
    .filter((r) => matches(`${r.p.name} ${r.p.nameAlt}`, q))
    .sort((a, b) => (since.get(a.p.id) ?? '9').localeCompare(since.get(b.p.id) ?? '9')) // oldest first
  const settled = parties.filter((p) => !(balances.byParty.get(p.id) ?? 0))

  return (
    <div className="space-y-4">
      {/* Title & Quick Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="apple-large-title text-neutral-900 dark:text-white">
            {t('udhaar.title') || 'Udhaar Ledger'}
          </h1>
          <p className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
            {tab === 'get'
              ? `To Receive: ${money(balances.receivable)}`
              : `To Pay: ${money(balances.payable)}`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => nav(`/add/out?cat=${catId('udhaar_diya')}`)}
            className="apple-press flex h-9 items-center gap-1.5 rounded-full bg-[#FF9500] px-3.5 text-xs font-bold text-white shadow-sm hover:bg-[#E58600]"
          >
            <span>+ {t('udhaar.giveUdhaar') || 'Give Udhaar'}</span>
          </button>
        </div>
      </div>

      {/* Apple Segmented Control */}
      <div className="w-full sm:max-w-md">
        <AppleSegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            {
              value: 'get',
              label: `${t('udhaar.toGet') || 'Lene Hain'} (${money(balances.receivable)})`,
              icon: <ArrowDownLeft className="h-4 w-4 text-[#1C7430] dark:text-[#30D158]" />,
            },
            {
              value: 'give',
              label: `${t('udhaar.toGive') || 'Dene Hain'} (${money(balances.payable)})`,
              icon: <ArrowUpRight className="h-4 w-4 text-[#D70015] dark:text-[#FF453A]" />,
            },
          ]}
        />
      </div>

      {/* Search Bar if parties exist */}
      {parties.length > 3 && (
        <TranslitInput
          value={q}
          onChange={setQ}
          placeholder={t('party.searchPh') || 'Search customer or supplier...'}
        />
      )}

      {/* Inset Grouped Party List */}
      <div className="apple-card overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-8">
            <Empty
              icon={tab === 'get' ? 'Coins' : 'Handshake'}
              title={
                tab === 'get'
                  ? t('udhaar.emptyGet') || 'No pending receivables'
                  : t('udhaar.emptyGive') || 'No pending payables'
              }
            />
          </div>
        ) : (
          <div className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
            {rows.map(({ p, bal }) => {
              const s = since.get(p.id)
              const days = s ? daysBetween(s, todayISO()) : 0
              const msg =
                t('party.reminder', {
                  name: p.name,
                  business: business.name,
                  amount: money(Math.abs(bal)),
                }) ||
                `Namaste ${p.name}, friendly reminder that pending balance of ${money(Math.abs(bal))} is due for ${business.name}. Please settle at your earliest convenience.`

              return (
                <div
                  key={p.id}
                  className="flex flex-col gap-3 p-4 transition-colors hover:bg-neutral-50/50 sm:flex-row sm:items-center sm:justify-between dark:hover:bg-neutral-800/30"
                >
                  <Link
                    href={`/party/${p.id}`}
                    className="apple-press flex min-w-0 flex-1 items-center gap-3"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#007AFF] text-base font-bold text-white shadow-sm">
                      {p.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-base font-semibold text-neutral-900 dark:text-white">
                        {p.name}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
                        {p.phone && <span>+91 {p.phone}</span>}
                        {s && (
                          <span
                            className={`flex items-center gap-1 font-medium ${
                              days > 30 ? 'font-bold text-[#D70015] dark:text-[#FF453A]' : 'text-[#8E8E93] dark:text-[#A1A1A6]'
                            }`}
                          >
                            <Clock className="h-3 w-3" />
                            {t('party.since', { days }) || `${days} days ago`}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>

                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <div className="text-right">
                      <div
                        className={`tabular-numbers text-base font-bold ${
                          bal > 0 ? 'text-[#1C7430] dark:text-[#30D158]' : 'text-[#D70015] dark:text-[#FF453A]'
                        }`}
                      >
                        {money(Math.abs(bal))}
                      </div>
                      <div className="text-[11px] font-medium text-[#8E8E93] dark:text-[#A1A1A6]">
                        {bal > 0
                          ? t('party.theyOwe') || 'To receive'
                          : t('party.youOwe') || 'To pay'}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {bal > 0 ? (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              nav(
                                `/add/in?cat=${catId('udhaar_mila')}&party=${p.id}&amount=${
                                  bal / 100
                                }`
                              )
                            }
                            className="apple-press flex h-9 items-center gap-1 rounded-xl bg-[#34C759] px-3 text-xs font-bold text-white shadow-sm hover:bg-[#30B752]"
                          >
                            <Check className="h-3.5 w-3.5 stroke-[3]" />
                            <span>{t('party.paisaMila') || 'Received'}</span>
                          </button>
                          <a
                            href={reminderLink(p.phone, msg)}
                            target="_blank"
                            rel="noreferrer"
                            className="apple-press flex h-9 w-9 items-center justify-center rounded-xl bg-[#25D366]/15 text-[#25D366] hover:bg-[#25D366]/25"
                            aria-label={t('act.whatsapp') || 'WhatsApp'}
                            title="Send WhatsApp Reminder"
                          >
                            <MessageCircle className="h-4 w-4" />
                          </a>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            nav(
                              `/add/out?cat=${catId('udhaar_chukaya')}&party=${p.id}&amount=${
                                -bal / 100
                              }`
                            )
                          }
                          className="apple-press flex h-9 items-center gap-1 rounded-xl bg-[#FF3B30] px-3 text-xs font-bold text-white shadow-sm hover:bg-[#E0352A]"
                        >
                          <Check className="h-3.5 w-3.5 stroke-[3]" />
                          <span>{t('party.paisaDiya') || 'Paid'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Settled Parties Section */}
      {settled.length > 0 && (
        <div className="pt-2">
          <div className="mb-2 flex items-center gap-1.5 px-1">
            <h2 className="text-xs font-semibold text-[#6E6E73] dark:text-[#A1A1A6]">
              {t('party.settled') || 'Settled Accounts'}
            </h2>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {settled.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => nav(`/party/${p.id}`)}
                className="apple-press inline-flex h-8 items-center gap-1 rounded-full border border-black/[0.06] bg-white px-3 text-xs font-medium text-neutral-800 hover:bg-neutral-50 dark:border-white/[0.08] dark:bg-[#1C1C1E] dark:text-neutral-200"
              >
                <User className="h-3 w-3 text-neutral-400" />
                <span>{p.name}</span>
                <Check className="h-3 w-3 text-[#1C7430] dark:text-[#30D158]" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
