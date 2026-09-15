/**
 * Unit Tests for Phase P1: Transaction Date & Time Visibility and Conversions (lib/parser.ts)
 */

import assert from 'node:assert/strict'
import {
  formatTransactionDateTime,
  toCalendarDateString,
  toTimeString,
  toTransactionDateParts,
  fromCalendarDateTimeStrings,
  formatIDR,
  formatIDRCompact,
  formatIDRShort,
} from '../lib/parser.ts'

console.log('=== Testing Phase P1: Date-Time Formatting and Timezone-Immune Conversions ===\n')

// ── Group 1: formatTransactionDateTime (Today vs Past) ──────────────────────
{
  const refNow = new Date(2026, 8, 13, 16, 0) // 13 Sep 2026 16:00

  // 1a. Current calendar day returns "Hari ini • HH.mm"
  const todayTx = new Date(2026, 8, 13, 14, 30)
  assert.equal(
    formatTransactionDateTime(todayTx, refNow),
    'Hari ini • 14.30',
    'Today transaction should format as "Hari ini • 14.30"'
  )

  // 1b. Today morning
  const todayMorning = new Date(2026, 8, 13, 8, 5)
  assert.equal(
    formatTransactionDateTime(todayMorning, refNow),
    'Hari ini • 08.05',
    'Today morning transaction with zero-padded minutes'
  )

  // 1c. Past calendar day returns "DD MMM YYYY • HH.mm"
  const pastTx = new Date(2026, 8, 12, 9, 15)
  assert.equal(
    formatTransactionDateTime(pastTx, refNow),
    '12 Sep 2026 • 09.15',
    'Past transaction on 12 Sep 2026'
  )

  // 1d. Another past day with single digit day
  const singleDigitDay = new Date(2026, 8, 5, 20, 45)
  assert.equal(
    formatTransactionDateTime(singleDigitDay, refNow),
    '5 Sep 2026 • 20.45',
    'Past transaction on 5 Sep 2026'
  )

  // 1e. Different year and month
  const oldTx = new Date(2024, 0, 1, 0, 0)
  assert.equal(
    formatTransactionDateTime(oldTx, refNow),
    '1 Jan 2024 • 00.00',
    'Past transaction on 1 Jan 2024'
  )

  // 1f. String input handling (today)
  assert.equal(
    formatTransactionDateTime('2026-09-13T14:30:00', refNow),
    'Hari ini • 14.30',
    'String ISO input matching today'
  )

  // 1g. String input handling (past)
  assert.equal(
    formatTransactionDateTime('2026-09-10T11:20:00', refNow),
    '10 Sep 2026 • 11.20',
    'String ISO input matching past date'
  )

  // 1h. Numeric timestamp input
  assert.equal(
    formatTransactionDateTime(todayTx.getTime(), refNow),
    'Hari ini • 14.30',
    'Epoch timestamp input'
  )

  // 1i. Invalid date falls back safely without throw
  const invalidResult = formatTransactionDateTime('invalid-date', refNow)
  assert.ok(
    invalidResult.startsWith('Hari ini •') || /^\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\s+•\s+\d{2}\.\d{2}$/.test(invalidResult),
    'Invalid date input falls back gracefully to a valid formatted string'
  )

  console.log('✓ Group 1: formatTransactionDateTime tests passed')
}

// ── Group 2: toCalendarDateString, toTimeString, toTransactionDateParts ──────
{
  const d = new Date(2026, 8, 13, 14, 30, 45)

  assert.equal(toCalendarDateString(d), '2026-09-13', 'toCalendarDateString format YYYY-MM-DD')
  assert.equal(toTimeString(d), '14:30', 'toTimeString format HH:mm')

  const parts = toTransactionDateParts(d)
  assert.equal(parts.year, 2026)
  assert.equal(parts.month, 9)
  assert.equal(parts.day, 13)
  assert.equal(parts.hours, 14)
  assert.equal(parts.minutes, 30)

  // Single digit month and day zero-padding check
  const dEarly = new Date(2025, 0, 5, 8, 4)
  assert.equal(toCalendarDateString(dEarly), '2025-01-05', 'Zero-padded month and day')
  assert.equal(toTimeString(dEarly), '08:04', 'Zero-padded hours and minutes')

  // Fallback on invalid Date
  assert.equal(typeof toCalendarDateString(new Date(NaN)), 'string')
  assert.equal(typeof toTimeString(new Date(NaN)), 'string')

  console.log('✓ Group 2: toCalendarDateString, toTimeString, and toTransactionDateParts tests passed')
}

