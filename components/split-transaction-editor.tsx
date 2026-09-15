'use client'

import { memo, useCallback, useMemo } from 'react'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Layers,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react'
import {
  createSplitLineItem,
  validateSplitTransaction,
  type SplitLineItem,
  type SplitValidationResult,
} from '@/lib/split-transaction'
import { formatIDR, formatIDRShort, getBuiltinCategoryType } from '@/lib/parser'
import { parseAmountInput } from '@/lib/amount'
import {
  CATEGORY_CONFIG,
  getCategoryConfig,
  getDefaultSubcategories,
  dedupeSubcategories,
  normalizeCategoryKey,
} from '@/components/category-badge'
import { useCustomizationStore } from '@/lib/store'
import { RupiahInput } from '@/components/rupiah-input'
import { cn } from '@/lib/utils'

export interface SplitTransactionEditorProps {
  parentAmount: number
  splitItems: SplitLineItem[]
  onChange: (items: SplitLineItem[]) => void
  type?: 'expense' | 'income'
  disabled?: boolean
  className?: string
}

export const SplitTransactionEditor = memo(function SplitTransactionEditor({
  parentAmount,
  splitItems,
  onChange,
  type = 'expense',
  disabled = false,
  className,
}: SplitTransactionEditorProps) {
  const { customCategories, hiddenCategoryIds } = useCustomizationStore()

  // ── Category options preparation ──────────────────────────────────────────
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
      if (item.id === 'transfer') return false
      if (item.id === 'lainnya') return true
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
    return Array.from(dedupeMap.values())
  }, [customCategories, hiddenCategoryIds, type])

  // Validation results derived via SplitTransactionValidator
  const validation: SplitValidationResult = useMemo(
    () => validateSplitTransaction(parentAmount, splitItems),
    [parentAmount, splitItems]
  )

  const defaultCategoryId = useMemo(() => {
    return categoryOptions[0]?.id || (type === 'income' ? 'gaji' : 'makanan')
  }, [categoryOptions, type])

  // ── Item modification handlers ────────────────────────────────────────────
  const handleAddItem = useCallback(() => {
    if (disabled) return
    const remaining = validation.isUnderAllocated ? validation.discrepancy : 0
    // Try to pick an unused category first
    const usedCategories = new Set(splitItems.map(i => i.categoryId))
    const nextCat = categoryOptions.find(c => !usedCategories.has(c.id))?.id || defaultCategoryId

    const newItem = createSplitLineItem({
      categoryId: nextCat,
      amount: remaining > 0 ? remaining : 0,
    })
    onChange([...splitItems, newItem])
  }, [disabled, validation, splitItems, categoryOptions, defaultCategoryId, onChange])

  const handleRemoveItem = useCallback((index: number) => {
    if (disabled) return
    if (splitItems.length <= 1) return
    const next = splitItems.filter((_, i) => i !== index)
    onChange(next)
  }, [disabled, splitItems, onChange])

  const handleCategoryChange = useCallback((index: number, newCategoryId: string) => {
    if (disabled) return
    const catConfig = categoryOptions.find(c => c.id === newCategoryId)
    const validSubs = catConfig?.subcategories ?? []

    const next = splitItems.map((item, i) => {
      if (i !== index) return item
      const subStillValid = item.subcategoryId && validSubs.includes(item.subcategoryId)
      return {
        ...item,
        categoryId: newCategoryId,
        subcategoryId: subStillValid ? item.subcategoryId : undefined,
      }
    })
    onChange(next)
  }, [disabled, categoryOptions, splitItems, onChange])

  const handleSubcategoryChange = useCallback((index: number, newSubcategory: string) => {
    if (disabled) return
    const next = splitItems.map((item, i) => {
      if (i !== index) return item
      return {
        ...item,
        subcategoryId: newSubcategory.trim() ? newSubcategory.trim() : undefined,
      }
    })
    onChange(next)
  }, [disabled, splitItems, onChange])

  const handleAmountChange = useCallback((index: number, rawAmount: string) => {
    if (disabled) return
    const numericAmount = Math.max(0, parseAmountInput(rawAmount) || 0)
    const next = splitItems.map((item, i) => {
      if (i !== index) return item
      return {
        ...item,
        amount: numericAmount,
      }
    })
    onChange(next)
  }, [disabled, splitItems, onChange])

  const handleNoteChange = useCallback((index: number, noteText: string) => {
    if (disabled) return
    const next = splitItems.map((item, i) => {
      if (i !== index) return item
      return {
        ...item,
        note: noteText.trim() ? noteText : undefined,
      }
    })
    onChange(next)
  }, [disabled, splitItems, onChange])

  // Quick action: Autofill discrepancy onto specific row
  const handleAssignDiscrepancyToRow = useCallback((index: number) => {
    if (disabled || !validation.isUnderAllocated || validation.discrepancy <= 0) return
    const next = splitItems.map((item, i) => {
      if (i !== index) return item
      return {
        ...item,
        amount: item.amount + validation.discrepancy,
      }
    })
    onChange(next)
  }, [disabled, validation, splitItems, onChange])

  // Quick action: Divide parent amount equally across all rows
  const handleEqualSplit = useCallback(() => {
    if (disabled || splitItems.length === 0 || parentAmount <= 0) return
    const count = splitItems.length
    const baseShare = Math.floor(parentAmount / count)
    const remainder = parentAmount - (baseShare * count)

    const next = splitItems.map((item, i) => ({
      ...item,
      amount: i === 0 ? baseShare + remainder : baseShare,
    }))
    onChange(next)
  }, [disabled, splitItems, parentAmount, onChange])

  return (
    <div
      data-testid="split-editor"
      className={cn(
        'rounded-xl border border-[var(--sk-border)] bg-[var(--sk-surface-2)]/50 p-3 flex flex-col gap-3',
        className
      )}
    >
      {/* Header & Title */}
      <div className="flex items-center justify-between pb-2 border-b border-[var(--sk-border)]">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)] flex items-center justify-center">
            <Layers className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-[var(--sk-text)] leading-none">
              Rincian Alokasi Split
            </h3>
            <p className="text-[10px] text-[var(--sk-text-dim)] mt-0.5">
              Bagi pengeluaran ke beberapa kategori berbeda
            </p>
          </div>
        </div>

        {splitItems.length > 1 && parentAmount > 0 && (
          <button
            type="button"
            onClick={handleEqualSplit}
            disabled={disabled}
            className="px-2 py-1 rounded-lg bg-[var(--sk-surface)] border border-[var(--sk-border)] text-[10px] font-semibold text-[var(--sk-cyan)] flex items-center gap-1 hover:bg-[var(--sk-surface-3)] transition-colors active:scale-95"
            title="Bagi rata nominal ke semua rincian"
          >
            <Sparkles className="w-3 h-3" />
            <span>Bagi Rata</span>
          </button>
        )}
      </div>

      {/* Real-time Allocation Summary Card (Requirements 11.2, 11.3) */}
      <div className="rounded-xl p-2.5 bg-[var(--sk-surface)] border border-[var(--sk-border)] flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex flex-col">
            <span className="text-[10px] text-[var(--sk-text-dim)] uppercase tracking-wider font-semibold">
              Transaksi Induk
            </span>
            <span
              data-testid="split-summary-parent"
              className="text-sm font-extrabold tabular-nums text-[var(--sk-text)]"
            >
              {formatIDR(parentAmount)}
            </span>
          </div>

          <div className="flex flex-col text-right">
            <span className="text-[10px] text-[var(--sk-text-dim)] uppercase tracking-wider font-semibold">
              Total Dialokasikan
            </span>
            <span
              data-testid="split-summary-total"
              className={cn(
                'text-sm font-extrabold tabular-nums',
                validation.isBalanced
                  ? 'text-[var(--sk-green)]'
                  : validation.isOverAllocated
                    ? 'text-[var(--sk-red)]'
                    : 'text-[var(--sk-amber)]'
              )}
            >
              {formatIDR(validation.totalSplitAmount)}
            </span>
          </div>
        </div>

        {/* Real-time Discrepancy Indicator Banner (Requirement 11.3, Property 30) */}
        <div data-testid="split-discrepancy-banner">
          {parentAmount <= 0 ? (
            <div className="p-2 rounded-lg bg-[var(--sk-surface-2)] border border-[var(--sk-border)] flex items-center gap-2 text-xs text-[var(--sk-text-dim)]">
              <AlertCircle className="w-4 h-4 shrink-0 text-[var(--sk-amber)]" />
              <span>Masukkan nominal transaksi terlebih dahulu untuk memvalidasi split.</span>
            </div>
          ) : validation.isBalanced ? (
            <div className="p-2 rounded-lg bg-[var(--sk-green-dim)] border border-[rgba(52,211,153,0.3)] flex items-center justify-between text-xs text-[var(--sk-green)] font-semibold">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Alokasi seimbang pas {formatIDR(parentAmount)}</span>
              </div>
              <span className="text-[10px] bg-[var(--sk-green)] text-[#090D16] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                Pas
              </span>
            </div>
          ) : (
            <div
              className={cn(
                'p-2 rounded-lg border flex flex-col gap-1.5 text-xs font-semibold',
                validation.isOverAllocated
                  ? 'bg-[var(--sk-red-dim)] border-[rgba(248,113,113,0.3)] text-[var(--sk-red)]'
                  : 'bg-[var(--sk-amber-dim)] border-[rgba(251,191,36,0.3)] text-[var(--sk-amber)]'
              )}
            >
              <div className="flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="font-bold">
                  {validation.errorMessage ||
                    `Selisih Rp${formatIDRShort(validation.discrepancy)}. Total alokasi harus pas dengan transaksi induk.`}
                </span>
              </div>

              {validation.isUnderAllocated && validation.discrepancy > 0 && splitItems.length > 0 && (
                <div className="flex items-center justify-between pt-1 border-t border-current/15">
                  <span className="text-[10px] font-medium opacity-85">
                    Kurang Rp{formatIDR(validation.discrepancy)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleAssignDiscrepancyToRow(splitItems.length - 1)}
                    disabled={disabled}
                    className="px-2 py-0.5 rounded bg-[var(--sk-surface)] text-[10px] font-bold text-[var(--sk-text)] border border-[var(--sk-border)] hover:bg-[var(--sk-surface-2)] active:scale-95 transition-transform"
                  >
                    + Tambahkan ke Rincian #{splitItems.length}
                  </button>
                </div>
              )}

              {validation.isOverAllocated && (
                <span className="text-[10px] font-medium opacity-85">
                  Kelebihan alokasi sebesar Rp{formatIDR(validation.discrepancy)}. Kurangi salah satu nominal rincian.
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Split Rows List (Requirement 11.1) */}
      <div className="flex flex-col gap-2.5">
        {splitItems.map((item, index) => {
          const selectedCat = categoryOptions.find(c => c.id === item.categoryId)
          const Icon = selectedCat?.icon || Layers
          const availableSubcategories = selectedCat?.subcategories ?? []

          return (
            <div
              key={item.id || `split-row-${index}`}
              data-testid={`split-item-row-${index}`}
              className="rounded-xl p-2.5 bg-[var(--sk-surface)] border border-[var(--sk-border)] flex flex-col gap-2 relative transition-all"
            >
              {/* Row Top Bar: Badge & Remove button */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-[var(--sk-surface-2)] border border-[var(--sk-border)] flex items-center justify-center text-[10px] font-extrabold text-[var(--sk-text-muted)]">
                    #{index + 1}
                  </span>
                  <span className="text-xs font-bold text-[var(--sk-text)]">
                    {selectedCat?.label || 'Pilih Kategori'}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  {splitItems.length > 1 && (
                    <button
                      type="button"
                      data-testid={`split-remove-btn-${index}`}
                      onClick={() => handleRemoveItem(index)}
                      disabled={disabled}
                      className="p-1 rounded-lg text-[var(--sk-text-dim)] hover:text-[var(--sk-red)] hover:bg-[var(--sk-red-dim)] transition-colors active:scale-90"
                      title="Hapus rincian ini"
                      aria-label={`Hapus rincian ${index + 1}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Row Grid: Category + Subcategory + Nominal */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* Category Selector */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase tracking-wider font-semibold text-[var(--sk-text-dim)]">
                    Kategori
                  </label>
                  <div className="relative flex items-center">
                    <select
                      data-testid={`split-category-select-${index}`}
                      value={item.categoryId}
                      onChange={e => handleCategoryChange(index, e.target.value)}
                      disabled={disabled}
                      className="w-full pl-2.5 pr-6 py-1.5 rounded-lg bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-xs font-semibold text-[var(--sk-text)] focus:outline-none focus:border-[var(--sk-cyan)] appearance-none cursor-pointer"
                    >
                      {categoryOptions.map(cat => (
                        <option key={cat.id} value={cat.id} className="bg-[var(--sk-surface)] text-[var(--sk-text)]">
                          {cat.label}
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-2 pointer-events-none text-[var(--sk-text-dim)]">
                      ▼
                    </div>
                  </div>
                </div>

                {/* Amount Input */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] uppercase tracking-wider font-semibold text-[var(--sk-text-dim)]">
                      Nominal Rincian
                    </label>
                    {item.amount > 0 && parentAmount > 0 && (
                      <span className="text-[10px] font-bold text-[var(--sk-text-dim)] tabular-nums">
                        {Math.round((item.amount / parentAmount) * 100)}%
                      </span>
                    )}
                  </div>
                  <RupiahInput
                    data-testid={`split-amount-input-${index}`}
                    value={item.amount > 0 ? String(item.amount) : ''}
                    onChange={(_num, str) => handleAmountChange(index, str)}
                    placeholder="0"
                    disabled={disabled}
                    containerClassName="rounded-lg bg-[var(--sk-surface-2)] border border-[var(--sk-border)] focus-within:border-[var(--sk-cyan)] py-0"
                    prefixClassName="text-xs font-bold pl-2.5 pr-0.5 text-[var(--sk-cyan)]"
                    className="py-1.5 pr-2.5 text-xs font-bold tabular-nums"
                  />
                </div>
              </div>

              {/* Subcategory & Note (Inline / Compact) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-[var(--sk-border)]/50">
                {/* Subcategory dropdown if available */}
                {availableSubcategories.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] uppercase tracking-wider font-medium text-[var(--sk-text-dim)]">
                      Subkategori
                    </label>
                    <select
                      value={item.subcategoryId || ''}
                      onChange={e => handleSubcategoryChange(index, e.target.value)}
                      disabled={disabled}
                      className="w-full px-2 py-1 rounded-md bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-[11px] text-[var(--sk-text-muted)] focus:outline-none focus:border-[var(--sk-cyan)]"
                    >
                      <option value="">Tanpa Subkategori</option>
                      {availableSubcategories.map(sub => (
                        <option key={sub} value={sub}>
                          {sub}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="hidden sm:block" />
                )}

                {/* Note */}
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] uppercase tracking-wider font-medium text-[var(--sk-text-dim)]">
                    Catatan Rincian (opsional)
                  </label>
                  <input
                    type="text"
                    data-testid={`split-note-input-${index}`}
                    value={item.note || ''}
                    onChange={e => handleNoteChange(index, e.target.value)}
                    placeholder="Cth. Sayur, buah, sabun"
                    disabled={disabled}
                    className="w-full px-2 py-1 rounded-md bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-[11px] text-[var(--sk-text)] placeholder:text-[var(--sk-text-dim)] focus:outline-none focus:border-[var(--sk-cyan)]"
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Add Split Row Button (Requirement 11.1) */}
      <button
        type="button"
        data-testid="split-add-btn"
        onClick={handleAddItem}
        disabled={disabled}
        className="w-full py-2 px-3 rounded-xl border border-dashed border-[var(--sk-border-2)] bg-[var(--sk-surface)] hover:bg-[var(--sk-surface-3)] text-xs font-bold text-[var(--sk-cyan)] flex items-center justify-center gap-1.5 transition-colors active:scale-[0.99] disabled:opacity-50"
      >
        <Plus className="w-3.5 h-3.5" />
        <span>+ Tambah Rincian Alokasi</span>
        {validation.isUnderAllocated && validation.discrepancy > 0 && (
          <span className="text-[10px] font-normal text-[var(--sk-text-dim)] ml-1">
            (Sisa: {formatIDRShort(validation.discrepancy)})
          </span>
        )}
      </button>
    </div>
  )
})
