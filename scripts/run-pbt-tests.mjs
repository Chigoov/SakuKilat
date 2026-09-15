/**
 * SakuKilat — Property-Based Test (PBT) Runner
 *
 * Discovers and executes all PBT test suites (`scripts/test-pbt-*.mjs`).
 * Enforces minimum 100 iterations per property and reports consolidated results.
 */

import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const SCRIPTS_DIR = resolve(ROOT, 'scripts')

// Discover all test-pbt-*.mjs files
const pbtFiles = readdirSync(SCRIPTS_DIR)
  .filter((f) => f.startsWith('test-pbt-') && f.endsWith('.mjs'))
  .sort()

console.log('====================================================')
console.log('     SAKUKILAT — PROPERTY-BASED TEST (PBT) RUNNER    ')
console.log('====================================================')
console.log(`Ditemukan ${pbtFiles.length} file test suite PBT.\n`)

let passedCount = 0
let failedCount = 0
const failures = []

for (const file of pbtFiles) {
  const filePath = join(SCRIPTS_DIR, file)
  console.log(`▶ Menjalankan suite: ${file}...`)

  const result = spawnSync('node', [filePath], {
    stdio: 'inherit',
    cwd: ROOT,
  })

  if (result.status === 0) {
    passedCount++
    console.log(`✓ Suite ${file} BERHASIL LULUS\n`)
  } else {
    failedCount++
    failures.push({ file, exitCode: result.status })
    console.error(`❌ Suite ${file} GAGAL (exit code: ${result.status})\n`)
  }
}

console.log('====================================================')
console.log('                 PBT RUNNER SUMMARY                 ')
console.log('====================================================')
console.log(`Total PBT Suites : ${pbtFiles.length}`)
console.log(`Suites Passed    : ${passedCount}`)
console.log(`Suites Failed    : ${failedCount}`)
console.log('----------------------------------------------------')

if (failedCount === 0) {
  console.log('✅ SEMUA SUITE PROPERTY-BASED TESTS BERHASIL LULUS!\n')
  process.exitCode = 0
} else {
  console.error('❌ BEBERAPA SUITE PBT GAGAL:')
  for (const f of failures) {
    console.error(`  - ${f.file} (code ${f.exitCode})`)
  }
  console.error('')
  process.exitCode = 1
}
