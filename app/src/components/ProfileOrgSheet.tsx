'use client'

import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  User,
  Building2,
  Shield,
  ShieldAlert,
  UserPlus,
  Trash2,
  Check,
  Edit3,
  Eye,
  Lock,
  ArrowRightLeft,
  Users,
  Smartphone,
  Mail,
  AlertCircle,
} from 'lucide-react'
import { db, getSetting, setSetting, uuid } from '../db/db'
import type { Business, MemberRole, OrgMember } from '../db/types'
import { isCloudEnabled, fetchOrgMembers, inviteMemberCloud, removeMemberCloud } from '../lib/supabase'
import { useToast } from '../store'
import { TranslitInput } from './TranslitInput'
import { Btn, Confirm, Field, Sheet, cx, inputCls } from './ui'
import { AppleSegmentedControl } from './apple/AppleSegmentedControl'

const ORG_MEMBERS_KEY = 'org_members'

export function ProfileOrgSheet({
  open,
  onClose,
  business,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  business: Business
  onSaved?: () => void
}) {
  const { t, i18n } = useTranslation()
  const toast = useToast()

  // Active Tab: 'profile' or 'team'
  const [tab, setTab] = useState<'profile' | 'team'>('profile')

  // User Profile State
  const [userName, setUserName] = useState('Dilip Chandravanshi')
  const [userRole, setUserRole] = useState<MemberRole>('admin')
  const [companyName, setCompanyName] = useState(business.name)

  // Team Members State
  const [members, setMembers] = useState<OrgMember[]>([])
  const [showAddMember, setShowAddMember] = useState(false)
  const [newMemberName, setNewMemberName] = useState('')
  const [newMemberPhone, setNewMemberPhone] = useState('')
  const [newMemberRole, setNewMemberRole] = useState<MemberRole>('editor')
  const [deleteTarget, setDeleteTarget] = useState<OrgMember | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const isAdmin = userRole === 'admin' || userRole === 'owner'

  // Load initial profile and team members from storage / cloud
  useEffect(() => {
    if (!open) return

    try {
      const storedName = localStorage.getItem('hisaab_user_name') || 'Dilip Chandravanshi'
      const storedRole = (localStorage.getItem('hisaab_user_role') as MemberRole) || 'admin'
      setUserName(storedName)
      setUserRole(storedRole)
      setCompanyName(business.name)
    } catch {
      /* ignore */
    }

    ;(async () => {
      if (business.orgId && isCloudEnabled()) {
        try {
          const cloudData = await fetchOrgMembers(business.orgId)
          if (cloudData && cloudData.members.length > 0) {
            const mappedMembers: OrgMember[] = cloudData.members.map((m) => ({
              id: m.userId,
              name: m.name,
              phone: m.phone,
              role: m.role,
              addedAt: new Date().toISOString(),
              isCurrentUser: m.isCurrentUser,
            }))
            setMembers(mappedMembers)
            const currentMem = cloudData.members.find((m) => m.isCurrentUser)
            if (currentMem) {
              setUserName(currentMem.name)
              setUserRole(currentMem.role)
              localStorage.setItem('hisaab_user_name', currentMem.name)
              localStorage.setItem('hisaab_user_role', currentMem.role)
            }
            return
          }
        } catch (e) {
          console.warn('[ProfileOrgSheet] Cloud members fetch fallback:', e)
        }
      }

      const initialDefaultMembers: OrgMember[] = [
        {
          id: 'member-owner',
          name: localStorage.getItem('hisaab_user_name') || 'Dilip Chandravanshi',
          phone: business.ownerPhone ? `+91 ${business.ownerPhone}` : '+91 9876543210',
          role: 'admin',
          addedAt: new Date().toISOString(),
          isCurrentUser: true,
        },
        {
          id: 'member-editor-1',
          name: 'Ramesh Kumar (Data Entry)',
          phone: '+91 9811223344',
          role: 'editor',
          addedAt: new Date().toISOString(),
        },
        {
          id: 'member-viewer-1',
          name: 'Anita Verma (Accountant)',
          phone: '+91 9877001122',
          role: 'viewer',
          addedAt: new Date().toISOString(),
        },
      ]

      const stored = await getSetting<OrgMember[]>(ORG_MEMBERS_KEY, initialDefaultMembers)
      setMembers(stored)
    })()
  }, [open, business])

  // Save Profile & Company Changes
  const handleSaveProfile = async () => {
    if (!userName.trim()) {
      toast({ text: 'User name cannot be empty', tone: 'info' })
      return
    }

    if (isAdmin && !companyName.trim()) {
      toast({ text: 'Company name cannot be empty', tone: 'info' })
      return
    }

    setIsSaving(true)
    try {
      // 1. Update localStorage
      localStorage.setItem('hisaab_user_name', userName.trim())
      localStorage.setItem('hisaab_user_role', userRole)

      // 2. If Admin, update business name in database
      if (isAdmin && companyName.trim() !== business.name) {
        await db.businesses.update(business.id, { name: companyName.trim() })
      }

      // 3. Update current user entry in team members
      const updatedMembers = members.map((m) =>
        m.isCurrentUser || m.id === 'member-owner'
          ? { ...m, name: userName.trim(), role: userRole }
          : m
      )
      await setSetting(ORG_MEMBERS_KEY, updatedMembers)
      setMembers(updatedMembers)

      // Broadcast update event so headers & screens refresh instantly
      window.dispatchEvent(new Event('hisaab_user_updated'))

      toast({ text: t('profile.saved') || 'Profile & Organization updated successfully', tone: 'ok' })
      onSaved?.()
      onClose()
    } catch (err) {
      console.error('Failed to save profile:', err)
      toast({ text: 'Failed to save changes', tone: 'info' })
    } finally {
      setIsSaving(false)
    }
  }

  // Add a new member to organization
  const handleAddMember = async () => {
    if (!newMemberName.trim()) {
      toast({ text: 'Member name is required', tone: 'info' })
      return
    }

    if (business.orgId && isCloudEnabled() && newMemberPhone.trim()) {
      try {
        await inviteMemberCloud(business.orgId, newMemberPhone.trim(), newMemberRole)
        toast({
          text: `Invite sent to ${newMemberPhone.trim()}`,
          tone: 'ok',
        })
      } catch (err: any) {
        console.error('Failed to send cloud invite:', err)
        toast({ text: err.message || 'Failed to send invite', tone: 'info' })
      }
    }

    const newMember: OrgMember = {
      id: uuid(),
      name: newMemberName.trim(),
      phone: newMemberPhone.trim() || undefined,
      role: newMemberRole,
      addedAt: new Date().toISOString(),
    }

    const updated = [...members, newMember]
    setMembers(updated)
    await setSetting(ORG_MEMBERS_KEY, updated)

    setNewMemberName('')
    setNewMemberPhone('')
    setNewMemberRole('editor')
    setShowAddMember(false)

    toast({
      text: `${newMember.name} added as ${getRoleLabel(newMember.role)}`,
      tone: 'ok',
    })
  }

  // Change existing member role
  const handleChangeMemberRole = async (memberId: string, role: MemberRole) => {
    const updated = members.map((m) => (m.id === memberId ? { ...m, role } : m))
    setMembers(updated)
    await setSetting(ORG_MEMBERS_KEY, updated)

    // If changing current user's role
    const member = members.find((m) => m.id === memberId)
    if (member?.isCurrentUser || member?.name === userName) {
      setUserRole(role)
      localStorage.setItem('hisaab_user_role', role)
      window.dispatchEvent(new Event('hisaab_user_updated'))
    }

    toast({ text: 'Member role updated', tone: 'info' })
  }

  // Remove member
  const handleConfirmDeleteMember = async () => {
    if (!deleteTarget) return

    if (business.orgId && isCloudEnabled() && deleteTarget.id) {
      try {
        await removeMemberCloud(business.orgId, deleteTarget.id)
      } catch (err) {
        console.warn('Could not remove from cloud (offline/mock):', err)
      }
    }

    const updated = members.filter((m) => m.id !== deleteTarget.id)
    setMembers(updated)
    await setSetting(ORG_MEMBERS_KEY, updated)
    setDeleteTarget(null)
    toast({ text: `${deleteTarget.name} removed from organization`, tone: 'info' })
  }

  // Switch Active Persona/User
  const handleSwitchToMember = (m: OrgMember) => {
    setUserName(m.name)
    setUserRole(m.role)
    localStorage.setItem('hisaab_user_name', m.name)
    localStorage.setItem('hisaab_user_role', m.role)

    // Update isCurrentUser flag
    const updated = members.map((mem) => ({
      ...mem,
      isCurrentUser: mem.id === m.id,
    }))
    setMembers(updated)
    setSetting(ORG_MEMBERS_KEY, updated)

    window.dispatchEvent(new Event('hisaab_user_updated'))
    toast({
      text: `Switched active user to ${m.name} (${getRoleLabel(m.role)})`,
      tone: 'ok',
    })
  }

  const getRoleLabel = (role: MemberRole) => {
    switch (role) {
      case 'admin':
        return 'Admin / Owner'
      case 'editor':
        return 'Editor (Data Entry)'
      case 'viewer':
        return 'Viewer (Read-only)'
    }
  }

  const getRoleBadge = (role: MemberRole) => {
    switch (role) {
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2 py-0.5 text-[11px] font-bold text-purple-700 dark:text-purple-300 border border-purple-500/20">
            <Shield className="h-3 w-3" />
            <span>Admin</span>
          </span>
        )
      case 'editor':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-bold text-[#007AFF] border border-blue-500/20">
            <Edit3 className="h-3 w-3" />
            <span>Editor (Data Entry)</span>
          </span>
        )
      case 'viewer':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-neutral-500/10 px-2 py-0.5 text-[11px] font-bold text-neutral-600 dark:text-neutral-400 border border-neutral-500/20">
            <Eye className="h-3 w-3" />
            <span>Viewer</span>
          </span>
        )
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('profile.settingsTitle') || 'Profile & Organization Settings'}
      widthCls="md:w-[560px]"
      footer={
        <div className="grid grid-cols-2 gap-2.5">
          <Btn tone="ghost" onClick={onClose} disabled={isSaving}>
            {t('act.cancel') || 'Cancel'}
          </Btn>
          <Btn tone="blue" onClick={handleSaveProfile} disabled={isSaving}>
            {isSaving
              ? 'Saving…'
              : t('act.saveChanges', { defaultValue: 'Save Changes' })}
          </Btn>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Apple Segmented Control for Tabs */}
        <AppleSegmentedControl
          value={tab}
          onChange={(v) => setTab(v as 'profile' | 'team')}
          options={[
            {
              value: 'profile',
              label: (
                <span className="flex items-center justify-center gap-1.5 font-bold">
                  <User className="h-3.5 w-3.5" />
                  <span>Profile & Company</span>
                </span>
              ),
            },
            {
              value: 'team',
              label: (
                <span className="flex items-center justify-center gap-1.5 font-bold">
                  <Users className="h-3.5 w-3.5" />
                  <span>Team & Roles ({members.length})</span>
                </span>
              ),
            },
          ]}
        />

        {/* TAB 1: PROFILE & COMPANY INFO */}
        {tab === 'profile' && (
          <div className="space-y-4">
            {/* Active User Persona Banner */}
            <div className="flex items-center justify-between rounded-2xl border border-black/[0.06] bg-neutral-50 p-3.5 dark:border-white/[0.08] dark:bg-[#2C2C2E]/60">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#34C759] to-[#007AFF] text-base font-extrabold text-white shadow-sm">
                  {userName.trim() ? userName.trim().charAt(0).toUpperCase() : 'U'}
                </div>
                <div>
                  <div className="text-sm font-bold text-neutral-900 dark:text-white">
                    {userName}
                  </div>
                  <div className="mt-0.5">{getRoleBadge(userRole)}</div>
                </div>
              </div>

              <span className="text-[11px] font-semibold text-neutral-400">
                Active User
              </span>
            </div>

            {/* Field: Your Full Name */}
            <Field label={t('profile.yourName') || 'Your Name'}>
              <TranslitInput
                value={userName}
                onChange={setUserName}
                placeholder="e.g. Dilip Chandravanshi"
              />
            </Field>

            {/* Field: Company / Organization Name */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-[#6E6E73] dark:text-[#A1A1A6]">
                  {t('profile.companyName') || 'Company / Business Name'}
                </span>
                {isAdmin ? (
                  <span className="text-[11px] font-semibold text-[#007AFF] flex items-center gap-1">
                    <Shield className="h-3 w-3" /> Admin Editable
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <Lock className="h-3 w-3" /> Admin Only
                  </span>
                )}
              </div>
              {isAdmin ? (
                <TranslitInput
                  value={companyName}
                  onChange={setCompanyName}
                  placeholder="e.g. Jai Gurudev Traders"
                />
              ) : (
                <div className="space-y-1.5">
                  <input
                    type="text"
                    disabled
                    value={companyName}
                    className={`${inputCls} bg-neutral-100 dark:bg-neutral-800 text-neutral-500 cursor-not-allowed opacity-80`}
                  />
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    <span>Only Admins can change the company name. You are currently logged in as a {getRoleLabel(userRole)}.</span>
                  </p>
                </div>
              )}
            </div>

            {/* Field: Your Role */}
            <Field label={t('profile.role') || 'Your Role in Organization'}>
              <div className="grid grid-cols-3 gap-2">
                {[
                  {
                    id: 'admin' as MemberRole,
                    title: 'Admin',
                    sub: 'Full access & settings',
                    icon: Shield,
                    color: 'text-purple-600 dark:text-purple-400',
                  },
                  {
                    id: 'editor' as MemberRole,
                    title: 'Editor',
                    sub: 'Data entry person',
                    icon: Edit3,
                    color: 'text-[#007AFF]',
                  },
                  {
                    id: 'viewer' as MemberRole,
                    title: 'Viewer',
                    sub: 'View only access',
                    icon: Eye,
                    color: 'text-neutral-600 dark:text-neutral-400',
                  },
                ].map((r) => {
                  const Icon = r.icon
                  const active = userRole === r.id
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setUserRole(r.id)}
                      className={`apple-press flex flex-col items-center justify-center gap-1 rounded-2xl border p-3 text-center transition-all ${
                        active
                          ? 'border-[#007AFF] bg-[#007AFF]/10 shadow-sm ring-2 ring-[#007AFF]'
                          : 'border-black/[0.06] bg-neutral-50 hover:bg-neutral-100 dark:border-white/[0.08] dark:bg-neutral-800 dark:hover:bg-neutral-700'
                      }`}
                    >
                      <Icon className={`h-5 w-5 ${r.color}`} />
                      <span className="text-xs font-bold text-neutral-900 dark:text-white">
                        {r.title}
                      </span>
                      <span className="text-[10px] text-neutral-500 leading-tight">
                        {r.sub}
                      </span>
                    </button>
                  )
                })}
              </div>
            </Field>
          </div>
        )}

        {/* TAB 2: ORGANIZATION TEAM & ROLES */}
        {tab === 'team' && (
          <div className="space-y-4">
            {/* Header with Permissions Summary & Add Button */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                  Organization Members
                </h3>
                <p className="text-xs text-neutral-500">
                  {isAdmin
                    ? 'You can add people as Editors (data entry) or Viewers'
                    : 'Viewing organization member directory'}
                </p>
              </div>

              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => setShowAddMember(!showAddMember)}
                  className="apple-press inline-flex items-center gap-1.5 rounded-full bg-[#007AFF] px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-[#0066CC]"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  <span>Add Person</span>
                </button>
              ) : (
                <span className="rounded-full bg-neutral-200/60 px-2.5 py-1 text-[11px] font-semibold text-neutral-500 dark:bg-neutral-800">
                  Admin Only to Add
                </span>
              )}
            </div>

            {/* Add Person Drawer / Sub-Form */}
            {showAddMember && isAdmin && (
              <div className="space-y-3.5 rounded-2xl border border-[#007AFF]/25 bg-[#007AFF]/5 p-4 dark:border-[#007AFF]/35 dark:bg-[#007AFF]/10 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between border-b border-black/[0.04] pb-2 dark:border-white/[0.06]">
                  <span className="text-xs font-bold text-[#007AFF]">
                    Add New Team Member
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAddMember(false)}
                    className="apple-press text-xs font-semibold text-neutral-400 hover:text-neutral-700"
                  >
                    Cancel
                  </button>
                </div>

                <div className="grid gap-2.5 sm:grid-cols-2">
                  <Field label="Full Name">
                    <TranslitInput
                      value={newMemberName}
                      onChange={setNewMemberName}
                      placeholder="e.g. Rahul Sharma"
                      autoFocus
                    />
                  </Field>

                  <Field label="Phone / Mobile (Optional)">
                    <input
                      type="tel"
                      value={newMemberPhone}
                      onChange={(e) => setNewMemberPhone(e.target.value)}
                      placeholder="+91 9876543210"
                      className={inputCls}
                    />
                  </Field>
                </div>

                <Field label="Select Role in Organization">
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewMemberRole('editor')}
                      className={`apple-press flex flex-col items-center justify-center rounded-xl border p-2 text-center transition-all ${
                        newMemberRole === 'editor'
                          ? 'border-[#007AFF] bg-[#007AFF]/10 shadow-sm ring-1 ring-[#007AFF]'
                          : 'border-black/[0.06] bg-white dark:border-white/[0.08] dark:bg-[#2C2C2E]'
                      }`}
                    >
                      <Edit3 className="h-4 w-4 text-[#007AFF] mb-0.5" />
                      <span className="text-xs font-bold text-neutral-900 dark:text-white">Editor</span>
                      <span className="text-[10px] text-neutral-500">Data Entry Person</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNewMemberRole('viewer')}
                      className={`apple-press flex flex-col items-center justify-center rounded-xl border p-2 text-center transition-all ${
                        newMemberRole === 'viewer'
                          ? 'border-[#007AFF] bg-[#007AFF]/10 shadow-sm ring-1 ring-[#007AFF]'
                          : 'border-black/[0.06] bg-white dark:border-white/[0.08] dark:bg-[#2C2C2E]'
                      }`}
                    >
                      <Eye className="h-4 w-4 text-neutral-600 dark:text-neutral-300 mb-0.5" />
                      <span className="text-xs font-bold text-neutral-900 dark:text-white">Viewer</span>
                      <span className="text-[10px] text-neutral-500">View Reports Only</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNewMemberRole('admin')}
                      className={`apple-press flex flex-col items-center justify-center rounded-xl border p-2 text-center transition-all ${
                        newMemberRole === 'admin'
                          ? 'border-[#007AFF] bg-[#007AFF]/10 shadow-sm ring-1 ring-[#007AFF]'
                          : 'border-black/[0.06] bg-white dark:border-white/[0.08] dark:bg-[#2C2C2E]'
                      }`}
                    >
                      <Shield className="h-4 w-4 text-purple-600 dark:text-purple-400 mb-0.5" />
                      <span className="text-xs font-bold text-neutral-900 dark:text-white">Admin</span>
                      <span className="text-[10px] text-neutral-500">Co-Manager</span>
                    </button>
                  </div>
                </Field>

                <div className="flex justify-end pt-1">
                  <Btn tone="blue" onClick={handleAddMember}>
                    <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                    <span>Confirm & Add Member</span>
                  </Btn>
                </div>
              </div>
            )}

            {/* Member List */}
            <div className="divide-y divide-black/[0.04] overflow-hidden rounded-2xl border border-black/[0.06] bg-white dark:divide-white/[0.06] dark:border-white/[0.08] dark:bg-[#1C1C1E]">
              {members.map((m) => {
                const isCurrent = m.isCurrentUser || m.name === userName
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-3 p-3.5 transition-colors hover:bg-neutral-50/70 dark:hover:bg-[#2C2C2E]/60"
                  >
                    {/* Left: Avatar & Member Info */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-neutral-200 to-neutral-300 text-sm font-bold text-neutral-700 dark:from-neutral-700 dark:to-neutral-600 dark:text-neutral-100 shadow-sm">
                        {m.name.trim() ? m.name.trim().charAt(0).toUpperCase() : 'U'}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-nowrap">
                          <span className="truncate text-sm font-bold text-neutral-900 dark:text-white">
                            {m.name}
                          </span>
                          {isCurrent && (
                            <span className="shrink-0 rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-extrabold text-[#1C7430] dark:text-[#30D158]">
                              YOU
                            </span>
                          )}
                        </div>

                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-neutral-500 whitespace-nowrap overflow-hidden">
                          {m.phone && (
                            <span className="flex items-center gap-1 shrink-0">
                              <Smartphone className="h-3 w-3 text-neutral-400" />
                              <span>{m.phone}</span>
                            </span>
                          )}
                          {!isAdmin && (
                            <>
                              <span>·</span>
                              <span className="shrink-0">{getRoleBadge(m.role)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Switch Active User button */}
                      {!isCurrent && (
                        <button
                          type="button"
                          onClick={() => handleSwitchToMember(m)}
                          className="apple-press inline-flex h-8 items-center gap-1 rounded-lg border border-black/[0.08] bg-white px-2.5 text-xs font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50 dark:border-white/[0.1] dark:bg-[#2C2C2E] dark:text-neutral-200 whitespace-nowrap"
                          title="Switch active user session"
                        >
                          <ArrowRightLeft className="h-3.5 w-3.5 text-[#007AFF] shrink-0" />
                          <span>Switch</span>
                        </button>
                      )}

                      {/* Admin role change control */}
                      {isAdmin ? (
                        <select
                          value={m.role}
                          onChange={(e) => handleChangeMemberRole(m.id, e.target.value as MemberRole)}
                          className="apple-press h-8 rounded-lg border border-black/[0.08] bg-white px-2.5 text-xs font-semibold text-neutral-800 shadow-sm outline-none dark:border-white/[0.1] dark:bg-[#2C2C2E] dark:text-neutral-200 cursor-pointer"
                        >
                          <option value="admin">Admin</option>
                          <option value="editor">Editor</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      ) : null}

                      {/* Admin delete member (cannot delete if only 1 member left) */}
                      {isAdmin && members.length > 1 && !isCurrent && (
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(m)}
                          className="apple-press inline-flex h-8 w-8 items-center justify-center rounded-lg border border-black/[0.06] bg-white text-neutral-400 hover:text-[#FF3B30] hover:border-red-200 dark:border-white/[0.08] dark:bg-[#2C2C2E] dark:hover:text-[#FF453A] shrink-0"
                          title="Remove from Organization"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Confirmation to remove member */}
      <Confirm
        open={!!deleteTarget}
        icon="Trash2"
        yesTone="danger"
        text={`Remove "${deleteTarget?.name}" from your organization? They will lose access to this ledger.`}
        onNo={() => setDeleteTarget(null)}
        onYes={handleConfirmDeleteMember}
      />
    </Sheet>
  )
}
