/**
 * SakuKilat — Tab Rekapan Split Line Item Reporting Aggregation Tests (Phase P11, Task 22.4)
 *
 * Requirements: 11.4, 11.5
 * Properties: 31
 *
 * Verifies:
 * 1. Category expense breakdown calculations in `lib/stats.ts` (`rangeCategoryBreakdown` and `categoryBreakdown`)
 *    expand split items by their individual categories (Requirement 11.5).
 * 2. Conservation of total expense: Sum of all category slices strictly matches `rangeTotals.expense`.
 * 3. Subcategory breakdown (`subcategoryBreakdownForRange`) expands split items belonging to the target category.
 * 4. Monthly & yearly category comparisons (`categoryMonthlyComparison`, `categoryYearlyComparison`) expand split items.
 * 5. Category filtering (`filterTransactions` & `transactionsForRange`) accurately matches transactions whose split items match the category.
 * 6. Keyword filtering in `filterTransactions` searches across split line item category, subcategory, and note.
 * 7. Single parent payment method and nominal are preserved in transaction records and transaction list (Requirement 11.4).
 * 8. `components/tab-rekapan.tsx` component integrity:
 *    - `allCategoryOptions` includes categories from split line items.
 *    - `rangeExpenseRows` & `rangeIncomeRows` accurately count transactions containing split line items.
 *    - Category drilldown click handlers include parent transactions with matching split line items.
 * 9. `components/transaction-item.tsx` preserves single parent payment method, full nominal, and renders split badge.
 * 10. `lib/stats-category-yearly.ts` analytical breakdown expands split line items for category drilldown.
 *
 * Jalankan: node scripts/test-rekapan-split-aggregation.mjs
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import {
  categoryBreakdown,
  rangeCategoryBreakdown,
  rangeTotals,
  subcategoryBreakdownForRange,
  categoryMonthlyComparison,
  categoryYearlyComparison,
  filterTransactions,
  transactionsForRange,
} from '../lib/stats.ts'

import {
  categoryYearlyBreakdown,
  subcategoryYearlyBreakdown,
  topTransactionInCategory,
} from '../lib/stats-category-yearly.ts'

import { createSplitLineItem } from '../lib/split-transaction.ts'

let passed = 0
let failed = 0
let total = 0

function test(name, fn) {
  total++
  try {
    fn()
    console.log(`  ✓ PASS: ${name}`)
    passed++
  } catch (e) {
    console.log(`  ✗ FAIL: ${name}`)
    console.log(`    → ${e.message}`)
    failed++
  }
}

console.log('====================================================================')
console.log('  SAKUKILAT — TASK 22.4: TAB REKAPAN SPLIT REPORTING AGGREGATION   ')
console.log('====================================================================\n')

// Sample Dates
const now = new Date()
const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
const midMonth = new Date(now.getFullYear(), now.getMonth(), 15, 12, 0)

// ── Group 1: Category Expense Breakdown Expansion (Requirement 11.5) ───────────
console.log('▶ Group 1: Category Expense Breakdown Expansion in lib/stats.ts (Req 11.5)...')

test('rangeCategoryBreakdown distributes split line items into respective categories', () => {
  const transactions = [
    // Non-split transaction: Rp100.000 for makanan
    {
      id: 'tx-1',
      description: 'Makan siang',
      amount: 100000,
      type: 'expense',
      category: 'makanan',
      paymentMethod: 'bca',
      date: midMonth,
    },
    // Split transaction: Rp300.000 parent (categorized as belanja), split into:
    // - makanan: Rp150.000
    // - kesehatan: Rp100.000
    // - belanja: Rp50.000
    {
      id: 'tx-2',
      description: 'Belanja mall',
      amount: 300000,
      type: 'expense',
      category: 'belanja',
      paymentMethod: 'gopay',
      date: midMonth,
      splitItems: [
        createSplitLineItem({ categoryId: 'makanan', amount: 150000 }),
        createSplitLineItem({ categoryId: 'kesehatan', amount: 100000 }),
        createSplitLineItem({ categoryId: 'belanja', amount: 50000 }),
      ],
    },
    // Non-split transaction: Rp50.000 for transportasi
    {
      id: 'tx-3',
      description: 'Ojek online',
      amount: 50000,
      type: 'expense',
      category: 'transportasi',
      paymentMethod: 'dana',
      date: midMonth,
    },
  ]

  const breakdown = rangeCategoryBreakdown(transactions, startOfMonth, endOfMonth, 'expense')

  // Makanan: 100k (tx-1) + 150k (tx-2 split) = 250k
  const makanan = breakdown.find(s => s.category === 'makanan')
  assert.ok(makanan, 'makanan category slice exists')
  assert.equal(makanan.total, 250000, 'makanan total is 250k')

  // Kesehatan: 100k (tx-2 split)
  const kesehatan = breakdown.find(s => s.category === 'kesehatan')
  assert.ok(kesehatan, 'kesehatan category slice exists')
  assert.equal(kesehatan.total, 100000, 'kesehatan total is 100k')

  // Belanja: 50k (tx-2 split, NOT 300k parent)
  const belanja = breakdown.find(s => s.category === 'belanja')
  assert.ok(belanja, 'belanja category slice exists')
  assert.equal(belanja.total, 50000, 'belanja total is 50k')

  // Transportasi: 50k (tx-3)
  const transportasi = breakdown.find(s => s.category === 'transportasi')
  assert.ok(transportasi, 'transportasi category slice exists')
  assert.equal(transportasi.total, 50000, 'transportasi total is 50k')
})

test('Sum of category breakdown slices strictly equals rangeTotals expense', () => {
  const transactions = [
    {
      id: 'tx-s1',
      amount: 450000,
      type: 'expense',
      category: 'lainnya',
      paymentMethod: 'tunai',
      date: midMonth,
      splitItems: [
        createSplitLineItem({ categoryId: 'makanan', amount: 200000 }),
        createSplitLineItem({ categoryId: 'hiburan', amount: 150000 }),
        createSplitLineItem({ categoryId: 'belanja', amount: 100000 }),
      ],
    },
    {
      id: 'tx-n1',
      amount: 75000,
      type: 'expense',
      category: 'transportasi',
      paymentMethod: 'bca',
      date: midMonth,
    },
  ]

  const totals = rangeTotals(transactions, startOfMonth, endOfMonth)
  const breakdown = rangeCategoryBreakdown(transactions, startOfMonth, endOfMonth, 'expense')
  const sliceSum = breakdown.reduce((sum, s) => sum + s.total, 0)

  assert.equal(totals.expense, 525000, 'rangeTotals expense is 525,000')
  assert.equal(sliceSum, totals.expense, 'Sum of breakdown slices equals rangeTotals expense')

  // Verify percentages sum to 1.0 (100%)
  const pctSum = breakdown.reduce((sum, s) => sum + s.pct, 0)
  assert.ok(Math.abs(pctSum - 1.0) < 0.0001, 'Breakdown percentages sum to 100%')
})

test('categoryBreakdown for current month donut chart distributes split items', () => {
  const transactions = [
    {
      id: 'tx-donut',
      amount: 200000,
      type: 'expense',
      category: 'umum',
      paymentMethod: 'bca',
      date: midMonth,
      splitItems: [
        createSplitLineItem({ categoryId: 'makanan', amount: 120000 }),
        createSplitLineItem({ categoryId: 'tagihan', amount: 80000 }),
      ],
    },
  ]

  const breakdown = categoryBreakdown(transactions, now, 'expense')
  assert.equal(breakdown.length, 2, '2 category slices')
  assert.equal(breakdown[0].category, 'makanan', 'Makanan is top slice')
  assert.equal(breakdown[0].total, 120000, 'Makanan total 120k')
  assert.equal(breakdown[0].pct, 0.6, 'Makanan 60%')
  assert.equal(breakdown[1].category, 'tagihan', 'Tagihan is second slice')
  assert.equal(breakdown[1].total, 80000, 'Tagihan total 80k')
  assert.equal(breakdown[1].pct, 0.4, 'Tagihan 40%')
})

// ── Group 2: Subcategory Breakdown Expansion ──────────────────────────────────
console.log('\n▶ Group 2: Subcategory Breakdown Expansion in lib/stats.ts...')

test('subcategoryBreakdownForRange distributes split items belonging to target category', () => {
  const transactions = [
    // Non-split transaction with subcategory
    {
      id: 't-1',
      amount: 40000,
      type: 'expense',
      category: 'makanan',
      subcategory: 'Sarapan',
      paymentMethod: 'tunai',
      date: midMonth,
    },
    // Split transaction with multiple subcategories in makanan + another category
    {
      id: 't-2',
      amount: 200000,
      type: 'expense',
      category: 'belanja',
      paymentMethod: 'bca',
      date: midMonth,
      splitItems: [
        createSplitLineItem({ categoryId: 'makanan', subcategoryId: 'Kopi', amount: 35000 }),
        createSplitLineItem({ categoryId: 'makanan', subcategoryId: 'Makan Malam', amount: 85000 }),
        createSplitLineItem({ categoryId: 'hiburan', subcategoryId: 'Bioskop', amount: 80000 }),
      ],
    },
  ]

  const subSlices = subcategoryBreakdownForRange(transactions, startOfMonth, endOfMonth, 'makanan', 'expense')

  assert.equal(subSlices.length, 3, '3 subcategories in makanan')
  const makanMalam = subSlices.find(s => s.label === 'Makan Malam')
  assert.ok(makanMalam, 'Makan Malam subcategory found')
  assert.equal(makanMalam.total, 85000, 'Makan Malam total 85k')

  const sarapan = subSlices.find(s => s.label === 'Sarapan')
  assert.ok(sarapan, 'Sarapan subcategory found')
  assert.equal(sarapan.total, 40000, 'Sarapan total 40k')

  const kopi = subSlices.find(s => s.label === 'Kopi')
  assert.ok(kopi, 'Kopi subcategory found')
  assert.equal(kopi.total, 35000, 'Kopi total 35k')

  // Total of makanan subcategories equals 40k + 35k + 85k = 160k
  const subTotal = subSlices.reduce((sum, s) => sum + s.total, 0)
  assert.equal(subTotal, 160000, 'Subcategory sum matches total makanan allocation')

  // Bioskop (hiburan) should NOT be in makanan subcategories
  assert.equal(subSlices.find(s => s.label === 'Bioskop'), undefined, 'Bioskop is not in makanan')
})

// ── Group 3: Category Comparisons Expansion (Monthly & Yearly) ────────────────
console.log('\n▶ Group 3: Category Comparisons Expansion (Monthly & Yearly)...')

test('categoryMonthlyComparison distributes split items across previous and current months', () => {
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 15)
  const transactions = [
    // Previous month split transaction: 100k makanan, 50k belanja
    {
      id: 'tx-prev',
      amount: 150000,
      type: 'expense',
      category: 'lainnya',
      paymentMethod: 'bca',
      date: prevMonthDate,
      splitItems: [
        createSplitLineItem({ categoryId: 'makanan', amount: 100000 }),
        createSplitLineItem({ categoryId: 'belanja', amount: 50000 }),
      ],
    },
    // Current month split transaction: 180k makanan, 70k belanja
    {
      id: 'tx-cur',
      amount: 250000,
      type: 'expense',
      category: 'lainnya',
      paymentMethod: 'gopay',
      date: midMonth,
      splitItems: [
        createSplitLineItem({ categoryId: 'makanan', amount: 180000 }),
        createSplitLineItem({ categoryId: 'belanja', amount: 70000 }),
      ],
    },
  ]

  const comparison = categoryMonthlyComparison(transactions, now, 'expense')
  const makananRow = comparison.find(r => r.category === 'makanan')
  assert.ok(makananRow, 'makanan row in comparison')
  assert.equal(makananRow.current, 180000, 'current makanan total 180k')
  assert.equal(makananRow.previous, 100000, 'previous makanan total 100k')
  assert.equal(makananRow.deltaVsPrev, 0.8, '80% increase in makanan')

  const belanjaRow = comparison.find(r => r.category === 'belanja')
  assert.ok(belanjaRow, 'belanja row in comparison')
  assert.equal(belanjaRow.current, 70000, 'current belanja total 70k')
  assert.equal(belanjaRow.previous, 50000, 'previous belanja total 50k')
  assert.equal(belanjaRow.deltaVsPrev, 0.4, '40% increase in belanja')
})

test('categoryYearlyComparison distributes split items across current and previous year', () => {
  const thisYear = now.getFullYear()
  const prevYear = thisYear - 1
  const transactions = [
    {
      id: 'tx-y-prev',
      amount: 200000,
      type: 'expense',
      category: 'lainnya',
      paymentMethod: 'tunai',
      date: new Date(prevYear, 5, 10),
      splitItems: [
        createSplitLineItem({ categoryId: 'kesehatan', amount: 120000 }),
        createSplitLineItem({ categoryId: 'makanan', amount: 80000 }),
      ],
    },
    {
      id: 'tx-y-cur',
      amount: 300000,
      type: 'expense',
      category: 'lainnya',
      paymentMethod: 'bca',
      date: new Date(thisYear, 5, 10),
      splitItems: [
        createSplitLineItem({ categoryId: 'kesehatan', amount: 180000 }),
        createSplitLineItem({ categoryId: 'makanan', amount: 120000 }),
      ],
    },
  ]

  const yearly = categoryYearlyComparison(transactions, thisYear, 'expense')
  const kesRow = yearly.find(r => r.category === 'kesehatan')
  assert.ok(kesRow, 'kesehatan row found')
  assert.equal(kesRow.total, 180000, 'kesehatan this year: 180k')
  assert.equal(kesRow.prevYearTotal, 120000, 'kesehatan last year: 120k')
  assert.equal(kesRow.changeAmount, 60000, 'kesehatan change: 60k')
  assert.equal(kesRow.changePct, 0.5, 'kesehatan change pct: 50%')
})

// ── Group 4: Filtering & Search with Split Line Items ─────────────────────────
console.log('\n▶ Group 4: Filtering & Search with Split Line Items...')

test('filterTransactions matches transactions when a split line item matches category filter', () => {
  const transactions = [
    {
      id: 'tx-split-1',
      description: 'Belanja mingguan',
      amount: 250000,
      type: 'expense',
      category: 'lainnya',
      paymentMethod: 'bca',
      date: midMonth,
      splitItems: [
        createSplitLineItem({ categoryId: 'makanan', amount: 150000 }),
        createSplitLineItem({ categoryId: 'kesehatan', amount: 100000 }),
      ],
    },
    {
      id: 'tx-normal-1',
      description: 'Obat apotek',
      amount: 50000,
      type: 'expense',
      category: 'kesehatan',
      paymentMethod: 'tunai',
      date: midMonth,
    },
    {
      id: 'tx-normal-2',
      description: 'Bensin motor',
      amount: 30000,
      type: 'expense',
      category: 'transportasi',
      paymentMethod: 'gopay',
      date: midMonth,
    },
  ]

  // Filter category = 'makanan': should return tx-split-1
  const makananFiltered = filterTransactions(transactions, { category: 'makanan' })
  assert.equal(makananFiltered.length, 1, '1 transaction for makanan')
  assert.equal(makananFiltered[0].id, 'tx-split-1', 'tx-split-1 found')

  // Filter category = 'kesehatan': should return tx-split-1 and tx-normal-1
  const kesehatanFiltered = filterTransactions(transactions, { category: 'kesehatan' })
  assert.equal(kesehatanFiltered.length, 2, '2 transactions for kesehatan')
  assert.ok(kesehatanFiltered.some(t => t.id === 'tx-split-1'), 'tx-split-1 found in kesehatan')
  assert.ok(kesehatanFiltered.some(t => t.id === 'tx-normal-1'), 'tx-normal-1 found in kesehatan')
})

test('filterTransactions matches search keywords inside split line items (category, sub, note)', () => {
  const transactions = [
    {
      id: 'tx-search-split',
      description: 'Kuitansi Toko X',
      amount: 150000,
      type: 'expense',
      category: 'lainnya',
      paymentMethod: 'bca',
      date: midMonth,
      splitItems: [
        createSplitLineItem({ categoryId: 'makanan', subcategoryId: 'Kopi Susu', amount: 50000, note: 'Espresso blend' }),
        createSplitLineItem({ categoryId: 'belanja', subcategoryId: 'Stationery', amount: 100000, note: 'Buku catatan agenda' }),
      ],
    },
  ]

  // Search by split subcategory 'Kopi Susu'
  const subMatch = filterTransactions(transactions, { keyword: 'kopi susu' })
  assert.equal(subMatch.length, 1, 'Matches split subcategory')

  // Search by split note 'agenda'
  const noteMatch = filterTransactions(transactions, { keyword: 'agenda' })
  assert.equal(noteMatch.length, 1, 'Matches split note')

  // Search unmatched keyword
  const noMatch = filterTransactions(transactions, { keyword: 'sepeda motor' })
  assert.equal(noMatch.length, 0, 'No match for unrelated term')
})

test('transactionsForRange filters by category including split line items', () => {
  const transactions = [
    {
      id: 't-range-split',
      amount: 100000,
      type: 'expense',
      category: 'lainnya',
      paymentMethod: 'bca',
      date: midMonth,
      splitItems: [
        createSplitLineItem({ categoryId: 'hiburan', amount: 60000 }),
        createSplitLineItem({ categoryId: 'makanan', amount: 40000 }),
      ],
    },
  ]

  const hiburanTxs = transactionsForRange(transactions, startOfMonth, endOfMonth, { category: 'hiburan' })
  assert.equal(hiburanTxs.length, 1, 'hiburan found')
  assert.equal(hiburanTxs[0].id, 't-range-split', 'Matching split transaction returned')

  const transportTxs = transactionsForRange(transactions, startOfMonth, endOfMonth, { category: 'transportasi' })
  assert.equal(transportTxs.length, 0, 'transportasi not found')
})

// ── Group 5: Preservation of Parent Payment Method & Nominal (Req 11.4) ───────
console.log('\n▶ Group 5: Retention of Parent Payment Method & Nominal (Req 11.4)...')

test('Parent payment method, amount, and ID remain unchanged in filtered lists', () => {
  const originalTx = {
    id: 'parent-tx-999',
    description: 'Belanja Bulanan Mega Store',
    amount: 750000,
    type: 'expense',
    category: 'belanja',
    paymentMethod: 'kartu-kredit-bca',
    date: midMonth,
    splitItems: [
      createSplitLineItem({ categoryId: 'makanan', amount: 400000 }),
      createSplitLineItem({ categoryId: 'kesehatan', amount: 200000 }),
      createSplitLineItem({ categoryId: 'hiburan', amount: 150000 }),
    ],
  }

  // When filtered for 'makanan'
  const filtered = filterTransactions([originalTx], { category: 'makanan' })
  assert.equal(filtered.length, 1, 'Found in makanan filter')
  const item = filtered[0]

  // Verify single parent record properties are preserved
  assert.equal(item.id, 'parent-tx-999', 'Parent ID preserved')
  assert.equal(item.amount, 750000, 'Full parent nominal preserved (750k, not split 400k)')
  assert.equal(item.paymentMethod, 'kartu-kredit-bca', 'Parent payment method preserved')
  assert.equal(item.date, midMonth, 'Parent date preserved')
  assert.equal(item.category, 'belanja', 'Parent primary category preserved')
})

// ── Group 6: Tab Rekapan Component Source Integrity ───────────────────────────
console.log('\n▶ Group 6: components/tab-rekapan.tsx Component Integrity...')

test('components/tab-rekapan.tsx includes splitItems in allCategoryOptions', () => {
  const rekapanPath = path.resolve(import.meta.dirname, '../components/tab-rekapan.tsx')
  const content = fs.readFileSync(rekapanPath, 'utf8')
  assert.ok(content.includes('t.splitItems && t.splitItems.length > 0'), 'Checks splitItems in allCategoryOptions')
  assert.ok(content.includes('s.categoryId && s.categoryId !== \'transfer\''), 'Collects categoryId from split line items')
})

test('components/tab-rekapan.tsx counts transactions with split items in rangeExpenseRows and rangeIncomeRows', () => {
  const rekapanPath = path.resolve(import.meta.dirname, '../components/tab-rekapan.tsx')
  const content = fs.readFileSync(rekapanPath, 'utf8')
  assert.ok(content.includes('transaction.splitItems.some((s) => s.categoryId === slice.category)'),
    'rangeExpenseRows counts split transactions')
})

test('components/tab-rekapan.tsx filters transactions with split items in detailSheet and trend mode', () => {
  const rekapanPath = path.resolve(import.meta.dirname, '../components/tab-rekapan.tsx')
  const content = fs.readFileSync(rekapanPath, 'utf8')
  assert.ok(content.includes('transaction.splitItems.some((s) => s.categoryId === item.id)'),
    'Categories detail sheet opens all transactions containing matching split item')
  assert.ok(content.includes('t.splitItems.some((s) => s.categoryId === slice.category)'),
    'Trend mode category drilldown opens transactions containing matching split item')
})

// ── Group 7: TransactionItem Split Badge & Parent Retention ───────────────────
console.log('\n▶ Group 7: components/transaction-item.tsx Split Badge & Parent Retention...')

test('components/transaction-item.tsx renders tx-split-badge when splitItems exist', () => {
  const txItemPath = path.resolve(import.meta.dirname, '../components/transaction-item.tsx')
  const content = fs.readFileSync(txItemPath, 'utf8')
  assert.ok(content.includes('data-testid="tx-split-badge"'), 'Defines tx-split-badge testid')
  assert.ok(content.includes('Split ({transaction.splitItems.length})'), 'Renders split count badge')
  assert.ok(content.includes('getPaymentLabel(transaction.paymentMethod)'), 'Preserves parent payment method label')
  assert.ok(content.includes('formatIDR(transaction.amount)'), 'Preserves full parent nominal')
})

// ── Group 8: Category Year Explorer Analytical Breakdown ─────────────────────
console.log('\n▶ Group 8: lib/stats-category-yearly.ts Analytical Aggregations...')

test('categoryYearlyBreakdown sums split line items matching category across 12 months', () => {
  const year = now.getFullYear()
  const transactions = [
    {
      id: 'tx-yearly-split',
      amount: 500000,
      type: 'expense',
      category: 'lainnya',
      paymentMethod: 'bca',
      date: new Date(year, 2, 10), // March
      splitItems: [
        createSplitLineItem({ categoryId: 'makanan', amount: 300000 }),
        createSplitLineItem({ categoryId: 'transportasi', amount: 200000 }),
      ],
    },
  ]

  const months = categoryYearlyBreakdown(transactions, year, 'expense', 'makanan')
  assert.equal(months.length, 12, '12 months array')
  const march = months[2] // Index 2 is March
  assert.equal(march.total, 300000, 'March total for makanan is 300k (from split)')
  assert.equal(march.count, 1, 'March count is 1')
  assert.equal(march.transactions.length, 1, 'March contains parent transaction')
})

test('subcategoryYearlyBreakdown breaks down subcategories from split line items', () => {
  const year = now.getFullYear()
  const transactions = [
    {
      id: 'tx-sub-split',
      amount: 150000,
      type: 'expense',
      category: 'belanja',
      paymentMethod: 'bca',
      date: new Date(year, 4, 1),
      splitItems: [
        createSplitLineItem({ categoryId: 'makanan', subcategoryId: 'Kopi', amount: 60000 }),
        createSplitLineItem({ categoryId: 'makanan', subcategoryId: 'Snack', amount: 40000 }),
        createSplitLineItem({ categoryId: 'belanja', amount: 50000 }),
      ],
    },
  ]

  const subs = subcategoryYearlyBreakdown(transactions, year, 'expense', 'makanan')
  assert.equal(subs.length, 2, '2 subcategories for makanan')
  assert.equal(subs[0].name, 'Kopi', 'Top sub is Kopi')
  assert.equal(subs[0].total, 60000, 'Kopi total 60k')
  assert.equal(subs[1].name, 'Snack', 'Second sub is Snack')
  assert.equal(subs[1].total, 40000, 'Snack total 40k')
})

test('topTransactionInCategory identifies top transaction accounting for split allocation', () => {
  const year = now.getFullYear()
  const transactions = [
    {
      id: 'tx-small',
      amount: 50000,
      type: 'expense',
      category: 'makanan',
      paymentMethod: 'tunai',
      date: new Date(year, 1, 1),
    },
    {
      id: 'tx-big-split',
      amount: 400000,
      type: 'expense',
      category: 'lainnya',
      paymentMethod: 'bca',
      date: new Date(year, 1, 2),
      splitItems: [
        createSplitLineItem({ categoryId: 'makanan', amount: 250000 }),
        createSplitLineItem({ categoryId: 'hiburan', amount: 150000 }),
      ],
    },
  ]

  const top = topTransactionInCategory(transactions, year, 'expense', 'makanan')
  assert.ok(top, 'Top transaction found')
  assert.equal(top.id, 'tx-big-split', 'tx-big-split is top transaction with 250k allocated to makanan')
})

// ── Summary ──
console.log('\n──────────────────────────────────────────────────')
console.log(`Results: ${passed}/${total} passed, ${failed} failed`)

if (failed > 0) {
  console.log('❌ Some Task 22.4 tests failed!')
  process.exit(1)
} else {
  console.log('✅ All Task 22.4 Tab Rekapan Split Reporting tests passed!')
}
