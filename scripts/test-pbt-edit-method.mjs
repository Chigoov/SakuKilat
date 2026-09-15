/**
 * SakuKilat — Property-Based Test Suite for Phase P2: Edit Mode Active Method Visibility
 *
 * Feature: sakukilat-core-roadmap, Property 5: Edit Mode Active Method Visibility
 * Validates: Requirements 2.5
 *
 * For any transaction being edited with assigned payment method M, the compact
 * payment method selector SHALL include M in its visible options, even if M is
 * not among the top 5 ranked methods by frequency or recency.
 */

import assert from 'node:assert/strict'
import {
  fc,
  testProperty,
  MIN_PBT_RUNS,
  arbRupiahAmount,
} from './pbt-harness.mjs'
import {
  getCompactPaymentMethods,
  calculatePaymentMethodStats,
} from '../lib/payment-ranking.ts'

console.log('====================================================')
console.log('  SAKUKILAT — PBT: EDIT MODE ACTIVE METHOD VISIBILITY ')
console.log('====================================================\n')

const KNOWN_WALLET_IDS = [
  'tunai',
  'bca',
  'mandiri',
  'bni',
  'bri',
  'cimb',
  'seabank',
  'jago',
  'gopay',
  'ovo',
  'dana',
  'shopeepay',
  'linkaja',
  'jenius',
  'blu',
  'tabungan-utama',
  'kantong-belanja',
  'dompet-darurat',
  'kantong-investasi',
  'kantong-liburan',
]

// Arbitrary wallet generator with realistic IDs, labels, and balances
const arbSingleWallet = fc.record({
  id: fc.constantFrom(...KNOWN_WALLET_IDS),
  label: fc.string({ minLength: 1, maxLength: 30 }),
  balance: arbRupiahAmount,
})

// Generator for a list of 1 to 15 unique wallets
const arbWalletList = fc
  .uniqueArray(arbSingleWallet, {
    selector: (w) => w.id,
    minLength: 1,
    maxLength: 15,
  })

// Generator for a list of transactions referencing available wallets or external methods
const arbTransactionHistory = (walletIds) =>
  fc.array(
    fc.record({
      paymentMethod: fc.oneof(
        fc.constantFrom(...walletIds),
        fc.constantFrom('old-wallet', 'deleted-method', 'cash-legacy')
      ),
      date: fc.integer({
        min: new Date('2025-01-01').getTime(),
        max: new Date('2026-12-31').getTime(),
      }),
    }),
    { minLength: 0, maxLength: 60 }
  )

// Comprehensive state generator combining wallets, transactions, hidden IDs, and activeMethodId
const arbEditModeScenario = arbWalletList.chain((wallets) => {
  const walletIds = wallets.map((w) => w.id)

  return fc.record({
    wallets: fc.constant(wallets),
    transactions: arbTransactionHistory(walletIds),
    hiddenPaymentIds: fc.subarray(walletIds, { minLength: 0, maxLength: Math.min(3, walletIds.length) }),
    isTransferMode: fc.boolean(),
    // activeMethodId strategy:
    // 1. One of the existing wallets (can be top 5 or low ranked)
    // 2. A hidden wallet
    // 3. An external / deleted wallet not present in wallets array
    // 4. A whitespace-padded ID
    activeMethodCategory: fc.constantFrom('existing', 'hidden_target', 'deleted_external', 'whitespace_padded'),
  }).chain((scenario) => {
    let activeMethodIdGen
    const { wallets, hiddenPaymentIds, activeMethodCategory } = scenario
    const walletIds = wallets.map((w) => w.id)

    if (activeMethodCategory === 'hidden_target' && hiddenPaymentIds.length > 0) {
      activeMethodIdGen = fc.constantFrom(...hiddenPaymentIds)
    } else if (activeMethodCategory === 'deleted_external') {
      activeMethodIdGen = fc.constantFrom(
        'custom-deleted-bank',
        'legacy-coop-wallet',
        'closed-account-99',
        'cash-darurat-lama'
      )
    } else if (activeMethodCategory === 'whitespace_padded') {
      activeMethodIdGen = fc.constantFrom(...walletIds).map((id) => `  ${id}  `)
    } else {
      activeMethodIdGen = fc.constantFrom(...walletIds)
    }

    return fc.record({
      wallets: fc.constant(scenario.wallets),
      transactions: fc.constant(scenario.transactions),
      hiddenPaymentIds: fc.constant(scenario.hiddenPaymentIds),
      isTransferMode: fc.constant(scenario.isTransferMode),
      activeMethodId: activeMethodIdGen,
    })
  })
})