// ── Group 3: fromCalendarDateTimeStrings and Timezone Round-Trip ─────────────
{
  // 3a. Separate date and time strings
  const d1 = fromCalendarDateTimeStrings('2026-09-13', '14:30')
  assert.equal(d1.getFullYear(), 2026)
  assert.equal(d1.getMonth(), 8)
  assert.equal(d1.getDate(), 13)
  assert.equal(d1.getHours(), 14)
  assert.equal(d1.getMinutes(), 30)

  // 3b. Time string with period separator ("14.30")
  const d2 = fromCalendarDateTimeStrings('2026-09-13', '14.30')
  assert.equal(d2.getHours(), 14)
  assert.equal(d2.getMinutes(), 30)

  // 3c. Combined ISO-like datetime string
  const d3 = fromCalendarDateTimeStrings('2026-09-13T14:30:00')
  assert.equal(d3.getFullYear(), 2026)
  assert.equal(d3.getMonth(), 8)
  assert.equal(d3.getDate(), 13)
  assert.equal(d3.getHours(), 14)
  assert.equal(d3.getMinutes(), 30)

  // 3d. Date only defaults to 00:00
  const d4 = fromCalendarDateTimeStrings('2026-09-13')
  assert.equal(d4.getFullYear(), 2026)
  assert.equal(d4.getMonth(), 8)
  assert.equal(d4.getDate(), 13)
  assert.equal(d4.getHours(), 0)
  assert.equal(d4.getMinutes(), 0)

  // 3e. Invariance across multiple randomized calendar dates (2000 - 2050)
  for (let y = 2000; y <= 2050; y += 5) {
    for (let m = 0; m < 12; m += 3) {
      const day = 15
      const h = 10
      const min = 45
      const orig = new Date(y, m, day, h, min, 0, 0)
      const calStr = toCalendarDateString(orig)
      const timeStr = toTimeString(orig)
      const restored = fromCalendarDateTimeStrings(calStr, timeStr)

      assert.equal(restored.getFullYear(), y, `Year round-trip for ${y}`)
      assert.equal(restored.getMonth(), m, `Month round-trip for ${m}`)
      assert.equal(restored.getDate(), day, `Day round-trip for ${day}`)
      assert.equal(restored.getHours(), h, `Hours round-trip for ${h}`)
      assert.equal(restored.getMinutes(), min, `Minutes round-trip for ${min}`)
    }
  }

  // 3f. Edge cases: invalid string
  const dInvalid = fromCalendarDateTimeStrings('not-a-date')
  assert.ok(dInvalid instanceof Date && !Number.isNaN(dInvalid.getTime()))

  console.log('✓ Group 3: fromCalendarDateTimeStrings and Round-Trip tests passed')
}

// ── Group 4: formatIDR Full Nominal Display (No Abbreviations) ───────────────
{
  // 4a. Basic values
  assert.match(formatIDR(0), /^Rp[\s\u00a0]0$/)
  assert.match(formatIDR(25000), /^Rp[\s\u00a0]25\.000$/)
  assert.match(formatIDR(1500000), /^Rp[\s\u00a0]1\.500\.000$/)
  assert.match(formatIDR(1000000000), /^Rp[\s\u00a0]1\.000\.000\.000$/)

  // 4b. Verify absence of abbreviation suffixes (K, k, JT, jt, M, m)
  for (const amt of [500, 1000, 25000, 50000, 100000, 1200000, 50000000, 1000000000]) {
    const formatted = formatIDR(amt)
    assert.equal(/[KkJtMmbB]/.test(formatted), false, `No abbreviation suffix in ${formatted}`)
    assert.ok(formatted.startsWith('Rp'), `Prefix Rp in ${formatted}`)
  }

  // 4c. formatIDRCompact does not abbreviate
  assert.equal(formatIDRCompact(25000), formatIDR(25000))
  assert.equal(formatIDRCompact(1500000), formatIDR(1500000))

  // 4d. formatIDRShort preserves full digits without prefix
  assert.equal(formatIDRShort(25000), '25.000')
  assert.equal(formatIDRShort(1500000), '1.500.000')

  console.log('✓ Group 4: formatIDR full nominal display tests passed')
}

console.log('\nAll Phase P1 date-time & currency tests PASSED! ✅')
