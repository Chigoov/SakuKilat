'use client'

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ChevronRight,
  Lightbulb,
  Lock,
  PiggyBank,
  Scale,
  Target,
  Zap,
} from 'lucide-react'
import {
  useMonthlyCloseStore,
  useNetWorthStore,
  useTransactionActions,
  useTransactionData,
  useTransactionStatus,
} from '@/lib/store'
import { GoalPlanner } from '@/components/goal-planner'
import { BillManager } from '@/components/bill-manager'
import { MonthlyCloseModal } from '@/components/monthly-close-modal'
import { NetWorthModal } from '@/components/net-worth-panel'
import { CategoryBudgetCard } from '@/components/category-budget-card'
import { BottomSheet } from '@/components/bottom-sheet'
import { TransactionList } from '@/components/transaction-list'
import { getCategoryConfig } from '@/components/category-badge'
import { formatMonthLabel } from '@/lib/monthly-close'
import { formatIDR } from '@/lib/parser'
import {
  cashflowSummary,
  generateInsights,
  periodInsight,
  transactionsForDay,
} from '@/lib/stats'
import type { Transaction } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

interface RencanaDetailSheet {
  title: string
  subtitle?: string
  transactions: Transaction[]
}

function appMonthLabel(date = new Date()): string {
  return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(date)
}

function parseDayLabel(key: string): string {
  const [year, month, day] = key.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  }).format(date)
}

