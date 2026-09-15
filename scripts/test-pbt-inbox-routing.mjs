/**
 * SakuKilat — Property-Based Test Suite for Low Confidence and Unmatched Inbox Routing
 *
 * Feature: sakukilat-core-roadmap, Property 24: Low Confidence and Unmatched Inbox Routing
 * Validates: Requirements 8.3
 *
 * Property 24 Specification:
 * For any transaction whose description matches no local rules or yields classification
 * confidence below 0.6, the transaction SHALL be added to the pending Inbox Review queue.
 */

import assert from 'node:assert/strict'
import {
  fc,
  testProperty,
  MIN_PBT_RUNS,
  arbRupiahAmount,
} from './pbt-harness.mjs'
import {
  evaluateTransactionForRules,
  routeToInboxIfNeeded,
  createLocalRule,
  createInboxItem,
  getPendingInboxItems,
  normalizeKeyword,
  matchesKeyword,
  matchesSubstring,
  DEFAULT_CONFIDENCE_THRESHOLD,
  RuleInboxManager,
} from '../lib/rules-inbox.ts'

console.log('====================================================')
console.log('  SAKUKILAT — PBT: INBOX ROUTING (PROPERTY 24)      ')
console.log('====================================================\n')

// ── Smart Arbitraries ─────────────────────────────────────────────────────────

// Arbitrary realistic categories and subcategories
const arbCategory = fc.constantFrom(
  'makanan',
  'transportasi',
  'belanja',
  'tagihan',
  'hiburan',
  'kesehatan',
  'pendidikan',
  'lainnya'
)

const arbSubcategory = fc.constantFrom(
  'Restoran',
  'Minimarket',
  'BBM',
  'Kopi',
  'Streaming',
  'Parkir',
  'Apotek'
)

// Known keywords pool for realistic matching scenarios
const KEYWORDS_POOL = [
  'kopi',
  'bensin',
  'pertamax',
  'indomaret',
  'alfamart',
  'gopay',
  'grab',
  'gojek',
  'token listrik',
  'pulsa',
  'makan siang',
  'sate ayam',
  'martabak',
]

const arbPoolKeyword = fc.constantFrom(...KEYWORDS_POOL)

// Arbitrary custom keywords (clean alphanumeric strings)
const arbAlphanumericWord = fc
  .stringMatching(/^[a-z]{3,10}$/)
  .map(w => w.toLowerCase())

