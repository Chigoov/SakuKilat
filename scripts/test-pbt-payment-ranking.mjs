/**
 * SakuKilat — Property-Based Test Suite for Phase P2: Compact Payment Method Selector
 *
 * Feature: sakukilat-core-roadmap, Property 4: Compact Payment Method Ranking and Sizing Bound
 * Validates: Requirements 2.1, 2.2, 2.3
 *
 * For any set of active wallets and any arbitrary transaction history, the generated
 * compact payment method list SHALL contain at most 5 items (or min(5, activeWallets.length)),
 * and SHALL include the union of the top 3 most frequently used and top 3 most recently
 * used methods from history, filling any remaining slots from available active wallets.
 */

import assert from 'node:assert/strict'
import {
  fc,
  testProperty,
  MIN_PBT_RUNS,
  arbCalendarDate,
  arbRupiahAmount,
} from './pbt-harness.mjs'
import {
  getCompactPaymentMethods,
  parseDateTimestamp,
} from '../lib/payment-ranking.ts'

console.log('====================================================')
console.log('  SAKUKILAT — PBT: COMPACT PAYMENT METHOD RANKING   ')
console.log('====================================================\n')

// Pool of known wallet IDs for generating rich transaction histories
const WALLET_POOL = [
  'tunai',
  'bca',
  'mandiri',
  'bni',
  'bri',
  'cimb',
  'gopay',
  'ovo',
  'dana',
  'shopeepay',
  'seabank',
  'jago',
  'jenius',
  'tabungan',
]

/**
 * Independent Specification Oracle:
 * Computes the expected compact payment methods following Requirements 2.1, 2.2, 2.3 strictly.
 */
function computeExpectedRanking(wallets, transactions, hiddenPaymentIds = []) {
  const hiddenSet = new Set((hiddenPaymentIds ?? []).filter(Boolean))

  // 1. Extract active non-hidden unique wallets preserving order
  const activeWallets = []
  const seenIds = new Set()
  for (const w of wallets ?? []) {
    if (!w || !w.id || hiddenSet.has(w.id) || seenIds.has(w.id)) continue
    seenIds.add(w.id)
    activeWallets.push({
      ...w,
      id: w.id,
      label: w.label || w.id,
      balance: typeof w.balance === 'number' ? w.balance : 0,
    })
  }

  // 2. Calculate usage frequency and last-used timestamp per method
  const statsMap = new Map()
  for (const tx of transactions ?? []) {
    if (!tx || !tx.paymentMethod) continue
    const methodId = tx.paymentMethod
    const ts = parseDateTimestamp(tx.date)
    const existing = statsMap.get(methodId)
    if (existing) {
      existing.frequency += 1
      if (ts > existing.lastUsedTimestamp) {
        existing.lastUsedTimestamp = ts
      }
    } else {
      statsMap.set(methodId, { frequency: 1, lastUsedTimestamp: ts })
    }
  }

  const activeWalletIndexMap = new Map(activeWallets.map((w, idx) => [w.id, idx]))
  const usedWallets = activeWallets.filter(w => (statsMap.get(w.id)?.frequency ?? 0) > 0)

  // 3. Top 3 most frequently used
  const byFreq = [...usedWallets].sort((a, b) => {
    const fA = statsMap.get(a.id)?.frequency ?? 0
    const fB = statsMap.get(b.id)?.frequency ?? 0
    if (fB !== fA) return fB - fA
    const rA = statsMap.get(a.id)?.lastUsedTimestamp ?? 0
    const rB = statsMap.get(b.id)?.lastUsedTimestamp ?? 0
    if (rB !== rA) return rB - rA
    return (activeWalletIndexMap.get(a.id) ?? 0) - (activeWalletIndexMap.get(b.id) ?? 0)
  })
  const top3Frequent = byFreq.slice(0, 3)

  // 4. Top 3 most recently used
  const byRec = [...usedWallets].sort((a, b) => {
    const rA = statsMap.get(a.id)?.lastUsedTimestamp ?? 0
    const rB = statsMap.get(b.id)?.lastUsedTimestamp ?? 0
    if (rB !== rA) return rB - rA
    const fA = statsMap.get(a.id)?.frequency ?? 0
    const fB = statsMap.get(b.id)?.frequency ?? 0
    if (fB !== fA) return fB - fA
    return (activeWalletIndexMap.get(a.id) ?? 0) - (activeWalletIndexMap.get(b.id) ?? 0)
  })
  const top3Recent = byRec.slice(0, 3)

  // 5. Deduplicated union, sorted by recency first then frequency
  const unionMap = new Map()
  for (const w of top3Recent) unionMap.set(w.id, w)
  for (const w of top3Frequent) unionMap.set(w.id, w)

  const unionList = Array.from(unionMap.values()).sort((a, b) => {
    const rA = statsMap.get(a.id)?.lastUsedTimestamp ?? 0
    const rB = statsMap.get(b.id)?.lastUsedTimestamp ?? 0
    if (rB !== rA) return rB - rA
    const fA = statsMap.get(a.id)?.frequency ?? 0
    const fB = statsMap.get(b.id)?.frequency ?? 0
    if (fB !== fA) return fB - fA
    return (activeWalletIndexMap.get(a.id) ?? 0) - (activeWalletIndexMap.get(b.id) ?? 0)
  })

  // 6. Sizing bound: maximum 5 items
  const compactList = unionList.slice(0, 5)
  const compactIdSet = new Set(compactList.map(w => w.id))

  // 7. Populate remaining slots from default active wallets in order
  for (const w of activeWallets) {
    if (compactList.length >= 5) break
    if (!compactIdSet.has(w.id)) {
      compactList.push(w)
      compactIdSet.add(w.id)
    }
  }

  const finalCompactIdSet = new Set(compactList.map(w => w.id))
  const remainingMethods = activeWallets.filter(w => !finalCompactIdSet.has(w.id))

  return {
    compactMethods: compactList,
    remainingMethods,
    activeWallets,
    unionList,
    top3Frequent,
    top3Recent,
    statsMap,
  }
}

