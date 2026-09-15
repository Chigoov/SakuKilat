'use client'

import { useState } from 'react'
import { ArrowRightLeft, ChevronRight, PiggyBank } from 'lucide-react'
import { formatIDR, formatTransactionDateTime } from '@/lib/parser'
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
            {/* Baris 1: Deskripsi Transaksi */}
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold leading-tight capitalize text-[var(--sk-text)]">
                {transaction.description}
              </span>
            </div>

            {/* Baris 2: Tanggal dan Waktu Pencatatan (Tepat di Bawah Deskripsi / Kategori) */}
            <div className="mt-0.5 flex items-center gap-1.5" data-testid="tx-date-row">
              <span className="text-[11px] font-medium text-[var(--sk-text-dim)]" data-testid="tx-datetime">
                {formatTransactionDateTime(transaction.date)}
              </span>
            </div>

            {/* Baris 3: Kategori, Subkategori, Badge Split, dan Dompet */}
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <span className="shrink-0 text-xs font-medium text-[var(--sk-text-muted)]">
                {isMove ? typeLabel : config.label}
              </span>
              {transaction.subcategory && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)] border border-[var(--sk-cyan)]/20">
                  {transaction.subcategory}
                </span>
              )}
              {transaction.splitItems && transaction.splitItems.length > 0 && (
                <span
                  data-testid="tx-split-badge"
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--sk-surface-2)] text-[var(--sk-cyan)] border border-[var(--sk-cyan)]/30"
                >
                  Split ({transaction.splitItems.length})
                </span>
              )}
              <span className={cn(
                'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border',
                getWalletBadgeStyle(isMove ? transaction.fromWalletId : transaction.paymentMethod)
              )}>
                {isMove ? routeLabel : getPaymentLabel(transaction.paymentMethod)}
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
