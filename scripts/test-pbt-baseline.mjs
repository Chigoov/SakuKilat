/**
 * SakuKilat — Baseline Property-Based Test Verification Suite
 * Verifies that fast-check and pbt-harness enforce minimum 100 runs per property,
 * correctly catch invariants, and generate valid domain values.
 */

import assert from 'node:assert/strict'
import {
  fc,
  testProperty,
  MIN_PBT_RUNS,
  arbRupiahAmount,
  arbCalendarDate,
  arbPaymentMethod,
} from './pbt-harness.mjs'

console.log('====================================================')
console.log('    SAKUKILAT — PBT HARNESS BASELINE VERIFICATION   ')
console.log('====================================================\n')

// Feature: sakukilat-core-roadmap, Baseline 1: Minimum 100 iterations enforcement
{
  let runCount = 0
  testProperty(
    'Feature: sakukilat-core-roadmap, Baseline 1: Minimum 100 iterations enforcement',
    fc.property(fc.integer(), (n) => {
      runCount++
      return typeof n === 'number'
    }),
    { numRuns: 100 }
  )
  assert.ok(
    runCount >= MIN_PBT_RUNS,
    `Expected at least ${MIN_PBT_RUNS} iterations, but got ${runCount}`
  )
}

// Feature: sakukilat-core-roadmap, Baseline 2: SakuKilat Rupiah arbitrary domain validity
{
  let nominalRuns = 0
  testProperty(
    'Feature: sakukilat-core-roadmap, Baseline 2: SakuKilat Rupiah arbitrary domain validity',
    fc.property(arbRupiahAmount, (amount) => {
      nominalRuns++
      return (
        Number.isInteger(amount) &&
        amount >= 0 &&
        amount <= 1_000_000_000
      )
    })
  )
  assert.ok(nominalRuns >= MIN_PBT_RUNS)
}

// Feature: sakukilat-core-roadmap, Baseline 3: Calendar date arbitrary year-month bounds
{
  let dateRuns = 0
  testProperty(
    'Feature: sakukilat-core-roadmap, Baseline 3: Calendar date arbitrary year-month bounds',
    fc.property(arbCalendarDate, (d) => {
      dateRuns++
      const yr = d.getFullYear()
      const mo = d.getMonth() + 1
      const day = d.getDate()
      return yr >= 2000 && yr <= 2050 && mo >= 1 && mo <= 12 && day >= 1 && day <= 28
    })
  )
  assert.ok(dateRuns >= MIN_PBT_RUNS)
}

// Feature: sakukilat-core-roadmap, Baseline 4: Payment method arbitrary enumeration
{
  const allowed = new Set(['cash', 'bca', 'mandiri', 'gopay', 'ovo', 'dana', 'shopeepay'])
  testProperty(
    'Feature: sakukilat-core-roadmap, Baseline 4: Payment method arbitrary enumeration',
    fc.property(arbPaymentMethod, (method) => {
      return allowed.has(method)
    })
  )
}

console.log('✅ All baseline PBT tests PASSED with >= 100 iterations verified!\n')
