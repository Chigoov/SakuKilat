'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Check,
  Plus,
  Split,
  Trash2,
  X,
} from 'lucide-react'
import {
  useCustomizationStore,
  useTransactionActions,
  useTransactionData,
  useWalletStore,
  type TransactionUpdateInput,
} from '@/lib/store'
import { CompactPaymentSelector } from '@/components/compact-payment-selector'
import {
  CATEGORY_CONFIG,
  CategoryIcon,
  getCategoryConfig,
  getDefaultSubcategories,
  getPaymentLabel,
  dedupeSubcategories,
  normalizeCategoryKey,
} from '@/components/category-badge'
import { formatAmountFieldInput, parseAmountInput } from '@/lib/amount'
import {
  formatIDR,
  toCalendarDateString,
  toTimeString,
  fromCalendarDateTimeStrings,
} from '@/lib/parser'
import {
  createSplitLineItem,
  canSaveSplitTransaction,
  type SplitLineItem,
} from '@/lib/split-transaction'
import { SplitTransactionEditor } from '@/components/split-transaction-editor'
import type { Transaction } from '@/lib/mock-data'
import { cn } from '@/lib/utils'
import { pushBackLayer, removeBackLayer } from '@/lib/back-stack'
import { RupiahInput } from '@/components/rupiah-input'
import { CategorySuggestionChip } from '@/components/inbox-review'

interface EditTransactionModalProps {
  open: boolean
  onClose: () => void
  transaction: Transaction | null
  onUpdate?: (id: string, updates: TransactionUpdateInput) => void
  onDelete?: (id: string) => void
}

function dateInputValue(date: Date | string | number): string {
  return toCalendarDateString(date)
}

function timeInputValue(date: Date | string | number): string {
  return toTimeString(date)
}

