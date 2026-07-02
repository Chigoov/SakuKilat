'use client'

import { useMemo } from 'react'
import { formatRelativeDate } from '@/lib/parser'
import type { Transaction } from '@/lib/mock-data'
import type { TransactionUpdateInput } from '@/lib/store'
import { TransactionItem } from './transaction-item'
import { ReceiptText } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TransactionListProps {
  transactions: Transaction[]
  onDelete?: (id: string) => void
  onUpdate?: (id: string, updates: TransactionUpdateInput) => void
  newTransactionId?: string | null
  className?: string
  compact?: boolean
}

interface GroupedTransactions {
  dateKey: string
  label: string
  transactions: Transaction[]
}

export function TransactionList({
  transactions,
  onDelete,
  onUpdate,
  newTransactionId,
  className,
  compact,
}: TransactionListProps) {
  const grouped = useMemo<GroupedTransactions[]>(() => {
    const map = new Map<string, Transaction[]>()

    // Sort transactions newest first
    const sorted = [...transactions].sort(
      (a, b) => b.date.getTime() - a.date.getTime()
    )

    for (const txn of sorted) {
      const d = txn.date
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(txn)
    }

    return Array.from(map.entries()).map(([key, txns]) => ({
      dateKey: key,
      label: formatRelativeDate(txns[0].date),
      transactions: txns,
    }))
  }, [transactions])

  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div className="w-14 h-14 rounded-2xl bg-[var(--sk-surface-2)] flex items-center justify-center mb-4">
          <ReceiptText className="w-7 h-7 text-[var(--sk-text-dim)]" />
        </div>
        <p className="text-sm font-medium text-[var(--sk-text-muted)] mb-1">
          Belum ada transaksi
        </p>
        <p className="text-xs text-[var(--sk-text-dim)] max-w-[200px] leading-relaxed">
          Ketik transaksi di bawah, misalnya{' '}
          <span className="text-[var(--sk-cyan)] font-medium">
            &quot;makan soto 25k gopay&quot;
          </span>
        </p>
      </div>
    )
  }

  return (
    <div className={cn(compact ? 'flex flex-col gap-3 px-4 md:px-8 pb-2' : 'flex flex-col gap-5 px-4 md:px-8 pb-2', className)}>
      {grouped.map(group => (
        <section key={group.dateKey} aria-label={`Transaksi ${group.label}`}>
          {/* Date heading */}
          <div className={cn('flex items-center gap-3', compact ? 'mb-1.5' : 'mb-2.5')}>
            <span className={cn(
              'font-semibold text-[var(--sk-text-muted)] uppercase tracking-wider whitespace-nowrap',
              compact ? 'text-[10px]' : 'text-xs'
            )}>
              {group.label}
            </span>
            <div className="flex-1 h-px bg-[var(--sk-border)]" />
            <span className={cn(
              'text-[var(--sk-text-dim)] tabular-nums whitespace-nowrap',
              compact ? 'text-[10px]' : 'text-xs'
            )}>
              {group.transactions.length} transaksi
            </span>
          </div>

          {/* Transaction items */}
          <div className={cn('flex flex-col', compact ? 'gap-1.5' : 'gap-2')}>
            {group.transactions.map(txn => (
              <TransactionItem
                key={txn.id}
                transaction={txn}
                onDelete={onDelete}
                onUpdate={onUpdate}
                isNew={txn.id === newTransactionId}
                compact={compact}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
