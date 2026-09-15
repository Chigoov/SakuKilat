/**
 * SakuKilat — Monthly Financial Close Tests (Phase P9, Task 18.1)
 *
 * Verifies:
 * 1. MonthlyCloseRecord schema compliance (id: "YYYY-MM", year, month, closedAt, incomeTotal, expenseTotal, netSavings, unreconciledVariances, isReopened)
 * 2. Pre-closing validation checklist items (Requirement 9.1, Property 26):
 *    - Uncategorized transactions in target month
 *    - Pending inbox items in target month
 *    - Active wallets unreconciled in target month
 *    - Overdue unpaid bills in target month
 * 3. Monthly financial summary compiler identity: netSavings === totalIncome - totalExpense (Requirement 9.2, Property 27)
 * 4. Month closure locking with timestamp (Requirement 9.3)
 * 5. Reopening closed months with mandatory audit note (Requirement 9.4)
 * 6. Re-closing previously reopened month
 * 7. Query helpers: isMonthClosed, getMonthlyCloseRecord, formatMonthLabel, formatMonthId
 * 8. Storage persistence and structural validation in lib/storage.ts
 *
 * Jalankan: node scripts/test-monthly-close.mjs
 */

import {
  formatMonthId,
  parseMonthId,
  formatMonthLabel,
  matchesMonth,
  isMoneyMove,
  isUncategorizedTransaction,
  isPendingInboxItemInMonth,
  isWalletReconciledInMonth,
  isBillOverdueInMonth,
  evaluatePreClosingChecklist,
  compileMonthlyFinancialSummary,
  createMonthlyCloseRecord,
  reopenMonthlyClose,
  recloseMonthlyClose,
  isMonthClosed,
  getMonthlyCloseRecord,
  MonthlyCloseManager,
} from '../lib/monthly-close.ts'

import {
  validatePersistedStateStructure,
  loadPersistedState,
  persistState,
  STORAGE_KEY,
  CURRENT_SCHEMA_VERSION,
} from '../lib/storage.ts'

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

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed')
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

console.log('=== Task 18.1: Monthly Financial Close (Tutup Bulan) Tests ===\n')

// ── Group 1: Canonical Month Formatting & Parsing ──
console.log('Group 1: Canonical Month ID & Label Formatting')

test('formatMonthId produces canonical "YYYY-MM" format', () => {
  assertEqual(formatMonthId(2026, 3), '2026-03', 'March 2026')
  assertEqual(formatMonthId(2025, 12), '2025-12', 'December 2025')
  assertEqual(formatMonthId(2026, 1), '2026-01', 'January 2026')
})

test('parseMonthId parses valid "YYYY-MM" strings and rejects malformed inputs', () => {
  const res = parseMonthId('2026-03')
  assertEqual(res.year, 2026, 'parsed year')
  assertEqual(res.month, 3, 'parsed month')

  let threw = false
  try {
    parseMonthId('invalid-month')
  } catch {
    threw = true
  }
  assert(threw, 'Should throw on invalid string')

  threw = false
  try {
    parseMonthId('2026-15')
  } catch {
    threw = true
  }
  assert(threw, 'Should throw on month > 12')
})

test('formatMonthLabel produces localized Indonesian month names', () => {
  assertEqual(formatMonthLabel(2026, 3), 'Maret 2026', 'Maret 2026')
  assertEqual(formatMonthLabel(2026, 8), 'Agustus 2026', 'Agustus 2026')
  assertEqual(formatMonthLabel(2025, 1), 'Januari 2025', 'Januari 2025')
})

test('matchesMonth evaluates calendar dates accurately without timezone drift', () => {
  assert(matchesMonth(new Date(2026, 2, 15, 14, 30), 2026, 3), 'Date in March 2026')
  assert(!matchesMonth(new Date(2026, 1, 28), 2026, 3), 'Date in Feb 2026')
  assert(matchesMonth('2026-03-01T00:00:00', 2026, 3), 'String ISO in March 2026')
  assert(matchesMonth('2026-03-31', 2026, 3), 'String YYYY-MM-DD in March 2026')
  assert(!matchesMonth(null, 2026, 3), 'Null date returns false')
})

// ── Group 2: Checklist Items & Evaluator (Req 9.1, Property 26) ──
console.log('\nGroup 2: Pre-Closing Checklist Evaluation (Req 9.1, Property 26)')

