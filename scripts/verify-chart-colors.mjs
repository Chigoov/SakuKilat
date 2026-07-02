import assert from 'node:assert/strict'
import { assignDistinctChartColors, getBaseChartColor } from '../lib/chart-colors.ts'

const builtins = [
  'makanan',
  'transportasi',
  'belanja',
  'hiburan',
  'kesehatan',
  'pendidikan',
  'tagihan',
  'gaji',
  'investasi',
  'penjualan',
  'cashback',
  'refund',
  'hadiah',
  'freelance',
  'transfer',
  'lainnya',
]

const builtinColors = builtins.map(getBaseChartColor)
assert.equal(new Set(builtinColors).size, builtins.length, 'Kategori bawaan masih punya warna chart yang sama')

const mixedKeys = [
  ...builtins,
  'bensin',
  'kouta',
  'thiara',
  'kopi-susu',
  'laundry',
  'parkir-mall',
  'langganan-app',
  'makanan::sarapan',
  'makanan::makan-siang',
]

const mixedColors = assignDistinctChartColors(mixedKeys)
assert.equal(Object.keys(mixedColors).length, mixedKeys.length, 'Sebagian key chart tidak mendapat warna')
assert.equal(new Set(Object.values(mixedColors)).size, mixedKeys.length, 'Masih ada warna chart yang bentrok')

const bulkKeys = Array.from({ length: 32 }, (_, index) => `custom-${index + 1}`)
const bulkColors = assignDistinctChartColors(bulkKeys)
assert.equal(new Set(Object.values(bulkColors)).size, bulkKeys.length, 'Kategori baru masih bisa bentrok saat jumlahnya banyak')

console.log(`OK: ${builtins.length} kategori bawaan unik, ${mixedKeys.length} key campuran unik, ${bulkKeys.length} kategori baru unik.`)
