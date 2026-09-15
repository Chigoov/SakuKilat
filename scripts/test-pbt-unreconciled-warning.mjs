/**
 * SakuKilat — Property-Based Test Suite for Unreconciled Wallet Warning Indicator
 *
 * Feature: sakukilat-core-roadmap, Property 19: Unreconciled Wallet Warning Indicator
 * Validates: Requirements 6.6
 *
 * Property 19 Specification:
 * For any wallet W, an unreconciled warning badge SHALL be displayed if and only if
 * W.lastReconciledAt is undefined or W has zero reconciliation records.
 */

import assert from 'node:assert/strict'
import {
  fc,
  testProperty,
  MIN_PBT_RUNS,
  arbRupiahAmount,
  arbCalendarDate,
} from './pbt-harness.mjs'
import {
  hasNeverBeenReconciled,
  createReconciliationRecord,
  ReconciliationManager,
} from '../lib/reconciliation.ts'

console.log('=================================================================')
console.log('  SAKUKILAT — PBT: UNRECONCILED WALLET WARNING INDICATOR (PROP 19)')
console.log('=================================================================\n')

// ── Arbitrary Generators ──────────────────────────────────────────────────

// Standard payment method / wallet IDs
const arbKnownWalletId = fc.constantFrom(
  'cash',
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
  'shopeepay'
)

// Dynamic wallet ID generator (alphanumeric slugs)
const arbCustomWalletId = fc.stringMatching(/^[a-z0-9_-]{3,12}$/)

const arbWalletId = fc.oneof(arbKnownWalletId, arbCustomWalletId)

const arbWalletType = fc.constantFrom(
  'ewallet',
  'bank',
  'cash',
  'savings',
  'card',
  'other'
)

// Arbitrary ISO timestamp string
const arbIsoDateString = arbCalendarDate.map((d) => d.toISOString())

// Arbitrary single reconciliation record
const arbReconciliationRecord = fc.record({
  id: fc.uuid().map((u) => `recon-${u.slice(0, 8)}`),
  walletId: arbWalletId,
  expectedBalance: arbRupiahAmount,
  actualBalance: arbRupiahAmount,
  difference: fc.integer({ min: -10_000_000, max: 10_000_000 }),
  reconciledAt: arbIsoDateString,
  note: fc.option(fc.string({ maxLength: 30 }), { nil: undefined }),
})

// Arbitrary wallet object
const arbWallet = fc.record({
  id: arbWalletId,
  label: fc.string({ minLength: 2, maxLength: 20 }),
  type: arbWalletType,
  balance: arbRupiahAmount,
  keywords: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 3 }),
  lastReconciledAt: fc.option(arbIsoDateString, { nil: undefined }),
})

