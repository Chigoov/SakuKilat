/**
 * SakuKilat — Property-Based Test Suite for Pre-Closing Checklist Evaluation
 *
 * Feature: sakukilat-core-roadmap, Property 26: Pre-Closing Checklist Evaluation
 * Validates: Requirements 9.1
 *
 * Property 26 Specification:
 * For any target calendar month M, the pre-closing checklist SHALL evaluate and
 * report violations if and only if there exist uncategorized transactions in M,
 * pending inbox transactions in M, active wallets unreconciled in M, or overdue
 * unpaid bills in M.
 */

import assert from 'node:assert/strict'
import {
  fc,
  testProperty,
  MIN_PBT_RUNS,
  arbRupiahAmount,
} from './pbt-harness.mjs'
import {
  formatMonthId,
  parseMonthId,
  formatMonthLabel,
  matchesMonth,
  isMoneyMove,
  isUncategorizedTransaction,
  isPendingInboxItemInMonth,
  isWalletReconciledInMonth,
  isBillOverdueInMonth,
  evaluatePreClosingChecklist,
  MonthlyCloseManager,
} from '../lib/monthly-close.ts'
import {
  toCalendarDateString,
  toTransactionDateParts,
} from '../lib/parser.ts'

console.log('====================================================')
console.log('  SAKUKILAT — PBT: PRE-CLOSING CHECKLIST (PROP 26)  ')
console.log('====================================================\n')

// ── Helpers & Generators ──────────────────────────────────────────────────────

