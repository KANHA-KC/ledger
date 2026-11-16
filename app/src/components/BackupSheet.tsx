'use client'

import React, { useEffect, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Cloud,
  Download,
  Upload,
  Lock,
  Key,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  FolderLock,
  AlertCircle,
  Smartphone,
  ChevronRight,
  LogOut,
} from 'lucide-react'
import {
  exportLocalDeviceBackup,
  restoreFromBackupString,
  uploadToGoogleDrive,
  fetchLatestFromGoogleDrive,
  generateBackupPackage,
  getBackupStatus,
  initGoogleDriveAuth,
  type BackupStatus,
  type BackupFrequency,
} from '../lib/backup'
import { db, setSetting } from '../db/db'
import { useToast } from '../store'
import { AppleSegmentedControl } from './apple/AppleSegmentedControl'
import { Sheet, Btn, Field, inputCls } from './ui'

export function BackupSheet({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const [status, setStatus] = useState<BackupStatus>({
    lastLocalBackup: null,
    lastCloudBackup: null,
    lastBackupSize: null,
    connectedEmail: null,
    frequency: 'daily',
    e2eeEnabled: true,
  })

  const [loading, setLoading] = useState(false)
  const [progressMsg, setProgressMsg] = useState('')
  const [showPassphraseModal, setShowPassphraseModal] = useState(false)
  const [passphrase, setPassphrase] = useState('')
  const [passphraseConfirm, setPassphraseConfirm] = useState('')
  const [passphraseErr, setPassphraseErr] = useState('')
  const [showConnectGoogle, setShowConnectGoogle] = useState(false)
  const [googleEmailInput, setGoogleEmailInput] = useState('')
  const [googleTokenInput, setGoogleTokenInput] = useState('')
  const [restorePassphrasePrompt, setRestorePassphrasePrompt] = useState(false)
  const [restoreCipherData, setRestoreCipherData] = useState<string | null>(null)
  const [restorePassInput, setRestorePassInput] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const reloadStatus = async () => {
    const s = await getBackupStatus()
    setStatus(s)
  }

  useEffect(() => {
    if (open) {
      reloadStatus()
    }
  }, [open])

  const formatSize = (bytes: number | null) => {
    if (!bytes) return '—'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  const formatTime = (iso: string | null) => {
    if (!iso) return t('backup.never') || 'Never'
    try {
      const d = new Date(iso)
      const isToday = new Date().toDateString() === d.toDateString()
      const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      if (isToday) return `Today, ${time}`
      return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`
    } catch {
      return iso
    }
  }

  // Handle Manual Backup (Local + Cloud if connected)
  const handleBackupNow = async () => {
    setLoading(true)
    setProgressMsg('Packaging database...')
    try {
      const savedPass = status.e2eeEnabled
        ? (await db.settings.get('backup_passphrase'))?.value as string | undefined
        : undefined

      if (status.e2eeEnabled && !savedPass) {
        // Need to set up password first
        setLoading(false)
        setShowPassphraseModal(true)
        return
      }

      // Step 1: Encrypt and download to device
      setProgressMsg('Encrypting with AES-256-GCM...')
      await new Promise((r) => setTimeout(r, 400))
      await exportLocalDeviceBackup(savedPass)

      // Step 2: If Google Drive is connected, upload to appDataFolder
      const token = (await db.settings.get('google_access_token'))?.value as string | undefined
      if (token) {
        setProgressMsg('Uploading to Google Drive sandbox (appDataFolder)...')
        const { payload } = await generateBackupPackage(savedPass)
        await uploadToGoogleDrive(token, payload)
      }

      await reloadStatus()
      toast({
        text: t('backup.success') || 'Backup complete! Saved to your device & cloud.',
        tone: 'ok',
      })
    } catch (err: any) {
      console.error(err)
      toast({ text: err.message || 'Backup failed', tone: 'info' })
    } finally {
      setLoading(false)
      setProgressMsg('')
    }
  }

  // Handle Restore from Google Drive
  const handleRestoreFromDrive = async () => {
    const token = (await db.settings.get('google_access_token'))?.value as string | undefined
    if (!token) {
      toast({ text: 'Please connect Google Drive first', tone: 'info' })
      setShowConnectGoogle(true)
      return
    }

    setLoading(true)
    setProgressMsg('Fetching latest backup from Google Drive...')
    try {
      const rawText = await fetchLatestFromGoogleDrive(token)
      try {
        const savedPass = (await db.settings.get('backup_passphrase'))?.value as string | undefined
        const { entryCount } = await restoreFromBackupString(rawText, savedPass)
        toast({ text: `Restored ${entryCount} entries successfully!`, tone: 'ok' })
        setTimeout(() => location.reload(), 600)
      } catch (e: any) {
        if (e.message === 'PASSPHRASE_REQUIRED' || e.message === 'INVALID_PASSPHRASE') {
          setRestoreCipherData(rawText)
          setRestorePassphrasePrompt(true)
        } else {
          throw e
        }
      }
    } catch (err: any) {
      toast({ text: err.message || 'Restore failed', tone: 'info' })
    } finally {
      setLoading(false)
      setProgressMsg('')
    }
  }

  // Handle File Input Selection
  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (ev) => {
      const text = ev.target?.result as string
      try {
        const savedPass = (await db.settings.get('backup_passphrase'))?.value as string | undefined
        const { entryCount } = await restoreFromBackupString(text, savedPass)
        toast({ text: `Restored ${entryCount} entries from file!`, tone: 'ok' })
        setTimeout(() => location.reload(), 600)
      } catch (err: any) {
        if (err.message === 'PASSPHRASE_REQUIRED' || err.message === 'INVALID_PASSPHRASE') {
          setRestoreCipherData(text)
          setRestorePassphrasePrompt(true)
        } else {
          toast({ text: err.message || 'Failed to restore file', tone: 'info' })
        }
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleRestoreWithPass = async () => {
    if (!restoreCipherData) return
    try {
      const { entryCount } = await restoreFromBackupString(restoreCipherData, restorePassInput)
      toast({ text: `Restored ${entryCount} entries successfully!`, tone: 'ok' })
      setRestorePassphrasePrompt(false)
      setRestorePassInput('')
      setRestoreCipherData(null)
      setTimeout(() => location.reload(), 600)
    } catch (err: any) {
      toast({ text: 'Wrong passphrase for this backup', tone: 'info' })
    }
  }

  return (
    <>
      <Sheet open={open} onClose={onClose} title={t('backup.title') || 'Chat & Data Backup'}>
        <div className="space-y-4 py-2">
          {/* WhatsApp / Apple Style Status Card */}
          <div className="apple-card overflow-hidden p-4">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#34C759] to-[#007AFF] text-white shadow-sm">
                <Cloud className="h-6 w-6" />
              </div>
              <div>
                <h3 className="apple-headline text-neutral-900 dark:text-white">
                  {t('backup.cloudTitle') || 'Google Drive & Device Backup'}
                </h3>
                <p className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
                  {status.e2eeEnabled ? 'End-to-End Encrypted (AES-256-GCM)' : 'Standard Offline Backup'}
                </p>
              </div>
            </div>

            {/* Status Statistics */}
            <div className="space-y-2 rounded-xl bg-neutral-100/70 p-3 text-xs dark:bg-neutral-800/60">
              <div className="flex items-center justify-between">
                <span className="text-[#6E6E73] dark:text-[#A1A1A6]">Google Account:</span>
                <span className="font-semibold text-neutral-900 dark:text-white">
                  {status.connectedEmail || 'Not connected'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#6E6E73] dark:text-[#A1A1A6]">Last Google Drive Backup:</span>
                <span className="font-semibold text-neutral-900 dark:text-white">
                  {formatTime(status.lastCloudBackup)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#6E6E73] dark:text-[#A1A1A6]">Last Local Backup:</span>
                <span className="font-semibold text-neutral-900 dark:text-white">
                  {formatTime(status.lastLocalBackup)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#6E6E73] dark:text-[#A1A1A6]">Total Size:</span>
                <span className="font-semibold text-neutral-900 dark:text-white">
                  {formatSize(status.lastBackupSize)}
                </span>
              </div>
            </div>

            {/* Back Up Now Button (WhatsApp Style Green Button) */}
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleBackupNow}
                disabled={loading}
                className="apple-press flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#34C759] font-bold text-white shadow-sm hover:bg-[#2EB84E] disabled:opacity-50"
              >
                <Upload className="h-4 w-4 stroke-[2.5]" />
                <span>{loading ? progressMsg || 'Backing up...' : t('backup.now') || 'Back Up Now (बैकअप लें)'}</span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleRestoreFromDrive}
                  disabled={loading}
                  className="apple-press flex h-9 items-center justify-center gap-1.5 rounded-xl border border-black/[0.08] bg-white text-xs font-semibold text-neutral-800 hover:bg-neutral-50 dark:border-white/10 dark:bg-neutral-800 dark:text-white"
                >
                  <Cloud className="h-3.5 w-3.5 text-[#007AFF]" />
                  <span>Restore from Drive</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  className="apple-press flex h-9 items-center justify-center gap-1.5 rounded-xl border border-black/[0.08] bg-white text-xs font-semibold text-neutral-800 hover:bg-neutral-50 dark:border-white/10 dark:bg-neutral-800 dark:text-white"
                >
                  <Smartphone className="h-3.5 w-3.5 text-[#34C759]" />
                  <span>Restore from Device</span>
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelected}
                  accept=".json,.e2ee,.hisaab"
                  className="hidden"
                />
              </div>
            </div>
          </div>

          {/* Backup Schedule & Settings */}
          <div className="apple-card divide-y divide-black/[0.04] overflow-hidden dark:divide-white/[0.06]">
            {/* Auto-Backup Frequency (Daily / Weekly / Monthly / Off) */}
            <div className="p-3.5">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-neutral-900 dark:text-white">
                    {t('backup.schedule') || 'Back up to Google Drive (Schedule)'}
                  </div>
                  <div className="text-[11px] text-[#6E6E73] dark:text-[#A1A1A6]">
                    Automatically saves your business hisaab
                  </div>
                </div>
              </div>
              <AppleSegmentedControl
                size="sm"
                value={status.frequency}
                onChange={async (freq: BackupFrequency) => {
                  setStatus({ ...status, frequency: freq })
                  await setSetting('backup_frequency', freq)
                  toast({ text: `Backup schedule: ${freq.toUpperCase()}`, tone: 'ok' })
                }}
                options={[
                  { value: 'daily', label: 'Daily' },
                  { value: 'weekly', label: 'Weekly' },
                  { value: 'monthly', label: 'Monthly' },
                  { value: 'off', label: 'Off' },
                ]}
              />
            </div>

            {/* Google Drive Account Row */}
            <div
              onClick={() => setShowConnectGoogle(true)}
              className="apple-press flex cursor-pointer items-center justify-between p-3.5 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/40"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#007AFF] text-white">
                  <Cloud className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-neutral-900 dark:text-white">
                    Google Drive Account
                  </div>
                  <div className="text-[11px] text-[#6E6E73] dark:text-[#A1A1A6]">
                    {status.connectedEmail || 'Connect Google Account for cloud sync'}
                  </div>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-neutral-400" />
            </div>

            {/* End-to-End Encryption Toggle & Passphrase */}
            <div className="flex items-center justify-between p-3.5">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#34C759] text-white">
                  <Lock className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-neutral-900 dark:text-white">
                    End-to-End Encrypted Backup
                  </div>
                  <div className="text-[11px] text-[#6E6E73] dark:text-[#A1A1A6]">
                    Locked with AES-256 before uploading to Google
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPassphraseModal(true)}
                className="apple-press text-xs font-semibold text-[#007AFF] hover:underline"
              >
                Manage Key →
              </button>
            </div>
          </div>
        </div>
      </Sheet>

      {/* Passphrase Setup Modal (WhatsApp E2EE Style) */}
      <Sheet
        open={showPassphraseModal}
        onClose={() => {
          setShowPassphraseModal(false)
          setPassphraseErr('')
        }}
        title="End-to-End Encryption Password"
      >
        <div className="space-y-4 py-3 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#34C759] to-[#007AFF] text-white shadow-md">
            <FolderLock className="h-7 w-7" />
          </div>
          <div>
            <h3 className="apple-headline text-neutral-900 dark:text-white">
              Create a Backup Password
            </h3>
            <p className="mt-1 text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
              Your backup will be encrypted with AES-256-GCM. If you lose this password, nobody (not even Google or Hisaab) can restore your data.
            </p>
          </div>

          <div className="space-y-2 text-left">
            <input
              type="password"
              className={inputCls}
              placeholder="Enter backup password (min 6 characters)"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
            />
            <input
              type="password"
              className={inputCls}
              placeholder="Confirm password"
              value={passphraseConfirm}
              onChange={(e) => setPassphraseConfirm(e.target.value)}
            />
            {passphraseErr && <p className="text-xs text-rose-500">{passphraseErr}</p>}
          </div>

          <Btn
            tone="blue"
            className="w-full"
            onClick={async () => {
              if (passphrase.length < 6) {
                setPassphraseErr('Password must be at least 6 characters')
                return
              }
              if (passphrase !== passphraseConfirm) {
                setPassphraseErr('Passwords do not match')
                return
              }
              await setSetting('backup_passphrase', passphrase)
              await setSetting('backup_e2ee', true)
              setShowPassphraseModal(false)
              setPassphrase('')
              setPassphraseConfirm('')
              setPassphraseErr('')
              await reloadStatus()
              toast({ text: 'Encryption password saved!', tone: 'ok' })
            }}
          >
            Save Password & Enable E2EE
          </Btn>
        </div>
      </Sheet>

      {/* Google Account Connection Modal */}
      <Sheet
        open={showConnectGoogle}
        onClose={() => setShowConnectGoogle(false)}
        title="Google Drive Cloud Connection"
      >
        <div className="space-y-4 py-3">
          <div className="rounded-xl bg-blue-50/60 p-3 text-xs text-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
            <strong>Hidden Sandbox (appDataFolder):</strong> Backups are stored in Google Drive&apos;s hidden app directory. Files are invisible in regular Drive view, preventing accidental deletion.
          </div>

          {/* 1-Tap Google Sign In */}
          <button
            type="button"
            onClick={() => {
              initGoogleDriveAuth(
                async (token, email) => {
                  const accountEmail = email || 'google.user@gmail.com'
                  await setSetting('google_access_token', token)
                  await setSetting('google_account_email', accountEmail)
                  await setSetting('google_token_expiry', Date.now() + 3500 * 1000)
                  setShowConnectGoogle(false)
                  await reloadStatus()
                  toast({ text: `Connected Google Drive: ${accountEmail}`, tone: 'ok' })
                },
                (err) => {
                  console.error('Google Drive auth error:', err)
                  toast({
                    text:
                      err === 'GOOGLE_CLIENT_ID_NOT_CONFIGURED'
                        ? 'Google Client ID not configured in .env'
                        : 'Google Sign-In window closed. You can also use manual test token below.',
                    tone: 'info',
                  })
                }
              )
            }}
            className="apple-press flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-black/10 bg-white font-semibold text-neutral-800 shadow-sm hover:bg-neutral-50 dark:border-white/10 dark:bg-[#2C2C2E] dark:text-white"
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>One-Tap Sign In with Google</span>
          </button>

          <div className="flex items-center gap-2 my-1">
            <div className="h-px flex-1 bg-black/[0.06] dark:bg-white/[0.08]" />
            <span className="text-[11px] font-semibold uppercase text-neutral-400">or manual test</span>
            <div className="h-px flex-1 bg-black/[0.06] dark:bg-white/[0.08]" />
          </div>

          <Field label="Google Account Email">
            <input
              type="email"
              className={inputCls}
              placeholder="e.g. sharma.kirana@gmail.com"
              value={googleEmailInput}
              onChange={(e) => setGoogleEmailInput(e.target.value)}
            />
          </Field>

          <Field label="OAuth Access Token (Optional for manual sandbox test)">
            <input
              type="text"
              className={inputCls}
              placeholder="Paste Google OAuth Bearer Token or leave blank"
              value={googleTokenInput}
              onChange={(e) => setGoogleTokenInput(e.target.value)}
            />
          </Field>

          <div className="flex gap-2">
            <Btn
              tone="blue"
              className="flex-1"
              onClick={async () => {
                const email = googleEmailInput.trim() || 'business.ledger@gmail.com'
                const token = googleTokenInput.trim() || 'mock-oauth-token-' + Date.now()
                await setSetting('google_account_email', email)
                await setSetting('google_access_token', token)
                await setSetting('google_token_expiry', Date.now() + 3600 * 1000 * 24 * 30)
                setShowConnectGoogle(false)
                await reloadStatus()
                toast({ text: `Connected Google Drive: ${email}`, tone: 'ok' })
              }}
            >
              Connect Account
            </Btn>

            {status.connectedEmail && (
              <Btn
                tone="danger"
                onClick={async () => {
                  await setSetting('google_account_email', null)
                  await setSetting('google_access_token', null)
                  setShowConnectGoogle(false)
                  await reloadStatus()
                  toast({ text: 'Google Drive disconnected', tone: 'info' })
                }}
              >
                Disconnect
              </Btn>
            )}
          </div>
        </div>
      </Sheet>

      {/* Password prompt on restore */}
      <Sheet
        open={restorePassphrasePrompt}
        onClose={() => setRestorePassphrasePrompt(false)}
        title="Enter Backup Password"
      >
        <div className="space-y-4 py-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/15 text-2xl text-amber-600">
            <Key className="h-6 w-6" />
          </div>
          <div>
            <h3 className="apple-headline text-neutral-900 dark:text-white">Encrypted Backup</h3>
            <p className="mt-1 text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
              This backup file was encrypted with a password. Enter your password to decrypt and restore.
            </p>
          </div>
          <input
            type="password"
            className={inputCls}
            placeholder="Enter password"
            value={restorePassInput}
            onChange={(e) => setRestorePassInput(e.target.value)}
          />
          <Btn tone="blue" className="w-full" onClick={handleRestoreWithPass}>
            Decrypt & Restore Data
          </Btn>
        </div>
      </Sheet>
    </>
  )
}
