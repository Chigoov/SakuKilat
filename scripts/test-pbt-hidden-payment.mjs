/**
 * SakuKilat — Property-Based Test Suite for Hidden Payment Method Non-Destructive Isolation
 *
 * Feature: sakukilat-core-roadmap, Property 7: Hidden Payment Method Non-Destructive Isolation
 * Validates: Requirements 2.7
 *
 * Formal Property Statement:
 * For any payment method marked as hidden, the method SHALL be excluded from active selection
 * in new transaction forms, while all historical transactions previously assigned to that
 * method SHALL retain their original payment method reference unaltered.
 */

import assert from 'node:assert/strict'
import {
  fc,
  testProperty,
  MIN_PBT_RUNS,
  arbCalendarDate,
  arbRupiahAmount,
  arbCategory,
} from './pbt-harness.mjs'
import {
  getCompactPaymentMethods,
  calculatePaymentMethodStats,
} from '../lib/payment-ranking.ts'
import {
  persistState,
  loadPersistedState,
  CURRENT_SCHEMA_VERSION,
  STORAGE_KEY,
} from '../lib/storage.ts'

console.log('====================================================')
console.log('  SAKUKILAT — PBT: HIDDEN PAYMENT METHOD ISOLATION  ')
console.log('====================================================\n')

// In-memory mock storage conforming to StorageLike interface
function createMockStorage(initialData) {
  const store = new Map()
  if (initialData !== undefined) {
    store.set(STORAGE_KEY, initialData)
  }
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    keys: () => [...store.keys()],
    get length() {
      return store.size
    },
    key: (i) => [...store.keys()][i] ?? null,
  }
}

// Pool of realistic payment method identifiers
const WALLET_ID_POOL = [
  'tunai',
  'bca',
  'mandiri',
  'bni',
  'bri',
  'cimb',
  'jago',
  'seabank',
  'gopay',
  'ovo',
  'dana',
  'shopeepay',
  'linkaja',
  'jenius',
  'blu',
]

// Smart arbitrary generating wallets with unique IDs
const arbWallets = fc
  .uniqueArray(
    fc.record({
      id: fc.constantFrom(...WALLET_ID_POOL),
      label: fc.string({ minLength: 2, maxLength: 20 }),
      balance: arbRupiahAmount,
    }),
    { selector: (w) => w.id, minLength: 1, maxLength: 12 }
  )

// Smart generator for a test scenario containing wallets, hidden subset, transactions, and modes
const arbHiddenPaymentScenario = arbWallets.chain((wallets) => {
  const walletIds = wallets.map((w) => w.id)

  return fc.record({
    wallets: fc.constant(wallets),
    // Hidden IDs: random subset of active wallet IDs + occasional non-existent IDs
    hiddenPaymentIds: fc.tuple(
      fc.subarray(walletIds, { minLength: 0, maxLength: walletIds.length }),
      fc.array(fc.stringMatching(/^[a-z]{4,8}-custom$/), { minLength: 0, maxLength: 3 })
    ).map(([existingHidden, extraHidden]) => [...existingHidden, ...extraHidden]),
    // Transactions with payment methods picked from wallets or extra custom IDs
    transactions: fc.array(
      fc.record({
        id: fc.uuid(),
        description: fc.string({ minLength: 1, maxLength: 30 }),
        amount: arbRupiahAmount,
        type: fc.constantFrom('expense', 'income'),
        category: arbCategory,
        paymentMethod: fc.constantFrom(...walletIds, 'old-custom-wallet', 'cash-legacy'),
        date: arbCalendarDate,
      }),
      { minLength: 0, maxLength: 30 }
    ),
    isTransferMode: fc.boolean(),
  })
})

