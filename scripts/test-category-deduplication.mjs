import assert from 'node:assert/strict'
import { dedupeSubcategories, normalizeCategoryKey } from '../lib/category-utils.ts'
import { filterTransactions } from '../lib/stats.ts'

console.log('--- RUNNING TEST SUITE: Category & Subcategory Deduplication ---')

// Test 1: dedupeSubcategories trims and removes case-insensitive duplicates
{
  const input = ['Makan Siang', 'makan siang', '  Makan Malam  ', 'MAKAN MALAM', 'Kopi', '']
  const result = dedupeSubcategories(input)
  assert.deepEqual(result, ['Makan Siang', 'Makan Malam', 'Kopi'])
  console.log('✓ Test 1: dedupeSubcategories removes duplicate and case-insensitive items')
}

// Test 2: normalizeCategoryKey normalizes various forms of 'Lainnya'
{
  assert.equal(normalizeCategoryKey('Lainnya'), 'lainnya')
  assert.equal(normalizeCategoryKey('lainnya'), 'lainnya')
  assert.equal(normalizeCategoryKey('  Lainnya  '), 'lainnya')
  assert.equal(normalizeCategoryKey('income-lainnya'), 'incomelainnya')
  console.log('✓ Test 2: normalizeCategoryKey normalizes category labels reliably')
}

// Test 3: Category deduplication logic ensures 'Lainnya' only appears once
{
  const rawCategories = [
    { id: 'makanan', label: 'Makanan', subcategories: ['Sarapan', 'Makan Siang'] },
    { id: 'lainnya', label: 'Lainnya', subcategories: ['Lain 1'] },
    { id: 'income-lainnya', label: 'Lainnya', subcategories: ['Lain 2', 'Lain 1'] },
    { id: 'expense-lainnya', label: 'Lainnya', subcategories: ['Lain 3'] },
  ]

  const dedupeMap = new Map()
  for (const cat of rawCategories) {
    const normKey = normalizeCategoryKey(cat.label) || normalizeCategoryKey(cat.id)
    const existing = dedupeMap.get(normKey)
    if (!existing) {
      dedupeMap.set(normKey, { ...cat, subcategories: dedupeSubcategories(cat.subcategories ?? []) })
    } else {
      existing.subcategories = dedupeSubcategories([
        ...existing.subcategories,
        ...(cat.subcategories ?? []),
      ])
      if (cat.id === 'lainnya') {
        existing.id = 'lainnya'
        existing.label = cat.label
      }
    }
  }

  const result = Array.from(dedupeMap.values())
  const lainnyaList = result.filter(c => normalizeCategoryKey(c.label) === 'lainnya')

  assert.equal(lainnyaList.length, 1, 'Lainnya must only appear ONCE in result')
  assert.equal(lainnyaList[0].id, 'lainnya', 'Primary id should be lainnya')
  assert.deepEqual(
    lainnyaList[0].subcategories,
    ['Lain 1', 'Lain 2', 'Lain 3'],
    'Subcategories must be merged without loss or duplicates'
  )
  console.log('✓ Test 3: Duplicate categories merged with unique subcategories')
}

// Test 4: filterTransactions matches transactions under any Lainnya id variant
{
  const txs = [
    { id: 'tx-1', amount: 50000, category: 'lainnya', type: 'expense', date: new Date() },
    { id: 'tx-2', amount: 75000, category: 'income-lainnya', type: 'income', date: new Date() },
    { id: 'tx-3', amount: 20000, category: 'makanan', type: 'expense', date: new Date() },
  ]

  const filtered = filterTransactions(txs, { category: 'lainnya' })
  assert.equal(filtered.length, 2, 'Should match both lainnya and income-lainnya transactions')
  assert.equal(filtered.some(t => t.id === 'tx-1'), true)
  assert.equal(filtered.some(t => t.id === 'tx-2'), true)
  assert.equal(filtered.some(t => t.id === 'tx-3'), false)
  console.log('✓ Test 4: filterTransactions correctly groups legacy lainnya variants')
}

console.log('--- ALL CATEGORY DEDUPLICATION TESTS PASSED ---')
