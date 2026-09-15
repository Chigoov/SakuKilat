/**
 * SakuKilat — Net Worth & Debt Liability Ledger Tests (Phase P10, Task 20.1)
 *
 * Verifies:
 * 1. DebtItem schema compliance (id, name, principalAmount, paidAmount, remainingAmount, dueDate, lenderOrBorrower, type, isSettled, payments)
 * 2. Total assets calculation: sum of positive wallet balances (Requirement 10.2)
 * 3. Total liabilities calculation: sum of active debt remaining amounts (Requirement 10.3)
 * 4. Net worth calculation identity: netWorth = totalAssets - totalLiabilities (Requirement 10.4, Property 28)
 * 5. Debt creation and update validation (Requirement 10.1)
 * 6. Debt repayment balance synchronization (Requirement 10.5, Property 29)
 * 7. Native widget snapshot net worth aggregation (Requirement 10.6)
 * 8. Storage persistence and structural validation in lib/storage.ts
 *
 * Jalankan: node scripts/test-net-worth.mjs
 */

import {
  calculateTotalAssets,
  calculateTotalLiabilities,
  calculateTotalReceivables,
  calculateNetWorth,
  compileNetWorthSummary,
  createDebtItem,
  updateDebtItem,
  recordDebtPayment,
  NetWorthTracker,
} from '../lib/net-worth.ts'

import {
  generateWidgetSnapshot,
} from '../lib/widget-snapshot.ts'

