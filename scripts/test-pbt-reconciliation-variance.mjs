/**
 * SakuKilat — Property-Based Test Suite for Wallet Reconciliation Variance Calculation
 *
 * Feature: sakukilat-core-roadmap, Property 17: Wallet Reconciliation Variance Calculation
 * Validates: Requirements 6.2
 *
 * Property 17 Specification:
 * For any recorded balance R and physically counted balance P, the computed
 * reconciliation variance SHALL equal P - R.
 */

import assert from 'node:assert/strict'
import {
  fc,
  testProperty,
  MIN_PBT_RUNS,
  arbRupiahAmount,
} from './pbt-harness.mjs'
import {
  calculateReconciliationVariance,
  formatReconciliationVariance,
  createReconciliationRecord,
  ReconciliationManager,
} from '../lib/reconciliation.ts'

console.log('====================================================')
console.log('  SAKUKILAT — PBT: RECONCILIATION VARIANCE CALC ')
console.log('====================================================\n')

// Normalizes IEEE-754 negative zero (-0) to canonical integer zero (0)
const normalizeZero = (v) => (v === 0 ? 0 : v)

// ── Arbitrary Generators ──────────────────────────────────────────────────

// Standard Indonesian Rupiah balance (0 to 1 Billion)
const arbStandardBalance = arbRupiahAmount

// Wide-range integer balance including overdrawn/negative wallets (-1B to +1B)
const arbSignedBalance = fc.integer({ min: -1_000_000_000, max: 1_000_000_000 })

// Extreme safe integer balance
const arbExtremeBalance = fc.integer({
  min: -1_000_000_000_000,
  max: 1_000_000_000_000,
})

// Arbitrary wallet identifier
const arbWalletId = fc.stringMatching(/^[a-z0-9_-]{3,12}$/)

