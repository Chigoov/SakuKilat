import type { TransactionType } from './parser'

export type TransactionKind = 'transaction' | 'transfer' | 'saving'
export type WalletType = 'cash' | 'bank' | 'ewallet' | 'card' | 'savings' | 'other'

export interface WalletAccount {
  id: string
  label: string
  type: WalletType
  balance: number
  keywords: string[]
  isBuiltIn?: boolean
}

export interface Transaction {
  id: string
  description: string
  amount: number
  type: TransactionType
  category: string // built-in or custom category id
  subcategory?: string
  paymentMethod: string // built-in or custom payment id
  kind?: TransactionKind
  fromWalletId?: string
  toWalletId?: string
  date: Date
  isPending?: boolean // optimistic UI state
}

export const SEED_WALLETS: WalletAccount[] = [
  { id: 'tunai', label: 'Cash', type: 'cash', balance: 650_000, keywords: ['tunai', 'cash', 'kontan'], isBuiltIn: true },
  { id: 'bca', label: 'BCA', type: 'bank', balance: 4_850_000, keywords: ['bca', 'klikbca'], isBuiltIn: true },
  { id: 'seabank', label: 'SeaBank', type: 'bank', balance: 1_200_000, keywords: ['seabank', 'sea'], isBuiltIn: true },
  { id: 'gopay', label: 'GoPay', type: 'ewallet', balance: 240_000, keywords: ['gopay', 'gp'], isBuiltIn: true },
  { id: 'ovo', label: 'OVO', type: 'ewallet', balance: 185_000, keywords: ['ovo'], isBuiltIn: true },
  { id: 'dana', label: 'DANA', type: 'ewallet', balance: 165_000, keywords: ['dana'], isBuiltIn: true },
  { id: 'shopeepay', label: 'ShopeePay', type: 'ewallet', balance: 90_000, keywords: ['shopeepay', 'shopepay', 'shopee', 'spay'], isBuiltIn: true },
  { id: 'tabungan', label: 'Tabungan', type: 'savings', balance: 2_500_000, keywords: ['tabungan', 'simpan', 'simpanan'], isBuiltIn: true },
]

export function createSeedWallets(): WalletAccount[] {
  return SEED_WALLETS.map(wallet => ({ ...wallet, keywords: [...wallet.keywords] }))
}

function createMockTransactions(now: number): Transaction[] {
  return [
    {
    id: 'txn-001',
    description: 'Makan soto ayam',
    amount: 25_000,
    type: 'expense',
    category: 'makanan',
    paymentMethod: 'gopay',
    date: new Date(now - 1 * 60 * 60 * 1000), // 1 jam lalu
  },
  {
    id: 'txn-002',
    description: 'Gaji bulan Juni',
    amount: 8_500_000,
    type: 'income',
    category: 'gaji',
    paymentMethod: 'transfer',
    date: new Date(now - 2 * 60 * 60 * 1000),
  },
  {
    id: 'txn-003',
    description: 'Bensin motor',
    amount: 50_000,
    type: 'expense',
    category: 'transportasi',
    paymentMethod: 'tunai',
    date: new Date(now - 5 * 60 * 60 * 1000),
  },
  {
    id: 'txn-004',
    description: 'Kopi kekinian',
    amount: 35_000,
    type: 'expense',
    category: 'makanan',
    paymentMethod: 'ovo',
    date: new Date(now - 1 * 24 * 60 * 60 * 1000), // Kemarin
  },
  {
    id: 'txn-005',
    description: 'Bayar listrik',
    amount: 210_000,
    type: 'expense',
    category: 'tagihan',
    paymentMethod: 'bca',
    date: new Date(now - 1 * 24 * 60 * 60 * 1000),
  },
  {
    id: 'txn-006',
    description: 'Netflix Premium',
    amount: 186_000,
    type: 'expense',
    category: 'hiburan',
    paymentMethod: 'kartu',
    date: new Date(now - 2 * 24 * 60 * 60 * 1000),
  },
  {
    id: 'txn-007',
    description: 'Beli baju online',
    amount: 299_000,
    type: 'expense',
    category: 'belanja',
    paymentMethod: 'shopeepay',
    date: new Date(now - 3 * 24 * 60 * 60 * 1000),
  },
  {
    id: 'txn-008',
    description: 'Freelance desain logo',
    amount: 1_500_000,
    type: 'income',
    category: 'freelance',
    paymentMethod: 'transfer',
    date: new Date(now - 4 * 24 * 60 * 60 * 1000),
  },
  {
    id: 'txn-009',
    description: 'Ojek Grab',
    amount: 18_000,
    type: 'expense',
    category: 'transportasi',
    paymentMethod: 'dana',
    date: new Date(now - 4 * 24 * 60 * 60 * 1000),
  },
  {
    id: 'txn-010',
    description: 'BPJS Kesehatan',
    amount: 100_000,
    type: 'expense',
    category: 'kesehatan',
    paymentMethod: 'bri',
    date: new Date(now - 5 * 24 * 60 * 60 * 1000),
  },
  ]
}