function makeDateString(year, month, day) {
  const y = String(year).padStart(4, '0')
  const m = String(month).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const WALLET_IDS_POOL = ['cash', 'bca', 'mandiri', 'gopay', 'ovo', 'dana', 'seabank']

const VALID_CATEGORIES = [
  'makanan',
  'transportasi',
  'belanja',
  'tagihan',
  'hiburan',
  'kesehatan',
  'gaji',
  'investasi',
  'freelance',
]

const UNCATEGORIZED_VALUES = [
  '',
  '   ',
  'lainnya',
  'Lainnya',
  'LAINNYA',
  '  lainnya  ',
  'uncategorized',
  'Uncategorized',
  'UNCATEGORIZED',
  null,
  undefined,
]

// ── Feature: sakukilat-core-roadmap, Property 26: Pre-Closing Checklist Evaluation ──
// Validates: Requirements 9.1
// For any target calendar month M, the pre-closing checklist SHALL evaluate and
// report violations if and only if there exist uncategorized transactions in M,
// pending inbox transactions in M, active wallets unreconciled in M, or overdue
// unpaid bills in M.
{
  let totalEvaluated = 0
  let readyToCloseCount = 0
  let violationsEncounteredCount = 0

  // Arbitrary scenario generator
  const arbChecklistScenario = fc.record({
    targetYear: fc.integer({ min: 2023, max: 2028 }),
    targetMonth: fc.integer({ min: 1, max: 12 }),
    refYearOffset: fc.constantFrom(-1, 0, 1),
    refMonthOffset: fc.constantFrom(-2, -1, 0, 1, 2),
    refDay: fc.integer({ min: 1, max: 28 }),
    // Generate wallets
    walletsCount: fc.integer({ min: 1, max: 5 }),
    // Generate transactions
    transactions: fc.array(
      fc.record({
        id: fc.stringMatching(/^[a-z0-9_-]{4,10}$/),
        description: fc.stringMatching(/^[a-z0-9 ]{3,15}$/),
        amount: arbRupiahAmount,
        type: fc.constantFrom('expense', 'income'),
        kind: fc.constantFrom('transaction', 'transaction', 'transaction', 'transfer', 'saving'),
        isTargetMonth: fc.boolean(),
        day: fc.integer({ min: 1, max: 28 }),
        otherMonthOffset: fc.constantFrom(-3, -2, -1, 1, 2, 3),
        categoryType: fc.constantFrom('valid', 'uncategorized'),
        validCat: fc.constantFrom(...VALID_CATEGORIES),
        uncatVal: fc.constantFrom(...UNCATEGORIZED_VALUES),
      }),
      { minLength: 0, maxLength: 12 }
    ),
    // Generate inbox items
    inbox: fc.array(
      fc.record({
        id: fc.stringMatching(/^[a-z0-9_-]{4,10}$/),
        rawDescription: fc.stringMatching(/^[a-z0-9 ]{3,15}$/),
        amount: arbRupiahAmount,
        status: fc.constantFrom('pending', 'approved', 'rejected'),
        isTargetMonth: fc.boolean(),
        day: fc.integer({ min: 1, max: 28 }),
        otherMonthOffset: fc.constantFrom(-2, -1, 1, 2),
        confidence: fc.integer({ min: 10, max: 95 }).map(n => n / 100),
      }),
      { minLength: 0, maxLength: 8 }
    ),
    // Generate reconciliations
    reconciliations: fc.array(
      fc.record({
        walletIdx: fc.integer({ min: 0, max: 4 }),
        isTargetMonth: fc.boolean(),
        day: fc.integer({ min: 1, max: 28 }),
        otherMonthOffset: fc.constantFrom(-2, -1, 1, 2),
        difference: fc.integer({ min: -50000, max: 50000 }),
      }),
      { minLength: 0, maxLength: 6 }
    ),
    // Generate bills
    bills: fc.array(
      fc.record({
        id: fc.stringMatching(/^[a-z0-9_-]{4,10}$/),
        name: fc.stringMatching(/^[a-z0-9 ]{3,15}$/),
        amount: arbRupiahAmount,
        isActive: fc.boolean(),
        dueTiming: fc.constantFrom('target_past', 'target_future', 'prev_month', 'next_month'),
        dueDay: fc.integer({ min: 1, max: 28 }),
      }),
      { minLength: 0, maxLength: 6 }
    ),
    // Hidden wallets
    hideWalletIndexes: fc.array(fc.integer({ min: 0, max: 4 }), { minLength: 0, maxLength: 2 }),
  })

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 26: Pre-Closing Checklist Evaluation',
    fc.property(arbChecklistScenario, (scenario) => {
      totalEvaluated++

      const {
        targetYear,
        targetMonth,
        refYearOffset,
        refMonthOffset,
        refDay,
        walletsCount,
        hideWalletIndexes,
      } = scenario

      // Compute referenceDate
      let refYear = targetYear + refYearOffset
      let refMonth = targetMonth + refMonthOffset
      while (refMonth < 1) {
        refMonth += 12
        refYear -= 1
      }
      while (refMonth > 12) {
        refMonth -= 12
        refYear += 1
      }
      const referenceDate = new Date(refYear, refMonth - 1, refDay, 12, 0, 0)
      const refDateStr = toCalendarDateString(referenceDate)

      // 1. Build wallets
      const wallets = WALLET_IDS_POOL.slice(0, walletsCount).map((id, idx) => ({
        id,
        label: id.toUpperCase(),
        type: 'bank',
        balance: 1000000,
        keywords: [id],
      }))

      const hiddenWalletIds = Array.from(
        new Set(hideWalletIndexes.map(i => wallets[i]?.id).filter(Boolean))
      )

      // 2. Build reconciliations
      const reconciliations = scenario.reconciliations.map((r, idx) => {
        const targetWallet = wallets[r.walletIdx % wallets.length]
        let recYear = targetYear
        let recMonth = targetMonth
        if (!r.isTargetMonth) {
          recMonth = targetMonth + r.otherMonthOffset
          while (recMonth < 1) { recMonth += 12; recYear -= 1 }
          while (recMonth > 12) { recMonth -= 12; recYear += 1 }
        }
        return {
          id: `rec-${idx + 1}`,
          walletId: targetWallet.id,
          reconciledAt: new Date(recYear, recMonth - 1, r.day, 10, 0, 0).toISOString(),
          expectedBalance: 1000000,
          actualBalance: 1000000 + r.difference,
          difference: r.difference,
        }
      })

      // 3. Build transactions
      const transactions = scenario.transactions.map((t, idx) => {
        let tYear = targetYear
        let tMonth = targetMonth
        if (!t.isTargetMonth) {
          tMonth = targetMonth + t.otherMonthOffset
          while (tMonth < 1) { tMonth += 12; tYear -= 1 }
          while (tMonth > 12) { tMonth -= 12; tYear += 1 }
        }
        const date = new Date(tYear, tMonth - 1, t.day, 14, 0, 0)
        let category = t.validCat
        if (t.kind === 'transfer' || t.kind === 'saving') {
          category = 'transfer'
        } else if (t.categoryType === 'uncategorized') {
          category = t.uncatVal
        }
        return {
          id: `tx-${idx + 1}-${t.id}`,
          description: t.description,
          amount: t.amount,
          type: t.type,
          kind: t.kind,
          category,
          paymentMethod: 'bca',
          date,
        }
      })

      // 4. Build inbox items
      const inbox = scenario.inbox.map((item, idx) => {
        let iYear = targetYear
        let iMonth = targetMonth
        if (!item.isTargetMonth) {
          iMonth = targetMonth + item.otherMonthOffset
          while (iMonth < 1) { iMonth += 12; iYear -= 1 }
          while (iMonth > 12) { iMonth -= 12; iYear += 1 }
        }
        return {
          id: `inbox-${idx + 1}-${item.id}`,
          rawDescription: item.rawDescription,
          amount: item.amount,
          date: makeDateString(iYear, iMonth, item.day),
          status: item.status,
          confidence: item.confidence,
        }
      })

      // 5. Build bills
      const bills = scenario.bills.map((b, idx) => {
        let bYear = targetYear
        let bMonth = targetMonth
        let bDay = b.dueDay

        if (b.dueTiming === 'prev_month') {
          bMonth = targetMonth - 1
          if (bMonth < 1) { bMonth = 12; bYear -= 1 }
        } else if (b.dueTiming === 'next_month') {
          bMonth = targetMonth + 1
          if (bMonth > 12) { bMonth = 1; bYear += 1 }
        } else if (b.dueTiming === 'target_past') {
          // ensure it's in target month and strictly before refDay if ref is in target month
          bDay = Math.min(b.dueDay, Math.max(1, refDay - 1))
        } else if (b.dueTiming === 'target_future') {
          // ensure it's in target month and on or after refDay if ref is in target month
          bDay = Math.max(b.dueDay, Math.min(28, refDay + 1))
        }

        return {
          id: `bill-${idx + 1}-${b.id}`,
          name: b.name,
          amount: b.amount,
          categoryId: 'tagihan',
          paymentMethodId: 'bca',
          recurrence: 'monthly',
          dueDay: bDay,
          nextDueDate: makeDateString(bYear, bMonth, bDay),
          isActive: b.isActive,
        }
      })

      // ── Execute Pre-Closing Checklist ──
      const result = evaluatePreClosingChecklist({
        year: targetYear,
        month: targetMonth,
        transactions,
        inbox,
        wallets,
        reconciliations,
        bills,
        options: {
          referenceDate,
          hiddenWalletIds,
        },
      })

      // ── Independent Expected Values Calculation ──
      const expectedUncatTxs = transactions.filter(
        tx => matchesMonth(tx.date, targetYear, targetMonth) && isUncategorizedTransaction(tx)
      )

      const expectedPendingInbox = inbox.filter(item =>
        isPendingInboxItemInMonth(item, targetYear, targetMonth)
      )

      const hiddenSet = new Set(hiddenWalletIds)
      const expectedActiveWallets = wallets.filter(w => !hiddenSet.has(w.id))
      const expectedUnrecWallets = expectedActiveWallets.filter(
        w => !isWalletReconciledInMonth(w, reconciliations, targetYear, targetMonth)
      )

      const expectedOverdueBills = bills.filter(b =>
        isBillOverdueInMonth(b, targetYear, targetMonth, referenceDate)
      )

      const expectedChecklistViolations =
        (expectedUncatTxs.length > 0 ? 1 : 0) +
        (expectedPendingInbox.length > 0 ? 1 : 0) +
        (expectedUnrecWallets.length > 0 ? 1 : 0) +
        (expectedOverdueBills.length > 0 ? 1 : 0)

      const expectedTotalIssuesCount =
        expectedUncatTxs.length +
        expectedPendingInbox.length +
        expectedUnrecWallets.length +
        expectedOverdueBills.length

      const expectedIsReadyToClose = expectedChecklistViolations === 0

      // ── Invariant Assertions (Property 26) ──

      // Invariant 1: month and monthId structure
      assert.equal(result.year, targetYear, 'Result year must match target')
      assert.equal(result.month, targetMonth, 'Result month must match target')
      assert.equal(result.monthId, formatMonthId(targetYear, targetMonth), 'monthId format')

      // Invariant 2: Category 1 (Uncategorized transactions)
      assert.equal(
        result.items.uncategorizedTransactions.count,
        expectedUncatTxs.length,
        'uncategorizedTransactions count'
      )
      assert.equal(
        result.items.uncategorizedTransactions.isPassed,
        expectedUncatTxs.length === 0,
        'uncategorizedTransactions.isPassed iff count === 0'
      )
      assert.equal(
        result.items.uncategorizedTransactions.transactions.length,
        expectedUncatTxs.length,
        'uncategorizedTransactions list length'
      )

      // Invariant 3: Category 2 (Pending inbox items)
      assert.equal(
        result.items.pendingInbox.count,
        expectedPendingInbox.length,
        'pendingInbox count'
      )
      assert.equal(
        result.items.pendingInbox.isPassed,
        expectedPendingInbox.length === 0,
        'pendingInbox.isPassed iff count === 0'
      )
      assert.equal(
        result.items.pendingInbox.items.length,
        expectedPendingInbox.length,
        'pendingInbox items list length'
      )

      // Invariant 4: Category 3 (Unreconciled wallets)
      assert.equal(
        result.items.unreconciledWallets.count,
        expectedUnrecWallets.length,
        'unreconciledWallets count'
      )
      assert.equal(
        result.items.unreconciledWallets.isPassed,
        expectedUnrecWallets.length === 0,
        'unreconciledWallets.isPassed iff count === 0'
      )
      assert.equal(
        result.items.unreconciledWallets.wallets.length,
        expectedUnrecWallets.length,
        'unreconciledWallets list length'
      )

      // Invariant 5: Category 4 (Overdue bills)
      assert.equal(
        result.items.overdueBills.count,
        expectedOverdueBills.length,
        'overdueBills count'
      )
      assert.equal(
        result.items.overdueBills.isPassed,
        expectedOverdueBills.length === 0,
        'overdueBills.isPassed iff count === 0'
      )
      assert.equal(
        result.items.overdueBills.bills.length,
        expectedOverdueBills.length,
        'overdueBills list length'
      )

      // Invariant 6: Total Violations (0 to 4)
      assert.equal(
        result.totalViolations,
        expectedChecklistViolations,
        'totalViolations must equal count of failing categories'
      )

      // Invariant 7: Total Issues Count
      assert.equal(
        result.totalIssuesCount,
        expectedTotalIssuesCount,
        'totalIssuesCount must equal sum of item counts'
      )

      // Invariant 8: The Core Property 26 if-and-only-if Condition:
      // isReadyToClose is true if and only if totalViolations === 0
      assert.equal(
        result.isReadyToClose,
        expectedIsReadyToClose,
        `isReadyToClose (${result.isReadyToClose}) must equal expected (${expectedIsReadyToClose})`
      )
      assert.equal(
        result.isReadyToClose,
        result.totalViolations === 0,
        `isReadyToClose must strictly equal (totalViolations === 0)`
      )

      // Invariant 9: MonthlyCloseManager static class consistency
      const mgrResult = MonthlyCloseManager.evaluatePreClosingChecklist({
        year: targetYear,
        month: targetMonth,
        transactions,
        inbox,
        wallets,
        reconciliations,
        bills,
        options: { referenceDate, hiddenWalletIds },
      })
      assert.equal(mgrResult.isReadyToClose, result.isReadyToClose)
      assert.equal(mgrResult.totalViolations, result.totalViolations)
      assert.equal(mgrResult.totalIssuesCount, result.totalIssuesCount)

      if (result.isReadyToClose) {
        readyToCloseCount++
      } else {
        violationsEncounteredCount++
      }

      return true
    }),
    { numRuns: 150 }
  )

  assert.ok(
    totalEvaluated >= MIN_PBT_RUNS,
    `Expected at least ${MIN_PBT_RUNS} iterations, evaluated ${totalEvaluated}`
  )
  console.log(
    `    Coverage: ${readyToCloseCount} ready-to-close months, ${violationsEncounteredCount} months with violations.\n`
  )
}

