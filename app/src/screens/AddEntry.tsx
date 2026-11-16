'use client'

// Amount → category → Save. Everything else has a default or is optional.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams, useNavigate } from '../lib/navigation'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ChevronLeft,
  Mic,
  Camera,
  Trash2,
  Calendar,
  Wallet,
  User,
  Paperclip,
  Check,
  ChevronDown,
  ChevronUp,
  Pencil,
} from 'lucide-react'
import { db, getSetting, setSetting, uuid } from '../db/db'
import { saveTxn, softDelete, undelete } from '../db/ledger'
import type { Direction, Txn } from '../db/types'
import { undoSave, useData, useToast } from '../store'
import { AppleNumpad } from '../components/apple/AppleNumpad'
import { PartyPicker } from '../components/PartyPicker'
import { TranslitInput } from '../components/TranslitInput'
import { Btn, CatIcon, Chip, Confirm, Field, cx, inputCls } from '../components/ui'
import { AppIcon } from '../components/AppIcon'
import { money, todayISO, addDaysISO, formatDate, goBack } from '../lib/format'
import { listen, parseVoice, speechSupported } from '../lib/voice'
import { compressImage } from '../lib/photo'
import { feedback, clickFeedback } from '../lib/speak'

export function AddEntry() {
  const { t } = useTranslation()
  const params = useParams<{ dir?: string }>()
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const toast = useToast()
  const { business, categories, accounts, txns, nm, lang, maps } = useData()
  const editId = sp.get('edit')
  const editing = editId ? txns.find((x) => x.id === editId) : undefined

  const [dir, setDir] = useState<Direction>(
    (editing?.direction as Direction) ?? (params.dir === 'out' ? 'out' : 'in')
  )
  const [amount, setAmount] = useState(editing ? String(editing.amount / 100) : sp.get('amount') ?? '')
  const [step, setStep] = useState<'amount' | 'category'>(
    editing || sp.get('amount') ? 'category' : 'amount'
  )
  const [catId, setCatId] = useState<string | null>(editing?.categoryId ?? sp.get('cat') ?? null)
  const [details, setDetails] = useState(
    !!editing || !!sp.get('party')
  )
  const [note, setNote] = useState(editing?.note ?? '')
  const [partyId, setPartyId] = useState<string | null>(editing?.partyId ?? sp.get('party') ?? null)
  const [walletId, setWalletId] = useState<string | null>(editing?.accountId ?? null)
  const [date, setDate] = useState(editing?.date ?? todayISO())
  const [tags, setTags] = useState(editing?.tags.join(', ') ?? '')
  const [photoId, setPhotoId] = useState<string | null>(editing?.photoId ?? null)
  const [err, setErr] = useState('')
  const [listening, setListening] = useState(false)
  const [heard, setHeard] = useState('')
  const [askDelete, setAskDelete] = useState(false)
  const stopRef = useRef<() => void>(() => {})

  const wallets = accounts.filter((a) => ['cash', 'bank', 'upi'].includes(a.kind) && !a.hidden)

  // Wallet defaults to last used
  useEffect(() => {
    if (walletId) return
    getSetting<string>('lastWallet', '').then((w) => {
      setWalletId(wallets.find((x) => x.id === w)?.id ?? wallets[0]?.id ?? null)
    })
  }, [walletId, wallets])

  // Most-used categories first (last 90 days)
  const usage = useMemo(() => {
    const m = new Map<string, number>()
    const since = addDaysISO(todayISO(), -90)
    for (const x of txns)
      if (x.categoryId && x.date >= since && !x.deletedAt)
        m.set(x.categoryId, (m.get(x.categoryId) ?? 0) + 1)
    return m
  }, [txns])

  const cats = categories
    .filter((c) => c.direction === dir && (!c.hidden || c.id === catId))
    .sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0) || a.sort - b.sort)
  const cat = catId ? maps.cats.get(catId) : undefined
  const paise = Math.round(Number(amount || 0) * 100)
  const tone = dir === 'in' ? 'in' : 'out'

  const photoUrl = useLiveQuery(async () => {
    if (!photoId) return null
    const p = await db.photos.get(photoId)
    return p ? URL.createObjectURL(p.blob) : null
  }, [photoId])

  const startVoice = () => {
    if (!speechSupported()) {
      setErr(t('add.voiceUnsupported') || 'Voice not supported on this browser')
      return
    }
    setErr('')
    setListening(true)
    stopRef.current = listen(
      lang,
      (text) => {
        const p = parseVoice(text)
        setHeard(text)
        if (p.amount) setAmount(String(p.amount / 100))
        let d = p.direction ?? dir
        if (p.categoryKey) {
          const c = categories.find(
            (x) => x.key === p.categoryKey && (!p.direction || x.direction === p.direction)
          )
          if (c) {
            d = c.direction
            setCatId(c.id)
          }
        }
        setDir(d)
        setNote(text)
        if (p.amount) setStep('category')
      },
      () => setListening(false)
    )
  }
  useEffect(() => () => stopRef.current(), [])

  const save = async (overrideCat?: string) => {
    const cid = overrideCat ?? catId
    if (!paise) {
      setErr(t('add.enterAmount') || 'Please enter amount')
      setStep('amount')
      return
    }
    const c = cid ? maps.cats.get(cid) : undefined
    if (!c) return
    const now = new Date().toISOString()
    const activeWalletId = walletId || wallets[0]?.id || null
    const tx: Txn = {
      id: editing?.id ?? uuid(),
      businessId: business.id,
      date,
      amount: paise,
      direction: c.direction,
      categoryId: c.id,
      accountId: activeWalletId,
      partyId,
      onCredit: false,
      note: note.trim(),
      tags: tags
        .split(/[,،]/)
        .map((s) => s.trim())
        .filter(Boolean),
      photoId,
      createdBy: business.ownerPhone,
      createdAt: editing?.createdAt ?? now,
      updatedAt: now,
      deletedAt: editing?.deletedAt ?? null,
      syncStatus: 'pending',
      history: editing?.history ?? [],
    }
    const prev = await saveTxn(tx)
    if (activeWalletId) await setSetting('lastWallet', activeWalletId)
    feedback()
    toast({
      text: `${editing ? t('add.updated') : t('add.saved')} · ${money(paise)}`,
      tone: 'ok',
      undo: () => undoSave(tx.id, prev),
    })
    if (await getSetting('guide', false)) await setSetting('guide', false)
    goBack(nav)
  }

  const header = (
    <div className="mb-4 flex items-center gap-3">
      <button
        type="button"
        onClick={() => (step === 'category' && !editing ? setStep('amount') : goBack(nav))}
        className="apple-press flex h-10 w-10 items-center justify-center rounded-full bg-white text-neutral-800 shadow-sm dark:bg-[#2C2C2E] dark:text-white dark:border dark:border-white/10"
        aria-label="Back"
      >
        <ChevronLeft className="h-6 w-6 stroke-[2.5]" />
      </button>

      {/* iOS Segmented Direction Pill */}
      <div className="flex flex-1 items-center rounded-xl bg-neutral-200/80 p-1 dark:bg-[#1C1C1E] dark:border dark:border-white/10">
        {(['in', 'out'] as const).map((d) => {
          const isActive = dir === d
          return (
            <button
              key={d}
              type="button"
              onClick={() => {
                clickFeedback()
                setDir(d)
                if (cat && cat.direction !== d) setCatId(null)
              }}
              className={`apple-press-sm flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-bold transition-all ${
                isActive
                  ? d === 'in'
                    ? 'bg-[#34C759] text-white shadow-md'
                    : 'bg-[#FF3B30] text-white shadow-md'
                  : 'text-[#6E6E73] dark:text-[#A1A1A6]'
              }`}
            >
              <span>{d === 'in' ? '↓ ' + (t('act.in') || 'Money In') : '↑ ' + (t('act.out') || 'Money Out')}</span>
            </button>
          )
        })}
      </div>
    </div>
  )

  const amountDisplay = (
    <button
      type="button"
      onClick={() => setStep('amount')}
      className={`apple-press mb-4 w-full rounded-2xl p-5 text-center transition-all ${
        dir === 'in'
          ? 'bg-emerald-500/10 hover:bg-emerald-500/15 dark:bg-emerald-500/20'
          : 'bg-rose-500/10 hover:bg-rose-500/15 dark:bg-rose-500/20'
      }`}
    >
      <div className="text-xs font-semibold text-[#6E6E73] dark:text-[#A1A1A6]">
        {editing ? t('add.editTitle') || 'Edit Entry' : t('add.amount') || 'Enter Amount'}
      </div>
      <div
        className={`tabular-numbers mt-1 text-5xl font-extrabold tracking-tight ${
          dir === 'in' ? 'text-[#1C7430] dark:text-[#30D158]' : 'text-[#D70015] dark:text-[#FF453A]'
        }`}
      >
        {money(paise)}
      </div>
    </button>
  )

  if (step === 'amount') {
    return (
      <div className="w-full space-y-4">
        {header}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {/* Left Column on Desktop: Amount Card & Voice Input */}
          <div className="flex flex-col gap-4">
            {amountDisplay}

            {heard && (
              <p className="w-full rounded-xl bg-neutral-100 p-2.5 text-center text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                {t('add.voiceHeard', { text: heard })}
              </p>
            )}

            {err && (
              <p className="text-center text-xs font-semibold text-[#FF3B30]">{err}</p>
            )}

            {/* Action Bar: Voice + Next Button */}
            <div className="grid grid-cols-[auto_1fr] gap-2.5">
              <button
                type="button"
                onClick={listening ? () => stopRef.current() : startVoice}
                className={`apple-press flex h-14 items-center gap-2 rounded-2xl px-5 text-sm font-bold transition-all ${
                  listening
                    ? 'animate-pulse bg-[#FF3B30] text-white shadow-lg shadow-[#FF3B30]/30'
                    : 'border border-black/[0.08] bg-white text-neutral-800 shadow-sm hover:bg-neutral-50 dark:border-white/[0.1] dark:bg-[#1C1C1E] dark:text-white'
                }`}
                aria-label={t('add.speak') || 'Voice entry'}
              >
                <Mic className={`h-5 w-5 ${listening ? 'text-white' : 'text-[#007AFF]'}`} />
                <span>{listening ? 'Listening...' : t('add.speak') || 'Voice'}</span>
              </button>

              <button
                type="button"
                disabled={!paise}
                onClick={() => setStep('category')}
                className={`apple-press flex h-14 items-center justify-center rounded-2xl px-6 text-base font-bold text-white shadow-lg transition-all disabled:opacity-40 disabled:pointer-events-none ${
                  dir === 'in'
                    ? 'bg-[#34C759] shadow-[#34C759]/25 hover:bg-[#30B752]'
                    : 'bg-[#FF3B30] shadow-[#FF3B30]/25 hover:bg-[#E0352A]'
                }`}
              >
                {t('act.next') || 'Next'} →
              </button>
            </div>
          </div>

          {/* Right Column on Desktop: Apple Numpad */}
          <div className="apple-card p-6 flex flex-col items-center justify-center">
            <AppleNumpad
              value={amount}
              onChange={(v) => {
                setAmount(v)
                setErr('')
              }}
              onDone={() => paise && setStep('category')}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full space-y-4">
      {header}
      {amountDisplay}

      {heard && (
        <p className="mb-3 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-300">
          {t('add.voiceHeard', { text: heard })} — {t('add.voiceCheck')}
        </p>
      )}

      {/* Pick Category Header */}
      <div className="mb-2.5 flex items-center justify-between px-1">
        <h2 className="apple-headline text-neutral-900 dark:text-white">
          {t('add.pickCategory') || 'Select Category'}
        </h2>
        <button
          type="button"
          onClick={() => nav('/categories')}
          className="apple-press text-xs font-semibold text-[#007AFF] hover:underline"
        >
          {t('add.moreCategories') || 'Manage'} →
        </button>
      </div>

      {/* Category Grid */}
      <div className="mb-5 grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
        {cats.map((c) => {
          const isSelected = catId === c.id
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                clickFeedback()
                setCatId(c.id)
                setErr('')
              }}
              className={`apple-press flex min-h-[92px] flex-col items-center justify-center gap-1.5 rounded-2xl border p-2 transition-all ${
                isSelected
                  ? 'border-[#007AFF] bg-white shadow-md ring-2 ring-[#007AFF] dark:border-[#0A84FF] dark:bg-[#2C2C2E] dark:ring-[#0A84FF]'
                  : 'border-black/[0.05] bg-white/80 hover:bg-white dark:border-white/[0.08] dark:bg-[#1C1C1E]'
              }`}
            >
              <CatIcon icon={c.icon} color={c.color} size="md" />
              <span className="truncate text-center text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                {nm(c)}
              </span>
            </button>
          )
        })}
      </div>

      {/* Details Inset Section */}
      {(catId || editing) && (
        <div className="mb-5">
          <button
            type="button"
            onClick={() => setDetails(!details)}
            className="apple-press apple-card mb-3 flex h-12 w-full items-center justify-between px-4 text-sm font-semibold text-neutral-800 dark:text-neutral-200"
          >
            <span>{details ? t('act.hideDetails') || 'Hide Details' : t('act.addDetails') || 'Add Details (Party, Wallet, Date...)'}</span>
            {details ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {details && (
            <div className="apple-card p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <Field label={t('add.party') || 'Person / Party'}>
                    <PartyPicker
                      value={partyId}
                      onChange={(id) => {
                        setPartyId(id)
                        setErr('')
                      }}
                    />
                  </Field>

                  <Field label={t('add.wallet') || 'Paid From / Received To'}>
                    <div className="flex flex-wrap gap-1.5">
                      {wallets.map((w) => (
                        <Chip
                          key={w.id}
                          active={walletId === w.id}
                          onClick={() => setWalletId(w.id)}
                        >
                          <AppIcon name={w.icon} className="h-3.5 w-3.5 shrink-0" /> {nm(w)}
                        </Chip>
                      ))}
                    </div>
                  </Field>

                  <Field label={t('add.tags') || 'Tags'}>
                    <TranslitInput
                      value={tags}
                      onChange={setTags}
                      placeholder={t('add.tagsPh') || 'e.g. urgent, wholesale'}
                    />
                  </Field>
                </div>

                <div className="space-y-4">
                  <Field label={t('add.note') || 'Note / Description'}>
                    <TranslitInput
                      value={note}
                      onChange={setNote}
                      placeholder={t('add.notePh') || 'Add a note or bill details...'}
                    />
                  </Field>

                  <Field label={t('add.date') || 'Date'}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip active={date === todayISO()} onClick={() => setDate(todayISO())}>
                        Today ({formatDate(todayISO(), lang)})
                      </Chip>
                      <Chip
                        active={date === addDaysISO(todayISO(), -1)}
                        onClick={() => setDate(addDaysISO(todayISO(), -1))}
                      >
                        Yesterday
                      </Chip>
                      <input
                        type="date"
                        className={`${inputCls} w-auto`}
                        value={date}
                        max={todayISO()}
                        onChange={(e) => e.target.value && setDate(e.target.value)}
                      />
                    </div>
                  </Field>

                  {/* Photo Upload */}
                  <Field label={t('add.photo') || 'Receipt / Bill Photo'}>
                    {photoUrl ? (
                      <div className="flex items-center gap-3">
                        <img
                          src={photoUrl}
                          alt="Bill receipt"
                          className="h-20 w-20 rounded-xl object-cover border border-black/10"
                        />
                        <Btn tone="ghost" onClick={() => setPhotoId(null)}>
                          {t('add.removePhoto') || 'Remove Photo'}
                        </Btn>
                      </div>
                    ) : (
                      <label className="apple-press flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 bg-neutral-50/50 text-sm font-semibold text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-300">
                        <Camera className="h-4 w-4" />
                        <span>{t('add.addPhoto') || 'Attach Bill Photo'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={async (e) => {
                            const f = e.target.files?.[0]
                            if (!f) return
                            const blob = await compressImage(f)
                            const id = uuid()
                            await db.photos.add({ id, blob, createdAt: new Date().toISOString() })
                            setPhotoId(id)
                          }}
                        />
                      </label>
                    )}
                  </Field>
                </div>
              </div>

              {editing && editing.history.length > 0 && (
                <p className="mt-2 text-xs text-neutral-400 flex items-center">
                  <Pencil className="h-3 w-3 mr-1 inline" /> {t('add.history', { count: editing.history.length })}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {err && (
        <p className="mb-3 text-center text-xs font-semibold text-[#FF3B30]">{err}</p>
      )}

      {/* Primary Sticky Save Button */}
      <div className="sticky bottom-4 z-20">
        <button
          type="button"
          disabled={!catId}
          onClick={() => save()}
          className={`apple-press flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-lg font-bold text-white shadow-xl transition-all disabled:opacity-40 disabled:pointer-events-none ${
            dir === 'in'
              ? 'bg-[#34C759] shadow-[#34C759]/30 hover:bg-[#30B752]'
              : 'bg-[#FF3B30] shadow-[#FF3B30]/30 hover:bg-[#E0352A]'
          }`}
        >
          <Check className="h-5 w-5 stroke-[3]" />
          <span>{t('act.save') || 'Save'}</span>
          {paise ? <span className="tabular-numbers">· {money(paise)}</span> : null}
        </button>
      </div>

      {editing && (
        <div className="mt-4">
          <button
            type="button"
            className="apple-press flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-[#FF3B30] hover:bg-rose-50 dark:hover:bg-rose-950/20"
            onClick={() => setAskDelete(true)}
          >
            <Trash2 className="h-4 w-4" />
            <span>{t('act.delete') || 'Delete Entry'}</span>
          </button>
          <Confirm
            open={askDelete}
            icon="Trash2"
            text={t('entries.deleteConfirm') || 'Move this entry to the recycle bin for 30 days?'}
            onNo={() => setAskDelete(false)}
            onYes={async () => {
              await softDelete(editing.id)
              toast({
                text: t('entries.deleted') || 'Entry moved to bin',
                tone: 'info',
                undo: () => undelete(editing.id),
              })
              goBack(nav)
            }}
          />
        </div>
      )}
    </div>
  )
}
