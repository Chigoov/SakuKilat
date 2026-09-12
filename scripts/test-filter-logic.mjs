/**
 * Unit Tests for Universal Transaction Filter (lib/stats.ts - filterTransactions)
 */

import assert from 'node:assert/strict'
import { filterTransactions, rangeTotals, transactionsForRange } from '../lib/stats.ts'

console.log('=== Testing filterTransactions Logic ===\n')

const sampleTransactions = [
  {
    id: 'tx-1',
    date: new Date('2026-03-01T10:00:00Z'),
    amount: 35000,
    type: 'expense',
    category: 'makanan',
    subcategory: 'makan siang',
    description: 'Nasi padang komplit',
    paymentMethod: 'gopay',
  },
  {
    id: 'tx-2',
    date: new Date('2026-03-02T14:30:00Z'),
    amount: 120000,
    type: 'expense',
    category: 'transportasi',
    subcategory: 'bensin',
    description: 'Pertamax full tank',
    paymentMethod: 'bca',
  },
  {
    id: 'tx-3',
    date: new Date('2026-03-05T09:00:00Z'),
    amount: 5000000,
    type: 'income',
    category: 'gaji',
    subcategory: 'gaji pokok',
    description: 'Transfer gaji bulanan kantor',
    paymentMethod: 'bca',
  },
  {
    id: 'tx-4',
    date: new Date('2026-03-10T12:00:00Z'),
    amount: 75000,
    type: 'expense',
    category: 'makanan',
    subcategory: 'kopi',
    description: 'Kopi susu gula aren 2 cup',
    paymentMethod: 'qris',
  },
  {
    id: 'tx-5',
    date: new Date('2026-03-15T18:00:00Z'),
    amount: 500000,
    type: 'transfer',
    category: 'transfer',
    description: 'Pindah dana ke dompet digital',
    paymentMethod: 'bca',
    kind: 'transfer',
  },
  {
    id: 'tx-6',
    date: new Date('2026-02-28T20:00:00Z'),
    amount: 50000,
    type: 'expense',
    category: 'hiburan',
    description: 'Tiket nonton bioskop',
    paymentMethod: 'dana',
  },
]

// 1. Basic Type Filter
{
  const expenses = filterTransactions(sampleTransactions, { type: 'expense' })
  assert.equal(expenses.length, 4, 'Should return 4 expense items')
  assert.ok(expenses.every(t => t.type === 'expense'), 'All returned items must be expense')

  const incomes = filterTransactions(sampleTransactions, { type: 'income' })
  assert.equal(incomes.length, 1, 'Should return 1 income item')
  assert.equal(incomes[0].id, 'tx-3')

  console.log('✓ Group 1: Filter by transaction type passed')
}

// 2. Category Filter
{
  const food = filterTransactions(sampleTransactions, { category: 'makanan' })
  assert.equal(food.length, 2, 'Should return 2 makanan transactions')
  assert.ok(food.every(t => t.category === 'makanan'))

  const transport = filterTransactions(sampleTransactions, { category: 'transportasi' })
  assert.equal(transport.length, 1)
  assert.equal(transport[0].id, 'tx-2')

  console.log('✓ Group 2: Filter by category passed')
}

// 3. Nominal Range Filter
{
  const minOnly = filterTransactions(sampleTransactions, { amountMin: 100000 })
  assert.equal(minOnly.length, 2, 'Should return tx-2 (120k) and tx-3 (5jt)')

  const maxOnly = filterTransactions(sampleTransactions, { amountMax: 50000 })
  assert.equal(maxOnly.length, 2, 'Should return tx-1 (35k) and tx-6 (50k)')

  const minMax = filterTransactions(sampleTransactions, { amountMin: 50000, amountMax: 150000 })
  assert.equal(minMax.length, 3, 'Should return tx-2 (120k), tx-4 (75k), tx-6 (50k)')

  console.log('✓ Group 3: Filter by amount range passed')
}

