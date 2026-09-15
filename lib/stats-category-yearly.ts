/**
 * SakuKilat — Category Yearly Statistics Engine
 *
 * Provides analytical aggregations for a category across 12 months of a year.
 * Excludes transfers and savings transfers to prevent double counting.
 */

import type { Transaction } from './mock-data.ts'

export const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
]

export interface MonthCategoryData {
  month: number // 1 to 12
  monthLabel: string
  total: number
  count: number
  transactions: Transaction[]
}

export interface CategoryYearlySummary {
  total: number
  count: number
  monthlyAverage: number
  highestMonth: { month: number; monthLabel: string; total: number } | null
  lowestMonth: { month: number; monthLabel: string; total: number } | null
  totalAllCategoriesYear: number
  percentageOfTotal: number
  previousYearTotal: number
  changeAmount: number
  changePercentage: number | null
}

export interface SubcategoryYearlyItem {
  name: string
  total: number
  count: number
  percentage: number
}

function parseTxDate(raw: string | Date): Date {
  return typeof raw === 'string' ? new Date(raw) : raw
}

function isExcludedTx(tx: Transaction): boolean {
  if ((tx.type as string) === 'transfer') return true
  if (tx.category === 'transfer') return true
  // Exclude saving/tabungan internal transfers if marked
  if (tx.category === 'tabungan' && tx.type !== 'expense' && tx.type !== 'income') return true
  return false
}

/**
 * Generates an array of exactly 12 months for a category in a given year.
 */
export function categoryYearlyBreakdown(
  transactions: Transaction[],
  year: number,
  type: 'expense' | 'income',
  categoryId: string,
  subcategory?: string
): MonthCategoryData[] {
  // Initialize 12 empty months
  const months: MonthCategoryData[] = MONTH_LABELS.map((label, idx) => ({
    month: idx + 1,
    monthLabel: label,
    total: 0,
    count: 0,
    transactions: [],
  }))

  for (const tx of transactions) {
    if (isExcludedTx(tx)) continue
    if (tx.type !== type) continue

    const date = parseTxDate(tx.date)
    if (date.getFullYear() !== year) continue

    const monthIndex = date.getMonth() // 0 to 11
    if (monthIndex < 0 || monthIndex >= 12) continue

    if (tx.splitItems && tx.splitItems.length > 0) {
      let splitTotal = 0
      for (const split of tx.splitItems) {
        if (split.categoryId === categoryId) {
          if (!subcategory || split.subcategoryId === subcategory) {
            splitTotal += Math.round(split.amount || 0)
          }
        }
      }
      if (splitTotal > 0) {
        months[monthIndex].total += splitTotal
        months[monthIndex].count += 1
        months[monthIndex].transactions.push(tx)
      }
    } else {
      if (tx.category !== categoryId) continue
      if (subcategory && tx.subcategory !== subcategory) continue

      months[monthIndex].total += Math.round(tx.amount || 0)
      months[monthIndex].count += 1
      months[monthIndex].transactions.push(tx)
    }
  }

  return months
}

/**
 * Computes high-level summary metrics for a category in a given year.
 */