// Arbitrary transaction generator with varied date representations
const arbTransaction = fc.record({
  paymentMethod: fc.constantFrom(
    ...WALLET_POOL,
    'external_unknown_1',
    'external_unknown_2'
  ),
  date: fc.oneof(
    arbCalendarDate,
    fc.integer({ min: 1577836800000, max: 2051222400000 }), // ms timestamps
    fc.constantFrom(
      '2026-09-01T08:00:00Z',
      '2026-09-02T12:30:00Z',
      '2026-09-03T18:45:00Z',
      '2026-09-04T10:15:00Z',
      '2026-09-05T14:20:00Z',
      '2026-09-06T20:00:00Z'
    )
  ),
})

// Arbitrary general scenario generator
const arbPaymentRankingScenario = fc
  .tuple(
    fc.shuffledSubarray(WALLET_POOL, { minLength: 0, maxLength: 14 }),
    fc.array(arbTransaction, { minLength: 0, maxLength: 60 }),
    fc.subarray(WALLET_POOL, { minLength: 0, maxLength: 4 })
  )
  .map(([walletIds, transactions, hiddenPaymentIds]) => {
    const wallets = walletIds.map((id, index) => ({
      id,
      label: `Dompet ${id.toUpperCase()}`,
      balance: (index + 1) * 150_000,
    }))
    return { wallets, transactions, hiddenPaymentIds }
  })

