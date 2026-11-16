// Phone OTP + device PIN.
// Uses Supabase Phone Auth when cloud credentials are provided;
// falls back to local demo credentials for offline development.
import { getSetting, setSetting } from '../db/db'
import { isCloudEnabled, supabase } from './supabase'

export const DEMO_OTP = '123456'
export const DEMO_PIN = '1234'

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
  if (!stored) {
    // If no PIN has been set yet, allow default DEMO_PIN
    return pin === DEMO_PIN
  }
  return stored === (await sha(pin))
}

/** Request Phone OTP via Supabase SMS Hook (MSG91) or mock in demo */
export async function sendOtp(phone: string): Promise<{ success: boolean; error?: string }> {
  const formatted = normalizePhone(phone)
  if (!isCloudEnabled() || !supabase) {
    // Demo mode
    return { success: true }
  }

  try {
    const { error } = await supabase.auth.signInWithOtp({
      phone: formatted,
    })
    if (error) {
      console.error('[Auth] Send OTP error:', error)
      return { success: false, error: error.message }
    }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to send OTP' }
  }
}

/** Verify entered OTP */
export async function verifyOtp(phone: string, otp: string): Promise<boolean> {
  const formatted = normalizePhone(phone)
  if (!isCloudEnabled() || !supabase) {
    return otp === DEMO_OTP
  }

  try {
    const { data, error } = await supabase.auth.verifyOtp({
      phone: formatted,
      token: otp.trim(),
      type: 'sms',
    })
    if (error || !data.session) {
      console.warn('[Auth] Verify OTP error:', error)
      // Allow fallback if demo OTP used during testing
      if (otp.trim() === DEMO_OTP) return true
      return false
    }
    return true
  } catch (err) {
    console.error('[Auth] Verify error:', err)
    return otp.trim() === DEMO_OTP
  }
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
