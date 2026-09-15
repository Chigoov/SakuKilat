/**
 * SakuKilat — Unit & Invariant Tests for Task 14.1:
 * Goal Planner Core Logic, Monthly Contribution Math, and Health Status Evaluation
 *
 * Requirements:
 * - 7.1: Extend Goal model with targetDate, monthlyContributionRequired, and healthStatus
 * - 7.2: Calculate suggested monthly contribution required to reach target amount
 * - 7.3: Classify goal health into 'Aman', 'Perlu dipercepat', or 'Terlambat'
 * - Property 20: Suggested contribution equals Math.ceil((T - C) / M) for M >= 1
 * - Property 21: Evaluated health status strictly one of 'Aman', 'Perlu dipercepat', 'Terlambat'
 *
 * Jalankan: node scripts/test-goals-logic.mjs
 */

import assert from 'node:assert/strict'
import {
  calculateRemainingMonths,
  calculateMonthsBetween,
  calculateMonthlyContribution,
  evaluateGoalHealth,
  enhanceGoal,
  createGoal,
  formatGoalHealth,
  getPrimaryGoal,
  daysUntil,
  generateGoalId,
  toMidnightDate,
  GOAL_STORAGE_KEY,
} from '../lib/goals.ts'

console.log('====================================================')
console.log('  SAKUKILAT — UNIT TESTS: GOAL PLANNER (TASK 14.1)  ')
console.log('====================================================\n')

let passed = 0
let failed = 0
let total = 0

function test(name, fn) {
  total++
  try {
    fn()
    console.log(`  ✓ PASS: ${name}`)
    passed++
  } catch (e) {
    console.log(`  ✗ FAIL: ${name}`)
    console.log(`    → ${e.message}`)
    failed++
  }
}

// ── Group 1: Extended Goal Model & Factory Functions (Req 7.1) ───────────────
console.log('▶ Test Group 1: Extended Goal Model & Factories (Req 7.1)...')

test('createGoal initializes model with targetDate, monthly contribution, and healthStatus', () => {
  const refDate = '2026-05-01'
  const goal = createGoal(
    {
      name: 'Laptop Baru',
      targetAmount: 12000000,
      saved: 0,
      targetDate: '2027-05-01',
      note: 'Untuk kerja dan koding',
      createdAt: '2026-05-01',
    },
    refDate
  )

  assert(goal.id.startsWith('g_'), 'Goal id should start with g_')
  assert.equal(goal.name, 'Laptop Baru', 'Goal name should match')
  assert.equal(goal.label, 'Laptop Baru', 'Goal label alias should match')
  assert.equal(goal.targetAmount, 12000000, 'targetAmount should match')
  assert.equal(goal.target, 12000000, 'target alias should match')
  assert.equal(goal.currentAmount, 0, 'currentAmount should match')
  assert.equal(goal.saved, 0, 'saved alias should match')
  assert.equal(goal.targetDate, '2027-05-01', 'targetDate should match')
  assert.equal(goal.deadline, '2027-05-01', 'deadline alias should match')
  assert.equal(goal.note, 'Untuk kerja dan koding', 'note should match')
  assert.equal(goal.monthlyContributionRequired, 1000000, '12M over 12 months should be 1M/month')
  assert.equal(goal.healthStatus, 'Aman', 'Fresh goal should be Aman')
})

test('enhanceGoal wraps legacy Goal model with backward compatible aliases', () => {
  const legacyGoal = {
    id: 'g_legacy123',
    label: 'Tabungan Darurat',
    target: 5000000,
    saved: 2000000,
    deadline: '2026-11-01',
    createdAt: '2026-05-01',
  }

  const enhanced = enhanceGoal(legacyGoal, '2026-05-01')

  assert.equal(enhanced.id, 'g_legacy123')
  assert.equal(enhanced.name, 'Tabungan Darurat')
  assert.equal(enhanced.label, 'Tabungan Darurat')
  assert.equal(enhanced.targetAmount, 5000000)
  assert.equal(enhanced.target, 5000000)
  assert.equal(enhanced.currentAmount, 2000000)
  assert.equal(enhanced.saved, 2000000)
  assert.equal(enhanced.targetDate, '2026-11-01')
  assert.equal(enhanced.deadline, '2026-11-01')
  // Remaining: 3M over 6 months = 500k/month
  assert.equal(enhanced.monthlyContributionRequired, 500000)
  assert.equal(enhanced.healthStatus, 'Aman')
})

