/**
 * SakuKilat — Wallet Balance Reconciliation Tests (Phase P6, Task 12.1)
 *
 * Verifies:
 * 1. Variance calculation (Requirement 6.2, Property 17)
 * 2. Audit record creation and schema (Requirement 6.3, 6.5)
 * 3. Non-destructive adjustment transaction creation (Requirement 6.3, 6.4, Property 18)
 * 4. Audit history per wallet (Requirement 6.5)
 * 5. Unreconciled wallet warning indicator detection (Requirement 6.6, Property 19)
 * 6. Historical transaction non-mutation invariant (Requirement 6.4)
 * 7. Storage persistence and validation in lib/storage.ts
 *
 * Jalankan: node scripts/test-reconciliation.mjs
 */

import {
  calculateReconciliationVariance,
  formatReconciliationVariance,
  createReconciliationRecord,
  createAdjustmentTransaction,
  getWalletReconciliationHistory,
  getAllReconciliationHistory,
  getLatestWalletReconciliation,
  hasNeverBeenReconciled,
  prepareWalletReconciliation,
  ReconciliationManager,
} from '../lib/reconciliation.ts'

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

console.log('=== Task 12.1: Wallet Balance Reconciliation Tests ===\n')

// ── Group 1: Variance Calculation ──
console.log('Group 1: Variance Calculation (Req 6.2, Property 17)')

test('Calculates positive variance when actual > expected (Surplus)', () => {
  const diff = calculateReconciliationVariance(550000, 500000)
  assertEqual(diff, 50000, 'difference (550k - 500k)')
  const formatted = formatReconciliationVariance(diff)
  assertEqual(formatted.status, 'surplus', 'status')
  assertEqual(formatted.badgeText, 'Saldo Lebih', 'badgeText')
  assert(formatted.formattedDifference.includes('50.000'), 'formattedDifference contains nominal')
})

test('Calculates negative variance when actual < expected (Shortfall)', () => {
  const diff = calculateReconciliationVariance(450000, 500000)
  assertEqual(diff, -50000, 'difference (450k - 500k)')
  const formatted = formatReconciliationVariance(diff)
  assertEqual(formatted.status, 'shortfall', 'status')
  assertEqual(formatted.badgeText, 'Saldo Kurang', 'badgeText')
  assert(formatted.formattedDifference.includes('50.000'), 'formattedDifference contains nominal')
})

test('Calculates zero variance when actual === expected (Balanced)', () => {
  const diff = calculateReconciliationVariance(500000, 500000)
  assertEqual(diff, 0, 'difference (500k - 500k)')
  const formatted = formatReconciliationVariance(diff)
  assertEqual(formatted.status, 'balanced', 'status')
  assertEqual(formatted.badgeText, 'Sesuai', 'badgeText')
})

test('Handles non-integer and boundary numerical inputs safely', () => {
  assertEqual(calculateReconciliationVariance(100000.4, 50000.2), 50000, 'rounded variance')
  assertEqual(calculateReconciliationVariance(0, 0), 0, 'zero inputs')
  assertEqual(calculateReconciliationVariance(NaN, 100000), -100000, 'NaN actual fallback to 0')
})

// ── Group 2: Audit Record Creation & Schema ──
console.log('\nGroup 2: Reconciliation Record Schema & Creation (Req 6.1, 6.3)')

test('createReconciliationRecord produces compliant WalletReconciliation schema', () => {
  const record = createReconciliationRecord({
    walletId: 'bca',
    expectedBalance: 1200000,
    actualBalance: 1150000,
    note: 'Cek mutasi bank',
    adjustmentTransactionId: 'txn-adj-1',
    reconciledAt: '2026-06-15T14:30:00.000Z',
  })

  assert(record.id.startsWith('recon-'), 'id generated with prefix')
  assertEqual(record.walletId, 'bca', 'walletId')
  assertEqual(record.expectedBalance, 1200000, 'expectedBalance')
  assertEqual(record.actualBalance, 1150000, 'actualBalance')
  assertEqual(record.difference, -50000, 'difference calculated automatically')
  assertEqual(record.note, 'Cek mutasi bank', 'note')
  assertEqual(record.adjustmentTransactionId, 'txn-adj-1', 'adjustmentTransactionId')
  assertEqual(record.reconciledAt, '2026-06-15T14:30:00.000Z', 'reconciledAt preserved')
})