// Arbitrary LocalCategoryRule generator
const arbRule = fc.record({
  keyword: fc.oneof(arbPoolKeyword, arbAlphanumericWord),
  categoryId: arbCategory,
  subcategoryId: fc.option(arbSubcategory, { nil: undefined }),
  preferredPaymentMethodId: fc.constantFrom('tunai', 'bca', 'mandiri', 'gopay', 'ovo'),
  isActive: fc.boolean(),
  matchCount: fc.integer({ min: 0, max: 100 }),
}).map((params, idx) => {
  return {
    id: `rule-${idx + 1}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    keyword: normalizeKeyword(params.keyword),
    categoryId: params.categoryId,
    subcategoryId: params.subcategoryId,
    preferredPaymentMethodId: params.preferredPaymentMethodId,
    isActive: params.isActive,
    matchCount: params.matchCount,
    createdAt: new Date().toISOString(),
  }
})

// Collection of 0 to 10 rules with deduplicated keywords
const arbRulesList = fc.array(arbRule, { minLength: 0, maxLength: 10 }).map(rules => {
  const seen = new Set()
  const deduplicated = []
  for (const r of rules) {
    if (!seen.has(r.keyword) && r.keyword.length > 0) {
      seen.add(r.keyword)
      deduplicated.push(r)
    }
  }
  return deduplicated
})

// Arbitrary existing Inbox queue (0 to 8 items)
const arbExistingInbox = fc.array(
  fc.record({
    rawDescription: fc.string({ minLength: 1, maxLength: 40 }),
    amount: fc.integer({ min: 0, max: 10_000_000 }),
    confidence: fc.integer({ min: 0, max: 100 }).map(n => n / 100),
    status: fc.constantFrom('pending', 'approved', 'rejected'),
  }),
  { minLength: 0, maxLength: 8 }
).map(items => items.map(it => createInboxItem(it)))

// Arbitrary realistic scenario pairing rules with targeted descriptions
const arbInboxScenario = arbRulesList.chain(rules => {
  const activeRules = rules.filter(r => r.isActive && r.keyword.length > 0)

  let descGen
  if (activeRules.length > 0) {
    const pickActiveRule = fc.constantFrom(...activeRules)
    descGen = fc.oneof(
      // 1. Exact match (High confidence 1.0 -> bypass)
      pickActiveRule.map(r => r.keyword),
      // 2. Word boundary match (High confidence >= 0.70 -> bypass)
      fc.tuple(pickActiveRule, arbAlphanumericWord).map(([r, w]) => `beli ${r.keyword} di ${w}`),
      // 3. Substring match (Low confidence < 0.60 -> route)
      pickActiveRule.map(r => `ng${r.keyword}santai`),
      // 4. Unmatched words (Confidence 0 -> route)
      fc.tuple(arbAlphanumericWord, arbAlphanumericWord).map(([w1, w2]) => `random_${w1}_${w2}_unmatched`),
      // 5. Empty or whitespace (Confidence 0 -> route)
      fc.constantFrom('', '   ', '\t\n')
    )
  } else {
    descGen = fc.oneof(
      fc.tuple(arbAlphanumericWord, arbAlphanumericWord).map(([w1, w2]) => `unmatched_${w1}_${w2}`),
      fc.constantFrom('', '   ')
    )
  }

  return fc.record({
    rules: fc.constant(rules),
    transaction: fc.record({
      id: fc.option(fc.stringMatching(/^[a-z0-9_-]{4,16}$/), { nil: undefined }),
      description: descGen,
      amount: arbRupiahAmount,
      date: fc.constantFrom(new Date().toISOString(), '2026-03-31', new Date()),
    }),
    initialInbox: arbExistingInbox,
  })
})

// ── Feature: sakukilat-core-roadmap, Property 24: Low Confidence and Unmatched Inbox Routing ──
// Validates: Requirements 8.3
// For any transaction whose description matches no local rules or yields classification
// confidence below 0.6, the transaction SHALL be added to the pending Inbox Review queue.
{
  let totalEvaluated = 0
  let routedCount = 0
  let bypassedCount = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 24: Low Confidence and Unmatched Inbox Routing',
    fc.property(
      arbInboxScenario,
      ({ transaction, rules, initialInbox }) => {
        totalEvaluated++

        // Filter out initialInbox items that might conflict with transaction.id
        const cleanInitialInbox = transaction.id
          ? initialInbox.filter(item => item.id !== `inbox-${transaction.id}`)
          : initialInbox

        // Step 1: Evaluate transaction against rules
        const evaluation = evaluateTransactionForRules(transaction.description, rules)

        // Mathematical condition for routing:
        // matches no rules (!hasMatch) OR confidence < 0.6
        const shouldRoute = !evaluation.hasMatch || evaluation.confidence < DEFAULT_CONFIDENCE_THRESHOLD

        // Invariant 1: requiresInboxReview flag strictly tracks the property definition
        assert.equal(
          evaluation.requiresInboxReview,
          shouldRoute,
          `evaluation.requiresInboxReview (${evaluation.requiresInboxReview}) must strictly match (!hasMatch || confidence < 0.6) [${shouldRoute}]. eval: ${JSON.stringify(evaluation)}`
        )

        // Step 2: Route transaction to Inbox if needed
        const result = routeToInboxIfNeeded(transaction, evaluation, cleanInitialInbox)

        // Invariant 2: Routing decision matches condition
        assert.equal(
          result.routed,
          shouldRoute,
          `routeToInboxIfNeeded.routed (${result.routed}) must equal shouldRoute (${shouldRoute})`
        )

        if (shouldRoute) {
          routedCount++

          // Invariant 3: inboxItem must be defined and have status === 'pending'
          assert.ok(result.inboxItem !== undefined, 'inboxItem must be created when routed')
          assert.equal(
            result.inboxItem.status,
            'pending',
            `inboxItem status must be 'pending', got '${result.inboxItem.status}'`
          )

          // Invariant 4: inboxItem attributes must reflect transaction and evaluation
          const expectedDesc = (transaction.description || '').trim()
          assert.equal(
            result.inboxItem.rawDescription,
            expectedDesc,
            `inboxItem rawDescription must match trimmed description`
          )
          assert.equal(
            result.inboxItem.amount,
            Math.max(0, Math.round(Number(transaction.amount) || 0)),
            `inboxItem amount must be non-negative integer`
          )
          assert.equal(
            result.inboxItem.confidence,
            evaluation.confidence,
            `inboxItem confidence must preserve evaluation confidence`
          )
          assert.equal(
            result.inboxItem.suggestedCategoryId,
            evaluation.suggestedCategoryId,
            `inboxItem suggestedCategoryId must match evaluation suggestion`
          )
          assert.equal(
            result.inboxItem.suggestedSubcategoryId,
            evaluation.suggestedSubcategoryId,
            `inboxItem suggestedSubcategoryId must match evaluation suggestion`
          )

          // Invariant 5: updatedInbox length must increase by exactly 1
          assert.equal(
            result.updatedInbox.length,
            cleanInitialInbox.length + 1,
            `updatedInbox length must increase by 1 (expected ${cleanInitialInbox.length + 1}, got ${result.updatedInbox.length})`
          )

          // Invariant 6: Newly routed item must be at the head of updatedInbox
          assert.equal(
            result.updatedInbox[0].id,
            result.inboxItem.id,
            `Newly created inboxItem must be prepended to the queue`
          )

          // Invariant 7: Pending filter must include the new item
          const pendingItems = getPendingInboxItems(result.updatedInbox)
          assert.ok(
            pendingItems.some(item => item.id === result.inboxItem.id),
            `getPendingInboxItems must include the newly added pending inboxItem`
          )
        } else {
          bypassedCount++

          // Invariant 8: High confidence match (>= 0.6) must NOT route to inbox
          assert.equal(
            result.inboxItem,
            undefined,
            'inboxItem must be undefined when routing is bypassed'
          )
          assert.equal(
            result.updatedInbox.length,
            cleanInitialInbox.length,
            'updatedInbox length must remain unchanged when bypassed'
          )
          assert.deepEqual(
            result.updatedInbox,
            cleanInitialInbox,
            'updatedInbox must be identical to cleanInitialInbox when bypassed'
          )

          // High confidence guarantees
          assert.equal(evaluation.hasMatch, true, 'Bypassed transaction must have match')
          assert.ok(
            evaluation.confidence >= DEFAULT_CONFIDENCE_THRESHOLD,
            `Bypassed transaction confidence (${evaluation.confidence}) must be >= ${DEFAULT_CONFIDENCE_THRESHOLD}`
          )
        }

        // Invariant 9: RuleInboxManager namespace behavior must be 100% identical
        const mgrEval = RuleInboxManager.evaluate(transaction.description, rules)
        assert.equal(mgrEval.hasMatch, evaluation.hasMatch)
        assert.equal(mgrEval.confidence, evaluation.confidence)
        assert.equal(mgrEval.requiresInboxReview, evaluation.requiresInboxReview)

        return true
      }
    ),
    { numRuns: 150 }
  )

  assert.ok(
    totalEvaluated >= MIN_PBT_RUNS,
    `Expected at least ${MIN_PBT_RUNS} iterations, evaluated ${totalEvaluated}`
  )
  console.log(`    Coverage: ${routedCount} routed to inbox, ${bypassedCount} high-confidence bypassed.\n`)
}

// ── Property 24 (Sub-check A): Guaranteed Unmatched Transaction Routing ───────
// Validates: Requirements 8.3
// For any transaction where no rule keywords appear anywhere in the description
// (or rules list is empty), the transaction SHALL be routed to Inbox Review with
// confidence === 0, suggestedCategoryId === undefined, and status === 'pending'.
{
  let subCheckACount = 0

  const arbUnmatchedScenario = fc.record({
    description: fc.stringMatching(/^[a-z]{5,15}$/).map(w => `unmatched_trx_${w}`),
    amount: arbRupiahAmount,
    rules: fc.array(
      fc.record({
        keyword: fc.constantFrom('kopi', 'bensin', 'listrik', 'makan', 'pulsa'),
        categoryId: arbCategory,
      }).map(p => createLocalRule({ keyword: p.keyword, categoryId: p.categoryId })),
      { minLength: 0, maxLength: 5 }
    ),
  })

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 24 (Sub-check A): Guaranteed Unmatched Transaction Routing',
    fc.property(arbUnmatchedScenario, ({ description, amount, rules }) => {
      subCheckACount++

      const tx = { description, amount }
      const evaluation = evaluateTransactionForRules(description, rules)

      // Unmatched invariant
      assert.equal(evaluation.hasMatch, false, 'hasMatch must be false for unmatched description')
      assert.equal(evaluation.confidence, 0, 'confidence must be 0 for unmatched description')
      assert.equal(evaluation.requiresInboxReview, true, 'requiresInboxReview must be true')
      assert.equal(evaluation.suggestedCategoryId, undefined, 'no category suggested')

      const { routed, inboxItem, updatedInbox } = routeToInboxIfNeeded(tx, evaluation, [])

      assert.equal(routed, true, 'Must route to inbox')
      assert.ok(inboxItem !== undefined, 'inboxItem must be created')
      assert.equal(inboxItem.status, 'pending', 'Status must be pending')
      assert.equal(inboxItem.confidence, 0, 'Confidence must be 0')
      assert.equal(inboxItem.suggestedCategoryId, undefined, 'No suggested category')
      assert.equal(updatedInbox.length, 1, 'Inbox queue length must be 1')

      return true
    }),
    { numRuns: 100 }
  )

  assert.ok(subCheckACount >= MIN_PBT_RUNS)
  console.log(`    Sub-check A verified with ${subCheckACount} unmatched runs.`)
}

// ── Property 24 (Sub-check B): Substring / Low-Confidence Routing (< 0.6) ─────
// Validates: Requirements 8.3
// For any transaction where a rule keyword appears only as a partial substring
// (e.g. "ngopi" or "eskopidingin" for keyword "kopi"), the evaluation MUST yield
// confidence < 0.60, matchType === 'substring', and routeToInboxIfNeeded MUST
// route to Inbox Review with the rule's category preserved as a suggested category.
{
  let subCheckBCount = 0

  const arbSubstringScenario = fc.record({
    keyword: arbPoolKeyword,
    affixType: fc.constantFrom('prefix', 'suffix', 'both', 'joined'),
    categoryId: arbCategory,
    subcategoryId: arbSubcategory,
    amount: arbRupiahAmount,
  }).map(({ keyword, affixType, categoryId, subcategoryId, amount }) => {
    let description = ''
    if (affixType === 'prefix') {
      description = `ng${keyword} sore` // e.g. "ngkopi sore"
    } else if (affixType === 'suffix') {
      description = `${keyword}tiam santai` // e.g. "kopitiam santai"
    } else if (affixType === 'both') {
      description = `es${keyword}dingin` // e.g. "eskopidingin"
    } else {
      description = `super${keyword}express` // e.g. "superkopiexpress"
    }

    const rule = createLocalRule({ keyword, categoryId, subcategoryId })
    return { description, keyword, rule, amount }
  })

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 24 (Sub-check B): Substring / Low-Confidence Routing (< 0.6)',
    fc.property(arbSubstringScenario, ({ description, keyword, rule, amount }) => {
      subCheckBCount++

      // Ensure that description contains keyword as substring, but NOT as word boundary
      assert.ok(
        matchesSubstring(description, keyword),
        `Description "${description}" must contain keyword "${keyword}" as substring`
      )
      assert.ok(
        !matchesKeyword(description, keyword),
        `Description "${description}" must NOT match keyword "${keyword}" with word boundaries`
      )

      const evaluation = evaluateTransactionForRules(description, [rule])

      // Low confidence invariants
      assert.equal(evaluation.hasMatch, true, 'hasMatch must be true for substring match')
      assert.equal(evaluation.matchType, 'substring', 'matchType must be substring')
      assert.ok(
        evaluation.confidence < DEFAULT_CONFIDENCE_THRESHOLD,
        `Confidence (${evaluation.confidence}) must be strictly less than threshold (${DEFAULT_CONFIDENCE_THRESHOLD})`
      )
      assert.ok(
        evaluation.confidence >= 0.35,
        `Substring confidence (${evaluation.confidence}) must be >= 0.35`
      )
      assert.equal(evaluation.requiresInboxReview, true, 'requiresInboxReview must be true for low confidence')
      assert.equal(
        evaluation.suggestedCategoryId,
        rule.categoryId,
        'Suggested category must match the partial-matched rule category'
      )

      // Routing verification
      const { routed, inboxItem } = routeToInboxIfNeeded({ description, amount }, evaluation, [])

      assert.equal(routed, true, 'Low confidence substring match MUST route to inbox')
      assert.ok(inboxItem !== undefined)
      assert.equal(inboxItem.status, 'pending')
      assert.equal(inboxItem.suggestedCategoryId, rule.categoryId)
      assert.equal(inboxItem.confidence, evaluation.confidence)

      return true
    }),
    { numRuns: 100 }
  )

  assert.ok(subCheckBCount >= MIN_PBT_RUNS)
  console.log(`    Sub-check B verified with ${subCheckBCount} low-confidence substring runs.`)
}

// ── Property 24 (Sub-check C): High Confidence (>= 0.6) Word-Boundary Bypassing ─
// Validates: Requirements 8.3
// For any transaction with an exact match or word-boundary match against an active rule,
// the evaluation SHALL produce confidence >= 0.70 (which exceeds 0.60), and
// routeToInboxIfNeeded SHALL NOT route to the Inbox Review queue.
{
  let subCheckCCount = 0

  const arbHighConfidenceScenario = fc.record({
    keyword: arbPoolKeyword,
    matchKind: fc.constantFrom('exact', 'leading', 'trailing', 'surrounded', 'punctuation'),
    categoryId: arbCategory,
    amount: arbRupiahAmount,
  }).map(({ keyword, matchKind, categoryId, amount }) => {
    let description = ''
    if (matchKind === 'exact') {
      description = keyword
    } else if (matchKind === 'leading') {
      description = `${keyword} mantap`
    } else if (matchKind === 'trailing') {
      description = `beli ${keyword}`
    } else if (matchKind === 'surrounded') {
      description = `pesan ${keyword} sekarang`
    } else {
      description = `makan: ${keyword}!`
    }

    const rule = createLocalRule({ keyword, categoryId })
    return { description, keyword, rule, amount }
  })

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 24 (Sub-check C): High Confidence (>= 0.6) Word-Boundary Bypassing',
    fc.property(arbHighConfidenceScenario, ({ description, keyword, rule, amount }) => {
      subCheckCCount++

      assert.ok(
        matchesKeyword(description, keyword),
        `Description "${description}" must match keyword "${keyword}" with word boundaries`
      )

      const evaluation = evaluateTransactionForRules(description, [rule])

      assert.equal(evaluation.hasMatch, true, 'hasMatch must be true for word-boundary match')
      assert.equal(evaluation.matchType, 'word_boundary', 'matchType must be word_boundary')
      assert.ok(
        evaluation.confidence >= 0.70,
        `Word boundary confidence (${evaluation.confidence}) must be >= 0.70`
      )
      assert.ok(
        evaluation.confidence >= DEFAULT_CONFIDENCE_THRESHOLD,
        `Confidence (${evaluation.confidence}) must be >= ${DEFAULT_CONFIDENCE_THRESHOLD}`
      )
      assert.equal(
        evaluation.requiresInboxReview,
        false,
        'requiresInboxReview must be false for high confidence match'
      )

      const { routed, inboxItem, updatedInbox } = routeToInboxIfNeeded(
        { description, amount },
        evaluation,
        []
      )

      assert.equal(routed, false, 'High confidence match must NOT route to inbox')
      assert.equal(inboxItem, undefined, 'No inbox item should be created')
      assert.equal(updatedInbox.length, 0, 'Inbox queue must remain empty')

      return true
    }),
    { numRuns: 100 }
  )

  assert.ok(subCheckCCount >= MIN_PBT_RUNS)
  console.log(`    Sub-check C verified with ${subCheckCCount} high-confidence bypassing runs.`)
}

// ── Property 24 (Sub-check D): Idempotence & Duplicate Transaction ID Protection ─
// Validates: Requirements 8.3
// If a transaction with a designated ID has already been routed into the Inbox queue,
// subsequent routing invocations with the same transaction ID SHALL NOT create
// duplicate inbox entries.
{
  let subCheckDCount = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 24 (Sub-check D): Duplicate Transaction ID Protection',
    fc.property(
      fc.stringMatching(/^[a-z0-9_-]{6,16}$/),
      fc.stringMatching(/^[a-z0-9 ]{5,20}$/),
      arbRupiahAmount,
      (txId, description, amount) => {
        subCheckDCount++

        const tx = { id: txId, description, amount }
        const evaluation = {
          hasMatch: false,
          confidence: 0,
          requiresInboxReview: true,
          matchType: 'none',
        }

        // First routing: must add item
        const first = routeToInboxIfNeeded(tx, evaluation, [])
        assert.equal(first.routed, true, 'First routing must succeed')
        assert.equal(first.updatedInbox.length, 1, 'Inbox length must be 1')
        assert.equal(first.inboxItem?.id, `inbox-${txId}`)

        // Second routing with same ID: must prevent duplicate
        const second = routeToInboxIfNeeded(tx, evaluation, first.updatedInbox)
        assert.equal(second.routed, false, 'Duplicate routing must return routed=false')
        assert.equal(second.updatedInbox.length, 1, 'Inbox length must not increase')
        assert.equal(second.inboxItem?.id, `inbox-${txId}`, 'Must return existing item')

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(subCheckDCount >= MIN_PBT_RUNS)
  console.log(`    Sub-check D verified with ${subCheckDCount} duplicate prevention runs.`)
}

// ── Property 24 (Sub-check E): Threshold Sensitivity ──────────────────────────
// Validates: Requirements 8.3
// For any configurable threshold T in (0.0, 1.0], routeToInboxIfNeeded routes if and
// only if !evaluation.hasMatch || evaluation.confidence < T.
{
  let subCheckECount = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 24 (Sub-check E): Threshold Sensitivity',
    fc.property(
      fc.integer({ min: 10, max: 99 }).map(n => n / 100),
      fc.integer({ min: 0, max: 100 }).map(n => n / 100),
      fc.boolean(),
      (threshold, confidence, hasMatch) => {
        subCheckECount++

        const tx = { description: 'test sensitivity', amount: 10000 }
        const evaluation = {
          hasMatch,
          confidence,
          requiresInboxReview: !hasMatch || confidence < threshold,
          matchType: hasMatch ? (confidence >= 0.7 ? 'word_boundary' : 'substring') : 'none',
        }

        const expectedRoute = !hasMatch || confidence < threshold
        const result = routeToInboxIfNeeded(tx, evaluation, [], threshold)

        assert.equal(
          result.routed,
          expectedRoute,
          `Routing decision with threshold ${threshold} and confidence ${confidence} must be ${expectedRoute}`
        )

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(subCheckECount >= MIN_PBT_RUNS)
  console.log(`    Sub-check E verified with ${subCheckECount} threshold sensitivity runs.`)
}

// ── Concrete Edge Cases ───────────────────────────────────────────────────────
{
  console.log('Validating concrete edge cases...')

  // 1. Empty description
  const evalEmpty = evaluateTransactionForRules('', [])
  assert.equal(evalEmpty.hasMatch, false)
  assert.equal(evalEmpty.confidence, 0)
  assert.equal(evalEmpty.requiresInboxReview, true)
  const routeEmpty = routeToInboxIfNeeded({ description: '', amount: 0 }, evalEmpty, [])
  assert.equal(routeEmpty.routed, true)
  assert.equal(routeEmpty.inboxItem.rawDescription, '')
  assert.equal(routeEmpty.inboxItem.status, 'pending')

  // 2. Whitespace description
  const evalWhitespace = evaluateTransactionForRules('   \t\n  ', [])
  assert.equal(evalWhitespace.hasMatch, false)
  assert.equal(evalWhitespace.requiresInboxReview, true)

  // 3. Negative amount sanitized to 0
  const evalNeg = { hasMatch: false, confidence: 0, requiresInboxReview: true, matchType: 'none' }
  const routeNeg = routeToInboxIfNeeded({ description: 'parkir liar', amount: -50000 }, evalNeg, [])
  assert.equal(routeNeg.inboxItem.amount, 0, 'Negative amounts must be sanitized to 0')

  // 4. Float amount rounded cleanly
  const routeFloat = routeToInboxIfNeeded({ description: 'pecel lele', amount: 25499.8 }, evalNeg, [])
  assert.equal(routeFloat.inboxItem.amount, 25500, 'Float amounts must be rounded to integer')

  console.log('✓ Concrete edge case validations passed.\n')
}

console.log('✅ Property 24 (Low Confidence and Unmatched Inbox Routing) PASSED all invariants with >= 100 iterations each!\n')
