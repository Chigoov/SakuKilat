/**
 * SakuKilat — Saku Menu Simplification & Touch Target Ergonomics Tests (UX Remediation Phase 3)
 *
 * Acceptance Criteria Verified:
 * 1. Action buttons on Wallet card (Rekonsiliasi, Edit, Hapus) have min 40-44px touch targets.
 * 2. Delete wallet button has safe two-step confirmation flow preventing accidental deletions.
 * 3. Add wallet and "Lihat semua saku" buttons have at least 44px touch height (min-h-[44px]).
 * 4. MoneyMovePanel action buttons (Pindah, Simpan) have 44px touch height (h-11).
 * 5. Four collapsible sections maintained with sections 2, 3, 4 collapsed by default.
 * 6. Accessibility labels (aria-label) and titles preserved across all actions.
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { SAKU_SECTIONS } from '../lib/saku-sections.ts'

console.log('========================================================================')
console.log('  SAKUKILAT — SAKU MENU & TOUCH TARGET ERGONOMICS TESTS                 ')
console.log('========================================================================\n')

let total = 0
let passed = 0
let failed = 0

function test(name, fn) {
  total++
  try {
    fn()
    console.log(`  ✓ PASS: ${name}`)
    passed++
  } catch (err) {
    console.log(`  ✗ FAIL: ${name}`)
    console.error(`    → ${err.message}`)
    failed++
  }
}

// ── Group 1: Source Code Inspection of tab-saku.tsx ───────────────────────────
console.log('▶ Group 1: tab-saku.tsx Touch Target Sizes...')

const tabSakuPath = path.resolve(import.meta.dirname, '../components/tab-saku.tsx')
const tabSakuContent = fs.readFileSync(tabSakuPath, 'utf8')

test('Wallet card Rekonsiliasi button has min 40px touch dimensions', () => {
  assert.ok(
    tabSakuContent.includes('w-10 h-10 min-w-[40px] min-h-[40px]') &&
    tabSakuContent.includes('aria-label={`Rekonsiliasi ${wallet.label}`}'),
    'Rekonsiliasi button must have min 40px touch dimensions'
  )
})

test('Wallet card Edit button has min 40px touch dimensions', () => {
  assert.ok(
    tabSakuContent.includes('w-10 h-10 min-w-[40px] min-h-[40px]') &&
    tabSakuContent.includes('aria-label={`Edit ${wallet.label}`}'),
    'Edit button must have min 40px touch dimensions'
  )
})

test('Wallet card Delete button features safe two-step confirmation state', () => {
  assert.ok(
    tabSakuContent.includes('confirmDeleteWalletId === wallet.id'),
    'WalletManager implements confirmDeleteWalletId check'
  )
  assert.ok(
    tabSakuContent.includes('Hapus?'),
    'Displays "Hapus?" confirmation button'
  )
  assert.ok(
    tabSakuContent.includes('Batal hapus'),
    'Provides cancel button for deletion'
  )
})

test('Add wallet button has min 44px touch height', () => {
  assert.ok(
    tabSakuContent.includes('min-h-[44px]') && tabSakuContent.includes('Tambah Saku Baru'),
    'Add wallet button must have min-h-[44px]'
  )
})

test('Lihat semua saku toggle has min 44px touch height', () => {
  assert.ok(
    tabSakuContent.includes('min-h-[44px]') && tabSakuContent.includes('Lihat semua'),
    'View all wallets button must have min-h-[44px]'
  )
})

test('MoneyMovePanel action buttons (Pindah, Simpan) have 44px touch height (h-11)', () => {
  assert.ok(
    tabSakuContent.includes('h-11 rounded-xl bg-[var(--sk-cyan)]') &&
    tabSakuContent.includes('Pindah'),
    'Transfer button has h-11'
  )
  assert.ok(
    tabSakuContent.includes('h-11 rounded-xl bg-[var(--sk-green)]') &&
    tabSakuContent.includes('Simpan'),
    'Save money button has h-11'
  )
})

// ── Group 2: SAKU_SECTIONS Collapsible Defaults ──────────────────────────────
console.log('\n▶ Group 2: SAKU_SECTIONS Collapsible Defaults...')

test('Section 1 (Saku & Pembayaran) is defaultOpen === true', () => {
  const sec1 = SAKU_SECTIONS.find(s => s.id === 'saku-pembayaran')
  assert.ok(sec1)
  assert.equal(sec1.defaultOpen, true, 'Section 1 default open')
})

test('Sections 2, 3, and 4 are defaultOpen === false (preventing initial cognitive overload)', () => {
  const sec2 = SAKU_SECTIONS.find(s => s.id === 'kategori-subkategori')
  const sec3 = SAKU_SECTIONS.find(s => s.id === 'perencanaan-keuangan')
  const sec4 = SAKU_SECTIONS.find(s => s.id === 'kontrol-keuangan')

  assert.ok(sec2 && sec3 && sec4)
  assert.equal(sec2.defaultOpen, false, 'Section 2 default closed')
  assert.equal(sec3.defaultOpen, false, 'Section 3 default closed')
  assert.equal(sec4.defaultOpen, false, 'Section 4 default closed')
})

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────────────────────────────────────')
console.log(`Results: ${passed}/${total} passed, ${failed} failed`)

if (failed > 0) {
  console.log('❌ Some saku touch target ergonomics tests failed!')
  process.exit(1)
} else {
  console.log('✅ ALL SAKU MENU & TOUCH TARGET ERGONOMICS TESTS PASSED!')
}
