/**
 * SakuKilat — Property-Based Test Suite for Phase P5: Bill and Subscription Center
 *
 * Feature: sakukilat-core-roadmap, Property 14: Upcoming Bills Urgency Partitioning
 * Validates: Requirements 5.3
 *
 * For any collection of active bills and reference date D, grouping bills by urgency
 * SHALL partition upcoming bills disjointly into:
 * - dueToday (dueDate == D)
 * - dueSoon (1 <= dueDate - D <= 5)
 * - dueLater (dueDate - D > 5 within current month)
 *
 * Additionally verifies:
 * - Mutually disjoint classification across all categories (overdue, dueToday, dueSoon, dueLater, future, inactive)
 * - Total partition completeness (every active bill placed in exactly one category, all inactive in inactive)
 * - Ascending chronological ordering by nextDueDate within each category
 * - Non-destructive bill attribute preservation
 * - Month boundary and leap year transition correctness
 */

import assert from 'node:assert/strict'
import {
  fc,
  testProperty,
  MIN_PBT_RUNS,
  arbCalendarDate,
  arbRupiahAmount,
} from './pbt-harness.mjs'
import {
  groupBillsByUrgency,
  getBillUrgency,
  calendarDaysBetween,
  createBill,
  getDaysInMonth,
} from '../lib/bills.ts'
import {
  toCalendarDateString,
  toTransactionDateParts,
} from '../lib/parser.ts'

console.log('====================================================')
console.log('  SAKUKILAT — PBT: UPCOMING BILLS URGENCY PARTITION ')
console.log('====================================================\n')

// ── Smart Arbitraries ─────────────────────────────────────────────────────────

/**
 * Arbitrary valid calendar date string "YYYY-MM-DD" between years 2020 and 2035,
 * properly respecting days in month and leap years.
 */
const arbValidDateString = fc
  .record({
    year: fc.integer({ min: 2020, max: 2035 }),
    month: fc.integer({ min: 1, max: 12 }),
  })
  .chain(({ year, month }) => {
    const maxDay = getDaysInMonth(year, month)
    return fc.record({
      year: fc.constant(year),
      month: fc.constant(month),
      day: fc.integer({ min: 1, max: maxDay }),
    })
  })
  .map(({ year, month, day }) => {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  })

/**
 * Arbitrary offset in days covering all urgency sectors:
 * - overdue (< 0)
 * - dueToday (0)
 * - dueSoon (1 to 5)
 * - dueLater (> 5 within current month, depending on refDate day)
 * - future (> 5 across month boundary, into next months/years)
 */
const arbOffsetDays = fc.oneof(
  // Overdue
  fc.integer({ min: -60, max: -1 }),
  // Due today
  fc.constant(0),
  // Due soon (1 to 5 days)
  fc.integer({ min: 1, max: 5 }),
  // Near future (6 to 25 days)
  fc.integer({ min: 6, max: 25 }),
  // Far future (26 to 120 days)
  fc.integer({ min: 26, max: 120 })
)

/**
 * Arbitrary bill collection scenario given a reference date.
 */
const arbBillUrgencyScenario = fc
  .record({
    refDate: arbValidDateString,
    billSpecs: fc.array(
      fc.record({
        offsetDays: arbOffsetDays,
        isActive: fc.boolean(),
        amount: fc.integer({ min: 0, max: 25_000_000 }),
        recurrence: fc.constantFrom('weekly', 'monthly', 'annually'),
        categoryId: fc.constantFrom('tagihan', 'hiburan', 'pendidikan', 'kesehatan', 'lainnya'),
        paymentMethodId: fc.constantFrom('tunai', 'bca', 'mandiri', 'gopay', 'ovo', 'dana'),
      }),
      { minLength: 0, maxLength: 30 }
    ),
  })
  .map(({ refDate, billSpecs }) => {
    const refParts = toTransactionDateParts(refDate)

    const bills = billSpecs.map((spec, idx) => {
      // Calculate target date strictly using calendar arithmetic
      const targetDate = new Date(refParts.year, refParts.month - 1, refParts.day + spec.offsetDays, 12, 0, 0, 0)
      const nextDueDate = toCalendarDateString(targetDate)

      return {
        id: `bill-${idx}-${idx * 31 + 7}`,
        name: `Tagihan #${idx + 1}`,
        amount: spec.amount,
        categoryId: spec.categoryId,
        paymentMethodId: spec.paymentMethodId,
        recurrence: spec.recurrence,
        dueDay: targetDate.getDate(),
        nextDueDate,
        isActive: spec.isActive,
      }
    })

    return { refDate, bills }
  })

