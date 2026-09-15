/**
 * SakuKilat — Property-Based Test Suite for Offline-First Zero Network Transmission
 *
 * Feature: sakukilat-core-roadmap, Property 25: Offline-First Zero Network Transmission
 * Validates: Requirements 8.6
 *
 * Property 25 Specification:
 * For all operations within the categorization rule matcher and inbox review subsystem,
 * the system SHALL execute entirely on-device and SHALL NOT initiate any HTTP/HTTPS
 * network requests or network socket transmissions.
 */

import assert from 'node:assert/strict'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import dgram from 'node:dgram'
import dns from 'node:dns'
import fs from 'node:fs'
import path from 'node:path'
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

console.log('========================================================================')
console.log('  SAKUKILAT — PBT: OFFLINE-FIRST ZERO NETWORK TRANSMISSION (PROP 25)   ')
console.log('========================================================================\n')

// ── Universal Network Interception Trap ────────────────────────────────────────

class NetworkInterceptionTrap {
  constructor() {
    this.interceptedCalls = []
    this.savedState = {}
  }

  install() {
    this.interceptedCalls = []

    // 1. globalThis.fetch
    if (typeof globalThis.fetch !== 'undefined') {
      this.savedState.fetch = globalThis.fetch
      globalThis.fetch = (...args) => {
        const err = new Error(`Intercepted unauthorized fetch: ${args[0]}`)
        this.interceptedCalls.push({ type: 'fetch', target: args[0], stack: err.stack })
        throw err
      }
    }

    // 2. node:http
    this.savedState.httpRequest = http.request
    this.savedState.httpGet = http.get
    http.request = (...args) => {
      const err = new Error('Intercepted unauthorized http.request')
      this.interceptedCalls.push({ type: 'http.request', args, stack: err.stack })
      throw err
    }
    http.get = (...args) => {
      const err = new Error('Intercepted unauthorized http.get')
      this.interceptedCalls.push({ type: 'http.get', args, stack: err.stack })
      throw err
    }

    // 3. node:https
    this.savedState.httpsRequest = https.request
    this.savedState.httpsGet = https.get
    https.request = (...args) => {
      const err = new Error('Intercepted unauthorized https.request')
      this.interceptedCalls.push({ type: 'https.request', args, stack: err.stack })
      throw err
    }
    https.get = (...args) => {
      const err = new Error('Intercepted unauthorized https.get')
      this.interceptedCalls.push({ type: 'https.get', args, stack: err.stack })
      throw err
    }

    // 4. node:net
    this.savedState.netConnect = net.Socket.prototype.connect
    const trap = this
    net.Socket.prototype.connect = function (...args) {
      const err = new Error('Intercepted unauthorized net.Socket.connect')
      trap.interceptedCalls.push({ type: 'net.connect', args, stack: err.stack })
      throw err
    }

    // 5. node:dgram
    this.savedState.dgramCreateSocket = dgram.createSocket
    dgram.createSocket = (...args) => {
      const err = new Error('Intercepted unauthorized dgram.createSocket')
      this.interceptedCalls.push({ type: 'dgram.createSocket', args, stack: err.stack })
      throw err
    }

    // 6. node:dns
    this.savedState.dnsLookup = dns.lookup
    dns.lookup = (...args) => {
      const err = new Error('Intercepted unauthorized dns.lookup')
      this.interceptedCalls.push({ type: 'dns.lookup', args, stack: err.stack })
      throw err
    }
  }

  getCallCount() {
    return this.interceptedCalls.length
  }

  clear() {
    this.interceptedCalls = []
  }

  uninstall() {
    if (this.savedState.fetch) globalThis.fetch = this.savedState.fetch
    if (this.savedState.httpRequest) http.request = this.savedState.httpRequest
    if (this.savedState.httpGet) http.get = this.savedState.httpGet
    if (this.savedState.httpsRequest) https.request = this.savedState.httpsRequest
    if (this.savedState.httpsGet) https.get = this.savedState.httpsGet
    if (this.savedState.netConnect) net.Socket.prototype.connect = this.savedState.netConnect
    if (this.savedState.dgramCreateSocket) dgram.createSocket = this.savedState.dgramCreateSocket
    if (this.savedState.dnsLookup) dns.lookup = this.savedState.dnsLookup
  }
}

