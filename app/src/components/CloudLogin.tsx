'use client'

// Real sign-in against Supabase: phone OTP (needs an SMS provider in Supabase) or an email code.
// Only methods switched on in Supabase (Auth → Providers) are offered.

import { useEffect, useRef, useState } from 'react'
import { Mail, Smartphone } from 'lucide-react'
import { sendOtp, verifyOtp, type LoginMethod } from '../lib/auth'
import { getAuthProviders, supabase } from '../lib/supabase'
import { Btn, cx, inputCls } from './ui'

export function CloudLogin({ onSignedIn, initialPhone = '' }: { onSignedIn: (contact: { phone: string; email: string }) => void; initialPhone?: string }) {
  const [providers, setProviders] = useState<{ phone: boolean; email: boolean } | null>(null)
  const [method, setMethod] = useState<LoginMethod>('phone')
  const [phone, setPhone] = useState(initialPhone)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const doneRef = useRef(false)
  const finish = (c: { phone: string; email: string }) => {
    if (doneRef.current) return // verifyOtp and the auth listener can both report the sign-in
    doneRef.current = true
    onSignedIn(c)
  }

  useEffect(() => {
    getAuthProviders().then((p) => {
      setProviders(p)
      if (!p.phone && p.email) setMethod('email')
    })
  }, [])

  // The email may contain a magic link instead of / as well as a code: opening it signs in too.
  useEffect(() => {
    if (!supabase) return
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) finish({ phone: phone.replace(/\D/g, ''), email: session.user.email ?? '' })
    })
    return () => data.subscription.unsubscribe()
  }, [phone]) // eslint-disable-line react-hooks/exhaustive-deps

  const contact = method === 'phone' ? phone.replace(/\D/g, '') : email.trim()
  const validContact = method === 'phone' ? contact.length === 10 : /^\S+@\S+\.\S+$/.test(contact)

  const send = async () => {
    if (!validContact) return setErr(method === 'phone' ? 'Enter a 10-digit mobile number' : 'Enter a valid email address')
    setBusy(true)
    setErr('')
    const r = await sendOtp(contact, method)
    setBusy(false)
    if (r.success) setSent(true)
    else setErr(r.error || 'Could not send the code')
  }

  const verify = async () => {
    setBusy(true)
    setErr('')
    const r = await verifyOtp(contact, code, method)
    setBusy(false)
    if (r.ok) finish({ phone: method === 'phone' ? contact : '', email: method === 'email' ? contact.toLowerCase() : '' })
    else setErr(r.error || 'Wrong code')
  }

  if (!providers) return <div className="py-8 text-center text-sm text-neutral-500">Loading…</div>

  if (!providers.phone && !providers.email) {
    return (
      <p className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
        No sign-in method is enabled in Supabase. Turn on Email (and later Phone) under Authentication → Providers.
      </p>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (sent) verify()
        else send()
      }}
    >
      {providers.phone && providers.email && !sent && (
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800">
          {(['phone', 'email'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMethod(m); setErr('') }}
              className={cx('flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-bold',
                method === m ? 'bg-white text-neutral-900 shadow-sm dark:bg-[#2C2C2E] dark:text-white' : 'text-neutral-500')}
            >
              {m === 'phone' ? <Smartphone className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
              {m === 'phone' ? 'Mobile' : 'Email'}
            </button>
          ))}
        </div>
      )}

      {!sent ? (
        <>
          {method === 'phone' ? (
            <div className="flex gap-2">
              <div className="flex h-[46px] items-center rounded-xl border border-black/10 bg-neutral-100 px-3.5 text-base font-bold text-neutral-700 dark:border-white/10 dark:bg-neutral-800 dark:text-neutral-300">+91</div>
              <input className={`${inputCls} text-xl font-bold tracking-wider`} inputMode="numeric" autoFocus maxLength={10}
                value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} placeholder="98xxxxxxxx" aria-label="Mobile number" />
            </div>
          ) : (
            <input className={`${inputCls} text-lg`} type="email" inputMode="email" autoFocus autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" aria-label="Email" />
          )}
          <p className="mt-2 text-xs text-neutral-500">
            Use the same {method === 'phone' ? 'number' : 'email'} on every device to see the same data.
          </p>
        </>
      ) : (
        <>
          <p className="mb-2 text-center text-sm text-neutral-600 dark:text-neutral-300">
            Code sent to <b>{method === 'phone' ? '+91 ' + contact : contact}</b>
            {method === 'email' && <span className="block text-xs text-neutral-500">Enter the code, or just tap the link in the email.</span>}
          </p>
          <input className={`${inputCls} text-center text-3xl font-bold tracking-[0.3em]`} inputMode="numeric" autoComplete="one-time-code"
            autoFocus maxLength={8} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} aria-label="Code" />
          <button type="button" className="mt-2 text-xs font-semibold text-[#007AFF]" onClick={() => { setSent(false); setCode(''); setErr('') }}>
            Change {method === 'phone' ? 'number' : 'email'} / resend
          </button>
        </>
      )}

      {err && <p className="mt-3 text-sm font-semibold text-[#FF3B30]" role="alert">{err}</p>}

      <Btn tone="blue" type="submit" className="mt-4 w-full" disabled={busy || (sent ? code.length < 6 : !validContact)}>
        {busy ? 'Please wait…' : sent ? 'Verify & continue' : 'Send code'}
      </Btn>
    </form>
  )
}
