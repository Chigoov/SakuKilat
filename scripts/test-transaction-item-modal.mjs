/**
 * SakuKilat — Unit & Integration Tests for Task 2.4:
 * Transaction Date-Time Visibility, Edit Modal Date Accuracy, and Uncompressed Nominals
 *
 * Requirements:
 * - 1.1: Past transactions formatted as "DD MMM YYYY • HH.mm"
 * - 1.2: Current calendar day transactions formatted as "Hari ini • HH.mm"
 * - 1.3: Full nominal currency amount without truncation or abbreviation
 * - 1.5: Edit modal populates exact calendar date and time previously stored
 */

import assert from 'node:assert/strict'
import {
  formatTransactionDateTime,
  formatIDR,
  toCalendarDateString,
  toTimeString,
  fromCalendarDateTimeStrings,
} from '../lib/parser.ts'

console.log('=== Testing Task 2.4: Transaction Item & Edit Modal Date-Time & Nominals ===\n')

// ── Group 1: Transaction List Date-Time Formatting (Req 1.1, 1.2) ───────────
{
  const refNow = new Date(2026, 8, 13, 15, 30) // 13 Sep 2026 15:30 local time

  // 1a. Current day transaction -> "Hari ini • HH.mm"
  const todayMorning = new Date(2026, 8, 13, 9, 5)
  const formattedToday = formatTransactionDateTime(todayMorning, refNow)
  assert.equal(formattedToday, 'Hari ini • 09.05', 'Today morning formatted with Hari ini and zero-padded minute')

  const todayEvening = new Date(2026, 8, 13, 21, 45)
  assert.equal(formatTransactionDateTime(todayEvening, refNow), 'Hari ini • 21.45')

  // 1b. Past day transaction -> "DD MMM YYYY • HH.mm"
  const yesterday = new Date(2026, 8, 12, 14, 20)
  assert.equal(formatTransactionDateTime(yesterday, refNow), '12 Sep 2026 • 14.20')

  const lastMonth = new Date(2026, 7, 25, 8, 0)
  assert.equal(formatTransactionDateTime(lastMonth, refNow), '25 Agu 2026 • 08.00')

  const lastYear = new Date(2025, 0, 1, 23, 59)
  assert.equal(formatTransactionDateTime(lastYear, refNow), '1 Jan 2025 • 23.59')

  // 1c. String input ISO representation
  assert.equal(formatTransactionDateTime('2026-09-13T10:15:00', refNow), 'Hari ini • 10.15')
  assert.equal(formatTransactionDateTime('2026-09-08T16:40:00', refNow), '8 Sep 2026 • 16.40')

  // 1d. Numeric timestamp representation
  assert.equal(formatTransactionDateTime(todayMorning.getTime(), refNow), 'Hari ini • 09.05')

  console.log('✓ Group 1: Transaction list date-time formatting (Req 1.1, 1.2) passed')
}

// ── Group 2: Uncompressed Full Nominal Display (Req 1.3) ─────────────────────
{
  const testAmounts = [
    { amount: 0, expectedPattern: /^Rp[\s\u00a0]0$/ },
    { amount: 500, expectedPattern: /^Rp[\s\u00a0]500$/ },
    { amount: 1000, expectedPattern: /^Rp[\s\u00a0]1\.000$/ },
    { amount: 25000, expectedPattern: /^Rp[\s\u00a0]25\.000$/ },
    { amount: 150000, expectedPattern: /^Rp[\s\u00a0]150\.000$/ },
    { amount: 1850000, expectedPattern: /^Rp[\s\u00a0]1\.850\.000$/ },
    { amount: 50000000, expectedPattern: /^Rp[\s\u00a0]50\.000\.000$/ },
    { amount: 1250000000, expectedPattern: /^Rp[\s\u00a0]1\.250\.000\.000$/ },
  ]

  for (const { amount, expectedPattern } of testAmounts) {
    const formatted = formatIDR(amount)
    assert.match(formatted, expectedPattern, `Amount ${amount} should match ${expectedPattern}`)

    // Requirement 1.3: SHALL NOT contain abbreviation suffixes such as K, k, JT, jt, M, m
    assert.equal(
      /[KkJtMmbB]/.test(formatted),
      false,
      `Full nominal MUST NOT contain abbreviations like K or JT: ${formatted}`
    )
  }

  // Check transaction item signed amount formatting
  const expenseNominal = `-` + formatIDR(25000)
  assert.match(expenseNominal, /^-Rp[\s\u00a0]25\.000$/)

  const incomeNominal = `+` + formatIDR(8500000)
  assert.match(incomeNominal, /^\+Rp[\s\u00a0]8\.500\.000$/)

  const moveNominal = formatIDR(500000)
  assert.match(moveNominal, /^Rp[\s\u00a0]500\.000$/)

  console.log('✓ Group 2: Full nominal currency display without abbreviations (Req 1.3) passed')
}