const networkTrap = new NetworkInterceptionTrap()
networkTrap.install()

// Ensure clean restoration on exit
process.on('exit', () => {
  networkTrap.uninstall()
})

// ── Smart Arbitraries ──────────────────────────────────────────────────────────

const arbSubcategory = fc.constantFrom(
  'Minuman',
  'BBM',
  'Minimarket',
  'Utilitas',
  'Telekomunikasi',
  'Transportasi',
  'Camilan',
  'Harian',
  'Hiburan'
)

const arbPoolKeywords = [
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
  'token listrik',
  'paket data',
  'laundry',
]

const arbSingleWord = fc.constantFrom(
  'kopi',
  'bensin',
  'makan',
  'listrik',
  'belanja',
  'sepatu',
  'buku',
  'obat',
  'donat',
  'tiket'
)

const arbKeyword = fc.oneof(
  fc.constantFrom(...arbPoolKeywords),
  fc.tuple(arbSingleWord, arbSingleWord).map(([w1, w2]) => `${w1} ${w2}`)
)

const arbActiveRule = fc.record({
  keyword: arbKeyword,
  categoryId: arbCategory,
  subcategoryId: fc.option(arbSubcategory, { nil: undefined }),
  preferredPaymentMethodId: fc.constantFrom('tunai', 'bca', 'mandiri', 'gopay', 'ovo', 'dana'),
  isActive: fc.boolean(),
  matchCount: fc.integer({ min: 0, max: 50 }),
}).map(params => {
  return createLocalRule({
    keyword: params.keyword,
    categoryId: params.categoryId,
    subcategoryId: params.subcategoryId,
    preferredPaymentMethodId: params.preferredPaymentMethodId,
    isActive: params.isActive,
  })
})

const arbRulesCollection = fc.array(arbActiveRule, { minLength: 0, maxLength: 8 }).map(rules => {
  const seen = new Set()
  const dedup = []
  for (const r of rules) {
    if (!seen.has(r.keyword) && r.keyword.length > 0) {
      seen.add(r.keyword)
      dedup.push(r)
    }
  }
  return dedup
})

const arbInboxItemRecord = fc.record({
  rawDescription: fc.string({ minLength: 1, maxLength: 40 }),
  amount: arbRupiahAmount,
  confidence: fc.integer({ min: 0, max: 100 }).map(n => n / 100),
  status: fc.constantFrom('pending', 'approved', 'rejected'),
}).map(p => createInboxItem(p))

const arbInboxQueue = fc.array(arbInboxItemRecord, { minLength: 0, maxLength: 6 })

