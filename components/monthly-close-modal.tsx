'use client'

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  History,
  Inbox,
  Info,
  Lock,
  LockOpen,
  RotateCcw,
  Scale,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react'
import {
  useMonthlyCloseStore,
  useWalletStore,
  useRuleInboxStore,
  useBillStore,
  useTransactionData,
} from '@/lib/store'
import {
  formatMonthId,
  formatMonthLabel,
  type PreClosingChecklistResult,
  type MonthlyFinancialSummary,
  type MonthlyCloseRecord,
} from '@/lib/monthly-close'
import { formatIDR, formatTransactionDateTime } from '@/lib/parser'
import { pushBackLayer, removeBackLayer } from '@/lib/back-stack'
import { cn } from '@/lib/utils'

export interface MonthlyCloseModalProps {
  open: boolean
  onClose: () => void
  initialYear?: number
  initialMonth?: number
}

export const MonthlyCloseModal = memo(function MonthlyCloseModal({
  open,
  onClose,
  initialYear,
  initialMonth,
}: MonthlyCloseModalProps) {
  const {
    monthlyCloses,
    executePreClosingChecklist,
    compileMonthlySummary,
    closeMonth,
    reopenMonth,
    isMonthClosed,
    getMonthlyCloseRecord,
  } = useMonthlyCloseStore()

  // Calendar year & month selection
  const [selectedYear, setSelectedYear] = useState<number>(() => {
    return initialYear ?? new Date().getFullYear()
  })

  const [selectedMonth, setSelectedMonth] = useState<number>(() => {
    if (initialMonth && initialMonth >= 1 && initialMonth <= 12) {
      return initialMonth
    }
    // Default to previous month if day 1-7, else current month
    const now = new Date()
    if (now.getDate() <= 7) {
      return now.getMonth() === 0 ? 12 : now.getMonth()
    }
    return now.getMonth() + 1
  })

  // Synchronize when initial props change
  useEffect(() => {
    if (open) {
      if (initialYear) setSelectedYear(initialYear)
      if (initialMonth && initialMonth >= 1 && initialMonth <= 12) {
        setSelectedMonth(initialMonth)
      }
    }
  }, [open, initialYear, initialMonth])

  // Custom event listener for external open requests
  useEffect(() => {
    const handleEvent = (e: Event) => {
      const detail = (e as CustomEvent)?.detail
      if (detail?.year) setSelectedYear(detail.year)
      if (detail?.month) setSelectedMonth(detail.month)
    }
    window.addEventListener('sakukilat:open-monthly-close', handleEvent)
    return () => window.removeEventListener('sakukilat:open-monthly-close', handleEvent)
  }, [])

  // Back stack registration
  useEffect(() => {
    if (!open) return
    const layerId = 'monthly-close-modal'
    pushBackLayer({ id: layerId, type: 'modal', onClose })
    return () => {
      removeBackLayer(layerId)
    }
  }, [open, onClose])

  // UI interaction states
  const [overrideValidation, setOverrideValidation] = useState(false)
  const [isReopenFormOpen, setIsReopenFormOpen] = useState(false)
  const [reopenNote, setReopenNote] = useState('')
  const [showUncategorizedList, setShowUncategorizedList] = useState(false)
  const [showOverdueBillsList, setShowOverdueBillsList] = useState(false)

  // Reset transient forms when month changes
  useEffect(() => {
    setOverrideValidation(false)
    setIsReopenFormOpen(false)
    setReopenNote('')
    setShowUncategorizedList(false)
    setShowOverdueBillsList(false)
  }, [selectedYear, selectedMonth])

  // Computed canonical IDs and data
  const monthId = useMemo(
    () => formatMonthId(selectedYear, selectedMonth),
    [selectedYear, selectedMonth]
  )

  const monthLabel = useMemo(
    () => formatMonthLabel(selectedYear, selectedMonth),
    [selectedYear, selectedMonth]
  )

  const isClosed = useMemo(
    () => isMonthClosed(monthId),
    [isMonthClosed, monthId, monthlyCloses]
  )

  const closeRecord = useMemo(
    () => getMonthlyCloseRecord(monthId),
    [getMonthlyCloseRecord, monthId, monthlyCloses]
  )

  // Execute pre-closing checklist
  const checklist = useMemo<PreClosingChecklistResult>(() => {
    return executePreClosingChecklist(selectedYear, selectedMonth)
  }, [executePreClosingChecklist, selectedYear, selectedMonth])

  // Compile monthly financial summary
  const summary = useMemo<MonthlyFinancialSummary>(() => {
    return compileMonthlySummary(selectedYear, selectedMonth)
  }, [compileMonthlySummary, selectedYear, selectedMonth])

  // Navigation handlers
  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedYear(y => y - 1)
      setSelectedMonth(12)
    } else {
      setSelectedMonth(m => m - 1)
    }
  }

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedYear(y => y + 1)
      setSelectedMonth(1)
    } else {
      setSelectedMonth(m => m + 1)
    }
  }

  // Action: Close month
  const handleCloseMonth = useCallback(() => {
    const res = closeMonth({
      year: selectedYear,
      month: selectedMonth,
      overrideValidation,
    })
    if (res) {
      setOverrideValidation(false)
    }
  }, [closeMonth, selectedYear, selectedMonth, overrideValidation])

  // Action: Reopen month
  const handleReopenConfirm = useCallback(() => {
    const trimmed = reopenNote.trim()
    if (!trimmed) return
    const res = reopenMonth(monthId, trimmed)
    if (res) {
      setIsReopenFormOpen(false)
      setReopenNote('')
    }
  }, [reopenMonth, monthId, reopenNote])

  // Action: Re-close reopened month
  const handleReclose = useCallback(() => {
    closeMonth({
      year: selectedYear,
      month: selectedMonth,
      overrideValidation: true,
    })
  }, [closeMonth, selectedYear, selectedMonth])

  // Blocker direct actions
  const handleOpenInbox = () => {
    window.dispatchEvent(new CustomEvent('sakukilat:open-inbox-review'))
    onClose()
  }

  const handleOpenReconcile = () => {
    const firstUnrec = checklist.items.unreconciledWallets.wallets[0]
    window.dispatchEvent(
      new CustomEvent('sakukilat:open-reconciliation', {
        detail: { walletId: firstUnrec?.id },
      })
    )
    onClose()
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="monthly-close-modal"
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/80 animate-fade-in p-0 sm:p-4"
    >
      <div
        className="w-full sm:max-w-xl max-h-[92dvh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border-2)] shadow-2xl overflow-hidden animate-sheet-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-[var(--sk-border)] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)] flex items-center justify-center border border-[var(--sk-cyan)]/25 shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-[var(--sk-text)] leading-tight">
                  Tutup Buku Bulanan
                </h2>
                {isClosed && (
                  <span
                    data-testid="modal-closed-status-badge"
                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--sk-cyan)] bg-[var(--sk-cyan-dim)] border border-[var(--sk-cyan)]/30 rounded-full px-2 py-0.5"
                  >
                    <Lock className="w-2.5 h-2.5" />
                    Terkunci
                  </span>
                )}
                {closeRecord?.isReopened && (
                  <span
                    data-testid="modal-reopened-status-badge"
                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--sk-amber)] bg-[var(--sk-amber-dim)] border border-[var(--sk-amber)]/30 rounded-full px-2 py-0.5"
                  >
                    <LockOpen className="w-2.5 h-2.5" />
                    Dibuka Kembali
                  </span>
                )}
              </div>
              <p className="text-[10px] text-[var(--sk-text-dim)]">
                Kunci buku akhir bulan dan verifikasi validitas catatan
              </p>
            </div>
          </div>
          <button
            type="button"
            data-testid="monthly-close-close-btn"
            onClick={onClose}
            aria-label="Tutup modal tutup bulan"
            className="w-8 h-8 rounded-lg bg-[var(--sk-surface-2)] flex items-center justify-center text-[var(--sk-text-muted)] hover:text-[var(--sk-text)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
          {/* Month Selector Navigation */}
          <div className="flex items-center justify-between rounded-xl bg-[var(--sk-surface-2)]/60 border border-[var(--sk-border)] p-2">
            <button
              type="button"
              data-testid="btn-prev-month"
              onClick={handlePrevMonth}
              aria-label="Bulan sebelumnya"
              className="w-8 h-8 rounded-lg bg-[var(--sk-surface)] flex items-center justify-center text-[var(--sk-text-muted)] hover:text-[var(--sk-text)] border border-[var(--sk-border)] transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="text-center min-w-0 px-2">
              <p className="text-xs font-bold text-[var(--sk-text)] truncate" data-testid="selected-month-label">
                {monthLabel}
              </p>
              <p className="text-[10px] text-[var(--sk-text-dim)] uppercase tracking-wider">
                ID: {monthId}
              </p>
            </div>
            <button
              type="button"
              data-testid="btn-next-month"
              onClick={handleNextMonth}
              aria-label="Bulan berikutnya"
              className="w-8 h-8 rounded-lg bg-[var(--sk-surface)] flex items-center justify-center text-[var(--sk-text-muted)] hover:text-[var(--sk-text)] border border-[var(--sk-border)] transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Locked Status Banner (When Month is Closed) */}
          {isClosed && (
            <div
              data-testid="monthly-close-locked-banner"
              className="rounded-xl border border-[var(--sk-cyan)]/30 bg-[var(--sk-cyan-dim)]/30 p-3.5 flex flex-col gap-2 animate-fade-in"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[var(--sk-cyan)]">
                  <Lock className="w-4 h-4 shrink-0" />
                  <span className="text-xs font-bold">Periode Buku Ini Telah Dikunci</span>
                </div>
                {closeRecord?.closedAt && (
                  <span className="text-[10px] text-[var(--sk-text-dim)]">
                    {formatTransactionDateTime(closeRecord.closedAt)}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[var(--sk-text-muted)] leading-relaxed">
                Periode {monthLabel} telah ditutup resmi. Catatan keuangan terlindungi dari perubahan yang tidak disengaja.
              </p>

              {!isReopenFormOpen ? (
                <button
                  type="button"
                  data-testid="btn-open-reopen-form"
                  onClick={() => setIsReopenFormOpen(true)}
                  className="mt-1 self-start px-3 py-1.5 rounded-lg border border-[var(--sk-cyan)]/40 bg-[var(--sk-surface)] text-[var(--sk-cyan)] text-xs font-semibold hover:bg-[var(--sk-cyan)] hover:text-[#090D16] transition-all flex items-center gap-1.5"
                >
                  <LockOpen className="w-3.5 h-3.5" />
                  <span>Buka Kembali Periode</span>
                </button>
              ) : (
                <div
                  data-testid="monthly-close-reopen-form"
                  className="mt-2 pt-2 border-t border-[var(--sk-cyan)]/20 flex flex-col gap-2 animate-fade-in"
                >
                  <label className="text-[11px] font-semibold text-[var(--sk-text)] flex items-center gap-1">
                    <span>Catatan Audit Pembukaan Kembali (Wajib)</span>
                    <span className="text-[var(--sk-red)]">*</span>
                  </label>
                  <textarea
                    data-testid="reopen-audit-note-input"
                    value={reopenNote}
                    onChange={e => setReopenNote(e.target.value)}
                    placeholder="Jelaskan alasan pembukaan kembali, cth: Koreksi struk belanja tertinggal atau penyesuaian saldo..."
                    rows={2}
                    className="w-full rounded-lg bg-[var(--sk-surface-2)] border border-[var(--sk-border)] p-2.5 text-xs text-[var(--sk-text)] placeholder:text-[var(--sk-text-dim)] outline-none focus:border-[var(--sk-cyan)] transition-colors resize-none"
                  />
                  <div className="flex items-center gap-2 mt-1">
                    <button
                      type="button"
                      data-testid="btn-confirm-reopen-month"
                      onClick={handleReopenConfirm}
                      disabled={!reopenNote.trim()}
                      className="flex-1 py-2 rounded-lg bg-[var(--sk-cyan)] text-[#090D16] font-semibold text-xs disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-all flex items-center justify-center gap-1.5 shadow-[0_0_8px_var(--sk-cyan-glow)]"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Konfirmasi Buka Kembali</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsReopenFormOpen(false)
                        setReopenNote('')
                      }}
                      className="px-3 py-2 rounded-lg bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] font-semibold text-xs hover:text-[var(--sk-text)] transition-colors"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Reopened Warning Banner (When Month was Reopened) */}
          {closeRecord?.isReopened && (
            <div
              data-testid="monthly-close-reopened-banner"
              className="rounded-xl border border-[var(--sk-amber)]/30 bg-[var(--sk-amber-dim)]/30 p-3.5 flex flex-col gap-2 animate-fade-in"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[var(--sk-amber)]">
                  <LockOpen className="w-4 h-4 shrink-0" />
                  <span className="text-xs font-bold">Periode Terbuka Kembali (Dalam Perbaikan)</span>
                </div>
                {closeRecord.reopenedAt && (
                  <span className="text-[10px] text-[var(--sk-text-dim)]">
                    {formatTransactionDateTime(closeRecord.reopenedAt)}
                  </span>
                )}
              </div>
              {closeRecord.reopenedNote && (
                <div className="rounded-lg bg-[var(--sk-surface)]/80 p-2.5 border border-[var(--sk-border)] text-xs text-[var(--sk-text-muted)]">
                  <p className="text-[10px] uppercase font-bold text-[var(--sk-text-dim)] mb-0.5">Catatan Audit</p>
                  <p className="italic">&ldquo;{closeRecord.reopenedNote}&rdquo;</p>
                </div>
              )}
              <div className="flex items-center gap-2 mt-1">
                <button
                  type="button"
                  data-testid="btn-reclose-month"
                  onClick={handleReclose}
                  className="px-3.5 py-1.5 rounded-lg bg-[var(--sk-cyan)] text-[#090D16] text-xs font-semibold hover:opacity-90 transition-all flex items-center gap-1.5 shadow-[0_0_8px_var(--sk-cyan-glow)]"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Kunci Kembali Periode</span>
                </button>
              </div>
            </div>
          )}

          {/* 1. Monthly Financial Summary Card (Req 9.2, Property 27) */}
          <div
            data-testid="monthly-close-summary-card"
            className="rounded-2xl bg-[var(--sk-surface-2)]/40 border border-[var(--sk-border)] p-3.5 flex flex-col gap-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[var(--sk-cyan)]" />
                <h3 className="text-xs font-bold text-[var(--sk-text)] uppercase tracking-wider">
                  Ringkasan Keuangan {monthLabel}
                </h3>
              </div>
              <span className="text-[11px] font-semibold text-[var(--sk-text-dim)]">
                {summary.transactionCount} transaksi
              </span>
            </div>

            {/* Income & Expense Dual Metric */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 rounded-xl bg-[var(--sk-surface)] border border-[var(--sk-border)]">
                <span className="text-[10px] uppercase font-semibold text-[var(--sk-text-dim)]">
                  Total Pemasukan
                </span>
                <p className="text-base font-extrabold text-[var(--sk-green)] mt-1" data-testid="summary-income-total">
                  {formatIDR(summary.incomeTotal)}
                </p>
                <span className="text-[10px] text-[var(--sk-text-dim)] mt-0.5 block">
                  {summary.incomeCount} transaksi masuk
                </span>
              </div>

              <div className="p-3 rounded-xl bg-[var(--sk-surface)] border border-[var(--sk-border)]">
                <span className="text-[10px] uppercase font-semibold text-[var(--sk-text-dim)]">
                  Total Pengeluaran
                </span>
                <p className="text-base font-extrabold text-[var(--sk-red)] mt-1" data-testid="summary-expense-total">
                  {formatIDR(summary.expenseTotal)}
                </p>
                <span className="text-[10px] text-[var(--sk-text-dim)] mt-0.5 block">
                  {summary.expenseCount} transaksi keluar
                </span>
              </div>
            </div>

            {/* Net Savings Metric (Guaranteed Identity) */}
            <div className="p-3 rounded-xl bg-[var(--sk-surface)] border border-[var(--sk-border)] flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-semibold text-[var(--sk-text-dim)]">
                  Tabungan Bersih (Net Savings)
                </span>
                <p
                  data-testid="summary-net-savings"
                  className={cn(
                    'text-lg font-black mt-0.5',
                    summary.netSavings >= 0 ? 'text-[var(--sk-green)]' : 'text-[var(--sk-red)]'
                  )}
                >
                  {summary.netSavings >= 0 ? '+' : ''}
                  {formatIDR(summary.netSavings)}
                </p>
              </div>
              <span
                data-testid="summary-savings-badge"
                className={cn(
                  'px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1',
                  summary.netSavings >= 0
                    ? 'bg-[var(--sk-green-dim)] text-[var(--sk-green)] border border-[var(--sk-green)]/30'
                    : 'bg-[var(--sk-red-dim)] text-[var(--sk-red)] border border-[var(--sk-red)]/30'
                )}
              >
                {summary.netSavings >= 0 ? (
                  <TrendingUp className="w-3.5 h-3.5" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5" />
                )}
                {summary.netSavings >= 0 ? 'Surplus' : 'Defisit'}
              </span>
            </div>

            {/* Reconciliation Status in Target Month */}
            <div className="p-2.5 rounded-xl bg-[var(--sk-surface)] border border-[var(--sk-border)] flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Scale className="w-4 h-4 text-[var(--sk-cyan)]" />
                <div>
                  <p className="font-semibold text-[var(--sk-text)] text-xs">
                    {summary.reconciliationsCount} Rekonsiliasi Saldo
                  </p>
                  <p className="text-[10px] text-[var(--sk-text-dim)]">
                    {summary.transferCount} transfer antar-saku internal
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-[var(--sk-text-dim)] block">Variansi Buku</span>
                <span
                  data-testid="summary-reconciliation-variance"
                  className={cn(
                    'font-bold text-xs',
                    summary.unreconciledVariances === 0
                      ? 'text-[var(--sk-green)]'
                      : 'text-[var(--sk-amber)]'
                  )}
                >
                  {summary.unreconciledVariances === 0
                    ? 'Cocok (Rp0)'
                    : `${summary.unreconciledVariances > 0 ? '+' : ''}${formatIDR(summary.unreconciledVariances)}`}
                </span>
              </div>
            </div>
          </div>

          {/* 2. Pre-Closing Checklist (Req 9.1, Property 26) */}
          <div
            data-testid="pre-closing-checklist-container"
            className="rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-3.5 flex flex-col gap-3"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-[var(--sk-text)] uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[var(--sk-cyan)]" />
                  <span>Pemeriksaan Pra-Tutup Buku</span>
                </h3>
                <p className="text-[10px] text-[var(--sk-text-dim)] mt-0.5">
                  Verifikasi 4 syarat kelayakan sebelum mengunci pembukuan
                </p>
              </div>
              <span
                data-testid="checklist-status-badge"
                className={cn(
                  'px-2 py-0.5 rounded-full text-[10px] font-bold border',
                  checklist.isReadyToClose
                    ? 'bg-[var(--sk-green-dim)] text-[var(--sk-green)] border-[var(--sk-green)]/30'
                    : 'bg-[var(--sk-amber-dim)] text-[var(--sk-amber)] border-[var(--sk-amber)]/30'
                )}
              >
                {checklist.isReadyToClose
                  ? 'Siap Ditutup (4/4 Sesuai)'
                  : `${checklist.totalIssuesCount} Perlu Dicek`}
              </span>
            </div>

            {/* Checklist Item 1: Uncategorized Transactions */}
            <div
              data-testid="checklist-item-uncategorized"
              className={cn(
                'p-3 rounded-xl border flex flex-col gap-2 transition-colors',
                checklist.items.uncategorizedTransactions.isPassed
                  ? 'border-[var(--sk-green)]/25 bg-[var(--sk-green-dim)]/15'
                  : 'border-[var(--sk-amber)]/35 bg-[var(--sk-amber-dim)]/20'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={cn(
                      'w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-xs',
                      checklist.items.uncategorizedTransactions.isPassed
                        ? 'bg-[var(--sk-green-dim)] text-[var(--sk-green)]'
                        : 'bg-[var(--sk-amber-dim)] text-[var(--sk-amber)]'
                    )}
                  >
                    {checklist.items.uncategorizedTransactions.isPassed ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--sk-text)] leading-tight">
                      Kategori Transaksi
                    </p>
                    <p className="text-[11px] text-[var(--sk-text-muted)] truncate">
                      {checklist.items.uncategorizedTransactions.isPassed
                        ? 'Semua transaksi memiliki kategori jelas'
                        : `${checklist.items.uncategorizedTransactions.count} transaksi berkategori 'lainnya' atau kosong`}
                    </p>
                  </div>
                </div>
                {!checklist.items.uncategorizedTransactions.isPassed && (
                  <button
                    type="button"
                    data-testid="checklist-action-uncategorized"
                    onClick={() => setShowUncategorizedList(v => !v)}
                    className="shrink-0 px-2.5 py-1 rounded-lg bg-[var(--sk-surface)] border border-[var(--sk-amber)]/40 text-[var(--sk-amber)] text-[11px] font-semibold hover:bg-[var(--sk-amber-dim)] transition-colors"
                  >
                    {showUncategorizedList ? 'Tutup Rincian' : 'Lihat Transaksi'}
                  </button>
                )}
              </div>

              {showUncategorizedList && !checklist.items.uncategorizedTransactions.isPassed && (
                <div className="mt-1 pt-2 border-t border-[var(--sk-border)] space-y-1.5 animate-fade-in">
                  <p className="text-[10px] uppercase font-bold text-[var(--sk-text-dim)]">
                    Daftar Transaksi Perlu Kategori:
                  </p>
                  {checklist.items.uncategorizedTransactions.transactions.map(tx => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between text-xs bg-[var(--sk-surface)] p-2 rounded-lg border border-[var(--sk-border)]"
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <p className="font-semibold text-[var(--sk-text)] truncate">{tx.description}</p>
                        <p className="text-[10px] text-[var(--sk-text-dim)]">
                          {formatTransactionDateTime(tx.date)}
                        </p>
                      </div>
                      <span className="font-bold text-[var(--sk-text)] tabular-nums shrink-0">
                        {formatIDR(tx.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Checklist Item 2: Pending Inbox Items */}
            <div
              data-testid="checklist-item-inbox"
              className={cn(
                'p-3 rounded-xl border flex items-center justify-between gap-2 transition-colors',
                checklist.items.pendingInbox.isPassed
                  ? 'border-[var(--sk-green)]/25 bg-[var(--sk-green-dim)]/15'
                  : 'border-[var(--sk-amber)]/35 bg-[var(--sk-amber-dim)]/20'
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={cn(
                    'w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-xs',
                    checklist.items.pendingInbox.isPassed
                      ? 'bg-[var(--sk-green-dim)] text-[var(--sk-green)]'
                      : 'bg-[var(--sk-amber-dim)] text-[var(--sk-amber)]'
                  )}
                >
                  {checklist.items.pendingInbox.isPassed ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Inbox className="w-3.5 h-3.5" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[var(--sk-text)] leading-tight">
                    Inbox Review Transaksi
                  </p>
                  <p className="text-[11px] text-[var(--sk-text-muted)] truncate">
                    {checklist.items.pendingInbox.isPassed
                      ? 'Inbox review bersih (semua disetujui)'
                      : `${checklist.items.pendingInbox.count} transaksi menunggu peninjauan inbox`}
                  </p>
                </div>
              </div>
              {!checklist.items.pendingInbox.isPassed && (
                <button
                  type="button"
                  data-testid="checklist-action-inbox"
                  onClick={handleOpenInbox}
                  className="shrink-0 px-2.5 py-1 rounded-lg bg-[var(--sk-cyan)] text-[#090D16] text-[11px] font-bold hover:opacity-90 transition-all shadow-[0_0_6px_var(--sk-cyan-glow)]"
                >
                  Buka Inbox
                </button>
              )}
            </div>

            {/* Checklist Item 3: Unreconciled Wallets */}
            <div
              data-testid="checklist-item-reconciliation"
              className={cn(
                'p-3 rounded-xl border flex items-center justify-between gap-2 transition-colors',
                checklist.items.unreconciledWallets.isPassed
                  ? 'border-[var(--sk-green)]/25 bg-[var(--sk-green-dim)]/15'
                  : 'border-[var(--sk-amber)]/35 bg-[var(--sk-amber-dim)]/20'
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={cn(
                    'w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-xs',
                    checklist.items.unreconciledWallets.isPassed
                      ? 'bg-[var(--sk-green-dim)] text-[var(--sk-green)]'
                      : 'bg-[var(--sk-amber-dim)] text-[var(--sk-amber)]'
                  )}
                >
                  {checklist.items.unreconciledWallets.isPassed ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Scale className="w-3.5 h-3.5" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[var(--sk-text)] leading-tight">
                    Rekonsiliasi Saku Aktif
                  </p>
                  <p className="text-[11px] text-[var(--sk-text-muted)] truncate">
                    {checklist.items.unreconciledWallets.isPassed
                      ? 'Semua saku telah direkonsiliasi bulan ini'
                      : `${checklist.items.unreconciledWallets.count} saku belum dicocokkan saldo (${checklist.items.unreconciledWallets.wallets.map(w => w.label).join(', ')})`}
                  </p>
                </div>
              </div>
              {!checklist.items.unreconciledWallets.isPassed && (
                <button
                  type="button"
                  data-testid="checklist-action-reconcile"
                  onClick={handleOpenReconcile}
                  className="shrink-0 px-2.5 py-1 rounded-lg bg-[var(--sk-cyan)] text-[#090D16] text-[11px] font-bold hover:opacity-90 transition-all shadow-[0_0_6px_var(--sk-cyan-glow)]"
                >
                  Rekonsiliasi
                </button>
              )}
            </div>

            {/* Checklist Item 4: Overdue Bills */}
            <div
              data-testid="checklist-item-bills"
              className={cn(
                'p-3 rounded-xl border flex flex-col gap-2 transition-colors',
                checklist.items.overdueBills.isPassed
                  ? 'border-[var(--sk-green)]/25 bg-[var(--sk-green-dim)]/15'
                  : 'border-[var(--sk-amber)]/35 bg-[var(--sk-amber-dim)]/20'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={cn(
                      'w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-xs',
                      checklist.items.overdueBills.isPassed
                        ? 'bg-[var(--sk-green-dim)] text-[var(--sk-green)]'
                        : 'bg-[var(--sk-amber-dim)] text-[var(--sk-amber)]'
                    )}
                  >
                    {checklist.items.overdueBills.isPassed ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--sk-text)] leading-tight">
                      Tagihan Rutin Jatuh Tempo
                    </p>
                    <p className="text-[11px] text-[var(--sk-text-muted)] truncate">
                      {checklist.items.overdueBills.isPassed
                        ? 'Tidak ada tagihan tertunggak bulan ini'
                        : `${checklist.items.overdueBills.count} tagihan jatuh tempo belum dibayar`}
                    </p>
                  </div>
                </div>
                {!checklist.items.overdueBills.isPassed && (
                  <button
                    type="button"
                    data-testid="checklist-action-bills"
                    onClick={() => setShowOverdueBillsList(v => !v)}
                    className="shrink-0 px-2.5 py-1 rounded-lg bg-[var(--sk-surface)] border border-[var(--sk-amber)]/40 text-[var(--sk-amber)] text-[11px] font-semibold hover:bg-[var(--sk-amber-dim)] transition-colors"
                  >
                    {showOverdueBillsList ? 'Tutup' : 'Lihat'}
                  </button>
                )}
              </div>

              {showOverdueBillsList && !checklist.items.overdueBills.isPassed && (
                <div className="mt-1 pt-2 border-t border-[var(--sk-border)] space-y-1.5 animate-fade-in">
                  <p className="text-[10px] uppercase font-bold text-[var(--sk-text-dim)]">
                    Daftar Tagihan Tertunggak:
                  </p>
                  {checklist.items.overdueBills.bills.map(bill => (
                    <div
                      key={bill.id}
                      className="flex items-center justify-between text-xs bg-[var(--sk-surface)] p-2 rounded-lg border border-[var(--sk-border)]"
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <p className="font-semibold text-[var(--sk-text)] truncate">{bill.name}</p>
                        <p className="text-[10px] text-[var(--sk-red)]">
                          Jatuh tempo: {bill.nextDueDate}
                        </p>
                      </div>
                      <span className="font-bold text-[var(--sk-text)] tabular-nums shrink-0">
                        {formatIDR(bill.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Action Footer */}
        <div className="p-4 border-t border-[var(--sk-border)] bg-[var(--sk-surface)] flex flex-col gap-2.5 flex-shrink-0">
          {!isClosed ? (
            <>
              {!checklist.isReadyToClose && (
                <label className="flex items-center gap-2 text-xs text-[var(--sk-text-muted)] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    data-testid="override-validation-checkbox"
                    checked={overrideValidation}
                    onChange={e => setOverrideValidation(e.target.checked)}
                    className="rounded border-[var(--sk-border)] text-[var(--sk-cyan)] focus:ring-0"
                  />
                  <span>Tetap tutup buku dengan catatan khusus (abaikan catatan pra-tutup)</span>
                </label>
              )}

              <button
                type="button"
                data-testid="btn-confirm-close-month"
                onClick={handleCloseMonth}
                disabled={!checklist.isReadyToClose && !overrideValidation}
                className={cn(
                  'w-full py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all',
                  checklist.isReadyToClose || overrideValidation
                    ? 'bg-[var(--sk-cyan)] text-[#090D16] shadow-[0_0_12px_var(--sk-cyan-glow)] hover:opacity-95 active:scale-[0.99]'
                    : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-dim)] cursor-not-allowed border border-[var(--sk-border)]'
                )}
              >
                <Lock className="w-4 h-4" />
                <span>Tutup Buku Periode {monthLabel}</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-[var(--sk-surface-2)] text-[var(--sk-text)] text-xs font-semibold hover:bg-[var(--sk-surface-3)] transition-colors"
            >
              Selesai & Tutup
            </button>
          )}
        </div>
      </div>
    </div>
  )
})