// ── Property 7: Hidden Payment Method Non-Destructive Isolation ─────────────────
// Validates: Requirements 2.7
{
  let totalEvaluated = 0
  let hiddenActiveCount = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 7: Hidden Payment Method Non-Destructive Isolation',
    fc.property(
      arbHiddenPaymentScenario,
      ({ wallets, hiddenPaymentIds, transactions, isTransferMode }) => {
        totalEvaluated++

        const hiddenSet = new Set(hiddenPaymentIds)
        const expectedActiveWallets = wallets.filter((w) => !hiddenSet.has(w.id))

        // Deep clone original transactions to detect any unintended in-place mutation
        const originalTxsSnapshot = transactions.map((tx) => ({
          ...tx,
          date: tx.date instanceof Date ? new Date(tx.date.getTime()) : tx.date,
        }))

        // Execute payment method ranking in new transaction entry mode (no activeMethodId)
        const result = getCompactPaymentMethods({
          wallets,
          transactions,
          hiddenPaymentIds,
          isTransferMode,
        })

        // ── INVARIANT 1: Hidden payment methods SHALL be excluded from active selection ──
        // 1.1: No item in compactMethods may be in hiddenPaymentIds
        for (const item of result.compactMethods) {
          assert.equal(
            hiddenSet.has(item.id),
            false,
            `Hidden payment method "${item.id}" must NOT appear in compactMethods`
          )
        }

        // 1.2: No item in remainingMethods may be in hiddenPaymentIds
        for (const item of result.remainingMethods) {
          assert.equal(
            hiddenSet.has(item.id),
            false,
            `Hidden payment method "${item.id}" must NOT appear in remainingMethods`
          )
        }

        // 1.3: Total count must exactly equal non-hidden active wallets
        assert.equal(
          result.totalCount,
          expectedActiveWallets.length,
          `Total available methods count must equal non-hidden wallets count (${expectedActiveWallets.length}), got ${result.totalCount}`
        )

        // 1.4: Transfer mode full eligibility without 5-item truncation for non-hidden wallets
        if (isTransferMode) {
          assert.equal(
            result.compactMethods.length,
            expectedActiveWallets.length,
            `In transfer mode, all non-hidden wallets must be returned in compactMethods`
          )
          assert.equal(
            result.remainingMethods.length,
            0,
            `In transfer mode, remainingMethods must be empty`
          )
        } else {
          // Standard mode: bounded to min(5, activeNonHiddenCount)
          assert.ok(
            result.compactMethods.length <= Math.min(5, expectedActiveWallets.length),
            `compactMethods length must not exceed min(5, activeNonHiddenCount)`
          )
        }

        // ── INVARIANT 2: Historical transactions SHALL retain original payment method reference unaltered ──
        // 2.1: Transaction count must remain identical
        assert.equal(
          transactions.length,
          originalTxsSnapshot.length,
          `Transaction array length must not change when payment methods are hidden`
        )

        // 2.2: Every transaction's paymentMethod must remain verbatim identical
        for (let i = 0; i < transactions.length; i++) {
          const current = transactions[i]
          const original = originalTxsSnapshot[i]

          assert.equal(
            current.paymentMethod,
            original.paymentMethod,
            `Historical transaction ${current.id} paymentMethod was altered from "${original.paymentMethod}" to "${current.paymentMethod}"`
          )
          assert.equal(
            current.amount,
            original.amount,
            `Historical transaction ${current.id} amount must remain unaltered`
          )
          assert.equal(
            current.id,
            original.id,
            `Historical transaction id must remain unaltered`
          )
        }

        if (hiddenPaymentIds.length > 0) {
          hiddenActiveCount++
        }

        return true
      }
    ),
    { numRuns: 150 }
  )

  assert.ok(
    totalEvaluated >= MIN_PBT_RUNS,
    `Expected at least ${MIN_PBT_RUNS} runs, evaluated ${totalEvaluated}`
  )
  assert.ok(
    hiddenActiveCount > 0,
    `Expected scenarios with active hidden payment methods, got ${hiddenActiveCount}`
  )
  console.log(`    Coverage: ${totalEvaluated} scenarios evaluated (${hiddenActiveCount} with active hidden methods).`)
}

