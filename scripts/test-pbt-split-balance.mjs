/**
 * SakuKilat — Property-Based Test Suite for Balanced Split Transactions (Phase P11)
 *
 * Feature: sakukilat-core-roadmap, Property 30: Split Transaction Balance and Discrepancy Invariant
 * Validates: Requirements 11.2, 11.3
 *
 * Formal Property Statement:
 * For any parent transaction with nominal amount T and split line items S = [s_1, s_2, ..., s_k],
 * saving the transaction SHALL succeed if and only if sum(s_i.amount) === T.
 * If sum(s_i.amount) !== T, saving SHALL be prevented and the exact discrepancy |T - sum(s_i.amount)|
 * SHALL be displayed.
 */

import assert from 'node:assert/strict'
import {
  fc,
  testProperty,
  MIN_PBT_RUNS,
  arbRupiahAmount,
  arbPositiveRupiahAmount,
  arbCategory,
} from './pbt-harness.mjs'
import {
  formatIDRShort,
} from '../lib/parser.ts'
import {
  createSplitLineItem,
  calculateSplitTotal,
  calculateSplitDiscrepancy,
  validateSplitTransaction,
  canSaveSplitTransaction,
  isSplitTransaction,
  SplitTransactionValidator,
} from '../lib/split-transaction.ts'

console.log('========================================================================')
console.log('  SAKUKILAT — PBT: SPLIT TRANSACTION BALANCE & DISCREPANCY (PROP 30)   ')
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
    'Listrik & Air'
  ),
  { nil: undefined }
)

/**
 * Arbitrary valid split line item with positive integer nominal.
 */
const arbValidSplitItem = fc.record({
  id: fc.stringMatching(/^split-[a-z0-9-]{4,16}$/),
  categoryId: arbCategory,
  subcategoryId: arbSubcategory,
  amount: fc.integer({ min: 1, max: 25_000_000 }),
  note: fc.option(fc.string({ maxLength: 30 }), { nil: undefined }),
})

/**
 * Generator producing balanced, under-allocated, and over-allocated test cases.
 */
const arbSplitCase = fc.oneof(
  // 1. Exactly balanced cases: sum(items.amount) === parentAmount
  fc.record({
    kind: fc.constant('balanced'),
    items: fc.array(arbValidSplitItem, { minLength: 1, maxLength: 8 }),
  }).map(({ kind, items }) => {
    const parentAmount = items.reduce((sum, it) => sum + it.amount, 0)
    return { kind, items, parentAmount }
  }),

  // 2. Under-allocated cases: sum(items.amount) < parentAmount (discrepancy > 0)
  fc.record({
    kind: fc.constant('under'),
    items: fc.array(arbValidSplitItem, { minLength: 1, maxLength: 8 }),
    delta: fc.integer({ min: 1, max: 10_000_000 }),
  }).map(({ kind, items, delta }) => {
    const sum = items.reduce((s, it) => s + it.amount, 0)
    return { kind, items, parentAmount: sum + delta }
  }),

  // 3. Over-allocated cases: sum(items.amount) > parentAmount (discrepancy > 0)
  fc.record({
    kind: fc.constant('over'),
    items: fc.array(
      fc.record({
        id: fc.stringMatching(/^split-[a-z0-9-]{4,16}$/),
        categoryId: arbCategory,
        subcategoryId: arbSubcategory,
        amount: fc.integer({ min: 2, max: 25_000_000 }),
        note: fc.option(fc.string({ maxLength: 30 }), { nil: undefined }),
      }),
      { minLength: 1, maxLength: 8 }
    ),
    deltaRatioPct: fc.integer({ min: 1, max: 99 }),
  }).map(({ kind, items, deltaRatioPct }) => {
    const deltaRatio = deltaRatioPct / 100
    const sum = items.reduce((s, it) => s + it.amount, 0)
    const offset = Math.max(1, Math.round(sum * deltaRatio))
    const parentAmount = Math.max(1, sum - offset)
    return { kind, items, parentAmount }
  })
)

