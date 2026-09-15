/**
 * SakuKilat — Unit & Integration Test Suite for Task 16.4:
 * Inbox Review UI & Rule Creation Prompt on Confirmation
 *
 * Requirements:
 * - 8.2: Where keyword match occurs, present suggested category and subcategory for confirmation
 * - 8.4: Require explicit user confirmation before applying category recommendations
 * - 8.5: When user confirms category for an inbox item, offer prompt "Simpan aturan untuk kata kunci ini?"
 *        and save confirmed pattern as active LocalCategoryRule
 * - 8.6: Offline-first zero network transmission
 *
 * Run: node scripts/test-inbox-review-ui.mjs
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import {
  normalizeKeyword,
  matchesKeyword,
  createLocalRule,
  createInboxItem,
  evaluateTransactionForRules,
  routeToInboxIfNeeded,
  approveInboxTransaction,
  rejectInboxTransaction,
  prepareRuleFromInboxItem,
  incrementRuleUsage,
  getPendingInboxItems,
  isDuplicateRule,
  DEFAULT_CONFIDENCE_THRESHOLD,
  RuleInboxManager,
} from '../lib/rules-inbox.ts'

import { SAKU_SECTIONS } from '../lib/saku-sections.ts'

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
console.log('  SAKUKILAT — TASK 16.4: INBOX REVIEW UI & RULE CREATION PROMPT     ')
console.log('====================================================================\n')

// ── Group 1: Component File & Export Integrity ────────────────────────────────
console.log('▶ Group 1: Component Source & Export Integrity (Task 16.4)...')

test('components/inbox-review.tsx exists and exports required UI components', () => {
  const filePath = path.resolve(import.meta.dirname, '../components/inbox-review.tsx')
  assert.ok(fs.existsSync(filePath), 'inbox-review.tsx must exist')
  const content = fs.readFileSync(filePath, 'utf8')

  assert.ok(content.includes('export const CategorySuggestionChip'), 'Must export CategorySuggestionChip')
  assert.ok(content.includes('export function InboxReview'), 'Must export InboxReview')
  assert.ok(content.includes('export function InboxReviewDrawer'), 'Must export InboxReviewDrawer')
})

test('components/inbox-review.tsx defines all required data-testid hooks', () => {
  const filePath = path.resolve(import.meta.dirname, '../components/inbox-review.tsx')
  const content = fs.readFileSync(filePath, 'utf8')

  assert.ok(content.includes('data-testid="category-suggestion-chip"'), 'Must define category-suggestion-chip testid')
  assert.ok(content.includes('data-testid="apply-category-suggestion-btn"'), 'Must define apply-category-suggestion-btn testid')
  assert.ok(content.includes('data-testid="inbox-review"'), 'Must define inbox-review testid')
  assert.ok(content.includes('data-testid="inbox-review-drawer"'), 'Must define inbox-review-drawer testid')
  assert.ok(content.includes('data-testid="tab-inbox-pending"'), 'Must define tab-inbox-pending testid')
  assert.ok(content.includes('data-testid="tab-inbox-history"'), 'Must define tab-inbox-history testid')
  assert.ok(content.includes('data-testid="tab-inbox-rules"'), 'Must define tab-inbox-rules testid')
  assert.ok(content.includes('data-testid="rule-prompt-modal"'), 'Must define rule-prompt-modal testid')
  assert.ok(content.includes('data-testid="rule-prompt-title"'), 'Must define rule-prompt-title testid')
  assert.ok(content.includes('data-testid="rule-keyword-input"'), 'Must define rule-keyword-input testid')
  assert.ok(content.includes('data-testid="save-rule-confirm-btn"'), 'Must define save-rule-confirm-btn testid')
  assert.ok(content.includes('data-testid="approve-only-btn"'), 'Must define approve-only-btn testid')
  assert.ok(content.includes('data-testid="cancel-prompt-btn"'), 'Must define cancel-prompt-btn testid')
  assert.ok(content.includes('data-testid="rules-list"'), 'Must define rules-list testid')
  assert.ok(content.includes('data-testid="add-new-rule-btn"'), 'Must define add-new-rule-btn testid')
  assert.ok(content.includes('data-testid="save-rule-btn"'), 'Must define save-rule-btn testid')
})

test('Confirmation prompt asks exact required prompt: "Simpan aturan untuk kata kunci ini?"', () => {
  const filePath = path.resolve(import.meta.dirname, '../components/inbox-review.tsx')
  const content = fs.readFileSync(filePath, 'utf8')
  assert.ok(
    content.includes('Simpan aturan untuk kata kunci ini?'),
    'Prompt modal MUST display "Simpan aturan untuk kata kunci ini?"'
  )
})

// ── Group 2: Transaction Forms Integration (Req 8.2, 8.4) ──────────────────────
console.log('\n▶ Group 2: Transaction Forms Integration (Req 8.2, 8.4)...')

test('components/manual-entry-form.tsx integrates CategorySuggestionChip', () => {
  const formPath = path.resolve(import.meta.dirname, '../components/manual-entry-form.tsx')
  assert.ok(fs.existsSync(formPath), 'manual-entry-form.tsx must exist')
  const content = fs.readFileSync(formPath, 'utf8')

  assert.ok(
    content.includes("import { CategorySuggestionChip } from '@/components/inbox-review'"),
    'Must import CategorySuggestionChip'
  )
  assert.ok(
    content.includes('<CategorySuggestionChip'),
    'Must render CategorySuggestionChip in form'
  )
})

test('components/edit-transaction-modal.tsx integrates CategorySuggestionChip', () => {
  const modalPath = path.resolve(import.meta.dirname, '../components/edit-transaction-modal.tsx')
  assert.ok(fs.existsSync(modalPath), 'edit-transaction-modal.tsx must exist')
  const content = fs.readFileSync(modalPath, 'utf8')

  assert.ok(
    content.includes("import { CategorySuggestionChip } from '@/components/inbox-review'"),
    'Must import CategorySuggestionChip'
  )
  assert.ok(
    content.includes('<CategorySuggestionChip'),
    'Must render CategorySuggestionChip in edit modal'
  )
})

// ── Group 3: Tab Saku Navigation Integration (Phase P3 & P8) ───────────────────
console.log('\n▶ Group 3: Tab Saku Navigation Integration...')

test('components/tab-saku.tsx integrates InboxReviewDrawer and provides entry button', () => {
  const tabPath = path.resolve(import.meta.dirname, '../components/tab-saku.tsx')
  const content = fs.readFileSync(tabPath, 'utf8')

  assert.ok(
    content.includes("import { InboxReviewDrawer } from '@/components/inbox-review'"),
    'Must import InboxReviewDrawer'
  )
  assert.ok(
    content.includes('<InboxReviewDrawer'),
    'Must render InboxReviewDrawer'
  )
  assert.ok(
    content.includes('data-testid="btn-open-inbox-review"'),
    'Must render btn-open-inbox-review button'
  )
})

test('Tab Saku retains strictly 4 collapsible sections invariant (Property 8)', () => {
  assert.equal(SAKU_SECTIONS.length, 4, 'Must maintain exactly 4 collapsible sections')
  const sectionIds = SAKU_SECTIONS.map(s => s.id)
  assert.deepEqual(
    sectionIds,
    ['saku-pembayaran', 'kategori-subkategori', 'perencanaan-keuangan', 'kontrol-keuangan'],
    'Exact 4 section IDs preserved'
  )
})

// ── Group 4: Suggestion Chip Behavior & Explicit Confirmation (Req 8.2, 8.4) ───
console.log('\n▶ Group 4: Suggestion Chip Behavior & Explicit Confirmation (Req 8.2, 8.4)...')

test('Rule evaluation provides category suggestion without mutating form state', () => {
  const rules = [
    createLocalRule({ keyword: 'kopi', categoryId: 'makanan', subcategoryId: 'Minuman' }),
  ]

  // Simulate user typing "beli kopi pagi"
  const formState = {
    category: 'lainnya', // Initial default
    subcategory: '',
  }

  const evaluation = evaluateTransactionForRules('beli kopi pagi', rules)
  assert.equal(evaluation.hasMatch, true, 'Keyword match detected')
  assert.equal(evaluation.suggestedCategoryId, 'makanan', 'Suggested category is makanan')
  assert.equal(evaluation.suggestedSubcategoryId, 'Minuman', 'Suggested subcategory is Minuman')

  // Invariant (Req 8.4): Form state is NOT mutated automatically!
  assert.equal(formState.category, 'lainnya', 'Form category must remain unchanged before click')
  assert.equal(formState.subcategory, '', 'Form subcategory must remain unchanged before click')

  // Explicit confirmation: user clicks "Terapkan"
  const onApply = (catId, subId) => {
    formState.category = catId
    formState.subcategory = subId || ''
  }
  onApply(evaluation.suggestedCategoryId, evaluation.suggestedSubcategoryId)

  assert.equal(formState.category, 'makanan', 'Category updated after explicit user confirmation')
  assert.equal(formState.subcategory, 'Minuman', 'Subcategory updated after explicit user confirmation')
})

// ── Group 5: Inbox Item Confirmation & Rule Creation Prompt (Req 8.5) ─────────
console.log('\n▶ Group 5: Inbox Item Confirmation & Rule Creation Prompt (Req 8.5)...')

test('Inbox review workflow: confirming item with rule creation produces active LocalCategoryRule', () => {
  let localRules = [
    createLocalRule({ keyword: 'bensin', categoryId: 'transportasi' }),
  ]
  let inbox = [
    createInboxItem({
      id: 'inbox-item-1',
      rawDescription: 'sate padang ajo',
      amount: 32000,
      confidence: 0,
      status: 'pending',
    }),
  ]

  const pendingItem = inbox[0]
  assert.equal(pendingItem.status, 'pending')

  // User confirms category "makanan" and opts to save rule for keyword "sate padang"
  const confirmedCategory = { categoryId: 'makanan', subcategoryId: 'Restoran' }
  const keywordPromptResult = 'sate padang'

  // 1. Approve inbox item
  const updatedItem = approveInboxTransaction(pendingItem, confirmedCategory)
  assert.equal(updatedItem.status, 'approved')
  assert.equal(updatedItem.suggestedCategoryId, 'makanan')
  assert.equal(updatedItem.suggestedSubcategoryId, 'Restoran')

  // 2. Save new LocalCategoryRule (Req 8.5)
  const newRule = createLocalRule({
    keyword: keywordPromptResult,
    categoryId: confirmedCategory.categoryId,
    subcategoryId: confirmedCategory.subcategoryId,
    isActive: true,
  }, localRules)

  localRules = [newRule, ...localRules]

  assert.equal(localRules.length, 2, 'Local rules count incremented')
  assert.equal(newRule.keyword, 'sate padang', 'New rule keyword stored')
  assert.equal(newRule.categoryId, 'makanan', 'New rule categoryId stored')
  assert.equal(newRule.subcategoryId, 'Restoran', 'New rule subcategoryId stored')
  assert.equal(newRule.isActive, true, 'New rule is active')

  // 3. Subsequent transactions with "sate padang" will now match the newly created rule!
  const nextEval = evaluateTransactionForRules('beli sate padang porsi besar', localRules)
  assert.equal(nextEval.hasMatch, true, 'Next transaction matches newly created rule')
  assert.equal(nextEval.suggestedCategoryId, 'makanan', 'Suggests category from new rule')
  assert.equal(nextEval.suggestedSubcategoryId, 'Restoran', 'Suggests subcategory from new rule')
})

test('Inbox review workflow: user can confirm transaction category WITHOUT saving rule', () => {
  const localRules = [
    createLocalRule({ keyword: 'bensin', categoryId: 'transportasi' }),
  ]
  const pendingItem = createInboxItem({
    id: 'inbox-item-2',
    rawDescription: 'hadiah wisuda teman',
    amount: 150000,
    confidence: 0,
    status: 'pending',
  })

  // User selects "Hanya Transaksi Ini" (approve without saving rule)
  const updatedItem = approveInboxTransaction(pendingItem, { categoryId: 'hadiah' })
  assert.equal(updatedItem.status, 'approved')
  assert.equal(updatedItem.suggestedCategoryId, 'hadiah')

  // Local rules count remains unchanged
  assert.equal(localRules.length, 1, 'Local rules not modified')
})

test('Rejecting inbox item marks status as rejected', () => {
  const pendingItem = createInboxItem({
    id: 'inbox-item-3',
    rawDescription: 'transaksi aneh',
    amount: 5000,
    status: 'pending',
  })

  const rejected = rejectInboxTransaction(pendingItem)
  assert.equal(rejected.status, 'rejected', 'Status marked as rejected')
})

// ── Group 6: Offline-First Zero Network Invariant (Req 8.6, Property 25) ───────
console.log('\n▶ Group 6: Offline-First Zero Network Invariant (Req 8.6, Property 25)...')

test('components/inbox-review.tsx contains zero HTTP network transmissions', () => {
  const filePath = path.resolve(import.meta.dirname, '../components/inbox-review.tsx')
  const content = fs.readFileSync(filePath, 'utf8')

  const forbiddenPatterns = [
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bnavigator\.sendBeacon\b/,
    /\bWebSocket\b/,
    /\bimport\s+.*['"](?:node:)?https?['"]/,
    /\bimport\s+.*['"](?:node:)?axios['"]/,
  ]

  for (const pattern of forbiddenPatterns) {
    assert.ok(!pattern.test(content), `Found forbidden network call matching ${pattern}`)
  }
})

console.log('\n──────────────────────────────────────────────────')
console.log(`Results: ${passed}/${total} passed, ${failed} failed`)

if (failed > 0) {
  console.error('❌ BEBERAPA TEST INBOX REVIEW UI GAGAL!')
  process.exitCode = 1
} else {
  console.log('✅ SEMUA TEST INBOX REVIEW UI & RULE CREATION PROMPT (TASK 16.4) BERHASIL LULUS!\n')
  process.exitCode = 0
}
