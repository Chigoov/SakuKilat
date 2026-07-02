'use client'

/**
 * SakuKilat — Mode Demo
 * ---------------------
 * Mengisi localStorage dengan data contoh yang kaya supaya SEMUA fitur langsung
 * "hidup" (rekap, tren, budget, streak, goal, dan banyak achievement terbuka).
 * Sengaja menulis langsung ke localStorage lalu reload — cara paling andal
 * memuat ulang seluruh store sekaligus.
 *
 * Aman: menandai dirinya via flag 'sakukilat:v2:demo-active' sehingga bisa
 * dibersihkan total saat keluar mode demo.
 */

import { STORAGE_KEY, CURRENT_SCHEMA_VERSION } from './store'
import { GOAL_STORAGE_KEY } from '@/components/goal-tracker'

const DEMO_FLAG = 'sakukilat:v2:demo-active'
const BACKUP_BEFORE_DEMO = 'sakukilat:v2:demo-backup'
const RECURRING_STORAGE_KEY = 'sakukilat:v2:recurring'

interface DemoTx {
  id: string
  description: string
  amount: number
  type: 'expense' | 'income'
  category: string
  paymentMethod: string
  kind?: 'transaction' | 'transfer' | 'saving'
  fromWalletId?: string
  toWalletId?: string
  date: string
}

const EXPENSE_TEMPLATES: Array<[string, number, string, string]> = [
  ['Kopi pagi', 22000, 'makanan', 'gopay'],
  ['Makan siang warteg', 18000, 'makanan', 'tunai'],
  ['Nasi padang', 28000, 'makanan', 'ovo'],
  ['Ongkir Gojek ke kantor', 15000, 'transportasi', 'gopay'],
  ['Bensin motor', 30000, 'transportasi', 'tunai'],
  ['Grab pulang', 24000, 'transportasi', 'dana'],
  ['Belanja Indomaret', 47000, 'belanja', 'shopeepay'],
  ['Pulsa & paket data', 50000, 'tagihan', 'dana'],
  ['Boba kekinian', 25000, 'makanan', 'gopay'],
  ['Parkir', 2000, 'transportasi', 'tunai'],
  ['Netflix patungan', 53000, 'hiburan', 'bca'],
  ['Vitamin', 75000, 'kesehatan', 'bca'],
]

const INCOME_TEMPLATES: Array<[string, number, string, string]> = [
  ['Gaji bulanan', 6500000, 'gaji', 'bca'],
  ['Bonus proyek', 800000, 'freelance', 'bca'],
  ['Cashback belanja', 25000, 'cashback', 'gopay'],
]

function dayISO(offset: number, hour: number, minute = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

function buildDemoTransactions(): DemoTx[] {
  const out: DemoTx[] = []
  let seed = 7
  const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }

  // 75 hari ke belakang, beruntun sampai hari ini (untuk streak panjang).
  for (let offset = 0; offset >= -74; offset--) {
    const perDay = 1 + Math.floor(rand() * 2.4) // 1-3 transaksi/hari
    for (let j = 0; j < perDay; j++) {
      const [desc, base, cat, pay] = EXPENSE_TEMPLATES[Math.floor(rand() * EXPENSE_TEMPLATES.length)]
      const jitter = 0.8 + rand() * 0.6
      out.push({
        id: `txn-${Date.now()}-demo-${offset}-${j}`,
        description: desc,
        amount: Math.round((base * jitter) / 500) * 500,
        type: 'expense',
        category: cat,
        paymentMethod: pay,
        kind: 'transaction',
        date: dayISO(offset, 8 + Math.floor(rand() * 12), Math.floor(rand() * 60)),
      })
    }
  }

  // Pemasukan: gaji 2 bulan + sampingan.
  out.push({ id: `txn-${Date.now()}-demo-gaji0`, ...incTpl(0), date: dayISO(-2, 9) })
  out.push({ id: `txn-${Date.now()}-demo-gaji1`, ...incTpl(0), date: dayISO(-32, 9) })
  out.push({ id: `txn-${Date.now()}-demo-bonus`, ...incTpl(1), date: dayISO(-10, 14) })
  out.push({ id: `txn-${Date.now()}-demo-cb`, ...incTpl(2), date: dayISO(-5, 16) })

  // Beberapa pindah & simpan uang (untuk badge & rekap money-move).
  out.push({
    id: `txn-${Date.now()}-demo-save`, description: 'Simpan uang', amount: 500000,
    type: 'expense', category: 'transfer', paymentMethod: 'bca', kind: 'saving',
    fromWalletId: 'bca', toWalletId: 'tabungan', date: dayISO(-3, 10),
  })
  out.push({
    id: `txn-${Date.now()}-demo-tf`, description: 'Pindah uang', amount: 200000,
    type: 'expense', category: 'transfer', paymentMethod: 'bca', kind: 'transfer',
    fromWalletId: 'bca', toWalletId: 'gopay', date: dayISO(-7, 11),
  })

  return out
}

function incTpl(i: number): Omit<DemoTx, 'id' | 'date'> {
  const [description, amount, category, paymentMethod] = INCOME_TEMPLATES[i]
  return { description, amount, type: 'income', category, paymentMethod, kind: 'transaction' }
}

