// A shop owner/admin adds a team member. Sign-ups are closed, so the account is created here
// (if it does not exist yet) and added to the shop straight away.
import { addMembership, adminClient, ensureUser, handle, HttpError, parseContact, parseRole, requireCaller } from '../../../../lib/server/admin'

export const dynamic = 'force-dynamic'

/** Body: { orgId, contact: email or mobile, role } */
export const POST = handle(async (req) => {
  const caller = await requireCaller(req)
  const body = await req.json().catch(() => ({}))
  if (!body.orgId) throw new HttpError(400, 'Missing shop')
  const role = parseRole(body.role)
  const { data: m } = await adminClient()
    .from('memberships')
    .select('role')
    .eq('org_id', body.orgId)
    .eq('user_id', caller.id)
    .maybeSingle()
  if (!m || !['owner', 'admin'].includes(m.role)) throw new HttpError(403, 'Only the shop owner or an admin can add members')
  if (role === 'admin' && m.role !== 'owner') throw new HttpError(403, 'Only the owner can add another admin')

  const user = await ensureUser(parseContact(body.contact))
  if (user.id === caller.id) throw new HttpError(400, 'That is your own account')
  await addMembership(String(body.orgId), user.id, role)
  return { ok: true, created: user.created }
})