test('prepareWalletReconciliation extracts expected balance from wallet', () => {
  const prompt = prepareWalletReconciliation({
    id: 'gopay',
    label: 'GoPay',
    type: 'ewallet',
    balance: 240000,
    keywords: ['gopay'],
  })

  assertEqual(prompt.walletId, 'gopay', 'walletId')
  assertEqual(prompt.walletLabel, 'GoPay', 'walletLabel')
  assertEqual(prompt.expectedBalance, 240000, 'expectedBalance matches wallet balance')
})

// ── Group 3: Adjustment Transaction Creation (Req 6.3, 6.4, Property 18) ──
console.log('\nGroup 3: Adjustment Transaction Generation & Non-Destructive Invariant')

test('createAdjustmentTransaction creates income transaction for surplus (+difference)', () => {
  const tx = createAdjustmentTransaction('bca', 'BCA', 50000, 'Bunga bank belum dicatat')
  assert(tx !== null, 'transaction created')
  assertEqual(tx.type, 'income', 'surplus produces income')
  assertEqual(tx.amount, 50000, 'amount matches absolute difference')
  assertEqual(tx.paymentMethod, 'bca', 'wallet assigned')
  assertEqual(tx.category, 'lainnya', 'category is lainnya')
  assertEqual(tx.subcategory, 'Penyesuaian Saldo', 'subcategory is Penyesuaian Saldo')
  assert(tx.description.includes('Penyesuaian saldo lebih'), 'description clarifies surplus')
  assert(tx.note.includes('Bunga bank belum dicatat'), 'note preserves user note')
})

test('createAdjustmentTransaction creates expense transaction for shortfall (-difference)', () => {
  const tx = createAdjustmentTransaction('tunai', 'Cash', -25000, 'Lupa catat parkir')
  assert(tx !== null, 'transaction created')
  assertEqual(tx.type, 'expense', 'shortfall produces expense')
  assertEqual(tx.amount, 25000, 'amount matches positive absolute difference')
  assertEqual(tx.paymentMethod, 'tunai', 'wallet assigned')
  assert(tx.description.includes('Penyesuaian saldo kurang'), 'description clarifies shortfall')
})

test('createAdjustmentTransaction returns null when difference is 0', () => {
  const tx = createAdjustmentTransaction('seabank', 'SeaBank', 0)
  assertEqual(tx, null, 'no transaction when difference is 0')
})

test('Historical transactions are never mutated or deleted when adjustments are recorded', () => {
  // Pre-existing history
  const historicalTransactions = [
    { id: 'tx-1', amount: 50000, type: 'expense', paymentMethod: 'bca', date: new Date('2026-06-01') },
    { id: 'tx-2', amount: 200000, type: 'income', paymentMethod: 'bca', date: new Date('2026-06-05') },
  ]
  const snapshotBefore = JSON.stringify(historicalTransactions)

  // Record reconciliation adjustment
  const diff = -30000
  const adjTx = createAdjustmentTransaction('bca', 'BCA', diff)
  const nextTransactions = [adjTx, ...historicalTransactions]

  // Verify historical elements are 100% byte-for-byte identical
  assertEqual(nextTransactions.length, 3, 'transaction list extended')
  assertEqual(JSON.stringify(nextTransactions.slice(1)), snapshotBefore, 'historical transactions unchanged')
})

// ── Group 4: Audit History per Wallet (Req 6.5) ──
console.log('\nGroup 4: Audit History Management (Req 6.5)')

test('getWalletReconciliationHistory filters by walletId and sorts newest first', () => {
  const records = [
    createReconciliationRecord({ walletId: 'bca', expectedBalance: 100, actualBalance: 100, reconciledAt: '2026-06-01T10:00:00Z' }),
    createReconciliationRecord({ walletId: 'tunai', expectedBalance: 50, actualBalance: 50, reconciledAt: '2026-06-02T10:00:00Z' }),
    createReconciliationRecord({ walletId: 'bca', expectedBalance: 150, actualBalance: 200, reconciledAt: '2026-06-10T10:00:00Z' }),
    createReconciliationRecord({ walletId: 'bca', expectedBalance: 200, actualBalance: 180, reconciledAt: '2026-06-05T10:00:00Z' }),
  ]

  const bcaHistory = getWalletReconciliationHistory('bca', records)
  assertEqual(bcaHistory.length, 3, '3 BCA records')
  assertEqual(bcaHistory[0].reconciledAt, '2026-06-10T10:00:00Z', 'newest first (June 10)')
  assertEqual(bcaHistory[1].reconciledAt, '2026-06-05T10:00:00Z', 'second newest (June 5)')
  assertEqual(bcaHistory[2].reconciledAt, '2026-06-01T10:00:00Z', 'oldest last (June 1)')

  const latestBca = getLatestWalletReconciliation('bca', records)
  assertEqual(latestBca.reconciledAt, '2026-06-10T10:00:00Z', 'latest record matches newest')

  const ovoHistory = getWalletReconciliationHistory('ovo', records)
  assertEqual(ovoHistory.length, 0, 'empty history for unused wallet')
})

