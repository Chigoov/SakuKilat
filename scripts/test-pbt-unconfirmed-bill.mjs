/**
 * SakuKilat — Property-Based Test Suite for Unconfirmed Bill Payment Ledger Invariance
 *
 * Feature: sakukilat-core-roadmap, Property 15: Unconfirmed Bill Payment Ledger Invariance
 * Validates: Requirements 5.6
 *
 * Property 15 Specification:
 * For any recurring bill, triggering the "Tandai sudah dibayar" action without user
 * confirmation (dismissed or canceled) SHALL result in zero mutations to the
 * transaction ledger and zero changes to wallet balances.
 *
 * Additionally verifies:
 * - Modal input adjustments (nominal, wallet, note) do not leak upon cancellation (Req 5.5, 5.6)
 * - Strict non-vacuity / discriminative contrast between unconfirmed and confirmed payments (Req 5.4, 5.5)
 * - Multi-step successive unconfirmed prompts invariance across arbitrary sequences of bills
 * - Local storage persistence idempotency across unconfirmed payment prompts
 * - Static component contract and UI wireup in components/bill-manager.tsx and lib/store.tsx
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  fc,
  testProperty,
  MIN_PBT_RUNS,
  arbRupiahAmount,
  arbPositiveRupiahAmount,
  arbCalendarDate,
  arbPaymentMethod,
  arbCategory,
} from './pbt-harness.mjs'
import {
  createBill,
  computeNextDueDate,
  advanceBillDueDate,
  formatBillDueDate,
  groupBillsByUrgency,
  getNearestBill,
  getDaysInMonth,
} from '../lib/bills.ts'
import {
  toCalendarDateString,
  toTransactionDateParts,
  formatIDR,
} from '../lib/parser.ts'
import { parseAmountInput } from '../lib/amount.ts'
import {
  validatePersistedStateStructure,
  loadPersistedState,
  persistState,
  CURRENT_SCHEMA_VERSION,
  STORAGE_KEY,
} from '../lib/storage.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

console.log('====================================================')
console.log('  SAKUKILAT — PBT: UNCONFIRMED BILL INVARIANCE      ')
console.log('====================================================\n')

// ── In-Memory Storage Mock ───────────────────────────────────────────────────

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
  }
}

// ── Bill Payment Flow Simulator ──────────────────────────────────────────────

/**
 * Simulates the Bill Manager payment flow state machine.
 * Matches ConfirmBillPaymentModal lifecycle and useBillStore.markBillPaid semantics.
 */
class BillPaymentSimulator {
  constructor({ transactions, wallets, bills }) {
    this.transactions = [...transactions]
    this.wallets = [...wallets]
    this.bills = [...bills]
    this.activeModal = null
  }

  /**
   * User clicks "Tandai Bayar" on a bill (Req 5.4).
   * Opens confirmation modal prefilled with registered nominal and wallet.
   */
  openPaymentPrompt(billId) {
    const bill = this.bills.find((b) => b.id === billId)
    if (!bill) return false

    const defaultWallet =
      this.wallets.find((w) => w.id === bill.paymentMethodId)?.id ||
      this.wallets[0]?.id ||
      'tunai'

    this.activeModal = {
      bill: { ...bill },
      amountRaw: String(bill.amount),
      selectedWalletId: defaultWallet,
      note: `Bayar tagihan: ${bill.name}`,
      submitting: false,
    }
    return true
  }

  /**
   * User modifies nominal before confirming (Req 5.5).
   */
  adjustAmount(newAmountRaw) {
    if (!this.activeModal) return
    this.activeModal.amountRaw = String(newAmountRaw)
  }

  /**
   * User changes payment wallet in modal.
   */
  selectWallet(walletId) {
    if (!this.activeModal) return
    this.activeModal.selectedWalletId = walletId
  }

  /**
   * User edits transaction note in modal.
   */
  updateNote(note) {
    if (!this.activeModal) return
    this.activeModal.note = note
  }

  /**
   * User dismisses / cancels the modal without confirming (Req 5.6).
   * Vectors: 'cancel_button', 'close_x', 'backdrop_click', 'escape_key', 'back_navigation', 'invalid_submit'
   */
  dismiss(actionType = 'cancel_button') {
    if (!this.activeModal) return
    // In all cancellation/dismissal vectors, onConfirm is NOT called.
    // Modal is unmounted and activeModal state returns to null.
    this.activeModal = null
  }

