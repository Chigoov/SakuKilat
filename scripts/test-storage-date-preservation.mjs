/**
 * Test Suite: Storage Date Preservation and Isolation (Task 2.5)
 * Verifies:
 * - serializeTransactionDate & deserializeTransactionDate in lib/storage.ts
 * - Round-trip calendar preservation (year, month, day, hour, minute)
 * - Timezone-shift immunity
 * - Date isolation preventing mutations
 * - Storage persistence with persistState and loadPersistedState
 *
 * Requirements: 1.4, 1.6
 */

import assert from 'node:assert/strict'
import {
  serializeTransactionDate,
  deserializeTransactionDate,
  serializeTransactions,
  deserializeTransactions,
  persistState,
  loadPersistedState,
  STORAGE_KEY,
  CURRENT_SCHEMA_VERSION,
} from '../lib/storage.ts'
import {
  toCalendarDateString,
  toTimeString,
} from '../lib/parser.ts'

console.log('=== Testing Storage Date Preservation & Isolation (Task 2.5) ===\n')

function createMockStorage(initialData) {
  const store = new Map()
  if (initialData !== undefined) {
    store.set(STORAGE_KEY, initialData)
  }
  return {
    getItem: (key) => store.has(key) ? store.get(key) : null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    keys: () => [...store.keys()],
  }
}

// ── Group 1: serializeTransactionDate & deserializeTransactionDate ────────────
{
  console.log('Group 1: Date serialization & deserialization accuracy')

  // 1a. Standard afternoon date
  const original = new Date(2026, 8, 13, 14, 30, 45) // 13 Sep 2026 14:30:45
  const serialized = serializeTransactionDate(original)
  assert.equal(serialized, '2026-09-13T14:30:45', 'Should serialize to YYYY-MM-DDTHH:mm:ss without UTC conversion')

  const revived = deserializeTransactionDate(serialized)
  assert.equal(revived.getFullYear(), 2026, 'Year must match')
  assert.equal(revived.getMonth(), 8, 'Month must match (8 = Sept)')
  assert.equal(revived.getDate(), 13, 'Day must match')
  assert.equal(revived.getHours(), 14, 'Hour must match')
  assert.equal(revived.getMinutes(), 30, 'Minute must match')
  assert.equal(revived.getSeconds(), 45, 'Second must match')

  // 1b. Midnight / early morning date (e.g. 00:05 or 01:30 AM)
  // This is the classic trap where toISOString() shifts date backwards in positive timezones (WIB +7)
  const midnightTx = new Date(2026, 8, 13, 0, 15, 0) // 13 Sep 2026 00:15:00
  const serializedMidnight = serializeTransactionDate(midnightTx)
  assert.equal(serializedMidnight, '2026-09-13T00:15:00', 'Midnight date must keep the same calendar day')

  const revivedMidnight = deserializeTransactionDate(serializedMidnight)
  assert.equal(revivedMidnight.getDate(), 13, 'Calendar day must remain 13, NOT 12')
  assert.equal(revivedMidnight.getHours(), 0, 'Hour must remain 0')
  assert.equal(revivedMidnight.getMinutes(), 15, 'Minute must remain 15')

  // 1c. Late night date (e.g. 23:55 PM)
  const lateTx = new Date(2026, 11, 31, 23, 59, 50) // 31 Dec 2026 23:59:50
  const serializedLate = serializeTransactionDate(lateTx)
  assert.equal(serializedLate, '2026-12-31T23:59:50', 'New Year eve late night transaction')

  const revivedLate = deserializeTransactionDate(serializedLate)
  assert.equal(revivedLate.getFullYear(), 2026, 'Year must remain 2026, not rollover')
  assert.equal(revivedLate.getMonth(), 11, 'Month must remain December (11)')
  assert.equal(revivedLate.getDate(), 31, 'Day must remain 31')
  assert.equal(revivedLate.getHours(), 23, 'Hour must remain 23')
  assert.equal(revivedLate.getMinutes(), 59, 'Minute must remain 59')

  // 1d. Leap year date (29 Feb 2024)
  const leapTx = new Date(2024, 1, 29, 10, 0, 0)
  const serializedLeap = serializeTransactionDate(leapTx)
  assert.equal(serializedLeap, '2024-02-29T10:00:00', 'Leap day preservation')
  const revivedLeap = deserializeTransactionDate(serializedLeap)
  assert.equal(revivedLeap.getDate(), 29, 'Leap day must be 29')
  assert.equal(revivedLeap.getMonth(), 1, 'Leap month must be Feb (1)')

  // 1e. Robustness: epoch timestamp input
  const timestamp = original.getTime()
  const serializedFromTs = serializeTransactionDate(timestamp)
  assert.equal(serializedFromTs, '2026-09-13T14:30:45', 'Timestamp input produces valid local serialization')

  // 1f. Robustness: invalid inputs fall back safely without crashing
  const fallbackFromNull = deserializeTransactionDate(null)
  assert.ok(fallbackFromNull instanceof Date && !Number.isNaN(fallbackFromNull.getTime()), 'Null input returns valid Date')
  const fallbackFromJunk = deserializeTransactionDate('not-a-real-date')
  assert.ok(fallbackFromJunk instanceof Date && !Number.isNaN(fallbackFromJunk.getTime()), 'Junk string returns valid Date')

  console.log('  ✓ PASS: Serialization & deserialization calendar accuracy confirmed')
}

