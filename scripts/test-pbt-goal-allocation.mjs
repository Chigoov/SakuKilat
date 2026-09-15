/**
 * SakuKilat — Property-Based Test Suite for Goal Allocation Ledger Invariance
 *
 * Feature: sakukilat-core-roadmap, Property 22: Goal Allocation Ledger Invariance
 * Validates: Requirements 7.4
 *
 * Property 22 Specification:
 * For any goal deposit allocation, the target goal's accumulated amount SHALL increase
 * by the allocated amount, while general income and expense ledger totals SHALL remain
 * unchanged (preventing double-counting).
 */

import assert from 'node:assert/strict'
import {
  fc,
  testProperty,
  MIN_PBT_RUNS,
  arbRupiahAmount,
  arbPositiveRupiahAmount,
  arbCalendarDate,
  arbPaymentMethod,
  arbCategory,
} from './pbt-harness.mjs'
import {
  createGoal,
  enhanceGoal,
  allocateGoalDeposit,
  calculateMonthlyContribution,
  evaluateGoalHealth,
  daysUntil,
} from '../lib/goals.ts'
import {
  monthlyTotals,
  rangeTotals,
  monthlyBudgetStatus,
  cashflowSummary,
  categoryBreakdown,
  dailyAggregates,
  isMoneyMove,
  dayKey,
} from '../lib/stats.ts'
import {
  toCalendarDateString,
  toTransactionDateParts,
  formatIDR,
} from '../lib/parser.ts'

console.log('====================================================')
console.log('  SAKUKILAT — PBT: GOAL ALLOCATION LEDGER INVARIANCE')
console.log('====================================================\n')

// ── Arbitrary Generators ──────────────────────────────────────────────────

/**
 * Arbitrary reference evaluation date between 2024 and 2028.
 */
const arbReferenceDate = fc
  .record({
    year: fc.integer({ min: 2024, max: 2028 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }),
  })
  .map(({ year, month, day }) => new Date(year, month - 1, day, 12, 0, 0, 0))

/**
 * Arbitrary goal record with valid target, saved, and deadline.
 */
