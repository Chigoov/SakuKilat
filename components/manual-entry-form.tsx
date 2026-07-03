'use client'

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Check,
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
import { CATEGORY_CONFIG, getCategoryConfig } from '@/components/category-badge'
import { formatNaturalAmountInput, parseAmountInput } from '@/lib/amount'
import { formatIDR, getBuiltinCategoryType } from '@/lib/parser'
import { findPhraseSuggestions } from '@/lib/suggestions'
import { cn } from '@/lib/utils'

interface ManualEntryFormProps {
  open: boolean
  onClose: () => void
  seedInput?: string
}

type EntryType = 'expense' | 'income' | 'transfer'

function dateInputValue(date = new Date()): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function dateFromInput(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return new Date()
  const now = new Date()
  return new Date(year, month - 1, day, now.getHours(), now.getMinutes(), 0, 0)
}

export const ManualEntryForm = memo(function ManualEntryForm({
  open,
  onClose,
  seedInput,
}: ManualEntryFormProps) {
  const { wallets, transferMoney } = useWalletStore()
  const { transactions } = useTransactionData()
  const { customCategories } = useCustomizationStore()
  const { addManualTransaction } = useTransactionActions()

  const [type, setType] = useState<EntryType>('expense')
  const [description, setDescription] = useState('')
  const [amountRaw, setAmountRaw] = useState('')
  const [category, setCategory] = useState<string>('lainnya')
  const [subcategory, setSubcategory] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<string>('')
  const [toWalletId, setToWalletId] = useState<string>('')
  const [entryDate, setEntryDate] = useState(() => dateInputValue())
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    const from = wallets[0]?.id ?? 'tunai'
    setType('expense')
    setDescription(seedInput?.trim() ?? '')
    setAmountRaw('')
    setCategory('lainnya')
    setSubcategory('')
    setPaymentMethod(from)
    setToWalletId(wallets.find(wallet => wallet.id !== from)?.id ?? '')
    setEntryDate(dateInputValue())
    setSubmitting(false)
  }, [open, seedInput, wallets])

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
  const canSubmit = type === 'transfer'
    ? !!parsedAmount && !!paymentMethod && !!toWalletId && paymentMethod !== toWalletId && !submitting
    : !!parsedAmount && !!paymentMethod && !submitting

  const categoryOptions = useMemo(() => {
    const customById = new Map(customCategories.map(item => [item.id, item]))
    const builtIns = Object.keys(CATEGORY_CONFIG).map(id => {
      const cfg = getCategoryConfig(id)
      const override = customById.get(id)
      return {
        id,
        label: cfg.label,
        icon: cfg.icon,
        color: cfg.color,
        bg: cfg.bg,
        subcategories: override?.subcategories ?? [],
      }
    })
    const filtered = builtIns.filter(item => {
      if (item.id === 'lainnya' || item.id === 'transfer') return true
      return getBuiltinCategoryType(item.id) === type
    })
    const custom = customCategories
      .filter(item => (item.type ?? 'expense') === type)
      .filter(item => !CATEGORY_CONFIG[item.id as keyof typeof CATEGORY_CONFIG])
      .map(item => ({
        id: item.id,
        label: item.label,
        icon: CATEGORY_CONFIG.lainnya.icon,
        color: CATEGORY_CONFIG.lainnya.color,
        bg: CATEGORY_CONFIG.lainnya.bg,
        subcategories: item.subcategories ?? [],
      }))
    return [...filtered, ...custom]
  }, [type, customCategories])

  const selectedCategory = useMemo(
    () => categoryOptions.find(item => item.id === category),
    [category, categoryOptions]
  )
  const descriptionSuggestions = useMemo(
    () => findPhraseSuggestions(transactions, description),
    [transactions, description]
  )

  useEffect(() => {
    if (type !== 'transfer' && !categoryOptions.some(item => item.id === category)) {
      setCategory(type === 'income' ? 'gaji' : 'lainnya')
    }
  }, [type, categoryOptions, category])

  useEffect(() => {
    if (!selectedCategory?.subcategories.includes(subcategory)) setSubcategory('')
  }, [selectedCategory, subcategory])

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !parsedAmount) return
    setSubmitting(true)
    const selectedDate = dateFromInput(entryDate)
    const ok = type === 'transfer'
      ? transferMoney(paymentMethod, toWalletId, parsedAmount, description.trim() || 'Pindah uang', 'transfer', selectedDate)
      : await addManualTransaction({
          description: description.trim() || selectedCategory?.label || '',
          amount: parsedAmount,
          type,
          category,
          subcategory: subcategory || undefined,
          paymentMethod,
          date: selectedDate,
        })
    setSubmitting(false)
    if (ok) onClose()
  }, [
    addManualTransaction,
    canSubmit,
    category,
    description,
    entryDate,
    onClose,
    parsedAmount,
    paymentMethod,
    toWalletId,
    transferMoney,
    selectedCategory,
    subcategory,
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
              Nominal, saku, kategori, lalu deskripsi.
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
          <div className="grid grid-cols-3 gap-1.5">
            {([
              ['expense', TrendingDown, 'Keluar'],
              ['income', TrendingUp, 'Masuk'],
              ['transfer', ArrowRightLeft, 'Pindah'],
            ] as Array<[EntryType, React.ComponentType<{ className?: string }>, string]>).map(([itemType, Icon, label]) => (
              <button
                key={itemType}
                type="button"
                onClick={() => setType(itemType)}
                className={cn(
                  'h-9 rounded-lg flex items-center justify-center gap-1 text-[11px] font-semibold transition-colors border',
                  type === itemType
                    ? itemType === 'income'
                      ? 'bg-[var(--sk-green-dim)] text-[var(--sk-green)] border-[var(--sk-green)]'
                      : itemType === 'transfer'
                        ? 'bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)] border-[var(--sk-cyan)]'
                        : 'bg-[var(--sk-red-dim)] text-[var(--sk-red)] border-[var(--sk-red)]'
                    : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] border-transparent hover:text-[var(--sk-text)]'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest font-medium text-[var(--sk-text-dim)] flex items-center justify-between">
              <span>Nominal</span>
              {parsedAmount > 0 && (
                <span className={cn(
                  'text-[11px] font-bold tabular-nums normal-case tracking-normal',
                  type === 'transfer' ? 'text-[var(--sk-cyan)]' : type === 'expense' ? 'text-[var(--sk-red)]' : 'text-[var(--sk-green)]'
                )}>
                  {type === 'transfer' ? '' : type === 'expense' ? '-' : '+'}{formatIDR(parsedAmount)}
                </span>
              )}
            </label>
            <input
              type="text"
              inputMode="decimal"
              autoFocus
              value={amountRaw}
              onChange={event => setAmountRaw(formatNaturalAmountInput(event.target.value))}
              placeholder="cth. 50000, 50rb, 1,5jt"
              className="w-full mt-1 px-3 py-2 rounded-lg bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-sm text-[var(--sk-text)] placeholder:text-[var(--sk-text-dim)] focus:outline-none focus:border-[var(--sk-cyan)] caret-[var(--sk-cyan)] tabular-nums"
            />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest font-medium text-[var(--sk-text-dim)]">
              {type === 'income' ? 'Saku tujuan' : 'Saku asal'}
            </label>
            <WalletGrid
              activeId={paymentMethod}
              blockedId={type === 'transfer' ? toWalletId : undefined}
              onPick={setPaymentMethod}
              wallets={wallets}
            />
          </div>

          {type === 'transfer' && (
            <div>
              <label className="text-[10px] uppercase tracking-widest font-medium text-[var(--sk-text-dim)]">
                Ke saku
              </label>
              <WalletGrid
                activeId={toWalletId}
                blockedId={paymentMethod}
                onPick={setToWalletId}
                wallets={wallets}
              />
            </div>
          )}

          {type !== 'transfer' && (
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
                      onClick={() => setCategory(item.id)}
                      className={cn(
                        'px-2 py-1.5 rounded-lg flex flex-col items-center gap-0.5 transition-colors',
                        active
                          ? cn(item.bg, item.color, 'border border-current')
                          : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] border border-transparent hover:text-[var(--sk-text)]'
                      )}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-medium truncate w-full text-center">
                        {item.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {type === 'expense' && selectedCategory && selectedCategory.subcategories.length > 0 && (
            <div>
              <label className="text-[10px] uppercase tracking-widest font-medium text-[var(--sk-text-dim)]">
                Sub kategori opsional
              </label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                <button
                  type="button"
                  onClick={() => setSubcategory('')}
                  className={cn(
                    'px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors',
                    !subcategory
                      ? 'bg-[var(--sk-surface-3)] text-[var(--sk-text)] border-[var(--sk-border-2)]'
                      : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] border-transparent'
                  )}
                >
                  Tanpa sub
                </button>
                {selectedCategory.subcategories.map(item => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setSubcategory(item)}
                    className={cn(
                      'px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors',
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
          )}

          <div>
            <label className="text-[10px] uppercase tracking-widest font-medium text-[var(--sk-text-dim)]">
              Tanggal
            </label>
            <input
              type="date"
              value={entryDate}
              onChange={event => setEntryDate(event.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-sm text-[var(--sk-text)] focus:outline-none focus:border-[var(--sk-cyan)]"
            />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest font-medium text-[var(--sk-text-dim)]">
              {type === 'transfer' ? 'Catatan opsional' : 'Deskripsi opsional'}
            </label>
            <input
              type="text"
              value={description}
              onChange={event => setDescription(event.target.value)}
              placeholder={type === 'transfer' ? 'cth. Top up GoPay' : 'Boleh dikosongkan'}
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
            disabled={!canSubmit}
            className={cn(
              'flex-1 h-10 rounded-lg flex items-center justify-center gap-2 font-semibold text-sm transition-opacity',
              canSubmit
                ? type === 'transfer'
                  ? 'bg-[var(--sk-cyan)] text-[var(--sk-bg)] hover:opacity-90'
                  : type === 'expense'
                    ? 'bg-[var(--sk-red)] text-[var(--sk-bg)] hover:opacity-90'
                    : 'bg-[var(--sk-green)] text-[var(--sk-bg)] hover:opacity-90'
                : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-dim)] cursor-not-allowed'
            )}
          >
            {type === 'transfer'
              ? <ArrowRightLeft className="w-4 h-4" />
              : type === 'expense'
                ? <ArrowUpRight className="w-4 h-4" />
                : <ArrowDownLeft className="w-4 h-4" />}
            {submitting ? 'Menyimpan...' : type === 'transfer' ? 'Pindah uang' : type === 'expense' ? 'Catat pengeluaran' : 'Catat pemasukan'}
          </button>
        </div>
      </form>
    </div>,
    document.body
  )
})

function WalletGrid({
  activeId,
  blockedId,
  onPick,
  wallets,
}: {
  activeId: string
  blockedId?: string
  onPick: (id: string) => void
  wallets: Array<{ id: string; label: string; balance: number }>
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mt-1">
      {wallets.map(wallet => {
        const blocked = blockedId === wallet.id
        return (
          <button
            key={wallet.id}
            type="button"
            onClick={() => !blocked && onPick(wallet.id)}
            disabled={blocked}
            className={cn(
              'px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors truncate text-left border',
              activeId === wallet.id
                ? 'bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)] border-[var(--sk-cyan)]'
                : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] border-transparent hover:text-[var(--sk-text)]',
              blocked && 'opacity-40 cursor-not-allowed'
            )}
            title={`${wallet.label} - Rp ${wallet.balance.toLocaleString('id-ID')}`}
          >
            {wallet.label}
          </button>
        )
      })}
    </div>
  )
}