// ── Group 3: Edit Modal Date-Time Population and Invariance (Req 1.5) ────────
{
  // Test the exact helper logic used in EditTransactionModal:
  // dateInputValue, timeInputValue, combineDateTime

  function dateInputValue(date) {
    return toCalendarDateString(date)
  }

  function timeInputValue(date) {
    return toTimeString(date)
  }

  function combineDateTime(dateStr, timeStr, fallback) {
    const fbDate = fallback instanceof Date
      ? (!Number.isNaN(fallback.getTime()) ? fallback : new Date())
      : typeof fallback === 'string'
        ? fromCalendarDateTimeStrings(fallback)
        : typeof fallback === 'number'
          ? new Date(fallback)
          : new Date()

    if (
      dateStr === toCalendarDateString(fbDate) &&
      timeStr === toTimeString(fbDate)
    ) {
      return new Date(fbDate.getTime())
    }
    const parsed = fromCalendarDateTimeStrings(dateStr, timeStr)
    return Number.isNaN(parsed.getTime()) ? new Date(fbDate.getTime()) : parsed
  }

  // 3a. Exact Date population in edit modal form inputs
  const storedTxDate = new Date(2026, 8, 13, 14, 30, 45, 123)
  const populatedDateInput = dateInputValue(storedTxDate)
  const populatedTimeInput = timeInputValue(storedTxDate)

  assert.equal(populatedDateInput, '2026-09-13', 'Modal date input must populate YYYY-MM-DD exactly')
  assert.equal(populatedTimeInput, '14:30', 'Modal time input must populate HH:mm exactly')

  // 3b. When saved without date/time changes, original exact Date is preserved (including seconds/ms)
  const savedUnchanged = combineDateTime(populatedDateInput, populatedTimeInput, storedTxDate)
  assert.equal(savedUnchanged.getTime(), storedTxDate.getTime(), 'Preserves exact timestamp when unedited')

  // 3c. When user modifies date to another calendar day
  const modifiedDate = '2026-09-15'
  const savedNewDate = combineDateTime(modifiedDate, populatedTimeInput, storedTxDate)
  assert.equal(savedNewDate.getFullYear(), 2026)
  assert.equal(savedNewDate.getMonth(), 8) // Sep (0-indexed)
  assert.equal(savedNewDate.getDate(), 15)
  assert.equal(savedNewDate.getHours(), 14)
  assert.equal(savedNewDate.getMinutes(), 30)

  // 3d. When user modifies time
  const modifiedTime = '08:15'
  const savedNewTime = combineDateTime(populatedDateInput, modifiedTime, storedTxDate)
  assert.equal(savedNewTime.getFullYear(), 2026)
  assert.equal(savedNewTime.getMonth(), 8)
  assert.equal(savedNewTime.getDate(), 13)
  assert.equal(savedNewTime.getHours(), 8)
  assert.equal(savedNewTime.getMinutes(), 15)

  // 3e. String date handling (backward compatibility when transaction has ISO string)
  const stringTxDate = '2026-09-13T14:30:00'
  assert.equal(dateInputValue(stringTxDate), '2026-09-13')
  assert.equal(timeInputValue(stringTxDate), '14:30')

  const savedFromString = combineDateTime('2026-09-13', '14:30', stringTxDate)
  assert.equal(savedFromString.getFullYear(), 2026)
  assert.equal(savedFromString.getMonth(), 8)
  assert.equal(savedFromString.getDate(), 13)
  assert.equal(savedFromString.getHours(), 14)
  assert.equal(savedFromString.getMinutes(), 30)

  // 3f. Quick Date actions: Hari Ini and Kemarin
  const now = new Date(2026, 8, 13, 12, 0)
  const todayVal = dateInputValue(now)
  assert.equal(todayVal, '2026-09-13')

  const yesterdayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  const yesterdayVal = dateInputValue(yesterdayDate)
  assert.equal(yesterdayVal, '2026-09-12')

  console.log('✓ Group 3: Edit modal date-time population and preservation (Req 1.5) passed')
}

// ── Group 4: Timezone Shift Immunity Across Calendar Boundaries ─────────────
{
  // Test across month boundaries, leap years, and year transitions
  const boundaryCases = [
    { date: new Date(2024, 1, 29, 23, 59), expectedDate: '2024-02-29', expectedTime: '23:59' }, // Leap year
    { date: new Date(2026, 0, 1, 0, 1), expectedDate: '2026-01-01', expectedTime: '00:01' },   // Year start midnight
    { date: new Date(2026, 11, 31, 23, 59), expectedDate: '2026-12-31', expectedTime: '23:59' }, // Year end
    { date: new Date(2026, 3, 30, 12, 0), expectedDate: '2026-04-30', expectedTime: '12:00' },   // End of April
  ]

  for (const { date, expectedDate, expectedTime } of boundaryCases) {
    const calStr = toCalendarDateString(date)
    const timeStr = toTimeString(date)
    assert.equal(calStr, expectedDate, `Calendar date for ${date}`)
    assert.equal(timeStr, expectedTime, `Time string for ${date}`)

    const roundTrip = fromCalendarDateTimeStrings(calStr, timeStr)
    assert.equal(roundTrip.getFullYear(), date.getFullYear())
    assert.equal(roundTrip.getMonth(), date.getMonth())
    assert.equal(roundTrip.getDate(), date.getDate())
    assert.equal(roundTrip.getHours(), date.getHours())
    assert.equal(roundTrip.getMinutes(), date.getMinutes())
  }

  console.log('✓ Group 4: Timezone shift immunity across calendar boundaries passed')
}

console.log('\n====================================================')
console.log('  ALL TASK 2.4 TRANSACTION ITEM & MODAL TESTS PASSED! ✅')
console.log('====================================================')
