'use client'

import { Suspense } from 'react'
import { Entries } from '../../screens/Entries'

export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-neutral-400">Loading entries...</div>}>
      <Entries />
    </Suspense>
  )
}
