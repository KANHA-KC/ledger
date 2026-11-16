'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { ArrowLeftRight, Edit3, Plus, Wallet as WalletIcon, TrendingUp, TrendingDown } from 'lucide-react'
import { db, uuid } from '../db/db'
import { saveTxn } from '../db/ledger'
import type { Account } from '../db/types'
import { useData, useToast, undoSave } from '../store'
import { money, rupeesToPaise, todayISO, formatDate } from '../lib/format'
import { filterHref } from '../lib/filters'
import { Btn, Card, Chip, Field, Heading, Money, Sheet, inputCls } from '../components/ui'
import { TranslitInput } from '../components/TranslitInput'
import { AppIcon } from '../components/AppIcon'
import { feedback } from '../lib/speak'

export function Wallets() {
  const { t } = useTranslation()
  const { balances, accounts, nm, business, live, lang } = useData()
  const toast = useToast()
  const wallets = accounts.filter((a) => ['cash', 'bank', 'upi'].includes(a.kind))
  const [from, setFrom] = useState(wallets[0]?.id ?? '')
  const [to, setTo] = useState(wallets[1]?.id ?? '')
  const [amt, setAmt] = useState('')
  const [note, setNote] = useState('')
  const [editing, setEditing] = useState<Account | null>(null)
  const [val, setVal] = useState('')
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const transfers = live.filter((x) => x.direction === 'transfer').slice(0, 10)

  const transfer = async () => {
    if (from === to) {
      setErr(t('wallet.same') || 'From and To accounts cannot be the same')
      return
    }
    const paise = rupeesToPaise(amt)
    if (!paise) return
    const now = new Date().toISOString()
    const id = uuid()
    const prev = await saveTxn({
      id,
      businessId: business.id,
      date: todayISO(),
      amount: paise,
      direction: 'transfer',
      categoryId: null,
      accountId: from,
      toAccountId: to,
      partyId: null,
      onCredit: false,
      note,
      tags: [],
      createdBy: business.ownerPhone,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
      history: [],
    })
    feedback()
    toast({
      text: `${t('add.saved') || 'Transfer saved'} · ${money(paise)}`,
      tone: 'ok',
      undo: () => undoSave(id, prev),
    })
    setAmt('')
    setNote('')
    setErr('')
  }

  const openEdit = (a: Account) => {
    setEditing(a)
    setVal(String(a.opening / 100))
    setName(nm(a))
  }
  const manual = accounts.filter((a) => ['stock', 'asset', 'loan'].includes(a.kind))

  return (
    <div className="space-y-4">
      {/* Title */}
      <div>
        <h1 className="apple-large-title text-neutral-900 dark:text-white">
          {t('wallet.title') || 'Wallets & Accounts'}
        </h1>
        <p className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">Cash, bank accounts, UPI, and manual net worth assets</p>
      </div>

      {/* Apple Wallet Cards Grid */}
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {balances.wallets.map((w) => (
          <div
            key={w.account.id}
            className="apple-card relative overflow-hidden p-4 transition-all hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#007AFF]/10 text-[#007AFF] dark:bg-[#0A84FF]/20 dark:text-[#0A84FF]">
                <AppIcon name={w.account.icon} className="h-5 w-5" />
              </div>
              <button
                type="button"
                onClick={() => openEdit(w.account)}
                className="apple-press flex h-7 w-7 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-[#2C2C2E] dark:text-[#A1A1A6] dark:hover:text-white"
                aria-label={t('act.edit') || 'Edit'}
              >
                <Edit3 className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-2">
              <div className="truncate text-xs font-semibold text-[#6E6E73] dark:text-[#A1A1A6]">
                {nm(w.account)}
              </div>
              <div className="mt-0.5">
                <Money paise={w.balance} tone={w.balance < 0 ? 'out' : 'plain'} size="lg" />
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-black/[0.04] pt-2 text-[11px] text-[#8E8E93] dark:border-white/[0.06] dark:text-[#A1A1A6]">
              <span>Opening: {money(w.account.opening)}</span>
              <Link
                href={filterHref({ wallets: [w.account.id] })}
                className="apple-press font-semibold text-[#007AFF] hover:underline"
              >
                {t('act.seeAll') || 'Entries'} →
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Transfer & Assets Grid */}
      <div className="grid gap-4 md:grid-cols-2 items-start">
        {/* Transfer Card */}
        <div className="apple-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <ArrowLeftRight className="h-4 w-4 text-[#007AFF]" />
          <h3 className="apple-headline text-neutral-900 dark:text-white">
            {t('wallet.transferTitle') || 'Transfer Money'}
          </h3>
        </div>

        <div className="space-y-4">
          <Field label={t('wallet.from') || 'Transfer From'}>
            <div className="flex flex-wrap gap-1.5">
              {wallets.map((w) => (
                <Chip
                  key={w.id}
                  active={from === w.id}
                  onClick={() => setFrom(w.id)}
                >
                  <AppIcon name={w.icon} className="h-3.5 w-3.5 shrink-0" />
                  <span>{nm(w)}</span>
                </Chip>
              ))}
            </div>
          </Field>

          <Field label={t('wallet.to') || 'Transfer To'}>
            <div className="flex flex-wrap gap-1.5">
              {wallets.map((w) => (
                <Chip
                  key={w.id}
                  active={to === w.id}
                  onClick={() => setTo(w.id)}
                >
                  <AppIcon name={w.icon} className="h-3.5 w-3.5 shrink-0" />
                  <span>{nm(w)}</span>
                </Chip>
              ))}
            </div>
          </Field>

          <div className="grid gap-2.5 sm:grid-cols-[180px_1fr_auto]">
            <input
              className={`${inputCls} text-xl font-bold`}
              inputMode="numeric"
              placeholder="Amount ₹"
              value={amt}
              onChange={(e) => setAmt(e.target.value.replace(/[^\d.]/g, ''))}
              aria-label={t('misc.paise')}
            />
            <TranslitInput
              value={note}
              onChange={setNote}
              placeholder={t('wallet.transferNote') || 'Transfer note / reason'}
            />
            <Btn tone="blue" onClick={transfer} disabled={!amt}>
              {t('act.save') || 'Transfer'}
            </Btn>
          </div>

          {err && (
            <p className="text-xs font-semibold text-[#FF3B30]">{err}</p>
          )}

          {transfers.length > 0 && (
            <div className="mt-4 border-t border-black/[0.04] pt-3 dark:border-white/[0.06]">
              <div className="mb-2 text-xs font-semibold text-neutral-400">
                Recent Transfers
              </div>
              <ul className="divide-y divide-black/[0.04] text-xs dark:divide-white/[0.06]">
                {transfers.map((x) => (
                  <li key={x.id} className="flex items-center justify-between py-2">
                    <span className="text-neutral-600 dark:text-neutral-400">
                      {formatDate(x.date, lang)} · {nm(accounts.find((a) => a.id === x.accountId))} →{' '}
                      {nm(accounts.find((a) => a.id === x.toAccountId))}
                    </span>
                    <span className="tabular-numbers font-bold text-neutral-900 dark:text-white">
                      {money(x.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Manual Assets & Liabilities for Net Worth */}
      <div className="apple-card p-4">
        <h3 className="apple-headline mb-1 text-neutral-900 dark:text-white">
          {t('wallet.assets') || 'Stock, Assets & Loans'}
        </h3>
        <p className="mb-3 text-xs text-neutral-500">
          {t('wallet.netWorthNote') || 'Manual asset values used for net worth calculations'}
        </p>

        <div className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
          {manual.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => openEdit(a)}
              className="apple-press flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-neutral-50/70 dark:hover:bg-neutral-800/40"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                <AppIcon name={a.icon} className="h-4 w-4" />
              </div>
              <span className="flex-1 text-sm font-semibold text-neutral-900 dark:text-white">
                {nm(a)}
              </span>
              <Money paise={a.opening} tone={a.kind === 'loan' ? 'out' : 'plain'} size="sm" />
              <Edit3 className="h-3.5 w-3.5 text-neutral-400" />
            </button>
          ))}
        </div>
      </div>
      </div>

      {/* Edit Opening / Manual Value Sheet */}
      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? nm(editing) : ''}
        footer={
          <Btn
            tone="blue"
            className="w-full"
            onClick={async () => {
              if (!editing) return
              const changes: Partial<Account> = { opening: rupeesToPaise(val || 0) }
              if (name.trim() && ['cash', 'bank', 'upi'].includes(editing.kind)) {
                changes[lang === 'hi' ? 'name_hi' : 'name_en'] = name.trim()
              }
              await db.accounts.update(editing.id, changes)
              setEditing(null)
            }}
          >
            {t('act.save') || 'Save'}
          </Btn>
        }
      >
        <div className="space-y-4">
          {editing && ['cash', 'bank', 'upi'].includes(editing.kind) && (
            <Field label={t('wallet.rename') || 'Account Name'}>
              <TranslitInput value={name} onChange={setName} />
            </Field>
          )}
          <Field
            label={
              editing && ['cash', 'bank', 'upi'].includes(editing.kind)
                ? t('wallet.opening') || 'Opening Balance'
                : t('wallet.editValue') || 'Current Manual Value'
            }
          >
            <input
              className={`${inputCls} text-2xl font-bold`}
              inputMode="numeric"
              value={val}
              onChange={(e) => setVal(e.target.value.replace(/[^\d.]/g, ''))}
              autoFocus
            />
          </Field>
        </div>
      </Sheet>
    </div>
  )
}
