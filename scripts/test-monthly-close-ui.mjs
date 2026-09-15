/**
 * SakuKilat — Unit & Integration Tests for Task 18.4:
 * Monthly Close UI Modal, Lock/Reopen Audit Trail, and Tab Rekapan Indicators
 *
 * Requirements:
 * - 9.1: Execute pre-closing checklist verifying uncategorized tx, pending inbox, unreconciled wallets, overdue bills
 * - 9.2: Compile monthly financial summary displaying total income, total expenses, net savings, reconciliation variances
 * - 9.3: When checks pass (or override confirmed), mark target month as closed with timestamp
 * - 9.4: Allow user to manually reopen month with explicit audit note
 * - 9.5: Display closed period indicators on historical summary reports in Tab Rekapan
 * - 3.5: Host Tutup Bulan under Kontrol Keuangan section in Tab Saku
 *
 * Run: node scripts/test-monthly-close-ui.mjs
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import {
  evaluatePreClosingChecklist,
  compileMonthlyFinancialSummary,
  createMonthlyCloseRecord,
  reopenMonthlyClose,
  recloseMonthlyClose,
  isMonthClosed,
  getMonthlyCloseRecord,
  formatMonthId,
  formatMonthLabel,
} from '../lib/monthly-close.ts'

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
console.log('  SAKUKILAT — TASK 18.4: MONTHLY CLOSE UI & REKAPAN INDICATORS TESTS    ')
console.log('========================================================================\n')

// ── Group 1: Component File & TestID Integrity ─────────────────────────────────
console.log('▶ Group 1: Component File & TestID Integrity (Task 18.4)...')

test('components/monthly-close-modal.tsx exists and exports MonthlyCloseModal', () => {
  const modalPath = path.resolve(import.meta.dirname, '../components/monthly-close-modal.tsx')
  assert.ok(fs.existsSync(modalPath), 'monthly-close-modal.tsx must exist')
  const content = fs.readFileSync(modalPath, 'utf8')
  assert.ok(content.includes('export const MonthlyCloseModal'), 'Must export MonthlyCloseModal')
  assert.ok(content.includes('data-testid="monthly-close-modal"'), 'Must define modal dialog testid')
  assert.ok(content.includes('data-testid="selected-month-label"'), 'Must define selected month label')
  assert.ok(content.includes('data-testid="btn-prev-month"'), 'Must define previous month button')
  assert.ok(content.includes('data-testid="btn-next-month"'), 'Must define next month button')
})

test('MonthlyCloseModal defines all required pre-closing checklist testids', () => {
  const modalPath = path.resolve(import.meta.dirname, '../components/monthly-close-modal.tsx')
  const content = fs.readFileSync(modalPath, 'utf8')
  assert.ok(content.includes('data-testid="pre-closing-checklist-container"'), 'Checklist container')
  assert.ok(content.includes('data-testid="checklist-status-badge"'), 'Checklist status badge')
  assert.ok(content.includes('data-testid="checklist-item-uncategorized"'), 'Checklist uncategorized item')
  assert.ok(content.includes('data-testid="checklist-item-inbox"'), 'Checklist inbox item')
  assert.ok(content.includes('data-testid="checklist-item-reconciliation"'), 'Checklist reconciliation item')
  assert.ok(content.includes('data-testid="checklist-item-bills"'), 'Checklist bills item')
  assert.ok(content.includes('data-testid="checklist-action-inbox"'), 'Checklist action inbox button')
  assert.ok(content.includes('data-testid="checklist-action-reconcile"'), 'Checklist action reconcile button')
})

test('MonthlyCloseModal defines all monthly summary card testids', () => {
  const modalPath = path.resolve(import.meta.dirname, '../components/monthly-close-modal.tsx')
  const content = fs.readFileSync(modalPath, 'utf8')
  assert.ok(content.includes('data-testid="monthly-close-summary-card"'), 'Summary card container')
  assert.ok(content.includes('data-testid="summary-income-total"'), 'Summary income total')
  assert.ok(content.includes('data-testid="summary-expense-total"'), 'Summary expense total')
  assert.ok(content.includes('data-testid="summary-net-savings"'), 'Summary net savings')
  assert.ok(content.includes('data-testid="summary-savings-badge"'), 'Summary savings badge')
  assert.ok(content.includes('data-testid="summary-reconciliation-variance"'), 'Summary variance')
})

test('MonthlyCloseModal defines period locking and reopening testids', () => {
  const modalPath = path.resolve(import.meta.dirname, '../components/monthly-close-modal.tsx')
  const content = fs.readFileSync(modalPath, 'utf8')
  assert.ok(content.includes('data-testid="btn-confirm-close-month"'), 'Close month confirm button')
  assert.ok(content.includes('data-testid="monthly-close-locked-banner"'), 'Locked period banner')
  assert.ok(content.includes('data-testid="btn-open-reopen-form"'), 'Open reopen form button')
  assert.ok(content.includes('data-testid="monthly-close-reopen-form"'), 'Reopen form container')
  assert.ok(content.includes('data-testid="reopen-audit-note-input"'), 'Reopen audit note textarea')
  assert.ok(content.includes('data-testid="btn-confirm-reopen-month"'), 'Confirm reopen month button')
  assert.ok(content.includes('data-testid="monthly-close-reopened-banner"'), 'Reopened warning banner')
  assert.ok(content.includes('data-testid="btn-reclose-month"'), 'Reclose month button')
})

// ── Group 2: Tab Saku Integration (Req 3.5) ──────────────────────────────────
console.log('\n▶ Group 2: Tab Saku Kontrol Keuangan Integration (Req 3.5)...')

test('components/tab-saku.tsx imports and integrates MonthlyCloseModal', () => {
  const tabSakuPath = path.resolve(import.meta.dirname, '../components/tab-saku.tsx')
  const content = fs.readFileSync(tabSakuPath, 'utf8')
  assert.ok(content.includes("import { MonthlyCloseModal } from '@/components/monthly-close-modal'"), 'Must import MonthlyCloseModal')
  assert.ok(content.includes('<MonthlyCloseModal'), 'Must render MonthlyCloseModal')
})

test('components/tab-saku.tsx renders implemented Tutup Bulan submenu under Kontrol Keuangan', () => {
  const tabSakuPath = path.resolve(import.meta.dirname, '../components/tab-saku.tsx')
  const content = fs.readFileSync(tabSakuPath, 'utf8')
  assert.ok(content.includes('data-testid="submenu-tutup-bulan"'), 'Must define submenu-tutup-bulan testid')
  assert.ok(content.includes('data-submenu-id="tutup-bulan"'), 'Must define data-submenu-id="tutup-bulan"')
  assert.ok(content.includes('data-implemented="true"'), 'Must be marked as data-implemented="true"')
  assert.ok(content.includes('data-testid="btn-open-monthly-close"'), 'Must define btn-open-monthly-close button')
  assert.ok(content.includes('sakukilat:open-monthly-close'), 'Must listen to sakukilat:open-monthly-close event')
})

// ── Group 3: Tab Rekapan Closed Period Indicators (Req 9.5) ───────────────────
console.log('\n▶ Group 3: Tab Rekapan Closed Period Indicators (Req 9.5)...')

test('components/tab-rekapan.tsx imports and integrates MonthlyCloseModal', () => {
  const tabRekapanPath = path.resolve(import.meta.dirname, '../components/tab-rekapan.tsx')
  const content = fs.readFileSync(tabRekapanPath, 'utf8')
  assert.ok(content.includes("import { MonthlyCloseModal } from '@/components/monthly-close-modal'"), 'Must import MonthlyCloseModal in Tab Rekapan')
  assert.ok(content.includes('<MonthlyCloseModal'), 'Must render MonthlyCloseModal in Tab Rekapan')
  assert.ok(content.includes('useMonthlyCloseStore'), 'Must use useMonthlyCloseStore')
})

test('components/tab-rekapan.tsx displays closed period badges across report views', () => {
  const tabRekapanPath = path.resolve(import.meta.dirname, '../components/tab-rekapan.tsx')
  const content = fs.readFileSync(tabRekapanPath, 'utf8')
  assert.ok(content.includes('data-testid={`closed-period-badge-${rowMonthId}`}'), 'Monthly list closed badge')
  assert.ok(content.includes('data-testid="calendar-closed-indicator"'), 'Calendar view closed indicator')
  assert.ok(content.includes('data-testid="history-closed-indicator"'), 'History view closed indicator')
  assert.ok(content.includes('data-testid="trend-closed-indicator"'), 'Trend view closed indicator')
})

// ── Group 4: Monthly Close Functional Workflow Simulation ─────────────────────
console.log('\n▶ Group 4: Monthly Close Functional Workflow Simulation (Req 9.1 - 9.4)...')

test('Workflow: Pre-closing checklist detects blockers and allows resolution', () => {
  const mockWallets = [
    { id: 'bca', label: 'BCA', type: 'bank', balance: 5000000, keywords: ['bca'] },
    { id: 'tunai', label: 'Tunai', type: 'cash', balance: 250000, keywords: ['tunai'] },
  ]
  const mockTransactions = [
    {
      id: 'tx-1',
      description: 'Makan siang',
      amount: 25000,
      type: 'expense',
      category: 'makanan',
      paymentMethod: 'bca',
      date: new Date(2026, 2, 10),
    },
    {
      id: 'tx-2',
      description: 'Barang tidak jelas',
      amount: 15000,
      type: 'expense',
      category: 'lainnya',
      paymentMethod: 'tunai',
      date: new Date(2026, 2, 15),
    },
  ]
  const mockReconciliations = [
    {
      id: 'rec-1',
      walletId: 'bca',
      reconciledAt: '2026-03-20T10:00:00Z',
      expectedBalance: 5000000,
      actualBalance: 5000000,
      difference: 0,
    },
  ]

  // Tunai is not reconciled, tx-2 is uncategorized
  const initialCheck = evaluatePreClosingChecklist({
    year: 2026,
    month: 3,
    transactions: mockTransactions,
    wallets: mockWallets,
    reconciliations: mockReconciliations,
  })

  assert.equal(initialCheck.isReadyToClose, false, 'Initial check must fail due to blockers')
  assert.equal(initialCheck.items.uncategorizedTransactions.isPassed, false, 'Uncategorized must fail')
  assert.equal(initialCheck.items.unreconciledWallets.isPassed, false, 'Unreconciled wallets must fail')

  // Resolve blockers: categorize tx-2 and reconcile Tunai
  const resolvedTransactions = [
    mockTransactions[0],
    { ...mockTransactions[1], category: 'belanja' },
  ]
  const resolvedReconciliations = [
    ...mockReconciliations,
    {
      id: 'rec-2',
      walletId: 'tunai',
      reconciledAt: '2026-03-25T10:00:00Z',
      expectedBalance: 250000,
      actualBalance: 250000,
      difference: 0,
    },
  ]

  const resolvedCheck = evaluatePreClosingChecklist({
    year: 2026,
    month: 3,
    transactions: resolvedTransactions,
    wallets: mockWallets,
    reconciliations: resolvedReconciliations,
  })

  assert.equal(resolvedCheck.isReadyToClose, true, 'Resolved check must pass')
  assert.equal(resolvedCheck.totalViolations, 0, 'Zero violations')
})

test('Workflow: Close month, verify lock, reopen with note, and reclose', () => {
  const tx = [
    { id: 't1', description: 'Gaji', amount: 8000000, type: 'income', category: 'gaji', paymentMethod: 'bca', date: new Date(2026, 2, 1) },
    { id: 't2', description: 'Belanja', amount: 3000000, type: 'expense', category: 'belanja', paymentMethod: 'bca', date: new Date(2026, 2, 5) },
  ]

  // Step 1: Create close record
  const closeRecord = createMonthlyCloseRecord({
    year: 2026,
    month: 3,
    transactions: tx,
    closedAt: '2026-03-31T23:59:59Z',
  })

  assert.equal(closeRecord.id, '2026-03')
  assert.equal(closeRecord.netSavings, 5000000)
  assert.equal(isMonthClosed('2026-03', [closeRecord]), true, 'Month must be closed')

  // Step 2: Reopen month with audit note
  const auditNote = 'Koreksi transaksi terlambat'
  const reopenedRecord = reopenMonthlyClose(closeRecord, auditNote, '2026-04-02T10:00:00Z')

  assert.equal(reopenedRecord.isReopened, true)
  assert.equal(reopenedRecord.reopenedNote, auditNote)
  assert.equal(isMonthClosed('2026-03', [reopenedRecord]), false, 'Reopened month is NOT closed')

  // Step 3: Reclose month
  const reclosedRecord = recloseMonthlyClose(reopenedRecord, {
    transactions: [
      ...tx,
      { id: 't3', description: 'Tambahan', amount: 500000, type: 'expense', category: 'belanja', paymentMethod: 'bca', date: new Date(2026, 2, 28) },
    ],
    closedAt: '2026-04-03T12:00:00Z',
  })

  assert.equal(reclosedRecord.isReopened, false)
  assert.equal(reclosedRecord.expenseTotal, 3500000)
  assert.equal(reclosedRecord.netSavings, 4500000)
  assert.equal(isMonthClosed('2026-03', [reclosedRecord]), true, 'Reclosed month is closed again')
})

// ── Summary ──
console.log('\n────────────────────────────────────────────────────────────────────────')
console.log(`Results: ${passed}/${total} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
} else {
  console.log('✅ All Task 18.4 Monthly Close UI & Tab Rekapan tests passed!')
}
