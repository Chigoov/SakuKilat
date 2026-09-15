/**
 * SakuKilat — Property-Based Test Suite for Goal Health Classification
 *
 * Feature: sakukilat-core-roadmap, Property 21: Goal Health Classification
 * Validates: Requirements 7.3
 *
 * Property 21 Specification:
 * For any goal, the evaluated health status SHALL be strictly one of 'Aman',
 * 'Perlu dipercepat', or 'Terlambat', determined deterministically by whether
 * the current date is past targetDate ('Terlambat'), whether current pace meets
 * required monthly contribution ('Aman'), or falls behind ('Perlu dipercepat').
 *
 * Invariants Tested:
 * 1. Three-Valued Partition: Evaluated status is ALWAYS strictly one of
 *    'Aman' | 'Perlu dipercepat' | 'Terlambat' across all arbitrary inputs.
 * 2. Goal Completed / Met Invariant: When target <= 0 or current >= target,
 *    status is ALWAYS 'Aman', even if targetDate is past.
 * 3. Open-Ended Goal Invariant: When targetDate is missing / undefined / null,
 *    status is ALWAYS 'Aman'.
 * 4. Past Deadline Partition ('Terlambat'): For any uncompleted goal (target > current > 0),
 *    if targetDate < refDate (by calendar midnight), status is STRICTLY 'Terlambat'.
 * 5. Future / Today Deadline Partition (Non-'Terlambat'): If targetDate >= refDate,
 *    status CAN NEVER be 'Terlambat', and must be either 'Aman' or 'Perlu dipercepat'.
 * 6. Pace Sensitivity & Determinism: When targetDate >= refDate, status accurately
 *    reflects whether savings pace meets or falls behind the required monthly contribution.
 * 7. Polymorphism & Model Integration: evaluateGoalHealth, enhanceGoal, and createGoal
 *    yield identical health classifications.
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
  evaluateGoalHealth,
  calculateMonthlyContribution,
  calculateRemainingMonths,
  calculateMonthsBetween,
  enhanceGoal,
  createGoal,
  formatGoalHealth,
  toMidnightDate,
} from '../lib/goals.ts'
import {
  toCalendarDateString,
  toTransactionDateParts,
} from '../lib/parser.ts'

console.log('====================================================')
console.log('  SAKUKILAT — PBT: GOAL HEALTH CLASSIFICATION       ')
console.log('====================================================\n')

// ── Smart Arbitraries ─────────────────────────────────────────────────────────

const VALID_STATUSES = ['Aman', 'Perlu dipercepat', 'Terlambat']

/**
 * Arbitrary calendar date between years 2023 and 2032
 */
const arbReferenceDateString = fc
  .record({
    year: fc.integer({ min: 2023, max: 2030 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }), // Safe day valid in all months
  })
  .map(({ year, month, day }) => {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  })

/**
 * Arbitrary offset in days for target date relative to refDate:
 * - Negative: past deadline (-365 to -1)
 * - Zero: deadline is today (0)
 * - Positive: future deadline (1 to 1000 days)
 */
const arbDayOffset = fc.oneof(
  fc.integer({ min: -365, max: -1 }),
  fc.constant(0),
  fc.integer({ min: 1, max: 30 }),
  fc.integer({ min: 31, max: 365 }),
  fc.integer({ min: 366, max: 1200 })
)

/**
 * Generates an arbitrary goal scenario with varied target, current, dates, and pace.
 */
