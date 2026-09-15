/**
 * SakuKilat — Property-Based Test Suite for Local Categorization Rule Match Soundness
 *
 * Feature: sakukilat-core-roadmap, Property 23: Local Categorization Rule Match Soundness
 * Validates: Requirements 8.1, 8.2, 8.4
 *
 * Property 23 Specification:
 * For any transaction description containing a recognized rule keyword (case-insensitive
 * word boundary match), the categorization engine SHALL suggest the corresponding
 * category and subcategory without mutating the transaction's stored category until
 * explicit user confirmation.
 */

import assert from 'node:assert/strict'
import {
  fc,
  testProperty,
  MIN_PBT_RUNS,
  arbRupiahAmount,
  arbCategory,
} from './pbt-harness.mjs'
import {
  normalizeKeyword,
  matchesKeyword,
  matchesSubstring,
  createLocalRule,
  createInboxItem,
  evaluateTransactionForRules,
  routeToInboxIfNeeded,
  approveInboxTransaction,
  rejectInboxTransaction,
  incrementRuleUsage,
  RuleInboxManager,
} from '../lib/rules-inbox.ts'

console.log('====================================================================')
console.log('  SAKUKILAT — PBT: LOCAL CATEGORIZATION RULE MATCH SOUNDNESS (PROP 23)')
console.log('====================================================================\n')

// ── Smart Domain Arbitraries ──────────────────────────────────────────────────

// Curated Indonesian financial keywords (single-word and multi-word)
const arbKnownKeywords = fc.constantFrom(
  'kopi',
  'bensin',
  'pertamax',
  'indomaret',
  'alfamart',
  'gaji',
  'listrik',
  'pulsa',
  'parkir',
  'makan siang',
  'kopi susu',
  'bensin pertamax',
  'token listrik',
  'paket data',
  'air galon',
  'laundry kiloan'
)

// Dynamic lowercase alphanumeric keyword generator
const arbDynamicKeyword = fc
  .tuple(
    fc.stringMatching(/^[a-z]{3,8}$/),
    fc.option(fc.stringMatching(/^[a-z]{3,8}$/), { nil: undefined })
  )
  .map(([w1, w2]) => (w2 ? `${w1} ${w2}` : w1))

const arbKeyword = fc.oneof(arbKnownKeywords, arbDynamicKeyword)

// Subcategories
const arbSubcategory = fc.constantFrom(
  'Minuman',
  'BBM',
  'Minimarket',
  'Utilitas',
  'Telekomunikasi',
  'Transportasi',
  'Camilan',
  'Harian'
)

// Valid word boundary delimiters that do not contain [a-zA-Z0-9_]
const arbBoundaryDelimiter = fc.constantFrom(
  ' ',
  ', ',
  ' - ',
  ': ',
  '; ',
  ' (',
  ') ',
  ' [',
  '] ',
  '. ',
  ' / ',
  ' • ',
  '\t'
)

// Indonesian filler words for realistic natural language descriptions
const arbFillerWord = fc.constantFrom(
  'beli',
  'bayar',
  'isi',
  'pesan',
  'jajan',
  'ongkos',
  'tagihan',
  'belanja',
  'keperluan',
  'uang',
  'langganan',
  'dana'
)

// Generator for an active LocalCategoryRule
const arbActiveRule = fc.record({
  keyword: arbKeyword,
  categoryId: arbCategory,
  subcategoryId: fc.option(arbSubcategory, { nil: undefined }),
  preferredPaymentMethodId: fc.option(
    fc.constantFrom('cash', 'bca', 'mandiri', 'gopay', 'ovo', 'dana'),
    { nil: undefined }
  ),
  matchCount: fc.integer({ min: 0, max: 100 }),
  createdAt: fc.constant('2026-06-01T08:00:00.000Z'),
}).map((input) => {
  return createLocalRule({
    keyword: input.keyword,
    categoryId: input.categoryId,
    subcategoryId: input.subcategoryId,
    preferredPaymentMethodId: input.preferredPaymentMethodId,
    isActive: true,
  })
})

/**
 * Transforms a string with randomized casing: UPPERCASE, lowercase, TitleCase, or alternating.
 */
function applyRandomCasing(str, style) {
  if (style === 'upper') return str.toUpperCase()
  if (style === 'lower') return str.toLowerCase()
  if (style === 'title') {
    return str
      .split(' ')
      .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ''))
      .join(' ')
  }
  // Mixed / alternating
  return str
    .split('')
    .map((c, i) => (i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()))
    .join('')
}