// ── Property 4: Compact Payment Method Ranking and Sizing Bound ───────────────
// Validates: Requirements 2.1, 2.2, 2.3
{
  let totalEvaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 4: Compact Payment Method Ranking and Sizing Bound',
    fc.property(arbPaymentRankingScenario, ({ wallets, transactions, hiddenPaymentIds }) => {
      totalEvaluated++

      const result = getCompactPaymentMethods({
        wallets,
        transactions,
        hiddenPaymentIds,
      })

      const expected = computeExpectedRanking(wallets, transactions, hiddenPaymentIds)
      const activeCount = expected.activeWallets.length
      const compactCount = result.compactMethods.length
      const remainingCount = result.remainingMethods.length

      // 1. Sizing Bound Invariants (Requirement 2.2)
      // The compact view SHALL contain at most 5 items (or min(5, activeWallets.length))
      assert.ok(
        compactCount <= 5,
        `Compact methods count ${compactCount} exceeds maximum bound of 5`
      )
      assert.equal(
        compactCount,
        Math.min(5, activeCount),
        `Compact methods count must equal min(5, ${activeCount}), got ${compactCount}`
      )
      assert.equal(
        result.totalCount,
        activeCount,
        `totalCount must equal active wallets count (${activeCount}), got ${result.totalCount}`
      )
      assert.equal(
        remainingCount,
        Math.max(0, activeCount - 5),
        `remainingMethods count must equal max(0, ${activeCount} - 5), got ${remainingCount}`
      )
      assert.equal(
        compactCount + remainingCount,
        activeCount,
        `Sum of compact and remaining items must equal total active wallets count`
      )

      // 2. Partition & Uniqueness Invariants
      const compactIds = result.compactMethods.map(m => m.id)
      const remainingIds = result.remainingMethods.map(m => m.id)

      assert.equal(
        new Set(compactIds).size,
        compactIds.length,
        'Compact methods must contain no duplicate IDs'
      )
      assert.equal(
        new Set(remainingIds).size,
        remainingIds.length,
        'Remaining methods must contain no duplicate IDs'
      )

      // Intersection must be strictly empty
      const intersection = compactIds.filter(id => remainingIds.includes(id))
      assert.equal(
        intersection.length,
        0,
        `Compact and remaining methods must be disjoint, found overlap: ${JSON.stringify(intersection)}`
      )

      // Union of IDs must match activeWallets exactly
      const activeIds = expected.activeWallets.map(w => w.id)
      const combinedIds = [...compactIds, ...remainingIds]
      assert.deepEqual(
        new Set(combinedIds),
        new Set(activeIds),
        'Combined compact and remaining methods must match all active non-hidden wallets'
      )

      // 3. Hidden Payment Method Non-Destructive Isolation (Requirement 2.7)
      for (const hiddenId of hiddenPaymentIds ?? []) {
        assert.ok(
          !compactIds.includes(hiddenId),
          `Hidden payment method "${hiddenId}" must not be in compactMethods`
        )
        assert.ok(
          !remainingIds.includes(hiddenId),
          `Hidden payment method "${hiddenId}" must not be in remainingMethods`
        )
      }

      // 4. Ranking and Inclusion Invariant (Requirements 2.1, 2.2, 2.3)
      // The compact list must contain the union of top 3 frequent and top 3 recent (up to 5 items)
      if (expected.unionList.length <= 5) {
        for (const uItem of expected.unionList) {
          assert.ok(
            compactIds.includes(uItem.id),
            `Union item "${uItem.id}" must be included in compact methods when union <= 5`
          )
        }
      } else {
        // When union has 6 items, compact methods must contain the top 5 of the union
        const expectedTop5UnionIds = expected.unionList.slice(0, 5).map(u => u.id)
        assert.deepEqual(
          compactIds,
          expectedTop5UnionIds,
          `When union > 5, compact methods must match top 5 of union sorted by recency then frequency`
        )
      }

      // 5. Fallback Filling Order (Requirement 2.3)
      // Where history contains fewer than 5 unique payment methods, populate remaining slots from default active methods
      assert.deepEqual(
        compactIds,
        expected.compactMethods.map(m => m.id),
        'Compact methods ordering must match heuristic ranking specification'
      )
      assert.deepEqual(
        remainingIds,
        expected.remainingMethods.map(m => m.id),
        'Remaining methods ordering must match default active wallet order'
      )

      // 6. Attribute Preservation
      for (const m of result.compactMethods) {
        const orig = expected.activeWallets.find(w => w.id === m.id)
        assert.ok(orig !== undefined, `Compact item "${m.id}" must exist in activeWallets`)
        assert.equal(m.label, orig.label, `Label mismatch for wallet "${m.id}"`)
        assert.equal(m.balance, orig.balance, `Balance mismatch for wallet "${m.id}"`)
      }

      return true
    }),
    { numRuns: 200 }
  )

  assert.ok(
    totalEvaluated >= MIN_PBT_RUNS,
    `Expected at least ${MIN_PBT_RUNS} iterations, evaluated ${totalEvaluated}`
  )
}

