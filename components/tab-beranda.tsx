'use client'

import { memo, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { AlertTriangle, Flame, Lightbulb, Target, TrendingDown, TrendingUp, Trophy, ChevronRight, Zap } from 'lucide-react'
import { BudgetCard } from '@/components/budget-card'
import { CategoryBudgetCard } from '@/components/category-budget-card'
import { BottomSheet } from '@/components/bottom-sheet'
import { FilterTabs, type FilterTab } from '@/components/filter-tabs'
import { NotificationBell } from '@/components/notification-bell'
import { TransactionList } from '@/components/transaction-list'
import { readGoalSnapshot, type Goal } from '@/components/goal-tracker'
import { buildContext, evaluateBadges, BADGES } from '@/lib/achievements'
import { formatIDR, formatIDRCompact } from '@/lib/parser'
import type { Transaction } from '@/lib/mock-data'
import {
  useBudgetStore,
  useCustomizationStore,
  useTransactionActions,
  useTransactionData,
  useTransactionStatus,
  useWalletStore,
} from '@/lib/store'
import {
  cashflowSummary,
  categoryBreakdown,
  generateInsights,
  monthlyBudgetStatus,
  monthlyTotals,
  periodInsight,
  streakStatus,
  transactionsForDay,
} from '@/lib/stats'
import { cn } from '@/lib/utils'
import { getCategoryConfig } from '@/components/category-badge'

interface HomeDetailSheet {
  title: string
  subtitle?: string
  transactions: Transaction[]
}

function appMonthLabel(date = new Date()): string {
  return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(date)
}

function fullDateLabel(date = new Date()): string {
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function greetingLabel(date = new Date()): string {
  const hour = date.getHours()
  if (hour < 11) return 'Selamat pagi, Kamu!'
  if (hour < 15) return 'Selamat siang, Kamu!'
  if (hour < 19) return 'Selamat sore, Kamu!'
  return 'Selamat malam, Kamu!'
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

function deltaHeadline(deltaPct: number | null): string {
  if (deltaPct === null) return 'Belum ada pembanding minggu lalu.'
  if (deltaPct < 0) return `Lebih hemat ${Math.abs(deltaPct)}% dari minggu lalu.`
  if (deltaPct > 0) return `Naik ${deltaPct}% dari minggu lalu.`
  return 'Stabil dibanding minggu lalu.'
}

// recharts di-code-split: dimuat setelah shell Beranda tampil, bukan di critical
// path. Placeholder ringan menjaga tinggi layout supaya tidak ada layout shift.
const MonthHeroChart = dynamic(
  () => import('@/components/month-hero-chart').then((mod) => mod.MonthHeroChart),
  {
    ssr: false,
    loading: () => (
      <div className="mx-auto flex h-[190px] w-full max-w-[320px] items-center justify-center">
        <div className="h-[168px] w-[168px] rounded-full border-[8px] border-[var(--sk-border-2)] animate-pulse-soft" />
      </div>
    ),
  }
)

export const TabBeranda = memo(function TabBeranda() {
  const { transactions } = useTransactionData()
  const { deleteTransaction, updateTransaction } = useTransactionActions()
  const { newTransactionId } = useTransactionStatus()
  const { wallets } = useWalletStore()
  const { monthlyBudget } = useBudgetStore()
  const { customPayments, customCategories } = useCustomizationStore()
  const [filter, setFilter] = useState<FilterTab>('semua')
  const [analysisScope, setAnalysisScope] = useState<'minggu' | 'bulan'>('minggu')
  const [goals, setGoals] = useState<Goal[]>([])
  const [detailSheet, setDetailSheet] = useState<HomeDetailSheet | null>(null)

  useEffect(() => {
    const syncGoals = () => setGoals(readGoalSnapshot())
    syncGoals()
    window.addEventListener('sakukilat:goals-changed', syncGoals)
    window.addEventListener('storage', syncGoals)
    return () => {
      window.removeEventListener('sakukilat:goals-changed', syncGoals)
      window.removeEventListener('storage', syncGoals)
    }
  }, [])

  const now = new Date()
  const monthTotals = useMemo(() => monthlyTotals(transactions, now), [transactions])
  const streak = useMemo(() => streakStatus(transactions, now), [transactions])
  const budgetStatus = useMemo(() => monthlyBudgetStatus(transactions, monthlyBudget, now), [monthlyBudget, transactions])
  const weeklyInsight = useMemo(() => periodInsight(transactions, 'minggu', now), [transactions])
  const monthlyInsight = useMemo(() => periodInsight(transactions, 'bulan', now), [transactions])
  const cashflow = useMemo(() => cashflowSummary(transactions, now), [transactions])
  const insights = useMemo(() => generateInsights(transactions, now), [transactions])
  const activeInsight = analysisScope === 'minggu' ? weeklyInsight : monthlyInsight
  const expenseSlices = useMemo(
    () => categoryBreakdown(transactions, now, 'expense').slice(0, 5),
    [transactions]
  )
  const todayTransactions = useMemo(
    () => transactionsForDay(transactions, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`),
    [transactions, now]
  )
  const recentTransactions = useMemo(
    () => [...todayTransactions].sort((left, right) => right.date.getTime() - left.date.getTime()),
    [todayTransactions]
  )

  const counts = useMemo(
    () => ({
      semua: recentTransactions.length,
      pengeluaran: recentTransactions.filter((transaction) => transaction.type === 'expense').length,
      pemasukan: recentTransactions.filter((transaction) => transaction.type === 'income').length,
    }),
    [recentTransactions]
  )

  const filteredTransactions = useMemo(() => {
    if (filter === 'pengeluaran') return recentTransactions.filter((transaction) => transaction.type === 'expense')
    if (filter === 'pemasukan') return recentTransactions.filter((transaction) => transaction.type === 'income')
    return recentTransactions
  }, [filter, recentTransactions])

  // Dibungkus useMemo: evaluateBadges/buildContext meng-iterasi seluruh transaksi
  // x seluruh aturan badge. Tanpa memo, ini jalan pada SETIAP render (toast, ketik,
  // ganti tab) dan nge-block main thread → UI freeze di HP. Sekarang hanya
  // dihitung ulang saat dependency-nya benar-benar berubah.
  const badges = useMemo(
    () => evaluateBadges(buildContext({
      transactions,
      walletsCount: wallets.length,
      customPaymentsCount: customPayments.length,
      customCategoriesCount: customCategories.length,
      goalsTotal: goals.length,
      goalsCompleted: goals.filter((goal) => goal.saved >= goal.target).length,
    })),
    [transactions, wallets.length, customPayments.length, customCategories.length, goals]
  )
  const unlockedBadges = badges.filter((badge) => badge.unlocked).length

  const savingsRate = monthTotals.income > 0
    ? Math.max(-999, Math.round((monthTotals.balance / monthTotals.income) * 100))
    : null
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
      `Hari paling boros`,
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
    <div className="flex min-h-full flex-col md:ml-[72px]">
      <div className="mx-auto w-full max-w-[560px] px-4 pb-[176px] pt-5 md:max-w-[860px] md:px-8 md:pt-7">
        <section className="mb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <img
                  src="/brand/sakukilat-logo-official-v1.png"
                  alt=""
                  className="h-11 w-11 rounded-2xl shadow-[0_12px_30px_rgba(56,189,248,0.18)]"
                />
                <div className="min-w-0">
                  <p className="truncate text-[23px] font-bold text-[var(--sk-text)]">SakuKilat</p>
                  <p className="mt-1 text-[15px] text-[var(--sk-text-muted)]">{greetingLabel(now)}</p>
                  <p className="mt-1 whitespace-nowrap text-[12px] text-[var(--sk-text-dim)]">
                    {fullDateLabel(now)} | Hari ke-{now.getDate()} dari {budgetStatus.daysInMonth} ({budgetStatus.remainingDays} hari lagi)
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <NotificationBell />
            </div>
          </div>
        </section>

        <section className="mb-4 rounded-[24px] border border-[var(--sk-border)] bg-[var(--sk-surface)] p-3 shadow-[0_18px_40px_rgba(7,10,20,0.16)]">
          <div className="flex items-center justify-between gap-3">
            <p className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-[var(--sk-text)]">
              <span className="h-3 w-3 shrink-0 rounded-full bg-[var(--sk-cyan)]" />
              <span className="truncate">{streak.loggedToday ? `${streak.current} hari beruntun` : 'Mulai catat hari ini'}</span>
            </p>
            <p className="shrink-0 text-right text-[12px] font-semibold text-[var(--sk-green)]">
              {deltaHeadline(weeklyInsight.deltaPct)}
            </p>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--sk-border)] pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(250,204,21,0.16)] px-2.5 py-1 text-[12px] font-semibold text-[#facc15]">
                <Trophy className="h-3.5 w-3.5" />
                {unlockedBadges}/{BADGES.length} lencana
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--sk-surface-2)] px-2.5 py-1 text-[12px] font-semibold text-[var(--sk-text-muted)]">
                <Flame className="h-3.5 w-3.5 text-[var(--sk-amber)]" />
                {streak.current} hari
              </div>
            </div>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('sakukilat:navigate', { detail: { tab: 'profil' } }))}
              className="shrink-0 text-[12px] text-[var(--sk-text-dim)]"
            >
              Detail di Profil
            </button>
          </div>
        </section>

        <section className="mb-4 rounded-[26px] border border-[var(--sk-border)] bg-[var(--sk-surface)] p-4">
          <MonthHeroChart
            empty={monthTotals.income === 0 && monthTotals.expense === 0}
            slices={expenseSlices}
            centerLabel={monthlyBudget > 0 ? `${Math.round((budgetStatus.spent / monthlyBudget) * 100)}% Budget` : 'Keluar'}
            centerValue={formatIDRCompact(monthTotals.expense)}
          />

          <div className="mt-2.5">
            <p className="text-[12px] uppercase tracking-[0.24em] text-[var(--sk-text-dim)]">
              Saldo Bersih — {heroMonthLabel}
            </p>
            <p className={cn(
              'mt-1.5 text-[28px] font-bold leading-none tracking-tight tabular-nums',
              monthTotals.balance < 0 ? 'text-[var(--sk-red)]' : 'text-[var(--sk-text)]'
            )}>
              {monthTotals.balance < 0 ? `-${formatIDR(Math.abs(monthTotals.balance))}` : formatIDR(monthTotals.balance)}
            </p>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-[var(--sk-green-dim)]">
                  <TrendingUp className="h-4 w-4 text-[var(--sk-green)]" />
                </div>
                <div className="min-w-0">
                  <p className="text-[12px] text-[var(--sk-text-dim)]">Masuk</p>
                  <p className="text-[15px] font-bold leading-tight tabular-nums text-[var(--sk-green)]">{formatIDR(monthTotals.income)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-[var(--sk-red-dim)]">
                  <TrendingDown className="h-4 w-4 text-[var(--sk-red)]" />
                </div>
                <div className="min-w-0">
                  <p className="text-[12px] text-[var(--sk-text-dim)]">Keluar</p>
                  <p className="text-[15px] font-bold leading-tight tabular-nums text-[var(--sk-red)]">{formatIDR(monthTotals.expense)}</p>
                </div>
              </div>
            </div>

            {savingsRate !== null && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-[rgba(52,211,153,0.2)] bg-[var(--sk-green-dim)] px-3 py-1.5 text-[13px] font-semibold text-[var(--sk-green)]">
                <span className="h-2.5 w-2.5 rounded-full bg-current" />
                Tingkat tabungan {savingsRate}%
              </div>
            )}
          </div>
        </section>

        <BudgetCard />
        <CategoryBudgetCard />

        {/* ── Widget Cashflow Pintar ─────────────────────────────────── */}
        {cashflow.income > 0 && (
          <section className="mt-5 rounded-[26px] border border-[var(--sk-border)] bg-[var(--sk-surface)] p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-[var(--sk-cyan-dim)]">
                <Zap className="h-4 w-4 text-[var(--sk-cyan)]" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--sk-text)]">Cashflow Pintar</p>
                <p className="text-[11px] text-[var(--sk-text-dim)]">{cashflow.periodLabel}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-[16px] border border-[var(--sk-border)] bg-[var(--sk-surface-2)] p-3">
                <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--sk-text-dim)]">Burn Rate</p>
                <p className={cn('mt-1 text-[14px] font-bold tabular-nums',
                  cashflow.burnRate !== null && cashflow.burnRate > 1 ? 'text-[var(--sk-red)]' : 'text-[var(--sk-text)]'
                )}>
                  {cashflow.burnRate !== null ? `${Math.round(cashflow.burnRate * 100)}%` : '-'}
                </p>
              </div>
              <div className="rounded-[16px] border border-[var(--sk-border)] bg-[var(--sk-surface-2)] p-3">
                <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--sk-text-dim)]">Rasio Tabungan</p>
                <p className={cn('mt-1 text-[14px] font-bold tabular-nums',
                  cashflow.savingsRatio !== null && cashflow.savingsRatio >= 0.2 ? 'text-[var(--sk-green)]' : 'text-[var(--sk-text)]'
                )}>
                  {cashflow.savingsRatio !== null ? `${Math.round(cashflow.savingsRatio * 100)}%` : '-'}
                </p>
              </div>
              <div className="rounded-[16px] border border-[var(--sk-border)] bg-[var(--sk-surface-2)] p-3">
                <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--sk-text-dim)]">Rata-rata/Hari</p>
                <p className="mt-1 text-[12px] font-bold tabular-nums text-[var(--sk-text)]">
                  {formatIDR(Math.round(cashflow.avgDailyExpense))}
                </p>
              </div>
              <div className="rounded-[16px] border border-[var(--sk-border)] bg-[var(--sk-surface-2)] p-3">
                <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--sk-text-dim)]">Proyeksi Akhir</p>
                <p className={cn('mt-1 text-[12px] font-bold tabular-nums',
                  cashflow.projectedMonthNet < 0 ? 'text-[var(--sk-red)]' : 'text-[var(--sk-green)]'
                )}>
                  {cashflow.projectedMonthNet < 0 ? '-' : ''}{formatIDR(Math.abs(cashflow.projectedMonthNet))}
                </p>
              </div>
            </div>

            {cashflow.warnings.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {cashflow.warnings.map((warning, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-2xl bg-[rgba(239,68,68,0.08)] px-3 py-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[var(--sk-red)]" />
                    <p className="text-[12px] font-medium text-[var(--sk-red)]">{warning}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── Widget Insight Otomatis ────────────────────────────────── */}
        {insights.length > 0 && (
          <section className="mt-5 rounded-[26px] border border-[var(--sk-border)] bg-[var(--sk-surface)] p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-[rgba(250,204,21,0.16)]">
                <Lightbulb className="h-4 w-4 text-[#facc15]" />
              </div>
              <p className="text-sm font-semibold text-[var(--sk-text)]">Insight Bulan Ini</p>
            </div>
            <div className="space-y-2">
              {insights.map((insight, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex items-start gap-2.5 rounded-2xl px-3 py-2.5',
                    insight.type === 'positive' ? 'bg-[rgba(16,185,129,0.08)]'
                      : insight.type === 'negative' ? 'bg-[rgba(239,68,68,0.08)]'
                      : 'bg-[var(--sk-surface-2)]'
                  )}
                >
                  <span className="mt-0.5 flex-shrink-0 text-[16px]">{insight.emoji}</span>
                  <p className={cn(
                    'text-[13px] font-medium',
                    insight.type === 'positive' ? 'text-[var(--sk-green)]'
                      : insight.type === 'negative' ? 'text-[var(--sk-red)]'
                      : 'text-[var(--sk-text-muted)]'
                  )}>{insight.text}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Widget Goal Progress Mini ──────────────────────────────── */}
        {goals.length > 0 && (
          <section className="mt-5 rounded-[26px] border border-[var(--sk-border)] bg-[var(--sk-surface)] p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-[rgba(168,85,247,0.16)]">
                  <Target className="h-4 w-4 text-[#a855f7]" />
                </div>
                <p className="text-sm font-semibold text-[var(--sk-text)]">Target Tabungan</p>
              </div>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('sakukilat:navigate', { detail: { tab: 'profil' } }))}
                className="text-[12px] text-[var(--sk-text-dim)]"
              >
                Lihat semua
              </button>
            </div>
            <div className="space-y-3">
              {goals.slice(0, 3).map((goal) => {
                const pct = goal.target > 0 ? Math.min(100, Math.round((goal.saved / goal.target) * 100)) : 0
                const done = goal.saved >= goal.target
                return (
                  <div key={goal.id}>
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--sk-text)]">{goal.label}</span>
                      <span className={cn(
                        'flex-shrink-0 text-[12px] font-semibold tabular-nums',
                        done ? 'text-[var(--sk-green)]' : 'text-[var(--sk-text-muted)]'
                      )}>
                        {formatIDR(goal.saved)} / {formatIDR(goal.target)}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--sk-surface-2)]">
                      <div
                        className={cn(
                          'h-full rounded-full transition-[width]',
                          done ? 'bg-[var(--sk-green)]' : 'bg-[#a855f7]'
                        )}
                        style={{ width: `${Math.max(pct, goal.saved > 0 ? 4 : 0)}%` }}
                      />
                    </div>
                    <p className="mt-0.5 text-[11px] tabular-nums text-[var(--sk-text-dim)]">
                      {done ? '✅ Tercapai!' : `${pct}% — sisa ${formatIDR(goal.target - goal.saved)}`}
                    </p>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        <section className="mt-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[13px] uppercase tracking-[0.24em] text-[var(--sk-text-muted)]">Rekapan hari ini</h2>
            <span className="text-[12px] text-[var(--sk-text-dim)]">{recentTransactions.length} transaksi</span>
          </div>
          <div className="mt-3">
            <FilterTabs active={filter} onChange={setFilter} counts={counts} />
          </div>
          <div className="mt-4">
            <TransactionList
              transactions={filteredTransactions}
              onDelete={deleteTransaction}
              onUpdate={updateTransaction}
              newTransactionId={newTransactionId}
              className="px-0 pb-0 md:px-0"
              initialVisibleCount={40}
              loadMoreCount={40}
            />
          </div>
        </section>

        <section className="mt-5 rounded-[26px] border border-[var(--sk-border)] bg-[var(--sk-surface)] p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--sk-cyan-dim)]">
                <Lightbulb className="h-4 w-4 text-[var(--sk-cyan)]" />
              </div>
              <div>
                <h2 className="text-[26px] font-bold text-[var(--sk-text)]">Analisis Keuangan</h2>
                <p className="mt-1 text-[13px] text-[var(--sk-text-dim)]">
                  Periode: {analysisScope === 'minggu' ? '7 hari terakhir' : heroMonthLabel}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1 rounded-2xl border border-[var(--sk-border)] bg-[var(--sk-surface-2)] p-1">
              {([
                ['minggu', 'Mingguan'],
                ['bulan', 'Bulanan'],
              ] as const).map(([scope, label]) => (
                <button
                  key={scope}
                  type="button"
                  onClick={() => setAnalysisScope(scope)}
                  className={cn(
                    'rounded-xl px-3 py-2 text-[13px] font-semibold transition-colors',
                    analysisScope === scope ? 'bg-[var(--sk-cyan)] text-[#090D16]' : 'text-[var(--sk-text-muted)]'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2.5">
            <div className="rounded-[20px] border border-[var(--sk-border)] bg-[var(--sk-surface-2)] p-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--sk-text-dim)]">Keluar</p>
              <p className="mt-2 text-[12px] font-bold leading-tight tabular-nums text-[var(--sk-red)]">{formatIDR(activeInsight.expense)}</p>
            </div>
            <div className="rounded-[20px] border border-[var(--sk-border)] bg-[var(--sk-surface-2)] p-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--sk-text-dim)]">Masuk</p>
              <p className="mt-2 text-[12px] font-bold leading-tight tabular-nums text-[var(--sk-green)]">{formatIDR(activeInsight.income)}</p>
            </div>
            <div className="rounded-[20px] border border-[var(--sk-border)] bg-[var(--sk-surface-2)] p-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--sk-text-dim)]">Rata/hari</p>
              <p className="mt-2 text-[12px] font-bold leading-tight tabular-nums text-[var(--sk-text)]">{formatIDR(activeInsight.avgPerDay)}</p>
            </div>
          </div>

          <div className={cn(
            'mt-3 rounded-full px-4 py-3 text-[14px] font-semibold',
            activeInsight.deltaPct !== null && activeInsight.deltaPct <= 0
              ? 'bg-[rgba(16,185,129,0.18)] text-[var(--sk-green)]'
              : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)]'
          )}>
            {activeInsight.deltaPct === null
              ? 'Belum ada pembanding periode sebelumnya'
              : activeInsight.deltaPct < 0
                ? `Turun ${Math.abs(activeInsight.deltaPct)}% dari ${analysisScope === 'minggu' ? 'minggu lalu' : 'bulan lalu'}`
                : activeInsight.deltaPct > 0
                  ? `Naik ${activeInsight.deltaPct}% dari ${analysisScope === 'minggu' ? 'minggu lalu' : 'bulan lalu'}`
                  : 'Stabil dari periode sebelumnya'}
          </div>

          <div className="mt-4 space-y-3 text-[14px]">
            <button
              type="button"
              onClick={openTopCategory}
              disabled={!activeInsight.topCategory}
              className="flex w-full items-center justify-between gap-3 text-left disabled:cursor-default"
            >
              <span className="text-[var(--sk-text-dim)]">Kategori terboros</span>
              <span className="flex items-center gap-1 font-semibold text-[var(--sk-text)]">
                {topCategoryLabel ? `${topCategoryLabel} (${topCategoryPct}%)` : '-'}
                {activeInsight.topCategory && <ChevronRight className="h-4 w-4 text-[var(--sk-text-dim)]" />}
              </span>
            </button>
            <button
              type="button"
              onClick={openBusiestDay}
              disabled={!activeInsight.busiestDay}
              className="flex w-full items-center justify-between gap-3 text-left disabled:cursor-default"
            >
              <span className="text-[var(--sk-text-dim)]">Hari paling boros</span>
              <span className="flex items-center gap-1 font-semibold text-[var(--sk-text)]">
                {activeInsight.busiestDay
                  ? `${parseDayLabel(activeInsight.busiestDay.key)} ${formatIDR(activeInsight.busiestDay.total)}`
                  : '-'}
                {activeInsight.busiestDay && <ChevronRight className="h-4 w-4 text-[var(--sk-text-dim)]" />}
              </span>
            </button>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[var(--sk-text-dim)]">Jumlah transaksi</span>
              <span className="font-semibold text-[var(--sk-text)]">{activeInsight.txCount}</span>
            </div>
          </div>
        </section>
      </div>

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
