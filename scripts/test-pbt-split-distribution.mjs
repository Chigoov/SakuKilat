/**
 * SakuKilat — Property-Based Test Suite for Split Transaction Category Expense Distribution (Phase P11)
 *
 * Feature: sakukilat-core-roadmap, Property 31: Split Transaction Category Expense Distribution
 * Validates: Requirements 11.4, 11.5
 *
 * Formal Property Statement:
 * For any valid split transaction saved in the ledger, reporting aggregates in Tab Rekapan
 * SHALL distribute the parent transaction amount across the individual split line items'
 * categories, while the parent transaction record retains the unified payment method
 * and total nominal amount.
 */

import assert from 'node:assert/strict'
import {
  fc,
  testProperty,
  MIN_PBT_RUNS,
  arbPositiveRupiahAmount,
  arbPaymentMethod,
  arbCategory,
} from './pbt-harness.mjs'
import {
  createSplitLineItem,
  calculateSplitTotal,
  validateSplitTransaction,
  isSplitTransaction,
  expandTransactionForReporting,
  expandTransactionsForReporting,
  distributeCategoryAmounts,
  distributeCategorySlices,
  distributeSubcategoryAmounts,
  SplitTransactionValidator,
} from '../lib/split-transaction.ts'
import {
  rangeCategoryBreakdown,
  categoryBreakdown,
  subcategoryBreakdownForRange,
} from '../lib/stats.ts'

console.log('========================================================================')
console.log('  SAKUKILAT — PBT: SPLIT TRANSACTION CATEGORY DISTRIBUTION (PROP 31)   ')
console.log('========================================================================\n')

// ── Domain Arbitraries ────────────────────────────────────────────────────────

const arbSubcategory = fc.option(
  fc.constantFrom(
    'Kopi & Nongkrong',
    'Makan Siang',
    'Bahan Dapur',
    'Bensin',
    'Supermarket',
    'Vitamin',
    'Listrik & Air',
    'Obat & Medis'
  ),
  { nil: undefined }
)

/**
 * Arbitrary valid split line item with positive integer nominal.
 */
const arbValidSplitLineItem = fc.record({
  id: fc.stringMatching(/^split-[a-z0-9-]{4,16}$/),
  categoryId: arbCategory,
  subcategoryId: arbSubcategory,
  amount: fc.integer({ min: 1_000, max: 10_000_000 }),
  note: fc.option(fc.string({ maxLength: 30 }), { nil: undefined }),
})

/**
 * Generates a valid balanced split transaction where:
 * 1. amount === sum(splitItems.amount)
 * 2. paymentMethod is unified on parent
 * 3. splitItems contains 1 to 6 valid line items
 */
const arbValidSplitTransaction = fc.record({
  id: fc.stringMatching(/^tx-split-[a-z0-9-]{4,16}$/),
  description: fc.string({ minLength: 3, maxLength: 30 }),
  type: fc.constant('expense'),
  category: arbCategory, // Parent category (fallback/general)
  subcategory: arbSubcategory,
  paymentMethod: arbPaymentMethod,
  date: fc.date({ min: new Date(2026, 0, 1), max: new Date(2026, 11, 31) }),
  note: fc.option(fc.string({ maxLength: 30 }), { nil: undefined }),
  splitItems: fc.array(arbValidSplitLineItem, { minLength: 1, maxLength: 6 }),
}).map((t) => {
  const amount = t.splitItems.reduce((sum, item) => sum + item.amount, 0)
  return {
    ...t,
    amount,
  }
})

/**
 * Generates a standard (non-split) expense transaction.
 */
const arbStandardExpenseTransaction = fc.record({
  id: fc.stringMatching(/^tx-std-[a-z0-9-]{4,16}$/),
  description: fc.string({ minLength: 3, maxLength: 30 }),
  amount: fc.integer({ min: 1_000, max: 20_000_000 }),
  type: fc.constant('expense'),
  category: arbCategory,
  subcategory: arbSubcategory,
  paymentMethod: arbPaymentMethod,
  date: fc.date({ min: new Date(2026, 0, 1), max: new Date(2026, 11, 31) }),
  note: fc.option(fc.string({ maxLength: 30 }), { nil: undefined }),
  splitItems: fc.constant(undefined),
})