// ── Property 26 (Sub-check A): Guaranteed Ready-to-Close on Clean Month ────────
// Validates: Requirements 9.1
// For any state where all transactions in month M have valid categories, no inbox
// items are pending in M, all active wallets are reconciled in M, and no bills
// in M are overdue, the checklist SHALL evaluate to isReadyToClose === true and
// totalViolations === 0.
{
  let cleanCheckCount = 0

  const arbCleanMonthScenario = fc.record({
    year: fc.integer({ min: 2024, max: 2030 }),
    month: fc.integer({ min: 1, max: 12 }),
    walletCount: fc.integer({ min: 1, max: 4 }),
    txCount: fc.integer({ min: 0, max: 8 }),
  })

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 26 (Sub-check A): Clean Month Guarantees Ready to Close',
    fc.property(arbCleanMonthScenario, ({ year, month, walletCount, txCount }) => {
      cleanCheckCount++

      const wallets = WALLET_IDS_POOL.slice(0, walletCount).map(id => ({
        id,
        label: id.toUpperCase(),
        type: 'bank',
        balance: 5000000,
        keywords: [id],
      }))

      // Every wallet has a reconciliation in target month
      const reconciliations = wallets.map((w, idx) => ({
        id: `rec-${idx + 1}`,
        walletId: w.id,
        reconciledAt: new Date(year, month - 1, 15, 10, 0, 0).toISOString(),
        expectedBalance: 5000000,
        actualBalance: 5000000,
        difference: 0,
      }))

      // Every transaction has a valid category or is a transfer
      const transactions = Array.from({ length: txCount }).map((_, idx) => ({
        id: `tx-clean-${idx + 1}`,
        description: `Transaksi Bersih ${idx + 1}`,
        amount: 25000 * (idx + 1),
        type: idx % 2 === 0 ? 'expense' : 'income',
        category: VALID_CATEGORIES[idx % VALID_CATEGORIES.length],
        paymentMethod: wallets[0].id,
        date: new Date(year, month - 1, (idx % 28) + 1, 12, 0, 0),
      }))

      // Inbox is either empty or items are already approved
      const inbox = [
        {
          id: 'inbox-approved',
          rawDescription: 'Bensin Shell',
          amount: 50000,
          date: makeDateString(year, month, 10),
          status: 'approved',
          confidence: 0.9,
        },
      ]

      // Bills are either inactive or due next month
      const nextMonthYear = month === 12 ? year + 1 : year
      const nextMonth = month === 12 ? 1 : month + 1
      const bills = [
        {
          id: 'bill-next-month',
          name: 'PLN Token',
          amount: 150000,
          categoryId: 'tagihan',
          paymentMethodId: wallets[0].id,
          recurrence: 'monthly',
          dueDay: 15,
          nextDueDate: makeDateString(nextMonthYear, nextMonth, 15),
          isActive: true,
        },
      ]

      const result = evaluatePreClosingChecklist({
        year,
        month,
        transactions,
        inbox,
        wallets,
        reconciliations,
        bills,
      })

      assert.equal(result.isReadyToClose, true, 'Clean state must be ready to close')
      assert.equal(result.totalViolations, 0, 'Clean state has 0 violations')
      assert.equal(result.totalIssuesCount, 0, 'Clean state has 0 issues')
      assert.equal(result.items.uncategorizedTransactions.isPassed, true)
      assert.equal(result.items.pendingInbox.isPassed, true)
      assert.equal(result.items.unreconciledWallets.isPassed, true)
      assert.equal(result.items.overdueBills.isPassed, true)

      return true
    }),
    { numRuns: 100 }
  )

  assert.ok(cleanCheckCount >= MIN_PBT_RUNS)
  console.log(`    Sub-check A verified with ${cleanCheckCount} clean runs.`)
}