// ── Property 14: Upcoming Bills Urgency Partitioning ──────────────────────────
// Validates: Requirements 5.3
// For any collection of active bills and reference date D, grouping bills by urgency
// SHALL partition upcoming bills disjointly into:
//   dueToday (dueDate == D)
//   dueSoon (1 <= dueDate - D <= 5)
//   dueLater (dueDate - D > 5 within current month)
{
  let totalEvaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 14: Upcoming Bills Urgency Partitioning',
    fc.property(arbBillUrgencyScenario, ({ refDate, bills }) => {
      totalEvaluated++

      const grouped = groupBillsByUrgency(bills, refDate)
      const refParts = toTransactionDateParts(refDate)

      const buckets = [
        { name: 'dueToday', list: grouped.dueToday },
        { name: 'dueSoon', list: grouped.dueSoon },
        { name: 'dueLater', list: grouped.dueLater },
        { name: 'overdue', list: grouped.overdue },
        { name: 'future', list: grouped.future },
        { name: 'inactive', list: grouped.inactive },
      ]

      // 1. Disjointness Invariant (Disjoint Partitioning)
      // Every list must have distinct IDs, and no two lists may share any bill ID
      for (const b of buckets) {
        const ids = b.list.map(x => x.id)
        assert.equal(
          new Set(ids).size,
          ids.length,
          `Bucket "${b.name}" must not contain duplicate bill IDs`
        )
      }

      for (let i = 0; i < buckets.length; i++) {
        for (let j = i + 1; j < buckets.length; j++) {
          const idsI = new Set(buckets[i].list.map(x => x.id))
          const overlap = buckets[j].list.filter(x => idsI.has(x.id))
          assert.equal(
            overlap.length,
            0,
            `Buckets "${buckets[i].name}" and "${buckets[j].name}" must be strictly disjoint, found overlap: ${JSON.stringify(overlap.map(o => o.id))}`
          )
        }
      }

      // Explicit check for upcoming bills disjointness:
      // dueToday ∩ dueSoon = ∅, dueToday ∩ dueLater = ∅, dueSoon ∩ dueLater = ∅
      const todayIds = new Set(grouped.dueToday.map(b => b.id))
      const soonIds = new Set(grouped.dueSoon.map(b => b.id))
      const laterIds = new Set(grouped.dueLater.map(b => b.id))

      for (const id of todayIds) {
        assert.ok(!soonIds.has(id), `Bill "${id}" cannot be both in dueToday and dueSoon`)
        assert.ok(!laterIds.has(id), `Bill "${id}" cannot be both in dueToday and dueLater`)
      }
      for (const id of soonIds) {
        assert.ok(!laterIds.has(id), `Bill "${id}" cannot be both in dueSoon and dueLater`)
      }

      // 2. Semantic Classification Correctness (Soundness)
      // Verify every item in dueToday matches dueDate == D
      for (const b of grouped.dueToday) {
        assert.equal(b.isActive, true, 'Bills in dueToday must be active')
        const diff = calendarDaysBetween(refDate, b.nextDueDate)
        assert.equal(
          diff,
          0,
          `Bill "${b.id}" in dueToday must have diffDays === 0 relative to ${refDate}, got ${diff} (dueDate: ${b.nextDueDate})`
        )
        assert.equal(
          toCalendarDateString(b.nextDueDate),
          toCalendarDateString(refDate),
          `Bill "${b.id}" in dueToday must have nextDueDate === refDate`
        )
      }

      // Verify every item in dueSoon matches 1 <= dueDate - D <= 5
      for (const b of grouped.dueSoon) {
        assert.equal(b.isActive, true, 'Bills in dueSoon must be active')
        const diff = calendarDaysBetween(refDate, b.nextDueDate)
        assert.ok(
          diff >= 1 && diff <= 5,
          `Bill "${b.id}" in dueSoon must have 1 <= diffDays <= 5 relative to ${refDate}, got ${diff} (dueDate: ${b.nextDueDate})`
        )
      }

      // Verify every item in dueLater matches dueDate - D > 5 within current month
      for (const b of grouped.dueLater) {
        assert.equal(b.isActive, true, 'Bills in dueLater must be active')
        const diff = calendarDaysBetween(refDate, b.nextDueDate)
        assert.ok(
          diff > 5,
          `Bill "${b.id}" in dueLater must have diffDays > 5 relative to ${refDate}, got ${diff} (dueDate: ${b.nextDueDate})`
        )
        const dueParts = toTransactionDateParts(b.nextDueDate)
        assert.equal(
          dueParts.year,
          refParts.year,
          `Bill "${b.id}" in dueLater must be in same year as refDate (${refParts.year}), got ${dueParts.year}`
        )
        assert.equal(
          dueParts.month,
          refParts.month,
          `Bill "${b.id}" in dueLater must be in same month as refDate (${refParts.month}), got ${dueParts.month}`
        )
      }

      // Verify overdue bills
      for (const b of grouped.overdue) {
        assert.equal(b.isActive, true, 'Bills in overdue must be active')
        const diff = calendarDaysBetween(refDate, b.nextDueDate)
        assert.ok(
          diff < 0,
          `Bill "${b.id}" in overdue must have diffDays < 0, got ${diff}`
        )
      }

      // Verify future bills
      for (const b of grouped.future) {
        assert.equal(b.isActive, true, 'Bills in future must be active')
        const diff = calendarDaysBetween(refDate, b.nextDueDate)
        assert.ok(
          diff > 5,
          `Bill "${b.id}" in future must have diffDays > 5, got ${diff}`
        )
        const dueParts = toTransactionDateParts(b.nextDueDate)
        const isSameMonthYear = dueParts.year === refParts.year && dueParts.month === refParts.month
        assert.ok(
          !isSameMonthYear,
          `Bill "${b.id}" in future must NOT be in the same month and year as refDate`
        )
      }

      // Verify inactive bills
      for (const b of grouped.inactive) {
        assert.equal(
          b.isActive,
          false,
          `Bill "${b.id}" in inactive must have isActive === false`
        )
      }

      // 3. Completeness / Conservation Invariant
      // Every input bill must be present in exactly one bucket
      const totalCategorized =
        grouped.dueToday.length +
        grouped.dueSoon.length +
        grouped.dueLater.length +
        grouped.overdue.length +
        grouped.future.length +
        grouped.inactive.length

      assert.equal(
        totalCategorized,
        bills.length,
        `Total categorized bills (${totalCategorized}) must equal input bills count (${bills.length})`
      )

      const inputIds = new Set(bills.map(b => b.id))
      const outputIds = new Set(buckets.flatMap(b => b.list.map(x => x.id)))
      assert.deepEqual(
        outputIds,
        inputIds,
        'Union of all bucket IDs must match all input bill IDs'
      )

      // 4. Ascending Chronological Ordering Invariant
      // Within each category, bills must be sorted in ascending order of nextDueDate
      for (const b of buckets) {
        for (let i = 0; i < b.list.length - 1; i++) {
          assert.ok(
            b.list[i].nextDueDate.localeCompare(b.list[i + 1].nextDueDate) <= 0,
            `Bucket "${b.name}" must be sorted by nextDueDate ascending: ${b.list[i].nextDueDate} > ${b.list[i + 1].nextDueDate}`
          )
        }
      }

      // 5. Non-Destructive Invariant
      // Input bills must not be mutated
      for (const b of buckets) {
        for (const item of b.list) {
          const original = bills.find(x => x.id === item.id)
          assert.ok(original !== undefined, `Bill ${item.id} must exist in input bills`)
          assert.equal(item.name, original.name)
          assert.equal(item.amount, original.amount)
          assert.equal(item.recurrence, original.recurrence)
          assert.equal(item.dueDay, original.dueDay)
          assert.equal(item.nextDueDate, original.nextDueDate)
          assert.equal(item.isActive, original.isActive)
        }
      }

      return true
    }),
    { numRuns: 200 }
  )

  assert.ok(
    totalEvaluated >= MIN_PBT_RUNS,
    `Expected at least ${MIN_PBT_RUNS} iterations, evaluated ${totalEvaluated}`
  )
}