// ── Feature: sakukilat-core-roadmap, Property 30: Split Transaction Balance and Discrepancy Invariant ──
// Validates: Requirements 11.2, 11.3
{
  let evaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 30: Split Transaction Balance and Discrepancy Invariant',
    fc.property(
      arbSplitCase,
      ({ kind, items, parentAmount }) => {
        evaluated++

        const sum = calculateSplitTotal(items)
        const expectedDiscrepancy = Math.abs(parentAmount - sum)
        const isActuallyBalanced = sum === parentAmount

        // Execute functions under test
        const result = validateSplitTransaction(parentAmount, items)
        const canSave = canSaveSplitTransaction(parentAmount, items)

        // 1. Amount & Scalar Calculations (Requirement 11.2)
        assert.equal(
          result.totalSplitAmount,
          sum,
          `totalSplitAmount must equal calculateSplitTotal: expected ${sum}, got ${result.totalSplitAmount}`
        )
        assert.equal(
          result.parentAmount,
          parentAmount,
          `parentAmount must match input: expected ${parentAmount}, got ${result.parentAmount}`
        )
        assert.equal(
          result.discrepancy,
          expectedDiscrepancy,
          `discrepancy must equal |parent - sum|: expected ${expectedDiscrepancy}, got ${result.discrepancy}`
        )

        // 2. Allocation State Flags
        assert.equal(
          result.isBalanced,
          isActuallyBalanced,
          `isBalanced flag mismatch: expected ${isActuallyBalanced}, got ${result.isBalanced}`
        )
        assert.equal(
          result.isUnderAllocated,
          sum < parentAmount,
          `isUnderAllocated flag mismatch: expected ${sum < parentAmount}, got ${result.isUnderAllocated}`
        )
        assert.equal(
          result.isOverAllocated,
          sum > parentAmount,
          `isOverAllocated flag mismatch: expected ${sum > parentAmount}, got ${result.isOverAllocated}`
        )

        // 3. CORE INVARIANT: Saving succeeds IF AND ONLY IF sum === parentAmount (Requirement 11.2, 11.3)
        assert.equal(
          result.canSave,
          isActuallyBalanced,
          `canSave must be true if and only if balanced (sum === parentAmount)`
        )
        assert.equal(
          result.isValid,
          isActuallyBalanced,
          `isValid must be true if and only if balanced`
        )
        assert.equal(
          canSave,
          isActuallyBalanced,
          `canSaveSplitTransaction must match isActuallyBalanced`
        )

        // 4. Exact Discrepancy Display & Error Messaging (Requirement 11.3)
        if (isActuallyBalanced) {
          assert.equal(result.discrepancy, 0, 'Balanced split must have 0 discrepancy')
          assert.equal(result.errorMessage, undefined, 'Balanced split must have no error message')
        } else {
          assert.ok(result.discrepancy > 0, 'Unbalanced split must have discrepancy > 0')
          assert.ok(result.errorMessage !== undefined, 'Unbalanced split must display error message')

          const expectedFormattedDelta = formatIDRShort(expectedDiscrepancy)
          assert.ok(
            result.errorMessage.includes(`Selisih Rp${expectedFormattedDelta}`),
            `Error message must display exact formatted discrepancy "Selisih Rp${expectedFormattedDelta}", got: "${result.errorMessage}"`
          )
          assert.ok(
            result.errorMessage.includes('Total alokasi harus pas dengan transaksi induk'),
            `Error message must contain required Indonesian prompt: "${result.errorMessage}"`
          )
        }

        // 5. Parity with SplitTransactionValidator Static Class API
        assert.deepEqual(
          SplitTransactionValidator.validate(parentAmount, items),
          result,
          'SplitTransactionValidator.validate parity'
        )
        assert.equal(
          SplitTransactionValidator.canSave(parentAmount, items),
          canSave,
          'SplitTransactionValidator.canSave parity'
        )
        assert.equal(
          SplitTransactionValidator.calculateTotal(items),
          sum,
          'SplitTransactionValidator.calculateTotal parity'
        )
        assert.equal(
          SplitTransactionValidator.calculateDiscrepancy(parentAmount, items),
          expectedDiscrepancy,
          'SplitTransactionValidator.calculateDiscrepancy parity'
        )

        return true
      }
    ),
    { numRuns: 150 }
  )

  assert.ok(
    evaluated >= MIN_PBT_RUNS,
    `Expected at least ${MIN_PBT_RUNS} iterations, evaluated ${evaluated}`
  )
  console.log(`    Main Property 30 verified with ${evaluated} iterations across balanced and unbalanced scenarios.\n`)
}