import {
  validatePersistedStateStructure,
  loadPersistedState,
  persistState,
  STORAGE_KEY,
  DEBT_STORAGE_KEY,
  loadDebtsFromStorage,
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

console.log('=== Task 20.1: Net Worth and Debt Liability Ledger Tests ===\n')

// ── Group 1: Total Assets Calculation (Requirement 10.2) ──
console.log('Group 1: Total Assets Calculation (Req 10.2)')

test('Sum of positive wallet balances equals total assets', () => {
  const wallets = [
    { id: 'bca', balance: 5_000_000 },
    { id: 'tunai', balance: 750_000 },
    { id: 'gopay', balance: 250_000 },
  ]
  const assets = calculateTotalAssets(wallets)
  assertEqual(assets, 6_000_000, 'Sum of 5jt + 750k + 250k')
})

test('Wallets with zero or negative balances are excluded from total assets', () => {
  const wallets = [
    { id: 'bca', balance: 1_000_000 },
    { id: 'paylater', balance: -500_000 }, // negative balance (debt/credit card)
    { id: 'empty', balance: 0 },
    { id: 'tunai', balance: 200_000 },
  ]
  const assets = calculateTotalAssets(wallets)
  assertEqual(assets, 1_200_000, '1jt + 200k (negative and zero excluded)')
})

test('Empty or null wallet list returns 0 assets safely', () => {
  assertEqual(calculateTotalAssets([]), 0, 'Empty array')
  assertEqual(calculateTotalAssets(null), 0, 'Null input')
  assertEqual(calculateTotalAssets(undefined), 0, 'Undefined input')
})

// ── Group 2: Total Liabilities Calculation (Requirement 10.3) ──
console.log('\nGroup 2: Total Liabilities Calculation (Req 10.3)')

test('Sum of remaining amounts of active debts equals total liabilities', () => {
  const debts = [
    {
      id: 'd1',
      name: 'Cicilan Laptop',
      principalAmount: 10_000_000,
      paidAmount: 4_000_000,
      remainingAmount: 6_000_000,
      isSettled: false,
    },
    {
      id: 'd2',
      name: 'Pinjaman Teman',
      principalAmount: 1_000_000,
      paidAmount: 200_000,
      remainingAmount: 800_000,
      isSettled: false,
    },
  ]
  const liabilities = calculateTotalLiabilities(debts)
  assertEqual(liabilities, 6_800_000, 'Sum of remaining amounts (6jt + 800k)')
})

test('Settled debts (isSettled: true) are excluded from total liabilities', () => {
  const debts = [
    {
      id: 'd1',
      name: 'Utang Aktif',
      principalAmount: 2_000_000,
      paidAmount: 500_000,
      remainingAmount: 1_500_000,
      isSettled: false,
    },
    {
      id: 'd2',
      name: 'Utang Lunas',
      principalAmount: 5_000_000,
      paidAmount: 5_000_000,
      remainingAmount: 0,
      isSettled: true,
    },
  ]
  const liabilities = calculateTotalLiabilities(debts)
  assertEqual(liabilities, 1_500_000, 'Only active debts counted')
})

test('Computes remainingAmount dynamically if not pre-calculated', () => {
  const debts = [
    {
      id: 'd1',
      name: 'Utang',
      principalAmount: 3_000_000,
      paidAmount: 1_000_000,
      // remainingAmount omitted
      isSettled: false,
    },
  ]
  const liabilities = calculateTotalLiabilities(debts)
  assertEqual(liabilities, 2_000_000, 'Dynamically computed 3jt - 1jt')
})

// ── Group 3: Net Worth Calculation Identity (Requirement 10.4, Property 28) ──
console.log('\nGroup 3: Net Worth Calculation Identity (Req 10.4, Property 28)')

test('Net Worth equals total assets minus total liabilities (Positive Net Worth)', () => {
  const totalAssets = 15_000_000
  const totalLiabilities = 5_000_000
  const netWorth = calculateNetWorth(totalAssets, totalLiabilities)
  assertEqual(netWorth, 10_000_000, '15jt - 5jt = 10jt')
})

test('Net Worth can be negative when liabilities exceed assets (Negative Net Worth)', () => {
  const totalAssets = 3_000_000
  const totalLiabilities = 8_000_000
  const netWorth = calculateNetWorth(totalAssets, totalLiabilities)
  assertEqual(netWorth, -5_000_000, '3jt - 8jt = -5jt')
})

test('compileNetWorthSummary aggregates all metrics accurately', () => {
  const wallets = [
    { id: 'bca', balance: 10_000_000 },
    { id: 'tunai', balance: 2_000_000 },
  ]
  const debts = [
    {
      id: 'd1',
      name: 'KPR',
      principalAmount: 100_000_000,
      paidAmount: 96_000_000,
      remainingAmount: 4_000_000,
      isSettled: false,
      type: 'payable',
      payments: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      lenderOrBorrower: 'Bank BTN',
    },
    {
      id: 'd2',
      name: 'Utang Lama',
      principalAmount: 1_000_000,
      paidAmount: 1_000_000,
      remainingAmount: 0,
      isSettled: true,
      type: 'payable',
      payments: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      lenderOrBorrower: 'Teman',
    },
  ]

  const summary = compileNetWorthSummary(wallets, debts, '2026-03-31T10:00:00Z')
  assertEqual(summary.totalAssets, 12_000_000, 'Total Assets (10jt + 2jt)')
  assertEqual(summary.totalLiabilities, 4_000_000, 'Total Liabilities (4jt)')
  assertEqual(summary.netWorth, 8_000_000, 'Net Worth (12jt - 4jt = 8jt)')
  assertEqual(summary.activeDebtsCount, 1, '1 Active debt')
  assertEqual(summary.settledDebtsCount, 1, '1 Settled debt')
  assertEqual(summary.calculatedAt, '2026-03-31T10:00:00Z', 'Timestamp')
})

// ── Group 4: Debt Creation and Update Factory (Requirement 10.1) ──
console.log('\nGroup 4: Debt Creation and Update Factory (Req 10.1)')

test('createDebtItem creates a valid DebtItem with correct fields and initial status', () => {
  const item = createDebtItem({
    name: 'Pinjaman Motor',
    principalAmount: 15_000_000,
    paidAmount: 3_000_000,
    dueDate: '2026-12-31',
    lenderOrBorrower: 'Leasing FIF',
    type: 'payable',
    note: 'Bunga 0%',
  })

  assert(item.id.startsWith('debt-'), 'Generates unique debt ID')
  assertEqual(item.name, 'Pinjaman Motor', 'Name')
  assertEqual(item.principalAmount, 15_000_000, 'Principal')
  assertEqual(item.paidAmount, 3_000_000, 'Paid Amount')
  assertEqual(item.remainingAmount, 12_000_000, 'Remaining = 15jt - 3jt = 12jt')
  assertEqual(item.dueDate, '2026-12-31', 'Due Date')
  assertEqual(item.lenderOrBorrower, 'Leasing FIF', 'Lender')
  assertEqual(item.type, 'payable', 'Type payable')
  assertEqual(item.isSettled, false, 'Not settled yet')
  assertEqual(item.payments.length, 1, '1 Initial payment record for initial paidAmount')
})

test('createDebtItem marks debt as settled when principal equals paid amount', () => {
  const item = createDebtItem({
    name: 'Utang Langsung Lunas',
    principalAmount: 500_000,
    paidAmount: 500_000,
    lenderOrBorrower: 'Teman',
  })
  assertEqual(item.remainingAmount, 0, 'Remaining is 0')
  assertEqual(item.isSettled, true, 'Marked as settled')
})

test('createDebtItem throws on invalid nominal or empty name', () => {
  let threw = false
  try {
    createDebtItem({ name: '', principalAmount: 1_000_000 })
  } catch {
    threw = true
  }
  assert(threw, 'Throws on empty name')

  threw = false
  try {
    createDebtItem({ name: 'Valid', principalAmount: -100 })
  } catch {
    threw = true
  }
  assert(threw, 'Throws on negative principal')
})

test('updateDebtItem updates fields and recomputes remainingAmount and isSettled', () => {
  const original = createDebtItem({
    name: 'Utang Lama',
    principalAmount: 5_000_000,
    paidAmount: 1_000_000,
    lenderOrBorrower: 'Koperasi',
  })

  const updated = updateDebtItem(original, {
    principalAmount: 6_000_000,
    paidAmount: 2_000_000,
    name: 'Utang Koperasi Baru',
  })

  assertEqual(updated.name, 'Utang Koperasi Baru', 'Name updated')
  assertEqual(updated.principalAmount, 6_000_000, 'Principal updated')
  assertEqual(updated.paidAmount, 2_000_000, 'Paid updated')
  assertEqual(updated.remainingAmount, 4_000_000, 'Remaining = 6jt - 2jt = 4jt')
  assertEqual(updated.isSettled, false, 'isSettled false')
})

// ── Group 5: Debt Repayment Balance Synchronization (Req 10.5, Property 29) ──
console.log('\nGroup 5: Debt Repayment Balance Synchronization (Req 10.5, Property 29)')

test('recordDebtPayment reduces debt remaining and creates expense transaction', () => {
  const debt = createDebtItem({
    name: 'Pinjaman Bank',
    principalAmount: 10_000_000,
    paidAmount: 2_000_000,
    lenderOrBorrower: 'Bank Mandiri',
    type: 'payable',
  })

  const paymentDate = new Date('2026-04-15T14:30:00Z')
  const result = recordDebtPayment(debt, {
    debtId: debt.id,
    amount: 3_000_000,
    paymentMethodId: 'bca',
    date: paymentDate,
    note: 'Cicilan ke-3',
  })

  // 1. Debt remaining balance reduced
  assertEqual(result.updatedDebt.paidAmount, 5_000_000, 'Paid amount increases (2jt + 3jt = 5jt)')
  assertEqual(result.updatedDebt.remainingAmount, 5_000_000, 'Remaining decreases (8jt - 3jt = 5jt)')
  assertEqual(result.updatedDebt.isSettled, false, 'Still has 5jt remaining')

  // 2. Payment record created
  assertEqual(result.payment.amount, 3_000_000, 'Payment amount')
  assertEqual(result.payment.paymentMethodId, 'bca', 'Payment method')
  assertEqual(result.payment.note, 'Cicilan ke-3', 'Payment note')

  // 3. Corresponding expense transaction created in primary ledger
  assert(result.transaction !== undefined, 'Transaction exists')
  assertEqual(result.transaction.amount, 3_000_000, 'Transaction amount matches payment')
  assertEqual(result.transaction.type, 'expense', 'Transaction type is expense')
  assertEqual(result.transaction.paymentMethod, 'bca', 'Transaction paymentMethod matches')
  assertEqual(result.transaction.category, 'tagihan', 'Category is tagihan')
  assert(result.transaction.description.includes('Cicilan ke-3'), 'Description contains note')
})

test('recordDebtPayment marks debt as settled when payment covers entire remaining amount', () => {
  const debt = createDebtItem({
    name: 'Utang Teman',
    principalAmount: 1_000_000,
    paidAmount: 500_000,
    lenderOrBorrower: 'Rian',
    type: 'payable',
  })

  const result = recordDebtPayment(debt, {
    debtId: debt.id,
    amount: 500_000,
    paymentMethodId: 'tunai',
  })

  assertEqual(result.updatedDebt.remainingAmount, 0, 'Remaining is 0')
  assertEqual(result.updatedDebt.isSettled, true, 'isSettled is true')
  assertEqual(result.updatedDebt.paidAmount, 1_000_000, 'Full principal paid')
})

test('recordDebtPayment clamps payment amount to remaining amount without overpaying', () => {
  const debt = createDebtItem({
    name: 'Utang Kecil',
    principalAmount: 500_000,
    paidAmount: 400_000, // remaining 100_000
    lenderOrBorrower: 'Toko',
  })

  const result = recordDebtPayment(debt, {
    debtId: debt.id,
    amount: 300_000, // attempts to pay 300k when remaining is only 100k
    paymentMethodId: 'gopay',
  })

  assertEqual(result.payment.amount, 100_000, 'Payment clamped to remaining 100k')
  assertEqual(result.updatedDebt.remainingAmount, 0, 'Remaining is 0')
  assertEqual(result.updatedDebt.isSettled, true, 'Debt is settled')
  assertEqual(result.transaction.amount, 100_000, 'Expense transaction nominal is 100k')
})

test('recordDebtPayment throws error when debt is already settled', () => {
  const debt = createDebtItem({
    name: 'Utang Lunas',
    principalAmount: 1_000_000,
    paidAmount: 1_000_000,
    lenderOrBorrower: 'Siti',
  })

  let threw = false
  try {
    recordDebtPayment(debt, { debtId: debt.id, amount: 100_000, paymentMethodId: 'tunai' })
  } catch {
    threw = true
  }
  assert(threw, 'Throws when attempting to pay settled debt')
})

// ── Group 6: Native Widget Snapshot Integration (Requirement 10.6) ──
console.log('\nGroup 6: Native Widget Snapshot Integration (Req 10.6)')

test('generateWidgetSnapshot reflects aggregated net worth from wallets and debts', () => {
  const wallets = [
    { id: 'bca', balance: 8_000_000 },
    { id: 'tunai', balance: 2_000_000 },
  ]
  const debts = [
    {
      id: 'd1',
      name: 'Utang',
      principalAmount: 4_000_000,
      paidAmount: 1_000_000,
      remainingAmount: 3_000_000,
      isSettled: false,
    },
  ]

  const snapshot = generateWidgetSnapshot({
    wallets,
    debts,
  })

  // totalAssets = 8jt + 2jt = 10jt
  // totalLiabilities = 3jt
  // netWorth = 10jt - 3jt = 7jt
  assertEqual(snapshot.totalBalance, 10_000_000, 'Snapshot total balance')
  assertEqual(snapshot.netWorth, 7_000_000, 'Snapshot net worth is 7.000.000 (Req 10.6)')
})

// ── Group 7: Storage Validation & Persistence (lib/storage.ts) ──
console.log('\nGroup 7: Storage Validation & Persistence Integration')

test('validatePersistedStateStructure accepts debts array', () => {
  const valid = validatePersistedStateStructure({
    transactions: [],
    wallets: [],
    debts: [
      { id: 'd1', name: 'Test', principalAmount: 1000, remainingAmount: 1000, isSettled: false },
    ],
  })
  assert(valid.valid, 'Valid state structure with debts array')
})

test('validatePersistedStateStructure rejects non-array debts', () => {
  const invalid = validatePersistedStateStructure({
    transactions: [],
    wallets: [],
    debts: 'not an array',
  })
  assertEqual(invalid.valid, false, 'Invalid state structure')
  assert(invalid.error.includes('debts'), 'Error specifies debts field')
})

test('loadDebtsFromStorage reads from DEBT_STORAGE_KEY', () => {
  const store = new Map()
  store.set(DEBT_STORAGE_KEY, JSON.stringify([{ id: 'd1', name: 'Test' }]))
  const storage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  }
  const loaded = loadDebtsFromStorage(storage)
  assert(loaded !== null, 'Loaded debts from storage')
  assert(loaded.includes('Test'), 'Contains debt data')
})

// ── Group 8: NetWorthTracker Static Class API Parity ──
console.log('\nGroup 8: NetWorthTracker Static Class API Parity')

test('NetWorthTracker static methods provide full functional access', () => {
  assert(typeof NetWorthTracker.calculateTotalAssets === 'function', 'calculateTotalAssets')
  assert(typeof NetWorthTracker.calculateTotalLiabilities === 'function', 'calculateTotalLiabilities')
  assert(typeof NetWorthTracker.calculateNetWorth === 'function', 'calculateNetWorth')
  assert(typeof NetWorthTracker.compileSummary === 'function', 'compileSummary')
  assert(typeof NetWorthTracker.createDebt === 'function', 'createDebt')
  assert(typeof NetWorthTracker.updateDebt === 'function', 'updateDebt')
  assert(typeof NetWorthTracker.recordPayment === 'function', 'recordPayment')
})

console.log('──────────────────────────────────────────────────')
console.log(`Results: ${passed}/${total} passed, ${failed} failed`)

if (failed > 0) {
  process.exit(1)
} else {
  console.log('✅ All Task 20.1 Net Worth & Debt Tracking tests passed!\n')
}
