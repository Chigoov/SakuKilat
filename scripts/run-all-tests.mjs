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
    else scanPassed++
  } else {
    allPassed = false
    if (suite.type === 'regression') regressionFailed++
    else scanFailed++
    console.error(`❌ Suite "${suite.name}" gagal (exit code: ${result.status})`)
  }
}

console.log('\n====================================================')
console.log('                   RINGKASAN AKHIR                  ')
console.log('====================================================')
console.log(`Regression Test Suites : ${regressionPassed} passed, ${regressionFailed} failed`)
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
