'use client'

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CreditCard,
  DollarSign,
  History,
  Info,
  Landmark,
  Pencil,
  Plus,
  Receipt,
  Scale,
  ShieldCheck,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react'
import { useNetWorthStore, useWalletStore, useFeedbackStore } from '@/lib/store'
import {
  type DebtItem,
  type DebtType,
  type DebtPayment,
  type CreateDebtInput,
  type NetWorthSummary,
  calculateTotalAssets,
  calculateTotalLiabilities,
  calculateTotalReceivables,
  calculateNetWorth,
} from '@/lib/net-worth'
import { formatIDR, formatTransactionDateTime, toCalendarDateString } from '@/lib/parser'
import { parseAmountInput } from '@/lib/amount'
import { RupiahInput } from '@/components/rupiah-input'
import { pushBackLayer, removeBackLayer } from '@/lib/back-stack'
import { cn } from '@/lib/utils'

// ── Debt Registration / Edit Modal ────────────────────────────────────────────

interface DebtFormModalProps {
  open: boolean
  onClose: () => void
  initialDebt?: DebtItem | null
}

export function DebtFormModal({ open, onClose, initialDebt }: DebtFormModalProps) {
  const { addDebt, updateDebt } = useNetWorthStore()
  const { showToast } = useFeedbackStore()

  const isEditing = Boolean(initialDebt)

  const [type, setType] = useState<DebtType>('payable')
  const [name, setName] = useState('')
  const [principalRaw, setPrincipalRaw] = useState('')
  const [paidRaw, setPaidRaw] = useState('')
  const [lenderOrBorrower, setLenderOrBorrower] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [note, setNote] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (initialDebt) {
      setType(initialDebt.type)
      setName(initialDebt.name)
      setPrincipalRaw(String(initialDebt.principalAmount))
      setPaidRaw(initialDebt.paidAmount > 0 ? String(initialDebt.paidAmount) : '')
      setLenderOrBorrower(initialDebt.lenderOrBorrower)
      setDueDate(initialDebt.dueDate || '')
      setNote(initialDebt.note || '')
    } else {
      setType('payable')
      setName('')
      setPrincipalRaw('')
      setPaidRaw('')
      setLenderOrBorrower('')
      setDueDate('')
      setNote('')
    }
    setErrorMessage(null)
  }, [open, initialDebt])

  // Back stack integration
  useEffect(() => {
    if (!open) return
    const layerId = 'debt-form-modal'
    pushBackLayer({ id: layerId, type: 'modal', onClose })
    return () => removeBackLayer(layerId)
  }, [open, onClose])

  // Escape key
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  const parsedPrincipal = parseAmountInput(principalRaw)
  const parsedPaid = paidRaw.trim() ? parseAmountInput(paidRaw) : 0

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    const trimmedName = name.trim()
    if (!trimmedName) {
      setErrorMessage('Nama utang/piutang wajib diisi.')
      return
    }

    if (!parsedPrincipal || parsedPrincipal <= 0) {
      setErrorMessage('Nominal pokok harus lebih besar dari 0.')
      return
    }

    if (parsedPaid > parsedPrincipal) {
      setErrorMessage('Jumlah yang sudah dibayar tidak boleh melebihi nominal pokok.')
      return
    }

    const payload: CreateDebtInput = {
      name: trimmedName,
      principalAmount: parsedPrincipal,
      paidAmount: parsedPaid,
      dueDate: dueDate.trim() || undefined,
      lenderOrBorrower: lenderOrBorrower.trim() || (type === 'receivable' ? 'Peminjam' : 'Pemberi Pinjaman'),
      type,
      note: note.trim() || undefined,
    }

    if (isEditing && initialDebt) {
      updateDebt(initialDebt.id, {
        name: trimmedName,
        principalAmount: parsedPrincipal,
        paidAmount: parsedPaid,
        dueDate: dueDate.trim() || undefined,
        lenderOrBorrower: lenderOrBorrower.trim() || initialDebt.lenderOrBorrower,
        type,
        note: note.trim() || undefined,
      })
    } else {
      const created = addDebt(payload)
      if (!created) return
    }

    onClose()
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="debt-form-title"
      data-testid="debt-form-modal"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 bg-[rgba(9,13,22,0.85)] backdrop-blur-xs animate-fade-in"
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="relative w-full max-w-md rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border-2)] shadow-2xl overflow-hidden flex flex-col max-h-[90dvh] animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--sk-border)] bg-[var(--sk-surface-2)]/50">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={cn(
              'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border',
              type === 'payable'
                ? 'bg-[var(--sk-amber-dim)] border-[var(--sk-amber)]/30 text-[var(--sk-amber)]'
                : 'bg-[var(--sk-green-dim)] border-[var(--sk-green)]/30 text-[var(--sk-green)]'
            )}>
              {type === 'payable' ? <TrendingDown className="w-5 h-5" /> : <TrendingUp className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h3 id="debt-form-title" className="text-sm font-bold text-[var(--sk-text)] truncate">
                {isEditing ? 'Edit Catatan Utang / Piutang' : 'Catat Utang / Piutang Baru'}
              </h3>
              <p className="text-[11px] text-[var(--sk-text-dim)] truncate">
                Kelola kewajiban utang atau tagihan piutang
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="btn-cancel-debt-x"
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--sk-text-dim)] hover:text-[var(--sk-text)] hover:bg-[var(--sk-surface-2)] transition-colors"
            aria-label="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4 overflow-y-auto">
          {errorMessage && (
            <div
              data-testid="debt-form-error"
              className="rounded-xl bg-[var(--sk-red-dim)] border border-[var(--sk-red)]/30 p-3 flex items-center gap-2.5 text-xs text-[var(--sk-red)]"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Type Selector (Utang vs Piutang) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[var(--sk-text)]">Jenis Catatan</label>
            <div className="grid grid-cols-2 gap-2" data-testid="debt-type-select">
              <button
                type="button"
                data-testid="debt-type-payable"
                onClick={() => setType('payable')}
                className={cn(
                  'px-3 py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all',
                  type === 'payable'
                    ? 'bg-[var(--sk-amber-dim)] border-[var(--sk-amber)] text-[var(--sk-amber)] shadow-[0_0_10px_var(--sk-amber-glow)]'
                    : 'bg-[var(--sk-surface-2)] border-[var(--sk-border)] text-[var(--sk-text-muted)] hover:text-[var(--sk-text)]'
                )}
              >
                <TrendingDown className="w-3.5 h-3.5" />
                Utang (Kewajiban Saya)
              </button>
              <button
                type="button"
                data-testid="debt-type-receivable"
                onClick={() => setType('receivable')}
                className={cn(
                  'px-3 py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all',
                  type === 'receivable'
                    ? 'bg-[var(--sk-green-dim)] border-[var(--sk-green)] text-[var(--sk-green)] shadow-[0_0_10px_var(--sk-green-glow)]'
                    : 'bg-[var(--sk-surface-2)] border-[var(--sk-border)] text-[var(--sk-text-muted)] hover:text-[var(--sk-text)]'
                )}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                Piutang (Orang Lain Berutang)
              </button>
            </div>
          </div>

          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="debt-name-input" className="text-xs font-semibold text-[var(--sk-text)]">
              Nama {type === 'payable' ? 'Utang' : 'Piutang'} <span className="text-[var(--sk-red)]">*</span>
            </label>
            <input
              id="debt-name-input"
              data-testid="debt-name-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={type === 'payable' ? 'cth. Cicilan Laptop, Pinjaman Bank' : 'cth. Pinjaman Teman, Talangan Belanja'}
              required
              className="bg-[var(--sk-surface-2)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--sk-text)] placeholder:text-[var(--sk-text-dim)] outline-none border border-[var(--sk-border)] focus:border-[var(--sk-cyan)] transition-colors"
            />
          </div>

          {/* Principal & Paid Nominals */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[var(--sk-text)]">
                Nominal Pokok <span className="text-[var(--sk-red)]">*</span>
              </label>
              <RupiahInput
                data-testid="debt-principal-input"
                value={principalRaw}
                onChange={(_num, str) => setPrincipalRaw(str)}
                placeholder="cth. 5.000.000"
                containerClassName="rounded-xl text-xs bg-[var(--sk-surface-2)] border border-[var(--sk-border)]"
                className="text-xs py-2 pr-3"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[var(--sk-text)]">
                Sudah Dibayar / DP (Opsional)
              </label>
              <RupiahInput
                data-testid="debt-paid-input"
                value={paidRaw}
                onChange={(_num, str) => setPaidRaw(str)}
                placeholder="0"
                containerClassName="rounded-xl text-xs bg-[var(--sk-surface-2)] border border-[var(--sk-border)]"
                className="text-xs py-2 pr-3"
              />
            </div>
          </div>

          {/* Remaining Preview */}
          {parsedPrincipal > 0 && (
            <div className="rounded-xl bg-[var(--sk-surface-2)]/50 border border-[var(--sk-border)] p-3 flex items-center justify-between text-xs">
              <span className="text-[var(--sk-text-dim)]">Sisa Kewajiban:</span>
              <span className={cn(
                'font-bold tabular-nums',
                type === 'payable' ? 'text-[var(--sk-amber)]' : 'text-[var(--sk-green)]'
              )}>
                {formatIDR(Math.max(0, parsedPrincipal - parsedPaid))}
              </span>
            </div>
          )}

          {/* Counterparty (Lender / Borrower) */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="debt-counterparty-input" className="text-xs font-semibold text-[var(--sk-text)]">
              {type === 'payable' ? 'Pemberi Pinjaman / Institusi' : 'Peminjam / Pihak Berutang'}
            </label>
            <input
              id="debt-counterparty-input"
              data-testid="debt-counterparty-input"
              value={lenderOrBorrower}
              onChange={e => setLenderOrBorrower(e.target.value)}
              placeholder={type === 'payable' ? 'cth. Bank BCA, Toko Elektronik, Rian' : 'cth. Dimas, Rekan Kantor'}
              className="bg-[var(--sk-surface-2)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--sk-text)] placeholder:text-[var(--sk-text-dim)] outline-none border border-[var(--sk-border)] focus:border-[var(--sk-cyan)] transition-colors"
            />
          </div>

          {/* Due Date */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="debt-due-date-input" className="text-xs font-semibold text-[var(--sk-text)]">
              Tanggal Jatuh Tempo (Opsional)
            </label>
            <input
              id="debt-due-date-input"
              data-testid="debt-due-date-input"
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="bg-[var(--sk-surface-2)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--sk-text)] outline-none border border-[var(--sk-border)] focus:border-[var(--sk-cyan)] transition-colors"
            />
          </div>

          {/* Note */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="debt-note-input" className="text-xs font-semibold text-[var(--sk-text)]">
              Catatan (Opsional)
            </label>
            <input
              id="debt-note-input"
              data-testid="debt-note-input"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="cth. Angsuran 12 bulan, bunga 0%"
              className="bg-[var(--sk-surface-2)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--sk-text)] placeholder:text-[var(--sk-text-dim)] outline-none border border-[var(--sk-border)] focus:border-[var(--sk-cyan)] transition-colors"
            />
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              type="button"
              data-testid="btn-cancel-debt"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-xs font-semibold text-[var(--sk-text-muted)] hover:text-[var(--sk-text)] transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              data-testid="btn-submit-debt"
              disabled={!name.trim() || !parsedPrincipal || parsedPrincipal <= 0}
              className="px-4 py-2.5 rounded-xl bg-[var(--sk-cyan)] text-[#090D16] text-xs font-bold hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_0_10px_var(--sk-cyan-glow)] flex items-center justify-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{isEditing ? 'Simpan Perubahan' : 'Catat Sekarang'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}

// ── Debt Repayment Action Modal ────────────────────────────────────────────────

interface DebtRepaymentModalProps {
  debt: DebtItem | null
  open: boolean
  onClose: () => void
}

export function DebtRepaymentModal({ debt, open, onClose }: DebtRepaymentModalProps) {
  const { payDebt } = useNetWorthStore()
  const { wallets } = useWalletStore()
  const { showToast } = useFeedbackStore()

  const [amountRaw, setAmountRaw] = useState('')
  const [selectedWalletId, setSelectedWalletId] = useState('')
  const [note, setNote] = useState('')
  const [createTx, setCreateTx] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !debt) return
    setAmountRaw(String(debt.remainingAmount))
    setSelectedWalletId(wallets[0]?.id || 'tunai')
    setNote(debt.type === 'receivable' ? `Pelunasan piutang: ${debt.name}` : `Bayar utang: ${debt.name}`)
    setCreateTx(true)
    setErrorMessage(null)
  }, [open, debt, wallets])

  // Back stack integration
  useEffect(() => {
    if (!open) return
    const layerId = 'debt-repayment-modal'
    pushBackLayer({ id: layerId, type: 'modal', onClose })
    return () => removeBackLayer(layerId)
  }, [open, onClose])

  // Escape key
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open || !debt || typeof document === 'undefined') return null

  const isReceivable = debt.type === 'receivable'
  const parsedAmount = parseAmountInput(amountRaw)
  const isValidAmount = Number.isFinite(parsedAmount) && parsedAmount > 0 && parsedAmount <= debt.remainingAmount

  const handleQuickFillFull = () => {
    setAmountRaw(String(debt.remainingAmount))
  }

  const handleQuickFillHalf = () => {
    const half = Math.round(debt.remainingAmount / 2)
    setAmountRaw(String(half))
  }

  const handleConfirmRepayment = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (!isValidAmount) {
      if (parsedAmount > debt.remainingAmount) {
        setErrorMessage(`Nominal pembayaran melebihi sisa kewajiban (${formatIDR(debt.remainingAmount)}).`)
      } else {
        setErrorMessage('Masukkan nominal pembayaran yang valid.')
      }
      return
    }

    if (!selectedWalletId) {
      setErrorMessage('Pilih saku / metode pembayaran.')
      return
    }

    const result = payDebt({
      debtId: debt.id,
      amount: parsedAmount,
      paymentMethodId: selectedWalletId,
      note: note.trim() || undefined,
      createExpenseTransaction: createTx,
    })

    if (result) {
      onClose()
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="repayment-modal-title"
      data-testid="debt-repayment-modal"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 bg-[rgba(9,13,22,0.85)] backdrop-blur-xs animate-fade-in"
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="relative w-full max-w-md rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border-2)] shadow-2xl overflow-hidden flex flex-col max-h-[90dvh] animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--sk-border)] bg-[var(--sk-surface-2)]/50">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={cn(
              'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border',
              isReceivable
                ? 'bg-[var(--sk-green-dim)] border-[var(--sk-green)]/30 text-[var(--sk-green)]'
                : 'bg-[var(--sk-cyan-dim)] border-[var(--sk-cyan)]/30 text-[var(--sk-cyan)]'
            )}>
              {isReceivable ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h3 id="repayment-modal-title" className="text-sm font-bold text-[var(--sk-text)] truncate">
                {isReceivable ? 'Terima Pelunasan Piutang' : 'Bayar Cicilan / Pelunasan Utang'}
              </h3>
              <p className="text-[11px] text-[var(--sk-text-dim)] truncate">
                {debt.name} • {debt.lenderOrBorrower}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="btn-cancel-repayment-x"
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--sk-text-dim)] hover:text-[var(--sk-text)] hover:bg-[var(--sk-surface-2)] transition-colors"
            aria-label="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleConfirmRepayment} className="p-5 flex flex-col gap-4 overflow-y-auto">
          {errorMessage && (
            <div
              data-testid="repayment-error-banner"
              className="rounded-xl bg-[var(--sk-red-dim)] border border-[var(--sk-red)]/30 p-3 flex items-center gap-2.5 text-xs text-[var(--sk-red)]"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Debt Snapshot */}
          <div className="rounded-xl bg-[var(--sk-surface-2)]/50 border border-[var(--sk-border)] p-3.5 flex items-center justify-between gap-3">
            <div>
              <span className="text-[10px] uppercase font-bold text-[var(--sk-text-dim)]">Sisa Kewajiban</span>
              <p className="text-lg font-bold tabular-nums text-[var(--sk-text)]" data-testid="repayment-remaining-display">
                {formatIDR(debt.remainingAmount)}
              </p>
              <p className="text-[11px] text-[var(--sk-text-muted)] mt-0.5">
                Total pokok {formatIDR(debt.principalAmount)} ({Math.round((debt.paidAmount / debt.principalAmount) * 100)}% lunas)
              </p>
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <button
                type="button"
                data-testid="btn-quick-fill-full"
                onClick={handleQuickFillFull}
                className="px-2.5 py-1 rounded-lg bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)] border border-[var(--sk-cyan)]/30 text-[10px] font-semibold hover:bg-[var(--sk-cyan)] hover:text-[#090D16] transition-all"
              >
                Bayar Penuh
              </button>
              {debt.remainingAmount > 10000 && (
                <button
                  type="button"
                  data-testid="btn-quick-fill-half"
                  onClick={handleQuickFillHalf}
                  className="px-2.5 py-1 rounded-lg bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] border border-[var(--sk-border)] text-[10px] font-semibold hover:text-[var(--sk-text)] transition-colors"
                >
                  Bayar 50%
                </button>
              )}
            </div>
          </div>

          {/* Nominal Payment Input */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="repayment-amount-input" className="text-xs font-semibold text-[var(--sk-text)]">
              Nominal yang {isReceivable ? 'Diterima' : 'Dibayarkan'} <span className="text-[var(--sk-red)]">*</span>
            </label>
            <RupiahInput
              id="repayment-amount-input"
              data-testid="repayment-amount-input"
              value={amountRaw}
              onChange={(_num, str) => setAmountRaw(str)}
              placeholder="0"
              containerClassName="rounded-xl text-sm bg-[var(--sk-surface-2)] border border-[var(--sk-border)]"
              className="py-2.5 pr-3 text-sm font-bold"
            />
          </div>

          {/* Payment Wallet / Account */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="repayment-wallet-select" className="text-xs font-semibold text-[var(--sk-text)]">
              {isReceivable ? 'Masuk ke Saku' : 'Dibayar dari Saku'} <span className="text-[var(--sk-red)]">*</span>
            </label>
            <select
              id="repayment-wallet-select"
              data-testid="repayment-wallet-select"
              value={selectedWalletId}
              onChange={e => setSelectedWalletId(e.target.value)}
              className="bg-[var(--sk-surface-2)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--sk-text)] outline-none border border-[var(--sk-border)] focus:border-[var(--sk-cyan)] transition-colors"
            >
              {wallets.map(wallet => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.label} ({formatIDR(wallet.balance)})
                </option>
              ))}
            </select>
          </div>

          {/* Transaction Note */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="repayment-note-input" className="text-xs font-semibold text-[var(--sk-text)]">
              Catatan Pembayaran (Opsional)
            </label>
            <input
              id="repayment-note-input"
              data-testid="repayment-note-input"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="cth. Pembayaran transfer BCA, angsuran ke-2"
              className="bg-[var(--sk-surface-2)] rounded-xl px-3.5 py-2 text-xs text-[var(--sk-text)] placeholder:text-[var(--sk-text-dim)] outline-none border border-[var(--sk-border)] focus:border-[var(--sk-cyan)] transition-colors"
            />
          </div>

          {/* Synchronize Transaction Checkbox */}
          <label className="flex items-center gap-2.5 p-3 rounded-xl bg-[var(--sk-surface-2)]/40 border border-[var(--sk-border)] cursor-pointer select-none">
            <input
              type="checkbox"
              data-testid="repayment-sync-tx-checkbox"
              checked={createTx}
              onChange={e => setCreateTx(e.target.checked)}
              className="w-4 h-4 rounded border-[var(--sk-border)] text-[var(--sk-cyan)] focus:ring-[var(--sk-cyan)]"
            />
            <div className="text-xs">
              <p className="font-semibold text-[var(--sk-text)]">
                Catat otomatis di transaksi kas
              </p>
              <p className="text-[11px] text-[var(--sk-text-dim)]">
                {isReceivable
                  ? 'Menambahkan transaksi pemasukan dan menambah saldo saku penerima'
                  : 'Menambahkan transaksi pengeluaran dan mengurangi saldo saku pembayar'}
              </p>
            </div>
          </label>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              type="button"
              data-testid="btn-cancel-repayment"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-xs font-semibold text-[var(--sk-text-muted)] hover:text-[var(--sk-text)] transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              data-testid="btn-submit-repayment"
              disabled={!isValidAmount}
              className="px-4 py-2.5 rounded-xl bg-[var(--sk-cyan)] text-[#090D16] text-xs font-bold hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_0_10px_var(--sk-cyan-glow)] flex items-center justify-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Konfirmasi Pembayaran</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}

// ── Net Worth Summary Card Component ──────────────────────────────────────────

interface NetWorthSummaryViewProps {
  summary: NetWorthSummary
}

export function NetWorthSummaryView({ summary }: NetWorthSummaryViewProps) {
  const isPositive = summary.netWorth >= 0

  return (
    <div
      data-testid="net-worth-summary-card"
      className="rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-4 flex flex-col gap-3.5 shadow-sm"
    >
      {/* Primary Net Worth Metric */}
      <div className="flex items-center justify-between gap-3 border-b border-[var(--sk-border)]/60 pb-3.5">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium text-[var(--sk-text-dim)]">Kekayaan Bersih (Net Worth)</p>
            <span
              data-testid="net-worth-status-badge"
              className={cn(
                'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                isPositive
                  ? 'text-[var(--sk-green)] bg-[var(--sk-green-dim)] border-[var(--sk-green)]/30'
                  : 'text-[var(--sk-red)] bg-[var(--sk-red-dim)] border-[var(--sk-red)]/30'
              )}
            >
              {isPositive ? 'Positif' : 'Defisit'}
            </span>
          </div>
          <p
            data-testid="net-worth-total-net-worth"
            className={cn(
              'text-2xl font-extrabold tabular-nums tracking-tight mt-1',
              isPositive ? 'text-[var(--sk-cyan)]' : 'text-[var(--sk-red)]'
            )}
          >
            {formatIDR(summary.netWorth)}
          </p>
        </div>
        <div className={cn(
          'w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border',
          isPositive
            ? 'bg-[var(--sk-cyan-dim)] border-[var(--sk-cyan)]/30 text-[var(--sk-cyan)] shadow-[0_0_12px_var(--sk-cyan-glow)]'
            : 'bg-[var(--sk-red-dim)] border-[var(--sk-red)]/30 text-[var(--sk-red)]'
        )}>
          <Scale className="w-5 h-5" />
        </div>
      </div>

      {/* Assets vs Liabilities Breakdown */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-[var(--sk-surface-2)]/50 border border-[var(--sk-border)] p-3">
          <div className="flex items-center gap-1.5 text-[var(--sk-green)] mb-1">
            <TrendingUp className="w-3.5 h-3.5 shrink-0" />
            <span className="text-[11px] font-semibold text-[var(--sk-text-muted)]">Total Aset</span>
          </div>
          <p
            data-testid="net-worth-total-assets"
            className="text-base font-bold tabular-nums text-[var(--sk-text)]"
          >
            {formatIDR(summary.totalAssets)}
          </p>
          <p className="text-[10px] text-[var(--sk-text-dim)] mt-0.5">Seluruh saldo saku positif</p>
        </div>

        <div className="rounded-xl bg-[var(--sk-surface-2)]/50 border border-[var(--sk-border)] p-3">
          <div className="flex items-center gap-1.5 text-[var(--sk-amber)] mb-1">
            <TrendingDown className="w-3.5 h-3.5 shrink-0" />
            <span className="text-[11px] font-semibold text-[var(--sk-text-muted)]">Total Utang</span>
          </div>
          <p
            data-testid="net-worth-total-liabilities"
            className="text-base font-bold tabular-nums text-[var(--sk-text)]"
          >
            {formatIDR(summary.totalLiabilities)}
          </p>
          <p className="text-[10px] text-[var(--sk-text-dim)] mt-0.5">Sisa seluruh utang aktif</p>
        </div>
      </div>

      {/* Quick Footnote Badges */}
      <div className="flex items-center justify-between gap-2 pt-1 text-[11px] flex-wrap">
        <div className="flex items-center gap-2">
          <span
            data-testid="net-worth-active-debts-badge"
            className="px-2 py-0.5 rounded-md bg-[var(--sk-surface-2)] text-[var(--sk-text-dim)] border border-[var(--sk-border)] text-[10px]"
          >
            {summary.activeDebtsCount} utang aktif
          </span>
          {summary.settledDebtsCount > 0 && (
            <span
              data-testid="net-worth-settled-debts-badge"
              className="px-2 py-0.5 rounded-md bg-[var(--sk-green-dim)] text-[var(--sk-green)] border border-[var(--sk-green)]/25 text-[10px]"
            >
              {summary.settledDebtsCount} lunas
            </span>
          )}
        </div>
        {summary.totalReceivables > 0 && (
          <span
            data-testid="net-worth-total-receivables"
            className="text-[11px] font-medium text-[var(--sk-cyan)] bg-[var(--sk-cyan-dim)] px-2 py-0.5 rounded-md border border-[var(--sk-cyan)]/25"
          >
            Piutang: {formatIDR(summary.totalReceivables)}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Debt Management List & Panel ──────────────────────────────────────────────

export function NetWorthPanel() {
  const { debts, netWorthSummary, removeDebt } = useNetWorthStore()
  const { wallets } = useWalletStore()

  // Modals state
  const [formModalOpen, setFormModalOpen] = useState(false)
  const [editingDebt, setEditingDebt] = useState<DebtItem | null>(null)
  const [repaymentModalOpen, setRepaymentModalOpen] = useState(false)
  const [repaymentDebt, setRepaymentDebt] = useState<DebtItem | null>(null)

  // Expanded history cards
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<Record<string, boolean>>({})

  // Filters
  const [typeFilter, setTypeFilter] = useState<'all' | 'payable' | 'receivable'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'settled'>('all')

  const toggleHistory = (debtId: string) => {
    setExpandedHistoryIds(prev => ({
      ...prev,
      [debtId]: !prev[debtId],
    }))
  }

  const handleOpenCreate = () => {
    setEditingDebt(null)
    setFormModalOpen(true)
  }

  const handleOpenEdit = (debt: DebtItem) => {
    setEditingDebt(debt)
    setFormModalOpen(true)
  }

  const handleOpenRepayment = (debt: DebtItem) => {
    setRepaymentDebt(debt)
    setRepaymentModalOpen(true)
  }

  // Filtered debts
  const filteredDebts = useMemo(() => {
    return debts.filter(debt => {
      if (typeFilter !== 'all' && debt.type !== typeFilter) return false
      if (statusFilter === 'active' && debt.isSettled) return false
      if (statusFilter === 'settled' && !debt.isSettled) return false
      return true
    })
  }, [debts, typeFilter, statusFilter])

  return (
    <div data-testid="net-worth-panel" className="flex flex-col gap-4">
      {/* Summary View */}
      <NetWorthSummaryView summary={netWorthSummary} />

      {/* Debts Header & Actions */}
      <div className="flex items-center justify-between gap-3 mt-1">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[var(--sk-cyan-dim)] flex items-center justify-center text-[var(--sk-cyan)]">
            <Receipt className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-[var(--sk-text)]">Daftar Utang & Piutang</h4>
            <p className="text-[10px] text-[var(--sk-text-dim)]">Catatan kewajiban dan tagihan per pihak</p>
          </div>
        </div>
        <button
          type="button"
          data-testid="btn-add-debt"
          onClick={handleOpenCreate}
          className="px-3 py-1.5 rounded-xl bg-[var(--sk-cyan)] text-[#090D16] text-xs font-bold hover:opacity-90 active:scale-95 transition-all shadow-[0_0_8px_var(--sk-cyan-glow)] flex items-center gap-1.5 shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Tambah</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between gap-2 overflow-x-auto pb-0.5">
        {/* Type Filter */}
        <div className="flex items-center gap-1 bg-[var(--sk-surface-2)]/60 p-1 rounded-xl border border-[var(--sk-border)] text-xs shrink-0">
          <button
            type="button"
            data-testid="debt-filter-all"
            onClick={() => setTypeFilter('all')}
            className={cn(
              'px-2.5 py-1 rounded-lg font-medium transition-colors',
              typeFilter === 'all'
                ? 'bg-[var(--sk-surface)] text-[var(--sk-text)] font-semibold shadow-xs'
                : 'text-[var(--sk-text-dim)] hover:text-[var(--sk-text)]'
            )}
          >
            Semua
          </button>
          <button
            type="button"
            data-testid="debt-filter-payable"
            onClick={() => setTypeFilter('payable')}
            className={cn(
              'px-2.5 py-1 rounded-lg font-medium transition-colors',
              typeFilter === 'payable'
                ? 'bg-[var(--sk-amber-dim)] text-[var(--sk-amber)] font-semibold shadow-xs'
                : 'text-[var(--sk-text-dim)] hover:text-[var(--sk-text)]'
            )}
          >
            Utang Saya
          </button>
          <button
            type="button"
            data-testid="debt-filter-receivable"
            onClick={() => setTypeFilter('receivable')}
            className={cn(
              'px-2.5 py-1 rounded-lg font-medium transition-colors',
              typeFilter === 'receivable'
                ? 'bg-[var(--sk-green-dim)] text-[var(--sk-green)] font-semibold shadow-xs'
                : 'text-[var(--sk-text-dim)] hover:text-[var(--sk-text)]'
            )}
          >
            Piutang
          </button>
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-1 bg-[var(--sk-surface-2)]/60 p-1 rounded-xl border border-[var(--sk-border)] text-xs shrink-0">
          <button
            type="button"
            data-testid="debt-status-filter-all"
            onClick={() => setStatusFilter('all')}
            className={cn(
              'px-2.5 py-1 rounded-lg font-medium transition-colors',
              statusFilter === 'all'
                ? 'bg-[var(--sk-surface)] text-[var(--sk-text)] font-semibold shadow-xs'
                : 'text-[var(--sk-text-dim)] hover:text-[var(--sk-text)]'
            )}
          >
            Semua
          </button>
          <button
            type="button"
            data-testid="debt-status-filter-active"
            onClick={() => setStatusFilter('active')}
            className={cn(
              'px-2.5 py-1 rounded-lg font-medium transition-colors',
              statusFilter === 'active'
                ? 'bg-[var(--sk-surface)] text-[var(--sk-cyan)] font-semibold shadow-xs'
                : 'text-[var(--sk-text-dim)] hover:text-[var(--sk-text)]'
            )}
          >
            Belum Lunas
          </button>
          <button
            type="button"
            data-testid="debt-status-filter-settled"
            onClick={() => setStatusFilter('settled')}
            className={cn(
              'px-2.5 py-1 rounded-lg font-medium transition-colors',
              statusFilter === 'settled'
                ? 'bg-[var(--sk-green-dim)] text-[var(--sk-green)] font-semibold shadow-xs'
                : 'text-[var(--sk-text-dim)] hover:text-[var(--sk-text)]'
            )}
          >
            Lunas
          </button>
        </div>
      </div>

      {/* Debt List Container */}
      <div data-testid="debt-list-container" className="flex flex-col gap-2.5">
        {filteredDebts.length === 0 ? (
          <div
            data-testid="debt-empty-state"
            className="rounded-2xl border border-dashed border-[var(--sk-border-2)] bg-[var(--sk-surface-2)]/30 p-6 flex flex-col items-center justify-center text-center gap-2"
          >
            <div className="w-10 h-10 rounded-full bg-[var(--sk-surface-2)] flex items-center justify-center text-[var(--sk-text-dim)]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <p className="text-xs font-semibold text-[var(--sk-text)]">Tidak Ada Catatan Utang / Piutang</p>
            <p className="text-[11px] text-[var(--sk-text-dim)] max-w-xs">
              {typeFilter !== 'all' || statusFilter !== 'all'
                ? 'Tidak ada data yang sesuai filter saat ini.'
                : 'Kamu belum memiliki catatan utang atau piutang. Catat untuk memantau aset bersih secara komprehensif.'}
            </p>
            <button
              type="button"
              onClick={handleOpenCreate}
              className="mt-2 px-3 py-1.5 rounded-xl bg-[var(--sk-cyan)] text-[#090D16] text-xs font-bold hover:opacity-90 transition-opacity"
            >
              + Catat Utang / Piutang Baru
            </button>
          </div>
        ) : (
          filteredDebts.map(debt => {
            const isReceivable = debt.type === 'receivable'
            const percentPaid = Math.min(100, Math.round((debt.paidAmount / debt.principalAmount) * 100))
            const isExpanded = Boolean(expandedHistoryIds[debt.id])
            const todayStr = toCalendarDateString(new Date())
            const isOverdue = !debt.isSettled && debt.dueDate && debt.dueDate < todayStr

            return (
              <div
                key={debt.id}
                data-testid={`debt-item-${debt.id}`}
                className={cn(
                  'rounded-2xl bg-[var(--sk-surface)] border p-4 flex flex-col gap-3 transition-colors',
                  debt.isSettled
                    ? 'border-[var(--sk-border)] opacity-85'
                    : isOverdue
                      ? 'border-[var(--sk-red)]/50 bg-[var(--sk-red-dim)]/10'
                      : 'border-[var(--sk-border)] hover:border-[var(--sk-border-2)]'
                )}
              >
                {/* Top Row: Type Badge, Name, Status */}
                <div className="flex items-start justify-between gap-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span
                        data-testid={`debt-type-badge-${debt.id}`}
                        className={cn(
                          'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                          isReceivable
                            ? 'text-[var(--sk-green)] bg-[var(--sk-green-dim)] border-[var(--sk-green)]/30'
                            : 'text-[var(--sk-amber)] bg-[var(--sk-amber-dim)] border-[var(--sk-amber)]/30'
                        )}
                      >
                        {isReceivable ? 'Piutang' : 'Utang'}
                      </span>

                      {debt.isSettled ? (
                        <span
                          data-testid={`debt-status-badge-${debt.id}`}
                          className="text-[10px] font-bold text-[var(--sk-green)] bg-[var(--sk-green-dim)] border border-[var(--sk-green)]/30 px-2 py-0.5 rounded-full flex items-center gap-1"
                        >
                          <Check className="w-2.5 h-2.5" />
                          Lunas
                        </span>
                      ) : isOverdue ? (
                        <span
                          data-testid={`debt-overdue-badge-${debt.id}`}
                          className="text-[10px] font-bold text-[var(--sk-red)] bg-[var(--sk-red-dim)] border border-[var(--sk-red)]/30 px-2 py-0.5 rounded-full flex items-center gap-1"
                        >
                          <AlertTriangle className="w-2.5 h-2.5" />
                          Lewat Jatuh Tempo
                        </span>
                      ) : null}
                    </div>

                    <h5
                      data-testid={`debt-name-${debt.id}`}
                      className="text-sm font-bold text-[var(--sk-text)] truncate"
                    >
                      {debt.name}
                    </h5>

                    <p
                      data-testid={`debt-counterparty-${debt.id}`}
                      className="text-[11px] text-[var(--sk-text-dim)] truncate mt-0.5"
                    >
                      {isReceivable ? 'Peminjam: ' : 'Pemberi pinjaman: '}
                      <span className="text-[var(--sk-text-muted)] font-medium">{debt.lenderOrBorrower}</span>
                    </p>
                  </div>

                  {/* Remaining Amount */}
                  <div className="text-right shrink-0">
                    <span className="text-[10px] text-[var(--sk-text-dim)] block">
                      {debt.isSettled ? 'Status' : 'Sisa Tagihan'}
                    </span>
                    <span
                      data-testid={`debt-remaining-${debt.id}`}
                      className={cn(
                        'text-base font-extrabold tabular-nums',
                        debt.isSettled
                          ? 'text-[var(--sk-green)]'
                          : isReceivable
                            ? 'text-[var(--sk-green)]'
                            : 'text-[var(--sk-amber)]'
                      )}
                    >
                      {debt.isSettled ? 'Lunas' : formatIDR(debt.remainingAmount)}
                    </span>
                  </div>
                </div>

                {/* Progress Bar & Nominal Details */}
                <div className="flex flex-col gap-1.5">
                  <div className="w-full h-2 bg-[var(--sk-surface-2)] rounded-full overflow-hidden">
                    <div
                      data-testid={`debt-progress-${debt.id}`}
                      className={cn(
                        'h-full transition-all duration-300 rounded-full',
                        debt.isSettled
                          ? 'bg-[var(--sk-green)]'
                          : isReceivable
                            ? 'bg-[var(--sk-green)]'
                            : 'bg-[var(--sk-amber)]'
                      )}
                      style={{ width: `${percentPaid}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-[var(--sk-text-dim)]">
                    <span data-testid={`debt-paid-${debt.id}`}>
                      Dibayar: <strong className="text-[var(--sk-text-muted)] font-semibold">{formatIDR(debt.paidAmount)}</strong> ({percentPaid}%)
                    </span>
                    <span data-testid={`debt-principal-${debt.id}`}>
                      Pokok: <strong className="text-[var(--sk-text-muted)] font-semibold">{formatIDR(debt.principalAmount)}</strong>
                    </span>
                  </div>
                </div>

                {/* Metadata Row: Due Date, Note */}
                <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--sk-text-dim)] flex-wrap pt-0.5">
                  {debt.dueDate ? (
                    <div
                      data-testid={`debt-due-date-${debt.id}`}
                      className={cn(
                        'flex items-center gap-1 font-medium',
                        isOverdue ? 'text-[var(--sk-red)]' : 'text-[var(--sk-text-muted)]'
                      )}
                    >
                      <Calendar className="w-3 h-3" />
                      <span>Jatuh tempo: {debt.dueDate}</span>
                    </div>
                  ) : (
                    <span className="text-[10px] text-[var(--sk-text-dim)]">Tanpa jatuh tempo</span>
                  )}

                  {debt.note && (
                    <span className="text-[11px] text-[var(--sk-text-muted)] italic truncate max-w-[200px]">
                      {debt.note}
                    </span>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--sk-border)]/50">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      data-testid={`btn-toggle-history-${debt.id}`}
                      onClick={() => toggleHistory(debt.id)}
                      className="px-2.5 py-1.5 rounded-lg bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] hover:text-[var(--sk-text)] text-xs font-semibold flex items-center gap-1 transition-colors"
                      title="Lihat riwayat pembayaran"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>Riwayat ({debt.payments.length})</span>
                      {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>

                    <button
                      type="button"
                      data-testid={`btn-edit-debt-${debt.id}`}
                      onClick={() => handleOpenEdit(debt)}
                      className="w-8 h-8 rounded-lg bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] hover:text-[var(--sk-text)] flex items-center justify-center transition-colors"
                      aria-label={`Edit ${debt.name}`}
                      title="Edit catatan"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      data-testid={`btn-delete-debt-${debt.id}`}
                      onClick={() => removeDebt(debt.id)}
                      className="w-8 h-8 rounded-lg bg-[var(--sk-red-dim)] text-[var(--sk-red)] hover:opacity-90 flex items-center justify-center transition-opacity"
                      aria-label={`Hapus ${debt.name}`}
                      title="Hapus catatan"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {!debt.isSettled && (
                    <button
                      type="button"
                      data-testid={`btn-repay-debt-${debt.id}`}
                      onClick={() => handleOpenRepayment(debt)}
                      className={cn(
                        'px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm shrink-0',
                        isReceivable
                          ? 'bg-[var(--sk-green)] text-[#090D16] hover:opacity-90 shadow-[0_0_8px_var(--sk-green-glow)]'
                          : 'bg-[var(--sk-cyan)] text-[#090D16] hover:opacity-90 shadow-[0_0_8px_var(--sk-cyan-glow)]'
                      )}
                    >
                      {isReceivable ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                      <span>{isReceivable ? 'Terima Bayar' : 'Bayar'}</span>
                    </button>
                  )}
                </div>

                {/* Expandable Payment History */}
                {isExpanded && (
                  <div
                    data-testid={`debt-history-${debt.id}`}
                    className="mt-1 pt-3 border-t border-[var(--sk-border)]/70 flex flex-col gap-2"
                  >
                    <p className="text-[11px] font-bold text-[var(--sk-text-dim)] uppercase tracking-wide">
                      Riwayat Pembayaran
                    </p>
                    {debt.payments.length === 0 ? (
                      <p className="text-xs text-[var(--sk-text-dim)] italic py-1">
                        Belum ada pembayaran yang dicatat.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {debt.payments.map(p => (
                          <div
                            key={p.id}
                            className="rounded-xl bg-[var(--sk-surface-2)]/60 border border-[var(--sk-border)] px-3 py-2 flex items-center justify-between text-xs"
                          >
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-[var(--sk-text)]">{formatIDR(p.amount)}</span>
                                <span className="text-[10px] text-[var(--sk-text-dim)] bg-[var(--sk-surface-2)] px-1.5 py-0.5 rounded">
                                  {p.paymentMethodId}
                                </span>
                              </div>
                              {p.note && <p className="text-[10px] text-[var(--sk-text-dim)] mt-0.5">{p.note}</p>}
                            </div>
                            <span className="text-[10px] text-[var(--sk-text-dim)] tabular-nums">
                              {p.date ? formatTransactionDateTime(p.date) : '-'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Modals */}
      <DebtFormModal
        open={formModalOpen}
        onClose={() => setFormModalOpen(false)}
        initialDebt={editingDebt}
      />

      <DebtRepaymentModal
        open={repaymentModalOpen}
        onClose={() => setRepaymentModalOpen(false)}
        debt={repaymentDebt}
      />
    </div>
  )
}

// ── Net Worth Modal Dialog Container ──────────────────────────────────────────

export interface NetWorthModalProps {
  open: boolean
  onClose: () => void
}

export const NetWorthModal = memo(function NetWorthModal({ open, onClose }: NetWorthModalProps) {
  useEffect(() => {
    if (!open) return
    const layerId = 'net-worth-modal'
    pushBackLayer({ id: layerId, type: 'modal', onClose })
    return () => removeBackLayer(layerId)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="net-worth-dialog-title"
      data-testid="net-worth-modal"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 bg-[rgba(9,13,22,0.85)] backdrop-blur-xs animate-fade-in"
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="relative w-full max-w-xl rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border-2)] shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--sk-border)] bg-[var(--sk-surface-2)]/50">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[var(--sk-cyan-dim)] flex items-center justify-center shrink-0 border border-[var(--sk-cyan)]/30 text-[var(--sk-cyan)]">
              <Scale className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 id="net-worth-dialog-title" className="text-sm font-bold text-[var(--sk-text)] truncate">
                Net Worth & Utang Piutang
              </h3>
              <p className="text-[11px] text-[var(--sk-text-dim)] truncate">
                Pantau kekayaan bersih dan sinkronisasi pembayaran utang
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="btn-close-net-worth-modal"
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--sk-text-dim)] hover:text-[var(--sk-text)] hover:bg-[var(--sk-surface-2)] transition-colors"
            aria-label="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 overflow-y-auto flex flex-col gap-4">
          <NetWorthPanel />
        </div>
      </div>
    </div>,
    document.body
  )
})
