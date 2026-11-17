// Sign-in (phone OTP or email code via Supabase) + device PIN.
// When Supabase is configured, a login only succeeds with a REAL session — otherwise the device
// would look logged in but every sync call would be rejected. Demo codes work only in offline mode.
import { getSetting, setSetting } from '../db/db'
import { isCloudEnabled, supabase } from './supabase'

export const DEMO_OTP = '123456'
export const DEMO_PIN = '1234'

export type LoginMethod = 'phone' | 'email'

export function normalizePhone(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, '')
  if (digits.length === 10) return `+91${digits}`
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`
  if (rawPhone.startsWith('+')) return rawPhone
  return `+91${digits}`
}

async function sha(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('hisaab:' + s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function setPin(pin: string) {
  await setSetting('pinHash', await sha(pin))
}

export async function checkPin(pin: string) {
  const stored = await getSetting<string>('pinHash', '')
  if (!stored) return pin === DEMO_PIN // only before any PIN was ever set
  return stored === (await sha(pin))
}

/** Human-readable reason for the most common Supabase auth errors. */
function explain(msg: string, method: LoginMethod): string {
  const m = msg.toLowerCase()
  if (m.includes('unsupported phone provider') || m.includes('phone') && m.includes('disabled'))
    return 'Phone login is not switched on for this app yet. Use email instead, or ask the admin to enable an SMS provider in Supabase.'
  if (m.includes('signups not allowed')) return 'New sign-ups are disabled in Supabase (Auth → Providers).'
  if (m.includes('rate limit') || m.includes('security purposes'))
    return 'Too many codes requested. Please wait a minute and try again.'
  if (m.includes('expired') || m.includes('invalid')) return method === 'email' ? 'Wrong or expired code. Check the latest email.' : 'Wrong or expired OTP.'
  return msg
}

/** Send a one-time code by SMS (phone) or email. */
export async function sendOtp(contact: string, method: LoginMethod = 'phone'): Promise<{ success: boolean; error?: string }> {
  if (!isCloudEnabled() || !supabase) return { success: true } // offline demo mode
  try {
    const { error } =
      method === 'email'
        ? await supabase.auth.signInWithOtp({
            email: contact.trim().toLowerCase(),
            options: { shouldCreateUser: true, emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined },
          })
        : await supabase.auth.signInWithOtp({ phone: normalizePhone(contact) })
    if (error) return { success: false, error: explain(error.message, method) }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to send code' }
  }
}

/** Verify the code. Cloud mode: true only if Supabase returned a session. */
export async function verifyOtp(contact: string, otp: string, method: LoginMethod = 'phone'): Promise<{ ok: boolean; error?: string }> {
  if (!isCloudEnabled() || !supabase) return otp.trim() === DEMO_OTP ? { ok: true } : { ok: false }
  try {
    const { data, error } =
      method === 'email'
        ? await supabase.auth.verifyOtp({ email: contact.trim().toLowerCase(), token: otp.trim(), type: 'email' })
        : await supabase.auth.verifyOtp({ phone: normalizePhone(contact), token: otp.trim(), type: 'sms' })
    if (error || !data.session) return { ok: false, error: error ? explain(error.message, method) : 'No session returned' }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Verification failed' }
  }
}

export async function hasCloudSession(): Promise<boolean> {
  if (!isCloudEnabled() || !supabase) return false
  const { data } = await supabase.auth.getSession()
  return !!data.session
}

/** Get currently authenticated cloud user */
export async function getCurrentCloudUser() {
  if (!isCloudEnabled() || !supabase) return null
  const { data } = await supabase.auth.getUser()
  return data.user
}

/** Sign out */
export async function signOut() {
  if (isCloudEnabled() && supabase) {
    await supabase.auth.signOut()
  }
}
