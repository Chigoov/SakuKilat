/**
 * SakuKilat — Property-Based Test Suite for Transaction Date Round-Trip & Timezone Invariance
 *
 * Feature: sakukilat-core-roadmap, Property 3: Transaction Date Round-Trip and Timezone Invariance
 * Validates: Requirements 1.4, 1.5, 1.6
 *
 * For all valid calendar dates and times between years 2000 and 2050, serializing a
 * transaction to local storage format and subsequently deserializing it SHALL produce
 * an identical calendar year, month, day, hour, and minute, regardless of the host
 * environment's UTC timezone offset.
 */

import assert from 'node:assert/strict'
import {
  fc,
  testProperty,
  MIN_PBT_RUNS,
  arbCalendarDate,
  arbRupiahAmount,
  arbCategory,
  arbPaymentMethod,
} from './pbt-harness.mjs'
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

console.log('====================================================')
console.log('  SAKUKILAT — PBT: DATE ROUND-TRIP & TIMEZONE INVARIANCE ')
console.log('====================================================\n')

// In-memory mock storage implementation conforming to StorageLike interface
function createMockStorage(initialData) {
  const store = new Map()
  if (initialData !== undefined) {
    store.set(STORAGE_KEY, initialData)
  }
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    keys: () => [...store.keys()],
    get length() {
      return store.size
    },
    key: (i) => [...store.keys()][i] ?? null,
  }
}

// Smart arbitrary generating valid calendar dates between 2000 and 2050,
// correctly accounting for leap years, 30/31 day months, and 24-hour time components.
const arbFullCalendarDate = fc
  .record({
    year: fc.integer({ min: 2000, max: 2050 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 31 }),
    hours: fc.integer({ min: 0, max: 23 }),
    minutes: fc.integer({ min: 0, max: 59 }),
    seconds: fc.integer({ min: 0, max: 59 }),
  })
  .filter(({ year, month, day }) => {
    const daysInMonth = new Date(year, month, 0).getDate()
    return day <= daysInMonth
  })
  .map(({ year, month, day, hours, minutes, seconds }) => {
    return new Date(year, month - 1, day, hours, minutes, seconds, 0)
  })

// Arbitrary transaction generator with randomized financial fields and dates
const arbTransaction = fc.record({
  id: fc.uuid(),
  description: fc.string({ minLength: 1, maxLength: 50 }),
  amount: arbRupiahAmount,
  type: fc.constantFrom('expense', 'income'),
  category: arbCategory,
  paymentMethod: arbPaymentMethod,
  date: arbFullCalendarDate,
})