const arbGoalHealthScenario = fc
  .record({
    target: fc.integer({ min: -100_000, max: 50_000_000 }),
    current: fc.integer({ min: -50_000, max: 60_000_000 }),
    refDate: arbReferenceDateString,
    hasTargetDate: fc.boolean(),
    offsetDays: arbDayOffset,
    hasCreatedAt: fc.boolean(),
    createdOffsetMonths: fc.integer({ min: 0, max: 24 }),
    customPace: fc.option(fc.integer({ min: 0, max: 10_000_000 }), { nil: undefined }),
  })
  .map((s) => {
    let targetDate = undefined
    if (s.hasTargetDate) {
      const parts = toTransactionDateParts(s.refDate)
      const d = new Date(parts.year, parts.month - 1, parts.day + s.offsetDays, 12, 0, 0, 0)
      targetDate = toCalendarDateString(d)
    }

    let createdAt = undefined
    if (s.hasCreatedAt) {
      const parts = toTransactionDateParts(s.refDate)
      const d = new Date(parts.year, parts.month - 1 - s.createdOffsetMonths, parts.day, 12, 0, 0, 0)
      createdAt = toCalendarDateString(d)
    }

    return {
      target: s.target,
      current: s.current,
      refDate: s.refDate,
      targetDate,
      createdAt,
      customPace: s.customPace,
    }
  })

