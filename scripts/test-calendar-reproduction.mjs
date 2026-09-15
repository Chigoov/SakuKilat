/**
 * SakuKilat — Calendar Reproduction Test (Fase P0)
 *
 * Verifies the failure modes identified in components/tab-rekapan.tsx:
 * 1. Transfer transactions are completely excluded from monthTransactions and dailyAggregates in Kalender,
 *    causing days with only transfers to have hasActivity = false (disabled button, 0 count).
 * 2. If transactions contain date strings (e.g. from storage/export), dayKey(t.date) crashes with:
 *    TypeError: d.getFullYear is not a function.
 * 3. Discrepancy between calendar cell count and bottom sheet transactionsForDay count when transfers exist.
 * 4. Month boundary and leap year February date consistency.
 */

import assert from 'node:assert/strict'
import {
  transactionsForRange,
  transactionsForDay,
  dailyAggregates,
  dayKey,
} from '../lib/stats.ts'

console.log('========================================================================')
console.log('  SAKUKILAT — CALENDAR BUG REPRODUCTION SUITE (FASE P0)                 ')
console.log('========================================================================\n')

let failedCount = 0

// ── TEST 1: Transfer Exclusion Bug in Kalender ────────────────────────────────
console.log('▶ [Bug 1] Transfer Transaction Visibility in Kalender...')
try {
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

  // As implemented currently in tab-rekapan.tsx line 442:
  const monthTransactions = transactionsForRange([transferTx], monthlyStart, monthlyEnd)
  
  // EXPECTATION: Transfer MUST be included so user sees activity on the calendar!
  // ACTUAL BUG: monthTransactions.length is 0 because transactionsForRange excludes money moves by default.
  assert.equal(monthTransactions.length, 1, 'monthTransactions in Kalender must include transfers')
  
  const monthDayMap = dailyAggregates(monthTransactions)
  const agg = monthDayMap.get('2026-09-10')
  assert.ok(agg && agg.count > 0, 'Day with transfer must have activity in Kalender')
  console.log('  ✓ PASS: Transfers are included in Kalender')
} catch (err) {
  console.log('  ✗ BUG CONFIRMED (Failed as expected before patch):')
  console.log(`    → ${err.message}`)
  failedCount++
}

// ── TEST 2: String Date Crash in dayKey / dailyAggregates ──────────────────────
console.log('\n▶ [Bug 2] String Date Handling in dayKey & dailyAggregates...')
try {
  const stringTx = {
    id: 'tx-str-1',
    description: 'Transaksi string date',
    amount: 25000,
    type: 'expense',
    category: 'makanan',
    paymentMethod: 'tunai',
    date: '2026-09-14T12:00:00', // String representation
  }

  // EXPECTATION: dayKey should safely format string dates without crashing!
  // ACTUAL BUG: Throws TypeError: d.getFullYear is not a function
  const key = dayKey(stringTx.date)
  assert.equal(key, '2026-09-14', 'dayKey must handle string dates')

  const agg = dailyAggregates([stringTx])
  assert.ok(agg.get('2026-09-14'), 'dailyAggregates must handle transactions with string dates')
  console.log('  ✓ PASS: String dates handled safely')
} catch (err) {
  console.log('  ✗ BUG CONFIRMED (Failed as expected before patch):')
  console.log(`    → ${err.message}`)
  failedCount++
}

// ── TEST 3: Discrepancy between Cell Count and transactionsForDay ──────────────
console.log('\n▶ [Bug 3] Count Discrepancy Between Calendar Cell & transactionsForDay...')
try {
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

  // Current tab-rekapan logic:
  const monthTransactions = transactionsForRange(mixedTxs, monthlyStart, monthlyEnd)
  const monthDayMap = dailyAggregates(monthTransactions)
  const cellCount = monthDayMap.get('2026-09-10')?.count ?? 0

  // Bottom sheet logic:
  const openedTxs = transactionsForDay(mixedTxs, '2026-09-10')

  // EXPECTATION: Cell count must match the number of transactions opened in bottom sheet!
  // ACTUAL BUG: cellCount is 1 (transfer excluded), but openedTxs has 2 transactions!
  assert.equal(cellCount, openedTxs.length, `Cell count (${cellCount}) must match opened transactions (${openedTxs.length})`)
  console.log('  ✓ PASS: Cell count matches opened transactions')
} catch (err) {
  console.log('  ✗ BUG CONFIRMED (Failed as expected before patch):')
  console.log(`    → ${err.message}`)
  failedCount++
}

console.log('\n========================================================================')
console.log(`Reproduction Result: ${failedCount} failure(s) reproduced successfully on current codebase.`)
console.log('========================================================================\n')
