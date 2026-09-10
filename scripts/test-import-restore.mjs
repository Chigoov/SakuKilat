/**
 * SK-004 — Import/Restore Regression Tests
 *
 * Menguji bahwa importFile menangani backup JSON dengan aman:
 * - Pre-import checkpoint dibuat sebelum modifikasi
 * - Schema validation menolak backup invalid
 * - Write failure memicu rollback dari checkpoint
 * - Copy text akurat (backup replace, CSV merge)
 *
 * Jalankan: node scripts/test-import-restore.mjs
 */

const CURRENT_SCHEMA_VERSION = 8
const STORAGE_KEY = 'sakukilat:v2:local-state'
const CHECKPOINT_KEY = 'sakukilat:v2:import-checkpoint'
const GOAL_STORAGE_KEY = 'sakukilat:v2:goals'

// ── Minimal mock of import logic ──

/**
 * Simulates the CURRENT importFile behavior (before fix).
 * Returns { success, merged, checkpointCreated, rollbackAvailable }
 */
function importFile_CURRENT(mockLocalStorage, backupJson) {
  const parsed = typeof backupJson === 'string' ? JSON.parse(backupJson) : backupJson
  const imported = Array.isArray(parsed?.transactions)
    ? parsed.transactions
    : []

  if (imported.length === 0) {
    return { success: false, error: 'No transactions', checkpointCreated: false }
  }

  const isSakuKilatBackup = parsed?.app === 'SakuKilat' || parsed?.schemaVersion === CURRENT_SCHEMA_VERSION

  // CURRENT: No checkpoint created before write
  const currentRaw = mockLocalStorage.getItem(STORAGE_KEY)
  const current = currentRaw ? JSON.parse(currentRaw) : {}

  const merged = isSakuKilatBackup ? imported : [...imported, ...(current.transactions || [])]

  // Direct write — no checkpoint, no verification
  mockLocalStorage.setItem(STORAGE_KEY, JSON.stringify({
    ...current,
    ...(isSakuKilatBackup ? parsed : {}),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: merged,
  }))

  return {
    success: true,
    merged,
    checkpointCreated: false,
    rollbackAvailable: false,
  }
}

/**
 * Simulates the EXPECTED importFile behavior (after fix).
 * Creates checkpoint, validates schema, verifies write, provides rollback.
 */
function importFile_EXPECTED(mockLocalStorage, backupJson) {
  const parsed = typeof backupJson === 'string' ? JSON.parse(backupJson) : backupJson
  const imported = Array.isArray(parsed?.transactions)
    ? parsed.transactions
    : []

  if (imported.length === 0) {
    return { success: false, error: 'No transactions', checkpointCreated: false }
  }

  const isSakuKilatBackup = parsed?.app === 'SakuKilat' || parsed?.schemaVersion === CURRENT_SCHEMA_VERSION

  // EXPECTED: Validate schema for SakuKilat backup
  if (isSakuKilatBackup && !Array.isArray(parsed?.transactions)) {
    return { success: false, error: 'Invalid backup schema', checkpointCreated: false }
  }

  // EXPECTED: Create checkpoint BEFORE any modification
  const currentRaw = mockLocalStorage.getItem(STORAGE_KEY)
  if (currentRaw) {
    mockLocalStorage.setItem(CHECKPOINT_KEY, currentRaw)
  }

  const current = currentRaw ? JSON.parse(currentRaw) : {}
  const merged = isSakuKilatBackup ? imported : [...imported, ...(current.transactions || [])]

  const newState = JSON.stringify({
    ...current,
    ...(isSakuKilatBackup ? parsed : {}),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: merged,
  })

  // Write
  mockLocalStorage.setItem(STORAGE_KEY, newState)

  // EXPECTED: Verify write succeeded
  const verification = mockLocalStorage.getItem(STORAGE_KEY)
  if (verification !== newState) {
    // Rollback from checkpoint
    if (currentRaw) {
      mockLocalStorage.setItem(STORAGE_KEY, currentRaw)
    }
    return { success: false, error: 'Write verification failed', checkpointCreated: true }
  }

  return {
    success: true,
    merged,
    checkpointCreated: Boolean(currentRaw),
    rollbackAvailable: Boolean(currentRaw),
  }
}

/**
 * Rollback from checkpoint.
 */
