/**
 * Unit Tests for Live Rupiah Input Helpers (lib/amount.ts)
 */

import assert from 'node:assert/strict'
import {
  stripToDigits,
  formatRupiahLive,
  calculateCursorPosition,
  parseAmountInput,
} from '../lib/amount.ts'

console.log('=== Testing Live Rupiah Helpers ===\n')

// 1. stripToDigits tests
{
  assert.equal(stripToDigits(''), '', 'empty string')
  assert.equal(stripToDigits('   '), '', 'whitespace')
  assert.equal(stripToDigits('12345'), '12345', 'plain digits')
  assert.equal(stripToDigits('1.250.000'), '1250000', 'dots stripped')
  assert.equal(stripToDigits('Rp 1.250.000'), '1250000', 'Rp and dots stripped')
  assert.equal(stripToDigits('rp 50000'), '50000', 'case-insensitive rp stripped')
  assert.equal(stripToDigits('0'), '0', 'single zero preserved')
  assert.equal(stripToDigits('000'), '0', 'multiple zeros normalized to single zero')
  assert.equal(stripToDigits('0500'), '500', 'leading zero stripped when followed by digits')
  assert.equal(stripToDigits('0012500'), '12500', 'multiple leading zeros stripped')
  assert.equal(stripToDigits('abc!@#$'), '', 'non-digits only returns empty')
  console.log('✓ Group 1: stripToDigits tests passed')
}

// 2. formatRupiahLive tests
{
  assert.equal(formatRupiahLive(''), '', 'empty string')
  assert.equal(formatRupiahLive('0'), '0', 'single zero')
  assert.equal(formatRupiahLive('5'), '5', 'single digit')
  assert.equal(formatRupiahLive('50'), '50', 'two digits')
  assert.equal(formatRupiahLive('500'), '500', 'three digits')
  assert.equal(formatRupiahLive('5000'), '5.000', 'four digits')
  assert.equal(formatRupiahLive('50000'), '50.000', 'five digits')
  assert.equal(formatRupiahLive('1250000'), '1.250.000', 'seven digits')
  assert.equal(formatRupiahLive('100000000000'), '100.000.000.000', '100 billion (12 digits)')
  assert.equal(formatRupiahLive(1250000), '1.250.000', 'numeric input accepted')
  assert.equal(formatRupiahLive('Rp 1.250.000'), '1.250.000', 'formatted input accepted')
  console.log('✓ Group 2: formatRupiahLive tests passed')
}

// 3. calculateCursorPosition tests
{
  // User types '3' after '1.' in '1.250' -> was at pos 2 (after '1.')
  // oldFormatted: '1.250', oldCursor: 2 (after '1.') -> 1 digit before cursor
  // newFormatted: '1.325.000' -> cursor should be after '1' (pos 1 or after dot pos 2)
  const pos1 = calculateCursorPosition('1.250', '12.500', 1)
  assert.equal(pos1, 1, 'cursor at first digit')

  // Backspacing in the middle:
  // oldFormatted: '1.250.000', cursor was at index 3 (after '1.2') -> 2 digits before cursor ('1', '2')
  // newFormatted: '125.000' -> after 2 digits ('1', '2') is index 2
  const pos2 = calculateCursorPosition('1.250.000', '125.000', 3)
  assert.equal(pos2, 2, 'cursor matches digits count after backspacing')

  // Cursor at start
  const pos3 = calculateCursorPosition('1.000', '10.000', 0)
  assert.equal(pos3, 0, 'cursor at start stays 0')

  // Cursor at end
  const pos4 = calculateCursorPosition('1.000', '10.000', 5)
  assert.equal(pos4, 6, 'cursor at end moves to new end')
  console.log('✓ Group 3: calculateCursorPosition tests passed')
}

// 4. Natural shortcut parsing (parseAmountInput)
{
  assert.equal(parseAmountInput('50k'), 50000, '50k')
  assert.equal(parseAmountInput('1,5jt'), 1500000, '1,5jt')
  assert.equal(parseAmountInput('1.5jt'), 1500000, '1.5jt')
  assert.equal(parseAmountInput('250rb'), 250000, '250rb')
  assert.equal(parseAmountInput('1.250.000'), 1250000, '1.250.000')
  console.log('✓ Group 4: parseAmountInput tests passed')
}

console.log('\nAll amount/rupiah tests PASSED!')