// ── Property 14 (Sub-check A): Strict Upcoming Bills Urgency Partitioning ─────
// Validates: Requirements 5.3
// Specifically tests dense combinations of active upcoming bills across exact
// day differences (-2, -1, 0, 1, 2, 3, 4, 5, 6, 10, 20) to verify strict boundaries:
// - dueToday: exactly diffDays == 0
// - dueSoon: exactly 1 <= diffDays <= 5
// - dueLater: exactly diffDays > 5 in current month
{
  let subCheckAEvaluated = 0

  const arbDenseUpcomingScenario = fc
    .record({
      refDate: arbValidDateString,
      // Pick multiple bills with specific target offsets around the boundary values
      offsetChoices: fc.array(
        fc.constantFrom(-5, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 10, 15, 20, 25, 30),
        { minLength: 5, maxLength: 25 }
      ),
    })
    .map(({ refDate, offsetChoices }) => {
      const refParts = toTransactionDateParts(refDate)
      const bills = offsetChoices.map((offset, idx) => {
        const target = new Date(refParts.year, refParts.month - 1, refParts.day + offset, 12, 0, 0, 0)
        const nextDueDate = toCalendarDateString(target)
        return {
          id: `dense-bill-${idx}-${offset}`,
          name: `Dense Bill ${idx}`,
          amount: 50_000 * (idx + 1),
          categoryId: 'tagihan',
          paymentMethodId: 'bca',
          recurrence: 'monthly',
          dueDay: target.getDate(),
          nextDueDate,
          isActive: true, // All active to focus on upcoming partition
        }
      })
      return { refDate, bills }
    })

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 14 (Sub-check A): Strict Upcoming Bills Urgency Partitioning',
    fc.property(arbDenseUpcomingScenario, ({ refDate, bills }) => {
      subCheckAEvaluated++

      const grouped = groupBillsByUrgency(bills, refDate)
      const refParts = toTransactionDateParts(refDate)

      const todayIds = new Set(grouped.dueToday.map(b => b.id))
      const soonIds = new Set(grouped.dueSoon.map(b => b.id))
      const laterIds = new Set(grouped.dueLater.map(b => b.id))

      // Check each bill against its expected partition
      for (const bill of bills) {
        const diff = calendarDaysBetween(refDate, bill.nextDueDate)
        const dueParts = toTransactionDateParts(bill.nextDueDate)
        const isSameMonthYear = dueParts.year === refParts.year && dueParts.month === refParts.month

        if (diff === 0) {
          assert.ok(todayIds.has(bill.id), `Bill with diffDays=0 must be in dueToday`)
          assert.ok(!soonIds.has(bill.id), `Bill with diffDays=0 must not be in dueSoon`)
          assert.ok(!laterIds.has(bill.id), `Bill with diffDays=0 must not be in dueLater`)
        } else if (diff >= 1 && diff <= 5) {
          assert.ok(!todayIds.has(bill.id), `Bill with 1<=diff<=5 must not be in dueToday`)
          assert.ok(soonIds.has(bill.id), `Bill with 1<=diff<=5 must be in dueSoon`)
          assert.ok(!laterIds.has(bill.id), `Bill with 1<=diff<=5 must not be in dueLater`)
        } else if (diff > 5 && isSameMonthYear) {
          assert.ok(!todayIds.has(bill.id), `Bill with diff>5 in current month must not be in dueToday`)
          assert.ok(!soonIds.has(bill.id), `Bill with diff>5 in current month must not be in dueSoon`)
          assert.ok(laterIds.has(bill.id), `Bill with diff>5 in current month must be in dueLater`)
        } else {
          // It is either overdue (diff < 0) or future month (diff > 5 across month boundary)
          assert.ok(!todayIds.has(bill.id), `Bill with diff=${diff} must not be in dueToday`)
          assert.ok(!soonIds.has(bill.id), `Bill with diff=${diff} must not be in dueSoon`)
          assert.ok(!laterIds.has(bill.id), `Bill with diff=${diff} must not be in dueLater`)
        }
      }

      return true
    }),
    { numRuns: 100 }
  )

  assert.ok(subCheckAEvaluated >= MIN_PBT_RUNS)
}

