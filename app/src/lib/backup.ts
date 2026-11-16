/**
 * Hisaab End-to-End Encrypted (E2EE) Local & Cloud Backup System
 * Architecture:
 * 1. Collects all database tables (Dexie: businesses, accounts, categories, parties, txns, lines, dict, settings)
 * 2. Client-side encryption via Web Crypto API (AES-256-GCM + PBKDF2 with 100,000 iterations & SHA-256)
 * 3. Direct REST API upload to user's Google Drive hidden sandbox (appDataFolder)
 * 4. Local device download/import of .hisaab / .json archives
 * 5. Automatic scheduled backups (Daily / Weekly / Monthly) + On-demand manual backups
 */

import { db, getSetting, setSetting, uuid } from '../db/db'
import { download } from './export'
import { todayISO } from './format'

export interface BackupMetadata {
  version: number
  appName: 'Hisaab'
  createdAt: string
  businessId: string
  businessName: string
  entryCount: number
  partyCount: number
  encrypted: boolean
  salt?: string
  iv?: string
}

export interface BackupPayload {
  metadata: BackupMetadata
  data: string // JSON string if plaintext, or Base64 ciphertext if encrypted
}

export type BackupFrequency = 'daily' | 'weekly' | 'monthly' | 'off'

export interface BackupStatus {
  lastLocalBackup: string | null
  lastCloudBackup: string | null
  lastBackupSize: number | null
  connectedEmail: string | null
  frequency: BackupFrequency
  e2eeEnabled: boolean
}

// ==========================================
// Web Crypto API Helpers (AES-256-GCM + PBKDF2)
// ==========================================

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function encryptData(
  plainText: string,
  passphrase?: string
): Promise<{ data: string; encrypted: boolean; salt?: string; iv?: string }> {
  if (!passphrase || !passphrase.trim()) {
    return { data: plainText, encrypted: false }
  }

  const enc = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt)

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plainText)
  )

  return {
    data: bufferToBase64(cipherBuffer),
    encrypted: true,
    salt: bufferToBase64(salt.buffer),
    iv: bufferToBase64(iv.buffer),
  }
}

export async function decryptData(
  data: string,
  encrypted: boolean,
  passphrase?: string,
  salt?: string,
  iv?: string
): Promise<string> {
  if (!encrypted) {
    return data
  }

  if (!passphrase) {
    throw new Error('PASSPHRASE_REQUIRED')
  }

  if (!salt || !iv) {
    throw new Error('INVALID_BACKUP_METADATA')
  }

  const saltBuf = new Uint8Array(base64ToBuffer(salt))
  const ivBuf = new Uint8Array(base64ToBuffer(iv))
  const cipherBuf = base64ToBuffer(data)
  const key = await deriveKey(passphrase, saltBuf)

  try {
    const plainBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBuf },
      key,
      cipherBuf
    )
    const dec = new TextDecoder()
    return dec.decode(plainBuffer)
  } catch (err) {
    throw new Error('INVALID_PASSPHRASE')
  }
}

// ==========================================
// Payload Generation & Restoration
// ==========================================

export async function createFullDump(): Promise<string> {
  const [businesses, accounts, categories, parties, txns, lines, dict, settings] = await Promise.all([
    db.businesses.toArray(),
    db.accounts.toArray(),
    db.categories.toArray(),
    db.parties.toArray(),
    db.txns.toArray(),
    db.lines.toArray(),
    db.dict.toArray(),
    db.settings.toArray(),
  ])

  return JSON.stringify({
    businesses,
    accounts,
    categories,
    parties,
    txns,
    lines,
    dict,
    settings,
  })
}

export async function generateBackupPackage(passphrase?: string): Promise<{ payload: BackupPayload; rawBytes: number }> {
  const activeBizId = await getSetting<string>('activeBusiness', '')
  const activeBiz = activeBizId ? await db.businesses.get(activeBizId) : null
  const entryCount = await db.txns.where('businessId').equals(activeBizId).count()
  const partyCount = await db.parties.where('businessId').equals(activeBizId).count()

  const rawJson = await createFullDump()
  const rawBytes = new TextEncoder().encode(rawJson).length

  const { data, encrypted, salt, iv } = await encryptData(rawJson, passphrase)

  const payload: BackupPayload = {
    metadata: {
      version: 1,
      appName: 'Hisaab',
      createdAt: new Date().toISOString(),
      businessId: activeBizId || 'default',
      businessName: activeBiz?.name || 'Hisaab Ledger',
      entryCount,
      partyCount,
      encrypted,
      salt,
      iv,
    },
    data,
  }

  return { payload, rawBytes }
}

