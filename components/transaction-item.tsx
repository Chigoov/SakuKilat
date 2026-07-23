'use client'

import { useState } from 'react'
import { ArrowRightLeft, Check, ChevronRight, Pencil, PiggyBank, Trash2, X } from 'lucide-react'
import { formatNaturalAmountInput, parseAmountInput } from '@/lib/amount'
import { formatIDR, formatTime } from '@/lib/parser'
import type { Transaction } from '@/lib/mock-data'
import type { TransactionUpdateInput } from '@/lib/store'
import { useWalletStore } from '@/lib/store'
import { CategoryIcon, getCategoryConfig, getPaymentLabel } from './category-badge'
import { cn } from '@/lib/utils'

interface TransactionItemProps {
  transaction: Transaction
  onDelete?: (id: string) => void
  onUpdate?: (id: string, updates: TransactionUpdateInput) => void
  isNew?: boolean
}

export function TransactionItem({ transaction, onDelete, onUpdate, isNew }: TransactionItemProps) {
  const [expanded, setExpanded] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editDescription, setEditDescription] = useState(transaction.description)
  const [editAmount, setEditAmount] = useState(String(transaction.amount))
  const [editPaymentMethod, setEditPaymentMethod] = useState(transaction.paymentMethod)
  const { wallets } = useWalletStore()

  const kind = transaction.kind ?? 'transaction'
  const isMove = kind === 'transfer' || kind === 'saving'
  const isExpense = transaction.type === 'expense'
  const config = getCategoryConfig(transaction.category)
  const MoveIcon = kind === 'saving' ? PiggyBank : ArrowRightLeft
  const routeLabel = `${getPaymentLabel(transaction.fromWalletId ?? transaction.paymentMethod)} -> ${getPaymentLabel(transaction.toWalletId ?? '')}`
  const typeLabel = isMove ? (kind === 'saving' ? 'Simpan' : 'Pindah') : isExpense ? 'Pengeluaran' : 'Pemasukan'
  const categoryLabel = transaction.subcategory ? `${config.label} / ${transaction.subcategory}` : config.label
  const signedAmount = `${isMove ? '' : isExpense ? '-' : '+'}${formatIDR(transaction.amount)}`

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    setDeleting(true)
    setTimeout(() => {
      onDelete?.(transaction.id)
    }, 300)
  }

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    setExpanded(true)
    setEditing(true)
    setEditDescription(transaction.description)
    setEditAmount(String(transaction.amount))
    setEditPaymentMethod(transaction.paymentMethod)
  }

  const cancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditing(false)
    setEditDescription(transaction.description)
    setEditAmount(String(transaction.amount))
    setEditPaymentMethod(transaction.paymentMethod)
  }

  const saveEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    onUpdate?.(transaction.id, {
      description: editDescription,
      amount: parseAmountInput(editAmount),
      paymentMethod: isMove ? undefined : editPaymentMethod,
    })
    setEditing(false)
  }

  return (
    <div
      className={cn(
        'group relative cursor-pointer select-none rounded-[26px] border transition-all duration-300',
        'bg-[var(--sk-surface)] border-[var(--sk-border)]',
        'hover:border-[var(--sk-border-2)] hover:bg-[var(--sk-surface-2)] hover:shadow-[0_16px_36px_rgba(2,6,23,0.16)]',
        'active:scale-[0.99]',
        isNew && 'animate-pop-in',
        deleting && 'opacity-0 scale-95 pointer-events-none',
        transaction.isPending && 'opacity-70',
        expanded && 'border-[var(--sk-border-2)]'
      )}
      onClick={() => setExpanded(e => !e)}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onKeyDown={e => e.key === 'Enter' && setExpanded(x => !x)}
    >
      {transaction.isPending && (
        <div aria-hidden className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent animate-[shimmer_1.5s_ease-in-out_infinite] -skew-x-12" />
        </div>
      )}

      <div className="flex items-center gap-3.5 p-4">
        {isMove ? (
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-[var(--sk-cyan-dim)]">
            <MoveIcon className="h-5 w-5 text-[var(--sk-cyan)]" />
          </div>
        ) : (
          <CategoryIcon category={transaction.category} size="md" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-base font-semibold leading-tight capitalize text-[var(--sk-text)]">
              {transaction.description}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5">
            <span className="shrink-0 text-[13px] text-[var(--sk-text-muted)]">
              {isMove ? typeLabel : categoryLabel}
            </span>
            <span className="shrink-0 text-xs text-[var(--sk-text-dim)]">.</span>
            <span className="min-w-0 break-words text-[13px] text-[var(--sk-text-muted)]">
              {isMove ? routeLabel : getPaymentLabel(transaction.paymentMethod)}
            </span>
            <span className="shrink-0 text-xs text-[var(--sk-text-dim)]">.</span>
            <span className="shrink-0 text-[13px] text-[var(--sk-text-dim)]">
              {formatTime(transaction.date)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-right">
            <span
              className={cn(
                'block text-[17px] font-bold leading-tight tabular-nums',
                isMove ? 'text-[var(--sk-cyan)]' : isExpense ? 'text-[var(--sk-red)]' : 'text-[var(--sk-green)]'
              )}
              data-amount
            >
              {signedAmount}
            </span>
          </div>
          <ChevronRight
            className={cn(
              'h-4 w-4 flex-shrink-0 text-[var(--sk-text-dim)] transition-transform duration-200',
              expanded && 'rotate-90'
            )}
          />
        </div>
      </div>

      {expanded && (
        <div className="animate-slide-up px-4 pb-4">
          <div className="pt-2.5 border-t border-[var(--sk-border)]">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div>
                <span className="text-[var(--sk-text-dim)] block mb-0.5">Tipe</span>
                <span className={cn(
                  'font-medium',
                  isMove ? 'text-[var(--sk-cyan)]' : isExpense ? 'text-[var(--sk-red)]' : 'text-[var(--sk-green)]'
                )}>
                  {typeLabel}
                </span>
              </div>
              <div>
                <span className="text-[var(--sk-text-dim)] block mb-0.5">Jumlah</span>
                <span className="font-semibold tabular-nums text-[var(--sk-text)]" data-amount>
                  {formatIDR(transaction.amount)}
                </span>
              </div>
              <div>
                <span className="text-[var(--sk-text-dim)] block mb-0.5">{isMove ? 'Rute' : 'Metode'}</span>
                <span className="font-medium text-[var(--sk-text)]">
                  {isMove ? routeLabel : getPaymentLabel(transaction.paymentMethod)}
                </span>
              </div>
              {!isMove && transaction.subcategory && (
                <div>
                  <span className="text-[var(--sk-text-dim)] block mb-0.5">Sub kategori</span>
                  <span className="font-medium text-[var(--sk-text)]">
                    {transaction.subcategory}
                  </span>
                </div>
              )}
              {!isMove && transaction.note && (
                <div className="col-span-2">
                  <span className="text-[var(--sk-text-dim)] block mb-0.5">Catatan</span>
                  <span className="font-medium text-[var(--sk-text)] break-words">
                    {transaction.note}
                  </span>
                </div>
              )}
              <div>
                <span className="text-[var(--sk-text-dim)] block mb-0.5">Status</span>
                <span className="font-medium text-[var(--sk-text-muted)]">
                  {transaction.isPending ? 'Menyimpan...' : 'Lokal di perangkat ini'}
                </span>
              </div>
            </div>

            {editing && (
              <div className="mt-3 grid gap-2.5" onClick={e => e.stopPropagation()}>
                <div>
                  <label className="text-[10px] uppercase tracking-widest font-medium text-[var(--sk-text-dim)]">
                    Nama (untuk apa)
                  </label>
                  <input
                    value={editDescription}
                    onChange={e => setEditDescription(e.target.value)}
                    className="mt-1 w-full h-10 rounded-lg bg-[var(--sk-surface-2)] border border-[var(--sk-border)] px-3 text-sm text-[var(--sk-text)] outline-none focus:border-[var(--sk-cyan)]"
                    aria-label="Edit nama transaksi"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest font-medium text-[var(--sk-text-dim)]">
                    Nominal
                  </label>
                  <input
                    value={editAmount}
                    onChange={e => setEditAmount(formatNaturalAmountInput(e.target.value))}
                    inputMode="numeric"
                    className="mt-1 w-full h-10 rounded-lg bg-[var(--sk-surface-2)] border border-[var(--sk-border)] px-3 text-sm text-[var(--sk-text)] outline-none focus:border-[var(--sk-cyan)]"
                    aria-label="Edit nominal transaksi"
                  />
                </div>
                {!isMove && wallets.length > 0 && (
                  <div>
                    <label className="text-[10px] uppercase tracking-widest font-medium text-[var(--sk-text-dim)]">
                      Metode pembayaran
                    </label>
                    <div className="mt-1 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {wallets.map(wallet => (
                        <button
                          key={wallet.id}
                          type="button"
                          onClick={() => setEditPaymentMethod(wallet.id)}
                          className={cn(
                            'px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors truncate text-left border',
                            editPaymentMethod === wallet.id
                              ? 'bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)] border-[var(--sk-cyan)]'
                              : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] border-transparent hover:text-[var(--sk-text)]'
                          )}
                        >
                          {wallet.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {(onUpdate || onDelete) && !transaction.isPending && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {editing ? (
                  <>
                    <button
                      onClick={saveEdit}
                      className="min-h-9 px-3 rounded-lg bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)] text-xs font-semibold flex items-center gap-1.5"
                      aria-label="Simpan perubahan transaksi"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Simpan
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="min-h-9 px-3 rounded-lg bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] text-xs font-semibold flex items-center gap-1.5"
                      aria-label="Batalkan edit transaksi"
                    >
                      <X className="w-3.5 h-3.5" />
                      Batal
                    </button>
                  </>
                ) : (
                  onUpdate && (
                    <button
                      onClick={startEdit}
                      className="min-h-9 px-3 rounded-lg bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] hover:text-[var(--sk-cyan)] transition-colors text-xs font-semibold flex items-center gap-1.5"
                      aria-label="Edit transaksi"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </button>
                  )
                )}

                {onDelete && !editing && (
                  <button
                    onClick={handleDelete}
                    className="min-h-9 px-3 rounded-lg bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] hover:text-[var(--sk-red)] transition-colors text-xs font-semibold flex items-center gap-1.5"
                    aria-label="Hapus transaksi"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Hapus
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
