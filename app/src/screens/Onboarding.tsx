'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ArrowRight, Check, ShieldAlert, Sparkles, Zap } from 'lucide-react'
import { AppIcon } from '../components/AppIcon'
import { setLanguage } from '../i18n'
import { BUSINESS_TYPES, createBusiness } from '../db/seed'
import type { Business, BusinessType } from '../db/types'
import { setSetting, db, claimLocalDataForOrg } from '../db/db'
import { setPin, verifyOtp, sendOtp } from '../lib/auth'
import { isCloudEnabled, createOrgCloud } from '../lib/supabase'
import { triggerSync } from '../lib/sync'
import { loginWithDemoAccount } from '../lib/demo'
import { clickFeedback } from '../lib/speak'
import { Btn, Field, inputCls } from '../components/ui'
import { TranslitInput } from '../components/TranslitInput'
import { AppleNumpad } from '../components/apple/AppleNumpad'
import { money } from '../lib/format'
import { PinPad } from './PinPad'

type Step = 'lang' | 'phone' | 'otp' | 'pin' | 'pin2' | 'biz' | 'opening'

export function Onboarding({ onDone }: { onDone: (b: Business) => void }) {
  const { t, i18n } = useTranslation()
  const [step, setStep] = useState<Step>('lang')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [err, setErr] = useState('')
  const [pin1, setPin1] = useState('')
  const [type, setType] = useState<BusinessType | null>(null)
  const [name, setName] = useState('')
  const [opening, setOpening] = useState('')
  const [demoLoading, setDemoLoading] = useState(false)

  const handleDemoLogin = async () => {
    try {
      setDemoLoading(true)
      clickFeedback()
      const b = await loginWithDemoAccount()
      onDone(b)
    } catch (e) {
      console.error(e)
      setErr('Demo login error')
    } finally {
      setDemoLoading(false)
    }
  }

  const finish = async (openingRupees: string) => {
    const bizName = name.trim() || t(`onb.type.${type ?? 'other'}`) || 'Hisaab Store'
    const bizType = type ?? 'other'
    const lang = i18n.language === 'en' ? 'en' : 'hi'

    let cloudOrg: { org_id: string; business_id: string } | null = null
    if (isCloudEnabled()) {
      try {
        cloudOrg = await createOrgCloud(bizName, bizName, bizType, lang)
      } catch (e) {
        console.warn('[Onboarding] Cloud org creation deferred/offline:', e)
      }
    }

    const b = await createBusiness({
      name: bizName,
      type: bizType,
      ownerPhone: phone,
      language: lang,
      openingCash: Math.round(Number(openingRupees || 0) * 100),
    })

    if (cloudOrg) {
      b.orgId = cloudOrg.org_id
      await db.businesses.update(b.id, { orgId: cloudOrg.org_id })
      await claimLocalDataForOrg(cloudOrg.org_id, b.id)
      triggerSync(b.id)
    }

    await setSetting('activeBusiness', b.id)
    await setSetting('guide', true)
    onDone(b)
  }

  const wrap = (children: React.ReactNode, back?: Step) => (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F2F2F7] p-5 dark:bg-black">
      <div className="w-full max-w-md">
        {/* Top bar with back and logo */}
        <div className="mb-6 flex items-center justify-between">
          {back ? (
            <button
              onClick={() => {
                setErr('')
                setStep(back)
              }}
              className="apple-press flex h-10 w-10 items-center justify-center rounded-full bg-white text-neutral-700 shadow-sm dark:bg-[#1C1C1E] dark:text-neutral-200"
              aria-label={t('act.back') || 'Back'}
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          ) : (
            <div className="h-10 w-10" />
          )}

          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#007AFF] text-base font-extrabold text-white shadow-sm">
              ₹
            </div>
            <span className="apple-headline text-neutral-900 dark:text-white">
              {t('app.name') || 'Hisaab'}
            </span>
          </div>

          <div className="h-10 w-10" />
        </div>

        {/* Card Content */}
        <div className="apple-card p-6 shadow-xl dark:bg-[#1C1C1E]">
          {children}
        </div>
      </div>
    </div>
  )

  if (step === 'lang') {
    return wrap(
      <>
        <div className="mb-6 text-center">
          <h1 className="apple-title-2 text-neutral-900 dark:text-white">
            Choose Your Language
          </h1>
          <p className="mt-1 text-sm text-[#6E6E73] dark:text-[#A1A1A6]">
            अपनी भाषा चुनें · English or हिंदी
          </p>
        </div>

        <div className="grid gap-3">
          {(['hi', 'en'] as const).map((l) => (
            <button
              key={l}
              onClick={() => {
                clickFeedback()
                setLanguage(l)
                setStep('phone')
              }}
              className="apple-press flex min-h-[90px] items-center gap-4 rounded-2xl border border-black/[0.06] bg-neutral-50/60 p-5 text-left transition-all hover:border-[#007AFF] hover:bg-[#007AFF]/5 dark:border-white/[0.08] dark:bg-neutral-800/60"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-2xl font-bold text-[#007AFF] shadow-sm dark:bg-[#2C2C2E]">
                {l === 'hi' ? 'अ' : 'A'}
              </div>
              <div className="flex-1">
                <div className="text-xl font-bold text-neutral-900 dark:text-white">
                  {l === 'hi' ? 'हिंदी' : 'English'}
                </div>
                <div className="text-xs text-neutral-500">
                  {l === 'hi' ? 'सरल बहीखाता हिंदी में' : 'Simple business ledger'}
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-6 border-t border-black/[0.06] pt-5 dark:border-white/[0.08]">
          <button
            type="button"
            disabled={demoLoading}
            onClick={handleDemoLogin}
            className="apple-press group relative flex w-full items-center justify-between overflow-hidden rounded-2xl border border-[#007AFF]/25 bg-gradient-to-r from-[#007AFF]/10 via-[#34C759]/10 to-[#007AFF]/10 p-4 text-left transition-all hover:border-[#007AFF] hover:shadow-md dark:border-[#007AFF]/35 dark:from-[#007AFF]/15 dark:to-[#34C759]/15"
          >
            <div className="flex items-center gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#007AFF] text-lg font-bold text-white shadow-sm">
                <Zap className="h-5 w-5 fill-white text-white" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-sm font-bold text-neutral-900 dark:text-white">
                  <span>{t('onb.demoLogin') || 'One-Click Demo Login'}</span>
                  <span className="rounded-full bg-[#007AFF]/15 px-2 py-0.5 text-[10px] font-bold text-[#007AFF] dark:bg-[#007AFF]/25 dark:text-[#0A84FF]">
                    TEST
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {t('onb.demoLoginDesc') || 'Instant test with preloaded Kirana store & full transaction ledger'}
                </p>
              </div>
            </div>
            {demoLoading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#007AFF] border-t-transparent" />
            ) : (
              <ArrowRight className="h-4 w-4 text-[#007AFF] transition-transform group-hover:translate-x-0.5" />
            )}
          </button>
          <div className="mt-2 text-center text-[11px] text-neutral-400">
            Passcode: <strong className="font-mono text-neutral-600 dark:text-neutral-300">1234</strong>
          </div>
        </div>
      </>
    )
  }

  if (step === 'phone') {
    return wrap(
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          const p = phone.replace(/\D/g, '')
          if (p.length !== 10) return setErr(t('onb.invalidPhone') || 'Enter valid 10-digit number')
          setErr('')
          const res = await sendOtp(p)
          if (res.success) {
            setStep('otp')
          } else {
            setErr(res.error || 'Failed to send OTP')
          }
        }}
      >
        <div className="mb-5">
          <h1 className="apple-title-2 text-neutral-900 dark:text-white">
            {t('onb.phoneTitle') || 'Phone Number'}
          </h1>
          <p className="mt-0.5 text-xs text-neutral-500">We will send an OTP code</p>
        </div>

        <div className="mb-2 flex gap-2">
          <div className="flex h-[46px] items-center rounded-xl border border-black/10 bg-neutral-100 px-3.5 text-base font-bold text-neutral-700 dark:border-white/10 dark:bg-neutral-800 dark:text-neutral-300">
            +91
          </div>
          <input
            className={`${inputCls} text-xl font-bold tracking-wider`}
            inputMode="numeric"
            autoFocus
            maxLength={10}
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
            placeholder={t('onb.phonePh') || '98xxxxxxxx'}
            aria-label={t('onb.phoneTitle')}
          />
        </div>

        {err && (
          <p className="mb-3 text-xs font-semibold text-[#FF3B30]">{err}</p>
        )}

        <Btn tone="blue" type="submit" className="mt-4 w-full">
          {t('onb.sendOtp') || 'Send OTP'}
        </Btn>

        <div className="mt-4 border-t border-black/[0.06] pt-4 dark:border-white/[0.08]">
          <button
            type="button"
            disabled={demoLoading}
            onClick={handleDemoLogin}
            className="apple-press flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-100 py-3 text-xs font-bold text-neutral-800 transition-all hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
          >
            {demoLoading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-600 border-t-transparent" />
            ) : (
              <span className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                <span>{t('onb.demoLogin') || 'One-Click Demo Login for Test'}</span>
              </span>
            )}
          </button>
        </div>
      </form>,
      'lang'
    )
  }

  if (step === 'otp') {
    return wrap(
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (await verifyOtp(phone, otp)) {
            setErr('')
            setStep('pin')
          } else {
            setErr(t('onb.wrongOtp') || 'Wrong OTP')
          }
        }}
      >
        <div className="mb-4 text-center">
          <h1 className="apple-title-2 text-neutral-900 dark:text-white">
            {t('onb.otpTitle') || 'Enter 6-Digit OTP'}
          </h1>
          <p className="text-xs text-neutral-500">
            {t('onb.otpSent', { phone: '+91 ' + phone }) || `Code sent to +91 ${phone}`}
          </p>
        </div>

        <input
          className={`${inputCls} text-center text-3xl font-bold tracking-[0.4em]`}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={6}
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
          aria-label={t('onb.otpTitle')}
        />

        <button
          type="button"
          onClick={() => setOtp('123456')}
          className="apple-press mt-3 flex w-full items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-left text-xs font-medium text-amber-800 transition-colors hover:bg-amber-500/15 dark:text-amber-400 dark:hover:bg-amber-500/20"
        >
          <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" />
          <span>{t('onb.demoOtp') || 'Demo mode: click to auto-fill 123456'}</span>
        </button>

        {err && (
          <p className="mt-2 text-center text-xs font-semibold text-[#FF3B30]">{err}</p>
        )}

        <Btn tone="blue" type="submit" className="mt-4 w-full" disabled={otp.length !== 6}>
          {t('act.next') || 'Next'}
        </Btn>
      </form>,
      'phone'
    )
  }

  if (step === 'pin') {
    return wrap(
      <PinPad
        key="pin1"
        title={t('onb.pinTitle') || 'Create 4-Digit Passcode'}
        subtitle="Used to secure your account"
        error={err}
        onDone={(p) => {
          setPin1(p)
          setErr('')
          setStep('pin2')
        }}
      />
    )
  }

  if (step === 'pin2') {
    return wrap(
      <PinPad
        key="pin2"
        title={t('onb.pinConfirm') || 'Confirm Passcode'}
        subtitle="Re-enter your 4-digit code"
        onDone={async (p) => {
          if (p !== pin1) {
            setErr(t('onb.pinMismatch') || 'Passcode does not match')
            setStep('pin')
            return
          }
          await setPin(p)
          setStep('biz')
        }}
      />
    )
  }

  if (step === 'biz') {
    return wrap(
      <>
        <div className="mb-4">
          <h1 className="apple-title-2 text-neutral-900 dark:text-white">
            {t('onb.bizType') || 'Business Type'}
          </h1>
          <p className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">Pick the category that fits best</p>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {BUSINESS_TYPES.map((b) => {
            const isSelected = type === b.type
            return (
              <button
                key={b.type}
                type="button"
                onClick={() => {
                  clickFeedback()
                  setType(b.type)
                }}
                className={`apple-press flex min-h-[90px] flex-col items-center justify-center gap-1.5 rounded-2xl border p-2 transition-all ${
                  isSelected
                    ? 'border-[#007AFF] bg-[#007AFF]/10 text-[#007AFF] shadow-sm ring-2 ring-[#007AFF]'
                    : 'border-black/[0.06] bg-neutral-50 text-neutral-800 hover:bg-neutral-100 dark:border-white/[0.08] dark:bg-neutral-800 dark:text-neutral-200'
                }`}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-200/50 dark:bg-neutral-700/50 text-neutral-800 dark:text-neutral-200">
                  <AppIcon name={b.icon} className="h-6 w-6 stroke-[1.75]" />
                </div>
                <span className="text-center text-xs font-bold leading-tight">
                  {t(`onb.type.${b.type}`) || b.type}
                </span>
              </button>
            )
          })}
        </div>

        <Field label={t('onb.bizName') || 'Business Name'}>
          <TranslitInput
            value={name}
            onChange={setName}
            placeholder={t('onb.bizNamePh') || 'e.g. Gupta General Store'}
          />
        </Field>

        <Btn
          tone="blue"
          className="mt-4 w-full"
          disabled={!type}
          onClick={() => setStep('opening')}
        >
          {t('act.next') || 'Next'}
        </Btn>
      </>
    )
  }

  return wrap(
    <>
      <div className="mb-2">
        <h1 className="apple-title-2 text-neutral-900 dark:text-white">
          {t('onb.opening') || 'Opening Cash / गल्ला'}
        </h1>
        <p className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">{t('onb.openingHint') || 'Cash in hand right now'}</p>
      </div>

      <div className="mb-5 rounded-2xl border border-black/[0.06] bg-neutral-50 p-4 text-center dark:border-white/[0.08] dark:bg-[#2C2C2E]">
        <span className="tabular-numbers text-4xl font-extrabold text-[#1C7430] dark:text-[#30D158]">
          {money(Number(opening || 0) * 100)}
        </span>
      </div>

      <div className="flex justify-center">
        <AppleNumpad value={opening} onChange={setOpening} />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Btn tone="ghost" onClick={() => finish('')}>
          {t('act.skip') || 'Skip'}
        </Btn>
        <Btn tone="in" onClick={() => finish(opening)}>
          {t('onb.start') || 'Start Hisaab'}
        </Btn>
      </div>
    </>,
    'biz'
  )
}