function combineDateTime(dateStr: string, timeStr: string, fallback: Date | string | number): Date {
  const fbDate = fallback instanceof Date
    ? (!Number.isNaN(fallback.getTime()) ? fallback : new Date())
    : typeof fallback === 'string'
      ? fromCalendarDateTimeStrings(fallback)
      : typeof fallback === 'number'
        ? new Date(fallback)
        : new Date()

  if (
    dateStr === toCalendarDateString(fbDate) &&
    timeStr === toTimeString(fbDate)
  ) {
    return new Date(fbDate.getTime())
  }
  const parsed = fromCalendarDateTimeStrings(dateStr, timeStr)
  return Number.isNaN(parsed.getTime()) ? new Date(fbDate.getTime()) : parsed
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
  const { transactions } = useTransactionData()
  const { customCategories, hiddenPaymentIds, addCustomCategory, updateCustomCategory } = useCustomizationStore()
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

  // Split transaction state (Phase P11)
  const [isSplitMode, setIsSplitMode] = useState(false)
  const [splitItems, setSplitItems] = useState<SplitLineItem[]>([])

  // State untuk inline add subcategory
  const [isAddingSub, setIsAddingSub] = useState(false)
  const [newSubName, setNewSubName] = useState('')
  const lastOpenedTxIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!open || !transaction) {
      lastOpenedTxIdRef.current = null
      return
    }
    // Only re-initialize form state when modal opens or a different transaction is selected
    if (lastOpenedTxIdRef.current === transaction.id) return
    lastOpenedTxIdRef.current = transaction.id

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

    if (transaction.splitItems && transaction.splitItems.length > 0) {
      setIsSplitMode(true)
      setSplitItems(transaction.splitItems.map(item => ({ ...item })))
    } else {
      setIsSplitMode(false)
      setSplitItems([])
    }
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

    const combined = [...builtin, ...custom]
    const dedupeMap = new Map<string, typeof combined[0]>()
    for (const cat of combined) {
      const normKey = normalizeCategoryKey(cat.label) || normalizeCategoryKey(cat.id)
      const existing = dedupeMap.get(normKey)
      if (!existing) {
        dedupeMap.set(normKey, { ...cat, subcategories: dedupeSubcategories(cat.subcategories ?? []) })
      } else {
        existing.subcategories = dedupeSubcategories([
          ...existing.subcategories,
          ...(cat.subcategories ?? []),
        ])
        if (cat.id === 'lainnya') {
          existing.id = 'lainnya'
          existing.label = cat.label
        }
      }
    }
    return Array.from(dedupeMap.values())
  }, [customCategories, isExpense])

  const selectedCategory = useMemo(
    () => categoryOptions.find(item => item.id === category),
    [category, categoryOptions]
  )

  const isSplitValid = useMemo(() => {
    if (!isSplitMode) return true
    return canSaveSplitTransaction(parsedAmount || 0, splitItems)
  }, [isSplitMode, parsedAmount, splitItems])

  const handleToggleSplit = useCallback(() => {
    setIsSplitMode(prev => {
      const next = !prev
      if (next && splitItems.length === 0) {
        const currentAmount = parseAmountInput(amountRaw) || transaction?.amount || 0
        const half = Math.floor(currentAmount / 2)
        const remainder = currentAmount - half
        setSplitItems([
          createSplitLineItem({
            categoryId: category || 'makanan',
            subcategoryId: subcategory || undefined,
            amount: half,
          }),
          createSplitLineItem({
            categoryId: 'lainnya',
            amount: remainder,
          }),
        ])
      }
      return next
    })
  }, [amountRaw, category, subcategory, splitItems.length, transaction?.amount])

  const handleSave = () => {
    if (!transaction || !parsedAmount || parsedAmount <= 0) return
    if (isSplitMode && !isSplitValid) return
    setSubmitting(true)

    const finalDate = combineDateTime(entryDate, entryTime, transaction.date)
    const primaryCategory = isSplitMode && splitItems[0] ? splitItems[0].categoryId : category
    const primarySubcategory = isSplitMode && splitItems[0] ? splitItems[0].subcategoryId : subcategory.trim() || undefined

    const updates: TransactionUpdateInput = {
      description: description.trim() || transaction.description,
      amount: parsedAmount,
      date: finalDate,
      paymentMethod,
      category: primaryCategory,
      subcategory: primarySubcategory,
      note: note.trim() || undefined,
      splitItems: isSplitMode ? splitItems : undefined,
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
    const updatedSubs = dedupeSubcategories([...existingSubs, trimmed])
    const existingCustom = customCategories.find(c =>
      c.id === selectedCategory.id || normalizeCategoryKey(c.label) === normalizeCategoryKey(selectedCategory.label)
    )
    if (existingCustom) {
      updateCustomCategory(existingCustom.id, {
        label: existingCustom.label,
        keywords: existingCustom.keywords,
        subcategories: updatedSubs,
      })
    } else {
      updateCustomCategory(selectedCategory.id, {
        label: selectedCategory.label,
        keywords: [],
        subcategories: updatedSubs,
        type: isExpense ? 'expense' : 'income',
      })
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
            <RupiahInput
              value={amountRaw}
              onChange={(_num, str) => setAmountRaw(str)}
              placeholder="Nominal transaksi"
              containerClassName="w-full mt-1 rounded-lg bg-[var(--sk-surface-2)] border border-[var(--sk-border)] focus-within:border-[var(--sk-cyan)]"
              className="py-2 text-sm font-semibold tabular-nums"
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
            <CompactPaymentSelector
              activeId={paymentMethod}
              onPick={setPaymentMethod}
              wallets={wallets}
              transactions={transactions}
              hiddenPaymentIds={hiddenPaymentIds}
              isTransferMode={isMove}
              balanceFormat="full"
            />
          </div>

          {/* Kategori (untuk Non-Transfer) */}
          {/* Split Mode Toggle (Phase P11) */}
          {!isMove && (
            <div className="flex items-center justify-between p-2 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)]">
              <div className="flex items-center gap-2">
                <div className={cn(
                  'w-6 h-6 rounded-lg flex items-center justify-center transition-colors',
                  isSplitMode
                    ? 'bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)]'
                    : 'bg-[var(--sk-surface)] text-[var(--sk-text-muted)]'
                )}>
                  <Split className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="text-xs font-bold text-[var(--sk-text)] block leading-none">
                    Pisah Kategori (Split)
                  </span>
                  <span className="text-[10px] text-[var(--sk-text-dim)]">
                    {isSplitMode ? 'Bagi transaksi ke beberapa kategori' : 'Catat ke satu kategori saja'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                data-testid="edit-toggle-split-mode"
                onClick={handleToggleSplit}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-bold transition-all border shadow-sm',
                  isSplitMode
                    ? 'bg-[var(--sk-cyan)] text-[#090D16] border-[var(--sk-cyan)]'
                    : 'bg-[var(--sk-surface)] text-[var(--sk-text-muted)] border-[var(--sk-border)] hover:text-[var(--sk-text)]'
                )}
              >
                {isSplitMode ? 'Aktif' : 'Nonaktif'}
              </button>
            </div>
          )}

          {/* Split Editor or Single Category Picker */}
          {!isMove && isSplitMode ? (
            <SplitTransactionEditor
              parentAmount={parsedAmount || 0}
              splitItems={splitItems}
              onChange={setSplitItems}
              type={isExpense ? 'expense' : 'income'}
            />
          ) : (
            !isMove && (
              <>
                <div className="flex flex-col gap-2">
                  <CategorySuggestionChip
                    description={description}
                    currentCategoryId={category}
                    currentSubcategoryId={subcategory}
                    onApply={(suggestedCat, suggestedSub) => {
                      setCategory(suggestedCat)
                      if (suggestedSub) setSubcategory(suggestedSub)
                    }}
                    type={isExpense ? 'expense' : 'income'}
                  />
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
                </div>

                {/* Sub Kategori (Flex Wrap Chips) */}
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

                  <div className="flex flex-wrap gap-1.5" data-testid="edit-modal-subcategories">
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
              </>
            )
          )}

          {/* Waktu & Tanggal (Quick Date & Accessible) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label
                htmlFor="sk-edit-tx-date"
                className="text-[10px] uppercase tracking-widest font-bold text-[var(--sk-text-dim)] cursor-pointer"
              >
                Tanggal transaksi
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
                id="sk-edit-tx-date"
                name="editDate"
                type="date"
                aria-label="Tanggal transaksi"
                value={entryDate}
                onChange={e => setEntryDate(e.target.value)}
                data-testid="edit-tx-date"
                className="w-full px-3 py-2 rounded-lg bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-sm text-[var(--sk-text)] focus:outline-none focus:border-[var(--sk-cyan)]"
              />
              <input
                id="sk-edit-tx-time"
                name="editTime"
                type="time"
                aria-label="Waktu transaksi"
                value={entryTime}
                onChange={e => setEntryTime(e.target.value)}
                data-testid="edit-tx-time"
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
              disabled={!parsedAmount || parsedAmount <= 0 || (isSplitMode && !isSplitValid) || submitting}
              className="flex-1 py-2.5 rounded-xl bg-[var(--sk-cyan)] text-[#090D16] text-xs font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>
                {isSplitMode && !isSplitValid ? 'Alokasi Belum Seimbang' : 'Simpan Perubahan'}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
})
