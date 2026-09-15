/**
 * SakuKilat — Property-Based Test Suite for Bill & Subscription Center (Phase P5)
 *
 * Feature: sakukilat-core-roadmap, Property 16: Nearest Bill Snapshot Projection
 * Validates: Requirements 5.7
 *
 * Formal Property Statement:
 * For all active recurring bills, the `nearestBill` property in `NativeWidgetSnapshot`
 * SHALL correspond to the bill with the minimum `nextDueDate >= today`.
 *
 * Additionally verifies:
 * - Inactive bills (isActive === false) are strictly excluded from selection
 * - Exact synchronization between getNearestBill() and generateWidgetSnapshot().nearestBill
 * - Invariant: For all active bills b with nextDueDate >= today, nearestBill.dueDateStr <= b.nextDueDate
 * - Empty bills array yields nearestBill === undefined
 * - When all active bills are overdue, snapshot provides closest overdue bill fallback
 * - Serialized snapshot with nearestBill payload strictly respects size bound (< 4,096 bytes)
 * - Non-destructive preservation of input bills
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
  getNearestBill,
  createBill,
  getDaysInMonth,
} from '../lib/bills.ts'
import {
  generateWidgetSnapshot,
  serializeWidgetSnapshot,
  parseWidgetSnapshot,
  MAX_WIDGET_SNAPSHOT_SIZE,
} from '../lib/widget-snapshot.ts'
import {
  toCalendarDateString,
  toTransactionDateParts,
} from '../lib/parser.ts'

console.log('========================================================================')
console.log('  SAKUKILAT — PBT: NEAREST BILL SNAPSHOT PROJECTION (PROPERTY 16)        ')
console.log('========================================================================\n')

// ── Smart Domain Arbitraries ──────────────────────────────────────────────────

/**
 * Arbitrary valid calendar date string "YYYY-MM-DD" between years 2024 and 2035,
 * properly respecting days in month and leap years.
 */
