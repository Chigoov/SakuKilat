'use client'

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  Clock,
  History,
  Info,
  Landmark,
  Scale,
  ShieldCheck,
  Wallet,
  X,
} from 'lucide-react'
import { useReconciliationStore, useTransactionData, useWalletStore } from '@/lib/store'
import {
  calculateReconciliationVariance,
  formatReconciliationVariance,
  getWalletReconciliationHistory,
  hasNeverBeenReconciled,
  type WalletReconciliation,
} from '@/lib/reconciliation'
import { formatIDR, formatTransactionDateTime } from '@/lib/parser'
import { parseAmountInput } from '@/lib/amount'
import { RupiahInput } from '@/components/rupiah-input'
import { pushBackLayer, removeBackLayer } from '@/lib/back-stack'
import { cn } from '@/lib/utils'

export interface ReconciliationModalProps {
  open: boolean
  onClose: () => void
  initialWalletId?: string
}

export const ReconciliationModal = memo(function ReconciliationModal({
  open,
  onClose,
  initialWalletId,
}: ReconciliationModalProps) {
  const { wallets } = useWalletStore()
  const { reconciliations, reconcileWallet } = useReconciliationStore()
  const { transactions } = useTransactionData()

  // Selected wallet state
  const [selectedWalletId, setSelectedWalletId] = useState<string>(() => {
    if (initialWalletId && wallets.some(w => w.id === initialWalletId)) {
      return initialWalletId
    }
    return wallets[0]?.id ?? ''
  })

  // Synchronize when initialWalletId changes while opening
  useEffect(() => {
    if (open) {
      if (initialWalletId && wallets.some(w => w.id === initialWalletId)) {
        setSelectedWalletId(initialWalletId)
      } else if (!selectedWalletId && wallets.length > 0) {
        setSelectedWalletId(wallets[0].id)
      }
    }
  }, [open, initialWalletId, wallets, selectedWalletId])

  // Reset form inputs when wallet changes or modal opens
  const [actualBalanceRaw, setActualBalanceRaw] = useState('')
  const [note, setNote] = useState('')
  const [createAdjustment, setCreateAdjustment] = useState(true)
  const [showHistory, setShowHistory] = useState(false)

  // Clear inputs when selected wallet changes
  useEffect(() => {
    setActualBalanceRaw('')
    setNote('')
    setCreateAdjustment(true)
    setShowHistory(false)
  }, [selectedWalletId])

  // Back-stack handling
  useEffect(() => {
    if (!open) return
    const layerId = 'reconciliation-modal'
    pushBackLayer({ id: layerId, type: 'modal', onClose })
    return () => {
      removeBackLayer(layerId)
    }
  }, [open, onClose])

  // Active wallet resolution
  const activeWallet = useMemo(() => {
    return wallets.find(w => w.id === selectedWalletId) ?? wallets[0] ?? null
  }, [wallets, selectedWalletId])

  const expectedBalance = activeWallet?.balance ?? 0
  const isUnreconciled = activeWallet
    ? hasNeverBeenReconciled(activeWallet, reconciliations)
    : true

  // Audit history for the selected wallet
  const walletHistory = useMemo(() => {
    if (!activeWallet) return []
    return getWalletReconciliationHistory(activeWallet.id, reconciliations)
  }, [activeWallet, reconciliations])

  const latestReconciliation = walletHistory[0] ?? null

  // Real-time variance calculation
  const hasEnteredActual = actualBalanceRaw.trim().length > 0
  const parsedActual = parseAmountInput(actualBalanceRaw)

  // Count transactions for the active wallet within the active calendar month
  const currentMonthTxCount = useMemo(() => {
    if (!activeWallet) return 0
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime()

    return transactions.filter(t => {
      const tTime = new Date(t.date).getTime()
      if (Number.isNaN(tTime) || tTime < startOfMonth || tTime >= endOfMonth) return false
      return (
        t.paymentMethod === activeWallet.id ||
        t.fromWalletId === activeWallet.id ||
        t.toWalletId === activeWallet.id
      )
    }).length
  }, [activeWallet, transactions])

  const canSubmitReconcile = hasEnteredActual && currentMonthTxCount > 0

  const difference = useMemo(() => {
    if (!hasEnteredActual) return 0
    return calculateReconciliationVariance(parsedActual, expectedBalance)
  }, [hasEnteredActual, parsedActual, expectedBalance])

  const varianceDetails = useMemo(() => {
    if (!hasEnteredActual) return null
    return formatReconciliationVariance(difference)
  }, [hasEnteredActual, difference])

  // Quick fill helper: copy current recorded balance into actual input
  const handleFillExpected = () => {
    setActualBalanceRaw(String(expectedBalance))
  }

  // Submission handler
  const handleConfirm = useCallback(() => {
    if (!activeWallet || !hasEnteredActual || currentMonthTxCount === 0) return

    const actual = parsedActual
    const diff = calculateReconciliationVariance(actual, expectedBalance)

    const defaultAuditNote = diff > 0
      ? `Koreksi rekonsiliasi (+${formatIDR(diff)})`
      : diff < 0
        ? `Koreksi rekonsiliasi (-${formatIDR(Math.abs(diff))})`
        : 'Verifikasi saldo fisik cocok dengan catatan'

    const auditNote = note.trim() || defaultAuditNote

    reconcileWallet({
      walletId: activeWallet.id,
      actualBalance: actual,
      note: auditNote,
      createAdjustment: createAdjustment && diff !== 0,
    })

    onClose()
  }, [activeWallet, hasEnteredActual, currentMonthTxCount, parsedActual, expectedBalance, note, createAdjustment, reconcileWallet, onClose])

  if (!open || !activeWallet) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="reconciliation-modal"
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/80 animate-fade-in p-0 sm:p-4"
    >
      <div
        className="w-full sm:max-w-lg max-h-[92dvh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border-2)] shadow-2xl overflow-hidden animate-sheet-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-[var(--sk-border)] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)] flex items-center justify-center border border-[var(--sk-cyan)]/25 shrink-0">
              <Scale className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[var(--sk-text)] leading-tight">
                Rekonsiliasi Saldo Saku
              </h2>
              <p className="text-[10px] text-[var(--sk-text-dim)]">
                Cocokkan catatan buku kas dengan saldo fisik atau rekening
              </p>
            </div>
          </div>
          <button
            type="button"
            data-testid="reconcile-close-btn"
            onClick={onClose}
            aria-label="Tutup modal rekonsiliasi"
            className="w-8 h-8 rounded-lg bg-[var(--sk-surface-2)] flex items-center justify-center text-[var(--sk-text-muted)] hover:text-[var(--sk-text)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Modal Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
          {/* 1. Wallet Selection Chips */}
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-[var(--sk-text-dim)] mb-1.5 block">
              Pilih Saku yang Ingin Direkonsiliasi
            </label>
            <div
              data-testid="reconcile-wallet-select"
              className="flex flex-wrap gap-1.5"
            >
              {wallets.map(w => {
                const isSelected = w.id === selectedWalletId
                const wUnreconciled = hasNeverBeenReconciled(w, reconciliations)

                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => setSelectedWalletId(w.id)}
                    className={cn(
                      'px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all',
                      isSelected
                        ? 'bg-[var(--sk-cyan)] text-[#090D16] shadow-[0_0_10px_var(--sk-cyan-glow)]'
                        : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] hover:bg-[var(--sk-surface-3)] hover:text-[var(--sk-text)] border border-[var(--sk-border)]'
                    )}
                  >
                    <Landmark className="w-3.5 h-3.5" />
                    <span>{w.label}</span>
                    {wUnreconciled && (
                      <span
                        className={cn(
                          'w-2 h-2 rounded-full shrink-0',
                          isSelected ? 'bg-amber-900' : 'bg-[var(--sk-amber)]'
                        )}
                        title="Belum pernah direkonsiliasi"
                      />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 2. Expected (Recorded) Balance Card */}
          <div
            data-testid="reconcile-expected-balance"
            className="rounded-2xl bg-[var(--sk-surface-2)]/60 border border-[var(--sk-border)] p-4 flex flex-col gap-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--sk-text-dim)] font-medium">
                Saldo Tercatat di Buku
              </span>
              {isUnreconciled ? (
                <span
                  data-testid="reconcile-unreconciled-indicator"
                  className="text-[10px] font-semibold text-[var(--sk-amber)] bg-[var(--sk-amber-dim)] border border-[var(--sk-amber)]/30 rounded-full px-2 py-0.5 flex items-center gap-1"
                >
                  <AlertTriangle className="w-3 h-3" />
                  Belum Pernah Direkonsiliasi
                </span>
              ) : (
                <span className="text-[10px] font-medium text-[var(--sk-green)] bg-[var(--sk-green-dim)] border border-[var(--sk-green)]/25 rounded-full px-2 py-0.5 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  Pernah Direkonsiliasi
                </span>
              )}
            </div>

            <div className="flex items-baseline justify-between gap-2">
              <span className="text-2xl font-bold tabular-nums text-[var(--sk-text)]">
                {formatIDR(expectedBalance)}
              </span>
              {latestReconciliation && (
                <span className="text-[10px] text-[var(--sk-text-dim)] truncate">
                  Terakhir: {formatTransactionDateTime(latestReconciliation.reconciledAt)}
                </span>
              )}
            </div>
          </div>

          {/* Zero Mutation Warning Notice */}
          {currentMonthTxCount === 0 && (
            <div
              data-testid="reconcile-zero-mutation-notice"
              className="rounded-xl bg-[var(--sk-amber-dim)]/40 border border-[var(--sk-amber)]/30 p-3 flex items-start gap-2.5 text-[var(--sk-amber)]"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed">
                <p className="font-bold">Tidak Ada Aktivitas Bulan Berjalan</p>
                <p className="text-[11px] opacity-90 mt-0.5">
                  Saku &quot;{activeWallet.label}&quot; belum memiliki catatan mutasi pada bulan kalender ini. Rekonsiliasi saldo hanya dapat dilakukan setelah ada aktivitas transaksi.
                </p>
              </div>
            </div>
          )}

          {/* 3. Actual Physical Balance Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-[var(--sk-text-dim)]">
                Saldo Fisik / Saldo Rekening Nyata
              </label>
              <button
                type="button"
                onClick={handleFillExpected}
                className="text-[11px] font-semibold text-[var(--sk-cyan)] hover:underline"
              >
                Samakan dengan buku
              </button>
            </div>

            <RupiahInput
              value={actualBalanceRaw}
              onChange={(_num, str) => setActualBalanceRaw(str)}
              placeholder="cth. 1.250.000"
              containerClassName="w-full rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] focus-within:border-[var(--sk-cyan)]"
              className="py-2.5 text-sm font-semibold tabular-nums"
              autoFocus
            />
            <p className="text-[11px] text-[var(--sk-text-dim)] mt-1.5">
              Buka aplikasi m-banking atau hitung uang tunai di dompet, lalu masukkan nominalnya di sini.
            </p>
          </div>

          {/* 4. Real-Time Variance Preview */}
          {varianceDetails && (
            <div
              data-testid="reconcile-variance-preview"
              className={cn(
                'rounded-2xl p-4 border flex flex-col gap-2 transition-all animate-fade-in',
                varianceDetails.status === 'balanced' &&
                  'bg-[var(--sk-green-dim)]/20 border-[var(--sk-green)]/30 text-[var(--sk-text)]',
                varianceDetails.status === 'surplus' &&
                  'bg-[var(--sk-green-dim)]/30 border-[var(--sk-green)]/40 text-[var(--sk-text)]',
                varianceDetails.status === 'shortfall' &&
                  'bg-[var(--sk-red-dim)]/25 border-[var(--sk-red)]/35 text-[var(--sk-text)]'
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--sk-text-dim)]">
                  Selisih Perhitungan (Fisik - Buku)
                </span>
                <span
                  className={cn(
                    'text-[11px] font-bold px-2.5 py-0.5 rounded-full border',
                    varianceDetails.status === 'balanced' &&
                      'bg-[var(--sk-green-dim)] text-[var(--sk-green)] border-[var(--sk-green)]/30',
                    varianceDetails.status === 'surplus' &&
                      'bg-[var(--sk-green-dim)] text-[var(--sk-green)] border-[var(--sk-green)]/40',
                    varianceDetails.status === 'shortfall' &&
                      'bg-[var(--sk-red-dim)] text-[var(--sk-red)] border-[var(--sk-red)]/40'
                  )}
                >
                  {varianceDetails.badgeText}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {varianceDetails.status === 'surplus' && (
                  <ArrowUpRight className="w-5 h-5 text-[var(--sk-green)] shrink-0" />
                )}
                {varianceDetails.status === 'shortfall' && (
                  <ArrowDownLeft className="w-5 h-5 text-[var(--sk-red)] shrink-0" />
                )}
                {varianceDetails.status === 'balanced' && (
                  <Check className="w-5 h-5 text-[var(--sk-green)] shrink-0" />
                )}
                <span
                  className={cn(
                    'text-xl font-bold tabular-nums',
                    varianceDetails.status === 'surplus' && 'text-[var(--sk-green)]',
                    varianceDetails.status === 'shortfall' && 'text-[var(--sk-red)]',
                    varianceDetails.status === 'balanced' && 'text-[var(--sk-green)]'
                  )}
                >
                  {varianceDetails.formattedDifference}
                </span>
              </div>

              <p className="text-[11px] text-[var(--sk-text-muted)] leading-relaxed">
                {varianceDetails.status === 'balanced' &&
                  'Saldo fisik tepat sesuai catatan buku. Rekonsiliasi akan dicatat sebagai riwayat audit tanpa perlu penyesuaian transaksi.'}
                {varianceDetails.status === 'surplus' &&
                  `Saldo fisik lebih besar ${formatIDR(varianceDetails.absDifference)}. Sistem akan membuat transaksi pemasukan penyesuaian untuk menyelaraskan saldo buku.`}
                {varianceDetails.status === 'shortfall' &&
                  `Saldo fisik lebih kecil ${formatIDR(varianceDetails.absDifference)}. Sistem akan membuat transaksi pengeluaran penyesuaian untuk menyelaraskan saldo buku.`}
              </p>
            </div>
          )}

          {/* 5. Adjustment Transaction Toggle (When difference !== 0) */}
          {varianceDetails && varianceDetails.status !== 'balanced' && (
            <div className="rounded-xl bg-[var(--sk-surface-2)]/40 border border-[var(--sk-border)] p-3 flex items-start gap-3">
              <input
                id="reconcile-create-adjustment"
                data-testid="reconcile-adjustment-toggle"
                type="checkbox"
                checked={createAdjustment}
                onChange={e => setCreateAdjustment(e.target.checked)}
                className="mt-0.5 rounded border-[var(--sk-border)] bg-[var(--sk-surface)] text-[var(--sk-cyan)] focus:ring-[var(--sk-cyan)]"
              />
              <label
                htmlFor="reconcile-create-adjustment"
                className="text-xs text-[var(--sk-text)] leading-relaxed cursor-pointer select-none"
              >
                <span className="font-semibold block">
                  Catat Penyesuaian ke Buku Transaksi
                </span>
                <span className="text-[11px] text-[var(--sk-text-dim)]">
                  Menambahkan transaksi penyesuaian baru secara non-destruktif. Transaksi lama tidak diubah ataupun dihapus.
                </span>
              </label>
            </div>
          )}

          {/* 6. Audit Note Input */}
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-[var(--sk-text-dim)] mb-1.5 block">
              Catatan Rekonsiliasi (Audit Note)
            </label>
            <input
              type="text"
              data-testid="reconcile-note-input"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={
                difference > 0
                  ? 'cth. Bunga tabungan / cashback belum dicatat'
                  : difference < 0
                    ? 'cth. Biaya admin bulanan / belanja lupa catat'
                    : 'cth. Pengecekan saldo mingguan'
              }
              className="w-full bg-[var(--sk-surface-2)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--sk-text)] placeholder:text-[var(--sk-text-dim)] outline-none border border-[var(--sk-border)] focus:border-[var(--sk-cyan)] transition-colors"
            />
          </div>

          {/* 7. Past Reconciliation History Drawer / Accordion */}
          {walletHistory.length > 0 && (
            <div className="rounded-xl border border-[var(--sk-border)] bg-[var(--sk-surface-2)]/30 overflow-hidden">
              <button
                type="button"
                data-testid="reconcile-history-toggle"
                onClick={() => setShowHistory(prev => !prev)}
                className="w-full px-3.5 py-2.5 flex items-center justify-between text-left hover:bg-[var(--sk-surface-2)]/60 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <History className="w-3.5 h-3.5 text-[var(--sk-text-dim)]" />
                  <span className="text-xs font-semibold text-[var(--sk-text)]">
                    Riwayat Rekonsiliasi Saku Ini ({walletHistory.length})
                  </span>
                </div>
                <ChevronDown
                  className={cn(
                    'w-3.5 h-3.5 text-[var(--sk-text-dim)] transition-transform duration-200',
                    showHistory && 'rotate-180'
                  )}
                />
              </button>

              {showHistory && (
                <div
                  data-testid="reconcile-history-list"
                  className="px-3.5 pb-3 pt-1 flex flex-col gap-2 border-t border-[var(--sk-border)]/50 divide-y divide-[var(--sk-border)]/40"
                >
                  {walletHistory.map(rec => {
                    const diffFormatted = formatReconciliationVariance(rec.difference)

                    return (
                      <div key={rec.id} className="pt-2 first:pt-1 flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-[var(--sk-text)]">
                            {formatTransactionDateTime(rec.reconciledAt)}
                          </span>
                          <span
                            className={cn(
                              'text-[10px] font-bold px-2 py-0.5 rounded-full',
                              rec.difference === 0 &&
                                'bg-[var(--sk-green-dim)] text-[var(--sk-green)]',
                              rec.difference > 0 &&
                                'bg-[var(--sk-green-dim)] text-[var(--sk-green)]',
                              rec.difference < 0 &&
                                'bg-[var(--sk-red-dim)] text-[var(--sk-red)]'
                            )}
                          >
                            {diffFormatted.formattedDifference}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-[var(--sk-text-dim)]">
                          <span>
                            Tercatat: {formatIDR(rec.expectedBalance)} → Fisik: {formatIDR(rec.actualBalance)}
                          </span>
                        </div>

                        {rec.note && (
                          <p className="text-[10px] text-[var(--sk-text-muted)] italic truncate">
                            &quot;{rec.note}&quot;
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="px-4 py-3.5 border-t border-[var(--sk-border)] flex items-center justify-end gap-2.5 bg-[var(--sk-surface)] flex-shrink-0">
          <button
            type="button"
            data-testid="reconcile-cancel-btn"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] hover:text-[var(--sk-text)] text-xs font-semibold transition-colors"
          >
            Batal
          </button>
          <button
            type="button"
            data-testid="reconcile-submit-btn"
            onClick={handleConfirm}
            disabled={!canSubmitReconcile}
            className={cn(
              'px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all',
              canSubmitReconcile
                ? 'bg-[var(--sk-cyan)] text-[#090D16] shadow-[0_0_12px_var(--sk-cyan-glow)] hover:opacity-95 active:scale-95'
                : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-dim)] cursor-not-allowed opacity-60'
            )}
          >
            <Check className="w-3.5 h-3.5" />
            <span>
              {difference !== 0 && createAdjustment
                ? 'Catat Penyesuaian'
                : 'Simpan Rekonsiliasi'}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
})
