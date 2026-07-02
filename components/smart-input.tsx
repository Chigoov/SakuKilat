'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { ArrowRightLeft, Info, PiggyBank, SendHorizonal, Sparkles, SlidersHorizontal, X, Loader2, TrendingDown, TrendingUp } from 'lucide-react'
import { parseEntry, formatIDR, type ParserExtras } from '@/lib/parser'
import { formatNaturalAmountInput } from '@/lib/amount'
import { findPhraseSuggestions } from '@/lib/suggestions'
import { useTransactionData } from '@/lib/store'
import { ManualEntryForm } from '@/components/manual-entry-form'
import { cn } from '@/lib/utils'
import { getCategoryConfig, getPaymentLabel } from './category-badge'

interface ParsePreview {
  kind: 'transaction' | 'transfer' | 'saving'
  description: string
  amount: number
  type?: 'expense' | 'income'
  category?: string
  subcategory?: string
  paymentMethod?: string
  fromWalletId?: string
  toWalletId?: string
  confidence: number
  warning?: string
}

const EXAMPLE_HINTS = [
  'makan soto 25k gopay',
  'gaji 5jt bca',
  'bonus 500k gopay',
  'bensin 50rb tunai',
  'bayar listrik 200rb bca',
  'kopi 18.500 ovo',
  'belanja shopee 299rb shopeepay',
  'netflix 186rb kartu',
  'grab 18k dana',
]

const INCOME_HINTS = [
  '100000 shopee',
  'gaji 5jt bca',
  'bonus 500k gopay',
  'jual barang 250rb',
  'cashback 25k dana',
]

const EXPENSE_HINTS = [
  'makan soto 25k gopay',
  'bensin 50rb tunai',
  'kopi 18.500 ovo',
  'belanja 299rb shopeepay',
  'listrik 200rb bca',
]

interface SmartInputProps {
  onSubmit: (input: string) => boolean | void | Promise<boolean | void>
  isSubmitting?: boolean
  className?: string
  parserExtras?: ParserExtras
  autoFocus?: boolean
}

type InputMode = 'auto' | 'expense' | 'income'