// ── Property 26 (Sub-check B): Single Violation Necessity and Category Isolation ─
// Validates: Requirements 9.1
// Injecting exactly ONE category of violation into an otherwise clean month SHALL
// cause isReadyToClose === false, totalViolations === 1, and strictly fail ONLY
// that specific category while the remaining 3 categories pass.
{
  let singleViolationCount = 0

  const arbSingleViolationScenario = fc.record({
    year: fc.integer({ min: 2024, max: 2030 }),
    month: fc.integer({ min: 1, max: 12 }),
    violationType: fc.constantFrom(
      'uncategorized_tx',
      'pending_inbox',
      'unreconciled_wallet',
      'overdue_bill'
    ),
    uncatVal: fc.constantFrom(...UNCATEGORIZED_VALUES),
  })

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 26 (Sub-check B): Single Violation Category Isolation',
    fc.property(arbSingleViolationScenario, ({ year, month, violationType, uncatVal }) => {
      singleViolationCount++

      const wallet = {
        id: 'bca',
        label: 'BCA',
        type: 'bank',
        balance: 1000000,
        keywords: ['bca'],
      }

      // Base clean state:
      const baseWallets = [wallet]
      let baseReconciliations = [
        {
          id: 'rec-1',
          walletId: 'bca',
          reconciledAt: new Date(year, month - 1, 10, 0, 0, 0).toISOString(),
          expectedBalance: 1000000,
          actualBalance: 1000000,
          difference: 0,
        },
      ]
      let baseTransactions = [
        {
          id: 'tx-clean',
          description: 'Gaji',
          amount: 5000000,
          type: 'income',
          category: 'gaji',
          paymentMethod: 'bca',
          date: new Date(year, month - 1, 5, 0, 0, 0),
        },
      ]
      let baseInbox = []
      let baseBills = []

      // Inject single violation
      if (violationType === 'uncategorized_tx') {
        baseTransactions.push({
          id: 'tx-bad',
          description: 'Makan tanpa kategori',
          amount: 30000,
          type: 'expense',
          category: uncatVal,
          paymentMethod: 'bca',
          date: new Date(year, month - 1, 8, 0, 0, 0),
        })
      } else if (violationType === 'pending_inbox') {
        baseInbox.push({
          id: 'inbox-bad',
          rawDescription: 'Kopi Kenangan',
          amount: 22000,
          date: makeDateString(year, month, 12),
          status: 'pending',
          confidence: 0.4,
        })
      } else if (violationType === 'unreconciled_wallet') {
        // Remove reconciliation so BCA is unreconciled
        baseReconciliations = []
      } else if (violationType === 'overdue_bill') {
        // Add overdue bill (due on day 5, reference date is day 20)
        baseBills.push({
          id: 'bill-bad',
          name: 'Internet Indihome',
          amount: 350000,
          categoryId: 'tagihan',
          paymentMethodId: 'bca',
          recurrence: 'monthly',
          dueDay: 5,
          nextDueDate: makeDateString(year, month, 5),
          isActive: true,
        })
      }

      const refDate = new Date(year, month - 1, 20, 12, 0, 0)
      const result = evaluatePreClosingChecklist({
        year,
        month,
        transactions: baseTransactions,
        inbox: baseInbox,
        wallets: baseWallets,
        reconciliations: baseReconciliations,
        bills: baseBills,
        options: { referenceDate: refDate },
      })

      // Invariant: single violation must make readyToClose false and totalViolations === 1
      assert.equal(result.isReadyToClose, false, 'Must fail when 1 violation is present')
      assert.equal(result.totalViolations, 1, 'Exactly 1 category must fail')
      assert.ok(result.totalIssuesCount >= 1, 'totalIssuesCount >= 1')

      // Category-specific isolation
      if (violationType === 'uncategorized_tx') {
        assert.equal(result.items.uncategorizedTransactions.isPassed, false)
        assert.equal(result.items.pendingInbox.isPassed, true)
        assert.equal(result.items.unreconciledWallets.isPassed, true)
        assert.equal(result.items.overdueBills.isPassed, true)
      } else if (violationType === 'pending_inbox') {
        assert.equal(result.items.uncategorizedTransactions.isPassed, true)
        assert.equal(result.items.pendingInbox.isPassed, false)
        assert.equal(result.items.unreconciledWallets.isPassed, true)
        assert.equal(result.items.overdueBills.isPassed, true)
      } else if (violationType === 'unreconciled_wallet') {
        assert.equal(result.items.uncategorizedTransactions.isPassed, true)
        assert.equal(result.items.pendingInbox.isPassed, true)
        assert.equal(result.items.unreconciledWallets.isPassed, false)
        assert.equal(result.items.overdueBills.isPassed, true)
      } else if (violationType === 'overdue_bill') {
        assert.equal(result.items.uncategorizedTransactions.isPassed, true)
        assert.equal(result.items.pendingInbox.isPassed, true)
        assert.equal(result.items.unreconciledWallets.isPassed, true)
        assert.equal(result.items.overdueBills.isPassed, false)
      }

      return true
    }),
    { numRuns: 100 }
  )

  assert.ok(singleViolationCount >= MIN_PBT_RUNS)
  console.log(`    Sub-check B verified with ${singleViolationCount} isolated single violation runs.`)
}

