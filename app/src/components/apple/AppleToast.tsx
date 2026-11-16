'use client'

import React from 'react'
import { CheckCircle2, RotateCcw, X } from 'lucide-react'
import { useToast } from '../../store'

export function AppleToast() {
  const { toast, dismissToast } = useToast() as any

  if (!toast) return null

  return (
    <div className="pointer-events-none fixed top-4 inset-x-0 z-50 flex justify-center px-4 transition-all duration-300">
      <div
        role="alert"
        aria-live="assertive"
        className="pointer-events-auto apple-glass flex max-w-md items-center gap-3 rounded-full px-4 py-2.5 shadow-2xl transition-all duration-200"
      >
        {/* Status icon */}
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#34C759]/20 text-[#34C759]">
          <CheckCircle2 className="h-4 w-4" />
        </div>

        {/* Message */}
        <div className="min-w-0 text-sm font-semibold text-neutral-900 dark:text-white">
          {toast.text}
        </div>

        {/* Undo button if available */}
        {toast.undo && (
          <button
            onClick={async () => {
              if (toast.undo) await toast.undo()
              if (dismissToast) dismissToast()
            }}
            type="button"
            className="apple-press ml-1 flex items-center gap-1 rounded-full bg-[#007AFF] px-3 py-1 text-xs font-bold text-white shadow-sm hover:bg-[#0071E3]"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Undo</span>
          </button>
        )}

        {/* Dismiss button */}
        {dismissToast && (
          <button
            onClick={dismissToast}
            type="button"
            aria-label="Dismiss notification"
            className="apple-press ml-1 rounded-full p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
