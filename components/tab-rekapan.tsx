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
import { ChevronLeft, ChevronRight, Minus, Search, TrendingDown, TrendingUp, X } from 'lucide-react'
import { BottomSheet } from '@/components/bottom-sheet'
import { FilterTabs, type FilterTab } from '@/components/filter-tabs'
import { TransactionList } from '@/components/transaction-list'
import { getCategoryConfig, getCategoryHex } from '@/components/category-badge'
import { formatIDR, formatIDRCompact, formatIDRShort } from '@/lib/parser'
import type { Transaction } from '@/lib/mock-data'
import { useTransactionActions, useTransactionData, useTransactionStatus } from '@/lib/store'
import {
  categoryMonthlyComparison,
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
import { cn } from '@/lib/utils'

type RecapMode = 'history' | 'calendar' | 'trend'
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

function toDateInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function fromDateInputValue(value: string): Date | null {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
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

function rangeBounds(
  mode: RangeMode,
  selectedMonth: Date,
  period?: { start: Date; end: Date }
): { start: Date; end: Date; label: string } {
  const now = new Date()
  const today = dateOnly(now)

  if (mode === 'period') {
    let start = dateOnly(period?.start ?? monthStart(selectedMonth))
    let endLabel = dateOnly(period?.end ?? today)
    if (endLabel < start) {
      const tmp = start
      start = endLabel
      endLabel = tmp
    }
    // end is exclusive: include the whole "sampai" day
    const end = new Date(endLabel.getFullYear(), endLabel.getMonth(), endLabel.getDate() + 1)
    return { start, end, label: `${formatRangeDate(start)} - ${formatRangeDate(endLabel)}` }
  }

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
  const [search, setSearch] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(() => monthStart(new Date()))
  const [periodStart, setPeriodStart] = useState<Date>(() => monthStart(new Date()))
  const [periodEnd, setPeriodEnd] = useState<Date>(() => dateOnly(new Date()))
  const [allocationType, setAllocationType] = useState<'expense' | 'income'>('expense')
  const [detailSheet, setDetailSheet] = useState<DetailSheetState | null>(null)

  useEffect(() => {
    void import('@/lib/achievements').then((module) => {
      const today = new Date()
      module.addToSet(module.REKAP_DAYS_KEY, `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`)
      module.setFlag('sakukilat:v2:tren-seen')
    })
  }, [])

  const bounds = useMemo(
    () => rangeBounds(rangeMode, selectedMonth, { start: periodStart, end: periodEnd }),
    [rangeMode, selectedMonth, periodStart, periodEnd]
  )
  const rangeTransactions = useMemo(
    () => transactionsForRange(transactions, bounds.start, bounds.end),
    [bounds.end, bounds.start, transactions]
  )
  const searchedTransactions = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return rangeTransactions
    const digits = query.replace(/[^0-9]/g, '')
    return rangeTransactions.filter((transaction) => {
      const haystack = [
        transaction.description,
        getCategoryConfig(transaction.category).label,
        transaction.subcategory ?? '',
        transaction.paymentMethod ?? '',
      ]
        .join(' ')
        .toLowerCase()
      if (haystack.includes(query)) return true
      if (digits && String(transaction.amount).includes(digits)) return true
      return false
    })
  }, [search, rangeTransactions])
  const filteredHistory = useMemo(() => {
    if (filter === 'pengeluaran') return searchedTransactions.filter((transaction) => transaction.type === 'expense')
    if (filter === 'pemasukan') return searchedTransactions.filter((transaction) => transaction.type === 'income')
    return searchedTransactions
  }, [filter, searchedTransactions])
  const historyCounts = useMemo(
    () => ({
      semua: searchedTransactions.length,
      pengeluaran: searchedTransactions.filter((transaction) => transaction.type === 'expense').length,
      pemasukan: searchedTransactions.filter((transaction) => transaction.type === 'income').length,
    }),
    [searchedTransactions]
  )

  const rangeTotalsData = useMemo(
    () => rangeTotals(transactions, bounds.start, bounds.end),
    [bounds.end, bounds.start, transactions]
  )
  const previousTotals = useMemo(() => {
    const durationMs = bounds.end.getTime() - bounds.start.getTime()
    const prevEnd = new Date(bounds.start.getTime())
    const prevStart = new Date(bounds.start.getTime() - durationMs)
    return { ...rangeTotals(transactions, prevStart, prevEnd), start: prevStart, end: prevEnd }
  }, [bounds.end, bounds.start, transactions])
  const comparison = useMemo(() => {
    const delta = (current: number, previous: number) => {
      if (previous <= 0) return current > 0 ? 1 : 0
      return (current - previous) / previous
    }
    return {
      expenseDelta: delta(rangeTotalsData.expense, previousTotals.expense),
      incomeDelta: delta(rangeTotalsData.income, previousTotals.income),
    }
  }, [rangeTotalsData, previousTotals])
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

  // ── Trend/Kalender data SUMBER: ────────────────────────────────────────
  // - Kalender: SELALU pakai selectedMonth (bulan yang dipilih chevron).
  // - Tren    : pakai `bounds` (rangeMode-aware). Kalau rangeMode==='month',
  //   `bounds.start/end` sudah otomatis = selectedMonth atau bulan berjalan.
  //   Jadi tombol "Bulan ini / 7 Hari / 30 Hari / 1 Tahun / Periode" berfungsi.
  const monthlyStart = monthStart(selectedMonth)
  const monthlyEnd = monthEndExclusive(selectedMonth)
  const monthTransactions = useMemo(
    () => transactionsForRange(transactions, monthlyStart, monthlyEnd),
    [monthlyEnd, monthlyStart, transactions]
  )

  // ── Data untuk mode Tren (rangeMode-aware): ────────────────────────────
  const trendStart = bounds.start
  const trendEnd = bounds.end
  const trendTransactions = useMemo(
    () => transactionsForRange(transactions, trendStart, trendEnd),
    [transactions, trendStart, trendEnd]
  )
  const trendTotals = useMemo(
    () => rangeTotals(transactions, trendStart, trendEnd),
    [transactions, trendStart, trendEnd]
  )
  const trendAllocation = useMemo(
    () => rangeCategoryBreakdown(transactions, trendStart, trendEnd, allocationType),
    [allocationType, transactions, trendStart, trendEnd]
  )
  const categoryComparison = useMemo(
    () => categoryMonthlyComparison(transactions, selectedMonth, allocationType, 3),
    [allocationType, selectedMonth, transactions]
  )
  const monthDayMap = useMemo(() => dailyAggregates(monthTransactions), [monthTransactions])
  const savedCategory = useMemo(() => topSavedCategory(transactions), [transactions])

  const openTransactions = (title: string, items: Transaction[], subtitle?: string, subcategories?: SubcategorySlice[]) => {
    setDetailSheet({
      mode: 'transactions',
      title,
      subtitle,
      transactions: [...items].sort((left, right) => right.date.getTime() - left.date.getTime()),
      subcategories,
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

  const allocationEmpty = trendAllocation.length === 0
  // Chevron bulan hanya relevan saat rangeMode==='month' — di rangeMode lain
  // (7 Hari / 30 Hari / 1 Tahun / Periode) kita sembunyikan supaya nggak bingung.
  const trendUsesMonthPicker = rangeMode === 'month'

  return (
    <div className="flex min-h-full flex-col md:ml-[72px]">
      <div className="mx-auto w-full max-w-[560px] px-4 pb-[176px] pt-4 md:max-w-[980px] md:px-8 md:pt-6">
        <header className="mb-4">
          <h2 className="text-[24px] font-bold tracking-tight text-[var(--sk-text)] md:text-[30px]">Rekapan</h2>
        </header>

        <div className="mb-5 overflow-x-auto pb-1">
          <div className="inline-grid min-w-full grid-cols-3 gap-1 rounded-[22px] border border-[var(--sk-border)] bg-[var(--sk-surface)] p-1">
            {([
              ['history', 'History'],
              ['calendar', 'Kalender'],
              ['trend', 'Tren'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={cn(
                  'rounded-[16px] px-3.5 py-2 text-[14px] font-semibold transition-colors',
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
            <div className="flex w-max gap-3">
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
                    'rounded-[18px] px-4 py-2.5 text-[14px] font-semibold transition-colors',
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

        {(mode === 'history' || mode === 'trend') && rangeMode === 'period' && (
          <div className="mb-4 grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--sk-text-dim)]">
                Dari tanggal
              </span>
              <input
                type="date"
                value={toDateInputValue(periodStart)}
                max={toDateInputValue(periodEnd)}
                onChange={(event) => {
                  const next = fromDateInputValue(event.target.value)
                  if (next) setPeriodStart(next)
                }}
                className="rounded-[16px] border border-[var(--sk-border)] bg-[var(--sk-surface)] px-3.5 py-2.5 text-[14px] font-semibold text-[var(--sk-text)]"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--sk-text-dim)]">
                Sampai tanggal
              </span>
              <input
                type="date"
                value={toDateInputValue(periodEnd)}
                min={toDateInputValue(periodStart)}
                onChange={(event) => {
                  const next = fromDateInputValue(event.target.value)
                  if (next) setPeriodEnd(next)
                }}
                className="rounded-[16px] border border-[var(--sk-border)] bg-[var(--sk-surface)] px-3.5 py-2.5 text-[14px] font-semibold text-[var(--sk-text)]"
              />
            </label>
          </div>
        )}

        {mode === 'history' && (
          <section>
            <p className="mb-4 text-[14px] text-[var(--sk-text-dim)]">History: {bounds.label}</p>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => openCategorySummary('expense', `Kategori pengeluaran ${bounds.label}`, rangeExpenseRows)}
                className="rounded-[22px] border border-[var(--sk-border)] bg-[var(--sk-surface)] p-4 text-left shadow-[0_14px_34px_rgba(2,6,23,0.18)]"
              >
                <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--sk-text-dim)]">Total keluar</p>
                <p className="mt-3 text-[17px] font-bold leading-tight text-[var(--sk-red)] break-words [overflow-wrap:anywhere]">
                  {formatIDR(rangeTotalsData.expense)}
                </p>
              </button>
              <button
                type="button"
                onClick={() => openCategorySummary('income', `Kategori pemasukan ${bounds.label}`, rangeIncomeRows)}
                className="rounded-[22px] border border-[var(--sk-border)] bg-[var(--sk-surface)] p-4 text-left shadow-[0_14px_34px_rgba(2,6,23,0.18)]"
              >
                <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--sk-text-dim)]">Total masuk</p>
                <p className="mt-3 text-[17px] font-bold leading-tight text-[var(--sk-green)] break-words [overflow-wrap:anywhere]">
                  {formatIDR(rangeTotalsData.income)}
                </p>
              </button>
            </div>

            <div className="mt-5 flex items-center gap-2 rounded-[18px] border border-[var(--sk-border)] bg-[var(--sk-surface)] px-3.5 py-2.5">
              <Search className="h-4 w-4 shrink-0 text-[var(--sk-text-dim)]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari keterangan, kategori, nominal…"
                className="min-w-0 flex-1 bg-transparent text-sm text-[var(--sk-text)] outline-none placeholder:text-[var(--sk-text-dim)]"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Hapus pencarian"
                  className="shrink-0 text-[var(--sk-text-dim)]"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            <div className="my-5 border-t border-[var(--sk-border)] pt-5">
              <FilterTabs active={filter} onChange={setFilter} counts={historyCounts} />
            </div>

            <TransactionList
              transactions={filteredHistory}
              onDelete={deleteTransaction}
              onUpdate={updateTransaction}
              newTransactionId={newTransactionId}
              className="px-0 pb-0 md:px-0"
              initialVisibleCount={80}
              loadMoreCount={80}
              showDailyTotal
            />
          </section>
        )}

        {mode === 'calendar' && (
          <section className="rounded-[32px] border border-[var(--sk-border)] bg-[var(--sk-surface)] px-4 py-5">
            <div className="mb-6 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setSelectedMonth((current) => addMonths(current, -1))}
                className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)]"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <div className="text-center">
                <p className="text-2xl font-bold text-[var(--sk-text)]">
                  {new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(selectedMonth)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMonth((current) => addMonths(current, 1))}
                className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)]"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </div>

            <div className="mb-4 grid grid-cols-7 gap-2">
              {WEEKDAY_LABELS.map((label) => (
                <div key={label} className="pb-2 text-center text-sm font-medium text-[var(--sk-text-dim)]">
                  {label}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-2">
              {monthGrid(selectedMonth).map((cell) => {
                if (!cell.date || cell.day === null) {
                  return <div key={cell.key} className="h-[92px]" />
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
                      'h-[92px] rounded-[24px] px-2 py-2 text-center transition-colors',
                      hasActivity ? 'bg-[var(--sk-surface-2)]' : 'bg-transparent'
                    )}
                  >
                    <p className="text-[12px] font-semibold text-[var(--sk-text)]">{cell.day}</p>
                    {hasActivity && (
                      <div className="mt-1 space-y-1">
                        {agg?.expense ? (
                          <div className="text-[9px] leading-tight tracking-tight tabular-nums text-[var(--sk-red)]">
                            -{formatIDRShort(agg.expense)}
                          </div>
                        ) : null}
                        {agg?.income ? (
                          <div className="text-[9px] leading-tight tracking-tight tabular-nums text-[var(--sk-green)]">
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
          <section className="space-y-4">
            {/* ── Font-size di section Tren sengaja diperkecil supaya lebih ringkas.
                 - Judul bulan / label rentang: text-lg (dari text-2xl)
                 - Nominal besar: text-xl (dari text-3xl)
                 - Label uppercase: text-[11px] (dari text-[13px])
                 - Chevron bulan hanya muncul saat rangeMode === 'month' */}
            <div className="rounded-[28px] border border-[var(--sk-border)] bg-[var(--sk-surface)] p-4">
              {trendUsesMonthPicker ? (
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedMonth((current) => addMonths(current, -1))}
                    className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)]"
                    aria-label="Bulan sebelumnya"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <div className="text-center">
                    <p className="text-lg font-bold text-[var(--sk-text)]">
                      {new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(selectedMonth)}
                    </p>
                    <p className="mt-0.5 text-[11px] uppercase tracking-[0.2em] text-[var(--sk-text-dim)]">Alokasi Bulanan</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedMonth((current) => addMonths(current, 1))}
                    className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)]"
                    aria-label="Bulan berikutnya"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-lg font-bold text-[var(--sk-text)]">{bounds.label}</p>
                  <p className="mt-0.5 text-[11px] uppercase tracking-[0.2em] text-[var(--sk-text-dim)]">
                    Alokasi {rangeMode === '7d' ? '7 Hari' : rangeMode === '30d' ? '30 Hari' : rangeMode === '1y' ? '1 Tahun' : 'Periode'}
                  </p>
                </div>
              )}

              <div className="mt-6 grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setAllocationType('income')}
                  className={cn(
                    'rounded-[22px] border p-4 text-left transition-colors',
                    allocationType === 'income'
                      ? 'border-[rgba(52,211,153,0.4)] bg-[var(--sk-surface-2)]'
                      : 'border-[var(--sk-border)] bg-[var(--sk-surface)]'
                  )}
                >
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--sk-text-dim)]">Pendapatan</p>
                  <p className="mt-4 text-xl font-bold text-[var(--sk-green)]">{formatIDR(trendTotals.income)}</p>
                </button>
                <button
                  type="button"
                  onClick={() => setAllocationType('expense')}
                  className={cn(
                    'rounded-[22px] border p-4 text-left transition-colors',
                    allocationType === 'expense'
                      ? 'border-[rgba(248,113,113,0.55)] bg-[var(--sk-surface-2)] shadow-[inset_0_-4px_0_rgba(248,113,113,0.55)]'
                      : 'border-[var(--sk-border)] bg-[var(--sk-surface)]'
                  )}
                >
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--sk-text-dim)]">Pengeluaran</p>
                  <p className="mt-4 text-xl font-bold text-[var(--sk-red)]">{formatIDR(trendTotals.expense)}</p>
                </button>
              </div>

              <div className="mt-6 rounded-[28px] border border-dashed border-[var(--sk-border)] bg-[var(--sk-surface-2)] p-4">
                {allocationEmpty ? (
                  <div className="flex h-[260px] items-center justify-center text-center text-2xl text-[var(--sk-text-dim)]">
                    Belum ada {allocationType === 'expense' ? 'pengeluaran' : 'pemasukan'}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="h-[240px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={trendAllocation.slice(0, 6)}
                            dataKey="total"
                            innerRadius={58}
                            outerRadius={92}
                            paddingAngle={3}
                            strokeWidth={0}
                          >
                            {trendAllocation.slice(0, 6).map((slice) => (
                              <Cell key={slice.category} fill={getCategoryHex(slice.category)} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-2">
                      {trendAllocation.slice(0, 4).map((slice) => (
                        <button
                          key={slice.category}
                          type="button"
                          onClick={() => openTransactions(
                            getCategoryConfig(slice.category).label,
                            trendTransactions.filter((transaction) => transaction.type === allocationType && transaction.category === slice.category),
                            new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(selectedMonth),
                            subcategoryBreakdownForRange(transactions, trendStart, trendEnd, slice.category, allocationType),
                          )}
                          className="flex w-full items-center gap-3 rounded-2xl bg-[var(--sk-surface)] px-3 py-3 text-left"
                        >
                          <span className="h-3 w-3 rounded-full" style={{ background: getCategoryHex(slice.category) }} />
                          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[var(--sk-text)]">
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

              <div className="mt-5 rounded-[26px] border border-[var(--sk-border)] bg-[var(--sk-surface-2)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[15px] font-semibold text-[var(--sk-text)]">
                      Alokasi {allocationType === 'expense' ? 'pengeluaran' : 'pemasukan'}
                    </p>
                    <p className="mt-1 text-sm text-[var(--sk-text-dim)]">{trendAllocation.length} kategori tercatat</p>
                  </div>
                  <p className={cn(
                    'text-xl font-bold',
                    allocationType === 'expense' ? 'text-[var(--sk-red)]' : 'text-[var(--sk-green)]'
                  )}>
                    {formatIDR(
                      allocationType === 'expense' ? trendTotals.expense : trendTotals.income
                    )}
                  </p>
                </div>

                <div className="my-4 h-px bg-[var(--sk-border)]" />

                {trendAllocation.length === 0 ? (
                  <p className="text-sm text-[var(--sk-text-dim)]">
                    Belum ada {allocationType === 'expense' ? 'pengeluaran' : 'pemasukan'} di rentang ini.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {trendAllocation.slice(0, 5).map((slice) => (
                      <button
                        key={slice.category}
                        type="button"
                        onClick={() => openTransactions(
                          getCategoryConfig(slice.category).label,
                          trendTransactions.filter((transaction) => transaction.type === allocationType && transaction.category === slice.category),
                          new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(selectedMonth),
                          subcategoryBreakdownForRange(transactions, trendStart, trendEnd, slice.category, allocationType),
                        )}
                        className="flex w-full items-center gap-3 text-left"
                      >
                        <span className="h-3 w-3 rounded-full" style={{ background: getCategoryHex(slice.category) }} />
                        <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--sk-text-muted)]">
                          {getCategoryConfig(slice.category).label}
                        </span>
                        <span className="text-xs font-semibold text-[var(--sk-text)]">
                          {Math.round(slice.pct * 100)}%
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[28px] border border-[var(--sk-border)] bg-[var(--sk-surface)] p-5">
              <div>
                <p className="text-[15px] font-semibold text-[var(--sk-text)]">Dibanding bulan lalu</p>
                <p className="mt-1 text-sm text-[var(--sk-text-dim)]">
                  {allocationType === 'expense' ? 'Pengeluaran' : 'Pemasukan'} per kategori vs {new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(addMonths(selectedMonth, -1))}
                </p>
              </div>

              <div className="my-4 h-px bg-[var(--sk-border)]" />

              {categoryComparison.length === 0 ? (
                <p className="text-sm text-[var(--sk-text-dim)]">
                  Belum ada data untuk dibandingkan dengan bulan sebelumnya.
                </p>
              ) : (
                <div className="space-y-3.5">
                  {categoryComparison.slice(0, 6).map((row) => {
                    const deltaPct = row.deltaVsPrev === null ? null : Math.round(row.deltaVsPrev * 100)
                    const good = allocationType === 'expense'
                      ? (deltaPct !== null && deltaPct < 0)
                      : (deltaPct !== null && deltaPct > 0)
                    const badgeColor = deltaPct === null
                      ? 'text-[var(--sk-cyan)]'
                      : deltaPct === 0
                        ? 'text-[var(--sk-text-dim)]'
                        : good
                          ? 'text-[var(--sk-green)]'
                          : 'text-[var(--sk-red)]'
                    const badgeText = deltaPct === null
                      ? 'Baru'
                      : deltaPct > 0
                        ? `Naik ${deltaPct}%`
                        : deltaPct < 0
                          ? `Turun ${Math.abs(deltaPct)}%`
                          : 'Sama'
                    return (
                      <div key={row.category}>
                        <div className="flex items-center gap-3">
                          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: getCategoryHex(row.category) }} />
                          <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--sk-text-muted)]">
                            {getCategoryConfig(row.category).label}
                          </span>
                          <span className="shrink-0 text-xs font-semibold text-[var(--sk-text)] tabular-nums">
                            {formatIDRCompact(row.current)}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2 pl-6 text-xs">
                          <span className="text-[var(--sk-text-dim)] tabular-nums">
                            Bln lalu {formatIDRCompact(row.previous)}
                          </span>
                          <span className={cn('shrink-0 font-semibold', badgeColor)}>
                            {badgeText}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => openCategorySummary('expense', `Kategori pengeluaran ${bounds.label}`, rangeExpenseRows)}
                className="rounded-[26px] border border-[var(--sk-border)] bg-[var(--sk-surface)] p-4 text-left"
              >
                <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--sk-text-dim)]">Pengeluaran</p>
                <p className="mt-4 text-xl font-bold text-[var(--sk-red)]">{formatIDR(rangeTotalsData.expense)}</p>
              </button>
              <button
                type="button"
                onClick={() => openCategorySummary('income', `Kategori pemasukan ${bounds.label}`, rangeIncomeRows)}
                className="rounded-[26px] border border-[var(--sk-border)] bg-[var(--sk-surface)] p-4 text-left"
              >
                <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--sk-text-dim)]">Pemasukan</p>
                <p className="mt-4 text-xl font-bold text-[var(--sk-green)]">{formatIDR(rangeTotalsData.income)}</p>
              </button>
            </div>

            <div className="rounded-[26px] border border-[var(--sk-border)] bg-[var(--sk-surface)] p-5">
              <h3 className="text-[14px] font-semibold text-[var(--sk-text)]">Dibanding periode sebelumnya</h3>
              <p className="mt-1 text-[12px] text-[var(--sk-text-dim)]">
                {formatRangeDate(previousTotals.start)} - {formatRangeDate(new Date(previousTotals.end.getTime() - 86400000))}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {([
                  ['Keluar', rangeTotalsData.expense, previousTotals.expense, comparison.expenseDelta, 'expense'],
                  ['Masuk', rangeTotalsData.income, previousTotals.income, comparison.incomeDelta, 'income'],
                ] as const).map(([label, current, previous, delta, kind]) => {
                  const up = delta > 0.0001
                  const down = delta < -0.0001
                  const hasPrev = previous > 0
                  // Pengeluaran naik = kurang baik (merah); pemasukan naik = baik (hijau).
                  const good = kind === 'expense' ? down : up
                  const DeltaIcon = up ? TrendingUp : down ? TrendingDown : Minus
                  const deltaColor = !hasPrev
                    ? 'text-[var(--sk-text-dim)]'
                    : !up && !down
                      ? 'text-[var(--sk-text-dim)]'
                      : good
                        ? 'text-[var(--sk-green)]'
                        : 'text-[var(--sk-red)]'
                  return (
                    <div key={label} className="rounded-[22px] border border-[var(--sk-border)] bg-[var(--sk-surface-2)] p-4">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--sk-text-dim)]">{label}</p>
                      <p className={cn(
                        'mt-2 text-[17px] font-bold leading-tight break-words [overflow-wrap:anywhere]',
                        kind === 'expense' ? 'text-[var(--sk-red)]' : 'text-[var(--sk-green)]'
                      )}>
                        {formatIDR(current)}
                      </p>
                      <div className={cn('mt-2 inline-flex items-center gap-1 text-[12px] font-semibold', deltaColor)}>
                        <DeltaIcon className="h-3.5 w-3.5" />
                        {!hasPrev
                          ? 'Baru'
                          : !up && !down
                            ? 'Sama'
                            : `${delta > 0 ? '+' : ''}${Math.round(delta * 100)}%`}
                      </div>
                      <p className="mt-1 text-[11px] text-[var(--sk-text-dim)]">sebelumnya {formatIDR(previous)}</p>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="rounded-[26px] border border-[var(--sk-border)] bg-[var(--sk-surface)] p-5">
              <h3 className="text-2xl font-semibold text-[var(--sk-text)]">Pengeluaran vs Pemasukan</h3>
              <div className="mt-4 h-[260px]">
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

            <div className="rounded-[26px] border border-[var(--sk-border)] bg-[var(--sk-surface)] p-5">
              <h3 className="text-2xl font-semibold text-[var(--sk-text)]">Tren Pengeluaran</h3>
              <div className="mt-4 rounded-[20px] border border-[rgba(255,255,255,0.12)] p-3">
                <div className="h-[260px]">
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
              <div className="rounded-[28px] border border-[rgba(16,185,129,0.28)] bg-[rgba(16,185,129,0.18)] p-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[rgba(16,185,129,0.12)]">
                    <span className="text-3xl">🍜</span>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-[var(--sk-green)]">Penghematan minggu ini</p>
                    <p className="mt-2 text-[15px] leading-relaxed text-[var(--sk-text)]">
                      Pengeluaran {getCategoryConfig(savedCategory).label} kamu lebih hemat dari minggu lalu. Pertahankan!
                    </p>
                  </div>
                </div>
              </div>
            )}
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
        {detailSheet?.subcategories && detailSheet.subcategories.length > 0 && (
          <div className="px-4 pb-3">
            <p className="mb-2 text-[10px] uppercase tracking-[0.22em] text-[var(--sk-text-dim)]">Sub kategori</p>
            <div className="flex flex-wrap gap-1.5">
              {detailSheet.subcategories.map((item) => (
                <span
                  key={item.label}
                  className="rounded-full border border-[var(--sk-border)] bg-[var(--sk-surface-2)] px-2.5 py-1 text-[10px] text-[var(--sk-text-muted)]"
                >
                  {item.label} - {formatIDRCompact(item.total)}
                </span>
              ))}
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