test('Check 1: Uncategorized transactions detection', () => {
  const txCategorized = {
    id: 'tx-1',
    description: 'Nasi goreng',
    amount: 25000,
    type: 'expense',
    category: 'makanan',
    paymentMethod: 'tunai',
    date: new Date(2026, 2, 10),
  }
  const txLainnya = {
    id: 'tx-2',
    description: 'Beli barang acak',
    amount: 50000,
    type: 'expense',
    category: 'lainnya',
    paymentMethod: 'gopay',
    date: new Date(2026, 2, 12),
  }
  const txEmptyCat = {
    id: 'tx-3',
    description: 'Tanpa kategori',
    amount: 15000,
    type: 'expense',
    category: '',
    paymentMethod: 'bca',
    date: new Date(2026, 2, 14),
  }
  const txTransfer = {
    id: 'tx-4',
    description: 'Pindah uang',
    amount: 100000,
    type: 'expense',
    kind: 'transfer',
    category: 'transfer',
    paymentMethod: 'bca',
    date: new Date(2026, 2, 15),
  }

  assert(!isUncategorizedTransaction(txCategorized), 'Categorized transaction is NOT uncategorized')
  assert(isUncategorizedTransaction(txLainnya), 'category=lainnya is uncategorized')
  assert(isUncategorizedTransaction(txEmptyCat), 'category="" is uncategorized')
  assert(!isUncategorizedTransaction(txTransfer), 'Transfers are NOT uncategorized')
})

test('Check 2: Pending inbox items detection in target month', () => {
  const pendingThisMonth = {
    id: 'inbox-1',
    rawDescription: 'Kopi Kenangan',
    amount: 22000,
    date: '2026-03-05',
    status: 'pending',
    confidence: 0.5,
  }
  const approvedThisMonth = {
    id: 'inbox-2',
    rawDescription: 'Bensin Shell',
    amount: 50000,
    date: '2026-03-08',
    status: 'approved',
    confidence: 0.9,
  }
  const pendingOtherMonth = {
    id: 'inbox-3',
    rawDescription: 'Parkir',
    amount: 5000,
    date: '2026-02-28',
    status: 'pending',
    confidence: 0.4,
  }

  assert(isPendingInboxItemInMonth(pendingThisMonth, 2026, 3), 'Pending item in March matches')
  assert(!isPendingInboxItemInMonth(approvedThisMonth, 2026, 3), 'Approved item does NOT match')
  assert(!isPendingInboxItemInMonth(pendingOtherMonth, 2026, 3), 'Pending item in Feb does NOT match March')
})

test('Check 3: Active wallet reconciliation in target month', () => {
  const walletReconciled = {
    id: 'bca',
    label: 'BCA',
    type: 'bank',
    balance: 5000000,
    keywords: ['bca'],
  }
  const walletUnreconciled = {
    id: 'tunai',
    label: 'Tunai',
    type: 'cash',
    balance: 250000,
    keywords: ['tunai'],
  }

  const reconciliations = [
    {
      id: 'rec-1',
      walletId: 'bca',
      reconciledAt: '2026-03-20T10:00:00.000Z',
      expectedBalance: 5000000,
      actualBalance: 5000000,
      difference: 0,
    },
    {
      id: 'rec-old',
      walletId: 'tunai',
      reconciledAt: '2026-02-15T10:00:00.000Z',
      expectedBalance: 200000,
      actualBalance: 200000,
      difference: 0,
    },
  ]

  assert(isWalletReconciledInMonth(walletReconciled, reconciliations, 2026, 3), 'BCA is reconciled in March')
  assert(!isWalletReconciledInMonth(walletUnreconciled, reconciliations, 2026, 3), 'Tunai is NOT reconciled in March')
})

