// Offline-first sync queue. Every entry is written to IndexedDB first with syncStatus='pending'.
// When VITE_API_URL is set, pending entries (with their ledger lines) are pushed when the network returns.
// The server recomputes balances from ledger lines; last-edit-wins per entry using updatedAt.
import { db } from '../db/db'

const API = (typeof process !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_URL || process.env.VITE_API_URL)
  : undefined) as string | undefined

export const syncEnabled = !!API

export async function pushPending(): Promise<number> {
  if (!API || !navigator.onLine) return 0
  const pending = await db.txns.where('syncStatus').equals('pending').toArray()
  if (!pending.length) return 0
  const lines = await db.lines.where('txnId').anyOf(pending.map((t) => t.id)).toArray()
  const res = await fetch(`${API}/sync/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txns: pending.map((t) => ({ ...t, photoId: undefined })), lines }),
  })
  if (!res.ok) return 0
  await db.txns.bulkUpdate(pending.map((t) => ({ key: t.id, changes: { syncStatus: 'synced' as const } })))
  return pending.length
}

export function startSyncLoop() {
  if (!API) return
  const run = () => { pushPending().catch(() => {}) }
  window.addEventListener('online', run)
  setInterval(run, 60_000)
  run()
}
