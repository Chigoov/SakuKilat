/**
 * SK-003 — Storage Corruption Regression Tests
 *
 * Menguji bahwa loadPersistedState menangani setiap status storage
 * dengan benar: valid, missing, corrupt, incompatible.
 *
 * Jalankan: node scripts/test-storage-corruption.mjs
 */

// ── Replika logic dari lib/store.tsx (AFTER SK-003 fix) ──
const CURRENT_SCHEMA_VERSION = 8
const STORAGE_KEY = 'sakukilat:v2:local-state'

/**
 * Mirror of the FIXED loadPersistedState from lib/store.tsx.
 * Returns typed LoadResult with status/state/error fields.
 */
function loadPersistedState(mockLocalStorage) {
  const raw = mockLocalStorage.getItem(STORAGE_KEY)
  if (raw === null || raw === undefined) {
    return { status: 'missing', state: {} }
  }

  if (raw === '') {
    quarantineCorrupt(mockLocalStorage, raw)
    return { status: 'corrupt', state: {}, quarantinedRaw: raw, error: 'Empty storage value' }
  }

  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') {
      quarantineCorrupt(mockLocalStorage, raw)
      return { status: 'corrupt', state: {}, quarantinedRaw: raw, error: 'Parsed value is not an object' }
    }

    if (parsed.schemaVersion && parsed.schemaVersion > CURRENT_SCHEMA_VERSION) {
      return {
        status: 'incompatible',
        state: parsed,
        detectedVersion: parsed.schemaVersion,
      }
    }

    return { status: 'valid', state: parsed }
  } catch (error) {
    quarantineCorrupt(mockLocalStorage, raw)
    return { status: 'corrupt', state: {}, quarantinedRaw: raw, error: String(error) }
  }
}

function quarantineCorrupt(mockLocalStorage, raw) {
  try {
    const quarantineKey = `${STORAGE_KEY}:quarantine:${Date.now()}`
    mockLocalStorage.setItem(quarantineKey, raw)
  } catch {
    // Best-effort
  }
}

/**
 * Mirror of the FIXED persistState from lib/store.tsx.
 * Blocks writes on corrupt/incompatible status.
 */
function persistState(mockLocalStorage, state, storageStatus) {
  if (storageStatus === 'corrupt' || storageStatus === 'incompatible') {
    return false // blocked
  }
  try {
    mockLocalStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, ...state }))
    return true
  } catch {
    return false
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

console.log('\n🧪 SK-003 Storage Corruption Tests\n')

// ── Group 1: Valid and Missing states ──
console.log('Group 1: Valid and Missing states')

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
  const storage = makeStorage() // no data set
  const result = loadPersistedState(storage)
  assertEqual(result.status, 'missing', 'status')
  assert(Object.keys(result.state).length === 0, 'State should be empty')
})

test('Valid state with current schema returns "valid"', () => {
  const storage = makeStorage(JSON.stringify({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: [{ id: 'test', amount: 100 }],
  }))
  const result = loadPersistedState(storage)
  assertEqual(result.status, 'valid', 'status')
  assert(result.state.transactions.length === 1, 'Should have 1 transaction')
})

// ── Group 2: Corrupt states ──
console.log('\nGroup 2: Corrupt state handling')

test('Truncated JSON returns CORRUPT status', () => {
  const corruptData = '{"transactions":[{"id":"abc'
  const storage = makeStorage(corruptData)
  const result = loadPersistedState(storage)
  assertEqual(result.status, 'corrupt', 'status')
  assert(result.quarantinedRaw === corruptData, 'Should preserve raw payload')
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

test('Corrupt state is quarantined to separate key', () => {
  const corruptData = '{"broken'
  const storage = makeStorage(corruptData)
  loadPersistedState(storage)
  const quarantineKeys = storage.keys().filter(k => k.includes(':quarantine:'))
  assert(quarantineKeys.length > 0, 'Should create quarantine key')
  assertEqual(storage.getItem(quarantineKeys[0]), corruptData, 'Quarantine should contain original data')
})

// ── Group 3: Incompatible states ──
console.log('\nGroup 3: Incompatible state handling')

test('Future schema version returns INCOMPATIBLE status', () => {
  const storage = makeStorage(JSON.stringify({ schemaVersion: 999, transactions: [] }))
  const result = loadPersistedState(storage)
  assertEqual(result.status, 'incompatible', 'status')
  assertEqual(result.detectedVersion, 999, 'detectedVersion')
})

// ── Group 4: Persist blocking ──
console.log('\nGroup 4: Persist blocking on corrupt/incompatible')

test('Corrupt primary must NOT be overwritten by empty state', () => {
  const corruptData = '{"transactions":[BROKEN'
  const storage = makeStorage(corruptData)
  const loadResult = loadPersistedState(storage)
  assertEqual(loadResult.status, 'corrupt', 'load status')

  // Try to persist default state — should be BLOCKED
  const defaultState = { transactions: [], wallets: [] }
  const didPersist = persistState(storage, defaultState, loadResult.status)
  assert(didPersist === false, 'persistState should return false (blocked)')

  // Original corrupt data should still be in the quarantine, not overwritten
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
  const storage = makeStorage() // no data
  const loadResult = loadPersistedState(storage)
  assertEqual(loadResult.status, 'missing', 'load status')

  const newState = { transactions: [{ id: 'first', amount: 100 }] }
  const didPersist = persistState(storage, newState, loadResult.status)
  assert(didPersist === true, 'persistState should succeed for first run')
})

// ── Summary ──
console.log('\n' + '─'.repeat(50))
console.log(`\nResults: ${passed}/${total} passed, ${failed} failed\n`)

if (failed > 0) {
  console.error('❌ Some tests failed.\n')
  process.exit(1)
} else {
  console.log('✅ All SK-003 tests passed!\n')
  process.exit(0)
}