test('createGoal clamps negative numbers to zero safely', () => {
  const goal = createGoal({
    name: 'Invalid Goal',
    targetAmount: -500000,
    currentAmount: -10000,
  })

  assert.equal(goal.targetAmount, 0)
  assert.equal(goal.currentAmount, 0)
  assert.equal(goal.monthlyContributionRequired, 0)
  assert.equal(goal.healthStatus, 'Aman')
})

// ── Group 2: Calendar Math: Remaining Months & Months Between ────────────────
console.log('\n▶ Test Group 2: Calendar Math (Remaining Months & Months Between)...')

test('calculateRemainingMonths handles past and same-month dates', () => {
  const ref = '2026-05-15'
  assert.equal(calculateRemainingMonths('2026-05-14', ref), 0, 'Past date must yield 0 months')
  assert.equal(calculateRemainingMonths('2026-05-15', ref), 0, 'Same day must yield 0 months')
  assert.equal(calculateRemainingMonths('2026-05-31', ref), 0, 'Later in same month must yield 0 months')
  assert.equal(calculateRemainingMonths(null, ref), 0, 'Null target date must yield 0 months')
  assert.equal(calculateRemainingMonths(undefined, ref), 0, 'Undefined target date must yield 0 months')
})

test('calculateRemainingMonths handles whole months and partial months accurately', () => {
  const ref = '2026-05-15'
  assert.equal(calculateRemainingMonths('2026-06-15', ref), 1, 'Exactly 1 month away')
  assert.equal(calculateRemainingMonths('2026-06-10', ref), 0, 'Less than 1 month away (26 days)')
  assert.equal(calculateRemainingMonths('2026-06-20', ref), 1, '1 month and 5 days away')
  assert.equal(calculateRemainingMonths('2026-08-15', ref), 3, 'Exactly 3 months away')
  assert.equal(calculateRemainingMonths('2026-08-14', ref), 2, '1 day shy of 3 months is 2 whole months')
  assert.equal(calculateRemainingMonths('2027-05-15', ref), 12, 'Exactly 1 year away (12 months)')
})

test('calculateRemainingMonths handles end-of-month transitions (Jan 31 to Feb 28)', () => {
  const jan31 = '2026-01-31'
  assert.equal(calculateRemainingMonths('2026-02-28', jan31), 1, 'Jan 31 to Feb 28 is 1 whole calendar month')
  assert.equal(calculateRemainingMonths('2026-02-27', jan31), 0, 'Jan 31 to Feb 27 is 0 whole months')
  assert.equal(calculateRemainingMonths('2026-03-31', jan31), 2, 'Jan 31 to Mar 31 is 2 whole months')
})

test('calculateMonthsBetween calculates elapsed duration correctly', () => {
  assert.equal(calculateMonthsBetween('2026-01-01', '2026-06-01'), 5, 'Jan 1 to Jun 1 is 5 whole months')
  assert.equal(calculateMonthsBetween('2026-06-01', '2026-01-01'), 0, 'End before start yields 0')
  assert.equal(calculateMonthsBetween('2026-01-15', '2026-02-14'), 0, 'Less than 1 whole month yields 0')
  assert.equal(calculateMonthsBetween('2026-01-15', '2026-02-15'), 1, 'Exactly 1 whole month yields 1')
})

test('daysUntil calculates calendar days difference correctly', () => {
  const ref = '2026-05-10'
  assert.equal(daysUntil('2026-05-15', ref), 5)
  assert.equal(daysUntil('2026-05-10', ref), 0)
  assert.equal(daysUntil('2026-05-08', ref), -2)
  assert.equal(daysUntil(undefined, ref), null)
})

// ── Group 3: calculateMonthlyContribution (Req 7.2 & Property 20) ─────────────
console.log('\n▶ Test Group 3: Monthly Contribution Math (Req 7.2 / Property 20)...')

test('Property 20: suggested monthly contribution equals Math.ceil((T - C) / M) for M >= 1', () => {
  const ref = '2026-01-01'

  // Exact division: 10M target, 0 current, 10 months -> 1,000,000
  const c1 = calculateMonthlyContribution(10000000, 0, '2026-11-01', ref)
  assert.equal(c1, 1000000)

  // Inexact division with ceiling: 1,000,000 target, 0 current, 3 months -> 333,334
  const c2 = calculateMonthlyContribution(1000000, 0, '2026-04-01', ref)
  assert.equal(c2, Math.ceil(1000000 / 3))
  assert.equal(c2, 333334)

  // Blueprint example: Target 8M, Current 3M, 10 months remaining -> 500,000/month
  const c3 = calculateMonthlyContribution(8000000, 3000000, '2026-11-01', ref)
  assert.equal(c3, 500000)

  // Random sample verification of formula
  const target = 7500000
  const current = 1250000
  const remainingMonths = 7 // July to Feb
  const expected = Math.ceil((target - current) / remainingMonths)
  const actual = calculateMonthlyContribution(target, current, '2026-08-01', ref)
  assert.equal(actual, expected)
})

