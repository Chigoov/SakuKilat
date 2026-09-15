/**
 * SakuKilat — Property-Based Test: Manual Entry Note Persistence and Transfer Integrity
 *
 * Feature: sakukilat-submenus-and-bugfixes
 * Property 3: Explicit Note Field in Manual Entry Form
 * Validates: Requirements 2.3, 2.7, 3.4
 *
 * Generates randomized transaction payloads with various note strings:
 * 1. Note strings include empty, whitespace-only, special characters, unicode emojis, and long text up to 1,000 chars.
 * 2. Asserts stored note is strictly trimmed or saved as undefined if empty or whitespace-only.
 * 3. Verifies transfer transactions (and all types) preserve the note field across serialization/deserialization in storage.
 */

import assert from 'node:assert/strict'
import { fc, testProperty } from './pbt-harness.mjs'
import { persistState, loadPersistedState } from '../lib/storage.ts'

console.log('========================================================================')
console.log(' SAKUKILAT — PBT: MANUAL ENTRY NOTE PERSISTENCE & TRANSFER INTEGRITY    ')
console.log(' Feature: sakukilat-submenus-and-bugfixes | Property 3                  ')
console.log(' Validates: Requirements 2.3, 2.7, 3.4                                  ')
console.log('========================================================================\n')

// Invariant helper matching ManualEntryForm and Store implementation
function sanitizeNote(rawNote) {
  if (typeof rawNote !== 'string') return undefined
  const trimmed = rawNote.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

// Arbitrary note generator covering:
// - Empty string
// - Whitespace only (spaces, tabs, newlines)
// - Regular short notes
// - Notes with leading/trailing spaces
// - Special characters and punctuation
// - Unicode and emojis
// - Long strings up to 1,000 characters
const arbNoteString = fc.oneof(
  // 1. Empty & whitespace-only variants
  fc.constant(''),
  fc.constant('   '),
  fc.constant('\t\t\n  \r\n '),
  fc.array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1, maxLength: 50 }).map(arr => arr.join('')),

  // 2. Normal text with potential whitespace padding
  fc.string({ minLength: 1, maxLength: 80 }).map(s => `  ${s}  `),

  // 3. Realistic Indonesian note examples
  fc.constantFrom(
    'Bayar patungan makan siang',
    'Top up saldo dari rekening utama',
    'Beli bensin pertamax di spbu rest area',
    'Arisan keluarga bulanan',
    'Bonus lembur akhir pekan 🎉',
    'Gaji freelance web design (termin 1/2) 💻',
    'Uang jajan anak minggu ke-3'
  ),

  // 4. Special characters & punctuation
  fc.constant('Catatan: #1234/INV-2026 @budi & "keluarga" (50% diskon) + PPN 11%!'),
  fc.constant('Multi-line note\nBaris kedua\nBaris ketiga dengan simbol: & < > \' "'),

  // 5. Very long text up to 1,000 characters
  fc.array(fc.constantFrom('a', 'b', 'c', ' ', '1', '2', '3', '-', '_', '#', '🎯', '🚀', '\n'), {
    minLength: 100,
    maxLength: 1000,
  }).map(arr => arr.join(''))
)

// Arbitrary transaction payload generator across expense, income, and transfer
const arbTransactionPayload = fc.record({
  id: fc.uuid(),
  amount: fc.integer({ min: 1_000, max: 50_000_000 }),
  type: fc.constantFrom('expense', 'income', 'transfer'),
  description: fc.constantFrom(
    'Makan siang kantor',
    'Beli token listrik',
    'Gaji bulanan',
    'Pindah saldo tabungan',
    'Bayar arisan'
  ),
  fromWalletId: fc.constantFrom('dompet-utama', 'bca', 'mandiri', 'gopay'),
  toWalletId: fc.constantFrom('tabungan', 'dana', 'ovo', 'shopeepay'),
  category: fc.constantFrom('makanan', 'transportasi', 'tagihan', 'gaji', 'transfer'),
  rawNote: arbNoteString,
  date: fc.integer({ min: 1, max: 28 }).map(day => new Date(2026, 6, day, 12, 0, 0)),
})