// ── Property 26 (Sub-check C): Cross-Month Temporal Isolation ─────────────────
// Validates: Requirements 9.1
// Uncategorized transactions, pending inbox items, or overdue bills belonging to
// other calendar months SHALL NOT contaminate or cause violations in target month M.
{
  let temporalCount = 0

  const arbTemporalScenario = fc.record({
    targetYear: fc.integer({ min: 2024, max: 2028 }),
    targetMonth: fc.integer({ min: 1, max: 12 }),
    otherMonthDelta: fc.constantFrom(-4, -3, -2, -1, 1, 2, 3, 4),
  })

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 26 (Sub-check C): Cross-Month Temporal Isolation',
    fc.property(arbTemporalScenario, ({ targetYear, targetMonth, otherMonthDelta }) => {
      temporalCount++

      let otherYear = targetYear
      let otherMonth = targetMonth + otherMonthDelta
      while (otherMonth < 1) { otherMonth += 12; otherYear -= 1 }
      while (otherMonth > 12) { otherMonth -= 12; otherYear += 1 }

      const wallet = { id: 'bca', label: 'BCA', type: 'bank', balance: 1000000, keywords: ['bca'] }
      const reconciliations = [
        {
          id: 'rec-1',
          walletId: 'bca',
          reconciledAt: new Date(targetYear, targetMonth - 1, 15, 0, 0, 0).toISOString(),
          expectedBalance: 1000000,
          actualBalance: 1000000,
          difference: 0,
        },
      ]

      // Populate problematic items in the OTHER month
      const transactions = [
        {
          id: 'tx-other-uncat',
          description: 'Barang bulan lain',
          amount: 50000,
          type: 'expense',
          category: 'lainnya', // uncategorized in other month
          paymentMethod: 'bca',
          date: new Date(otherYear, otherMonth - 1, 10, 0, 0, 0),
        },
      ]

      const inbox = [
        {
          id: 'inbox-other-pending',
          rawDescription: 'Kopi bulan lain',
          amount: 25000,
          date: makeDateString(otherYear, otherMonth, 12),
          status: 'pending', // pending in other month
          confidence: 0.3,
        },
      ]

      // Bill due in a distant future month
      const bills = [
        {
          id: 'bill-future',
          name: 'PBB Tahunan',
          amount: 500000,
          categoryId: 'tagihan',
          paymentMethodId: 'bca',
          recurrence: 'monthly',
          dueDay: 10,
          nextDueDate: makeDateString(targetYear + 1, targetMonth, 10),
          isActive: true,
        },
      ]

      const result = evaluatePreClosingChecklist({
        year: targetYear,
        month: targetMonth,
        transactions,
        inbox,
        wallets: [wallet],
        reconciliations,
        bills,
      })

      // Target month must remain 100% clean
      assert.equal(
        result.isReadyToClose,
        true,
        `Issues in month ${otherYear}-${otherMonth} must not block close of ${targetYear}-${targetMonth}`
      )
      assert.equal(result.totalViolations, 0)
      assert.equal(result.totalIssuesCount, 0)

      return true
    }),
    { numRuns: 100 }
  )

  assert.ok(temporalCount >= MIN_PBT_RUNS)
  console.log(`    Sub-check C verified with ${temporalCount} cross-month temporal isolation runs.`)
}

