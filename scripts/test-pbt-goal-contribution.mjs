/**
 * SakuKilat — Property-Based Test Suite for Goal Planner Suggested Monthly Contribution Calculation
 *
 * Feature: sakukilat-core-roadmap, Property 20: Goal Planner Suggested Contribution Calculation
 * Validates: Requirements 7.2
 *
 * Property 20 Specification:
 * For any financial goal with target amount T, current amount C (where T > C),
 * and target completion date D having M remaining whole months (M >= 1),
 * the suggested monthly contribution SHALL equal Math.ceil((T - C) / M).
 */

import assert from 'node:assert/strict'
import {
  fc,
  testProperty,
  MIN_PBT_RUNS,
  arbRupiahAmount,
  arbPositiveRupiahAmount,
} from './pbt-harness.mjs'
import {
  calculateMonthlyContribution,
  calculateRemainingMonths,
  calculateMonthsBetween,
  createGoal,
  enhanceGoal,
  toMidnightDate,
} from '../lib/goals.ts'
import {
  toCalendarDateString,
  toTransactionDateParts,
} from '../lib/parser.ts'

console.log('====================================================')
console.log('  SAKUKILAT — PBT: GOAL SUGGESTED CONTRIBUTION      ')
console.log('====================================================\n')

// ── Arbitrary Generators ──────────────────────────────────────────────────

/**
 * Arbitrary target amount T and current amount C such that T > C >= 0.
 * Ranges from Rp1 up to Rp1.000.000.000.
 */
const arbTargetAndCurrent = fc
  .integer({ min: 1, max: 1_000_000_000 })
  .chain((target) =>
    fc.record({
      target: fc.constant(target),
      current: fc.integer({ min: 0, max: target - 1 }),
    })
  )

/**
 * Arbitrary reference date between years 2020 and 2040.
 * Uses safe day range (1..28) to avoid end-of-month calendar variations during addition.
 */
const arbReferenceDate = fc
  .record({
    year: fc.integer({ min: 2020, max: 2040 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }),
    hours: fc.integer({ min: 0, max: 23 }),
    minutes: fc.integer({ min: 0, max: 59 }),
  })
  .map(({ year, month, day, hours, minutes }) => {
    return new Date(year, month - 1, day, hours, minutes, 0, 0)
  })

/**
 * Helper to format date into multiple input representations:
 * Date object, ISO string ('YYYY-MM-DD'), ISO datetime ('YYYY-MM-DDTHH:mm:ss'), or timestamp (ms).
 */
function formatToRepresentation(date, format) {
  if (format === 'date') return date
  const yStr = String(date.getFullYear())
  const mStr = String(date.getMonth() + 1).padStart(2, '0')
  const dStr = String(date.getDate()).padStart(2, '0')
  const hStr = String(date.getHours()).padStart(2, '0')
  const minStr = String(date.getMinutes()).padStart(2, '0')
  if (format === 'iso-date') return `${yStr}-${mStr}-${dStr}`
  if (format === 'iso-datetime') return `${yStr}-${mStr}-${dStr}T${hStr}:${minStr}:00`
  return date.getTime()
}

