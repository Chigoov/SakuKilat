'use client'

import { useEffect, useMemo, useState } from 'react'
import { formatIDR, formatRelativeDate } from '@/lib/parser'
import type { Transaction } from '@/lib/mock-data'
import type { TransactionUpdateInput } from '@/lib/store'
import { isMoneyMove } from '@/lib/stats'
import { TransactionItem } from './transaction-item'
import { ReceiptText } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TransactionListProps {
  transactions: Transaction[]
  onDelete?: (id: string) => void
  onUpdate?: (id: string, updates: TransactionUpdateInput) => void
  newTransactionId?: string | null
  className?: string
  initialVisibleCount?: number
  loadMoreCount?: number
  /** Tampilan ringkas (dipakai di rekap tahunan). Opsional; default false. */
  compact?: boolean
  /** Tampilkan jumlah pengeluaran/pemasukan per hari di header tanggal. Opsional; default false. */
  showDailyTotal?: boolean
}

interface GroupedTransactions {
  dateKey: string
  label: string
  transactions: Transaction[]
  expenseTotal: number
  incomeTotal: number
}

export function TransactionList({
  transactions,
  onDelete,
  onUpdate,
  newTransactionId,
  className,
  initialVisibleCount = Number.POSITIVE_INFINITY,
  loadMoreCount = 40,
  showDailyTotal = false,
}: TransactionListProps) {
  const [visibleCount, setVisibleCount] = useState(initialVisibleCount)

  useEffect(() => {
    setVisibleCount(initialVisibleCount)
  }, [initialVisibleCount, transactions])

  const visibleTransactions = useMemo(() => (
    Number.isFinite(visibleCount) ? transactions.slice(0, visibleCount) : transactions
  ), [transactions, visibleCount])

  const grouped = useMemo<GroupedTransactions[]>(() => {
    const map = new Map<string, Transaction[]>()

    // Sort transactions newest first
    const sorted = [...visibleTransactions].sort(
      (a, b) => b.date.getTime() - a.date.getTime()
    )

    for (const txn of sorted) {
      const d = txn.date
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(txn)
    }

    return Array.from(map.entries()).map(([key, txns]) => {
      let expenseTotal = 0
      let incomeTotal = 0
      for (const txn of txns) {
        if (isMoneyMove(txn)) continue
        if (txn.type === 'expense') expenseTotal += txn.amount
        else incomeTotal += txn.amount
      }
      return {
        dateKey: key,
        label: formatRelativeDate(txns[0].date),
        transactions: txns,
        expenseTotal,
        incomeTotal,
      }
    })
  }, [visibleTransactions])

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
    <div className={cn('flex flex-col gap-5 px-4 md:px-8 pb-2', className)}>
      {grouped.map(group => (
        <section key={group.dateKey} aria-label={`Transaksi ${group.label}`}>
          {/* Date heading */}
          <div className="flex items-center gap-3 mb-2.5">
            <span className="text-xs font-semibold text-[var(--sk-text-muted)] uppercase tracking-wider whitespace-nowrap">
              {group.label}
            </span>
            <div className="flex-1 h-px bg-[var(--sk-border)]" />
            {showDailyTotal && (group.expenseTotal > 0 || group.incomeTotal > 0) && (
              <span className="flex items-center gap-2 tabular-nums whitespace-nowrap">
                {group.expenseTotal > 0 && (
                  <span className="text-xs font-semibold text-[var(--sk-red)]">
                    -{formatIDR(group.expenseTotal)}
                  </span>
                )}
                {group.incomeTotal > 0 && (
                  <span className="text-xs font-semibold text-[var(--sk-green)]">
                    +{formatIDR(group.incomeTotal)}
                  </span>
                )}
              </span>
            )}
            <span className="text-xs text-[var(--sk-text-dim)] tabular-nums whitespace-nowrap">
              {group.transactions.length} transaksi
            </span>
          </div>

          {/* Transaction items */}
          <div className="flex flex-col gap-2">
            {group.transactions.map(txn => (
              <TransactionItem
                key={txn.id}
                transaction={txn}
                onDelete={onDelete}
                onUpdate={onUpdate}
                isNew={txn.id === newTransactionId}
              />
            ))}
          </div>
        </section>
      ))}

      {visibleTransactions.length < transactions.length && (
        <button
          type="button"
          onClick={() => setVisibleCount((count) => count + loadMoreCount)}
          className="rounded-2xl border border-[var(--sk-border)] bg-[var(--sk-surface)] px-4 py-3 text-sm font-semibold text-[var(--sk-text-muted)]"
        >
          Muat lebih banyak
        </button>
      )}
    </div>
  )
}
