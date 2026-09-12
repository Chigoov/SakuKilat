/**
 * SakuKilat — Rollback Safety & App Key Compatibility Test Suite
 *
 * Menguji secara menyeluruh:
 *  1. Konsistensi Android Application ID & Package Name (harus tetap com.sakukilat.app.v2)
 *  2. Pembuatan Checkpoint komprehensif (transaksi, goals, recurring, budget, metadata)
 *  3. Eksekusi Rollback sukses memulihkan semua key kritis
 *  4. Penanganan kegagalan Rollback (data aktif tetap utuh, checkpoint tidak terhapus)
 *  5. Penolakan Checkpoint corrupt atau dengan skema masa depan (> CURRENT_SCHEMA_VERSION)
 *  6. Backward compatibility penyimpanan: pembacaan fallback key lama (sakukilat-user:v2:*)
 *  7. Checkpoint otomatis dibuat sebelum impor JSON (replace) dan CSV (merge)
 *  8. Ekstraksi pratinjau CheckpointSummary untuk UI
 *
 * Jalankan: node scripts/test-rollback-safety.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import {
  createComprehensiveCheckpoint,
  executeRollback,
  canRollback,
  getCheckpointSummary,
  executeImportTransaction,
  planImport,
  CHECKPOINT_KEY,
  GOAL_CHECKPOINT_KEY,
  CRITICAL_CHECKPOINT_KEYS,
} from '../lib/data-restore.ts'
import {
  STORAGE_KEY,
  GOAL_STORAGE_KEY,
  RECURRING_STORAGE_KEY,
  STORAGE_KEY_FALLBACKS,
  GOAL_STORAGE_KEY_FALLBACKS,
  RECURRING_STORAGE_KEY_FALLBACKS,
  CURRENT_SCHEMA_VERSION,
  loadPersistedState,
  loadGoalsFromStorage,
  loadRecurringFromStorage,
} from '../lib/storage.ts'

let passed = 0
let failed = 0
let total = 0

function makeStorage(initialMap = {}, options = {}) {
  const store = new Map(Object.entries(initialMap))
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, val) => {
      if (options.failKeys && options.failKeys.includes(key)) {
        throw new Error(`Disk write error on key: ${key}`)
      }
      store.set(key, String(val))
    },
    removeItem: (key) => store.delete(key),
    keys: () => [...store.keys()],
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

console.log('=== SakuKilat: Rollback Safety & App Key Compatibility Test Suite ===\n')

const sampleTx = {
  id: 'tx-init-1',
  amount: 45000,
  type: 'expense',
  date: '2026-09-01T08:00:00.000Z',
  category: 'makanan',
  paymentMethod: 'tunai',
  description: 'Nasi Goreng',
}

const sampleGoal = {
  id: 'goal-laptop',
  title: 'Beli Laptop',
  targetAmount: 15000000,
  currentAmount: 5000000,
}

const sampleRecurring = [
  {
    id: 'rec-wifi',
    name: 'Internet Indihome',
    amount: 350000,
    frequency: 'monthly',
    category: 'tagihan',
    type: 'expense',
  },
]

// ── Group 1: Android App ID & Package Name Consistency ──
console.log('Group 1: Android App ID & Package Name Consistency')

test('build.gradle retains applicationId "com.sakukilat.app.v2"', () => {
  const gradlePath = path.resolve('android/app/build.gradle')
  const content = fs.readFileSync(gradlePath, 'utf8')
  assert(content.includes('applicationId "com.sakukilat.app.v2"'), 'Must have applicationId "com.sakukilat.app.v2"')
  assert(content.includes('namespace = "com.sakukilat.app"'), 'Must have namespace "com.sakukilat.app"')
  assert(content.includes('resValue "string", "package_name", "com.sakukilat.app.v2"'), 'Must configure public package_name')
})

test('capacitor.config.ts retains appId "com.sakukilat.app.v2"', () => {
  const capPath = path.resolve('capacitor.config.ts')
  const content = fs.readFileSync(capPath, 'utf8')
  assert(content.includes("appId: 'com.sakukilat.app.v2'"), "appId must be 'com.sakukilat.app.v2'")
})

test('AndroidManifest.xml fileprovider uses "${applicationId}.fileprovider"', () => {
  const manifestPath = path.resolve('android/app/src/main/AndroidManifest.xml')
  const content = fs.readFileSync(manifestPath, 'utf8')
  assert(content.includes('android:authorities="${applicationId}.fileprovider"'), 'Fileprovider authority must match')
})

// ── Group 2: Comprehensive Checkpoint Creation ──
console.log('\nGroup 2: Comprehensive Checkpoint Creation')

test('createComprehensiveCheckpoint saves all critical keys and envelope metadata', () => {
  const initialData = {
    [STORAGE_KEY]: JSON.stringify({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      transactions: [sampleTx],
      customCategories: [{ id: 'bensin', label: 'Bensin' }],
      monthlyBudget: 2000000,
    }),
    [GOAL_STORAGE_KEY]: JSON.stringify([sampleGoal]),
    ['sakukilat:v2:recurring']: JSON.stringify(sampleRecurring),
    ['sakukilat:v2:budget-set']: '1',
  }

  const storage = makeStorage(initialData)
  const res = createComprehensiveCheckpoint(storage, 'import', 'Sebelum impor test')

  assert(res.success === true, 'Checkpoint creation should succeed')
  assert(canRollback(storage) === true, 'canRollback must return true')

  const chkRaw = storage.getItem(CHECKPOINT_KEY)
  assert(chkRaw !== null, 'CHECKPOINT_KEY must be stored')

  const parsed = JSON.parse(chkRaw)
  assertEqual(parsed.envelopeVersion, 2, 'envelopeVersion')
  assertEqual(parsed.reason, 'import', 'reason')
  assertEqual(parsed.metadata.transactionCount, 1, 'transactionCount')
  assertEqual(parsed.metadata.goalCount, 1, 'goalCount')
  assertEqual(parsed.metadata.recurringCount, 1, 'recurringCount')
  assertEqual(parsed.metadata.customCategoryCount, 1, 'customCategoryCount')
  assertEqual(parsed.metadata.hasBudget, true, 'hasBudget')

  // Check legacy compatibility keys
  assert(storage.getItem(`${CHECKPOINT_KEY}:primary`) !== null, 'Legacy primary checkpoint must exist')
  assert(storage.getItem(GOAL_CHECKPOINT_KEY) !== null, 'Legacy goal checkpoint must exist')
})

// ── Group 3: Safe Rollback Execution ──
console.log('\nGroup 3: Safe Rollback Execution')

test('executeRollback restores all critical keys and reports summary', () => {
  const initialPrimary = JSON.stringify({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: [sampleTx],
    monthlyBudget: 2500000,
  })
  const initialGoals = JSON.stringify([sampleGoal])
  const initialRecurring = JSON.stringify(sampleRecurring)

  const storage = makeStorage({
    [STORAGE_KEY]: initialPrimary,
    [GOAL_STORAGE_KEY]: initialGoals,
    ['sakukilat:v2:recurring']: initialRecurring,
    ['sakukilat:v2:budget-set']: '1',
  })

  // Create checkpoint
  createComprehensiveCheckpoint(storage, 'restore', 'Snapshot sebelum replace')

  // Modify storage (simulating restore replace)
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      transactions: [{ ...sampleTx, id: 'tx-replaced' }],
      monthlyBudget: 5000000,
    })
  )
  storage.setItem(GOAL_STORAGE_KEY, JSON.stringify([]))
  storage.setItem('sakukilat:v2:recurring', JSON.stringify([]))
  storage.setItem('sakukilat:v2:budget-set', '0')

  // Execute rollback
  const rollback = executeRollback(storage)
  assert(rollback.success === true, 'Rollback should succeed')
  assertEqual(storage.getItem(STORAGE_KEY), initialPrimary, 'Primary state restored')
  assertEqual(storage.getItem(GOAL_STORAGE_KEY), initialGoals, 'Goals restored')
  assertEqual(storage.getItem('sakukilat:v2:recurring'), initialRecurring, 'Recurring restored')
  assertEqual(storage.getItem('sakukilat:v2:budget-set'), '1', 'Budget set restored')
  assertEqual(rollback.restoredSummary.transactionCount, 1, 'restoredSummary.transactionCount')
})

test('Rollback failure due to disk error preserves active data and retains checkpoint', () => {
  const initialPrimary = JSON.stringify({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: [sampleTx],
  })
  const activePrimary = JSON.stringify({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: [{ ...sampleTx, id: 'tx-active' }],
  })

  const storage = makeStorage({
    [STORAGE_KEY]: initialPrimary,
    [GOAL_STORAGE_KEY]: JSON.stringify([sampleGoal]),
  })

  // Create checkpoint
  createComprehensiveCheckpoint(storage, 'import')

  // Set active state
  storage.setItem(STORAGE_KEY, activePrimary)

  // Inject failure when writing GOAL_STORAGE_KEY during rollback
  const failingStorage = {
    store: new Map([
      [STORAGE_KEY, activePrimary],
      [CHECKPOINT_KEY, storage.getItem(CHECKPOINT_KEY)],
      [GOAL_STORAGE_KEY, JSON.stringify([])],
    ]),
    getItem(k) { return this.store.get(k) || null },
    setItem(k, v) {
      if (k === GOAL_STORAGE_KEY) {
        throw new Error('Simulated disk full')
      }
      this.store.set(k, String(v))
    },
    removeItem(k) { this.store.delete(k) },
    keys() { return [...this.store.keys()] },
  }

  const result = executeRollback(failingStorage)
  assert(result.success === false, 'Rollback must report failure')
  assertEqual(failingStorage.getItem(STORAGE_KEY), activePrimary, 'Active primary data must remain untouched')
  assert(failingStorage.getItem(CHECKPOINT_KEY) !== null, 'Checkpoint must NOT be deleted on rollback failure')
})

// ── Group 4: Checkpoint Validation & Rejection ──
console.log('\nGroup 4: Checkpoint Validation & Rejection')

test('Rollback rejects corrupted (non-JSON) checkpoint without modifying active data', () => {
  const activeData = JSON.stringify({ transactions: [sampleTx] })
  const storage = makeStorage({
    [STORAGE_KEY]: activeData,
    [CHECKPOINT_KEY]: 'NOT_VALID_JSON_CORRUPT{{{',
  })

  const res = executeRollback(storage)
  assert(res.success === false, 'Corrupt checkpoint must fail rollback')
  assert(res.error.includes('Checkpoint rusak'), 'Error message must mention checkpoint rusak')
  assertEqual(storage.getItem(STORAGE_KEY), activeData, 'Active data must remain intact')
  assertEqual(storage.getItem(CHECKPOINT_KEY), 'NOT_VALID_JSON_CORRUPT{{{', 'Checkpoint is retained for inspection')
})

test('Rollback rejects incompatible checkpoint with future schema version', () => {
  const activeData = JSON.stringify({ transactions: [sampleTx] })
  const futureEnvelope = JSON.stringify({
    envelopeVersion: 2,
    entries: {
      [STORAGE_KEY]: JSON.stringify({
        schemaVersion: CURRENT_SCHEMA_VERSION + 5,
        transactions: [sampleTx],
      }),
    },
  })

  const storage = makeStorage({
    [STORAGE_KEY]: activeData,
    [CHECKPOINT_KEY]: futureEnvelope,
  })

  const res = executeRollback(storage)
  assert(res.success === false, 'Future schema version in checkpoint must be rejected')
  assert(res.error.includes('tidak kompatibel'), 'Error message must state incompatible')
  assertEqual(storage.getItem(STORAGE_KEY), activeData, 'Active data must remain intact')
})

// ── Group 5: Backward Compatibility & Storage Key Fallbacks ──
console.log('\nGroup 5: Backward Compatibility & Storage Key Fallbacks')

test('loadPersistedState reads from fallback key "sakukilat-user:v2:local-state" and migrates to canonical key', () => {
  const legacyData = JSON.stringify({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: [sampleTx],
  })

  const storage = makeStorage({
    ['sakukilat-user:v2:local-state']: legacyData,
  })

  const loadRes = loadPersistedState(storage)
  assert(loadRes.status === 'valid', 'Must load successfully from fallback')
  assertEqual(loadRes.state.transactions.length, 1, 'Transaction count')
  assertEqual(storage.getItem(STORAGE_KEY), legacyData, 'Must safely migrate to canonical STORAGE_KEY')
  assertEqual(storage.getItem('sakukilat-user:v2:local-state'), legacyData, 'Fallback key must NOT be deleted')
})

test('loadGoalsFromStorage seamlessly reads fallback "sakukilat-user:v2:goals"', () => {
  const legacyGoals = JSON.stringify([sampleGoal])
  const storage = makeStorage({
    ['sakukilat-user:v2:goals']: legacyGoals,
  })

  const loaded = loadGoalsFromStorage(storage)
  assertEqual(loaded, legacyGoals, 'Must read legacy goals')
  assertEqual(storage.getItem(GOAL_STORAGE_KEY), legacyGoals, 'Must mirror to canonical GOAL_STORAGE_KEY')
})

test('loadRecurringFromStorage seamlessly reads fallback "sakukilat-user:v2:recurring"', () => {
  const legacyRecurring = JSON.stringify(sampleRecurring)
  const storage = makeStorage({
    ['sakukilat-user:v2:recurring']: legacyRecurring,
  })

  const loaded = loadRecurringFromStorage(storage)
  assertEqual(loaded, legacyRecurring, 'Must read legacy recurring')
  assertEqual(storage.getItem(RECURRING_STORAGE_KEY), legacyRecurring, 'Must mirror to canonical RECURRING_STORAGE_KEY')
})

// ── Group 6: Automated Pre-Operation Checkpoints ──
console.log('\nGroup 6: Automated Pre-Operation Checkpoints')

test('executeImportTransaction in replace mode creates checkpoint before writing', () => {
  const storage = makeStorage({
    [STORAGE_KEY]: JSON.stringify({ transactions: [sampleTx] }),
    [GOAL_STORAGE_KEY]: JSON.stringify([sampleGoal]),
  })

  const backupPayload = JSON.stringify({
    app: 'SakuKilat',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: [{ ...sampleTx, id: 'tx-new-backup' }],
  })

  const plan = planImport(backupPayload, storage)
  const execRes = executeImportTransaction(storage, plan, { confirmed: true })
  assert(execRes.success === true, 'Import should succeed')

  const summary = getCheckpointSummary(storage)
  assert(summary !== null, 'Checkpoint summary must exist')
  assertEqual(summary.reason, 'restore', 'Checkpoint reason must be restore')
  assertEqual(summary.transactionCount, 1, 'Checkpoint transactionCount matches pre-import')
})

test('executeImportTransaction in CSV merge mode creates checkpoint before writing', () => {
  const storage = makeStorage({
    [STORAGE_KEY]: JSON.stringify({ transactions: [sampleTx] }),
  })

  const csv = 'tanggal,tipe,deskripsi,nominal,kategori\n2026-09-02,keluar,Bensin motor,25000,transport'
  const plan = planImport(csv, storage, { isCsv: true })
  const execRes = executeImportTransaction(storage, plan, { confirmed: true })
  assert(execRes.success === true, 'CSV import should succeed')

  const summary = getCheckpointSummary(storage)
  assert(summary !== null, 'Checkpoint summary must exist')
  assertEqual(summary.reason, 'import', 'Checkpoint reason must be import')
})

// ── Group 7: Checkpoint Summary Formatting for UI ──
console.log('\nGroup 7: Checkpoint Summary Formatting for UI')

test('getCheckpointSummary formats UI labels and returns correct metadata', () => {
  const storage = makeStorage()
  storage.setItem(STORAGE_KEY, JSON.stringify({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: [sampleTx, { ...sampleTx, id: 'tx-2' }],
    customCategories: [{ id: 'z', label: 'Z' }],
  }))
  storage.setItem(GOAL_STORAGE_KEY, JSON.stringify([sampleGoal]))
  storage.setItem('sakukilat:v2:recurring', JSON.stringify(sampleRecurring))

  createComprehensiveCheckpoint(storage, 'migration', 'Sebelum migrasi otomatis')

  const summary = getCheckpointSummary(storage)
  assert(summary !== null, 'Summary must exist')
  assertEqual(summary.reason, 'migration', 'reason')
  assertEqual(summary.reasonLabel, 'Sebelum Migrasi Skema', 'reasonLabel')
  assertEqual(summary.transactionCount, 2, 'transactionCount')
  assertEqual(summary.goalCount, 1, 'goalCount')
  assertEqual(summary.recurringCount, 1, 'recurringCount')
  assertEqual(summary.customCategoryCount, 1, 'customCategoryCount')
  assertEqual(summary.isValid, true, 'isValid')
})

console.log(`\n========================================`)
console.log(`Summary: ${passed}/${total} passed, ${failed} failed`)
console.log(`========================================\n`)

if (failed > 0) {
  process.exit(1)
} else {
  process.exit(0)
}
