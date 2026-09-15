'use client'

import { memo, useEffect, useId, useMemo, useState } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { formatIDR, formatIDRCompact } from '@/lib/parser'
import { getCompactPaymentMethods, type PaymentMethodItem } from '@/lib/payment-ranking'
import { cn } from '@/lib/utils'
import { pushBackLayer, removeBackLayer } from '@/lib/back-stack'

export interface CompactPaymentSelectorProps {
  activeId: string
  onPick: (id: string) => void
  wallets?: Array<{ id: string; label: string; balance: number; [key: string]: any }>
  transactions?: Array<{ paymentMethod: string; date: Date | string | number }>
  hiddenPaymentIds?: string[]
  blockedId?: string
  isTransferMode?: boolean
  balanceFormat?: 'compact' | 'full'
  className?: string
  gridClassName?: string
  closeOnPick?: boolean
  drawerTitle?: string
}

export const CompactPaymentSelector = memo(function CompactPaymentSelector({
  activeId,
  onPick,
  wallets = [],
  transactions = [],
  hiddenPaymentIds = [],
  blockedId,
  isTransferMode = false,
  balanceFormat = 'compact',
  className,
  gridClassName,
  closeOnPick = false,
  drawerTitle,
}: CompactPaymentSelectorProps) {
  const uniqueId = useId()
  const [isExpanded, setIsExpanded] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Compute compact methods and remaining methods using the heuristic ranking engine
  const rankingResult = useMemo(() => {
    return getCompactPaymentMethods({
      wallets: wallets ?? [],
      transactions: transactions ?? [],
      activeMethodId: activeId,
      isTransferMode: !!isTransferMode,
      hiddenPaymentIds: hiddenPaymentIds ?? [],
    })
  }, [wallets, transactions, activeId, isTransferMode, hiddenPaymentIds])

  const { compactMethods, remainingMethods, totalCount } = rankingResult

  // All active non-hidden wallets for the expanded drawer view
  const allActiveMethods = useMemo(() => {
    const seen = new Set<string>()
    const list: PaymentMethodItem[] = []
    for (const m of compactMethods) {
      if (!seen.has(m.id)) {
        seen.add(m.id)
        list.push(m)
      }
    }
    for (const m of remainingMethods) {
      if (!seen.has(m.id)) {
        seen.add(m.id)
        list.push(m)
      }
    }
    return list
  }, [compactMethods, remainingMethods])

  // Filtered list when searching within the expanded drawer
  const filteredDrawerMethods = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return allActiveMethods
    return allActiveMethods.filter(
      m => m.label.toLowerCase().includes(query) || m.id.toLowerCase().includes(query)
    )
  }, [allActiveMethods, searchQuery])

  // Back-stack integration: pressing back while drawer is open closes drawer first
  useEffect(() => {
    if (isExpanded) {
      pushBackLayer({
        id: `payment-selector-drawer-${uniqueId}`,
        type: 'sheet',
        onClose: () => setIsExpanded(false),
      })
    } else {
      removeBackLayer(`payment-selector-drawer-${uniqueId}`)
    }
    return () => removeBackLayer(`payment-selector-drawer-${uniqueId}`)
  }, [isExpanded, uniqueId])

  // If transfer mode is toggled on, collapse drawer
  useEffect(() => {
    if (isTransferMode && isExpanded) {
      setIsExpanded(false)
    }
  }, [isTransferMode, isExpanded])

  const showLihatSemua = !isTransferMode && remainingMethods.length > 0

  return (
    <div data-testid="compact-payment-selector" className={cn('w-full flex flex-col', className)}>
      {/* Compact Grid View */}
      <div className={cn('grid grid-cols-2 sm:grid-cols-3 gap-1.5 mt-1', gridClassName)}>
        {compactMethods.map(wallet => {
          const active = activeId === wallet.id
          const blocked = blockedId === wallet.id
          return (
            <button
              key={wallet.id}
              type="button"
              onClick={() => !blocked && onPick(wallet.id)}
              disabled={blocked}
              data-testid="compact-method-chip"
              data-method-id={wallet.id}
              aria-pressed={active}
              className={cn(
                'px-2 py-2 rounded-lg text-[11px] font-medium transition-colors text-left border flex flex-col gap-0.5 min-h-[44px] justify-center',
                active
                  ? 'bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)] border-[var(--sk-cyan)]'
                  : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] border-transparent hover:text-[var(--sk-text)]',
                blocked && 'opacity-40 cursor-not-allowed'
              )}
            >
              <span className="font-semibold truncate w-full">{wallet.label}</span>
              <span className="text-[9px] text-[var(--sk-text-dim)] tabular-nums">
                {balanceFormat === 'full' ? formatIDR(wallet.balance) : formatIDRCompact(wallet.balance)}
              </span>
            </button>
          )
        })}

        {/* Toggle "Lihat semua (N)" Button */}
        {showLihatSemua && (
          <button
            type="button"
            onClick={() => {
              setIsExpanded(prev => {
                const next = !prev
                if (next) setSearchQuery('')
                return next
              })
            }}
            data-testid="toggle-all-payment-methods"
            aria-expanded={isExpanded}
            className={cn(
              'px-2 py-2 rounded-lg text-[11px] font-medium transition-colors text-center border flex flex-col items-center justify-center min-h-[44px] gap-0.5',
              isExpanded
                ? 'bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)] border-[var(--sk-cyan)]'
                : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] border-dashed border-[var(--sk-border-2)] hover:text-[var(--sk-text)] hover:border-[var(--sk-cyan)]'
            )}
          >
            <div className="flex items-center gap-1">
              <span className="font-semibold truncate">
                {isExpanded ? 'Tutup' : `Lihat semua (${remainingMethods.length})`}
              </span>
              <ChevronDown
                className={cn(
                  'w-3.5 h-3.5 transition-transform duration-200 shrink-0',
                  isExpanded && 'rotate-180'
                )}
              />
            </div>
            <span className="text-[9px] text-[var(--sk-text-dim)]">
              {isExpanded ? 'Pilihan saku' : `+${remainingMethods.length} lainnya`}
            </span>
          </button>
        )}
      </div>

      {/* Expandable Drawer for All Payment Methods */}
      {isExpanded && !isTransferMode && (
        <div
          data-testid="payment-drawer"
          role="region"
          aria-label="Daftar semua metode pembayaran"
          className="mt-2 p-3 rounded-xl bg-[var(--sk-surface-2)]/90 border border-[var(--sk-border-2)] flex flex-col gap-2.5 animate-fade-in shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-[var(--sk-border)] pb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-[var(--sk-text)]">
                {drawerTitle || 'Semua Saku & Metode Bayar'}
              </span>
              <span className="text-[10px] text-[var(--sk-text-dim)]">
                ({allActiveMethods.length} saku)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              data-testid="close-drawer-btn"
              className="px-2 py-0.5 rounded-md text-[10px] font-semibold text-[var(--sk-text-dim)] hover:text-[var(--sk-text)] hover:bg-[var(--sk-surface-3)] transition-colors flex items-center gap-1"
            >
              <span>Tutup</span>
              <X className="w-3 h-3" />
            </button>
          </div>

          {allActiveMethods.length > 6 && (
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Cari saku / metode..."
              className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--sk-surface)] border border-[var(--sk-border)] text-xs text-[var(--sk-text)] placeholder:text-[var(--sk-text-dim)] focus:outline-none focus:border-[var(--sk-cyan)]"
            />
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto pr-0.5">
            {filteredDrawerMethods.map(wallet => {
              const active = activeId === wallet.id
              const blocked = blockedId === wallet.id
              return (
                <button
                  key={wallet.id}
                  type="button"
                  data-testid="expanded-method-chip"
                  data-method-id={wallet.id}
                  aria-pressed={active}
                  disabled={blocked}
                  onClick={() => {
                    if (!blocked) {
                      onPick(wallet.id)
                      if (closeOnPick) {
                        setIsExpanded(false)
                      }
                    }
                  }}
                  className={cn(
                    'px-2.5 py-2 rounded-lg text-[11px] font-medium transition-colors text-left border flex flex-col gap-0.5 min-h-[44px] justify-center relative',
                    active
                      ? 'bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)] border-[var(--sk-cyan)]'
                      : 'bg-[var(--sk-surface)] text-[var(--sk-text-muted)] border-[var(--sk-border)] hover:text-[var(--sk-text)] hover:bg-[var(--sk-surface-3)]',
                    blocked && 'opacity-40 cursor-not-allowed'
                  )}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-semibold truncate">{wallet.label}</span>
                    {active && <Check className="w-3.5 h-3.5 text-[var(--sk-cyan)] shrink-0 ml-1" />}
                  </div>
                  <span className="text-[9px] text-[var(--sk-text-dim)] tabular-nums">
                    {balanceFormat === 'full' ? formatIDR(wallet.balance) : formatIDRCompact(wallet.balance)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
})
