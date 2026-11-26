'use client'

// Shows "Admin · Users" in More, only for the platform admin (checked on the server).
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { apiFetch, isCloudEnabled } from '../lib/supabase'
import { AppleListItem } from './apple/AppleListItem'

export function AdminLink() {
  const [isAdmin, setIsAdmin] = useState(false)
  useEffect(() => {
    if (!isCloudEnabled()) return
    apiFetch<{ isAdmin: boolean }>('/api/admin/me').then((r) => setIsAdmin(r.isAdmin)).catch(() => setIsAdmin(false))
  }, [])
  if (!isAdmin) return null
  return (
    <Link href="/admin" className="block">
      <AppleListItem icon={<ShieldCheck className="h-4 w-4" />} iconBg="bg-[#5856D6]" title="Admin · Users" subtitle="Add people, give shop access, disable logins" chevron />
    </Link>
  )
}