// ── Feature: sakukilat-core-roadmap, Property 19: Unreconciled Wallet Warning Indicator ──
// Validates: Requirements 6.6
{
  let runCount = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 19: Unreconciled Wallet Warning Indicator',
    fc.property(
      arbWallet,
      fc.array(arbReconciliationRecord, { minLength: 0, maxLength: 25 }),
      (wallet, reconciliations) => {
        runCount++

        // 1. Evaluate unreconciled status via direct function
        const isUnreconciled = hasNeverBeenReconciled(wallet, reconciliations)

        // 2. Evaluate consistency with ReconciliationManager namespace
        const mgrResult = ReconciliationManager.hasNeverBeenReconciled(wallet, reconciliations)
        assert.equal(
          mgrResult,
          isUnreconciled,
          'ReconciliationManager.hasNeverBeenReconciled must match direct function output'
        )

        // 3. Ground Truth Invariant (Property 19 Formal Definition):
        // An unreconciled warning badge SHALL be displayed if and only if
        // wallet.lastReconciledAt is undefined (or falsy) OR wallet has zero reconciliation records.
        const hasValidTimestamp = typeof wallet.lastReconciledAt === 'string' && wallet.lastReconciledAt.trim().length > 0
        const matchingRecordsCount = reconciliations.filter((r) => r.walletId === wallet.id).length
        const hasZeroRecords = matchingRecordsCount === 0

        const expectedWarning = !hasValidTimestamp || hasZeroRecords

        assert.equal(
          isUnreconciled,
          expectedWarning,
          `Property 19 Invariant Violation for wallet "${wallet.id}": ` +
            `hasValidTimestamp=${hasValidTimestamp}, matchingRecordsCount=${matchingRecordsCount}. ` +
            `Expected unreconciled=${expectedWarning}, got ${isUnreconciled}`
        )

        // 4. Bi-directional logical implications:
        // A. If wallet has never been reconciled (isUnreconciled === true),
        // then it MUST either lack a valid timestamp OR have zero matching reconciliation records.
        if (isUnreconciled) {
          assert.ok(
            !hasValidTimestamp || hasZeroRecords,
            `Unreconciled wallet must either have missing timestamp or zero records`
          )
        }

        // B. If wallet IS reconciled (isUnreconciled === false),
        // then it MUST have a valid timestamp AND at least one matching reconciliation record.
        if (!isUnreconciled) {
          assert.equal(
            hasValidTimestamp,
            true,
            `Reconciled wallet must have valid lastReconciledAt timestamp`
          )
          assert.ok(
            matchingRecordsCount >= 1,
            `Reconciled wallet must have at least 1 matching reconciliation record, found ${matchingRecordsCount}`
          )
        }

        return true
      }
    ),
    { numRuns: 150 }
  )

  assert.ok(
    runCount >= MIN_PBT_RUNS,
    `Expected at least ${MIN_PBT_RUNS} iterations, evaluated ${runCount}`
  )
  console.log(`  ✓ Main Property 19 verified with ${runCount} iterations.\n`)
}

// ── Feature: sakukilat-core-roadmap, Property 19 (Sub-check A): Wallet Collection Partitioning and Count Invariant ──
// Validates: Requirements 6.6
{
  let partitionCount = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 19 (Sub-check A): Wallet Collection Partitioning and Count Invariant',
    fc.property(
      fc.array(arbWallet, { minLength: 1, maxLength: 15 }),
      fc.array(arbReconciliationRecord, { minLength: 0, maxLength: 30 }),
      (rawWallets, reconciliations) => {
        partitionCount++

        // Ensure unique wallet IDs in the test collection
        const seen = new Set()
        const wallets = rawWallets.filter((w) => {
          if (seen.has(w.id)) return false
          seen.add(w.id)
          return true
        })

        // Partition wallets into unreconciled vs reconciled
        const unreconciledWallets = wallets.filter((w) => hasNeverBeenReconciled(w, reconciliations))
        const reconciledWallets = wallets.filter((w) => !hasNeverBeenReconciled(w, reconciliations))

        // 1. Disjoint Union Invariant: unreconciled + reconciled === total wallets
        assert.equal(
          unreconciledWallets.length + reconciledWallets.length,
          wallets.length,
          'Partition must be exact: sum of unreconciled and reconciled must equal total wallets'
        )

        // 2. Disjoint Intersection Invariant: no wallet can be in both sets
        const unreconciledIds = new Set(unreconciledWallets.map((w) => w.id))
        for (const rw of reconciledWallets) {
          assert.equal(
            unreconciledIds.has(rw.id),
            false,
            `Wallet ${rw.id} cannot be simultaneously reconciled and unreconciled`
          )
        }

        // 3. Tab Saku Badge Count Invariant:
        // The unreconciled badge count displayed in Tab Saku header matches unreconciledWallets.length
        const calculatedUnreconciledCount = wallets.reduce(
          (acc, w) => acc + (hasNeverBeenReconciled(w, reconciliations) ? 1 : 0),
          0
        )
        assert.equal(
          unreconciledWallets.length,
          calculatedUnreconciledCount,
          'Unreconciled count reduction must equal filtered length'
        )

        // 4. Verification of set properties
        for (const uw of unreconciledWallets) {
          const hasTimestamp = typeof uw.lastReconciledAt === 'string' && uw.lastReconciledAt.trim().length > 0
          const recordCount = reconciliations.filter((r) => r.walletId === uw.id).length
          assert.ok(
            !hasTimestamp || recordCount === 0,
            `Unreconciled wallet ${uw.id} must lack timestamp or have 0 records`
          )
        }

        for (const rw of reconciledWallets) {
          const hasTimestamp = typeof rw.lastReconciledAt === 'string' && rw.lastReconciledAt.trim().length > 0
          const recordCount = reconciliations.filter((r) => r.walletId === rw.id).length
          assert.ok(
            hasTimestamp && recordCount > 0,
            `Reconciled wallet ${rw.id} must have both valid timestamp and at least 1 record`
          )
        }

        return true
      }
    ),
    { numRuns: 120 }
  )

  assert.ok(partitionCount >= MIN_PBT_RUNS)
  console.log(`    Sub-check A verified with ${partitionCount} runs across wallet collections.`)
}

