/**
 * SakuKilat — Property-Based Test Suite for Recurring Bill Next Due Date Calculation
 *
 * Feature: sakukilat-core-roadmap, Property 13: Recurring Bill Next Due Date Calculation
 * Validates: Requirements 5.2
 *
 * Property 13:
 * For any recurring bill with a defined period (weekly, monthly, annually) and any
 * reference date D, the computed nextDueDate SHALL be a valid calendar date strictly
 * greater than D, matching the exact recurrence period interval.
 */

import assert from 'node:assert/strict'
import {
  fc,
  testProperty,
  MIN_PBT_RUNS,
  arbCalendarDate,
} from './pbt-harness.mjs'
import {
  computeNextDueDate,
  advanceBillDueDate,
  createBill,
  getDaysInMonth,
  calendarDaysBetween,
  toMidnightDate,
} from '../lib/bills.ts'
import {
  toCalendarDateString,
  toTransactionDateParts,
} from '../lib/parser.ts'

console.log('====================================================')
console.log('  SAKUKILAT — PBT: RECURRING BILL NEXT DUE DATE     ')
console.log('====================================================\n')

// Regex validating calendar date format YYYY-MM-DD
const ISO_CALENDAR_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

/**
 * Arbitrary calendar date between years 2000 and 2050
 * supporting Date object, ISO date string, ISO datetime string, and timestamp number.
 */
const arbReferenceDateWithFormat = fc.tuple(
  fc.integer({ min: 2000, max: 2050 }),
  fc.integer({ min: 1, max: 12 }),
  fc.integer({ min: 1, max: 31 }),
  fc.integer({ min: 0, max: 23 }),
  fc.integer({ min: 0, max: 59 }),
  fc.constantFrom('date', 'iso-date', 'iso-datetime', 'timestamp')
).filter(([year, month, day]) => {
  return day <= getDaysInMonth(year, month)
}).map(([year, month, day, hours, minutes, format]) => {
  const d = new Date(year, month - 1, day, hours, minutes, 0, 0)
  const yStr = String(year)
  const mStr = String(month).padStart(2, '0')
  const dStr = String(day).padStart(2, '0')
  const hStr = String(hours).padStart(2, '0')
  const minStr = String(minutes).padStart(2, '0')

  if (format === 'date') return d
  if (format === 'iso-date') return `${yStr}-${mStr}-${dStr}`
  if (format === 'iso-datetime') return `${yStr}-${mStr}-${dStr}T${hStr}:${minStr}:00`
  return d.getTime()
})

/**
 * Arbitrary recurrence parameters covering weekly, monthly, and annually.
 */
const arbRecurrenceParams = fc.oneof(
  // Weekly: dueDay 0 to 7 (0 and 7 represent Sunday, 1..6 represent Mon..Sat)
  fc.record({
    recurrence: fc.constant('weekly'),
    dueDay: fc.integer({ min: 0, max: 7 }),
    dueMonth: fc.constant(undefined),
  }),
  // Monthly: dueDay 1 to 31 (including boundary days 28, 29, 30, 31)
  fc.record({
    recurrence: fc.constant('monthly'),
    dueDay: fc.integer({ min: 1, max: 31 }),
    dueMonth: fc.constant(undefined),
  }),
  // Annually: dueDay 1 to 31, dueMonth 1 to 12
  fc.record({
    recurrence: fc.constant('annually'),
    dueDay: fc.integer({ min: 1, max: 31 }),
    dueMonth: fc.integer({ min: 1, max: 12 }),
  })
)

