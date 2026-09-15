/**
 * SakuKilat — Calendar Boundary Dates & Consistency Tests (Post-Patch Verification)
 *
 * Requirements:
 * - Consistency across selectedMonth, monthGrid, dayKey, dailyAggregates, and transactionsForDay.
 * - Accurate handling of February normal (28 days) vs leap year (29 days).
 * - Year transition boundaries (December -> January).
 * - Exact day mapping without UTC timezone drift.
 * - Inclusion of money moves (transfers) in monthly calendar activity and day detail views.
 */

import assert from 'node:assert/strict'
import {
  transactionsForRange,
  transactionsForDay,
  dailyAggregates,
  dayKey,
} from '../lib/stats.ts'
import {
  toCalendarDateString,
  fromCalendarDateTimeStrings,
} from '../lib/parser.ts'

console.log('========================================================================')
console.log('  SAKUKILAT — CALENDAR BOUNDARY DATES & REKAPAN POST-PATCH TESTS        ')
console.log('========================================================================\n')

let total = 0
let passed = 0
let failed = 0

function test(name, fn) {
  total++
  try {
    fn()
    console.log(`  ✓ PASS: ${name}`)
    passed++
  } catch (err) {
    console.log(`  ✗ FAIL: ${name}`)
    console.error(`    → ${err.message}`)
    failed++
  }
}

// ── Group 1: dayKey Invariant & Defensiveness ────────────────────────────────
console.log('▶ Group 1: dayKey Formatting & Type Robustness...')

test('dayKey formats Date objects into zero-padded YYYY-MM-DD', () => {
  const d = new Date(2026, 8, 5, 14, 30) // 5 Sep 2026
  assert.equal(dayKey(d), '2026-09-05')
})

test('dayKey safely accepts string dates without throwing TypeError', () => {
  assert.equal(dayKey('2026-09-05T14:30:00'), '2026-09-05')
  assert.equal(dayKey('2026-09-05'), '2026-09-05')
})

test('dayKey safely accepts epoch timestamps and invalid inputs fallback', () => {
  const ts = new Date(2026, 8, 14, 10, 0).getTime()
  assert.equal(dayKey(ts), '2026-09-14')
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(dayKey(null)), 'Null falls back safely')
})

// ── Group 2: Transfer Transaction Invariance in Kalender ─────────────────────
console.log('\n▶ Group 2: Transfer & Money Move Invariance in Kalender...')

test('transactionsForRange with includeMoneyMoves: true preserves transfers in Kalender', () => {
  const transferTx = {
    id: 'tx-tf-sep10',
    description: 'Pindah uang ke GoPay',
    amount: 100000,
    type: 'expense',
    category: 'transfer',
    paymentMethod: 'bca',
    kind: 'transfer',
    fromWalletId: 'bca',
    toWalletId: 'gopay',
    date: new Date('2026-09-10T14:00:00'),
  }

  const monthlyStart = new Date(2026, 8, 1)
  const monthlyEnd = new Date(2026, 9, 1)

  const monthTransactions = transactionsForRange([transferTx], monthlyStart, monthlyEnd, { includeMoneyMoves: true })
  assert.equal(monthTransactions.length, 1, 'Transfer must be included in monthTransactions')

  const monthDayMap = dailyAggregates(monthTransactions)
  const agg = monthDayMap.get('2026-09-10')
  assert.ok(agg, 'Day with transfer must have DayAgg entry in monthDayMap')
  assert.equal(agg.count, 1, 'Count must equal 1')
})

test('Cell count and transactionsForDay count strictly match when transfers exist', () => {
  const mixedTxs = [
    {
      id: 'tx-exp-1',
      description: 'Makan siang',
      amount: 25000,
      type: 'expense',
      category: 'makanan',
      paymentMethod: 'tunai',
      date: new Date('2026-09-10T12:00:00'),
    },
    {
      id: 'tx-tf-1',
      description: 'Transfer ke GoPay',
      amount: 50000,
      type: 'expense',
      category: 'transfer',
      paymentMethod: 'bca',
      kind: 'transfer',
      fromWalletId: 'bca',
      toWalletId: 'gopay',
      date: new Date('2026-09-10T14:00:00'),
    },
  ]

  const monthlyStart = new Date(2026, 8, 1)
  const monthlyEnd = new Date(2026, 9, 1)

  const monthTransactions = transactionsForRange(mixedTxs, monthlyStart, monthlyEnd, { includeMoneyMoves: true })
  const monthDayMap = dailyAggregates(monthTransactions)
  const cellCount = monthDayMap.get('2026-09-10')?.count ?? 0
  const openedTxs = transactionsForDay(mixedTxs, '2026-09-10')

  assert.equal(cellCount, 2, 'Cell count must be 2 (1 expense + 1 transfer)')
  assert.equal(openedTxs.length, 2, 'Opened transactions count must equal 2')
  assert.equal(cellCount, openedTxs.length, 'Zero discrepancy between cell count and opened detail sheet list')
})

