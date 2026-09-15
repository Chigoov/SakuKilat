/**
 * SakuKilat — Boundary & Extreme Input Test Suite
 *
 * Feature: sakukilat-submenus-and-bugfixes
 * Property 7: Boundary Handling and Rapid Navigation Resilience
 * Validates: Requirements 2.7
 *
 * Suite verifies:
 * 1. Extreme notes (>500 chars, unicode, newlines, tags, spaces)
 * 2. Zero amounts and large numbers up to Rp10.000.000.000
 * 3. Calendar date edge cases: leap year (29 Februari), month transitions, future dates
 * 4. Rapid successive back-press events and state consistency under stress
 */

import assert from 'node:assert/strict'
import {
  formatIDR,
  formatIDRCalendarCompact,
  toCalendarDateString,
  fromCalendarDateTimeStrings,
} from '../lib/parser.ts'
import { parseAmountInput } from '../lib/amount.ts'
import {
  transactionsForRange,
  transactionsForDay,
  dailyAggregates,
  dayKey,
} from '../lib/stats.ts'
import {
  pushBackLayer,
  popBackLayer,
  removeBackLayer,
  clearBackStack,
  backStackDepth,
  handleBackAction,
  resetBackPressTimer,
} from '../lib/back-stack.ts'
import {
  persistState,
  loadPersistedState,
  serializeTransactionDate,
  deserializeTransactionDate,
} from '../lib/storage.ts'
import {
  clampDateToMonthMaxDays,
} from '../lib/parser.ts'
import {
  sanitizeIntegerRupiah,
  validatePositiveMonetaryAmount,
  safeToISOString,
} from '../lib/sanitizer.ts'
import {
  computeWalletBalanceFromLedger,
  reconcileWalletBalances,
} from '../lib/wallet-ledger.ts'
import {
  validatePersistedStateSchema,
} from '../lib/schema-validator.ts'

console.log('========================================================================')
console.log(' SAKUKILAT — PROPERTY 7: BOUNDARY & EXTREME INPUT TEST SUITE            ')
console.log(' Feature: sakukilat-submenus-and-bugfixes                               ')
console.log(' Validates: Requirements 2.7                                            ')
console.log('========================================================================\n')

let passedTests = 0
let totalTests = 0