// ── Feature: sakukilat-core-roadmap, Property 13: Recurring Bill Next Due Date Calculation ──
// Validates: Requirements 5.2
{
  let totalEvaluated = 0
  let weeklyEvaluated = 0
  let monthlyEvaluated = 0
  let annuallyEvaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 13: Recurring Bill Next Due Date Calculation',
    fc.property(
      arbReferenceDateWithFormat,
      arbRecurrenceParams,
      (refInput, { recurrence, dueDay, dueMonth }) => {
        totalEvaluated++
        if (recurrence === 'weekly') weeklyEvaluated++
        else if (recurrence === 'monthly') monthlyEvaluated++
        else annuallyEvaluated++

        const refParts = toTransactionDateParts(refInput)
        const refDateStr = toCalendarDateString(refInput)

        // Compute next due date
        const options = dueMonth !== undefined ? { dueMonth } : undefined
        const nextDueDate = computeNextDueDate(recurrence, dueDay, refInput, options)

        // 1. Invariant: Valid Calendar Date Format
        assert.match(
          nextDueDate,
          ISO_CALENDAR_DATE_REGEX,
          `Expected YYYY-MM-DD format, got: ${nextDueDate}`
        )

        const nextParts = toTransactionDateParts(nextDueDate)
        const daysInNextMonth = getDaysInMonth(nextParts.year, nextParts.month)
        assert.ok(
          nextParts.month >= 1 && nextParts.month <= 12,
          `Month must be between 1 and 12, got ${nextParts.month}`
        )
        assert.ok(
          nextParts.day >= 1 && nextParts.day <= daysInNextMonth,
          `Day ${nextParts.day} exceeds days in month ${nextParts.month}/${nextParts.year} (${daysInNextMonth})`
        )

        // 2. Invariant: Strictly Greater Than Reference Date
        assert.ok(
          nextDueDate > refDateStr,
          `nextDueDate (${nextDueDate}) must be strictly greater than reference date (${refDateStr})`
        )

        const daysDiff = calendarDaysBetween(refInput, nextDueDate)
        assert.ok(
          daysDiff >= 1,
          `Calendar days difference must be >= 1, got ${daysDiff} (ref: ${refDateStr}, next: ${nextDueDate})`
        )

        // 3. Invariant: Recurrence Period Interval Matching
        if (recurrence === 'weekly') {
          // Weekly: must be within 1 to 7 calendar days
          assert.ok(
            daysDiff >= 1 && daysDiff <= 7,
            `Weekly next due date must be 1 to 7 days ahead, got ${daysDiff}`
          )

          // Target ISO day of week (1=Mon..7=Sun)
          let targetIso = Math.round(dueDay)
          if (targetIso === 0) targetIso = 7
          targetIso = Math.max(1, Math.min(7, targetIso))

          const nextDateObj = toMidnightDate(nextDueDate)
          const nextIso = nextDateObj.getDay() === 0 ? 7 : nextDateObj.getDay()
          assert.equal(
            nextIso,
            targetIso,
            `Weekly day of week mismatch: expected ISO day ${targetIso}, got ${nextIso}`
          )

          // If reference date is on target day, next due date must be exactly 7 days ahead
          const refDateObj = toMidnightDate(refInput)
          const refIso = refDateObj.getDay() === 0 ? 7 : refDateObj.getDay()
          if (refIso === targetIso) {
            assert.equal(
              daysDiff,
              7,
              `When reference day matches target day, next weekly date must be exactly 7 days later`
            )
          }
        } else if (recurrence === 'monthly') {
          const rawDay = Math.max(1, Math.min(31, Math.round(dueDay)))
          const daysThisMonth = getDaysInMonth(refParts.year, refParts.month)
          const clampedThisMonth = Math.min(rawDay, daysThisMonth)

          if (clampedThisMonth > refParts.day) {
            // Falls in the same month
            assert.equal(nextParts.year, refParts.year, 'Must be in the same year')
            assert.equal(nextParts.month, refParts.month, 'Must be in the same month')
            assert.equal(nextParts.day, clampedThisMonth, 'Day must match clamped target day')
          } else {
            // Advances to the following month
            const expectedNextMonth = refParts.month === 12 ? 1 : refParts.month + 1
            const expectedNextYear = refParts.month === 12 ? refParts.year + 1 : refParts.year
            const daysInExpected = getDaysInMonth(expectedNextYear, expectedNextMonth)
            const clampedNextMonth = Math.min(rawDay, daysInExpected)

            assert.equal(nextParts.year, expectedNextYear, 'Must advance to expected next year')
            assert.equal(nextParts.month, expectedNextMonth, 'Must advance to expected next month')
            assert.equal(nextParts.day, clampedNextMonth, 'Day must match clamped target day in next month')
          }
        } else if (recurrence === 'annually') {
          const rawDay = Math.max(1, Math.min(31, Math.round(dueDay)))
          const targetMonth = dueMonth !== undefined ? Math.max(1, Math.min(12, Math.round(dueMonth))) : refParts.month
          const daysInTargetThisYear = getDaysInMonth(refParts.year, targetMonth)
          const clampedThisYear = Math.min(rawDay, daysInTargetThisYear)

          // Check if candidate date in current year is strictly in the future
          const candidateIsFuture =
            targetMonth > refParts.month ||
            (targetMonth === refParts.month && clampedThisYear > refParts.day)

          if (candidateIsFuture) {
            assert.equal(nextParts.year, refParts.year, 'Annual bill must stay in current year')
            assert.equal(nextParts.month, targetMonth, 'Annual bill month must match target month')
            assert.equal(nextParts.day, clampedThisYear, 'Annual bill day must match clamped day')
          } else {
            const expectedYear = refParts.year + 1
            const daysInTargetNextYear = getDaysInMonth(expectedYear, targetMonth)
            const clampedNextYear = Math.min(rawDay, daysInTargetNextYear)

            assert.equal(nextParts.year, expectedYear, 'Annual bill must advance to next year')
            assert.equal(nextParts.month, targetMonth, 'Annual bill month must match target month')
            assert.equal(nextParts.day, clampedNextYear, 'Annual bill day must match clamped day in next year')
          }
        }

        return true
      }
    ),
    { numRuns: 200 }
  )

  console.log(
    `    Recurrence coverage: ${weeklyEvaluated} weekly, ${monthlyEvaluated} monthly, ${annuallyEvaluated} annually.\n`
  )
}

