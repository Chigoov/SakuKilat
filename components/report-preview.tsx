'use client'

import { useMemo, useRef } from 'react'
import { ArrowLeft, Printer } from 'lucide-react'
import type { Transaction } from '@/lib/mock-data'
import { buildMonthlyReportHtml } from '@/lib/report'
import { cn } from '@/lib/utils'

export function ReportPreview({
  open,
  onClose,
  profileName,
  transactions,
}: {
  open: boolean
  onClose: () => void
  profileName?: string | null
  transactions: Transaction[]
}) {
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const html = useMemo(
    () => buildMonthlyReportHtml(transactions, { profileName }),
    [profileName, transactions]
  )

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sk-report-title"
      className="fixed inset-0 z-[75] bg-[rgba(9,13,22,0.86)] backdrop-blur-md animate-fade-in"
    >
      <div className="flex h-full flex-col bg-[var(--sk-bg)]">
        <div className="flex items-center gap-2 border-b border-[var(--sk-border)] px-3 py-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center gap-1 rounded-xl bg-[var(--sk-surface-2)] px-3 text-sm font-semibold text-[var(--sk-text)]"
          >
            <ArrowLeft className="h-4 w-4" />
            Kembali
          </button>
          <div className="min-w-0 flex-1">
            <h2 id="sk-report-title" className="truncate text-sm font-bold text-[var(--sk-text)]">
              Laporan PDF bulan ini
            </h2>
            <p className="text-[11px] text-[var(--sk-text-dim)]">Preview dulu, lalu cetak atau simpan ke PDF.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              const frameWindow = frameRef.current?.contentWindow
              if (!frameWindow) return
              frameWindow.focus()
              frameWindow.print()
            }}
            className={cn(
              'inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--sk-cyan)] px-3 text-sm font-semibold text-[#090D16]'
            )}
          >
            <Printer className="h-4 w-4" />
            Cetak
          </button>
        </div>

        <div className="flex-1 overflow-hidden p-2 sm:p-4">
          <div className="h-full overflow-hidden rounded-2xl border border-[var(--sk-border)] bg-white shadow-2xl">
            <iframe
              ref={frameRef}
              title="Preview laporan SakuKilat"
              srcDoc={html}
              className="h-full w-full"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