// ── Property 4 (Sub-check A): Fallback Filling from Default Active Wallets ─────
// Validates: Requirement 2.3
// WHERE the transaction history contains fewer than five unique payment methods,
// THE Payment_Method_Selector SHALL populate the remaining compact slots using system default active methods.
{
  let fallbackEvaluated = 0

  const arbSparseHistoryScenario = fc
    .tuple(
      // At least 5 active wallets
      fc.shuffledSubarray(WALLET_POOL, { minLength: 5, maxLength: 10 }),
      // Number of wallets to use in history: 0 to 4 (strictly fewer than 5)
      fc.integer({ min: 0, max: 4 })
    )
    .chain(([walletIds, usedCount]) => {
      const wallets = walletIds.map((id, idx) => ({
        id,
        label: `Dompet ${id.toUpperCase()}`,
        balance: 100_000 * (idx + 1),
      }))

      const targetUsedIds = walletIds.slice(0, usedCount)
      const arbTxs = targetUsedIds.length === 0
        ? fc.constant([])
        : fc.array(
            fc.record({
              paymentMethod: fc.constantFrom(...targetUsedIds),
              date: arbCalendarDate,
            }),
            { minLength: targetUsedIds.length, maxLength: 20 }
          )

      return fc.tuple(fc.constant(wallets), arbTxs, fc.constant(targetUsedIds))
    })

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 4 (Sub-check A): Fallback Filling from Default Active Wallets',
    fc.property(arbSparseHistoryScenario, ([wallets, transactions, targetUsedIds]) => {
      fallbackEvaluated++

      const result = getCompactPaymentMethods({
        wallets,
        transactions,
      })

      assert.equal(
        result.compactMethods.length,
        5,
        'Compact list must always be filled to exactly 5 items when wallets >= 5'
      )

      const compactIds = result.compactMethods.map(m => m.id)

      // All wallets actually used in transactions must be present in compactMethods
      for (const usedId of targetUsedIds) {
        // If it was used in transactions, verify it's in compactMethods
        const wasUsed = transactions.some(t => t.paymentMethod === usedId)
        if (wasUsed) {
          assert.ok(
            compactIds.includes(usedId),
            `Used wallet "${usedId}" must be present in compact methods`
          )
        }
      }

      // The remaining slots must be filled from the unused active wallets in their default order
      const expected = computeExpectedRanking(wallets, transactions)
      assert.deepEqual(
        compactIds,
        expected.compactMethods.map(m => m.id),
        'Remaining compact slots must be filled from default active wallets in order'
      )

      return true
    }),
    { numRuns: 100 }
  )

  assert.ok(fallbackEvaluated >= MIN_PBT_RUNS)
}