export const TabRencana = memo(function TabRencana() {
  const { monthlyCloses } = useMonthlyCloseStore()
  const { debts, netWorthSummary } = useNetWorthStore()
  const { transactions } = useTransactionData()
  const { deleteTransaction, updateTransaction } = useTransactionActions()
  const { newTransactionId } = useTransactionStatus()

  const [monthlyCloseModalOpen, setMonthlyCloseModalOpen] = useState(false)
  const [monthlyCloseYear, setMonthlyCloseYear] = useState<number | undefined>(undefined)
  const [monthlyCloseMonth, setMonthlyCloseMonth] = useState<number | undefined>(undefined)
  const [netWorthModalOpen, setNetWorthModalOpen] = useState(false)

  const [analysisScope, setAnalysisScope] = useState<'minggu' | 'bulan'>('minggu')
  const [detailSheet, setDetailSheet] = useState<RencanaDetailSheet | null>(null)

  const handleOpenMonthlyClose = useCallback((year?: number, month?: number) => {
    setMonthlyCloseYear(year)
    setMonthlyCloseMonth(month)
    setMonthlyCloseModalOpen(true)
  }, [])

  const handleOpenNetWorth = useCallback(() => {
    setNetWorthModalOpen(true)
  }, [])

  useEffect(() => {
    const handleCustomCloseEvent = (e: Event) => {
      const detail = (e as CustomEvent)?.detail
      handleOpenMonthlyClose(detail?.year, detail?.month)
    }
    window.addEventListener('sakukilat:open-monthly-close', handleCustomCloseEvent)
    return () => {
      window.removeEventListener('sakukilat:open-monthly-close', handleCustomCloseEvent)
    }
  }, [handleOpenMonthlyClose])

  useEffect(() => {
    const handleOpenNetWorthEvent = () => setNetWorthModalOpen(true)
    window.addEventListener('sakukilat:open-net-worth', handleOpenNetWorthEvent)
    return () => {
      window.removeEventListener('sakukilat:open-net-worth', handleOpenNetWorthEvent)
    }
  }, [])

  const latestClosedRecord = useMemo(() => {
    return monthlyCloses.find(r => !r.isReopened)
  }, [monthlyCloses])

  const activeDebtsCount = useMemo(() => {
    return debts.filter(d => !d.isSettled).length
  }, [debts])

  const now = useMemo(() => new Date(), [])
  const weeklyInsight = useMemo(() => periodInsight(transactions, 'minggu', now), [transactions, now])
  const monthlyInsight = useMemo(() => periodInsight(transactions, 'bulan', now), [transactions, now])
  const cashflow = useMemo(() => cashflowSummary(transactions, now), [transactions, now])
  const insights = useMemo(() => generateInsights(transactions, now), [transactions, now])
  const activeInsight = analysisScope === 'minggu' ? weeklyInsight : monthlyInsight

  const heroMonthLabel = appMonthLabel(now)
  const topCategoryLabel = activeInsight.topCategory ? getCategoryConfig(activeInsight.topCategory.category).label : null
  const topCategoryPct = activeInsight.topCategory ? Math.round(activeInsight.topCategory.pct * 100) : null

  const openTransactions = (title: string, entries: Transaction[], subtitle?: string) => {
    setDetailSheet({
      title,
      subtitle,
      transactions: [...entries].sort((left, right) => right.date.getTime() - left.date.getTime()),
    })
  }

  const openBusiestDay = () => {
    if (!activeInsight.busiestDay) return
    openTransactions(
      'Hari paling boros',
      transactionsForDay(transactions, activeInsight.busiestDay.key),
      `${parseDayLabel(activeInsight.busiestDay.key)} - ${formatIDR(activeInsight.busiestDay.total)}`
    )
  }

  const openTopCategory = () => {
    if (!activeInsight.topCategory) return
    const category = activeInsight.topCategory.category
    const entries = transactions.filter((transaction) => {
      const inScope = analysisScope === 'minggu'
        ? transaction.date >= new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
        : transaction.date >= new Date(now.getFullYear(), now.getMonth(), 1)
      return transaction.type === 'expense' && transaction.category === category && inScope
    })
    openTransactions(
      `Kategori ${getCategoryConfig(category).label}`,
      entries,
      analysisScope === 'minggu' ? '7 hari terakhir' : heroMonthLabel
    )
  }

  return (
    <div data-testid="tab-rencana-view" className="flex flex-col min-h-full md:ml-[72px]">
      {/* Header View */}
      <div className="sticky top-0 z-20 bg-[var(--sk-bg)] border-b border-[var(--sk-border)] px-4 md:px-8 py-3.5 sm:py-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[var(--sk-cyan-dim)] flex items-center justify-center text-[var(--sk-cyan)] shrink-0 border border-[var(--sk-cyan)]/25">
            <CalendarClock className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[var(--sk-text)] leading-tight">Rencana</h2>
            <p className="text-[11px] sm:text-xs text-[var(--sk-text-dim)] mt-0.5">
              Target tabungan, tagihan rutin, wawasan analisis, tutup buku, dan net worth.
            </p>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 px-3.5 sm:px-4 md:px-8 py-4 sm:py-5 flex flex-col gap-4 pb-12">
        {/* Modul 1: Target Tabungan (Goals) */}
        <section
          data-testid="rencana-module-goals"
          className="rounded-2xl border border-[var(--sk-border)] bg-[var(--sk-surface)] p-3.5 sm:p-4 shadow-sm"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-[rgba(168,85,247,0.16)] flex items-center justify-center text-[#a855f7] shrink-0">
              <Target className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-[var(--sk-text)] leading-tight">
                Target Tabungan (Goals)
              </h3>
              <p className="text-[10px] sm:text-[11px] text-[var(--sk-text-dim)]">
                Pantau progres tabungan, proyeksi bulanan & status kesehatan
              </p>
            </div>
          </div>
          <GoalPlanner />
        </section>

        {/* Modul 2: Pusat Tagihan & Langganan (Bills) */}
        <section
          data-testid="rencana-module-bills"
          className="rounded-2xl border border-[var(--sk-border)] bg-[var(--sk-surface)] p-3.5 sm:p-4 shadow-sm"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-[var(--sk-cyan-dim)] flex items-center justify-center text-[var(--sk-cyan)] shrink-0">
              <PiggyBank className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-[var(--sk-text)] leading-tight">
                Pusat Tagihan & Langganan
              </h3>
              <p className="text-[10px] sm:text-[11px] text-[var(--sk-text-dim)]">
                Pengingat jatuh tempo, partisi urgensi & konfirmasi pembayaran
              </p>
            </div>
          </div>
          <BillManager />
        </section>

        {/* Modul 3: Tutup Buku Bulanan (Monthly Close) */}
        <section
          data-testid="rencana-module-monthly-close"
          className="rounded-2xl border border-[var(--sk-border)] bg-[var(--sk-surface)] p-3.5 sm:p-4 shadow-sm"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-[var(--sk-cyan-dim)] flex items-center justify-center text-[var(--sk-cyan)] shrink-0 border border-[var(--sk-cyan)]/25">
                <Lock className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-xs sm:text-sm font-bold text-[var(--sk-text)]">
                    Tutup Buku Bulanan
                  </h3>
                  {latestClosedRecord ? (
                    <span
                      data-testid="rencana-closed-month-badge"
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-[var(--sk-cyan)] bg-[var(--sk-cyan-dim)] border border-[var(--sk-cyan)]/30 rounded-full px-2 py-0.5"
                    >
                      <Check className="w-3 h-3" />
                      {formatMonthLabel(latestClosedRecord.year, latestClosedRecord.month)} ditutup
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium text-[var(--sk-text-dim)] bg-[var(--sk-surface-2)] border border-[var(--sk-border)] px-2 py-0.5 rounded-full">
                      Siap evaluasi
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[var(--sk-text-dim)] mt-0.5 truncate">
                  Validasi checklist pra-tutup, kunci pembukuan & laporan akhir
                </p>
              </div>
            </div>

            <button
              type="button"
              data-testid="btn-open-monthly-close-rencana"
              onClick={() => handleOpenMonthlyClose()}
              className="shrink-0 h-10 px-3.5 min-h-[40px] rounded-xl bg-[var(--sk-cyan)] text-[#090D16] text-xs font-bold hover:opacity-90 active:scale-95 transition-all shadow-[0_0_8px_var(--sk-cyan-glow)] flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Kelola</span>
            </button>
          </div>
        </section>

        {/* Modul 4: Net Worth & Utang-Piutang */}
        <section
          data-testid="rencana-module-net-worth"
          className="rounded-2xl border border-[var(--sk-border)] bg-[var(--sk-surface)] p-3.5 sm:p-4 shadow-sm"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-[var(--sk-cyan-dim)] flex items-center justify-center text-[var(--sk-cyan)] shrink-0 border border-[var(--sk-cyan)]/25">
                <Scale className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-xs sm:text-sm font-bold text-[var(--sk-text)]">
                    Net Worth & Utang
                  </h3>
                  <span
                    className={cn(
                      'text-[10px] font-semibold px-2 py-0.5 rounded-full border',
                      netWorthSummary.netWorth >= 0
                        ? 'text-[var(--sk-green)] bg-[var(--sk-green-dim)] border-[var(--sk-green)]/30'
                        : 'text-[var(--sk-amber)] bg-[var(--sk-amber-dim)] border-[var(--sk-amber)]/30'
                    )}
                  >
                    {formatIDR(netWorthSummary.netWorth)}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--sk-text-dim)] mt-0.5 truncate">
                  Total aset dikurangi kewajiban ({activeDebtsCount} utang aktif)
                </p>
              </div>
            </div>

            <button
              type="button"
              data-testid="btn-open-net-worth-rencana"
              onClick={() => handleOpenNetWorth()}
              className="shrink-0 h-10 px-3.5 min-h-[40px] rounded-xl bg-[var(--sk-cyan)] text-[#090D16] text-xs font-bold hover:opacity-90 active:scale-95 transition-all shadow-[0_0_8px_var(--sk-cyan-glow)] flex items-center gap-1.5"
            >
              <Scale className="w-3.5 h-3.5" />
              <span>Kelola</span>
            </button>
          </div>
        </section>

        {/* Modul 5: Wawasan & Analisis Finansial Berkala */}
        <section
          data-testid="rencana-module-analytics"
          className="rounded-2xl border border-[var(--sk-border)] bg-[var(--sk-surface)] p-3.5 sm:p-4 shadow-sm"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-[var(--sk-cyan-dim)] flex items-center justify-center text-[var(--sk-cyan)] shrink-0">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-[var(--sk-text)] leading-tight">
                Wawasan & Analisis Lengkap
              </h3>
              <p className="text-[10px] sm:text-[11px] text-[var(--sk-text-dim)]">
                Proyeksi cashflow pintar, tren pengeluaran & evaluasi berkala
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <CategoryBudgetCard />

            {/* Widget Cashflow Pintar */}
            {cashflow.income > 0 && (
              <div className="rounded-[22px] border border-[var(--sk-border)] bg-[var(--sk-surface-2)]/50 p-3.5">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--sk-cyan-dim)]">
                    <Zap className="h-4 w-4 text-[var(--sk-cyan)]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[var(--sk-text)]">Cashflow Pintar</p>
                    <p className="text-[10px] text-[var(--sk-text-dim)]">{cashflow.periodLabel}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-[14px] border border-[var(--sk-border)] bg-[var(--sk-surface)] p-2.5">
                    <p className="text-[9px] uppercase tracking-[0.12em] text-[var(--sk-text-dim)]">Burn Rate</p>
                    <p className={cn('mt-0.5 text-[13px] font-bold tabular-nums',
                      cashflow.burnRate !== null && cashflow.burnRate > 1 ? 'text-[var(--sk-red)]' : 'text-[var(--sk-text)]'
                    )}>
                      {cashflow.burnRate !== null ? `${Math.round(cashflow.burnRate * 100)}%` : '-'}
                    </p>
                  </div>
                  <div className="rounded-[14px] border border-[var(--sk-border)] bg-[var(--sk-surface)] p-2.5">
                    <p className="text-[9px] uppercase tracking-[0.12em] text-[var(--sk-text-dim)]">Rasio Tabungan</p>
                    <p className={cn('mt-0.5 text-[13px] font-bold tabular-nums',
                      cashflow.savingsRatio !== null && cashflow.savingsRatio >= 0.2 ? 'text-[var(--sk-green)]' : 'text-[var(--sk-text)]'
                    )}>
                      {cashflow.savingsRatio !== null ? `${Math.round(cashflow.savingsRatio * 100)}%` : '-'}
                    </p>
                  </div>
                  <div className="rounded-[14px] border border-[var(--sk-border)] bg-[var(--sk-surface)] p-2.5">
                    <p className="text-[9px] uppercase tracking-[0.12em] text-[var(--sk-text-dim)]">Rata-rata/Hari</p>
                    <p className="mt-0.5 text-[11px] font-bold tabular-nums text-[var(--sk-text)]">
                      {formatIDR(Math.round(cashflow.avgDailyExpense))}
                    </p>
                  </div>
                  <div className="rounded-[14px] border border-[var(--sk-border)] bg-[var(--sk-surface)] p-2.5">
                    <p className="text-[9px] uppercase tracking-[0.12em] text-[var(--sk-text-dim)]">Proyeksi Akhir</p>
                    <p className={cn('mt-0.5 text-[11px] font-bold tabular-nums',
                      cashflow.projectedMonthNet < 0 ? 'text-[var(--sk-red)]' : 'text-[var(--sk-green)]'
                    )}>
                      {cashflow.projectedMonthNet < 0 ? '-' : ''}{formatIDR(Math.abs(cashflow.projectedMonthNet))}
                    </p>
                  </div>
                </div>

                {cashflow.warnings.length > 0 && (
                  <div className="mt-2.5 space-y-1">
                    {cashflow.warnings.map((warning, i) => (
                      <div key={i} className="flex items-start gap-1.5 rounded-xl bg-[rgba(239,68,68,0.08)] px-2.5 py-1.5">
                        <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0 text-[var(--sk-red)]" />
                        <p className="text-[11px] font-medium text-[var(--sk-red)]">{warning}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Widget Insight Otomatis */}
            {insights.length > 0 && (
              <div className="rounded-[22px] border border-[var(--sk-border)] bg-[var(--sk-surface-2)]/50 p-3.5">
                <div className="mb-2.5 flex items-center gap-2">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-[rgba(250,204,21,0.16)]">
                    <Lightbulb className="h-4 w-4 text-[#facc15]" />
                  </div>
                  <p className="text-xs font-bold text-[var(--sk-text)]">Insight Bulan Ini</p>
                </div>
                <div className="space-y-1.5">
                  {insights.map((insight, i) => (
                    <div
                      key={i}
                      className={cn(
                        'flex items-start gap-2 rounded-xl px-2.5 py-2',
                        insight.type === 'positive' ? 'bg-[rgba(16,185,129,0.08)]'
                          : insight.type === 'negative' ? 'bg-[rgba(239,68,68,0.08)]'
                          : 'bg-[var(--sk-surface)]'
                      )}
                    >
                      <span className="mt-0.5 flex-shrink-0 text-[14px]">{insight.emoji}</span>
                      <p className={cn(
                        'text-[12px] font-medium',
                        insight.type === 'positive' ? 'text-[var(--sk-green)]'
                          : insight.type === 'negative' ? 'text-[var(--sk-red)]'
                          : 'text-[var(--sk-text-muted)]'
                      )}>{insight.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Analisis Keuangan Mingguan/Bulanan */}
            <div className="rounded-[22px] border border-[var(--sk-border)] bg-[var(--sk-surface-2)]/50 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--sk-cyan-dim)]">
                    <Lightbulb className="h-4 w-4 text-[var(--sk-cyan)]" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-[var(--sk-text)]">Analisis Keuangan</h3>
                    <p className="text-[10px] text-[var(--sk-text-dim)]">
                      {analysisScope === 'minggu' ? '7 hari terakhir' : heroMonthLabel}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-0.5 rounded-xl border border-[var(--sk-border)] bg-[var(--sk-surface)] p-0.5">
                  {([
                    ['minggu', 'Mingguan'],
                    ['bulan', 'Bulanan'],
                  ] as const).map(([scope, label]) => (
                    <button
                      key={scope}
                      type="button"
                      onClick={() => setAnalysisScope(scope)}
                      className={cn(
                        'rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors',
                        analysisScope === scope ? 'bg-[var(--sk-cyan)] text-[#090D16]' : 'text-[var(--sk-text-muted)]'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-[var(--sk-border)] bg-[var(--sk-surface)] p-2">
                  <p className="text-[9px] uppercase tracking-[0.16em] text-[var(--sk-text-dim)]">Keluar</p>
                  <p className="mt-1 text-[11px] font-bold leading-tight tabular-nums text-[var(--sk-red)]">{formatIDR(activeInsight.expense)}</p>
                </div>
                <div className="rounded-xl border border-[var(--sk-border)] bg-[var(--sk-surface)] p-2">
                  <p className="text-[9px] uppercase tracking-[0.16em] text-[var(--sk-text-dim)]">Masuk</p>
                  <p className="mt-1 text-[11px] font-bold leading-tight tabular-nums text-[var(--sk-green)]">{formatIDR(activeInsight.income)}</p>
                </div>
                <div className="rounded-xl border border-[var(--sk-border)] bg-[var(--sk-surface)] p-2">
                  <p className="text-[9px] uppercase tracking-[0.16em] text-[var(--sk-text-dim)]">Rata/hari</p>
                  <p className="mt-1 text-[11px] font-bold leading-tight tabular-nums text-[var(--sk-text)]">{formatIDR(activeInsight.avgPerDay)}</p>
                </div>
              </div>

              <div className={cn(
                'mt-2.5 rounded-xl px-3 py-2 text-[12px] font-medium',
                activeInsight.deltaPct !== null && activeInsight.deltaPct <= 0
                  ? 'bg-[rgba(16,185,129,0.14)] text-[var(--sk-green)]'
                  : 'bg-[var(--sk-surface)] text-[var(--sk-text-muted)]'
              )}>
                {activeInsight.deltaPct === null
                  ? 'Belum ada pembanding periode sebelumnya'
                  : activeInsight.deltaPct < 0
                    ? `Turun ${Math.abs(activeInsight.deltaPct)}% dari ${analysisScope === 'minggu' ? 'minggu lalu' : 'bulan lalu'}`
                    : activeInsight.deltaPct > 0
                      ? `Naik ${activeInsight.deltaPct}% dari ${analysisScope === 'minggu' ? 'minggu lalu' : 'bulan lalu'}`
                      : 'Stabil dari periode sebelumnya'}
              </div>

              <div className="mt-3 space-y-2 text-[12px]">
                <button
                  type="button"
                  onClick={openTopCategory}
                  disabled={!activeInsight.topCategory}
                  className="flex w-full items-center justify-between gap-2 text-left disabled:cursor-default"
                >
                  <span className="text-[var(--sk-text-dim)]">Kategori terboros</span>
                  <span className="flex items-center gap-1 font-semibold text-[var(--sk-text)]">
                    {topCategoryLabel ? `${topCategoryLabel} (${topCategoryPct}%)` : '-'}
                    {activeInsight.topCategory && <ChevronRight className="h-3.5 w-3.5 text-[var(--sk-text-dim)]" />}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={openBusiestDay}
                  disabled={!activeInsight.busiestDay}
                  className="flex w-full items-center justify-between gap-2 text-left disabled:cursor-default"
                >
                  <span className="text-[var(--sk-text-dim)]">Hari paling boros</span>
                  <span className="flex items-center gap-1 font-semibold text-[var(--sk-text)]">
                    {activeInsight.busiestDay
                      ? `${parseDayLabel(activeInsight.busiestDay.key)} ${formatIDR(activeInsight.busiestDay.total)}`
                      : '-'}
                    {activeInsight.busiestDay && <ChevronRight className="h-3.5 w-3.5 text-[var(--sk-text-dim)]" />}
                  </span>
                </button>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[var(--sk-text-dim)]">Jumlah transaksi</span>
                  <span className="font-semibold text-[var(--sk-text)]">{activeInsight.txCount}</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Modals Hosted in Rencana */}
      <MonthlyCloseModal
        open={monthlyCloseModalOpen}
        onClose={() => setMonthlyCloseModalOpen(false)}
        initialYear={monthlyCloseYear}
        initialMonth={monthlyCloseMonth}
      />

      <NetWorthModal
        open={netWorthModalOpen}
        onClose={() => setNetWorthModalOpen(false)}
      />

      <BottomSheet
        open={Boolean(detailSheet)}
        onClose={() => setDetailSheet(null)}
        title={detailSheet?.title ?? ''}
        subtitle={detailSheet?.subtitle}
        bodyClassName="px-0 pb-2"
      >
        <TransactionList
          transactions={detailSheet?.transactions ?? []}
          onDelete={deleteTransaction}
          onUpdate={updateTransaction}
          newTransactionId={newTransactionId}
          className="px-0 md:px-0"
          initialVisibleCount={80}
          loadMoreCount={80}
        />
      </BottomSheet>
    </div>
  )
})
