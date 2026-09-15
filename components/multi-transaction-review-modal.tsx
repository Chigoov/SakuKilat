'use client'

import { useState, useMemo } from 'react'
import { Check, CheckSquare, Square, Sparkles, AlertCircle } from 'lucide-react'
import { BottomSheet } from '@/components/bottom-sheet'
import { parseEntry, formatIDR, type ParserExtras } from '@/lib/parser'
import { cn } from '@/lib/utils'

interface MultiTransactionReviewModalProps {
  open: boolean
  onClose: () => void
  segments: string[]
  onConfirm: (confirmedSegments: string[]) => Promise<void> | void
  parserExtras?: ParserExtras
}

export function MultiTransactionReviewModal({
  open,
  onClose,
  segments,
  onConfirm,
  parserExtras,
}: MultiTransactionReviewModalProps) {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
    () => new Set(segments.map((_, i) => i))
  )
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Re-sync selected items when segments change
  useMemo(() => {
    setSelectedIndices(new Set(segments.map((_, i) => i)))
  }, [segments])

  const parsedItems = useMemo(() => {
    return segments.map((seg, idx) => {
      const parsed = parseEntry(seg, parserExtras)
      return {
        index: idx,
        raw: seg,
        parsed,
        valid: Boolean(parsed && parsed.amount > 0),
      }
    })
  }, [segments, parserExtras])

  const toggleSelect = (idx: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) {
        next.delete(idx)
      } else {
        next.add(idx)
      }
      return next
    })
  }

  const handleSaveBatch = async () => {
    const toSave = parsedItems
      .filter((item) => selectedIndices.has(item.index) && item.valid)
      .map((item) => item.raw)

    if (toSave.length === 0) return

    setIsSubmitting(true)
    try {
      await onConfirm(toSave)
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  const selectedCount = Array.from(selectedIndices).filter(
    (idx) => parsedItems[idx]?.valid
  ).length

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Tinjau Multi-Transaksi"
      subtitle={`Terdeteksi ${segments.length} transaksi terpisah dalam satu input.`}
    >
      <div className="space-y-4 px-4 py-3" data-testid="multi-tx-review-sheet">
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>
            SakuKilat mendeteksi beberapa transaksi sekaligus. Periksa setiap butir sebelum menyimpan ke buku kas.
          </p>
        </div>

        <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
          {parsedItems.map((item) => {
            const isSelected = selectedIndices.has(item.index)
            return (
              <div
                key={item.index}
                onClick={() => toggleSelect(item.index)}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer select-none',
                  isSelected
                    ? 'border-emerald-500/40 bg-emerald-500/5'
                    : 'border-[var(--sk-border)] bg-[var(--sk-surface-2)] opacity-60'
                )}
              >
                <button
                  type="button"
                  aria-label={isSelected ? 'Batalkan pilihan' : 'Pilih transaksi'}
                  className="text-emerald-400 shrink-0"
                >
                  {isSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5 text-gray-400" />}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-[var(--sk-text)] truncate">
                      {item.parsed?.description || item.raw}
                    </p>
                    <span className="text-xs font-bold text-emerald-400 tabular-nums shrink-0">
                      {item.parsed ? formatIDR(item.parsed.amount) : 'Rp0'}
                    </span>
                  </div>

                  <div className="mt-1 flex items-center gap-2 text-[10px] text-[var(--sk-text-dim)]">
                    <span className="capitalize">
                      {item.parsed && 'category' in item.parsed ? item.parsed.category : item.parsed?.kind || 'Umum'}
                    </span>
                    <span>•</span>
                    <span className="uppercase">
                      {item.parsed && 'paymentMethod' in item.parsed
                        ? item.parsed.paymentMethod
                        : item.parsed && 'fromWalletId' in item.parsed
                          ? item.parsed.fromWalletId
                          : 'Tunai'}
                    </span>
                    <span>•</span>
                    <span className="italic truncate">&quot;{item.raw}&quot;</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex items-center gap-2 pt-2 border-t border-[var(--sk-border)]">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-[var(--sk-border)] text-xs font-semibold text-[var(--sk-text)] hover:bg-[var(--sk-surface-2)]"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSaveBatch}
            disabled={selectedCount === 0 || isSubmitting}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-500 text-black text-xs font-semibold shadow hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check className="w-4 h-4" />
            Simpan ({selectedCount})
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
