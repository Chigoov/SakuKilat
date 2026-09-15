/**
 * SakuKilat — Unit & Integration Tests for Compact Payment Method Selector (Task 4.6)
 *
 * Validates:
 * - Sub-task 1: Build CompactPaymentSelector rendering the 5 compact chips + Lihat semua (N) toggle
 * - Sub-task 2: Implement slide-over or expandable drawer displaying all enabled active methods
 * - Sub-task 3: Integrate into components/manual-entry-form.tsx and components/edit-transaction-modal.tsx
 * - Requirements: 2.1, 2.2, 2.4, 2.5
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getCompactPaymentMethods,
  calculatePaymentMethodStats,
} from '../lib/payment-ranking.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

console.log('====================================================')
console.log('  SAKUKILAT — UNIT & INTEGRATION: COMPACT SELECTOR  ')
console.log('====================================================\n')

const sampleWallets = [
  { id: 'tunai', label: 'Tunai / Cash', balance: 500_000 },
  { id: 'bca', label: 'BCA', balance: 3_000_000 },
  { id: 'seabank', label: 'SeaBank', balance: 1_200_000 },
  { id: 'gopay', label: 'GoPay', balance: 250_000 },
  { id: 'ovo', label: 'OVO', balance: 180_000 },
  { id: 'dana', label: 'DANA', balance: 90_000 },
  { id: 'shopeepay', label: 'ShopeePay', balance: 75_000 },
  { id: 'jago', label: 'Bank Jago', balance: 2_500_000 },
]

// ── Test Group 1: Compact View 5-Item Bound and "Lihat semua (N)" ─────────────
console.log('▶ Test Group 1: 5-Item compact bound and "Lihat semua (N)" toggle (Req 2.1, 2.2)...')
{
  const txHistory = [
    { paymentMethod: 'gopay', date: '2026-09-01T10:00:00Z' },
    { paymentMethod: 'gopay', date: '2026-09-02T10:00:00Z' },
    { paymentMethod: 'bca', date: '2026-09-03T10:00:00Z' },
    { paymentMethod: 'tunai', date: '2026-09-04T10:00:00Z' },
    { paymentMethod: 'ovo', date: '2026-09-05T10:00:00Z' },
    { paymentMethod: 'dana', date: '2026-09-06T10:00:00Z' },
  ]

  const result = getCompactPaymentMethods({
    wallets: sampleWallets,
    transactions: txHistory,
    activeMethodId: 'bca',
    isTransferMode: false,
  })

  assert.equal(result.compactMethods.length, 5, 'Compact view must contain exactly 5 items when > 5 active wallets')
  assert.equal(result.remainingMethods.length, 3, 'Remaining methods must equal total (8) - compact (5) = 3')
  assert.equal(result.totalCount, 8, 'Total count must equal 8')

  // Verify compactMethods contains the active method 'bca'
  assert.ok(result.compactMethods.some(w => w.id === 'bca'), 'Active method BCA must be in compact methods')

  // Verify all 8 methods are distinct
  const allIds = new Set([...result.compactMethods.map(w => w.id), ...result.remainingMethods.map(w => w.id)])
  assert.equal(allIds.size, 8, 'All 8 wallets must be represented across compact and remaining')

  console.log('  ✓ 5 compact chips + 3 remaining methods verified.')
}

// ── Test Group 2: When total active wallets <= 5 ──────────────────────────────
console.log('▶ Test Group 2: When total active wallets <= 5, no "Lihat semua" needed...')
{
  const fewWallets = sampleWallets.slice(0, 4)
  const result = getCompactPaymentMethods({
    wallets: fewWallets,
    transactions: [],
    activeMethodId: 'tunai',
    isTransferMode: false,
  })

  assert.equal(result.compactMethods.length, 4, 'All 4 wallets should be in compactMethods')
  assert.equal(result.remainingMethods.length, 0, 'No remaining methods when <= 5 wallets')
  assert.equal(result.totalCount, 4, 'Total count is 4')

  console.log('  ✓ No remaining methods when total wallets <= 5.')
}

// ── Test Group 3: Expandable Drawer displays all active methods (Req 2.4) ──────
console.log('▶ Test Group 3: Expandable Drawer display of all active methods (Req 2.4)...')
{
  const result = getCompactPaymentMethods({
    wallets: sampleWallets,
    transactions: [{ paymentMethod: 'tunai', date: '2026-09-01' }],
    activeMethodId: 'tunai',
    isTransferMode: false,
  })

  // Drawer combines compactMethods and remainingMethods
  const drawerMethods = [...result.compactMethods, ...result.remainingMethods]
  assert.equal(drawerMethods.length, sampleWallets.length, 'Drawer must show all registered active wallets')

  const drawerIds = drawerMethods.map(w => w.id)
  for (const w of sampleWallets) {
    assert.ok(drawerIds.includes(w.id), `Drawer must include wallet ${w.id}`)
  }

  console.log('  ✓ Drawer reveals all 8 registered active wallets.')
}

// ── Test Group 4: Edit Mode Active Method Visibility (Req 2.5 / Property 5) ───
console.log('▶ Test Group 4: Edit Mode Active Method Visibility (Req 2.5)...')
{
  // Transaction history heavily uses other wallets
  const txHistory = [
    { paymentMethod: 'tunai', date: '2026-09-10T10:00:00Z' },
    { paymentMethod: 'tunai', date: '2026-09-11T10:00:00Z' },
    { paymentMethod: 'bca', date: '2026-09-12T10:00:00Z' },
    { paymentMethod: 'seabank', date: '2026-09-13T10:00:00Z' },
    { paymentMethod: 'gopay', date: '2026-09-14T10:00:00Z' },
    { paymentMethod: 'ovo', date: '2026-09-15T10:00:00Z' },
  ]

  // Currently editing a transaction whose method is 'jago' (never used in history)
  const result = getCompactPaymentMethods({
    wallets: sampleWallets,
    transactions: txHistory,
    activeMethodId: 'jago',
    isTransferMode: false,
  })

  assert.equal(result.compactMethods.length, 5, 'Compact methods bounded to 5')
  assert.ok(
    result.compactMethods.some(w => w.id === 'jago'),
    'Active method "jago" MUST be in visible compact methods in edit mode even if not in top 5'
  )

  console.log('  ✓ Edit mode successfully pins activeMethodId into visible compact chips.')
}

// ── Test Group 5: Transfer Mode Full Wallet List (Req 2.6 / Property 6) ───────
console.log('▶ Test Group 5: Transfer Mode Full Wallet List (Req 2.6)...')
{
  const result = getCompactPaymentMethods({
    wallets: sampleWallets,
    transactions: [],
    activeMethodId: 'tunai',
    isTransferMode: true,
  })

  assert.equal(result.compactMethods.length, sampleWallets.length, 'In transfer mode, all wallets must be in compactMethods without 5-item bound')
  assert.equal(result.remainingMethods.length, 0, 'No remaining methods in transfer mode')

  console.log('  ✓ Transfer mode presents full wallet matrix without 5-item truncation.')
}

// ── Test Group 6: Hidden Payment Methods Preservation (Req 2.7) ───────────────
console.log('▶ Test Group 6: Hidden Payment Methods Exclusion (Req 2.7)...')
{
  const hiddenIds = ['shopeepay', 'dana']
  const result = getCompactPaymentMethods({
    wallets: sampleWallets,
    transactions: [],
    activeMethodId: 'tunai',
    isTransferMode: false,
    hiddenPaymentIds: hiddenIds,
  })

  const visibleIds = [...result.compactMethods.map(w => w.id), ...result.remainingMethods.map(w => w.id)]
  assert.ok(!visibleIds.includes('shopeepay'), 'Hidden wallet shopeepay must not appear in options')
  assert.ok(!visibleIds.includes('dana'), 'Hidden wallet dana must not appear in options')
  assert.equal(result.totalCount, sampleWallets.length - 2, 'Total count must exclude hidden wallets')

  console.log('  ✓ Hidden payment methods cleanly excluded from active selection.')
}

// ── Test Group 7: Component Code Inspection (ManualEntryForm & EditTransactionModal) ─
console.log('▶ Test Group 7: Integration in forms (code inspection)...')
{
  const manualFormPath = path.join(rootDir, 'components', 'manual-entry-form.tsx')
  const editModalPath = path.join(rootDir, 'components', 'edit-transaction-modal.tsx')
  const compactSelectorPath = path.join(rootDir, 'components', 'compact-payment-selector.tsx')

  assert.ok(fs.existsSync(compactSelectorPath), 'compact-payment-selector.tsx must exist')
  assert.ok(fs.existsSync(manualFormPath), 'manual-entry-form.tsx must exist')
  assert.ok(fs.existsSync(editModalPath), 'edit-transaction-modal.tsx must exist')

  const compactSelectorContent = fs.readFileSync(compactSelectorPath, 'utf8')
  assert.ok(compactSelectorContent.includes('export const CompactPaymentSelector'), 'CompactPaymentSelector must be exported')
  assert.ok(compactSelectorContent.includes('data-testid="compact-payment-selector"'), 'Must have container testid')
  assert.ok(compactSelectorContent.includes('data-testid="compact-method-chip"'), 'Must have compact method chip testid')
  assert.ok(compactSelectorContent.includes('data-testid="toggle-all-payment-methods"'), 'Must have toggle all testid')
  assert.ok(compactSelectorContent.includes('data-testid="payment-drawer"'), 'Must have payment drawer testid')
  assert.ok(compactSelectorContent.includes('data-testid="expanded-method-chip"'), 'Must have expanded method chip testid')
  assert.ok(compactSelectorContent.includes('pushBackLayer'), 'Must integrate with back-stack navigation')

  const manualFormContent = fs.readFileSync(manualFormPath, 'utf8')
  assert.ok(manualFormContent.includes('CompactPaymentSelector'), 'manual-entry-form.tsx must use CompactPaymentSelector')
  assert.ok(!manualFormContent.includes('function WalletGrid'), 'manual-entry-form.tsx must not contain old WalletGrid')
  assert.ok(manualFormContent.includes('hiddenPaymentIds'), 'manual-entry-form.tsx must pass hiddenPaymentIds')

  const editModalContent = fs.readFileSync(editModalPath, 'utf8')
  assert.ok(editModalContent.includes('CompactPaymentSelector'), 'edit-transaction-modal.tsx must use CompactPaymentSelector')
  assert.ok(editModalContent.includes('useTransactionData'), 'edit-transaction-modal.tsx must use useTransactionData for ranking')
  assert.ok(editModalContent.includes('hiddenPaymentIds'), 'edit-transaction-modal.tsx must pass hiddenPaymentIds')

  console.log('  ✓ Integration verified: Both forms use CompactPaymentSelector with all required props.')
}

console.log('====================================================')
console.log('  ALL TASK 4.6 COMPACT SELECTOR TESTS PASSED! ✅    ')
console.log('====================================================\n')