test('Check 4: Overdue unpaid bills detection in target month', () => {
  const refDate = new Date(2026, 2, 20) // March 20, 2026

  const billOverdue = {
    id: 'bill-1',
    name: 'WiFi Indihome',
    amount: 350000,
    categoryId: 'tagihan',
    paymentMethodId: 'bca',
    recurrence: 'monthly',
    dueDay: 10,
    nextDueDate: '2026-03-10', // Due on March 10, ref is March 20 -> overdue
    isActive: true,
  }
  const billDueLater = {
    id: 'bill-2',
    name: 'Listrik PLN',
    amount: 250000,
    categoryId: 'tagihan',
    paymentMethodId: 'bca',
    recurrence: 'monthly',
    dueDay: 25,
    nextDueDate: '2026-03-25', // Due on March 25, ref is March 20 -> not overdue yet
    isActive: true,
  }
  const billInactive = {
    id: 'bill-3',
    name: 'Spotify',
    amount: 55000,
    categoryId: 'tagihan',
    paymentMethodId: 'gopay',
    recurrence: 'monthly',
    dueDay: 5,
    nextDueDate: '2026-03-05',
    isActive: false, // Inactive
  }

  assert(isBillOverdueInMonth(billOverdue, 2026, 3, refDate), 'WiFi due March 10 is overdue on March 20')
  assert(!isBillOverdueInMonth(billDueLater, 2026, 3, refDate), 'Listrik due March 25 is NOT overdue on March 20')
  assert(!isBillOverdueInMonth(billInactive, 2026, 3, refDate), 'Inactive bill is ignored')
})

test('Complete Checklist: All pass scenario gives isReadyToClose = true', () => {
  const transactions = [
    {
      id: 'tx-1',
      description: 'Gaji',
      amount: 10000000,
      type: 'income',
      category: 'gaji',
      paymentMethod: 'bca',
      date: new Date(2026, 2, 25),
    },
    {
      id: 'tx-2',
      description: 'Makan siang',
      amount: 35000,
      type: 'expense',
      category: 'makanan',
      paymentMethod: 'bca',
      date: new Date(2026, 2, 26),
    },
  ]
  const wallets = [
    { id: 'bca', label: 'BCA', type: 'bank', balance: 9965000, keywords: ['bca'] },
  ]
  const reconciliations = [
    {
      id: 'rec-1',
      walletId: 'bca',
      reconciledAt: '2026-03-27T10:00:00Z',
      expectedBalance: 9965000,
      actualBalance: 9965000,
      difference: 0,
    },
  ]
  const bills = [
    {
      id: 'bill-1',
      name: 'Internet',
      amount: 300000,
      categoryId: 'tagihan',
      paymentMethodId: 'bca',
      recurrence: 'monthly',
      dueDay: 5,
      nextDueDate: '2026-04-05', // Already advanced to April
      isActive: true,
    },
  ]

  const result = evaluatePreClosingChecklist({
    year: 2026,
    month: 3,
    transactions,
    inbox: [],
    wallets,
    reconciliations,
    bills,
  })

  assert(result.isReadyToClose, 'Should be ready to close')
  assertEqual(result.totalViolations, 0, 'totalViolations')
  assertEqual(result.totalIssuesCount, 0, 'totalIssuesCount')
  assert(result.items.uncategorizedTransactions.isPassed, 'uncategorized passed')
  assert(result.items.pendingInbox.isPassed, 'pendingInbox passed')
  assert(result.items.unreconciledWallets.isPassed, 'unreconciledWallets passed')
  assert(result.items.overdueBills.isPassed, 'overdueBills passed')
})

test('Complete Checklist: Reports exact violations when issues exist (Property 26)', () => {
  const transactions = [
    {
      id: 'tx-uncat',
      description: 'Barang apa ini',
      amount: 10000,
      type: 'expense',
      category: 'lainnya',
      paymentMethod: 'tunai',
      date: new Date(2026, 2, 5),
    },
  ]
  const inbox = [
    {
      id: 'inbox-item-1',
      rawDescription: 'Tagihan tak dikenal',
      amount: 75000,
      date: '2026-03-11',
      status: 'pending',
      confidence: 0.3,
    },
  ]
  const wallets = [
    { id: 'bca', label: 'BCA', type: 'bank', balance: 1000000, keywords: ['bca'] },
    { id: 'tunai', label: 'Tunai', type: 'cash', balance: 50000, keywords: ['tunai'] },
  ]
  const reconciliations = [
    // only BCA is reconciled, Tunai is unreconciled
    {
      id: 'rec-1',
      walletId: 'bca',
      reconciledAt: '2026-03-15T00:00:00Z',
      expectedBalance: 1000000,
      actualBalance: 1000000,
      difference: 0,
    },
  ]
  const bills = [
    {
      id: 'bill-overdue',
      name: 'Air PDAM',
      amount: 90000,
      categoryId: 'tagihan',
      paymentMethodId: 'bca',
      recurrence: 'monthly',
      dueDay: 5,
      nextDueDate: '2026-03-05',
      isActive: true,
    },
  ]

  const refDate = new Date(2026, 2, 20)
  const result = evaluatePreClosingChecklist({
    year: 2026,
    month: 3,
    transactions,
    inbox,
    wallets,
    reconciliations,
    bills,
    options: { referenceDate: refDate },
  })

  assert(!result.isReadyToClose, 'Must not be ready to close')
  assertEqual(result.totalViolations, 4, 'All 4 categories have issues')
  assertEqual(result.totalIssuesCount, 4, 'Sum of issues is 4')
  assert(!result.items.uncategorizedTransactions.isPassed, 'uncategorized failed')
  assertEqual(result.items.uncategorizedTransactions.count, 1, '1 uncategorized')
  assert(!result.items.pendingInbox.isPassed, 'pendingInbox failed')
  assertEqual(result.items.pendingInbox.count, 1, '1 pending inbox')
  assert(!result.items.unreconciledWallets.isPassed, 'unreconciledWallets failed')
  assertEqual(result.items.unreconciledWallets.count, 1, 'Tunai is unreconciled')
  assert(!result.items.overdueBills.isPassed, 'overdueBills failed')
  assertEqual(result.items.overdueBills.count, 1, 'Air PDAM is overdue')
})