// ── Feature: sakukilat-core-roadmap, Property 21: Goal Health Classification ──
// Validates: Requirements 7.3
{
  let totalEvaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 21: Goal Health Classification',
    fc.property(arbGoalHealthScenario, ({ target, current, refDate, targetDate, createdAt, customPace }) => {
      totalEvaluated++

      const options = customPace !== undefined || createdAt !== undefined
        ? { createdAt, currentPace: customPace }
        : undefined

      const status = evaluateGoalHealth(target, current, targetDate, refDate, options)

      // 1. Three-Valued Partition Invariant
      assert.ok(
        VALID_STATUSES.includes(status),
        `Status must be strictly one of ['Aman', 'Perlu dipercepat', 'Terlambat'], got: "${status}"`
      )

      // 2. Format Helper Consistency
      const formatted = formatGoalHealth(status)
      assert.equal(formatted.status, status, 'formatGoalHealth status must match')
      assert.ok(formatted.label && formatted.label.length > 0, 'formatGoalHealth label must not be empty')
      assert.ok(formatted.badgeText && formatted.badgeText.length > 0, 'formatGoalHealth badgeText must not be empty')
      assert.ok(formatted.color && formatted.color.startsWith('var(--sk-'), 'color must reference valid CSS token')

      const normalizedTarget = Math.max(0, Math.round(target))
      const normalizedCurrent = Math.max(0, Math.round(current))

      // 3. Completed or Invalid Target Invariant ('Aman')
      if (normalizedTarget <= 0 || normalizedCurrent >= normalizedTarget) {
        assert.equal(
          status,
          'Aman',
          `Completed or zero-target goal must always have status 'Aman' (target: ${normalizedTarget}, current: ${normalizedCurrent}), got "${status}"`
        )
        return true
      }

      // 4. Open-Ended Goal Invariant ('Aman')
      if (!targetDate) {
        assert.equal(
          status,
          'Aman',
          `Open-ended goal without targetDate must always have status 'Aman', got "${status}"`
        )
        return true
      }

      // 5. Past Deadline Partition Invariant ('Terlambat')
      const refMidnight = toMidnightDate(refDate)
      const targetMidnight = toMidnightDate(targetDate)

      if (targetMidnight.getTime() < refMidnight.getTime()) {
        assert.equal(
          status,
          'Terlambat',
          `Uncompleted goal with past deadline must strictly be 'Terlambat' (targetDate: ${targetDate}, refDate: ${refDate}), got "${status}"`
        )
      } else {
        // Target date is today or in the future
        assert.notEqual(
          status,
          'Terlambat',
          `Goal with deadline today or in the future CANNOT be 'Terlambat' (targetDate: ${targetDate}, refDate: ${refDate}), got "${status}"`
        )
        assert.ok(
          status === 'Aman' || status === 'Perlu dipercepat',
          `Non-expired goal must be either 'Aman' or 'Perlu dipercepat', got "${status}"`
        )
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

// ── Property 21 (Sub-check A): Strict Deadline Boundary Conditions ───────────
// Validates: Requirements 7.3
// Tests exact day differences around reference date:
// - targetDate < refDate (yesterday, -5d, -30d) => strictly 'Terlambat'
// - targetDate == refDate (today) => NOT 'Terlambat' ('Aman' or 'Perlu dipercepat')
// - targetDate > refDate (tomorrow, +5d, +30d) => NOT 'Terlambat' ('Aman' or 'Perlu dipercepat')
{
  let subCheckAEvaluated = 0

  const arbBoundaryScenario = fc
    .record({
      refDate: arbReferenceDateString,
      targetAmount: fc.integer({ min: 100_000, max: 20_000_000 }),
      currentFraction: fc.integer({ min: 0, max: 99 }).map(n => n / 100), // strictly uncompleted
      offsetDays: fc.constantFrom(-60, -30, -7, -2, -1, 0, 1, 2, 7, 30, 60),
    })
    .map(({ refDate, targetAmount, currentFraction, offsetDays }) => {
      const currentAmount = Math.floor(targetAmount * currentFraction)
      const parts = toTransactionDateParts(refDate)
      const d = new Date(parts.year, parts.month - 1, parts.day + offsetDays, 12, 0, 0, 0)
      const targetDate = toCalendarDateString(d)

      return {
        refDate,
        targetAmount,
        currentAmount,
        offsetDays,
        targetDate,
      }
    })

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 21 (Sub-check A): Strict Deadline Boundary Conditions',
    fc.property(arbBoundaryScenario, ({ refDate, targetAmount, currentAmount, offsetDays, targetDate }) => {
      subCheckAEvaluated++

      const status = evaluateGoalHealth(targetAmount, currentAmount, targetDate, refDate)

      if (offsetDays < 0) {
        assert.equal(
          status,
          'Terlambat',
          `offsetDays=${offsetDays} (< 0) must yield 'Terlambat', got: ${status}`
        )
      } else {
        assert.notEqual(
          status,
          'Terlambat',
          `offsetDays=${offsetDays} (>= 0) must NOT yield 'Terlambat', got: ${status}`
        )
        assert.ok(
          status === 'Aman' || status === 'Perlu dipercepat',
          `offsetDays=${offsetDays} must yield 'Aman' or 'Perlu dipercepat', got: ${status}`
        )
      }

      return true
    }),
    { numRuns: 150 }
  )

  assert.ok(subCheckAEvaluated >= MIN_PBT_RUNS)
  console.log(`    Sub-check A verified with ${subCheckAEvaluated} runs across boundary offsets.`)
}

// ── Property 21 (Sub-check B): Pace Sensitivity and Mathematical Thresholding ─
// Validates: Requirements 7.3
// Verifies that when deadline is in the future (remainingMonths >= 1):
// - pace >= requiredMonthlyContribution => strictly 'Aman'
// - pace < requiredMonthlyContribution => strictly 'Perlu dipercepat'
{
  let subCheckBEvaluated = 0

  const arbPaceScenario = fc
    .record({
      refDate: arbReferenceDateString,
      targetAmount: fc.integer({ min: 1_000_000, max: 24_000_000 }),
      currentFraction: fc.integer({ min: 0, max: 80 }).map(n => n / 100),
      remainingMonths: fc.integer({ min: 1, max: 24 }),
      paceDeltaFactor: fc.constantFrom(-0.5, -0.1, -0.01, 0, 0.01, 0.1, 0.5),
    })
    .map(({ refDate, targetAmount, currentFraction, remainingMonths, paceDeltaFactor }) => {
      const currentAmount = Math.floor(targetAmount * currentFraction)
      const parts = toTransactionDateParts(refDate)
      const targetDateObj = new Date(parts.year, parts.month - 1 + remainingMonths, parts.day, 12, 0, 0, 0)
      const targetDate = toCalendarDateString(targetDateObj)

      const requiredContribution = calculateMonthlyContribution(
        targetAmount,
        currentAmount,
        targetDate,
        refDate
      )

      let customPace
      if (paceDeltaFactor === 0) {
        customPace = requiredContribution
      } else if (paceDeltaFactor < 0) {
        // Below required
        customPace = Math.max(0, Math.floor(requiredContribution * (1 + paceDeltaFactor)))
        if (customPace >= requiredContribution && requiredContribution > 0) {
          customPace = requiredContribution - 1
        }
      } else {
        // Above required
        customPace = Math.ceil(requiredContribution * (1 + paceDeltaFactor))
        if (customPace <= requiredContribution) {
          customPace = requiredContribution + 1
        }
      }

      return {
        refDate,
        targetAmount,
        currentAmount,
        targetDate,
        requiredContribution,
        customPace,
      }
    })

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 21 (Sub-check B): Pace Sensitivity & Mathematical Thresholding',
    fc.property(arbPaceScenario, ({ refDate, targetAmount, currentAmount, targetDate, requiredContribution, customPace }) => {
      subCheckBEvaluated++

      const status = evaluateGoalHealth(
        targetAmount,
        currentAmount,
        targetDate,
        refDate,
        { currentPace: customPace }
      )

      if (customPace >= requiredContribution) {
        assert.equal(
          status,
          'Aman',
          `Pace (${customPace}) >= Required (${requiredContribution}) must yield 'Aman', got: "${status}"`
        )
      } else {
        assert.equal(
          status,
          'Perlu dipercepat',
          `Pace (${customPace}) < Required (${requiredContribution}) must yield 'Perlu dipercepat', got: "${status}"`
        )
      }

      return true
    }),
    { numRuns: 150 }
  )

  assert.ok(subCheckBEvaluated >= MIN_PBT_RUNS)
  console.log(`    Sub-check B verified with ${subCheckBEvaluated} runs on pace thresholds.`)
}

// ── Property 21 (Sub-check C): Model Integration & Polymorphism Invariant ────
// Validates: Requirements 7.1, 7.3
// Verifies that evaluating health directly, passing a Goal object, using enhanceGoal,
// or creating a goal via createGoal all yield the identical healthStatus.
{
  let subCheckCEvaluated = 0

  const arbPolymorphicScenario = fc
    .record({
      id: fc.stringMatching(/^g_[a-z0-9]{6}$/),
      name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
      targetAmount: fc.integer({ min: 100_000, max: 10_000_000 }),
      currentAmount: fc.integer({ min: 0, max: 12_000_000 }),
      refDate: arbReferenceDateString,
      offsetDays: fc.constantFrom(-30, -5, -1, 0, 1, 15, 60, 180),
      elapsedMonths: fc.integer({ min: 0, max: 6 }),
    })
    .map((s) => {
      const refParts = toTransactionDateParts(s.refDate)
      const targetObj = new Date(refParts.year, refParts.month - 1, refParts.day + s.offsetDays, 12, 0, 0, 0)
      const targetDate = toCalendarDateString(targetObj)

      const createdObj = new Date(refParts.year, refParts.month - 1 - s.elapsedMonths, refParts.day, 12, 0, 0, 0)
      const createdAt = toCalendarDateString(createdObj)

      return {
        id: s.id,
        name: s.name,
        targetAmount: s.targetAmount,
        currentAmount: s.currentAmount,
        refDate: s.refDate,
        targetDate,
        createdAt,
      }
    })

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 21 (Sub-check C): Model Integration & Polymorphism',
    fc.property(arbPolymorphicScenario, ({ id, name, targetAmount, currentAmount, refDate, targetDate, createdAt }) => {
      subCheckCEvaluated++

      // 1. Direct function call
      const directStatus = evaluateGoalHealth(
        targetAmount,
        currentAmount,
        targetDate,
        refDate,
        { createdAt }
      )

      // 2. Goal object polymorphic call
      const goalObj = {
        id,
        label: name,
        name,
        target: targetAmount,
        targetAmount,
        saved: currentAmount,
        currentAmount,
        targetDate,
        deadline: targetDate,
        createdAt,
      }

      const objectStatus = evaluateGoalHealth(goalObj, undefined, undefined, refDate)

      assert.equal(
        objectStatus,
        directStatus,
        `Polymorphic object call status "${objectStatus}" must equal direct call "${directStatus}"`
      )

      // 3. enhanceGoal helper
      const enhanced = enhanceGoal(goalObj, refDate)
      assert.equal(
        enhanced.healthStatus,
        directStatus,
        `enhanceGoal healthStatus "${enhanced.healthStatus}" must equal direct call "${directStatus}"`
      )

      // 4. createGoal factory
      const created = createGoal(
        {
          name,
          targetAmount,
          saved: currentAmount,
          targetDate,
          createdAt,
        },
        refDate
      )
      assert.equal(
        created.healthStatus,
        directStatus,
        `createGoal healthStatus "${created.healthStatus}" must equal direct call "${directStatus}"`
      )

      return true
    }),
    { numRuns: 100 }
  )

  assert.ok(subCheckCEvaluated >= MIN_PBT_RUNS)
  console.log(`    Sub-check C verified with ${subCheckCEvaluated} runs for polymorphic callers.`)
}

// ── Concrete Edge Cases ───────────────────────────────────────────────────────
{
  const ref = '2026-06-01'

  // 1. Completed goal with past deadline: must be 'Aman'
  const c1 = evaluateGoalHealth(10_000_000, 10_000_000, '2026-05-01', ref)
  assert.equal(c1, 'Aman', 'Completed goal with past deadline must be Aman')

  // 2. Exceeded target goal: must be 'Aman'
  const c2 = evaluateGoalHealth(5_000_000, 7_000_000, '2026-01-01', ref)
  assert.equal(c2, 'Aman', 'Exceeded target goal must be Aman')

  // 3. Zero target goal: must be 'Aman'
  const c3 = evaluateGoalHealth(0, 0, '2026-07-01', ref)
  assert.equal(c3, 'Aman', 'Zero target goal must be Aman')

  // 4. Open-ended goal (no deadline): must be 'Aman'
  const c4 = evaluateGoalHealth(10_000_000, 2_000_000, undefined, ref)
  assert.equal(c4, 'Aman', 'Open-ended goal must be Aman')

  // 5. Uncompleted goal overdue by 1 day: must be 'Terlambat'
  const c5 = evaluateGoalHealth(10_000_000, 9_999_999, '2026-05-31', ref)
  assert.equal(c5, 'Terlambat', 'Overdue uncompleted goal must be Terlambat')

  // 6. Fresh goal created today with future deadline: must be 'Aman'
  const c6 = evaluateGoalHealth(12_000_000, 0, '2027-06-01', ref, { createdAt: '2026-06-01' })
  assert.equal(c6, 'Aman', 'Fresh goal with future deadline must be Aman')

  // 7. Goal with zero savings due in current month: must be 'Perlu dipercepat'
  const c7 = evaluateGoalHealth(1_000_000, 0, '2026-06-25', ref, { createdAt: '2026-06-01' })
  assert.equal(c7, 'Perlu dipercepat', 'Zero savings due in current month must be Perlu dipercepat')

  // 8. Goal exactly on track: 12M target, 6M saved in 6 months, 6 months left -> Aman
  const c8 = evaluateGoalHealth(12_000_000, 6_000_000, '2026-12-01', ref, { createdAt: '2025-12-01' })
  assert.equal(c8, 'Aman', 'Goal on track must be Aman')

  // 9. Goal behind schedule: 12M target, 2M saved in 6 months, 6 months left (need 1.67M/mo, pace is 333k/mo) -> Perlu dipercepat
  const c9 = evaluateGoalHealth(12_000_000, 2_000_000, '2026-12-01', ref, { createdAt: '2025-12-01' })
  assert.equal(c9, 'Perlu dipercepat', 'Goal behind schedule must be Perlu dipercepat')

  console.log('✓ Concrete edge case validations passed successfully.\n')
}

console.log('✅ Property 21 (Goal Health Classification) PASSED all invariants with >= 100 iterations each!\n')