// ── Property 7 (Sub-check A): Historical Transactions Retained Even When 100% of Methods Are Hidden ──
// Validates: Requirements 2.7
{
  let allHiddenRuns = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 7 (Sub-check A): Historical Transactions Retained When All Methods Hidden',
    fc.property(
      arbWallets,
      fc.array(
        fc.record({
          id: fc.uuid(),
          description: fc.string({ minLength: 1, maxLength: 25 }),
          amount: arbRupiahAmount,
          type: fc.constantFrom('expense', 'income'),
          category: arbCategory,
          paymentMethod: fc.constantFrom(...WALLET_ID_POOL),
          date: arbCalendarDate,
        }),
        { minLength: 1, maxLength: 20 }
      ),
      (wallets, transactions) => {
        allHiddenRuns++

        // Hide EVERY wallet in the system + all wallet IDs in the pool
        const allHiddenIds = Array.from(new Set([...wallets.map((w) => w.id), ...WALLET_ID_POOL]))

        const snapshot = transactions.map((t) => ({ ...t }))

        const result = getCompactPaymentMethods({
          wallets,
          transactions,
          hiddenPaymentIds: allHiddenIds,
        })

        // All active methods are hidden -> compact and remaining must be empty
        assert.equal(result.compactMethods.length, 0)
        assert.equal(result.remainingMethods.length, 0)
        assert.equal(result.totalCount, 0)

        // Historical transactions MUST remain 100% intact with their original paymentMethod strings
        assert.equal(transactions.length, snapshot.length)
        for (let i = 0; i < transactions.length; i++) {
          assert.equal(
            transactions[i].paymentMethod,
            snapshot[i].paymentMethod,
            `Historical transaction paymentMethod must not be altered even when all methods are hidden`
          )
        }

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(allHiddenRuns >= MIN_PBT_RUNS)
}

// ── Property 7 (Sub-check B): Edit Mode Active Method Visibility for Hidden Methods ────
// Validates: Requirements 2.5, 2.7
{
  let editRuns = 0

  const arbEditHiddenScenario = arbWallets.chain((wallets) => {
    const walletIds = wallets.map((w) => w.id)
    return fc.record({
      wallets: fc.constant(wallets),
      // Pick one wallet to be both hidden AND the active method being edited
      targetHiddenMethodId: fc.constantFrom(...walletIds),
      otherHiddenIds: fc.subarray(walletIds),
      transactions: fc.array(
        fc.record({
          id: fc.uuid(),
          amount: arbRupiahAmount,
          paymentMethod: fc.constantFrom(...walletIds),
          date: arbCalendarDate,
        }),
        { minLength: 0, maxLength: 10 }
      ),
    })
  })

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 7 (Sub-check B): Edit Mode Active Method Visibility for Hidden Methods',
    fc.property(
      arbEditHiddenScenario,
      ({ wallets, targetHiddenMethodId, otherHiddenIds, transactions }) => {
        editRuns++

        const hiddenPaymentIds = Array.from(new Set([targetHiddenMethodId, ...otherHiddenIds]))
        const otherHiddenSet = new Set(otherHiddenIds.filter((id) => id !== targetHiddenMethodId))

        // In edit mode: user is editing a historical transaction previously paid with targetHiddenMethodId
        const result = getCompactPaymentMethods({
          wallets,
          transactions,
          hiddenPaymentIds,
          activeMethodId: targetHiddenMethodId,
        })

        // Requirement 2.5 & 2.7: The target hidden method being edited MUST be visible in compactMethods
        assert.ok(
          result.compactMethods.some((m) => m.id === targetHiddenMethodId),
          `When editing a transaction with hidden method "${targetHiddenMethodId}", it must be pinned/visible in compactMethods`
        )

        // Other hidden methods must still be excluded
        for (const m of result.compactMethods) {
          if (m.id !== targetHiddenMethodId) {
            assert.equal(
              otherHiddenSet.has(m.id),
              false,
              `Other hidden method "${m.id}" must NOT leak into compactMethods`
            )
          }
        }
        for (const m of result.remainingMethods) {
          assert.equal(
            otherHiddenSet.has(m.id),
            false,
            `Other hidden method "${m.id}" must NOT leak into remainingMethods`
          )
        }

        // Compact list size is still strictly bounded to maximum 5 items
        assert.ok(
          result.compactMethods.length <= 5,
          `compactMethods length must not exceed 5 in edit mode, got ${result.compactMethods.length}`
        )

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(editRuns >= MIN_PBT_RUNS)
}

// ── Property 7 (Sub-check C): Storage Round-Trip Invariance with Hidden Payment Methods ──
// Validates: Requirements 2.7
{
  let storageRuns = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 7 (Sub-check C): Storage Round-Trip Invariance with Hidden Payment Methods',
    fc.property(
      arbWallets,
      fc.array(
        fc.record({
          id: fc.uuid(),
          description: fc.string({ minLength: 1, maxLength: 30 }),
          amount: arbRupiahAmount,
          type: fc.constantFrom('expense', 'income'),
          category: arbCategory,
          paymentMethod: fc.constantFrom(...WALLET_ID_POOL),
          date: arbCalendarDate,
        }),
        { minLength: 1, maxLength: 15 }
      ),
      fc.subarray(WALLET_ID_POOL, { minLength: 1, maxLength: 6 }),
      (wallets, transactions, hiddenPaymentIds) => {
        storageRuns++

        const mockStorage = createMockStorage()

        const stateToSave = {
          schemaVersion: CURRENT_SCHEMA_VERSION,
          transactions,
          wallets,
          monthlyBudget: 3500000,
          customPayments: [],
          customCategories: [],
          hiddenPaymentIds,
          hiddenCategoryIds: [],
        }

        // 1. Save state
        const saveOk = persistState(mockStorage, stateToSave, 'valid')
        assert.equal(saveOk, true, 'persistState must return true')

        // 2. Load state
        const loadResult = loadPersistedState(mockStorage)
        assert.equal(loadResult.status, 'valid')

        // 3. Verify hiddenPaymentIds round-tripped identically
        assert.deepEqual(
          loadResult.state.hiddenPaymentIds,
          hiddenPaymentIds,
          'hiddenPaymentIds must round-trip through storage intact'
        )

        // 4. Verify all transactions preserved their paymentMethod unaltered
        assert.equal(
          loadResult.state.transactions.length,
          transactions.length,
          'Transaction count must not change'
        )

        for (let i = 0; i < transactions.length; i++) {
          const originalTx = transactions[i]
          const loadedTx = loadResult.state.transactions[i]

          assert.equal(
            loadedTx.paymentMethod,
            originalTx.paymentMethod,
            `Transaction ${originalTx.id} paymentMethod must remain identical through storage round-trip`
          )
          assert.equal(
            loadedTx.amount,
            originalTx.amount,
            `Transaction ${originalTx.id} amount must remain identical`
          )
        }

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(storageRuns >= MIN_PBT_RUNS)
}

// ── Property 7 (Sub-check D): Dynamic Unhiding Restoration Invariance ──────────
// Validates: Requirements 2.7
{
  let restoreRuns = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 7 (Sub-check D): Dynamic Unhiding Restoration Invariance',
    fc.property(
      arbWallets.filter((w) => w.length >= 2),
      (wallets) => {
        restoreRuns++

        const targetWallet = wallets[0]
        const hiddenList = [targetWallet.id]

        // 1. When hidden: targetWallet must NOT be selectable
        const hiddenResult = getCompactPaymentMethods({
          wallets,
          transactions: [],
          hiddenPaymentIds: hiddenList,
        })
        assert.ok(
          !hiddenResult.compactMethods.some((w) => w.id === targetWallet.id),
          `Hidden wallet must not be in compactMethods`
        )
        assert.ok(
          !hiddenResult.remainingMethods.some((w) => w.id === targetWallet.id),
          `Hidden wallet must not be in remainingMethods`
        )

        // 2. When restored (unhidden): targetWallet must reappear in either compact or remaining
        const restoredResult = getCompactPaymentMethods({
          wallets,
          transactions: [],
          hiddenPaymentIds: [], // restored
        })
        const allRestoredIds = [
          ...restoredResult.compactMethods.map((w) => w.id),
          ...restoredResult.remainingMethods.map((w) => w.id),
        ]
        assert.ok(
          allRestoredIds.includes(targetWallet.id),
          `Restored wallet "${targetWallet.id}" must be available in active selection`
        )
        assert.equal(
          restoredResult.totalCount,
          wallets.length,
          `Restoring wallet must increase totalCount back to full active wallets count`
        )

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(restoreRuns >= MIN_PBT_RUNS)
}

// ── Concrete Edge Cases Verification ──────────────────────────────────────────
{
  console.log('Validating concrete edge cases for hidden payment method isolation...')

  const sampleWallets = [
    { id: 'tunai', label: 'Tunai', balance: 500_000 },
    { id: 'bca', label: 'BCA', balance: 2_000_000 },
    { id: 'gopay', label: 'GoPay', balance: 100_000 },
    { id: 'dana', label: 'DANA', balance: 50_000 },
  ]

  const sampleHistory = [
    { id: 'tx-1', paymentMethod: 'bca', amount: 50_000, date: '2026-09-01T10:00:00' },
    { id: 'tx-2', paymentMethod: 'gopay', amount: 25_000, date: '2026-09-02T10:00:00' },
    { id: 'tx-3', paymentMethod: 'bca', amount: 15_000, date: '2026-09-03T10:00:00' },
  ]

  // Edge Case 1: BCA is the most frequently and recently used method, but is now hidden
  const bcaHiddenResult = getCompactPaymentMethods({
    wallets: sampleWallets,
    transactions: sampleHistory,
    hiddenPaymentIds: ['bca'],
  })
  assert.ok(!bcaHiddenResult.compactMethods.some((m) => m.id === 'bca'), 'BCA must be excluded from compactMethods')
  assert.ok(!bcaHiddenResult.remainingMethods.some((m) => m.id === 'bca'), 'BCA must be excluded from remainingMethods')
  // GoPay (next most frequent/recent) must be promoted to first position
  assert.equal(bcaHiddenResult.compactMethods[0].id, 'gopay', 'GoPay must be promoted when BCA is hidden')
  assert.equal(sampleHistory[0].paymentMethod, 'bca', 'Historical tx-1 still references BCA')
  assert.equal(sampleHistory[2].paymentMethod, 'bca', 'Historical tx-3 still references BCA')

  // Edge Case 2: Editing historical transaction tx-1 that used BCA
  const editBcaResult = getCompactPaymentMethods({
    wallets: sampleWallets,
    transactions: sampleHistory,
    hiddenPaymentIds: ['bca'],
    activeMethodId: 'bca',
  })
  assert.equal(editBcaResult.compactMethods[0].id, 'bca', 'BCA must be pinned to index 0 in edit mode')
  assert.equal(editBcaResult.compactMethods.length, 4, 'All 4 visible (1 pinned + 3 non-hidden)')

  // Edge Case 3: Empty hiddenPaymentIds does not filter anything
  const noHiddenResult = getCompactPaymentMethods({
    wallets: sampleWallets,
    transactions: sampleHistory,
    hiddenPaymentIds: [],
  })
  assert.equal(noHiddenResult.totalCount, 4)

  // Edge Case 4: Non-existent IDs in hiddenPaymentIds do not break ranking
  const bogusHiddenResult = getCompactPaymentMethods({
    wallets: sampleWallets,
    transactions: sampleHistory,
    hiddenPaymentIds: ['non-existent-bank', 'crypto-wallet'],
  })
  assert.equal(bogusHiddenResult.totalCount, 4)

  console.log('✓ Concrete edge cases verified successfully.')
}

console.log('\n✅ Property 7 PBT for Hidden Payment Method Non-Destructive Isolation PASSED! (>= 100 iterations verified)\n')
