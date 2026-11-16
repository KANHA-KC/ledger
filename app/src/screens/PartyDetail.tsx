'use client'

import { useParams, useNavigate } from '../lib/navigation'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, Phone, MessageCircle, ArrowDownLeft, ArrowUpRight, Check } from 'lucide-react'
import { useData } from '../store'
import { formatDate, money, goBack } from '../lib/format'
import { Btn, CatIcon, Empty, Money } from '../components/ui'

function reminderLink(phone: string, text: string) {
  const p = phone.replace(/\D/g, '')
  return `https://wa.me/${p ? '91' + p.slice(-10) : ''}?text=${encodeURIComponent(text)}`
}

export function PartyDetail() {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation()
  const nav = useNavigate()
  const { maps, live, lines, balances, categories, nm, lang, business, accounts } = useData()
  const p = maps.parties.get(id ?? '')

  if (!p) {
    return (
      <div className="apple-card p-12 text-center">
        <Empty icon="Search" title="Party Not Found" />
      </div>
    )
  }

  const bal = balances.byParty.get(p.id) ?? 0
  const udhaarAcc = new Set(
    accounts.filter((a) => a.kind === 'receivable' || a.kind === 'payable').map((a) => a.id)
  )

  // Running balance from the udhaar ledger lines of this party
  const effect = new Map<string, number>()
  for (const l of lines)
    if (l.partyId === p.id && udhaarAcc.has(l.accountId))
      effect.set(l.txnId, (effect.get(l.txnId) ?? 0) + l.debit - l.credit)

  const entries = live
    .filter((x) => x.partyId === p.id)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))

  let run = 0
  const rows = entries
    .map((x) => {
      run += effect.get(x.id) ?? 0
      return { x, run }
    })
    .reverse()

  const catId = (key: string) => categories.find((c) => c.key === key)?.id ?? ''
  const status =
    bal > 0
      ? t('party.theyOwe') || 'To Receive'
      : bal < 0
      ? t('party.youOwe') || 'To Pay'
      : t('party.settled') || 'Settled'
  const msg =
    t('party.reminder', {
      name: p.name,
      business: business.name,
      amount: money(Math.abs(bal)),
    }) ||
    `Namaste ${p.name}, friendly reminder that pending balance of ${money(Math.abs(bal))} is due for ${business.name}.`

  return (
    <div className="space-y-4">
      {/* iOS Contact Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => goBack(nav)}
          className="apple-press flex h-10 w-10 items-center justify-center rounded-full bg-white text-neutral-800 shadow-sm dark:bg-[#1C1C1E] dark:text-neutral-200"
          aria-label={t('act.back') || 'Back'}
        >
          <ChevronLeft className="h-6 w-6 stroke-[2.5]" />
        </button>
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-tr from-[#FF9500] to-[#FFCC00] text-xl font-bold text-white shadow-sm">
          {p.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold text-neutral-900 dark:text-white">{p.name}</h1>
          <div className="flex items-center gap-1.5 text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
            {p.phone && <span>+91 {p.phone} ·</span>}
            <span className="capitalize">{t(`party.type.${p.type}`) || p.type}</span>
          </div>
        </div>
      </div>

      {/* Balance & Action Buttons Card */}
      <div className="apple-card p-5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[#6E6E73] dark:text-[#A1A1A6]">
            {status}
          </span>
        </div>

        <div className="mt-2 text-center">
          <div
            className={`tabular-numbers text-4xl font-extrabold ${
              bal > 0 ? 'text-[#1C7430] dark:text-[#30D158]' : bal < 0 ? 'text-[#D70015] dark:text-[#FF453A]' : 'text-neutral-900 dark:text-white'
            }`}
          >
            {money(Math.abs(bal))}
          </div>
        </div>

        {/* Action Row */}
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button
            type="button"
            onClick={() =>
              nav(
                `/add/in?cat=${catId(bal < 0 ? 'udhaar_liya' : 'udhaar_mila')}&party=${p.id}${
                  bal > 0 ? `&amount=${bal / 100}` : ''
                }`
              )
            }
            className="apple-press flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[#34C759] text-xs font-bold text-white shadow-sm hover:bg-[#30B752]"
          >
            <ArrowDownLeft className="h-4 w-4 stroke-[3]" />
            <span>{t('party.paisaMila') || 'Paisa Mila'}</span>
          </button>

          <button
            type="button"
            onClick={() =>
              nav(
                `/add/out?cat=${catId(bal < 0 ? 'udhaar_chukaya' : 'udhaar_diya')}&party=${p.id}${
                  bal < 0 ? `&amount=${-bal / 100}` : ''
                }`
              )
            }
            className="apple-press flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[#FF3B30] text-xs font-bold text-white shadow-sm hover:bg-[#E0352A]"
          >
            <ArrowUpRight className="h-4 w-4 stroke-[3]" />
            <span>{t('party.paisaDiya') || 'Paisa Diya'}</span>
          </button>

          {p.phone && (
            <a
              href={`tel:${p.phone}`}
              className="apple-press flex h-11 items-center justify-center gap-1.5 rounded-xl border border-black/[0.08] bg-white text-xs font-bold text-neutral-800 shadow-sm hover:bg-neutral-50 dark:border-white/[0.1] dark:bg-[#2C2C2E] dark:text-white"
            >
              <Phone className="h-4 w-4 text-[#007AFF]" />
              <span>{t('act.call') || 'Call'}</span>
            </a>
          )}

          {p.phone && bal > 0 && (
            <a
              href={reminderLink(p.phone, msg)}
              target="_blank"
              rel="noreferrer"
              className="apple-press flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[#25D366] text-xs font-bold text-white shadow-sm hover:bg-[#20BA5A]"
            >
              <MessageCircle className="h-4 w-4" />
              <span>{t('act.whatsapp') || 'WhatsApp'}</span>
            </a>
          )}
        </div>
      </div>

      {/* Statement Timeline */}
      <div className="apple-card overflow-hidden">
        <div className="border-b border-black/[0.06] bg-neutral-50/70 px-4 py-3 dark:border-white/[0.08] dark:bg-neutral-800/40">
          <h3 className="apple-headline text-neutral-900 dark:text-white">
            Ledger History / हिसाब विवरण
          </h3>
        </div>

        {rows.length === 0 ? (
          <div className="p-8">
            <Empty icon="BookOpen" title={t('party.noEntries') || 'No transactions with this party yet'} />
          </div>
        ) : (
          <div className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
            {rows.map(({ x, run }) => {
              const c = maps.cats.get(x.categoryId ?? '')
              return (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => nav(`/add/${x.direction}?edit=${x.id}`)}
                  className="apple-press flex w-full items-center gap-3.5 p-3.5 text-left transition-colors hover:bg-neutral-50/70 dark:hover:bg-neutral-800/40"
                >
                  <CatIcon icon={c?.icon ?? 'Tag'} color={c?.color ?? '#007AFF'} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-neutral-900 dark:text-white">
                      {nm(c) || t('misc.noCategory') || 'Entry'}
                    </div>
                    <div className="truncate text-xs text-neutral-500">
                      {formatDate(x.date, lang)}
                      {x.note && ` · ${x.note}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <Money
                      paise={x.amount}
                      tone={x.direction === 'in' ? 'in' : 'out'}
                      arrow
                      size="sm"
                    />
                    <div className="text-[11px] font-medium text-neutral-400">
                      {t('party.runningBalance') || 'Balance'}: {money(run)}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
