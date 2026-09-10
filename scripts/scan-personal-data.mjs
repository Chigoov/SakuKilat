/**
 * SK-001 — Personal/Financial Data Scan
 *
 * Checks:
 * 1. preloaded-state.json tidak boleh ada di tracked files
 * 2. Tidak ada file besar di android assets
 * 3. Tidak ada file JSON dengan banyak transaction records di tracked assets
 *
 * BATASAN & SCOPE SCANNER:
 * - Scanner ini HANYA memeriksa working tree dan tracked files pada local HEAD.
 * - Scanner ini BUKAN scanner riwayat Git (git history/commits lama masih dapat memuat blob).
 * - Scanner ini BUKAN detektor PII universal; scanner ini memeriksa aset finansial spesifik proyek.
 * - History purge membutuhkan eksekusi terpisah (misal git-filter-repo / BFG) dengan izin owner.
 *
 * Jalankan: node scripts/scan-personal-data.mjs
 */

import { execSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, basename } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
let failures = 0

function fail(msg) {
  console.error(`  ✗ FAIL: ${msg}`)
  failures++
}
function pass(msg) {
  console.log(`  ✓ PASS: ${msg}`)
}

console.log('\n🔍 SK-001 Personal Data Scan\n')

// ── Check 1: preloaded-state.json with personal data must not be tracked ──
console.log('Check 1: No personal preloaded-state.json in tracked files')
try {
  const tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' })
  const preloadedFiles = tracked.split('\n').filter(f => basename(f) === 'preloaded-state.json')
  for (const f of preloadedFiles) {
    // Personal flavor path is always blocked
    if (f.includes('/personal/')) {
      fail(`Personal flavor data file tracked: ${f}`)
      continue
    }
    // Public seed (public/preloaded-state.json) is allowed only if tiny (empty seed = {})
    const fullPath = resolve(ROOT, f)
    if (existsSync(fullPath)) {
      const size = readFileSync(fullPath).length
      if (size > 1024) {
        fail(`Suspiciously large preloaded-state.json (${(size / 1024).toFixed(0)}KB): ${f}`)
      } else {
        pass(`Public seed ${f} is ${size} bytes (OK)`)
      }
    }
  }
  if (preloadedFiles.length === 0) {
    pass('No preloaded-state.json in tracked files')
  }
} catch (e) {
  fail(`Could not list tracked files: ${e.message}`)
}

// ── Check 2: No large files in asset directories ──
console.log('\nCheck 2: No large files (>100KB) in asset directories')
const SIZE_LIMIT = 100 * 1024 // 100KB
try {
  const tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' })
  const assetFiles = tracked.split('\n').filter(f =>
    f.includes('/assets/') && f.endsWith('.json')
  )

  let largFound = false
  for (const f of assetFiles) {
    const fullPath = resolve(ROOT, f)
    if (!existsSync(fullPath)) continue
    const stat = readFileSync(fullPath)
    if (stat.length > SIZE_LIMIT) {
      fail(`Large asset file (${(stat.length / 1024).toFixed(0)}KB): ${f}`)
      largFound = true
    }
  }
  if (!largFound) {
    pass(`All tracked JSON assets under ${SIZE_LIMIT / 1024}KB`)
  }
} catch (e) {
  fail(`Could not scan asset files: ${e.message}`)
}

// ── Check 3: No JSON files with many transaction records ──
console.log('\nCheck 3: No JSON files with >100 transaction records in assets')
const TX_LIMIT = 100
try {
  const tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' })
  const jsonAssets = tracked.split('\n').filter(f =>
    f.includes('/assets/') && f.endsWith('.json')
  )

  let bulkFound = false
  for (const f of jsonAssets) {
    const fullPath = resolve(ROOT, f)
    if (!existsSync(fullPath)) continue
    try {
      const content = readFileSync(fullPath, 'utf8')
      const parsed = JSON.parse(content)
      const txCount = Array.isArray(parsed?.transactions) ? parsed.transactions.length : 0
      if (txCount > TX_LIMIT) {
        fail(`Asset contains ${txCount} transactions (limit ${TX_LIMIT}): ${f}`)
        bulkFound = true
      }
    } catch {
      // Not valid JSON, skip
    }
  }
  if (!bulkFound) {
    pass(`No tracked JSON assets exceed ${TX_LIMIT} transaction records`)
  }
} catch (e) {
  fail(`Could not scan JSON assets: ${e.message}`)
}

// ── Summary ──
console.log('\n' + '─'.repeat(50))
if (failures > 0) {
  console.error(`\n❌ ${failures} check(s) FAILED — personal data may be exposed!\n`)
  process.exitCode = 1
} else {
  console.log('\n✅ All checks passed — no personal data detected in tracked files.\n')
  process.exitCode = 0
}