// ── Sub-Check A: Balanced Split Synthesis via Integer Partitioning ────────────
// For any positive parent nominal T and partition count k (1 <= k <= 8),
// partitioning T into k strictly positive parts summing to T MUST always result
// in canSave === true, isValid === true, and discrepancy === 0.
{
  let partitionEvaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 30 (Sub-check A): Balanced Integer Partitioning',
    fc.property(
      arbPositiveRupiahAmount,
      fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 8 }),
      fc.array(arbCategory, { minLength: 8, maxLength: 8 }),
      (parentAmount, rawWeights, categories) => {
        partitionEvaluated++

        const k = rawWeights.length
        // Ensure parentAmount is at least k so every part can be an integer >= 1
        const safeParent = Math.max(k, parentAmount)
        const sumWeights = rawWeights.reduce((a, b) => a + b, 0)
        const surplus = safeParent - k // surplus >= 0

        // Distribute surplus non-negative integers across k bins
        let allocatedSurplus = 0
        const parts = []
        for (let i = 0; i < k; i++) {
          if (i === k - 1) {
            // Last bin receives whatever surplus remains
            const extra = surplus - allocatedSurplus
            parts.push(1 + extra)
          } else {
            const extra = Math.floor((rawWeights[i] / sumWeights) * surplus)
            allocatedSurplus += extra
            parts.push(1 + extra)
          }
        }

        // Verify partition math
        const partitionSum = parts.reduce((a, b) => a + b, 0)
        assert.equal(partitionSum, safeParent, 'Partition sum must equal safeParent')

        // Build SplitLineItems
        const splitItems = parts.map((amount, idx) =>
          createSplitLineItem({
            id: `split-part-${idx}`,
            categoryId: categories[idx % categories.length],
            amount,
          })
        )

        const validation = validateSplitTransaction(safeParent, splitItems)

        assert.equal(
          validation.isValid,
          true,
          'Synthesized integer partition must be valid'
        )
        assert.equal(
          validation.canSave,
          true,
          'Synthesized integer partition must be saveable'
        )
        assert.equal(
          validation.discrepancy,
          0,
          'Synthesized integer partition must have zero discrepancy'
        )
        assert.equal(
          validation.isBalanced,
          true,
          'Synthesized integer partition must be balanced'
        )
        assert.equal(
          validation.totalSplitAmount,
          safeParent,
          'totalSplitAmount must equal safeParent'
        )
        assert.equal(
          validation.errorMessage,
          undefined,
          'errorMessage must be undefined for balanced partition'
        )

        return true
      }
    ),
    { numRuns: 120 }
  )

  assert.ok(partitionEvaluated >= MIN_PBT_RUNS)
  console.log(`    Sub-check A verified with ${partitionEvaluated} iterations for balanced integer partitions.\n`)
}

