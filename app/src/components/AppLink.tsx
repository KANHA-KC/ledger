'use client'

import React from 'react'
import Link from 'next/link'

export function AppLink({
  to,
  href,
  children,
  className,
  ...props
}: {
  to?: string
  href?: string
  children: React.ReactNode
  className?: string
  [key: string]: any
}) {
  const target = href || to || '/'
  return (
    <Link href={target} className={className} {...props}>
      {children}
    </Link>
  )
}

export default AppLink