export async function restoreFromBackupString(backupStr: string, passphrase?: string): Promise<{ entryCount: number }> {
  let parsed: BackupPayload
  try {
    parsed = JSON.parse(backupStr)
  } catch {
    throw new Error('MALFORMED_BACKUP_FILE')
  }

  if (!parsed.metadata || parsed.metadata.appName !== 'Hisaab') {
    throw new Error('NOT_A_HISAAB_BACKUP')
  }

  const plainJson = await decryptData(
    parsed.data,
    parsed.metadata.encrypted,
    passphrase,
    parsed.metadata.salt,
    parsed.metadata.iv
  )

  const data = JSON.parse(plainJson)

  await db.transaction(
    'rw',
    [db.businesses, db.accounts, db.categories, db.parties, db.txns, db.lines, db.dict, db.settings],
    async () => {
      if (Array.isArray(data.businesses)) await db.businesses.bulkPut(data.businesses)
      if (Array.isArray(data.accounts)) await db.accounts.bulkPut(data.accounts)
      if (Array.isArray(data.categories)) await db.categories.bulkPut(data.categories)
      if (Array.isArray(data.parties)) await db.parties.bulkPut(data.parties)
      if (Array.isArray(data.txns)) await db.txns.bulkPut(data.txns)
      if (Array.isArray(data.lines)) await db.lines.bulkPut(data.lines)
      if (Array.isArray(data.dict)) await db.dict.bulkPut(data.dict)
      if (Array.isArray(data.settings)) await db.settings.bulkPut(data.settings)
    }
  )

  return { entryCount: parsed.metadata.entryCount ?? 0 }
}

// ==========================================
// Local Device Backup Actions
// ==========================================

export async function exportLocalDeviceBackup(passphrase?: string): Promise<number> {
  const { payload, rawBytes } = await generateBackupPackage(passphrase)
  const jsonStr = JSON.stringify(payload, null, 2)
  const dateStr = new Date().toISOString().slice(0, 10)
  const ext = payload.metadata.encrypted ? 'hisaab.e2ee' : 'hisaab.json'
  download(`hisaab-backup-${dateStr}.${ext}`, jsonStr, 'application/json')

  const now = new Date().toISOString()
  await setSetting('backup_last_local', now)
  await setSetting('backup_last_size', rawBytes)
  return rawBytes
}

// ==========================================
// Google Drive Cloud Backup (appDataFolder sandbox)
// ==========================================

export const GOOGLE_DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata'

/**
 * 1-Tap Google Identity Services (GIS) OAuth Token Client for Drive appDataFolder.
 */