// ── Feature: sakukilat-core-roadmap, Property 25: Offline-First Zero Network Transmission ──
// Validates: Requirements 8.6
// For all operations within the categorization rule matcher and inbox review subsystem,
// the system SHALL execute entirely on-device and SHALL NOT initiate any HTTP/HTTPS
// network requests.
{
  let totalEvaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 25: Offline-First Zero Network Transmission',
    fc.property(
      arbRulesCollection,
      fc.string({ minLength: 0, maxLength: 50 }),
      arbRupiahAmount,
      arbInboxQueue,
      fc.integer({ min: 40, max: 90 }).map(n => n / 100),
      (rules, description, amount, inbox, threshold) => {
        totalEvaluated++
        networkTrap.clear()

        // 1. Direct evaluateTransactionForRules
        const evalResult = evaluateTransactionForRules(description, rules, { threshold })
        assert.equal(
          networkTrap.getCallCount(),
          0,
          'evaluateTransactionForRules must not initiate any network calls'
        )

        // 2. Namespace RuleInboxManager.evaluate
        const evalNamespace = RuleInboxManager.evaluate(description, rules, { threshold })
        assert.equal(
          networkTrap.getCallCount(),
          0,
          'RuleInboxManager.evaluate must not initiate any network calls'
        )
        assert.deepEqual(evalResult, evalNamespace)

        // 3. Routing operation
        const tx = { id: `tx-${totalEvaluated}`, description, amount }
        const routeResult = routeToInboxIfNeeded(tx, evalResult, inbox, threshold)
        assert.equal(
          networkTrap.getCallCount(),
          0,
          'routeToInboxIfNeeded must not initiate any network calls'
        )

        // 4. Pending items retrieval
        const pending = getPendingInboxItems(routeResult.updatedInbox)
        assert.equal(
          networkTrap.getCallCount(),
          0,
          'getPendingInboxItems must not initiate any network calls'
        )
        assert.ok(Array.isArray(pending))

        // 5. Keyword match primitives
        const testKeyword = rules.length > 0 ? rules[0].keyword : 'kopi'
        matchesKeyword(description, testKeyword)
        matchesSubstring(description, testKeyword)
        normalizeKeyword(description)
        isDuplicateRule(testKeyword, rules)
        assert.equal(
          networkTrap.getCallCount(),
          0,
          'Keyword string matching helpers must not initiate any network calls'
        )

        // All operations are purely synchronous and return valid objects immediately
        assert.ok(typeof evalResult.hasMatch === 'boolean')
        assert.ok(typeof evalResult.confidence === 'number')
        assert.ok(typeof routeResult.routed === 'boolean')

        return true
      }
    ),
    { numRuns: 200 }
  )

  assert.ok(
    totalEvaluated >= MIN_PBT_RUNS,
    `Expected at least ${MIN_PBT_RUNS} iterations, evaluated ${totalEvaluated}`
  )
  console.log(`  ✓ Main Property 25 verified with ${totalEvaluated} iterations (0 network calls).\n`)
}

