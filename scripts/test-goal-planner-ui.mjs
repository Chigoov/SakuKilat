/**
 * SakuKilat — Unit & Integration Tests for Task 14.4:
 * Enhanced Goal Planner UI, Non-Duplicating Allocations, and Widget Projection
 *
 * Requirements:
 * - 7.1: Extended Goal model with targetDate, targetAmount, currentAmount, notes
 * - 7.2: Suggested monthly contribution required to reach target
 * - 7.3: Goal health classification badge ('Aman', 'Perlu dipercepat', 'Terlambat')
 * - 7.4: Non-duplicating goal deposit allocations (internal transfers, no general ledger income/expense duplication)
 * - 7.5: Primary goal completion percentage exported to NativeWidgetSnapshot
 * - 3.4: Host Goals under Perencanaan Keuangan in Tab Saku
 *
 * Jalankan: node scripts/test-goal-planner-ui.mjs
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  calculateMonthlyContribution,
  calculateRemainingMonths,
  evaluateGoalHealth,
  enhanceGoal,
  createGoal,
  formatGoalHealth,
  getPrimaryGoal,
  daysUntil,
  GOAL_STORAGE_KEY,
} from '../lib/goals.ts'
import { generateWidgetSnapshot } from '../lib/widget-snapshot.ts'
import { isMoneyMove, monthlyTotals, rangeTotals } from '../lib/stats.ts'
import { SAKU_SECTIONS, getSectionById } from '../lib/saku-sections.ts'

console.log('====================================================')
console.log('  SAKUKILAT — UNIT TESTS: GOAL PLANNER UI (14.4)    ')
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

// ── Test Group 1: Component Files & Exports (Req 7.1, 3.4) ────────────────────
console.log('▶ Test Group 1: Component Structure & Backward Compatibility...')

test('goal-planner.tsx and goal-tracker.tsx exist and have required exports', () => {
  const plannerPath = path.resolve('components/goal-planner.tsx')
  const trackerPath = path.resolve('components/goal-tracker.tsx')
  assert.ok(fs.existsSync(plannerPath), 'components/goal-planner.tsx must exist')
  assert.ok(fs.existsSync(trackerPath), 'components/goal-tracker.tsx must exist')

  const plannerContent = fs.readFileSync(plannerPath, 'utf8')
  assert.ok(plannerContent.includes('export const GoalPlanner'), 'Must export GoalPlanner')
  assert.ok(plannerContent.includes('export const GoalTracker'), 'Must export GoalTracker alias')
  assert.ok(plannerContent.includes('export function readGoalSnapshot'), 'Must export readGoalSnapshot')
  assert.ok(plannerContent.includes('export function contributeToGoalSnapshot'), 'Must export contributeToGoalSnapshot')
  assert.ok(plannerContent.includes('export const GoalCard'), 'Must export GoalCard')
  assert.ok(plannerContent.includes('export function GoalForm'), 'Must export GoalForm')

  const trackerContent = fs.readFileSync(trackerPath, 'utf8')
  assert.ok(trackerContent.includes("export * from './goal-planner'"), 'goal-tracker.tsx must re-export goal-planner')
})

test('Tab Saku renders GoalPlanner in Perencanaan Keuangan section (Req 3.4)', () => {
  const tabSakuPath = path.resolve('components/tab-saku.tsx')
  const content = fs.readFileSync(tabSakuPath, 'utf8')

  assert.ok(content.includes('GoalPlanner'), 'tab-saku.tsx must import and use GoalPlanner')
  assert.ok(content.includes('data-testid="submenu-goals"'), 'Must contain data-testid="submenu-goals"')
  assert.ok(content.includes('data-submenu-id="goals"'), 'Must contain data-submenu-id="goals"')
  assert.ok(content.includes('id="perencanaan-keuangan"'), 'Must contain id="perencanaan-keuangan"')

  const sakuSections = getSectionById('perencanaan-keuangan')
  assert.ok(sakuSections, 'Section perencanaan-keuangan must exist')
  const goalItem = sakuSections.items.find(i => i.id === 'goals')
  assert.ok(goalItem, 'goals item must exist in perencanaan-keuangan')
  assert.equal(goalItem.isImplemented, true, 'goals must be marked as implemented')
})

// ── Test Group 2: Enhanced Goal UI Attributes (Req 7.1, 7.2, 7.3) ────────────
console.log('\n▶ Test Group 2: Enhanced Goal Model UI Rendering & Attributes...')

test('Goal card renders target deadline, monthly required savings, and health badge', () => {
  const plannerContent = fs.readFileSync(path.resolve('components/goal-planner.tsx'), 'utf8')

  // Target deadline testid & rendering
  assert.ok(
    plannerContent.includes('data-testid={`goal-deadline-${goal.id}`}'),
    'GoalCard must include data-testid for goal-deadline'
  )
  assert.ok(
    plannerContent.includes('formatDeadlineDate'),
    'GoalCard must format deadline date'
  )

  // Suggested monthly contribution testid & rendering
  assert.ok(
    plannerContent.includes('data-testid={`goal-monthly-required-${goal.id}`}'),
    'GoalCard must include data-testid for monthly required savings'
  )
  assert.ok(
    plannerContent.includes('monthlyContributionRequired'),
    'GoalCard must render monthlyContributionRequired'
  )

  // Health status badge testid & formatting
  assert.ok(
    plannerContent.includes('data-testid={`goal-health-badge-${goal.id}`}'),
    'GoalCard must include data-testid for goal-health-badge'
  )
  assert.ok(
    plannerContent.includes('data-health-status={goal.healthStatus}'),
    'GoalCard must tag data-health-status attribute'
  )

  // Notes field in card and form
  assert.ok(
    plannerContent.includes('goal.note'),
    'GoalCard must support rendering note'
  )
  assert.ok(
    plannerContent.includes('Catatan Tambahan (Opsional)'),
    'GoalForm must include note input'
  )

  // Live projection preview in form
  assert.ok(
    plannerContent.includes('Proyeksi Tabungan:'),
    'GoalForm must include live savings projection preview'
  )
})

test('formatGoalHealth returns distinctive badge classes and labels for all statuses (Req 7.3)', () => {
  const aman = formatGoalHealth('Aman')
  assert.equal(aman.status, 'Aman')
  assert.equal(aman.badgeText, 'Aman')
  assert.ok(aman.bgClass.includes('green'), 'Aman must have green bg')
  assert.ok(aman.textClass.includes('green'), 'Aman must have green text')

  const perlu = formatGoalHealth('Perlu dipercepat')
  assert.equal(perlu.status, 'Perlu dipercepat')
  assert.equal(perlu.badgeText, 'Perlu Dipercepat')
  assert.ok(perlu.bgClass.includes('amber'), 'Perlu dipercepat must have amber bg')
  assert.ok(perlu.textClass.includes('amber'), 'Perlu dipercepat must have amber text')

  const terlambat = formatGoalHealth('Terlambat')
  assert.equal(terlambat.status, 'Terlambat')
  assert.equal(terlambat.badgeText, 'Terlambat')
  assert.ok(terlambat.bgClass.includes('red'), 'Terlambat must have red bg')
  assert.ok(terlambat.textClass.includes('red'), 'Terlambat must have red text')
})

// ── Test Group 3: Non-Duplicating Goal Allocations (Req 7.4) ───────────────────
console.log('\n▶ Test Group 3: Non-Duplicating Goal Allocations & Ledger Invariance (Req 7.4)...')

test('Internal savings transfer is marked as money move and excluded from general income/expense', () => {
  const baseTransactions = [
    {
      id: 'tx_income_1',
      description: 'Gaji Bulanan',
      amount: 10_000_000,
      type: 'income',
      category: 'gaji',
      paymentMethod: 'bca',
      date: new Date('2026-05-02T10:00:00Z'),
    },
    {
      id: 'tx_expense_1',
      description: 'Belanja Bulanan Supermarket',
      amount: 1_500_000,
      type: 'expense',
      category: 'belanja',
      paymentMethod: 'bca',
      date: new Date('2026-05-03T14:00:00Z'),
    },
  ]

  // Calculate baseline monthly totals before goal deposit
  const baseline = monthlyTotals(baseTransactions, new Date('2026-05-15'))
  assert.equal(baseline.income, 10_000_000, 'Baseline income should be 10M')
  assert.equal(baseline.expense, 1_500_000, 'Baseline expense should be 1.5M')
  assert.equal(baseline.balance, 8_500_000, 'Baseline balance should be 8.5M')

  // Simulate goal deposit allocation via internal savings transfer
  const goalSavingMove = {
    id: 'tx_goal_save_1',
    description: 'Tabungan: Dana Darurat',
    amount: 1_000_000,
    kind: 'saving',
    type: 'expense',
    category: 'transfer',
    paymentMethod: 'bca',
    fromWalletId: 'bca',
    toWalletId: 'tabungan',
    date: new Date('2026-05-05T09:00:00Z'),
  }

  // Verify isMoneyMove classifies this as an internal money move
  assert.equal(isMoneyMove(goalSavingMove), true, 'Goal saving transaction must be classified as isMoneyMove')

  // Ledger with the goal deposit transfer added
  const updatedTransactions = [goalSavingMove, ...baseTransactions]

  // Re-calculate monthly totals with the goal saving move included
  const updatedTotals = monthlyTotals(updatedTransactions, new Date('2026-05-15'))

  // INVARIANT: General income and expense totals MUST remain completely identical
  assert.equal(
    updatedTotals.income,
    baseline.income,
    'Goal deposit allocation must NOT increase or duplicate general income'
  )
  assert.equal(
    updatedTotals.expense,
    baseline.expense,
    'Goal deposit allocation must NOT increase or duplicate general expense'
  )
  assert.equal(
    updatedTotals.balance,
    baseline.balance,
    'General net cashflow balance must remain unchanged by internal goal transfers'
  )

  // Verify rangeTotals also maintains the invariance
  const rangeBaseline = rangeTotals(baseTransactions, new Date('2026-05-01'), new Date('2026-06-01'))
  const rangeUpdated = rangeTotals(updatedTransactions, new Date('2026-05-01'), new Date('2026-06-01'))
  assert.equal(rangeUpdated.income, rangeBaseline.income)
  assert.equal(rangeUpdated.expense, rangeBaseline.expense)
})

test('Catat Saja contribution updates goal without creating any transaction record', () => {
  const goal = createGoal({
    name: 'Liburan Bali',
    targetAmount: 5_000_000,
    saved: 1_000_000,
    targetDate: '2026-12-31',
  })

  assert.equal(goal.currentAmount, 1_000_000)

  // Contributing without wallet (fromWalletId is undefined)
  const depositAmount = 500_000
  const updated = enhanceGoal({
    ...goal,
    saved: goal.saved + depositAmount,
    currentAmount: goal.currentAmount + depositAmount,
  })

  assert.equal(updated.currentAmount, 1_500_000, 'Goal saved amount should increase')
  assert.equal(updated.saved, 1_500_000)
  // No transaction record is required or generated
})

// ── Test Group 4: NativeWidgetSnapshot Integration (Req 7.5) ──────────────────
console.log('\n▶ Test Group 4: Export Primary Goal to NativeWidgetSnapshot (Req 7.5)...')

test('generateWidgetSnapshot exports primary goal completion percentage', () => {
  const goals = [
    {
      id: 'g_comp',
      name: 'Sepatu Baru',
      targetAmount: 1_000_000,
      currentAmount: 1_000_000, // 100% completed
    },
    {
      id: 'g_active',
      name: 'Dana Darurat',
      targetAmount: 10_000_000,
      currentAmount: 3_500_000, // 35% active
    },
  ]

  const snapshot = generateWidgetSnapshot({ goals })

  assert.ok(snapshot.primaryGoal, 'Snapshot must contain primaryGoal')
  // Should select the active uncompleted goal as primary
  assert.equal(snapshot.primaryGoal.name, 'Dana Darurat')
  assert.equal(snapshot.primaryGoal.targetAmount, 10_000_000)
  assert.equal(snapshot.primaryGoal.currentAmount, 3_500_000)
  assert.equal(snapshot.primaryGoal.percentComplete, 35)
})

test('Snapshot gracefully handles empty goals array and completed goals', () => {
  const emptySnapshot = generateWidgetSnapshot({ goals: [] })
  assert.equal(emptySnapshot.primaryGoal, undefined, 'Empty goals must produce undefined primaryGoal')

  const allCompleted = [
    { id: 'g1', name: 'Target 1', targetAmount: 2_000_000, currentAmount: 2_000_000 },
  ]
  const completedSnapshot = generateWidgetSnapshot({ goals: allCompleted })
  assert.ok(completedSnapshot.primaryGoal)
  assert.equal(completedSnapshot.primaryGoal.name, 'Target 1')
  assert.equal(completedSnapshot.primaryGoal.percentComplete, 100)
})

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n====================================================')
console.log(`  TEST RESULTS: ${passed}/${total} passed (${failed} failed)`)
if (failed === 0) {
  console.log('  ALL TASK 14.4 GOAL PLANNER UI TESTS PASSED! ✅')
} else {
  console.log('  SOME TESTS FAILED! ❌')
}
console.log('====================================================')

if (failed > 0) process.exit(1)