// ── Property 14 (Sub-check B): Month Boundary and Leap Year Urgency Edge Cases 
// Validates: Requirements 5.3
// Tests end-of-month reference dates (days 25-31) where diffDays > 5 crosses into
// the subsequent month or year, ensuring proper separation between dueLater and future.
{
  let subCheckBEvaluated = 0

  const arbMonthEndScenario = fc
    .record({
      year: fc.integer({ min: 2024, max: 2028 }),
      month: fc.integer({ min: 1, max: 12 }),
    })
    .chain(({ year, month }) => {
      const maxDay = getDaysInMonth(year, month)
      // Pick a day near month end: between maxDay - 4 and maxDay
      const startDay = Math.max(1, maxDay - 4)
      return fc.record({
        year: fc.constant(year),
        month: fc.constant(month),
        day: fc.integer({ min: startDay, max: maxDay }),
        offsets: fc.array(fc.integer({ min: 0, max: 15 }), { minLength: 3, maxLength: 12 }),
      })
    })
    .map(({ year, month, day, offsets }) => {
      const refDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const bills = offsets.map((offset, idx) => {
        const target = new Date(year, month - 1, day + offset, 12, 0, 0, 0)
        return {
          id: `monthend-bill-${idx}`,
          name: `MonthEnd Bill ${idx}`,
          amount: 75_000,
          categoryId: 'tagihan',
          paymentMethodId: 'tunai',
          recurrence: 'monthly',
          dueDay: target.getDate(),
          nextDueDate: toCalendarDateString(target),
          isActive: true,
        }
      })
      return { refDate, bills }
    })

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 14 (Sub-check B): Month Boundary and Leap Year Urgency Edge Cases',
    fc.property(arbMonthEndScenario, ({ refDate, bills }) => {
      subCheckBEvaluated++

      const grouped = groupBillsByUrgency(bills, refDate)
      const refParts = toTransactionDateParts(refDate)

      for (const bill of bills) {
        const diff = calendarDaysBetween(refDate, bill.nextDueDate)
        const dueParts = toTransactionDateParts(bill.nextDueDate)
        const isSameMonthYear = dueParts.year === refParts.year && dueParts.month === refParts.month

        if (diff > 5) {
          if (isSameMonthYear) {
            // Must be in dueLater, NOT in future
            assert.ok(
              grouped.dueLater.some(b => b.id === bill.id),
              `Bill due in same month with diff > 5 must be in dueLater`
            )
            assert.ok(
              !grouped.future.some(b => b.id === bill.id),
              `Bill due in same month with diff > 5 must NOT be in future`
            )
          } else {
            // Crossed month boundary: must be in future, NOT in dueLater
            assert.ok(
              grouped.future.some(b => b.id === bill.id),
              `Bill crossing into next month with diff > 5 must be in future`
            )
            assert.ok(
              !grouped.dueLater.some(b => b.id === bill.id),
              `Bill crossing into next month with diff > 5 must NOT be in dueLater`
            )
          }
        }
      }

      return true
    }),
    { numRuns: 100 }
  )

  assert.ok(subCheckBEvaluated >= MIN_PBT_RUNS)
}