// ── Group 2: Backward compatibility with legacy UTC ISO strings ─────────────
{
  console.log('\nGroup 2: Backward compatibility with legacy UTC formats')

  // Legacy data previously saved with toISOString() ending with 'Z'
  const legacyUtcStr = '2026-09-13T07:30:00.000Z'
  const revivedFromUtc = deserializeTransactionDate(legacyUtcStr)
  assert.ok(revivedFromUtc instanceof Date, 'Returns valid Date object')
  assert.ok(!Number.isNaN(revivedFromUtc.getTime()), 'Valid epoch timestamp')

  // Once deserialized and re-serialized, it converts cleanly to the timezone-immune calendar format
  const migratedStr = serializeTransactionDate(revivedFromUtc)
  assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(migratedStr), 'Migrates to standard local format')

  console.log('  ✓ PASS: Legacy UTC ISO string handling verified')
}

// ── Group 3: Array batch helpers (serializeTransactions / deserializeTransactions) ───
{
  console.log('\nGroup 3: Batch transactions serialization & revival')

  const sampleTxs = [
    { id: 'tx-1', amount: 25000, date: new Date(2026, 8, 1, 9, 0, 0), description: 'Kopi' },
    { id: 'tx-2', amount: 50000, date: new Date(2026, 8, 2, 12, 30, 0), description: 'Makan' },
  ]

  const serializedArray = serializeTransactions(sampleTxs)
  assert.equal(serializedArray.length, 2, 'Array length matches')
  assert.equal(typeof serializedArray[0].date, 'string', 'Date is string in serialized form')
  assert.equal(serializedArray[0].date, '2026-09-01T09:00:00', 'First tx date serialized')
  assert.equal(serializedArray[1].date, '2026-09-02T12:30:00', 'Second tx date serialized')

  const revivedArray = deserializeTransactions(serializedArray)
  assert.equal(revivedArray.length, 2, 'Array length matches')
  assert.ok(revivedArray[0].date instanceof Date, 'First date revived to Date')
  assert.equal(revivedArray[0].date.getDate(), 1, 'First day preserved')
  assert.equal(revivedArray[0].date.getHours(), 9, 'First hour preserved')
  assert.ok(revivedArray[1].date instanceof Date, 'Second date revived to Date')
  assert.equal(revivedArray[1].date.getDate(), 2, 'Second day preserved')
  assert.equal(revivedArray[1].date.getHours(), 12, 'Second hour preserved')

  // Edge cases
  assert.deepEqual(serializeTransactions(null), [], 'Null returns empty array')
  assert.deepEqual(deserializeTransactions(undefined), [], 'Undefined returns empty array')

  console.log('  ✓ PASS: Batch array helpers verified')
}

// ── Group 4: Storage Persistence & Reload Invariance (Requirements 1.4, 1.6) ───
{
  console.log('\nGroup 4: Storage persistence & reload invariance')

  const storage = createMockStorage()
  const txDate = new Date(2026, 8, 13, 14, 30, 0)
  const originalState = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: [
      {
        id: 'tx-test-01',
        description: 'Beli buku',
        amount: 85000,
        type: 'expense',
        category: 'belanja',
        paymentMethod: 'bca',
        date: txDate, // Raw Date object passed to persistState
      },
    ],
    wallets: [],
  }

  // Persist state to storage
  const persisted = persistState(storage, originalState, 'valid')
  assert.equal(persisted, true, 'persistState must return true')

  // Check stored raw JSON
  const rawJson = storage.getItem(STORAGE_KEY)
  const parsedJson = JSON.parse(rawJson)
  assert.equal(
    parsedJson.transactions[0].date,
    '2026-09-13T14:30:00',
    'Persisted JSON must have local calendar string without UTC shift'
  )

  // Load state from storage
  const loadResult = loadPersistedState(storage)
  assert.equal(loadResult.status, 'valid', 'load status must be valid')

  const loadedTx = loadResult.state.transactions[0]
  const revivedDate = deserializeTransactionDate(loadedTx.date)

  // Verify full round-trip preservation
  assert.equal(toCalendarDateString(revivedDate), '2026-09-13', 'Calendar day matches exactly')
  assert.equal(toTimeString(revivedDate), '14:30', 'Calendar time matches exactly')
  assert.equal(revivedDate.getFullYear(), 2026, 'Year matches')
  assert.equal(revivedDate.getMonth(), 8, 'Month matches')
  assert.equal(revivedDate.getDate(), 13, 'Date matches')
  assert.equal(revivedDate.getHours(), 14, 'Hours match')
  assert.equal(revivedDate.getMinutes(), 30, 'Minutes match')

  console.log('  ✓ PASS: Storage persistence & reload round-trip verified')
}

// ── Group 5: Date Isolation & Mutation Prevention ─────────────────────────────
{
  console.log('\nGroup 5: Date isolation & mutation prevention')

  const baseDate = new Date(2026, 8, 13, 10, 0, 0)
  const serialized = serializeTransactionDate(baseDate)

  // 5a. Deserializing produces a fresh independent instance
  const instanceA = deserializeTransactionDate(serialized)
  const instanceB = deserializeTransactionDate(serialized)
  assert.notEqual(instanceA, instanceB, 'Instances must be separate objects in memory')

  // 5b. Mutating instanceA must NOT mutate instanceB
  instanceA.setFullYear(1999)
  instanceA.setDate(1)
  assert.equal(instanceB.getFullYear(), 2026, 'instanceB year remains untouched')
  assert.equal(instanceB.getDate(), 13, 'instanceB date remains untouched')

  // 5c. Repeated serialization is idempotent
  const reserialized = serializeTransactionDate(instanceB)
  assert.equal(reserialized, serialized, 'Serialization must be strictly idempotent')

  console.log('  ✓ PASS: Date isolation & mutation prevention verified')
}

console.log('\nAll storage date preservation and isolation tests PASSED! ✅')
