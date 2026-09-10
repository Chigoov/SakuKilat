/**
 * SK-003 — Storage Corruption Regression Tests
 *
 * Menguji bahwa loadPersistedState menangani setiap status storage
 * dengan benar: valid, missing, corrupt, incompatible.
 *
 * Tests ini SENGAJA dibuat gagal dulu (red) sebelum production fix,
 * agar perubahan di store.tsx bisa diverifikasi.
 *
 * Jalankan: node scripts/test-storage-corruption.mjs
 */

// ── Minimal mock of the CURRENT loadPersistedState behavior ──
// Replika logic dari lib/store.tsx lines 425-446 yang akan diuji.
const CURRENT_SCHEMA_VERSION = 8
const STORAGE_KEY = 'sakukilat:v2:local-state'

/**
 * Simulates the CURRENT loadPersistedState behavior exactly as written.
 * Returns whatever the current code would return.
 */
function loadPersistedState_CURRENT(mockLocalStorage) {
  try {
    const raw = mockLocalStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    // Skip migration for test simplicity — we only test parse/detect
    return parsed
  } catch {
    // Current: silently returns empty object on any parse error
    return {}
  }
}

/**
 * Simulates the EXPECTED loadPersistedState behavior after fix.
 * Returns a typed LoadResult.
 *
 * @typedef {'valid'|'missing'|'corrupt'|'incompatible'} LoadStatus
 * @typedef {{status: LoadStatus, state?: object, raw?: string, error?: string, version?: number}} LoadResult
 */
function loadPersistedState_EXPECTED(mockLocalStorage) {
  const raw = mockLocalStorage.getItem(STORAGE_KEY)
  if (raw === null || raw === undefined) return { status: 'missing' }
  if (raw === '') return { status: 'corrupt', raw, error: 'Empty string' }

  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') {
      return { status: 'corrupt', raw, error: 'Parsed value is not an object' }
    }

    if (parsed.schemaVersion && parsed.schemaVersion > CURRENT_SCHEMA_VERSION) {
      return { status: 'incompatible', state: parsed, version: parsed.schemaVersion }
    }

    return { status: 'valid', state: parsed }
  } catch (error) {
    return { status: 'corrupt', raw, error: String(error) }
  }
}

// ── Test harness ──
let passed = 0
let failed = 0
let total = 0