// ── Property 3: Transaction Date Round-Trip and Timezone Invariance ─────────────
// Validates: Requirements 1.4, 1.5, 1.6
{
  let totalEvaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 3: Transaction Date Round-Trip and Timezone Invariance',
    fc.property(arbFullCalendarDate, (originalDate) => {
      totalEvaluated++

      // Step 1: Serialize date to local storage format
      const serialized = serializeTransactionDate(originalDate)

      // Invariant 1.1: Serialized string must strictly match calendar ISO-like pattern
      // "YYYY-MM-DDTHH:mm:ss" without UTC conversion or trailing 'Z'
      assert.match(
        serialized,
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/,
        `Expected serialized date to match YYYY-MM-DDTHH:mm:ss pattern, got "${serialized}"`
      )

      // Invariant 1.2: Serialized calendar components must strictly match original wall-clock components
      const expectedDateStr = toCalendarDateString(originalDate)
      const expectedTimeStr = toTimeString(originalDate)
      const expectedSeconds = String(originalDate.getSeconds()).padStart(2, '0')

      assert.ok(
        serialized.startsWith(expectedDateStr),
        `Expected serialized string to start with calendar date "${expectedDateStr}", got "${serialized}"`
      )
      assert.ok(
        serialized.endsWith(`${expectedTimeStr}:${expectedSeconds}`),
        `Expected serialized string to end with time "${expectedTimeStr}:${expectedSeconds}", got "${serialized}"`
      )

      // Step 2: Deserialize back to Date object
      const deserialized = deserializeTransactionDate(serialized)

      // Invariant 2.1: Deserialized object must be a valid Date instance
      assert.ok(
        deserialized instanceof Date && !Number.isNaN(deserialized.getTime()),
        'Deserialized result must be a valid non-NaN Date instance'
      )

      // Invariant 2.2: Exact round-trip preservation of calendar year, month, day, hour, minute, second
      assert.equal(
        deserialized.getFullYear(),
        originalDate.getFullYear(),
        `Year mismatch: expected ${originalDate.getFullYear()}, got ${deserialized.getFullYear()}`
      )
      assert.equal(
        deserialized.getMonth(),
        originalDate.getMonth(),
        `Month mismatch: expected ${originalDate.getMonth()}, got ${deserialized.getMonth()}`
      )
      assert.equal(
        deserialized.getDate(),
        originalDate.getDate(),
        `Day mismatch: expected ${originalDate.getDate()}, got ${deserialized.getDate()}`
      )
      assert.equal(
        deserialized.getHours(),
        originalDate.getHours(),
        `Hour mismatch: expected ${originalDate.getHours()}, got ${deserialized.getHours()}`
      )
      assert.equal(
        deserialized.getMinutes(),
        originalDate.getMinutes(),
        `Minute mismatch: expected ${originalDate.getMinutes()}, got ${deserialized.getMinutes()}`
      )
      assert.equal(
        deserialized.getSeconds(),
        originalDate.getSeconds(),
        `Second mismatch: expected ${originalDate.getSeconds()}, got ${deserialized.getSeconds()}`
      )

      // Invariant 2.3: Calendar string representations must be identical
      assert.equal(
        toCalendarDateString(deserialized),
        expectedDateStr,
        `Calendar date string mismatch after round-trip`
      )
      assert.equal(
        toTimeString(deserialized),
        expectedTimeStr,
        `Time string mismatch after round-trip`
      )

      // Invariant 2.4: Serialization idempotency
      const reserialized = serializeTransactionDate(deserialized)
      assert.equal(
        reserialized,
        serialized,
        `Re-serialization must be strictly idempotent: expected "${serialized}", got "${reserialized}"`
      )

      return true
    }),
    { numRuns: 200 }
  )

  assert.ok(
    totalEvaluated >= MIN_PBT_RUNS,
    `Expected at least ${MIN_PBT_RUNS} iterations, evaluated ${totalEvaluated}`
  )
}

// ── Property 3 (Sub-check A): Timezone Shift Boundary Invariance (Midnight & Late Night)
// Validates: Requirements 1.4, 1.6
{
  let boundaryEvaluated = 0

  // Focus specifically on boundary hours (00:00 - 04:00 and 20:00 - 23:59)
  // where UTC conversion offsets typically trigger day rollback or rollforward
  const arbBoundaryDate = fc
    .record({
      year: fc.integer({ min: 2000, max: 2050 }),
      month: fc.integer({ min: 1, max: 12 }),
      day: fc.integer({ min: 1, max: 31 }),
      hours: fc.constantFrom(0, 1, 2, 3, 4, 20, 21, 22, 23),
      minutes: fc.constantFrom(0, 1, 15, 30, 45, 59),
      seconds: fc.constantFrom(0, 30, 59),
    })
    .filter(({ year, month, day }) => {
      const daysInMonth = new Date(year, month, 0).getDate()
      return day <= daysInMonth
    })
    .map(({ year, month, day, hours, minutes, seconds }) => {
      return new Date(year, month - 1, day, hours, minutes, seconds, 0)
    })

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 3 (Sub-check A): Timezone Shift Boundary Invariance (Midnight & Late Night)',
    fc.property(arbBoundaryDate, (boundaryDate) => {
      boundaryEvaluated++

      const serialized = serializeTransactionDate(boundaryDate)
      const revived = deserializeTransactionDate(serialized)

      // Calendar day must NOT shift
      assert.equal(
        revived.getDate(),
        boundaryDate.getDate(),
        `Boundary hour ${boundaryDate.getHours()} caused day shift: expected ${boundaryDate.getDate()}, got ${revived.getDate()}`
      )
      assert.equal(
        revived.getMonth(),
        boundaryDate.getMonth(),
        `Boundary hour ${boundaryDate.getHours()} caused month shift`
      )
      assert.equal(
        revived.getFullYear(),
        boundaryDate.getFullYear(),
        `Boundary hour ${boundaryDate.getHours()} caused year shift`
      )
      assert.equal(
        revived.getHours(),
        boundaryDate.getHours(),
        `Hour shifted: expected ${boundaryDate.getHours()}, got ${revived.getHours()}`
      )
      assert.equal(
        revived.getMinutes(),
        boundaryDate.getMinutes(),
        `Minute shifted: expected ${boundaryDate.getMinutes()}, got ${revived.getMinutes()}`
      )

      return true
    }),
    { numRuns: 100 }
  )

  assert.ok(boundaryEvaluated >= MIN_PBT_RUNS)
}