// ── Group 3: Monthly Financial Summary Compiler (Req 9.2, Property 27) ──
console.log('\nGroup 3: Monthly Financial Summary Compiler (Req 9.2, Property 27)')

test('Guarantees mathematical identity netSavings === totalIncome - totalExpense', () => {
  const transactions = [
    { id: 'tx-1', description: 'Gaji pokok', amount: 8000000, type: 'income', category: 'gaji', paymentMethod: 'bca', date: new Date(2026, 2, 1) },
    { id: 'tx-2', description: 'Bonus freelance', amount: 2500000, type: 'income', category: 'freelance', paymentMethod: 'bca', date: new Date(2026, 2, 10) },
    { id: 'tx-3', description: 'Sewa rumah', amount: 2000000, type: 'expense', category: 'tagihan', paymentMethod: 'bca', date: new Date(2026, 2, 5) },
    { id: 'tx-4', description: 'Belanja bulanan', amount: 1500000, type: 'expense', category: 'belanja', paymentMethod: 'bca', date: new Date(2026, 2, 12) },
    { id: 'tx-5', description: 'Makan resto', amount: 350000, type: 'expense', category: 'makanan', paymentMethod: 'tunai', date: new Date(2026, 2, 18) },
    // Internal transfer - should be excluded from income & expense
    { id: 'tx-move', description: 'Tarik tunai', amount: 500000, type: 'expense', kind: 'transfer', category: 'transfer', fromWalletId: 'bca', toWalletId: 'tunai', paymentMethod: 'bca', date: new Date(2026, 2, 15) },
    // Transaction in different month (April) - must be excluded
    { id: 'tx-next-month', description: 'Makan April', amount: 45000, type: 'expense', category: 'makanan', paymentMethod: 'tunai', date: new Date(2026, 3, 2) },
  ]

  const reconciliations = [
    { id: 'r1', walletId: 'bca', reconciledAt: '2026-03-28T00:00:00Z', expectedBalance: 7000000, actualBalance: 6990000, difference: -10000 },
    { id: 'r2', walletId: 'tunai', reconciledAt: '2026-03-28T00:00:00Z', expectedBalance: 150000, actualBalance: 155000, difference: 5000 },
  ]

  const summary = compileMonthlyFinancialSummary({
    year: 2026,
    month: 3,
    transactions,
    reconciliations,
  })

  const expectedIncome = 8000000 + 2500000 // 10,500,000
  const expectedExpense = 2000000 + 1500000 + 350000 // 3,850,000
  const expectedNet = expectedIncome - expectedExpense // 6,650,000

  assertEqual(summary.incomeTotal, expectedIncome, 'incomeTotal')
  assertEqual(summary.expenseTotal, expectedExpense, 'expenseTotal')
  assertEqual(summary.netSavings, expectedNet, 'netSavings')
  assertEqual(summary.netSavings, summary.incomeTotal - summary.expenseTotal, 'Strict identity verified')
  assertEqual(summary.incomeCount, 2, 'incomeCount')
  assertEqual(summary.expenseCount, 3, 'expenseCount')
  assertEqual(summary.transferCount, 1, 'transferCount')
  assertEqual(summary.transactionCount, 6, 'transactionCount in month (5 normal + 1 transfer)')
  assertEqual(summary.unreconciledVariances, -5000, 'unreconciledVariances (-10k + 5k = -5k)')
  assertEqual(summary.reconciliationsCount, 2, 'reconciliationsCount')
})