// ── Group 3: Leap Year February & Month Boundary Invariants ───────────────────
console.log('\n▶ Group 3: Leap Year February, Year Transitions & Boundaries...')

test('February normal year (2026: 28 days) vs Leap year (2024: 29 days)', () => {
  const feb2026Days = new Date(2026, 2, 0).getDate()
  assert.equal(feb2026Days, 28, '2026 has 28 days in February')

  const feb2024Days = new Date(2024, 2, 0).getDate()
  assert.equal(feb2024Days, 29, '2024 (leap year) has 29 days in February')

  const feb2028Days = new Date(2028, 2, 0).getDate()
  assert.equal(feb2028Days, 29, '2028 (leap year) has 29 days in February')
})

test('Last day of month transactions are preserved in target month range', () => {
  const txLastAug = {
    id: 'tx-aug-31',
    description: 'Belanja akhir Agustus',
    amount: 150000,
    type: 'expense',
    category: 'belanja',
    paymentMethod: 'bca',
    date: fromCalendarDateTimeStrings('2026-08-31', '23:59'),
  }

  const augStart = new Date(2026, 7, 1)
  const augEnd = new Date(2026, 8, 1)

  const inAug = transactionsForRange([txLastAug], augStart, augEnd, { includeMoneyMoves: true })
  assert.equal(inAug.length, 1, 'Aug 31 23:59 must be included in August range')

  const sepStart = new Date(2026, 8, 1)
  const sepEnd = new Date(2026, 9, 1)
  const inSep = transactionsForRange([txLastAug], sepStart, sepEnd, { includeMoneyMoves: true })
  assert.equal(inSep.length, 0, 'Aug 31 23:59 must NOT leak into September range')
})

test('Year boundary transition (Dec 31 -> Jan 1)', () => {
  const txDec31 = {
    id: 'tx-dec-31',
    description: 'Malam tahun baru',
    amount: 300000,
    type: 'expense',
    category: 'hiburan',
    paymentMethod: 'tunai',
    date: fromCalendarDateTimeStrings('2026-12-31', '23:45'),
  }

  const decStart = new Date(2026, 11, 1)
  const decEnd = new Date(2027, 0, 1)
  const inDec = transactionsForRange([txDec31], decStart, decEnd, { includeMoneyMoves: true })
  assert.equal(inDec.length, 1, 'Dec 31 must be in Dec 2026')

  const janStart = new Date(2027, 0, 1)
  const janEnd = new Date(2027, 1, 1)
  const inJan = transactionsForRange([txDec31], janStart, janEnd, { includeMoneyMoves: true })
  assert.equal(inJan.length, 0, 'Dec 31 must NOT leak into Jan 2027')
})

test('transactionsForDay only opens transactions matching target date exactly', () => {
  const dataset = [
    { id: 't-10', date: new Date(2026, 8, 10, 10, 0), amount: 10000, type: 'expense', category: 'makanan', paymentMethod: 'tunai' },
    { id: 't-11a', date: new Date(2026, 8, 11, 0, 1), amount: 20000, type: 'expense', category: 'makanan', paymentMethod: 'tunai' },
    { id: 't-11b', date: new Date(2026, 8, 11, 23, 59), amount: 30000, type: 'expense', category: 'makanan', paymentMethod: 'tunai' },
    { id: 't-12', date: new Date(2026, 8, 12, 10, 0), amount: 40000, type: 'expense', category: 'makanan', paymentMethod: 'tunai' },
  ]

  const matches11 = transactionsForDay(dataset, '2026-09-11')
  assert.equal(matches11.length, 2, 'Exactly 2 transactions for Sep 11')
  assert.deepEqual(matches11.map(t => t.id), ['t-11b', 't-11a'], 'Sorted descending by time')
})


// ── Group 4: Subfase P0.1 Date-Normalization Hardening Invariants ──────────────
console.log('\n▶ Group 4: Subfase P0.1 Date-Normalization Hardening Invariants...')

test('Multiple string-dated transactions on the same date do not crash and are sorted descending', () => {
  const stringTxs = [
    { id: 's-early', date: '2026-09-14T08:15:00', amount: 15000, type: 'expense', category: 'makanan', paymentMethod: 'tunai' },
    { id: 's-noon', date: '2026-09-14T12:30:00', amount: 35000, type: 'expense', category: 'makanan', paymentMethod: 'gopay' },
    { id: 's-late', date: '2026-09-14T21:45:00', amount: 50000, type: 'expense', category: 'makanan', paymentMethod: 'bca' },
  ]

  // Calling transactionsForDay with multiple string transactions MUST NOT throw "getTime is not a function"
  const forDay = transactionsForDay(stringTxs, '2026-09-14')
  assert.equal(forDay.length, 3, 'All 3 string-dated transactions for 2026-09-14 must be returned')
  assert.deepEqual(
    forDay.map(t => t.id),
    ['s-late', 's-noon', 's-early'],
    'Transactions on the same date must be sorted descending from newest to oldest'
  )
})