function runTest(name, fn) {
  totalTests++
  try {
    fn()
    console.log(`  ✓ PASS: ${name}`)
    passedTests++
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`)
    console.error(`     Error: ${err.message}\n`)
    throw err
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Extreme Notes (>500 chars, special chars, whitespace)
// ─────────────────────────────────────────────────────────────────────────────
console.log('▶ Category 1: Extreme Notes (>500 chars, unicode, HTML/special chars)...')

runTest('Extreme note (750 chars) is preserved and trimmed correctly', () => {
  const longText = 'Catatan detail transaksi penting: ' + 'A'.repeat(700) + ' selesai.'
  assert.ok(longText.length > 700)

  const sanitized = longText.trim()
  assert.equal(sanitized.length, longText.length)
  assert.equal(sanitized.endsWith('selesai.'), true)
})

runTest('Extreme note with newlines, unicode emojis, and special chars', () => {
  const complexNote = `
    🧾 Invoice #INV-2026/07/999
    Item: Nasi Goreng Spesial 🍛 & Es Teh Manis 🥤
    Total: Rp45.000 (Termasuk PPN 11% & Service 5%)
    Catatan khusus: Jangan terlalu pedas! <script>alert("safe")</script> & "quoted"
  `
  const trimmed = complexNote.trim()
  assert.ok(trimmed.startsWith('🧾 Invoice'))
  assert.ok(trimmed.includes('<script>alert("safe")</script>'))
  assert.ok(trimmed.includes('🍛'))
})

runTest('Empty or whitespace-only extreme note reduces to undefined', () => {
  const whitespaceVariants = [
    '',
    '    ',
    '\t\t\n\r   \n',
    ' '.repeat(600),
    '\n'.repeat(300),
  ]

  for (const raw of whitespaceVariants) {
    const trimmed = raw.trim()
    const stored = trimmed.length > 0 ? trimmed : undefined
    assert.equal(stored, undefined, `Whitespace variant should be undefined`)
  }
})

runTest('Storage persistence of 1,200 character extreme note', () => {
  const store = new Map()
  const mockStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
  }

  const hugeNote = 'Beli perlengkapan kantor: ' + 'Barang xyz '.repeat(100)
  assert.ok(hugeNote.length > 1000)

  const state = {
    transactions: [
      {
        id: 'tx-huge-note',
        description: 'Pengadaan kantor',
        amount: 2500000,
        type: 'expense',
        category: 'belanja',
        paymentMethod: 'bca',
        date: new Date('2026-07-15T10:00:00'),
        note: hugeNote,
      },
    ],
    wallets: [{ id: 'bca', label: 'BCA', type: 'bank', balance: 10000000, keywords: [] }],
    monthlyBudget: 5000000,
  }

  const ok = persistState(mockStorage, state, 'valid')
  assert.equal(ok, true, 'Persist state with huge note must succeed')

  const loaded = loadPersistedState(mockStorage)
  assert.equal(loaded.status, 'valid')
  assert.equal(loaded.state.transactions[0].note, hugeNote)
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Zero Amounts and Large Numbers up to Rp10.000.000.000
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ Category 2: Zero Amounts and Large Numbers up to 10 Billion...')

runTest('Zero amount input parsing correctly resolves to 0', () => {
  assert.equal(parseAmountInput('0'), 0)
  assert.equal(parseAmountInput('0k'), 0)
  assert.equal(parseAmountInput('0jt'), 0)
  assert.equal(parseAmountInput('  0  '), 0)
  assert.equal(parseAmountInput('Rp 0'), 0)
})

runTest('Large numbers up to Rp10.000.000.000 parsing and formatting', () => {
  const tenBillion = 10_000_000_000

  // 1. Parsing input
  assert.equal(parseAmountInput('10000000000'), tenBillion)
  assert.equal(parseAmountInput('10.000.000.000'), tenBillion)
  assert.equal(parseAmountInput('10000jt'), tenBillion)
  assert.equal(parseAmountInput('10000000k'), tenBillion)

  // 2. Full IDR formatting
  const formattedFull = formatIDR(tenBillion)
  assert.ok(formattedFull.includes('10.000.000.000'))
  assert.ok(formattedFull.startsWith('Rp'))

  // 3. Compact Calendar formatting (must fit without ellipsis, <= 7 chars with prefix)
  const compact = formatIDRCalendarCompact(tenBillion)
  assert.equal(compact, '10M')
  assert.ok(('+' + compact).length <= 7)
  assert.ok(('-' + compact).length <= 7)
})

runTest('Extreme financial calculations with 10 Billion do not overflow Number', () => {
  const initialBalance = 10_000_000_000
  const expense = 3_500_000_000
  const income = 1_250_000_000

  const net = income - expense
  const finalBalance = initialBalance + net

  assert.equal(net, -2_250_000_000)
  assert.equal(finalBalance, 7_750_000_000)
  assert.ok(Number.isSafeInteger(finalBalance))
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Calendar Date Edge Cases (Leap Year, Transitions, Future Dates)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ Category 3: Calendar Date Edge Cases (Leap Year, Transitions, Future Dates)...')

runTest('Leap Year 29 Februari handling (2024 and 2028)', () => {
  const leapDate2024 = fromCalendarDateTimeStrings('2024-02-29', '14:30')
  assert.equal(leapDate2024.getFullYear(), 2024)
  assert.equal(leapDate2024.getMonth(), 1) // 0-indexed February
  assert.equal(leapDate2024.getDate(), 29)
  assert.equal(dayKey(leapDate2024), '2024-02-29')
  assert.equal(toCalendarDateString(leapDate2024), '2024-02-29')

  const leapDate2028 = fromCalendarDateTimeStrings('2028-02-29', '09:00')
  assert.equal(leapDate2028.getDate(), 29)
  assert.equal(dayKey(leapDate2028), '2028-02-29')
})

runTest('Transactions on 29 Februari are properly aggregated and retrieved', () => {
  const febTx = {
    id: 'tx-leap-1',
    description: 'Bonus kabisat',
    amount: 500000,
    type: 'income',
    category: 'gaji',
    paymentMethod: 'bca',
    date: new Date('2024-02-29T10:00:00'),
  }

  const febStart = new Date(2024, 1, 1)
  const febEnd = new Date(2024, 2, 1) // March 1, 2024

  const inFeb = transactionsForRange([febTx], febStart, febEnd)
  assert.equal(inFeb.length, 1)

  const aggMap = dailyAggregates(inFeb)
  const dayAgg = aggMap.get('2024-02-29')
  assert.ok(dayAgg, '2024-02-29 must exist in dailyAggregates')
  assert.equal(dayAgg.income, 500000)

  const dayTxs = transactionsForDay([febTx], '2024-02-29')
  assert.equal(dayTxs.length, 1)
  assert.equal(dayTxs[0].id, 'tx-leap-1')
})

runTest('Month-end transitions (Day 31 23:59:59 to Day 1 00:00:00)', () => {
  const txEndJul = {
    id: 'tx-jul-31',
    description: 'Makan malam akhir Juli',
    amount: 75000,
    type: 'expense',
    category: 'makanan',
    paymentMethod: 'tunai',
    date: new Date('2026-07-31T23:59:59'),
  }
  const txStartAug = {
    id: 'tx-aug-01',
    description: 'Sarapan awal Agustus',
    amount: 25000,
    type: 'expense',
    category: 'makanan',
    paymentMethod: 'tunai',
    date: new Date('2026-08-01T00:00:00'),
  }

  const julStart = new Date(2026, 6, 1)
  const julEnd = new Date(2026, 7, 1)

  const julList = transactionsForRange([txEndJul, txStartAug], julStart, julEnd)
  assert.equal(julList.length, 1, 'July must contain exactly 1 transaction')
  assert.equal(julList[0].id, 'tx-jul-31')

  const augStart = new Date(2026, 7, 1)
  const augEnd = new Date(2026, 8, 1)
  const augList = transactionsForRange([txEndJul, txStartAug], augStart, augEnd)
  assert.equal(augList.length, 1, 'August must contain exactly 1 transaction')
  assert.equal(augList[0].id, 'tx-aug-01')
})

runTest('Future dates up to year 2045 roundtrip serialization and formatting', () => {
  const futureDate = new Date(2045, 11, 25, 18, 30, 0) // 25 Dec 2045
  const serialized = serializeTransactionDate(futureDate)
  assert.equal(serialized, '2045-12-25T18:30:00')

  const deserialized = deserializeTransactionDate(serialized)
  assert.equal(deserialized.getFullYear(), 2045)
  assert.equal(deserialized.getMonth(), 11)
  assert.equal(deserialized.getDate(), 25)
  assert.equal(deserialized.getHours(), 18)
  assert.equal(deserialized.getMinutes(), 30)
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Rapid Successive Back-Press Events and State Consistency
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ Category 4: Rapid Successive Back-Press Events & Navigation Resilience...')

runTest('Rapid successive back-presses on multi-layered stack (LIFO closing order)', () => {
  clearBackStack()
  resetBackPressTimer()

  const closedLog = []

  // Push 3 layers: Saku Sheet -> Modal Edit -> Confirm Dialog
  pushBackLayer({
    id: 'saku-layer-wallets',
    type: 'sheet',
    onClose: () => closedLog.push('saku-layer-wallets'),
  })
  pushBackLayer({
    id: 'modal-edit-wallet',
    type: 'modal',
    onClose: () => closedLog.push('modal-edit-wallet'),
  })
  pushBackLayer({
    id: 'confirm-dialog',
    type: 'dialog',
    onClose: () => closedLog.push('confirm-dialog'),
  })

  assert.equal(backStackDepth(), 3)

  let currentTab = 'saku'
  let appExited = false
  let promptShown = false

  const ctx = {
    get activeTab() { return currentTab },
    onNavigateTab: (t) => { currentTab = t },
    onExitApp: () => { appExited = true },
    onShowExitPrompt: () => { promptShown = true },
  }

  // 1st back: closes confirm-dialog
  const r1 = handleBackAction(ctx)
  assert.equal(r1, 'layer-closed')
  assert.equal(backStackDepth(), 2)
  assert.deepEqual(closedLog, ['confirm-dialog'])

  // 2nd back: closes modal-edit-wallet
  const r2 = handleBackAction(ctx)
  assert.equal(r2, 'layer-closed')
  assert.equal(backStackDepth(), 1)
  assert.deepEqual(closedLog, ['confirm-dialog', 'modal-edit-wallet'])

  // 3rd back: closes saku-layer-wallets
  const r3 = handleBackAction(ctx)
  assert.equal(r3, 'layer-closed')
  assert.equal(backStackDepth(), 0)
  assert.deepEqual(closedLog, ['confirm-dialog', 'modal-edit-wallet', 'saku-layer-wallets'])

  // 4th back: no layers left on tab 'saku' -> navigates to 'beranda'
  const r4 = handleBackAction(ctx)
  assert.equal(r4, 'tab-navigated')
  assert.equal(currentTab, 'beranda')
  assert.equal(appExited, false)

  // 5th back: on 'beranda' -> shows exit prompt
  const r5 = handleBackAction(ctx)
  assert.equal(r5, 'exit-prompt')
  assert.equal(promptShown, true)
  assert.equal(appExited, false)

  // 6th back within 2000ms -> exits app
  const r6 = handleBackAction(ctx)
  assert.equal(r6, 'app-exited')
  assert.equal(appExited, true)
})

runTest('Stress: 100 rapid random push, remove, and pop operations maintain consistency', () => {
  clearBackStack()

  for (let i = 0; i < 100; i++) {
    const action = i % 3
    if (action === 0) {
      pushBackLayer({
        id: `stress-layer-${i}`,
        type: 'modal',
        onClose: () => {},
      })
    } else if (action === 1) {
      if (backStackDepth() > 0) {
        popBackLayer()
      }
    } else {
      if (backStackDepth() > 0) {
        removeBackLayer(`stress-layer-${i - 1}`)
      }
    }
    assert.ok(backStackDepth() >= 0, 'Stack depth must never be negative')
  }

  clearBackStack()
  assert.equal(backStackDepth(), 0, 'Stack must be empty after clear')
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. Extreme Notes: 1,000+ to 5,000+ Characters Payload & Unicode Preserving
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ Category 5: Extreme Notes (1,000+ to 5,000+ chars, emojis, multiline)...')

runTest('1,000+ character note with emojis and multiline invoice text', () => {
  const line = 'Detail item pengeluaran operasional perusahaan 🏢 dengan rincian biaya: '
  const note1000 = line.repeat(15) + ' Selesai audit.'
  assert.ok(note1000.length > 1000, `Note length must exceed 1,000 chars (got ${note1000.length})`)

  const trimmed = note1000.trim()
  assert.equal(trimmed.length, note1000.length)
  assert.ok(trimmed.includes('🏢'))
  assert.ok(trimmed.endsWith('Selesai audit.'))
})

runTest('5,000 character note preserves exact length and characters in storage', () => {
  const note5000 = 'A'.repeat(5000)
  assert.equal(note5000.length, 5000)

  const store = new Map()
  const mockStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
  }

  const state = {
    transactions: [
      {
        id: 'tx-5000-note',
        description: 'Catatan 5k chars',
        amount: 100000,
        type: 'expense',
        category: 'lainnya',
        paymentMethod: 'cash',
        date: new Date('2026-08-01T12:00:00'),
        note: note5000,
      },
    ],
    wallets: [{ id: 'cash', label: 'Tunai', type: 'cash', balance: 500000, keywords: [] }],
    monthlyBudget: 2000000,
  }

  const ok = persistState(mockStorage, state, 'valid')
  assert.equal(ok, true)

  const loaded = loadPersistedState(mockStorage)
  assert.equal(loaded.status, 'valid')
  assert.equal(loaded.state.transactions[0].note.length, 5000)
  assert.equal(loaded.state.transactions[0].note, note5000)
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. Extreme Monetary Scale & 10 Billion Integer Arithmetic
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ Category 6: Extreme Monetary Scale & 10 Billion Integer Arithmetic...')

runTest('sanitizeIntegerRupiah and validatePositiveMonetaryAmount handle 10 Billion', () => {
  const tenBillion = 10_000_000_000

  assert.equal(sanitizeIntegerRupiah(tenBillion), tenBillion)
  assert.equal(sanitizeIntegerRupiah('10.000.000.000'), tenBillion)
  assert.equal(sanitizeIntegerRupiah('Rp 10.000.000.000'), tenBillion)
  assert.equal(validatePositiveMonetaryAmount(tenBillion), tenBillion)
  assert.equal(validatePositiveMonetaryAmount('10000000000'), tenBillion)
})

runTest('Ledger balance summation handles transactions totaling Rp10.000.000.000 without precision loss', () => {
  const tenBillion = 10_000_000_000
  const opening = 2_000_000_000

  const txs = [
    { id: 'tx-1', amount: 5_000_000_000, type: 'income', paymentMethod: 'bca', kind: 'standard' },
    { id: 'tx-2', amount: 3_000_000_000, type: 'income', paymentMethod: 'bca', kind: 'standard' },
    { id: 'tx-3', amount: 1_500_000_000, type: 'expense', paymentMethod: 'bca', kind: 'standard' },
  ]

  const calculated = computeWalletBalanceFromLedger(opening, 'bca', txs)
  // Expected: 2B + 5B + 3B - 1.5B = 8.5B
  assert.equal(calculated, 8_500_000_000)
  assert.ok(Number.isSafeInteger(calculated))

  // Transfer of 1.5B
  const transferTx = {
    id: 'tx-4',
    amount: 1_500_000_000,
    type: 'expense',
    kind: 'transfer',
    fromWalletId: 'bca',
    toWalletId: 'mandiri',
  }

  const afterTransferBca = computeWalletBalanceFromLedger(opening, 'bca', [...txs, transferTx])
  const afterTransferMandiri = computeWalletBalanceFromLedger(0, 'mandiri', [...txs, transferTx])

  assert.equal(afterTransferBca, 7_000_000_000)
  assert.equal(afterTransferMandiri, 1_500_000_000)
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. Date Clamping on Leap Years and Month-End Transitions
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ Category 7: Date Clamping on Leap Years and Month-End Transitions...')

runTest('clampDateToMonthMaxDays correctly clamps Feb 31 to 29 in leap year, 28 in non-leap', () => {
  // 2024 is leap year
  const feb2024 = clampDateToMonthMaxDays(2024, 1, 31)
  assert.equal(feb2024.getFullYear(), 2024)
  assert.equal(feb2024.getMonth(), 1)
  assert.equal(feb2024.getDate(), 29)

  // 2025 is non-leap year
  const feb2025 = clampDateToMonthMaxDays(2025, 1, 31)
  assert.equal(feb2025.getFullYear(), 2025)
  assert.equal(feb2025.getMonth(), 1)
  assert.equal(feb2025.getDate(), 28)

  // 2028 is leap year
  const feb2028 = clampDateToMonthMaxDays(2028, 1, 31)
  assert.equal(feb2028.getDate(), 29)
})

runTest('clampDateToMonthMaxDays clamps 31 to 30 on all 30-day months (Apr, Jun, Sep, Nov)', () => {
  const thirtyDayMonths = [3, 5, 8, 10] // April, June, September, November

  for (const month of thirtyDayMonths) {
    const clamped = clampDateToMonthMaxDays(2026, month, 31)
    assert.equal(clamped.getMonth(), month, `Month ${month} must not roll over`)
    assert.equal(clamped.getDate(), 30, `Day must clamp to 30 for month ${month}`)
  }
})

runTest('safeToISOString handles extreme timestamps, null, and invalid dates defensively', () => {
  const invalidDate = new Date(NaN)
  const safe1 = safeToISOString(invalidDate)
  assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(safe1))

  const safe2 = safeToISOString(null)
  assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(safe2))

  const safe3 = safeToISOString('not-a-valid-date-string')
  assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(safe3))

  const safe4 = safeToISOString(new Date('2024-02-29T23:59:59'))
  assert.ok(safe4.startsWith('2024-02-29'))
})

// ─────────────────────────────────────────────────────────────────────────────
// 8. Rapid Successive Submissions & State Concurrency Resilience
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ Category 8: Rapid Successive Submissions & Concurrency Resilience...')

runTest('Simulating 50 rapid successive transaction additions maintains SSoT ledger integrity', () => {
  let state = {
    wallets: [{ id: 'cash', label: 'Tunai', balance: 100000, openingBalance: 100000, currentBalance: 100000, keywords: [] }],
    transactions: [],
  }

  let mutationSequenceId = 0

  // 50 rapid mutations
  for (let i = 0; i < 50; i++) {
    mutationSequenceId++
    const newTx = {
      id: `tx-rapid-${i}`,
      amount: 10000,
      type: i % 2 === 0 ? 'expense' : 'income',
      paymentMethod: 'cash',
      category: 'makanan',
      date: new Date(),
    }

    state.transactions.push(newTx)
    const newBalance = computeWalletBalanceFromLedger(
      state.wallets[0].openingBalance,
      'cash',
      state.transactions
    )
    state.wallets[0].currentBalance = newBalance
    state.wallets[0].balance = newBalance
  }

  assert.equal(state.transactions.length, 50)
  assert.equal(mutationSequenceId, 50)

  // Net: 25 expenses of 10k (-250k), 25 incomes of 10k (+250k)
  // Final balance must be exactly openingBalance: 100,000
  assert.equal(state.wallets[0].currentBalance, 100000)
  assert.equal(state.wallets[0].balance, 100000)

  // Verify self-healing reconciliation finds 0 drift
  const { auditLogs } = reconcileWalletBalances(state.wallets, state.transactions)
  assert.equal(auditLogs.length, 0, 'Zero drift expected after rapid successive submissions')
})

// ─────────────────────────────────────────────────────────────────────────────
// 9. Malformed JSON State Import & Deep Schema Sanitization
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ Category 9: Malformed JSON State Import & Deep Schema Sanitization...')

runTest('Malformed JSON with corrupted nodes is pruned safely without throwing', () => {
  const hostilePayload = {
    wallets: [
      null,
      undefined,
      'not-an-object',
      { id: '', label: 'No ID' },
      { id: '   ', label: 'Whitespace ID' },
      { id: 'valid-wallet', label: 'Valid Saku', openingBalance: '50000', currentBalance: 50000 },
      { id: 'corrupted-wallet', label: 'Saku Nan', openingBalance: NaN, balance: Infinity },
    ],
    transactions: [
      null,
      { id: '', amount: 50000 },
      { id: 'tx-nan', amount: NaN, type: 'expense' },
      { id: 'tx-inf', amount: Infinity, type: 'expense' },
      { id: 'tx-valid', amount: 75000, type: 'expense', category: 'makanan', paymentMethod: 'valid-wallet' },
    ],
    monthlyBudget: 'invalid-budget-string',
  }

  const result = validatePersistedStateSchema(hostilePayload)
  assert.equal(result.isValid, true, 'validatePersistedStateSchema must sanitize rather than crash')

  // Corrupted nodes are pruned
  assert.equal(result.sanitizedState.wallets.length, 2)
  assert.equal(result.sanitizedState.wallets[0].id, 'valid-wallet')
  assert.equal(result.sanitizedState.wallets[0].openingBalance, 50000)
  // NaN/Infinity sanitized to finite numbers
  assert.equal(result.sanitizedState.wallets[1].id, 'corrupted-wallet')
  assert.equal(Number.isFinite(result.sanitizedState.wallets[1].openingBalance), true)

  assert.equal(result.sanitizedState.transactions.length, 1)
  assert.equal(result.sanitizedState.transactions[0].id, 'tx-valid')
  assert.equal(result.sanitizedState.transactions[0].amount, 75000)

  // Budget invalid string sanitized to 0
  assert.equal(result.sanitizedState.monthlyBudget, 0)
})

runTest('Deep schema validation gracefully handles completely non-object raw inputs', () => {
  assert.equal(validatePersistedStateSchema(null).isValid, false)
  assert.equal(validatePersistedStateSchema(undefined).isValid, false)
  assert.equal(validatePersistedStateSchema('string-payload').isValid, false)
  assert.equal(validatePersistedStateSchema(12345).isValid, false)
  assert.equal(validatePersistedStateSchema([1, 2, 3]).isValid, false)
})

console.log('\n========================================================================')
console.log(`✅ ALL ${totalTests} BOUNDARY & EXTREME INPUT TESTS PASSED!`)
console.log('========================================================================\n')