// ── Property 26 (Sub-check D): Hidden Wallets Exclusion Invariance ─────────────
// Validates: Requirements 9.1
// Any wallet whose ID is included in options.hiddenWalletIds SHALL be excluded
// from the pre-closing checklist and SHALL NOT trigger an unreconciled wallet violation.
{
  let hiddenCheckCount = 0

  const arbHiddenWalletScenario = fc.record({
    year: fc.integer({ min: 2024, max: 2028 }),
    month: fc.integer({ min: 1, max: 12 }),
    hiddenWalletId: fc.constantFrom('tunai', 'gopay', 'ovo'),
  })

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 26 (Sub-check D): Hidden Wallets Exclusion Invariance',
    fc.property(arbHiddenWalletScenario, ({ year, month, hiddenWalletId }) => {
      hiddenCheckCount++

      const activeWallet = { id: 'bca', label: 'BCA', type: 'bank', balance: 1000000, keywords: ['bca'] }
      const hiddenWallet = { id: hiddenWalletId, label: hiddenWalletId.toUpperCase(), type: 'cash', balance: 200000, keywords: [hiddenWalletId] }

      // Only activeWallet is reconciled, hiddenWallet has NO reconciliation
      const reconciliations = [
        {
          id: 'rec-1',
          walletId: 'bca',
          reconciledAt: new Date(year, month - 1, 15, 0, 0, 0).toISOString(),
          expectedBalance: 1000000,
          actualBalance: 1000000,
          difference: 0,
        },
      ]

      // 1. Without hiding: hiddenWallet causes a violation
      const resWithoutHide = evaluatePreClosingChecklist({
        year,
        month,
        transactions: [],
        inbox: [],
        wallets: [activeWallet, hiddenWallet],
        reconciliations,
        bills: [],
      })
      assert.equal(resWithoutHide.isReadyToClose, false, 'Unreconciled wallet blocks when not hidden')
      assert.equal(resWithoutHide.items.unreconciledWallets.count, 1)

      // 2. With hiding: hiddenWallet is excluded -> passes
      const resWithHide = evaluatePreClosingChecklist({
        year,
        month,
        transactions: [],
        inbox: [],
        wallets: [activeWallet, hiddenWallet],
        reconciliations,
        bills: [],
        options: { hiddenWalletIds: [hiddenWalletId] },
      })
      assert.equal(resWithHide.isReadyToClose, true, 'Hidden unreconciled wallet is ignored')
      assert.equal(resWithHide.items.unreconciledWallets.isPassed, true)
      assert.equal(resWithHide.items.unreconciledWallets.count, 0)

      return true
    }),
    { numRuns: 100 }
  )

  assert.ok(hiddenCheckCount >= MIN_PBT_RUNS)
  console.log(`    Sub-check D verified with ${hiddenCheckCount} hidden wallet runs.`)
}

