/**
 * SakuKilat — Property-Based Test Suite for Phase P1: Transaction Date & Time Visibility
 *
 * Validates:
 * - Property 1: Transaction Date-Time Formatting (Today vs Past)
 *   Requirements: 1.1, 1.2
 *
 * Tag:
 * // Feature: sakukilat-core-roadmap, Property 1: Transaction Date-Time Formatting (Today vs Past)
 */

import assert from 'node:assert/strict'
import {
  fc,
  testProperty,
  MIN_PBT_RUNS,
  arbCalendarDate,
} from './pbt-harness.mjs'
import {
  formatTransactionDateTime,
  INDONESIAN_SHORT_MONTHS,
  toCalendarDateString,
  toTimeString,
} from '../lib/parser.ts'

console.log('====================================================')
console.log('  SAKUKILAT — PBT: TRANSACTION DATE-TIME FORMATTING ')
console.log('====================================================\n')

// Smart arbitrary generating balanced pairs of reference date (now) and transaction date (t)
// covering both same-day (Today) and different-day (Past/Future) across multiple input forms.
const arbDatePairWithMode = fc.tuple(
  arbCalendarDate, // base reference date (now)
  fc.boolean(),    // isSameDay flag (guarantees ~50% same-day and ~50% different-day)
  fc.integer({ min: -18000, max: 18000 }), // day offset if not same day
  fc.integer({ min: 0, max: 23 }), // hours for t
  fc.integer({ min: 0, max: 59 }), // minutes for t
  fc.integer({ min: 0, max: 59 }), // seconds for t
  fc.constantFrom('date', 'timestamp', 'string') // input representation polymorphism
).map(([baseNow, isSameDay, dayOffset, hours, minutes, seconds, inputType]) => {
  let tDate
  if (isSameDay) {
    tDate = new Date(baseNow.getFullYear(), baseNow.getMonth(), baseNow.getDate(), hours, minutes, seconds, 0)
  } else {
    const safeOffset = dayOffset === 0 ? (Math.random() < 0.5 ? -1 : 1) : dayOffset
    tDate = new Date(baseNow.getFullYear(), baseNow.getMonth(), baseNow.getDate() + safeOffset, hours, minutes, seconds, 0)
    // Guard against wrap-around to same day
    if (
      tDate.getFullYear() === baseNow.getFullYear() &&
      tDate.getMonth() === baseNow.getMonth() &&
      tDate.getDate() === baseNow.getDate()
    ) {
      tDate = new Date(baseNow.getFullYear() - 1, baseNow.getMonth(), baseNow.getDate(), hours, minutes, seconds, 0)
    }
  }

  let tInput
  if (inputType === 'date') {
    tInput = tDate
  } else if (inputType === 'timestamp') {
    tInput = tDate.getTime()
  } else {
    // String representation preserving calendar year, month, day, and time
    const y = tDate.getFullYear()
    const m = String(tDate.getMonth() + 1).padStart(2, '0')
    const d = String(tDate.getDate()).padStart(2, '0')
    const h = String(hours).padStart(2, '0')
    const min = String(minutes).padStart(2, '0')
    const sec = String(seconds).padStart(2, '0')
    tInput = `${y}-${m}-${d}T${h}:${min}:${sec}`
  }

  return { refNow: baseNow, tDate, tInput, isSameDay, inputType }
})

