// Platform-admin user management: list everyone, add a user (optionally into a shop), disable / enable.
import { addMembership, adminClient, ensureUser, handle, HttpError, parseContact, parseRole, requirePlatformAdmin } from '../../../../lib/server/admin'

export const dynamic = 'force-dynamic'

export const GET = handle(async (req) => {
  await requirePlatformAdmin(req)
  const sb = adminClient()
  const users = []
  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new HttpError(500, error.message)
    users.push(...data.users)
    if (data.users.length < 1000) break
  }
  const [{ data: members, error: mErr }, { data: shops, error: bErr }] = await Promise.all([
    sb.from('memberships').select('org_id, user_id, role'),
    sb.from('businesses').select('id, org_id, name').is('deleted_at', null),
  ])
  if (mErr || bErr) throw new HttpError(500, (mErr || bErr)!.message)

  const shopsByOrg = new Map<string, { id: string; name: string }[]>()
  for (const b of shops ?? []) shopsByOrg.set(b.org_id, [...(shopsByOrg.get(b.org_id) ?? []), { id: b.id, name: b.name }])

  return {
    users: users
      .map((u) => ({
        id: u.id,
        email: u.email ?? null,
        phone: u.phone ? `+${u.phone.replace(/^\+/, '')}` : null,
        name: (u.user_metadata?.name as string) ?? '',
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at ?? null,
        disabled: !!u.banned_until && Date.parse(u.banned_until) > Date.now(),
        shops: (members ?? [])
          .filter((m) => m.user_id === u.id)
          .flatMap((m) => (shopsByOrg.get(m.org_id) ?? []).map((s) => ({ ...s, orgId: m.org_id, role: m.role as string }))),
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    shops: (shops ?? []).map((s) => ({ id: s.id, orgId: s.org_id, name: s.name })),
  }
})

/** Body: { contact: email or mobile, name?, orgId?, role? } */
export const POST = handle(async (req) => {
  await requirePlatformAdmin(req)
  const body = await req.json().catch(() => ({}))
  const contact = parseContact(body.contact)
  const user = await ensureUser(contact, typeof body.name === 'string' ? body.name.trim() : '')
  if (body.orgId) await addMembership(String(body.orgId), user.id, parseRole(body.role ?? 'editor'))
  return { ok: true, userId: user.id, created: user.created }
})

/** Body: { id, disabled: boolean } — a disabled user cannot sign in or refresh their session. */
export const PATCH = handle(async (req) => {
  const me = await requirePlatformAdmin(req)
  const body = await req.json().catch(() => ({}))
  if (!body.id) throw new HttpError(400, 'Missing user id')
  if (body.id === me.id) throw new HttpError(400, 'You cannot disable your own account')
  const { error } = await adminClient().auth.admin.updateUserById(String(body.id), {
    ban_duration: body.disabled ? '876000h' : 'none',
  })
  if (error) throw new HttpError(400, error.message)
  return { ok: true }
})
