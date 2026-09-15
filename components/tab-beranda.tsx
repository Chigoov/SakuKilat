'use client'

import { memo, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { TrendingDown, TrendingUp, Trophy } from 'lucide-react'
import { BudgetCard } from '@/components/budget-card'
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
  categoryBreakdown,
  monthlyBudgetStatus,
  monthlyTotals,
  periodInsight,
  streakStatus,
  transactionsForDay,
} from '@/lib/stats'
import { cn } from '@/lib/utils'

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
  const [goals, setGoals] = useState<Goal[]>([])

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

  return (
    <div className="flex min-h-full flex-col md:ml-[72px]">
      <div className="mx-auto w-full max-w-[560px] px-3 sm:px-4 pb-[160px] pt-2 sm:pt-4 md:max-w-[860px] md:px-8 md:pt-7">
        <section className="mb-2 sm:mb-3">
          <div className="flex items-start justify-between gap-2.5 sm:gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 sm:gap-3">
                <img
                  src="/brand/sakukilat-logo-official-v1.png"
                  alt=""
                  className="h-9 w-9 sm:h-11 sm:w-11 rounded-2xl shadow-[0_12px_30px_rgba(56,189,248,0.18)]"
                />
                <div className="min-w-0">
                  <p className="truncate text-[19px] sm:text-[22px] font-bold text-[var(--sk-text)] leading-tight">SakuKilat</p>
                  <p className="text-[12px] sm:text-[14px] text-[var(--sk-text-muted)] leading-tight mt-0.5">{greetingLabel(now)}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] sm:text-[12px] text-[var(--sk-text-dim)]">
                    <span className="font-medium text-[var(--sk-text-muted)]">{fullDateLabel(now)}</span>
                    <span className="hidden sm:inline text-[var(--sk-text-dim)]">•</span>
                    <span>
                      Hari ke-{now.getDate()} dari {budgetStatus.daysInMonth} ({budgetStatus.remainingDays} hari lagi)
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <NotificationBell />
            </div>
          </div>
        </section>

        <section className="mb-2 sm:mb-3 rounded-[16px] sm:rounded-[24px] border border-[var(--sk-border)] bg-[var(--sk-surface)] p-2 sm:p-3 shadow-[0_8px_20px_rgba(7,10,20,0.1)]">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--sk-cyan)]" />
              <span className="truncate text-[11px] sm:text-xs font-semibold text-[var(--sk-text)]">
                {streak.loggedToday ? `${streak.current} hari beruntun` : 'Mulai catat hari ini'}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(250,204,21,0.14)] px-1.5 py-0.5 text-[9px] sm:text-[10px] font-semibold text-[#facc15] shrink-0">
                <Trophy className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                {unlockedBadges}/{BADGES.length}
              </span>
            </div>
            <p className="min-w-0 text-right text-[10px] sm:text-[11px] font-semibold text-[var(--sk-green)] truncate shrink-0">
              {deltaHeadline(weeklyInsight.deltaPct)}
            </p>
          </div>
        </section>

        <section className="mb-2 sm:mb-3 rounded-[20px] sm:rounded-[26px] border border-[var(--sk-border)] bg-[var(--sk-surface)] p-2.5 sm:p-4">
          <MonthHeroChart
            empty={monthTotals.income === 0 && monthTotals.expense === 0}
            slices={expenseSlices}
            centerLabel={monthlyBudget > 0 ? `${Math.round((budgetStatus.spent / monthlyBudget) * 100)}% Budget` : 'Keluar'}
            centerValue={formatIDRCompact(monthTotals.expense)}
          />

          <div className="mt-1.5 sm:mt-2.5">
            <p className="text-[10px] sm:text-[12px] uppercase tracking-[0.2em] text-[var(--sk-text-dim)]">
              Saldo Bersih — {heroMonthLabel}
            </p>
            <p className={cn(
              'mt-0.5 sm:mt-1 text-[22px] sm:text-[28px] font-bold leading-none tracking-tight tabular-nums',
              monthTotals.balance < 0 ? 'text-[var(--sk-red)]' : 'text-[var(--sk-text)]'
            )}>
              {monthTotals.balance < 0 ? `-${formatIDR(Math.abs(monthTotals.balance))}` : formatIDR(monthTotals.balance)}
            </p>

            <div className="mt-2 sm:mt-3 grid grid-cols-2 gap-1.5 sm:gap-2">
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <div className="flex h-7 w-7 sm:h-9 sm:w-9 flex-shrink-0 items-center justify-center rounded-lg sm:rounded-2xl bg-[var(--sk-green-dim)]">
                  <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[var(--sk-green)]" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-[12px] text-[var(--sk-text-dim)]">Masuk</p>
                  <p className="text-[13px] sm:text-[15px] font-bold leading-tight tabular-nums text-[var(--sk-green)]">{formatIDR(monthTotals.income)}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <div className="flex h-7 w-7 sm:h-9 sm:w-9 flex-shrink-0 items-center justify-center rounded-lg sm:rounded-2xl bg-[var(--sk-red-dim)]">
                  <TrendingDown className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[var(--sk-red)]" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-[12px] text-[var(--sk-text-dim)]">Keluar</p>
                  <p className="text-[13px] sm:text-[15px] font-bold leading-tight tabular-nums text-[var(--sk-red)]">{formatIDR(monthTotals.expense)}</p>
                </div>
              </div>
            </div>

            {savingsRate !== null && (
              <div className="mt-1.5 sm:mt-3 inline-flex items-center gap-1.5 rounded-full border border-[rgba(52,211,153,0.2)] bg-[var(--sk-green-dim)] px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-[12px] font-semibold text-[var(--sk-green)]">
                <span className="h-2 w-2 rounded-full bg-current" />
                Tingkat tabungan {savingsRate}%
              </div>
            )}
          </div>
        </section>

        <BudgetCard />

        {/* ── Rekapan Hari Ini (Prioritas Utama Pencatatan) ─────────── */}
        <section className="mt-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[13px] uppercase tracking-[0.24em] text-[var(--sk-text-muted)]">Rekapan hari ini</h2>
            <span className="text-[12px] text-[var(--sk-text-dim)]">{recentTransactions.length} transaksi</span>
          </div>
          <div className="mt-2.5">
            <FilterTabs active={filter} onChange={setFilter} counts={counts} />
          </div>
          <div className="mt-3">
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
      </div>
    </div>
  )
})