/**
 * Generates an arbitrary mix of split transactions and standard transactions.
 */
const arbMixedTransactionLedger = fc.array(
  fc.oneof(
    { arbitrary: arbValidSplitTransaction, weight: 3 },
    { arbitrary: arbStandardExpenseTransaction, weight: 2 }
  ),
  { minLength: 1, maxLength: 12 }
)

// ── Feature: sakukilat-core-roadmap, Property 31: Split Transaction Category Expense Distribution ──
// Validates: Requirements 11.4, 11.5
{
  let evaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 31: Split Transaction Category Expense Distribution',
    fc.property(
      arbMixedTransactionLedger,
      (transactions) => {
        evaluated++

        // Calculate expected category distribution by manually expanding split items
        const expectedCategoryTotals = new Map()
        let expectedTotalExpense = 0

        for (const t of transactions) {
          expectedTotalExpense += t.amount

          // Invariant 1: Parent record retains total amount and unified payment method
          assert.ok(
            t.amount > 0,
            `Parent transaction ${t.id} must retain positive amount`
          )
          assert.ok(
            typeof t.paymentMethod === 'string' && t.paymentMethod.length > 0,
            `Parent transaction ${t.id} must retain unified payment method`
          )

          if (isSplitTransaction(t)) {
            // Valid split transaction invariant: sum(splits) === parent.amount
            const splitSum = calculateSplitTotal(t.splitItems)
            assert.equal(
              splitSum,
              t.amount,
              `Valid split transaction ${t.id} must have sum(splits) === parent.amount`
            )

            // Test expandTransactionForReporting for individual split transaction (Requirement 11.4)
            const expanded = expandTransactionForReporting(t)
            assert.equal(
              expanded.length,
              t.splitItems.length,
              `Expanded items count must match split items count`
            )

            let expandedSum = 0
            for (const child of expanded) {
              expandedSum += child.amount
              // Invariant 2: Every child item inherits parent payment method and ID (Requirement 11.4)
              assert.equal(
                child.paymentMethod,
                t.paymentMethod,
                `Expanded child ${child.splitItemId} must retain unified parent payment method ${t.paymentMethod}`
              )
              assert.equal(
                child.transactionId,
                t.id,
                `Expanded child ${child.splitItemId} must retain parent transaction ID ${t.id}`
              )
              assert.equal(
                child.parentAmount,
                t.amount,
                `Expanded child must record parentAmount === ${t.amount}`
              )
              assert.equal(
                child.isSplitChild,
                true,
                `Expanded child must have isSplitChild === true`
              )

              // Accumulate expected category total from child
              const cur = expectedCategoryTotals.get(child.category) ?? 0
              expectedCategoryTotals.set(child.category, cur + child.amount)
            }

            assert.equal(
              expandedSum,
              t.amount,
              `Sum of expanded child amounts must equal parent transaction amount`
            )
          } else {
            // Non-split transaction: attribute directly to parent category
            const cur = expectedCategoryTotals.get(t.category) ?? 0
            expectedCategoryTotals.set(t.category, cur + t.amount)

            const expanded = expandTransactionForReporting(t)
            assert.equal(expanded.length, 1, 'Non-split expands to exactly 1 item')
            assert.equal(expanded[0].category, t.category, 'Non-split category')
            assert.equal(expanded[0].amount, t.amount, 'Non-split amount')
            assert.equal(expanded[0].paymentMethod, t.paymentMethod, 'Non-split payment method')
            assert.equal(expanded[0].isSplitChild, false, 'Non-split isSplitChild === false')
          }
        }

        // Test distributeCategoryAmounts from lib/split-transaction.ts (Requirement 11.4)
        const distributedMap = distributeCategoryAmounts(transactions, 'expense')

        // Verify every expected category matches the distributed amount
        for (const [cat, expectedAmt] of expectedCategoryTotals.entries()) {
          const actualAmt = distributedMap.get(cat) ?? 0
          assert.equal(
            actualAmt,
            expectedAmt,
            `Category "${cat}" amount mismatch: expected ${expectedAmt}, got ${actualAmt}`
          )
        }

        // Verify no extra unexpected categories are present
        for (const [cat, actualAmt] of distributedMap.entries()) {
          const expectedAmt = expectedCategoryTotals.get(cat) ?? 0
          assert.equal(
            actualAmt,
            expectedAmt,
            `Unexpected category "${cat}" in distributed map: got ${actualAmt}, expected ${expectedAmt}`
          )
        }

        // Invariant 3: Total across all distributed categories strictly equals total parent expense
        const totalDistributed = Array.from(distributedMap.values()).reduce((s, v) => s + v, 0)
        assert.equal(
          totalDistributed,
          expectedTotalExpense,
          `Total distributed across categories (${totalDistributed}) must equal total expense (${expectedTotalExpense})`
        )

        // Test distributeCategorySlices sorting and percentages (Requirement 11.5)
        const slices = distributeCategorySlices(transactions, 'expense')
        let sliceSum = 0
        let prevTotal = Infinity

        for (const slice of slices) {
          sliceSum += slice.total
          assert.ok(
            slice.total <= prevTotal,
            `Slices must be sorted descending: ${slice.total} > ${prevTotal}`
          )
          prevTotal = slice.total

          const expectedAmt = expectedCategoryTotals.get(slice.category) ?? 0
          assert.equal(
            slice.total,
            expectedAmt,
            `Slice for "${slice.category}" total mismatch`
          )

          const expectedPct = expectedTotalExpense > 0 ? expectedAmt / expectedTotalExpense : 0
          assert.ok(
            Math.abs(slice.pct - expectedPct) < 1e-6,
            `Slice percentage mismatch for "${slice.category}": expected ${expectedPct}, got ${slice.pct}`
          )
        }

        assert.equal(
          sliceSum,
          expectedTotalExpense,
          `Sum of slice totals must equal expected total expense`
        )

        // Invariant 4: Tab Rekapan rangeCategoryBreakdown in lib/stats.ts parity (Requirement 11.5)
        const minDate = new Date(2025, 11, 31)
        const maxDate = new Date(2027, 0, 1)
        const rekapanSlices = rangeCategoryBreakdown(transactions, minDate, maxDate, 'expense')
        const rekapanTotal = rekapanSlices.reduce((s, sl) => s + sl.total, 0)

        assert.equal(
          rekapanTotal,
          expectedTotalExpense,
          `Tab Rekapan rangeCategoryBreakdown total must equal expectedTotalExpense`
        )

        for (const rSlice of rekapanSlices) {
          const expectedAmt = expectedCategoryTotals.get(rSlice.category) ?? 0
          assert.equal(
            rSlice.total,
            expectedAmt,
            `Tab Rekapan slice total for "${rSlice.category}" mismatch: expected ${expectedAmt}, got ${rSlice.total}`
          )
        }

        return true
      }
    ),
    { numRuns: 150 }
  )

  assert.ok(
    evaluated >= MIN_PBT_RUNS,
    `Expected at least ${MIN_PBT_RUNS} iterations, evaluated ${evaluated}`
  )
  console.log(`    Main Property 31 verified with ${evaluated} iterations across mixed transaction ledgers.\n`)
}