export function initGoogleDriveAuth(
  onSuccess: (accessToken: string, email?: string) => void,
  onError?: (err: any) => void
) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  if (!clientId || typeof window === 'undefined') {
    onError?.('GOOGLE_CLIENT_ID_NOT_CONFIGURED')
    return
  }

  const loadGsiScript = () => {
    return new Promise<void>((resolve, reject) => {
      if ((window as any).google?.accounts?.oauth2) {
        resolve()
        return
      }
      const existing = document.getElementById('google-gsi-client')
      if (existing) {
        existing.addEventListener('load', () => resolve())
        return
      }
      const script = document.createElement('script')
      script.id = 'google-gsi-client'
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      script.onload = () => resolve()
      script.onerror = (e) => reject(e)
      document.head.appendChild(script)
    })
  }

  loadGsiScript()
    .then(() => {
      const google = (window as any).google
      if (!google?.accounts?.oauth2) {
        onError?.('GIS_NOT_LOADED')
        return
      }
      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive.appdata email profile',
        callback: async (res: any) => {
          if (res && res.access_token) {
            let email = ''
            try {
              const uRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${res.access_token}` },
              })
              if (uRes.ok) {
                const uData = await uRes.json()
                email = uData.email || ''
              }
            } catch {
              /* ignore */
            }
            onSuccess(res.access_token, email)
          } else {
            onError?.(res?.error || 'TOKEN_FAILED')
          }
        },
        error_callback: (err: any) => {
          onError?.(err)
        },
      })
      client.requestAccessToken({ prompt: 'consent' })
    })
    .catch((err) => onError?.(err))
}

export async function uploadToGoogleDrive(accessToken: string, payload: BackupPayload): Promise<string> {
  const fileContent = JSON.stringify(payload)
  const metadata = {
    name: 'hisaab_backup_vault.e2ee',
    parents: ['appDataFolder'],
    mimeType: 'application/json',
  }

  // First, check if a previous backup file already exists in appDataFolder
  const listRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id,name)&pageSize=10`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )

  let existingFileId: string | null = null
  if (listRes.ok) {
    const listData = await listRes.json()
    const found = listData.files?.find((f: { name: string }) => f.name === 'hisaab_backup_vault.e2ee')
    if (found) existingFileId = found.id
  }

  // Upload or update via multipart REST API
  const boundary = '-------HisaabBoundary' + Math.random().toString(36).substring(2)
  const delimiter = `\r\n--${boundary}\r\n`
  const closeDelimiter = `\r\n--${boundary}--`

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    fileContent +
    closeDelimiter

  const endpoint = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`

  const uploadRes = await fetch(endpoint, {
    method: existingFileId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartRequestBody,
  })

  if (!uploadRes.ok) {
    const errText = await uploadRes.text()
    throw new Error(`Google Drive Upload Failed (${uploadRes.status}): ${errText}`)
  }

  const result = await uploadRes.json()
  const now = new Date().toISOString()
  await setSetting('backup_last_cloud', now)
  await setSetting('backup_last_size', new TextEncoder().encode(fileContent).length)
  return result.id
}

export async function fetchLatestFromGoogleDrive(accessToken: string): Promise<string> {
  const listRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id,name,size,modifiedTime)&orderBy=modifiedTime desc&pageSize=1`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )

  if (!listRes.ok) {
    throw new Error('CANNOT_ACCESS_DRIVE')
  }

  const listData = await listRes.json()
  const file = listData.files?.[0]
  if (!file) {
    throw new Error('NO_CLOUD_BACKUP_FOUND')
  }

  const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!fileRes.ok) {
    throw new Error('FAILED_TO_DOWNLOAD_CLOUD_BACKUP')
  }

  return await fileRes.text()
}

// ==========================================
// Settings & Scheduled Backup Management
// ==========================================

export async function getBackupStatus(): Promise<BackupStatus> {
  const [lastLocalBackup, lastCloudBackup, lastBackupSize, connectedEmail, frequency, e2eeEnabled] =
    await Promise.all([
      getSetting<string | null>('backup_last_local', null),
      getSetting<string | null>('backup_last_cloud', null),
      getSetting<number | null>('backup_last_size', null),
      getSetting<string | null>('google_account_email', null),
      getSetting<BackupFrequency>('backup_frequency', 'daily'),
      getSetting<boolean>('backup_e2ee', true),
    ])

  return {
    lastLocalBackup,
    lastCloudBackup,
    lastBackupSize,
    connectedEmail,
    frequency,
    e2eeEnabled,
  }
}

export async function checkAndRunScheduledBackup(passphrase?: string): Promise<boolean> {
  try {
    const frequency = await getSetting<BackupFrequency>('backup_frequency', 'daily')
    if (frequency === 'off') return false

    const lastCloud = await getSetting<string | null>('backup_last_cloud', null)
    const token = await getSetting<string | null>('google_access_token', null)
    const tokenExp = await getSetting<number>('google_token_expiry', 0)

    const now = Date.now()
    const lastBackupTime = lastCloud ? new Date(lastCloud).getTime() : 0
    const intervalMs =
      frequency === 'daily'
        ? 24 * 60 * 60 * 1000
        : frequency === 'weekly'
        ? 7 * 24 * 60 * 60 * 1000
        : 30 * 24 * 60 * 60 * 1000

    if (now - lastBackupTime >= intervalMs) {
      if (token && now < tokenExp) {
        const { payload } = await generateBackupPackage(passphrase)
        await uploadToGoogleDrive(token, payload)
        return true
      }
    }
  } catch (err) {
    console.error('Scheduled backup check failed:', err)
  }
  return false
}