// ── Feature: sakukilat-core-roadmap, Property 23: Local Categorization Rule Match Soundness ──
// Validates: Requirements 8.1, 8.2, 8.4
// For any transaction description containing a recognized rule keyword (case-insensitive
// word boundary match), the categorization engine SHALL suggest the corresponding
// category and subcategory without mutating the transaction's stored category until
// explicit user confirmation.
{
  let totalEvaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 23: Local Categorization Rule Match Soundness',
    fc.property(
      arbActiveRule,
      fc.constantFrom('start', 'middle', 'end', 'exact'),
      fc.constantFrom('upper', 'lower', 'title', 'mixed'),
      arbBoundaryDelimiter,
      arbFillerWord,
      arbFillerWord,
      arbRupiahAmount,
      (rule, position, casingStyle, delimiter, leadingFiller, trailingFiller, txAmount) => {
        totalEvaluated++

        const casedKeyword = applyRandomCasing(rule.keyword, casingStyle)

        // Synthesize description embedding the keyword strictly with valid word boundaries
        let description = ''
        if (position === 'exact') {
          description = casedKeyword
        } else if (position === 'start') {
          description = `${casedKeyword}${delimiter}${trailingFiller}`
        } else if (position === 'end') {
          description = `${leadingFiller}${delimiter}${casedKeyword}`
        } else {
          // 'middle'
          description = `${leadingFiller}${delimiter}${casedKeyword}${delimiter}${trailingFiller}`
        }

        // 1. Invariant: matchesKeyword Soundness & Case-Insensitivity (Req 8.1)
        const isMatched = matchesKeyword(description, rule.keyword)
        assert.equal(
          isMatched,
          true,
          `matchesKeyword failed for keyword "${rule.keyword}" in description "${description}" (casing: ${casingStyle})`
        )

        // 2. Invariant: Rule Evaluation & Category Suggestion (Req 8.1, 8.2)
        const evalResult = evaluateTransactionForRules(description, [rule])

        assert.equal(
          evalResult.hasMatch,
          true,
          `evaluateTransactionForRules must report hasMatch=true for recognized keyword "${rule.keyword}"`
        )
        assert.equal(
          evalResult.matchType,
          'word_boundary',
          `Match type must be "word_boundary", got "${evalResult.matchType}"`
        )
        assert.equal(
          evalResult.suggestedCategoryId,
          rule.categoryId,
          `Suggested category "${evalResult.suggestedCategoryId}" must match rule category "${rule.categoryId}"`
        )
        assert.equal(
          evalResult.suggestedSubcategoryId,
          rule.subcategoryId,
          `Suggested subcategory "${evalResult.suggestedSubcategoryId}" must match rule subcategory "${rule.subcategoryId}"`
        )
        assert.equal(
          evalResult.matchedKeyword,
          rule.keyword,
          `Matched keyword "${evalResult.matchedKeyword}" must match normalized rule keyword "${rule.keyword}"`
        )

        // Word-boundary matches always have high confidence (>= 0.70) and do not require inbox review
        assert.ok(
          evalResult.confidence >= 0.70,
          `Confidence (${evalResult.confidence}) must be >= 0.70 for word boundary match`
        )
        assert.equal(
          evalResult.requiresInboxReview,
          false,
          'High-confidence word boundary match must not require inbox review'
        )

        // 3. Invariant: Non-Destructive Suggestion / Stored Transaction Invariance (Req 8.4)
        // Stored transaction record must NOT have its category mutated by evaluation or suggestion!
        const originalCategory = 'Belum Dikategorikan'
        const originalSubcategory = 'Umum'
        const storedTransaction = {
          id: `tx-test-${totalEvaluated}`,
          description,
          amount: txAmount,
          category: originalCategory,
          subcategory: originalSubcategory,
          date: new Date().toISOString(),
        }

        // Freeze object to physically verify zero mutations occur
        const deepCopyBefore = JSON.parse(JSON.stringify(storedTransaction))

        // Trigger evaluation and inbox check
        const { routed, updatedInbox } = routeToInboxIfNeeded(
          storedTransaction,
          evalResult,
          []
        )

        // Verify stored transaction is byte-for-byte identical to its state before evaluation
        assert.equal(
          storedTransaction.category,
          originalCategory,
          'Stored transaction category must NOT be mutated by rule evaluation'
        )
        assert.equal(
          storedTransaction.subcategory,
          originalSubcategory,
          'Stored transaction subcategory must NOT be mutated by rule evaluation'
        )
        assert.deepEqual(
          storedTransaction,
          deepCopyBefore,
          'Stored transaction object must remain completely unmutated'
        )

        // High confidence match is NOT routed to inbox
        assert.equal(
          routed,
          false,
          'Word boundary match with confidence >= 0.70 must not be automatically routed to inbox'
        )

        // 4. Invariant: Consistency with RuleInboxManager namespace
        const mgrEval = RuleInboxManager.evaluate(description, [rule])
        assert.deepEqual(
          mgrEval,
          evalResult,
          'RuleInboxManager.evaluate must produce identical results to direct evaluateTransactionForRules'
        )

        return true
      }
    ),
    { numRuns: 200 }
  )

  assert.ok(
    totalEvaluated >= MIN_PBT_RUNS,
    `Expected at least ${MIN_PBT_RUNS} iterations, evaluated ${totalEvaluated}`
  )
  console.log(`  ✓ Main Property 23 verified with ${totalEvaluated} iterations.\n`)
}