// ── Sub-Check A: Grand Total Conservation & Zero Nominal Leakage ──────────────
// For any set of split and non-split transactions, distributing categories
// MUST neither create nor destroy money: sum(categoryTotals) === sum(parentAmounts).
{
  let conservationEvaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 31 (Sub-check A): Grand Total Conservation & Zero Nominal Leakage',
    fc.property(
      fc.array(arbValidSplitTransaction, { minLength: 1, maxLength: 8 }),
      (splitTransactions) => {
        conservationEvaluated++

        const expectedTotal = splitTransactions.reduce((sum, t) => sum + t.amount, 0)
        const distributed = distributeCategoryAmounts(splitTransactions, 'expense')
        const totalAllocated = Array.from(distributed.values()).reduce((sum, val) => sum + val, 0)

        assert.equal(
          totalAllocated,
          expectedTotal,
          `Conservation invariant violated: expected ${expectedTotal}, got ${totalAllocated}`
        )

        const slices = distributeCategorySlices(splitTransactions, 'expense')
        const sliceTotal = slices.reduce((sum, s) => sum + s.total, 0)

        assert.equal(
          sliceTotal,
          expectedTotal,
          `Slice total conservation violated: expected ${expectedTotal}, got ${sliceTotal}`
        )

        if (expectedTotal > 0) {
          const sumPct = slices.reduce((sum, s) => sum + s.pct, 0)
          assert.ok(
            Math.abs(sumPct - 1.0) < 1e-4,
            `Sum of slice percentages must equal 1.0 (100%), got ${sumPct}`
          )
        }

        return true
      }
    ),
    { numRuns: 120 }
  )

  assert.ok(conservationEvaluated >= MIN_PBT_RUNS)
  console.log(`    Sub-check A verified with ${conservationEvaluated} iterations for total conservation.\n`)
}