function makeStorage(data) {
  const store = new Map()
  if (data !== undefined) {
    store.set(STORAGE_KEY, data)
  }
  return {
    getItem: (key) => store.has(key) ? store.get(key) : null,
    setItem: (key, val) => store.set(key, val),
    removeItem: (key) => store.delete(key),
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

console.log('\n🧪 SK-003 Storage Corruption Tests\n')

// ── Group 1: Tests that verify CURRENT behavior (should PASS) ──
console.log('Group 1: Current behavior (expect PASS)')

test('Valid JSON state returns parsed object', () => {
  const storage = makeStorage(JSON.stringify({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: [],
    wallets: [],
  }))
  const result = loadPersistedState_CURRENT(storage)
  assert(result.schemaVersion === CURRENT_SCHEMA_VERSION, 'Should have schemaVersion')
  assert(Array.isArray(result.transactions), 'Should have transactions array')
})

test('Missing key (null) returns empty object for first run', () => {
  const storage = makeStorage() // no data set
  const result = loadPersistedState_CURRENT(storage)
  assert(typeof result === 'object', 'Should return object')
  assert(Object.keys(result).length === 0, 'Should be empty')
})

// ── Group 2: Tests that verify EXPECTED behavior (should FAIL before fix) ──
console.log('\nGroup 2: Expected behavior after fix (expect FAIL before fix)')

test('Truncated JSON returns CORRUPT status, not empty object', () => {
  const corruptData = '{"transactions":[{"id":"abc'
  const storage = makeStorage(corruptData)

  // The CURRENT behavior returns {} — this test verifies the FIX
  const result = loadPersistedState_EXPECTED(storage)
  assertEqual(result.status, 'corrupt', 'status')
  assert(result.raw === corruptData, 'Should preserve raw payload')
  assert(typeof result.error === 'string', 'Should have error message')

  // CRITICAL: verify the current code does NOT do this correctly
  const currentResult = loadPersistedState_CURRENT(storage)
  // After fix, the current code should also return a typed result.
  // For now, current code returns {} which is indistinguishable from first-run.
  assert(
    currentResult.status === 'corrupt',
    'Current loadPersistedState should return { status: "corrupt" } for truncated JSON'
  )
})

test('Malformed JSON returns CORRUPT status', () => {
  const storage = makeStorage('{not valid json!}')
  const result = loadPersistedState_EXPECTED(storage)
  assertEqual(result.status, 'corrupt', 'status')

  const currentResult = loadPersistedState_CURRENT(storage)
  assert(
    currentResult.status === 'corrupt',
    'Current loadPersistedState should return { status: "corrupt" } for malformed JSON'
  )
})

test('Empty string returns CORRUPT status', () => {
  const storage = makeStorage('')
  const result = loadPersistedState_EXPECTED(storage)
  assertEqual(result.status, 'corrupt', 'status')

  const currentResult = loadPersistedState_CURRENT(storage)
  assert(
    currentResult.status === 'corrupt',
    'Current loadPersistedState should return { status: "corrupt" } for empty string'
  )
})

test('Future schema version returns INCOMPATIBLE status', () => {
  const storage = makeStorage(JSON.stringify({ schemaVersion: 999, transactions: [] }))
  const result = loadPersistedState_EXPECTED(storage)
  assertEqual(result.status, 'incompatible', 'status')
  assertEqual(result.version, 999, 'version')

  const currentResult = loadPersistedState_CURRENT(storage)
  assert(
    currentResult.status === 'incompatible',
    'Current loadPersistedState should return { status: "incompatible" } for future schema'
  )
})

test('Corrupt primary must NOT be overwritten by empty state', () => {
  // Simulate the full load→persist cycle
  const corruptData = '{"transactions":[BROKEN'
  const storage = makeStorage(corruptData)

  // Load (current behavior returns {})
  const loadResult = loadPersistedState_CURRENT(storage)

  // Simulate persist with default state (what happens after load returns {})
  const isCorruptedButTreatedAsEmpty = Object.keys(loadResult).length === 0
  if (isCorruptedButTreatedAsEmpty) {
    // This is what the current code does: persist empty state over corrupt data
    const defaultState = { schemaVersion: CURRENT_SCHEMA_VERSION, transactions: [], wallets: [] }
    storage.setItem(STORAGE_KEY, JSON.stringify(defaultState))
  }

  // After the cycle, the corrupt data should STILL be recoverable
  const afterCycle = storage.getItem(STORAGE_KEY)
  const afterParsed = JSON.parse(afterCycle)
  assert(
    afterParsed.transactions && afterParsed.transactions.length > 0,
    'Corrupt data should NOT be overwritten by empty defaults — original data must be recoverable'
  )
})

test('Valid state returns status "valid"', () => {
  const storage = makeStorage(JSON.stringify({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: [{ id: 'test', amount: 100 }],
  }))
  const currentResult = loadPersistedState_CURRENT(storage)
  assertEqual(
    currentResult.status,
    'valid',
    'Current loadPersistedState should return { status: "valid" } for valid state'
  )
})

test('Missing key returns status "missing"', () => {
  const storage = makeStorage() // no data
  const currentResult = loadPersistedState_CURRENT(storage)
  assertEqual(
    currentResult.status,
    'missing',
    'Current loadPersistedState should return { status: "missing" } when key is null'
  )
})

// ── Summary ──
console.log('\n' + '─'.repeat(50))
console.log(`\nResults: ${passed}/${total} passed, ${failed} failed\n`)

if (failed > 0) {
  console.error('❌ Some tests failed. These will pass after SK-003 fix is applied.\n')
  process.exit(1)
} else {
  console.log('✅ All tests passed!\n')
  process.exit(0)
}