test('calculateMonthlyContribution returns 0 when goal is already completed or target is zero', () => {
  const ref = '2026-05-01'
  assert.equal(calculateMonthlyContribution(5000000, 5000000, '2026-12-01', ref), 0, 'Completed goal')
  assert.equal(calculateMonthlyContribution(5000000, 6000000, '2026-12-01', ref), 0, 'Exceeded target')
  assert.equal(calculateMonthlyContribution(0, 0, '2026-12-01', ref), 0, 'Zero target')
  assert.equal(calculateMonthlyContribution(-100000, 0, '2026-12-01', ref), 0, 'Negative target')
})

test('calculateMonthlyContribution returns 0 when no target date is specified', () => {
  assert.equal(calculateMonthlyContribution(5000000, 1000000, null), 0)
  assert.equal(calculateMonthlyContribution(5000000, 1000000, undefined), 0)
  assert.equal(calculateMonthlyContribution(5000000, 1000000, ''), 0)
})

test('calculateMonthlyContribution returns remaining amount when M === 0', () => {
  const ref = '2026-05-15'
  // Deadline within current month: must save entire remaining amount
  assert.equal(calculateMonthlyContribution(5000000, 3000000, '2026-05-25', ref), 2000000)
  // Deadline today: must save entire remaining amount
  assert.equal(calculateMonthlyContribution(5000000, 1000000, '2026-05-15', ref), 4000000)
})

// ── Group 4: evaluateGoalHealth (Req 7.3 & Property 21) ───────────────────────
console.log('\n▶ Test Group 4: Goal Health Evaluation (Req 7.3 / Property 21)...')

test('Property 21: Returns "Aman" when goal is completed or exceeded', () => {
  const ref = '2026-05-01'
  assert.equal(evaluateGoalHealth(5000000, 5000000, '2026-12-01', ref), 'Aman')
  assert.equal(evaluateGoalHealth(5000000, 6000000, '2026-12-01', ref), 'Aman')
  // Even if deadline is past, completed goal is Aman
  assert.equal(evaluateGoalHealth(5000000, 5000000, '2026-01-01', ref), 'Aman')
})

test('Property 21: Returns "Terlambat" when targetDate is in the past and target not reached', () => {
  const ref = '2026-05-15'
  // Past deadline by 1 day
  assert.equal(evaluateGoalHealth(5000000, 4900000, '2026-05-14', ref), 'Terlambat')
  // Past deadline by months
  assert.equal(evaluateGoalHealth(10000000, 2000000, '2026-01-01', ref), 'Terlambat')
})

test('Property 21: Returns "Aman" when current savings pace meets or exceeds required contribution', () => {
  // Goal created Jan 1, 2026. Target Dec 31, 2026 (12 months). Target: 12,000,000.
  // Reference date: July 1, 2026 (6 months elapsed, 6 months remaining).
  // Current saved: 6,000,000. Pace: 1M/month. Required: (12M - 6M) / 6 = 1M/month.
  // 1M >= 1M -> Aman!
  const status1 = evaluateGoalHealth(
    12000000,
    6000000,
    '2027-01-01',
    '2026-07-01',
    { createdAt: '2026-01-01' }
  )
  assert.equal(status1, 'Aman')

  // Ahead of schedule: Saved 8,000,000 in 6 months. Pace: 1.33M/month. Required: 667k/month.
  const status2 = evaluateGoalHealth(
    12000000,
    8000000,
    '2027-01-01',
    '2026-07-01',
    { createdAt: '2026-01-01' }
  )
  assert.equal(status2, 'Aman')
})

test('Property 21: Returns "Perlu dipercepat" when current pace falls behind required contribution', () => {
  // Goal created Jan 1, 2026. Target Dec 31, 2026 (12 months). Target: 12,000,000.
  // Reference date: July 1, 2026 (6 months elapsed, 6 months remaining).
  // Current saved: 3,000,000. Pace: 500k/month. Required: (12M - 3M) / 6 = 1.5M/month.
  // 500k < 1.5M -> Perlu dipercepat!
  const status = evaluateGoalHealth(
    12000000,
    3000000,
    '2027-01-01',
    '2026-07-01',
    { createdAt: '2026-01-01' }
  )
  assert.equal(status, 'Perlu dipercepat')
})

