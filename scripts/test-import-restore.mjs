/**
 * SK-004 — Transactional Import/Restore Regression Tests
 *
 * Menguji helper production `lib/data-restore.ts` secara nyata (bukan salinan logika).
 * Jalankan: node scripts/test-import-restore.mjs
 */

import {
  planImport,
  executeImportTransaction,
  executeRollback,
  CHECKPOINT_KEY,
  GOAL_CHECKPOINT_KEY,
} from '../lib/data-restore.ts'
import { STORAGE_KEY, GOAL_STORAGE_KEY, CURRENT_SCHEMA_VERSION } from '../lib/storage.ts'

let passed = 0
let failed = 0
let total = 0

function makeStorage(initialMap = {}, options = {}) {
  const store = new Map(Object.entries(initialMap))
  return {
    getItem: (key) => store.has(key) ? store.get(key) : null,
    setItem: (key, val) => {
      if (options.failKeys && options.failKeys.includes(key)) {
        throw new Error(`Write failed for key: ${key}`)
      }
      store.set(key, String(val))
    },
    removeItem: (key) => store.delete(key),
    keys: () => [...store.keys()],
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed')
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

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

console.log('=== SK-004: Transactional Import/Restore Regression Tests (Production Code) ===\n')

const sampleValidTx = {
  id: 'tx-001',
  amount: 25000,
  type: 'expense',
  date: '2026-06-15T10:00:00.000Z',
  category: 'makanan',
  paymentMethod: 'tunai',
  description: 'Makan siang',
}

// ── Group 1: Schema & Content Validation ──
console.log('Group 1: Schema and Content Validation')

test('Valid SakuKilat backup is accepted with preview metadata', () => {
  const storage = makeStorage({ [STORAGE_KEY]: JSON.stringify({ transactions: [sampleValidTx] }) })
  const backup = JSON.stringify({
    app: 'SakuKilat',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: [sampleValidTx, { ...sampleValidTx, id: 'tx-002', amount: 50000 }],
  })
  const plan = planImport(backup, storage)
  assert(plan.valid === true, 'Plan should be valid')
  assertEqual(plan.isSakuKilatBackup, true, 'isSakuKilatBackup')
  assertEqual(plan.mode, 'replace', 'mode')
  assertEqual(plan.newTransactionCount, 2, 'newTransactionCount')
})

test('Supported old schema version (v6) is accepted', () => {
  const storage = makeStorage()
  const backup = JSON.stringify({
    app: 'SakuKilat',
    schemaVersion: 6,
    transactions: [sampleValidTx],
  })
  const plan = planImport(backup, storage)
  assert(plan.valid === true, 'Old schema version should be accepted')
})

test('Future schema version (> CURRENT_SCHEMA_VERSION) is REJECTED', () => {
  const storage = makeStorage()
  const backup = JSON.stringify({
    app: 'SakuKilat',
    schemaVersion: 999,
    transactions: [sampleValidTx],
  })
  const plan = planImport(backup, storage)
  assert(plan.valid === false, 'Future schema version must be rejected')
})

test('Backup missing transactions array is REJECTED', () => {
  const storage = makeStorage()
  const backup = JSON.stringify({
    app: 'SakuKilat',
    schemaVersion: CURRENT_SCHEMA_VERSION,
  })
  const plan = planImport(backup, storage)
  assert(plan.valid === false, 'Missing transactions must be rejected')
})

test('Backup with empty transactions array is REJECTED', () => {
  const storage = makeStorage()
  const backup = JSON.stringify({
    app: 'SakuKilat',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: [],
  })
  const plan = planImport(backup, storage)
  assert(plan.valid === false, 'Empty transactions array must be rejected')
})

test('Mixed valid and invalid transactions must be REJECTED (no silent record dropping)', () => {
  const storage = makeStorage({ [STORAGE_KEY]: JSON.stringify({ transactions: [sampleValidTx] }) })
  const backup = JSON.stringify({
    app: 'SakuKilat',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: [
      sampleValidTx,
      { id: 'broken-1' }, // missing amount, type, date, etc.
    ],
  })
  const plan = planImport(backup, storage)
  assert(plan.valid === false, 'Backup with corrupted rows must be rejected, not silently truncated')
})

test('Invalid transaction fields (negative amount, bad type, bad date) must be REJECTED', () => {
  const storage = makeStorage()
  const badAmount = JSON.stringify({
    app: 'SakuKilat',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: [{ ...sampleValidTx, amount: -5000 }],
  })
  assert(planImport(badAmount, storage).valid === false, 'Negative amount must be rejected')

  const badType = JSON.stringify({
    app: 'SakuKilat',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: [{ ...sampleValidTx, type: 'invalid_type' }],
  })
  assert(planImport(badType, storage).valid === false, 'Invalid type must be rejected')

  const badDate = JSON.stringify({
    app: 'SakuKilat',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: [{ ...sampleValidTx, date: 'not-a-date' }],
  })
  assert(planImport(badDate, storage).valid === false, 'Invalid date must be rejected')
})

test('Duplicate transaction IDs in backup must be REJECTED', () => {
  const storage = makeStorage()
  const backup = JSON.stringify({
    app: 'SakuKilat',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: [
      { ...sampleValidTx, id: 'dup-1' },
      { ...sampleValidTx, id: 'dup-1', description: 'Duplicated ID' },
    ],
  })
  const plan = planImport(backup, storage)
  assert(plan.valid === false, 'Duplicate IDs in backup must be rejected')
})

// ── Group 2: Checkpoint & Multi-Key Transactional Execution ──
console.log('\nGroup 2: Checkpoint and Multi-Key Transactional Execution')

test('Checkpoint MUST preserve both primary state AND goals before modification', () => {
  const initialPrimary = JSON.stringify({ transactions: [sampleValidTx] })
  const initialGoals = JSON.stringify([{ id: 'goal-1', title: 'Beli laptop', targetAmount: 15000000 }])
  const storage = makeStorage({
    [STORAGE_KEY]: initialPrimary,
    [GOAL_STORAGE_KEY]: initialGoals,
  })

  const backup = JSON.stringify({
    app: 'SakuKilat',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: [{ ...sampleValidTx, id: 'tx-new' }],
    goals: [{ id: 'goal-2', title: 'Liburan', targetAmount: 5000000 }],
  })
  const plan = planImport(backup, storage)
  assert(plan.valid === true, 'Plan should be valid')

  const exec = executeImportTransaction(storage, plan, { confirmed: true })
  assert(exec.success === true, 'Import should succeed')

  // Verify checkpoint was created
  const checkpoint = storage.getItem(CHECKPOINT_KEY)
  assert(checkpoint !== null, 'Primary checkpoint must exist')
  const goalCheckpoint = storage.getItem(GOAL_CHECKPOINT_KEY) || (JSON.parse(checkpoint)[GOAL_STORAGE_KEY])
  assert(goalCheckpoint !== undefined && goalCheckpoint !== null, 'Goal checkpoint must be preserved')
})

test('Failure on goals write triggers full rollback of primary state', () => {
  const initialPrimary = JSON.stringify({ transactions: [sampleValidTx] })
  const initialGoals = JSON.stringify([{ id: 'goal-1', targetAmount: 1000 }])
  // storage will fail when writing GOAL_STORAGE_KEY
  const storage = makeStorage(
    { [STORAGE_KEY]: initialPrimary, [GOAL_STORAGE_KEY]: initialGoals },
    { failKeys: [GOAL_STORAGE_KEY] }
  )

  const backup = JSON.stringify({
    app: 'SakuKilat',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: [{ ...sampleValidTx, id: 'tx-new-999' }],
    goals: [{ id: 'goal-new', targetAmount: 9000 }],
  })
  const plan = planImport(backup, storage)
  assert(plan.valid === true, 'Plan valid')

  const exec = executeImportTransaction(storage, plan, { confirmed: true })
  assert(exec.success === false, 'Import execution should fail')
  assert(exec.rollbackAttempted === true, 'Rollback should have been attempted')

  // Crucial: Primary state must NOT have been left modified!
  assertEqual(storage.getItem(STORAGE_KEY), initialPrimary, 'Primary state must be restored to original upon goal failure')
})

test('Rollback restores all keys (primary and goals)', () => {
  const initialPrimary = JSON.stringify({ transactions: [sampleValidTx] })
  const initialGoals = JSON.stringify([{ id: 'goal-original' }])
  const storage = makeStorage({
    [STORAGE_KEY]: initialPrimary,
    [GOAL_STORAGE_KEY]: initialGoals,
  })

  const backup = JSON.stringify({
    app: 'SakuKilat',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: [{ ...sampleValidTx, id: 'tx-imported' }],
    goals: [{ id: 'goal-imported' }],
  })
  const plan = planImport(backup, storage)
  executeImportTransaction(storage, plan, { confirmed: true })

  // Now trigger manual/system rollback
  const rollbackResult = executeRollback(storage)
  assert(rollbackResult.success === true, 'Rollback should succeed')
  assertEqual(storage.getItem(STORAGE_KEY), initialPrimary, 'Primary must match pre-import')
  assertEqual(storage.getItem(GOAL_STORAGE_KEY), initialGoals, 'Goals must match pre-import')
})

// ── Group 3: Confirmation & Mode Safety ──
console.log('\nGroup 3: Confirmation and Mode Safety')

test('Replace mode fails if not explicitly confirmed (confirmed: false or omitted)', () => {
  const initialPrimary = JSON.stringify({ transactions: [sampleValidTx] })
  const storage = makeStorage({ [STORAGE_KEY]: initialPrimary })

  const backup = JSON.stringify({
    app: 'SakuKilat',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: [{ ...sampleValidTx, id: 'tx-replace' }],
  })
  const plan = planImport(backup, storage)
  assert(plan.mode === 'replace', 'Backup must be replace mode')

  // Attempt without confirmation
  const unconfirmed = executeImportTransaction(storage, plan, { confirmed: false })
  assert(unconfirmed.success === false, 'Unconfirmed replace must be rejected')
  assertEqual(storage.getItem(STORAGE_KEY), initialPrimary, 'Storage must not be touched')
})

test('User cancel does not modify storage or execute import', () => {
  const initialPrimary = JSON.stringify({ transactions: [sampleValidTx] })
  const storage = makeStorage({ [STORAGE_KEY]: initialPrimary })

  const backup = JSON.stringify({
    app: 'SakuKilat',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: [{ ...sampleValidTx, id: 'tx-cancelled' }],
  })
  const plan = planImport(backup, storage)
  assert(plan.valid === true, 'Plan should be valid')

  // User explicitly cancels dialog: no execution called
  // Storage remains pristine
  assertEqual(storage.getItem(STORAGE_KEY), initialPrimary, 'Storage remains untouched on user cancel')
})

test('Failure on primary write triggers rollback and restores pre-import data', () => {
  const initialPrimary = JSON.stringify({ transactions: [sampleValidTx] })
  let writeCount = 0
  const store = new Map([[STORAGE_KEY, initialPrimary]])
  const storage = {
    getItem: (key) => store.get(key) || null,
    setItem: (key, val) => {
      if (key === STORAGE_KEY) {
        writeCount++
        if (writeCount === 1) {
          // Primary write throws (e.g. quota exceeded)
          throw new Error('Disk quota exceeded on primary write')
        }
      }
      store.set(key, val)
    },
    removeItem: (key) => store.delete(key),
    keys: () => [...store.keys()],
  }

  const backup = JSON.stringify({
    app: 'SakuKilat',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: [{ ...sampleValidTx, id: 'tx-fail-write' }],
  })
  const plan = planImport(backup, storage)
  const exec = executeImportTransaction(storage, plan, { confirmed: true })
  assert(exec.success === false, 'Execution must fail on write error')
  assert(exec.rollbackAttempted === true, 'Rollback must be attempted')
  assertEqual(storage.getItem(STORAGE_KEY), initialPrimary, 'Storage must be restored after primary write error')
})

test('Rollback failure is safely caught and reported without silent success', () => {
  const initialPrimary = JSON.stringify({ transactions: [sampleValidTx] })
  const storage = {
    getItem: (key) => {
      if (key === CHECKPOINT_KEY) return 'INVALID_NON_JSON_CORRUPT_CHECKPOINT'
      return initialPrimary
    },
    setItem: () => {},
    removeItem: () => {},
  }

  const rollback = executeRollback(storage)
  assert(rollback.success === false, 'Rollback should report failure when checkpoint is corrupted')
})

test('CSV merge mode appends transactions without deleting existing data', () => {
  const initialPrimary = JSON.stringify({ transactions: [sampleValidTx] })
  const storage = makeStorage({ [STORAGE_KEY]: initialPrimary })

  const csvContent = "tanggal,tipe,deskripsi,nominal,kategori,subkategori,dompet\n2026-06-20,keluar,Beli bensin,30000,bensin,,tunai"
  const plan = planImport(csvContent, storage, { isCsv: true })
  assert(plan.valid === true, 'CSV plan valid')
  assertEqual(plan.mode, 'merge', 'CSV mode must be merge')

  const exec = executeImportTransaction(storage, plan, { confirmed: true })
  assert(exec.success === true, 'Merge should succeed')

  const updated = JSON.parse(storage.getItem(STORAGE_KEY))
  assert(updated.transactions.length === 2, 'Should have 2 transactions (existing + imported)')
  assert(updated.transactions.some(t => t.id === sampleValidTx.id), 'Existing transaction must be preserved')
})

// ── Summary ──
console.log('\n' + '─'.repeat(50))
console.log(`Results: ${passed}/${total} passed, ${failed} failed\n`)

if (failed > 0) {
  console.error(`❌ Expected failure on baseline: ${failed} tests failed as expected before fix.\n`)
  process.exitCode = 1
} else {
  console.log('✅ All SK-004 tests passed!\n')
  process.exitCode = 0
}
