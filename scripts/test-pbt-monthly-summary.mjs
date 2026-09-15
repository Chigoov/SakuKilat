/**
 * SakuKilat — Property-Based Test Suite for Monthly Financial Close Summary Identity
 *
 * Feature: sakukilat-core-roadmap, Property 27: Monthly Financial Close Summary Identity
 * Validates: Requirements 9.2
 *
 * Property 27 Specification:
 * For any closed month, the compiled financial summary SHALL satisfy
 * `netSavings === totalIncome - totalExpense`, where `totalIncome` is the exact sum of
 * all income transactions in that month and `totalExpense` is the exact sum of all
 * expense transactions in that month.
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
  formatMonthId,
  parseMonthId,
  formatMonthLabel,
  matchesMonth,
  isMoneyMove,
  compileMonthlyFinancialSummary,
  createMonthlyCloseRecord,
  reopenMonthlyClose,
  recloseMonthlyClose,
  MonthlyCloseManager,
} from '../lib/monthly-close.ts'
import {
  toCalendarDateString,
  toTransactionDateParts,
} from '../lib/parser.ts'

console.log('====================================================================')
console.log('  SAKUKILAT — PBT: MONTHLY FINANCIAL CLOSE SUMMARY IDENTITY (PROP 27)')
console.log('====================================================================\n')

// ── Smart Domain Arbitraries ──────────────────────────────────────────────────

/**
 * Arbitrary target month definition between years 2020 and 2030.
 */
const arbTargetPeriod = fc.record({
  year: fc.integer({ min: 2020, max: 2030 }),
  month: fc.integer({ min: 1, max: 12 }),
})

/**
 * Helper to construct a date representation either in target month or outside.
 */
function makeDateFor(year, month, day, format) {
  const safeDay = Math.min(28, Math.max(1, day))
  const d = new Date(year, month - 1, safeDay, 12, 0, 0, 0)
  const yStr = String(year)
  const mStr = String(month).padStart(2, '0')
  const dStr = String(safeDay).padStart(2, '0')

  switch (format) {
    case 'date':
      return d
    case 'iso-date':
      return `${yStr}-${mStr}-${dStr}`
    case 'iso-datetime':
      return `${yStr}-${mStr}-${dStr}T12:00:00.000Z`
    case 'timestamp':
      return d.getTime()
    default:
      return d
  }
}

/**
 * Generates an arbitrary transaction that is either:
 * - Strictly inside target (year, month)
 * - Outside target month (previous month, next month, different year)
 */
function arbTransactionForPeriod(targetPeriod) {
  return fc.record({
    id: fc.uuid().map((uuid) => `tx-${uuid.slice(0, 8)}`),
    description: fc.string({ minLength: 1, maxLength: 30 }),
    amount: fc.oneof(arbRupiahAmount, arbPositiveRupiahAmount),
    type: fc.constantFrom('expense', 'income'),
    kind: fc.constantFrom('transaction', 'transfer', 'saving'),
    category: arbCategory,
    subcategory: fc.option(fc.string({ minLength: 1, maxLength: 15 }), { nil: undefined }),
    paymentMethod: arbPaymentMethod,
    // Month offset: 0 means inside target month, != 0 means outside target month
    monthOffset: fc.constantFrom(0, 0, 0, -1, 1, -12, 12),
    day: fc.integer({ min: 1, max: 28 }),
    dateFormat: fc.constantFrom('date', 'iso-date', 'iso-datetime', 'timestamp'),
  }).map(({ monthOffset, day, dateFormat, ...rest }) => {
    let txYear = targetPeriod.year
    let txMonth = targetPeriod.month + monthOffset
    while (txMonth < 1) {
      txMonth += 12
      txYear -= 1
    }
    while (txMonth > 12) {
      txMonth -= 12
      txYear += 1
    }

    const date = makeDateFor(txYear, txMonth, day, dateFormat)
    return {
      ...rest,
      date,
    }
  })
}

/**
 * Generates an arbitrary wallet reconciliation record.
 */