test('evaluateGoalHealth handles new goals created in the current month', () => {
  const ref = '2026-05-15'
  // Brand new goal created today with 0 savings, target in 10 months -> Aman
  const statusNew = evaluateGoalHealth(
    10000000,
    0,
    '2027-03-15',
    ref,
    { createdAt: '2026-05-15' }
  )
  assert.equal(statusNew, 'Aman')

  // Goal created today with deadline this month with 0 savings -> Perlu dipercepat
  const statusUrgent = evaluateGoalHealth(
    10000000,
    0,
    '2026-05-20',
    ref,
    { createdAt: '2026-05-15' }
  )
  assert.equal(statusUrgent, 'Perlu dipercepat')
})

test('evaluateGoalHealth accepts a Goal object directly (polymorphic call)', () => {
  const goalOnTrack = {
    id: 'g1',
    name: 'Liburan',
    targetAmount: 6000000,
    currentAmount: 3000000,
    targetDate: '2027-01-01',
    createdAt: '2026-01-01',
  }

  // Ref date is 2026-07-01: 6 months elapsed (saved 3M, 500k/mo), 6 months left (need 3M, 500k/mo) -> Aman
  assert.equal(evaluateGoalHealth(goalOnTrack, undefined, undefined, '2026-07-01'), 'Aman')

  const goalBehind = {
    id: 'g2',
    name: 'Motor',
    targetAmount: 20000000,
    currentAmount: 2000000,
    targetDate: '2027-01-01',
    createdAt: '2026-01-01',
  }
  // Ref date 2026-07-01: 6 months elapsed (saved 2M, 333k/mo), 6 months left (need 18M, 3M/mo) -> Perlu dipercepat
  assert.equal(evaluateGoalHealth(goalBehind, undefined, undefined, '2026-07-01'), 'Perlu dipercepat')

  const goalExpired = {
    id: 'g3',
    name: 'Kado',
    targetAmount: 1000000,
    currentAmount: 500000,
    targetDate: '2026-04-01',
    createdAt: '2026-01-01',
  }
  // Ref date is 2026-05-01 (past targetDate 2026-04-01) -> Terlambat
  assert.equal(evaluateGoalHealth(goalExpired, undefined, undefined, '2026-05-01'), 'Terlambat')
})

// ── Group 5: Helpers: formatGoalHealth and getPrimaryGoal ─────────────────────
console.log('\n▶ Test Group 5: Helpers (formatGoalHealth & getPrimaryGoal)...')

test('formatGoalHealth returns proper color tokens and Indonesian labels', () => {
  const aman = formatGoalHealth('Aman')
  assert.equal(aman.status, 'Aman')
  assert.equal(aman.badgeText, 'Aman')
  assert.equal(aman.color, 'var(--sk-green)')

  const accelerated = formatGoalHealth('Perlu dipercepat')
  assert.equal(accelerated.status, 'Perlu dipercepat')
  assert.equal(accelerated.badgeText, 'Perlu Dipercepat')
  assert.equal(accelerated.color, 'var(--sk-amber)')

  const late = formatGoalHealth('Terlambat')
  assert.equal(late.status, 'Terlambat')
  assert.equal(late.badgeText, 'Terlambat')
  assert.equal(late.color, 'var(--sk-red)')
})

test('getPrimaryGoal returns the active uncompleted goal or first goal', () => {
  const goals = [
    { id: 'g1', name: 'Completed Goal', target: 1000000, saved: 1000000 },
    { id: 'g2', name: 'Primary Active Goal', target: 5000000, saved: 1500000, deadline: '2026-12-01' },
    { id: 'g3', name: 'Another Active Goal', target: 2000000, saved: 500000 },
  ]

  const primary = getPrimaryGoal(goals, '2026-05-01')
  assert(primary !== null)
  assert.equal(primary.id, 'g2', 'Primary should be first uncompleted goal with target > 0')
  assert.equal(primary.name, 'Primary Active Goal')

  // When all goals are completed, falls back to first goal
  const completedGoals = [
    { id: 'g1', name: 'Goal 1', target: 1000000, saved: 1000000 },
    { id: 'g2', name: 'Goal 2', target: 2000000, saved: 2000000 },
  ]
  const fallback = getPrimaryGoal(completedGoals, '2026-05-01')
  assert.equal(fallback.id, 'g1')

  // Empty array
  assert.equal(getPrimaryGoal([]), null)
})

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('\n====================================================')
console.log(`  TEST RESULTS: ${passed}/${total} passed (${failed} failed)`)
if (failed === 0) {
  console.log('  ALL TASK 14.1 GOAL PLANNER TESTS PASSED! ✅')
} else {
  console.log('  SOME TESTS FAILED! ❌')
}
console.log('====================================================')

if (failed > 0) {
  process.exit(1)
}
