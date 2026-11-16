'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  BarChart3,
  Wallet,
  Tags,
  BookOpen,
  Globe,
  Sun,
  Lock,
  Download,
  HelpCircle,
  AlertTriangle,
  ChevronRight,
  Shield,
  Smartphone,
  Check,
  Sparkles,
  Cloud,
  Database,
} from 'lucide-react'
import { db, getSetting, setSetting } from '../db/db'
import { useData, useToast } from '../store'
import { setLanguage } from '../i18n'
import { checkPin, setPin } from '../lib/auth'
import { loginWithDemoAccount } from '../lib/demo'
import { exportAll } from '../lib/export'
import { exportLocalDeviceBackup } from '../lib/backup'
import { BackupSheet } from '../components/BackupSheet'
import { daysBetween, todayISO } from '../lib/format'
import { syncEnabled } from '../lib/sync'
import { Btn, Chip, Confirm, Sheet, inputCls } from '../components/ui'
import { AppleListItem } from '../components/apple/AppleListItem'
import { AppleSegmentedControl } from '../components/apple/AppleSegmentedControl'
import { PinPad } from './PinPad'

export function More({
  onLock,
  onSettings,
}: {
  onLock: () => void
  onSettings: (s: { numerals: 'latn' | 'deva'; highContrast: boolean }) => void
}) {
  const { t, i18n } = useTranslation()
  const { business } = useData()
  const toast = useToast()
  const numerals =
    useLiveQuery(() => getSetting<'latn' | 'deva'>('numerals', 'latn'), []) ?? 'latn'
  const hc = useLiveQuery(() => getSetting('highContrast', false), []) ?? false
  const pending =
    useLiveQuery(() => db.txns.where('syncStatus').equals('pending').count(), []) ?? 0
  const [pinStep, setPinStep] = useState<'old' | 'new' | null>(null)
  const [pinErr, setPinErr] = useState('')
  const [reset, setReset] = useState(false)
  const [resetText, setResetText] = useState('')
  const [lockAsk, setLockAsk] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [backupOpen, setBackupOpen] = useState(false)
  const trialDays = Math.max(0, daysBetween(todayISO(), business.trialEndsAt))

  useEffect(() => {
    try {
      const th = localStorage.getItem('theme')
      if (th === 'dark') setTheme('dark')
    } catch {}
  }, [])

  const links = [
    { to: '/entries', icon: BookOpen, label: t('nav.entries') || 'Entries', bg: 'bg-[#007AFF]' },
    { to: '/reports', icon: BarChart3, label: t('nav.reports') || 'Reports', bg: 'bg-[#5856D6]' },
    { to: '/categories', icon: Tags, label: t('nav.categories') || 'Categories', bg: 'bg-[#34C759]' },
  ]

  return (
    <div className="space-y-5">
      {/* Settings Header */}
      <div>
        <h1 className="apple-large-title text-neutral-900 dark:text-white">
          {t('more.title') || 'Settings'}
        </h1>
        <p className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">Preferences, security, and data management</p>
      </div>

      {/* Business Profile Inset Card */}
      <div className="apple-card p-4">
        <div className="flex items-center gap-3.5">
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#34C759] to-[#007AFF] text-xl font-extrabold text-white shadow-sm ring-2 ring-black/[0.06] dark:ring-white/[0.1]">
            {business.name.trim() ? business.name.trim().charAt(0).toUpperCase() : 'H'}
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-[#34C759] ring-2 ring-white dark:ring-[#1C1C1E]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-bold text-neutral-900 dark:text-white">
              {business.name}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
              <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                {typeof window !== 'undefined' ? localStorage.getItem('hisaab_user_name') || 'Dilip Chandravanshi' : 'Dilip Chandravanshi'} · {i18n.language === 'hi' ? 'मालिक (Owner)' : 'Owner'}
              </span>
              <span>·</span>
              <Smartphone className="h-3 w-3" />
              <span>+91 {business.ownerPhone}</span>
              <span>·</span>
              <span className="capitalize">{business.plan} Plan</span>
            </div>
          </div>
        </div>
      </div>

      {/* Shortcuts Grid (Mobile) */}
      <div className="grid grid-cols-3 gap-2 md:hidden">
        {links.map((l) => {
          const Icon = l.icon
          return (
            <Link
              key={l.to}
              href={l.to}
              className="apple-press apple-card flex h-20 flex-col items-center justify-center gap-1.5 p-3 text-center transition-all hover:bg-neutral-50 dark:hover:bg-[#2C2C2E]"
            >
              <div className={`flex h-8 w-8 items-center justify-center rounded-xl text-white ${l.bg}`}>
                <Icon className="h-4 w-4" />
              </div>
              <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
                {l.label}
              </span>
            </Link>
          )
        })}
      </div>

      {/* Settings Grid on Desktop: Preferences & Security */}
      <div className="grid gap-4 md:grid-cols-2 items-start">
        {/* Inset Group 1: General & Localization */}
        <div className="apple-card overflow-hidden">
        <div className="border-b border-black/[0.04] px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-[#8E8E93] dark:border-white/[0.06] dark:text-[#A1A1A6]">
          {t('more.language') || 'Language & Display'}
        </div>
        <div className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
          {/* Language selector */}
          <div className="flex items-center justify-between p-3.5">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#007AFF] text-white">
                <Globe className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-neutral-900 dark:text-white">
                  {t('more.language') || 'Language'}
                </div>
                <div className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">हिंदी / English</div>
              </div>
            </div>
            <div className="w-36">
              <AppleSegmentedControl
                size="sm"
                value={i18n.language === 'hi' ? 'hi' : 'en'}
                onChange={(l) => setLanguage(l as 'hi' | 'en')}
                options={[
                  { value: 'hi', label: 'हिंदी' },
                  { value: 'en', label: 'English' },
                ]}
              />
            </div>
          </div>

          {/* Appearance selector */}
          <div className="flex items-center justify-between p-3.5">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#007AFF] text-white">
                <Sun className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-neutral-900 dark:text-white">
                  Appearance / थीम
                </div>
                <div className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">Light (Recommended) / Dark</div>
              </div>
            </div>
            <div className="w-36">
              <AppleSegmentedControl
                size="sm"
                value={theme}
                onChange={(th) => {
                  setTheme(th)
                  try {
                    localStorage.setItem('theme', th)
                    if (th === 'dark') {
                      document.documentElement.classList.add('dark')
                    } else {
                      document.documentElement.classList.remove('dark')
                    }
                  } catch {}
                }}
                options={[
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
              />
            </div>
          </div>

          {/* Numerals selector */}
          <div className="flex items-center justify-between p-3.5">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#5856D6] text-white text-xs font-bold">
                123
              </div>
              <div>
                <div className="text-sm font-semibold text-neutral-900 dark:text-white">
                  {t('more.numerals') || 'Numerals'}
                </div>
                <div className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">1, 2, 3 or १, २, ३</div>
              </div>
            </div>
            <div className="w-36">
              <AppleSegmentedControl
                size="sm"
                value={numerals}
                onChange={async (n) => {
                  await setSetting('numerals', n)
                  onSettings({ numerals: n, highContrast: hc })
                }}
                options={[
                  { value: 'latn', label: '1 2 3' },
                  { value: 'deva', label: '१ २ ३' },
                ]}
              />
            </div>
          </div>

          {/* High contrast mode toggle */}
          <label className="flex cursor-pointer items-center justify-between p-3.5 hover:bg-neutral-50/50 dark:hover:bg-[#2C2C2E]/60">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FF9500] text-white">
                <Sun className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-neutral-900 dark:text-white">
                  {t('more.highContrast') || 'High Contrast'}
                </div>
                <div className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">Higher visibility for sunlight reading</div>
              </div>
            </div>
            <input
              type="checkbox"
              className="h-5 w-5 rounded text-[#007AFF] focus:ring-[#007AFF]"
              checked={hc}
              onChange={async (e) => {
                await setSetting('highContrast', e.target.checked)
                onSettings({ numerals, highContrast: e.target.checked })
              }}
            />
          </label>
        </div>
      </div>

      {/* Inset Group 2: Security & App Lock */}
      <div className="apple-card overflow-hidden">
        <div className="border-b border-black/[0.04] px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:border-white/[0.06]">
          Security & Access
        </div>
        <div className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
          <AppleListItem
            icon={<Lock className="h-4 w-4" />}
            iconBg="bg-[#34C759]"
            title={t('more.pin') || 'Change 4-Digit Passcode'}
            subtitle="Update the app unlock PIN"
            chevron
            onClick={() => setPinStep('old')}
          />
          <AppleListItem
            icon={<Shield className="h-4 w-4" />}
            iconBg="bg-[#007AFF]"
            title={t('more.lock') || 'Lock App Now'}
            subtitle="Requires passcode to re-enter"
            chevron
            onClick={() => setLockAsk(true)}
          />
        </div>
      </div>
      </div>

      {/* Settings Grid on Desktop: Data & Danger */}
      <div className="grid gap-4 md:grid-cols-2 items-start">
        {/* Inset Group 3: Data & Export */}
        <div className="apple-card overflow-hidden">
        <div className="border-b border-black/[0.04] px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:border-white/[0.06]">
          Data & Backup
        </div>
        <div className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
          <AppleListItem
            icon={<Cloud className="h-4 w-4" />}
            iconBg="bg-gradient-to-tr from-[#34C759] to-[#007AFF]"
            title={t('more.cloudBackup') || 'Google Drive & Cloud Backup'}
            subtitle="Scheduled, manual, E2EE & restore (WhatsApp style)"
            chevron
            onClick={() => setBackupOpen(true)}
          />
          <AppleListItem
            icon={<Download className="h-4 w-4" />}
            iconBg="bg-[#007AFF]"
            title={t('more.deviceBackup') || 'Download Backup to Device'}
            subtitle="Save offline encrypted .hisaab file on your phone"
            chevron
            onClick={async () => {
              try {
                await exportLocalDeviceBackup()
                toast({ text: 'Offline backup saved to your device!', tone: 'ok' })
              } catch (e: any) {
                toast({ text: 'Backup failed', tone: 'info' })
              }
            }}
          />
          <AppleListItem
            icon={<Sparkles className="h-4 w-4" />}
            iconBg="bg-gradient-to-tr from-[#FF9500] to-[#FF3B30]"
            title={t('more.demoReset') || 'Load Demo Test Account'}
            subtitle={t('more.demoResetDesc') || 'Re-populate sample transactions and parties for testing'}
            chevron
            onClick={async () => {
              await loginWithDemoAccount(true)
              toast({ text: 'Demo account reloaded with fresh test data!', tone: 'ok' })
              setTimeout(() => {
                location.href = '/'
              }, 400)
            }}
          />
          <a
            href={`https://wa.me/?text=${encodeURIComponent('Hisaab app — madad chahiye')}`}
            target="_blank"
            rel="noreferrer"
            className="block"
          >
            <AppleListItem
              icon={<HelpCircle className="h-4 w-4" />}
              iconBg="bg-[#25D366]"
              title={t('more.help') || 'Customer Support on WhatsApp'}
              subtitle="Talk with our support team"
              chevron
            />
          </a>
        </div>
      </div>

      {/* Danger Zone: Reset Data */}
      <div className="apple-card overflow-hidden border border-rose-500/20 bg-rose-500/5">
        <button
          type="button"
          onClick={() => setReset(true)}
          className="apple-press flex w-full items-center justify-between p-4 text-left text-sm font-semibold text-[#FF3B30]"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <span>{t('more.reset') || 'Reset & Delete All Business Data'}</span>
          </div>
          <ChevronRight className="h-4 w-4 opacity-50" />
        </button>
      </div>
      </div>

      {/* Passcode Change Sheet */}
      <Sheet
        open={!!pinStep}
        onClose={() => {
          setPinStep(null)
          setPinErr('')
        }}
        title={t('more.pin') || 'Change Passcode'}
      >
        <div className="py-4">
          {pinStep === 'old' && (
            <PinPad
              title={t('lock.title') || 'Enter Current Passcode'}
              error={pinErr}
              onDone={async (p) => {
                if (await checkPin(p)) {
                  setPinErr('')
                  setPinStep('new')
                } else {
                  setPinErr(t('lock.wrong') || 'Wrong passcode')
                }
              }}
            />
          )}
          {pinStep === 'new' && (
            <PinPad
              title={t('onb.pinTitle') || 'Enter New 4-Digit Passcode'}
              onDone={async (p) => {
                await setPin(p)
                setPinStep(null)
                toast({ text: t('add.saved') || 'New passcode saved', tone: 'ok' })
              }}
            />
          )}
        </div>
      </Sheet>

      {/* Lock Confirm Modal */}
      <Confirm
        open={lockAsk}
        icon="Lock"
        yesTone="blue"
        text={t('more.lock') + '?'}
        onNo={() => setLockAsk(false)}
        onYes={() => {
          setLockAsk(false)
          onLock()
        }}
      />

      {/* Danger Reset Sheet */}
      <Sheet open={reset} onClose={() => setReset(false)} title={t('more.reset') || 'Reset All Data'}>
        <div className="space-y-4 py-2 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10 text-[#FF3B30]">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {t('more.resetConfirm') ||
              'This will permanently erase all business ledgers, transactions, and categories from this device. Type DELETE to confirm.'}
          </p>
          <input
            className={`${inputCls} text-center font-bold tracking-widest`}
            value={resetText}
            onChange={(e) => setResetText(e.target.value)}
            placeholder="DELETE"
          />
          <Btn
            tone="danger"
            className="w-full"
            disabled={resetText !== 'DELETE'}
            onClick={async () => {
              await db.delete()
              if (typeof localStorage !== 'undefined') localStorage.clear()
              location.href = '/'
            }}
          >
            {t('act.delete') || 'Permanently Delete Everything'}
          </Btn>
        </div>
      </Sheet>

      {/* WhatsApp Style Google Drive & Local Backup Sheet */}
      <BackupSheet open={backupOpen} onClose={() => setBackupOpen(false)} />
    </div>
  )
}