const arbGoalRecord = fc
  .record({
    name: fc.string({ minLength: 2, maxLength: 25 }),
    targetAmount: fc.integer({ min: 500_000, max: 200_000_000 }),
    currentAmount: fc.integer({ min: 0, max: 50_000_000 }),
    monthsAhead: fc.integer({ min: 1, max: 36 }),
  })
  .chain(({ name, targetAmount, currentAmount, monthsAhead }) =>
    arbReferenceDate.map((ref) => {
      const targetYear = ref.getFullYear() + Math.floor((ref.getMonth() + monthsAhead) / 12)
      const targetMonth = (ref.getMonth() + monthsAhead) % 12
      const targetDay = Math.min(28, ref.getDate())
      const targetDate = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`

      return createGoal(
        {
          name,
          targetAmount,
          currentAmount: Math.min(currentAmount, targetAmount),
          targetDate,
          createdAt: toCalendarDateString(ref),
        },
        ref
      )
    })
  )

/**
 * Generates an arbitrary transaction ledger around a reference date.
 * Mixes standard expenses, incomes, and existing internal moves.
 */
function arbLedgerAround(refDate) {
  return fc
    .array(
      fc.record({
        id: fc.uuid().map((u) => `tx-${u.slice(0, 8)}`),
        description: fc.string({ minLength: 1, maxLength: 25 }),
        amount: fc.integer({ min: 5_000, max: 15_000_000 }),
        type: fc.constantFrom('expense', 'income'),
        category: arbCategory,
        paymentMethod: arbPaymentMethod,
        kind: fc.constantFrom('transaction', 'transaction', 'transaction', 'transfer', 'saving'),
        dayOffset: fc.integer({ min: -45, max: 45 }),
      }),
      { minLength: 0, maxLength: 20 }
    )
    .map((rawList) => {
      const seen = new Set()
      return rawList
        .filter((item) => {
          if (seen.has(item.id)) return false
          seen.add(item.id)
          return true
        })
        .map((item) => {
          const txDate = new Date(refDate.getTime() + item.dayOffset * 86_400_000)
          const tx = {
            id: item.id,
            description: item.description,
            amount: item.amount,
            type: item.type,
            category: item.kind === 'transaction' ? item.category : 'transfer',
            paymentMethod: item.paymentMethod,
            kind: item.kind,
            date: txDate,
          }
          if (item.kind !== 'transaction') {
            tx.fromWalletId = item.paymentMethod
            tx.toWalletId = 'tabungan'
          }
          return tx
        })
    })
}

// ── Feature: sakukilat-core-roadmap, Property 22: Goal Allocation Ledger Invariance ──
// Validates: Requirements 7.4
{
  let totalEvaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 22: Goal Allocation Ledger Invariance',
    fc.property(
      arbGoalRecord,
      arbPositiveRupiahAmount,
      arbReferenceDate,
      fc.option(arbPaymentMethod, { nil: undefined }), // undefined = Catat Saja, string = wallet
      fc.integer({ min: -15, max: 15 }), // Deposit day offset relative to refDate
      fc.integer({ min: 0, max: 20_000_000 }), // Monthly budget
      (initialGoal, depositAmount, refDate, fromWalletId, depositDayOffset, monthlyBudget) => {
        totalEvaluated++

        const depositDate = new Date(refDate.getTime() + depositDayOffset * 86_400_000)

        // Generate baseline ledger around refDate
        const baselineLedger = fc.sample(arbLedgerAround(refDate), 1)[0]

        // Record baseline financial aggregates prior to goal deposit
        const baselineMonthly = monthlyTotals(baselineLedger, refDate)
        const monthStart = new Date(refDate.getFullYear(), refDate.getMonth(), 1)
        const monthEnd = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 1)
        const baselineRange = rangeTotals(baselineLedger, monthStart, monthEnd)
        const baselineBudget = monthlyBudgetStatus(baselineLedger, monthlyBudget, refDate)
        const baselineCashflow = cashflowSummary(baselineLedger, refDate)
        const baselineCatExpense = categoryBreakdown(baselineLedger, refDate, 'expense')
        const baselineCatIncome = categoryBreakdown(baselineLedger, refDate, 'income')
        const baselineDaily = dailyAggregates(baselineLedger)

        const initialSaved = initialGoal.currentAmount ?? initialGoal.saved

        // Execute goal deposit allocation (Requirement 7.4)
        const allocationResult = allocateGoalDeposit(initialGoal, depositAmount, {
          fromWalletId,
          date: depositDate,
          referenceDate: refDate,
        })

        assert.ok(
          allocationResult !== null,
          'allocateGoalDeposit must return a valid result for positive allocation amount'
        )

        const { updatedGoal, savingTransaction } = allocationResult

        // ── 1. Goal Accumulation Invariant ──
        // The target goal's accumulated amount SHALL increase by the allocated amount
        const expectedSaved = initialSaved + Math.round(depositAmount)
        assert.equal(
          updatedGoal.currentAmount,
          expectedSaved,
          `Goal currentAmount must increase from ${initialSaved} by ${depositAmount} to ${expectedSaved}, got ${updatedGoal.currentAmount}`
        )
        assert.equal(
          updatedGoal.saved,
          expectedSaved,
          `Goal saved alias must match currentAmount (${expectedSaved})`
        )
        assert.equal(
          updatedGoal.id,
          initialGoal.id,
          'Goal identifier must remain stable across allocations'
        )
        assert.equal(
          updatedGoal.targetAmount,
          initialGoal.targetAmount,
          'Goal targetAmount must not be modified by deposit allocation'
        )

        // ── 2. Ledger Transaction Invariant ──
        // When funded from wallet: creates an internal savings transfer (kind: 'saving')
        // When "Catat saja" (no wallet): creates zero transactions
        if (fromWalletId) {
          assert.ok(savingTransaction, 'Must generate savingTransaction when fromWalletId is provided')
          assert.equal(
            savingTransaction.kind,
            'saving',
            "savingTransaction kind must be strictly 'saving'"
          )
          assert.equal(
            isMoneyMove(savingTransaction),
            true,
            'savingTransaction must be recognized as an internal money move'
          )
          assert.equal(
            savingTransaction.amount,
            Math.round(depositAmount),
            'savingTransaction amount must match allocated amount'
          )
          assert.equal(
            savingTransaction.fromWalletId,
            fromWalletId,
            'savingTransaction fromWalletId must match selected source wallet'
          )
          assert.equal(
            savingTransaction.toWalletId,
            'tabungan',
            "savingTransaction destination wallet must be 'tabungan'"
          )
        } else {
          assert.equal(
            savingTransaction,
            undefined,
            'When no fromWalletId is provided (Catat saja), zero transactions must be created'
          )
        }

        // Ledger with the allocation transaction (if generated)
        const updatedLedger = savingTransaction
          ? [savingTransaction, ...baselineLedger]
          : [...baselineLedger]

        // ── 3. General Ledger Totals Invariance (No Double-Counting) ──
        // General income and expense ledger totals SHALL remain unchanged

        // A. Monthly Totals Invariant
        const updatedMonthly = monthlyTotals(updatedLedger, refDate)
        assert.equal(
          updatedMonthly.income,
          baselineMonthly.income,
          `General income must remain identical (expected ${baselineMonthly.income}, got ${updatedMonthly.income})`
        )
        assert.equal(
          updatedMonthly.expense,
          baselineMonthly.expense,
          `General expense must remain identical (expected ${baselineMonthly.expense}, got ${updatedMonthly.expense})`
        )
        assert.equal(
          updatedMonthly.balance,
          baselineMonthly.balance,
          `General net cashflow balance must remain identical (expected ${baselineMonthly.balance}, got ${updatedMonthly.balance})`
        )

        // B. Range Totals Invariant
        const updatedRange = rangeTotals(updatedLedger, monthStart, monthEnd)
        assert.equal(
          updatedRange.income,
          baselineRange.income,
          `Range income must remain identical`
        )
        assert.equal(
          updatedRange.expense,
          baselineRange.expense,
          `Range expense must remain identical`
        )
        assert.equal(
          updatedRange.balance,
          baselineRange.balance,
          `Range net balance must remain identical`
        )

        // C. Monthly Budget Status Invariant
        const updatedBudget = monthlyBudgetStatus(updatedLedger, monthlyBudget, refDate)
        assert.equal(
          updatedBudget.spent,
          baselineBudget.spent,
          `Monthly budget spent must remain invariant (expected ${baselineBudget.spent}, got ${updatedBudget.spent})`
        )
        assert.equal(
          updatedBudget.remaining,
          baselineBudget.remaining,
          `Monthly budget remaining must remain invariant`
        )

        // D. Cashflow Summary Invariant
        const updatedCashflow = cashflowSummary(updatedLedger, refDate)
        assert.equal(
          updatedCashflow.income,
          baselineCashflow.income,
          `Cashflow summary income must remain invariant`
        )
        assert.equal(
          updatedCashflow.expense,
          baselineCashflow.expense,
          `Cashflow summary expense must remain invariant`
        )
        assert.equal(
          updatedCashflow.net,
          baselineCashflow.net,
          `Cashflow summary net must remain invariant`
        )

        // E. Category Breakdown Invariant
        const updatedCatExpense = categoryBreakdown(updatedLedger, refDate, 'expense')
        const updatedCatIncome = categoryBreakdown(updatedLedger, refDate, 'income')
        assert.deepEqual(
          updatedCatExpense,
          baselineCatExpense,
          'Category expense breakdown must not include goal allocations'
        )
        assert.deepEqual(
          updatedCatIncome,
          baselineCatIncome,
          'Category income breakdown must not include goal allocations'
        )

        // F. Daily Aggregates Invariant
        const depKey = dayKey(depositDate)
        const updatedDaily = dailyAggregates(updatedLedger)
        assert.equal(
          updatedDaily.get(depKey)?.expense ?? 0,
          baselineDaily.get(depKey)?.expense ?? 0,
          `Daily expense on deposit day (${depKey}) must not change`
        )
        assert.equal(
          updatedDaily.get(depKey)?.income ?? 0,
          baselineDaily.get(depKey)?.income ?? 0,
          `Daily income on deposit day (${depKey}) must not change`
        )

        return true
      }
    ),
    { numRuns: 150 }
  )

  assert.ok(
    totalEvaluated >= MIN_PBT_RUNS,
    `Expected at least ${MIN_PBT_RUNS} iterations, evaluated ${totalEvaluated}`
  )
}

// ── Feature: sakukilat-core-roadmap, Property 22 (Sub-check A): Sequential Multi-Goal & Multi-Deposit Invariance ──
// Verifies that arbitrary sequences of deposits across multiple goals accumulate accurately
// while maintaining total ledger invariance throughout the entire sequence.
{
  let seqEvaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 22 (Sub-check A): Sequential Multi-Goal & Multi-Deposit Invariance',
    fc.property(
      fc.array(arbGoalRecord, { minLength: 1, maxLength: 4 }),
      arbReferenceDate,
      fc.array(
        fc.record({
          goalIndex: fc.integer({ min: 0, max: 10 }), // Clamped modulo goals.length
          amount: fc.integer({ min: 10_000, max: 5_000_000 }),
          fromWalletId: fc.option(arbPaymentMethod, { nil: undefined }),
          dayOffset: fc.integer({ min: -10, max: 10 }),
        }),
        { minLength: 2, maxLength: 12 }
      ),
      (initialGoals, refDate, depositOperations) => {
        seqEvaluated++

        // Ensure distinct goal IDs
        const goalsMap = new Map()
        for (const g of initialGoals) {
          goalsMap.set(g.id, { ...g })
        }
        const goalList = [...goalsMap.values()]

        // Track expected accumulated deposit per goal
        const expectedAddedPerGoal = new Map(goalList.map((g) => [g.id, 0]))

        // Start with a baseline ledger
        let currentLedger = fc.sample(arbLedgerAround(refDate), 1)[0]
        const baselineMonthly = monthlyTotals(currentLedger, refDate)
        const baselineBudget = monthlyBudgetStatus(currentLedger, 10_000_000, refDate)

        // Sequentially execute all deposit allocations
        for (const op of depositOperations) {
          const targetGoal = goalList[op.goalIndex % goalList.length]
          const depositDate = new Date(refDate.getTime() + op.dayOffset * 86_400_000)

          const result = allocateGoalDeposit(targetGoal, op.amount, {
            fromWalletId: op.fromWalletId,
            date: depositDate,
            referenceDate: refDate,
          })

          assert.ok(result !== null)

          // Update tracking
          goalList[op.goalIndex % goalList.length] = result.updatedGoal
          expectedAddedPerGoal.set(
            targetGoal.id,
            expectedAddedPerGoal.get(targetGoal.id) + op.amount
          )

          if (result.savingTransaction) {
            currentLedger = [result.savingTransaction, ...currentLedger]
          }
        }

        // 1. Verify all goal accumulations match cumulative deposits
        for (const finalGoal of goalList) {
          const original = goalsMap.get(finalGoal.id)
          const originalSaved = original.currentAmount ?? original.saved
          const totalAdded = expectedAddedPerGoal.get(finalGoal.id)
          const expectedTotal = originalSaved + totalAdded

          assert.equal(
            finalGoal.currentAmount,
            expectedTotal,
            `Goal ${finalGoal.name} accumulated amount (${finalGoal.currentAmount}) must match initial (${originalSaved}) + added (${totalAdded}) = ${expectedTotal}`
          )
        }

        // 2. Verify total ledger invariance after all sequential allocations
        const finalMonthly = monthlyTotals(currentLedger, refDate)
        assert.equal(
          finalMonthly.income,
          baselineMonthly.income,
          'Sequential allocations must not alter total income'
        )
        assert.equal(
          finalMonthly.expense,
          baselineMonthly.expense,
          'Sequential allocations must not alter total expense'
        )
        assert.equal(
          finalMonthly.balance,
          baselineMonthly.balance,
          'Sequential allocations must not alter net balance'
        )

        const finalBudget = monthlyBudgetStatus(currentLedger, 10_000_000, refDate)
        assert.equal(
          finalBudget.spent,
          baselineBudget.spent,
          'Sequential allocations must not alter budget spent'
        )

        return true
      }
    ),
    { numRuns: 120 }
  )

  assert.ok(seqEvaluated >= MIN_PBT_RUNS)
  console.log(`    Sub-check A verified with ${seqEvaluated} runs across sequential multi-goal operations.`)
}

// ── Feature: sakukilat-core-roadmap, Property 22 (Sub-check B): Discriminative Contrast Against Normal Expense ──
// Proves non-vacuity: if a goal deposit were erroneously tagged as a standard expense (kind: 'transaction'),
// general expenses WOULD increase, whereas tagging as kind: 'saving' guarantees strict invariance.
{
  let contrastEvaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 22 (Sub-check B): Discriminative Contrast Against Normal Expense',
    fc.property(
      arbGoalRecord,
      arbPositiveRupiahAmount,
      arbReferenceDate,
      arbPaymentMethod,
      (goal, depositAmount, refDate, walletId) => {
        contrastEvaluated++

        const baselineLedger = fc.sample(arbLedgerAround(refDate), 1)[0]
        const baselineMonthly = monthlyTotals(baselineLedger, refDate)

        // Correct implementation: kind: 'saving'
        const correctResult = allocateGoalDeposit(goal, depositAmount, {
          fromWalletId: walletId,
          date: refDate,
          referenceDate: refDate,
        })
        assert.ok(correctResult?.savingTransaction)
        const correctLedger = [correctResult.savingTransaction, ...baselineLedger]
        const correctMonthly = monthlyTotals(correctLedger, refDate)

        // Invariant: Expense does NOT change with kind: 'saving'
        assert.equal(
          correctMonthly.expense,
          baselineMonthly.expense,
          'kind: saving must NOT increase general expense'
        )

        // Bug simulation / contrast: What if kind was 'transaction' (normal expense)?
        const buggyTransaction = {
          ...correctResult.savingTransaction,
          kind: 'transaction',
          category: 'lainnya',
        }
        const buggyLedger = [buggyTransaction, ...baselineLedger]
        const buggyMonthly = monthlyTotals(buggyLedger, refDate)

        // Contrast guarantee: Erroneous standard transaction WOULD increase expense
        assert.equal(
          buggyMonthly.expense,
          baselineMonthly.expense + depositAmount,
          `Standard transaction must increase expense by ${depositAmount} (proving non-vacuity)`
        )

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(contrastEvaluated >= MIN_PBT_RUNS)
  console.log(`    Sub-check B verified with ${contrastEvaluated} runs for discriminative contrast.`)
}

// ── Feature: sakukilat-core-roadmap, Property 22 (Sub-check C): Zero, Negative, and Non-Finite Allocation Immunity ──
// Validates that invalid amounts (0, negative, NaN, Infinity) are safely rejected without modifying
// goal state or emitting transactions.
{
  let invalidEvaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 22 (Sub-check C): Zero, Negative, and Non-Finite Allocation Immunity',
    fc.property(
      arbGoalRecord,
      fc.oneof(
        fc.constant(0),
        fc.integer({ min: -1_000_000_000, max: -1 }),
        fc.constant(Number.NaN),
        fc.constant(Number.POSITIVE_INFINITY),
        fc.constant(Number.NEGATIVE_INFINITY)
      ),
      arbReferenceDate,
      (goal, invalidAmount, refDate) => {
        invalidEvaluated++

        const result = allocateGoalDeposit(goal, invalidAmount, {
          fromWalletId: 'bca',
          referenceDate: refDate,
        })

        // Invariant: Invalid allocations must return null without mutating goal
        assert.equal(
          result,
          null,
          `allocateGoalDeposit must return null for invalid amount (${invalidAmount})`
        )

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(invalidEvaluated >= MIN_PBT_RUNS)
  console.log(`    Sub-check C verified with ${invalidEvaluated} runs across invalid amount boundaries.`)
}

// ── Feature: sakukilat-core-roadmap, Property 22 (Sub-check D): Goal Health & Projection Recalculation ──
// Verifies that goal allocations correctly trigger health updates and contribution reductions:
// - Pushing saved >= target turns health status into 'Aman' and required contribution to 0.
// - Partial allocations toward a future deadline strictly decrease or maintain required monthly contribution.
{
  let healthEvaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 22 (Sub-check D): Goal Health & Projection Recalculation',
    fc.property(
      fc.record({
        name: fc.string({ minLength: 2, maxLength: 20 }),
        targetAmount: fc.integer({ min: 1_000_000, max: 20_000_000 }),
        currentAmount: fc.integer({ min: 0, max: 500_000 }),
        monthsAhead: fc.integer({ min: 2, max: 24 }),
      }),
      arbReferenceDate,
      ({ name, targetAmount, currentAmount, monthsAhead }, refDate) => {
        healthEvaluated++

        const targetYear = refDate.getFullYear() + Math.floor((refDate.getMonth() + monthsAhead) / 12)
        const targetMonth = (refDate.getMonth() + monthsAhead) % 12
        const targetDate = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(Math.min(28, refDate.getDate())).padStart(2, '0')}`

        const initialGoal = createGoal(
          {
            name,
            targetAmount,
            currentAmount,
            targetDate,
            createdAt: toCalendarDateString(refDate),
          },
          refDate
        )

        const initialContribution = initialGoal.monthlyContributionRequired

        // 1. Partial allocation
        const partialDeposit = Math.max(10_000, Math.floor((targetAmount - currentAmount) / 3))
        const partialResult = allocateGoalDeposit(initialGoal, partialDeposit, { referenceDate: refDate })
        assert.ok(partialResult)

        // Required monthly contribution must non-increase (monotonically decrease or stay equal)
        assert.ok(
          partialResult.updatedGoal.monthlyContributionRequired <= initialContribution,
          `Contribution must non-increase after deposit: before ${initialContribution}, after ${partialResult.updatedGoal.monthlyContributionRequired}`
        )

        // 2. Full completion allocation
        const completingDeposit = targetAmount - (partialResult.updatedGoal.currentAmount ?? 0)
        const completedResult = allocateGoalDeposit(partialResult.updatedGoal, completingDeposit, { referenceDate: refDate })
        assert.ok(completedResult)

        // Invariant: Completed goal health is Aman, contribution is 0
        assert.equal(
          completedResult.updatedGoal.healthStatus,
          'Aman',
          'Completed goal must have healthStatus "Aman"'
        )
        assert.equal(
          completedResult.updatedGoal.monthlyContributionRequired,
          0,
          'Completed goal must require 0 monthly contribution'
        )

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(healthEvaluated >= MIN_PBT_RUNS)
  console.log(`    Sub-check D verified with ${healthEvaluated} runs on health & projection recalculation.`)
}

// ── Concrete Edge Cases & Blueprint Scenarios ─────────────────────────────
{
  console.log('\n▶ Running Concrete Blueprint Validations...')

  const ref = new Date('2026-05-15T12:00:00Z')

  // Concrete Scenario 1: Blueprint Goal "Dana Darurat"
  const goalDarurat = createGoal(
    {
      name: 'Dana Darurat',
      targetAmount: 10_000_000,
      currentAmount: 3_000_000,
      targetDate: '2026-11-15',
      createdAt: '2026-01-01',
    },
    ref
  )

  const baselineLedger = [
    {
      id: 'tx_income_gaji',
      description: 'Gaji Bulanan',
      amount: 15_000_000,
      type: 'income',
      category: 'gaji',
      paymentMethod: 'bca',
      date: new Date('2026-05-01T08:00:00Z'),
    },
    {
      id: 'tx_expense_belanja',
      description: 'Belanja Bulanan',
      amount: 4_000_000,
      type: 'expense',
      category: 'belanja',
      paymentMethod: 'bca',
      date: new Date('2026-05-03T14:00:00Z'),
    },
  ]

  const baselineTotals = monthlyTotals(baselineLedger, ref)
  assert.equal(baselineTotals.income, 15_000_000)
  assert.equal(baselineTotals.expense, 4_000_000)
  assert.equal(baselineTotals.balance, 11_000_000)

  // Allocate Rp1.000.000 from BCA
  const allocation = allocateGoalDeposit(goalDarurat, 1_000_000, {
    fromWalletId: 'bca',
    date: new Date('2026-05-10T10:00:00Z'),
    referenceDate: ref,
  })

  assert.ok(allocation)
  assert.equal(allocation.updatedGoal.currentAmount, 4_000_000)
  assert.equal(allocation.updatedGoal.saved, 4_000_000)
  assert.ok(allocation.savingTransaction)
  assert.equal(allocation.savingTransaction.amount, 1_000_000)
  assert.equal(allocation.savingTransaction.kind, 'saving')

  const updatedLedger = [allocation.savingTransaction, ...baselineLedger]
  const updatedTotals = monthlyTotals(updatedLedger, ref)

  // INVARIANT CHECK:
  assert.equal(updatedTotals.income, 15_000_000, 'Income must remain 15M')
  assert.equal(updatedTotals.expense, 4_000_000, 'Expense must remain 4M (NOT 5M)')
  assert.equal(updatedTotals.balance, 11_000_000, 'Net balance must remain 11M')

  // Concrete Scenario 2: "Catat Saja" (No Wallet)
  const catatSajaResult = allocateGoalDeposit(allocation.updatedGoal, 500_000, {
    referenceDate: ref,
  })
  assert.ok(catatSajaResult)
  assert.equal(catatSajaResult.updatedGoal.currentAmount, 4_500_000)
  assert.equal(catatSajaResult.savingTransaction, undefined)

  // Monthly totals still unaffected
  const catatSajaTotals = monthlyTotals(updatedLedger, ref)
  assert.equal(catatSajaTotals.income, 15_000_000)
  assert.equal(catatSajaTotals.expense, 4_000_000)
  assert.equal(catatSajaTotals.balance, 11_000_000)

  console.log('✓ Concrete blueprint validations passed successfully.')
}

console.log('\n✅ Property 22 (Goal Allocation Ledger Invariance) PASSED all invariants with >= 100 iterations each!\n')
