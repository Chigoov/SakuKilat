/**
 * SK-003 — Storage Corruption Regression Tests
 *
 * Menguji helper production `lib/storage.ts` secara nyata (bukan salinan logika).
 * Jalankan: node scripts/test-storage-corruption.mjs
 */

import {
  loadPersistedState,
  persistState,
  canMutateState,
  STORAGE_KEY,
  CURRENT_SCHEMA_VERSION,
} from '../lib/storage.ts'

// ── Test harness ──
let passed = 0
let failed = 0
let total = 0

function makeStorage(initialData, options = {}) {
  const store = new Map()
  if (initialData !== undefined) {
    store.set(STORAGE_KEY, initialData)
  }
  return {
    getItem: (key) => store.has(key) ? store.get(key) : null,
    setItem: (key, val) => {
      if (options.failKeys && options.failKeys.some(k => key.includes(k))) {
        throw new Error('QuotaExceededError: Storage is full')
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

console.log('=== SK-003: Storage Corruption Regression Tests (Production Code) ===\n')

// ── Group 1: Valid & Missing States ──
console.log('Group 1: Valid and missing states')

test('Valid JSON state returns status "valid"', () => {
  const storage = makeStorage(JSON.stringify({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: [],
    wallets: [],
  }))
  const result = loadPersistedState(storage)
  assertEqual(result.status, 'valid', 'status')
  assert(result.state.schemaVersion === CURRENT_SCHEMA_VERSION, 'Should have schemaVersion')
  assert(Array.isArray(result.state.transactions), 'Should have transactions array')
})

test('Missing key (null) returns status "missing"', () => {
  const storage = makeStorage()
  const result = loadPersistedState(storage)
  assertEqual(result.status, 'missing', 'status')
  assertEqual(Object.keys(result.state).length, 0, 'State should be empty')
})

test('Valid state CAN be persisted', () => {
  const storage = makeStorage(JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, transactions: [] }))
  const loadResult = loadPersistedState(storage)
  assertEqual(loadResult.status, 'valid', 'load status')

  const newState = { transactions: [{ id: 'new', amount: 50 }] }
  const didPersist = persistState(storage, newState, loadResult.status)
  assert(didPersist === true, 'persistState should succeed')

  const saved = JSON.parse(storage.getItem(STORAGE_KEY))
  assert(saved.transactions.length === 1, 'New data should be saved')
})

test('Missing state CAN be persisted (first run)', () => {
  const storage = makeStorage()
  const loadResult = loadPersistedState(storage)
  assertEqual(loadResult.status, 'missing', 'load status')

  const newState = { transactions: [{ id: 'first', amount: 100 }] }
  const didPersist = persistState(storage, newState, loadResult.status)
  assert(didPersist === true, 'persistState should succeed for first run')
})

// ── Group 2: Corrupt States Detection ──
console.log('\nGroup 2: Corrupt state detection')

test('Truncated JSON returns CORRUPT status', () => {
  const corruptData = '{"transactions":[{"id":"abc'
  const storage = makeStorage(corruptData)
  const result = loadPersistedState(storage)
  assertEqual(result.status, 'corrupt', 'status')
  assertEqual(result.quarantinedRaw, corruptData, 'Should preserve raw payload')
  assert(typeof result.error === 'string', 'Should have error message')
})

test('Malformed JSON returns CORRUPT status', () => {
  const storage = makeStorage('{not valid json!}')
  const result = loadPersistedState(storage)
  assertEqual(result.status, 'corrupt', 'status')
  assert(typeof result.error === 'string', 'Should have error message')
})

test('Empty string returns CORRUPT status', () => {
  const storage = makeStorage('')
  const result = loadPersistedState(storage)
  assertEqual(result.status, 'corrupt', 'status')
  assert(typeof result.error === 'string', 'Should have error message')
})

test('JSON array must be rejected as CORRUPT (not valid state object)', () => {
  const storage = makeStorage(JSON.stringify([{ id: 'not-an-object' }]))
  const result = loadPersistedState(storage)
  assertEqual(result.status, 'corrupt', 'JSON array must be corrupt, not valid')
})

test('Wrong field types (transactions is not an array) returns CORRUPT status', () => {
  const storage = makeStorage(JSON.stringify({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: 'this is not an array',
  }))
  const result = loadPersistedState(storage)
  assertEqual(result.status, 'corrupt', 'Non-array transactions must be rejected as corrupt')
})

test('Corrupt state is quarantined to separate key', () => {
  const corruptData = '{"broken'
  const storage = makeStorage(corruptData)
  loadPersistedState(storage)
  const quarantineKeys = storage.keys().filter(k => k.includes(':quarantine:'))
  assert(quarantineKeys.length > 0, 'Should create quarantine key')
  assertEqual(storage.getItem(quarantineKeys[0]), corruptData, 'Quarantine should contain original data')
})

test('Quarantine write failure does NOT crash and does NOT delete primary corrupt data', () => {
  const corruptData = '{"broken-payload'
  // storage fails on quarantine write (quota exceeded)
  const storage = makeStorage(corruptData, { failKeys: [':quarantine:'] })
  const result = loadPersistedState(storage)
  assertEqual(result.status, 'corrupt', 'Status should still be corrupt')
  assertEqual(storage.getItem(STORAGE_KEY), corruptData, 'Primary corrupt data must NOT be lost')
})

// ── Group 3: Incompatible Schema ──
console.log('\nGroup 3: Incompatible schema handling')

test('Future schema version returns INCOMPATIBLE status', () => {
  const storage = makeStorage(JSON.stringify({ schemaVersion: 999, transactions: [] }))
  const result = loadPersistedState(storage)
  assertEqual(result.status, 'incompatible', 'status')
  assertEqual(result.detectedVersion, 999, 'detectedVersion')
})

// ── Group 4: Write & Mutation Blocking (Closing Silent Data Loss) ──
console.log('\nGroup 4: Write and mutation blocking')

test('Corrupt primary must NOT be overwritten by empty state', () => {
  const corruptData = '{"transactions":[BROKEN'
  const storage = makeStorage(corruptData)
  const loadResult = loadPersistedState(storage)
  assertEqual(loadResult.status, 'corrupt', 'load status')

  const defaultState = { transactions: [], wallets: [] }
  const didPersist = persistState(storage, defaultState, loadResult.status)
  assert(didPersist === false, 'persistState should return false (blocked)')

  const currentRaw = storage.getItem(STORAGE_KEY)
  assertEqual(currentRaw, corruptData, 'Original data must NOT be overwritten')
})

test('Incompatible state must NOT be overwritten', () => {
  const futureData = JSON.stringify({ schemaVersion: 999, transactions: [{ id: 'future' }] })
  const storage = makeStorage(futureData)
  const loadResult = loadPersistedState(storage)
  assertEqual(loadResult.status, 'incompatible', 'load status')

  const didPersist = persistState(storage, { transactions: [] }, loadResult.status)
  assert(didPersist === false, 'persistState should be blocked')

  const currentRaw = storage.getItem(STORAGE_KEY)
  assertEqual(currentRaw, futureData, 'Future data must NOT be overwritten')
})

test('Mutations are BLOCKED when storage status is corrupt', () => {
  assert(canMutateState('corrupt') === false, 'canMutateState must return false for corrupt')
})

test('Mutations are BLOCKED when storage status is incompatible', () => {
  assert(canMutateState('incompatible') === false, 'canMutateState must return false for incompatible')
})

test('Mutations are ALLOWED when storage status is valid or missing', () => {
  assert(canMutateState('valid') === true, 'canMutateState must return true for valid')
  assert(canMutateState('missing') === true, 'canMutateState must return true for missing')
})

test('Reload does not eliminate primary corrupt state', () => {
  const corruptData = '{"transactions":[BROKEN_FOR_RELOAD'
  const storage = makeStorage(corruptData)
  
  // First load
  const load1 = loadPersistedState(storage)
  assertEqual(load1.status, 'corrupt', 'first load')
  
  // App attempts to persist (as StoreProvider might try)
  persistState(storage, { transactions: [] }, load1.status)
  
  // Second load (simulating page reload)
  const load2 = loadPersistedState(storage)
  assertEqual(load2.status, 'corrupt', 'second load')
  assertEqual(storage.getItem(STORAGE_KEY), corruptData, 'primary must remain intact after reload')
})

// ── Summary ──
console.log('\n' + '─'.repeat(50))
console.log(`Results: ${passed}/${total} passed, ${failed} failed\n`)

if (failed > 0) {
  console.error(`❌ Expected failure on baseline: ${failed} tests failed as expected before fix.\n`)
  process.exit(1)
} else {
  console.log('✅ All SK-003 tests passed!\n')
  process.exit(0)
}