// ── Property 26 (Sub-check E): Internal Money Movement Invariance ─────────────
// Validates: Requirements 9.1
// Transfers and savings transactions SHALL NEVER be classified as uncategorized,
// even if their category field is empty, undefined, 'transfer', or 'lainnya'.
{
  let moveCheckCount = 0

  const arbMoneyMoveScenario = fc.record({
    year: fc.integer({ min: 2024, max: 2028 }),
    month: fc.integer({ min: 1, max: 12 }),
    kind: fc.constantFrom('transfer', 'saving'),
    categoryVal: fc.constantFrom('', '   ', 'transfer', 'lainnya', 'LAINNYA', null, undefined),
    amount: arbRupiahAmount,
  })

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 26 (Sub-check E): Internal Money Movement Invariance',
    fc.property(arbMoneyMoveScenario, ({ year, month, kind, categoryVal, amount }) => {
      moveCheckCount++

      const wallet = { id: 'bca', label: 'BCA', type: 'bank', balance: 5000000, keywords: ['bca'] }
      const reconciliations = [
        {
          id: 'rec-1',
          walletId: 'bca',
          reconciledAt: new Date(year, month - 1, 10, 0, 0, 0).toISOString(),
          expectedBalance: 5000000,
          actualBalance: 5000000,
          difference: 0,
        },
      ]

      const transferTx = {
        id: 'tx-move-1',
        description: 'Tarik tunai ATM',
        amount,
        type: 'expense',
        kind,
        category: categoryVal,
        paymentMethod: 'bca',
        date: new Date(year, month - 1, 14, 10, 0, 0),
      }

      // Predicate verification
      assert.equal(isMoneyMove(transferTx), true, 'isMoneyMove must be true')
      assert.equal(
        isUncategorizedTransaction(transferTx),
        false,
        'isUncategorizedTransaction must be false for internal money move'
      )

      const result = evaluatePreClosingChecklist({
        year,
        month,
        transactions: [transferTx],
        inbox: [],
        wallets: [wallet],
        reconciliations,
        bills: [],
      })

      assert.equal(result.items.uncategorizedTransactions.count, 0)
      assert.equal(result.items.uncategorizedTransactions.isPassed, true)
      assert.equal(result.isReadyToClose, true)

      return true
    }),
    { numRuns: 100 }
  )

  assert.ok(moveCheckCount >= MIN_PBT_RUNS)
  console.log(`    Sub-check E verified with ${moveCheckCount} money movement runs.`)
}