function arbReconciliationForPeriod(targetPeriod) {
  return fc.record({
    id: fc.uuid().map((uuid) => `rec-${uuid.slice(0, 8)}`),
    walletId: arbPaymentMethod,
    expectedBalance: arbRupiahAmount,
    difference: fc.integer({ min: -50_000_000, max: 50_000_000 }),
    monthOffset: fc.constantFrom(0, 0, -1, 1, -12),
    day: fc.integer({ min: 1, max: 28 }),
    dateFormat: fc.constantFrom('iso-datetime', 'iso-date', 'date'),
  }).map(({ difference, expectedBalance, monthOffset, day, dateFormat, ...rest }) => {
    let recYear = targetPeriod.year
    let recMonth = targetPeriod.month + monthOffset
    while (recMonth < 1) {
      recMonth += 12
      recYear -= 1
    }
    while (recMonth > 12) {
      recMonth -= 12
      recYear += 1
    }

    const reconciledAt = makeDateFor(recYear, recMonth, day, dateFormat)
    const actualBalance = expectedBalance + difference

    return {
      ...rest,
      expectedBalance,
      actualBalance,
      difference,
      reconciledAt: typeof reconciledAt === 'string'
        ? reconciledAt
        : (reconciledAt instanceof Date ? reconciledAt.toISOString() : new Date(reconciledAt).toISOString()),
    }
  })
}