const DEMO_WALLETS = [
  { id: 'tunai', label: 'Cash', type: 'cash', balance: 350000, keywords: ['tunai', 'cash', 'kontan'], isBuiltIn: true },
  { id: 'bca', label: 'BCA', type: 'bank', balance: 4200000, keywords: ['bca', 'klikbca'], isBuiltIn: true },
  { id: 'gopay', label: 'GoPay', type: 'ewallet', balance: 180000, keywords: ['gopay', 'gp'], isBuiltIn: true },
  { id: 'ovo', label: 'OVO', type: 'ewallet', balance: 95000, keywords: ['ovo'], isBuiltIn: true },
  { id: 'dana', label: 'DANA', type: 'ewallet', balance: 120000, keywords: ['dana'], isBuiltIn: true },
  { id: 'shopeepay', label: 'ShopeePay', type: 'ewallet', balance: 60000, keywords: ['shopeepay', 'spay', 'shopee'], isBuiltIn: true },
  { id: 'tabungan', label: 'Tabungan', type: 'savings', balance: 5500000, keywords: ['tabungan', 'simpan', 'simpanan'], isBuiltIn: true },
]

const DEMO_GOALS = [
  { id: 'g_demo1', label: 'Laptop baru', target: 8000000, saved: 3200000, deadline: dayISO(120, 0).slice(0, 10), createdAt: dayISO(-40, 0) },
  { id: 'g_demo2', label: 'Liburan akhir tahun', target: 5000000, saved: 5000000, deadline: dayISO(60, 0).slice(0, 10), createdAt: dayISO(-50, 0) },
]

const DEMO_RECURRING = [
  {
    id: 'rec_demo_gaji',
    input: 'gaji bulanan 6500000 bca',
    label: 'Gaji bulanan',
    cadence: 'monthly',
    nextDueAt: Date.now() - 60_000,
    lastFiredAt: null,
    active: true,
    createdAt: Date.now() - 86_400_000 * 20,
  },
  {
    id: 'rec_demo_netflix',
    input: 'netflix patungan 54000 bca',
    label: 'Netflix patungan',
    cadence: 'monthly',
    nextDueAt: Date.now() + 86_400_000 * 3,
    lastFiredAt: Date.now() - 86_400_000 * 27,
    active: true,
    createdAt: Date.now() - 86_400_000 * 40,
  },
  {
    id: 'rec_demo_gym',
    input: 'gym bulanan 175000 bca',
    label: 'Gym bulanan',
    cadence: 'monthly',
    nextDueAt: Date.now() + 86_400_000 * 12,
    lastFiredAt: null,
    active: false,
    createdAt: Date.now() - 86_400_000 * 10,
  },
] as const

export function isDemoActive(): boolean {
  if (typeof window === 'undefined') return false
  try { return window.localStorage.getItem(DEMO_FLAG) === '1' } catch { return false }
}

/** Aktifkan mode demo: cadangkan data asli, lalu tulis data contoh. */
export function enableDemo(): void {
  if (typeof window === 'undefined') return
  try {
    // Cadangkan state asli sekali saja (kalau belum dalam mode demo).
    if (!isDemoActive()) {
      const real = window.localStorage.getItem(STORAGE_KEY)
      const realGoals = window.localStorage.getItem(GOAL_STORAGE_KEY)
      const realRecurring = window.localStorage.getItem(RECURRING_STORAGE_KEY)
      window.localStorage.setItem(BACKUP_BEFORE_DEMO, JSON.stringify({ state: real, goals: realGoals, recurring: realRecurring }))
    }

    const demoState = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      transactions: buildDemoTransactions(),
      wallets: DEMO_WALLETS,
      monthlyBudget: 3000000,
      customPayments: [{ id: 'seabank', label: 'SeaBank', keywords: ['seabank', 'sea'] }],
      customCategories: [{ id: 'peliharaan', label: 'Peliharaan', keywords: ['kucing', 'catfood', 'vet'] }],
      hiddenPaymentIds: [],
      zenMode: false,
      themeMode: 'dark',
      profileName: 'Pengguna Demo',
      profileAvatarUrl: null,
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(demoState))
    window.localStorage.setItem(GOAL_STORAGE_KEY, JSON.stringify(DEMO_GOALS))
    window.localStorage.setItem(RECURRING_STORAGE_KEY, JSON.stringify(DEMO_RECURRING))
    window.localStorage.setItem(DEMO_FLAG, '1')
    // Picu beberapa counter biar achievement demo terlihat hidup.
    window.localStorage.setItem('sakukilat:v2:backup-count', '3')
    window.localStorage.setItem('sakukilat:v2:zen-used', '1')
    window.location.reload()
  } catch {
    /* quota / private mode */
  }
}

/** Keluar mode demo: pulihkan data asli yang dicadangkan. */
export function disableDemo(): void {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(BACKUP_BEFORE_DEMO)
    if (raw) {
      const { state, goals, recurring } = JSON.parse(raw) as { state: string | null; goals: string | null; recurring?: string | null }
      if (state) window.localStorage.setItem(STORAGE_KEY, state)
      else window.localStorage.removeItem(STORAGE_KEY)
      if (goals) window.localStorage.setItem(GOAL_STORAGE_KEY, goals)
      else window.localStorage.removeItem(GOAL_STORAGE_KEY)
      if (recurring) window.localStorage.setItem(RECURRING_STORAGE_KEY, recurring)
      else window.localStorage.removeItem(RECURRING_STORAGE_KEY)
    }
    window.localStorage.removeItem(BACKUP_BEFORE_DEMO)
    window.localStorage.removeItem(DEMO_FLAG)
    window.location.reload()
  } catch {
    /* ignore */
  }
}
