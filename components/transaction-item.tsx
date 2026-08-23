'use client'

import { useState } from 'react'
import { ArrowRightLeft, ChevronRight, PiggyBank } from 'lucide-react'
import { formatIDR, formatTime } from '@/lib/parser'
import type { Transaction } from '@/lib/mock-data'
import type { TransactionUpdateInput } from '@/lib/store'
import { CategoryIcon, getCategoryConfig, getPaymentLabel } from './category-badge'
import { EditTransactionModal } from './edit-transaction-modal'
import { cn } from '@/lib/utils'

interface TransactionItemProps {
  transaction: Transaction
  onDelete?: (id: string) => void
  onUpdate?: (id: string, updates: TransactionUpdateInput) => void
  isNew?: boolean
}

export function TransactionItem({ transaction, onDelete, onUpdate, isNew }: TransactionItemProps) {
  const [modalOpen, setModalOpen] = useState(false)

  const kind = transaction.kind ?? 'transaction'
  const isMove = kind === 'transfer' || kind === 'saving'
  const isExpense = transaction.type === 'expense'
  const config = getCategoryConfig(transaction.category)
  const MoveIcon = kind === 'saving' ? PiggyBank : ArrowRightLeft
  const routeLabel = `${getPaymentLabel(transaction.fromWalletId ?? transaction.paymentMethod)} -> ${getPaymentLabel(transaction.toWalletId ?? '')}`
  const typeLabel = isMove ? (kind === 'saving' ? 'Simpan' : 'Pindah') : isExpense ? 'Pengeluaran' : 'Pemasukan'
  const categoryLabel = transaction.subcategory ? `${config.label} / ${transaction.subcategory}` : config.label
  const signedAmount = `${isMove ? '' : isExpense ? '-' : '+'}${formatIDR(transaction.amount)}`

  return (
    <>
      <div
        className={cn(
          'group relative cursor-pointer select-none rounded-[22px] border transition-all duration-200',
          'bg-[var(--sk-surface)] border-[var(--sk-border)]',
          'hover:border-[var(--sk-border-2)] hover:bg-[var(--sk-surface-2)]',
          'active:scale-[0.99]',
          isNew && 'animate-pop-in',
          transaction.isPending && 'opacity-70'
        )}
        onClick={() => setModalOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && setModalOpen(true)}
      >
        {transaction.isPending && (
          <div aria-hidden className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent animate-[shimmer_1.5s_ease-in-out_infinite] -skew-x-12" />
          </div>
        )}

        <div className="flex items-center gap-3 p-3.5">
          {isMove ? (
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--sk-cyan-dim)]">
              <MoveIcon className="h-5 w-5 text-[var(--sk-cyan)]" />
            </div>
          ) : (
            <CategoryIcon category={transaction.category} size="md" />
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold leading-tight capitalize text-[var(--sk-text)]">
                {transaction.description}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5">
              <span className="shrink-0 text-xs text-[var(--sk-text-muted)]">
                {isMove ? typeLabel : categoryLabel}
              </span>
              <span className="shrink-0 text-xs text-[var(--sk-text-dim)]">.</span>
              <span className="min-w-0 break-words text-xs text-[var(--sk-text-muted)]">
                {isMove ? routeLabel : getPaymentLabel(transaction.paymentMethod)}
              </span>
              <span className="shrink-0 text-xs text-[var(--sk-text-dim)]">.</span>
              <span className="shrink-0 text-xs text-[var(--sk-text-dim)]">
                {formatTime(transaction.date)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <div className="text-right">
              <span
                className={cn(
                  'block text-sm font-bold leading-tight tabular-nums',
                  isMove ? 'text-[var(--sk-cyan)]' : isExpense ? 'text-[var(--sk-red)]' : 'text-[var(--sk-green)]'
                )}
                data-amount
              >
                {signedAmount}
              </span>
            </div>
            <ChevronRight className="h-4 w-4 text-[var(--sk-text-dim)]" />
          </div>
        </div>
      </div>

      {/* Dedicated Bottom Sheet Edit Modal */}
      <EditTransactionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        transaction={transaction}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    </>
  )
}
