'use client'

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  CreditCard,
  Landmark,
  Pencil,
  Plus,
  Receipt,
  Repeat,
  Trash2,
  Wallet,
  X,
} from 'lucide-react'
import {
  useBillStore,
  useCustomizationStore,
  useFeedbackStore,
  useWalletStore,
} from '@/lib/store'
import { formatIDR } from '@/lib/parser'
import { parseAmountInput } from '@/lib/amount'
import { RupiahInput } from '@/components/rupiah-input'
import { cn } from '@/lib/utils'
import { pushBackLayer, removeBackLayer } from '@/lib/back-stack'
import {
  type Bill,
  type RecurrencePeriod,
  type CreateBillInput,
  computeNextDueDate,
  formatBillDueDate,
  groupBillsByUrgency,
  getNearestBill,
  getDaysInMonth,
} from '@/lib/bills'

const WEEKDAY_NAMES: Record<number, string> = {
  1: 'Senin',
  2: 'Selasa',
  3: 'Rabu',
  4: 'Kamis',
  5: 'Jumat',
  6: 'Sabtu',
  7: 'Minggu',
}

const MONTH_NAMES: Record<number, string> = {
  1: 'Januari',
  2: 'Februari',
  3: 'Maret',
  4: 'April',
  5: 'Mei',
  6: 'Juni',
  7: 'Juli',
  8: 'Agustus',
  9: 'September',
  10: 'Oktober',
  11: 'November',
  12: 'Desember',
}

const RECURRENCE_LABELS: Record<RecurrencePeriod, string> = {
  monthly: 'Bulanan',
  weekly: 'Mingguan',
  annually: 'Tahunan',
}

// ── Confirmation Modal: "Tandai sudah dibayar" (Req 5.4, 5.5, 5.6) ─────────────

interface ConfirmBillPaymentModalProps {
  bill: Bill | null
  onClose: () => void
  onConfirm: (billId: string, paidAmount: number, walletId: string, note?: string) => void
}

