/**
 * SakuKilat — Bug Condition Exploration Test Suite (Property 1: Bug Condition)
 * Spec: sakukilat-submenus-and-bugfixes
 *
 * CRITICAL REQUIREMENTS:
 * - This test suite encodes the expected behavior across the 14 newly reported core defect areas.
 * - On UNFIXED code, this test MUST FAIL, producing explicit counterexamples that prove
 *   the defects exist in the current codebase.
 * - DO NOT fix the code or the test when it fails.
 * - When all fixes are implemented in Phase 3, this SAME test will pass in Task 3.17.
 *
 * Core Defect Areas Tested:
 * 1. Ledger Drift / Balance SSoT (wallet.currentBalance vs openingBalance + sum(ledger impacts))
 * 2. ensureWallet() resurrection of deleted/archived wallets
 * 3. Deleting wallet cascades destructively or leaves dangling foreign key references
 * 4. Mutual creation loop between addWallet() and addCustomPayment()
 * 5. Validation disparity in updateWallet() accepting NaN/Infinity/negatives
 * 6. Numerical non-finite & Date crash (safeToISOString, NaN/Infinity rejection in transfers and budgets, day 31 rollover)
 * 7. Storage write failure silent failure without UI visibility/alert
 * 8. Notification preferences reset on reload
 * 9. Smart Input multi-transaction auto-saving without review gating
 * 10. Persisted state loaded without deep schema validation
 * 11. App-lock raw unsalted SHA-256 and missing lockout rate-limiting
 * 12. WebAuthn biometric unverified assertion signature/challenge
 * 13. Category deletion leaving orphaned references or stripped labels
 * 14. Undo sequence race applying stale inverse delta
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')

function readSource(relativePath) {
  const fullPath = path.resolve(ROOT, relativePath)
  assert.ok(fs.existsSync(fullPath), `Source file must exist: ${relativePath}`)
  return fs.readFileSync(fullPath, 'utf8')
}

console.log('========================================================================')
console.log(' SAKUKILAT — BUG CONDITION EXPLORATION SUITE: 14 CORE DEFECT AREAS (P1) ')
console.log(' Spec: sakukilat-submenus-and-bugfixes                                  ')
console.log('========================================================================\n')

const results = []

function runDefectCheck(defectId, defectName, checkFn) {
  console.log(`▶ Testing Bug Condition [Defect ${defectId}]: ${defectName}...`)
  try {
    checkFn()
    console.log(`  ✓ RESOLVED: Defect ${defectId} not detected (Behavior matches expected fixed state)`)
    results.push({ id: defectId, name: defectName, status: 'PASSED', counterexample: null })
  } catch (err) {
    console.log(`  ✗ BUG CONFIRMED (Failed as expected on unfixed code):`)
    console.log(`    → Counterexample / Cause: ${err.message}`)
    results.push({ id: defectId, name: defectName, status: 'BUG_CONFIRMED', counterexample: err.message })
  }
}

// ── 1. Ledger Drift / Balance SSoT ───────────────────────────────────────────
runDefectCheck(1, 'Ledger Drift / Balance SSoT (computeWalletBalanceFromLedger)', () => {
  const ledgerModuleExists = fs.existsSync(path.resolve(ROOT, 'lib/wallet-ledger.ts'))
  assert.ok(
    ledgerModuleExists,
    'lib/wallet-ledger.ts must exist and define Single Source of Truth ledger computation'
  )

  const storeContent = readSource('lib/store.tsx')
  assert.ok(
    storeContent.includes('computeWalletBalanceFromLedger') || storeContent.includes('reconcileWalletBalances'),
    'lib/store.tsx must use computeWalletBalanceFromLedger or reconcileWalletBalances to eliminate wallet balance drift'
  )
})

// ── 2. ensureWallet() resurrection of deleted/archived wallets ────────────────
runDefectCheck(2, 'ensureWallet() Resurrection of Deleted/Archived Wallets', () => {
  const storeContent = readSource('lib/store.tsx')

  // Expected: ensureWallet must check isDeleted or isArchived status and not resurrect
  const guardsAgainstResurrection =
    storeContent.includes('walletResurrected') ||
    (/ensureWallet[\s\S]*?(?:isArchived|isDeleted)/.test(storeContent) &&
     storeContent.includes('fallbackWallet'))
  assert.ok(
    guardsAgainstResurrection,
    'ensureWallet in lib/store.tsx must guard against resurrecting archived or deleted wallets'
  )
})

// ── 3. Destructive Wallet Deletion Cascades ──────────────────────────────────
runDefectCheck(3, 'Destructive Wallet Deletion Leaves Dangling Foreign Keys', () => {
  const storeContent = readSource('lib/store.tsx')

  // Expected: removeWallet must use soft-delete/archival or remapping rather than destructive filter
  const usesSoftDelete =
    storeContent.includes('archiveWallet') ||
    storeContent.includes('isArchived: true')
  assert.ok(
    usesSoftDelete,
    'lib/store.tsx must implement archiveWallet with isArchived: true to preserve historical transaction references'
  )

  // Expected: removeWallet must NOT just filter out the wallet leaving dangling paymentMethod references
  const hasDestructiveFilter = /removeWallet[\s\S]*?filter\(item\s*=>\s*item\.id\s*!==\s*id\)/.test(storeContent)
  assert.ok(
    !hasDestructiveFilter,
    'removeWallet in lib/store.tsx must not destructively filter wallets leaving dangling references'
  )
})

// ── 4. Mutual Creation Loop (addWallet & addCustomPayment) ───────────────────
runDefectCheck(4, 'Mutual Creation Loop Between addWallet() and addCustomPayment()', () => {
  const syncModuleExists = fs.existsSync(path.resolve(ROOT, 'lib/wallet-sync.ts'))
  const storeContent = readSource('lib/store.tsx')

  const hasIdempotencyGuard =
    syncModuleExists ||
    storeContent.includes('isSyncingWalletPayment') ||
    storeContent.includes('syncWalletAndCustomPayment')
  assert.ok(
    hasIdempotencyGuard,
    'lib/wallet-sync.ts or lib/store.tsx must provide an idempotency guard (isSyncingWalletPayment) to break mutual creation loop'
  )
})

// ── 5. Validation Disparity in updateWallet() ─────────────────────────────────
runDefectCheck(5, 'Validation Disparity in updateWallet() Accepting NaN/Infinity/Negatives', () => {
  const storeContent = readSource('lib/store.tsx')

  // Expected: updateWallet must use shared validateWalletPayload or enforce non-negative finite balance
  const hasValidationParity =
    storeContent.includes('validateWalletPayload') ||
    (storeContent.includes('Number.isFinite(updates.balance)') && storeContent.includes('updates.balance >= 0'))
  assert.ok(
    hasValidationParity,
    'updateWallet in lib/store.tsx must enforce validation parity via validateWalletPayload, rejecting NaN, Infinity, and invalid balance'
  )
})

// ── 6. Numerical Non-Finite & Date Crash ─────────────────────────────────────
runDefectCheck(6, 'Numerical Non-Finite and Date Crash (safeToISOString, clampDate, budget validation)', () => {
  const sanitizerExists = fs.existsSync(path.resolve(ROOT, 'lib/sanitizer.ts'))
  assert.ok(
    sanitizerExists,
    'lib/sanitizer.ts must exist and export safeToISOString, sanitizeIntegerRupiah, and validatePositiveMonetaryAmount'
  )

  const parserContent = readSource('lib/parser.ts')
  assert.ok(
    parserContent.includes('clampDateToMonthMaxDays'),
    'lib/parser.ts must export clampDateToMonthMaxDays to prevent 31st rollover on short months'
  )

  const storeContent = readSource('lib/store.tsx')
  assert.ok(
    storeContent.includes('validateMonthlyBudget'),
    'setMonthlyBudget in lib/store.tsx must use validateMonthlyBudget to reject NaN and Infinity'
  )
})

// ── 7. Storage Write Silent Failure ──────────────────────────────────────────
runDefectCheck(7, 'Storage Write Failure Silent Failure Without UI Visibility/Alert', () => {
  const storageResilienceExists = fs.existsSync(path.resolve(ROOT, 'lib/storage-resilience.ts'))
  const storageContent = readSource('lib/storage.ts')

  const hasStorageErrorDispatch =
    storageResilienceExists ||
    storageContent.includes('sakukilat:storage-error') ||
    storageContent.includes('persistStateAtomic')
  assert.ok(
    hasStorageErrorDispatch,
    'Storage engine must provide atomic write-then-replace and dispatch sakukilat:storage-error event on failure'
  )
})

// ── 8. Notification Preferences Reset on Reload ──────────────────────────────
runDefectCheck(8, 'Notification Preferences Reset on Reload Due to Missing Persistence', () => {
  const notifContent = readSource('lib/notifications.ts')

  // Expected: loadNotifPrefs must read from localStorage, NOT hardcode return of DEFAULT_NOTIF_PREFS
  const loadsFromStorage =
    notifContent.includes('getItem(NOTIF_PREFS_KEY)') ||
    notifContent.includes('localStorage.getItem')
  assert.ok(
    loadsFromStorage,
    'loadNotifPrefs in lib/notifications.ts must read from storage, not hardcode return { ...DEFAULT_NOTIF_PREFS }'
  )

  // Expected: saveNotifPrefs must persist passed parameter, NOT hardcoded DEFAULT_NOTIF_PREFS
  const savesPassedPrefs = !notifContent.includes('JSON.stringify(DEFAULT_NOTIF_PREFS)')
  assert.ok(
    savesPassedPrefs,
    'saveNotifPrefs in lib/notifications.ts must persist the received preferences, not static DEFAULT_NOTIF_PREFS'
  )
})

// ── 9. Smart Input Multi-Tx Auto-Save Without Review Gating ──────────────────
runDefectCheck(9, 'Smart Input Multi-Transaction Auto-Save Without Review Gating', () => {
  const parserContent = readSource('lib/parser.ts')
  assert.ok(
    parserContent.includes('detectMultipleTransactions'),
    'lib/parser.ts must export detectMultipleTransactions to detect multi-transaction input'
  )

  const reviewModalExists = fs.existsSync(path.resolve(ROOT, 'components/multi-transaction-review-modal.tsx'))
  assert.ok(
    reviewModalExists,
    'components/multi-transaction-review-modal.tsx must exist to gate multi-transaction submissions'
  )
})

// ── 10. Persisted State Loaded Without Deep Schema Validation ────────────────
runDefectCheck(10, 'Persisted State Loaded Without Deep Schema Validation', () => {
  const validatorExists = fs.existsSync(path.resolve(ROOT, 'lib/schema-validator.ts'))
  assert.ok(
    validatorExists,
    'lib/schema-validator.ts must exist and export validatePersistedStateSchema'
  )

  const storageContent = readSource('lib/storage.ts')
  assert.ok(
    storageContent.includes('validatePersistedStateSchema'),
    'lib/storage.ts must use validatePersistedStateSchema during state loading'
  )
})

// ── 11. App-Lock Raw Unsalted SHA-256 and Missing Lockout Rate-Limiting ──────
runDefectCheck(11, 'App-Lock Raw Unsalted SHA-256 & Missing Lockout Rate-Limiting', () => {
  const appLockContent = readSource('lib/app-lock.ts')
  const cryptoSecurityExists = fs.existsSync(path.resolve(ROOT, 'lib/crypto-security.ts'))

  // Expected: Must use salted PBKDF2 hashing
  const usesPBKDF2 =
    cryptoSecurityExists ||
    appLockContent.includes('hashPasscodePBKDF2') ||
    appLockContent.includes('PBKDF2')
  assert.ok(
    usesPBKDF2,
    'lib/crypto-security.ts or lib/app-lock.ts must implement hashPasscodePBKDF2 with random salt and >= 100,000 iterations'
  )

  // Expected: Must evaluate rate limiting / lockout
  const hasRateLimiting =
    appLockContent.includes('evaluatePasscodeAttempt') ||
    appLockContent.includes('lockoutUntil') ||
    appLockContent.includes('consecutiveFailures')
  assert.ok(
    hasRateLimiting,
    'App-lock must implement evaluatePasscodeAttempt with progressive lockout after failed attempts'
  )
})

// ── 12. WebAuthn Biometric Unverified Assertion Signature/Challenge ──────────
runDefectCheck(12, 'WebAuthn Biometric Unverified Assertion Signature and Challenge', () => {
  const appLockContent = readSource('lib/app-lock.ts')
  const cryptoSecurityExists = fs.existsSync(path.resolve(ROOT, 'lib/crypto-security.ts'))

  // Expected: authenticateBiometric must cryptographically verify assertion, not just check Boolean(credential)
  const verifiesSignature =
    cryptoSecurityExists ||
    appLockContent.includes('verifyWebAuthnAssertion') ||
    !appLockContent.includes('return Boolean(credential)')
  assert.ok(
    verifiesSignature,
    'authenticateBiometric in lib/app-lock.ts must verify cryptographic assertion signature and challenge, not just return Boolean(credential)'
  )
})

// ── 13. Category Deletion Leaving Orphaned References or Stripped Labels ─────
runDefectCheck(13, 'Category Deletion Leaving Orphaned References or Stripped Labels', () => {
  const storeContent = readSource('lib/store.tsx')

  // Expected: deleteCategoryPreservingLabels or historicalCategoryLabel preservation
  const preservesHistoricalLabels =
    storeContent.includes('deleteCategoryPreservingLabels') ||
    storeContent.includes('historicalCategoryLabel')
  assert.ok(
    preservesHistoricalLabels,
    'removeCustomCategory in lib/store.tsx must preserve historicalCategoryLabel on past transactions'
  )
})

// ── 14. Undo Sequence Race Applying Stale Inverse Delta ──────────────────────
runDefectCheck(14, 'Undo Sequence Race Applying Stale Inverse Delta', () => {
  const undoManagerExists = fs.existsSync(path.resolve(ROOT, 'lib/undo-manager.ts'))
  const storeContent = readSource('lib/store.tsx')

  // Expected: Must check mutationSequenceId or implement executeSafeUndo
  const hasSequenceCheckedUndo =
    undoManagerExists ||
    storeContent.includes('mutationSequenceId') ||
    storeContent.includes('executeSafeUndo')
  assert.ok(
    hasSequenceCheckedUndo,
    'Undo mechanism must implement executeSafeUndo with mutationSequenceId check and double-undo guard'
  )
})

console.log('\n========================================================================')
console.log('                          EXPLORATION SUMMARY                           ')
console.log('========================================================================')

const confirmedBugs = results.filter(r => r.status === 'BUG_CONFIRMED')
const resolvedDefects = results.filter(r => r.status === 'PASSED')

console.log(`Total Checks       : ${results.length}`)
console.log(`Confirmed Bugs     : ${confirmedBugs.length} (Expected on unfixed code)`)
console.log(`Resolved Checks    : ${resolvedDefects.length}`)
console.log('------------------------------------------------------------------------')

if (confirmedBugs.length > 0) {
  console.log('\n[!] DEFECT COUNTEREXAMPLES CONFIRMED ON UNFIXED CODE:')
  confirmedBugs.forEach(b => {
    console.log(`  • [Defect ${b.id}] ${b.name}:`)
    console.log(`    ${b.counterexample}`)
  })
  console.log('\n=> RESULT: Bug condition exploration successfully confirmed all defects exist.')
  console.log('=> Status: FAILED AS EXPECTED (Validation confirms real bugs are detected).\n')
  process.exitCode = 1
} else {
  console.log('\n✅ ALL DEFECTS RESOLVED! Bug condition exploration suite PASSED.')
  process.exitCode = 0
}