// ── Property 5: Edit Mode Active Method Visibility ──────────────────────────────
// Validates: Requirements 2.5
// Tag: // Feature: sakukilat-core-roadmap, Property 5: Edit Mode Active Method Visibility
{
  let totalEvaluated = 0
  let existingEvaluated = 0
  let hiddenEvaluated = 0
  let externalEvaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 5: Edit Mode Active Method Visibility',
    fc.property(arbEditModeScenario, ({ wallets, transactions, hiddenPaymentIds, isTransferMode, activeMethodId }) => {
      totalEvaluated++

      const trimmedActiveId = activeMethodId.trim()
      const isKnownWallet = wallets.some((w) => w.id === trimmedActiveId)
      const isHidden = hiddenPaymentIds.includes(trimmedActiveId)

      if (isHidden) {
        hiddenEvaluated++
      } else if (isKnownWallet) {
        existingEvaluated++
      } else {
        externalEvaluated++
      }

      // Execute getCompactPaymentMethods in edit mode
      const result = getCompactPaymentMethods({
        wallets,
        transactions,
        activeMethodId,
        hiddenPaymentIds,
        isTransferMode,
      })

      // Invariant 1: Active method MUST be visible in compactMethods (visible selector area)
      const isVisibleInCompact = result.compactMethods.some((m) => m.id === trimmedActiveId)
      assert.equal(
        isVisibleInCompact,
        true,
        `Property 5 Violation: activeMethodId "${trimmedActiveId}" MUST be visible in compactMethods`
      )

      // Invariant 2: Maximum 5 items bound in standard (non-transfer) mode
      if (!isTransferMode) {
        assert.ok(
          result.compactMethods.length <= 5,
          `Property 5 Violation: compactMethods length (${result.compactMethods.length}) exceeded maximum 5 items`
        )
      }

      // Invariant 3: No duplicate IDs in compactMethods
      const compactIds = result.compactMethods.map((m) => m.id)
      const uniqueCompactIds = new Set(compactIds)
      assert.equal(
        uniqueCompactIds.size,
        compactIds.length,
        `Property 5 Violation: duplicate IDs found in compactMethods: [${compactIds.join(', ')}]`
      )

      // Invariant 4: No overlap between visible compactMethods and remainingMethods
      const remainingIds = result.remainingMethods.map((m) => m.id)
      assert.equal(
        remainingIds.includes(trimmedActiveId),
        false,
        `Property 5 Violation: activeMethodId "${trimmedActiveId}" appears in both compactMethods and remainingMethods`
      )

      // Invariant 5: Data integrity preservation
      const visibleItem = result.compactMethods.find((m) => m.id === trimmedActiveId)
      assert.ok(visibleItem, `Visible item for activeMethodId "${trimmedActiveId}" must exist`)

      const originalWallet = wallets.find((w) => w.id === trimmedActiveId)
      if (originalWallet) {
        assert.equal(
          visibleItem.label,
          originalWallet.label || originalWallet.id,
          `Visible item label must preserve original wallet label`
        )
        assert.equal(
          visibleItem.balance,
          originalWallet.balance,
          `Visible item balance must preserve original wallet balance`
        )
      } else {
        // Fallback item for deleted/external method
        assert.equal(visibleItem.id, trimmedActiveId)
        assert.equal(visibleItem.balance, 0)
      }

      // Invariant 6: Total count equals sum of compact and remaining
      assert.equal(
        result.totalCount,
        result.compactMethods.length + result.remainingMethods.length,
        `totalCount must equal compactMethods.length + remainingMethods.length`
      )

      return true
    }),
    { numRuns: 200 }
  )

  assert.ok(
    totalEvaluated >= MIN_PBT_RUNS,
    `Expected at least ${MIN_PBT_RUNS} iterations, but ran ${totalEvaluated}`
  )
  assert.ok(existingEvaluated > 0, `Expected existing active method cases, got ${existingEvaluated}`)
  assert.ok(externalEvaluated > 0, `Expected external/deleted method cases, got ${externalEvaluated}`)
  console.log(`    Coverage breakdown: ${existingEvaluated} existing, ${hiddenEvaluated} hidden, ${externalEvaluated} external/deleted.\n`)
}