function ConfirmBillPaymentModal({
  bill,
  onClose,
  onConfirm,
}: ConfirmBillPaymentModalProps) {
  const { wallets } = useWalletStore()
  const [amountRaw, setAmountRaw] = useState('')
  const [selectedWalletId, setSelectedWalletId] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!bill) return
    setAmountRaw(String(bill.amount))
    const defaultWallet = wallets.find(w => w.id === bill.paymentMethodId)?.id || wallets[0]?.id || 'tunai'
    setSelectedWalletId(defaultWallet)
    setNote(`Bayar tagihan: ${bill.name}`)
    setSubmitting(false)
  }, [bill, wallets])

  // Back stack integration: back button closes modal safely without transaction creation
  useEffect(() => {
    if (bill) {
      pushBackLayer({
        id: 'confirm-bill-payment-modal',
        type: 'modal',
        onClose,
      })
    } else {
      removeBackLayer('confirm-bill-payment-modal')
    }
    return () => removeBackLayer('confirm-bill-payment-modal')
  }, [bill, onClose])

  // Escape key closes modal without transaction creation
  useEffect(() => {
    if (!bill) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [bill, onClose])

  if (!bill || typeof document === 'undefined') return null

  const parsedAmount = parseAmountInput(amountRaw)
  const isValidAmount = Number.isFinite(parsedAmount) && parsedAmount > 0
  const selectedWallet = wallets.find(w => w.id === selectedWalletId)
  const isDifferentFromRegistered = parsedAmount !== bill.amount

  const handleConfirm = () => {
    if (!isValidAmount || submitting) return
    setSubmitting(true)
    onConfirm(bill.id, parsedAmount, selectedWalletId, note.trim() || undefined)
    onClose()
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-bill-title"
      data-testid="bill-payment-modal"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 bg-[rgba(9,13,22,0.85)] backdrop-blur-xs animate-fade-in"
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="relative w-full max-w-md rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border-2)] shadow-2xl overflow-hidden flex flex-col max-h-[90dvh] animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--sk-border)] bg-[var(--sk-surface-2)]/50">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[var(--sk-green-dim)] flex items-center justify-center shrink-0 border border-[var(--sk-green)]/30">
              <CheckCircle2 className="w-5 h-5 text-[var(--sk-green)]" />
            </div>
            <div className="min-w-0">
              <h3 id="confirm-bill-title" className="text-sm font-bold text-[var(--sk-text)] truncate">
                Tandai Sudah Dibayar
              </h3>
              <p className="text-[11px] text-[var(--sk-text-dim)] truncate">
                Konfirmasi transaksi pembayaran & perbarui jatuh tempo
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="btn-cancel-payment-x"
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--sk-text-dim)] hover:text-[var(--sk-text)] hover:bg-[var(--sk-surface-2)] transition-colors"
            aria-label="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col gap-4 overflow-y-auto">
          {/* Bill Summary Box */}
          <div className="rounded-xl bg-[var(--sk-surface-2)]/60 border border-[var(--sk-border)] p-3.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[10px] font-semibold tracking-wide uppercase text-[var(--sk-text-dim)]">
                Tagihan
              </span>
              <p className="text-sm font-bold text-[var(--sk-text)] truncate">{bill.name}</p>
              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[var(--sk-text-muted)]">
                <span>{RECURRENCE_LABELS[bill.recurrence]}</span>
                <span>•</span>
                <span>Jatuh tempo: {formatBillDueDate(bill.nextDueDate)}</span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="text-[10px] text-[var(--sk-text-dim)] block">Tagihan Terdaftar</span>
              <span className="text-xs font-semibold tabular-nums text-[var(--sk-text-muted)]">
                {formatIDR(bill.amount)}
              </span>
            </div>
          </div>

          {/* Actual Paid Nominal (Requirement 5.5: Allow adjustment) */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[var(--sk-text)]">
                Nominal yang Dibayar
              </label>
              {isDifferentFromRegistered && (
                <span className="text-[10px] font-medium text-[var(--sk-amber)] bg-[var(--sk-amber-dim)] px-2 py-0.5 rounded-full">
                  Disesuaikan
                </span>
              )}
            </div>
            <RupiahInput
              value={amountRaw}
              onChange={(_num, str) => setAmountRaw(str)}
              placeholder="0"
              autoFocus
              containerClassName="rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] focus-within:border-[var(--sk-cyan)]"
              prefixClassName="text-sm font-bold pl-3 pr-1 text-[var(--sk-cyan)]"
              className="py-2.5 pr-3 text-base font-bold tabular-nums"
            />
            <p className="text-[10px] text-[var(--sk-text-dim)] leading-relaxed">
              Dapat disesuaikan jika nominal riil berbeda dari tagihan terdaftar (cth. tagihan listrik berfluktuasi).
            </p>
          </div>

          {/* Payment Wallet Selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[var(--sk-text)]">
              Bayar dari Saku
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {wallets.map(wallet => {
                const isSelected = wallet.id === selectedWalletId
                return (
                  <button
                    key={wallet.id}
                    type="button"
                    onClick={() => setSelectedWalletId(wallet.id)}
                    className={cn(
                      'p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all',
                      isSelected
                        ? 'bg-[var(--sk-cyan-dim)] border-[var(--sk-cyan)] shadow-xs'
                        : 'bg-[var(--sk-surface-2)] border-[var(--sk-border)] hover:border-[var(--sk-border-2)]'
                    )}
                  >
                    <div
                      className={cn(
                        'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                        isSelected ? 'bg-[var(--sk-cyan)] text-[#090D16]' : 'bg-[var(--sk-surface-3)] text-[var(--sk-text-muted)]'
                      )}
                    >
                      <Wallet className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn('text-xs font-semibold truncate', isSelected ? 'text-[var(--sk-text)]' : 'text-[var(--sk-text-muted)]')}>
                        {wallet.label}
                      </p>
                      <p className="text-[10px] tabular-nums text-[var(--sk-text-dim)]">
                        {formatIDR(wallet.balance)}
                      </p>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-[var(--sk-cyan)] shrink-0" />}
                  </button>
                )
              })}
            </div>
            {selectedWallet && (
              <p className="text-[10px] text-[var(--sk-text-dim)] mt-0.5">
                Saldo {selectedWallet.label} akan berkurang {formatIDR(parsedAmount || 0)}.
              </p>
            )}
          </div>

          {/* Transaction Note */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[var(--sk-text)]">
              Catatan Transaksi (Opsional)
            </label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Catatan pembayaran tagihan..."
              className="w-full px-3 py-2 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-xs text-[var(--sk-text)] placeholder:text-[var(--sk-text-dim)] outline-none focus:border-[var(--sk-cyan)]"
            />
          </div>

          {/* Informative Disclaimer */}
          <div className="rounded-xl bg-[var(--sk-surface-2)]/40 border border-[var(--sk-border)] p-3 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-[var(--sk-cyan)] shrink-0 mt-0.5" />
            <p className="text-[11px] text-[var(--sk-text-dim)] leading-relaxed">
              Setelah konfirmasi, pengeluaran akan otomatis dicatat di buku kas dan jadwal jatuh tempo tagihan ini akan dimajukan ke periode berikutnya.
            </p>
          </div>
        </div>

        {/* Action Buttons (Requirement 5.6: Cancel prevents automated transaction creation) */}
        <div className="p-4 border-t border-[var(--sk-border)] bg-[var(--sk-surface-2)]/30 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            data-testid="btn-cancel-payment"
            className="px-4 py-2.5 rounded-xl border border-[var(--sk-border)] bg-[var(--sk-surface-2)] text-xs font-semibold text-[var(--sk-text-muted)] hover:bg-[var(--sk-surface-3)] transition-colors"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!isValidAmount || submitting}
            data-testid="btn-confirm-payment"
            className={cn(
              'px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all',
              isValidAmount && !submitting
                ? 'bg-[var(--sk-green)] text-[#090D16] shadow-sm hover:opacity-95 active:scale-95'
                : 'bg-[var(--sk-surface-3)] text-[var(--sk-text-dim)] cursor-not-allowed'
            )}
          >
            <Check className="w-4 h-4" />
            {submitting ? 'Menyimpan...' : 'Konfirmasi Bayar'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Bill Create / Edit Form ──────────────────────────────────────────────────

interface BillFormProps {
  initial?: Bill | null
  onSave: (data: CreateBillInput & { id?: string }) => void
  onCancel: () => void
}

function BillForm({ initial, onSave, onCancel }: BillFormProps) {
  const { wallets } = useWalletStore()
  const { customCategories, hiddenCategoryIds } = useCustomizationStore()

  const [name, setName] = useState(initial?.name ?? '')
  const [amountRaw, setAmountRaw] = useState(initial ? String(initial.amount) : '')
  const [recurrence, setRecurrence] = useState<RecurrencePeriod>(initial?.recurrence ?? 'monthly')
  const [dueDay, setDueDay] = useState(initial?.dueDay ?? 1)
  const [dueMonth, setDueMonth] = useState(initial?.dueMonth ?? (new Date().getMonth() + 1))
  const [paymentMethodId, setPaymentMethodId] = useState(
    initial?.paymentMethodId ?? (wallets[0]?.id || 'tunai')
  )
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? 'tagihan')
  const [note, setNote] = useState(initial?.note ?? '')

  const parsedAmount = parseAmountInput(amountRaw)
  const isValid = name.trim().length > 0 && Number.isFinite(parsedAmount) && parsedAmount > 0

  const previewNextDueDate = useMemo(() => {
    try {
      return computeNextDueDate(recurrence, dueDay, new Date(), { dueMonth })
    } catch {
      return ''
    }
  }, [recurrence, dueDay, dueMonth])

  const categoryOptions = useMemo(() => {
    const builtinExpense = [
      { id: 'tagihan', label: 'Tagihan & Utilitas' },
      { id: 'makanan', label: 'Makanan' },
      { id: 'transport', label: 'Transportasi' },
      { id: 'belanja', label: 'Belanja' },
      { id: 'hiburan', label: 'Hiburan' },
      { id: 'kesehatan', label: 'Kesehatan' },
      { id: 'edukasi', label: 'Edukasi' },
      { id: 'lainnya', label: 'Lainnya' },
    ]
    const custom = customCategories
      .filter(c => (c.type ?? 'expense') === 'expense' && !hiddenCategoryIds.includes(c.id))
      .map(c => ({ id: c.id, label: c.label }))

    const map = new Map<string, string>()
    for (const item of [...builtinExpense, ...custom]) {
      if (!hiddenCategoryIds.includes(item.id)) {
        map.set(item.id, item.label)
      }
    }
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }))
  }, [customCategories, hiddenCategoryIds])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid || !parsedAmount) return

    onSave({
      id: initial?.id,
      name: name.trim(),
      amount: parsedAmount,
      recurrence,
      dueDay,
      dueMonth: recurrence === 'annually' ? dueMonth : undefined,
      paymentMethodId,
      categoryId,
      note: note.trim() || undefined,
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="bill-form"
      className="rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-cyan)] p-4 shadow-[0_0_20px_var(--sk-cyan-glow)] flex flex-col gap-3.5 animate-slide-up"
    >
      <div className="flex items-center justify-between pb-2 border-b border-[var(--sk-border)]">
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-[var(--sk-cyan)]" />
          <h4 className="text-sm font-bold text-[var(--sk-text)]">
            {initial ? 'Edit Tagihan' : 'Tambah Tagihan Baru'}
          </h4>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-[var(--sk-text-dim)] hover:text-[var(--sk-text)]"
          aria-label="Batal"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Name Input */}
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-semibold text-[var(--sk-text-dim)] uppercase tracking-wider">
          Nama Tagihan / Langganan
        </label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="cth. Listrik PLN, Netflix, Wi-Fi, Kost"
          autoFocus
          className="w-full px-3 py-2 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-xs text-[var(--sk-text)] placeholder:text-[var(--sk-text-dim)] outline-none focus:border-[var(--sk-cyan)]"
        />
      </div>

      {/* Amount Input */}
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-semibold text-[var(--sk-text-dim)] uppercase tracking-wider">
          Nominal Tagihan
        </label>
        <RupiahInput
          value={amountRaw}
          onChange={(_num, str) => setAmountRaw(str)}
          placeholder="cth. 250.000"
          containerClassName="rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] focus-within:border-[var(--sk-cyan)]"
          prefixClassName="text-xs font-bold pl-3 pr-1 text-[var(--sk-cyan)]"
          className="py-2 pr-3 text-xs font-bold tabular-nums"
        />
      </div>

      {/* Recurrence Selector */}
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-semibold text-[var(--sk-text-dim)] uppercase tracking-wider">
          Periode Tagihan
        </label>
        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)]">
          {(['monthly', 'weekly', 'annually'] as RecurrencePeriod[]).map(period => (
            <button
              key={period}
              type="button"
              onClick={() => setRecurrence(period)}
              className={cn(
                'py-1.5 rounded-lg text-xs font-semibold transition-all',
                recurrence === period
                  ? 'bg-[var(--sk-cyan)] text-[#090D16] shadow-xs'
                  : 'text-[var(--sk-text-dim)] hover:text-[var(--sk-text)]'
              )}
            >
              {RECURRENCE_LABELS[period]}
            </button>
          ))}
        </div>
      </div>

      {/* Due Day / Date Selector */}
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-semibold text-[var(--sk-text-dim)] uppercase tracking-wider">
          Jatuh Tempo Pembayaran
        </label>
        {recurrence === 'weekly' ? (
          <div className="grid grid-cols-7 gap-1">
            {[1, 2, 3, 4, 5, 6, 7].map(day => (
              <button
                key={day}
                type="button"
                onClick={() => setDueDay(day)}
                className={cn(
                  'py-2 rounded-lg text-[11px] font-semibold transition-all text-center',
                  dueDay === day
                    ? 'bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)] border border-[var(--sk-cyan)]'
                    : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] border border-[var(--sk-border)] hover:bg-[var(--sk-surface-3)]'
                )}
              >
                {WEEKDAY_NAMES[day].slice(0, 3)}
              </button>
            ))}
          </div>
        ) : recurrence === 'monthly' ? (
          <div className="flex items-center gap-2">
            <select
              value={dueDay}
              onChange={e => setDueDay(Number(e.target.value))}
              className="flex-1 px-3 py-2 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-xs text-[var(--sk-text)] outline-none focus:border-[var(--sk-cyan)]"
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                <option key={d} value={d}>
                  Tanggal {d} setiap bulan
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <select
              value={dueMonth}
              onChange={e => setDueMonth(Number(e.target.value))}
              className="px-3 py-2 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-xs text-[var(--sk-text)] outline-none focus:border-[var(--sk-cyan)]"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>
                  Bulan {MONTH_NAMES[m]}
                </option>
              ))}
            </select>
            <select
              value={dueDay}
              onChange={e => setDueDay(Number(e.target.value))}
              className="px-3 py-2 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-xs text-[var(--sk-text)] outline-none focus:border-[var(--sk-cyan)]"
            >
              {Array.from({ length: getDaysInMonth(2026, dueMonth) }, (_, i) => i + 1).map(d => (
                <option key={d} value={d}>
                  Tanggal {d}
                </option>
              ))}
            </select>
          </div>
        )}
        {previewNextDueDate && (
          <p className="text-[10px] text-[var(--sk-text-dim)] mt-0.5">
            Jatuh tempo terdekat berikutnya: <span className="text-[var(--sk-cyan)] font-semibold">{formatBillDueDate(previewNextDueDate)} ({previewNextDueDate})</span>
          </p>
        )}
      </div>

      {/* Wallet & Category Selection */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold text-[var(--sk-text-dim)] uppercase tracking-wider">
            Saku Bayar
          </label>
          <select
            value={paymentMethodId}
            onChange={e => setPaymentMethodId(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-xs text-[var(--sk-text)] outline-none focus:border-[var(--sk-cyan)]"
          >
            {wallets.map(w => (
              <option key={w.id} value={w.id}>
                {w.label} ({formatIDR(w.balance)})
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold text-[var(--sk-text-dim)] uppercase tracking-wider">
            Kategori
          </label>
          <select
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-xs text-[var(--sk-text)] outline-none focus:border-[var(--sk-cyan)]"
          >
            {categoryOptions.map(cat => (
              <option key={cat.id} value={cat.id}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Optional Note */}
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-semibold text-[var(--sk-text-dim)] uppercase tracking-wider">
          Catatan (Opsional)
        </label>
        <input
          type="text"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="cth. ID Pelanggan 123456789"
          className="w-full px-3 py-2 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-xs text-[var(--sk-text)] placeholder:text-[var(--sk-text-dim)] outline-none focus:border-[var(--sk-cyan)]"
        />
      </div>

      {/* Submit / Cancel buttons */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--sk-border)]">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-2 rounded-xl text-xs font-semibold text-[var(--sk-text-dim)] hover:bg-[var(--sk-surface-2)] transition-colors"
        >
          Batal
        </button>
        <button
          type="submit"
          disabled={!isValid}
          className={cn(
            'px-4 py-2 rounded-xl text-xs font-bold transition-all',
            isValid
              ? 'bg-[var(--sk-cyan)] text-[#090D16] shadow-sm hover:opacity-90 active:scale-95'
              : 'bg-[var(--sk-surface-3)] text-[var(--sk-text-dim)] cursor-not-allowed'
          )}
        >
          {initial ? 'Simpan Perubahan' : 'Simpan Tagihan'}
        </button>
      </div>
    </form>
  )
}

// ── Bill Card Component ──────────────────────────────────────────────────────

interface BillCardProps {
  bill: Bill
  onPay: (bill: Bill) => void
  onEdit: (bill: Bill) => void
  onToggleActive: (id: string) => void
  onRemove: (id: string) => void
}

const BillCard = memo(function BillCard({
  bill,
  onPay,
  onEdit,
  onToggleActive,
  onRemove,
}: BillCardProps) {
  const { wallets } = useWalletStore()
  const wallet = wallets.find(w => w.id === bill.paymentMethodId)

  // Determine recurrence description
  const recurrenceText = useMemo(() => {
    if (bill.recurrence === 'weekly') {
      return `Mingguan (${WEEKDAY_NAMES[bill.dueDay] ?? 'Senin'})`
    }
    if (bill.recurrence === 'annually') {
      const monthStr = bill.dueMonth ? MONTH_NAMES[bill.dueMonth] : 'Tahun'
      return `Tahunan (${bill.dueDay} ${monthStr})`
    }
    return `Bulanan (tgl ${bill.dueDay})`
  }, [bill.recurrence, bill.dueDay, bill.dueMonth])

  // Determine urgency styling
  const isOverdue = Boolean(bill.isActive && bill.nextDueDate < new Date().toISOString().slice(0, 10))
  const isDueToday = Boolean(bill.isActive && bill.nextDueDate === new Date().toISOString().slice(0, 10))

  return (
    <div
      data-testid={`bill-item-${bill.id}`}
      className={cn(
        'rounded-2xl bg-[var(--sk-surface)] border p-3.5 flex flex-col gap-3 transition-all',
        !bill.isActive
          ? 'opacity-60 border-[var(--sk-border)] bg-[var(--sk-surface-2)]/30'
          : isOverdue
            ? 'border-[var(--sk-red)] shadow-[0_0_12px_rgba(248,113,113,0.12)]'
            : isDueToday
              ? 'border-[var(--sk-amber)] shadow-[0_0_12px_rgba(251,191,36,0.12)]'
              : 'border-[var(--sk-border)] hover:border-[var(--sk-border-2)]'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div
            className={cn(
              'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border',
              !bill.isActive
                ? 'bg-[var(--sk-surface-2)] text-[var(--sk-text-dim)] border-[var(--sk-border)]'
                : isOverdue
                  ? 'bg-[var(--sk-red-dim)] text-[var(--sk-red)] border-[var(--sk-red)]/30'
                  : isDueToday
                    ? 'bg-[var(--sk-amber-dim)] text-[var(--sk-amber)] border-[var(--sk-amber)]/30'
                    : 'bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)] border-[var(--sk-cyan)]/25'
            )}
          >
            <Receipt className="w-4 h-4" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h5 className="text-sm font-bold text-[var(--sk-text)] truncate">{bill.name}</h5>
              {!bill.isActive && (
                <span className="text-[9px] font-medium text-[var(--sk-text-dim)] bg-[var(--sk-surface-2)] px-1.5 py-0.5 rounded shrink-0">
                  Dijeda
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[10px] text-[var(--sk-text-dim)]">
              <span className="inline-flex items-center gap-1">
                <Repeat className="w-3 h-3 text-[var(--sk-text-muted)]" />
                {recurrenceText}
              </span>
              <span>•</span>
              <span className="inline-flex items-center gap-1">
                <Wallet className="w-3 h-3 text-[var(--sk-text-muted)]" />
                {wallet?.label || bill.paymentMethodId}
              </span>
            </div>

            {bill.note && (
              <p className="text-[11px] text-[var(--sk-text-dim)] mt-1 line-clamp-1 italic">
                &ldquo;{bill.note}&rdquo;
              </p>
            )}
          </div>
        </div>

        {/* Amount & Due Date */}
        <div className="text-right shrink-0">
          <p className="text-sm font-bold tabular-nums text-[var(--sk-text)]">
            {formatIDR(bill.amount)}
          </p>
          <div
            className={cn(
              'text-[10px] font-semibold mt-0.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full',
              !bill.isActive
                ? 'text-[var(--sk-text-dim)] bg-[var(--sk-surface-2)]'
                : isOverdue
                  ? 'text-[var(--sk-red)] bg-[var(--sk-red-dim)]'
                  : isDueToday
                    ? 'text-[var(--sk-amber)] bg-[var(--sk-amber-dim)]'
                    : 'text-[var(--sk-cyan)] bg-[var(--sk-cyan-dim)]'
            )}
          >
            {isOverdue && <AlertTriangle className="w-3 h-3" />}
            {isDueToday && <Clock className="w-3 h-3" />}
            <span>{bill.isActive ? formatBillDueDate(bill.nextDueDate) : 'Tidak aktif'}</span>
          </div>
        </div>
      </div>

      {/* Card Actions */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--sk-border)]/60 text-xs">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onEdit(bill)}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-[var(--sk-text-muted)] hover:bg-[var(--sk-surface-2)] flex items-center gap-1 transition-colors"
            aria-label="Edit tagihan"
          >
            <Pencil className="w-3 h-3" />
            Edit
          </button>
          <button
            type="button"
            onClick={() => onToggleActive(bill.id)}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-[var(--sk-text-muted)] hover:bg-[var(--sk-surface-2)] transition-colors"
          >
            {bill.isActive ? 'Jeda' : 'Aktifkan'}
          </button>
          <button
            type="button"
            onClick={() => onRemove(bill.id)}
            className="p-1.5 rounded-lg text-[var(--sk-text-dim)] hover:text-[var(--sk-red)] hover:bg-[var(--sk-red-dim)] transition-colors"
            aria-label="Hapus tagihan"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Primary Action: Tandai sudah dibayar */}
        {bill.isActive && (
          <button
            type="button"
            onClick={() => onPay(bill)}
            data-testid={`btn-mark-paid-${bill.id}`}
            className="px-3 py-1.5 rounded-xl bg-[var(--sk-green-dim)] text-[var(--sk-green)] border border-[var(--sk-green)]/25 text-xs font-bold hover:bg-[var(--sk-green)] hover:text-[#090D16] transition-all flex items-center gap-1.5 shadow-xs"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Tandai Bayar
          </button>
        )}
      </div>
    </div>
  )
})

// ── Public Bill Manager Component (Phase P5) ─────────────────────────────────

export function BillManager() {
  const { bills, addBill, updateBill, removeBill, toggleBillActive, markBillPaid } = useBillStore()
  const { showToast } = useFeedbackStore()

  const [isAdding, setIsAdding] = useState(false)
  const [editingBill, setEditingBill] = useState<Bill | null>(null)
  const [payingBill, setPayingBill] = useState<Bill | null>(null)
  const [showInactive, setShowInactive] = useState(false)

  // Group bills by urgency according to Requirement 5.3 & Property 14
  const grouped = useMemo(() => groupBillsByUrgency(bills, new Date()), [bills])
  const activeCount = useMemo(() => bills.filter(b => b.isActive).length, [bills])
  const totalMonthlyObligation = useMemo(() => {
    return bills.filter(b => b.isActive).reduce((sum, b) => {
      if (b.recurrence === 'weekly') return sum + b.amount * 4
      if (b.recurrence === 'annually') return sum + Math.round(b.amount / 12)
      return sum + b.amount
    }, 0)
  }, [bills])

  const nearestBill = useMemo(() => getNearestBill(bills, new Date()), [bills])

  const handleSaveBill = useCallback(
    (data: CreateBillInput & { id?: string }) => {
      if (data.id) {
        updateBill(data.id, data)
      } else {
        addBill({ ...data, isActive: data.isActive ?? true })
      }
      setIsAdding(false)
      setEditingBill(null)
    },
    [addBill, updateBill]
  )

  const handleConfirmPayment = useCallback(
    (billId: string, paidAmount: number, walletId: string, note?: string) => {
      const tx = markBillPaid(billId, paidAmount, walletId, note)
      if (tx) {
        setPayingBill(null)
      }
    },
    [markBillPaid]
  )

  return (
    <section data-testid="bill-manager" className="flex flex-col gap-4">
      {/* Header Info */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-[var(--sk-amber-dim)] flex items-center justify-center">
          <CalendarDays className="w-4 h-4 text-[var(--sk-amber)]" />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-[var(--sk-text)]">Tagihan & Langganan</h4>
          <p className="text-[10px] text-[var(--sk-text-dim)]">
            Pusat tagihan rutin, pengingat jatuh tempo & konfirmasi bayar
          </p>
        </div>
        <span className="ml-auto text-xs font-medium text-[var(--sk-amber)] bg-[var(--sk-amber-dim)] px-2 py-0.5 rounded-full">
          {activeCount} aktif
        </span>
      </div>

      {/* Monthly Summary & Nearest Bill Banner */}
      {bills.length > 0 && (
        <div className="rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <p className="text-xs text-[var(--sk-text-dim)] mb-1">Total estimasi bulanan</p>
            <p className="text-xl font-bold tabular-nums text-[var(--sk-text)]">
              {formatIDR(totalMonthlyObligation)}
            </p>
          </div>

          {nearestBill && (
            <div className="w-full sm:w-auto rounded-xl bg-[var(--sk-surface-2)]/80 border border-[var(--sk-border)] px-3 py-2 text-left flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[var(--sk-cyan-dim)] flex items-center justify-center shrink-0">
                <Clock className="w-3.5 h-3.5 text-[var(--sk-cyan)]" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-[var(--sk-text-dim)]">Tagihan terdekat:</p>
                <p className="text-xs font-semibold text-[var(--sk-text)] truncate">
                  {nearestBill.name} • <span className="text-[var(--sk-cyan)]">{formatBillDueDate(nearestBill.nextDueDate)}</span>
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Form */}
      {isAdding || editingBill ? (
        <BillForm
          initial={editingBill}
          onSave={handleSaveBill}
          onCancel={() => {
            setIsAdding(false)
            setEditingBill(null)
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          data-testid="btn-add-bill"
          className="w-full py-2.5 rounded-xl border border-dashed border-[var(--sk-border-2)] bg-[var(--sk-surface)] text-xs font-semibold text-[var(--sk-amber)] flex items-center justify-center gap-1.5 hover:bg-[var(--sk-surface-2)] transition-colors"
        >
          <Plus className="w-4 h-4" />
          Tambah Tagihan Baru
        </button>
      )}

      {/* Empty State */}
      {bills.length === 0 && !isAdding && (
        <div className="rounded-2xl border border-dashed border-[var(--sk-border-2)] bg-[var(--sk-surface-2)]/30 p-6 text-center flex flex-col items-center justify-center gap-2">
          <div className="w-10 h-10 rounded-2xl bg-[var(--sk-surface-2)] flex items-center justify-center text-[var(--sk-text-dim)]">
            <Receipt className="w-5 h-5" />
          </div>
          <p className="text-xs font-semibold text-[var(--sk-text)]">Belum ada tagihan terdaftar</p>
          <p className="text-[11px] text-[var(--sk-text-dim)] max-w-xs leading-relaxed">
            Catat tagihan listrik, langganan internet, kost, atau streaming agar tidak terkena denda keterlambatan.
          </p>
        </div>
      )}

      {/* Grouped Bill List (Requirement 5.3 & Property 14) */}
      <div className="flex flex-col gap-4">
        {/* 1. Overdue */}
        {grouped.overdue.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--sk-red)]" />
              <h5 className="text-xs font-bold text-[var(--sk-red)] uppercase tracking-wider">
                Jatuh Tempo Terlewat ({grouped.overdue.length})
              </h5>
            </div>
            <div className="flex flex-col gap-2.5">
              {grouped.overdue.map(bill => (
                <BillCard
                  key={bill.id}
                  bill={bill}
                  onPay={setPayingBill}
                  onEdit={b => {
                    setEditingBill(b)
                    setIsAdding(false)
                  }}
                  onToggleActive={toggleBillActive}
                  onRemove={removeBill}
                />
              ))}
            </div>
          </div>
        )}

        {/* 2. Due Today */}
        {grouped.dueToday.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--sk-amber)] animate-pulse" />
              <h5 className="text-xs font-bold text-[var(--sk-amber)] uppercase tracking-wider">
                Jatuh Tempo Hari Ini ({grouped.dueToday.length})
              </h5>
            </div>
            <div className="flex flex-col gap-2.5">
              {grouped.dueToday.map(bill => (
                <BillCard
                  key={bill.id}
                  bill={bill}
                  onPay={setPayingBill}
                  onEdit={b => {
                    setEditingBill(b)
                    setIsAdding(false)
                  }}
                  onToggleActive={toggleBillActive}
                  onRemove={removeBill}
                />
              ))}
            </div>
          </div>
        )}

        {/* 3. Due Soon (1 - 5 days) */}
        {grouped.dueSoon.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--sk-cyan)]" />
              <h5 className="text-xs font-bold text-[var(--sk-cyan)] uppercase tracking-wider">
                Segera Jatuh Tempo (1-5 Hari) ({grouped.dueSoon.length})
              </h5>
            </div>
            <div className="flex flex-col gap-2.5">
              {grouped.dueSoon.map(bill => (
                <BillCard
                  key={bill.id}
                  bill={bill}
                  onPay={setPayingBill}
                  onEdit={b => {
                    setEditingBill(b)
                    setIsAdding(false)
                  }}
                  onToggleActive={toggleBillActive}
                  onRemove={removeBill}
                />
              ))}
            </div>
          </div>
        )}

        {/* 4. Due Later in Month */}
        {grouped.dueLater.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--sk-text-dim)]" />
              <h5 className="text-xs font-bold text-[var(--sk-text-muted)] uppercase tracking-wider">
                Jatuh Tempo Bulan Ini ({grouped.dueLater.length})
              </h5>
            </div>
            <div className="flex flex-col gap-2.5">
              {grouped.dueLater.map(bill => (
                <BillCard
                  key={bill.id}
                  bill={bill}
                  onPay={setPayingBill}
                  onEdit={b => {
                    setEditingBill(b)
                    setIsAdding(false)
                  }}
                  onToggleActive={toggleBillActive}
                  onRemove={removeBill}
                />
              ))}
            </div>
          </div>
        )}

        {/* 5. Future (Subsequent Months) */}
        {grouped.future.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--sk-border-2)]" />
              <h5 className="text-xs font-semibold text-[var(--sk-text-dim)] uppercase tracking-wider">
                Jadwal Mendatang ({grouped.future.length})
              </h5>
            </div>
            <div className="flex flex-col gap-2.5">
              {grouped.future.map(bill => (
                <BillCard
                  key={bill.id}
                  bill={bill}
                  onPay={setPayingBill}
                  onEdit={b => {
                    setEditingBill(b)
                    setIsAdding(false)
                  }}
                  onToggleActive={toggleBillActive}
                  onRemove={removeBill}
                />
              ))}
            </div>
          </div>
        )}

        {/* 6. Inactive Bills */}
        {grouped.inactive.length > 0 && (
          <div className="mt-2 pt-2 border-t border-[var(--sk-border)]/60">
            <button
              type="button"
              onClick={() => setShowInactive(v => !v)}
              className="flex items-center justify-between w-full py-2 text-xs font-semibold text-[var(--sk-text-dim)] hover:text-[var(--sk-text-muted)]"
            >
              <span>Tagihan Dijeda / Nonaktif ({grouped.inactive.length})</span>
              {showInactive ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showInactive && (
              <div className="flex flex-col gap-2.5 mt-2">
                {grouped.inactive.map(bill => (
                  <BillCard
                    key={bill.id}
                    bill={bill}
                    onPay={setPayingBill}
                    onEdit={b => {
                      setEditingBill(b)
                      setIsAdding(false)
                    }}
                    onToggleActive={toggleBillActive}
                    onRemove={removeBill}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirmation Modal for "Tandai sudah dibayar" */}
      <ConfirmBillPaymentModal
        bill={payingBill}
        onClose={() => setPayingBill(null)}
        onConfirm={handleConfirmPayment}
      />
    </section>
  )
}

export default BillManager