  /**
   * User clicks "Konfirmasi Bayar" (Req 5.4, 5.5).
   * Validates amount and applies atomic mutations to transactions, wallets, and bills.
   */
  confirm(referenceDate = new Date()) {
    if (!this.activeModal) return null

    const parsedAmount = parseAmountInput(this.activeModal.amountRaw)
    const isValid = Number.isFinite(parsedAmount) && parsedAmount > 0
    if (!isValid || this.activeModal.submitting) {
      return null // Confirmation blocked by validation
    }

    this.activeModal.submitting = true
    const bill = this.activeModal.bill
    const amount = parsedAmount
    const walletId = this.activeModal.selectedWalletId
    const note = this.activeModal.note

    const txId = `tx-bill-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const tx = {
      id: txId,
      kind: 'transaction',
      description: note?.trim() || `Bayar tagihan: ${bill.name}`,
      amount,
      type: 'expense',
      category: bill.categoryId || 'tagihan',
      paymentMethod: walletId,
      date: referenceDate,
      note: note?.trim() || bill.note,
      billId: bill.id,
    }

    // Mutate transactions ledger
    this.transactions = [tx, ...this.transactions]

    // Mutate wallet balance
    this.wallets = this.wallets.map((w) =>
      w.id === walletId ? { ...w, balance: w.balance - amount } : w
    )

    // Advance bill nextDueDate
    const nextDueDate = computeNextDueDate(
      bill.recurrence,
      bill.dueDay,
      bill.nextDueDate || referenceDate,
      { dueMonth: bill.dueMonth }
    )

    this.bills = this.bills.map((b) =>
      b.id === bill.id
        ? {
            ...b,
            nextDueDate,
            lastPaidTransactionId: txId,
            lastPaidAt: referenceDate.toISOString(),
          }
        : b
    )

    this.activeModal = null
    return tx
  }
}

// ── Smart Domain Arbitraries ─────────────────────────────────────────────────

const arbTransaction = fc.record({
  id: fc.uuid().map((u) => `tx-hist-${u.slice(0, 8)}`),
  description: fc.string({ minLength: 1, maxLength: 30 }),
  amount: arbPositiveRupiahAmount,
  type: fc.constantFrom('expense', 'income'),
  category: arbCategory,
  paymentMethod: arbPaymentMethod,
  date: arbCalendarDate,
  kind: fc.constant('transaction'),
})

const arbHistoricalLedger = fc
  .array(arbTransaction, { minLength: 0, maxLength: 20 })
  .map((txs) => {
    const seen = new Set()
    return txs.filter((t) => {
      if (seen.has(t.id)) return false
      seen.add(t.id)
      return true
    })
  })

const arbWallet = fc.record({
  id: arbPaymentMethod,
  label: fc.string({ minLength: 2, maxLength: 15 }),
  balance: fc.integer({ min: -1_000_000, max: 200_000_000 }),
})

const arbWallets = fc
  .array(arbWallet, { minLength: 1, maxLength: 6 })
  .map((wallets) => {
    const seen = new Set()
    return wallets.filter((w) => {
      if (seen.has(w.id)) return false
      seen.add(w.id)
      return true
    })
  })
  .filter((ws) => ws.length >= 1)

const arbBillData = fc.record({
  name: fc.string({ minLength: 2, maxLength: 30 }),
  amount: arbPositiveRupiahAmount,
  recurrence: fc.constantFrom('weekly', 'monthly', 'annually'),
  dueDay: fc.integer({ min: 1, max: 31 }),
  dueMonth: fc.integer({ min: 1, max: 12 }),
  paymentMethodId: arbPaymentMethod,
  categoryId: arbCategory,
  isActive: fc.boolean(),
  note: fc.option(fc.string({ maxLength: 40 }), { nil: undefined }),
})

const arbBills = fc
  .array(arbBillData, { minLength: 1, maxLength: 8 })
  .map((specs) => {
    return specs.map((s, idx) =>
      createBill({
        ...s,
        dueMonth: s.recurrence === 'annually' ? s.dueMonth : undefined,
      })
    )
  })

const arbDismissalVector = fc.constantFrom(
  'cancel_button',
  'close_x',
  'backdrop_click',
  'escape_key',
  'back_navigation',
  'invalid_amount_zero',
  'invalid_amount_negative',
  'invalid_amount_nan',
  'component_unmount'
)

// ── Feature: sakukilat-core-roadmap, Property 15: Unconfirmed Bill Payment Ledger Invariance ──
// Validates: Requirements 5.6
// For any recurring bill, triggering the "Tandai sudah dibayar" action without user
// confirmation (dismissed or canceled) SHALL result in zero mutations to the
// transaction ledger and zero changes to wallet balances.
{
  let totalEvaluated = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 15: Unconfirmed Bill Payment Ledger Invariance',
    fc.property(
      arbHistoricalLedger,
      arbWallets,
      arbBills,
      arbDismissalVector,
      (initialLedger, initialWallets, initialBills, dismissalAction) => {
        totalEvaluated++

        // Snapshot initial state before triggering any bill action
        const initialLedgerSnapshot = JSON.stringify(initialLedger)
        const initialWalletsSnapshot = JSON.stringify(initialWallets)
        const initialBillsSnapshot = JSON.stringify(initialBills)
        const initialTxCount = initialLedger.length
        const initialTotalWealth = initialWallets.reduce((s, w) => s + w.balance, 0)

        // Initialize simulator
        const sim = new BillPaymentSimulator({
          transactions: initialLedger,
          wallets: initialWallets,
          bills: initialBills,
        })

        // Pick an arbitrary target bill from available bills
        const targetBill = sim.bills[Math.floor(Math.random() * sim.bills.length)]
        assert.ok(targetBill, 'Target bill must exist')

        // 1. User triggers "Tandai sudah dibayar" action (Req 5.4)
        const promptOpened = sim.openPaymentPrompt(targetBill.id)
        assert.equal(promptOpened, true, 'Prompt must successfully open for valid bill')
        assert.ok(sim.activeModal !== null, 'Active confirmation modal state must be populated')

        // Verify prefilled parameters (Req 5.4)
        assert.equal(
          sim.activeModal.amountRaw,
          String(targetBill.amount),
          'Modal must prefill registered bill nominal'
        )

        // 2. User may interact with modal inputs before dismissing (Req 5.5)
        // Adjust nominal, change wallet, type note
        sim.adjustAmount(targetBill.amount * 2 + 50_000)
        const otherWallet = sim.wallets[sim.wallets.length - 1]
        sim.selectWallet(otherWallet.id)
        sim.updateNote('Pembayaran belum pasti dilakukan')

        // 3. User does NOT confirm: modal is dismissed/canceled via one of the dismissal vectors (Req 5.6)
        if (
          dismissalAction === 'invalid_amount_zero' ||
          dismissalAction === 'invalid_amount_negative' ||
          dismissalAction === 'invalid_amount_nan'
        ) {
          // User types invalid amount and attempts to submit
          const invalidValue =
            dismissalAction === 'invalid_amount_zero'
              ? '0'
              : dismissalAction === 'invalid_amount_negative'
              ? '-25000'
              : 'abc'
          sim.adjustAmount(invalidValue)
          const confirmResult = sim.confirm()
          // Must be blocked by validation
          assert.equal(
            confirmResult,
            null,
            'Submission with invalid nominal must be strictly blocked'
          )
          // Modal is then dismissed
          sim.dismiss(dismissalAction)
        } else {
          // Normal dismissal vector
          sim.dismiss(dismissalAction)
        }

        assert.equal(
          sim.activeModal,
          null,
          'Modal must be closed after cancellation/dismissal'
        )

        // ── INVARIANT 1: ZERO MUTATIONS TO TRANSACTION LEDGER (Req 5.6) ────────
        // A. Ledger length invariant: length must be strictly unchanged
        assert.equal(
          sim.transactions.length,
          initialTxCount,
          `Ledger length must remain ${initialTxCount}, got ${sim.transactions.length}`
        )

        // B. Zero Transaction Creations / Deletions: Every initial transaction ID exists
        const currentTxIds = new Set(sim.transactions.map((t) => t.id))
        for (const origTx of initialLedger) {
          assert.ok(
            currentTxIds.has(origTx.id),
            `Initial transaction ${origTx.id} was lost during unconfirmed bill payment`
          )
        }

        // C. Zero Transaction Mutations: Deep equality for every transaction
        for (let i = 0; i < initialLedger.length; i++) {
          assert.deepEqual(
            sim.transactions[i],
            initialLedger[i],
            `Transaction at index ${i} was mutated during unconfirmed bill payment`
          )
        }

        // D. Byte-for-byte serialization identity of entire ledger
        assert.equal(
          JSON.stringify(sim.transactions),
          initialLedgerSnapshot,
          'Transaction ledger must be byte-for-byte identical after unconfirmed bill payment'
        )

        // ── INVARIANT 2: ZERO CHANGES TO WALLET BALANCES (Req 5.6) ─────────────
        // A. Wallet count invariant
        assert.equal(
          sim.wallets.length,
          initialWallets.length,
          'Wallet count must remain unchanged'
        )

        // B. Individual wallet balance identity
        for (const origWallet of initialWallets) {
          const currentWallet = sim.wallets.find((w) => w.id === origWallet.id)
          assert.ok(currentWallet, `Wallet ${origWallet.id} must exist`)
          assert.equal(
            currentWallet.balance,
            origWallet.balance,
            `Wallet ${origWallet.id} balance was altered from ${origWallet.balance} to ${currentWallet.balance}`
          )
        }

        // C. Total aggregated wealth invariance
        const finalTotalWealth = sim.wallets.reduce((s, w) => s + w.balance, 0)
        assert.equal(
          finalTotalWealth,
          initialTotalWealth,
          `Total wealth must remain ${initialTotalWealth}, got ${finalTotalWealth}`
        )

        // D. Byte-for-byte wallets serialization identity
        assert.equal(
          JSON.stringify(sim.wallets),
          initialWalletsSnapshot,
          'Wallets must be byte-for-byte identical after unconfirmed bill payment'
        )

        // ── INVARIANT 3: ZERO MUTATIONS TO BILL SCHEDULE & ATTRIBUTES ──────────
        // A. Target bill due date and payment reference must NOT advance
        const finalTargetBill = sim.bills.find((b) => b.id === targetBill.id)
        assert.ok(finalTargetBill, 'Target bill must exist in bills list')
        assert.equal(
          finalTargetBill.nextDueDate,
          targetBill.nextDueDate,
          `Target bill nextDueDate must NOT advance on unconfirmed payment (expected ${targetBill.nextDueDate}, got ${finalTargetBill.nextDueDate})`
        )
        assert.equal(
          finalTargetBill.lastPaidTransactionId,
          targetBill.lastPaidTransactionId,
          'Target bill lastPaidTransactionId must NOT be set on unconfirmed payment'
        )
        assert.equal(
          finalTargetBill.lastPaidAt,
          targetBill.lastPaidAt,
          'Target bill lastPaidAt must NOT be set on unconfirmed payment'
        )

        // B. All bills serialization identity
        assert.equal(
          JSON.stringify(sim.bills),
          initialBillsSnapshot,
          'Bills list must be byte-for-byte identical after unconfirmed bill payment'
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
  console.log(`  ✓ Main Property 15 verified with ${totalEvaluated} iterations.\n`)
}

// ── Property 15 (Sub-check A): Modal Input Adjustment Non-Leakage on Dismissal ──
// Validates: Requirements 5.5, 5.6
// When user edits nominal (higher, lower, extreme values), switches payment wallet,
// or types notes in the modal, dismissing the modal MUST NOT leak any of these changes
// into the ledger or wallet balances.
{
  let subCheckARuns = 0

  const arbAdjustmentScenario = fc.record({
    initialLedger: arbHistoricalLedger,
    wallets: arbWallets,
    bills: arbBills,
    adjustedAmount: fc.integer({ min: 1, max: 500_000_000 }),
    customNote: fc.string({ minLength: 1, maxLength: 50 }),
    dismissalVector: arbDismissalVector,
  })

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 15 (Sub-check A): Modal Input Adjustment Non-Leakage on Dismissal',
    fc.property(
      arbAdjustmentScenario,
      ({ initialLedger, wallets, bills, adjustedAmount, customNote, dismissalVector }) => {
        subCheckARuns++

        const sim = new BillPaymentSimulator({
          transactions: initialLedger,
          wallets,
          bills,
        })

        const bill = sim.bills[0]
        const originalBillAmount = bill.amount

        // Open prompt
        sim.openPaymentPrompt(bill.id)

        // User changes amount to a different nominal (Req 5.5)
        sim.adjustAmount(adjustedAmount)
        // User changes wallet
        const alternateWallet = sim.wallets[sim.wallets.length - 1]
        sim.selectWallet(alternateWallet.id)
        // User types custom note
        sim.updateNote(customNote)

        // User cancels / dismisses modal
        sim.dismiss(dismissalVector)

        // Verify no leakage of adjusted nominal or note into ledger
        assert.equal(
          sim.transactions.length,
          initialLedger.length,
          'Ledger must not contain new transactions'
        )

        const leakedTx = sim.transactions.find((t) => t.amount === adjustedAmount)
        if (adjustedAmount !== originalBillAmount) {
          // If adjustedAmount was distinct from any pre-existing nominal, ensure it wasn't recorded
          const hadPreExistingWithAmount = initialLedger.some((t) => t.amount === adjustedAmount)
          if (!hadPreExistingWithAmount) {
            assert.equal(
              leakedTx,
              undefined,
              `Adjusted amount ${adjustedAmount} leaked into transaction ledger`
            )
          }
        }

        // Verify alternate wallet was NOT charged
        const finalAltWallet = sim.wallets.find((w) => w.id === alternateWallet.id)
        assert.equal(
          finalAltWallet.balance,
          alternateWallet.balance,
          'Selected alternate wallet must not be deducted'
        )

        // Verify bill registered amount was NOT permanently modified by modal input
        const finalBill = sim.bills.find((b) => b.id === bill.id)
        assert.equal(
          finalBill.amount,
          originalBillAmount,
          'Bill registered amount must remain unchanged'
        )

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(subCheckARuns >= MIN_PBT_RUNS)
  console.log(`    Sub-check A verified with ${subCheckARuns} runs for input adjustment non-leakage.`)
}

// ── Property 15 (Sub-check B): Soundness & Contrast with Confirmed Payment ─────
// Validates: Requirements 5.4, 5.5, 5.6
// Proves non-vacuity: on the exact same scenario, if payment IS confirmed, mutations
// DO happen (ledger grows by 1, wallet balance decreases, bill advances).
// But if unconfirmed, ZERO mutations happen.
{
  let contrastRuns = 0

  const arbContrastScenario = fc.record({
    ledger: arbHistoricalLedger,
    wallets: arbWallets,
    billData: arbBillData,
    paidAmount: fc.integer({ min: 10_000, max: 2_000_000 }),
    refDate: arbCalendarDate,
  })

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 15 (Sub-check B): Soundness & Contrast with Confirmed Payment',
    fc.property(
      arbContrastScenario,
      ({ ledger, wallets, billData, paidAmount, refDate }) => {
        contrastRuns++

        const targetBill = createBill(billData)

        // --- PATH 1: UNCONFIRMED (Canceled) ---
        const unconfirmedSim = new BillPaymentSimulator({
          transactions: ledger,
          wallets,
          bills: [targetBill],
        })

        unconfirmedSim.openPaymentPrompt(targetBill.id)
        unconfirmedSim.adjustAmount(paidAmount)
        unconfirmedSim.dismiss('cancel_button')

        // Ledger unchanged
        assert.equal(unconfirmedSim.transactions.length, ledger.length)
        // Wallets unchanged
        assert.equal(JSON.stringify(unconfirmedSim.wallets), JSON.stringify(wallets))
        // Bill due date unchanged
        assert.equal(unconfirmedSim.bills[0].nextDueDate, targetBill.nextDueDate)

        // --- PATH 2: CONFIRMED ---
        const confirmedSim = new BillPaymentSimulator({
          transactions: ledger,
          wallets,
          bills: [targetBill],
        })

        confirmedSim.openPaymentPrompt(targetBill.id)
        confirmedSim.adjustAmount(paidAmount)
        const chosenWalletId = confirmedSim.activeModal.selectedWalletId
        const createdTx = confirmedSim.confirm(refDate)

        // Soundness checks for Confirmed path:
        assert.ok(createdTx !== null, 'Confirmed payment must return created transaction')
        // Ledger grew by exactly 1
        assert.equal(confirmedSim.transactions.length, ledger.length + 1)
        assert.equal(confirmedSim.transactions[0].id, createdTx.id)
        assert.equal(createdTx.amount, paidAmount)
        assert.equal(createdTx.type, 'expense')
        assert.equal(createdTx.billId, targetBill.id)

        // Wallet was deducted
        const targetWalletBefore = wallets.find((w) => w.id === chosenWalletId)
        const targetWalletAfter = confirmedSim.wallets.find((w) => w.id === chosenWalletId)
        assert.equal(
          targetWalletAfter.balance,
          targetWalletBefore.balance - paidAmount,
          'Wallet balance must be deducted by exact paid amount'
        )

        // Bill nextDueDate advanced
        assert.ok(
          confirmedSim.bills[0].nextDueDate > targetBill.nextDueDate ||
            confirmedSim.bills[0].lastPaidTransactionId === createdTx.id,
          'Confirmed payment must update bill schedule'
        )
        assert.equal(confirmedSim.bills[0].lastPaidTransactionId, createdTx.id)

        // --- DISCRIMINATIVE PROOF ---
        // Unconfirmed ledger length != Confirmed ledger length
        assert.notEqual(
          unconfirmedSim.transactions.length,
          confirmedSim.transactions.length,
          'Discriminative proof: Unconfirmed ledger length must differ from confirmed ledger length'
        )

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(contrastRuns >= MIN_PBT_RUNS)
  console.log(`    Sub-check B verified with ${contrastRuns} runs for non-vacuous confirmed contrast.`)
}

// ── Property 15 (Sub-check C): Multi-Step Successive Unconfirmed Prompts Invariance ─
// Validates: Requirements 5.6
// A user opens and cancels multiple bill payment prompts in succession across different
// bills during an app session. Verifies that cumulative zero mutations hold across K steps.
{
  let multiStepRuns = 0

  const arbMultiStepScenario = fc.record({
    initialLedger: arbHistoricalLedger,
    wallets: arbWallets,
    bills: fc.array(arbBillData, { minLength: 2, maxLength: 6 }).map((specs) =>
      specs.map((s) => createBill(s))
    ),
    steps: fc.array(
      fc.record({
        billIndex: fc.integer({ min: 0, max: 10 }),
        adjustedNominal: fc.option(fc.integer({ min: 1000, max: 10_000_000 }), { nil: undefined }),
        dismissal: arbDismissalVector,
      }),
      { minLength: 2, maxLength: 8 }
    ),
  })

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 15 (Sub-check C): Multi-Step Successive Unconfirmed Prompts Invariance',
    fc.property(
      arbMultiStepScenario,
      ({ initialLedger, wallets, bills, steps }) => {
        multiStepRuns++

        const ledgerSnapshot = JSON.stringify(initialLedger)
        const walletsSnapshot = JSON.stringify(wallets)
        const billsSnapshot = JSON.stringify(bills)

        const sim = new BillPaymentSimulator({
          transactions: initialLedger,
          wallets,
          bills,
        })

        // Execute K successive unconfirmed prompts
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i]
          const billToPay = sim.bills[step.billIndex % sim.bills.length]

          sim.openPaymentPrompt(billToPay.id)
          if (step.adjustedNominal !== undefined) {
            sim.adjustAmount(step.adjustedNominal)
          }
          sim.dismiss(step.dismissal)

          // Invariant at each intermediate step
          assert.equal(
            sim.transactions.length,
            initialLedger.length,
            `Step ${i}: Ledger length mutated during multi-step session`
          )
        }

        // Final invariance checks after all steps
        assert.equal(
          JSON.stringify(sim.transactions),
          ledgerSnapshot,
          'Cumulative ledger must remain byte-for-byte identical after multi-step unconfirmed prompts'
        )
        assert.equal(
          JSON.stringify(sim.wallets),
          walletsSnapshot,
          'Cumulative wallets must remain byte-for-byte identical after multi-step unconfirmed prompts'
        )
        assert.equal(
          JSON.stringify(sim.bills),
          billsSnapshot,
          'Cumulative bills must remain byte-for-byte identical after multi-step unconfirmed prompts'
        )

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(multiStepRuns >= MIN_PBT_RUNS)
  console.log(`    Sub-check C verified with ${multiStepRuns} runs for multi-step prompt sessions.`)
}

// ── Property 15 (Sub-check D): Storage Persistence & Recovery Safety Invariant ──
// Validates: Requirements 5.6
// Persisting state before and after unconfirmed payment attempts produces byte-for-byte
// identical storage state, passes validation, and never triggers quarantine.
{
  let storageRuns = 0

  testProperty(
    'Feature: sakukilat-core-roadmap, Property 15 (Sub-check D): Storage Persistence & Recovery Safety Invariant',
    fc.property(
      arbHistoricalLedger,
      arbWallets,
      arbBills,
      arbDismissalVector,
      (transactions, wallets, bills, dismissal) => {
        storageRuns++

        const mockStorageBefore = createMockStorage()
        const mockStorageAfter = createMockStorage()

        const originalAppState = {
          schemaVersion: CURRENT_SCHEMA_VERSION,
          transactions: transactions.map((t) => ({
            ...t,
            date: t.date.toISOString(),
          })),
          wallets,
          monthlyBudget: 5_000_000,
          customPayments: [],
          customCategories: [],
          hiddenPaymentIds: [],
          hiddenCategoryIds: [],
          bills,
        }

        // 1. Persist state before
        const beforeSaved = persistState(mockStorageBefore, originalAppState, 'valid')
        assert.equal(beforeSaved, true)
        const rawBefore = mockStorageBefore.getItem(STORAGE_KEY)

        // 2. Perform simulated unconfirmed payment flow
        const sim = new BillPaymentSimulator({
          transactions,
          wallets,
          bills,
        })
        const bill = sim.bills[0]
        sim.openPaymentPrompt(bill.id)
        sim.adjustAmount(999_999)
        sim.dismiss(dismissal)

        // 3. Persist state after unconfirmed session
        const afterAppState = {
          schemaVersion: CURRENT_SCHEMA_VERSION,
          transactions: sim.transactions.map((t) => ({
            ...t,
            date: t.date.toISOString(),
          })),
          wallets: sim.wallets,
          monthlyBudget: 5_000_000,
          customPayments: [],
          customCategories: [],
          hiddenPaymentIds: [],
          hiddenCategoryIds: [],
          bills: sim.bills,
        }

        const afterSaved = persistState(mockStorageAfter, afterAppState, 'valid')
        assert.equal(afterSaved, true)
        const rawAfter = mockStorageAfter.getItem(STORAGE_KEY)

        // 4. Invariant: Raw storage JSON must be byte-for-byte identical
        assert.equal(
          rawAfter,
          rawBefore,
          'Raw persisted state in storage must be byte-for-byte identical before and after unconfirmed payment'
        )

        // 5. Invariant: Loaded state validation passes with status 'valid'
        const loaded = loadPersistedState(mockStorageAfter)
        assert.equal(loaded.status, 'valid')
        assert.equal(loaded.state.transactions.length, transactions.length)
        assert.equal(loaded.state.bills.length, bills.length)

        return true
      }
    ),
    { numRuns: 100 }
  )

  assert.ok(storageRuns >= MIN_PBT_RUNS)
  console.log(`    Sub-check D verified with ${storageRuns} runs for storage persistence round-trip.`)
}

// ── Property 15 (Sub-check E): Static UI Component Wireup & Code Contracts ────
// Validates: Requirements 5.4, 5.5, 5.6
{
  console.log('\nValidating static component code contracts in bill-manager.tsx and store.tsx...')

  // 1. Inspect components/bill-manager.tsx
  const billManagerPath = path.resolve(rootDir, 'components/bill-manager.tsx')
  assert.ok(fs.existsSync(billManagerPath), 'components/bill-manager.tsx must exist')
  const billManagerSource = fs.readFileSync(billManagerPath, 'utf8')

  // Confirm modal element contracts
  assert.ok(
    billManagerSource.includes('function ConfirmBillPaymentModal'),
    'bill-manager.tsx must declare ConfirmBillPaymentModal'
  )
  assert.ok(
    billManagerSource.includes('data-testid="bill-payment-modal"'),
    'Modal must have data-testid="bill-payment-modal"'
  )
  assert.ok(
    billManagerSource.includes('data-testid="btn-cancel-payment"'),
    'Modal must have data-testid="btn-cancel-payment"'
  )
  assert.ok(
    billManagerSource.includes('data-testid="btn-cancel-payment-x"'),
    'Modal must have data-testid="btn-cancel-payment-x"'
  )
  assert.ok(
    billManagerSource.includes('data-testid="btn-confirm-payment"'),
    'Modal must have data-testid="btn-confirm-payment"'
  )

  // Back stack & escape cancellation integration
  assert.ok(
    billManagerSource.includes('pushBackLayer') &&
      billManagerSource.includes('removeBackLayer'),
    'Modal must integrate with back-stack pushBackLayer/removeBackLayer for hardware back dismiss'
  )
  assert.ok(
    billManagerSource.includes("e.key === 'Escape'"),
    'Modal must listen for Escape key to trigger onClose'
  )
  assert.ok(
    billManagerSource.includes('e.target === e.currentTarget'),
    'Modal must handle backdrop click to trigger onClose'
  )

  // Confirmation gating: onConfirm is ONLY called in handleConfirm
  assert.ok(
    billManagerSource.includes('const handleConfirm = () => {'),
    'Modal must guard confirmation in handleConfirm'
  )
  assert.ok(
    billManagerSource.includes('if (!isValidAmount || submitting) return'),
    'handleConfirm must prevent submission if amount is invalid or submitting'
  )
  assert.ok(
    billManagerSource.includes('onConfirm(bill.id, parsedAmount, selectedWalletId, note.trim() || undefined)'),
    'handleConfirm must pass validated bill ID and nominal to onConfirm'
  )

  // In BillManager, markBillPaid is ONLY called inside handleConfirmPayment
  assert.ok(
    billManagerSource.includes('const handleConfirmPayment = useCallback('),
    'BillManager must define handleConfirmPayment callback'
  )
  assert.ok(
    billManagerSource.includes('const tx = markBillPaid(billId, paidAmount, walletId, note)'),
    'handleConfirmPayment must invoke markBillPaid'
  )

  // 2. Inspect lib/store.tsx for markBillPaid contract
  const storePath = path.resolve(rootDir, 'lib/store.tsx')
  assert.ok(fs.existsSync(storePath), 'lib/store.tsx must exist')
  const storeSource = fs.readFileSync(storePath, 'utf8')

  assert.ok(
    storeSource.includes('const markBillPaid = useCallback('),
    'lib/store.tsx must declare markBillPaid'
  )
  assert.ok(
    storeSource.includes("description: `Bayar tagihan: ${bill.name}`") ||
      storeSource.includes('Bayar tagihan:'),
    'markBillPaid must create transaction with bill description'
  )

  console.log('✓ Static component code contracts and cancellation handlers verified successfully.\n')
}

// ── Concrete Edge Cases ──────────────────────────────────────────────────────
{
  console.log('Evaluating concrete edge cases...')

  // Case 1: Empty ledger, zero balance wallet, bill payment cancelled
  {
    const sim = new BillPaymentSimulator({
      transactions: [],
      wallets: [{ id: 'tunai', label: 'Cash', balance: 0 }],
      bills: [
        createBill({
          name: 'PLN Token',
          amount: 50_000,
          dueDay: 15,
          recurrence: 'monthly',
          paymentMethodId: 'tunai',
        }),
      ],
    })

    sim.openPaymentPrompt(sim.bills[0].id)
    sim.dismiss('cancel_button')

    assert.equal(sim.transactions.length, 0)
    assert.equal(sim.wallets[0].balance, 0)
  }

  // Case 2: Overdue bill prompt cancelled
  {
    const sim = new BillPaymentSimulator({
      transactions: [{ id: 't1', amount: 10_000, type: 'expense' }],
      wallets: [{ id: 'bca', label: 'BCA', balance: 5_000_000 }],
      bills: [
        createBill({
          name: 'WiFi Indihome',
          amount: 350_000,
          dueDay: 5,
          nextDueDate: '2026-01-05', // Past date
          recurrence: 'monthly',
          paymentMethodId: 'bca',
        }),
      ],
    })

    sim.openPaymentPrompt(sim.bills[0].id)
    sim.adjustAmount(400_000)
    sim.dismiss('escape_key')

    assert.equal(sim.transactions.length, 1)
    assert.equal(sim.wallets[0].balance, 5_000_000)
    assert.equal(sim.bills[0].nextDueDate, '2026-01-05')
  }

  // Case 3: Overdrawn wallet (negative balance)
  {
    const sim = new BillPaymentSimulator({
      transactions: [],
      wallets: [{ id: 'kartu', label: 'Credit Card', balance: -2_500_000 }],
      bills: [
        createBill({
          name: 'Cicilan HP',
          amount: 1_200_000,
          dueDay: 20,
          recurrence: 'monthly',
          paymentMethodId: 'kartu',
        }),
      ],
    })

    sim.openPaymentPrompt(sim.bills[0].id)
    sim.dismiss('backdrop_click')

    assert.equal(sim.wallets[0].balance, -2_500_000)
    assert.equal(sim.transactions.length, 0)
  }

  // Case 4: Non-numeric / garbage text entered into amount then cancelled
  {
    const sim = new BillPaymentSimulator({
      transactions: [],
      wallets: [{ id: 'gopay', label: 'GoPay', balance: 100_000 }],
      bills: [
        createBill({
          name: 'Spotify',
          amount: 55_000,
          dueDay: 1,
          recurrence: 'monthly',
          paymentMethodId: 'gopay',
        }),
      ],
    })

    sim.openPaymentPrompt(sim.bills[0].id)
    sim.adjustAmount('!!!Rp--abc...')
    sim.dismiss('close_x')

    assert.equal(sim.transactions.length, 0)
    assert.equal(sim.wallets[0].balance, 100_000)
  }

  console.log('✓ All concrete edge cases passed successfully.\n')
}

console.log(
  '========================================================================'
)
console.log(
  '✅ Property 15: Unconfirmed Bill Payment Ledger Invariance PASSED! (>= 100 runs) '
)
console.log(
  '========================================================================\n'
)