// ── Historical seed generator ────────────────────────────────────────────────
// Deterministically spreads realistic transactions across the past ~90 days so
// the calendar heatmap & trend charts have rich, believable data on first load.
const HISTORY_TEMPLATES: Array<Omit<Transaction, 'id' | 'date'>> = [
  { description: 'Kopi pagi',        amount: 22_000,  type: 'expense', category: 'makanan',      paymentMethod: 'gopay' },
  { description: 'Makan siang',      amount: 35_000,  type: 'expense', category: 'makanan',      paymentMethod: 'ovo' },
  { description: 'Ojek ke kantor',   amount: 24_000,  type: 'expense', category: 'transportasi', paymentMethod: 'gopay' },
  { description: 'Bensin motor',     amount: 30_000,  type: 'expense', category: 'transportasi', paymentMethod: 'tunai' },
  { description: 'Belanja bulanan',  amount: 185_000, type: 'expense', category: 'belanja',      paymentMethod: 'bca' },
  { description: 'Pulsa & data',     amount: 50_000,  type: 'expense', category: 'tagihan',      paymentMethod: 'dana' },
  { description: 'Nonton bioskop',   amount: 60_000,  type: 'expense', category: 'hiburan',      paymentMethod: 'shopeepay' },
  { description: 'Beli camilan',     amount: 28_000,  type: 'expense', category: 'makanan',      paymentMethod: 'qris' },
  { description: 'Vitamin',          amount: 75_000,  type: 'expense', category: 'kesehatan',    paymentMethod: 'bca' },
  { description: 'Parkir mall',      amount: 10_000,  type: 'expense', category: 'transportasi', paymentMethod: 'tunai' },
]

function generateHistory(now: number): Transaction[] {
  const out: Transaction[] = []
  // pseudo-random but deterministic
  let seed = 1337
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280
    return seed / 233280
  }

  for (let daysAgo = 2; daysAgo <= 88; daysAgo++) {
    // 0–3 transactions per day, weighted toward 1–2
    const count = Math.floor(rand() * 3.2)
    for (let j = 0; j < count; j++) {
      const tpl = HISTORY_TEMPLATES[Math.floor(rand() * HISTORY_TEMPLATES.length)]
      const jitter = 0.8 + rand() * 0.5 // ±amount variation
      const d = new Date(now - daysAgo * 86_400_000)
      d.setHours(8 + Math.floor(rand() * 12), Math.floor(rand() * 60), 0, 0)
      out.push({
        ...tpl,
        id: `seed-${daysAgo}-${j}`,
        amount: Math.round((tpl.amount * jitter) / 500) * 500,
        date: d,
      })
    }
  }

  // a couple of monthly incomes for trend richness
  for (let m = 1; m <= 2; m++) {
    const d = new Date(now - m * 30 * 86_400_000)
    d.setHours(9, 0, 0, 0)
    out.push({
      id: `seed-income-${m}`,
      description: 'Gaji bulanan',
      amount: 8_500_000,
      type: 'income',
      category: 'gaji',
      paymentMethod: 'transfer',
      date: d,
    })
  }

  return out
}

export function createSeedTransactions(baseDate = new Date()): Transaction[] {
  const now = baseDate.getTime()
  return [
    ...createMockTransactions(now),
    ...generateHistory(now),
  ]
}

export const MOCK_TRANSACTIONS: Transaction[] = createMockTransactions(Date.now())
export const SEED_TRANSACTIONS: Transaction[] = createSeedTransactions()

export function generateId(): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)

  return `txn-${Date.now()}-${random}`
}