// ── Property 3 (Sub-check B): Full Storage Persistence and Reload Invariance ────
// Validates: Requirements 1.4, 1.5, 1.6
{
  let stateRunCount = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 3 (Sub-check B): Full Storage Persistence and Reload Invariance',
    fc.property(
      fc.array(arbTransaction, { minLength: 1, maxLength: 8 }),
      (transactions) => {
        stateRunCount++
        const mockStorage = createMockStorage()

        const originalState = {
          schemaVersion: CURRENT_SCHEMA_VERSION,
          transactions,
          wallets: [],
          monthlyBudget: 3000000,
          customPayments: [],
          customCategories: [],
          hiddenPaymentIds: [],
          hiddenCategoryIds: [],
        }

        // 1. Persist state to mock storage
        const saveSuccess = persistState(mockStorage, originalState, 'valid')
        assert.equal(saveSuccess, true, 'persistState must succeed for valid state')

        // 2. Validate raw JSON in storage
        const rawSaved = mockStorage.getItem(STORAGE_KEY)
        assert.ok(rawSaved !== null && rawSaved.length > 0, 'Storage must contain serialized JSON')

        const parsedJson = JSON.parse(rawSaved)
        assert.equal(parsedJson.transactions.length, transactions.length)

        // Every transaction in raw storage must store a local calendar string, not a UTC 'Z' string
        for (let i = 0; i < parsedJson.transactions.length; i++) {
          const storedTx = parsedJson.transactions[i]
          assert.match(
            storedTx.date,
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/,
            `Stored transaction date in JSON must be a calendar string without UTC shift: "${storedTx.date}"`
          )
        }

        // 3. Reload state from storage
        const loadResult = loadPersistedState(mockStorage)
        assert.equal(loadResult.status, 'valid', 'loadPersistedState status must be "valid"')

        // 4. Revive transaction dates as done by store initialization
        const revivedTransactions = deserializeTransactions(loadResult.state.transactions)
        assert.equal(revivedTransactions.length, transactions.length)

        // 5. Verify every transaction preserved identical calendar day, month, year, hour, minute
        for (let i = 0; i < transactions.length; i++) {
          const orig = transactions[i]
          const revived = revivedTransactions[i]

          assert.equal(
            revived.date.getFullYear(),
            orig.date.getFullYear(),
            `Transaction ${i} year mismatch`
          )
          assert.equal(
            revived.date.getMonth(),
            orig.date.getMonth(),
            `Transaction ${i} month mismatch`
          )
          assert.equal(
            revived.date.getDate(),
            orig.date.getDate(),
            `Transaction ${i} date mismatch`
          )
          assert.equal(
            revived.date.getHours(),
            orig.date.getHours(),
            `Transaction ${i} hour mismatch`
          )
          assert.equal(
            revived.date.getMinutes(),
            orig.date.getMinutes(),
            `Transaction ${i} minute mismatch`
          )

          // Requirement 1.5: Edit modal form field population exactness
          // Form inputs read calendar date (YYYY-MM-DD) and time (HH:mm)
          const editFormDate = toCalendarDateString(revived.date)
          const editFormTime = toTimeString(revived.date)
          assert.equal(
            editFormDate,
            toCalendarDateString(orig.date),
            `Edit form date string mismatch for transaction ${i}`
          )
          assert.equal(
            editFormTime,
            toTimeString(orig.date),
            `Edit form time string mismatch for transaction ${i}`
          )
        }

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(stateRunCount >= MIN_PBT_RUNS)
}

// ── Property 3 (Sub-check C): Polymorphic Input Serialization & Deserialization ──
// Validates: Requirements 1.4, 1.6
{
  let polyCount = 0

  const arbPolymorphicInput = fc
    .tuple(
      arbFullCalendarDate,
      fc.constantFrom('date', 'timestamp', 'iso_local', 'space_separated')
    )
    .map(([d, format]) => {
      let input
      if (format === 'date') {
        input = d
      } else if (format === 'timestamp') {
        input = d.getTime()
      } else if (format === 'iso_local') {
        input = serializeTransactionDate(d)
      } else {
        // Space-separated calendar string "YYYY-MM-DD HH:mm:ss"
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        const h = String(d.getHours()).padStart(2, '0')
        const min = String(d.getMinutes()).padStart(2, '0')
        const sec = String(d.getSeconds()).padStart(2, '0')
        input = `${y}-${m}-${day} ${h}:${min}:${sec}`
      }
      return { baseDate: d, input, format }
    })

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 3 (Sub-check C): Polymorphic Input Serialization and Deserialization',
    fc.property(arbPolymorphicInput, ({ baseDate, input, format }) => {
      polyCount++

      // Deserializing polymorphic input
      const deserialized = deserializeTransactionDate(input)

      assert.equal(
        deserialized.getFullYear(),
        baseDate.getFullYear(),
        `Polymorphic input (${format}) year mismatch`
      )
      assert.equal(
        deserialized.getMonth(),
        baseDate.getMonth(),
        `Polymorphic input (${format}) month mismatch`
      )
      assert.equal(
        deserialized.getDate(),
        baseDate.getDate(),
        `Polymorphic input (${format}) date mismatch`
      )
      assert.equal(
        deserialized.getHours(),
        baseDate.getHours(),
        `Polymorphic input (${format}) hour mismatch`
      )
      assert.equal(
        deserialized.getMinutes(),
        baseDate.getMinutes(),
        `Polymorphic input (${format}) minute mismatch`
      )

      // Serializing polymorphic input
      const serialized = serializeTransactionDate(input)
      assert.equal(
        serialized,
        serializeTransactionDate(baseDate),
        `Polymorphic serialization (${format}) should equal canonical serialization`
      )

      return true
    }),
    { numRuns: 100 }
  )

  assert.ok(polyCount >= MIN_PBT_RUNS)
}

// ── Concrete Calendar Edge Cases ────────────────────────────────────────────────
{
  console.log('Validating concrete calendar edge cases...')

  const edgeCases = [
    // Leap days
    new Date(2000, 1, 29, 12, 0, 0),
    new Date(2004, 1, 29, 23, 59, 59),
    new Date(2020, 1, 29, 0, 0, 0),
    new Date(2024, 1, 29, 0, 15, 30),
    new Date(2048, 1, 29, 18, 45, 0),
    // Month boundaries
    new Date(2025, 0, 31, 23, 59, 59), // 31 Jan
    new Date(2025, 1, 28, 23, 59, 59), // 28 Feb non-leap
    new Date(2025, 2, 31, 0, 0, 0),    // 31 Mar
    new Date(2025, 3, 30, 12, 0, 0),   // 30 Apr
    // Year rollover
    new Date(2026, 11, 31, 23, 59, 59), // 31 Dec 2026
    new Date(2027, 0, 1, 0, 0, 0),      // 1 Jan 2027
  ]

  for (const edgeDate of edgeCases) {
    const s = serializeTransactionDate(edgeDate)
    const revived = deserializeTransactionDate(s)

    assert.equal(revived.getFullYear(), edgeDate.getFullYear())
    assert.equal(revived.getMonth(), edgeDate.getMonth())
    assert.equal(revived.getDate(), edgeDate.getDate())
    assert.equal(revived.getHours(), edgeDate.getHours())
    assert.equal(revived.getMinutes(), edgeDate.getMinutes())
    assert.equal(revived.getSeconds(), edgeDate.getSeconds())
  }

  console.log('✓ Concrete calendar edge cases verified')
}

console.log('\n✅ Property 3 PBT for Transaction Date Round-Trip & Timezone Invariance PASSED! (>= 100 iterations verified)\n')
