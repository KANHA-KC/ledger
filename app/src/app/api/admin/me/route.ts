import { handle, isPlatformAdmin, requireCaller } from '../../../../lib/server/admin'

export const dynamic = 'force-dynamic'

/** Is the signed-in user a platform admin? (Used to show the Admin link.) */
export const GET = handle(async (req) => ({ isAdmin: isPlatformAdmin(await requireCaller(req)) }))
