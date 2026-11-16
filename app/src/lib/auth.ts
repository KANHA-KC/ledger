// Phone OTP + device PIN. OTP is mocked until the API (MSG91/Firebase) is connected.
import { getSetting, setSetting } from '../db/db'

export const DEMO_OTP = '123456'
export const DEMO_PIN = '1234'

async function sha(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('hisaab:' + s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function setPin(pin: string) { await setSetting('pinHash', await sha(pin)) }
export async function checkPin(pin: string) { return (await getSetting<string>('pinHash', '')) === (await sha(pin)) }
export async function verifyOtp(_phone: string, otp: string) { return otp === DEMO_OTP }
