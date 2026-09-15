/**
 * SakuKilat — Unit & Regression Tests for Task 22.3:
 * Split Line Item Editor UI & Transaction Form Integration
 *
 * Verifies:
 * 1. Component Source & File Integrity for SplitTransactionEditor
 * 2. Multi-category split row editor with dynamic line item addition and removal (Req 11.1)
 * 3. Real-time allocation summary, remaining discrepancy indicator, and disable submit until balanced (Req 11.2, 11.3)
 * 4. Integration of split toggle and editor in components/manual-entry-form.tsx
 * 5. Integration of split toggle and editor in components/edit-transaction-modal.tsx
 * 6. Edit mode auto-population when opening existing split transaction
 * 7. Blocking save when split is unbalanced with exact discrepancy error format
 *
 * Run: node scripts/test-split-transaction-ui.mjs
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import {
  createSplitLineItem,
  calculateSplitTotal,
  calculateSplitDiscrepancy,
  validateSplitTransaction,
  canSaveSplitTransaction,
  isSplitTransaction,
  SplitTransactionValidator,
} from '../lib/split-transaction.ts'

import { formatIDR, formatIDRShort } from '../lib/parser.ts'

let passed = 0
let failed = 0
let total = 0

function test(name, fn) {
  total++
  try {
    fn()
    console.log(`  ✓ PASS: ${name}`)
    passed++
  } catch (e) {
    console.log(`  ✗ FAIL: ${name}`)
    console.log(`    → ${e.message}`)
    failed++
  }
}

console.log('====================================================================')
console.log('  SAKUKILAT — TASK 22.3: SPLIT TRANSACTION EDITOR & UI TESTS       ')
console.log('====================================================================\n')

// ── Group 1: Component Source & File Integrity ─────────────────────────────────
console.log('▶ Group 1: Component Source & File Integrity (Task 22.3)...')

test('components/split-transaction-editor.tsx exists and exports SplitTransactionEditor', () => {
  const editorPath = path.resolve(import.meta.dirname, '../components/split-transaction-editor.tsx')
  assert.ok(fs.existsSync(editorPath), 'split-transaction-editor.tsx must exist')
  const content = fs.readFileSync(editorPath, 'utf8')
  assert.ok(content.includes('export const SplitTransactionEditor'), 'Must export SplitTransactionEditor')
  assert.ok(content.includes('data-testid="split-editor"'), 'Must define split-editor testid')
  assert.ok(content.includes('data-testid="split-summary-parent"'), 'Must define split-summary-parent testid')
  assert.ok(content.includes('data-testid="split-summary-total"'), 'Must define split-summary-total testid')
  assert.ok(content.includes('data-testid="split-discrepancy-banner"'), 'Must define split-discrepancy-banner testid')
  assert.ok(content.includes('data-testid="split-add-btn"'), 'Must define split-add-btn testid')
})

test('SplitTransactionEditor defines row elements with dynamic index testids', () => {
  const editorPath = path.resolve(import.meta.dirname, '../components/split-transaction-editor.tsx')
  const content = fs.readFileSync(editorPath, 'utf8')
  assert.ok(content.includes('data-testid={`split-item-row-${index}`}'), 'Row container testid')
  assert.ok(content.includes('data-testid={`split-category-select-${index}`}'), 'Category select testid')
  assert.ok(content.includes('data-testid={`split-amount-input-${index}`}'), 'Amount input testid')
  assert.ok(content.includes('data-testid={`split-remove-btn-${index}`}'), 'Remove button testid')
  assert.ok(content.includes('data-testid={`split-note-input-${index}`}'), 'Note input testid')
})

// ── Group 2: Multi-Category Row Editor & Dynamic Addition/Removal (Req 11.1) ──
console.log('\n▶ Group 2: Dynamic Split Line Item Addition & Removal (Req 11.1)...')

test('Dynamic addition of split line items populates unique IDs and defaults', () => {
  const parentAmount = 250000
  let splitItems = [
    createSplitLineItem({ categoryId: 'makanan', amount: 150000 }),
  ]

  assert.equal(splitItems.length, 1, 'Initial 1 item')
  const total1 = calculateSplitTotal(splitItems)
  assert.equal(total1, 150000, 'Total 150k')
  const discrepancy1 = calculateSplitDiscrepancy(parentAmount, splitItems)
  assert.equal(discrepancy1, 100000, 'Remaining discrepancy 100k')

  // Simulate clicking "+ Tambah Rincian Alokasi" with auto-allocated discrepancy
  const newItem = createSplitLineItem({ categoryId: 'belanja', amount: discrepancy1 })
  splitItems = [...splitItems, newItem]

  assert.equal(splitItems.length, 2, 'Now 2 items')
  assert.equal(splitItems[1].categoryId, 'belanja', 'Second item category')
  assert.equal(splitItems[1].amount, 100000, 'Second item amount fills discrepancy')
  assert.equal(calculateSplitTotal(splitItems), parentAmount, 'Total now equals parent amount')
  assert.equal(calculateSplitDiscrepancy(parentAmount, splitItems), 0, 'Zero discrepancy')
})

test('Dynamic removal of split line items preserves remaining allocations', () => {
  let splitItems = [
    createSplitLineItem({ id: 's1', categoryId: 'makanan', amount: 100000 }),
    createSplitLineItem({ id: 's2', categoryId: 'hiburan', amount: 50000 }),
    createSplitLineItem({ id: 's3', categoryId: 'transportasi', amount: 50000 }),
  ]

  // Remove middle item
  splitItems = splitItems.filter(item => item.id !== 's2')
  assert.equal(splitItems.length, 2, '2 items remaining')
  assert.equal(splitItems[0].id, 's1', 'First item retained')
  assert.equal(splitItems[1].id, 's3', 'Third item retained')
  assert.equal(calculateSplitTotal(splitItems), 150000, 'Total adjusted to 150k')
})

test('Equal split helper divides parent amount accurately with remainder handling', () => {
  const parentAmount = 100000
  const rows = [
    createSplitLineItem({ categoryId: 'makanan', amount: 0 }),
    createSplitLineItem({ categoryId: 'belanja', amount: 0 }),
    createSplitLineItem({ categoryId: 'hiburan', amount: 0 }),
  ]

  const count = rows.length
  const baseShare = Math.floor(parentAmount / count)
  const remainder = parentAmount - (baseShare * count)

  const updatedRows = rows.map((item, i) => ({
    ...item,
    amount: i === 0 ? baseShare + remainder : baseShare,
  }))

  assert.equal(updatedRows[0].amount, 33334, 'First row gets base + remainder (33334)')
  assert.equal(updatedRows[1].amount, 33333, 'Second row gets base (33333)')
  assert.equal(updatedRows[2].amount, 33333, 'Third row gets base (33333)')
  assert.equal(calculateSplitTotal(updatedRows), parentAmount, 'Sum of all rows exactly equals 100,000')
})

// ── Group 3: Real-Time Allocation Summary & Save Blocking (Req 11.2, 11.3) ─────
console.log('\n▶ Group 3: Real-Time Allocation Summary & Save Blocking (Req 11.2, 11.3)...')

test('Balanced allocation allows saving (canSave === true)', () => {
  const parentAmount = 300000
  const splitItems = [
    createSplitLineItem({ categoryId: 'makanan', amount: 200000 }),
    createSplitLineItem({ categoryId: 'belanja', amount: 100000 }),
  ]

  const validation = validateSplitTransaction(parentAmount, splitItems)
  assert.equal(validation.isValid, true, 'Validation is valid')
  assert.equal(validation.canSave, true, 'canSave is true')
  assert.equal(validation.discrepancy, 0, 'Zero discrepancy')
  assert.equal(validation.isBalanced, true, 'isBalanced is true')
  assert.equal(validation.isUnderAllocated, false, 'isUnderAllocated is false')
  assert.equal(validation.isOverAllocated, false, 'isOverAllocated is false')
  assert.equal(canSaveSplitTransaction(parentAmount, splitItems), true, 'canSaveSplitTransaction returns true')
})

test('Under-allocated split blocks saving and formats exact discrepancy', () => {
  const parentAmount = 300000
  const splitItems = [
    createSplitLineItem({ categoryId: 'makanan', amount: 180000 }),
  ]

  const validation = validateSplitTransaction(parentAmount, splitItems)
  assert.equal(validation.isValid, false, 'Validation is invalid')
  assert.equal(validation.canSave, false, 'canSave is blocked')
  assert.equal(validation.discrepancy, 120000, 'Discrepancy is 120,000')
  assert.equal(validation.isUnderAllocated, true, 'isUnderAllocated is true')
  assert.ok(validation.errorMessage?.includes('Selisih Rp120.000'), 'Error message displays formatted delta')
  assert.ok(validation.errorMessage?.includes('Total alokasi harus pas dengan transaksi induk'), 'Error matches design format')
  assert.equal(canSaveSplitTransaction(parentAmount, splitItems), false, 'canSaveSplitTransaction returns false')
})

test('Over-allocated split blocks saving and formats exact discrepancy', () => {
  const parentAmount = 150000
  const splitItems = [
    createSplitLineItem({ categoryId: 'makanan', amount: 100000 }),
    createSplitLineItem({ categoryId: 'belanja', amount: 80000 }),
  ]

  const validation = validateSplitTransaction(parentAmount, splitItems)
  assert.equal(validation.isValid, false, 'Validation is invalid')
  assert.equal(validation.canSave, false, 'canSave is blocked')
  assert.equal(validation.discrepancy, 30000, 'Discrepancy is 30,000')
  assert.equal(validation.isOverAllocated, true, 'isOverAllocated is true')
  assert.ok(validation.errorMessage?.includes('Selisih Rp30.000'), 'Error message displays formatted delta')
  assert.equal(canSaveSplitTransaction(parentAmount, splitItems), false, 'canSaveSplitTransaction returns false')
})

// ── Group 4: Integration in components/manual-entry-form.tsx ───────────────────
console.log('\n▶ Group 4: ManualEntryForm Integration...')

test('ManualEntryForm imports SplitTransactionEditor and split utilities', () => {
  const formPath = path.resolve(import.meta.dirname, '../components/manual-entry-form.tsx')
  const content = fs.readFileSync(formPath, 'utf8')
  assert.ok(content.includes("import { SplitTransactionEditor } from '@/components/split-transaction-editor'"), 'Imports SplitTransactionEditor')
  assert.ok(content.includes('canSaveSplitTransaction'), 'Imports canSaveSplitTransaction')
  assert.ok(content.includes('createSplitLineItem'), 'Imports createSplitLineItem')
  assert.ok(content.includes('type SplitLineItem'), 'Imports SplitLineItem type')
})

test('ManualEntryForm renders split toggle with data-testid="toggle-split-mode"', () => {
  const formPath = path.resolve(import.meta.dirname, '../components/manual-entry-form.tsx')
  const content = fs.readFileSync(formPath, 'utf8')
  assert.ok(content.includes('data-testid="toggle-split-mode"'), 'Contains toggle-split-mode testid')
  assert.ok(content.includes('Pisah Kategori (Split)'), 'Contains toggle title text')
})

test('ManualEntryForm integrates SplitTransactionEditor and passes splitItems to store', () => {
  const formPath = path.resolve(import.meta.dirname, '../components/manual-entry-form.tsx')
  const content = fs.readFileSync(formPath, 'utf8')
  assert.ok(content.includes('<SplitTransactionEditor'), 'Renders SplitTransactionEditor')
  assert.ok(content.includes('splitItems: isSplitMode ? splitItems : undefined'), 'Passes splitItems to addManualTransaction')
  assert.ok(content.includes('Alokasi Belum Seimbang'), 'Shows Alokasi Belum Seimbang when split is unbalanced')
})

test('ManualEntryForm blocks submission when split is active and unbalanced', () => {
  const formPath = path.resolve(import.meta.dirname, '../components/manual-entry-form.tsx')
  const content = fs.readFileSync(formPath, 'utf8')
  assert.ok(content.includes('canSaveSplitTransaction(parsedAmount || 0, splitItems)'), 'Checks canSaveSplitTransaction for validity')
  assert.ok(content.includes('isSplitValid && !submitting'), 'Enforces isSplitValid in canSubmit')
  assert.ok(content.includes('isSplitMode ? !!parsedAmount && !!paymentMethod && isSplitValid && !submitting' ) ||
            content.includes('isSplitValid && !submitting'), 'Enforces isSplitValid in canSubmit')
})

// ── Group 5: Integration in components/edit-transaction-modal.tsx ──────────────
console.log('\n▶ Group 5: EditTransactionModal Integration...')

test('EditTransactionModal imports SplitTransactionEditor and split utilities', () => {
  const modalPath = path.resolve(import.meta.dirname, '../components/edit-transaction-modal.tsx')
  const content = fs.readFileSync(modalPath, 'utf8')
  assert.ok(content.includes("import { SplitTransactionEditor } from '@/components/split-transaction-editor'"), 'Imports SplitTransactionEditor')
  assert.ok(content.includes('canSaveSplitTransaction'), 'Imports canSaveSplitTransaction')
  assert.ok(content.includes('createSplitLineItem'), 'Imports createSplitLineItem')
})

test('EditTransactionModal renders split toggle with data-testid="edit-toggle-split-mode"', () => {
  const modalPath = path.resolve(import.meta.dirname, '../components/edit-transaction-modal.tsx')
  const content = fs.readFileSync(modalPath, 'utf8')
  assert.ok(content.includes('data-testid="edit-toggle-split-mode"'), 'Contains edit-toggle-split-mode testid')
  assert.ok(content.includes('Pisah Kategori (Split)'), 'Contains toggle label')
})

test('EditTransactionModal auto-populates split mode when transaction has existing splitItems', () => {
  const modalPath = path.resolve(import.meta.dirname, '../components/edit-transaction-modal.tsx')
  const content = fs.readFileSync(modalPath, 'utf8')
  assert.ok(content.includes('if (transaction.splitItems && transaction.splitItems.length > 0)'), 'Detects existing splitItems')
  assert.ok(content.includes('setIsSplitMode(true)'), 'Enables split mode automatically')
  assert.ok(content.includes('setSplitItems(transaction.splitItems.map(item => ({ ...item })))'), 'Clones splitItems into state')
})

test('EditTransactionModal blocks saving when split is active and unbalanced', () => {
  const modalPath = path.resolve(import.meta.dirname, '../components/edit-transaction-modal.tsx')
  const content = fs.readFileSync(modalPath, 'utf8')
  assert.ok(content.includes('if (isSplitMode && !isSplitValid) return'), 'Guard in handleSave blocks unbalanced save')
  assert.ok(content.includes('(isSplitMode && !isSplitValid)'), 'Disables save button when unbalanced')
  assert.ok(content.includes('isSplitMode && !isSplitValid ? \'Alokasi Belum Seimbang\' : \'Simpan Perubahan\''), 'Button text updates when unbalanced')
  assert.ok(content.includes('splitItems: isSplitMode ? splitItems : undefined'), 'Passes splitItems in updates payload')
})

// ── Summary ──
console.log('\n──────────────────────────────────────────────────')
console.log(`Results: ${passed}/${total} passed, ${failed} failed`)

if (failed > 0) {
  console.log('❌ Some Task 22.3 UI tests failed!')
  process.exit(1)
} else {
  console.log('✅ All Task 22.3 Split Transaction UI tests passed!')
}