// ── Feature: sakukilat-core-roadmap, Property 19 (Sub-check B): Post-Reconciliation State Transition and Warning Dismissal ──
// Validates: Requirements 6.6
{
  let transitionCount = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 19 (Sub-check B): Post-Reconciliation State Transition and Warning Dismissal',
    fc.property(
      arbWallet,
      fc.array(arbReconciliationRecord, { minLength: 0, maxLength: 20 }),
      arbRupiahAmount,
      arbCalendarDate,
      fc.option(fc.string({ maxLength: 40 }), { nil: undefined }),
      (wallet, existingRecords, actualCountedBalance, reconciliationDate, note) => {
        transitionCount++

        // Filter out any existing records that coincidentally matched wallet.id
        // to guarantee an initially UNRECONCILED state
        const sanitizedRecords = existingRecords.filter((r) => r.walletId !== wallet.id)
        const unreconciledWallet = {
          ...wallet,
          lastReconciledAt: undefined, // Force brand new / unreconciled state
        }

        // 1. Initial State: Must be unreconciled (warning badge shown)
        const initialStatus = hasNeverBeenReconciled(unreconciledWallet, sanitizedRecords)
        assert.equal(
          initialStatus,
          true,
          'Wallet with undefined lastReconciledAt and zero records MUST be unreconciled'
        )

        // 2. Perform reconciliation action via createReconciliationRecord
        const reconRecord = createReconciliationRecord({
          walletId: unreconciledWallet.id,
          expectedBalance: unreconciledWallet.balance,
          actualBalance: actualCountedBalance,
          note,
          reconciledAt: reconciliationDate,
        })

        // 3. Apply state changes (as performed in useWalletStore.reconcileWallet)
        const updatedWallet = {
          ...unreconciledWallet,
          balance: actualCountedBalance,
          lastReconciledAt: reconRecord.reconciledAt,
        }
        const updatedReconciliations = [reconRecord, ...sanitizedRecords]

        // 4. Post-Reconciliation Invariant:
        // Warning badge MUST now be dismissed (hasNeverBeenReconciled becomes false)
        const postStatus = hasNeverBeenReconciled(updatedWallet, updatedReconciliations)
        assert.equal(
          postStatus,
          false,
          'Wallet MUST be recognized as reconciled immediately after reconciliation record is committed'
        )

        // 5. Frame Condition / Isolation Invariant:
        // Reconciling this wallet MUST NOT alter the reconciliation status of any OTHER wallet
        const otherWallet = {
          id: `other-${wallet.id}-xyz`,
          label: 'Other Wallet',
          type: 'bank',
          balance: 100_000,
          lastReconciledAt: undefined,
        }
        const otherBefore = hasNeverBeenReconciled(otherWallet, sanitizedRecords)
        const otherAfter = hasNeverBeenReconciled(otherWallet, updatedReconciliations)
        assert.equal(
          otherBefore,
          otherAfter,
          'Reconciling one wallet must never alter the unreconciled status of any other wallet'
        )

        return true
      }
    ),
    { numRuns: 120 }
  )

  assert.ok(transitionCount >= MIN_PBT_RUNS)
  console.log(`    Sub-check B verified with ${transitionCount} runs for state transitions.`)
}