// ── Property 4 (Sub-check B): Saturated History Ranking and 5-Item Truncation Bound
// Validates: Requirements 2.1, 2.2
// WHEN rendering payment options in transaction forms, rank by combining top 3 frequent + top 3 recent,
// and display a maximum of five payment methods in compact view.
{
  let saturatedEvaluated = 0

  // 6 distinct wallets in history competing for top 3 frequency and recency
  const arbSaturatedScenario = fc
    .shuffledSubarray(WALLET_POOL, { minLength: 6, maxLength: 8 })
    .chain(walletIds => {
      const wallets = walletIds.map((id, idx) => ({
        id,
        label: `Dompet ${id.toUpperCase()}`,
        balance: 50_000 * (idx + 1),
      }))

      // Create transactions where each of the first 6 wallets has distinct frequency and recency
      // Wallet 0 to 5: frequencies 1 to 20, timestamps spaced out
      const arbTxs = fc.tuple(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 6, max: 10 }),
        fc.integer({ min: 11, max: 15 }),
        fc.integer({ min: 16, max: 20 }),
        fc.integer({ min: 21, max: 25 }),
        fc.integer({ min: 26, max: 30 })
      ).map(([f0, f1, f2, f3, f4, f5]) => {
        const freqs = [f0, f1, f2, f3, f4, f5]
        const txs = []
        const baseTs = 1757000000000 // Fixed base timestamp ms

        for (let i = 0; i < 6; i++) {
          const wId = walletIds[i]
          const count = freqs[i]
          for (let j = 0; j < count; j++) {
            // Give wallet i a distinct timestamp spaced by days and minutes
            const txDate = new Date(baseTs + i * 86400000 + j * 60000)
            txs.push({ paymentMethod: wId, date: txDate })
          }
        }
        return txs
      })

      return fc.tuple(fc.constant(wallets), arbTxs)
    })

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 4 (Sub-check B): Saturated History Ranking and 5-Item Truncation Bound',
    fc.property(arbSaturatedScenario, ([wallets, transactions]) => {
      saturatedEvaluated++

      const result = getCompactPaymentMethods({
        wallets,
        transactions,
      })

      // Must be strictly bounded to 5 items despite 6+ candidates
      assert.equal(
        result.compactMethods.length,
        5,
        `Compact methods count must be strictly 5, got ${result.compactMethods.length}`
      )

      assert.equal(
        result.remainingMethods.length,
        wallets.length - 5,
        `Remaining methods count must equal ${wallets.length - 5}`
      )

      const expected = computeExpectedRanking(wallets, transactions)
      assert.deepEqual(
        result.compactMethods.map(m => m.id),
        expected.compactMethods.map(m => m.id),
        'Compact methods must match top 5 of heuristic ranking'
      )

      return true
    }),
    { numRuns: 100 }
  )

  assert.ok(saturatedEvaluated >= MIN_PBT_RUNS)
}

// ── Property 4 (Sub-check C): Small Active Wallet Sets (count < 5) ─────────────
// Validates: Requirement 2.2
// Sizing bound correctly scales when total active wallets < 5
{
  let smallSetEvaluated = 0

  const arbSmallWalletScenario = fc
    .integer({ min: 0, max: 4 })
    .chain(count => {
      const selectedIds = WALLET_POOL.slice(0, count)
      const wallets = selectedIds.map((id, idx) => ({
        id,
        label: `Dompet ${id.toUpperCase()}`,
        balance: 100_000 * (idx + 1),
      }))

      const arbTxs = count === 0
        ? fc.constant([])
        : fc.array(
            fc.record({
              paymentMethod: fc.constantFrom(...selectedIds, 'other'),
              date: arbCalendarDate,
            }),
            { minLength: 0, maxLength: 15 }
          )

      return fc.tuple(fc.constant(wallets), arbTxs, fc.constant(count))
    })

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 4 (Sub-check C): Small Active Wallet Sets (count < 5)',
    fc.property(arbSmallWalletScenario, ([wallets, transactions, count]) => {
      smallSetEvaluated++

      const result = getCompactPaymentMethods({
        wallets,
        transactions,
      })

      assert.equal(
        result.compactMethods.length,
        count,
        `When active wallets count is ${count}, compact methods must be ${count}`
      )
      assert.equal(
        result.remainingMethods.length,
        0,
        `When active wallets count is ${count} (< 5), remaining methods must be 0`
      )
      assert.equal(
        result.totalCount,
        count,
        `totalCount must equal ${count}`
      )

      return true
    }),
    { numRuns: 100 }
  )

  assert.ok(smallSetEvaluated >= MIN_PBT_RUNS)
}

console.log('\n✅ Property 4 PBT for Compact Payment Method Ranking and Sizing Bound PASSED! (>= 100 iterations verified)\n')