// Feature: sakukilat-core-roadmap, Property 1: Transaction Date-Time Formatting (Today vs Past)
{
  let totalEvaluated = 0
  let todayEvaluated = 0
  let pastEvaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 1: Transaction Date-Time Formatting (Today vs Past)',
    fc.property(arbDatePairWithMode, ({ refNow, tDate, tInput, isSameDay }) => {
      totalEvaluated++

      const formatted = formatTransactionDateTime(tInput, refNow)
      const expectedHH = String(tDate.getHours()).padStart(2, '0')
      const expectedMM = String(tDate.getMinutes()).padStart(2, '0')
      const expectedTimeStr = `${expectedHH}.${expectedMM}`

      if (isSameDay) {
        todayEvaluated++
        // Acceptance Criteria 2: WHERE a transaction occurred on the current calendar day,
        // THE Transaction_Date_Formatter SHALL display the string `Hari ini • HH.mm`.
        assert.ok(
          formatted.startsWith('Hari ini • '),
          `Expected same-day format to start with "Hari ini • ", got "${formatted}"`
        )
        assert.equal(
          formatted,
          `Hari ini • ${expectedTimeStr}`,
          `Expected exact "Hari ini • ${expectedTimeStr}", got "${formatted}"`
        )
        assert.match(
          formatted,
          /^Hari ini • \d{2}\.\d{2}$/,
          `Formatted string must match pattern "Hari ini • HH.mm"`
        )
      } else {
        pastEvaluated++
        // Acceptance Criteria 1: WHEN rendering any transaction item in the transaction list,
        // THE Transaction_Date_Formatter SHALL display the calendar date and time in the format
        // `DD MMM YYYY • HH.mm` for past transactions.
        const expectedDay = tDate.getDate()
        const expectedMonthStr = INDONESIAN_SHORT_MONTHS[tDate.getMonth()]
        const expectedYear = tDate.getFullYear()
        const expectedPastStr = `${expectedDay} ${expectedMonthStr} ${expectedYear} • ${expectedTimeStr}`

        assert.ok(
          !formatted.startsWith('Hari ini • '),
          `Expected different-day format NOT to start with "Hari ini • ", got "${formatted}"`
        )
        assert.equal(
          formatted,
          expectedPastStr,
          `Expected exact "${expectedPastStr}", got "${formatted}"`
        )
        assert.match(
          formatted,
          /^\d{1,2}\s+(Jan|Feb|Mar|Apr|Mei|Jun|Jul|Agu|Sep|Okt|Nov|Des)\s+\d{4}\s+•\s+\d{2}\.\d{2}$/,
          `Formatted string must match pattern "D MMM YYYY • HH.mm"`
        )
      }

      return true
    }),
    { numRuns: 200 }
  )

  assert.ok(
    totalEvaluated >= MIN_PBT_RUNS,
    `Expected at least ${MIN_PBT_RUNS} runs, evaluated ${totalEvaluated}`
  )
  assert.ok(
    todayEvaluated > 0,
    `Expected same-day branch to be tested, got ${todayEvaluated} cases`
  )
  assert.ok(
    pastEvaluated > 0,
    `Expected different-day branch to be tested, got ${pastEvaluated} cases`
  )
  console.log(`    Coverage breakdown: ${todayEvaluated} today cases, ${pastEvaluated} past/other cases.`)
}

// Feature: sakukilat-core-roadmap, Property 1 (Sub-check A): Same-Day Transactions (Hari ini)
{
  let sameDayRuns = 0
  const arbSameDay = fc.tuple(
    arbCalendarDate,
    fc.integer({ min: 0, max: 23 }),
    fc.integer({ min: 0, max: 59 })
  ).map(([now, hours, minutes]) => {
    const t = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0)
    return { now, t, hours, minutes }
  })

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 1 (Sub-check A): Same-Day Transactions (Hari ini)',
    fc.property(arbSameDay, ({ now, t, hours, minutes }) => {
      sameDayRuns++
      const res = formatTransactionDateTime(t, now)
      const expectedTime = `${String(hours).padStart(2, '0')}.${String(minutes).padStart(2, '0')}`
      return res === `Hari ini • ${expectedTime}`
    }),
    { numRuns: 100 }
  )

  assert.ok(sameDayRuns >= MIN_PBT_RUNS)
}

// Feature: sakukilat-core-roadmap, Property 1 (Sub-check B): Past and Different-Day Transactions
{
  let pastRuns = 0
  const arbPastDate = fc.tuple(
    arbCalendarDate,
    fc.integer({ min: 1, max: 10000 }), // positive days in past
    fc.integer({ min: 0, max: 23 }),
    fc.integer({ min: 0, max: 59 })
  ).map(([now, daysAgo, hours, minutes]) => {
    const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, hours, minutes, 0, 0)
    return { now, t, hours, minutes }
  })

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 1 (Sub-check B): Past and Different-Day Transactions',
    fc.property(arbPastDate, ({ now, t, hours, minutes }) => {
      pastRuns++
      const res = formatTransactionDateTime(t, now)
      const expectedTime = `${String(hours).padStart(2, '0')}.${String(minutes).padStart(2, '0')}`
      const expectedStr = `${t.getDate()} ${INDONESIAN_SHORT_MONTHS[t.getMonth()]} ${t.getFullYear()} • ${expectedTime}`
      return res === expectedStr && !res.startsWith('Hari ini •')
    }),
    { numRuns: 100 }
  )

  assert.ok(pastRuns >= MIN_PBT_RUNS)
}

console.log('✅ Property 1 (Transaction Date-Time Formatting) PASSED all invariants with >= 100 iterations each!\n')