// ── Sub-Check B: Discrepancy Linearity & Exact Mathematical Shift ──────────────
// For any split items summing to S and any non-zero shift delta D:
// 1. If parent = S + D (under-allocated), discrepancy MUST equal D
// 2. If parent = S - D (over-allocated, with parent > 0), discrepancy MUST equal D
// 3. Error message MUST contain exact formatted delta formatIDRShort(D)
{
  let shiftEvaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 30 (Sub-check B): Discrepancy Linearity & Mathematical Shift',
    fc.property(
      fc.array(arbValidSplitItem, { minLength: 1, maxLength: 6 }),
      fc.integer({ min: 1, max: 5_000_000 }),
      (items, delta) => {
        shiftEvaluated++

        const S = calculateSplitTotal(items)

        // 1. Under-allocated test: parent = S + delta
        const parentUnder = S + delta
        const resUnder = validateSplitTransaction(parentUnder, items)

        assert.equal(resUnder.canSave, false, 'Under-allocated must block save')
        assert.equal(resUnder.isBalanced, false, 'Under-allocated isBalanced must be false')
        assert.equal(resUnder.isUnderAllocated, true, 'isUnderAllocated must be true')
        assert.equal(resUnder.isOverAllocated, false, 'isOverAllocated must be false')
        assert.equal(
          resUnder.discrepancy,
          delta,
          `Under-allocated discrepancy must strictly equal shift delta ${delta}, got ${resUnder.discrepancy}`
        )
        assert.ok(
          resUnder.errorMessage?.includes(`Selisih Rp${formatIDRShort(delta)}`),
          `Error message must contain formatted delta: ${resUnder.errorMessage}`
        )

        // 2. Over-allocated test: parent = S - delta (when S > delta)
        if (S > delta) {
          const parentOver = S - delta
          const resOver = validateSplitTransaction(parentOver, items)

          assert.equal(resOver.canSave, false, 'Over-allocated must block save')
          assert.equal(resOver.isBalanced, false, 'Over-allocated isBalanced must be false')
          assert.equal(resOver.isUnderAllocated, false, 'isUnderAllocated must be false')
          assert.equal(resOver.isOverAllocated, true, 'isOverAllocated must be true')
          assert.equal(
            resOver.discrepancy,
            delta,
            `Over-allocated discrepancy must strictly equal shift delta ${delta}, got ${resOver.discrepancy}`
          )
          assert.ok(
            resOver.errorMessage?.includes(`Selisih Rp${formatIDRShort(delta)}`),
            `Error message must contain formatted delta: ${resOver.errorMessage}`
          )
        }

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(shiftEvaluated >= MIN_PBT_RUNS)
  console.log(`    Sub-check B verified with ${shiftEvaluated} iterations for discrepancy linearity.\n`)
}

// ── Sub-Check C: Boundary & Non-Balance Guards ─────────────────────────────────
// Verifies defensive blocking when:
// 1. Split items list is empty []
// 2. Any item has an empty or whitespace-only category
// 3. Any item has zero or negative nominal
// 4. Parent nominal is <= 0
{
  let guardsEvaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 30 (Sub-check C): Boundary & Non-Balance Guards',
    fc.property(
      arbPositiveRupiahAmount,
      fc.constantFrom('', '   ', null, undefined),
      fc.integer({ min: -1_000_000, max: 0 }),
      (parentAmount, blankCategory, nonPositiveAmount) => {
        guardsEvaluated++

        // 1. Empty split items list
        const resEmpty = validateSplitTransaction(parentAmount, [])
        assert.equal(resEmpty.canSave, false, 'Empty items list must not be saveable')
        assert.equal(resEmpty.isValid, false, 'Empty items list must not be valid')
        assert.equal(resEmpty.discrepancy, parentAmount, 'Empty discrepancy must equal parent')
        assert.ok(resEmpty.errorMessage?.includes('Minimal harus ada satu rincian'))

        // 2. Split item with empty/whitespace category
        const itemsBlankCat = [
          createSplitLineItem({ categoryId: 'makanan', amount: parentAmount }),
          { id: 'bad-cat', categoryId: blankCategory, amount: 1000 },
        ]
        const resBlankCat = validateSplitTransaction(parentAmount + 1000, itemsBlankCat)
        assert.equal(resBlankCat.canSave, false, 'Blank category must block save')
        assert.equal(resBlankCat.hasEmptyCategory, true, 'hasEmptyCategory flag must be true')
        assert.ok(resBlankCat.errorMessage?.includes('kategori yang dipilih'))

        // 3. Split item with non-positive amount (0 or negative)
        const itemsNonPos = [
          createSplitLineItem({ categoryId: 'makanan', amount: parentAmount }),
          { id: 'bad-amt', categoryId: 'belanja', amount: nonPositiveAmount },
        ]
        const resNonPos = validateSplitTransaction(parentAmount, itemsNonPos)
        assert.equal(resNonPos.canSave, false, 'Non-positive amount must block save')
        assert.equal(resNonPos.hasInvalidAmount, true, 'hasInvalidAmount flag must be true')
        assert.ok(resNonPos.errorMessage?.includes('lebih besar dari Rp0'))

        // 4. Non-positive parent amount (0 or negative)
        const validItem = createSplitLineItem({ categoryId: 'makanan', amount: 50_000 })
        const resBadParentZero = validateSplitTransaction(0, [validItem])
        assert.equal(resBadParentZero.canSave, false, 'Zero parent must block save')
        assert.ok(resBadParentZero.errorMessage?.includes('lebih besar dari Rp0'))

        const resBadParentNeg = validateSplitTransaction(-50_000, [validItem])
        assert.equal(resBadParentNeg.canSave, false, 'Negative parent must block save')
        assert.ok(resBadParentNeg.errorMessage?.includes('lebih besar dari Rp0'))

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(guardsEvaluated >= MIN_PBT_RUNS)
  console.log(`    Sub-check C verified with ${guardsEvaluated} iterations for defensive guards.\n`)
}

// ── Sub-Check D: Permutation & Ordering Invariance ────────────────────────────
// The order of split line items in the array must NOT affect totalSplitAmount,
// discrepancy, isBalanced, or canSave.
{
  let permEvaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 30 (Sub-check D): Permutation Invariance',
    fc.property(
      arbPositiveRupiahAmount,
      fc.array(arbValidSplitItem, { minLength: 2, maxLength: 7 }),
      (parentAmount, items) => {
        permEvaluated++

        // Shuffled copy
        const shuffled = [...items].sort(() => Math.random() - 0.5)

        const baseResult = validateSplitTransaction(parentAmount, items)
        const shuffledResult = validateSplitTransaction(parentAmount, shuffled)

        assert.equal(
          shuffledResult.totalSplitAmount,
          baseResult.totalSplitAmount,
          'totalSplitAmount must be permutation invariant'
        )
        assert.equal(
          shuffledResult.discrepancy,
          baseResult.discrepancy,
          'discrepancy must be permutation invariant'
        )
        assert.equal(
          shuffledResult.isBalanced,
          baseResult.isBalanced,
          'isBalanced must be permutation invariant'
        )
        assert.equal(
          shuffledResult.canSave,
          baseResult.canSave,
          'canSave must be permutation invariant'
        )
        assert.equal(
          shuffledResult.errorMessage,
          baseResult.errorMessage,
          'errorMessage must be permutation invariant'
        )

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(permEvaluated >= MIN_PBT_RUNS)
  console.log(`    Sub-check D verified with ${permEvaluated} iterations for permutation invariance.\n`)
}

// ── Sub-Check E: Floating-Point & Fractional Number Sanitization ───────────────
// Non-integer numbers (e.g. 25000.4, 49999.8) must be sanitized and rounded cleanly
// to integers without IEEE-754 precision drift.
{
  let floatEvaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 30 (Sub-check E): Floating-Point Sanitization',
    fc.property(
      fc.integer({ min: 10_000, max: 500_000 }),
      fc.integer({ min: 0, max: 99 }),
      fc.integer({ min: 10_000, max: 500_000 }),
      fc.integer({ min: 0, max: 99 }),
      (base1, frac1, base2, frac2) => {
        floatEvaluated++

        const floatAmount1 = base1 + frac1 / 100
        const floatAmount2 = base2 + frac2 / 100

        const item1 = createSplitLineItem({ categoryId: 'makanan', amount: floatAmount1 })
        const item2 = createSplitLineItem({ categoryId: 'belanja', amount: floatAmount2 })

        // Amounts must be clean integers
        assert.ok(Number.isInteger(item1.amount), 'item1 amount must be integer')
        assert.ok(Number.isInteger(item2.amount), 'item2 amount must be integer')

        const expectedTotal = Math.round(floatAmount1) + Math.round(floatAmount2)
        const total = calculateSplitTotal([item1, item2])
        assert.equal(total, expectedTotal, 'calculateSplitTotal matches rounded sum')

        // Test with exact rounded parent
        const resExact = validateSplitTransaction(expectedTotal, [item1, item2])
        assert.equal(resExact.canSave, true, 'Rounded exact parent must be saveable')
        assert.equal(resExact.discrepancy, 0, 'Discrepancy must be 0')

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(floatEvaluated >= MIN_PBT_RUNS)
  console.log(`    Sub-check E verified with ${floatEvaluated} iterations for floating point sanitization.\n`)
}

// ── Concrete Blueprint Scenarios ──────────────────────────────────────────────
{
  console.log('▶ Running Concrete Blueprint Scenario Validations...')

  // Scenario 1: Supermarket grocery receipt (Balanced)
  // Parent: Rp250.000
  // Makanan: Rp150.000, Belanja: Rp75.000, Kesehatan: Rp25.000
  // Total: Rp250.000 -> Balanced, canSave: true, discrepancy: 0
  const bpReceiptItems = [
    createSplitLineItem({ categoryId: 'makanan', amount: 150_000, note: 'Bahan makanan' }),
    createSplitLineItem({ categoryId: 'belanja', amount: 75_000, note: 'Sabun & deterjen' }),
    createSplitLineItem({ categoryId: 'kesehatan', amount: 25_000, note: 'Obat flu' }),
  ]
  const bpRes1 = validateSplitTransaction(250_000, bpReceiptItems)
  assert.equal(bpRes1.isValid, true, 'Scenario 1 isValid')
  assert.equal(bpRes1.canSave, true, 'Scenario 1 canSave')
  assert.equal(bpRes1.discrepancy, 0, 'Scenario 1 discrepancy')
  assert.equal(bpRes1.isBalanced, true, 'Scenario 1 isBalanced')
  assert.equal(bpRes1.errorMessage, undefined, 'Scenario 1 no error')

  // Scenario 2: Under-allocated purchase (Parent 200k, split total 150k -> Selisih 50k)
  const bpRes2 = validateSplitTransaction(200_000, [
    createSplitLineItem({ categoryId: 'makanan', amount: 150_000 }),
  ])
  assert.equal(bpRes2.isValid, false, 'Scenario 2 isValid')
  assert.equal(bpRes2.canSave, false, 'Scenario 2 canSave blocked')
  assert.equal(bpRes2.discrepancy, 50_000, 'Scenario 2 discrepancy 50k')
  assert.equal(bpRes2.isUnderAllocated, true, 'Scenario 2 isUnderAllocated')
  assert.equal(
    bpRes2.errorMessage,
    'Selisih Rp50.000. Total alokasi harus pas dengan transaksi induk.',
    'Scenario 2 exact error message match'
  )

  // Scenario 3: Over-allocated purchase (Parent 100k, split total 125k -> Selisih 25k)
  const bpRes3 = validateSplitTransaction(100_000, [
    createSplitLineItem({ categoryId: 'makanan', amount: 80_000 }),
    createSplitLineItem({ categoryId: 'belanja', amount: 45_000 }),
  ])
  assert.equal(bpRes3.isValid, false, 'Scenario 3 isValid')
  assert.equal(bpRes3.canSave, false, 'Scenario 3 canSave blocked')
  assert.equal(bpRes3.discrepancy, 25_000, 'Scenario 3 discrepancy 25k')
  assert.equal(bpRes3.isOverAllocated, true, 'Scenario 3 isOverAllocated')
  assert.equal(
    bpRes3.errorMessage,
    'Selisih Rp25.000. Total alokasi harus pas dengan transaksi induk.',
    'Scenario 3 exact error message match'
  )

  console.log('✓ Concrete blueprint validations passed successfully.')
}

console.log('\n========================================================================')
console.log('✅ ALL PROPERTY 30 (SPLIT TRANSACTION BALANCE & DISCREPANCY) PBT SUITES PASSED!')
console.log('========================================================================\n')
