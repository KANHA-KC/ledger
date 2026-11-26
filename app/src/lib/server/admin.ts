// Server-only helpers for the invite-only flow. Uses the Supabase SERVICE ROLE key, which must
// never reach the browser: it lives in SUPABASE_SERVICE_ROLE_KEY (no NEXT_PUBLIC_ prefix).
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

let cached: SupabaseClient | null = null
export function adminClient(): SupabaseClient {
  if (cached) return cached
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new HttpError(500, 'Server is missing SUPABASE_SERVICE_ROLE_KEY. Add it to the server environment (.env.local / hosting settings).')
  cached = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return cached
}

/** The signed-in user making this request, from the `Authorization: Bearer <access token>` header. */
export async function requireCaller(req: Request): Promise<User> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) throw new HttpError(401, 'Not signed in')
  const { data, error } = await adminClient().auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'Session expired. Sign in again.')
  return data.user
}

const digits = (s: string) => s.replace(/\D/g, '')

/** Platform admins: listed in ADMIN_EMAILS / ADMIN_PHONES (comma-separated), or app_metadata.role = 'platform_admin'. */
export function isPlatformAdmin(u: User): boolean {
  if (u.app_metadata?.role === 'platform_admin') return true
  const emails = (process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  const phones = (process.env.ADMIN_PHONES ?? '').split(',').map((s) => digits(s).slice(-10)).filter(Boolean)
  return (!!u.email && emails.includes(u.email.toLowerCase())) || (!!u.phone && phones.includes(digits(u.phone).slice(-10)))
}

export async function requirePlatformAdmin(req: Request): Promise<User> {
  const u = await requireCaller(req)
  if (!isPlatformAdmin(u)) throw new HttpError(403, 'Only the platform admin can do this')
  return u
}

export type Contact = { email: string | null; phone: string | null }

/** Accepts an email or an Indian mobile number; phone becomes E.164 (+91XXXXXXXXXX). */
export function parseContact(raw: string): Contact {
  const c = (raw ?? '').trim()
  if (c.includes('@')) {
    if (!/^\S+@\S+\.\S+$/.test(c)) throw new HttpError(400, 'Invalid email address')
    return { email: c.toLowerCase(), phone: null }
  }
  const d = digits(c)
  if (d.length === 10) return { email: null, phone: `+91${d}` }
  if (d.length === 12 && d.startsWith('91')) return { email: null, phone: `+${d}` }
  throw new HttpError(400, 'Enter an email or a 10-digit mobile number')
}

/** Find the account for this email/phone, creating it (already confirmed, no password) if needed. */
export async function ensureUser(contact: Contact, name = ''): Promise<{ id: string; created: boolean }> {
  const sb = adminClient()
  const q = sb.from('profiles').select('id').limit(1)
  const { data: found, error: findErr } = contact.email
    ? await q.ilike('email', contact.email)
    : await q.eq('phone', digits(contact.phone!))
  if (findErr) throw new HttpError(500, findErr.message)
  if (found && found.length) return { id: found[0].id as string, created: false }

  const { data, error } = await sb.auth.admin.createUser({
    ...(contact.email ? { email: contact.email, email_confirm: true } : { phone: contact.phone!, phone_confirm: true }),
    user_metadata: name ? { name } : undefined,
  })
  if (error || !data.user) throw new HttpError(400, error?.message || 'Could not create the user')
  return { id: data.user.id, created: true }
}

const ROLES = ['admin', 'editor', 'viewer'] as const
export type GrantRole = (typeof ROLES)[number]
export function parseRole(r: unknown): GrantRole {
  if (typeof r === 'string' && (ROLES as readonly string[]).includes(r)) return r as GrantRole
  throw new HttpError(400, 'Role must be admin, editor or viewer')
}

export async function addMembership(orgId: string, userId: string, role: GrantRole | 'owner') {
  const { data: current } = await adminClient()
    .from('memberships').select('role').eq('org_id', orgId).eq('user_id', userId).maybeSingle()
  if (current?.role === 'owner') return // never demote the owner
  const { error } = await adminClient()
    .from('memberships')
    .upsert({ org_id: orgId, user_id: userId, role }, { onConflict: 'org_id,user_id' })
  if (error) throw new HttpError(400, error.message)
}

export function handle(fn: (req: Request) => Promise<unknown>) {
  return async (req: Request) => {
    try {
      return Response.json(await fn(req))
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500
      const message = e instanceof Error ? e.message : 'Server error'
      if (status === 500) console.error('[api]', e)
      return Response.json({ error: message }, { status })
    }
  }
}
