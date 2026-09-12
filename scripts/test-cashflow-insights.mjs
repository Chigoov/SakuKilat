/**
 * Unit Tests for Cashflow Summary, Automatic Insights, and Yearly Category Comparison
 * (lib/stats.ts - cashflowSummary, generateInsights, categoryYearlyComparison)
 */

import assert from 'node:assert/strict'
import { cashflowSummary, generateInsights, categoryYearlyComparison } from '../lib/stats.ts'

console.log('=== Testing Cashflow Summary, Insights & Yearly Comparison ===\n')

const marchRef = new Date('2026-03-15T12:00:00Z')

const testTransactions = [
  // March 2026 Income
  { id: 'i-1', date: new Date('2026-03-01T09:00:00Z'), amount: 10000000, type: 'income', category: 'gaji' },
  // March 2026 Expenses
  { id: 'e-1', date: new Date('2026-03-02T12:00:00Z'), amount: 1500000, type: 'expense', category: 'makanan' },
  { id: 'e-2', date: new Date('2026-03-05T15:00:00Z'), amount: 500000, type: 'expense', category: 'transportasi' },
  { id: 'e-3', date: new Date('2026-03-10T10:00:00Z'), amount: 1000000, type: 'expense', category: 'tagihan' },
  // February 2026 Expenses (for month-over-month comparison)
  { id: 'feb-1', date: new Date('2026-02-10T10:00:00Z'), amount: 4000000, type: 'expense', category: 'makanan' },
  { id: 'feb-2', date: new Date('2026-02-15T10:00:00Z'), amount: 1000000, type: 'expense', category: 'transportasi' },
  // 2025 Expenses (for year-over-year comparison)
  { id: 'y25-1', date: new Date('2025-05-10T10:00:00Z'), amount: 8000000, type: 'expense', category: 'makanan' },
  { id: 'y25-2', date: new Date('2025-08-15T10:00:00Z'), amount: 2000000, type: 'expense', category: 'transportasi' },
]

// 1. cashflowSummary calculations
{
  const cf = cashflowSummary(testTransactions, marchRef)
  assert.equal(cf.income, 10000000, 'Income must be 10.000.000')
  assert.equal(cf.expense, 3000000, 'Expense must be 1.5jt + 500k + 1jt = 3.000.000')
  assert.equal(cf.net, 7000000, 'Net must be 7.000.000')

  assert.ok(cf.savingsRatio !== null, 'Savings ratio exists')
  assert.equal(Math.round(cf.savingsRatio * 100), 70, 'Savings ratio is 70%')

  assert.ok(cf.burnRate !== null, 'Burn rate exists')
  assert.equal(Math.round(cf.burnRate * 100), 30, 'Burn rate is 30%')

  assert.ok(cf.avgDailyExpense > 0, 'Average daily expense computed')
  assert.ok(cf.projectedMonthExpense > 0, 'Projected month expense computed')
  assert.ok(cf.projectedMonthNet > 0, 'Projected month net is positive (surplus)')

  console.log('✓ Group 1: cashflowSummary calculations passed')
}

// 2. Deficit and Warning Detection
{
  const deficitTx = [
    { id: 'd-1', date: new Date('2026-03-01T09:00:00Z'), amount: 2000000, type: 'income', category: 'gaji' },
    { id: 'd-2', date: new Date('2026-03-05T10:00:00Z'), amount: 3500000, type: 'expense', category: 'makanan' },
  ]
  const cfDeficit = cashflowSummary(deficitTx, marchRef)
  assert.ok(cfDeficit.burnRate !== null && cfDeficit.burnRate > 1, 'Burn rate > 100%')
  assert.ok(cfDeficit.warnings.length > 0, 'Warnings must be triggered on deficit')

  console.log('✓ Group 2: Deficit and warning detection passed')
}

// 3. generateInsights Engine
{
  const insights = generateInsights(testTransactions, marchRef)
  assert.ok(insights.length > 0, 'Should generate at least one insight')
  assert.ok(insights.length <= 4, 'Should cap at 4 insights')

  const hasSurplusInsight = insights.some(i => i.text.toLowerCase().includes('surplus'))
  assert.ok(hasSurplusInsight, 'Should contain surplus insight')

  const hasSavingsRatio = insights.some(i => i.text.includes('tabungan'))
  assert.ok(hasSavingsRatio, 'Should contain savings ratio insight')

  console.log('✓ Group 3: generateInsights engine passed')
}

// 4. categoryYearlyComparison
{
  const comp2026 = categoryYearlyComparison(testTransactions, 2026, 'expense')
  assert.ok(comp2026.length >= 2, 'Should compare categories present in 2026 and 2025')

  const foodRow = comp2026.find(r => r.category === 'makanan')
  assert.ok(foodRow, 'Makanan row exists')
  assert.equal(foodRow.total, 5500000, '2026 makanan total is 1.5jt (Mar) + 4jt (Feb) = 5.500.000')
  assert.equal(foodRow.prevYearTotal, 8000000, '2025 makanan total is 8.000.000')
  assert.equal(foodRow.changeAmount, 5500000 - 8000000)
  assert.ok(foodRow.changePct !== null && foodRow.changePct < 0, 'Expense decreased vs 2025')

  const tagihanRow = comp2026.find(r => r.category === 'tagihan')
  assert.ok(tagihanRow, 'Tagihan row exists')
  assert.equal(tagihanRow.prevYearTotal, 0, 'Tagihan has 0 in previous year')
  assert.equal(tagihanRow.changePct, null, 'New category without previous year data has null changePct')

  console.log('✓ Group 4: categoryYearlyComparison calculations passed')
}

console.log('\nAll cashflow, insights, and yearly comparison tests PASSED! ✅\n')