// ── Feature: sakukilat-core-roadmap, Property 20: Goal Planner Suggested Contribution Calculation ──
// Validates: Requirements 7.2
{
  let runCount = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 20: Goal Planner Suggested Contribution Calculation',
    fc.property(
      arbTargetAndCurrent,
      arbReferenceDate,
      fc.integer({ min: 1, max: 120 }), // M remaining whole months (1 month up to 10 years)
      fc.integer({ min: 0, max: 3 }),   // Day offset to ensure target.day >= ref.day
      fc.constantFrom('date', 'iso-date', 'iso-datetime', 'timestamp'),
      fc.constantFrom('date', 'iso-date', 'iso-datetime', 'timestamp'),
      ({ target, current }, refDate, monthsAhead, dayOffset, refFormat, targetFormat) => {
        runCount++

        const refYear = refDate.getFullYear()
        const refMonth = refDate.getMonth()
        const refDay = refDate.getDate()

        // Construct target date strictly `monthsAhead` calendar months in the future
        const targetYear = refYear + Math.floor((refMonth + monthsAhead) / 12)
        const targetMonth = (refMonth + monthsAhead) % 12
        const targetDay = Math.min(28, refDay + dayOffset)
        const targetDateObj = new Date(targetYear, targetMonth, targetDay, 12, 0, 0, 0)

        const refInput = formatToRepresentation(refDate, refFormat)
        const targetInput = formatToRepresentation(targetDateObj, targetFormat)

        // Calculate whole remaining months M
        const remainingMonths = calculateRemainingMonths(targetInput, refInput)

        // Ensure generator precondition: M >= 1
        assert.ok(
          remainingMonths >= 1,
          `Precondition failed: remaining months ${remainingMonths} must be >= 1`
        )
        assert.equal(
          remainingMonths,
          monthsAhead,
          `Computed remaining months (${remainingMonths}) must match monthsAhead (${monthsAhead})`
        )

        // Core Mathematical Invariant (Property 20):
        // suggestedMonthlyContribution === Math.ceil((T - C) / M)
        const remainingAmount = target - current
        const expectedContribution = Math.ceil(remainingAmount / remainingMonths)
        const actualContribution = calculateMonthlyContribution(target, current, targetInput, refInput)

        assert.equal(
          actualContribution,
          expectedContribution,
          `Suggested contribution for target ${target}, saved ${current}, ${remainingMonths} months must equal Math.ceil(${remainingAmount}/${remainingMonths}) = ${expectedContribution}, got ${actualContribution}`
        )

        // Sufficiency Invariant:
        // Saving `actualContribution` for M months is guaranteed to reach or exceed target
        const accumulatedTotal = current + actualContribution * remainingMonths
        assert.ok(
          accumulatedTotal >= target,
          `Accumulated total (${accumulatedTotal}) after ${remainingMonths} months of saving ${actualContribution} must reach or exceed target (${target})`
        )

        // Minimality Invariant:
        // Saving (actualContribution - 1) for M months is strictly insufficient to reach target
        if (actualContribution > 1) {
          const underfundedTotal = current + (actualContribution - 1) * remainingMonths
          assert.ok(
            underfundedTotal < target,
            `Underfunded total (${underfundedTotal}) with contribution ${actualContribution - 1} must fall short of target (${target})`
          )
        }

        // Positive integer guarantee:
        assert.ok(
          Number.isInteger(actualContribution),
          `Suggested contribution must be an integer, got ${actualContribution}`
        )
        assert.ok(
          actualContribution >= 1,
          `Suggested contribution must be >= 1 when target > current, got ${actualContribution}`
        )

        return true
      }
    ),
    { numRuns: 150 }
  )

  assert.ok(
    runCount >= MIN_PBT_RUNS,
    `Expected at least ${MIN_PBT_RUNS} iterations, evaluated ${runCount}`
  )
}