// ── Property 5 (Sub-check A): Low-Ranked Method Explicitly Pinned to Index 0 ───
// Validates: Requirement 2.5
// Specifically constructs scenarios with 7+ wallets where 5+ wallets have high frequency,
// and the edited transaction's activeMethodId is a wallet that ranks 6th or lower.
// Verifies that:
// 1. Without activeMethodId, the target wallet is NOT in compactMethods.
// 2. With activeMethodId, the target wallet IS included in compactMethods (pinned).
// 3. The compact list size remains bounded to exactly 5 items.
{
  let lowRankCount = 0

  const arbLowRankScenario = fc.record({
    activeWalletCount: fc.integer({ min: 7, max: 12 }),
    targetRank: fc.integer({ min: 5, max: 10 }), // 0-indexed rank 5+ is 6th+ item
  }).map(({ activeWalletCount, targetRank }) => {
    const selectedWallets = KNOWN_WALLET_IDS.slice(0, activeWalletCount).map((id, idx) => ({
      id,
      label: `Wallet ${id.toUpperCase()}`,
      balance: (idx + 1) * 100_000,
    }))

    const safeTargetIndex = Math.min(targetRank, selectedWallets.length - 1)
    const targetWallet = selectedWallets[safeTargetIndex]

    // Construct transaction history where wallets before targetWallet have decreasing high frequency,
    // and targetWallet has 0 transactions (or lowest frequency) so it is guaranteed to rank low
    const transactions = []
    const now = Date.now()

    for (let i = 0; i < selectedWallets.length; i++) {
      if (i !== safeTargetIndex) {
        const freq = (selectedWallets.length - i) * 5 // higher freq for earlier wallets
        for (let f = 0; f < freq; f++) {
          transactions.push({
            paymentMethod: selectedWallets[i].id,
            date: new Date(now - (i * 86400000) - (f * 1000)).toISOString(),
          })
        }
      }
    }

    return {
      wallets: selectedWallets,
      transactions,
      targetWallet,
    }
  })

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 5 (Sub-check A): Low-Ranked Method Explicitly Pinned',
    fc.property(arbLowRankScenario, ({ wallets, transactions, targetWallet }) => {
      lowRankCount++

      // Baseline without activeMethodId: targetWallet MUST NOT be in compactMethods
      const baseline = getCompactPaymentMethods({
        wallets,
        transactions,
      })
      assert.equal(
        baseline.compactMethods.some((w) => w.id === targetWallet.id),
        false,
        `Precondition check: targetWallet "${targetWallet.id}" should not naturally be in top 5`
      )
      assert.ok(
        baseline.remainingMethods.some((w) => w.id === targetWallet.id),
        `targetWallet must be present in remainingMethods`
      )

      // In Edit Mode: activeMethodId = targetWallet.id
      const editResult = getCompactPaymentMethods({
        wallets,
        transactions,
        activeMethodId: targetWallet.id,
      })

      // Must now be present in compactMethods
      assert.equal(
        editResult.compactMethods.some((w) => w.id === targetWallet.id),
        true,
        `targetWallet "${targetWallet.id}" MUST be visible in compactMethods in edit mode`
      )

      // Pinned to index 0
      assert.equal(
        editResult.compactMethods[0].id,
        targetWallet.id,
        `targetWallet "${targetWallet.id}" should be pinned at index 0`
      )

      // Must remain bounded to 5
      assert.equal(
        editResult.compactMethods.length,
        5,
        `compactMethods length must remain strictly 5`
      )

      // Must be removed from remainingMethods
      assert.equal(
        editResult.remainingMethods.some((w) => w.id === targetWallet.id),
        false,
        `targetWallet must not remain in remainingMethods`
      )

      return true
    }),
    { numRuns: 100 }
  )

  assert.ok(lowRankCount >= MIN_PBT_RUNS)
  console.log(`    Verified ${lowRankCount} low-ranked wallet pinning scenarios.\n`)
}