// ── Feature: sakukilat-core-roadmap, Property 17: Wallet Reconciliation Variance Calculation ──
// Validates: Requirements 6.2
{
  let runCount = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 17: Wallet Reconciliation Variance Calculation',
    fc.property(
      arbSignedBalance,
      arbSignedBalance,
      (actualBalance, expectedBalance) => {
        runCount++

        // 1. Direct function calculation
        const variance = calculateReconciliationVariance(actualBalance, expectedBalance)
        const expectedDiff = normalizeZero(actualBalance - expectedBalance)

        // Core Mathematical Invariant: variance === P - R
        assert.equal(
          variance,
          expectedDiff,
          `Variance between actual (${actualBalance}) and expected (${expectedBalance}) must strictly equal ${expectedDiff}, got ${variance}`
        )

        // 2. ReconciliationManager namespace consistency
        const mgrVariance = ReconciliationManager.calculateVariance(actualBalance, expectedBalance)
        assert.equal(
          mgrVariance,
          variance,
          `ReconciliationManager.calculateVariance must match direct function output`
        )

        // 3. Additive Inversion / Anti-symmetry Invariant:
        // variance(P, R) === -variance(R, P)
        const reverseVariance = calculateReconciliationVariance(expectedBalance, actualBalance)
        assert.equal(
          variance,
          normalizeZero(-reverseVariance),
          `Anti-symmetry failed: variance(${actualBalance}, ${expectedBalance}) [${variance}] must equal -variance(${expectedBalance}, ${actualBalance}) [${normalizeZero(-reverseVariance)}]`
        )

        // 4. Identity with Self Invariant:
        // variance(P, P) === 0
        const identityActual = calculateReconciliationVariance(actualBalance, actualBalance)
        assert.equal(
          identityActual,
          0,
          `Self variance must equal 0, got ${identityActual}`
        )

        // 5. Partitioning & Formatting Invariant:
        // - actual > expected => status 'surplus', badge 'Saldo Lebih', positive diff
        // - actual < expected => status 'shortfall', badge 'Saldo Kurang', negative diff
        // - actual === expected => status 'balanced', badge 'Sesuai', diff 0
        const formatted = formatReconciliationVariance(variance)

        assert.equal(
          formatted.difference,
          variance,
          `Formatted difference must preserve raw variance ${variance}`
        )
        assert.equal(
          formatted.absDifference,
          Math.abs(variance),
          `Formatted absDifference must equal Math.abs(${variance})`
        )

        if (actualBalance > expectedBalance) {
          assert.equal(
            formatted.status,
            'surplus',
            `Status must be 'surplus' when actual > expected`
          )
          assert.equal(
            formatted.badgeText,
            'Saldo Lebih',
            `Badge must be 'Saldo Lebih' on surplus`
          )
          assert.ok(
            formatted.formattedDifference.startsWith('+'),
            `Surplus formattedDifference must start with '+', got "${formatted.formattedDifference}"`
          )
        } else if (actualBalance < expectedBalance) {
          assert.equal(
            formatted.status,
            'shortfall',
            `Status must be 'shortfall' when actual < expected`
          )
          assert.equal(
            formatted.badgeText,
            'Saldo Kurang',
            `Badge must be 'Saldo Kurang' on shortfall`
          )
          assert.ok(
            formatted.formattedDifference.startsWith('-'),
            `Shortfall formattedDifference must start with '-', got "${formatted.formattedDifference}"`
          )
        } else {
          assert.equal(
            formatted.status,
            'balanced',
            `Status must be 'balanced' when actual === expected`
          )
          assert.equal(
            formatted.badgeText,
            'Sesuai',
            `Badge must be 'Sesuai' on balanced`
          )
          assert.equal(
            formatted.difference,
            0,
            `Balanced difference must be 0`
          )
        }

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

// ── Feature: sakukilat-core-roadmap, Property 17 (Sub-check A): Additive Transitivity across 3 Balances ──
// For any three balance states A, B, and C:
// variance(C, B) + variance(B, A) === variance(C, A)
// (C - B) + (B - A) = C - A
{
  let transitivityCount = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 17 (Sub-check A): Additive Transitivity across 3 Balances',
    fc.property(
      arbExtremeBalance,
      arbExtremeBalance,
      arbExtremeBalance,
      (balanceA, balanceB, balanceC) => {
        transitivityCount++

        const vCB = calculateReconciliationVariance(balanceC, balanceB)
        const vBA = calculateReconciliationVariance(balanceB, balanceA)
        const vCA = calculateReconciliationVariance(balanceC, balanceA)

        assert.equal(
          normalizeZero(vCB + vBA),
          vCA,
          `Additive transitivity failed: (${balanceC} - ${balanceB}) + (${balanceB} - ${balanceA}) must equal (${balanceC} - ${balanceA})`
        )

        return true
      }
    ),
    { numRuns: 120 }
  )

  assert.ok(transitivityCount >= MIN_PBT_RUNS)
  console.log(`    Sub-check A verified with ${transitivityCount} runs across 3 balance states.`)
}

// ── Feature: sakukilat-core-roadmap, Property 17 (Sub-check B): Integration with Audit Record Creation ──
// When createReconciliationRecord is invoked without explicitly providing difference,
// the generated record.difference MUST equal actualBalance - expectedBalance.
{
  let recordCheckCount = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 17 (Sub-check B): Integration with Audit Record Creation',
    fc.property(
      arbWalletId,
      arbSignedBalance,
      arbSignedBalance,
      fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
      (walletId, actual, expected, note) => {
        recordCheckCount++

        const record = createReconciliationRecord({
          walletId,
          expectedBalance: expected,
          actualBalance: actual,
          note,
        })

        const expectedDiff = normalizeZero(actual - expected)

        assert.equal(
          record.difference,
          expectedDiff,
          `createReconciliationRecord difference must equal ${expectedDiff}, got ${record.difference}`
        )
        assert.equal(record.expectedBalance, expected)
        assert.equal(record.actualBalance, actual)
        assert.equal(record.walletId, walletId)

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(recordCheckCount >= MIN_PBT_RUNS)
  console.log(`    Sub-check B verified with ${recordCheckCount} runs on createReconciliationRecord.`)
}

// ── Feature: sakukilat-core-roadmap, Property 17 (Sub-check C): Floating-Point & Fractional Invariance ──
// Ensures non-integer or decimal numbers are rounded cleanly to avoid IEEE-754 precision drift
{
  let floatCheckCount = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 17 (Sub-check C): Floating-Point & Fractional Invariance',
    fc.property(
      fc.float({ min: -1_000_000, max: 1_000_000, noNaN: true }),
      fc.float({ min: -1_000_000, max: 1_000_000, noNaN: true }),
      (actualFloat, expectedFloat) => {
        floatCheckCount++

        const variance = calculateReconciliationVariance(actualFloat, expectedFloat)
        const expectedDiff = normalizeZero(Math.round(actualFloat) - Math.round(expectedFloat))

        assert.equal(
          variance,
          expectedDiff,
          `Float variance for actual (${actualFloat}) and expected (${expectedFloat}) must equal rounded diff ${expectedDiff}, got ${variance}`
        )

        // Variance must always be an integer (no floating point decimals)
        assert.equal(
          Number.isInteger(variance),
          true,
          `Variance must be a clean integer, got ${variance}`
        )

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(floatCheckCount >= MIN_PBT_RUNS)
  console.log(`    Sub-check C verified with ${floatCheckCount} runs for floating point values.`)
}

// ── Concrete Edge Cases ───────────────────────────────────────────────────
{
  const edgeCases = [
    { actual: 0, expected: 0, diff: 0, status: 'balanced' },
    { actual: 1, expected: 0, diff: 1, status: 'surplus' },
    { actual: 0, expected: 1, diff: -1, status: 'shortfall' },
    { actual: 500_000, expected: 500_000, diff: 0, status: 'balanced' },
    { actual: 1_000_000, expected: 850_000, diff: 150_000, status: 'surplus' },
    { actual: 850_000, expected: 1_000_000, diff: -150_000, status: 'shortfall' },
    { actual: -50_000, expected: -100_000, diff: 50_000, status: 'surplus' },
    { actual: -100_000, expected: -50_000, diff: -50_000, status: 'shortfall' },
  ]

  for (const tc of edgeCases) {
    const v = calculateReconciliationVariance(tc.actual, tc.expected)
    assert.equal(v, tc.diff, `Edge case variance(${tc.actual}, ${tc.expected})`)
    const fmt = formatReconciliationVariance(v)
    assert.equal(fmt.status, tc.status, `Edge case status(${tc.actual}, ${tc.expected})`)
  }

  console.log('✓ Concrete edge case validations passed')
}

console.log('\n✅ Property 17 (Wallet Reconciliation Variance Calculation) PASSED all invariants with >= 100 iterations each!\n')