// ── Property 14 (Sub-check C): Inactive Bill Non-Pollution Invariant ───────────
// Validates: Requirements 5.3
// Verifies that inactive bills are NEVER placed into active urgency categories
// (dueToday, dueSoon, dueLater, overdue, future), regardless of their due date.
{
  let subCheckCEvaluated = 0

  const arbInactiveBillScenario = fc
    .record({
      refDate: arbValidDateString,
      inactiveBills: fc.array(
        fc.record({
          offsetDays: fc.integer({ min: -30, max: 60 }),
          amount: fc.integer({ min: 1000, max: 1_000_000 }),
        }),
        { minLength: 1, maxLength: 20 }
      ),
      activeBills: fc.array(
        fc.record({
          offsetDays: fc.integer({ min: -30, max: 60 }),
          amount: fc.integer({ min: 1000, max: 1_000_000 }),
        }),
        { minLength: 0, maxLength: 10 }
      ),
    })
    .map(({ refDate, inactiveBills, activeBills }) => {
      const refParts = toTransactionDateParts(refDate)

      const inactives = inactiveBills.map((item, idx) => {
        const target = new Date(refParts.year, refParts.month - 1, refParts.day + item.offsetDays, 12, 0, 0, 0)
        return {
          id: `inactive-${idx}`,
          name: `Inactive #${idx}`,
          amount: item.amount,
          categoryId: 'tagihan',
          paymentMethodId: 'tunai',
          recurrence: 'monthly',
          dueDay: target.getDate(),
          nextDueDate: toCalendarDateString(target),
          isActive: false,
        }
      })

      const actives = activeBills.map((item, idx) => {
        const target = new Date(refParts.year, refParts.month - 1, refParts.day + item.offsetDays, 12, 0, 0, 0)
        return {
          id: `active-${idx}`,
          name: `Active #${idx}`,
          amount: item.amount,
          categoryId: 'tagihan',
          paymentMethodId: 'tunai',
          recurrence: 'monthly',
          dueDay: target.getDate(),
          nextDueDate: toCalendarDateString(target),
          isActive: true,
        }
      })

      return { refDate, bills: [...inactives, ...actives], expectedInactiveCount: inactives.length }
    })

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 14 (Sub-check C): Inactive Bill Non-Pollution Invariant',
    fc.property(arbInactiveBillScenario, ({ refDate, bills, expectedInactiveCount }) => {
      subCheckCEvaluated++

      const grouped = groupBillsByUrgency(bills, refDate)

      // 1. Inactive bucket must contain exactly all inactive bills
      assert.equal(
        grouped.inactive.length,
        expectedInactiveCount,
        `Expected ${expectedInactiveCount} bills in inactive, got ${grouped.inactive.length}`
      )

      // 2. Active buckets must contain zero inactive bills
      const activeBuckets = [
        { name: 'dueToday', list: grouped.dueToday },
        { name: 'dueSoon', list: grouped.dueSoon },
        { name: 'dueLater', list: grouped.dueLater },
        { name: 'overdue', list: grouped.overdue },
        { name: 'future', list: grouped.future },
      ]

      for (const bucket of activeBuckets) {
        for (const bill of bucket.list) {
          assert.equal(
            bill.isActive,
            true,
            `Active bucket "${bucket.name}" must not contain inactive bill "${bill.id}"`
          )
        }
      }

      return true
    }),
    { numRuns: 100 }
  )

  assert.ok(subCheckCEvaluated >= MIN_PBT_RUNS)
}

console.log('\n✅ Property 14 PBT for Upcoming Bills Urgency Partitioning PASSED! (>= 100 iterations verified)\n')