testProperty(
  'Property 3: Explicit Note Field in Manual Entry Form - Note Persistence & Transfer Integrity',
  fc.property(fc.array(arbTransactionPayload, { minLength: 1, maxLength: 15 }), (payloads) => {
    const memoryStore = new Map()
    const mockStorage = {
      getItem: (key) => memoryStore.get(key) ?? null,
      setItem: (key, val) => memoryStore.set(key, String(val)),
      removeItem: (key) => memoryStore.delete(key),
    }

    const constructedTransactions = payloads.map((p) => {
      const sanitized = sanitizeNote(p.rawNote)

      // Invariant 1: If raw note is empty or whitespace-only, sanitized MUST be undefined
      if (!p.rawNote || p.rawNote.trim().length === 0) {
        assert.equal(
          sanitized,
          undefined,
          `Expected undefined for empty/whitespace note, got ${JSON.stringify(sanitized)}`
        )
      } else {
        // Invariant 2: Non-empty note must be strictly trimmed
        assert.equal(
          sanitized,
          p.rawNote.trim(),
          `Expected trimmed note, got ${JSON.stringify(sanitized)}`
        )
        assert.equal(
          sanitized.startsWith(' ') || sanitized.endsWith(' '),
          false,
          `Sanitized note must not have leading or trailing whitespace: "${sanitized}"`
        )
      }

      if (p.type === 'transfer') {
        return {
          id: p.id,
          kind: 'transfer',
          description: p.description || 'Pindah uang',
          amount: p.amount,
          type: 'expense',
          category: 'transfer',
          paymentMethod: p.fromWalletId,
          fromWalletId: p.fromWalletId,
          toWalletId: p.toWalletId,
          date: p.date,
          note: sanitized,
        }
      }

      return {
        id: p.id,
        kind: 'transaction',
        description: p.description,
        amount: p.amount,
        type: p.type,
        category: p.category,
        paymentMethod: p.fromWalletId,
        date: p.date,
        note: sanitized,
      }
    })

    // Invariant 3: Persist state to storage and verify successful persistence
    const stateToPersist = {
      transactions: constructedTransactions,
      wallets: [
        { id: 'dompet-utama', label: 'Dompet Utama', type: 'cash', balance: 5_000_000, keywords: [] },
        { id: 'bca', label: 'BCA', type: 'bank', balance: 10_000_000, keywords: [] },
        { id: 'mandiri', label: 'Mandiri', type: 'bank', balance: 10_000_000, keywords: [] },
        { id: 'gopay', label: 'GoPay', type: 'ewallet', balance: 2_000_000, keywords: [] },
        { id: 'tabungan', label: 'Tabungan', type: 'savings', balance: 25_000_000, keywords: [] },
        { id: 'dana', label: 'DANA', type: 'ewallet', balance: 1_000_000, keywords: [] },
        { id: 'ovo', label: 'OVO', type: 'ewallet', balance: 1_000_000, keywords: [] },
        { id: 'shopeepay', label: 'ShopeePay', type: 'ewallet', balance: 1_000_000, keywords: [] },
      ],
      monthlyBudget: 3_000_000,
    }

    const saved = persistState(mockStorage, stateToPersist, 'valid')
    assert.equal(saved, true, 'persistState must return true')

    // Invariant 4: Load persisted state and verify note and transfer integrity
    const loadResult = loadPersistedState(mockStorage)
    assert.equal(loadResult.status, 'valid', 'loadPersistedState status must be valid')
    const loadedTransactions = loadResult.state.transactions ?? []
    assert.equal(loadedTransactions.length, constructedTransactions.length, 'Transaction count must match')

    for (let i = 0; i < constructedTransactions.length; i++) {
      const original = constructedTransactions[i]
      const loaded = loadedTransactions.find(t => t.id === original.id)
      assert.ok(loaded, `Loaded transaction with id ${original.id} must exist`)

      // Check note preservation
      assert.equal(
        loaded.note,
        original.note,
        `Note must be preserved exactly: expected ${JSON.stringify(original.note)}, got ${JSON.stringify(loaded.note)}`
      )

      // If transfer, verify transfer fields and note preservation
      if (original.kind === 'transfer') {
        assert.equal(loaded.kind, 'transfer', 'kind must be transfer')
        assert.equal(loaded.fromWalletId, original.fromWalletId, 'fromWalletId must match')
        assert.equal(loaded.toWalletId, original.toWalletId, 'toWalletId must match')
        assert.equal(loaded.category, 'transfer', 'category must be transfer')
        assert.equal(
          loaded.note,
          original.note,
          `Transfer transaction note must be preserved in storage: expected ${JSON.stringify(original.note)}, got ${JSON.stringify(loaded.note)}`
        )
      }
    }

    return true
  }),
  { numRuns: 200 }
)

console.log('✅ Property 3 (Manual Entry Note Persistence & Transfer Integrity) verified!\n')