export function SmartInput({ onSubmit, isSubmitting, className, parserExtras, autoFocus }: SmartInputProps) {
  const { transactions } = useTransactionData()
  const [value, setValue] = useState('')
  const [preview, setPreview] = useState<ParsePreview | null>(null)
  const [focused, setFocused] = useState(false)
  const [hintIndex, setHintIndex] = useState(0)
  const [localSubmitting, setLocalSubmitting] = useState(false)
  const [mode, setMode] = useState<InputMode>('auto')
  const [manualOpen, setManualOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const locked = Boolean(isSubmitting || localSubmitting)

  const effectiveValue =
    mode === 'income' && value.trim() ? `income ${value}` :
    mode === 'expense' && value.trim() ? `expense ${value}` :
    value

  const activeHints = useMemo(() => {
    if (mode === 'income') return INCOME_HINTS
    if (mode === 'expense') return EXPENSE_HINTS
    return EXAMPLE_HINTS
  }, [mode])

  const placeholderHint = activeHints[hintIndex % activeHints.length]

  useEffect(() => {
    if (focused || value.trim()) return
    const interval = setInterval(() => {
      setHintIndex(i => (i + 1) % activeHints.length)
    }, 9000)
    return () => clearInterval(interval)
  }, [activeHints.length, focused, value])

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  useEffect(() => {
    if (!value.trim()) {
      setPreview(null)
      return
    }
    const parsed = parseEntry(effectiveValue, parserExtras)
    if (parsed && parsed.amount > 0) {
      if (parsed.kind === 'transfer' || parsed.kind === 'saving') {
        setPreview({
          kind: parsed.kind,
          description: parsed.description,
          amount: parsed.amount,
          fromWalletId: parsed.fromWalletId,
          toWalletId: parsed.toWalletId,
          confidence: parsed.confidence,
          warning: parsed.warning,
        })
        return
      }

      setPreview({
        kind: 'transaction',
        description: parsed.description,
        amount: parsed.amount,
        type: parsed.type,
        category: parsed.category,
        subcategory: parsed.subcategory,
        paymentMethod: parsed.paymentMethod,
        confidence: parsed.confidence,
        warning: parsed.warning,
      })
      return
    }
    setPreview(null)
  }, [effectiveValue, parserExtras, value])

  const phraseSuggestions = useMemo(
    () => findPhraseSuggestions(transactions, value),
    [transactions, value]
  )

  const handleSubmit = useCallback(async () => {
    const trimmed = value.trim()
    if (!trimmed || locked) return

    setLocalSubmitting(true)
    try {
      const submittedInput =
        mode === 'income' ? `income ${trimmed}` :
        mode === 'expense' ? `expense ${trimmed}` :
        trimmed
      const ok = await Promise.resolve(onSubmit(submittedInput))
      if (ok !== false) {
        setValue('')
        setPreview(null)
      }
    } finally {
      setLocalSubmitting(false)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [locked, mode, onSubmit, value])

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSubmit()
    }
    if (event.key === 'Escape') {
      setValue('')
      setPreview(null)
      inputRef.current?.blur()
    }
  }

  const categoryConfig = preview?.category ? getCategoryConfig(preview.category) : null
  const CategoryIcon = categoryConfig?.icon
  const MoveIcon = preview?.kind === 'saving' ? PiggyBank : ArrowRightLeft

  const applyExample = useCallback((example: string, nextMode: InputMode = 'auto') => {
    setMode(nextMode)
    setValue(formatNaturalAmountInput(example))
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  const applyPhraseSuggestion = useCallback((text: string) => {
    setMode('auto')
    setValue(text)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  return (
    <div className={cn('w-full', className)} data-tour="smart-input">
      {(focused || value.trim() || mode !== 'auto') && (
        <div className="mb-2 flex justify-center gap-1.5 px-1">
          {([
            ['auto', Sparkles, 'Auto'],
            ['expense', TrendingDown, 'Keluar'],
            ['income', TrendingUp, 'Masuk'],
          ] as Array<[InputMode, React.ComponentType<{ className?: string }>, string]>).map(([itemMode, Icon, label]) => (
            <button
              key={itemMode}
              type="button"
              onClick={() => setMode(itemMode)}
              className={cn(
                'h-8 min-w-20 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 border transition-colors',
                mode === itemMode
                  ? itemMode === 'income'
                    ? 'bg-[var(--sk-green)] border-[var(--sk-green)] text-[#090D16]'
                    : itemMode === 'expense'
                      ? 'bg-[var(--sk-red)] border-[var(--sk-red)] text-[#090D16]'
                      : 'bg-[var(--sk-cyan)] border-[var(--sk-cyan)] text-[#090D16]'
                  : 'bg-[var(--sk-surface-2)] border-[var(--sk-border)] text-[var(--sk-text-muted)]'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      )}

      {preview && value.trim() && (
        <div className="animate-slide-up mb-2 px-1">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border-2)]">
            {preview.kind !== 'transaction' ? (
              <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 bg-[var(--sk-cyan-dim)]">
                <MoveIcon className="w-3.5 h-3.5 text-[var(--sk-cyan)]" />
              </div>
            ) : CategoryIcon && categoryConfig ? (
              <div className={cn('w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0', categoryConfig.bg)}>
                <CategoryIcon className={cn('w-3.5 h-3.5', categoryConfig.color)} />
              </div>
            ) : null}
            <div className="flex-1 min-w-0">
              <span className="text-xs text-[var(--sk-text-muted)] mr-1.5 capitalize truncate">
                {preview.description}
              </span>
              {preview.subcategory && (
                <span className="text-[10px] text-[var(--sk-cyan)] mr-1.5">
                  /{preview.subcategory}
                </span>
              )}
              {preview.warning && (
                <span className="text-[10px] text-[var(--sk-amber)] mr-1.5">
                  {preview.warning}
                </span>
              )}
              <span className="text-[var(--sk-text-dim)] text-xs">.</span>
              <span className="text-xs text-[var(--sk-text-muted)] mx-1.5 capitalize">
                {preview.kind === 'transaction'
                  ? getPaymentLabel(preview.paymentMethod ?? 'tunai')
                  : `${getPaymentLabel(preview.fromWalletId ?? '')} -> ${getPaymentLabel(preview.toWalletId ?? '')}`}
              </span>
            </div>
            <span
              className={cn(
                'text-sm font-bold tabular-nums flex-shrink-0',
                preview.kind !== 'transaction'
                  ? 'text-[var(--sk-cyan)]'
                  : preview.type === 'expense' ? 'text-[var(--sk-red)]' : 'text-[var(--sk-green)]'
              )}
              data-amount
            >
              {preview.kind !== 'transaction' ? '' : preview.type === 'expense' ? '-' : '+'}{formatIDR(preview.amount)}
            </span>
            <span
              title={`Tingkat keyakinan: ${Math.round(preview.confidence * 100)}%`}
              className={cn(
                'min-w-9 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-center flex-shrink-0',
                preview.confidence >= 0.9 ? 'bg-[var(--sk-green-dim)] text-[var(--sk-green)]' :
                preview.confidence >= 0.7 ? 'bg-[var(--sk-amber-dim)] text-[var(--sk-amber)]' :
                'bg-[var(--sk-surface-3)] text-[var(--sk-text-muted)]'
              )}
            >
              {Math.round(preview.confidence * 100)}%
            </span>
          </div>
        </div>
      )}

      {focused && !preview && phraseSuggestions.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5 px-1">
          {phraseSuggestions.map((suggestion) => {
            const cfg = getCategoryConfig(suggestion.category)
            return (
              <button
                key={`${suggestion.category}-${suggestion.value}`}
                type="button"
                onMouseDown={event => event.preventDefault()}
                onClick={() => applyPhraseSuggestion(suggestion.value)}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--sk-border)] bg-[var(--sk-surface)] px-2.5 py-1 text-[10px] text-[var(--sk-text-muted)]"
              >
                <span className={cn('h-2 w-2 rounded-full', cfg.bg)} />
                <span className="truncate">{suggestion.value}</span>
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[9px] font-semibold',
                    suggestion.type === 'income'
                      ? 'bg-[var(--sk-green-dim)] text-[var(--sk-green)]'
                      : 'bg-[var(--sk-red-dim)] text-[var(--sk-red)]'
                  )}
                >
                  {suggestion.type === 'income' ? 'Masuk' : 'Keluar'}
                </span>
              </button>
            )
          })}
        </div>
      )}

      <div className="relative">
        {guideOpen && (
          <button
            type="button"
            aria-label="Tutup panduan Smart Tracker"
            onClick={() => setGuideOpen(false)}
            className="fixed inset-0 z-30 cursor-default"
          />
        )}

        {guideOpen && (
          <div className="absolute bottom-[calc(100%+8px)] right-2 z-40 w-[min(280px,calc(100vw-32px))] rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border)] px-3 py-3 shadow-2xl">
            <p className="text-xs font-semibold text-[var(--sk-text)]">Panduan Smart Tracker</p>
            <ol className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-[var(--sk-text-dim)]">
              <li>1. Tulis aktivitas + nominal + saku.</li>
              <li>2. Contoh: `kopi 18.500 ovo` atau `gaji 5jt bca`.</li>
              <li>3. Pindah uang: `pindah 100k bca ke gopay`.</li>
              <li>4. Kalau belum pas, pakai tombol slider untuk isi manual.</li>
            </ol>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => { applyExample('kopi latte 18000 ovo'); setGuideOpen(false) }}
                className="rounded-full bg-[var(--sk-surface-2)] border border-[var(--sk-border)] px-2.5 py-1 text-[10px] font-medium text-[var(--sk-text-muted)]"
              >
                Belanja
              </button>
              <button
                type="button"
                onClick={() => { applyExample('gaji 5000000 bca', 'income'); setGuideOpen(false) }}
                className="rounded-full bg-[var(--sk-surface-2)] border border-[var(--sk-border)] px-2.5 py-1 text-[10px] font-medium text-[var(--sk-text-muted)]"
              >
                Pemasukan
              </button>
              <button
                type="button"
                onClick={() => { applyExample('pindah 100000 bca ke gopay'); setGuideOpen(false) }}
                className="rounded-full bg-[var(--sk-surface-2)] border border-[var(--sk-border)] px-2.5 py-1 text-[10px] font-medium text-[var(--sk-text-muted)]"
              >
                Pindah uang
              </button>
            </div>
          </div>
        )}

        <div
          className={cn(
            'flex items-center gap-2 rounded-[24px] px-3.5 py-2.5 transition-all duration-200',
            'bg-[var(--sk-surface-2)] border',
            focused
              ? 'border-[var(--sk-cyan)] shadow-[0_0_0_3px_var(--sk-cyan-glow)]'
              : 'border-[var(--sk-border-2)]'
          )}
        >
          <div
            className={cn(
              'flex-shrink-0 transition-colors duration-200',
              focused ? 'text-[var(--sk-cyan)]' : 'text-[var(--sk-text-dim)]'
            )}
          >
            <Sparkles className="w-4 h-4" />
          </div>

          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={event => setValue(formatNaturalAmountInput(event.target.value))}
            onKeyDown={handleKeyDown}
            disabled={locked}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={`cth. "${placeholderHint}"`}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            inputMode="text"
            aria-label="Input transaksi bahasa natural"
            className={cn(
              'flex-1 min-w-0 bg-transparent outline-none border-none',
              'text-sm text-[var(--sk-text)] placeholder:text-[var(--sk-text-dim)]',
              'caret-[var(--sk-cyan)] disabled:cursor-not-allowed disabled:opacity-60'
            )}
          />

          <button
            type="button"
            onClick={() => setGuideOpen(open => !open)}
            disabled={locked}
            aria-label="Buka panduan Smart Tracker"
            title="Panduan Smart Tracker"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[var(--sk-surface-3)] text-[var(--sk-text-muted)] transition-all duration-150 hover:text-[var(--sk-cyan)]"
          >
            <Info className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setManualOpen(true)}
            disabled={locked}
            aria-label="Catat manual"
            title="Catat manual - kontrol penuh kategori dan saku"
            data-tour="manual-entry"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[var(--sk-surface-3)] text-[var(--sk-text-muted)] transition-all duration-150 hover:text-[var(--sk-text)]"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>

          {value && (
            <button
              type="button"
              onClick={() => { setValue(''); setPreview(null); inputRef.current?.focus() }}
              disabled={locked}
              className="text-[var(--sk-text-dim)] hover:text-[var(--sk-text-muted)] flex-shrink-0"
              aria-label="Bersihkan input"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!value.trim() || locked}
            aria-label="Tambah transaksi"
            className={cn(
              'flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200',
              value.trim() && !locked
                ? mode === 'income'
                  ? 'bg-[var(--sk-green)] text-[#0B0F19] shadow-[0_0_12px_rgba(52,211,153,0.24)] hover:opacity-90 active:scale-95'
                  : 'bg-[var(--sk-cyan)] text-[#0B0F19] shadow-[0_0_12px_var(--sk-cyan-glow)] hover:opacity-90 active:scale-95'
                : 'bg-[var(--sk-surface-3)] text-[var(--sk-text-dim)]'
            )}
          >
            {locked ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <SendHorizonal className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {!focused && !value && (
        <p className="text-center text-[10px] text-[var(--sk-text-dim)] mt-2 leading-relaxed px-2">
          Tulis transaksi pakai bahasa natural • tekan Enter untuk menyimpan
        </p>
      )}

      <ManualEntryForm
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        seedInput={value}
      />
    </div>
  )
}