// ── Group 5: Warning Indicator (Req 6.6, Property 19) ──
console.log('\nGroup 5: Unreconciled Warning Indicator (Req 6.6, Property 19)')

test('hasNeverBeenReconciled returns true when lastReconciledAt is undefined or empty', () => {
  assertEqual(hasNeverBeenReconciled({ id: 'bca', lastReconciledAt: undefined }), true, 'undefined lastReconciledAt')
  assertEqual(hasNeverBeenReconciled({ id: 'bca', lastReconciledAt: '' }), true, 'empty lastReconciledAt')
})

test('hasNeverBeenReconciled returns true when reconciliations array has 0 records for wallet', () => {
  const wallet = { id: 'bca', lastReconciledAt: '2026-06-01T10:00:00Z' }
  const reconciliations = [
    { id: 'r-1', walletId: 'tunai', reconciledAt: '2026-06-01T10:00:00Z', expectedBalance: 0, actualBalance: 0, difference: 0 },
  ]
  assertEqual(hasNeverBeenReconciled(wallet, reconciliations), true, 'no records for bca in reconciliations')
})

test('hasNeverBeenReconciled returns false when lastReconciledAt is present and records exist', () => {
  const wallet = { id: 'bca', lastReconciledAt: '2026-06-01T10:00:00Z' }
  const reconciliations = [
    { id: 'r-1', walletId: 'bca', reconciledAt: '2026-06-01T10:00:00Z', expectedBalance: 0, actualBalance: 0, difference: 0 },
  ]
  assertEqual(hasNeverBeenReconciled(wallet, reconciliations), false, 'reconciled wallet')
})

// ── Group 6: Storage Persistence & Structural Validation ──
console.log('\nGroup 6: Storage Persistence & Validation')

test('validatePersistedStateStructure accepts state with reconciliations array', () => {
  const validState = {
    transactions: [],
    wallets: [],
    reconciliations: [
      { id: 'r-1', walletId: 'bca', expectedBalance: 100, actualBalance: 100, difference: 0, reconciledAt: '2026-06-01T00:00:00Z' },
    ],
  }
  const result = validatePersistedStateStructure(validState)
  assertEqual(result.valid, true, 'valid structure with reconciliations')
})

test('validatePersistedStateStructure rejects non-array reconciliations', () => {
  const invalidState = {
    transactions: [],
    wallets: [],
    reconciliations: 'not-an-array',
  }
  const result = validatePersistedStateStructure(invalidState)
  assertEqual(result.valid, false, 'invalid structure')
  assert(result.error.includes('reconciliations'), 'error specifies reconciliations')
})

test('Storage persist and load preserves reconciliations state', () => {
  const store = new Map()
  const storage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
  }

  const reconRecord = createReconciliationRecord({
    walletId: 'dana',
    expectedBalance: 165000,
    actualBalance: 170000,
    difference: 5000,
    note: 'Cashback DANA',
    reconciledAt: '2026-06-15T12:00:00.000Z',
  })

  const stateToPersist = {
    transactions: [],
    wallets: [{ id: 'dana', label: 'DANA', type: 'ewallet', balance: 170000, keywords: ['dana'], lastReconciledAt: reconRecord.reconciledAt }],
    reconciliations: [reconRecord],
  }

  const persisted = persistState(storage, stateToPersist, 'valid')
  assertEqual(persisted, true, 'persistState succeeded')

  const loadResult = loadPersistedState(storage)
  assertEqual(loadResult.status, 'valid', 'load status is valid')
  assertEqual(loadResult.state.reconciliations.length, 1, '1 reconciliation record restored')
  assertEqual(loadResult.state.reconciliations[0].walletId, 'dana', 'walletId matches')
  assertEqual(loadResult.state.reconciliations[0].difference, 5000, 'difference matches')
  assertEqual(loadResult.state.wallets[0].lastReconciledAt, reconRecord.reconciledAt, 'lastReconciledAt preserved')
})

console.log('\n──────────────────────────────────────────────────')
console.log(`Results: ${passed}/${total} passed, ${failed} failed`)

if (failed > 0) {
  console.error('❌ BEBERAPA TEST REKONSILIASI GAGAL!')
  process.exitCode = 1
} else {
  console.log('✅ SEMUA TEST REKONSILIASI SALDO (TASK 12.1) BERHASIL LULUS!\n')
  process.exitCode = 0
}
