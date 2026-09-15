/**
 * SakuKilat — Unit & Integration Tests for Task 20.3:
 * Net Worth UI Panel, Debt Tracking & Repayment Synchronization
 *
 * Requirements:
 * - 10.1: Register debt item with name, principal amount, paid amount, remaining balance, due date, counterparty, notes
 * - 10.4: Calculate and display Net Worth as total assets minus total liabilities
 * - 10.5: Debt repayment reduces remaining balance, updates wallet balance, and creates expense transaction
 * - 3.5: Host Net Worth under Kontrol Keuangan section in Tab Saku
 *
 * Run: node scripts/test-net-worth-ui.mjs
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import {
  calculateTotalAssets,
  calculateTotalLiabilities,
  calculateTotalReceivables,
  calculateNetWorth,
  compileNetWorthSummary,
  createDebtItem,
  updateDebtItem,
  recordDebtPayment,
} from '../lib/net-worth.ts'

let passed = 0
let failed = 0
let total = 0

function test(name, fn) {
  total++
  try {
    fn()
    console.log(`  ✓ PASS: ${name}`)
    passed++
  } catch (e) {
    console.log(`  ✗ FAIL: ${name}`)
    console.log(`    → ${e.message}`)
    failed++
  }
}

console.log('========================================================================')
console.log('  SAKUKILAT — TASK 20.3: NET WORTH UI & DEBT TRACKING INTEGRATION TESTS ')
console.log('========================================================================\n')

// ── Group 1: Component File & TestID Integrity ─────────────────────────────────
console.log('▶ Group 1: Component File & TestID Integrity (Task 20.3)...')

test('components/net-worth-panel.tsx exists and exports required components', () => {
  const panelPath = path.resolve(import.meta.dirname, '../components/net-worth-panel.tsx')
  assert.ok(fs.existsSync(panelPath), 'components/net-worth-panel.tsx must exist')
  const content = fs.readFileSync(panelPath, 'utf8')
  assert.ok(content.includes('export function NetWorthPanel'), 'Must export NetWorthPanel')
  assert.ok(content.includes('export const NetWorthModal'), 'Must export NetWorthModal')
  assert.ok(content.includes('export function DebtFormModal'), 'Must export DebtFormModal')
  assert.ok(content.includes('export function DebtRepaymentModal'), 'Must export DebtRepaymentModal')
  assert.ok(content.includes('export function NetWorthSummaryView'), 'Must export NetWorthSummaryView')
})

test('NetWorthSummaryView defines all required summary card testids', () => {
  const panelPath = path.resolve(import.meta.dirname, '../components/net-worth-panel.tsx')
  const content = fs.readFileSync(panelPath, 'utf8')
  assert.ok(content.includes('data-testid="net-worth-summary-card"'), 'Summary card container testid')
  assert.ok(content.includes('data-testid="net-worth-total-net-worth"'), 'Net worth value testid')
  assert.ok(content.includes('data-testid="net-worth-total-assets"'), 'Total assets testid')
  assert.ok(content.includes('data-testid="net-worth-total-liabilities"'), 'Total liabilities testid')
  assert.ok(content.includes('data-testid="net-worth-status-badge"'), 'Status badge testid')
  assert.ok(content.includes('data-testid="net-worth-active-debts-badge"'), 'Active debts count testid')
  assert.ok(content.includes('data-testid="net-worth-settled-debts-badge"'), 'Settled debts count testid')
  assert.ok(content.includes('data-testid="net-worth-total-receivables"'), 'Receivables badge testid')
})

test('NetWorthPanel defines debt list and filter testids', () => {
  const panelPath = path.resolve(import.meta.dirname, '../components/net-worth-panel.tsx')
  const content = fs.readFileSync(panelPath, 'utf8')
  assert.ok(content.includes('data-testid="btn-add-debt"'), 'Add debt button testid')
  assert.ok(content.includes('data-testid="debt-filter-all"'), 'Type filter all testid')
  assert.ok(content.includes('data-testid="debt-filter-payable"'), 'Type filter payable testid')
  assert.ok(content.includes('data-testid="debt-filter-receivable"'), 'Type filter receivable testid')
  assert.ok(content.includes('data-testid="debt-status-filter-all"'), 'Status filter all testid')
  assert.ok(content.includes('data-testid="debt-status-filter-active"'), 'Status filter active testid')
  assert.ok(content.includes('data-testid="debt-status-filter-settled"'), 'Status filter settled testid')
  assert.ok(content.includes('data-testid="debt-list-container"'), 'Debt list container testid')
  assert.ok(content.includes('data-testid="debt-empty-state"'), 'Empty state testid')
})

test('DebtItem defines item details, progress, and action testids', () => {
  const panelPath = path.resolve(import.meta.dirname, '../components/net-worth-panel.tsx')
  const content = fs.readFileSync(panelPath, 'utf8')
  assert.ok(content.includes('data-testid={`debt-item-${debt.id}`}'), 'Debt item container')
  assert.ok(content.includes('data-testid={`debt-name-${debt.id}`}'), 'Debt name')
  assert.ok(content.includes('data-testid={`debt-type-badge-${debt.id}`}'), 'Debt type badge')
  assert.ok(content.includes('data-testid={`debt-remaining-${debt.id}`}'), 'Debt remaining balance')
  assert.ok(content.includes('data-testid={`debt-principal-${debt.id}`}'), 'Debt principal')
  assert.ok(content.includes('data-testid={`debt-paid-${debt.id}`}'), 'Debt paid amount')
  assert.ok(content.includes('data-testid={`debt-progress-${debt.id}`}'), 'Debt progress bar')
  assert.ok(content.includes('data-testid={`btn-repay-debt-${debt.id}`}'), 'Repay button')
  assert.ok(content.includes('data-testid={`btn-edit-debt-${debt.id}`}'), 'Edit button')
  assert.ok(content.includes('data-testid={`btn-delete-debt-${debt.id}`}'), 'Delete button')
  assert.ok(content.includes('data-testid={`btn-toggle-history-${debt.id}`}'), 'Toggle history button')
  assert.ok(content.includes('data-testid={`debt-history-${debt.id}`}'), 'Payment history container')
})

test('DebtFormModal defines registration and edit form testids', () => {
  const panelPath = path.resolve(import.meta.dirname, '../components/net-worth-panel.tsx')
  const content = fs.readFileSync(panelPath, 'utf8')
  assert.ok(content.includes('data-testid="debt-form-modal"'), 'Form modal dialog')
  assert.ok(content.includes('data-testid="debt-type-select"'), 'Type select container')
  assert.ok(content.includes('data-testid="debt-name-input"'), 'Name input')
  assert.ok(content.includes('data-testid="debt-principal-input"'), 'Principal input')
  assert.ok(content.includes('data-testid="debt-paid-input"'), 'Paid input')
  assert.ok(content.includes('data-testid="debt-counterparty-input"'), 'Counterparty input')
  assert.ok(content.includes('data-testid="debt-due-date-input"'), 'Due date input')
  assert.ok(content.includes('data-testid="debt-note-input"'), 'Note input')
  assert.ok(content.includes('data-testid="btn-submit-debt"'), 'Submit button')
  assert.ok(content.includes('data-testid="btn-cancel-debt"'), 'Cancel button')
})

test('DebtRepaymentModal defines repayment synchronization testids', () => {
  const panelPath = path.resolve(import.meta.dirname, '../components/net-worth-panel.tsx')
  const content = fs.readFileSync(panelPath, 'utf8')
  assert.ok(content.includes('data-testid="debt-repayment-modal"'), 'Repayment modal dialog')
  assert.ok(content.includes('data-testid="repayment-amount-input"'), 'Repayment amount input')
  assert.ok(content.includes('data-testid="repayment-wallet-select"'), 'Wallet select')
  assert.ok(content.includes('data-testid="repayment-note-input"'), 'Note input')
  assert.ok(content.includes('data-testid="repayment-sync-tx-checkbox"'), 'Sync transaction checkbox')
  assert.ok(content.includes('data-testid="btn-quick-fill-full"'), 'Quick fill button')
  assert.ok(content.includes('data-testid="btn-submit-repayment"'), 'Submit repayment button')
  assert.ok(content.includes('data-testid="btn-cancel-repayment"'), 'Cancel repayment button')
})

// ── Group 2: Tab Saku Kontrol Keuangan Integration (Req 3.5) ───────────────────
console.log('\n▶ Group 2: Tab Saku Kontrol Keuangan Integration (Req 3.5)...')

test('components/tab-saku.tsx imports NetWorthModal and useNetWorthStore', () => {
  const tabSakuPath = path.resolve(import.meta.dirname, '../components/tab-saku.tsx')
  const content = fs.readFileSync(tabSakuPath, 'utf8')
  assert.ok(content.includes("import { NetWorthModal } from '@/components/net-worth-panel'"), 'Must import NetWorthModal')
  assert.ok(content.includes('useNetWorthStore'), 'Must use useNetWorthStore')
  assert.ok(content.includes('<NetWorthModal'), 'Must render NetWorthModal')
})

test('components/tab-saku.tsx renders implemented Net Worth submenu under Kontrol Keuangan', () => {
  const tabSakuPath = path.resolve(import.meta.dirname, '../components/tab-saku.tsx')
  const content = fs.readFileSync(tabSakuPath, 'utf8')
  assert.ok(content.includes('data-testid="submenu-net-worth"'), 'Must define submenu-net-worth testid')
  assert.ok(content.includes('data-submenu-id="net-worth"'), 'Must define data-submenu-id="net-worth"')
  assert.ok(content.includes('data-implemented="true"'), 'Must be marked as data-implemented="true"')
  assert.ok(content.includes('data-testid="btn-open-net-worth"'), 'Must define btn-open-net-worth button')
  assert.ok(content.includes('data-testid="kontrol-net-worth-badge"'), 'Must define kontrol-net-worth-badge')
  assert.ok(content.includes('sakukilat:open-net-worth'), 'Must listen to sakukilat:open-net-worth event')
})

// ── Group 3: Functional Workflow & Repayment Synchronization Simulation ────────
console.log('\n▶ Group 3: Functional Workflow & Repayment Synchronization Simulation (Req 10.1, 10.4, 10.5)...')

test('Workflow: Create debt, verify net worth impact, record payment with wallet deduction and transaction sync', () => {
  // Step 1: Initial state
  const mockWallets = [
    { id: 'bca', label: 'BCA', balance: 10_000_000 },
    { id: 'tunai', label: 'Tunai', balance: 1_000_000 },
  ]
  const initialDebts = []

  const initialSummary = compileNetWorthSummary(mockWallets, initialDebts)
  assert.equal(initialSummary.totalAssets, 11_000_000, 'Initial assets: 11jt')
  assert.equal(initialSummary.totalLiabilities, 0, 'Initial liabilities: 0')
  assert.equal(initialSummary.netWorth, 11_000_000, 'Initial net worth: 11jt')

  // Step 2: User registers a debt (Req 10.1)
  const newDebt = createDebtItem({
    name: 'Cicilan Laptop',
    principalAmount: 6_000_000,
    paidAmount: 1_000_000,
    dueDate: '2026-12-31',
    lenderOrBorrower: 'Toko Elektronik',
    type: 'payable',
    note: 'Cicilan 6 bulan',
  })

  assert.equal(newDebt.remainingAmount, 5_000_000, 'Remaining is 5jt (6jt - 1jt)')
  assert.equal(newDebt.isSettled, false, 'Debt is not settled')

  const debtsAfterCreation = [newDebt]
  const summaryAfterDebt = compileNetWorthSummary(mockWallets, debtsAfterCreation)
  assert.equal(summaryAfterDebt.totalAssets, 11_000_000, 'Assets unchanged at 11jt')
  assert.equal(summaryAfterDebt.totalLiabilities, 5_000_000, 'Liabilities increase to 5jt')
  assert.equal(summaryAfterDebt.netWorth, 6_000_000, 'Net Worth is 11jt - 5jt = 6jt (Req 10.4)')

  // Step 3: User makes a repayment of Rp2.000.000 from BCA wallet (Req 10.5, Property 29)
  const paymentResult = recordDebtPayment(newDebt, {
    debtId: newDebt.id,
    amount: 2_000_000,
    paymentMethodId: 'bca',
    note: 'Cicilan bulan April',
    createExpenseTransaction: true,
  })

  // 3a. Debt remaining decreases and paid increases
  assert.equal(paymentResult.updatedDebt.paidAmount, 3_000_000, 'Paid amount increases from 1jt to 3jt')
  assert.equal(paymentResult.updatedDebt.remainingAmount, 3_000_000, 'Remaining amount decreases to 3jt')
  assert.equal(paymentResult.updatedDebt.isSettled, false, 'Debt is not settled yet')

  // 3b. Expense transaction is generated
  assert.ok(paymentResult.transaction, 'Transaction must be created')
  assert.equal(paymentResult.transaction.amount, 2_000_000, 'Transaction amount matches payment')
  assert.equal(paymentResult.transaction.type, 'expense', 'Transaction type is expense')
  assert.equal(paymentResult.transaction.paymentMethod, 'bca', 'Payment method is bca')
  assert.equal(paymentResult.transaction.category, 'tagihan', 'Category is tagihan')

  // 3c. Wallet balance is deducted by payment nominal
  const walletsAfterPayment = mockWallets.map(w =>
    w.id === 'bca' ? { ...w, balance: w.balance - paymentResult.transaction.amount } : w
  )
  assert.equal(walletsAfterPayment.find(w => w.id === 'bca').balance, 8_000_000, 'BCA balance reduced from 10jt to 8jt')

  // 3d. Recomputed summary: Net Worth is conserved!
  // Assets: 8jt (BCA) + 1jt (Tunai) = 9jt
  // Liabilities: 3jt
  // Net Worth: 9jt - 3jt = 6jt
  const summaryAfterPayment = compileNetWorthSummary(walletsAfterPayment, [paymentResult.updatedDebt])
  assert.equal(summaryAfterPayment.totalAssets, 9_000_000, 'Total assets after payment: 9jt')
  assert.equal(summaryAfterPayment.totalLiabilities, 3_000_000, 'Total liabilities after payment: 3jt')
  assert.equal(summaryAfterPayment.netWorth, 6_000_000, 'Net Worth is conserved under debt repayment!')

  // Step 4: Full settlement of the remaining Rp3.000.000
  const finalPayment = recordDebtPayment(paymentResult.updatedDebt, {
    debtId: newDebt.id,
    amount: 3_000_000,
    paymentMethodId: 'bca',
    note: 'Pelunasan terakhir',
  })

  assert.equal(finalPayment.updatedDebt.remainingAmount, 0, 'Remaining is 0')
  assert.equal(finalPayment.updatedDebt.isSettled, true, 'Debt is marked as settled')

  const walletsAfterSettlement = walletsAfterPayment.map(w =>
    w.id === 'bca' ? { ...w, balance: w.balance - finalPayment.transaction.amount } : w
  )
  assert.equal(walletsAfterSettlement.find(w => w.id === 'bca').balance, 5_000_000, 'BCA balance now 5jt')

  const summarySettled = compileNetWorthSummary(walletsAfterSettlement, [finalPayment.updatedDebt])
  assert.equal(summarySettled.totalAssets, 6_000_000, 'Total assets: 5jt + 1jt = 6jt')
  assert.equal(summarySettled.totalLiabilities, 0, 'Total liabilities: 0 (settled debts excluded)')
  assert.equal(summarySettled.netWorth, 6_000_000, 'Net worth equals total assets: 6jt')
  assert.equal(summarySettled.activeDebtsCount, 0, '0 active debts')
  assert.equal(summarySettled.settledDebtsCount, 1, '1 settled debt')
})

test('Workflow: Receivable (piutang) repayment generates income transaction and increases wallet balance', () => {
  const mockWallets = [{ id: 'tunai', balance: 500_000 }]
  const receivable = createDebtItem({
    name: 'Talangan Belanja Rian',
    principalAmount: 200_000,
    lenderOrBorrower: 'Rian',
    type: 'receivable',
  })

  assert.equal(receivable.type, 'receivable')
  assert.equal(receivable.remainingAmount, 200_000)

  // Payment received from debtor
  const paymentResult = recordDebtPayment(receivable, {
    debtId: receivable.id,
    amount: 200_000,
    paymentMethodId: 'tunai',
  })

  assert.equal(paymentResult.updatedDebt.isSettled, true, 'Receivable is fully settled')
  assert.ok(paymentResult.transaction, 'Income transaction created')
  assert.equal(paymentResult.transaction.type, 'income', 'Transaction type is income for receivable')
  assert.equal(paymentResult.transaction.amount, 200_000, 'Transaction nominal is 200k')

  // Wallet balance increases
  const updatedWalletBalance = mockWallets[0].balance + paymentResult.transaction.amount
  assert.equal(updatedWalletBalance, 700_000, 'Tunai balance increased from 500k to 700k')
})

// ── Summary ──
console.log('\n────────────────────────────────────────────────────────────────────────')
console.log(`Results: ${passed}/${total} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
} else {
  console.log('✅ All Task 20.3 Net Worth UI & Debt Tracking tests passed!')
}