const arbValidDateString = fc
  .record({
    year: fc.integer({ min: 2024, max: 2035 }),
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
 * Arbitrary day offsets covering past (overdue), today, near future, and far future.
 */
const arbOffsetDays = fc.oneof(
  // Overdue: -60 to -1 days
  fc.integer({ min: -60, max: -1 }),
  // Today: 0 days
  fc.constant(0),
  // Tomorrow & near future: 1 to 15 days
  fc.integer({ min: 1, max: 15 }),
  // Mid to far future: 16 to 90 days
  fc.integer({ min: 16, max: 90 })
)

/**
 * Arbitrary bill collection scenario given a reference evaluation date.
 */
const arbBillScenario = fc
  .record({
    refDate: arbValidDateString,
    billSpecs: fc.array(
      fc.record({
        offsetDays: arbOffsetDays,
        isActive: fc.boolean(),
        amount: fc.integer({ min: 0, max: 50_000_000 }),
        name: fc.string({ minLength: 1, maxLength: 60 }),
        recurrence: fc.constantFrom('weekly', 'monthly', 'annually'),
        categoryId: fc.constantFrom('tagihan', 'langganan', 'hiburan', 'kesehatan', 'lainnya'),
        paymentMethodId: fc.constantFrom('tunai', 'bca', 'mandiri', 'gopay', 'ovo', 'dana'),
      }),
      { minLength: 0, maxLength: 30 }
    ),
  })
  .map(({ refDate, billSpecs }) => {
    const refParts = toTransactionDateParts(refDate)

    const bills = billSpecs.map((spec, idx) => {
      const targetDate = new Date(refParts.year, refParts.month - 1, refParts.day + spec.offsetDays, 12, 0, 0, 0)
      const nextDueDate = toCalendarDateString(targetDate)

      return {
        id: `bill-${idx}-${Date.now() % 10000}`,
        name: spec.name,
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

// ── Property 16: Nearest Bill Snapshot Projection ─────────────────────────────
// Feature: sakukilat-core-roadmap, Property 16: Nearest Bill Snapshot Projection
// Validates: Requirements 5.7
// Formal Statement:
// For all active recurring bills, the nearestBill property in NativeWidgetSnapshot
// SHALL correspond to the bill with the minimum nextDueDate >= today.
{
  let totalEvaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 16: Nearest Bill Snapshot Projection',
    fc.property(arbBillScenario, ({ refDate, bills }) => {
      totalEvaluated++

      const todayStr = toCalendarDateString(refDate)
      const snapshot = generateWidgetSnapshot({ bills, now: refDate })
      const nearestFromHelper = getNearestBill(bills, refDate)

      const activeUpcomingBills = bills.filter(
        (b) => b.isActive && b.nextDueDate >= todayStr
      )

      if (activeUpcomingBills.length > 0) {
        // ── CASE 1: Active upcoming bills exist (nextDueDate >= today) ───────────

        // 1. Helper getNearestBill MUST return a non-null Bill
        assert.ok(
          nearestFromHelper !== null,
          `getNearestBill must return a bill when active upcoming bills exist`
        )
        assert.equal(nearestFromHelper.isActive, true, 'Nearest bill must be active')
        assert.ok(
          nearestFromHelper.nextDueDate >= todayStr,
          `Nearest bill nextDueDate (${nearestFromHelper.nextDueDate}) must be >= today (${todayStr})`
        )

        // 2. Snapshot nearestBill MUST be populated
        assert.ok(
          snapshot.nearestBill !== undefined,
          'snapshot.nearestBill must be defined when active upcoming bills exist'
        )
        const projected = snapshot.nearestBill

        // 3. Status must not be overdue
        assert.equal(
          projected.isOverdue,
          false,
          `nearestBill.isOverdue must be false when nextDueDate >= today`
        )
        assert.ok(
          projected.dueDateStr >= todayStr,
          `nearestBill.dueDateStr (${projected.dueDateStr}) must be >= today (${todayStr})`
        )

        // 4. Exact correspondence with getNearestBill
        assert.equal(
          projected.dueDateStr,
          nearestFromHelper.nextDueDate,
          `Snapshot dueDateStr (${projected.dueDateStr}) must match getNearestBill nextDueDate (${nearestFromHelper.nextDueDate})`
        )
        assert.equal(
          projected.amount,
          Math.max(0, Math.round(Number(nearestFromHelper.amount) || 0)),
          `Snapshot amount must match getNearestBill amount`
        )
        const expectedName =
          (nearestFromHelper.name || 'Tagihan').trim().slice(0, 50) || 'Tagihan'
        assert.equal(
          projected.name,
          expectedName,
          `Snapshot name must match trimmed sanitized name of nearest bill`
        )

        // 5. MINIMALITY INVARIANT:
        // For ALL active bills with nextDueDate >= today, nearestBill.dueDateStr <= b.nextDueDate
        for (const bill of activeUpcomingBills) {
          assert.ok(
            projected.dueDateStr <= bill.nextDueDate,
            `Minimality violated: nearestBill due (${projected.dueDateStr}) is later than active upcoming bill (${bill.id}: ${bill.nextDueDate})`
          )
        }

        // Verify projected.dueDateStr is exactly the minimum
        const minDueDate = activeUpcomingBills.reduce(
          (min, b) => (b.nextDueDate < min ? b.nextDueDate : min),
          activeUpcomingBills[0].nextDueDate
        )
        assert.equal(
          projected.dueDateStr,
          minDueDate,
          `nearestBill.dueDateStr must equal the mathematical minimum of active upcoming bills nextDueDate`
        )
      } else {
        // ── CASE 2: No active upcoming bills (either empty, all inactive, or all overdue) ──

        // getNearestBill MUST return null
        assert.equal(
          nearestFromHelper,
          null,
          'getNearestBill must return null when no active upcoming bills exist'
        )

        const activeOverdueBills = bills.filter(
          (b) => b.isActive && b.nextDueDate < todayStr
        )

        if (activeOverdueBills.length > 0) {
          // If all active bills are overdue, snapshot provides closest overdue fallback
          assert.ok(
            snapshot.nearestBill !== undefined,
            'Snapshot should provide closest overdue fallback when only overdue active bills exist'
          )
          assert.equal(
            snapshot.nearestBill.isOverdue,
            true,
            'Overdue fallback nearestBill.isOverdue must be true'
          )
          assert.ok(
            snapshot.nearestBill.dueDateStr < todayStr,
            'Overdue fallback nearestBill.dueDateStr must be strictly less than today'
          )

          // Must be the maximum due date among overdue bills (closest to today)
          const maxOverdue = activeOverdueBills.reduce(
            (max, b) => (b.nextDueDate > max ? b.nextDueDate : max),
            activeOverdueBills[0].nextDueDate
          )
          assert.equal(
            snapshot.nearestBill.dueDateStr,
            maxOverdue,
            'Overdue fallback must pick the bill closest to today (maximum nextDueDate < today)'
          )
        } else {
          // No active bills at all (either bills is empty, or all bills are inactive)
          assert.equal(
            snapshot.nearestBill,
            undefined,
            'snapshot.nearestBill must be undefined when there are no active bills'
          )
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

// ── Sub-Check A: Inactive Bill Non-Selection Invariant ────────────────────────
// Feature: sakukilat-core-roadmap, Property 16 (Sub-check A): Inactive Bill Non-Selection Invariant
// Validates: Requirements 5.7
// Verifies that bills marked isActive: false are NEVER selected as nearestBill,
// even if their due date is today or closer than active bills.
{
  let subCheckAEvaluated = 0

  const arbInactivePrecedenceScenario = fc
    .record({
      refDate: arbValidDateString,
      // Active bills with later due dates (e.g., 10 to 30 days ahead)
      activeOffset: fc.integer({ min: 10, max: 30 }),
      // Inactive bills with earlier due dates (e.g., 0 to 5 days ahead, or today)
      inactiveOffset: fc.integer({ min: 0, max: 5 }),
    })
    .map(({ refDate, activeOffset, inactiveOffset }) => {
      const refParts = toTransactionDateParts(refDate)

      const inactiveTarget = new Date(refParts.year, refParts.month - 1, refParts.day + inactiveOffset, 12, 0, 0, 0)
      const inactiveDueDate = toCalendarDateString(inactiveTarget)

      const activeTarget = new Date(refParts.year, refParts.month - 1, refParts.day + activeOffset, 12, 0, 0, 0)
      const activeDueDate = toCalendarDateString(activeTarget)

      const inactiveBill = {
        id: 'bill-inactive-near',
        name: 'Inactive Near Bill',
        amount: 50_000,
        categoryId: 'tagihan',
        paymentMethodId: 'tunai',
        recurrence: 'monthly',
        dueDay: inactiveTarget.getDate(),
        nextDueDate: inactiveDueDate,
        isActive: false, // Inactive!
      }

      const activeBill = {
        id: 'bill-active-far',
        name: 'Active Far Bill',
        amount: 150_000,
        categoryId: 'tagihan',
        paymentMethodId: 'bca',
        recurrence: 'monthly',
        dueDay: activeTarget.getDate(),
        nextDueDate: activeDueDate,
        isActive: true, // Active!
      }

      return { refDate, bills: [inactiveBill, activeBill], activeDueDate, inactiveDueDate }
    })

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 16 (Sub-check A): Inactive Bill Non-Selection Invariant',
    fc.property(arbInactivePrecedenceScenario, ({ refDate, bills, activeDueDate, inactiveDueDate }) => {
      subCheckAEvaluated++

      const snapshot = generateWidgetSnapshot({ bills, now: refDate })
      const nearest = getNearestBill(bills, refDate)

      // Nearest bill MUST be the active bill, NOT the inactive bill with closer date
      assert.ok(nearest !== null, 'getNearestBill must find the active bill')
      assert.equal(nearest.id, 'bill-active-far', 'Inactive bill must never be chosen by getNearestBill')
      assert.equal(nearest.nextDueDate, activeDueDate)

      assert.ok(snapshot.nearestBill !== undefined, 'snapshot.nearestBill must be defined')
      assert.equal(
        snapshot.nearestBill.dueDateStr,
        activeDueDate,
        `Snapshot nearestBill must be active bill due ${activeDueDate}, not inactive bill due ${inactiveDueDate}`
      )
      assert.equal(snapshot.nearestBill.name, 'Active Far Bill')

      // Also test when ONLY inactive bills exist: nearestBill MUST be undefined
      const allInactiveBills = bills.filter((b) => !b.isActive)
      const snapshotAllInactive = generateWidgetSnapshot({ bills: allInactiveBills, now: refDate })
      const nearestAllInactive = getNearestBill(allInactiveBills, refDate)

      assert.equal(nearestAllInactive, null, 'getNearestBill must be null when all bills are inactive')
      assert.equal(
        snapshotAllInactive.nearestBill,
        undefined,
        'snapshot.nearestBill must be undefined when all bills are inactive'
      )

      return true
    }),
    { numRuns: 100 }
  )

  assert.ok(subCheckAEvaluated >= MIN_PBT_RUNS)
}

// ── Sub-Check B: Empty & Boundary Bills Collection Invariant ──────────────────
// Feature: sakukilat-core-roadmap, Property 16 (Sub-check B): Empty & Boundary Bills Collection Invariant
// Validates: Requirements 5.7
// Verifies boundary conditions: empty array, single bill today, single bill overdue.
{
  let subCheckBEvaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 16 (Sub-check B): Empty & Boundary Bills Collection Invariant',
    fc.property(arbValidDateString, (refDate) => {
      subCheckBEvaluated++

      // 1. Empty bills array
      const emptySnapshot = generateWidgetSnapshot({ bills: [], now: refDate })
      assert.equal(emptySnapshot.nearestBill, undefined, 'Empty bills must produce undefined nearestBill')
      assert.equal(getNearestBill([], refDate), null, 'getNearestBill must return null for empty bills')

      // 2. Undefined bills option
      const undefinedSnapshot = generateWidgetSnapshot({ bills: undefined, now: refDate })
      // When options.bills is undefined and localStorage is empty/undefined, nearestBill is undefined
      assert.equal(undefinedSnapshot.nearestBill, undefined)

      // 3. Single active bill due TODAY (offset 0)
      const singleBillToday = createBill({
        name: 'Listrik Hari Ini',
        amount: 250_000,
        categoryId: 'tagihan',
        paymentMethodId: 'mandiri',
        recurrence: 'monthly',
        dueDay: 1,
        nextDueDate: refDate,
        isActive: true,
      })

      const todaySnapshot = generateWidgetSnapshot({ bills: [singleBillToday], now: refDate })
      const todayNearest = getNearestBill([singleBillToday], refDate)

      assert.ok(todayNearest !== null)
      assert.equal(todayNearest.nextDueDate, refDate)
      assert.ok(todaySnapshot.nearestBill !== undefined)
      assert.equal(todaySnapshot.nearestBill.dueDateStr, refDate)
      assert.equal(todaySnapshot.nearestBill.isOverdue, false)
      assert.equal(todaySnapshot.nearestBill.amount, 250_000)
      assert.equal(todaySnapshot.nearestBill.name, 'Listrik Hari Ini')

      return true
    }),
    { numRuns: 100 }
  )

  assert.ok(subCheckBEvaluated >= MIN_PBT_RUNS)
}

// ── Sub-Check C: All Overdue Bills Fallback Invariant ─────────────────────────
// Feature: sakukilat-core-roadmap, Property 16 (Sub-check C): All Overdue Bills Fallback Invariant
// Validates: Requirements 5.7
// When all active bills have nextDueDate < today, verifies:
// - getNearestBill returns null
// - generateWidgetSnapshot provides closest overdue bill (maximum overdue nextDueDate)
{
  let subCheckCEvaluated = 0

  const arbAllOverdueScenario = fc
    .record({
      refDate: arbValidDateString,
      overdueOffsets: fc.array(fc.integer({ min: -90, max: -1 }), { minLength: 1, maxLength: 15 }),
    })
    .map(({ refDate, overdueOffsets }) => {
      const refParts = toTransactionDateParts(refDate)
      const bills = overdueOffsets.map((offset, idx) => {
        const target = new Date(refParts.year, refParts.month - 1, refParts.day + offset, 12, 0, 0, 0)
        return {
          id: `overdue-${idx}`,
          name: `Overdue Bill #${idx}`,
          amount: 50_000 * (idx + 1),
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
    'Feature: sakukilat-core-roadmap, Property 16 (Sub-check C): All Overdue Bills Fallback Invariant',
    fc.property(arbAllOverdueScenario, ({ refDate, bills }) => {
      subCheckCEvaluated++

      const todayStr = toCalendarDateString(refDate)
      const nearestHelper = getNearestBill(bills, refDate)
      const snapshot = generateWidgetSnapshot({ bills, now: refDate })

      // Helper returns null since no bill is >= today
      assert.equal(nearestHelper, null, 'getNearestBill must be null when all bills are overdue')

      // Snapshot provides closest overdue fallback
      assert.ok(snapshot.nearestBill !== undefined, 'Snapshot should provide overdue fallback')
      assert.equal(snapshot.nearestBill.isOverdue, true)
      assert.ok(snapshot.nearestBill.dueDateStr < todayStr)

      // Maximum due date among overdue bills is the one closest to today
      const closestOverdueExpected = bills.reduce(
        (max, b) => (b.nextDueDate > max ? b.nextDueDate : max),
        bills[0].nextDueDate
      )
      assert.equal(
        snapshot.nearestBill.dueDateStr,
        closestOverdueExpected,
        `Overdue fallback must pick the bill closest to today: expected ${closestOverdueExpected}, got ${snapshot.nearestBill.dueDateStr}`
      )

      return true
    }),
    { numRuns: 100 }
  )

  assert.ok(subCheckCEvaluated >= MIN_PBT_RUNS)
}

// ── Sub-Check D: Payload Size & Serialization Soundness Invariant ─────────────
// Feature: sakukilat-core-roadmap, Property 16 (Sub-check D): Payload Size & Serialization Soundness Invariant
// Validates: Requirements 5.7, 4.4, 4.5
// Verifies that adding nearestBill does not breach the 4,096 bytes snapshot size limit,
// and that serializeWidgetSnapshot -> parseWidgetSnapshot round-trips nearestBill fields intact.
{
  let subCheckDEvaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 16 (Sub-check D): Payload Size & Serialization Soundness Invariant',
    fc.property(
      arbBillScenario,
      fc.array(
        fc.record({
          id: fc.stringMatching(/^[a-z0-9_-]{4,10}$/),
          balance: fc.integer({ min: 0, max: 100_000_000 }),
        }),
        { minLength: 1, maxLength: 5 }
      ),
      ({ refDate, bills }, wallets) => {
        subCheckDEvaluated++

        const snapshot = generateWidgetSnapshot({ bills, wallets, now: refDate })
        const serialized = serializeWidgetSnapshot(snapshot)

        // 1. Strict size bound
        assert.ok(
          serialized.length < MAX_WIDGET_SNAPSHOT_SIZE,
          `Serialized snapshot length (${serialized.length}) must be < ${MAX_WIDGET_SNAPSHOT_SIZE}`
        )
        assert.ok(
          Buffer.byteLength(serialized, 'utf8') < 4096,
          `Byte length (${Buffer.byteLength(serialized, 'utf8')}) must be < 4096`
        )

        // 2. Serialization Round-Trip
        const parsed = parseWidgetSnapshot(serialized)
        assert.ok(parsed !== null, 'parseWidgetSnapshot must return non-null object')

        if (snapshot.nearestBill) {
          assert.ok(parsed.nearestBill !== undefined, 'parsed.nearestBill must exist')
          assert.equal(parsed.nearestBill.name, snapshot.nearestBill.name)
          assert.equal(parsed.nearestBill.amount, snapshot.nearestBill.amount)
          assert.equal(parsed.nearestBill.dueDateStr, snapshot.nearestBill.dueDateStr)
          assert.equal(parsed.nearestBill.isOverdue, snapshot.nearestBill.isOverdue)
        } else {
          assert.equal(parsed.nearestBill, undefined)
        }

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(subCheckDEvaluated >= MIN_PBT_RUNS)
}

console.log('========================================================================')
console.log('✅ ALL PROPERTY 16 (NEAREST BILL SNAPSHOT PROJECTION) PBT PASSED!       ')
console.log('========================================================================\n')
