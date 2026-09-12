'use client'

import React, { memo, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  PieChart as PieIcon,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react'
import { useTransactionData, useCustomizationStore, useWalletStore } from '@/lib/store'
import {
  CATEGORY_CONFIG,
  getCategoryConfig,
  getCategoryHex,
  getDefaultSubcategories,
} from '@/components/category-badge'
import { formatIDR, getBuiltinCategoryType } from '@/lib/parser'
import {
  categoryYearlyBreakdown,
  categoryYearlySummary,
  subcategoryYearlyBreakdown,
  topTransactionInCategory,
  MONTH_LABELS,
  type MonthCategoryData,
} from '@/lib/stats-category-yearly'
import { pushBackLayer, removeBackLayer } from '@/lib/back-stack'
import { cn } from '@/lib/utils'

interface CategoryYearExplorerProps {
  open: boolean
  onClose: () => void
  initialYear?: number
  initialCategoryId?: string
  initialType?: 'expense' | 'income'
}

export const CategoryYearExplorer = memo(function CategoryYearExplorer({
  open,
  onClose,
  initialYear,
  initialCategoryId,
  initialType = 'expense',
}: CategoryYearExplorerProps) {
  const { transactions } = useTransactionData()
  const { customCategories, hiddenCategoryIds } = useCustomizationStore()
  const { wallets } = useWalletStore()

  const currentYear = useMemo(() => new Date().getFullYear(), [])
  const [selectedYear, setSelectedYear] = useState<number>(() => initialYear ?? currentYear)
  const [selectedType, setSelectedType] = useState<'expense' | 'income'>(() => initialType)
  const [selectedCategory, setSelectedCategory] = useState<string>(() => initialCategoryId ?? 'makanan')
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('')
  const [activeMonth, setActiveMonth] = useState<number>(() => new Date().getMonth() + 1)

  // Sync initial props when opened
  useEffect(() => {
    if (open) {
      if (initialYear) setSelectedYear(initialYear)
      if (initialType) setSelectedType(initialType)
      if (initialCategoryId) setSelectedCategory(initialCategoryId)
      setSelectedSubcategory('')
    }
  }, [open, initialYear, initialType, initialCategoryId])

  // Back-stack integration
  useEffect(() => {
    if (open) {
      pushBackLayer({ id: 'category-year-explorer', type: 'sublayer', onClose })
    } else {
      removeBackLayer('category-year-explorer')
    }
    return () => removeBackLayer('category-year-explorer')
  }, [open, onClose])

  // Prevent background scroll
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Categories available for the selected type
  const availableCategories = useMemo(() => {
    const customById = new Map(customCategories.map(item => [item.id, item]))
    const builtIns = Object.keys(CATEGORY_CONFIG).map(id => {
      const cfg = getCategoryConfig(id)
      const override = customById.get(id)
      const defaultSubs = getDefaultSubcategories(id)
      const mergedSubs = override?.subcategories?.length ? override.subcategories : defaultSubs
      return {
        id,
        label: cfg.label,
        icon: cfg.icon,
        color: cfg.color,
        bg: cfg.bg,
        subcategories: mergedSubs,
      }
    })

    const filtered = builtIns.filter(item => {
      if (item.id === 'transfer') return false
      if (hiddenCategoryIds.includes(item.id)) return false
      return getBuiltinCategoryType(item.id) === selectedType
    })

    const custom = customCategories
      .filter(item => (item.type ?? 'expense') === selectedType)
      .filter(item => !CATEGORY_CONFIG[item.id as keyof typeof CATEGORY_CONFIG])
      .map(item => {
        const cfg = getCategoryConfig(item.id)
        return {
          id: item.id,
          label: item.label,
          icon: cfg.icon,
          color: cfg.color,
          bg: cfg.bg,
          subcategories: item.subcategories ?? [],
        }
      })

    return [...filtered, ...custom]
  }, [selectedType, customCategories, hiddenCategoryIds])

  // Ensure selectedCategory is valid for selected type
  useEffect(() => {
    if (!availableCategories.some(c => c.id === selectedCategory)) {
      if (availableCategories.length > 0) {
        setSelectedCategory(availableCategories[0].id)
      }
    }
  }, [availableCategories, selectedCategory])

  const activeCategoryObj = useMemo(() => {
    return availableCategories.find(c => c.id === selectedCategory) || getCategoryConfig(selectedCategory)
  }, [availableCategories, selectedCategory])

  // Compute analytics
  const breakdown = useMemo(() => {
    return categoryYearlyBreakdown(
      transactions,
      selectedYear,
      selectedType,
      selectedCategory,
      selectedSubcategory || undefined
    )
  }, [transactions, selectedYear, selectedType, selectedCategory, selectedSubcategory])

  const summary = useMemo(() => {
    return categoryYearlySummary(
      transactions,
      selectedYear,
      selectedType,
      selectedCategory,
      selectedSubcategory || undefined
    )
  }, [transactions, selectedYear, selectedType, selectedCategory, selectedSubcategory])

  const subcategories = useMemo(() => {
    return subcategoryYearlyBreakdown(
      transactions,
      selectedYear,
      selectedType,
      selectedCategory
    )
  }, [transactions, selectedYear, selectedType, selectedCategory])

  const topTx = useMemo(() => {
    return topTransactionInCategory(
      transactions,
      selectedYear,
      selectedType,
      selectedCategory
    )
  }, [transactions, selectedYear, selectedType, selectedCategory])

  const activeMonthData = useMemo(() => {
    return breakdown.find(m => m.month === activeMonth) || breakdown[0]
  }, [breakdown, activeMonth])

  const categoryColor = useMemo(() => {
    return getCategoryHex(selectedCategory) || 'var(--sk-cyan)'
  }, [selectedCategory])

  // Wallet label lookup
  const getWalletLabel = (id?: string) => {
    if (!id) return ''
    return wallets.find(w => w.id === id)?.label || id
  }

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="category-year-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[rgba(9,13,22,0.85)] backdrop-blur-sm animate-fade-in"
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="relative w-full max-w-lg rounded-t-2xl sm:rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border)] shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden text-[var(--sk-text)]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--sk-border)] flex-shrink-0 bg-[var(--sk-surface-2)]">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[var(--sk-cyan-dim)] flex items-center justify-center text-[var(--sk-cyan)] shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 id="category-year-title" className="text-sm font-bold truncate">
                Jejak Kategori Setahun
              </h2>
              <p className="text-[11px] text-[var(--sk-text-dim)] truncate">
                Tren bulanan & analisis setahun penuh
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup explorer"
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--sk-text-dim)] hover:text-[var(--sk-text)] hover:bg-[var(--sk-surface)] transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 space-y-4 overflow-y-auto min-h-0 flex-1">
          {/* Controls: Year & Type */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            {/* Year selector */}
            <div className="flex items-center gap-1 bg-[var(--sk-surface-2)] border border-[var(--sk-border)] rounded-xl p-1">
              <button
                type="button"
                onClick={() => setSelectedYear(y => y - 1)}
                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--sk-surface)] text-[var(--sk-text-dim)] hover:text-[var(--sk-text)]"
                aria-label="Tahun sebelumnya"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-bold text-xs tabular-nums text-[var(--sk-text)]">
                {selectedYear}
              </span>
              <button
                type="button"
                onClick={() => setSelectedYear(y => y + 1)}
                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--sk-surface)] text-[var(--sk-text-dim)] hover:text-[var(--sk-text)]"
                aria-label="Tahun berikutnya"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Type selector */}
            <div className="flex rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] p-1">
              <button
                type="button"
                onClick={() => {
                  setSelectedType('expense')
                  setSelectedSubcategory('')
                }}
                className={cn(
                  'px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 min-h-[32px]',
                  selectedType === 'expense'
                    ? 'bg-[var(--sk-red-dim)] text-[var(--sk-red)] border border-[var(--sk-red)] shadow-sm'
                    : 'text-[var(--sk-text-dim)] hover:text-[var(--sk-text)]'
                )}
              >
                <TrendingDown className="w-3.5 h-3.5" />
                Pengeluaran
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedType('income')
                  setSelectedSubcategory('')
                }}
                className={cn(
                  'px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 min-h-[32px]',
                  selectedType === 'income'
                    ? 'bg-[var(--sk-green-dim)] text-[var(--sk-green)] border border-[var(--sk-green)] shadow-sm'
                    : 'text-[var(--sk-text-dim)] hover:text-[var(--sk-text)]'
                )}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                Pemasukan
              </button>
            </div>
          </div>

          {/* Category Chips Horizontal Scroll */}
          <div>
            <div className="text-[10px] uppercase tracking-wider font-bold text-[var(--sk-text-dim)] mb-1.5">
              Pilih Kategori
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1.5 scrollbar-none no-scrollbar">
              {availableCategories.map(cat => {
                const active = selectedCategory === cat.id
                const Icon = cat.icon
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setSelectedCategory(cat.id)
                      setSelectedSubcategory('')
                    }}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border shrink-0 min-h-[40px]',
                      active
                        ? cn(cat.bg, cat.color, 'border-current shadow-sm')
                        : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-dim)] border-transparent hover:text-[var(--sk-text)]'
                    )}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{cat.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Subcategory Filter (if available) */}
          {(() => {
            const subs = activeCategoryObj && 'subcategories' in activeCategoryObj && Array.isArray(activeCategoryObj.subcategories)
              ? (activeCategoryObj.subcategories as string[])
              : []
            if (subs.length === 0) return null
            return (
              <div>
                <div className="text-[10px] uppercase tracking-wider font-bold text-[var(--sk-text-dim)] mb-1">
                  Filter Subkategori
                </div>
                <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none no-scrollbar">
                  <button
                    type="button"
                    onClick={() => setSelectedSubcategory('')}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border whitespace-nowrap',
                      !selectedSubcategory
                        ? 'bg-[var(--sk-surface-3)] text-[var(--sk-text)] border-[var(--sk-border)] font-bold'
                        : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-dim)] border-transparent'
                    )}
                  >
                    Semua
                  </button>
                  {subs.map(sub => (
                    <button
                      key={sub}
                      type="button"
                      onClick={() => setSelectedSubcategory(sub)}
                      className={cn(
                        'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border whitespace-nowrap',
                        selectedSubcategory === sub
                          ? 'bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)] border-[var(--sk-cyan)] font-bold'
                          : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-dim)] border-transparent'
                      )}
                    >
                      {sub}
                    </button>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Summary Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div className="p-2.5 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] flex flex-col justify-between min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--sk-text-dim)]">
                Total {selectedYear}
              </span>
              <span className="text-sm sm:text-base font-extrabold text-[var(--sk-text)] tabular-nums mt-0.5 leading-tight whitespace-nowrap overflow-visible">
                {formatIDR(summary.total)}
              </span>
              <span className="text-[10px] text-[var(--sk-text-dim)] mt-0.5">
                {summary.count} transaksi
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] flex flex-col justify-between min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--sk-text-dim)]">
                Rata-rata Bulanan
              </span>
              <span className="text-sm sm:text-base font-extrabold text-[var(--sk-text)] tabular-nums mt-0.5 leading-tight whitespace-nowrap overflow-visible">
                {formatIDR(summary.monthlyAverage)}
              </span>
              <span className="text-[10px] text-[var(--sk-text-dim)] mt-0.5">
                / 12 bulan
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] flex flex-col justify-between min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--sk-text-dim)]">
                Porsi Kategori
              </span>
              <span className="text-sm sm:text-base font-extrabold text-[var(--sk-cyan)] tabular-nums mt-0.5 leading-tight">
                {summary.percentageOfTotal}%
              </span>
              <span className="text-[10px] text-[var(--sk-text-dim)] mt-0.5 truncate">
                dari seluruh {selectedType === 'expense' ? 'pengeluaran' : 'pemasukan'}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] flex flex-col justify-between min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--sk-text-dim)]">
                Bulan Tertinggi
              </span>
              <span className="text-xs sm:text-sm font-extrabold text-[var(--sk-text)] tabular-nums mt-0.5 truncate">
                {summary.highestMonth ? summary.highestMonth.monthLabel : '-'}
              </span>
              <span className="text-[10px] text-[var(--sk-text-dim)] mt-0.5 whitespace-nowrap overflow-visible font-semibold text-[var(--sk-text)]">
                {summary.highestMonth ? formatIDR(summary.highestMonth.total) : 'Belum ada'}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] flex flex-col justify-between min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--sk-text-dim)]">
                vs Tahun Lalu ({selectedYear - 1})
              </span>
              <div className="flex items-center gap-1.5 mt-0.5">
                {summary.changePercentage !== null ? (
                  <span
                    className={cn(
                      'text-xs sm:text-sm font-extrabold tabular-nums',
                      summary.changePercentage > 0
                        ? selectedType === 'expense'
                          ? 'text-[var(--sk-red)]'
                          : 'text-[var(--sk-green)]'
                        : summary.changePercentage < 0
                          ? selectedType === 'expense'
                            ? 'text-[var(--sk-green)]'
                            : 'text-[var(--sk-red)]'
                          : 'text-[var(--sk-text-dim)]'
                    )}
                  >
                    {summary.changePercentage > 0 ? '+' : ''}
                    {summary.changePercentage}%
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-[var(--sk-text-dim)]">
                    Tidak ada data lalu
                  </span>
                )}
              </div>
              <span className="text-[10px] text-[var(--sk-text-dim)] mt-0.5 whitespace-nowrap overflow-visible font-semibold text-[var(--sk-text)]">
                {summary.previousYearTotal > 0
                  ? `Lalu: ${formatIDR(summary.previousYearTotal)}`
                  : 'Tahun pertama dicatat'}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] flex flex-col justify-between min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--sk-text-dim)]">
                Transaksi Terbesar
              </span>
              <span className="text-xs sm:text-sm font-extrabold text-[var(--sk-text)] tabular-nums mt-0.5 whitespace-nowrap overflow-visible">
                {topTx ? formatIDR(topTx.amount) : '-'}
              </span>
              <span className="text-[10px] text-[var(--sk-text-dim)] mt-0.5 truncate" title={topTx?.description || undefined}>
                {topTx ? (topTx.description || activeCategoryObj?.label) : 'Belum ada'}
              </span>
            </div>
          </div>

          {/* 12-Month Bar Chart */}
          <div className="p-3.5 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-[var(--sk-text)]">
              <span>Distribusi 12 Bulan ({selectedYear})</span>
              <span className="text-[11px] text-[var(--sk-text-dim)] font-medium">
                Klik batang untuk drilldown
              </span>
            </div>

            <div className="w-full h-48 sm:h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={breakdown}
                  margin={{ top: 10, right: 0, left: -25, bottom: 0 }}
                  onClick={(e: any) => {
                    const payload = e?.activePayload?.[0]?.payload as MonthCategoryData | undefined
                    if (payload) {
                      setActiveMonth(payload.month)
                    }
                  }}
                >
                  <XAxis
                    dataKey="monthLabel"
                    tick={{ fill: 'var(--sk-text-dim)', fontSize: 10 }}
                    axisLine={{ stroke: 'var(--sk-border)' }}
                    tickLine={false}
                  />
                  <YAxis
                    width={70}
                    tick={{ fill: 'var(--sk-text-dim)', fontSize: 8 }}
                    tickFormatter={val => formatIDR(val)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null
                      const data = payload[0].payload as MonthCategoryData
                      return (
                        <div className="p-2 rounded-lg bg-[var(--sk-surface)] border border-[var(--sk-border)] shadow-xl text-xs">
                          <div className="font-bold text-[var(--sk-text)]">
                            {data.monthLabel} {selectedYear}
                          </div>
                          <div className="font-extrabold text-[var(--sk-cyan)] tabular-nums mt-0.5 whitespace-nowrap">
                            {formatIDR(data.total)}
                          </div>
                          <div className="text-[10px] text-[var(--sk-text-dim)]">
                            {data.count} transaksi
                          </div>
                        </div>
                      )
                    }}
                  />
                  <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                    {breakdown.map(entry => (
                      <Cell
                        key={`cell-${entry.month}`}
                        fill={entry.month === activeMonth ? 'var(--sk-cyan)' : categoryColor}
                        opacity={entry.month === activeMonth ? 1 : 0.65}
                        className="cursor-pointer transition-opacity hover:opacity-100"
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Subcategory Distribution (if multiple exist) */}
          {subcategories.length > 0 && (
            <div className="p-3.5 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-[var(--sk-text)]">
                <span>Rincian Subkategori</span>
                <span className="text-[11px] text-[var(--sk-text-dim)] font-medium">
                  {subcategories.length} subkategori
                </span>
              </div>
              <div className="space-y-2">
                {subcategories.map(sub => (
                  <div key={sub.name} className="space-y-1">
                    <div className="flex justify-between items-center text-xs gap-2">
                      <span className="font-semibold text-[var(--sk-text)] truncate flex-1 min-w-0">
                        {sub.name}
                      </span>
                      <div className="flex items-center gap-1.5 tabular-nums text-right shrink-0 whitespace-nowrap">
                        <span className="font-bold text-[var(--sk-text)]">
                          {formatIDR(sub.total)}
                        </span>
                        <span className="text-[10px] text-[var(--sk-text-dim)] w-10 text-right">
                          ({sub.percentage}%)
                        </span>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="w-full h-1.5 rounded-full bg-[var(--sk-surface)] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.min(100, Math.max(0, sub.percentage))}%`,
                          backgroundColor: categoryColor,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Month Drilldown & Transaction List */}
          <div className="p-3.5 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-bold text-[var(--sk-text)] truncate">
                Transaksi {MONTH_LABELS[activeMonth - 1]} {selectedYear}
              </div>
              <span className="text-[11px] font-bold text-[var(--sk-cyan)] tabular-nums shrink-0 whitespace-nowrap">
                {formatIDR(activeMonthData.total)} ({activeMonthData.count}x)
              </span>
            </div>

            {activeMonthData.transactions.length === 0 ? (
              <div className="py-6 text-center text-xs text-[var(--sk-text-dim)]">
                Tidak ada transaksi {activeCategoryObj?.label} pada bulan {MONTH_LABELS[activeMonth - 1]} {selectedYear}.
              </div>
            ) : (
              <div className="space-y-1.5 divide-y divide-[var(--sk-border)]">
                {activeMonthData.transactions.map(tx => {
                  const txDate = new Date(tx.date)
                  const dateStr = `${txDate.getDate()} ${MONTH_LABELS[txDate.getMonth()]}`
                  return (
                    <div
                      key={tx.id}
                      className="pt-1.5 first:pt-0 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-[var(--sk-text)] truncate">
                          {tx.description || activeCategoryObj?.label}
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-[var(--sk-text-dim)]">
                          <span>{dateStr}</span>
                          {tx.subcategory && (
                            <>
                              <span>•</span>
                              <span className="px-1.5 py-0.2 rounded bg-[var(--sk-surface)] text-[var(--sk-text-muted)] truncate max-w-[120px]">
                                {tx.subcategory}
                              </span>
                            </>
                          )}
                          {tx.paymentMethod && (
                            <>
                              <span>•</span>
                              <span>{getWalletLabel(tx.paymentMethod)}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div
                        className={cn(
                          'text-xs font-bold tabular-nums shrink-0',
                          tx.type === 'expense'
                            ? 'text-[var(--sk-red)]'
                            : 'text-[var(--sk-green)]'
                        )}
                      >
                        {tx.type === 'expense' ? '- ' : '+ '}
                        {formatIDR(tx.amount)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-[var(--sk-border)] bg-[var(--sk-surface-2)] flex justify-end flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-[var(--sk-surface)] border border-[var(--sk-border)] text-[var(--sk-text)] hover:bg-[var(--sk-surface-3)] transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
})