// ── Feature: sakukilat-core-roadmap, Property 20 (Sub-check A): Edge Cases & Boundary Invariants ──
// - Target reached or exceeded (C >= T) => contribution is 0
// - Target amount <= 0 => contribution is 0
// - Missing target date => contribution is 0
// - Target in the past or same month (M === 0) => contribution is full remaining amount (T - C)
{
  let boundaryCount = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 20 (Sub-check A): Edge Cases & Boundary Invariants',
    fc.property(
      arbRupiahAmount,
      arbRupiahAmount,
      arbReferenceDate,
      (amountA, amountB, refDate) => {
        boundaryCount++

        // Case 1: Target reached or exceeded (C >= T)
        const target = Math.min(amountA, amountB)
        const currentExceeded = Math.max(amountA, amountB)
        const futureDate = new Date(refDate.getFullYear() + 1, refDate.getMonth(), refDate.getDate())

        const contribCompleted = calculateMonthlyContribution(target, currentExceeded, futureDate, refDate)
        assert.equal(
          contribCompleted,
          0,
          `Contribution must be 0 when current (${currentExceeded}) >= target (${target})`
        )

        // Case 2: Target <= 0
        const contribZeroTarget = calculateMonthlyContribution(0, 0, futureDate, refDate)
        assert.equal(contribZeroTarget, 0, 'Contribution must be 0 when target is 0')

        const contribNegativeTarget = calculateMonthlyContribution(-500_000, 0, futureDate, refDate)
        assert.equal(contribNegativeTarget, 0, 'Contribution must be 0 when target is negative')

        // Case 3: Missing or invalid target date
        if (target > 0) {
          assert.equal(calculateMonthlyContribution(target, 0, null, refDate), 0, 'Null target date')
          assert.equal(calculateMonthlyContribution(target, 0, undefined, refDate), 0, 'Undefined target date')
          assert.equal(calculateMonthlyContribution(target, 0, '', refDate), 0, 'Empty string target date')
        }

        // Case 4: Target due within same month or overdue (M === 0)
        if (target > 0 && currentExceeded > target) {
          const sameMonthDate = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate())
          const remainingAmount = currentExceeded - target
          // Using currentExceeded as target and target as current so T > C
          const contribSameMonth = calculateMonthlyContribution(currentExceeded, target, sameMonthDate, refDate)
          assert.equal(
            contribSameMonth,
            remainingAmount,
            `When M === 0, contribution must equal full remaining amount (${remainingAmount}), got ${contribSameMonth}`
          )
        }

        return true
      }
    ),
    { numRuns: 120 }
  )

  assert.ok(boundaryCount >= MIN_PBT_RUNS)
  console.log(`    Sub-check A verified with ${boundaryCount} runs across boundary conditions.`)
}

