/**
 * Unit & Component Simulation Tests for Live Rupiah Input (lib/amount.ts & components/rupiah-input.tsx)
 */

import assert from 'node:assert/strict'
import {
  stripToDigits,
  formatRupiahLive,
  calculateCursorPosition,
  parseAmountInput,
} from '../lib/amount.ts'

console.log('=== Testing Live Rupiah Helpers and Input Flows ===\n')

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
  // User types '3' after '1.' in '1.250'
  const pos1 = calculateCursorPosition('1.250', '12.500', 1)
  assert.equal(pos1, 1, 'cursor at first digit')

  // Backspacing in the middle:
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

// 5. Component Controlled Flow Simulation Tests
{
  // Simulation helper mimicking RupiahInput handleChange
  function simulateTypeSequence(inputs) {
    let currentValue = ''
    let currentNumeric = 0

    for (const rawInput of inputs) {
      const digits = stripToDigits(rawInput)
      const formatted = formatRupiahLive(digits)
      currentNumeric = digits ? parseInt(digits, 10) : 0
      currentValue = formatted
    }
    return { display: currentValue, numeric: currentNumeric }
  }

  // Simulation helper mimicking RupiahInput handlePaste
  function simulatePaste(pastedText) {
    const parsed = parseAmountInput(pastedText)
    if (parsed > 0) {
      return { numeric: parsed, display: formatRupiahLive(parsed) }
    }
    const digits = stripToDigits(pastedText)
    return { numeric: digits ? parseInt(digits, 10) : 0, display: formatRupiahLive(digits) }
  }

  // 5a. Typing digit by digit: 1 -> 2 -> 3 -> 4 -> 5
  const step1 = simulateTypeSequence(['1'])
  assert.equal(step1.display, '1')
  assert.equal(step1.numeric, 1)

  const step2 = simulateTypeSequence(['1', '12'])
  assert.equal(step2.display, '12')
  assert.equal(step2.numeric, 12)

  const step3 = simulateTypeSequence(['1', '12', '123'])
  assert.equal(step3.display, '123')
  assert.equal(step3.numeric, 123)

  const step4 = simulateTypeSequence(['1', '12', '123', '1234'])
  assert.equal(step4.display, '1.234')
  assert.equal(step4.numeric, 1234)

  const step5 = simulateTypeSequence(['1', '12', '123', '1234', '1.2345'])
  assert.equal(step5.display, '12.345')
  assert.equal(step5.numeric, 12345)

  // 5b. Backspace at end
  const backAtEnd = simulateTypeSequence(['12.345', '12.34'])
  assert.equal(backAtEnd.display, '1.234')
  assert.equal(backAtEnd.numeric, 1234)

  // 5c. Backspace in middle: deleting '3' in '12.345'
  const backInMiddle = simulateTypeSequence(['12.345', '12.45'])
  assert.equal(backInMiddle.display, '1.245')
  assert.equal(backInMiddle.numeric, 1245)

  // 5d. Inserting digit in middle: inserting '9' after '2' in '1.245'
  const insertInMiddle = simulateTypeSequence(['1.245', '1.2945'])
  assert.equal(insertInMiddle.display, '12.945')
  assert.equal(insertInMiddle.numeric, 12945)

  // 5e. Paste formatted amounts
  const pasteFormatted1 = simulatePaste('Rp 1.250.000')
  assert.equal(pasteFormatted1.numeric, 1250000)
  assert.equal(pasteFormatted1.display, '1.250.000')

  const pasteFormatted2 = simulatePaste('500.000')
  assert.equal(pasteFormatted2.numeric, 500000)
  assert.equal(pasteFormatted2.display, '500.000')

  // 5f. Paste shortcuts
  const pasteShortcut1 = simulatePaste('50rb')
  assert.equal(pasteShortcut1.numeric, 50000)
  assert.equal(pasteShortcut1.display, '50.000')

  const pasteShortcut2 = simulatePaste('1,5jt')
  assert.equal(pasteShortcut2.numeric, 1500000)
  assert.equal(pasteShortcut2.display, '1.500.000')

  const pasteShortcut3 = simulatePaste('100k')
  assert.equal(pasteShortcut3.numeric, 100000)
  assert.equal(pasteShortcut3.display, '100.000')

  // 5g. Zero and empty values
  const emptySim = simulateTypeSequence([''])
  assert.equal(emptySim.display, '')
  assert.equal(emptySim.numeric, 0)

  // 5h. Large numbers (never truncated)
  const largeSim = simulateTypeSequence(['100000000'])
  assert.equal(largeSim.display, '100.000.000')
  assert.equal(largeSim.numeric, 100000000)

  console.log('✓ Group 5: Controlled input component flow simulation tests passed')
}

console.log('\nAll amount/rupiah tests PASSED!')