// ── Feature: sakukilat-core-roadmap, Property 27: Monthly Financial Close Summary Identity ──
// Validates: Requirements 9.2
{
  let totalEvaluated = 0
  let totalTransactionsEvaluated = 0
  let totalReconciliationsEvaluated = 0

  testProperty(
    '// Feature: sakukilat-core-roadmap, Property 27: Monthly Financial Close Summary Identity',
    fc.property(
      arbTargetPeriod.chain((period) =>
        fc.record({
          period: fc.constant(period),
          transactions: fc.array(arbTransactionForPeriod(period), { minLength: 0, maxLength: 30 }),
          reconciliations: fc.array(arbReconciliationForPeriod(period), { minLength: 0, maxLength: 8 }),
          closedAtDate: fc.option(arbCalendarDate, { nil: undefined }),
        })
      ),
      ({ period, transactions, reconciliations, closedAtDate }) => {
        totalEvaluated++
        totalTransactionsEvaluated += transactions.length
        totalReconciliationsEvaluated += reconciliations.length

        const { year, month } = period

        // 1. Compile summary using compileMonthlyFinancialSummary
        const summary = compileMonthlyFinancialSummary({
          year,
          month,
          transactions,
          reconciliations,
        })

        // 2. Independently compute expected totals from ground truth transactions
        const inMonthTx = transactions.filter((tx) => matchesMonth(tx.date, year, month))

        let expectedIncome = 0
        let expectedExpense = 0
        let expectedIncomeCount = 0
        let expectedExpenseCount = 0
        let expectedTransferCount = 0

        for (const tx of inMonthTx) {
          if (isMoneyMove(tx)) {
            expectedTransferCount++
            continue
          }

          const nominal = Math.max(0, Math.round(Number(tx.amount) || 0))
          if (tx.type === 'income') {
            expectedIncome += nominal
            expectedIncomeCount++
          } else if (tx.type === 'expense') {
            expectedExpense += nominal
            expectedExpenseCount++
          }
        }

        const expectedNetSavings = expectedIncome - expectedExpense

        // Independently compute expected reconciliation variances
        const inMonthRecons = reconciliations.filter((r) => matchesMonth(r.reconciledAt, year, month))
        const expectedVariances = inMonthRecons.reduce(
          (sum, r) => sum + Math.round(Number(r.difference) || 0),
          0
        )

        // ── Invariant 1: Fundamental Mathematical Summary Identity ──
        // netSavings === totalIncome - totalExpense
        assert.equal(
          summary.netSavings,
          summary.incomeTotal - summary.expenseTotal,
          `Summary identity failed: netSavings (${summary.netSavings}) !== incomeTotal (${summary.incomeTotal}) - expenseTotal (${summary.expenseTotal})`
        )

        // ── Invariant 2: Exact Ground Truth Summation ──
        assert.equal(
          summary.incomeTotal,
          expectedIncome,
          `Income total mismatch: expected ${expectedIncome}, got ${summary.incomeTotal}`
        )
        assert.equal(
          summary.expenseTotal,
          expectedExpense,
          `Expense total mismatch: expected ${expectedExpense}, got ${summary.expenseTotal}`
        )
        assert.equal(
          summary.netSavings,
          expectedNetSavings,
          `Net savings mismatch: expected ${expectedNetSavings}, got ${summary.netSavings}`
        )

        // ── Invariant 3: Count and Partitioning Consistency ──
        assert.equal(
          summary.incomeCount,
          expectedIncomeCount,
          `Income count mismatch: expected ${expectedIncomeCount}, got ${summary.incomeCount}`
        )
        assert.equal(
          summary.expenseCount,
          expectedExpenseCount,
          `Expense count mismatch: expected ${expectedExpenseCount}, got ${summary.expenseCount}`
        )
        assert.equal(
          summary.transferCount,
          expectedTransferCount,
          `Transfer count mismatch: expected ${expectedTransferCount}, got ${summary.transferCount}`
        )
        assert.equal(
          summary.transactionCount,
          inMonthTx.length,
          `Transaction count mismatch: expected ${inMonthTx.length}, got ${summary.transactionCount}`
        )
        assert.equal(
          summary.transactionCount,
          summary.incomeCount + summary.expenseCount + summary.transferCount,
          `Total transaction count must equal sum of income, expense, and transfer counts`
        )

        // ── Invariant 4: Reconciliation Variance Aggregation ──
        assert.equal(
          summary.unreconciledVariances,
          expectedVariances,
          `Reconciliation variances mismatch: expected ${expectedVariances}, got ${summary.unreconciledVariances}`
        )
        assert.equal(
          summary.reconciliationsCount,
          inMonthRecons.length,
          `Reconciliations count mismatch: expected ${inMonthRecons.length}, got ${summary.reconciliationsCount}`
        )

        // ── Invariant 5: Integration with createMonthlyCloseRecord ──
        const record = createMonthlyCloseRecord({
          year,
          month,
          transactions,
          reconciliations,
          closedAt: closedAtDate,
        })

        // Record identifier format "YYYY-MM"
        const expectedMonthId = formatMonthId(year, month)
        assert.equal(record.id, expectedMonthId, `Record id must be canonical "YYYY-MM"`)
        assert.equal(record.year, year, 'Record year must match target year')
        assert.equal(record.month, month, 'Record month must match target month')

        // Record fields match summary exactly
        assert.equal(record.incomeTotal, summary.incomeTotal, 'Record incomeTotal matches summary')
        assert.equal(record.expenseTotal, summary.expenseTotal, 'Record expenseTotal matches summary')
        assert.equal(record.netSavings, summary.netSavings, 'Record netSavings matches summary')
        assert.equal(
          record.unreconciledVariances,
          summary.unreconciledVariances,
          'Record unreconciledVariances matches summary'
        )

        // Record mathematical identity holds
        assert.equal(
          record.netSavings,
          record.incomeTotal - record.expenseTotal,
          `MonthlyCloseRecord identity failed: netSavings !== incomeTotal - expenseTotal`
        )
        assert.equal(record.isReopened, false, 'New MonthlyCloseRecord isReopened must be false')

        return true
      }
    ),
    { numRuns: 150 }
  )

  console.log(
    `    Verified core identity with ${totalEvaluated} months, ${totalTransactionsEvaluated} transactions, and ${totalReconciliationsEvaluated} reconciliations.\n`
  )
}

