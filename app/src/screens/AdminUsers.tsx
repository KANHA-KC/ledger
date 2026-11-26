'use client'

// Platform admin: Hisaab is invite-only, so every login is created here (or in the Supabase dashboard).
// Add a user by email or mobile, optionally straight into an existing shop; disable / re-enable access.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, Search, ShieldCheck, UserPlus } from 'lucide-react'
import { apiFetch, isCloudEnabled } from '../lib/supabase'
import { useToast } from '../store'
import { Btn, cx, inputCls } from '../components/ui'

type Shop = { id: string; orgId: string; name: string }
type AdminUser = {
  id: string
  email: string | null
  phone: string | null
  name: string
  createdAt: string
  lastSignInAt: string | null
  disabled: boolean
  shops: (Shop & { role: string })[]
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never')

export function AdminUsers() {
  const toast = useToast()
  const [state, setState] = useState<'loading' | 'ready' | 'denied' | 'error'>('loading')
  const [error, setError] = useState('')
  const [users, setUsers] = useState<AdminUser[]>([])
  const [shops, setShops] = useState<Shop[]>([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ contact: '', name: '', orgId: '', role: 'editor' })

  const load = useCallback(async () => {
    try {
      const r = await apiFetch<{ users: AdminUser[]; shops: Shop[] }>('/api/admin/users')
      setUsers(r.users)
      setShops(r.shops)
      setState('ready')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setState(/only the platform admin/i.test(msg) ? 'denied' : 'error')
    }
  }, [])

  useEffect(() => {
    if (isCloudEnabled()) load()
    else { setError('Supabase is not configured in this build.'); setState('error') }
  }, [load])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const r = await apiFetch<{ created: boolean }>('/api/admin/users', {
        method: 'POST',
        body: { contact: form.contact, name: form.name, orgId: form.orgId || undefined, role: form.role },
      })
      toast({ text: r.created ? `${form.contact} can now sign in` : `${form.contact} already had an account${form.orgId ? ' — added to the shop' : ''}`, tone: 'ok' })
      setForm({ contact: '', name: '', orgId: '', role: 'editor' })
      await load()
    } catch (err) {
      toast({ text: err instanceof Error ? err.message : 'Could not add user', tone: 'info' })
    }
    setBusy(false)
  }

  const toggle = async (u: AdminUser) => {
    setBusy(true)
    try {
      await apiFetch('/api/admin/users', { method: 'PATCH', body: { id: u.id, disabled: !u.disabled } })
      toast({ text: `${u.email || u.phone} ${u.disabled ? 'enabled' : 'disabled'}`, tone: 'ok' })
      await load()
    } catch (err) {
      toast({ text: err instanceof Error ? err.message : 'Failed', tone: 'info' })
    }
    setBusy(false)
  }

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    if (!n) return users
    return users.filter((u) => [u.email, u.phone, u.name, ...u.shops.map((s) => s.name)].some((s) => s && s.toLowerCase().includes(n)))
  }, [users, q])

  if (state === 'loading') return <div className="py-16 text-center text-sm text-neutral-500">Loading users…</div>
  if (state !== 'ready') {
    return (
      <div className="apple-card mx-auto max-w-lg p-6 text-center">
        <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-neutral-400" />
        <p className="apple-headline text-neutral-900 dark:text-white">{state === 'denied' ? 'Admins only' : 'Admin panel unavailable'}</p>
        <p className="mt-1 text-sm text-neutral-500">{error}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="apple-title-2 text-neutral-900 dark:text-white">Users</h1>
        <p className="text-xs text-neutral-500">Hisaab is invite-only. People can sign in only after you add them here.</p>
      </div>

      <form onSubmit={add} className="apple-card grid gap-3 p-4 md:grid-cols-[1.4fr_1fr_1.2fr_0.8fr_auto] md:items-end">
        <label className="text-xs font-semibold text-neutral-500">
          Email or mobile
          <input className={cx(inputCls, 'mt-1 h-10 text-sm')} required value={form.contact}
            onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="name@shop.com or 98xxxxxxxx" />
        </label>
        <label className="text-xs font-semibold text-neutral-500">
          Name (optional)
          <input className={cx(inputCls, 'mt-1 h-10 text-sm')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="text-xs font-semibold text-neutral-500">
          Add to shop
          <select className={cx(inputCls, 'mt-1 h-10 text-sm')} value={form.orgId} onChange={(e) => setForm({ ...form, orgId: e.target.value })}>
            <option value="">— None: they create their own shop —</option>
            {shops.map((s) => <option key={s.id} value={s.orgId}>{s.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-neutral-500">
          Role
          <select className={cx(inputCls, 'mt-1 h-10 text-sm')} value={form.role} disabled={!form.orgId}
            onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="admin">Admin</option>
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </select>
        </label>
        <Btn tone="blue" type="submit" disabled={busy || !form.contact.trim()} className="h-10">
          <span className="inline-flex items-center gap-1.5"><UserPlus className="h-4 w-4" /> Add user</span>
        </Btn>
      </form>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input className={cx(inputCls, 'h-9 pl-9 text-sm')} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search users or shops" />
        </div>
        <button type="button" onClick={() => load()} aria-label="Refresh"
          className="apple-press flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-100 dark:bg-[#2C2C2E]">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <div className="apple-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/[0.06] bg-neutral-50 text-left text-xs text-neutral-500 dark:border-white/[0.08] dark:bg-[#2C2C2E]/60">
                <th className="px-4 py-2.5 font-semibold">User</th>
                <th className="px-3 py-2.5 font-semibold">Shops</th>
                <th className="hidden px-3 py-2.5 font-semibold sm:table-cell">Added</th>
                <th className="hidden px-3 py-2.5 font-semibold sm:table-cell">Last sign-in</th>
                <th className="px-4 py-2.5 text-right font-semibold">Access</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((u) => (
                <tr key={u.id} className="border-b border-black/[0.04] last:border-0 dark:border-white/[0.06]">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-neutral-900 dark:text-white">{u.email || u.phone}</div>
                    {(u.name || (u.email && u.phone)) && <div className="text-xs text-neutral-500">{[u.name, u.email && u.phone].filter(Boolean).join(' · ')}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-neutral-600 dark:text-neutral-300">
                    {u.shops.length ? u.shops.map((s) => <div key={s.id}>{s.name} <span className="text-neutral-400">· {s.role}</span></div>) : <span className="text-neutral-400">No shop yet</span>}
                  </td>
                  <td className="hidden whitespace-nowrap px-3 py-2.5 text-xs text-neutral-500 sm:table-cell">{when(u.createdAt)}</td>
                  <td className="hidden whitespace-nowrap px-3 py-2.5 text-xs text-neutral-500 sm:table-cell">{when(u.lastSignInAt)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button type="button" disabled={busy} onClick={() => toggle(u)}
                      className={cx('apple-press rounded-full px-3 py-1 text-xs font-semibold',
                        u.disabled ? 'bg-[#FF3B30]/10 text-[#D70015]' : 'bg-[#34C759]/15 text-[#1C7430] dark:text-[#30D158]')}>
                      {u.disabled ? 'Disabled — enable' : 'Active — disable'}
                    </button>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-neutral-500">No users yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