// ── Property 5 (Sub-check B): Hidden Method Visibility When Editing Past Tx ────
// Validates: Requirements 2.5, 2.7
// When a payment method is marked as hidden, it is excluded from regular selection,
// but if editing an existing transaction that was paid with that hidden method,
// it MUST be rendered in the visible compact options.
{
  let hiddenCount = 0

  const arbHiddenScenario = fc.record({
    walletCount: fc.integer({ min: 4, max: 8 }),
    hiddenIndex: fc.integer({ min: 0, max: 3 }),
  }).map(({ walletCount, hiddenIndex }) => {
    const wallets = KNOWN_WALLET_IDS.slice(0, walletCount).map((id, idx) => ({
      id,
      label: `Wallet ${id}`,
      balance: (idx + 1) * 50_000,
    }))

    const hiddenWallet = wallets[hiddenIndex % wallets.length]
    const hiddenPaymentIds = [hiddenWallet.id]

    return { wallets, hiddenPaymentIds, hiddenWallet }
  })

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 5 (Sub-check B): Hidden Method Visibility in Edit Mode',
    fc.property(arbHiddenScenario, ({ wallets, hiddenPaymentIds, hiddenWallet }) => {
      hiddenCount++

      // New entry mode: hidden wallet must NOT be visible
      const newEntryResult = getCompactPaymentMethods({
        wallets,
        transactions: [],
        hiddenPaymentIds,
      })
      assert.equal(
        newEntryResult.compactMethods.some((w) => w.id === hiddenWallet.id),
        false,
        `Hidden wallet must not be visible in new transaction entry`
      )
      assert.equal(
        newEntryResult.remainingMethods.some((w) => w.id === hiddenWallet.id),
        false,
        `Hidden wallet must not be visible in remainingMethods`
      )

      // Edit mode: editing transaction that used the hidden wallet
      const editResult = getCompactPaymentMethods({
        wallets,
        transactions: [],
        hiddenPaymentIds,
        activeMethodId: hiddenWallet.id,
      })

      // Hidden wallet MUST be visible in compact options
      assert.equal(
        editResult.compactMethods.some((w) => w.id === hiddenWallet.id),
        true,
        `Hidden wallet "${hiddenWallet.id}" MUST be visible when editing existing transaction`
      )
      assert.equal(
        editResult.compactMethods[0].id,
        hiddenWallet.id,
        `Hidden wallet must be pinned to index 0`
      )
      assert.ok(
        editResult.compactMethods.length <= 5,
        `compactMethods must be <= 5`
      )

      return true
    }),
    { numRuns: 100 }
  )

  assert.ok(hiddenCount >= MIN_PBT_RUNS)
  console.log(`    Verified ${hiddenCount} hidden wallet edit visibility scenarios.\n`)
}

// ── Property 5 (Sub-check C): Deleted / Non-Existent Method Fallback Synthesis ──
// Validates: Requirement 2.5
// If a transaction was created with a payment method that was later deleted or
// no longer exists in `wallets`, the selector must synthesize a fallback item
// and display it visibly so the user does not lose awareness of original payment info.
{
  let deletedCount = 0

  const arbDeletedScenario = fc.record({
    walletCount: fc.integer({ min: 1, max: 6 }),
    deletedMethodId: fc.string({ minLength: 3, maxLength: 20 })
      .filter((s) => !KNOWN_WALLET_IDS.includes(s) && /^[a-z0-9_-]+$/i.test(s)),
  }).map(({ walletCount, deletedMethodId }) => {
    const wallets = KNOWN_WALLET_IDS.slice(0, walletCount).map((id, idx) => ({
      id,
      label: `Wallet ${id}`,
      balance: 100_000,
    }))
    return { wallets, deletedMethodId }
  })

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 5 (Sub-check C): Deleted / Non-Existent Method Fallback Synthesis',
    fc.property(arbDeletedScenario, ({ wallets, deletedMethodId }) => {
      deletedCount++

      const editResult = getCompactPaymentMethods({
        wallets,
        transactions: [],
        activeMethodId: deletedMethodId,
      })

      // The deleted method must be visible in compactMethods
      const fallbackItem = editResult.compactMethods.find((w) => w.id === deletedMethodId)
      assert.ok(
        fallbackItem,
        `Deleted method "${deletedMethodId}" must be synthesized into compactMethods`
      )
      assert.equal(fallbackItem.id, deletedMethodId)
      assert.equal(fallbackItem.balance, 0)
      assert.ok(
        editResult.compactMethods.length <= 5,
        `compactMethods must be <= 5`
      )

      return true
    }),
    { numRuns: 100 }
  )

  assert.ok(deletedCount >= MIN_PBT_RUNS)
  console.log(`    Verified ${deletedCount} deleted method fallback scenarios.\n`)
}