// ── Sub-Property 27A: Temporal Isolation Invariant ────────────────────────────
// Transactions outside target month have strictly ZERO effect on monthly summary.
{
  testProperty(
    'Feature: sakukilat-core-roadmap, Property 27 (Sub-check A): Temporal Isolation Invariant',
    fc.property(
      arbTargetPeriod,
      fc.array(arbRupiahAmount, { minLength: 1, maxLength: 8 }),
      fc.array(arbRupiahAmount, { minLength: 1, maxLength: 8 }),
      (period, outsideIncomes, outsideExpenses) => {
        const { year, month } = period

        // Baseline: Target month transactions
        const baselineTransactions = [
          {
            id: 'tx-base-inc',
            description: 'Income in month',
            amount: 5_000_000,
            type: 'income',
            category: 'gaji',
            paymentMethod: 'bca',
            date: makeDateFor(year, month, 15, 'date'),
          },
          {
            id: 'tx-base-exp',
            description: 'Expense in month',
            amount: 2_000_000,
            type: 'expense',
            category: 'makanan',
            paymentMethod: 'bca',
            date: makeDateFor(year, month, 20, 'date'),
          },
        ]

        const baselineSummary = compileMonthlyFinancialSummary({
          year,
          month,
          transactions: baselineTransactions,
        })

        // Generate outside transactions (previous month, next month, other years)
        const prevMonth = month === 1 ? 12 : month - 1
        const prevYear = month === 1 ? year - 1 : year
        const nextMonth = month === 12 ? 1 : month + 1
        const nextYear = month === 12 ? year + 1 : year

        const outsideTransactions = [
          ...outsideIncomes.map((amt, idx) => ({
            id: `tx-out-inc-${idx}`,
            description: 'Outside Income',
            amount: amt,
            type: 'income',
            category: 'freelance',
            paymentMethod: 'mandiri',
            date: makeDateFor(prevYear, prevMonth, 10, 'date'),
          })),
          ...outsideExpenses.map((amt, idx) => ({
            id: `tx-out-exp-${idx}`,
            description: 'Outside Expense',
            amount: amt,
            type: 'expense',
            category: 'belanja',
            paymentMethod: 'cash',
            date: makeDateFor(nextYear, nextMonth, 10, 'date'),
          })),
        ]

        // Combined ledger
        const combinedSummary = compileMonthlyFinancialSummary({
          year,
          month,
          transactions: [...baselineTransactions, ...outsideTransactions],
        })

        // Summaries for target month must be identical
        assert.equal(
          combinedSummary.incomeTotal,
          baselineSummary.incomeTotal,
          'Income total must be invariant to outside transactions'
        )
        assert.equal(
          combinedSummary.expenseTotal,
          baselineSummary.expenseTotal,
          'Expense total must be invariant to outside transactions'
        )
        assert.equal(
          combinedSummary.netSavings,
          baselineSummary.netSavings,
          'Net savings must be invariant to outside transactions'
        )
        assert.equal(
          combinedSummary.transactionCount,
          baselineSummary.transactionCount,
          'Transaction count in target month must be invariant to outside transactions'
        )

        return true
      }
    ),
    { numRuns: 100 }
  )
}

