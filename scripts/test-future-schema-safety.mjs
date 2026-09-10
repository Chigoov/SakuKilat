/**
 * A1 — Future Schema Safety Tests
 *
 * Tests that exercise production code paths for incompatible (future) schema handling.
 * Jalankan: node scripts/test-future-schema-safety.mjs
 */

import {
  loadPersistedState,
  persistState,
  canMutateState,
  resetCorruptState,
  STORAGE_KEY,
  CURRENT_SCHEMA_VERSION,
  KNOWN_STORAGE_KEYS,
} from '../lib/storage.ts'

// ── Test harness ──
let passed = 0
let failed = 0
let total = 0

function makeStorage(initialData, extraKeys = {}) {
  const store = new Map()
  if (initialData !== undefined) {
    store.set(STORAGE_KEY, initialData)
  }
  for (const [k, v] of Object.entries(extraKeys)) {
    store.set(k, v)
  }
  return {
    getItem: (key) => store.has(key) ? store.get(key) : null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    keys: () => [...store.keys()],
    get length() { return store.size },
    key: (index) => [...store.keys()][index] ?? null,
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

console.log('=== A1: Future Schema Safety Tests (Production Code) ===\n')

// ── Group 1: Future schema preserved ──
console.log('Group 1: Future schema data preservation')

test('Future schema raw payload is preserved in storage after load', () => {
  const futureData = JSON.stringify({ schemaVersion: 999, transactions: [{ id: 'future-1' }], newField: 'v999' })
  const storage = makeStorage(futureData)
  const result = loadPersistedState(storage)
  assertEqual(result.status, 'incompatible', 'status')
  // Primary key must still contain original data
  assertEqual(storage.getItem(STORAGE_KEY), futureData, 'Future data must remain in primary storage key')
})

test('Future schema raw payload is available for export in LoadResult', () => {
  const futureData = JSON.stringify({ schemaVersion: 999, transactions: [{ id: 'future-1' }] })
  const storage = makeStorage(futureData)
  const result = loadPersistedState(storage)
  assertEqual(result.status, 'incompatible', 'status')
  // Must be able to export the raw payload — either via state or dedicated field
  const rawAvailable = (
    (result.state && Object.keys(result.state).length > 0) ||
    (typeof result.incompatibleRaw === 'string' && result.incompatibleRaw.length > 0)
  )
  assert(rawAvailable, 'Raw future payload must be available for export (via state or incompatibleRaw)')
})

// ── Group 2: Reset rejection for incompatible ──
console.log('\nGroup 2: Reset rejection for incompatible')

test('resetCorruptState rejects reset when status is incompatible', () => {
  const futureData = JSON.stringify({ schemaVersion: 999, transactions: [] })
  const storage = makeStorage(futureData)
  // Pass storageStatus='incompatible' — reset should be blocked
  const result = resetCorruptState(storage, true, 'incompatible')
  assertEqual(result, false, 'Must return false for incompatible')
  assertEqual(storage.getItem(STORAGE_KEY), futureData, 'Future data must not be deleted')
})

test('Reset without confirmation is rejected', () => {
  const corruptData = '{broken'
  const storage = makeStorage(corruptData)
  const result = resetCorruptState(storage, false)
  assertEqual(result, false, 'Must return false without confirmation')
  assertEqual(storage.getItem(STORAGE_KEY), corruptData, 'Data must remain')
})

// ── Group 3: Unknown future keys preserved ──
console.log('\nGroup 3: Unknown future keys preserved')

test('Unknown sakukilat keys from future versions are NOT deleted during load', () => {
  const validData = JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, transactions: [] })
  const unknownFutureKey = 'sakukilat:v3:new-feature-data'
  const storage = makeStorage(validData, { [unknownFutureKey]: 'future-value' })
  
  // loadPersistedState currently calls cleanupStaleStorageKeys which may delete this
  loadPersistedState(storage)
  
  const preserved = storage.getItem(unknownFutureKey)
  assertEqual(preserved, 'future-value', 'Unknown future key must be preserved (not cleaned up)')
})

test('Unknown sakukilat keys are preserved when primary state is incompatible', () => {
  const futureData = JSON.stringify({ schemaVersion: 999, transactions: [] })
  const unknownKey = 'sakukilat:v3:settings'
  const storage = makeStorage(futureData, { [unknownKey]: 'settings-data' })
  
  loadPersistedState(storage)
  
  assertEqual(storage.getItem(unknownKey), 'settings-data', 'Unknown key must survive incompatible load')
  assertEqual(storage.getItem(STORAGE_KEY), futureData, 'Primary data must also survive')
})

// ── Group 4: Corrupt state can still be backed up ──
console.log('\nGroup 4: Corrupt state backup capability')

test('Corrupt state raw data is available for backup/download', () => {
  const corruptData = '{"transactions":[BROKEN'
  const storage = makeStorage(corruptData)
  const result = loadPersistedState(storage)
  assertEqual(result.status, 'corrupt', 'status')
  assert(typeof result.quarantinedRaw === 'string', 'quarantinedRaw must be a string')
  assertEqual(result.quarantinedRaw, corruptData, 'quarantinedRaw must match original corrupt data')
})

// ── Group 5: No mutation during corrupt/incompatible ──
console.log('\nGroup 5: Mutation blocking')

test('canMutateState returns false for corrupt', () => {
  assertEqual(canMutateState('corrupt'), false, 'corrupt')
})

test('canMutateState returns false for incompatible', () => {
  assertEqual(canMutateState('incompatible'), false, 'incompatible')
})

test('persistState blocked for corrupt', () => {
  const storage = makeStorage('{"broken')
  const result = persistState(storage, { transactions: [] }, 'corrupt')
  assertEqual(result, false, 'Should be blocked')
})

test('persistState blocked for incompatible', () => {
  const futureData = JSON.stringify({ schemaVersion: 999, transactions: [] })
  const storage = makeStorage(futureData)
  const result = persistState(storage, { transactions: [] }, 'incompatible')
  assertEqual(result, false, 'Should be blocked')
  assertEqual(storage.getItem(STORAGE_KEY), futureData, 'Future data must remain')
})

// ── Summary ──
console.log('\n' + '─'.repeat(50))
console.log(`Results: ${passed}/${total} passed, ${failed} failed\n`)

if (failed > 0) {
  console.error(`❌ ${failed} tests failed — fixes needed.\n`)
  process.exitCode = 1
} else {
  console.log('✅ All A1 future schema safety tests passed!\n')
  process.exitCode = 0
}
