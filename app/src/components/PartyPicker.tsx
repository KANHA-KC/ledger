'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, User, Search, X } from 'lucide-react'
import { db, uuid } from '../db/db'
import type { Party } from '../db/types'
import { useData } from '../store'
import { hasDevanagari, matches, toDevanagari, toRoman } from '../lib/translit'
import { Btn, Chip, Field, Money, inputCls } from './ui'
import { TranslitInput } from './TranslitInput'

export async function createParty(
  businessId: string,
  name: string,
  phone: string,
  type: Party['type']
) {
  const p: Party = {
    id: uuid(),
    businessId,
    name: name.trim(),
    nameAlt: hasDevanagari(name) ? toRoman(name) : toDevanagari(name),
    phone: phone.replace(/\D/g, '').slice(-10),
    type,
    createdAt: new Date().toISOString(),
  }
  await db.parties.add(p)
  return p
}

export function PartyPicker({
  value,
  onChange,
}: {
  value: string | null
  onChange: (id: string | null) => void
}) {
  const { t } = useTranslation()
  const { parties, balances, business } = useData()
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [type, setType] = useState<Party['type']>('customer')

  const list = parties
    .filter((p) => matches(`${p.name} ${p.nameAlt}`, q))
    .sort(
      (a, b) =>
        Math.abs(balances.byParty.get(b.id) ?? 0) -
        Math.abs(balances.byParty.get(a.id) ?? 0)
    )

  if (adding) {
    return (
      <div className="apple-card p-4">
        <Field label={t('party.name') || 'Party Name'}>
          <TranslitInput
            value={name}
            onChange={setName}
            placeholder={t('party.namePh') || 'Customer / Supplier name'}
            autoFocus
          />
        </Field>
        <Field label={t('party.phone') || 'Phone Number'}>
          <input
            className={inputCls}
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="98xxxxxxxx"
          />
        </Field>
        <div className="no-scrollbar mb-4 flex gap-1.5 overflow-x-auto">
          {(['customer', 'supplier', 'worker', 'lender', 'other'] as const).map((k) => (
            <Chip key={k} active={type === k} onClick={() => setType(k)}>
              {t(`party.type.${k}`) || k}
            </Chip>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Btn tone="ghost" onClick={() => setAdding(false)}>
            {t('act.cancel') || 'Cancel'}
          </Btn>
          <Btn
            tone="blue"
            disabled={!name.trim()}
            onClick={async () => {
              const p = await createParty(business.id, name, phone, type)
              onChange(p.id)
              setAdding(false)
              setName('')
              setPhone('')
            }}
          >
            {t('act.save') || 'Save'}
          </Btn>
        </div>
      </div>
    )
  }

  return (
    <div>
      {parties.length > 5 && (
        <div className="mb-2.5">
          <TranslitInput
            value={q}
            onChange={setQ}
            placeholder={t('party.searchPh') || 'Search customer/supplier...'}
          />
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => {
            setName(q)
            setAdding(true)
          }}
          className="apple-press inline-flex h-9 items-center gap-1 rounded-full border border-dashed border-[#007AFF] bg-[#007AFF]/5 px-3 text-xs font-semibold text-[#007AFF] hover:bg-[#007AFF]/10"
        >
          <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
          <span>{t('party.new') || 'New Party'}</span>
        </button>

        {list.slice(0, 14).map((p) => {
          const bal = balances.byParty.get(p.id) ?? 0
          const isSelected = value === p.id
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange(isSelected ? null : p.id)}
              className={`apple-press inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-all ${
                isSelected
                  ? 'bg-[#FF9500] font-semibold text-white shadow-sm'
                  : 'border border-black/[0.08] bg-white text-neutral-800 hover:bg-neutral-50 dark:border-white/[0.1] dark:bg-[#2C2C2E] dark:text-neutral-200 dark:hover:bg-[#3A3A3C]'
              }`}
            >
              <div
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                  isSelected ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-600 dark:bg-[#1C1C1E] dark:text-neutral-300'
                }`}
              >
                {p.name.charAt(0)}
              </div>
              <span className="truncate">{p.name}</span>
              {bal !== 0 && (
                <span
                  className={`text-[11px] font-semibold ${
                    isSelected
                      ? 'text-white'
                      : bal > 0
                      ? 'text-[#1C7430] dark:text-[#30D158]'
                      : 'text-[#D70015] dark:text-[#FF453A]'
                  }`}
                >
                  {bal > 0 ? '+' : '-'}₹{Math.abs(Math.round(bal / 100))}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
