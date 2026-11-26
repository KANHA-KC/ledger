import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { MemberRole } from '../db/types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export const isCloudEnabled = (): boolean => {
  return Boolean(
    supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith('https://') &&
    supabaseAnonKey.length > 20 &&
    !supabaseUrl.includes('placeholder')
  )
}

export const supabase: SupabaseClient | null = isCloudEnabled()
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

export interface CloudOrgResult {
  org_id: string
  business_id: string
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface CloudSyncPullResult {
  business: any | null
  accounts: any[]
  categories: any[]
  parties: any[]
  txns: any[]
  server_version: number
}

export interface CloudBusinessRow {
  org_id: string
  org_name: string
  business_id: string
  name: string
  type: string
  language: string
  owner_phone: string
  fy_start_month: number
  created_at: string
  role: MemberRole
}

/** Register a shop on the server using the device's own business id (safe to retry). */
export async function createOrgCloud(opts: {
  orgName: string
  bizName: string
  bizType?: string
  language?: string
  businessId: string
  ownerPhone?: string
}): Promise<CloudOrgResult | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('create_org', {
    p_org_name: opts.orgName,
    p_biz_name: opts.bizName,
    p_biz_type: opts.bizType ?? 'other',
    p_language: opts.language ?? 'hi',
    p_business_id: opts.businessId,
    p_owner_phone: opts.ownerPhone ?? '',
  })
  if (error) throw error
  return data as CloudOrgResult
}

/** Shops the signed-in user belongs to (owner, admin, editor or viewer). */
export async function myBusinessesCloud(): Promise<CloudBusinessRow[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('my_businesses')
  if (error) throw error
  return (data as CloudBusinessRow[]) ?? []
}

/** Join any shops this phone/email was invited to. */
export async function claimInvitesCloud(): Promise<number> {
  if (!supabase) return 0
  const { data, error } = await supabase.rpc('claim_my_invites')
  if (error) {
    console.warn('[Supabase] claim_my_invites:', error.message)
    return 0
  }
  return Number(data) || 0
}

/** Which sign-in methods are switched on in the Supabase project (Auth → Providers). */
export async function getAuthProviders(): Promise<{ phone: boolean; email: boolean }> {
  if (!isCloudEnabled()) return { phone: false, email: false }
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: supabaseAnonKey } })
    const json = await res.json()
    return { phone: !!json?.external?.phone, email: !!json?.external?.email }
  } catch {
    return { phone: true, email: true }
  }
}

export async function acceptInviteCloud(inviteId: string): Promise<{ success: boolean; org_id: string } | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('accept_invite', {
    p_invite_id: inviteId,
  })
  if (error) {
    console.error('[Supabase] accept_invite error:', error)
    throw error
  }
  return data as { success: boolean; org_id: string }
}

export async function syncPushCloud(businessId: string, changes: Record<string, unknown>): Promise<number | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('sync_push', {
    p_business_id: businessId,
    p_changes: changes,
  })
  if (error) {
    console.error('[Supabase] sync_push error:', error)
    throw error
  }
  return Number(data)
}

export async function syncPullCloud(businessId: string, since: number): Promise<CloudSyncPullResult | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('sync_pull', {
    p_business_id: businessId,
    p_since: since,
  })
  if (error) {
    console.error('[Supabase] sync_pull error:', error)
    throw error
  }
  return data as CloudSyncPullResult
}

export interface MemberRow {
  userId: string
  name: string
  phone: string
  role: MemberRole
  isCurrentUser: boolean
}

export interface InviteRow {
  id: string
  phone: string
  role: MemberRole
  expiresAt: string
}

export async function fetchOrgMembers(orgId: string): Promise<{ members: MemberRow[]; invites: InviteRow[] } | null> {
  if (!supabase) return null

  const currentUser = (await supabase.auth.getUser()).data.user

  // Fetch memberships joined with profiles
  const { data: memData, error: memError } = await supabase
    .from('memberships')
    .select('role, user_id, profiles(id, name, phone, email)')
    .eq('org_id', orgId)

  if (memError) {
    console.error('[Supabase] fetch memberships error:', memError)
    return null
  }

  const members: MemberRow[] = (memData || []).map((m: any) => ({
    userId: m.user_id,
    name: m.profiles?.name || m.profiles?.email || m.profiles?.phone || 'User',
    phone: m.profiles?.phone || m.profiles?.email || '',
    role: m.role as MemberRole,
    isCurrentUser: currentUser ? currentUser.id === m.user_id : false,
  }))

  // Fetch invitations
  const { data: invData, error: invError } = await supabase
    .from('invitations')
    .select('id, phone, email, role, expires_at')
    .eq('org_id', orgId)
    .is('accepted_at', null)

  if (invError) {
    console.error('[Supabase] fetch invitations error:', invError)
  }

  const invites: InviteRow[] = (invData || []).map((i: any) => ({
    id: i.id,
    phone: i.phone || i.email || '',
    role: i.role as MemberRole,
    expiresAt: i.expires_at,
  }))

  return { members, invites }
}

/** Call one of this app's server routes (app/api/*) as the signed-in user. Throws with the server's message. */
export async function apiFetch<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  if (!supabase) throw new Error('Cloud is not configured')
  const token = (await supabase.auth.getSession()).data.session?.access_token
  if (!token) throw new Error('Sign in to the cloud first (More → Sign in to sync)')
  const res = await fetch(path, {
    method: init.method ?? 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`)
  return json as T
}

/** Add a team member. Sign-ups are closed, so the server creates their login if needed and adds them to the shop. */
export async function inviteMemberCloud(orgId: string, contact: string, role: MemberRole): Promise<boolean> {
  if (role === 'owner') throw new Error('A shop has only one owner')
  await apiFetch('/api/team/invite', { method: 'POST', body: { orgId, contact, role } })
  return true
}

export async function removeMemberCloud(orgId: string, userId: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase
    .from('memberships')
    .delete()
    .eq('org_id', orgId)
    .eq('user_id', userId)

  if (error) {
    console.error('[Supabase] removeMember error:', error)
    throw error
  }
  return true
}

export async function revokeInviteCloud(inviteId: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase
    .from('invitations')
    .delete()
    .eq('id', inviteId)

  if (error) {
    console.error('[Supabase] revokeInvite error:', error)
    throw error
  }
  return true
}