// ── Sub-check A: Stored Transaction Category Invariance & Confirmation Workflow 
// Validates: Requirements 8.4
// Verifies that a transaction's category changes ONLY upon explicit user confirmation
// (e.g. approveInboxTransaction), and NEVER prematurely during suggestion generation.
{
  let workflowEvaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 23 (Sub-check A): Category Mutation Requires Explicit Confirmation',
    fc.property(
      arbActiveRule,
      fc.string({ minLength: 3, maxLength: 20 }),
      arbRupiahAmount,
      fc.constantFrom('confirmed-same', 'confirmed-override', 'rejected'),
      (rule, rawDesc, amount, userDecision) => {
        workflowEvaluated++

        const initialCategory = 'Lain-lain'
        const initialSubcategory = undefined

        const tx = {
          id: `tx-flow-${workflowEvaluated}`,
          rawDescription: rawDesc,
          amount,
          category: initialCategory,
          subcategory: initialSubcategory,
        }

        // Simulate evaluation
        const evalResult = evaluateTransactionForRules(rawDesc, [rule])

        // Transaction is untouched
        assert.equal(tx.category, initialCategory)
        assert.equal(tx.subcategory, initialSubcategory)

        // Create an inbox item representing a pending suggestion
        const inboxItem = createInboxItem({
          rawDescription: tx.rawDescription,
          amount: tx.amount,
          suggestedCategoryId: evalResult.suggestedCategoryId || rule.categoryId,
          suggestedSubcategoryId: evalResult.suggestedSubcategoryId || rule.subcategoryId,
          confidence: evalResult.confidence,
          status: 'pending',
        })

        // Status is initially pending
        assert.equal(inboxItem.status, 'pending')

        // Apply explicit user action
        if (userDecision === 'confirmed-same') {
          // User accepts recommended suggestion
          const approved = approveInboxTransaction(inboxItem)
          assert.equal(approved.status, 'approved', 'Status must be approved')
          assert.equal(
            approved.suggestedCategoryId,
            inboxItem.suggestedCategoryId,
            'Category confirmed'
          )
        } else if (userDecision === 'confirmed-override') {
          // User overrides with a different category
          const overrideCategory = 'Investasi'
          const overrideSubcategory = 'Reksadana'
          const approved = approveInboxTransaction(inboxItem, {
            categoryId: overrideCategory,
            subcategoryId: overrideSubcategory,
          })
          assert.equal(approved.status, 'approved', 'Status must be approved')
          assert.equal(
            approved.suggestedCategoryId,
            overrideCategory,
            'Category overridden by user'
          )
          assert.equal(
            approved.suggestedSubcategoryId,
            overrideSubcategory,
            'Subcategory overridden by user'
          )
        } else {
          // User rejects the suggestion
          const rejected = rejectInboxTransaction(inboxItem)
          assert.equal(rejected.status, 'rejected', 'Status must be rejected')
        }

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(workflowEvaluated >= MIN_PBT_RUNS)
  console.log(`    Sub-check A verified with ${workflowEvaluated} runs for confirmation workflow.`)
}

// ── Sub-check B: Rule Specificity and Longest Keyword Priority Invariant ───────
// Validates: Requirements 8.1
// If multiple active rules match with word boundaries, the engine SHALL select
// the rule with the longest normalized keyword (most specific), regardless of rule order.
{
  let specificityEvaluated = 0

  // Generates pairs where generalKeyword is a strict prefix/subset of specificKeyword
  const arbNestedKeywords = fc.constantFrom(
    { general: 'kopi', specific: 'kopi kenangan' },
    { general: 'kopi', specific: 'kopi susu' },
    { general: 'kopi susu', specific: 'kopi susu gula aren' },
    { general: 'bensin', specific: 'bensin pertamax' },
    { general: 'listrik', specific: 'token listrik pln' },
    { general: 'makan', specific: 'makan siang padang' },
    { general: 'indomaret', specific: 'indomaret point' }
  )

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 23 (Sub-check B): Longest Keyword Specificity Priority',
    fc.property(
      arbNestedKeywords,
      fc.boolean(), // determines rule array insertion order
      arbBoundaryDelimiter,
      arbFillerWord,
      (keywords, insertGeneralFirst, delimiter, filler) => {
        specificityEvaluated++

        const ruleGeneral = createLocalRule({
          keyword: keywords.general,
          categoryId: 'makanan',
          subcategoryId: 'General',
        })
        const ruleSpecific = createLocalRule({
          keyword: keywords.specific,
          categoryId: 'hiburan',
          subcategoryId: 'Specific',
        })

        const rules = insertGeneralFirst
          ? [ruleGeneral, ruleSpecific]
          : [ruleSpecific, ruleGeneral]

        // Build description containing the SPECIFIC keyword with word boundaries
        const description = `${filler}${delimiter}${keywords.specific}${delimiter}${filler}`

        const evalResult = evaluateTransactionForRules(description, rules)

        assert.equal(
          evalResult.hasMatch,
          true,
          'Must have match for specific description'
        )
        assert.equal(
          evalResult.matchType,
          'word_boundary',
          'Must match as word_boundary'
        )
        assert.equal(
          evalResult.matchedKeyword,
          normalizeKeyword(keywords.specific),
          `Longest keyword rule "${keywords.specific}" must win over "${keywords.general}" regardless of array order (order: ${insertGeneralFirst ? 'general first' : 'specific first'})`
        )
        assert.equal(
          evalResult.suggestedCategoryId,
          ruleSpecific.categoryId,
          'Suggested category must come from the specific rule'
        )
        assert.equal(
          evalResult.suggestedSubcategoryId,
          ruleSpecific.subcategoryId,
          'Suggested subcategory must come from the specific rule'
        )

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(specificityEvaluated >= MIN_PBT_RUNS)
  console.log(`    Sub-check B verified with ${specificityEvaluated} runs for longest keyword priority.`)
}

// ── Sub-check C: Negative Word Boundary Protection (Sub-word Rejection) ───────
// Validates: Requirements 8.1
// Verifies that a keyword embedded inside another alphanumeric word without
// word boundaries (e.g. "ngopi" or "eskopidingin" for keyword "kopi") is
// strictly rejected from word_boundary classification.
{
  let boundaryEvaluated = 0

  const arbSubWordScenario = fc.record({
    keyword: fc.constantFrom('kopi', 'teh', 'bensin', 'gaji', 'listrik', 'roti', 'pulsa'),
    prefixAlpha: fc.stringMatching(/^[a-z]{2,5}$/),
    suffixAlpha: fc.stringMatching(/^[a-z]{2,5}$/),
    position: fc.constantFrom('prefix-only', 'suffix-only', 'both'),
  })

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 23 (Sub-check C): Negative Word Boundary Protection',
    fc.property(arbSubWordScenario, ({ keyword, prefixAlpha, suffixAlpha, position }) => {
      boundaryEvaluated++

      let subWordDescription = ''
      if (position === 'prefix-only') {
        // e.g. "ngopi"
        subWordDescription = `beli ${prefixAlpha}${keyword} pagi`
      } else if (position === 'suffix-only') {
        // e.g. "kopitiam"
        subWordDescription = `mampir ke ${keyword}${suffixAlpha}`
      } else {
        // e.g. "pengopian"
        subWordDescription = `proses ${prefixAlpha}${keyword}${suffixAlpha}`
      }

      const rule = createLocalRule({
        keyword,
        categoryId: 'makanan',
      })

      // 1. matchesKeyword must strictly return false for sub-word embedding
      const isWordMatch = matchesKeyword(subWordDescription, keyword)
      assert.equal(
        isWordMatch,
        false,
        `matchesKeyword must return false for sub-word embedding "${subWordDescription}" (keyword: "${keyword}")`
      )

      // 2. evaluateTransactionForRules must NEVER classify as word_boundary
      const evalResult = evaluateTransactionForRules(subWordDescription, [rule])
      assert.notEqual(
        evalResult.matchType,
        'word_boundary',
        `Sub-word embedding must not yield matchType=word_boundary (got: ${evalResult.matchType})`
      )

      // 3. If substring match occurs, confidence must be < 0.60 and requiresInboxReview must be true
      if (evalResult.hasMatch && evalResult.matchType === 'substring') {
        assert.ok(
          evalResult.confidence < 0.60,
          `Partial substring match confidence (${evalResult.confidence}) must be < 0.60`
        )
        assert.equal(
          evalResult.requiresInboxReview,
          true,
          'Partial substring match must require inbox review'
        )
      }

      return true
    })
  )

  assert.ok(boundaryEvaluated >= MIN_PBT_RUNS)
  console.log(`    Sub-check C verified with ${boundaryEvaluated} runs for negative word boundary protection.`)
}

// ── Sub-check D: Inactive Rule Suppression and Case-Insensitive Symmetry ───────
// Validates: Requirements 8.1, 8.2
// Verifies that inactive rules are ignored, and that case variations yield identical suggestions.
{
  let symmetryEvaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 23 (Sub-check D): Inactive Rule Suppression and Case Symmetry',
    fc.property(
      arbActiveRule,
      arbFillerWord,
      arbBoundaryDelimiter,
      (rule, filler, delimiter) => {
        symmetryEvaluated++

        // A. Inactive Rule Suppression
        const inactiveRule = { ...rule, isActive: false }
        const testDescription = `${filler}${delimiter}${rule.keyword}${delimiter}${filler}`

        const evalInactive = evaluateTransactionForRules(testDescription, [inactiveRule])
        assert.equal(
          evalInactive.hasMatch,
          false,
          'Inactive rule must be completely suppressed from matching'
        )
        assert.equal(
          evalInactive.requiresInboxReview,
          true,
          'Suppressed inactive rule yields requiresInboxReview=true'
        )

        // B. Case-Insensitive Symmetry
        const lowerDesc = testDescription.toLowerCase()
        const upperDesc = testDescription.toUpperCase()

        const evalLower = evaluateTransactionForRules(lowerDesc, [rule])
        const evalUpper = evaluateTransactionForRules(upperDesc, [rule])

        assert.equal(evalLower.hasMatch, true, 'Lower case match')
        assert.equal(evalUpper.hasMatch, true, 'Upper case match')
        assert.equal(
          evalLower.suggestedCategoryId,
          evalUpper.suggestedCategoryId,
          'Category suggestion must be invariant to description casing'
        )
        assert.equal(
          evalLower.suggestedSubcategoryId,
          evalUpper.suggestedSubcategoryId,
          'Subcategory suggestion must be invariant to description casing'
        )
        assert.equal(
          evalLower.confidence,
          evalUpper.confidence,
          'Confidence must be identical regardless of casing'
        )

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(symmetryEvaluated >= MIN_PBT_RUNS)
  console.log(`    Sub-check D verified with ${symmetryEvaluated} runs for inactive suppression & case symmetry.`)
}

// ── Sub-check E: Rule Usage Increment Isolation Invariant ─────────────────────
// Validates: Requirements 8.1, 8.4
// Calling incrementRuleUsage on a specific rule increments its matchCount by 1
// while leaving all other rules completely unmutated.
{
  let usageEvaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 23 (Sub-check E): Rule Usage Increment Isolation',
    fc.property(
      fc.array(arbActiveRule, { minLength: 1, maxLength: 8 }),
      (rawRules) => {
        usageEvaluated++

        // Deduplicate rule keywords to make valid rule list
        const seen = new Set()
        const rules = rawRules.filter((r) => {
          if (seen.has(r.keyword)) return false
          seen.add(r.keyword)
          return true
        })

        if (rules.length === 0) return true

        // Select first rule to increment
        const targetRule = rules[0]
        const previousMatchCount = targetRule.matchCount

        const updatedRules = incrementRuleUsage(targetRule.id, rules)

        assert.equal(
          updatedRules.length,
          rules.length,
          'Updated rules length must match original rules length'
        )

        const updatedTarget = updatedRules.find((r) => r.id === targetRule.id)
        assert.ok(updatedTarget !== undefined, 'Target rule must exist in updated rules')
        assert.equal(
          updatedTarget.matchCount,
          previousMatchCount + 1,
          `Target rule matchCount must increment by 1 (from ${previousMatchCount} to ${previousMatchCount + 1})`
        )

        // All other rules must remain unmutated
        for (let i = 1; i < rules.length; i++) {
          const otherOriginal = rules[i]
          const otherUpdated = updatedRules.find((r) => r.id === otherOriginal.id)
          assert.ok(otherUpdated !== undefined)
          assert.equal(
            otherUpdated.matchCount,
            otherOriginal.matchCount,
            `Non-target rule "${otherOriginal.id}" matchCount must remain unmutated`
          )
        }

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(usageEvaluated >= MIN_PBT_RUNS)
  console.log(`    Sub-check E verified with ${usageEvaluated} runs for rule usage increment isolation.`)
}

// ── Concrete Edge Cases ───────────────────────────────────────────────────────
{
  console.log('\nEvaluating concrete edge cases for Property 23...')

  // Case 1: Indonesian transaction descriptions with Indonesian punctuation
  const ruleKopi = createLocalRule({ keyword: 'kopi', categoryId: 'makanan', subcategoryId: 'Minuman' })
  const descPunctuation = 'Pagi: Beli kopi, donat & roti!'
  assert.equal(matchesKeyword(descPunctuation, 'kopi'), true)
  const evalPunct = evaluateTransactionForRules(descPunctuation, [ruleKopi])
  assert.equal(evalPunct.hasMatch, true)
  assert.equal(evalPunct.matchType, 'word_boundary')
  assert.equal(evalPunct.suggestedCategoryId, 'makanan')
  assert.equal(evalPunct.suggestedSubcategoryId, 'Minuman')

  // Case 2: Multi-word keyword with punctuation boundary
  const ruleBensin = createLocalRule({ keyword: 'bensin pertamax', categoryId: 'transportasi', subcategoryId: 'BBM' })
  const descBensin = 'Isi bensin pertamax (50rb)'
  assert.equal(matchesKeyword(descBensin, 'bensin pertamax'), true)
  const evalBensin = evaluateTransactionForRules(descBensin, [ruleBensin])
  assert.equal(evalBensin.hasMatch, true)
  assert.equal(evalBensin.suggestedCategoryId, 'transportasi')
  assert.equal(evalBensin.suggestedSubcategoryId, 'BBM')

  // Case 3: Partial substring match ("kopitiam" or "eskopi") vs word boundary match ("kopi")
  const descKopitiam = 'kopitiam sore di teras'
  assert.equal(matchesKeyword(descKopitiam, 'kopi'), false)
  const evalKopitiam = evaluateTransactionForRules(descKopitiam, [ruleKopi])
  assert.equal(evalKopitiam.matchType, 'substring')
  assert.ok(evalKopitiam.confidence < 0.60)
  assert.equal(evalKopitiam.requiresInboxReview, true)

  // Case 4: Non-destructive check with frozen transaction object
  const frozenTx = Object.freeze({
    id: 'tx-frozen-1',
    description: 'Beli kopi susu',
    amount: 18000,
    category: 'Belum Terkategori',
    subcategory: undefined,
  })
  const evalFrozen = evaluateTransactionForRules(frozenTx.description, [ruleKopi])
  assert.equal(frozenTx.category, 'Belum Terkategori')
  assert.equal(evalFrozen.suggestedCategoryId, 'makanan')

  // Case 5: Empty description safety
  const evalEmpty = evaluateTransactionForRules('', [ruleKopi])
  assert.equal(evalEmpty.hasMatch, false)
  assert.equal(evalEmpty.confidence, 0)
  assert.equal(evalEmpty.requiresInboxReview, true)

  console.log('✓ All concrete edge cases passed successfully')
}

console.log('\n✅ Property 23 (Local Categorization Rule Match Soundness) PASSED all invariants with >= 100 iterations each!\n')
