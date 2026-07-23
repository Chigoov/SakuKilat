'use client'

import { memo, useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { BottomSheet } from '@/components/bottom-sheet'
import { FilterTabs, type FilterTab } from '@/components/filter-tabs'
import { TransactionList } from '@/components/transaction-list'
import { getCategoryConfig, getCategoryHex } from '@/components/category-badge'
import { formatIDR, formatIDRCompact, formatIDRShort } from '@/lib/parser'
import type { Transaction } from '@/lib/mock-data'
import { useTransactionActions, useTransactionData, useTransactionStatus } from '@/lib/store'
import {
  dailyAggregates,
  dayKey,
  rangeCategoryBreakdown,
  rangeTotals,
  subcategoryBreakdownForRange,
  topSavedCategory,
  transactionsForDay,
  transactionsForRange,
  trendSeriesForPeriod,
  type SubcategorySlice,
} from '@/lib/stats'
import { monthlyBreakdownForYear, type TrendPoint } from '@/lib/stats-rekapan-yearly'
import { cn } from '@/lib/utils'

type RecapMode = 'history' | 'calendar' | 'trend' | 'yearly'
type RangeMode = 'month' | '7d' | '30d' | '1y' | 'period'
type FilterType = FilterTab

interface CategoryDetailRow {
  id: string
  label: string
  total: number
  pct: number
  count: number
  color: string
  type: 'expense' | 'income'
}

interface DetailSheetState {
  mode: 'transactions' | 'categories'
  title: string
  subtitle?: string
  transactions: Transaction[]
  subcategories?: SubcategorySlice[]
  categories?: CategoryDetailRow[]
  total?: number
  trend?: TrendPoint[]
  trendType?: 'expense' | 'income'
}

const WEEKDAY_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function monthEndExclusive(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1)
}

function addMonths(date: Date, diff: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + diff, 1)
}

function dateOnly(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function formatRangeDate(date: Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
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

function rangeBounds(mode: RangeMode, selectedMonth: Date): { start: Date; end: Date; label: string } {
  const now = new Date()
  const today = dateOnly(now)

  if (mode === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1)
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
    return { start, end, label: `${formatRangeDate(start)} - ${formatRangeDate(today)}` }
  }

  if (mode === '7d') {
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6)
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
    return { start, end, label: `${formatRangeDate(start)} - ${formatRangeDate(today)}` }
  }

  if (mode === '30d') {
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29)
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
    return { start, end, label: `${formatRangeDate(start)} - ${formatRangeDate(today)}` }
  }

  if (mode === '1y') {
    const start = new Date(today.getFullYear(), today.getMonth() - 11, 1)
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 1)
    const endLabel = new Date(end.getFullYear(), end.getMonth(), 0)
    return { start, end, label: `${formatRangeDate(start)} - ${formatRangeDate(endLabel)}` }
  }

  const start = monthStart(selectedMonth)
  const end = monthEndExclusive(selectedMonth)
  const endLabel = new Date(end.getFullYear(), end.getMonth(), 0)
  return { start, end, label: `${formatRangeDate(start)} - ${formatRangeDate(endLabel)}` }
}

function monthGrid(month: Date) {
  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const firstDay = new Date(year, monthIndex, 1)
  const totalDays = new Date(year, monthIndex + 1, 0).getDate()
  const leading = firstDay.getDay()

  const cells: Array<{ key: string; day: number | null; date: Date | null }> = []
  for (let index = 0; index < leading; index += 1) {
    cells.push({ key: `empty-start-${index}`, day: null, date: null })
  }
  for (let day = 1; day <= totalDays; day += 1) {
    cells.push({
      key: `${year}-${monthIndex + 1}-${day}`,
      day,
      date: new Date(year, monthIndex, day),
    })
  }
  while (cells.length % 7 !== 0) {
    cells.push({ key: `empty-end-${cells.length}`, day: null, date: null })
  }
  return cells
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number; color?: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-3xl border border-[var(--sk-border)] bg-[var(--sk-surface)] px-4 py-3 text-xs shadow-2xl">
      <p className="mb-2 font-semibold text-[var(--sk-text)]">{label}</p>
      {payload.map((item) => (
        <div key={item.name} className="flex items-center gap-2 py-0.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
          <span className="text-[var(--sk-text-dim)]">{item.name}</span>
          <span className="ml-auto font-semibold text-[var(--sk-text)]">{formatIDR(item.value ?? 0)}</span>
        </div>
      ))}
    </div>
  )
}

