'use client'

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Check,
  Plus,
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
import { CATEGORY_CONFIG, getCategoryConfig, getDefaultSubcategories } from '@/components/category-badge'
import { formatAmountFieldInput, parseAmountInput } from '@/lib/amount'
import { formatIDR, formatIDRCompact, getBuiltinCategoryType, parseTransaction } from '@/lib/parser'
import { findPhraseSuggestions } from '@/lib/suggestions'
import { cn } from '@/lib/utils'
import { pushBackLayer, removeBackLayer } from '@/lib/back-stack'

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

function timeInputValue(date = new Date()): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function dateFromInput(value: string, timeValue?: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return new Date()
  const now = new Date()
  // Kalau timeValue diisi (HH:MM), pakai itu -- jadi user bisa catat transaksi
  // di jam tertentu. Kalau kosong, fallback ke jam sekarang (perilaku lama).
  let hour = now.getHours()
  let minute = now.getMinutes()
  if (timeValue) {
    const [h, m] = timeValue.split(':').map(Number)
    if (Number.isFinite(h)) hour = h
    if (Number.isFinite(m)) minute = m
  }
  return new Date(year, month - 1, day, hour, minute, 0, 0)
}

export const ManualEntryForm = memo(function ManualEntryForm({
  open,
  onClose,
  seedInput,
}: ManualEntryFormProps) {
  const { wallets, transferMoney } = useWalletStore()
  const { transactions } = useTransactionData()
  const { customCategories, hiddenCategoryIds, addCustomCategory, updateCustomCategory } = useCustomizationStore()
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

  // State untuk inline add subcategory
  const [isAddingSub, setIsAddingSub] = useState(false)
  const [newSubName, setNewSubName] = useState('')

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
  const canSubmit = type === 'transfer'
    ? !!parsedAmount && !!paymentMethod && !!toWalletId && paymentMethod !== toWalletId && !submitting
    : !!parsedAmount && !!paymentMethod && !submitting

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
    return [...filtered, ...custom]
  }, [type, customCategories, hiddenCategoryIds])

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
          type === 'income' ? 'income' : 'expense'
        )
      }
    }

    setSubcategory(trimmed)
    setNewSubName('')
    setIsAddingSub(false)
  }

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !parsedAmount) return
    setSubmitting(true)
    const selectedDate = dateFromInput(entryDate, entryTime)
    const ok = type === 'transfer'
      ? transferMoney(paymentMethod, toWalletId, parsedAmount, description.trim() || 'Pindah uang', 'transfer', selectedDate)
      : await addManualTransaction({
          description: description.trim() || selectedCategory?.label || '',
          amount: parsedAmount,
          type,
          category,
          subcategory: subcategory || undefined,
          note: note.trim() || undefined,
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
    entryTime,
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
              onChange={event => {
                const raw = event.target.value
                const inputType = (event.nativeEvent as InputEvent | null)?.inputType ?? ''
                const isDeleting = typeof inputType === 'string' && inputType.startsWith('delete')
                if (isDeleting) {
                  setAmountRaw(raw)
                  return
                }
                setAmountRaw(formatAmountFieldInput(raw))
              }}
              onBlur={event => {
                const cleaned = formatAmountFieldInput(event.target.value)
                if (cleaned !== amountRaw) setAmountRaw(cleaned)
              }}
              placeholder="cth. 50000, 50rb, 1,5jt"
              className="w-full mt-1 px-3 py-2 rounded-lg bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-sm text-[var(--sk-text)] placeholder:text-[var(--sk-text-dim)] focus:outline-none focus:border-[var(--sk-cyan)] caret-[var(--sk-cyan)] tabular-nums"
            />
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
                    const next = current + chip.val
                    setAmountRaw(String(next))
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
          )}

          {type !== 'transfer' && selectedCategory && (
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
                {selectedCategory.subcategories.map(item => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setSubcategory(item)}
                    className={cn(
                      'px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors',
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
              <div>
                <input
                  type="date"
                  value={entryDate}
                  onChange={event => setEntryDate(event.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-sm text-[var(--sk-text)] focus:outline-none focus:border-[var(--sk-cyan)]"
                />
              </div>
              <div>
                <input
                  type="time"
                  value={entryTime}
                  onChange={event => setEntryTime(event.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-sm text-[var(--sk-text)] focus:outline-none focus:border-[var(--sk-cyan)]"
                />
              </div>
            </div>
          </div>

          {type !== 'transfer' && (
            <div>
              <label className="text-[10px] uppercase tracking-widest font-medium text-[var(--sk-text-dim)]">
                Catatan (opsional)
              </label>
              <input
                type="text"
                value={note}
                onChange={event => setNote(event.target.value)}
                placeholder="Boleh dikosongkan"
                className="w-full mt-1 px-3 py-2 rounded-lg bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-sm text-[var(--sk-text)] placeholder:text-[var(--sk-text-dim)] focus:outline-none focus:border-[var(--sk-cyan)] caret-[var(--sk-cyan)]"
              />
            </div>
          )}
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
              'px-2 py-2 rounded-lg text-[11px] font-medium transition-colors text-left border flex flex-col gap-0.5 min-h-[44px] justify-center',
              activeId === wallet.id
                ? 'bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)] border-[var(--sk-cyan)]'
                : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] border-transparent hover:text-[var(--sk-text)]',
              blocked && 'opacity-40 cursor-not-allowed'
            )}
          >
            <span className="font-semibold truncate w-full">{wallet.label}</span>
            <span className="text-[9px] text-[var(--sk-text-dim)] tabular-nums">
              {formatIDRCompact(wallet.balance)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