test('String-dated transactions outside date range are strictly excluded from transactionsForRange', () => {
  const rangeTxs = [
    { id: 't-sep-start', date: '2026-09-01T00:00:00', amount: 10000, type: 'expense', category: 'makanan', paymentMethod: 'tunai' },
    { id: 't-sep-mid', date: '2026-09-15T12:00:00', amount: 20000, type: 'expense', category: 'makanan', paymentMethod: 'tunai' },
    { id: 't-sep-end', date: '2026-09-30T23:59:59', amount: 30000, type: 'expense', category: 'makanan', paymentMethod: 'tunai' },
    // String dates outside September range (MUST be excluded)
    { id: 't-aug-last', date: '2026-08-31T23:59:59', amount: 40000, type: 'expense', category: 'makanan', paymentMethod: 'tunai' },
    { id: 't-oct-first', date: '2026-10-01T00:00:00', amount: 50000, type: 'expense', category: 'makanan', paymentMethod: 'tunai' },
    { id: 't-past-year', date: '2025-09-15T12:00:00', amount: 60000, type: 'expense', category: 'makanan', paymentMethod: 'tunai' },
    { id: 't-future-year', date: '2027-09-15T12:00:00', amount: 70000, type: 'expense', category: 'makanan', paymentMethod: 'tunai' },
  ]

  const mStart = new Date(2026, 8, 1) // 1 Sep 2026 00:00:00
  const mEnd = new Date(2026, 9, 1)   // 1 Oct 2026 00:00:00

  const filtered = transactionsForRange(rangeTxs, mStart, mEnd)
  assert.equal(filtered.length, 3, 'Only the 3 September transactions must be included')
  assert.deepEqual(
    filtered.map(t => t.id),
    ['t-sep-end', 't-sep-mid', 't-sep-start'],
    'Result must only contain within-range transactions and be sorted descending'
  )
})

test('Mixed combinations of Date, ISO string, and epoch number dates remain consistent across functions', () => {
  const mixedDataset = [
    { id: 'd-date-obj', date: new Date(2026, 8, 14, 15, 0), amount: 10000, type: 'expense', category: 'makanan', paymentMethod: 'tunai' },
    { id: 'd-str-iso', date: '2026-09-14T18:30:00', amount: 20000, type: 'expense', category: 'makanan', paymentMethod: 'gopay' },
    { id: 'd-str-simple', date: '2026-09-14', amount: 30000, type: 'expense', category: 'makanan', paymentMethod: 'bca' },
    { id: 'd-epoch-num', date: new Date(2026, 8, 14, 9, 0).getTime(), amount: 40000, type: 'expense', category: 'makanan', paymentMethod: 'dana' },
    // Different date (must not match)
    { id: 'd-other-date', date: '2026-09-15T10:00:00', amount: 50000, type: 'expense', category: 'makanan', paymentMethod: 'tunai' },
  ]

  // 1. dayKey consistency across types
  assert.equal(dayKey(mixedDataset[0].date), '2026-09-14')
  assert.equal(dayKey(mixedDataset[1].date), '2026-09-14')
  assert.equal(dayKey(mixedDataset[2].date), '2026-09-14')
  assert.equal(dayKey(mixedDataset[3].date), '2026-09-14')

  // 2. dailyAggregates on mixed types
  const agg = dailyAggregates(mixedDataset)
  const sep14Agg = agg.get('2026-09-14')
  assert.ok(sep14Agg, '2026-09-14 aggregate exists')
  assert.equal(sep14Agg.count, 4, 'Aggregate count for mixed types must equal 4')
  assert.equal(sep14Agg.expense, 100000, 'Sum of expenses for mixed types equals 100,000')

  // 3. transactionsForDay on mixed types
  const dayList = transactionsForDay(mixedDataset, '2026-09-14')
  assert.equal(dayList.length, 4, 'transactionsForDay must return all 4 items on 2026-09-14')
  assert.equal(dayList[0].id, 'd-str-iso', '18:30 is newest')
  assert.equal(dayList[1].id, 'd-date-obj', '15:00 is second')
})

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────────────────────────────────────')
console.log(`Results: ${passed}/${total} passed, ${failed} failed`)

if (failed > 0) {
  console.log('❌ Some calendar boundary & consistency tests failed!')
  process.exit(1)
} else {
  console.log('✅ ALL CALENDAR BOUNDARY & REKAPAN POST-PATCH TESTS PASSED!')
}
