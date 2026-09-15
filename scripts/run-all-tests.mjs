/**
 * SakuKilat — Unified Test & Security Gate Runner
 *
 * Runs:
 * 1. Budget hierarchy logic tests
 * 2. SK-003: Storage corruption recovery tests (Production lib/storage.ts)
 * 3. SK-004: Transactional restore tests (Production lib/data-restore.ts)
 * 4. SK-001: Personal data exposure scanner
 *
 * Clearly distinguishes regression tests from scanner security checks.
 */

import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')

const testSuites = [
  {
    name: 'Logika Budget Hierarkis',
    script: 'scripts/test-budget-logic.mjs',
    type: 'regression',
  },
  {
    name: 'SK-003: Storage Corruption Recovery',
    script: 'scripts/test-storage-corruption.mjs',
    type: 'regression',
  },
  {
    name: 'Future Schema Safety & Recovery',
    script: 'scripts/test-future-schema-safety.mjs',
    type: 'regression',
  },
  {
    name: 'SK-004: Transactional Restore',
    script: 'scripts/test-import-restore.mjs',
    type: 'regression',
  },
  {
    name: 'Sublayer Navigation Back Stack',
    script: 'scripts/test-navigation-stack.mjs',
    type: 'regression',
  },
  {
    name: 'Live Rupiah Formatting & Parsing',
    script: 'scripts/test-amount-rupiah.mjs',
    type: 'regression',
  },
  {
    name: 'Phase P1: Transaction Date-Time & Conversions',
    script: 'scripts/test-transaction-datetime.mjs',
    type: 'regression',
  },
  {
    name: 'Transaction Item & Edit Modal (Task 2.4)',
    script: 'scripts/test-transaction-item-modal.mjs',
    type: 'regression',
  },
  {
    name: 'Storage Date Preservation & Isolation',
    script: 'scripts/test-storage-date-preservation.mjs',
    type: 'regression',
  },
  {
    name: 'Phase P2: Payment Method Ranking (Task 4.1)',
    script: 'scripts/test-payment-ranking.mjs',
    type: 'regression',
  },
  {
    name: 'Phase P2: Compact Payment Selector & Drawer (Task 4.6)',
    script: 'scripts/test-compact-payment-selector.mjs',
    type: 'regression',
  },
  {
    name: 'Tab Saku Structured Submenus (Task 6.1)',
    script: 'scripts/test-tab-saku-submenus.mjs',
    type: 'regression',
  },
  {
    name: 'Subcategory Badge Flex-Wrap Layout (Task 6.2)',
    script: 'scripts/test-subcategory-flex-wrap.mjs',
    type: 'regression',
  },
  {
    name: 'Phase P4: Native Widget Snapshot & Storage Bridge (Task 8.1)',
    script: 'scripts/test-widget-snapshot.mjs',
    type: 'regression',
  },
  {
    name: 'Phase P4: Android Native AppWidgetProvider & Layouts (Task 8.3)',
    script: 'scripts/test-widget-provider.mjs',
    type: 'regression',
  },
  {
    name: 'Phase P4: Android Manifest, Widget Info & Capacitor Bridge (Task 8.5)',
    script: 'scripts/test-widget-manifest-bridge.mjs',
    type: 'regression',
  },
  {
    name: 'Phase P5: Bill and Subscription Center (Task 10.1)',
    script: 'scripts/test-bills-logic.mjs',
    type: 'regression',
  },
  {
    name: 'Phase P5: Bill Management UI & Confirmation Modal (Task 10.4)',
    script: 'scripts/test-bill-manager.mjs',
    type: 'regression',
  },
  {
    name: 'Phase P6: Wallet Balance Reconciliation (Task 12.1)',
    script: 'scripts/test-reconciliation.mjs',
    type: 'regression',
  },
  {
    name: 'Phase P6: Reconciliation UI Modal & Wallet Badges (Task 12.4)',
    script: 'scripts/test-reconciliation-ui.mjs',
    type: 'regression',
  },
  {
    name: 'Phase P7: Goal Planner Core Logic (Task 14.1)',
    script: 'scripts/test-goals-logic.mjs',
    type: 'regression',
  },
  {
    name: 'Phase P7: Goal Planner UI & Non-Duplicating Allocations (Task 14.4)',
    script: 'scripts/test-goal-planner-ui.mjs',
    type: 'regression',
  },
  {
    name: 'Phase P8: Local Categorization Rules & Inbox Review (Task 16.1)',
    script: 'scripts/test-rules-inbox.mjs',
    type: 'regression',
  },
  {
    name: 'Phase P8: Inbox Review UI & Rule Creation Prompt (Task 16.4)',
    script: 'scripts/test-inbox-review-ui.mjs',
    type: 'regression',
  },
  {
    name: 'Phase P9: Monthly Financial Close Validator & Summary (Task 18.1)',
    script: 'scripts/test-monthly-close.mjs',
    type: 'regression',
  },
  {
    name: 'Phase P9: Monthly Close UI & Tab Rekapan Indicators (Task 18.4)',
    script: 'scripts/test-monthly-close-ui.mjs',
    type: 'regression',
  },
  {
    name: 'Phase P10: Net Worth Calculator & Debt Liability Ledger (Task 20.1)',
    script: 'scripts/test-net-worth.mjs',
    type: 'regression',
  },
  {
    name: 'Phase P10: Net Worth UI Panel & Debt Tracking (Task 20.3)',
    script: 'scripts/test-net-worth-ui.mjs',
    type: 'regression',
  },
  {
    name: 'Phase P11: Split Transaction Validator & Distribution Engine (Task 22.1)',
    script: 'scripts/test-split-transaction.mjs',
    type: 'regression',
  },
  {
    name: 'Phase P11: Split Line Item Editor UI & Form Integration (Task 22.3)',
    script: 'scripts/test-split-transaction-ui.mjs',
    type: 'regression',
  },
  {
    name: 'Phase P11: Tab Rekapan Split Line Item Aggregation (Task 22.4)',
    script: 'scripts/test-rekapan-split-aggregation.mjs',
    type: 'regression',
  },
  {
    name: 'Jejak Kategori Setahun Analytics',
    script: 'scripts/test-category-yearly.mjs',
    type: 'regression',
  },
  {
    name: 'Universal Transaction Filter Logic',
    script: 'scripts/test-filter-logic.mjs',
    type: 'regression',
  },
  {
    name: 'Cashflow Summary, Insights & Yearly Comparison',
    script: 'scripts/test-cashflow-insights.mjs',
    type: 'regression',
  },
  {
    name: 'Rollback Safety & App Key Compatibility',
    script: 'scripts/test-rollback-safety.mjs',
    type: 'regression',
  },
  {
    name: 'Android Hardware Back Flow & Double-Tap Exit',
    script: 'scripts/test-back-stack-flow.mjs',
    type: 'regression',
  },
  {
    name: 'Category & Subcategory Deduplication',
    script: 'scripts/test-category-deduplication.mjs',
    type: 'regression',
  },
  {
    name: 'Onboarding Tour Persistence & Storage Cleanup',
    script: 'scripts/test-onboarding-persistence.mjs',
    type: 'regression',
  },
  {
    name: 'Manual Entry Date Visibility & Accessibility',
    script: 'scripts/test-manual-entry-date-accessibility.mjs',
    type: 'regression',
  },
  {
    name: 'Home Layout Simplification & Zero Overflow',
    script: 'scripts/test-home-layout-overflow.mjs',
    type: 'regression',
  },
  {
    name: 'Saku Menu Simplification & Touch Targets',
    script: 'scripts/test-saku-touch-targets.mjs',
    type: 'regression',
  },
  {
    name: 'Calendar Boundary Dates & Consistency',
    script: 'scripts/test-calendar-boundary-dates.mjs',
    type: 'regression',
  },
  {
    name: 'Five-Tab Navigation Structure & Sequence (P1)',
    script: 'scripts/test-navigation-five-tabs.mjs',
    type: 'regression',
  },
  {
    name: 'Tab Rencana Integration & Modules (P1)',
    script: 'scripts/test-rencana-tab-integration.mjs',
    type: 'regression',
  },
  {
    name: 'Mobile Nav Touch Targets & Viewport Bounded (P1)',
    script: 'scripts/test-mobile-nav-touch-targets.mjs',
    type: 'regression',
  },
  {
    name: 'Baseline Preservation: Submenus & Bugfixes (Task 2)',
    script: 'scripts/test-preservation-submenus-and-bugfixes.mjs',
    type: 'regression',
  },
  {
    name: 'Property-Based Tests (fast-check Harness)',
    script: 'scripts/run-pbt-tests.mjs',
    type: 'pbt',
  },
  {
    name: 'SK-001: Scanner Data Personal & Finansial',
    script: 'scripts/scan-personal-data.mjs',
    type: 'security-scan',
  },
]