export function categoryYearlySummary(
  transactions: Transaction[],
  year: number,
  type: 'expense' | 'income',
  categoryId: string,
  subcategory?: string
): CategoryYearlySummary {
  const breakdown = categoryYearlyBreakdown(transactions, year, type, categoryId, subcategory)

  let total = 0
  let count = 0
  let highestMonth: { month: number; monthLabel: string; total: number } | null = null
  let lowestMonth: { month: number; monthLabel: string; total: number } | null = null

  for (const m of breakdown) {
    total += m.total
    count += m.count

    if (m.total > 0) {
      if (!highestMonth || m.total > highestMonth.total) {
        highestMonth = { month: m.month, monthLabel: m.monthLabel, total: m.total }
      }
      if (!lowestMonth || m.total < lowestMonth.total) {
        lowestMonth = { month: m.month, monthLabel: m.monthLabel, total: m.total }
      }
    }
  }

  // Calculate total across ALL categories of this type in this year
  let totalAllCategoriesYear = 0
  for (const tx of transactions) {
    if (isExcludedTx(tx)) continue
    if (tx.type !== type) continue
    const date = parseTxDate(tx.date)
    if (date.getFullYear() === year) {
      totalAllCategoriesYear += Math.round(tx.amount || 0)
    }
  }

  // Previous year total for same category
  const prevBreakdown = categoryYearlyBreakdown(transactions, year - 1, type, categoryId, subcategory)
  const previousYearTotal = prevBreakdown.reduce((acc, m) => acc + m.total, 0)

  const changeAmount = total - previousYearTotal
  const changePercentage = previousYearTotal > 0
    ? Math.round(((total - previousYearTotal) / previousYearTotal) * 1000) / 10
    : null

  const percentageOfTotal = totalAllCategoriesYear > 0
    ? Math.round((total / totalAllCategoriesYear) * 1000) / 10
    : 0

  const monthlyAverage = Math.round(total / 12)

  return {
    total,
    count,
    monthlyAverage,
    highestMonth,
    lowestMonth,
    totalAllCategoriesYear,
    percentageOfTotal,
    previousYearTotal,
    changeAmount,
    changePercentage,
  }
}

/**
 * Breakdown of subcategories within a category for the selected year.
 */
export function subcategoryYearlyBreakdown(
  transactions: Transaction[],
  year: number,
  type: 'expense' | 'income',
  categoryId: string
): SubcategoryYearlyItem[] {
  const map: Record<string, { total: number; count: number }> = {}
  let categoryTotal = 0

  for (const tx of transactions) {
    if (isExcludedTx(tx)) continue
    if (tx.type !== type) continue

    const date = parseTxDate(tx.date)
    if (date.getFullYear() !== year) continue

    if (tx.splitItems && tx.splitItems.length > 0) {
      for (const split of tx.splitItems) {
        if (split.categoryId === categoryId) {
          const subName = split.subcategoryId?.trim() || '(Tanpa subkategori)'
          if (!map[subName]) {
            map[subName] = { total: 0, count: 0 }
          }
          const amt = Math.round(split.amount || 0)
          map[subName].total += amt
          map[subName].count += 1
          categoryTotal += amt
        }
      }
    } else {
      if (tx.category !== categoryId) continue

      const subName = tx.subcategory?.trim() || '(Tanpa subkategori)'
      if (!map[subName]) {
        map[subName] = { total: 0, count: 0 }
      }
      const amt = Math.round(tx.amount || 0)
      map[subName].total += amt
      map[subName].count += 1
      categoryTotal += amt
    }
  }

  const items: SubcategoryYearlyItem[] = Object.entries(map).map(([name, stat]) => ({
    name,
    total: stat.total,
    count: stat.count,
    percentage: categoryTotal > 0
      ? Math.round((stat.total / categoryTotal) * 1000) / 10
      : 0,
  }))

  return items.sort((a, b) => b.total - a.total)
}

/**
 * Finds the single largest transaction for a category in a given year.
 */
export function topTransactionInCategory(
  transactions: Transaction[],
  year: number,
  type: 'expense' | 'income',
  categoryId: string,
): Transaction | null {
  let best: Transaction | null = null
  let bestAmount = 0

  for (const tx of transactions) {
    if (isExcludedTx(tx)) continue
    if (tx.type !== type) continue

    const date = parseTxDate(tx.date)
    if (date.getFullYear() !== year) continue

    if (tx.splitItems && tx.splitItems.length > 0) {
      let splitTotal = 0
      for (const split of tx.splitItems) {
        if (split.categoryId === categoryId) {
          splitTotal += Math.round(split.amount || 0)
        }
      }
      if (splitTotal > 0 && (!best || splitTotal > bestAmount)) {
        best = tx
        bestAmount = splitTotal
      }
    } else {
      if (tx.category !== categoryId) continue
      const amt = Math.round(tx.amount || 0)
      if (!best || amt > bestAmount) {
        best = tx
        bestAmount = amt
      }
    }
  }

  return best
}