// ── Concrete Edge Cases ───────────────────────────────────────────────────────
{
  console.log('Validating concrete edge cases...')

  // 1. Completely empty state (no txs, no inbox, no wallets, no bills)
  const emptyRes = evaluatePreClosingChecklist({
    year: 2026,
    month: 3,
    transactions: [],
  })
  assert.equal(emptyRes.isReadyToClose, true)
  assert.equal(emptyRes.totalViolations, 0)
  assert.equal(emptyRes.totalIssuesCount, 0)

  // 2. Bill due today: not overdue if referenceDate is today
  const billToday = {
    id: 'b-today',
    name: 'Spotify',
    amount: 55000,
    categoryId: 'tagihan',
    paymentMethodId: 'bca',
    recurrence: 'monthly',
    dueDay: 15,
    nextDueDate: '2026-03-15',
    isActive: true,
  }
  const refToday = new Date(2026, 2, 15) // March 15, 2026
  assert.equal(
    isBillOverdueInMonth(billToday, 2026, 3, refToday),
    false,
    'Bill due today is NOT overdue yet on reference day'
  )

  // 3. Bill due yesterday: IS overdue
  const refTomorrow = new Date(2026, 2, 16) // March 16, 2026
  assert.equal(
    isBillOverdueInMonth(billToday, 2026, 3, refTomorrow),
    true,
    'Bill due yesterday IS overdue'
  )

  // 4. Inactive bill: never overdue
  const billInactive = { ...billToday, isActive: false }
  assert.equal(
    isBillOverdueInMonth(billInactive, 2026, 3, refTomorrow),
    false,
    'Inactive bill is never overdue'
  )

  console.log('✓ Concrete edge case validations passed.\n')
}

console.log('✅ Property 26 (Pre-Closing Checklist Evaluation) PASSED all invariants with >= 100 iterations each!\n')
