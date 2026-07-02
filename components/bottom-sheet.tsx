'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: React.ReactNode
  bodyClassName?: string
}

export function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  bodyClassName,
}: BottomSheetProps) {
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[90] flex items-end justify-center bg-[rgba(9,13,22,0.7)] backdrop-blur-sm animate-fade-in"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-2xl rounded-t-[28px] border border-[var(--sk-border)] bg-[var(--sk-surface)] shadow-2xl animate-sheet-up">
        <div className="mx-auto mt-2.5 h-1.5 w-14 rounded-full bg-[var(--sk-surface-3)]" />
        <div className="flex items-start gap-3 border-b border-[var(--sk-border)] px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--sk-text)]">{title}</p>
            {subtitle ? <p className="mt-0.5 text-[11px] text-[var(--sk-text-dim)]">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--sk-surface-2)] text-[var(--sk-text-dim)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className={cn('max-h-[78dvh] overflow-y-auto px-4 py-4', bodyClassName)}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}