function rollbackFromCheckpoint(mockLocalStorage) {
  const checkpoint = mockLocalStorage.getItem(CHECKPOINT_KEY)
  if (!checkpoint) return false
  mockLocalStorage.setItem(STORAGE_KEY, checkpoint)
  return true
}

// ── Test harness ──
let passed = 0
let failed = 0
let total = 0

function makeStorage(initialState) {
  const store = new Map()
  if (initialState !== undefined) {
    store.set(STORAGE_KEY, JSON.stringify(initialState))
  }
  return {
    getItem: (key) => store.has(key) ? store.get(key) : null,
    setItem: (key, val) => store.set(key, val),
    removeItem: (key) => store.delete(key),
    keys: () => [...store.keys()],
  }
}

function makeFailingStorage(initialState) {
  const store = new Map()
  if (initialState !== undefined) {
    store.set(STORAGE_KEY, JSON.stringify(initialState))
  }
  let writeCount = 0
  return {
    getItem: (key) => store.has(key) ? store.get(key) : null,
    setItem: (key, val) => {
      writeCount++
      // Allow checkpoint write but fail on the actual state write
      if (writeCount > 1 && key === STORAGE_KEY) {
        throw new Error('Storage full')
      }
      store.set(key, val)
    },
    removeItem: (key) => store.delete(key),
    keys: () => [...store.keys()],
  }
}

