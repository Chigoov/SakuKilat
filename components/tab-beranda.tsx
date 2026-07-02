'use client'

import { memo, useEffect, useMemo, useState } from 'react'
import { ChevronRight, Eye, EyeOff, Flame, Lightbulb, TrendingDown, TrendingUp, Trophy } from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { BudgetCard } from '@/components/budget-card'
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
  usePreferenceStore,
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
import { getCategoryConfig, getCategoryHex } from '@/components/category-badge'
import { APP_NAME } from '@/lib/app-variant'

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

function recommendationText(categoryLabel: string | null, pct: number | null, net: number): string {
  if (!categoryLabel || pct === null) {
    return net >= 0
      ? 'Arus bulan ini masih aman. Lanjutkan ritmenya.'
      : 'Belum ada pola kuat. Fokus jaga total keluar.'
  }

  if (pct >= 45) return `Rem ${categoryLabel} dulu. Porsinya sudah ${pct}% dari total keluar.`
  if (pct >= 30) return `${categoryLabel} mulai dominan. Cek lagi frekuensinya minggu ini.`
  return `Sebarannya masih sehat. Tetap pantau ${categoryLabel}.`
}

function amountToneClass(label: string, variant: 'hero' | 'card'): string {
  const compactLabel = label.replace(/\s+/g, '')
  if (variant === 'hero') {
    if (compactLabel.length >= 16) return 'text-[clamp(1.4rem,5.8vw,2rem)]'
    if (compactLabel.length >= 13) return 'text-[clamp(1.56rem,6.4vw,2.2rem)]'
    return 'text-[clamp(1.72rem,7.1vw,2.42rem)]'
  }

  if (compactLabel.length >= 13) return 'text-[clamp(0.66rem,2.55vw,0.92rem)]'
  if (compactLabel.length >= 10) return 'text-[clamp(0.72rem,2.8vw,1rem)]'
  return 'text-[clamp(0.76rem,3vw,1.08rem)]'
}

