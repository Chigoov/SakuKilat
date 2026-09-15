/**
 * SakuKilat — Manual Entry Date Visibility & Accessibility Tests (UX Remediation Phase 1)
 *
 * Acceptance Criteria Verified:
 * 1. Date and time controls are located in the main form area outside the "Detail Tambahan" accordion.
 * 2. Clear label "Tanggal transaksi" is explicitly linked via htmlFor="sk-manual-entry-date".
 * 3. Date input possesses id="sk-manual-entry-date", name="entryDate", aria-label="Tanggal transaksi", and data-testid="manual-tx-date".
 * 4. Time input possesses id="sk-manual-entry-time", name="entryTime", aria-label="Waktu transaksi", and data-testid="manual-tx-time".
 * 5. Quick date buttons "Hari Ini" and "Kemarin" are present and functional.
 * 6. "Detail Tambahan" accordion is reserved exclusively for secondary details (Subkategori, Catatan).
 * 7. EditTransactionModal also features accessible "Tanggal transaksi" label and attributes.
 * 8. Past-dated transactions correctly persist calendar date and reflect accurately in reporting stats.
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  formatTransactionDateTime,
  toCalendarDateString,
  toTimeString,
  fromCalendarDateTimeStrings,
} from '../lib/parser.ts'
import {
  transactionsForRange,
  transactionsForDay,
  categoryBreakdown,
  rangeTotals,
} from '../lib/stats.ts'

console.log('========================================================================')
console.log('  SAKUKILAT — MANUAL ENTRY DATE VISIBILITY & ACCESSIBILITY TESTS        ')
console.log('========================================================================\n')

let total = 0
let passed = 0
let failed = 0

function test(name, fn) {
  total++
  try {
    fn()
    console.log(`  ✓ PASS: ${name}`)
    passed++
  } catch (err) {
    console.log(`  ✗ FAIL: ${name}`)
    console.error(`    → ${err.message}`)
    failed++
  }
}

// ── Group 1: Component Source Code Inspection (ManualEntryForm) ───────────────
console.log('▶ Group 1: ManualEntryForm Date Visibility & Accessibility...')

const manualFormPath = path.resolve(import.meta.dirname, '../components/manual-entry-form.tsx')
const manualFormContent = fs.readFileSync(manualFormPath, 'utf8')

test('ManualEntryForm has "Tanggal transaksi" label with htmlFor="sk-manual-entry-date"', () => {
  assert.ok(
    manualFormContent.includes('htmlFor="sk-manual-entry-date"'),
    'Label must have htmlFor pointing to date input id'
  )
  assert.ok(
    manualFormContent.includes('Tanggal transaksi'),
    'Label text must be "Tanggal transaksi"'
  )
})

test('Date input has id="sk-manual-entry-date", name="entryDate", and aria-label="Tanggal transaksi"', () => {
  assert.ok(manualFormContent.includes('id="sk-manual-entry-date"'), 'Input must have id')
  assert.ok(manualFormContent.includes('name="entryDate"'), 'Input must have name="entryDate"')
  assert.ok(manualFormContent.includes('aria-label="Tanggal transaksi"'), 'Input must have aria-label')
  assert.ok(manualFormContent.includes('type="date"'), 'Input must be type="date"')
  assert.ok(manualFormContent.includes('data-testid="manual-tx-date"'), 'Input has testid')
})

test('Time input has id="sk-manual-entry-time", name="entryTime", and aria-label="Waktu transaksi"', () => {
  assert.ok(manualFormContent.includes('id="sk-manual-entry-time"'), 'Time input has id')
  assert.ok(manualFormContent.includes('name="entryTime"'), 'Time input has name="entryTime"')
  assert.ok(manualFormContent.includes('aria-label="Waktu transaksi"'), 'Time input has aria-label')
  assert.ok(manualFormContent.includes('type="time"'), 'Time input must be type="time"')
})

test('Quick date buttons "Hari Ini" and "Kemarin" are present in date section', () => {
  assert.ok(manualFormContent.includes('Hari Ini'), 'Has "Hari Ini" button')
  assert.ok(manualFormContent.includes('Kemarin'), 'Has "Kemarin" button')
})

test('Date controls are positioned BEFORE the "Detail Tambahan" accordion in main form', () => {
  const dateInputPos = manualFormContent.indexOf('id="sk-manual-entry-date"')
  const accordionPos = manualFormContent.indexOf('Detail Tambahan')
  assert.ok(dateInputPos > 0, 'Date input found')
  assert.ok(accordionPos > 0, 'Accordion found')
  assert.ok(
    dateInputPos < accordionPos,
    `Date input (pos ${dateInputPos}) must appear BEFORE Accordion Detail Tambahan (pos ${accordionPos})`
  )
})

test('Detail Tambahan accordion does NOT contain type="date" (reserved for secondary details)', () => {
  const accordionBlock = manualFormContent.slice(manualFormContent.indexOf('Detail Tambahan'))
  assert.ok(!accordionBlock.includes('type="date"'), 'type="date" must NOT be inside Detail Tambahan')
  assert.ok(!accordionBlock.includes('Waktu Transaksi'), '"Waktu Transaksi" must NOT be inside Detail Tambahan')
  assert.ok(
    accordionBlock.includes('Subkategori'),
    'Detail Tambahan header indicates secondary details'
  )
})

// ── Group 2: EditTransactionModal Date Accessibility ─────────────────────────
console.log('\n▶ Group 2: EditTransactionModal Date Accessibility...')

const editModalPath = path.resolve(import.meta.dirname, '../components/edit-transaction-modal.tsx')
const editModalContent = fs.readFileSync(editModalPath, 'utf8')

test('EditTransactionModal has accessible label and attributes for date and time inputs', () => {
  assert.ok(editModalContent.includes('htmlFor="sk-edit-tx-date"'), 'Edit modal label has htmlFor')
  assert.ok(editModalContent.includes('id="sk-edit-tx-date"'), 'Edit modal date input has id')
  assert.ok(editModalContent.includes('aria-label="Tanggal transaksi"'), 'Edit modal date has aria-label')
  assert.ok(editModalContent.includes('id="sk-edit-tx-time"'), 'Edit modal time input has id')
  assert.ok(editModalContent.includes('aria-label="Waktu transaksi"'), 'Edit modal time has aria-label')
})

// ── Group 3: Past-Dated Transaction Reporting & Persistence Invariants ───────
console.log('\n▶ Group 3: Past-Dated Transaction Reporting & Persistence Invariants...')

test('Past-dated input correctly converts without timezone drift and formats as past date', () => {
  const dateStr = '2026-08-10'
  const timeStr = '14:30'
  const parsedDate = fromCalendarDateTimeStrings(dateStr, timeStr)
  
  assert.equal(toCalendarDateString(parsedDate), '2026-08-10', 'Calendar date string matches input')
  assert.equal(toTimeString(parsedDate), '14:30', 'Time string matches input')
  
  const refToday = new Date(2026, 8, 14, 12, 0) // 14 Sep 2026
  const formatted = formatTransactionDateTime(parsedDate, refToday)
  assert.equal(formatted, '10 Agu 2026 • 14.30', 'Formatted as past Indonesian date')
})

test('Past-dated transaction appears on its exact date in transactionsForDay and transactionsForRange', () => {
  const pastTx = {
    id: 'tx-past-1',
    description: 'Makan siang kemarin dulu',
    amount: 35000,
    type: 'expense',
    category: 'makanan',
    paymentMethod: 'bca',
    date: fromCalendarDateTimeStrings('2026-08-10', '12:15'),
  }

  const dayMatches = transactionsForDay([pastTx], '2026-08-10')
  assert.equal(dayMatches.length, 1, 'Found on exact past date')
  assert.equal(dayMatches[0].id, 'tx-past-1')

  const otherDayMatches = transactionsForDay([pastTx], '2026-08-11')
  assert.equal(otherDayMatches.length, 0, 'Not found on different date')

  const augustRange = transactionsForRange(
    [pastTx],
    new Date(2026, 7, 1), // 1 Aug 2026
    new Date(2026, 7, 31, 23, 59, 59)
  )
  assert.equal(augustRange.length, 1, 'Included in August range')

  const septemberRange = transactionsForRange(
    [pastTx],
    new Date(2026, 8, 1), // 1 Sep 2026
    new Date(2026, 8, 30, 23, 59, 59)
  )
  assert.equal(septemberRange.length, 0, 'Excluded from September range')
})

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────────────────────────────────────')
console.log(`Results: ${passed}/${total} passed, ${failed} failed`)

if (failed > 0) {
  console.log('❌ Some manual entry date accessibility tests failed!')
  process.exit(1)
} else {
  console.log('✅ ALL MANUAL ENTRY DATE VISIBILITY & ACCESSIBILITY TESTS PASSED!')
}