export const TabRekapan = memo(function TabRekapan() {
  const { transactions } = useTransactionData()
  const { deleteTransaction, updateTransaction } = useTransactionActions()
  const { newTransactionId } = useTransactionStatus()
  const [mode, setMode] = useState<RecapMode>('history')
  const [rangeMode, setRangeMode] = useState<RangeMode>('month')
  const [filter, setFilter] = useState<FilterType>('semua')
  const [selectedMonth, setSelectedMonth] = useState(() => monthStart(new Date()))
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear())
  const [allocationType, setAllocationType] = useState<'expense' | 'income'>('expense')
  const [detailSheet, setDetailSheet] = useState<DetailSheetState | null>(null)

  useEffect(() => {
    void import('@/lib/achievements').then((module) => {
      const today = new Date()
      module.addToSet(module.REKAP_DAYS_KEY, `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`)
      module.setFlag('sakukilat:v2:tren-seen')
    })
  }, [])

  const bounds = useMemo(() => rangeBounds(rangeMode, selectedMonth), [rangeMode, selectedMonth])
  const rangeTransactions = useMemo(
    () => transactionsForRange(transactions, bounds.start, bounds.end),
    [bounds.end, bounds.start, transactions]
  )
  const filteredHistory = useMemo(() => {
    if (filter === 'pengeluaran') return rangeTransactions.filter((transaction) => transaction.type === 'expense')
    if (filter === 'pemasukan') return rangeTransactions.filter((transaction) => transaction.type === 'income')
    return rangeTransactions
  }, [filter, rangeTransactions])
  const historyCounts = useMemo(
    () => ({
      semua: rangeTransactions.length,
      pengeluaran: rangeTransactions.filter((transaction) => transaction.type === 'expense').length,
      pemasukan: rangeTransactions.filter((transaction) => transaction.type === 'income').length,
    }),
    [rangeTransactions]
  )

  const rangeTotalsData = useMemo(
    () => rangeTotals(transactions, bounds.start, bounds.end),
    [bounds.end, bounds.start, transactions]
  )
  const rangeExpenseBreakdown = useMemo(
    () => rangeCategoryBreakdown(transactions, bounds.start, bounds.end, 'expense'),
    [bounds.end, bounds.start, transactions]
  )
  const rangeIncomeBreakdown = useMemo(
    () => rangeCategoryBreakdown(transactions, bounds.start, bounds.end, 'income'),
    [bounds.end, bounds.start, transactions]
  )
  const trendSeries = useMemo(
    () => trendSeriesForPeriod(
      transactions,
      bounds.start,
      new Date(bounds.end.getFullYear(), bounds.end.getMonth(), bounds.end.getDate() - 1),
    ),
    [bounds.end, bounds.start, transactions]
  )

  const monthlyStart = monthStart(selectedMonth)
  const monthlyEnd = monthEndExclusive(selectedMonth)
  const monthTransactions = useMemo(
    () => transactionsForRange(transactions, monthlyStart, monthlyEnd),
    [monthlyEnd, monthlyStart, transactions]
  )
  const monthlyTotalsData = useMemo(
    () => rangeTotals(transactions, monthlyStart, monthlyEnd),
    [monthlyEnd, monthlyStart, transactions]
  )
  const monthAllocation = useMemo(
    () => rangeCategoryBreakdown(transactions, monthlyStart, monthlyEnd, allocationType),
    [allocationType, monthlyEnd, monthlyStart, transactions]
  )
  const monthDayMap = useMemo(() => dailyAggregates(monthTransactions), [monthTransactions])
  const savedCategory = useMemo(() => topSavedCategory(transactions), [transactions])

  const yearlyRows = useMemo(
    () => monthlyBreakdownForYear(transactions, selectedYear),
    [transactions, selectedYear]
  )
  const yearlyTotals = useMemo(() => {
    const income = yearlyRows.reduce((sum, row) => sum + row.income, 0)
    const expense = yearlyRows.reduce((sum, row) => sum + row.expense, 0)
    return { income, expense, balance: income - expense }
  }, [yearlyRows])

  const openTransactions = (
    title: string,
    items: Transaction[],
    subtitle?: string,
    subcategories?: SubcategorySlice[],
    total?: number,
    trend?: TrendPoint[],
    trendType?: 'expense' | 'income',
  ) => {
    setDetailSheet({
      mode: 'transactions',
      title,
      subtitle,
      transactions: [...items].sort((left, right) => right.date.getTime() - left.date.getTime()),
      subcategories,
      total,
      trend,
      trendType,
    })
  }

  const openCategorySummary = (type: 'expense' | 'income', title: string, source: CategoryDetailRow[]) => {
    setDetailSheet({
      mode: 'categories',
      title,
      subtitle: 'Pilih kategori untuk melihat sub kategori dan daftar transaksinya.',
      transactions: [],
      categories: source,
    })
  }

  const rangeExpenseRows = useMemo<CategoryDetailRow[]>(() => (
    rangeExpenseBreakdown.map((slice) => ({
      id: slice.category,
      label: getCategoryConfig(slice.category).label,
      total: slice.total,
      pct: slice.pct,
      count: rangeTransactions.filter((transaction) => transaction.type === 'expense' && transaction.category === slice.category).length,
      color: getCategoryHex(slice.category),
      type: 'expense',
    }))
  ), [rangeExpenseBreakdown, rangeTransactions])

  const rangeIncomeRows = useMemo<CategoryDetailRow[]>(() => (
    rangeIncomeBreakdown.map((slice) => ({
      id: slice.category,
      label: getCategoryConfig(slice.category).label,
      total: slice.total,
      pct: slice.pct,
      count: rangeTransactions.filter((transaction) => transaction.type === 'income' && transaction.category === slice.category).length,
      color: getCategoryHex(slice.category),
      type: 'income',
    }))
  ), [rangeIncomeBreakdown, rangeTransactions])

  const allocationEmpty = monthAllocation.length === 0

  return (
    <div className="flex min-h-full flex-col md:ml-[72px]">
      <div className="mx-auto w-full max-w-[560px] px-4 pb-[182px] pt-7 md:max-w-[980px] md:px-8 md:pt-8">
        <header className="mb-5">
          <h2 className="text-[30px] font-bold tracking-tight text-[var(--sk-text)] md:text-[36px]">Rekapan</h2>
        </header>

        <div className="mb-6 overflow-x-auto pb-1" data-tour="rekapan-tabs">
          <div className="inline-grid min-w-full grid-cols-4 gap-1.5 rounded-[14px] border border-[var(--sk-border)] bg-[var(--sk-surface)] p-1 md:rounded-[28px] md:gap-1 md:p-1">
            {([
              ['history', 'History'],
              ['calendar', 'Kalender'],
              ['trend', 'Tren'],
              ['yearly', 'Tahunan'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={cn(
                  'min-h-9 rounded-xl px-3 py-2 text-[13px] font-semibold transition-colors md:min-h-0 md:rounded-[22px] md:px-4 md:py-3 md:text-base md:lg:text-lg',
                  mode === value ? 'bg-[var(--sk-surface-3)] text-[var(--sk-text)] shadow-sm' : 'text-[var(--sk-text-muted)]'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {(mode === 'history' || mode === 'trend') && (
          <div className="mb-4 overflow-x-auto pb-1">
            <div className="flex w-max gap-2 md:gap-3">
              {([
                ['month', 'Bulan ini'],
                ['7d', '7 Hari'],
                ['30d', '30 Hari'],
                ['1y', '1 Tahun'],
                ['period', 'Periode'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRangeMode(value)}
                  className={cn(
                    'min-h-9 rounded-xl px-3 py-2 text-[12px] font-semibold transition-colors md:min-h-0 md:rounded-[20px] md:px-5 md:py-3 md:text-base md:lg:text-lg',
                    rangeMode === value
                      ? 'bg-[var(--sk-cyan)] text-[#090D16]'
                      : 'bg-[var(--sk-surface)] text-[var(--sk-text-muted)]'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === 'history' && (
          <section>
            <p className="mb-2.5 text-xs text-[var(--sk-text-dim)] md:mb-6 md:text-base md:lg:text-lg">History: {bounds.label}</p>

            <div className="grid grid-cols-2 gap-2 md:gap-4">
              <button
                type="button"
                onClick={() => openCategorySummary('expense', `Kategori pengeluaran ${bounds.label}`, rangeExpenseRows)}
                className="rounded-2xl border border-[var(--sk-border)] bg-[var(--sk-surface)] p-3 text-left shadow-[0_14px_34px_rgba(2,6,23,0.22)] md:rounded-[26px] md:p-5"
              >
                <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--sk-text-dim)] md:text-[13px]">Total keluar</p>
                <p className="mt-1.5 text-base font-bold text-[var(--sk-red)] md:mt-4 md:text-3xl">{formatIDR(rangeTotalsData.expense)}</p>
              </button>
              <button
                type="button"
                onClick={() => openCategorySummary('income', `Kategori pemasukan ${bounds.label}`, rangeIncomeRows)}
                className="rounded-2xl border border-[var(--sk-border)] bg-[var(--sk-surface)] p-3 text-left shadow-[0_14px_34px_rgba(2,6,23,0.22)] md:rounded-[26px] md:p-5"
              >
                <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--sk-text-dim)] md:text-[13px]">Total masuk</p>
                <p className="mt-1.5 text-base font-bold text-[var(--sk-green)] md:mt-4 md:text-3xl">{formatIDR(rangeTotalsData.income)}</p>
              </button>
            </div>

            <div className="my-3 border-t border-[var(--sk-border)] pt-3">
              <FilterTabs active={filter} onChange={setFilter} counts={historyCounts} />
            </div>

            <TransactionList
              transactions={filteredHistory}
              onDelete={deleteTransaction}
              onUpdate={updateTransaction}
              newTransactionId={newTransactionId}
              className="px-0 pb-0 md:px-0"
              compact
            />
          </section>
        )}

        {mode === 'calendar' && (
          <section className="rounded-[16px] border border-[var(--sk-border)] bg-[var(--sk-surface)] px-3 py-3 md:rounded-[32px] md:px-4 md:py-5">
            <div className="mb-3 flex items-center justify-between gap-2 md:mb-6 md:gap-3">
              <button
                type="button"
                onClick={() => setSelectedMonth((current) => addMonths(current, -1))}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] md:h-14 md:w-14 md:rounded-3xl"
              >
                <ChevronLeft className="h-4 w-4 md:h-6 md:w-6" />
              </button>
              <div className="text-center">
                <p className="text-sm font-bold text-[var(--sk-text)] md:text-2xl">
                  {new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(selectedMonth)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMonth((current) => addMonths(current, 1))}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] md:h-14 md:w-14 md:rounded-3xl"
              >
                <ChevronRight className="h-4 w-4 md:h-6 md:w-6" />
              </button>
            </div>

            <div className="mb-2 grid grid-cols-7 gap-1 md:mb-4 md:gap-2">
              {WEEKDAY_LABELS.map((label) => (
                <div key={label} className="pb-1 text-center text-[10px] font-medium text-[var(--sk-text-dim)] md:pb-2 md:text-sm">
                  {label}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1 md:gap-2">
              {monthGrid(selectedMonth).map((cell) => {
                if (!cell.date || cell.day === null) {
                  return <div key={cell.key} className="h-[66px] md:h-[92px]" />
                }

                const cellDate = cell.date
                const dateKeyValue = dayKey(cellDate)
                const agg = monthDayMap.get(dateKeyValue)
                const hasActivity = Boolean(agg && agg.count > 0)
                return (
                  <button
                    key={cell.key}
                    type="button"
                    onClick={() => {
                      if (!hasActivity) return
                      openTransactions(
                        parseDayLabel(dateKeyValue),
                        transactionsForDay(transactions, dateKeyValue),
                        `${agg?.count ?? 0} transaksi`
                      )
                    }}
                    className={cn(
                      'h-[66px] rounded-[12px] px-1 py-1 text-center transition-colors md:h-[92px] md:rounded-[24px] md:px-2 md:py-2',
                      hasActivity ? 'bg-[var(--sk-surface-2)]' : 'bg-transparent'
                    )}
                  >
                    <p className="text-[10px] font-semibold text-[var(--sk-text)] md:text-[12px]">{cell.day}</p>
                    {hasActivity && (
                      <div className="mt-0.5 space-y-0.5">
                        {agg?.expense ? (
                          <div className="text-[8px] leading-tight tracking-tight tabular-nums text-[var(--sk-red)]">
                            -{formatIDRShort(agg.expense)}
                          </div>
                        ) : null}
                        {agg?.income ? (
                          <div className="text-[8px] leading-tight tracking-tight tabular-nums text-[var(--sk-green)]">
                            +{formatIDRShort(agg.income)}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {mode === 'trend' && (
          <section className="space-y-2 md:space-y-5">
            <div className="rounded-[12px] border border-[var(--sk-border)] bg-[var(--sk-surface)] p-2 md:rounded-[32px] md:p-5">
              <div className="flex items-center justify-between gap-1 md:gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedMonth((current) => addMonths(current, -1))}
                  className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)]"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <div className="text-center">
                  <p className="text-sm font-bold text-[var(--sk-text)] md:text-2xl">
                    {new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(selectedMonth)}
                  </p>
                  <p className="mt-0.5 text-[7px] uppercase tracking-[0.24em] text-[var(--sk-text-dim)] md:mt-1 md:text-[13px]">Alokasi Bulanan</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedMonth((current) => addMonths(current, 1))}
                  className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)]"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </div>

              <div className="mt-2.5 grid grid-cols-2 gap-1.5 md:mt-6 md:gap-4">
                <button
                  type="button"
                  onClick={() => setAllocationType('income')}
                  className={cn(
                    'rounded-[12px] border p-2 text-left transition-colors md:rounded-[26px] md:p-5',
                    allocationType === 'income'
                      ? 'border-[rgba(52,211,153,0.4)] bg-[var(--sk-surface-2)]'
                      : 'border-[var(--sk-border)] bg-[var(--sk-surface)]'
                  )}
                >
                  <p className="text-[7px] uppercase tracking-[0.24em] text-[var(--sk-text-dim)] md:text-[13px]">Pendapatan</p>
                  <p className="mt-1 text-sm font-bold text-[var(--sk-green)] md:mt-4 md:text-3xl">{formatIDR(monthlyTotalsData.income)}</p>
                </button>
                <button
                  type="button"
                  onClick={() => setAllocationType('expense')}
                  className={cn(
                    'rounded-[26px] border p-5 text-left transition-colors',
                    allocationType === 'expense'
                      ? 'border-[rgba(248,113,113,0.55)] bg-[var(--sk-surface-2)] shadow-[inset_0_-4px_0_rgba(248,113,113,0.55)]'
                      : 'border-[var(--sk-border)] bg-[var(--sk-surface)]'
                  )}
                >
                  <p className="text-[7px] uppercase tracking-[0.24em] text-[var(--sk-text-dim)] md:text-[13px]">Pengeluaran</p>
                  <p className="mt-1 text-sm font-bold text-[var(--sk-red)] md:mt-4 md:text-3xl">{formatIDR(monthlyTotalsData.expense)}</p>
                </button>
              </div>

              <div className="mt-2.5 rounded-[12px] border border-dashed border-[var(--sk-border)] bg-[var(--sk-surface-2)] p-1.5 md:mt-6 md:rounded-[28px] md:p-4">
                {allocationEmpty ? (
                  <div className="flex h-[200px] items-center justify-center text-center text-xs text-[var(--sk-text-dim)] md:h-[260px] md:text-2xl">
                    Belum ada {allocationType === 'expense' ? 'pengeluaran' : 'pemasukan'}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="h-[200px] md:h-[240px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={monthAllocation.slice(0, 6)}
                            dataKey="total"
                            innerRadius={58}
                            outerRadius={92}
                            paddingAngle={3}
                            strokeWidth={0}
                          >
                            {monthAllocation.slice(0, 6).map((slice) => (
                              <Cell key={slice.category} fill={getCategoryHex(slice.category)} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-2">
                      {monthAllocation.slice(0, 4).map((slice) => (
                        <button
                          key={slice.category}
                          type="button"
                          onClick={() => openTransactions(
                            getCategoryConfig(slice.category).label,
                            monthTransactions.filter((transaction) => transaction.type === allocationType && transaction.category === slice.category),
                            new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(selectedMonth),
                            subcategoryBreakdownForRange(transactions, monthlyStart, monthlyEnd, slice.category, allocationType),
                          )}
                          className="flex w-full items-center gap-3 rounded-2xl bg-[var(--sk-surface)] px-3 py-3 text-left"
                        >
                          <span className="h-3 w-3 rounded-full" style={{ background: getCategoryHex(slice.category) }} />
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--sk-text)]">
                            {getCategoryConfig(slice.category).label}
                          </span>
                          <span className="text-xs font-bold text-[var(--sk-text)]">
                            {Math.round(slice.pct * 100)}%
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-2 rounded-[12px] border border-[var(--sk-border)] bg-[var(--sk-surface-2)] p-1.5 md:mt-5 md:rounded-[26px] md:p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold text-[var(--sk-text)] md:text-[18px]">
                      Alokasi {allocationType === 'expense' ? 'pengeluaran' : 'pemasukan'}
                    </p>
                    <p className="mt-0.5 text-[8px] text-[var(--sk-text-dim)] md:mt-1 md:text-sm">{monthAllocation.length} kategori tercatat</p>
                  </div>
                  <p className={cn(
                    'text-sm font-bold md:text-3xl',
                    allocationType === 'expense' ? 'text-[var(--sk-red)]' : 'text-[var(--sk-green)]'
                  )}>
                    {formatIDR(
                      allocationType === 'expense' ? monthlyTotalsData.expense : monthlyTotalsData.income
                    )}
                  </p>
                </div>

                <div className="my-4 h-px bg-[var(--sk-border)]" />

                {monthAllocation.length === 0 ? (
                  <p className="text-[10px] text-[var(--sk-text-dim)] md:text-lg">
                    Belum ada {allocationType === 'expense' ? 'pengeluaran' : 'pemasukan'} di bulan ini.
                  </p>
                ) : (
                  <div className="space-y-1 md:space-y-3">
                    {monthAllocation.slice(0, 5).map((slice) => (
                      <button
                        key={slice.category}
                        type="button"
                        onClick={() => openTransactions(
                          getCategoryConfig(slice.category).label,
                          monthTransactions.filter((transaction) => transaction.type === allocationType && transaction.category === slice.category),
                          new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(selectedMonth),
                          subcategoryBreakdownForRange(transactions, monthlyStart, monthlyEnd, slice.category, allocationType),
                        )}
                        className="flex w-full items-center gap-3 text-left"
                      >
                        <span className="h-3 w-3 rounded-full" style={{ background: getCategoryHex(slice.category) }} />
                        <span className="min-w-0 flex-1 truncate text-[8px] text-[var(--sk-text-muted)] md:text-[15px]">
                          {getCategoryConfig(slice.category).label}
                        </span>
                        <span className="text-sm font-semibold text-[var(--sk-text)]">
                          {Math.round(slice.pct * 100)}%
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => openCategorySummary('expense', `Kategori pengeluaran ${bounds.label}`, rangeExpenseRows)}
                className="rounded-[12px] border border-[var(--sk-border)] bg-[var(--sk-surface)] p-2 text-left md:rounded-[26px] md:p-5"
              >
                <p className="text-[7px] uppercase tracking-[0.24em] text-[var(--sk-text-dim)] md:text-[13px]">Pengeluaran</p>
                <p className="mt-4 text-3xl font-bold text-[var(--sk-red)]">{formatIDR(rangeTotalsData.expense)}</p>
              </button>
              <button
                type="button"
                onClick={() => openCategorySummary('income', `Kategori pemasukan ${bounds.label}`, rangeIncomeRows)}
                className="rounded-[26px] border border-[var(--sk-border)] bg-[var(--sk-surface)] p-5 text-left"
              >
                <p className="text-[7px] uppercase tracking-[0.24em] text-[var(--sk-text-dim)] md:text-[13px]">Pemasukan</p>
                <p className="mt-4 text-3xl font-bold text-[var(--sk-green)]">{formatIDR(rangeTotalsData.income)}</p>
              </button>
            </div>

            <div className="rounded-[12px] border border-[var(--sk-border)] bg-[var(--sk-surface)] p-2 md:rounded-[30px] md:p-5">
              <h3 className="text-xs font-semibold text-[var(--sk-text)] md:text-2xl">Pengeluaran vs Pemasukan</h3>
              <div className="mt-1.5 h-[130px] md:mt-4 md:h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendSeries}>
                    <CartesianGrid stroke="var(--sk-border)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: 'var(--sk-text-dim)', fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={(value) => formatIDRCompact(value)} tick={{ fill: 'var(--sk-text-dim)', fontSize: 11 }} tickLine={false} axisLine={false} width={90} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="expense" name="Pengeluaran" fill="var(--sk-red)" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="income" name="Pemasukan" fill="var(--sk-green)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-[30px] border border-[var(--sk-border)] bg-[var(--sk-surface)] p-5">
              <h3 className="text-xs font-semibold text-[var(--sk-text)] md:text-2xl">Tren Pengeluaran</h3>
              <div className="mt-1.5 rounded-[8px] border border-[rgba(255,255,255,0.12)] p-1 md:mt-4 md:rounded-[20px] md:p-3">
                <div className="h-[130px] md:h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendSeries}>
                      <CartesianGrid stroke="var(--sk-border)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: 'var(--sk-text-dim)', fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tickFormatter={(value) => formatIDRCompact(value)} tick={{ fill: 'var(--sk-text-dim)', fontSize: 11 }} tickLine={false} axisLine={false} width={90} />
                      <Tooltip content={<ChartTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="expense"
                        name="Pengeluaran"
                        stroke="var(--sk-cyan)"
                        strokeWidth={4}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {savedCategory && (
              <div className="rounded-[12px] border border-[rgba(16,185,129,0.28)] bg-[rgba(16,185,129,0.18)] p-2 md:rounded-[28px] md:p-5">
                <div className="flex items-start gap-1.5 md:gap-4">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[rgba(16,185,129,0.12)] md:h-14 md:w-14 md:rounded-2xl">
                    <span className="text-xs md:text-3xl">🍜</span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[var(--sk-green)] md:text-2xl">Penghematan minggu ini</p>
                    <p className="mt-0.5 text-[8px] leading-relaxed text-[var(--sk-text)] md:mt-2 md:text-[15px]">
                      Pengeluaran {getCategoryConfig(savedCategory).label} kamu lebih hemat dari minggu lalu. Pertahankan!
                    </p>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {mode === 'yearly' && (
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-2 rounded-[16px] border border-[var(--sk-border)] bg-[var(--sk-surface)] px-3 py-3 md:rounded-[28px] md:px-5 md:py-4">
              <button
                type="button"
                onClick={() => setSelectedYear((year) => year - 1)}
                className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)]"
                aria-label="Tahun sebelumnya"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <p className="text-lg font-bold text-[var(--sk-text)] md:text-2xl">{selectedYear}</p>
              <button
                type="button"
                onClick={() => setSelectedYear((year) => year + 1)}
                className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)]"
                aria-label="Tahun berikutnya"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 md:gap-4">
              <div className="rounded-[14px] border border-[var(--sk-border)] bg-[var(--sk-surface)] p-3 text-center md:rounded-[24px] md:p-5">
                <p className="text-[9px] uppercase tracking-[0.16em] text-[var(--sk-text-dim)] md:text-xs">Pendapatan</p>
                <p className="mt-1 text-sm font-bold text-[var(--sk-cyan)] md:text-xl">{formatIDRCompact(yearlyTotals.income)}</p>
              </div>
              <div className="rounded-[14px] border border-[var(--sk-border)] bg-[var(--sk-surface)] p-3 text-center md:rounded-[24px] md:p-5">
                <p className="text-[9px] uppercase tracking-[0.16em] text-[var(--sk-text-dim)] md:text-xs">Pengeluaran</p>
                <p className="mt-1 text-sm font-bold text-[var(--sk-red)] md:text-xl">{formatIDRCompact(yearlyTotals.expense)}</p>
              </div>
              <div className="rounded-[14px] border border-[var(--sk-border)] bg-[var(--sk-surface)] p-3 text-center md:rounded-[24px] md:p-5">
                <p className="text-[9px] uppercase tracking-[0.16em] text-[var(--sk-text-dim)] md:text-xs">Total</p>
                <p className={cn('mt-1 text-sm font-bold md:text-xl', yearlyTotals.balance >= 0 ? 'text-[var(--sk-text)]' : 'text-[var(--sk-red)]')}>{formatIDRCompact(yearlyTotals.balance)}</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-[16px] border border-[var(--sk-border)] bg-[var(--sk-surface)] md:rounded-[28px]">
              {yearlyRows.map((row) => {
                const hasData = row.income !== 0 || row.expense !== 0
                return (
                  <button
                    key={row.monthIndex}
                    type="button"
                    disabled={!hasData}
                    onClick={() => openTransactions(
                      `${row.label} ${selectedYear}`,
                      transactionsForRange(
                        transactions,
                        new Date(selectedYear, row.monthIndex, 1),
                        new Date(selectedYear, row.monthIndex + 1, 1),
                      ),
                      `${row.label} ${selectedYear}`,
                    )}
                    className={cn(
                      'flex w-full items-center gap-3 border-b border-[var(--sk-border)] px-3 py-3 text-left last:border-b-0 md:px-5 md:py-4',
                      hasData ? 'active:bg-[var(--sk-surface-2)]' : 'opacity-45'
                    )}
                  >
                    <span className="w-10 text-sm font-bold text-[var(--sk-text)] md:w-14 md:text-base">{row.label}</span>
                    <div className="flex-1 text-right">
                      <p className="text-xs font-semibold text-[var(--sk-cyan)] md:text-sm">{formatIDR(row.income)}</p>
                      <p className="text-xs font-semibold text-[var(--sk-red)] md:text-sm">{formatIDR(row.expense)}</p>
                    </div>
                    <span className={cn('w-24 text-right text-xs font-bold tabular-nums md:w-32 md:text-sm', row.balance >= 0 ? 'text-[var(--sk-text-muted)]' : 'text-[var(--sk-red)]')}>{formatIDR(row.balance)}</span>
                  </button>
                )
              })}
            </div>
          </section>
        )}
      </div>

      <BottomSheet
        open={Boolean(detailSheet)}
        onClose={() => setDetailSheet(null)}
        title={detailSheet?.title ?? ''}
        subtitle={detailSheet?.subtitle}
        bodyClassName="px-0 pb-2"
      >
        {detailSheet?.total != null && (
          <div className="px-4 pb-1">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--sk-text-dim)]">Total periode</p>
            <p className="mt-0.5 text-2xl font-bold text-[var(--sk-text)]">{formatIDR(detailSheet.total)}</p>
          </div>
        )}

        {(() => {
          const subs = detailSheet?.subcategories
          if (!subs || subs.length === 0) return null
          const base = detailSheet?.total && detailSheet.total > 0
            ? detailSheet.total
            : subs.reduce((sum, row) => sum + row.total, 0)
          return (
            <div className="px-4 pb-3 pt-2">
              <p className="mb-2 text-[10px] uppercase tracking-[0.22em] text-[var(--sk-text-dim)]">Sub kategori</p>
              <div className="space-y-1.5">
                {subs.map((item) => {
                  const pct = base > 0 ? Math.round((item.total / base) * 100) : 0
                  return (
                    <div
                      key={item.label}
                      className="flex items-center gap-3 rounded-2xl border border-[var(--sk-border)] bg-[var(--sk-surface-2)] px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[var(--sk-text)]">{item.label}</p>
                        <p className="mt-0.5 text-[11px] text-[var(--sk-text-dim)]">{item.count} transaksi · {pct}%</p>
                      </div>
                      <span className="text-xs font-bold tabular-nums text-[var(--sk-text)]">{formatIDRCompact(item.total)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        {detailSheet?.trend && detailSheet.trend.length > 0 && (
          <div className="px-4 pb-3">
            <p className="mb-2 text-[10px] uppercase tracking-[0.22em] text-[var(--sk-text-dim)]">Tren bulanan</p>
            <div className="h-[150px] rounded-2xl border border-[var(--sk-border)] bg-[var(--sk-surface-2)] p-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={detailSheet.trend}>
                  <CartesianGrid stroke="var(--sk-border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: 'var(--sk-text-dim)', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={(value) => formatIDRCompact(value)} tick={{ fill: 'var(--sk-text-dim)', fontSize: 11 }} tickLine={false} axisLine={false} width={70} />
                  <Tooltip content={<ChartTooltip />} />
                  <Line
                    type="monotone"
                    dataKey={detailSheet.trendType ?? 'expense'}
                    name={detailSheet.trendType === 'income' ? 'Pemasukan' : 'Pengeluaran'}
                    stroke={detailSheet.trendType === 'income' ? 'var(--sk-green)' : 'var(--sk-red)'}
                    strokeWidth={3}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {detailSheet?.mode === 'categories' ? (
          <div className="space-y-2 px-4">
            {detailSheet.categories && detailSheet.categories.length > 0 ? (
              detailSheet.categories.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openTransactions(
                    item.label,
                    rangeTransactions.filter((transaction) => transaction.type === item.type && transaction.category === item.id),
                    bounds.label,
                    subcategoryBreakdownForRange(transactions, bounds.start, bounds.end, item.id, item.type),
                    item.total,
                    trendSeriesForPeriod(
                      transactions.filter((transaction) => transaction.type === item.type && transaction.category === item.id),
                      new Date(bounds.end.getFullYear(), bounds.end.getMonth() - 7, 1),
                      new Date(bounds.end.getFullYear(), bounds.end.getMonth(), bounds.end.getDate() - 1),
                    ),
                    item.type,
                  )}
                  className="flex w-full items-center gap-3 rounded-2xl border border-[var(--sk-border)] bg-[var(--sk-surface-2)] px-3 py-3 text-left"
                >
                  <span className="h-3 w-3 rounded-full" style={{ background: item.color }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[var(--sk-text)]">{item.label}</p>
                    <p className="mt-1 text-[11px] text-[var(--sk-text-dim)]">
                      {item.count} transaksi - {Math.round(item.pct * 100)}%
                    </p>
                  </div>
                  <span className="text-xs font-bold tabular-nums text-[var(--sk-text)]">
                    {formatIDRCompact(item.total)}
                  </span>
                </button>
              ))
            ) : (
              <div className="rounded-2xl bg-[var(--sk-surface-2)] px-4 py-8 text-center text-sm text-[var(--sk-text-dim)]">
                Belum ada kategori di periode ini.
              </div>
            )}
          </div>
        ) : (
          <TransactionList
            transactions={detailSheet?.transactions ?? []}
            onDelete={deleteTransaction}
            onUpdate={updateTransaction}
            newTransactionId={newTransactionId}
            className="px-0 md:px-0"
          />
        )}
      </BottomSheet>
    </div>
  )
})
