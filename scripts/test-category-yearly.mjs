/**
 * Unit Tests for Category Yearly Statistics Engine (lib/stats-category-yearly.ts)
 */

import assert from 'node:assert/strict'
import {
  categoryYearlyBreakdown,
  categoryYearlySummary,
  subcategoryYearlyBreakdown,
} from '../lib/stats-category-yearly.ts'

console.log('=== Testing Category Yearly Statistics Engine ===\n')

const mockTransactions = [
  // 2025 transactions for 'makanan'
  { id: '1', date: '2025-01-15T10:00:00Z', amount: 150000, type: 'expense', category: 'makanan', subcategory: 'makan siang' },
  { id: '2', date: '2025-01-20T10:00:00Z', amount: 50000, type: 'expense', category: 'makanan', subcategory: 'kopi' },
  { id: '3', date: '2025-03-01T10:00:00Z', amount: 300000, type: 'expense', category: 'makanan', subcategory: 'groceries' },
  { id: '4', date: '2025-06-15T10:00:00Z', amount: 500000, type: 'expense', category: 'makanan', subcategory: 'dinner' },
  // 2025 transaction for 'transport' (different category)
  { id: '5', date: '2025-01-10T10:00:00Z', amount: 200000, type: 'expense', category: 'transport', subcategory: 'bensin' },
  // 2025 transfer (must be EXCLUDED)
  { id: '6', date: '2025-01-12T10:00:00Z', amount: 1000000, type: 'transfer', category: 'makanan' },
  // 2024 transactions for 'makanan' (previous year comparison)
  { id: '7', date: '2024-05-10T10:00:00Z', amount: 800000, type: 'expense', category: 'makanan' },
  // 2025 income transaction (different type)
  { id: '8', date: '2025-01-25T10:00:00Z', amount: 10000000, type: 'income', category: 'gaji' },
  // 2024 leap day transaction
  { id: '9', date: '2024-02-29T12:00:00Z', amount: 200000, type: 'expense', category: 'makanan', subcategory: 'kopi' },
]

// Group 1: 12-Month Breakdown Structure
{
  const breakdown = categoryYearlyBreakdown(mockTransactions, 2025, 'expense', 'makanan')
  assert.equal(breakdown.length, 12, 'Breakdown must always have exactly 12 months')
  assert.equal(breakdown[0].month, 1, 'First month is 1 (Jan)')
  assert.equal(breakdown[0].monthLabel, 'Jan')
  assert.equal(breakdown[0].total, 200000, 'Jan total is 150k + 50k = 200k')
  assert.equal(breakdown[0].count, 2, 'Jan transaction count is 2')

  assert.equal(breakdown[1].month, 2, 'Second month is 2 (Feb)')
  assert.equal(breakdown[1].total, 0, 'Feb total is 0 (empty month)')
  assert.equal(breakdown[1].count, 0, 'Feb count is 0')

  assert.equal(breakdown[2].month, 3, 'Third month is 3 (Mar)')
  assert.equal(breakdown[2].total, 300000, 'Mar total is 300k')

  assert.equal(breakdown[5].month, 6, 'Sixth month is 6 (Jun)')
  assert.equal(breakdown[5].total, 500000, 'Jun total is 500k')

  console.log('✓ Group 1: 12-Month breakdown structure passed')
}

// Group 2: Transfer and Cross-Category Exclusion
{
  const breakdown = categoryYearlyBreakdown(mockTransactions, 2025, 'expense', 'makanan')
  const total = breakdown.reduce((acc, m) => acc + m.total, 0)
  // Expected: Jan (200k) + Mar (300k) + Jun (500k) = 1.000.000
  // Must NOT include transfer (1jt) or transport (200k) or income or 2024
  assert.equal(total, 1000000, 'Total is exactly 1.000.000, transfer and other categories excluded')

  // Check transport
  const transportBreakdown = categoryYearlyBreakdown(mockTransactions, 2025, 'expense', 'transport')
  const transportTotal = transportBreakdown.reduce((acc, m) => acc + m.total, 0)
  assert.equal(transportTotal, 200000, 'Transport total is 200.000')

  console.log('✓ Group 2: Transfer and cross-category exclusion passed')
}

// Group 3: Yearly Summary & Metrics
{
  const summary = categoryYearlySummary(mockTransactions, 2025, 'expense', 'makanan')
  assert.equal(summary.total, 1000000, 'Summary total matches')
  assert.equal(summary.count, 4, 'Summary transaction count is 4')
  assert.equal(summary.monthlyAverage, Math.round(1000000 / 12), 'Monthly average over 12 months')
  assert.equal(summary.highestMonth?.month, 6, 'Highest month is Jun')
  assert.equal(summary.highestMonth?.total, 500000, 'Highest month total is 500k')
  assert.equal(summary.lowestMonth?.month, 1, 'Lowest non-zero month is Jan (200k)')

  // Previous year: 2024 had 800k + 200k = 1.000.000
  assert.equal(summary.previousYearTotal, 1000000, 'Previous year total is 1.000.000')
  assert.equal(summary.changeAmount, 0, 'Change amount is 0')
  assert.equal(summary.changePercentage, 0, 'Change percentage is 0%')

  // Total all expenses in 2025: makanan (1jt) + transport (200k) = 1.200.000
  // Percentage of total: 1.000.000 / 1.200.000 = 83.3%
  assert.equal(summary.percentageOfTotal, 83.3, 'Percentage of total is 83.3%')

  console.log('✓ Group 3: Yearly summary & metrics passed')
}

// Group 4: Subcategory Breakdown
{
  const subBreakdown = subcategoryYearlyBreakdown(mockTransactions, 2025, 'expense', 'makanan')
  assert.equal(subBreakdown.length, 4, '4 subcategories: dinner (500k), groceries (300k), makan siang (150k), kopi (50k)')
  assert.equal(subBreakdown[0].name, 'dinner')
  assert.equal(subBreakdown[0].total, 500000)
  assert.equal(subBreakdown[0].percentage, 50.0)

  assert.equal(subBreakdown[1].name, 'groceries')
  assert.equal(subBreakdown[1].total, 300000)
  assert.equal(subBreakdown[1].percentage, 30.0)

  console.log('✓ Group 4: Subcategory breakdown passed')
}

// Group 5: Leap Year & Edge Cases
{
  // 2024 leap year test
  const feb2024 = categoryYearlyBreakdown(mockTransactions, 2024, 'expense', 'makanan')[1]
  assert.equal(feb2024.month, 2)
  assert.equal(feb2024.total, 200000, 'Feb 29 counted in February')

  // Empty transactions list
  const emptySummary = categoryYearlySummary([], 2025, 'expense', 'makanan')
  assert.equal(emptySummary.total, 0)
  assert.equal(emptySummary.count, 0)
  assert.equal(emptySummary.percentageOfTotal, 0)
  assert.equal(emptySummary.previousYearTotal, 0)
  assert.equal(emptySummary.changePercentage, null)

  console.log('✓ Group 5: Leap year & edge cases passed')
}

console.log('\nAll category yearly statistics tests PASSED!')
