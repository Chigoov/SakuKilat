'use client'

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  Plus,
  SlidersHorizontal,
  Split,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react'
import {
  useCustomizationStore,
  useTransactionActions,
  useTransactionData,
  useWalletStore,
} from '@/lib/store'
import { CATEGORY_CONFIG, getCategoryConfig, getDefaultSubcategories, dedupeSubcategories, normalizeCategoryKey } from '@/components/category-badge'
import { formatAmountFieldInput, parseAmountInput } from '@/lib/amount'
import {
  formatIDR,
  formatIDRCompact,
  getBuiltinCategoryType,
  parseTransaction,
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
import { findPhraseSuggestions } from '@/lib/suggestions'
import { cn } from '@/lib/utils'
import { pushBackLayer, removeBackLayer } from '@/lib/back-stack'
import { RupiahInput } from '@/components/rupiah-input'
import { CompactPaymentSelector } from '@/components/compact-payment-selector'
import { CategorySuggestionChip } from '@/components/inbox-review'

interface ManualEntryFormProps {
  open: boolean
  onClose: () => void
  seedInput?: string
}

type EntryType = 'expense' | 'income' | 'transfer'

function dateInputValue(date?: Date | string | number): string {
  return toCalendarDateString(date)
}

function timeInputValue(date?: Date | string | number): string {
  return toTimeString(date)
}

function dateFromInput(value: string, timeValue?: string): Date {
  return fromCalendarDateTimeStrings(value, timeValue)
}

export const ManualEntryForm = memo(function ManualEntryForm({
  open,
  onClose,
  seedInput,
}: ManualEntryFormProps) {
  const { wallets, transferMoney } = useWalletStore()
  const { transactions } = useTransactionData()
  const { customCategories, hiddenCategoryIds, hiddenPaymentIds, addCustomCategory, updateCustomCategory } = useCustomizationStore()
  const { addManualTransaction } = useTransactionActions()

  const [type, setType] = useState<EntryType>('expense')
  const [description, setDescription] = useState('')
  const [note, setNote] = useState('')
  const [amountRaw, setAmountRaw] = useState('')
  const [category, setCategory] = useState<string>('lainnya')
  const [subcategory, setSubcategory] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<string>('')
  const [toWalletId, setToWalletId] = useState<string>('')
  const [entryDate, setEntryDate] = useState(() => dateInputValue())
  const [entryTime, setEntryTime] = useState(() => timeInputValue())
  const [submitting, setSubmitting] = useState(false)

  // Split transaction state (Phase P11)
  const [isSplitMode, setIsSplitMode] = useState(false)
  const [splitItems, setSplitItems] = useState<SplitLineItem[]>([])

  // Remember last used category per type (Bagian D)
  const [lastCategoryPerType, setLastCategoryPerType] = useState<{ expense: string; income: string }>({
    expense: 'makanan',
    income: 'gaji',
  })

  // State untuk inline add subcategory dan accordion detail tambahan
  const [isAddingSub, setIsAddingSub] = useState(false)
  const [newSubName, setNewSubName] = useState('')
  const [showDetails, setShowDetails] = useState(false)

  useEffect(() => {
    if (!open) return
    const from = wallets[0]?.id ?? 'tunai'
    const trimmed = seedInput?.trim() ?? ''
    
    if (trimmed) {
      const parsed = parseTransaction(trimmed)
      if (parsed) {
        setType(parsed.type ?? 'expense')
        setDescription(parsed.description || trimmed)
        setAmountRaw(parsed.amount > 0 ? String(parsed.amount) : '')
        setCategory(parsed.category || 'lainnya')
        setSubcategory(parsed.subcategory || '')
        const pickedWallet = wallets.find(w => w.id === parsed.paymentMethod)?.id ?? from
        setPaymentMethod(pickedWallet)
      } else {
        setType('expense')
        setDescription(trimmed)
        setAmountRaw('')
        setCategory('lainnya')
        setSubcategory('')
        setPaymentMethod(from)
      }
    } else {
      setType('expense')
      setDescription('')
      setAmountRaw('')
      setCategory('lainnya')
      setSubcategory('')
      setPaymentMethod(from)
    }

    setNote('')
    setToWalletId(wallets.find(wallet => wallet.id !== from)?.id ?? '')
    setEntryDate(dateInputValue())
    setEntryTime(timeInputValue())
    setSubmitting(false)
    setIsAddingSub(false)
    setNewSubName('')
    setIsSplitMode(false)
    setSplitItems([])
  }, [open, seedInput, wallets])

  // Back-stack integration: register/unregister modal
  useEffect(() => {
    if (open) {
      pushBackLayer({ id: 'manual-entry-form', type: 'modal', onClose })
    } else {
      removeBackLayer('manual-entry-form')
    }
    return () => removeBackLayer('manual-entry-form')
  }, [open, onClose])

  useEffect(() => {
    if (isAddingSub) {
      pushBackLayer({ id: 'manual-entry-add-sub', type: 'dialog', onClose: () => setIsAddingSub(false) })
    } else {
      removeBackLayer('manual-entry-add-sub')
    }
    return () => removeBackLayer('manual-entry-add-sub')
  }, [isAddingSub])

  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  const parsedAmount = useMemo(() => parseAmountInput(amountRaw), [amountRaw])

  const isSplitValid = useMemo(() => {
    if (!isSplitMode) return true
    return canSaveSplitTransaction(parsedAmount || 0, splitItems)
  }, [isSplitMode, parsedAmount, splitItems])

  const canSubmit = type === 'transfer'
    ? !!parsedAmount && !!paymentMethod && !!toWalletId && paymentMethod !== toWalletId && !submitting
    : isSplitMode
      ? !!parsedAmount && !!paymentMethod && isSplitValid && !submitting
      : !!parsedAmount && !!paymentMethod && !submitting

  const handleToggleSplit = useCallback(() => {
    setIsSplitMode(prev => {
      const next = !prev
      if (next && splitItems.length === 0) {
        const currentAmt = parsedAmount || 0
        const half = Math.floor(currentAmt / 2)
        const remainder = currentAmt - half
        setSplitItems([
          createSplitLineItem({ categoryId: category || 'makanan', amount: half }),
          createSplitLineItem({ categoryId: 'lainnya', amount: remainder }),
        ])
      }
      return next
    })
  }, [parsedAmount, splitItems.length, category])

  const categoryOptions = useMemo(() => {
    const customById = new Map(customCategories.map(item => [item.id, item]))
    const builtIns = Object.keys(CATEGORY_CONFIG).map(id => {
      const cfg = getCategoryConfig(id)
      const override = customById.get(id)
      const defaultSubs = getDefaultSubcategories(id)
      const mergedSubs = override?.subcategories?.length ? override.subcategories : defaultSubs
      return {
        id,
        label: cfg.label,
        icon: cfg.icon,
        color: cfg.color,
        bg: cfg.bg,
        subcategories: mergedSubs,
      }
    })
    const filtered = builtIns.filter(item => {
      if (item.id === 'lainnya' || item.id === 'transfer') return true
      if (hiddenCategoryIds.includes(item.id)) return false
      return getBuiltinCategoryType(item.id) === type
    })
    const custom = customCategories
      .filter(item => (item.type ?? 'expense') === type)
      .filter(item => !CATEGORY_CONFIG[item.id as keyof typeof CATEGORY_CONFIG])
      .map(item => {
        const cfg = getCategoryConfig(item.id)
        return {
          id: item.id,
          label: item.label,
          icon: cfg.icon,
          color: cfg.color,
          bg: cfg.bg,
          subcategories: item.subcategories ?? [],
        }
      })
    const rawAll = [...filtered, ...custom]
    const dedupeMap = new Map<string, typeof rawAll[0]>()
    for (const cat of rawAll) {
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
    const all = Array.from(dedupeMap.values())

    // Frequency sorting: frequently used categories appear first
    const freq: Record<string, number> = {}
    for (const tx of transactions) {
      if (tx.category && (tx.type === type || (!tx.type && type === 'expense'))) {
        freq[tx.category] = (freq[tx.category] || 0) + 1
      }
    }

    return all.sort((a, b) => {
      const countA = freq[a.id] ?? 0
      const countB = freq[b.id] ?? 0
      if (countB !== countA) return countB - countA
      return 0
    })
  }, [type, customCategories, hiddenCategoryIds, transactions])

  const handleTypeChange = (newType: EntryType) => {
    setType(newType)
    if (newType === 'expense') {
      const remembered = lastCategoryPerType.expense
      setCategory(remembered || 'makanan')
    } else if (newType === 'income') {
      const remembered = lastCategoryPerType.income
      setCategory(remembered || 'gaji')
    }
  }

  const handleCategoryPick = (catId: string) => {
    setCategory(catId)
    if (type === 'expense' || type === 'income') {
      setLastCategoryPerType(prev => ({ ...prev, [type]: catId }))
    }
  }

  const selectedCategory = useMemo(
    () => categoryOptions.find(item => item.id === category),
    [category, categoryOptions]
  )
  const descriptionSuggestions = useMemo(
    () => findPhraseSuggestions(transactions, description),
    [transactions, description]
  )

  useEffect(() => {
    if (type !== 'transfer') {
      if (!categoryOptions.some(item => item.id === category)) {
        setCategory(type === 'income' ? 'gaji' : 'lainnya')
      }
    }
  }, [type, categoryOptions, category])

  useEffect(() => {
    if (!selectedCategory?.subcategories.includes(subcategory)) setSubcategory('')
  }, [selectedCategory, subcategory])

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
        type: type === 'income' ? 'income' : 'expense',
      })
    }

    setSubcategory(trimmed)
    setNewSubName('')
    setIsAddingSub(false)
  }

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !parsedAmount) return
    setSubmitting(true)
    const selectedDate = dateFromInput(entryDate, entryTime)
    const primaryCategory = isSplitMode && splitItems[0] ? splitItems[0].categoryId : category
    const primarySubcategory = isSplitMode && splitItems[0] ? splitItems[0].subcategoryId : subcategory

    const noteTrimmed = note.trim()
    const transferDescription = description.trim() || 'Pindah uang'
    const finalTransferNote = noteTrimmed || undefined

    const ok = type === 'transfer'
      ? transferMoney(paymentMethod, toWalletId, parsedAmount, transferDescription, 'transfer', selectedDate, finalTransferNote)
      : await addManualTransaction({
          description: description.trim() || selectedCategory?.label || '',
          amount: parsedAmount,
          type,
          category: primaryCategory,
          subcategory: primarySubcategory || undefined,
          note: noteTrimmed || undefined,
          paymentMethod,
          date: selectedDate,
          splitItems: isSplitMode ? splitItems : undefined,
        })
    setSubmitting(false)
    if (ok) onClose()
  }, [
    addManualTransaction,
    canSubmit,
    category,
    description,
    entryDate,
    entryTime,
    isSplitMode,
    splitItems,
    onClose,
    parsedAmount,
    paymentMethod,
    toWalletId,
    transferMoney,
    selectedCategory,
    subcategory,
    note,
    type,
  ])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sk-manual-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-2 py-3 bg-[rgba(9,13,22,0.9)]"
      onClick={event => { if (event.target === event.currentTarget) onClose() }}
    >
      <form
        className="relative w-full max-w-sm rounded-xl bg-[var(--sk-surface)] border border-[var(--sk-border-2)] shadow-2xl flex flex-col max-h-[84dvh]"
        onSubmit={event => {
          event.preventDefault()
          handleSubmit()
        }}
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--sk-border)] flex-shrink-0">
          <div>
            <h2 id="sk-manual-title" className="text-sm font-semibold text-[var(--sk-text)]">
              Catat manual
            </h2>
            <p className="text-[11px] text-[var(--sk-text-dim)] mt-0.5">
              Keterangan, nominal, saku, kategori, lalu catatan.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--sk-text-dim)] hover:text-[var(--sk-text)] hover:bg-[var(--sk-surface-2)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-3 flex flex-col gap-3 overflow-y-auto">
          {/* Segmented Type Selector (Bagian D) */}
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)]">
            {([
              ['expense', TrendingDown, 'Pengeluaran'],
              ['income', TrendingUp, 'Pemasukan'],
              ['transfer', ArrowRightLeft, 'Transfer'],
            ] as Array<[EntryType, React.ComponentType<{ className?: string }>, string]>).map(([itemType, Icon, label]) => {
              const active = type === itemType
              return (
                <button
                  key={itemType}
                  type="button"
                  onClick={() => handleTypeChange(itemType)}
                  className={cn(
                    'h-9 rounded-lg flex items-center justify-center gap-1.5 text-xs font-bold transition-all border',
                    active
                      ? itemType === 'income'
                        ? 'bg-[var(--sk-green-dim)] text-[var(--sk-green)] border-[var(--sk-green)] shadow-sm'
                        : itemType === 'transfer'
                          ? 'bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)] border-[var(--sk-cyan)] shadow-sm'
                          : 'bg-[var(--sk-red-dim)] text-[var(--sk-red)] border-[var(--sk-red)] shadow-sm'
                      : 'bg-transparent text-[var(--sk-text-dim)] border-transparent hover:text-[var(--sk-text)]'
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              )
            })}
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest font-medium text-[var(--sk-text-dim)]">
              {type === 'transfer' ? 'Catatan pindah' : 'Keterangan'}
            </label>
            <input
              type="text"
              value={description}
              onChange={event => setDescription(event.target.value)}
              placeholder={type === 'transfer' ? 'cth. Top up GoPay' : 'cth. kopi, mie ayam'}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-sm text-[var(--sk-text)] placeholder:text-[var(--sk-text-dim)] focus:outline-none focus:border-[var(--sk-cyan)] caret-[var(--sk-cyan)]"
            />
            {descriptionSuggestions.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {descriptionSuggestions.map((suggestion) => (
                  <button
                    key={`${suggestion.category}-${suggestion.value}`}
                    type="button"
                    onClick={() => setDescription(suggestion.value)}
                    className="rounded-full border border-[var(--sk-border)] bg-[var(--sk-surface)] px-2.5 py-1 text-[10px] text-[var(--sk-text-muted)]"
                  >
                    {suggestion.value}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Amount Hero (Bagian C & D - Compact) */}
          <div className="rounded-xl p-3 bg-[var(--sk-surface-2)] border border-[var(--sk-border)] flex flex-col gap-1 focus-within:border-[var(--sk-cyan)] transition-colors">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-widest font-bold text-[var(--sk-text-dim)]">
                {type === 'transfer'
                  ? 'Jumlah Transfer'
                  : type === 'expense'
                    ? 'Uang Keluar'
                    : 'Uang Masuk'}
              </label>
              {parsedAmount > 0 && (
                <span className={cn(
                  'text-xs font-extrabold tabular-nums px-2 py-0.5 rounded-full',
                  type === 'transfer'
                    ? 'bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)]'
                    : type === 'expense'
                      ? 'bg-[var(--sk-red-dim)] text-[var(--sk-red)]'
                      : 'bg-[var(--sk-green-dim)] text-[var(--sk-green)]'
                )}>
                  {type === 'transfer' ? '' : type === 'expense' ? '− ' : '+ '}
                  {formatIDR(parsedAmount)}
                </span>
              )}
            </div>
            <RupiahInput
              autoFocus
              value={amountRaw}
              onChange={(_num, str) => setAmountRaw(str)}
              placeholder="0"
              containerClassName="bg-transparent border-0 py-0"
              prefixClassName={cn(
                'text-lg font-bold pl-0 pr-1',
                type === 'transfer'
                  ? 'text-[var(--sk-cyan)]'
                  : type === 'expense'
                    ? 'text-[var(--sk-red)]'
                    : 'text-[var(--sk-green)]'
              )}
              className="text-2xl sm:text-3xl font-extrabold py-0 tracking-tight tabular-nums"
            />
            <div className="mt-0.5 flex flex-wrap gap-1">
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
                    const next = current + chip.val
                    setAmountRaw(String(next))
                  }}
                  className="px-2 py-0.5 rounded-md bg-[var(--sk-surface)] border border-[var(--sk-border)] text-[11px] font-semibold text-[var(--sk-text)] active:scale-95 transition-transform hover:bg-[var(--sk-surface-3)]"
                >
                  {chip.label}
                </button>
              ))}
              {amountRaw ? (
                <button
                  type="button"
                  onClick={() => setAmountRaw('')}
                  className="px-2 py-0.5 rounded-md bg-[var(--sk-red-dim)] border border-[rgba(248,113,113,0.3)] text-[11px] font-medium text-[var(--sk-red)] active:scale-95 transition-transform"
                >
                  Hapus
                </button>
              ) : null}
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest font-medium text-[var(--sk-text-dim)]">
              {type === 'income' ? 'Saku tujuan' : 'Saku asal'}
            </label>
            <CompactPaymentSelector
              activeId={paymentMethod}
              blockedId={type === 'transfer' ? toWalletId : undefined}
              onPick={setPaymentMethod}
              wallets={wallets}
              transactions={transactions}
              hiddenPaymentIds={hiddenPaymentIds}
              isTransferMode={type === 'transfer'}
            />
          </div>

          {type === 'transfer' && (
            <div>
              <label className="text-[10px] uppercase tracking-widest font-medium text-[var(--sk-text-dim)]">
                Ke saku
              </label>
              <CompactPaymentSelector
                activeId={toWalletId}
                blockedId={paymentMethod}
                onPick={setToWalletId}
                wallets={wallets}
                transactions={transactions}
                hiddenPaymentIds={hiddenPaymentIds}
                isTransferMode={true}
              />
            </div>
          )}

          {/* Split Mode Toggle (Phase P11) */}
          {type !== 'transfer' ? (
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
                data-testid="toggle-split-mode"
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
          ) : null}

          {/* Split Editor or Single Category Picker */}
          {type !== 'transfer' ? (
            isSplitMode ? (
              <SplitTransactionEditor
                parentAmount={parsedAmount || 0}
                splitItems={splitItems}
                onChange={setSplitItems}
                type={type}
              />
            ) : (
              <>
                <CategorySuggestionChip
                  description={description}
                  currentCategoryId={category}
                  currentSubcategoryId={subcategory}
                  onApply={(suggestedCat, suggestedSub) => {
                    handleCategoryPick(suggestedCat)
                    if (suggestedSub) setSubcategory(suggestedSub)
                  }}
                  type={type}
                />

                <div>
                  <label className="text-[10px] uppercase tracking-widest font-medium text-[var(--sk-text-dim)]">
                    Kategori {type === 'income' ? 'masuk' : 'keluar'}
                  </label>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 mt-1">
                    {categoryOptions.map(item => {
                      const Icon = item.icon
                      const active = category === item.id
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleCategoryPick(item.id)}
                          className={cn(
                            'px-2 py-2 rounded-lg flex flex-col items-center gap-0.5 transition-colors min-h-[44px] justify-center',
                            active
                              ? cn(item.bg, item.color, 'border border-current')
                              : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] border border-transparent hover:text-[var(--sk-text)]'
                          )}
                        >
                          <Icon className="w-4 h-4" />
                          <span className="text-[10px] font-medium truncate w-full text-center">
                            {item.label}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </>
            )
          ) : null}

          {/* Tanggal & Waktu Transaksi (Langsung Terlihat di Form Utama & Aksesibel) */}
          <div className="rounded-xl p-3 bg-[var(--sk-surface-2)] border border-[var(--sk-border)] flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="sk-manual-entry-date"
                className="text-[10px] uppercase tracking-widest font-bold text-[var(--sk-text-dim)] cursor-pointer"
              >
                Tanggal transaksi
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setEntryDate(dateInputValue(new Date()))}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors',
                    entryDate === dateInputValue(new Date())
                      ? 'bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)] border-[var(--sk-cyan)] shadow-sm'
                      : 'bg-[var(--sk-surface)] text-[var(--sk-text-muted)] border-[var(--sk-border)] hover:text-[var(--sk-text)]'
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
                    'px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors',
                    (() => {
                      const d = new Date()
                      d.setDate(d.getDate() - 1)
                      return entryDate === dateInputValue(d)
                    })()
                      ? 'bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)] border-[var(--sk-cyan)] shadow-sm'
                      : 'bg-[var(--sk-surface)] text-[var(--sk-text-muted)] border-[var(--sk-border)] hover:text-[var(--sk-text)]'
                  )}
                >
                  Kemarin
                </button>
              </div>
            </div>
            <div className="grid grid-cols-[1.3fr_1fr] gap-2">
              <div className="relative">
                <input
                  id="sk-manual-entry-date"
                  name="entryDate"
                  type="date"
                  aria-label="Tanggal transaksi"
                  data-testid="manual-tx-date"
                  value={entryDate}
                  onChange={event => setEntryDate(event.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--sk-surface)] border border-[var(--sk-border)] text-xs font-medium text-[var(--sk-text)] focus:outline-none focus:border-[var(--sk-cyan)]"
                />
              </div>
              <div className="relative">
                <input
                  id="sk-manual-entry-time"
                  name="entryTime"
                  type="time"
                  aria-label="Waktu transaksi"
                  data-testid="manual-tx-time"
                  value={entryTime}
                  onChange={event => setEntryTime(event.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--sk-surface)] border border-[var(--sk-border)] text-xs font-medium text-[var(--sk-text)] focus:outline-none focus:border-[var(--sk-cyan)]"
                />
              </div>
            </div>
          </div>

          {/* Catatan Transaksi (Eksplisit di Alur Utama untuk Semua Tipe) */}
          <div className="rounded-xl p-3 bg-[var(--sk-surface-2)] border border-[var(--sk-border)] flex flex-col gap-1.5">
            <label
              htmlFor="sk-manual-entry-note"
              className="text-[10px] uppercase tracking-widest font-bold text-[var(--sk-text-dim)] cursor-pointer"
            >
              Catatan (opsional)
            </label>
            <input
              id="sk-manual-entry-note"
              name="manualNote"
              data-testid="manual-tx-note"
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={
                type === 'transfer'
                  ? 'cth. Bayar patungan / topup saldo'
                  : type === 'expense'
                    ? 'cth. Makan siang kantor / beli bensin'
                    : 'cth. Bonus proyek / cashback'
              }
              className="w-full px-3 py-2 rounded-lg bg-[var(--sk-surface)] border border-[var(--sk-border)] text-xs text-[var(--sk-text)] placeholder:text-[var(--sk-text-dim)] focus:outline-none focus:border-[var(--sk-cyan)]"
            />
          </div>

          {/* Accordion Detail Tambahan (Subkategori) */}
          <div className="border border-[var(--sk-border)] rounded-xl overflow-hidden bg-[var(--sk-surface-2)]/60">
            <button
              type="button"
              onClick={() => setShowDetails(prev => !prev)}
              className="w-full px-3 py-2 flex items-center justify-between text-xs font-semibold text-[var(--sk-text-muted)] hover:text-[var(--sk-text)] transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--sk-cyan)]" />
                <span>Detail Tambahan</span>
                {subcategory && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--sk-cyan)]" />
                )}
                <span className="text-[10px] text-[var(--sk-text-dim)] font-normal hidden sm:inline">
                  (Subkategori)
                </span>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-[var(--sk-text-dim)]">
                <span>{showDetails ? 'Tutup' : 'Buka'}</span>
                <ChevronDown className={cn('w-3.5 h-3.5 transition-transform duration-200', showDetails && 'rotate-180')} />
              </div>
            </button>

            {showDetails && (
              <div className="px-3 pb-3 pt-2 border-t border-[var(--sk-border)] flex flex-col gap-3">
                {type !== 'transfer' && !isSplitMode && selectedCategory ? (
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

                    <div className="flex flex-wrap gap-1.5" data-testid="manual-entry-subcategories">
                      <button
                        type="button"
                        onClick={() => setSubcategory('')}
                        className={cn(
                          'px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors',
                          !subcategory
                            ? 'bg-[var(--sk-surface-3)] text-[var(--sk-text)] border-[var(--sk-border-2)]'
                            : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] border-transparent'
                        )}
                      >
                        Tanpa Sub
                      </button>
                      {selectedCategory.subcategories.map(item => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setSubcategory(item)}
                          className={cn(
                            'px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors',
                            subcategory === item
                              ? 'bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)] border-[var(--sk-cyan)]'
                              : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] border-transparent'
                          )}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <div className="px-4 py-2.5 border-t border-[var(--sk-border)] flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3 h-10 rounded-lg text-sm font-medium text-[var(--sk-text-muted)] hover:text-[var(--sk-text)] hover:bg-[var(--sk-surface-2)] transition-colors"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className={cn(
              'flex-1 min-h-[44px] rounded-xl flex items-center justify-center gap-2 font-bold text-sm transition-all',
              canSubmit && !submitting
                ? type === 'transfer'
                  ? 'bg-[var(--sk-cyan)] text-[#090D16] hover:opacity-90 active:scale-[0.99] shadow-md'
                  : type === 'expense'
                    ? 'bg-[var(--sk-red)] text-white hover:opacity-90 active:scale-[0.99] shadow-md'
                    : 'bg-[var(--sk-green)] text-[#090D16] hover:opacity-90 active:scale-[0.99] shadow-md'
                : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-dim)] cursor-not-allowed'
            )}
          >
            {submitting ? (
              <span>Menyimpan...</span>
            ) : (
              <>
                {type === 'transfer'
                  ? <ArrowRightLeft className="w-4 h-4" />
                  : type === 'expense'
                    ? <ArrowUpRight className="w-4 h-4" />
                    : <ArrowDownLeft className="w-4 h-4" />}
                <span>
                  {type === 'transfer'
                    ? parsedAmount ? `Transfer ${formatIDR(parsedAmount)}` : 'Transfer Uang'
                    : isSplitMode && !isSplitValid
                      ? 'Alokasi Belum Seimbang'
                      : type === 'expense'
                        ? parsedAmount ? `Catat Pengeluaran ${formatIDR(parsedAmount)}` : 'Catat Pengeluaran'
                        : parsedAmount ? `Catat Pemasukan ${formatIDR(parsedAmount)}` : 'Catat Pemasukan'}
                </span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>,
    document.body
  )
})
