'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock as LockIcon, ShieldAlert, Zap } from 'lucide-react'
import { checkPin, setPin, verifyOtp, DEMO_PIN, DEMO_OTP } from '../lib/auth'
import { Btn, inputCls } from '../components/ui'
import { PinPad } from './PinPad'

export function Lock({
  onUnlock,
  businessName,
  phone,
}: {
  onUnlock: () => void
  businessName: string
  phone: string
}) {
  const { t } = useTranslation()
  const [err, setErr] = useState('')
  const [mode, setMode] = useState<'pin' | 'otp' | 'newPin'>('pin')
  const [otp, setOtp] = useState('')

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-y-auto bg-[#F2F2F7]/95 p-6 backdrop-blur-2xl dark:bg-black/95">
      {/* Brand Icon */}
      <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-[22px] bg-gradient-to-tr from-[#34C759] to-[#007AFF] text-3xl font-extrabold text-white shadow-lg">
        ₹
      </div>
      <div className="mb-8 flex items-center gap-1.5 text-sm font-semibold text-[#6E6E73] dark:text-[#A1A1A6]">
        <LockIcon className="h-4 w-4" />
        <span>{businessName}</span>
      </div>

      {mode === 'pin' && (
        <>
          <PinPad
            key="pin"
            title={t('lock.title') || 'Enter Passcode'}
            subtitle="Hisaab is locked"
            error={err}
            onDone={async (p) => {
              if (await checkPin(p)) {
                onUnlock()
              } else {
                setErr(t('lock.wrong') || 'Wrong passcode, try again')
                try {
                  navigator.vibrate?.([60, 40, 60])
                } catch {
                  /* noop */
                }
              }
            }}
          />
          <div className="mt-6 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={async () => {
                await setPin(DEMO_PIN)
                onUnlock()
              }}
              className="apple-press flex items-center gap-2 rounded-2xl border border-black/[0.08] bg-white/90 px-4 py-2.5 text-xs font-bold text-neutral-800 shadow-sm backdrop-blur-md transition-all hover:bg-white dark:border-white/[0.12] dark:bg-[#2C2C2E] dark:text-white dark:hover:bg-[#3A3A3C]"
            >
              <Zap className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
              <span>{t('lock.demoUnlock') || 'One-Click Demo Unlock (PIN: 1234)'}</span>
            </button>

            <button
              className="apple-press text-xs font-semibold text-[#007AFF] dark:text-[#0A84FF] hover:underline"
              onClick={() => {
                setErr('')
                setMode('otp')
              }}
            >
              {t('lock.forgot') || 'Forgot Passcode?'}
            </button>
          </div>
        </>
      )}

      {mode === 'otp' && (
        <form
          className="w-full max-w-xs"
          onSubmit={async (e) => {
            e.preventDefault()
            if (await verifyOtp(phone, otp)) {
              setErr('')
              setMode('newPin')
            } else {
              setErr(t('onb.wrongOtp') || 'Invalid OTP code')
            }
          }}
        >
          <div className="text-center">
            <h1 className="apple-title-2 mb-1 text-neutral-900 dark:text-white">
              {t('onb.otpTitle') || 'Verify Phone'}
            </h1>
            <p className="mb-4 text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
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
            onClick={() => setOtp(DEMO_OTP)}
            className="apple-press mt-3 flex w-full items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-left text-xs font-medium text-amber-800 transition-colors hover:bg-amber-500/15 dark:text-amber-400 dark:hover:bg-amber-500/20"
          >
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" />
            <span>{t('onb.demoOtp') || 'Demo mode: click to auto-fill 123456'}</span>
          </button>

          {err && (
            <p className="mt-2 text-center text-xs font-semibold text-[#FF3B30]">{err}</p>
          )}

          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <Btn
              tone="ghost"
              onClick={() => {
                setErr('')
                setMode('pin')
              }}
            >
              {t('act.back') || 'Back'}
            </Btn>
            <Btn tone="blue" type="submit" disabled={otp.length !== 6}>
              {t('act.next') || 'Next'}
            </Btn>
          </div>
        </form>
      )}

      {mode === 'newPin' && (
        <PinPad
          key="new"
          title={t('onb.pinTitle') || 'Set New Passcode'}
          subtitle="Choose a 4-digit code"
          onDone={async (p) => {
            await setPin(p)
            onUnlock()
          }}
        />
      )}
    </div>
  )
}