// 4. Keyword and Token Search
{
  const searchKopi = filterTransactions(sampleTransactions, { keyword: 'kopi' })
  assert.equal(searchKopi.length, 1)
  assert.equal(searchKopi[0].id, 'tx-4')

  const searchSubcat = filterTransactions(sampleTransactions, { keyword: 'bensin' })
  assert.equal(searchSubcat.length, 1)
  assert.equal(searchSubcat[0].id, 'tx-2')

  const searchAmount = filterTransactions(sampleTransactions, { keyword: '35000' })
  assert.equal(searchAmount.length, 1)
  assert.equal(searchAmount[0].id, 'tx-1')

  const searchMethod = filterTransactions(sampleTransactions, { keyword: 'qris' })
  assert.equal(searchMethod.length, 1)
  assert.equal(searchMethod[0].id, 'tx-4')

  console.log('✓ Group 4: Filter by keyword (description/subcategory/amount/payment) passed')
}

// 5. Date Range & Transfer Exclusion
{
  const marchOnly = filterTransactions(sampleTransactions, {
    startDate: new Date('2026-03-01T00:00:00Z'),
    endDate: new Date('2026-03-31T23:59:59Z'),
  })
  // Should include tx-1, tx-2, tx-3, tx-4 (tx-5 is money move, excluded by default; tx-6 is in Feb)
  assert.equal(marchOnly.length, 4)

  const withTransfers = filterTransactions(sampleTransactions, {
    startDate: new Date('2026-03-01T00:00:00Z'),
    endDate: new Date('2026-03-31T23:59:59Z'),
    includeMoneyMoves: true,
  })
  assert.equal(withTransfers.length, 5, 'Should include transfer tx-5 when includeMoneyMoves: true')

  console.log('✓ Group 5: Date range & transfer exclusion passed')
}

// 6. Combined Multi-Filter
{
  const combined = filterTransactions(sampleTransactions, {
    type: 'expense',
    category: 'makanan',
    amountMin: 50000,
    keyword: 'aren',
  })
  assert.equal(combined.length, 1)
  assert.equal(combined[0].id, 'tx-4')

  console.log('✓ Group 6: Multi-field combined filter passed')
}

// 7. History Mode vs Financial Statistics Consistency
{
  // In history tab pipeline: rangeTransactions must pass includeMoneyMoves: true
  const rangeMarch = transactionsForRange(sampleTransactions, new Date('2026-03-01T00:00:00Z'), new Date('2026-04-01T00:00:00Z'), { includeMoneyMoves: true })
  assert.equal(rangeMarch.length, 5, 'rangeTransactions with includeMoneyMoves: true must include transfers')

  // In history tab: when filter is 'semua', includeMoneyMoves: true keeps transfers visible
  const historySemua = filterTransactions(rangeMarch, { includeMoneyMoves: true })
  assert.equal(historySemua.length, 5, 'History mode "semua" in March must retain all transactions including transfers')
  const transferItem = historySemua.find(t => t.id === 'tx-5')
  assert.ok(transferItem, 'Transfer tx-5 must be present in history mode "semua"')

  // When tab is 'pengeluaran' or 'pemasukan', transfers are not included
  const historyExpense = historySemua.filter(t => t.type === 'expense')
  assert.equal(historyExpense.length, 3, 'History mode "pengeluaran" only has expense (3 in March)')
  assert.ok(!historyExpense.some(t => t.kind === 'transfer'), 'No transfers in expense list')

  const historyIncome = historySemua.filter(t => t.type === 'income')
  assert.equal(historyIncome.length, 1, 'History mode "pemasukan" only has income (1 in March)')

  // Financial statistics (rangeTotals) MUST exclude transfers to prevent double counting
  const totals = rangeTotals(sampleTransactions, new Date('2026-03-01T00:00:00Z'), new Date('2026-03-31T23:59:59Z'))
  assert.equal(totals.expense, 230000, 'Financial stats must exclude transfer from expense (35k + 120k + 75k = 230k)')
  assert.equal(totals.income, 5000000, 'Financial stats must exclude transfer from income')

  console.log('✓ Group 7: History mode retains transfers while financial totals exclude them')
}

console.log('\nAll filterTransactions tests PASSED! ✅\n')
