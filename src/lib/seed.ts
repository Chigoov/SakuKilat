// SakuKilat - Seed Data (Built-in Wallets & Demo Transactions)

import type { Wallet, Transaction } from '@/types';

export const BUILTIN_WALLETS: Wallet[] = [
  { id: 'tunai', label: 'Cash', type: 'cash', balance: 650000, keywords: ['tunai', 'cash', 'kontan'], isBuiltIn: true },
  { id: 'bca', label: 'BCA', type: 'bank', balance: 4850000, keywords: ['bca', 'klikbca'], isBuiltIn: true },
  { id: 'seabank', label: 'SeaBank', type: 'bank', balance: 1200000, keywords: ['seabank', 'sea'], isBuiltIn: true },
  { id: 'gopay', label: 'GoPay', type: 'ewallet', balance: 240000, keywords: ['gopay', 'gp'], isBuiltIn: true },
  { id: 'ovo', label: 'OVO', type: 'ewallet', balance: 185000, keywords: ['ovo'], isBuiltIn: true },
  { id: 'dana', label: 'DANA', type: 'ewallet', balance: 165000, keywords: ['dana'], isBuiltIn: true },
  { id: 'shopeepay', label: 'ShopeePay', type: 'ewallet', balance: 90000, keywords: ['shopeepay', 'shopepay', 'shopee', 'spay'], isBuiltIn: true },
  { id: 'tabungan', label: 'Tabungan', type: 'savings', balance: 2500000, keywords: ['tabungan', 'simpan', 'simpanan'], isBuiltIn: true },
];

export const BUILTIN_WALLET_DEFAULT_BALANCES: Record<string, number> = {
  tunai: 650000,
  bca: 4850000,
  seabank: 1200000,
  gopay: 240000,
  ovo: 185000,
  dana: 165000,
  shopeepay: 90000,
  tabungan: 2500000,
};

export function createSeedWallets(): Wallet[] {
  return BUILTIN_WALLETS.map((w) => ({ ...w, keywords: [...w.keywords] }));
}

export function generateId(): string {
  const suffix =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `txn-${Date.now()}-${suffix}`;
}

const DEMO_TEMPLATES = [
  { description: 'Kopi pagi', amount: 22000, type: 'expense' as const, category: 'makanan', paymentMethod: 'gopay' },
  { description: 'Makan siang', amount: 35000, type: 'expense' as const, category: 'makanan', paymentMethod: 'ovo' },
  { description: 'Ojek ke kantor', amount: 24000, type: 'expense' as const, category: 'transportasi', paymentMethod: 'gopay' },
  { description: 'Bensin motor', amount: 30000, type: 'expense' as const, category: 'transportasi', paymentMethod: 'tunai' },
  { description: 'Belanja bulanan', amount: 185000, type: 'expense' as const, category: 'belanja', paymentMethod: 'bca' },
  { description: 'Pulsa & data', amount: 50000, type: 'expense' as const, category: 'tagihan', paymentMethod: 'dana' },
  { description: 'Nonton bioskop', amount: 60000, type: 'expense' as const, category: 'hiburan', paymentMethod: 'shopeepay' },
  { description: 'Beli camilan', amount: 28000, type: 'expense' as const, category: 'makanan', paymentMethod: 'qris' },
  { description: 'Vitamin', amount: 75000, type: 'expense' as const, category: 'kesehatan', paymentMethod: 'bca' },
  { description: 'Parkir mall', amount: 10000, type: 'expense' as const, category: 'transportasi', paymentMethod: 'tunai' },
];

export function createDemoTransactions(baseTime = Date.now()): Transaction[] {
  const result: Transaction[] = [];
  let seed = 1337;
  const rng = () => (seed = (9301 * seed + 49297) % 233280) / 233280;

  for (let day = 2; day <= 88; day++) {
    const count = Math.floor(3.2 * rng());
    for (let i = 0; i < count; i++) {
      const tmpl = DEMO_TEMPLATES[Math.floor(rng() * DEMO_TEMPLATES.length)];
      const variance = 0.8 + 0.5 * rng();
      const date = new Date(baseTime - 86400000 * day);
      date.setHours(8 + Math.floor(12 * rng()), Math.floor(60 * rng()), 0, 0);
      result.push({
        ...tmpl,
        id: `seed-${day}-${i}`,
        kind: 'transaction',
        amount: 500 * Math.round((tmpl.amount * variance) / 500),
        date,
      });
    }
  }

  // Add monthly income
  for (let m = 1; m <= 2; m++) {
    const date = new Date(baseTime - 30 * m * 86400000);
    date.setHours(9, 0, 0, 0);
    result.push({
      id: `seed-income-${m}`,
      kind: 'transaction',
      description: 'Gaji bulanan',
      amount: 8500000,
      type: 'income',
      category: 'gaji',
      paymentMethod: 'transfer',
      date,
    });
  }

  return result;
}
