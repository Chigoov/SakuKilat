/**
 * SK-004 — Transactional Import/Restore Regression Tests
 *
 * Menguji helper production `lib/data-restore.ts`, `lib/csv-parser.ts`, dan `lib/dedup.ts`
 * secara nyata (bukan salinan logika).
 * Jalankan: node scripts/test-import-restore.mjs
 */

import {
  planImport,
  executeImportTransaction,
  executeRollback,
  CHECKPOINT_KEY,
  GOAL_CHECKPOINT_KEY,
} from '../lib/data-restore.ts'
import { STORAGE_KEY, GOAL_STORAGE_KEY, CURRENT_SCHEMA_VERSION } from '../lib/storage.ts'

let passed = 0
let failed = 0
let total = 0

function makeStorage(initialMap = {}, options = {}) {
  const store = new Map(Object.entries(initialMap))
  return {
    getItem: (key) => store.has(key) ? store.get(key) : null,
    setItem: (key, val) => {
      if (options.failKeys && options.failKeys.includes(key)) {
        throw new Error(`Write failed for key: ${key}`)
      }
      store.set(key, String(val))
    },
    removeItem: (key) => store.delete(key),
    keys: () => [...store.keys()],
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed')
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

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

console.log('=== SK-004: Transactional Import/Restore Regression Tests (Production Code) ===\n')

const sampleValidTx = {
  id: 'tx-001',
  amount: 25000,
  type: 'expense',
  date: '2026-06-15T10:00:00.000Z',
  category: 'makanan',
  paymentMethod: 'tunai',
  description: 'Makan siang',
}

// ── Group 1: Schema & Content Validation ──
console.log('Group 1: Schema and Content Validation')

test('Valid SakuKilat backup is accepted with preview metadata', () => {
  const storage = makeStorage({ [STORAGE_KEY]: JSON.stringify({ transactions: [sampleValidTx] }) })
  const backup = JSON.stringify({
    app: 'SakuKilat',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: [sampleValidTx, { ...sampleValidTx, id: 'tx-002', amount: 50000 }],
  })
  const plan = planImport(backup, storage)
  assert(plan.valid === true, 'Plan should be valid')
  assertEqual(plan.isSakuKilatBackup, true, 'isSakuKilatBackup')
  assertEqual(plan.mode, 'replace', 'mode')
  assertEqual(plan.newTransactionCount, 2, 'newTransactionCount')
})

test('Supported old schema version (v6) is accepted', () => {
  const storage = makeStorage()
  const backup = JSON.stringify({
    app: 'SakuKilat',
    schemaVersion: 6,
    transactions: [sampleValidTx],
  })
  const plan = planImport(backup, storage)
  assert(plan.valid === true, 'Old schema version should be accepted')
})

test('Future schema version (> CURRENT_SCHEMA_VERSION) is REJECTED', () => {
  const storage = makeStorage()
  const backup = JSON.stringify({
    app: 'SakuKilat',
    schemaVersion: CURRENT_SCHEMA_VERSION + 1,
    transactions: [sampleValidTx],
  })
  const plan = planImport(backup, storage)
  assert(plan.valid === false, 'Future schema must be rejected')
  assert(plan.error.includes('lebih baru'), 'Error message must state version is newer')
})

test('Backup missing transactions array is REJECTED', () => {
  const storage = makeStorage()
  const backup = JSON.stringify({
    app: 'SakuKilat',
    schemaVersion: CURRENT_SCHEMA_VERSION,
  })
  const plan = planImport(backup, storage)
  assert(plan.valid === false, 'Missing transactions must be rejected')
})

test('Backup with empty transactions array is REJECTED', () => {
  const storage = makeStorage()
  const backup = JSON.stringify({
    app: 'SakuKilat',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: [],
  })
  const plan = planImport(backup, storage)
  assert(plan.valid === false, 'Empty transactions must be rejected')
})

test('Mixed valid and invalid transactions must be REJECTED (no silent record dropping)', () => {
  const storage = makeStorage()
  const backup = JSON.stringify({
    app: 'SakuKilat',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: [
      sampleValidTx,
      { id: 'bad-tx', amount: 'not-a-number', type: 'expense', date: '2026-06-15' },
    ],
  })
  const plan = planImport(backup, storage)
  assert(plan.valid === false, 'Corrupt transaction must reject the entire backup')
})

test('Invalid transaction fields (negative amount, bad type, bad date) must be REJECTED', () => {
  const storage = makeStorage()
  for (const [desc, badTx] of [
    ['negative amount', { ...sampleValidTx, amount: -100 }],
    ['zero amount', { ...sampleValidTx, amount: 0 }],
    ['bad type', { ...sampleValidTx, type: 'magic_coin' }],
    ['missing date', { ...sampleValidTx, date: '' }],
    ['invalid date', { ...sampleValidTx, date: 'not-a-date' }],
  ]) {
    const backup = JSON.stringify({
      app: 'SakuKilat',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      transactions: [badTx],
    })
    const plan = planImport(backup, storage)
    assert(plan.valid === false, `Field error "${desc}" must be rejected`)
  }
})

test('Duplicate transaction IDs in backup must be REJECTED', () => {
  const storage = makeStorage()
  const backup = JSON.stringify({
    app: 'SakuKilat',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: [
      { ...sampleValidTx, id: 'duplicate-id' },
      { ...sampleValidTx, id: 'duplicate-id' },
    ],
  })
  const plan = planImport(backup, storage)
  assert(plan.valid === false, 'Duplicate IDs must be rejected')
  assert(plan.error.includes('duplikat'), 'Error must mention duplicate ID')
})

// ── Group 2: Checkpoint & Multi-Key Transactional Execution ──
console.log('\nGroup 2: Checkpoint and Multi-Key Transactional Execution')

test('Checkpoint MUST preserve both primary state AND goals before modification', () => {
  const initialPrimary = JSON.stringify({ transactions: [sampleValidTx] })
  const initialGoals = JSON.stringify([{ id: 'goal-1', title: 'Liburan', target: 5000000 }])
  const storage = makeStorage({
    [STORAGE_KEY]: initialPrimary,
    [GOAL_STORAGE_KEY]: initialGoals,
  })

  const backup = JSON.stringify({
    app: 'SakuKilat',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: [{ ...sampleValidTx, id: 'tx-imported' }],
    goals: [{ id: 'goal-imported' }],
  })
  const plan = planImport(backup, storage)
  assert(plan.valid === true, 'Plan should be valid')

  const exec = executeImportTransaction(storage, plan, { confirmed: true })
  assert(exec.success === true, 'Execution should succeed')

  const checkpointRaw = storage.getItem(CHECKPOINT_KEY)
  assert(checkpointRaw !== null, 'Checkpoint must exist')
  const checkpoint = JSON.parse(checkpointRaw)
  assertEqual(checkpoint[STORAGE_KEY], initialPrimary, 'Checkpoint primary state')
  assertEqual(checkpoint[GOAL_STORAGE_KEY], initialGoals, 'Checkpoint goals')
})

test('Failure on goals write triggers full rollback of primary state', () => {
  const initialPrimary = JSON.stringify({ transactions: [sampleValidTx] })
  const initialGoals = JSON.stringify([{ id: 'goal-1' }])
  const storage = makeStorage(
    { [STORAGE_KEY]: initialPrimary, [GOAL_STORAGE_KEY]: initialGoals },
    { failKeys: [GOAL_STORAGE_KEY] }
  )

  const backup = JSON.stringify({
    app: 'SakuKilat',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: [{ ...sampleValidTx, id: 'tx-new' }],
    goals: [{ id: 'goal-new' }],
  })
  const plan = planImport(backup, storage)
  const exec = executeImportTransaction(storage, plan, { confirmed: true })

  assert(exec.success === false, 'Execution must fail when goals write throws')
  assert(exec.rollbackAttempted === true, 'Rollback must be attempted')
  assertEqual(storage.getItem(STORAGE_KEY), initialPrimary, 'Primary state must be rolled back')
  assertEqual(storage.getItem(GOAL_STORAGE_KEY), initialGoals, 'Goals must remain at pre-import value')
})

test('Rollback restores all keys (primary and goals)', () => {
  const initialPrimary = JSON.stringify({ transactions: [sampleValidTx] })
  const initialGoals = JSON.stringify([{ id: 'goal-original' }])
  const storage = makeStorage({
    [STORAGE_KEY]: initialPrimary,
    [GOAL_STORAGE_KEY]: initialGoals,
  })

  const backup = JSON.stringify({
    app: 'SakuKilat',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: [{ ...sampleValidTx, id: 'tx-imported' }],
    goals: [{ id: 'goal-imported' }],
  })
  const plan = planImport(backup, storage)
  executeImportTransaction(storage, plan, { confirmed: true })

  const rollbackResult = executeRollback(storage)
  assert(rollbackResult.success === true, 'Rollback should succeed')
  assertEqual(storage.getItem(STORAGE_KEY), initialPrimary, 'Primary must match pre-import')
  assertEqual(storage.getItem(GOAL_STORAGE_KEY), initialGoals, 'Goals must match pre-import')
})

// ── Group 3: Confirmation & Mode Safety ──
console.log('\nGroup 3: Confirmation and Mode Safety')

test('Replace mode fails if not explicitly confirmed (confirmed: false or omitted)', () => {
  const initialPrimary = JSON.stringify({ transactions: [sampleValidTx] })
  const storage = makeStorage({ [STORAGE_KEY]: initialPrimary })

  const backup = JSON.stringify({
    app: 'SakuKilat',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: [{ ...sampleValidTx, id: 'tx-replace' }],
  })
  const plan = planImport(backup, storage)
  assert(plan.mode === 'replace', 'Backup must be replace mode')

  const unconfirmed = executeImportTransaction(storage, plan, { confirmed: false })
  assert(unconfirmed.success === false, 'Unconfirmed replace must be rejected')
  assertEqual(storage.getItem(STORAGE_KEY), initialPrimary, 'Storage must not be touched')
})

test('User cancel does not modify storage or execute import', () => {
  const initialPrimary = JSON.stringify({ transactions: [sampleValidTx] })
  const storage = makeStorage({ [STORAGE_KEY]: initialPrimary })

  const backup = JSON.stringify({
    app: 'SakuKilat',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: [{ ...sampleValidTx, id: 'tx-cancelled' }],
  })
  const plan = planImport(backup, storage)
  assert(plan.valid === true, 'Plan should be valid')
  assertEqual(storage.getItem(STORAGE_KEY), initialPrimary, 'Storage remains untouched on user cancel')
})

test('Failure on primary write triggers rollback and restores pre-import data', () => {
  const initialPrimary = JSON.stringify({ transactions: [sampleValidTx] })
  let writeCount = 0
  const store = new Map([[STORAGE_KEY, initialPrimary]])
  const storage = {
    getItem: (key) => store.get(key) || null,
    setItem: (key, val) => {
      if (key === STORAGE_KEY) {
        writeCount++
        if (writeCount === 1) {
          throw new Error('Disk quota exceeded on primary write')
        }
      }
      store.set(key, val)
    },
    removeItem: (key) => store.delete(key),
    keys: () => [...store.keys()],
  }

  const backup = JSON.stringify({
    app: 'SakuKilat',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: [{ ...sampleValidTx, id: 'tx-fail-write' }],
  })
  const plan = planImport(backup, storage)
  const exec = executeImportTransaction(storage, plan, { confirmed: true })
  assert(exec.success === false, 'Execution must fail on write error')
  assert(exec.rollbackAttempted === true, 'Rollback must be attempted')
  assertEqual(storage.getItem(STORAGE_KEY), initialPrimary, 'Storage must be restored after primary write error')
})

test('Rollback failure is safely caught and reported without silent success', () => {
  const initialPrimary = JSON.stringify({ transactions: [sampleValidTx] })
  const storage = {
    getItem: (key) => {
      if (key === CHECKPOINT_KEY) return 'INVALID_NON_JSON_CORRUPT_CHECKPOINT'
      return initialPrimary
    },
    setItem: () => {},
    removeItem: () => {},
  }

  const rollback = executeRollback(storage)
  assert(rollback.success === false, 'Rollback should report failure when checkpoint is corrupted')
})

// ── Group 4: CSV Validation Strictness (RFC 4180 & Indonesian Data) ──
console.log('\nGroup 4: CSV Validation Strictness')

test('CSV with comma inside quoted fields parses correctly', () => {
  const storage = makeStorage()
  const csv = 'tanggal,tipe,deskripsi,nominal,kategori\n2026-06-20,keluar,"Kopi, roti, dan snack",35000,makanan'
  const plan = planImport(csv, storage, { isCsv: true })
  assert(plan.valid === true, 'CSV with comma in quotes must parse')
  assertEqual(plan.transactions[0].description, 'Kopi, roti, dan snack', 'Quoted description preserved')
  assertEqual(plan.transactions[0].amount, 35000, 'Amount parsed')
})

test('CSV with escaped double quotes ("") parses correctly', () => {
  const storage = makeStorage()
  const csv = 'tanggal,tipe,deskripsi,nominal,kategori\n2026-06-20,keluar,"Buku ""Pemrograman Modern"" edisi 2",150000,pendidikan'
  const plan = planImport(csv, storage, { isCsv: true })
  assert(plan.valid === true, 'CSV with escaped double quotes must parse')
  assertEqual(plan.transactions[0].description, 'Buku "Pemrograman Modern" edisi 2', 'Escaped quotes unescaped correctly')
})

test('CSV with CRLF and LF endings parses identically', () => {
  const storage = makeStorage()
  const crlfCsv = "tanggal,tipe,deskripsi,nominal\r\n2026-06-21,masuk,Gaji,5000000\r\n2026-06-22,keluar,Listrik,250000"
  const lfCsv = "tanggal,tipe,deskripsi,nominal\n2026-06-21,masuk,Gaji,5000000\n2026-06-22,keluar,Listrik,250000"

  const planCrlf = planImport(crlfCsv, storage, { isCsv: true })
  const planLf = planImport(lfCsv, storage, { isCsv: true })

  assert(planCrlf.valid === true, 'CRLF valid')
  assert(planLf.valid === true, 'LF valid')
  assertEqual(planCrlf.transactions.length, 2, 'CRLF 2 txs')
  assertEqual(planLf.transactions.length, 2, 'LF 2 txs')
})

test('CSV with zero, negative, empty, or non-numeric amounts REJECTS entire file with row info', () => {
  const storage = makeStorage()
  const badCsv = "tanggal,tipe,deskripsi,nominal\n2026-06-21,masuk,Gaji,0\n2026-06-22,keluar,Minus,-50000\n2026-06-23,keluar,Kosong,\n2026-06-24,keluar,Huruf,limapuluhribu"
  const plan = planImport(badCsv, storage, { isCsv: true })
  assert(plan.valid === false, 'All invalid amounts must be rejected')
  assert(plan.details && plan.details.length === 4, 'Details must contain exactly 4 errors')
  assert(plan.details[0].includes('Baris 2'), 'Must cite Baris 2')
  assert(plan.details[1].includes('Baris 3'), 'Must cite Baris 3')
  assert(plan.details[2].includes('Baris 4'), 'Must cite Baris 4')
  assert(plan.details[3].includes('Baris 5'), 'Must cite Baris 5')
})

test('CSV with empty or invalid date REJECTS file without defaulting to today', () => {
  const storage = makeStorage()
  const badDateCsv = "tanggal,tipe,deskripsi,nominal\n,masuk,Gaji,5000000\nnot-a-date,keluar,Listrik,250000"
  const plan = planImport(badDateCsv, storage, { isCsv: true })
  assert(plan.valid === false, 'Bad dates must be rejected')
  assert(plan.details && plan.details.length === 2, 'Must have 2 date errors')
  assert(plan.details[0].includes('Baris 2') && plan.details[0].toLowerCase().includes('tanggal kosong'), 'Empty date error')
  assert(plan.details[1].includes('Baris 3') && plan.details[1].toLowerCase().includes('tidak valid'), 'Invalid date error')
})

test('CSV with empty or unrecognized type REJECTS file without defaulting to expense', () => {
  const storage = makeStorage()
  const badTypeCsv = "tanggal,tipe,deskripsi,nominal\n2026-06-21,,Gaji,5000000\n2026-06-22,magic_transfer,Listrik,250000"
  const plan = planImport(badTypeCsv, storage, { isCsv: true })
  assert(plan.valid === false, 'Bad types must be rejected')
  assert(plan.details && plan.details.length === 2, 'Must have 2 type errors')
  assert(plan.details[0].toLowerCase().includes('tipe transaksi kosong'), 'Empty type error')
  assert(plan.details[1].toLowerCase().includes('tidak dikenal'), 'Unrecognized type error')
})

test('CSV missing required headers is REJECTED', () => {
  const storage = makeStorage()
  const missingHeaderCsv = "deskripsi,kategori,dompet\nBeli bensin,transport,tunai"
  const plan = planImport(missingHeaderCsv, storage, { isCsv: true })
  assert(plan.valid === false, 'Missing required headers must reject')
  assert(plan.error.includes('Header wajib tidak ditemukan'), 'Must state missing headers')
})

test('CSV with unclosed quote at EOF is REJECTED with line number', () => {
  const storage = makeStorage()
  const unclosedCsv = 'tanggal,tipe,deskripsi,nominal\n2026-06-21,keluar,"Kopi tanpa tutup,25000'
  const plan = planImport(unclosedCsv, storage, { isCsv: true })
  assert(plan.valid === false, 'Unclosed quote must be rejected')
  assert(plan.error.includes('Tanda kutip ganda tidak ditutup'), 'Must mention unclosed quote')
})

test('CSV with column count mismatch is REJECTED', () => {
  const storage = makeStorage()
  const mismatchCsv = "tanggal,tipe,deskripsi,nominal\n2026-06-21,keluar,Kopi,25000,ekstra_kolom"
  const plan = planImport(mismatchCsv, storage, { isCsv: true })
  assert(plan.valid === false, 'Column count mismatch must reject')
  assert(plan.details[0].includes('jumlah kolom'), 'Must report column mismatch')
})

test('CSV with duplicate headers is REJECTED', () => {
  const storage = makeStorage()
  const dupHeaderCsv = "tanggal,tipe,nominal,nominal\n2026-06-21,keluar,25000,25000"
  const plan = planImport(dupHeaderCsv, storage, { isCsv: true })
  assert(plan.valid === false, 'Duplicate headers must reject')
  assert(plan.error.includes('Header duplikat ditemukan'), 'Must report duplicate headers')
})

test('SakuKilat exported CSV round-trip retains exact values and types', () => {
  const storage = makeStorage()
  const exportedCsv = [
    'tanggal,tipe,deskripsi,nominal,kategori,subkategori,dompet',
    '2026-06-21T03:00:00.000Z,masuk,Gaji Bulanan,5000000,gaji,,bca',
    '2026-06-22T08:30:00.000Z,keluar,"Makan siang, es teh",35000,makanan,warteg,tunai',
  ].join('\n')

  const plan = planImport(exportedCsv, storage, { isCsv: true })
  assert(plan.valid === true, 'Exported CSV must be accepted')
  assertEqual(plan.transactions.length, 2, '2 transactions parsed')
  assertEqual(plan.transactions[0].type, 'income', 'Type parsed as income')
  assertEqual(plan.transactions[0].amount, 5000000, 'Income amount correct')
  assertEqual(plan.transactions[1].type, 'expense', 'Type parsed as expense')
  assertEqual(plan.transactions[1].amount, 35000, 'Expense amount correct')
  assertEqual(plan.transactions[1].description, 'Makan siang, es teh', 'Quoted description intact')
})

// ── Group 5: Merge Deduplication Safety ──
console.log('\nGroup 5: Merge Deduplication Safety')

test('First CSV import adds transactions; second identical import adds 0 transactions', () => {
  const storage = makeStorage()
  const csv = "tanggal,tipe,deskripsi,nominal,kategori,subkategori,dompet\n2026-06-25,keluar,Belanja Bulanan,350000,belanja,,bca"

  // 1. First import
  const plan1 = planImport(csv, storage, { isCsv: true })
  assert(plan1.valid === true, 'First plan valid')
  assertEqual(plan1.newTransactionCount, 1, 'First plan detects 1 new transaction')
  const exec1 = executeImportTransaction(storage, plan1, { confirmed: true })
  assert(exec1.success === true && exec1.addedCount === 1, 'First import adds 1 transaction')

  // Check state after first import
  const stateAfter1 = storage.getItem(STORAGE_KEY)
  const txsAfter1 = JSON.parse(stateAfter1).transactions
  assertEqual(txsAfter1.length, 1, 'Storage has 1 transaction')

  // 2. Second identical import
  const plan2 = planImport(csv, storage, { isCsv: true })
  assert(plan2.valid === true, 'Second plan valid')
  assertEqual(plan2.newTransactionCount, 0, 'Second plan detects 0 new transactions')
  assertEqual(plan2.duplicateCount, 1, 'Second plan detects 1 duplicate')

  const exec2 = executeImportTransaction(storage, plan2, { confirmed: true })
  assert(exec2.success === true, 'Execution returns success')
  assertEqual(exec2.noNewTransactions, true, 'noNewTransactions flag is true')
  assertEqual(exec2.addedCount, 0, 'addedCount is 0')
  assertEqual(storage.getItem(STORAGE_KEY), stateAfter1, 'Storage was NOT modified on duplicate import')
})

test('Internal duplicates within the same import file are saved only once', () => {
  const storage = makeStorage()
  const csvWithDupes = [
    'tanggal,tipe,deskripsi,nominal,kategori',
    '2026-06-26,keluar,Parkir Mall,5000,transport',
    '2026-06-26,keluar,Parkir Mall,5000,transport', // Internal duplicate
    '2026-06-26,keluar,Parkir Mall,5000,transport', // Internal duplicate
  ].join('\n')

  const plan = planImport(csvWithDupes, storage, { isCsv: true })
  assert(plan.valid === true, 'Plan valid')
  assertEqual(plan.newTransactionCount, 1, 'Only 1 unique new transaction')
  assertEqual(plan.internalDuplicateCount, 2, '2 internal duplicates detected')

  const exec = executeImportTransaction(storage, plan, { confirmed: true })
  assert(exec.success === true, 'Import succeeds')
  assertEqual(exec.addedCount, 1, 'Exactly 1 transaction added')

  const updated = JSON.parse(storage.getItem(STORAGE_KEY))
  assertEqual(updated.transactions.length, 1, 'Only 1 transaction in storage')
})

test('Genuinely different transactions are added alongside existing ones', () => {
  const existingTx = {
    id: 'tx-existing',
    date: '2026-06-25T00:00:00.000Z',
    type: 'expense',
    description: 'Bensin Motor',
    amount: 25000,
    category: 'transport',
    paymentMethod: 'tunai',
  }
  const storage = makeStorage({ [STORAGE_KEY]: JSON.stringify({ transactions: [existingTx] }) })

  const csv = [
    'tanggal,tipe,deskripsi,nominal,kategori',
    '2026-06-25,keluar,Bensin Motor,25000,transport', // duplicate
    '2026-06-25,keluar,Makan Siang,30000,makanan',     // NEW
  ].join('\n')

  const plan = planImport(csv, storage, { isCsv: true })
  assert(plan.valid === true, 'Plan valid')
  assertEqual(plan.newTransactionCount, 1, '1 new transaction')
  assertEqual(plan.duplicateCount, 1, '1 duplicate')

  const exec = executeImportTransaction(storage, plan, { confirmed: true })
  assert(exec.success === true, 'Import succeeds')
  assertEqual(exec.addedCount, 1, '1 added')

  const updated = JSON.parse(storage.getItem(STORAGE_KEY))
  assertEqual(updated.transactions.length, 2, 'Storage now has 2 transactions')
})

test('Replace mode does not lose official backup transactions due to merge dedup', () => {
  const tx1 = { ...sampleValidTx, id: 'tx-001' }
  const tx2 = { ...sampleValidTx, id: 'tx-002', description: 'Makan siang' } // same content, different id
  const storage = makeStorage()

  const backup = JSON.stringify({
    app: 'SakuKilat',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: [tx1, tx2],
  })

  const plan = planImport(backup, storage)
  assert(plan.mode === 'replace', 'Mode must be replace')
  assertEqual(plan.newTransactionCount, 2, 'Replace mode preserves both transactions')

  const exec = executeImportTransaction(storage, plan, { confirmed: true })
  assert(exec.success === true, 'Replace succeeds')
  assertEqual(exec.addedCount, 2, 'Both transactions restored')

  const updated = JSON.parse(storage.getItem(STORAGE_KEY))
  assertEqual(updated.transactions.length, 2, 'All 2 transactions exist in storage')
})

// ── Summary ──
console.log('\n' + '─'.repeat(50))
console.log(`Results: ${passed}/${total} passed, ${failed} failed\n`)

if (failed > 0) {
  console.error(`❌ Test failure: ${failed} tests failed.\n`)
  process.exitCode = 1
} else {
  console.log('✅ All SK-004 import/restore and dedup regression tests passed!\n')
  process.exitCode = 0
}