// ── Sub-Property 13A: Weekly Recurrence Specific Invariants ────────────────
{
  testProperty(
    'Feature: sakukilat-core-roadmap, Property 13 (Sub-check A): Weekly Recurrence Specific Invariants',
    fc.property(
      arbReferenceDateWithFormat,
      fc.integer({ min: 0, max: 7 }),
      (refInput, dueDay) => {
        const refStr = toCalendarDateString(refInput)
        const nextDueDate = computeNextDueDate('weekly', dueDay, refInput)

        assert.ok(nextDueDate > refStr, 'Must be strictly greater than reference date')

        const daysDiff = calendarDaysBetween(refInput, nextDueDate)
        assert.ok(daysDiff >= 1 && daysDiff <= 7, `Weekly diff must be between 1 and 7, got ${daysDiff}`)

        let targetIso = Math.round(dueDay)
        if (targetIso === 0) targetIso = 7
        targetIso = Math.max(1, Math.min(7, targetIso))

        const nextDate = toMidnightDate(nextDueDate)
        const nextIso = nextDate.getDay() === 0 ? 7 : nextDate.getDay()
        assert.equal(nextIso, targetIso, `ISO day must match target ${targetIso}`)

        return true
      }
    ),
    { numRuns: 100 }
  )
}

// ── Sub-Property 13B: Monthly Recurrence Invariants & Month-End Clamping ───
{
  testProperty(
    'Feature: sakukilat-core-roadmap, Property 13 (Sub-check B): Monthly Recurrence Invariants & Month-End Clamping',
    fc.property(
      arbReferenceDateWithFormat,
      fc.integer({ min: 1, max: 31 }),
      (refInput, dueDay) => {
        const refStr = toCalendarDateString(refInput)
        const refParts = toTransactionDateParts(refInput)
        const nextDueDate = computeNextDueDate('monthly', dueDay, refInput)

        assert.ok(nextDueDate > refStr, 'Must be strictly greater than reference date')

        const nextParts = toTransactionDateParts(nextDueDate)
        const daysInNextMonth = getDaysInMonth(nextParts.year, nextParts.month)
        const rawDay = Math.max(1, Math.min(31, Math.round(dueDay)))

        // Day must never exceed actual days in destination month
        assert.ok(nextParts.day <= daysInNextMonth, 'Must clamp to days in month')
        // Day must equal min(rawDay, daysInNextMonth)
        assert.equal(nextParts.day, Math.min(rawDay, daysInNextMonth), 'Must clamp correctly')

        // Must be either current month or next month
        const monthDiff =
          (nextParts.year - refParts.year) * 12 + (nextParts.month - refParts.month)
        assert.ok(monthDiff === 0 || monthDiff === 1, `Month difference must be 0 or 1, got ${monthDiff}`)

        return true
      }
    ),
    { numRuns: 100 }
  )
}