test('Summary compiler handles empty transaction month gracefully', () => {
  const summary = compileMonthlyFinancialSummary({
    year: 2026,
    month: 1,
    transactions: [],
    reconciliations: [],
  })

  assertEqual(summary.incomeTotal, 0, 'incomeTotal = 0')
  assertEqual(summary.expenseTotal, 0, 'expenseTotal = 0')
  assertEqual(summary.netSavings, 0, 'netSavings = 0')
  assertEqual(summary.netSavings, summary.incomeTotal - summary.expenseTotal, 'Identity holds for zero')
  assertEqual(summary.transactionCount, 0, 'transactionCount = 0')
  assertEqual(summary.unreconciledVariances, 0, 'unreconciledVariances = 0')
})

// ── Group 4: Monthly Close Record Creation & Period Locking (Req 9.3) ──
console.log('\nGroup 4: Monthly Close Creation & Locking (Req 9.3)')

test('createMonthlyCloseRecord creates immutable closed period record', () => {
  const transactions = [
    { id: 'tx-1', description: 'Gaji', amount: 5000000, type: 'income', category: 'gaji', paymentMethod: 'bca', date: new Date(2026, 2, 25) },
    { id: 'tx-2', description: 'Makan', amount: 2000000, type: 'expense', category: 'makanan', paymentMethod: 'bca', date: new Date(2026, 2, 26) },
  ]

  const record = createMonthlyCloseRecord({
    year: 2026,
    month: 3,
    transactions,
    reconciliations: [],
    closedAt: '2026-03-31T23:59:59.000Z',
  })

  assertEqual(record.id, '2026-03', 'id format "YYYY-MM"')
  assertEqual(record.year, 2026, 'year')
  assertEqual(record.month, 3, 'month')
  assertEqual(record.closedAt, '2026-03-31T23:59:59.000Z', 'closedAt timestamp')
  assertEqual(record.incomeTotal, 5000000, 'incomeTotal')
  assertEqual(record.expenseTotal, 2000000, 'expenseTotal')
  assertEqual(record.netSavings, 3000000, 'netSavings')
  assertEqual(record.isReopened, false, 'isReopened initially false')
  assertEqual(record.reopenedNote, undefined, 'reopenedNote undefined')
  assert(isMonthClosed('2026-03', [record]), 'isMonthClosed returns true')
})

// ── Group 5: Reopening Closed Months with Audit Note (Req 9.4) ──
console.log('\nGroup 5: Reopening Closed Months with Audit Note (Req 9.4)')

test('reopenMonthlyClose updates record with mandatory audit note and timestamp', () => {
  const record = createMonthlyCloseRecord({
    year: 2026,
    month: 3,
    transactions: [
      { id: 'tx-1', description: 'Gaji', amount: 5000000, type: 'income', category: 'gaji', paymentMethod: 'bca', date: new Date(2026, 2, 25) },
    ],
    closedAt: '2026-03-31T23:59:59.000Z',
  })

  assert(isMonthClosed('2026-03', [record]), 'Initially closed')

  const reopenNote = 'Koreksi struk belanja tertinggal tanggal 28 Maret'
  const reopenTime = '2026-04-02T10:00:00.000Z'
  const reopenedRecord = reopenMonthlyClose(record, reopenNote, reopenTime)

  assert(reopenedRecord.isReopened, 'isReopened is now true')
  assertEqual(reopenedRecord.reopenedNote, reopenNote, 'Audit note preserved')
  assertEqual(reopenedRecord.reopenedAt, reopenTime, 'reopenedAt preserved')
  assert(!isMonthClosed('2026-03', [reopenedRecord]), 'isMonthClosed returns false for reopened month')

  // Reject empty audit notes
  let threw = false
  try {
    reopenMonthlyClose(record, '   ')
  } catch {
    threw = true
  }
  assert(threw, 'Must reject empty audit note')
})

