/**
 * SakuKilat — Property-Based Test Suite for Transfer Mode Full Wallet Eligibility
 *
 * Feature: sakukilat-core-roadmap, Property 6: Transfer Mode Full Wallet Eligibility
 * Validates: Requirements 2.6
 *
 * Property 6:
 * For any number N of registered active wallets, when operating in transfer mode,
 * the payment method selector SHALL present all N eligible source wallets and all
 * N - 1 eligible destination wallets without applying the 5-item compact truncation bound.
 */

import assert from 'node:assert/strict'
import {
  fc,
  testProperty,
  MIN_PBT_RUNS,
  arbCalendarDate,
} from './pbt-harness.mjs'
import {
  getCompactPaymentMethods,
} from '../lib/payment-ranking.ts'

console.log('====================================================')
console.log('  SAKUKILAT — PBT: TRANSFER MODE WALLET ELIGIBILITY ')
console.log('====================================================\n')

// ── Arbitrary Generators ──────────────────────────────────────────────────

// Generates valid wallet ID tokens (alphanumeric with hyphen / underscore)
const arbWalletId = fc.stringMatching(/^[a-z0-9_-]{3,12}$/)

// Generates a single wallet object
const arbWallet = fc.record({
  id: arbWalletId,
  label: fc.string({ minLength: 1, maxLength: 20 }),
  balance: fc.integer({ min: 0, max: 1_000_000_000 }),
})

// Generates an array of unique wallets by id
const arbUniqueWallets = (min = 0, max = 30) =>
  fc.uniqueArray(arbWallet, {
    selector: (w) => w.id,
    minLength: min,
    maxLength: max,
  })

// Generates transaction records referencing arbitrary payment methods
const arbTransaction = fc.record({
  paymentMethod: arbWalletId,
  date: arbCalendarDate,
})