// ── Sub-Check B: Unified Payment Method Retention Across Expanded Reporting Items ─
// For any parent transaction with paymentMethod P and N split line items,
// expandTransactionForReporting MUST produce items that all have paymentMethod === P.
{
  let methodEvaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 31 (Sub-check B): Unified Payment Method Retention',
    fc.property(
      arbValidSplitTransaction,
      (transaction) => {
        methodEvaluated++

        const expanded = expandTransactionForReporting(transaction)

        assert.equal(
          expanded.length,
          transaction.splitItems.length,
          'Expanded length must equal splitItems length'
        )

        for (let i = 0; i < expanded.length; i++) {
          const child = expanded[i]
          const originalSplit = transaction.splitItems[i]

          // 1. Unified Payment Method retention (Requirement 11.4)
          assert.equal(
            child.paymentMethod,
            transaction.paymentMethod,
            `Child paymentMethod must strictly equal parent paymentMethod "${transaction.paymentMethod}"`
          )

          // 2. Parent reference retention
          assert.equal(
            child.transactionId,
            transaction.id,
            `Child transactionId must equal parent ID "${transaction.id}"`
          )
          assert.equal(
            child.parentCategory,
            transaction.category,
            `Child parentCategory must equal parent category "${transaction.category}"`
          )
          assert.equal(
            child.parentAmount,
            transaction.amount,
            `Child parentAmount must equal parent amount ${transaction.amount}`
          )

          // 3. Child-specific attributes correctly transferred
          assert.equal(
            child.category,
            originalSplit.categoryId,
            `Child category must equal split item category "${originalSplit.categoryId}"`
          )
          assert.equal(
            child.subcategory,
            originalSplit.subcategoryId,
            `Child subcategory must equal split item subcategory`
          )
          assert.equal(
            child.amount,
            originalSplit.amount,
            `Child amount must equal split item amount ${originalSplit.amount}`
          )
        }

        // Verify batch expansion helper expandTransactionsForReporting produces identical results
        const batchExpanded = expandTransactionsForReporting([transaction])
        assert.deepEqual(
          batchExpanded,
          expanded,
          'expandTransactionsForReporting batch must match expandTransactionForReporting'
        )

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(methodEvaluated >= MIN_PBT_RUNS)
  console.log(`    Sub-check B verified with ${methodEvaluated} iterations for payment method retention.\n`)
}

// ── Sub-Check C: Subcategory Distribution Within Category ─────────────────────
// For any category C, subcategory breakdown must partition all split items
// assigned to category C without missing any line item amounts.
{
  let subcatEvaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 31 (Sub-check C): Subcategory Distribution Within Category',
    fc.property(
      arbCategory,
      fc.array(arbValidSplitTransaction, { minLength: 1, maxLength: 6 }),
      (targetCategory, transactions) => {
        subcatEvaluated++

        // Calculate expected subcategory amounts manually for targetCategory
        const expectedSubMap = new Map()
        let expectedCategoryTotal = 0

        for (const t of transactions) {
          if (isSplitTransaction(t)) {
            for (const s of t.splitItems) {
              if (s.categoryId === targetCategory) {
                expectedCategoryTotal += s.amount
                const subKey = s.subcategoryId || 'Lainnya'
                expectedSubMap.set(subKey, (expectedSubMap.get(subKey) ?? 0) + s.amount)
              }
            }
          }
        }

        const actualSubMap = distributeSubcategoryAmounts(transactions, targetCategory, 'expense')
        const actualSubTotal = Array.from(actualSubMap.values()).reduce((sum, v) => sum + v, 0)

        // 1. Total across all subcategories in targetCategory equals expected category total
        assert.equal(
          actualSubTotal,
          expectedCategoryTotal,
          `Subcategory total for "${targetCategory}" mismatch: expected ${expectedCategoryTotal}, got ${actualSubTotal}`
        )

        // 2. Each subcategory amount matches exactly
        for (const [sub, expectedAmt] of expectedSubMap.entries()) {
          const actualAmt = actualSubMap.get(sub) ?? 0
          assert.equal(
            actualAmt,
            expectedAmt,
            `Subcategory "${sub}" amount mismatch: expected ${expectedAmt}, got ${actualAmt}`
          )
        }

        // 3. Tab Rekapan subcategoryBreakdownForRange parity (Requirement 11.5)
        const minDate = new Date(2025, 11, 31)
        const maxDate = new Date(2027, 0, 1)
        const rekapanSubSlices = subcategoryBreakdownForRange(
          transactions,
          minDate,
          maxDate,
          targetCategory,
          'expense'
        )
        const rekapanSubTotal = rekapanSubSlices.reduce((sum, s) => sum + s.total, 0)

        assert.equal(
          rekapanSubTotal,
          expectedCategoryTotal,
          `Tab Rekapan subcategory breakdown total mismatch for "${targetCategory}"`
        )

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(subcatEvaluated >= MIN_PBT_RUNS)
  console.log(`    Sub-check C verified with ${subcatEvaluated} iterations for subcategory distribution.\n`)
}

// ── Sub-Check D: Multi-Split Same-Category Aggregation & Permutation Invariance ─
// When multiple split items inside one transaction share the same category,
// the amounts MUST accumulate additively, and the order of split items in the
// array MUST NOT affect the resulting category distribution.
{
  let sameCatEvaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 31 (Sub-check D): Same-Category Aggregation & Permutation Invariance',
    fc.property(
      arbCategory,
      fc.array(fc.integer({ min: 5_000, max: 2_000_000 }), { minLength: 2, maxLength: 5 }),
      arbPaymentMethod,
      (sharedCategory, partAmounts, paymentMethod) => {
        sameCatEvaluated++

        const totalShared = partAmounts.reduce((a, b) => a + b, 0)

        // Create multiple split items with the SAME category
        const splitItems = partAmounts.map((amt, idx) =>
          createSplitLineItem({
            id: `split-same-${idx}`,
            categoryId: sharedCategory,
            amount: amt,
            note: `Item ${idx}`,
          })
        )

        const tx = {
          id: 'tx-same-cat-split',
          amount: totalShared,
          type: 'expense',
          category: 'lainnya', // Parent category is different
          paymentMethod,
          date: new Date('2026-06-15T10:00:00'),
          splitItems,
        }

        // 1. Distribution must attribute all parts to sharedCategory
        const dist = distributeCategoryAmounts([tx], 'expense')
        assert.equal(
          dist.get(sharedCategory),
          totalShared,
          `Same-category split must aggregate all parts: expected ${totalShared}, got ${dist.get(sharedCategory)}`
        )
        // Parent category 'lainnya' must be 0 (not duplicated)
        assert.equal(
          dist.get('lainnya'),
          undefined,
          `Parent category "lainnya" must NOT receive any amount when all splits are in "${sharedCategory}"`
        )

        // 2. Permutation invariance: shuffling split items produces identical category total
        const shuffledSplits = [...splitItems].sort(() => Math.random() - 0.5)
        const txShuffled = { ...tx, splitItems: shuffledSplits }
        const distShuffled = distributeCategoryAmounts([txShuffled], 'expense')

        assert.equal(
          distShuffled.get(sharedCategory),
          totalShared,
          `Shuffled split items must yield identical category total`
        )

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(sameCatEvaluated >= MIN_PBT_RUNS)
  console.log(`    Sub-check D verified with ${sameCatEvaluated} iterations for same-category aggregation.\n`)
}

// ── Sub-Check E: Non-Expense & Money Move Isolation ───────────────────────────
// Transactions marked with kind === 'transfer' or kind === 'saving', or
// type !== 'expense', MUST be excluded from expense category distributions.
{
  let isolationEvaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 31 (Sub-check E): Non-Expense and Money Move Isolation',
    fc.property(
      arbValidSplitTransaction,
      fc.constantFrom('transfer', 'saving'),
      (validSplitTx, moneyMoveKind) => {
        isolationEvaluated++

        // Create a copy marked as money move
        const transferTx = {
          ...validSplitTx,
          id: 'tx-move-' + validSplitTx.id,
          kind: moneyMoveKind,
          category: 'transfer',
        }

        // When passing only the transfer transaction to expense distribution, result MUST be empty
        const distMove = distributeCategoryAmounts([transferTx], 'expense')
        assert.equal(
          distMove.size,
          0,
          `Money move transaction (${moneyMoveKind}) must be excluded from expense category distribution`
        )

        // Create an income split transaction
        const incomeTx = {
          ...validSplitTx,
          id: 'tx-inc-' + validSplitTx.id,
          type: 'income',
        }

        const distIncomeInExpense = distributeCategoryAmounts([incomeTx], 'expense')
        assert.equal(
          distIncomeInExpense.size,
          0,
          `Income transaction must be excluded from expense category distribution`
        )

        // Income transaction MUST be included in income category distribution
        const distIncomeInIncome = distributeCategoryAmounts([incomeTx], 'income')
        const totalIncomeAlloc = Array.from(distIncomeInIncome.values()).reduce((a, b) => a + b, 0)
        assert.equal(
          totalIncomeAlloc,
          incomeTx.amount,
          `Income transaction must be properly distributed when typeFilter is "income"`
        )

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(isolationEvaluated >= MIN_PBT_RUNS)
  console.log(`    Sub-check E verified with ${isolationEvaluated} iterations for money move isolation.\n`)
}

// ── Concrete Blueprint Scenarios (Requirements 11.4, 11.5) ───────────────────
{
  console.log('▶ Running Concrete Blueprint Scenario Validations...')

  // Scenario 1: Supermarket grocery receipt
  // Parent: Rp300.000, Payment: BCA, Parent Category: Belanja
  // Splits:
  // - Makanan & Minuman: Rp180.000 (Beras, sayur, telur)
  // - Kesehatan: Rp70.000 (Vitamin & masker)
  // - Belanja: Rp50.000 (Sabun cuci)
  const supermarketTx = {
    id: 'tx-bp-supermarket',
    description: 'Belanja Bulanan Supermarket',
    amount: 300_000,
    type: 'expense',
    category: 'Belanja',
    paymentMethod: 'bca',
    date: new Date('2026-06-15T14:30:00'),
    splitItems: [
      createSplitLineItem({ id: 'sp-1', categoryId: 'Makanan & Minuman', amount: 180_000, note: 'Beras & telur' }),
      createSplitLineItem({ id: 'sp-2', categoryId: 'Kesehatan', amount: 70_000, note: 'Vitamin C' }),
      createSplitLineItem({ id: 'sp-3', categoryId: 'Belanja', amount: 50_000, note: 'Sabun' }),
    ],
  }

  // 1. Expand reporting items check
  const expandedBp = expandTransactionForReporting(supermarketTx)
  assert.equal(expandedBp.length, 3, 'Scenario 1 expanded length')

  // All children retain unified BCA payment method
  for (const item of expandedBp) {
    assert.equal(item.paymentMethod, 'bca', 'Scenario 1 child retains parent paymentMethod BCA')
    assert.equal(item.transactionId, 'tx-bp-supermarket', 'Scenario 1 child retains parent ID')
    assert.equal(item.parentAmount, 300_000, 'Scenario 1 child retains parentAmount 300k')
  }

  // 2. Category distribution check (Requirement 11.4)
  const distBp = distributeCategoryAmounts([supermarketTx], 'expense')
  assert.equal(distBp.get('Makanan & Minuman'), 180_000, 'Makanan gets 180k')
  assert.equal(distBp.get('Kesehatan'), 70_000, 'Kesehatan gets 70k')
  assert.equal(distBp.get('Belanja'), 50_000, 'Belanja gets 50k (NOT 300k)')

  // 3. Tab Rekapan integration check (Requirement 11.5)
  const rekapanBpSlices = rangeCategoryBreakdown(
    [supermarketTx],
    new Date(2026, 0, 1),
    new Date(2026, 11, 31),
    'expense'
  )
  assert.equal(rekapanBpSlices.length, 3, 'Tab Rekapan has 3 category slices')
  assert.equal(rekapanBpSlices[0].category, 'Makanan & Minuman', 'Top slice is Makanan')
  assert.equal(rekapanBpSlices[0].total, 180_000, 'Top slice total 180k')
  assert.equal(rekapanBpSlices[0].pct, 0.6, 'Top slice pct 60%')
  assert.equal(rekapanBpSlices[1].category, 'Kesehatan', 'Second slice is Kesehatan')
  assert.equal(rekapanBpSlices[1].total, 70_000, 'Second slice total 70k')
  assert.equal(rekapanBpSlices[2].category, 'Belanja', 'Third slice is Belanja')
  assert.equal(rekapanBpSlices[2].total, 50_000, 'Third slice total 50k')

  // Scenario 2: Mixed monthly transactions (normal + split)
  // T1: Normal Makanan 50k (Cash)
  // T2: Split Parent 200k (GoPay): Makanan 120k + Hiburan 80k
  // T3: Normal Hiburan 50k (BCA)
  const mixedTxs = [
    { id: 'tx-1', amount: 50_000, type: 'expense', category: 'Makanan & Minuman', paymentMethod: 'cash', date: new Date() },
    {
      id: 'tx-2',
      amount: 200_000,
      type: 'expense',
      category: 'Tagihan', // Parent category
      paymentMethod: 'gopay',
      date: new Date(),
      splitItems: [
        createSplitLineItem({ categoryId: 'Makanan & Minuman', amount: 120_000 }),
        createSplitLineItem({ categoryId: 'Hiburan', amount: 80_000 }),
      ],
    },
    { id: 'tx-3', amount: 50_000, type: 'expense', category: 'Hiburan', paymentMethod: 'bca', date: new Date() },
  ]

  const distMixed = distributeCategoryAmounts(mixedTxs, 'expense')
  assert.equal(distMixed.get('Makanan & Minuman'), 170_000, 'Makanan: 50k + 120k = 170k')
  assert.equal(distMixed.get('Hiburan'), 130_000, 'Hiburan: 80k + 50k = 130k')
  assert.equal(distMixed.get('Tagihan'), undefined, 'Tagihan (parent cat of tx-2) receives 0')

  const totalMixed = Array.from(distMixed.values()).reduce((a, b) => a + b, 0)
  assert.equal(totalMixed, 300_000, 'Total distributed equals sum of parent transactions (300k)')

  // Ledger records retain original payment methods and parent amounts
  assert.equal(mixedTxs[1].amount, 200_000, 'T2 ledger amount is 200k')
  assert.equal(mixedTxs[1].paymentMethod, 'gopay', 'T2 ledger paymentMethod is gopay')

  console.log('✓ Concrete blueprint validations passed successfully.')
}

console.log('\n========================================================================')
console.log('✅ ALL PROPERTY 31 (SPLIT TRANSACTION CATEGORY DISTRIBUTION) PBT SUITES PASSED!')
console.log('========================================================================\n')