// ── Sub-Property 27B: Internal Money Move Neutrality Invariant ────────────────
// Internal transfers/savings do NOT mutate income, expense, or net savings.
{
  testProperty(
    'Feature: sakukilat-core-roadmap, Property 27 (Sub-check B): Internal Money Move Neutrality',
    fc.property(
      arbTargetPeriod,
      fc.array(arbPositiveRupiahAmount, { minLength: 1, maxLength: 6 }),
      fc.constantFrom('transfer', 'saving'),
      (period, transferAmounts, moveKind) => {
        const { year, month } = period

        const regularTx = [
          {
            id: 'tx-reg-1',
            description: 'Salary',
            amount: 7_500_000,
            type: 'income',
            category: 'gaji',
            paymentMethod: 'bca',
            date: makeDateFor(year, month, 1, 'date'),
          },
          {
            id: 'tx-reg-2',
            description: 'Groceries',
            amount: 1_250_000,
            type: 'expense',
            category: 'belanja',
            paymentMethod: 'bca',
            date: makeDateFor(year, month, 10, 'date'),
          },
        ]

        const beforeSummary = compileMonthlyFinancialSummary({
          year,
          month,
          transactions: regularTx,
        })

        // Add internal money moves within target month
        const moneyMoves = transferAmounts.map((amt, idx) => ({
          id: `tx-move-${idx}`,
          description: `Internal move ${idx}`,
          amount: amt,
          type: 'expense',
          kind: moveKind,
          category: 'transfer',
          fromWalletId: 'bca',
          toWalletId: 'tunai',
          paymentMethod: 'bca',
          date: makeDateFor(year, month, 12, 'date'),
        }))

        const afterSummary = compileMonthlyFinancialSummary({
          year,
          month,
          transactions: [...regularTx, ...moneyMoves],
        })

        // Income, expense, and net savings MUST remain strictly identical
        assert.equal(
          afterSummary.incomeTotal,
          beforeSummary.incomeTotal,
          'Internal moves must not alter income total'
        )
        assert.equal(
          afterSummary.expenseTotal,
          beforeSummary.expenseTotal,
          'Internal moves must not alter expense total'
        )
        assert.equal(
          afterSummary.netSavings,
          beforeSummary.netSavings,
          'Internal moves must not alter net savings'
        )
        assert.equal(
          afterSummary.transferCount,
          moneyMoves.length,
          'Transfer count must accurately reflect internal moves'
        )
        assert.equal(
          afterSummary.transactionCount,
          beforeSummary.transactionCount + moneyMoves.length,
          'Total transaction count must include transfers'
        )

        return true
      }
    ),
    { numRuns: 100 }
  )
}

// ── Sub-Property 27C: Reopening and Reclosing Lifecycle Invariant ─────────────
// Reopened and reclosed periods maintain mathematical summary identity.
{
  testProperty(
    'Feature: sakukilat-core-roadmap, Property 27 (Sub-check C): Reopening and Reclosing Invariance',
    fc.property(
      arbTargetPeriod,
      fc.string({ minLength: 3, maxLength: 50 }).filter((s) => s.trim().length > 0),
      fc.array(arbTransactionForPeriod({ year: 2026, month: 5 }), { minLength: 1, maxLength: 10 }),
      (period, reopenNote, updatedTx) => {
        const { year, month } = period

        // 1. Initial close
        const initialRecord = createMonthlyCloseRecord({
          year,
          month,
          transactions: [],
        })
        assert.equal(initialRecord.isReopened, false, 'Initial state is not reopened')

        // 2. Reopen with audit note
        const reopenedRecord = reopenMonthlyClose(initialRecord, reopenNote)
        assert.equal(reopenedRecord.isReopened, true, 'isReopened must be true')
        assert.equal(reopenedRecord.reopenedNote, reopenNote.trim(), 'reopenedNote must match')
        assert.ok(typeof reopenedRecord.reopenedAt === 'string', 'reopenedAt must be populated')

        // 3. Reclose with updated transactions
        const reclosedRecord = recloseMonthlyClose(reopenedRecord, {
          transactions: updatedTx,
        })

        assert.equal(reclosedRecord.isReopened, false, 'Reclosed isReopened must be false')
        assert.equal(
          reclosedRecord.netSavings,
          reclosedRecord.incomeTotal - reclosedRecord.expenseTotal,
          'Reclosed record must preserve netSavings === incomeTotal - expenseTotal'
        )

        const expectedSummary = compileMonthlyFinancialSummary({
          year,
          month,
          transactions: updatedTx,
        })
        assert.equal(
          reclosedRecord.incomeTotal,
          expectedSummary.incomeTotal,
          'Reclosed incomeTotal matches updated transaction summary'
        )
        assert.equal(
          reclosedRecord.expenseTotal,
          expectedSummary.expenseTotal,
          'Reclosed expenseTotal matches updated transaction summary'
        )
        assert.equal(
          reclosedRecord.netSavings,
          expectedSummary.netSavings,
          'Reclosed netSavings matches updated transaction summary'
        )

        return true
      }
    ),
    { numRuns: 100 }
  )
}

