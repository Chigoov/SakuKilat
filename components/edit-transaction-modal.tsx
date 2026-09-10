'use client'

import { memo, useEffect, useMemo, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Check,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import {
  useCustomizationStore,
  useTransactionActions,
  useWalletStore,
  type TransactionUpdateInput,
} from '@/lib/store'
import {
  CATEGORY_CONFIG,
  CategoryIcon,
  getCategoryConfig,
  getDefaultSubcategories,
  getPaymentLabel,
} from '@/components/category-badge'
import { formatAmountFieldInput, parseAmountInput } from '@/lib/amount'
import { formatIDR } from '@/lib/parser'
import type { Transaction } from '@/lib/mock-data'
import { cn } from '@/lib/utils'
import { pushBackLayer, removeBackLayer } from '@/lib/back-stack'

interface EditTransactionModalProps {
  open: boolean
  onClose: () => void
  transaction: Transaction | null
  onUpdate?: (id: string, updates: TransactionUpdateInput) => void
  onDelete?: (id: string) => void
}

function dateInputValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function timeInputValue(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function combineDateTime(dateStr: string, timeStr: string, fallback: Date): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = timeStr.split(':').map(Number)
  if (!y || !m || !d) return fallback
  const combined = new Date(y, m - 1, d, Number.isFinite(hh) ? hh : 0, Number.isFinite(mm) ? mm : 0)
  return Number.isNaN(combined.getTime()) ? fallback : combined
}

const INCOME_CATEGORY_IDS = new Set([
  'gaji', 'investasi', 'penjualan', 'cashback', 'refund', 'hadiah', 'freelance',
])

export const EditTransactionModal = memo(function EditTransactionModal({
  open,
  onClose,
  transaction,
  onUpdate,
  onDelete,
}: EditTransactionModalProps) {
  const { wallets } = useWalletStore()
  const { customCategories, addCustomCategory, updateCustomCategory } = useCustomizationStore()
  const { updateTransaction, deleteTransaction } = useTransactionActions()

  const [description, setDescription] = useState('')
  const [amountRaw, setAmountRaw] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [toWalletId, setToWalletId] = useState('')
  const [category, setCategory] = useState('lainnya')
  const [subcategory, setSubcategory] = useState('')
  const [entryDate, setEntryDate] = useState('')
  const [entryTime, setEntryTime] = useState('')
  const [note, setNote] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // State untuk inline add subcategory
  const [isAddingSub, setIsAddingSub] = useState(false)
  const [newSubName, setNewSubName] = useState('')

  useEffect(() => {
    if (!open || !transaction) return
    setDescription(transaction.description || '')
    setAmountRaw(String(transaction.amount || ''))
    setPaymentMethod(transaction.paymentMethod || wallets[0]?.id || 'tunai')
    setToWalletId(transaction.toWalletId || '')
    setCategory(transaction.category || 'lainnya')
    setSubcategory(transaction.subcategory || '')
    setEntryDate(dateInputValue(transaction.date))
    setEntryTime(timeInputValue(transaction.date))
    setNote(transaction.note || '')
    setConfirmDelete(false)
    setSubmitting(false)
    setIsAddingSub(false)
    setNewSubName('')
  }, [open, transaction, wallets])

  // Back-stack integration: register modal, confirm delete dialog, and add sub dialog
  useEffect(() => {
    if (open) {
      pushBackLayer({ id: 'edit-transaction-modal', type: 'modal', onClose })
    } else {
      removeBackLayer('edit-transaction-modal')
    }
    return () => removeBackLayer('edit-transaction-modal')
  }, [open, onClose])

  useEffect(() => {
    if (confirmDelete) {
      pushBackLayer({ id: 'edit-transaction-confirm-delete', type: 'dialog', onClose: () => setConfirmDelete(false) })
    } else {
      removeBackLayer('edit-transaction-confirm-delete')
    }
    return () => removeBackLayer('edit-transaction-confirm-delete')
  }, [confirmDelete])

  useEffect(() => {
    if (isAddingSub) {
      pushBackLayer({ id: 'edit-transaction-add-sub', type: 'dialog', onClose: () => setIsAddingSub(false) })
    } else {
      removeBackLayer('edit-transaction-add-sub')
    }
    return () => removeBackLayer('edit-transaction-add-sub')
  }, [isAddingSub])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  const kind = transaction?.kind ?? 'transaction'
  const isMove = kind === 'transfer' || kind === 'saving'
  const isExpense = transaction ? transaction.type === 'expense' : true
  const parsedAmount = parseAmountInput(amountRaw)

  const categoryOptions = useMemo(() => {
    const builtinIds = Object.keys(CATEGORY_CONFIG) as Array<keyof typeof CATEGORY_CONFIG>
    const builtin = builtinIds
      .filter((id) => {
        if (id === 'transfer') return false
        const isIncomeCat = INCOME_CATEGORY_IDS.has(id)
        return isExpense ? !isIncomeCat : isIncomeCat || id === 'lainnya'
      })
      .map((id) => {
        const cfg = getCategoryConfig(id)
        const customMatch = customCategories.find(c => c.id === id)
        const defaultSubs = getDefaultSubcategories(id)
        const mergedSubs = customMatch?.subcategories?.length ? customMatch.subcategories : defaultSubs
        return {
          id,
          label: cfg.label,
          icon: cfg.icon,
          color: cfg.color,
          bg: cfg.bg,
          subcategories: mergedSubs,
        }
      })

    const custom = customCategories
      .filter((c) => (c.type ?? 'expense') === (isExpense ? 'expense' : 'income'))
      .map((c) => {
        const cfg = getCategoryConfig(c.id)
        return {
          id: c.id,
          label: c.label,
          icon: cfg.icon,
          color: cfg.color,
          bg: cfg.bg,
          subcategories: c.subcategories ?? [],
        }
      })

    return [...builtin, ...custom]
  }, [customCategories, isExpense])

  const selectedCategory = useMemo(
    () => categoryOptions.find(item => item.id === category),
    [category, categoryOptions]
  )

  const handleSave = () => {
    if (!transaction || !parsedAmount || parsedAmount <= 0) return
    setSubmitting(true)

    const finalDate = combineDateTime(entryDate, entryTime, transaction.date)
    const updates: TransactionUpdateInput = {
      description: description.trim() || transaction.description,
      amount: parsedAmount,
      date: finalDate,
      paymentMethod,
      category,
      subcategory: subcategory.trim() || undefined,
      note: note.trim() || undefined,
    }

    if (onUpdate) {
      onUpdate(transaction.id, updates)
    } else {
      updateTransaction(transaction.id, updates)
    }

    onClose()
  }

  const handleDelete = () => {
    if (!transaction) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    if (onDelete) {
      onDelete(transaction.id)
    } else {
      deleteTransaction(transaction.id)
    }
    onClose()
  }

  const handleCreateSubcategory = () => {
    const trimmed = newSubName.trim()
    if (!trimmed || !selectedCategory) return

    const existingSubs = selectedCategory.subcategories ?? []
    if (!existingSubs.includes(trimmed)) {
      const existingCustom = customCategories.find(c => c.id === selectedCategory.id)
      if (existingCustom) {
        updateCustomCategory(selectedCategory.id, {
          label: existingCustom.label,
          keywords: existingCustom.keywords,
          subcategories: [...existingSubs, trimmed],
        })
      } else {
        addCustomCategory(
          selectedCategory.label,
          [],
          [...existingSubs, trimmed],
          isExpense ? 'expense' : 'income'
        )
      }
    }

    setSubcategory(trimmed)
    setNewSubName('')
    setIsAddingSub(false)
  }

  if (!open || !transaction) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/80 animate-fade-in p-0 sm:p-4"
    >
      <div
        className="w-full sm:max-w-lg max-h-[92dvh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border-2)] shadow-2xl overflow-hidden animate-sheet-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-[var(--sk-border)] flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center',
              isMove ? 'bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)]' : isExpense ? 'bg-[var(--sk-red-dim)] text-[var(--sk-red)]' : 'bg-[var(--sk-green-dim)] text-[var(--sk-green)]'
            )}>
              {isMove ? <ArrowRightLeft className="w-4 h-4" /> : isExpense ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
            </div>
            <div>
              <h2 className="text-sm font-bold text-[var(--sk-text)] leading-tight">Edit Transaksi</h2>
              <p className="text-[10px] text-[var(--sk-text-dim)]">Perbarui detail atau nominal catatan</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="w-8 h-8 rounded-lg bg-[var(--sk-surface-2)] flex items-center justify-center text-[var(--sk-text-muted)] hover:text-[var(--sk-text)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
          {/* Nominal */}
          <div>
            <label className="text-[10px] uppercase tracking-widest font-medium text-[var(--sk-text-dim)] flex items-center justify-between">
              <span>Nominal</span>
              {parsedAmount > 0 && (
                <span className={cn(
                  'text-[11px] font-bold tabular-nums',
                  isMove ? 'text-[var(--sk-cyan)]' : isExpense ? 'text-[var(--sk-red)]' : 'text-[var(--sk-green)]'
                )}>
                  {isMove ? '' : isExpense ? '-' : '+'}{formatIDR(parsedAmount)}
                </span>
              )}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={amountRaw}
              onChange={e => setAmountRaw(formatAmountFieldInput(e.target.value))}
              placeholder="Nominal transaksi"
              className="w-full mt-1 px-3 py-2 rounded-lg bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-sm font-semibold text-[var(--sk-text)] focus:outline-none focus:border-[var(--sk-cyan)] caret-[var(--sk-cyan)] tabular-nums"
            />
            {/* Quick Amount Chips */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[
                { label: '+10rb', val: 10000 },
                { label: '+20rb', val: 20000 },
                { label: '+50rb', val: 50000 },
                { label: '+100rb', val: 100000 },
                { label: '+500rb', val: 500000 },
              ].map(chip => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => {
                    const current = parseAmountInput(amountRaw) || 0
                    setAmountRaw(String(current + chip.val))
                  }}
                  className="px-2.5 py-1 rounded-lg bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-xs font-semibold text-[var(--sk-text)] active:scale-95 transition-transform hover:bg-[var(--sk-surface-3)]"
                >
                  {chip.label}
                </button>
              ))}
              {amountRaw ? (
                <button
                  type="button"
                  onClick={() => setAmountRaw('')}
                  className="px-2.5 py-1 rounded-lg bg-[var(--sk-red-dim)] border border-[rgba(248,113,113,0.3)] text-xs font-medium text-[var(--sk-red)] active:scale-95 transition-transform"
                >
                  Hapus
                </button>
              ) : null}
            </div>
          </div>

          {/* Keterangan */}
          <div>
            <label className="text-[10px] uppercase tracking-widest font-medium text-[var(--sk-text-dim)]">
              Keterangan
            </label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="cth. Nasi padang, Bensin"
              className="w-full mt-1 px-3 py-2 rounded-lg bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-sm text-[var(--sk-text)] focus:outline-none focus:border-[var(--sk-cyan)] caret-[var(--sk-cyan)]"
            />
          </div>

          {/* Saku / Dompet */}
          <div>
            <label className="text-[10px] uppercase tracking-widest font-medium text-[var(--sk-text-dim)]">
              {isMove ? 'Dari Saku' : 'Saku / Metode Bayar'}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mt-1">
              {wallets.map(w => {
                const active = paymentMethod === w.id
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => setPaymentMethod(w.id)}
                    className={cn(
                      'px-2.5 py-2 rounded-lg text-left transition-all border flex flex-col justify-center min-h-[44px]',
                      active
                        ? 'bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)] border-[var(--sk-cyan)]'
                        : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] border-transparent hover:text-[var(--sk-text)]'
                    )}
                  >
                    <span className="text-xs font-semibold truncate leading-tight">{w.label}</span>
                    <span className="text-[10px] text-[var(--sk-text-dim)] tabular-nums mt-0.5">
                      {formatIDR(w.balance)}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Kategori (untuk Non-Transfer) */}
          {!isMove && (
            <div>
              <label className="text-[10px] uppercase tracking-widest font-medium text-[var(--sk-text-dim)]">
                Kategori
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 mt-1">
                {categoryOptions.map(cat => {
                  const Icon = cat.icon
                  const active = category === cat.id
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategory(cat.id)}
                      className={cn(
                        'px-2 py-2 rounded-lg flex flex-col items-center gap-0.5 transition-colors min-h-[44px] justify-center',
                        active
                          ? cn(cat.bg, cat.color, 'border border-current')
                          : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] border border-transparent hover:text-[var(--sk-text)]'
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-[10px] font-medium truncate w-full text-center">
                        {cat.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Sub Kategori (Horizontal Pill Carousel) */}
          {!isMove && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] uppercase tracking-widest font-medium text-[var(--sk-text-dim)]">
                  Sub Kategori
                </label>
                <button
                  type="button"
                  onClick={() => setIsAddingSub(prev => !prev)}
                  className="text-[10px] font-bold text-[var(--sk-cyan)] flex items-center gap-1 hover:underline"
                >
                  <Plus className="w-3 h-3" />
                  + Sub Baru
                </button>
              </div>

              {isAddingSub && (
                <div className="flex items-center gap-1.5 mb-2 animate-fade-in">
                  <input
                    type="text"
                    value={newSubName}
                    onChange={e => setNewSubName(e.target.value)}
                    placeholder="Nama subkategori baru..."
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-[var(--sk-surface-2)] border border-[var(--sk-cyan)] text-xs text-[var(--sk-text)] outline-none"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleCreateSubcategory}
                    disabled={!newSubName.trim()}
                    className="px-3 py-1.5 rounded-lg bg-[var(--sk-cyan)] text-[#090D16] text-xs font-bold disabled:opacity-50"
                  >
                    Simpan
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsAddingSub(false); setNewSubName('') }}
                    className="p-1.5 text-[var(--sk-text-dim)]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setSubcategory('')}
                  className={cn(
                    'px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                    !subcategory
                      ? 'bg-[var(--sk-surface-3)] text-[var(--sk-text)] border-[var(--sk-border-2)]'
                      : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] border-transparent'
                  )}
                >
                  Tanpa Sub
                </button>
                {selectedCategory?.subcategories.map(sub => (
                  <button
                    key={sub}
                    type="button"
                    onClick={() => setSubcategory(sub)}
                    className={cn(
                      'px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                      subcategory === sub
                        ? 'bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)] border-[var(--sk-cyan)]'
                        : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] border-transparent'
                    )}
                  >
                    {sub}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Waktu & Tanggal (Quick Date) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] uppercase tracking-widest font-medium text-[var(--sk-text-dim)]">
                Waktu Transaksi
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setEntryDate(dateInputValue(new Date()))}
                  className={cn(
                    'px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors',
                    entryDate === dateInputValue(new Date())
                      ? 'bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)] border-[var(--sk-cyan)]'
                      : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] border-transparent'
                  )}
                >
                  Hari Ini
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date()
                    d.setDate(d.getDate() - 1)
                    setEntryDate(dateInputValue(d))
                  }}
                  className={cn(
                    'px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors',
                    (() => {
                      const d = new Date()
                      d.setDate(d.getDate() - 1)
                      return entryDate === dateInputValue(d)
                    })()
                      ? 'bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)] border-[var(--sk-cyan)]'
                      : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] border-transparent'
                  )}
                >
                  Kemarin
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={entryDate}
                onChange={e => setEntryDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-sm text-[var(--sk-text)] focus:outline-none focus:border-[var(--sk-cyan)]"
              />
              <input
                type="time"
                value={entryTime}
                onChange={e => setEntryTime(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-sm text-[var(--sk-text)] focus:outline-none focus:border-[var(--sk-cyan)]"
              />
            </div>
          </div>

          {/* Catatan */}
          <div>
            <label className="text-[10px] uppercase tracking-widest font-medium text-[var(--sk-text-dim)]">
              Catatan (opsional)
            </label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Catatan tambahan..."
              className="w-full mt-1 px-3 py-2 rounded-lg bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-sm text-[var(--sk-text)] focus:outline-none focus:border-[var(--sk-cyan)]"
            />
          </div>
        </div>

        {/* Sticky Action Footer */}
        <div className="px-4 py-3 border-t border-[var(--sk-border)] flex items-center gap-2 flex-shrink-0 bg-[var(--sk-surface)]">
          <button
            type="button"
            onClick={handleDelete}
            className={cn(
              'px-3 py-2.5 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-semibold transition-all',
              confirmDelete
                ? 'bg-[var(--sk-red)] text-white border-[var(--sk-red)] flex-1'
                : 'bg-[var(--sk-red-dim)] text-[var(--sk-red)] border-[rgba(248,113,113,0.3)] hover:bg-[var(--sk-red-dim)]'
            )}
          >
            <Trash2 className="w-4 h-4" />
            <span>{confirmDelete ? 'Yakin Hapus?' : 'Hapus'}</span>
          </button>

          {!confirmDelete && (
            <button
              type="button"
              onClick={handleSave}
              disabled={!parsedAmount || parsedAmount <= 0 || submitting}
              className="flex-1 py-2.5 rounded-xl bg-[var(--sk-cyan)] text-[#090D16] text-xs font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>Simpan Perubahan</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
})