// ── Sub-Property 13C: Annual Recurrence Invariants ─────────────────────────
{
  testProperty(
    'Feature: sakukilat-core-roadmap, Property 13 (Sub-check C): Annual Recurrence Invariants',
    fc.property(
      arbReferenceDateWithFormat,
      fc.integer({ min: 1, max: 31 }),
      fc.integer({ min: 1, max: 12 }),
      (refInput, dueDay, dueMonth) => {
        const refStr = toCalendarDateString(refInput)
        const refParts = toTransactionDateParts(refInput)
        const nextDueDate = computeNextDueDate('annually', dueDay, refInput, { dueMonth })

        assert.ok(nextDueDate > refStr, 'Must be strictly greater than reference date')

        const nextParts = toTransactionDateParts(nextDueDate)
        assert.equal(nextParts.month, dueMonth, 'Month must match target annual month')

        const yearDiff = nextParts.year - refParts.year
        assert.ok(yearDiff === 0 || yearDiff === 1, `Year difference must be 0 or 1, got ${yearDiff}`)

        const daysInNextMonth = getDaysInMonth(nextParts.year, nextParts.month)
        const rawDay = Math.max(1, Math.min(31, Math.round(dueDay)))
        assert.equal(nextParts.day, Math.min(rawDay, daysInNextMonth), 'Must clamp to days in month')

        return true
      }
    ),
    { numRuns: 100 }
  )
}

// ── Sub-Property 13D: Monotonic Due Date Advancement with advanceBillDueDate ─
{
  testProperty(
    'Feature: sakukilat-core-roadmap, Property 13 (Sub-check D): Monotonic Due Date Advancement with advanceBillDueDate',
    fc.property(
      arbReferenceDateWithFormat,
      arbRecurrenceParams,
      (initialRefDate, { recurrence, dueDay, dueMonth }) => {
        // Create bill with initial computed nextDueDate
        const initialDueDate = computeNextDueDate(
          recurrence,
          dueDay,
          initialRefDate,
          dueMonth !== undefined ? { dueMonth } : undefined
        )

        const bill = createBill({
          name: 'Subscription Test',
          amount: 50000,
          categoryId: 'tagihan',
          paymentMethodId: 'bca',
          recurrence,
          dueDay,
          nextDueDate: initialDueDate,
          dueMonth,
        })

        // Successively advance due date 4 times
        let currentDueDate = bill.nextDueDate
        for (let step = 1; step <= 4; step++) {
          const nextDate = advanceBillDueDate({ ...bill, nextDueDate: currentDueDate })

          assert.match(nextDate, ISO_CALENDAR_DATE_REGEX, `Step ${step} must match YYYY-MM-DD`)
          assert.ok(
            nextDate > currentDueDate,
            `Step ${step} nextDueDate (${nextDate}) must be strictly greater than previous (${currentDueDate})`
          )

          const daysBetween = calendarDaysBetween(currentDueDate, nextDate)
          assert.ok(
            daysBetween >= 1,
            `Step ${step} days between must be >= 1, got ${daysBetween}`
          )

          if (recurrence === 'weekly') {
            assert.equal(
              daysBetween,
              7,
              `Weekly bill advance must always jump exactly 7 calendar days, got ${daysBetween}`
            )
          }

          currentDueDate = nextDate
        }

        return true
      }
    ),
    { numRuns: 100 }
  )
}

console.log('✅ Property 13 (Recurring Bill Next Due Date Calculation) PASSED all invariants with >= 100 iterations each!\n')