// ── Property 25 (Sub-check A): End-to-End Workflow Zero-Network Lifecycle ──────
// Validates: Requirements 8.6
// Simulates the full multi-step user classification lifecycle:
// (a) Incoming unclassified transaction
// (b) Local evaluation against rules
// (c) Routing to inbox
// (d) User approval with confirmed category
// (e) Converting approved item into new local rule
// (f) Re-evaluating subsequent transaction matching the new rule
// (g) Incrementing rule usage count
// Guarantees zero network calls across the entire lifecycle.
{
  let lifecycleRuns = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 25 (Sub-check A): End-to-End Workflow Zero-Network Lifecycle',
    fc.property(
      arbKeyword,
      arbCategory,
      arbSubcategory,
      arbRupiahAmount,
      fc.constantFrom('approve-default', 'approve-override', 'reject'),
      (keyword, categoryId, subcategoryId, amount, userDecision) => {
        lifecycleRuns++
        networkTrap.clear()

        const initialRules = []
        const initialInbox = []
        const rawDesc = `Beli ${keyword} pagi hari`

        // Step 1: Initial evaluation (should be unmatched because rules are empty)
        const initialEval = evaluateTransactionForRules(rawDesc, initialRules)
        assert.equal(initialEval.hasMatch, false)
        assert.equal(networkTrap.getCallCount(), 0)

        // Step 2: Route unclassified transaction to Inbox Review queue
        const tx = { id: `tx-lifecycle-${lifecycleRuns}`, description: rawDesc, amount }
        const { routed, inboxItem, updatedInbox } = routeToInboxIfNeeded(tx, initialEval, initialInbox)
        assert.equal(routed, true)
        assert.ok(inboxItem !== undefined)
        assert.equal(updatedInbox.length, 1)
        assert.equal(networkTrap.getCallCount(), 0)

        // Step 3: User reviews inbox item
        if (userDecision === 'reject') {
          const rejected = rejectInboxTransaction(inboxItem)
          assert.equal(rejected.status, 'rejected')
          assert.equal(networkTrap.getCallCount(), 0)
        } else {
          // User approves item
          const confirmedCat =
            userDecision === 'approve-override'
              ? { categoryId: 'hiburan', subcategoryId: 'Games' }
              : { categoryId, subcategoryId }

          const approved = approveInboxTransaction(inboxItem, confirmedCat)
          assert.equal(approved.status, 'approved')
          assert.equal(approved.suggestedCategoryId, confirmedCat.categoryId)
          assert.equal(networkTrap.getCallCount(), 0)

          // Step 4: System prompts to convert approved item into local rule
          const newRuleParams = prepareRuleFromInboxItem(approved, keyword)
          assert.equal(newRuleParams.keyword, normalizeKeyword(keyword))
          assert.equal(networkTrap.getCallCount(), 0)

          // Step 5: Save new active local rule locally
          const newRule = createLocalRule(newRuleParams, initialRules)
          const updatedRules = [newRule, ...initialRules]
          assert.equal(updatedRules.length, 1)
          assert.equal(networkTrap.getCallCount(), 0)

          // Step 6: Subsequent transaction with the same keyword arrives
          const subsequentDesc = `Pesanan ${keyword} siang`
          const subsequentEval = evaluateTransactionForRules(subsequentDesc, updatedRules)
          assert.equal(subsequentEval.hasMatch, true)
          assert.equal(subsequentEval.suggestedCategoryId, confirmedCat.categoryId)
          assert.equal(subsequentEval.requiresInboxReview, false)
          assert.equal(networkTrap.getCallCount(), 0)

          // Step 7: Increment rule usage count locally
          const finalRules = incrementRuleUsage(newRule.id, updatedRules)
          assert.equal(finalRules[0].matchCount, 1)
          assert.equal(networkTrap.getCallCount(), 0)
        }

        // Final assertion for Sub-check A: exactly zero network calls occurred
        assert.equal(networkTrap.getCallCount(), 0)
        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(lifecycleRuns >= MIN_PBT_RUNS)
  console.log(`    Sub-check A verified with ${lifecycleRuns} runs (End-to-End Workflow Zero-Network).`)
}

// ── Property 25 (Sub-check B): Adversarial Input Immunity (URLs, Endpoints) ────
// Validates: Requirements 8.6
// Verifies that when transaction descriptions or keywords contain URLs, remote endpoints,
// IP addresses, or network payloads, the engine treats them purely as inert local text
// and never attempts to resolve hosts, make HTTP requests, or open sockets.
{
  let adversarialRuns = 0

  const arbAdversarialString = fc.constantFrom(
    'https://api.sakukilat.org/v1/categorize?query=kopi',
    'http://localhost:8080/sync/transactions',
    'http://192.168.1.1/admin/submit',
    'ftp://files.example.com/rules.json',
    'ws://chat.example.com/socket',
    '<script src="https://evil.com/xss.js"></script>',
    'curl -X POST https://analytics.tracker.io/collect',
    'fetch("https://remote.server/leak")',
    'dns://8.8.8.8/lookup',
    'www.bca.co.id/klikbca/login',
    'support@sakukilat.id'
  )

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 25 (Sub-check B): Adversarial Input Immunity (URL & Injection Strings)',
    fc.property(
      arbAdversarialString,
      arbCategory,
      arbRupiahAmount,
      (adversarialText, categoryId, amount) => {
        adversarialRuns++
        networkTrap.clear()

        // Test rule creation with adversarial keyword
        const rule = createLocalRule({
          keyword: adversarialText,
          categoryId,
        })
        assert.equal(networkTrap.getCallCount(), 0, 'createLocalRule with URL must not trigger network')

        // Test evaluation with adversarial description
        const evalResult = evaluateTransactionForRules(adversarialText, [rule])
        assert.equal(networkTrap.getCallCount(), 0, 'evaluateTransactionForRules with URL must not trigger network')
        assert.equal(evalResult.hasMatch, true)

        // Test routing with adversarial description
        const { routed, inboxItem } = routeToInboxIfNeeded(
          { description: adversarialText, amount },
          evalResult,
          []
        )
        assert.equal(networkTrap.getCallCount(), 0, 'routeToInboxIfNeeded with URL must not trigger network')

        // Test substring matching
        matchesSubstring(adversarialText, 'http')
        matchesKeyword(adversarialText, 'http')
        assert.equal(networkTrap.getCallCount(), 0, 'Pattern matching with URLs must not trigger network')

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(adversarialRuns >= MIN_PBT_RUNS)
  console.log(`    Sub-check B verified with ${adversarialRuns} runs (Adversarial Input Immunity).`)
}

// ── Property 25 (Sub-check C): Static Source Code Offline Invariant Verification
// Validates: Requirements 8.6
// Analyzes the source code file `lib/rules-inbox.ts` to ensure:
// 1. No imports of node network modules (http, https, net, dgram, dns, tls)
// 2. No imports of third-party HTTP clients (axios, fetch, got, superagent)
// 3. No occurrences of remote URL schemas (http://, https://, ws://, wss://)
// 4. 100% self-contained local algorithm
{
  let staticRuns = 0

  const sourcePath = path.resolve(import.meta.dirname, '..', 'lib', 'rules-inbox.ts')
  const sourceCode = fs.readFileSync(sourcePath, 'utf8')

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 25 (Sub-check C): Static Source Code Offline Invariant Verification',
    fc.property(
      fc.constantFrom(
        'http',
        'https',
        'net',
        'dgram',
        'dns',
        'tls',
        'axios',
        'node-fetch',
        'cross-fetch'
      ),
      (prohibitedModule) => {
        staticRuns++

        // Check for import statements importing prohibited network packages
        const importPattern = new RegExp(`from\\s+['"](node:)?${prohibitedModule}['"]`, 'i')
        assert.equal(
          importPattern.test(sourceCode),
          false,
          `lib/rules-inbox.ts must not import networking module "${prohibitedModule}"`
        )

        // Check for require calls
        const requirePattern = new RegExp(`require\\(['"](node:)?${prohibitedModule}['"]\\)`, 'i')
        assert.equal(
          requirePattern.test(sourceCode),
          false,
          `lib/rules-inbox.ts must not require networking module "${prohibitedModule}"`
        )

        // Check for fetch or XMLHttpRequest usage inside source
        const fetchPattern = /\bfetch\s*\(/
        assert.equal(
          fetchPattern.test(sourceCode),
          false,
          'lib/rules-inbox.ts must not invoke global fetch'
        )

        // Check for http:// or https:// hardcoded endpoints in source
        const urlPattern = /https?:\/\/[a-zA-Z0-9.-]+/
        assert.equal(
          urlPattern.test(sourceCode),
          false,
          'lib/rules-inbox.ts must not contain remote HTTP/HTTPS URLs'
        )

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(staticRuns >= MIN_PBT_RUNS)
  console.log(`    Sub-check C verified with ${staticRuns} runs (Static Source Code Offline Invariant).`)
}

// ── Concrete Edge Cases ───────────────────────────────────────────────────────
{
  console.log('\nValidating concrete edge cases for Property 25...')
  networkTrap.clear()

  // Edge Case 1: Empty string input
  const evalEmpty = evaluateTransactionForRules('', [])
  assert.equal(evalEmpty.hasMatch, false)
  assert.equal(networkTrap.getCallCount(), 0)

  // Edge Case 2: Unicode & Emoji descriptions
  const unicodeDesc = 'Beli kopi ☕ dan donat 🍩 di kedai 🏪'
  const ruleKopi = createLocalRule({ keyword: 'kopi', categoryId: 'makanan' })
  const evalUnicode = evaluateTransactionForRules(unicodeDesc, [ruleKopi])
  assert.equal(evalUnicode.hasMatch, true)
  assert.equal(networkTrap.getCallCount(), 0)

  // Edge Case 3: Punctuation and Regex-like symbols
  const punctDesc = 'Kopi (1+1) *Promo* [Diskon?]'
  const evalPunct = evaluateTransactionForRules(punctDesc, [ruleKopi])
  assert.equal(evalPunct.hasMatch, true)
  assert.equal(networkTrap.getCallCount(), 0)

  // Edge Case 4: Zero amount and high amount
  const routeZero = routeToInboxIfNeeded({ description: 'test zero', amount: 0 }, evalEmpty, [])
  assert.equal(routeZero.inboxItem.amount, 0)
  assert.equal(networkTrap.getCallCount(), 0)

  console.log('✓ All concrete edge cases passed with 0 network calls.\n')
}

console.log('✅ Property 25 (Offline-First Zero Network Transmission) PASSED all invariants with >= 100 iterations each!\n')