// ── Feature: sakukilat-core-roadmap, Property 6: Transfer Mode Full Wallet Eligibility ──
// Validates: Requirements 2.6
{
  let totalEvaluated = 0

  const arbTransferScenario = fc.tuple(
    arbUniqueWallets(0, 30),
    fc.array(arbTransaction, { minLength: 0, maxLength: 50 }),
    fc.array(arbWalletId, { minLength: 0, maxLength: 10 }),
    fc.option(arbWalletId, { nil: undefined })
  )

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 6: Transfer Mode Full Wallet Eligibility',
    fc.property(
      arbTransferScenario,
      ([rawWallets, transactions, hiddenIds, activeMethodId]) => {
        totalEvaluated++

        const hiddenSet = new Set((hiddenIds ?? []).filter(Boolean))

        // Determine expected active non-hidden wallets in input order
        const expectedActiveWallets = []
        const seenActive = new Set()
        for (const w of rawWallets) {
          if (!w || !w.id || hiddenSet.has(w.id) || seenActive.has(w.id)) continue
          seenActive.add(w.id)
          expectedActiveWallets.push(w)
        }

        const N = expectedActiveWallets.length

        const result = getCompactPaymentMethods({
          wallets: rawWallets,
          transactions,
          hiddenPaymentIds: hiddenIds,
          activeMethodId,
          isTransferMode: true,
        })

        // Determine whether activeMethodId introduces an external pinned wallet
        const hasExternalPin =
          activeMethodId && !expectedActiveWallets.some((w) => w.id === activeMethodId)
        const expectedTotalCount = hasExternalPin ? N + 1 : N

        // 1. Invariant: No 5-item bound truncation
        // In transfer mode, result.compactMethods.length MUST equal the full count (N or N+1),
        // never bounded/capped at 5 items even when N > 5.
        assert.equal(
          result.compactMethods.length,
          expectedTotalCount,
          `Expected ${expectedTotalCount} wallets in transfer mode, but got ${result.compactMethods.length} (truncation detected!)`
        )

        // 2. Invariant: remainingMethods must be strictly empty in transfer mode
        assert.equal(
          result.remainingMethods.length,
          0,
          `remainingMethods must be empty in transfer mode, got ${result.remainingMethods.length}`
        )

        // 3. Invariant: totalCount must equal compactMethods.length
        assert.equal(
          result.totalCount,
          expectedTotalCount,
          `totalCount (${result.totalCount}) must equal expectedTotalCount (${expectedTotalCount})`
        )

        // 4. Invariant: All N active non-hidden wallets MUST be present in compactMethods
        for (const activeWallet of expectedActiveWallets) {
          const found = result.compactMethods.some((m) => m.id === activeWallet.id)
          assert.ok(
            found,
            `Active wallet "${activeWallet.id}" must be present in transfer mode source options`
          )
        }

        // 5. Invariant: If external activeMethodId was specified, it must be pinned at index 0
        if (hasExternalPin) {
          assert.equal(
            result.compactMethods[0]?.id,
            activeMethodId,
            `External activeMethodId "${activeMethodId}" must be pinned at index 0`
          )
        }

        // 6. Invariant: Eligible Destination Wallets Invariant (N - 1 destination options)
        // For any selected source wallet S from compactMethods, the eligible destination
        // wallets are all wallets in compactMethods except S.
        if (result.compactMethods.length > 0) {
          // Verify for each possible source wallet S
          for (const sourceWallet of result.compactMethods) {
            const eligibleDestinations = result.compactMethods.filter(
              (w) => w.id !== sourceWallet.id
            )

            // Number of eligible destinations must be exactly Total - 1
            assert.equal(
              eligibleDestinations.length,
              result.compactMethods.length - 1,
              `For source "${sourceWallet.id}", expected ${result.compactMethods.length - 1} destinations, got ${eligibleDestinations.length}`
            )

            // No destination wallet may be the source wallet itself (no self-transfers)
            assert.ok(
              !eligibleDestinations.some((d) => d.id === sourceWallet.id),
              `Source wallet "${sourceWallet.id}" must NOT be present in eligible destination wallets`
            )
          }
        }

        return true
      }
    ),
    { numRuns: 150 }
  )

  assert.ok(
    totalEvaluated >= MIN_PBT_RUNS,
    `Expected at least ${MIN_PBT_RUNS} iterations, evaluated ${totalEvaluated}`
  )
}

