'use client'

// Shows whether this device is really connected to the cloud, and lets the user sign in,
// sync now, or open another shop that exists on their account (e.g. one created on another phone).

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Cloud, CloudOff, RefreshCw } from 'lucide-react'
import type { Business } from '../db/types'
import { setSetting } from '../db/db'
import { getCurrentCloudUser, signOut } from '../lib/auth'
import { claimInvitesCloud, isCloudEnabled, myBusinessesCloud, type CloudBusinessRow } from '../lib/supabase'
import { fullSync, getSyncState, isSyncableBusiness, restoreFromCloud, type SyncState } from '../lib/sync'
import { CloudLogin } from './CloudLogin'
import { Btn, Sheet } from './ui'

function ago(iso: string | null) {
  if (!iso) return 'never'
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  return new Date(iso).toLocaleString()
}

export function CloudSyncCard({ business }: { business: Business }) {
  const [state, setState] = useState<SyncState | null>(null)
  const [account, setAccount] = useState<string>('')
  const [others, setOthers] = useState<CloudBusinessRow[]>([])
  const [loginOpen, setLoginOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setState(await getSyncState())
    const u = await getCurrentCloudUser().catch(() => null)
    setAccount(u ? u.email || (u.phone ? '+' + u.phone : '') : '')
    if (u) {
      const list = await myBusinessesCloud().catch(() => [])
      setOthers(list.filter((r) => r.business_id !== business.id))
    } else setOthers([])
  }, [business.id])

  useEffect(() => {
    refresh()
    const h = () => { getSyncState().then(setState) }
    window.addEventListener('hisaab_sync_state', h)
    return () => window.removeEventListener('hisaab_sync_state', h)
  }, [refresh])

  const syncNow = async () => {
    setBusy(true)
    await fullSync()
    await refresh()
    setBusy(false)
  }

  const openShop = async (r: CloudBusinessRow) => {
    setBusy(true)
    const b = await restoreFromCloud(r)
    await setSetting('activeBusiness', b.id)
    location.href = '/'
  }

  if (!isCloudEnabled()) {
    return (
      <Card icon={<CloudOff className="h-5 w-5" />} tone="grey" title="Cloud sync is off"
        text="Supabase keys are not set in this build, so data stays on this device only." />
    )
  }
  if (!isSyncableBusiness(business.id)) {
    return (
      <Card icon={<CloudOff className="h-5 w-5" />} tone="grey" title="Demo shop — not synced"
        text="The demo account lives only on this device. Sign out of the demo and sign in with your own account to sync." />
    )
  }

  const signedIn = !!account
  const error = state?.lastError
  return (
    <>
      <Card
        icon={signedIn && !error ? <CheckCircle2 className="h-5 w-5" /> : signedIn ? <AlertTriangle className="h-5 w-5" /> : <Cloud className="h-5 w-5" />}
        tone={signedIn && !error ? 'green' : signedIn ? 'amber' : 'blue'}
        title={signedIn ? (error ? 'Sync problem' : 'Synced to cloud') : 'Not signed in — data is only on this phone'}
        text={
          signedIn
            ? `${account} · last sync ${ago(state?.lastOkAt ?? null)}${state?.pending ? ` · ${state.pending} change(s) waiting` : ''}`
            : 'Sign in with the same mobile number or email on every device to see the same entries everywhere.'
        }
      >
        {error && <p className="mt-2 rounded-lg bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">{error}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {signedIn ? (
            <>
              <Btn tone="blue" className="flex-1" disabled={busy} onClick={syncNow}>
                <span className="inline-flex items-center gap-1.5"><RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /> Sync now</span>
              </Btn>
              <Btn tone="ghost" onClick={async () => { await signOut(); await refresh() }}>Sign out</Btn>
            </>
          ) : (
            <Btn tone="blue" className="w-full" onClick={() => setLoginOpen(true)}>Sign in to sync</Btn>
          )}
        </div>
        {others.length > 0 && (
          <div className="mt-3 border-t border-black/[0.06] pt-3 dark:border-white/[0.08]">
            <p className="mb-2 text-xs text-neutral-500">Other shops on this account:</p>
            {others.map((r) => (
              <button key={r.business_id} disabled={busy} onClick={() => openShop(r)}
                className="apple-press mb-1 flex w-full items-center justify-between rounded-xl bg-neutral-100 px-3 py-2 text-left text-sm font-semibold dark:bg-neutral-800">
                <span>{r.name}</span><span className="text-xs text-[#007AFF]">Open →</span>
              </button>
            ))}
          </div>
        )}
      </Card>

      <Sheet open={loginOpen} onClose={() => setLoginOpen(false)} title="Sign in to sync">
        <CloudLogin
          initialPhone={business.ownerPhone}
          onSignedIn={async () => {
            setLoginOpen(false)
            setBusy(true)
            await claimInvitesCloud()
            await fullSync() // registers this shop on your account and uploads it
            await refresh()
            setBusy(false)
          }}
        />
      </Sheet>
    </>
  )
}

function Card({ icon, title, text, tone, children }: {
  icon: React.ReactNode; title: string; text: string; tone: 'green' | 'amber' | 'blue' | 'grey'; children?: React.ReactNode
}) {
  const bg = { green: 'bg-[#34C759]', amber: 'bg-[#FF9500]', blue: 'bg-[#007AFF]', grey: 'bg-neutral-400' }[tone]
  return (
    <div className="apple-card p-4">
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white ${bg}`}>{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-neutral-900 dark:text-white">{title}</div>
          <div className="break-words text-xs text-neutral-500">{text}</div>
        </div>
      </div>
      {children}
    </div>
  )
}
