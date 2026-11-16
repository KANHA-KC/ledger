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

export interface CloudSyncPullResult {
  accounts: any[]
  categories: any[]
  parties: any[]
  txns: any[]
  server_version: number
}

export async function createOrgCloud(
  orgName: string,
  bizName: string,
  bizType = 'general',
  language = 'hi'
): Promise<CloudOrgResult | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('create_org', {
    p_org_name: orgName,
    p_biz_name: bizName,
    p_biz_type: bizType,
    p_language: language,
  })
  if (error) {
    console.error('[Supabase] create_org error:', error)
    throw error
  }
  return data as CloudOrgResult
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

export async function syncPushCloud(businessId: string, changes: Record<string, any[]>): Promise<number | null> {
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
    .select('role, user_id, profiles(id, name, phone)')
    .eq('org_id', orgId)

  if (memError) {
    console.error('[Supabase] fetch memberships error:', memError)
    return null
  }

  const members: MemberRow[] = (memData || []).map((m: any) => ({
    userId: m.user_id,
    name: m.profiles?.name || 'User',
    phone: m.profiles?.phone || '',
    role: m.role as MemberRole,
    isCurrentUser: currentUser ? currentUser.id === m.user_id : false,
  }))

  // Fetch invitations
  const { data: invData, error: invError } = await supabase
    .from('invitations')
    .select('id, phone, role, expires_at')
    .eq('org_id', orgId)
    .is('accepted_at', null)

  if (invError) {
    console.error('[Supabase] fetch invitations error:', invError)
  }

  const invites: InviteRow[] = (invData || []).map((i: any) => ({
    id: i.id,
    phone: i.phone,
    role: i.role as MemberRole,
    expiresAt: i.expires_at,
  }))

  return { members, invites }
}

export async function inviteMemberCloud(orgId: string, phone: string, role: MemberRole): Promise<boolean> {
  if (!supabase) return false
  const user = (await supabase.auth.getUser()).data.user
  if (!user) return false

  const { error } = await supabase.from('invitations').insert({
    org_id: orgId,
    phone: phone.trim(),
    role,
    invited_by: user.id,
  })

  if (error) {
    console.error('[Supabase] invite error:', error)
    throw error
  }
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