// ── Sub-Property 27D: MonthlyCloseManager Namespace Consistency ──────────────
// MonthlyCloseManager static class matches standalone functional implementation.
{
  testProperty(
    'Feature: sakukilat-core-roadmap, Property 27 (Sub-check D): MonthlyCloseManager Namespace Parity',
    fc.property(
      arbTargetPeriod,
      fc.array(arbTransactionForPeriod({ year: 2026, month: 3 }), { minLength: 0, maxLength: 15 }),
      (period, transactions) => {
        const { year, month } = period

        const directSummary = compileMonthlyFinancialSummary({ year, month, transactions })
        const mgrSummary = MonthlyCloseManager.compileMonthlyFinancialSummary({ year, month, transactions })

        assert.deepEqual(
          mgrSummary,
          directSummary,
          'MonthlyCloseManager.compileMonthlyFinancialSummary must produce identical output'
        )

        const directRecord = createMonthlyCloseRecord({ year, month, transactions })
        const mgrRecord = MonthlyCloseManager.createMonthlyCloseRecord({ year, month, transactions })

        assert.equal(mgrRecord.id, directRecord.id, 'Record id matches')
        assert.equal(mgrRecord.incomeTotal, directRecord.incomeTotal, 'incomeTotal matches')
        assert.equal(mgrRecord.expenseTotal, directRecord.expenseTotal, 'expenseTotal matches')
        assert.equal(mgrRecord.netSavings, directRecord.netSavings, 'netSavings matches')
        assert.equal(
          mgrRecord.netSavings,
          mgrRecord.incomeTotal - mgrRecord.expenseTotal,
          'Identity holds on class output'
        )

        return true
      }
    ),
    { numRuns: 100 }
  )
}

// ── Concrete Edge Cases ───────────────────────────────────────────────────────
console.log('Validating Concrete Edge Cases...')

// Edge Case 1: Empty month
{
  const emptySummary = compileMonthlyFinancialSummary({ year: 2026, month: 1, transactions: [] })
  assert.equal(emptySummary.incomeTotal, 0)
  assert.equal(emptySummary.expenseTotal, 0)
  assert.equal(emptySummary.netSavings, 0)
  assert.equal(emptySummary.netSavings, emptySummary.incomeTotal - emptySummary.expenseTotal)
  assert.equal(emptySummary.transactionCount, 0)
}

// Edge Case 2: Only income
{
  const txIncomeOnly = [
    { id: '1', description: 'Gaji', amount: 10_000_000, type: 'income', category: 'gaji', paymentMethod: 'bca', date: '2026-06-01' },
    { id: '2', description: 'Dividen', amount: 500_000, type: 'income', category: 'investasi', paymentMethod: 'bca', date: '2026-06-15' },
  ]
  const summary = compileMonthlyFinancialSummary({ year: 2026, month: 6, transactions: txIncomeOnly })
  assert.equal(summary.incomeTotal, 10_500_000)
  assert.equal(summary.expenseTotal, 0)
  assert.equal(summary.netSavings, 10_500_000)
  assert.equal(summary.netSavings, summary.incomeTotal - summary.expenseTotal)
}

// Edge Case 3: Only expenses (negative net savings / deficit)
{
  const txExpenseOnly = [
    { id: '1', description: 'Belanja', amount: 3_000_000, type: 'expense', category: 'belanja', paymentMethod: 'bca', date: '2026-07-05' },
  ]
  const summary = compileMonthlyFinancialSummary({ year: 2026, month: 7, transactions: txExpenseOnly })
  assert.equal(summary.incomeTotal, 0)
  assert.equal(summary.expenseTotal, 3_000_000)
  assert.equal(summary.netSavings, -3_000_000)
  assert.equal(summary.netSavings, summary.incomeTotal - summary.expenseTotal)
}

console.log('✓ Concrete edge case validations passed\n')
console.log('✅ Property 27 (Monthly Financial Close Summary Identity) PASSED all invariants with >= 100 iterations each!\n')
