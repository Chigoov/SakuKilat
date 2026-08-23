'use client'

import { useState } from 'react'
import { ArrowRightLeft, ChevronRight, PiggyBank } from 'lucide-react'
import { formatIDR, formatTime } from '@/lib/parser'
import type { Transaction } from '@/lib/mock-data'
import type { TransactionUpdateInput } from '@/lib/store'
import { CategoryIcon, getCategoryConfig, getPaymentLabel, getWalletBadgeStyle } from './category-badge'
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
        )}
        onClick={() => setModalOpen(true)}
      >
        <div className="flex items-center gap-3 p-3.5">
          {isMove ? (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)] shadow-[0_8px_20px_rgba(56,189,248,0.14)]">
              <MoveIcon className="h-5 w-5" />
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
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <span className="shrink-0 text-xs text-[var(--sk-text-muted)]">
                {isMove ? typeLabel : config.label}
              </span>
              {transaction.subcategory && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)] border border-[var(--sk-cyan)]/20">
                  {transaction.subcategory}
                </span>
              )}
              <span className={cn(
                'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border',
                getWalletBadgeStyle(isMove ? transaction.fromWalletId : transaction.paymentMethod)
              )}>
                {isMove ? routeLabel : getPaymentLabel(transaction.paymentMethod)}
              </span>
              <span className="shrink-0 text-[11px] text-[var(--sk-text-dim)] ml-auto">
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
