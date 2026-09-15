/**
 * SakuKilat — Property-Based Test Suite for Full Nominal Currency Display
 *
 * Feature: sakukilat-core-roadmap, Property 2: Full Nominal Currency Display
 * Validates: Requirements 1.3
 *
 * For any valid non-negative integer amount A, formatIDR(A) SHALL render
 * the full numeric value formatted with Indonesian group separators (.),
 * prefixed with "Rp", and SHALL NOT contain abbreviation suffixes such
 * as "K", "k", "JT", "jt", "M", or "m".
 */

import assert from 'node:assert/strict'
import {
  fc,
  testProperty,
  MIN_PBT_RUNS,
  arbRupiahAmount,
} from './pbt-harness.mjs'
import {
  formatIDR,
  formatIDRCompact,
  formatIDRShort,
} from '../lib/parser.ts'

console.log('====================================================')
console.log('   SAKUKILAT — PBT: FULL NOMINAL CURRENCY DISPLAY   ')
console.log('====================================================\n')

// Regex for valid Indonesian Rupiah full nominal pattern:
// Must begin with "Rp" followed by a space or non-breaking space (\u00a0),
// then either 0 or groups of 1-3 digits separated by dots (.)
const IDR_FULL_NOMINAL_REGEX = /^Rp[\s\u00a0](0|[1-9]\d{0,2}(\.\d{3})*)$/

// Regex detecting abbreviation suffixes (k, K, rb, ribu, jt, JT, juta, m, M, dsb)
const ABBREVIATION_SUFFIX_REGEX = /[kKmM]|jt|JT|rb|ribu|juta|miliar/

// Feature: sakukilat-core-roadmap, Property 2: Full Nominal Currency Display
// Validates: Requirements 1.3
{
  let runCount = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 2: Full Nominal Currency Display',
    fc.property(
      fc.oneof(
        arbRupiahAmount,
        fc.integer({ min: 0, max: 10_000_000_000 }), // Large numbers up to 10 billion
        fc.constantFrom(0, 1, 5, 50, 500, 999, 1000, 25000, 100000, 1500000, 50000000, 1000000000)
      ),
      (amount) => {
        runCount++

        const formatted = formatIDR(amount)
        const compact = formatIDRCompact(amount)
        const short = formatIDRShort(amount)

        // 1. Must be prefixed with "Rp"
        assert.ok(
          formatted.startsWith('Rp'),
          `Expected formatIDR(${amount}) to start with "Rp", got "${formatted}"`
        )

        // 2. Must strictly match full nominal pattern with dot group separators
        assert.match(
          formatted,
          IDR_FULL_NOMINAL_REGEX,
          `Expected formatIDR(${amount}) to match full nominal regex, got "${formatted}"`
        )

        // 3. SHALL NOT contain abbreviation suffixes (K, k, JT, jt, M, m, etc.)
        assert.equal(
          ABBREVIATION_SUFFIX_REGEX.test(formatted),
          false,
          `Expected formatIDR(${amount}) to contain NO abbreviation suffixes, got "${formatted}"`
        )

        // 4. Must preserve full numeric value without truncation
        const digitsOnly = formatted.replace(/[^\d]/g, '')
        assert.equal(
          digitsOnly,
          String(amount),
          `Expected digits in formatIDR(${amount}) to match "${amount}", got "${digitsOnly}"`
        )

        // 5. formatIDRCompact must NOT abbreviate and must equal formatIDR
        assert.equal(
          compact,
          formatted,
          `Expected formatIDRCompact(${amount}) to equal formatIDR(${amount})`
        )

        // 6. formatIDRShort must preserve full digits with dot separators without "Rp" prefix
        const expectedShort = formatted.replace(/^Rp[\s\u00a0]/, '')
        assert.equal(
          short,
          expectedShort,
          `Expected formatIDRShort(${amount}) to equal "${expectedShort}", got "${short}"`
        )

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(
    runCount >= MIN_PBT_RUNS,
    `Expected at least ${MIN_PBT_RUNS} iterations, but ran ${runCount}`
  )
}

// Concrete Edge Case Verification
{
  const edgeCases = [
    { amount: 0, expected: 'Rp\u00a00' },
    { amount: 1, expected: 'Rp\u00a01' },
    { amount: 999, expected: 'Rp\u00a0999' },
    { amount: 1000, expected: 'Rp\u00a01.000' },
    { amount: 25000, expected: 'Rp\u00a025.000' },
    { amount: 1500000, expected: 'Rp\u00a01.500.000' },
    { amount: 1000000000, expected: 'Rp\u00a01.000.000.000' },
  ]

  for (const { amount, expected } of edgeCases) {
    const res = formatIDR(amount)
    assert.equal(res, expected, `Edge case formatIDR(${amount})`)
    assert.equal(formatIDRCompact(amount), expected, `Edge case formatIDRCompact(${amount})`)
  }

  console.log('✓ Concrete edge case validations passed')
}

console.log('\n✅ Property 2 PBT for Full Nominal Currency Display PASSED! (>= 100 iterations verified)\n')