console.log('====================================================')
console.log('       SAKUKILAT — VERIFIKASI TEST & SECURITY       ')
console.log('====================================================\n')

let regressionPassed = 0
let regressionFailed = 0
let pbtPassed = 0
let pbtFailed = 0
let scanPassed = 0
let scanFailed = 0
let allPassed = true

for (const suite of testSuites) {
  console.log(`\n▶ Menjalankan [${suite.type}]: ${suite.name}...`)
  console.log('─'.repeat(52))

  const result = spawnSync('node', [resolve(ROOT, suite.script)], {
    stdio: 'inherit',
    cwd: ROOT,
  })

  if (result.status === 0) {
    if (suite.type === 'regression') regressionPassed++
    else if (suite.type === 'pbt') pbtPassed++
    else scanPassed++
  } else {
    allPassed = false
    if (suite.type === 'regression') regressionFailed++
    else if (suite.type === 'pbt') pbtFailed++
    else scanFailed++
    console.error(`❌ Suite "${suite.name}" gagal (exit code: ${result.status})`)
  }
}

console.log('\n====================================================')
console.log('                   RINGKASAN AKHIR                  ')
console.log('====================================================')
console.log(`Regression Test Suites : ${regressionPassed} passed, ${regressionFailed} failed`)
console.log(`Property-Based Suites  : ${pbtPassed} passed, ${pbtFailed} failed`)
console.log(`Security Scanner Suites: ${scanPassed} passed, ${scanFailed} failed`)
console.log('----------------------------------------------------')
console.log('Catatan: Hasil scanner (SK-001) adalah security check,')
console.log('bukan regression test fungsional.\n')

if (allPassed) {
  console.log('✅ SEMUA TEST DAN SCANNER BERHASIL LULUS!\n')
  process.exitCode = 0
} else {
  console.error('❌ BEBERAPA SUITE GAGAL. Periksa log di atas.\n')
  process.exitCode = 1
}