// ── Feature: sakukilat-core-roadmap, Property 6 (Sub-check A): No 5-Item Cap for Large N ──
// Specifically targets N >= 5 to explicitly guarantee no truncation occurs where normal mode would cap at 5
{
  let largeNCount = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 6 (Sub-check A): No 5-Item Cap for Large N (N >= 5)',
    fc.property(
      arbUniqueWallets(5, 30),
      fc.array(arbTransaction, { minLength: 0, maxLength: 30 }),
      (wallets, transactions) => {
        largeNCount++
        const N = wallets.length

        // Transfer mode: MUST return all N wallets
        const transferResult = getCompactPaymentMethods({
          wallets,
          transactions,
          isTransferMode: true,
        })

        // Standard mode: MUST be capped at 5
        const standardResult = getCompactPaymentMethods({
          wallets,
          transactions,
          isTransferMode: false,
        })

        assert.equal(
          transferResult.compactMethods.length,
          N,
          `Transfer mode must return all ${N} wallets, got ${transferResult.compactMethods.length}`
        )
        assert.equal(
          standardResult.compactMethods.length,
          Math.min(5, N),
          `Standard mode must cap at min(5, N) = ${Math.min(5, N)}, got ${standardResult.compactMethods.length}`
        )

        // When N > 5, transfer mode strictly exceeds standard mode compact count
        if (N > 5) {
          assert.ok(
            transferResult.compactMethods.length > standardResult.compactMethods.length,
            `Transfer mode count (${transferResult.compactMethods.length}) must strictly exceed standard mode capped count (${standardResult.compactMethods.length}) for N=${N}`
          )
        }

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(largeNCount >= MIN_PBT_RUNS)
  console.log(`    Sub-check A verified with ${largeNCount} runs where N >= 5.`)
}

// ── Feature: sakukilat-core-roadmap, Property 6 (Sub-check B): Destination Partitioning (N - 1) ──
// Verifies for any source wallet chosen, exactly N - 1 destination options are available
{
  let destCheckCount = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 6 (Sub-check B): Destination Partitioning (N - 1)',
    fc.property(
      arbUniqueWallets(2, 20),
      (wallets) => {
        destCheckCount++
        const N = wallets.length

        const result = getCompactPaymentMethods({
          wallets,
          transactions: [],
          isTransferMode: true,
        })

        assert.equal(result.compactMethods.length, N)

        // For every wallet in the list when chosen as source:
        for (let i = 0; i < result.compactMethods.length; i++) {
          const source = result.compactMethods[i]
          const destinations = result.compactMethods.filter((w) => w.id !== source.id)

          assert.equal(
            destinations.length,
            N - 1,
            `Destination count must be exactly ${N - 1}, got ${destinations.length}`
          )
          assert.equal(
            destinations.find((d) => d.id === source.id),
            undefined,
            `Destination list must not contain source wallet "${source.id}"`
          )
        }

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(destCheckCount >= MIN_PBT_RUNS)
  console.log(`    Sub-check B verified with ${destCheckCount} runs across multiple source-destination combinations.`)
}

// ── Feature: sakukilat-core-roadmap, Property 6 (Sub-check C): Transaction History Invariance ──
// Verifies that transfer mode never filters or reorders out wallets due to low frequency or old dates
{
  let historyCheckCount = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 6 (Sub-check C): Transaction History Invariance',
    fc.property(
      arbUniqueWallets(6, 15),
      (wallets) => {
        historyCheckCount++

        // Create heavily skewed history: only the first wallet is used 100 times, others 0 times
        const skewedTransactions = Array.from({ length: 100 }, () => ({
          paymentMethod: wallets[0].id,
          date: new Date('2026-09-01T12:00:00Z'),
        }))

        const result = getCompactPaymentMethods({
          wallets,
          transactions: skewedTransactions,
          isTransferMode: true,
        })

        // All wallets (even those with 0 frequency) must be present in compactMethods
        assert.equal(result.compactMethods.length, wallets.length)
        for (const w of wallets) {
          assert.ok(
            result.compactMethods.some((m) => m.id === w.id),
            `Unused wallet "${w.id}" must not be discarded in transfer mode`
          )
        }

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(historyCheckCount >= MIN_PBT_RUNS)
  console.log(`    Sub-check C verified with ${historyCheckCount} runs under heavily skewed transaction history.`)
}

// ── Feature: sakukilat-core-roadmap, Property 6 (Sub-check D): Hidden Wallet Exclusion ──
// Verifies that hidden wallets are excluded from transfer mode unless explicitly pinned
{
  let hiddenCheckCount = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 6 (Sub-check D): Hidden Wallet Exclusion',
    fc.property(
      arbUniqueWallets(4, 15),
      (wallets) => {
        hiddenCheckCount++

        // Mark the first two wallets as hidden
        const hiddenIds = [wallets[0].id, wallets[1].id]
        const expectedActive = wallets.slice(2)

        const result = getCompactPaymentMethods({
          wallets,
          transactions: [],
          hiddenPaymentIds: hiddenIds,
          isTransferMode: true,
        })

        assert.equal(result.compactMethods.length, expectedActive.length)
        assert.ok(
          !result.compactMethods.some((m) => hiddenIds.includes(m.id)),
          'Hidden wallets must NOT be included in transfer mode'
        )

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(hiddenCheckCount >= MIN_PBT_RUNS)
  console.log(`    Sub-check D verified with ${hiddenCheckCount} runs.`)
}

console.log('✅ Property 6 (Transfer Mode Full Wallet Eligibility) PASSED all invariants with >= 100 iterations each!\n')