test('recloseMonthlyClose re-locks a reopened month', () => {
  const record = createMonthlyCloseRecord({
    year: 2026,
    month: 3,
    transactions: [
      { id: 'tx-1', description: 'Gaji', amount: 5000000, type: 'income', category: 'gaji', paymentMethod: 'bca', date: new Date(2026, 2, 25) },
    ],
  })

  const reopened = reopenMonthlyClose(record, 'Ada transaksi tambahan')
  assert(!isMonthClosed('2026-03', [reopened]), 'Month is open')

  // Add the late transaction and reclose
  const updatedTransactions = [
    { id: 'tx-1', description: 'Gaji', amount: 5000000, type: 'income', category: 'gaji', paymentMethod: 'bca', date: new Date(2026, 2, 25) },
    { id: 'tx-late', description: 'Belanja telat', amount: 200000, type: 'expense', category: 'belanja', paymentMethod: 'bca', date: new Date(2026, 2, 28) },
  ]

  const reclosed = recloseMonthlyClose(reopened, {
    transactions: updatedTransactions,
    closedAt: '2026-04-03T12:00:00.000Z',
  })

  assert(!reclosed.isReopened, 'isReopened reset to false')
  assertEqual(reclosed.expenseTotal, 200000, 'expenseTotal updated with late tx')
  assertEqual(reclosed.netSavings, 4800000, 'netSavings updated')
  assert(isMonthClosed('2026-03', [reclosed]), 'Month is now closed again')
})

test('Query helpers: getMonthlyCloseRecord retrieves matching record', () => {
  const records = [
    createMonthlyCloseRecord({ year: 2026, month: 1, transactions: [] }),
    createMonthlyCloseRecord({ year: 2026, month: 2, transactions: [] }),
  ]

  const recFeb = getMonthlyCloseRecord('2026-02', records)
  assert(recFeb !== undefined, 'Found 2026-02')
  assertEqual(recFeb.id, '2026-02', 'id')

  const recObj = getMonthlyCloseRecord({ year: 2026, month: 1 }, records)
  assert(recObj !== undefined, 'Found by object { year, month }')
  assertEqual(recObj.id, '2026-01', 'id')

  const recMissing = getMonthlyCloseRecord('2026-10', records)
  assertEqual(recMissing, undefined, 'Missing record returns undefined')
})

// ── Group 6: Storage Schema & Validation Integration ──
console.log('\nGroup 6: Storage Validation & Persistence Integration')

test('validatePersistedStateStructure accepts monthlyCloses array', () => {
  const validState = {
    transactions: [],
    wallets: [],
    monthlyCloses: [
      {
        id: '2026-02',
        year: 2026,
        month: 2,
        closedAt: new Date().toISOString(),
        incomeTotal: 5000000,
        expenseTotal: 3000000,
        netSavings: 2000000,
        unreconciledVariances: 0,
        isReopened: false,
      },
    ],
  }

  const res = validatePersistedStateStructure(validState)
  assert(res.valid, 'validState with monthlyCloses is accepted')
})

test('validatePersistedStateStructure rejects non-array monthlyCloses', () => {
  const corruptState = {
    monthlyCloses: 'not-an-array',
  }
  const res = validatePersistedStateStructure(corruptState)
  assert(!res.valid, 'Non-array monthlyCloses is rejected')
})

test('MonthlyCloseManager static class exports all functional utilities', () => {
  assert(typeof MonthlyCloseManager.evaluatePreClosingChecklist === 'function', 'evaluatePreClosingChecklist')
  assert(typeof MonthlyCloseManager.compileMonthlyFinancialSummary === 'function', 'compileMonthlyFinancialSummary')
  assert(typeof MonthlyCloseManager.createMonthlyCloseRecord === 'function', 'createMonthlyCloseRecord')
  assert(typeof MonthlyCloseManager.reopenMonthlyClose === 'function', 'reopenMonthlyClose')
  assert(typeof MonthlyCloseManager.recloseMonthlyClose === 'function', 'recloseMonthlyClose')
  assert(typeof MonthlyCloseManager.isMonthClosed === 'function', 'isMonthClosed')
  assert(typeof MonthlyCloseManager.getMonthlyCloseRecord === 'function', 'getMonthlyCloseRecord')
  assert(typeof MonthlyCloseManager.formatMonthId === 'function', 'formatMonthId')
})

// ── Summary ──
console.log('\n──────────────────────────────────────────────────')
console.log(`Results: ${passed}/${total} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
} else {
  console.log('✅ All Task 18.1 Monthly Financial Close tests passed!')
}
