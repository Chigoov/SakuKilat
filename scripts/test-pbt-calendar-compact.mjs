/**
 * SakuKilat — Property-Based Test: Calendar Compact String Length and Layout Invariant
 *
 * Feature: sakukilat-submenus-and-bugfixes
 * Property 5: Non-Truncated Daily Nominal Formatting
 * Validates: Requirements 2.5, 2.7
 *
 * Generates random currency values from Rp0 to Rp100.000.000.000 using fast-check:
 * 1. Asserts string output from formatIDRCalendarCompact(amount) plus prefix '+' or '-' never exceeds 7 characters.
 * 2. Asserts no decimal dots for numbers (uses comma ',' for decimals).
 * 3. Verifies complete absence of ellipsis character '...' or '…' across 1,000 randomized iterations.
 */

import assert from 'node:assert/strict'
import { fc, testProperty } from './pbt-harness.mjs'
import { formatIDRCalendarCompact } from '../lib/parser.ts'

console.log('========================================================================')
console.log(' SAKUKILAT — PBT: CALENDAR COMPACT STRING LENGTH & LAYOUT INVARIANT     ')
console.log(' Feature: sakukilat-submenus-and-bugfixes | Property 5                  ')
console.log(' Validates: Requirements 2.5, 2.7                                       ')
console.log('========================================================================\n')

const arbCalendarCurrencyAmount = fc.oneof(
  // Zero & near-zero edge cases
  fc.constantFrom(0, 1, 5, 50, 500, 999),
  // Exact boundaries
  fc.constantFrom(
    1_000, 1_500, 9_999, 10_000, 25_000, 75_000, 99_500, 100_000, 250_000, 999_000, 999_999,
    1_000_000, 1_500_000, 10_000_000, 25_000_000, 99_500_000, 100_000_000, 999_000_000, 999_999_999,
    1_000_000_000, 1_500_000_000, 10_000_000_000, 99_500_000_000, 100_000_000_000
  ),
  // Arbitrary integers across full range 0 to 100 Billion
  fc.integer({ min: 0, max: 100_000_000_000 }),
  // Clustered near transition boundaries (thousands, millions, billions)
  fc.integer({ min: 900, max: 1_200 }),
  fc.integer({ min: 990_000, max: 1_010_000 }),
  fc.integer({ min: 990_000_000, max: 1_010_000_000 })
)

testProperty(
  'Property 5: Non-Truncated Daily Nominal Formatting - Calendar Compact String Length Invariant',
  fc.property(arbCalendarCurrencyAmount, (amount) => {
    const formatted = formatIDRCalendarCompact(amount)

    // 1. Must never be empty
    assert.ok(formatted.length > 0, `Output for amount ${amount} must not be empty`)

    // 2. Output with '+' or '-' prefix must never exceed 7 characters
    const withPlus = `+${formatted}`
    const withMinus = `-${formatted}`
    assert.ok(
      withPlus.length <= 7,
      `Expected withPlus string length <= 7 for amount ${amount}, got "${withPlus}" (len ${withPlus.length})`
    )
    assert.ok(
      withMinus.length <= 7,
      `Expected withMinus string length <= 7 for amount ${amount}, got "${withMinus}" (len ${withMinus.length})`
    )

    // 3. Must NEVER contain decimal dots (Indonesian locale uses comma for decimal)
    assert.equal(
      formatted.includes('.'),
      false,
      `Expected no dot '.' in formatted string for amount ${amount}, got "${formatted}"`
    )

    // 4. Must NEVER contain ellipsis characters ('...' or '…')
    assert.equal(
      formatted.includes('...'),
      false,
      `Expected no ellipsis '...' for amount ${amount}, got "${formatted}"`
    )
    assert.equal(
      formatted.includes('…'),
      false,
      `Expected no ellipsis '…' for amount ${amount}, got "${formatted}"`
    )

    // 5. If it contains a comma, it must be followed by exactly 1 decimal digit and a scale unit (rb/jt/M)
    if (formatted.includes(',')) {
      assert.match(
        formatted,
        /^\d+,\d(rb|jt|M)$/,
        `Expected valid decimal format with comma for amount ${amount}, got "${formatted}"`
      )
    } else if (amount >= 1_000) {
      assert.match(
        formatted,
        /^\d+(rb|jt|M)$/,
        `Expected valid integer scale format for amount ${amount}, got "${formatted}"`
      )
    } else {
      assert.match(
        formatted,
        /^\d+$/,
        `Expected plain digits for amount < 1000 (${amount}), got "${formatted}"`
      )
    }
  }),
  { numRuns: 1000 }
)

console.log('✅ Property 5 (Calendar Compact Invariant) verified across 1,000 iterations!\n')