function MonthHeroChart({
  empty,
  slices,
}: {
  empty: boolean
  slices: Array<{ category: string; total: number }>
}) {
  if (empty) {
    return (
      <div className="animate-home-chart-spin mx-auto flex h-[148px] w-full max-w-[240px] items-center justify-center">
        <div className="flex h-[140px] w-[140px] items-center justify-center rounded-full border-[7px] border-dashed border-[var(--sk-border-2)] text-center text-xs leading-relaxed text-[var(--sk-text-dim)]">
          Belum
          <br />
          ada data
        </div>
      </div>
    )
  }

  return (
    <div className="animate-home-chart-spin mx-auto h-[148px] w-full max-w-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={slices}
            dataKey="total"
            innerRadius={44}
            outerRadius={68}
            paddingAngle={3}
            strokeWidth={0}
          >
            {slices.map((slice) => (
              <Cell key={slice.category} fill={getCategoryHex(slice.category)} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

export const TabBeranda = memo(function TabBeranda() {
  const { transactions } = useTransactionData()
  const { deleteTransaction, updateTransaction } = useTransactionActions()
  const { newTransactionId } = useTransactionStatus()
  const { wallets } = useWalletStore()
  const { monthlyBudget } = useBudgetStore()
  const { customPayments, customCategories } = useCustomizationStore()
  const { zenMode, toggleZen } = usePreferenceStore()
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
  const activeInsight = analysisScope === 'minggu' ? weeklyInsight : monthlyInsight
  const expenseSlices = useMemo(
    () => categoryBreakdown(transactions, now, 'expense').slice(0, 5),
    [transactions]
  )
  const recentTransactions = useMemo(
    () => [...transactions].sort((left, right) => right.date.getTime() - left.date.getTime()),
    [transactions]
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

  const badges = evaluateBadges(buildContext({
    transactions,
    walletsCount: wallets.length,
    customPaymentsCount: customPayments.length,
    customCategoriesCount: customCategories.length,
    goalsTotal: goals.length,
    goalsCompleted: goals.filter((goal) => goal.saved >= goal.target).length,
  }))
  const unlockedBadges = badges.filter((badge) => badge.unlocked).length

  const savingsRate = monthTotals.income > 0
    ? Math.round((monthTotals.balance / monthTotals.income) * 100)
    : null
  const heroMonthLabel = appMonthLabel(now)
  const topCategoryLabel = activeInsight.topCategory ? getCategoryConfig(activeInsight.topCategory.category).label : null
  const topCategoryPct = activeInsight.topCategory ? Math.round(activeInsight.topCategory.pct * 100) : null
  const balanceLabel = monthTotals.balance < 0
    ? `-${formatIDR(Math.abs(monthTotals.balance))}`
    : formatIDR(monthTotals.balance)
  const incomeLabel = formatIDRCompact(monthTotals.income)
  const expenseLabel = formatIDRCompact(monthTotals.expense)
  const analysisExpenseLabel = formatIDRCompact(activeInsight.expense)
  const analysisIncomeLabel = formatIDRCompact(activeInsight.income)
  const analysisAvgLabel = formatIDRCompact(activeInsight.avgPerDay)

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
      <div className="mx-auto w-full max-w-[560px] px-4 pb-[182px] pt-5 md:max-w-[860px] md:px-8 md:pt-8">
        <section className="mb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--sk-cyan)] shadow-[0_10px_24px_rgba(56,189,248,0.18)]">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-[#090D16]" aria-hidden>
                    <path d="M13 3L4 14h7l-1 7 9-11h-7l1-7z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[22px] font-bold text-[var(--sk-text)]">{APP_NAME}</p>
                  <p className="mt-0.5 text-[15px] text-[var(--sk-text-muted)]">{greetingLabel(now)}</p>
                  <p className="mt-0.5 truncate whitespace-nowrap text-[11px] text-[var(--sk-text-dim)]">
                    {fullDateLabel(now)} | Hari ke-{now.getDate()} dari {budgetStatus.daysInMonth}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <NotificationBell />
              <button
                type="button"
                onClick={toggleZen}
                aria-label={zenMode ? 'Matikan Zen Mode' : 'Aktifkan Zen Mode'}
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--sk-border)] bg-[var(--sk-surface)] text-[var(--sk-text-muted)]"
              >
                {zenMode ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </section>

        <section className="mb-4 rounded-[24px] border border-[var(--sk-border)] bg-[var(--sk-surface)] p-3 shadow-[0_18px_40px_rgba(7,10,20,0.16)]">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--sk-border)] pb-2.5">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-xs font-semibold text-[var(--sk-text)]">
                <span className="h-3.5 w-3.5 rounded-full bg-[var(--sk-cyan)]" />
                {streak.loggedToday ? `${streak.current} hari beruntun` : 'Mulai catat hari ini'}
              </p>
            </div>
            <p className="text-right text-[11px] font-semibold text-[var(--sk-green)]">
              {deltaHeadline(weeklyInsight.deltaPct)}
            </p>
          </div>

          <p className="py-2.5 text-xs leading-relaxed text-[var(--sk-text-dim)]">
            {streak.loggedToday
              ? 'Hari ini sudah tercatat. Pertahankan ritmenya.'
              : 'Catat hari ini untuk mulai streak lagi.'}
          </p>

          <div className="flex items-center justify-between gap-3 border-t border-[var(--sk-border)] pt-2.5">
            <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(250,204,21,0.16)] px-2.5 py-1 text-xs font-semibold text-[#facc15]">
                  <Trophy className="h-4 w-4" />
                  {unlockedBadges}/{BADGES.length} lencana
                </div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--sk-surface-2)] px-2.5 py-1 text-xs font-semibold text-[var(--sk-text-muted)]">
                  <Flame className="h-4 w-4 text-[var(--sk-amber)]" />
                  {streak.current} hari
                </div>
              </div>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('sakukilat:navigate', { detail: { tab: 'profil' } }))}
              className="text-[13px] text-[var(--sk-text-dim)]"
            >
              Detail di Profil
            </button>
          </div>
        </section>

        <section className="mb-4 rounded-[28px] border border-[var(--sk-border)] bg-[var(--sk-surface)] p-4">
          <MonthHeroChart empty={monthTotals.income === 0 && monthTotals.expense === 0} slices={expenseSlices} />

          {expenseSlices.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
              {expenseSlices.map((slice) => {
                const pct = monthTotals.expense > 0 ? Math.round((slice.total / monthTotals.expense) * 1000) / 10 : 0
                return (
                  <div key={slice.category} className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                      style={{ background: getCategoryHex(slice.category) }}
                    />
                    <span className="truncate text-[11px] text-[var(--sk-text-dim)]">
                      {getCategoryConfig(slice.category).label}
                    </span>
                    <span className="ml-auto flex-shrink-0 text-[11px] font-semibold tabular-nums text-[var(--sk-text-muted)]">
                      {pct}%
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          <div className="mt-2">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--sk-text-dim)]">
              Saldo Bersih - {heroMonthLabel}
            </p>
            <p className={cn(
              'mt-1.5 whitespace-nowrap font-bold leading-[0.95] tracking-tight text-[var(--sk-text)]',
              amountToneClass(balanceLabel, 'hero'),
              monthTotals.balance < 0 && 'text-[var(--sk-red)]'
            )}>
              {balanceLabel}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--sk-green-dim)]">
                  <TrendingUp className="h-4.5 w-4.5 text-[var(--sk-green)]" />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] text-[var(--sk-text-dim)]">Masuk</p>
                  <p className={cn(
                    'whitespace-nowrap font-bold leading-tight tabular-nums text-[var(--sk-green)]',
                    amountToneClass(incomeLabel, 'card')
                  )}>
                    {incomeLabel}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--sk-red-dim)]">
                  <TrendingDown className="h-4.5 w-4.5 text-[var(--sk-red)]" />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] text-[var(--sk-text-dim)]">Keluar</p>
                  <p className={cn(
                    'whitespace-nowrap font-bold leading-tight tabular-nums text-[var(--sk-red)]',
                    amountToneClass(expenseLabel, 'card')
                  )}>
                    {expenseLabel}
                  </p>
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

        <section className="mt-4 rounded-[24px] border border-[var(--sk-border)] bg-[var(--sk-surface)] p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[18px] bg-[var(--sk-cyan-dim)]">
                <Lightbulb className="h-4.5 w-4.5 text-[var(--sk-cyan)]" />
              </div>
              <div>
                <h2 className="text-[1.45rem] font-bold leading-tight text-[var(--sk-text)]">Analisis Keuangan</h2>
                <p className="mt-0.5 text-[13px] text-[var(--sk-text-dim)]">
                  Periode: {analysisScope === 'minggu' ? '7 hari terakhir' : heroMonthLabel}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1 rounded-[18px] border border-[var(--sk-border)] bg-[var(--sk-surface-2)] p-1">
              {([
                ['minggu', 'Mingguan'],
                ['bulan', 'Bulanan'],
              ] as const).map(([scope, label]) => (
                <button
                  key={scope}
                  type="button"
                  onClick={() => setAnalysisScope(scope)}
                  className={cn(
                    'rounded-xl px-3 py-1.5 text-[13px] font-semibold transition-colors',
                    analysisScope === scope ? 'bg-[var(--sk-cyan)] text-[#090D16]' : 'text-[var(--sk-text-muted)]'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2.5">
            <div className="rounded-[18px] border border-[var(--sk-border)] bg-[var(--sk-surface-2)] p-2.5">
              <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--sk-text-dim)]">Keluar</p>
              <p className={cn(
                'mt-1.5 whitespace-nowrap font-bold leading-tight tabular-nums text-[var(--sk-red)]',
                amountToneClass(analysisExpenseLabel, 'card')
              )}>
                {analysisExpenseLabel}
              </p>
            </div>
            <div className="rounded-[18px] border border-[var(--sk-border)] bg-[var(--sk-surface-2)] p-2.5">
              <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--sk-text-dim)]">Masuk</p>
              <p className={cn(
                'mt-1.5 whitespace-nowrap font-bold leading-tight tabular-nums text-[var(--sk-green)]',
                amountToneClass(analysisIncomeLabel, 'card')
              )}>
                {analysisIncomeLabel}
              </p>
            </div>
            <div className="rounded-[18px] border border-[var(--sk-border)] bg-[var(--sk-surface-2)] p-2.5">
              <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--sk-text-dim)]">Rata/hari</p>
              <p className={cn(
                'mt-1.5 whitespace-nowrap font-bold leading-tight tabular-nums text-[var(--sk-text)]',
                amountToneClass(analysisAvgLabel, 'card')
              )}>
                {analysisAvgLabel}
              </p>
            </div>
          </div>

          <div className={cn(
            'mt-3.5 rounded-full px-4 py-2.5 text-[15px] font-semibold',
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

          <div className="mt-3.5 space-y-2 text-[14px]">
            <button
              type="button"
              onClick={openTopCategory}
              disabled={!activeInsight.topCategory}
              className="flex min-h-10 w-full items-center justify-between gap-3 rounded-2xl border border-transparent px-2.5 py-2.5 text-left transition-colors enabled:hover:border-[var(--sk-border)] enabled:hover:bg-[var(--sk-surface-2)] disabled:cursor-default"
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
              className="flex min-h-10 w-full items-center justify-between gap-3 rounded-2xl border border-transparent px-2.5 py-2.5 text-left transition-colors enabled:hover:border-[var(--sk-border)] enabled:hover:bg-[var(--sk-surface-2)] disabled:cursor-default"
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

          <div className="mt-3.5 rounded-[22px] border border-[var(--sk-border)] bg-[var(--sk-surface-2)] p-3.5">
            <ul className="space-y-2.5 text-[14px] leading-relaxed text-[var(--sk-text-muted)]">
              {activeInsight.takeaways.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="text-[var(--sk-cyan)]">*</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-3.5 rounded-[22px] border border-[rgba(56,189,248,0.18)] bg-[rgba(32,55,83,0.55)] p-3.5">
            <p className="text-[12px] uppercase tracking-[0.24em] text-[var(--sk-cyan)]">Rekomendasi</p>
            <p className="mt-2.5 text-[14px] leading-relaxed text-[var(--sk-text-muted)]">
              {recommendationText(topCategoryLabel, topCategoryPct, activeInsight.net)}
            </p>
          </div>
        </section>

        <section className="mt-5">
          <h2 className="text-[13px] uppercase tracking-[0.24em] text-[var(--sk-text-muted)]">History hari ini</h2>
          <div className="mt-4">
            <FilterTabs active={filter} onChange={setFilter} counts={counts} />
          </div>
          <div className="mt-5">
            <TransactionList
              transactions={filteredTransactions}
              onDelete={deleteTransaction}
              onUpdate={updateTransaction}
              newTransactionId={newTransactionId}
              className="px-0 pb-0 md:px-0"
            />
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
        />
      </BottomSheet>
    </div>
  )
})
