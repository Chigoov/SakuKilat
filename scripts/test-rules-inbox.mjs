/**
 * SakuKilat — Local Categorization Rules & Inbox Review Tests (Phase P8, Task 16.1)
 *
 * Verifies:
 * 1. Keyword normalization (Requirement 8.1)
 * 2. Word-boundary pattern matching against transaction descriptions (Requirement 8.1)
 * 3. Substring detection for partial-word matching
 * 4. Duplicate keyword rule prevention and rejection
 * 5. Rule creation and schema compliance (LocalCategoryRule)
 * 6. Transaction evaluation and confidence scoring
 * 7. Longest-keyword specificity priority
 * 8. Routing unmatched or low confidence (< 0.6) to Inbox Review queue (Requirement 8.3, Property 24)
 * 9. Inbox review workflow: approve, reject, prepareRuleFromInbox (Requirement 8.4, 8.5)
 * 10. Offline-first zero network transmission invariant (Requirement 8.6, Property 25)
 * 11. Storage structural validation and state persistence
 *
 * Jalankan: node scripts/test-rules-inbox.mjs
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  normalizeKeyword,
  matchesKeyword,
  matchesSubstring,
  isDuplicateRule,
  createLocalRule,
  createInboxItem,
  evaluateTransactionForRules,
  routeToInboxIfNeeded,
  approveInboxTransaction,
  rejectInboxTransaction,
  prepareRuleFromInboxItem,
  incrementRuleUsage,
  getPendingInboxItems,
  DEFAULT_CONFIDENCE_THRESHOLD,
  RuleInboxManager,
} from '../lib/rules-inbox.ts'

import {
  validatePersistedStateStructure,
  loadPersistedState,
  persistState,
  STORAGE_KEY,
  CURRENT_SCHEMA_VERSION,
} from '../lib/storage.ts'

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

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed')
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

console.log('=== Task 16.1: Local Categorization Rules & Inbox Review Tests ===\n')

// ── Group 1: Keyword Normalization ──
console.log('Group 1: Keyword Normalization (Req 8.1)')

test('Normalizes lowercase, trimming, and collapses spaces', () => {
  assertEqual(normalizeKeyword('  Kopi   Susu  '), 'kopi susu', 'trimmed and collapsed')
  assertEqual(normalizeKeyword('Bensin-Pertamax'), 'bensin-pertamax', 'lowercase with hyphen')
  assertEqual(normalizeKeyword(''), '', 'empty string')
  assertEqual(normalizeKeyword('   '), '', 'whitespace string')
  assertEqual(normalizeKeyword(null), '', 'null input fallback')
  assertEqual(normalizeKeyword(undefined), '', 'undefined input fallback')
})

// ── Group 2: Word-Boundary Pattern Matching ──
console.log('\nGroup 2: Word-Boundary Pattern Matching (Req 8.1, Property 23)')

test('Matches keyword surrounded by whitespace or string boundaries', () => {
  assert(matchesKeyword('kopi', 'kopi'), 'exact single word match')
  assert(matchesKeyword('beli kopi susu', 'kopi'), 'keyword with trailing word')
  assert(matchesKeyword('segelas kopi', 'kopi'), 'keyword with leading word')
  assert(matchesKeyword('minum KOPI panas', 'kopi'), 'case-insensitive match')
  assert(matchesKeyword('kopi, roti, teh', 'kopi'), 'keyword followed by punctuation comma')
  assert(matchesKeyword('sarapan: kopi!', 'kopi'), 'keyword with colon and exclamation')
})

test('Rejects sub-word substrings (word-boundary enforcement)', () => {
  assert(!matchesKeyword('ngopi sore-sore', 'kopi'), 'prefix sub-word "ngopi" rejected')
  assert(!matchesKeyword('mampir ke kopitiam', 'kopi'), 'suffix sub-word "kopitiam" rejected')
  assert(!matchesKeyword('kopi tubruk', 'tub'), 'partial word "tub" rejected')
  assert(!matchesKeyword('eskopidingin', 'kopi'), 'interior substring rejected')
  assert(!matchesKeyword('kopisusu', 'kopi susu'), 'joined words rejected')
})

test('Matches multi-word keywords with accurate word boundaries', () => {
  assert(matchesKeyword('beli kopi susu gula aren', 'kopi susu'), 'multi-word match')
  assert(matchesKeyword('kopi susu, enak', 'kopi susu'), 'multi-word with punctuation')
  assert(!matchesKeyword('kopi susuku', 'kopi susu'), 'multi-word suffix boundary rejected')
  assert(!matchesKeyword('minumkopisusu', 'kopi susu'), 'multi-word joined boundary rejected')
})

test('Handles empty and invalid descriptions safely', () => {
  assert(!matchesKeyword('', 'kopi'), 'empty description')
  assert(!matchesKeyword('   ', 'kopi'), 'whitespace description')
  assert(!matchesKeyword('beli makan', ''), 'empty keyword')
  assert(!matchesKeyword(null, 'kopi'), 'null description')
})

// ── Group 3: Duplicate Rule Prevention ──
console.log('\nGroup 3: Duplicate Rule Prevention')

test('isDuplicateRule identifies existing normalized keywords', () => {
  const existingRules = [
    { id: 'r-1', keyword: 'kopi', categoryId: 'makanan', isActive: true, matchCount: 0, createdAt: '' },
    { id: 'r-2', keyword: 'bensin pertamax', categoryId: 'transportasi', isActive: true, matchCount: 0, createdAt: '' },
  ]

  assert(isDuplicateRule('kopi', existingRules), 'exact match duplicate')
  assert(isDuplicateRule('  KOPI  ', existingRules), 'case & whitespace normalized duplicate')
  assert(isDuplicateRule('Bensin Pertamax', existingRules), 'multi-word normalized duplicate')
  assert(!isDuplicateRule('teh', existingRules), 'new keyword is not duplicate')
  assert(!isDuplicateRule('kopi', existingRules, 'r-1'), 'excludes self when updating')
})

test('createLocalRule validates inputs and throws on duplicate keyword', () => {
  const existingRules = [
    { id: 'r-1', keyword: 'kopi', categoryId: 'makanan', isActive: true, matchCount: 0, createdAt: '' },
  ]

  let threwDuplicate = false
  try {
    createLocalRule({ keyword: 'KOPI', categoryId: 'makanan' }, existingRules)
  } catch (err) {
    threwDuplicate = true
    assert(err.message.includes('sudah memiliki aturan aktif'), 'duplicate error message')
  }
  assert(threwDuplicate, 'threw on duplicate rule')

  let threwEmpty = false
  try {
    createLocalRule({ keyword: '   ', categoryId: 'makanan' })
  } catch (err) {
    threwEmpty = true
  }
  assert(threwEmpty, 'threw on empty keyword')

  let threwEmptyCat = false
  try {
    createLocalRule({ keyword: 'teh', categoryId: '' })
  } catch (err) {
    threwEmptyCat = true
  }
  assert(threwEmptyCat, 'threw on empty category')
})

test('createLocalRule produces complete LocalCategoryRule record', () => {
  const rule = createLocalRule({
    keyword: ' Indomaret ',
    categoryId: 'belanja',
    subcategoryId: 'Minimarket',
    preferredPaymentMethodId: 'gopay',
  })

  assert(rule.id.startsWith('rule-'), 'rule id has prefix')
  assertEqual(rule.keyword, 'indomaret', 'normalized keyword')
  assertEqual(rule.categoryId, 'belanja', 'categoryId')
  assertEqual(rule.subcategoryId, 'Minimarket', 'subcategoryId')
  assertEqual(rule.preferredPaymentMethodId, 'gopay', 'preferredPaymentMethodId')
  assertEqual(rule.isActive, true, 'isActive defaults to true')
  assertEqual(rule.matchCount, 0, 'initial matchCount is 0')
  assert(typeof rule.createdAt === 'string', 'createdAt timestamp')
})

// ── Group 4: Transaction Evaluation & Confidence Scoring ──
console.log('\nGroup 4: Transaction Evaluation & Confidence Scoring (Req 8.1, 8.2, 8.3)')

test('Exact match yields confidence 1.0 and does not require inbox review', () => {
  const rules = [
    createLocalRule({ keyword: 'kopi', categoryId: 'makanan', subcategoryId: 'Minuman' }),
  ]

  const evalResult = evaluateTransactionForRules('kopi', rules)
  assertEqual(evalResult.hasMatch, true, 'hasMatch')
  assertEqual(evalResult.confidence, 1.0, 'confidence is 1.0 for exact match')
  assertEqual(evalResult.suggestedCategoryId, 'makanan', 'suggestedCategoryId')
  assertEqual(evalResult.suggestedSubcategoryId, 'Minuman', 'suggestedSubcategoryId')
  assertEqual(evalResult.requiresInboxReview, false, 'does not require inbox review')
  assertEqual(evalResult.matchType, 'word_boundary', 'matchType')
})

test('Word-boundary match yields confidence >= 0.70 and bypasses inbox review', () => {
  const rules = [
    createLocalRule({ keyword: 'kopi', categoryId: 'makanan' }),
  ]

  const evalResult = evaluateTransactionForRules('beli kopi susu pagi', rules)
  assertEqual(evalResult.hasMatch, true, 'hasMatch')
  assert(evalResult.confidence >= 0.70, `confidence (${evalResult.confidence}) >= 0.70`)
  assertEqual(evalResult.requiresInboxReview, false, 'high confidence bypasses inbox review')
  assertEqual(evalResult.suggestedCategoryId, 'makanan', 'suggestedCategoryId')
})

test('Longest keyword rule takes priority when multiple rules match', () => {
  const rules = [
    createLocalRule({ keyword: 'kopi', categoryId: 'makanan', subcategoryId: 'Umum' }),
    createLocalRule({ keyword: 'kopi kenangan', categoryId: 'makanan', subcategoryId: 'Brand' }),
  ]

  const evalResult = evaluateTransactionForRules('beli kopi kenangan siang ini', rules)
  assertEqual(evalResult.matchedKeyword, 'kopi kenangan', 'more specific rule wins')
  assertEqual(evalResult.suggestedSubcategoryId, 'Brand', 'subcategoryId matches specific rule')
})

test('Substring match without word boundary yields low confidence (< 0.60) and requires inbox review', () => {
  const rules = [
    createLocalRule({ keyword: 'kopi', categoryId: 'makanan' }),
  ]

  const evalResult = evaluateTransactionForRules('kopitiam santai', rules)
  assertEqual(evalResult.hasMatch, true, 'hasMatch (partial)')
  assert(evalResult.confidence < 0.60, `confidence (${evalResult.confidence}) < 0.60`)
  assertEqual(evalResult.requiresInboxReview, true, 'requires inbox review for low confidence')
  assertEqual(evalResult.suggestedCategoryId, 'makanan', 'category suggested for confirmation')
  assertEqual(evalResult.matchType, 'substring', 'matchType is substring')
})

test('Unmatched description yields confidence 0 and requires inbox review', () => {
  const rules = [
    createLocalRule({ keyword: 'kopi', categoryId: 'makanan' }),
  ]

  const evalResult = evaluateTransactionForRules('isi bensin shell', rules)
  assertEqual(evalResult.hasMatch, false, 'no match')
  assertEqual(evalResult.confidence, 0, 'confidence is 0')
  assertEqual(evalResult.requiresInboxReview, true, 'requires inbox review')
  assertEqual(evalResult.suggestedCategoryId, undefined, 'no category suggested')
})

test('Inactive rules are ignored during evaluation', () => {
  const rules = [
    { ...createLocalRule({ keyword: 'kopi', categoryId: 'makanan' }), isActive: false },
  ]

  const evalResult = evaluateTransactionForRules('kopi tubruk', rules)
  assertEqual(evalResult.hasMatch, false, 'inactive rule ignored')
  assertEqual(evalResult.requiresInboxReview, true, 'requires inbox review')
})

// ── Group 5: Inbox Review Queue Routing ──
console.log('\nGroup 5: Inbox Review Queue Routing (Req 8.3, Property 24)')

test('routeToInboxIfNeeded queues unmatched transaction into inbox with pending status', () => {
  const tx = { id: 'tx-101', description: 'nasi padang garuda', amount: 35000 }
  const evaluation = {
    hasMatch: false,
    confidence: 0,
    requiresInboxReview: true,
    matchType: 'none',
  }

  const { routed, inboxItem, updatedInbox } = routeToInboxIfNeeded(tx, evaluation, [])
  assertEqual(routed, true, 'routed to inbox')
  assert(inboxItem !== undefined, 'inbox item created')
  assertEqual(inboxItem.rawDescription, 'nasi padang garuda', 'rawDescription')
  assertEqual(inboxItem.amount, 35000, 'amount')
  assertEqual(inboxItem.confidence, 0, 'confidence 0')
  assertEqual(inboxItem.status, 'pending', 'status pending')
  assertEqual(updatedInbox.length, 1, 'inbox array extended')
})

test('routeToInboxIfNeeded queues low-confidence match (< 0.6) with suggested category', () => {
  const tx = { id: 'tx-102', description: 'ngopi sore', amount: 25000 }
  const evaluation = {
    hasMatch: true,
    confidence: 0.45,
    suggestedCategoryId: 'makanan',
    suggestedSubcategoryId: 'Kopi',
    requiresInboxReview: true,
    matchType: 'substring',
  }

  const { routed, inboxItem, updatedInbox } = routeToInboxIfNeeded(tx, evaluation, [])
  assertEqual(routed, true, 'routed to inbox')
  assertEqual(inboxItem.suggestedCategoryId, 'makanan', 'suggested category preserved')
  assertEqual(inboxItem.confidence, 0.45, 'confidence preserved')
  assertEqual(inboxItem.status, 'pending', 'status pending')
})

test('routeToInboxIfNeeded does NOT queue high-confidence match (>= 0.6)', () => {
  const tx = { id: 'tx-103', description: 'kopi susu', amount: 20000 }
  const evaluation = {
    hasMatch: true,
    confidence: 0.85,
    suggestedCategoryId: 'makanan',
    requiresInboxReview: false,
    matchType: 'word_boundary',
  }

  const { routed, inboxItem, updatedInbox } = routeToInboxIfNeeded(tx, evaluation, [])
  assertEqual(routed, false, 'not routed to inbox')
  assertEqual(inboxItem, undefined, 'no inbox item')
  assertEqual(updatedInbox.length, 0, 'inbox unchanged')
})

test('routeToInboxIfNeeded avoids duplicating pending item for same transaction id', () => {
  const tx = { id: 'tx-dup', description: 'parkir mall', amount: 5000 }
  const evaluation = { hasMatch: false, confidence: 0, requiresInboxReview: true, matchType: 'none' }

  const initial = routeToInboxIfNeeded(tx, evaluation, [])
  assertEqual(initial.routed, true, 'first routing succeeds')

  const second = routeToInboxIfNeeded(tx, evaluation, initial.updatedInbox)
  assertEqual(second.routed, false, 'duplicate routing prevented')
  assertEqual(second.updatedInbox.length, 1, 'inbox count remains 1')
})

// ── Group 6: Inbox Item Approval, Rejection & Rule Generation ──
console.log('\nGroup 6: Inbox Review Actions (Req 8.4, 8.5)')

test('approveInboxTransaction updates status to approved with confirmed category', () => {
  const pendingItem = createInboxItem({
    rawDescription: 'martabak manis',
    amount: 45000,
    suggestedCategoryId: 'lainnya',
  })

  const approved = approveInboxTransaction(pendingItem, {
    categoryId: 'makanan',
    subcategoryId: 'Camilan',
  })

  assertEqual(approved.status, 'approved', 'status approved')
  assertEqual(approved.suggestedCategoryId, 'makanan', 'category updated')
  assertEqual(approved.suggestedSubcategoryId, 'Camilan', 'subcategory updated')
})

test('rejectInboxTransaction updates status to rejected', () => {
  const pendingItem = createInboxItem({ rawDescription: 'uang jajan', amount: 10000 })
  const rejected = rejectInboxTransaction(pendingItem)
  assertEqual(rejected.status, 'rejected', 'status rejected')
})

test('prepareRuleFromInboxItem extracts rule creation payload from confirmed inbox item', () => {
  const inboxItem = createInboxItem({
    rawDescription: 'boba brown sugar',
    amount: 28000,
    suggestedCategoryId: 'makanan',
    suggestedSubcategoryId: 'Minuman',
    status: 'approved',
  })

  const rulePayload = prepareRuleFromInboxItem(inboxItem)
  assertEqual(rulePayload.keyword, 'boba brown sugar', 'normalized keyword from description')
  assertEqual(rulePayload.categoryId, 'makanan', 'categoryId')
  assertEqual(rulePayload.subcategoryId, 'Minuman', 'subcategoryId')
  assertEqual(rulePayload.isActive, true, 'isActive')

  // With custom keyword override
  const customRulePayload = prepareRuleFromInboxItem(inboxItem, 'boba')
  assertEqual(customRulePayload.keyword, 'boba', 'custom keyword')
})

test('incrementRuleUsage increments matchCount for the designated rule', () => {
  const rules = [
    createLocalRule({ id: 'r-1', keyword: 'kopi', categoryId: 'makanan' }),
    createLocalRule({ id: 'r-2', keyword: 'teh', categoryId: 'makanan' }),
  ]
  const updated = incrementRuleUsage('r-1', rules)
  assertEqual(updated[0].matchCount, 1, 'r-1 matchCount incremented')
  assertEqual(updated[1].matchCount, 0, 'r-2 matchCount untouched')
})

test('getPendingInboxItems filters pending review items', () => {
  const inbox = [
    createInboxItem({ rawDescription: 'item 1', amount: 1000, status: 'pending' }),
    createInboxItem({ rawDescription: 'item 2', amount: 2000, status: 'approved' }),
    createInboxItem({ rawDescription: 'item 3', amount: 3000, status: 'rejected' }),
    createInboxItem({ rawDescription: 'item 4', amount: 4000, status: 'pending' }),
  ]
  const pending = getPendingInboxItems(inbox)
  assertEqual(pending.length, 2, '2 pending items')
})

// ── Group 7: Offline-First Zero Network Transmission Invariant ──
console.log('\nGroup 7: Offline-First Zero Network Invariant (Req 8.6, Property 25)')

test('lib/rules-inbox.ts contains zero network calls or HTTP modules', () => {
  const filePath = resolve(import.meta.dirname, '../lib/rules-inbox.ts')
  const content = readFileSync(filePath, 'utf-8')

  const forbiddenPatterns = [
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bnavigator\.sendBeacon\b/,
    /\bWebSocket\b/,
    /\bimport\s+.*['"](?:node:)?https?['"]/,
    /\bimport\s+.*['"](?:node:)?axios['"]/,
  ]

  for (const pattern of forbiddenPatterns) {
    assert(!pattern.test(content), `Found forbidden network call matching ${pattern}`)
  }
})

// ── Group 8: Storage Persistence & Structural Validation ──
console.log('\nGroup 8: Storage Persistence & Structural Validation')

test('validatePersistedStateStructure accepts state with localRules and inbox arrays', () => {
  const validState = {
    transactions: [],
    wallets: [],
    localRules: [
      { id: 'r-1', keyword: 'kopi', categoryId: 'makanan', isActive: true, matchCount: 0, createdAt: '' },
    ],
    inbox: [
      { id: 'inbox-1', rawDescription: 'snack', amount: 5000, date: '', confidence: 0, status: 'pending' },
    ],
  }
  const result = validatePersistedStateStructure(validState)
  assertEqual(result.valid, true, 'valid structure with localRules and inbox')
})

test('validatePersistedStateStructure rejects non-array localRules or inbox', () => {
  const invalidRules = { transactions: [], localRules: 'not-an-array' }
  assertEqual(validatePersistedStateStructure(invalidRules).valid, false, 'rejected non-array localRules')

  const invalidInbox = { transactions: [], inbox: { id: 1 } }
  assertEqual(validatePersistedStateStructure(invalidInbox).valid, false, 'rejected non-array inbox')
})

test('Storage persist and load preserves localRules and inbox state', () => {
  const store = new Map()
  const storage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
  }

  const rule = createLocalRule({
    keyword: 'pertalite',
    categoryId: 'transportasi',
    subcategoryId: 'BBM',
    preferredPaymentMethodId: 'tunai',
  })
  const inboxItem = createInboxItem({
    rawDescription: 'cuci steam motor',
    amount: 15000,
    confidence: 0,
    status: 'pending',
  })

  const stateToPersist = {
    transactions: [],
    wallets: [],
    localRules: [rule],
    inbox: [inboxItem],
  }

  const persisted = persistState(storage, stateToPersist, 'valid')
  assertEqual(persisted, true, 'persistState succeeded')

  const loadResult = loadPersistedState(storage)
  assertEqual(loadResult.status, 'valid', 'load status is valid')
  assertEqual(loadResult.state.localRules.length, 1, '1 local rule restored')
  assertEqual(loadResult.state.localRules[0].keyword, 'pertalite', 'rule keyword matches')
  assertEqual(loadResult.state.inbox.length, 1, '1 inbox item restored')
  assertEqual(loadResult.state.inbox[0].rawDescription, 'cuci steam motor', 'inbox item description matches')
})

console.log('\n──────────────────────────────────────────────────')
console.log(`Results: ${passed}/${total} passed, ${failed} failed`)

if (failed > 0) {
  console.error('❌ BEBERAPA TEST RULES & INBOX GAGAL!')
  process.exitCode = 1
} else {
  console.log('✅ SEMUA TEST LOCAL RULES & INBOX (TASK 16.1) BERHASIL LULUS!\n')
  process.exitCode = 0
}