// ── Feature: sakukilat-core-roadmap, Property 20 (Sub-check B): Model Consistency (createGoal & enhanceGoal) ──
// Verifies that createGoal and enhanceGoal correctly compute and persist monthlyContributionRequired
// matching Math.ceil((T - C) / M).
{
  let modelCheckCount = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 20 (Sub-check B): Model Consistency (createGoal & enhanceGoal)',
    fc.property(
      arbTargetAndCurrent,
      arbReferenceDate,
      fc.integer({ min: 1, max: 60 }),
      fc.string({ minLength: 1, maxLength: 30 }),
      ({ target, current }, refDate, monthsAhead, name) => {
        modelCheckCount++

        const targetYear = refDate.getFullYear() + Math.floor((refDate.getMonth() + monthsAhead) / 12)
        const targetMonth = (refDate.getMonth() + monthsAhead) % 12
        const targetDay = Math.min(28, refDate.getDate())
        const targetDateStr = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`

        const remainingAmount = target - current
        const expectedContribution = Math.ceil(remainingAmount / monthsAhead)

        // Test createGoal
        const created = createGoal(
          {
            name,
            targetAmount: target,
            currentAmount: current,
            targetDate: targetDateStr,
          },
          refDate
        )

        assert.equal(
          created.monthlyContributionRequired,
          expectedContribution,
          `createGoal monthlyContributionRequired must equal ${expectedContribution}, got ${created.monthlyContributionRequired}`
        )
        assert.equal(created.targetAmount, target)
        assert.equal(created.currentAmount, current)

        // Test enhanceGoal with legacy aliases (target, saved, deadline)
        const legacyGoal = {
          id: 'g_legacy_test',
          label: name,
          target,
          saved: current,
          deadline: targetDateStr,
          createdAt: toCalendarDateString(refDate),
        }

        const enhanced = enhanceGoal(legacyGoal, refDate)
        assert.equal(
          enhanced.monthlyContributionRequired,
          expectedContribution,
          `enhanceGoal monthlyContributionRequired must equal ${expectedContribution}, got ${enhanced.monthlyContributionRequired}`
        )

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(modelCheckCount >= MIN_PBT_RUNS)
  console.log(`    Sub-check B verified with ${modelCheckCount} runs on createGoal and enhanceGoal.`)
}

// ── Feature: sakukilat-core-roadmap, Property 20 (Sub-check C): Monotonicity Invariants ──
// 1. Monotonicity w.r.t. Remaining Amount:
//    (T1 - C1) >= (T2 - C2) ==> contribution(T1, C1, M) >= contribution(T2, C2, M)
// 2. Monotonicity w.r.t. Duration (Remaining Months M):
//    M2 > M1 >= 1 ==> contribution(rem, M2) <= contribution(rem, M1)
{
  let monotonicityCount = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 20 (Sub-check C): Monotonicity Invariants',
    fc.property(
      arbPositiveRupiahAmount,
      arbPositiveRupiahAmount,
      arbReferenceDate,
      fc.integer({ min: 1, max: 40 }),
      fc.integer({ min: 1, max: 40 }),
      (remAmount1, remAmount2, refDate, m1, m2) => {
        monotonicityCount++

        // 1. Monotonicity w.r.t. remaining amount with fixed duration M
        const targetA = remAmount1
        const targetB = remAmount2
        const fixedMonths = Math.max(1, m1)
        const targetYear = refDate.getFullYear() + Math.floor((refDate.getMonth() + fixedMonths) / 12)
        const targetMonth = (refDate.getMonth() + fixedMonths) % 12
        const targetDay = Math.min(28, refDate.getDate())
        const targetDate = new Date(targetYear, targetMonth, targetDay, 0, 0, 0, 0)

        const contribA = calculateMonthlyContribution(targetA, 0, targetDate, refDate)
        const contribB = calculateMonthlyContribution(targetB, 0, targetDate, refDate)

        if (targetA >= targetB) {
          assert.ok(
            contribA >= contribB,
            `Monotonicity w.r.t. amount violated: remA (${targetA}) >= remB (${targetB}), but contribA (${contribA}) < contribB (${contribB})`
          )
        } else {
          assert.ok(
            contribA <= contribB,
            `Monotonicity w.r.t. amount violated: remA (${targetA}) < remB (${targetB}), but contribA (${contribA}) > contribB (${contribB})`
          )
        }

        // 2. Monotonicity w.r.t. duration with fixed remaining amount
        const shorterM = Math.min(m1, m2)
        const longerM = Math.max(m1, m2)

        const dateShort = new Date(
          refDate.getFullYear() + Math.floor((refDate.getMonth() + shorterM) / 12),
          (refDate.getMonth() + shorterM) % 12,
          targetDay
        )
        const dateLong = new Date(
          refDate.getFullYear() + Math.floor((refDate.getMonth() + longerM) / 12),
          (refDate.getMonth() + longerM) % 12,
          targetDay
        )

        const contribShorter = calculateMonthlyContribution(targetA, 0, dateShort, refDate)
        const contribLonger = calculateMonthlyContribution(targetA, 0, dateLong, refDate)

        assert.ok(
          contribLonger <= contribShorter,
          `Monotonicity w.r.t. duration violated: longer duration (${longerM} mo) yielded higher contribution (${contribLonger}) than shorter (${shorterM} mo: ${contribShorter})`
        )

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(monotonicityCount >= MIN_PBT_RUNS)
  console.log(`    Sub-check C verified with ${monotonicityCount} runs on monotonicity invariants.`)
}

// ── Feature: sakukilat-core-roadmap, Property 20 (Sub-check D): Floating-Point & Precision Invariance ──
// Ensures floating point amounts or string numeric inputs are sanitized cleanly to integer contributions
{
  let floatCount = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 20 (Sub-check D): Floating-Point & Precision Invariance',
    fc.property(
      fc.float({ min: 1, max: 10_000_000, noNaN: true }),
      fc.float({ min: 0, max: 10_000_000, noNaN: true }),
      arbReferenceDate,
      fc.integer({ min: 1, max: 24 }),
      (floatTarget, floatSaved, refDate, monthsAhead) => {
        floatCount++

        const targetYear = refDate.getFullYear() + Math.floor((refDate.getMonth() + monthsAhead) / 12)
        const targetMonth = (refDate.getMonth() + monthsAhead) % 12
        const targetDate = new Date(targetYear, targetMonth, Math.min(28, refDate.getDate()))

        const result = calculateMonthlyContribution(floatTarget, floatSaved, targetDate, refDate)

        // Invariant: Result must always be a clean integer
        assert.ok(
          Number.isInteger(result),
          `Result must be an integer, got ${result}`
        )
        assert.ok(
          result >= 0,
          `Result must be non-negative, got ${result}`
        )

        const sanitizedTarget = Math.max(0, Math.round(floatTarget))
        const sanitizedSaved = Math.max(0, Math.round(floatSaved))

        if (sanitizedTarget > sanitizedSaved) {
          const expected = Math.ceil((sanitizedTarget - sanitizedSaved) / monthsAhead)
          assert.equal(result, expected)
        } else {
          assert.equal(result, 0)
        }

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(floatCount >= MIN_PBT_RUNS)
  console.log(`    Sub-check D verified with ${floatCount} runs for floating point values.`)
}

// ── Concrete Edge Cases & Blueprint Examples ──────────────────────────────
{
  const ref = '2026-01-01'

  // Blueprint example: Target 8M, Current 3M, 10 months remaining -> 500.000 / month
  assert.equal(
    calculateMonthlyContribution(8_000_000, 3_000_000, '2026-11-01', ref),
    500_000,
    'Blueprint example 1: 8M target, 3M current, 10 months'
  )

  // Exact division: Target 12M, Current 0, 12 months remaining -> 1.000.000 / month
  assert.equal(
    calculateMonthlyContribution(12_000_000, 0, '2027-01-01', ref),
    1_000_000,
    'Exact division: 12M target, 0 current, 12 months'
  )

  // Inexact division with ceiling: Target 1M, Current 0, 3 months -> 333.334 / month
  assert.equal(
    calculateMonthlyContribution(1_000_000, 0, '2026-04-01', ref),
    Math.ceil(1_000_000 / 3),
    'Inexact division with ceil: 1M target, 3 months'
  )
  assert.equal(
    calculateMonthlyContribution(1_000_000, 0, '2026-04-01', ref),
    333_334
  )

  // Boundary: Target 100, Current 0, 7 months -> Math.ceil(100 / 7) = 15
  assert.equal(
    calculateMonthlyContribution(100, 0, '2026-08-01', ref),
    15,
    'Ceil check: 100 / 7 = 14.285... ceil is 15'
  )

  // Single month remaining (M === 1): Target 5M, Current 2M -> 3M / month
  assert.equal(
    calculateMonthlyContribution(5_000_000, 2_000_000, '2026-02-01', ref),
    3_000_000,
    'Single month remaining: exactly remaining amount'
  )

  // End of month transition: Jan 31 to Feb 28 -> 1 month
  assert.equal(
    calculateRemainingMonths('2026-02-28', '2026-01-31'),
    1,
    'Jan 31 to Feb 28 is 1 whole month'
  )
  assert.equal(
    calculateMonthlyContribution(2_000_000, 0, '2026-02-28', '2026-01-31'),
    2_000_000,
    'Jan 31 to Feb 28 contribution'
  )

  console.log('✓ Concrete edge case validations passed.')
}

console.log('\n✅ Property 20 (Goal Planner Suggested Contribution Calculation) PASSED all invariants with >= 100 iterations each!\n')