// ── Concrete Edge Cases ────────────────────────────────────────────────────────
{
  console.log('Validating concrete edge cases for edit mode active method...')

  // Case 1: Active method is ALREADY ranked #1 (should not be duplicated)
  {
    const wallets = [
      { id: 'bca', label: 'BCA', balance: 500_000 },
      { id: 'tunai', label: 'Tunai', balance: 100_000 },
    ]
    const res = getCompactPaymentMethods({
      wallets,
      transactions: [],
      activeMethodId: 'bca',
    })
    assert.equal(res.compactMethods.length, 2)
    assert.equal(res.compactMethods[0].id, 'bca')
    assert.equal(res.compactMethods.filter((w) => w.id === 'bca').length, 1)
  }

  // Case 2: Zero wallets in system, editing transaction with method 'cash'
  {
    const res = getCompactPaymentMethods({
      wallets: [],
      transactions: [],
      activeMethodId: 'cash',
    })
    assert.equal(res.compactMethods.length, 1)
    assert.equal(res.compactMethods[0].id, 'cash')
    assert.equal(res.compactMethods[0].balance, 0)
    assert.equal(res.remainingMethods.length, 0)
  }

  // Case 3: Exactly 5 wallets, editing wallet #5 (already visible in compact)
  {
    const wallets = [
      { id: 'w1', label: 'W1', balance: 10 },
      { id: 'w2', label: 'W2', balance: 20 },
      { id: 'w3', label: 'W3', balance: 30 },
      { id: 'w4', label: 'W4', balance: 40 },
      { id: 'w5', label: 'W5', balance: 50 },
    ]
    const res = getCompactPaymentMethods({
      wallets,
      transactions: [],
      activeMethodId: 'w5',
    })
    assert.equal(res.compactMethods.length, 5)
    assert.ok(res.compactMethods.some((w) => w.id === 'w5'))
    assert.equal(res.compactMethods.filter((w) => w.id === 'w5').length, 1)
  }

  // Case 4: Exactly 6 wallets, editing wallet #6 (was in remaining, now pinned)
  {
    const wallets = [
      { id: 'w1', label: 'W1', balance: 10 },
      { id: 'w2', label: 'W2', balance: 20 },
      { id: 'w3', label: 'W3', balance: 30 },
      { id: 'w4', label: 'W4', balance: 40 },
      { id: 'w5', label: 'W5', balance: 50 },
      { id: 'w6', label: 'W6', balance: 60 },
    ]
    const res = getCompactPaymentMethods({
      wallets,
      transactions: [],
      activeMethodId: 'w6',
    })
    assert.equal(res.compactMethods.length, 5)
    assert.equal(res.compactMethods[0].id, 'w6', 'w6 pinned to top')
    assert.ok(!res.remainingMethods.some((w) => w.id === 'w6'))
    assert.equal(res.remainingMethods.length, 1)
    assert.equal(res.totalCount, 6)
  }

  // Case 5: Whitespace in activeMethodId
  {
    const wallets = [{ id: 'dana', label: 'DANA', balance: 15_000 }]
    const res = getCompactPaymentMethods({
      wallets,
      transactions: [],
      activeMethodId: '   dana   ',
    })
    assert.equal(res.compactMethods.length, 1)
    assert.equal(res.compactMethods[0].id, 'dana')
  }

  console.log('✓ Concrete edge cases passed.\n')
}

console.log('✅ Property 5 (Edit Mode Active Method Visibility) PASSED all invariants with >= 100 iterations each!\n')
