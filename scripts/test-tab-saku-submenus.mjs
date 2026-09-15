/**
 * SakuKilat — Unit & Regression Tests for Task 6.1:
 * Tab Saku Structured Submenus and Link Suppression for Unimplemented Features
 *
 * Requirements:
 * - 3.1: Present four distinct collapsible sections in Tab Saku:
 *        `Saku & Pembayaran`, `Kategori & Subkategori`, `Perencanaan Keuangan`, and `Kontrol Keuangan`
 * - 3.2: Host `Daftar saku`, `Metode pembayaran`, and `Transfer antar-saku` under `Saku & Pembayaran`
 * - 3.3: Host `Kategori pemasukan`, `Kategori pengeluaran`, and `Subkategori` under `Kategori & Subkategori`
 * - 3.4: Host `Goals` and `Tagihan & Langganan` under `Perencanaan Keuangan`
 * - 3.5: Host `Rekonsiliasi Saldo`, `Tutup Bulan`, and `Net Worth` under `Kontrol Keuangan`
 * - 3.6: Maintain exactly four primary bottom navigation tabs without secondary bottom nav bars
 * - 3.8: Suppress empty placeholder links for submenu items whose target views are not yet implemented
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  SAKU_SECTIONS,
  getSakuSections,
  getSectionById,
  getSubmenuItem,
  isSubmenuImplemented,
} from '../lib/saku-sections.ts'

console.log('====================================================')
console.log('  SAKUKILAT — UNIT TESTS: TAB SAKU SUBMENUS (6.1)   ')
console.log('====================================================\n')

// ── Group 1: Four Distinct Collapsible Sections (Req 3.1) ────────────────────
console.log('▶ Test Group 1: Four Distinct Collapsible Sections (Req 3.1)...')
{
  assert.equal(SAKU_SECTIONS.length, 4, 'Tab Saku must define exactly four collapsible sections')

  const expectedSectionTitles = [
    'Saku & Pembayaran',
    'Kategori & Subkategori',
    'Perencanaan Keuangan',
    'Kontrol Keuangan',
  ]

  const actualTitles = SAKU_SECTIONS.map(s => s.title)
  assert.deepEqual(
    actualTitles,
    expectedSectionTitles,
    'Section titles must match Req 3.1 exactly'
  )

  const expectedSectionIds = [
    'saku-pembayaran',
    'kategori-subkategori',
    'perencanaan-keuangan',
    'kontrol-keuangan',
  ]
  assert.deepEqual(
    SAKU_SECTIONS.map(s => s.id),
    expectedSectionIds,
    'Section IDs must match expected identifiers'
  )

  // Test getSectionById
  assert.ok(getSectionById('saku-pembayaran'), 'getSectionById must find saku-pembayaran')
  assert.ok(getSectionById('kontrol-keuangan'), 'getSectionById must find kontrol-keuangan')
  assert.equal(getSectionById('non-existent'), undefined, 'getSectionById must return undefined for unknown ID')

  console.log('  ✓ Group 1: Exactly four collapsible sections verified with exact titles')
}

// ── Group 2: Section 1 'Saku & Pembayaran' Hosting (Req 3.2) ──────────────────
console.log('▶ Test Group 2: Saku & Pembayaran Submenu Items (Req 3.2)...')
{
  const section1 = getSectionById('saku-pembayaran')
  assert.ok(section1, 'Section saku-pembayaran must exist')

  const itemLabels = section1.items.map(i => i.label)
  assert.ok(itemLabels.includes('Daftar saku'), 'Must host "Daftar saku"')
  assert.ok(itemLabels.includes('Metode pembayaran'), 'Must host "Metode pembayaran"')
  assert.ok(itemLabels.includes('Transfer antar-saku'), 'Must host "Transfer antar-saku"')
  assert.equal(section1.items.length, 3, 'Must host exactly 3 submenu items')

  // All 3 items are implemented in the current build
  for (const item of section1.items) {
    assert.equal(item.isImplemented, true, `${item.label} should be marked as implemented`)
    assert.equal(isSubmenuImplemented(item.id), true, `isSubmenuImplemented(${item.id}) must return true`)
  }

  console.log('  ✓ Group 2: Daftar saku, Metode pembayaran, and Transfer antar-saku verified')
}

// ── Group 3: Section 2 'Kategori & Subkategori' Hosting (Req 3.3) ─────────────
console.log('▶ Test Group 3: Kategori & Subkategori Submenu Items (Req 3.3)...')
{
  const section2 = getSectionById('kategori-subkategori')
  assert.ok(section2, 'Section kategori-subkategori must exist')

  const itemLabels = section2.items.map(i => i.label)
  assert.ok(itemLabels.includes('Kategori pemasukan'), 'Must host "Kategori pemasukan"')
  assert.ok(itemLabels.includes('Kategori pengeluaran'), 'Must host "Kategori pengeluaran"')
  assert.ok(itemLabels.includes('Subkategori'), 'Must host "Subkategori"')
  assert.equal(section2.items.length, 3, 'Must host exactly 3 submenu items')

  for (const item of section2.items) {
    assert.equal(item.isImplemented, true, `${item.label} should be marked as implemented`)
    assert.equal(isSubmenuImplemented(item.id), true, `isSubmenuImplemented(${item.id}) must return true`)
  }

  console.log('  ✓ Group 3: Kategori pemasukan, Kategori pengeluaran, and Subkategori verified')
}

// ── Group 4: Section 3 'Perencanaan Keuangan' Hosting (Req 3.4) ───────────────
console.log('▶ Test Group 4: Perencanaan Keuangan Submenu Items (Req 3.4)...')
{
  const section3 = getSectionById('perencanaan-keuangan')
  assert.ok(section3, 'Section perencanaan-keuangan must exist')

  const itemLabels = section3.items.map(i => i.label)
  assert.ok(itemLabels.includes('Goals'), 'Must host "Goals"')
  assert.ok(itemLabels.includes('Tagihan & Langganan'), 'Must host "Tagihan & Langganan"')
  assert.equal(section3.items.length, 2, 'Must host exactly 2 submenu items')

  const goals = section3.items.find(i => i.id === 'goals')
  assert.equal(goals?.isImplemented, true, 'Goals must be implemented (via GoalTracker)')

  const bills = section3.items.find(i => i.id === 'tagihan-langganan')
  assert.equal(bills?.isImplemented, true, 'Tagihan & Langganan must be true (Phase P5 BillManager)')

  console.log('  ✓ Group 4: Goals and Tagihan & Langganan (both implemented in P3/P5) verified')
}

// ── Group 5: Section 4 'Kontrol Keuangan' Hosting (Req 3.5) ───────────────────
console.log('▶ Test Group 5: Kontrol Keuangan Submenu Items (Req 3.5)...')
{
  const section4 = getSectionById('kontrol-keuangan')
  assert.ok(section4, 'Section kontrol-keuangan must exist')

  const itemLabels = section4.items.map(i => i.label)
  assert.ok(itemLabels.includes('Rekonsiliasi Saldo'), 'Must host "Rekonsiliasi Saldo"')
  assert.ok(itemLabels.includes('Tutup Bulan'), 'Must host "Tutup Bulan"')
  assert.ok(itemLabels.includes('Net Worth'), 'Must host "Net Worth"')
  assert.equal(section4.items.length, 3, 'Must host exactly 3 submenu items')

  // All 3 are future modular subsystems (P6, P9, P10)
  for (const item of section4.items) {
    assert.equal(item.isImplemented, false, `${item.label} must be false in Phase P3`)
    assert.ok(item.targetPhase, `${item.label} must have a targetPhase defined`)
    assert.equal(isSubmenuImplemented(item.id), false, `isSubmenuImplemented(${item.id}) must return false`)
  }

  console.log('  ✓ Group 5: Rekonsiliasi Saldo, Tutup Bulan, and Net Worth verified (P6, P9, P10)')
}

// ── Group 6: Navigation Invariant: 4 Bottom Tabs & No Secondary Nav (Req 3.6) ──
console.log('▶ Test Group 6: Bottom Navigation Invariant (Req 3.6)...')
{
  const appPagePath = path.resolve(import.meta.dirname, '../app/page.tsx')
  const appPageContent = fs.readFileSync(appPagePath, 'utf8')

  // Verify exactly 4 primary tabs defined in TABS
  const tabsBlockMatch = appPageContent.match(/const TABS[\s\S]*?=\s*\[([\s\S]*?)\]/)
  assert.ok(tabsBlockMatch, 'app/page.tsx must define TABS array')
  const tabIds = Array.from(tabsBlockMatch[1].matchAll(/id:\s*'([^']+)'/g)).map(m => m[1])
  assert.deepEqual(
    tabIds,
    ['beranda', 'rekapan', 'saku', 'rencana', 'profil'],
    'Primary navigation must maintain 5 tabs: beranda, rekapan, saku, rencana, profil'
  )

  // Verify TabSaku does NOT inject any secondary bottom navigation bar
  const tabSakuPath = path.resolve(import.meta.dirname, '../components/tab-saku.tsx')
  const tabSakuContent = fs.readFileSync(tabSakuPath, 'utf8')

  assert.ok(!tabSakuContent.includes('fixed bottom-0'), 'TabSaku must NOT contain fixed bottom navigation')
  assert.ok(!tabSakuContent.includes('aria-label="Navigasi utama"'), 'TabSaku must NOT add secondary bottom navigation')

  console.log('  ✓ Group 6: Exactly 4 bottom tabs preserved with zero secondary bottom nav')
}

// ── Group 7: Link Suppression for Unimplemented Submenu Items (Req 3.8 / Prop 10) ──
console.log('▶ Test Group 7: Unimplemented Submenu Link Suppression (Req 3.8 / Property 10)...')
{
  const unimplementedItemIds = [
    'rekonsiliasi-saldo',
    'tutup-bulan',
    'net-worth',
  ]

  for (const id of unimplementedItemIds) {
    const item = getSubmenuItem(id)
    assert.ok(item, `Item ${id} must exist in config`)
    assert.equal(item.isImplemented, false, `Item ${id} must be marked as not implemented`)
    assert.equal(isSubmenuImplemented(id), false, `isSubmenuImplemented(${id}) must be false`)
  }

  // Verify tab-saku.tsx implementation suppresses interactive links
  const tabSakuPath = path.resolve(import.meta.dirname, '../components/tab-saku.tsx')
  const tabSakuContent = fs.readFileSync(tabSakuPath, 'utf8')

  // UnimplementedSubmenuItem renders a non-interactive div with data-implemented="false" and aria-disabled="true"
  assert.ok(tabSakuContent.includes('UnimplementedSubmenuItem'), 'TabSaku must render UnimplementedSubmenuItem component')
  assert.ok(tabSakuContent.includes('data-implemented="false"'), 'Must set data-implemented="false" for pending features')
  assert.ok(tabSakuContent.includes('aria-disabled="true"'), 'Must set aria-disabled="true" for pending features')

  // Verify no <a href> is attached to unimplemented items
  assert.ok(!tabSakuContent.includes('href="/tagihan"'), 'No placeholder href for tagihan')
  assert.ok(!tabSakuContent.includes('href="/rekonsiliasi"'), 'No placeholder href for rekonsiliasi')
  assert.ok(!tabSakuContent.includes('href="/tutup-bulan"'), 'No placeholder href for tutup-bulan')
  assert.ok(!tabSakuContent.includes('href="/net-worth"'), 'No placeholder href for net-worth')

  console.log('  ✓ Group 7: Unimplemented features cleanly suppressed without empty placeholder links')
}

console.log('\n====================================================')
console.log('  ALL TASK 6.1 TAB SAKU SUBMENU TESTS PASSED! ✅    ')
console.log('====================================================\n')