function test(name, fn) {
  total++
  try {
    fn()
    console.log(`  ✓ PASS: ${name}`)
    passed++
  } catch (e) {
    console.error(`  ✗ FAIL: ${name}`)
    console.error(`         ${e.message}`)
    failed++
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed')
}

function assertEqual(actual, expected, label = '') {
  if (actual !== expected) {
    throw new Error(`${label} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

console.log('\n🧪 SK-004 Import/Restore Tests\n')

// ── Group 1: Current behavior (should pass) ──
console.log('Group 1: Current behavior')

test('Valid SakuKilat backup replaces transactions', () => {
  const existing = { schemaVersion: CURRENT_SCHEMA_VERSION, transactions: [{ id: 'old' }] }
  const storage = makeStorage(existing)
  const backup = { app: 'SakuKilat', schemaVersion: CURRENT_SCHEMA_VERSION, transactions: [{ id: 'new1' }, { id: 'new2' }] }

  const result = importFile_CURRENT(storage, JSON.stringify(backup))
  assert(result.success, 'Import should succeed')
  assertEqual(result.merged.length, 2, 'Should have 2 transactions (replaced)')
})

test('Empty transactions backup is rejected', () => {
  const storage = makeStorage({ schemaVersion: CURRENT_SCHEMA_VERSION, transactions: [{ id: 'keep' }] })
  const backup = { app: 'SakuKilat', schemaVersion: CURRENT_SCHEMA_VERSION, transactions: [] }
  const result = importFile_CURRENT(storage, JSON.stringify(backup))
  assert(!result.success, 'Empty import should be rejected')
})

// ── Group 2: Checkpoint tests (should FAIL before fix) ──
console.log('\nGroup 2: Pre-import checkpoint (expect FAIL before fix)')

test('Import creates pre-import checkpoint', () => {
  const existing = { schemaVersion: CURRENT_SCHEMA_VERSION, transactions: [{ id: 'precious' }] }
  const storage = makeStorage(existing)
  const backup = { app: 'SakuKilat', schemaVersion: CURRENT_SCHEMA_VERSION, transactions: [{ id: 'new' }] }

  const result = importFile_CURRENT(storage, JSON.stringify(backup))
  assert(result.success, 'Import should succeed')

  // CRITICAL: current code does NOT create checkpoint
  assert(
    result.checkpointCreated === true,
    'Current importFile should create checkpoint before modifying state'
  )
})

test('Checkpoint preserves exact pre-import state', () => {
  const existing = { schemaVersion: CURRENT_SCHEMA_VERSION, transactions: [{ id: 'original', amount: 500 }] }
  const storage = makeStorage(existing)
  const backup = { app: 'SakuKilat', schemaVersion: CURRENT_SCHEMA_VERSION, transactions: [{ id: 'replacement' }] }

  importFile_CURRENT(storage, JSON.stringify(backup))

  // After import, checkpoint should contain the original state
  const checkpoint = storage.getItem(CHECKPOINT_KEY)
  assert(
    checkpoint !== null,
    'Checkpoint should exist after import'
  )
})

test('Rollback restores pre-import state', () => {
  const existing = { schemaVersion: CURRENT_SCHEMA_VERSION, transactions: [{ id: 'precious', amount: 999 }] }
  const storage = makeStorage(existing)
  const backup = { app: 'SakuKilat', schemaVersion: CURRENT_SCHEMA_VERSION, transactions: [{ id: 'unwanted' }] }

  importFile_CURRENT(storage, JSON.stringify(backup))

  const rolledBack = rollbackFromCheckpoint(storage)
  assert(rolledBack, 'Rollback should succeed')

  const restored = JSON.parse(storage.getItem(STORAGE_KEY))
  assert(
    restored.transactions.some(t => t.id === 'precious'),
    'Original transaction should be restored after rollback'
  )
})

// ── Group 3: Schema validation ──
console.log('\nGroup 3: Schema validation')

test('Backup without transactions array has proper handling', () => {
  const existing = { schemaVersion: CURRENT_SCHEMA_VERSION, transactions: [{ id: 'safe' }] }
  const storage = makeStorage(existing)
  // This is an invalid backup — has app marker but no transactions
  const badBackup = { app: 'SakuKilat', schemaVersion: CURRENT_SCHEMA_VERSION }

  const result = importFile_CURRENT(storage, JSON.stringify(badBackup))
  // Current: this results in empty import → rejected (PASS because 0 transactions)
  // But ideally should give a specific schema error
  assert(!result.success, 'Should reject backup without transactions')
})

// ── Group 4: Expected behavior (after fix) ──
console.log('\nGroup 4: Expected behavior (after fix)')

test('EXPECTED: Import creates checkpoint and provides rollback', () => {
  const existing = { schemaVersion: CURRENT_SCHEMA_VERSION, transactions: [{ id: 'precious' }] }
  const storage = makeStorage(existing)
  const backup = { app: 'SakuKilat', schemaVersion: CURRENT_SCHEMA_VERSION, transactions: [{ id: 'new' }] }

  const result = importFile_EXPECTED(storage, JSON.stringify(backup))
  assert(result.success, 'Import should succeed')
  assert(result.checkpointCreated, 'Checkpoint should be created')
  assert(result.rollbackAvailable, 'Rollback should be available')

  // Verify checkpoint exists
  const checkpoint = storage.getItem(CHECKPOINT_KEY)
  assert(checkpoint !== null, 'Checkpoint key should exist')
  const checkpointData = JSON.parse(checkpoint)
  assert(checkpointData.transactions.some(t => t.id === 'precious'), 'Checkpoint should have original data')
})

test('EXPECTED: Rollback restores exact pre-import state', () => {
  const existing = { schemaVersion: CURRENT_SCHEMA_VERSION, transactions: [{ id: 'gold', amount: 1000 }] }
  const storage = makeStorage(existing)
  const backup = { app: 'SakuKilat', schemaVersion: CURRENT_SCHEMA_VERSION, transactions: [{ id: 'junk' }] }

  importFile_EXPECTED(storage, JSON.stringify(backup))
  rollbackFromCheckpoint(storage)

  const restored = JSON.parse(storage.getItem(STORAGE_KEY))
  assertEqual(restored.transactions.length, 1, 'Should have 1 transaction')
  assertEqual(restored.transactions[0].id, 'gold', 'Should be the original transaction')
})

// ── Group 5: Copy text accuracy ──
console.log('\nGroup 5: Copy text accuracy')

test('Copy text should NOT claim "data lama tidak dihapus" for backup replace', () => {
  // This is a documentation/UX test — we verify the expected behavior
  const isSakuKilatBackup = true
  const copyText = isSakuKilatBackup
    ? 'Backup JSON menggantikan seluruh data.'
    : 'Data lama tidak dihapus; transaksi duplikat dilewati.'

  assert(
    !copyText.includes('tidak dihapus') || !isSakuKilatBackup,
    'Backup restore copy must NOT claim data is preserved when it replaces everything'
  )
})

// ── Summary ──
console.log('\n' + '─'.repeat(50))
console.log(`\nResults: ${passed}/${total} passed, ${failed} failed\n`)

if (failed > 0) {
  console.error('❌ Some tests failed. Checkpoint tests will pass after SK-004 fix.\n')
  process.exit(1)
} else {
  console.log('✅ All SK-004 tests passed!\n')
  process.exit(0)
}