// ── Feature: sakukilat-core-roadmap, Property 19 (Sub-check C): Fallback Behavior and Input Defensiveness ──
// Validates: Requirements 6.6
{
  let defensiveCount = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 19 (Sub-check C): Fallback Behavior and Input Defensiveness',
    fc.property(
      arbWalletId,
      fc.constantFrom(undefined, null, '', '   '),
      fc.constantFrom(undefined, null, []),
      (walletId, emptyTimestamp, emptyReconciliations) => {
        defensiveCount++

        // A. Wallet with falsy / empty timestamp must always report true
        const wallet = {
          id: walletId,
          lastReconciledAt: emptyTimestamp,
        }

        const result = hasNeverBeenReconciled(wallet, emptyReconciliations)
        assert.equal(
          result,
          true,
          `Wallet with empty timestamp (${JSON.stringify(emptyTimestamp)}) must be unreconciled`
        )

        // B. Wallet with valid timestamp but non-array / omitted reconciliations
        const validTimestampWallet = {
          id: walletId,
          lastReconciledAt: '2026-06-15T12:00:00.000Z',
        }

        if (emptyReconciliations === undefined || emptyReconciliations === null) {
          // When reconciliations array is omitted, presence of lastReconciledAt indicates reconciled
          const fallbackResult = hasNeverBeenReconciled(validTimestampWallet, emptyReconciliations)
          assert.equal(
            fallbackResult,
            false,
            'When reconciliations array is omitted, valid lastReconciledAt indicates reconciled'
          )
        } else if (Array.isArray(emptyReconciliations) && emptyReconciliations.length === 0) {
          // When empty array is passed, 0 matching records means unreconciled
          const arrayResult = hasNeverBeenReconciled(validTimestampWallet, emptyReconciliations)
          assert.equal(
            arrayResult,
            true,
            'Empty reconciliations array means 0 records, which requires unreconciled warning'
          )
        }

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(defensiveCount >= MIN_PBT_RUNS)
  console.log(`    Sub-check C verified with ${defensiveCount} runs for defensive input handling.`)
}

// ── Feature: sakukilat-core-roadmap, Property 19 (Sub-check D): Simulated UI Badge Rendering Invariant ──
// Validates: Requirements 6.6
{
  let uiRenderCount = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 19 (Sub-check D): Simulated UI Badge Rendering Invariant',
    fc.property(
      arbWallet,
      fc.array(arbReconciliationRecord, { minLength: 0, maxLength: 15 }),
      (wallet, reconciliations) => {
        uiRenderCount++

        // Simulate Tab Saku rendering condition:
        // {hasNeverBeenReconciled(wallet, reconciliations) && (
        //   <span data-testid={`unreconciled-badge-${wallet.id}`} className="...">Belum Rekonsiliasi</span>
        // )}
        const shouldShowBadge = hasNeverBeenReconciled(wallet, reconciliations)

        const simulatedCardRender = {
          walletId: wallet.id,
          walletLabel: wallet.label,
          hasUnreconciledBadge: shouldShowBadge,
          badgeTestId: shouldShowBadge ? `unreconciled-badge-${wallet.id}` : null,
          badgeLabel: shouldShowBadge ? 'Belum Rekonsiliasi' : null,
        }

        if (shouldShowBadge) {
          assert.equal(
            simulatedCardRender.hasUnreconciledBadge,
            true,
            'Badge must be rendered when shouldShowBadge is true'
          )
          assert.equal(
            simulatedCardRender.badgeTestId,
            `unreconciled-badge-${wallet.id}`,
            'Badge testid must match wallet id'
          )
          assert.equal(
            simulatedCardRender.badgeLabel,
            'Belum Rekonsiliasi',
            'Badge text must be "Belum Rekonsiliasi"'
          )
        } else {
          assert.equal(
            simulatedCardRender.hasUnreconciledBadge,
            false,
            'Badge must NOT be rendered when wallet is reconciled'
          )
          assert.equal(
            simulatedCardRender.badgeTestId,
            null,
            'Badge testid must be null when reconciled'
          )
        }

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(uiRenderCount >= MIN_PBT_RUNS)
  console.log(`    Sub-check D verified with ${uiRenderCount} runs for simulated UI badge rendering.`)
}

// ── Concrete Edge Cases ───────────────────────────────────────────────────
{
  console.log('\nEvaluating concrete edge cases for Property 19...')

  // Case 1: Fresh wallet created during onboarding (undefined lastReconciledAt, 0 records)
  const freshWallet = { id: 'cash', label: 'Tunai', balance: 500_000 }
  assert.equal(
    hasNeverBeenReconciled(freshWallet, []),
    true,
    'Fresh wallet without timestamp must show warning'
  )

  // Case 2: Wallet with empty string timestamp
  const emptyStringWallet = { id: 'bca', label: 'BCA', balance: 1_000_000, lastReconciledAt: '' }
  assert.equal(
    hasNeverBeenReconciled(emptyStringWallet, []),
    true,
    'Empty string timestamp must show warning'
  )

  // Case 3: Wallet with timestamp but empty reconciliations array
  const orphanedTimestampWallet = {
    id: 'mandiri',
    label: 'Mandiri',
    balance: 2_000_000,
    lastReconciledAt: '2026-05-01T08:00:00.000Z',
  }
  assert.equal(
    hasNeverBeenReconciled(orphanedTimestampWallet, []),
    true,
    'Wallet with timestamp but 0 reconciliation records must show warning'
  )

  // Case 4: Reconciliations exist, but for a DIFFERENT wallet ID
  const otherWalletRecords = [
    {
      id: 'recon-1',
      walletId: 'gopay',
      expectedBalance: 50_000,
      actualBalance: 50_000,
      difference: 0,
      reconciledAt: '2026-06-01T10:00:00.000Z',
    },
  ]
  assert.equal(
    hasNeverBeenReconciled(orphanedTimestampWallet, otherWalletRecords),
    true,
    'Records belonging to other wallets must not satisfy target wallet reconciliation'
  )

  // Case 5: Fully reconciled wallet (valid timestamp AND matching reconciliation record)
  const reconciledWallet = {
    id: 'gopay',
    label: 'GoPay',
    balance: 50_000,
    lastReconciledAt: '2026-06-01T10:00:00.000Z',
  }
  assert.equal(
    hasNeverBeenReconciled(reconciledWallet, otherWalletRecords),
    false,
    'Reconciled wallet with matching record and timestamp must NOT show warning'
  )

  // Case 6: Multiple past reconciliations for the same wallet
  const multiRecords = [
    { id: 'r1', walletId: 'bca', expectedBalance: 100, actualBalance: 100, difference: 0, reconciledAt: '2026-01-01T00:00:00Z' },
    { id: 'r2', walletId: 'bca', expectedBalance: 200, actualBalance: 250, difference: 50, reconciledAt: '2026-02-01T00:00:00Z' },
    { id: 'r3', walletId: 'bca', expectedBalance: 300, actualBalance: 300, difference: 0, reconciledAt: '2026-03-01T00:00:00Z' },
  ]
  const multiReconWallet = {
    id: 'bca',
    label: 'BCA',
    balance: 300,
    lastReconciledAt: '2026-03-01T00:00:00Z',
  }
  assert.equal(
    hasNeverBeenReconciled(multiReconWallet, multiRecords),
    false,
    'Wallet with multiple history records must be reconciled'
  )

  console.log('✓ All concrete edge cases passed successfully')
}

console.log('\n✅ Property 19 (Unreconciled Wallet Warning Indicator) PASSED all invariants with >= 100 iterations each!\n')
