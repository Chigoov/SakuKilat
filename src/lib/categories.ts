// SakuKilat - Category & Payment Configuration

import {
  UtensilsCrossed, Car, ShoppingBag, Gamepad2, Heart,
  BookOpen, Zap, Briefcase, TrendingUp, ArrowRightLeft,
  MoreHorizontal, Tag,
} from 'lucide-react';
import type { ComponentType } from 'react';

export const INCOME_CATEGORY_IDS = ['gaji', 'investasi', 'penjualan', 'cashback', 'refund', 'hadiah', 'freelance'];
export const EXPENSE_CATEGORY_IDS = ['makanan', 'transportasi', 'belanja', 'hiburan', 'kesehatan', 'pendidikan', 'tagihan', 'transfer'];

export function getBuiltinCategoryType(id: string): 'income' | 'expense' {
  return INCOME_CATEGORY_IDS.includes(id) ? 'income' : 'expense';
}

export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  makanan: ['makan', 'minum', 'kopi', 'teh', 'nasi', 'soto', 'bakso', 'ayam', 'pizza', 'burger', 'sushi', 'resto', 'warung', 'kantin', 'cafe', 'kafe', 'snack', 'camilan', 'jajan', 'boba', 'juice', 'mcdonalds', 'kfc', 'gofood', 'shopeefood', 'pecel', 'rawon', 'sate', 'martabak', 'gorengan', 'indomie', 'nasgor', 'esteh', 'mie', 'mi', 'es', 'minuman', 'sarapan', 'makan siang', 'makan malam'],
  transportasi: ['ongkir', 'bensin', 'bbm', 'parkir', 'tol', 'ojek', 'gojek', 'grab', 'taxi', 'taksi', 'busway', 'transjakarta', 'kereta', 'commuter', 'krl', 'mrt', 'lrt', 'bis', 'angkot', 'pesawat', 'tiket', 'uber', 'maxim', 'servis motor', 'servis mobil'],
  belanja: ['beli', 'belanja', 'shopee', 'tokopedia', 'lazada', 'tiktokshop', 'baju', 'celana', 'sepatu', 'tas', 'elektronik', 'hp', 'laptop', 'charger', 'kabel', 'aksesoris', 'kosmetik', 'skincare', 'parfum', 'buku', 'peralatan', 'furniture', 'supermarket'],
  hiburan: ['netflix', 'spotify', 'youtube', 'game', 'bioskop', 'film', 'konser', 'event', 'steam', 'playstation', 'xbox', 'disney', 'prime', 'vidio', 'cinema'],
  kesehatan: ['dokter', 'rumah sakit', 'klinik', 'apotek', 'obat', 'vitamin', 'suplemen', 'gym', 'fitness', 'olahraga', 'periksa', 'laboratorium', 'dental', 'gigi'],
  pendidikan: ['kursus', 'les', 'bimbel', 'sekolah', 'kampus', 'kuliah', 'spp', 'ukt', 'udemy', 'coursera', 'dicoding', 'ruangguru', 'zenius', 'seminar', 'pelatihan', 'workshop'],
  tagihan: ['listrik', 'pln', 'air', 'pdam', 'internet', 'wifi', 'indihome', 'telkom', 'pulsa', 'paket data', 'iuran', 'pajak', 'bpjs', 'asuransi', 'cicilan', 'angsuran', 'kpr', 'tagihan', 'bayar', 'langganan'],
  gaji: ['gaji', 'salary', 'upah', 'honor', 'thr', 'bonus', 'komisi', 'insentif', 'honorarium'],
  investasi: ['investasi', 'saham', 'reksadana', 'crypto', 'bitcoin', 'ethereum', 'emas', 'deposito', 'obligasi', 'nabung', 'bibit', 'ajaib'],
  penjualan: ['jual', 'jualan', 'penjualan', 'dagang', 'dagangan', 'order', 'pesanan', 'profit', 'laba'],
  cashback: ['cashback', 'cash back', 'reward', 'rewards'],
  refund: ['refund', 'pengembalian', 'retur', 'dikembalikan'],
  hadiah: ['hadiah', 'gift', 'angpao', 'kado'],
  freelance: ['freelance', 'freelancer', 'proyek', 'project', 'job', 'client', 'klien', 'fee freelance'],
  transfer: ['transfer', 'kirim', 'setor', 'tarik tunai'],
  lainnya: [],
};

export interface CategoryConfigEntry {
  icon: ComponentType<{ className?: string }>;
  label: string;
  color: string;
  bg: string;
}

export const CATEGORY_CONFIG: Record<string, CategoryConfigEntry> = {
  makanan: { icon: UtensilsCrossed, label: 'Makanan', color: 'text-[var(--sk-amber)]', bg: 'bg-[var(--sk-amber-dim)]' },
  transportasi: { icon: Car, label: 'Transportasi', color: 'text-[#60A5FA]', bg: 'bg-[rgba(96,165,250,0.12)]' },
  belanja: { icon: ShoppingBag, label: 'Belanja', color: 'text-[#F472B6]', bg: 'bg-[rgba(244,114,182,0.12)]' },
  hiburan: { icon: Gamepad2, label: 'Hiburan', color: 'text-[#A78BFA]', bg: 'bg-[rgba(167,139,250,0.12)]' },
  kesehatan: { icon: Heart, label: 'Kesehatan', color: 'text-[var(--sk-red)]', bg: 'bg-[var(--sk-red-dim)]' },
  pendidikan: { icon: BookOpen, label: 'Pendidikan', color: 'text-[#34D399]', bg: 'bg-[var(--sk-green-dim)]' },
  tagihan: { icon: Zap, label: 'Tagihan', color: 'text-[var(--sk-cyan)]', bg: 'bg-[var(--sk-cyan-dim)]' },
  gaji: { icon: Briefcase, label: 'Gaji/Usaha', color: 'text-[var(--sk-green)]', bg: 'bg-[var(--sk-green-dim)]' },
  investasi: { icon: TrendingUp, label: 'Investasi', color: 'text-[#34D399]', bg: 'bg-[var(--sk-green-dim)]' },
  penjualan: { icon: TrendingUp, label: 'Penjualan', color: 'text-[#2DD4BF]', bg: 'bg-[rgba(45,212,191,0.12)]' },
  cashback: { icon: ArrowRightLeft, label: 'Cashback', color: 'text-[#38BDF8]', bg: 'bg-[var(--sk-cyan-dim)]' },
  refund: { icon: ArrowRightLeft, label: 'Refund', color: 'text-[#60A5FA]', bg: 'bg-[rgba(96,165,250,0.12)]' },
  hadiah: { icon: Tag, label: 'Hadiah', color: 'text-[#FBBF24]', bg: 'bg-[rgba(251,191,36,0.12)]' },
  freelance: { icon: Briefcase, label: 'Freelance', color: 'text-[#34D399]', bg: 'bg-[var(--sk-green-dim)]' },
  transfer: { icon: ArrowRightLeft, label: 'Transfer', color: 'text-[var(--sk-text-muted)]', bg: 'bg-[var(--sk-surface-3)]' },
  lainnya: { icon: MoreHorizontal, label: 'Lainnya', color: 'text-[var(--sk-text-muted)]', bg: 'bg-[var(--sk-surface-3)]' },
};

const CUSTOM_COLOR_PALETTE = [
  { color: 'text-[#38BDF8]', bg: 'bg-[rgba(56,189,248,0.12)]' },
  { color: 'text-[#34D399]', bg: 'bg-[rgba(52,211,153,0.12)]' },
  { color: 'text-[#FBBF24]', bg: 'bg-[rgba(251,191,36,0.12)]' },
  { color: 'text-[#F472B6]', bg: 'bg-[rgba(244,114,182,0.12)]' },
  { color: 'text-[#A78BFA]', bg: 'bg-[rgba(167,139,250,0.12)]' },
  { color: 'text-[#FB923C]', bg: 'bg-[rgba(251,146,60,0.12)]' },
];

const customCategoryMap = new Map<string, CategoryConfigEntry>();
const customPaymentMap = new Map<string, string>();

export function registerCustomCategories(categories: { id: string; label: string }[]): void {
  customCategoryMap.clear();
  for (const cat of categories) {
    const builtin = CATEGORY_CONFIG[cat.id];
    if (builtin) {
      customCategoryMap.set(cat.id, { ...builtin, label: cat.label });
      continue;
    }
    const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (31 * h + s.charCodeAt(i)) >>> 0; return h % CUSTOM_COLOR_PALETTE.length; };
    const palette = CUSTOM_COLOR_PALETTE[hash(cat.id)];
    customCategoryMap.set(cat.id, { icon: Tag, label: cat.label, ...palette });
  }
}

export function registerCustomPayments(payments: { id: string; label: string }[]): void {
  customPaymentMap.clear();
  for (const p of payments) customPaymentMap.set(p.id, p.label);
}

export function getCategoryConfig(category: string): CategoryConfigEntry {
  return customCategoryMap.get(category) ?? CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.lainnya;
}

export function getPaymentLabel(id: string): string {
  return PAYMENT_METHOD_LABELS[id] ?? customPaymentMap.get(id) ?? id.charAt(0).toUpperCase() + id.slice(1);
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  gopay: 'GoPay', ovo: 'OVO', dana: 'DANA', shopeepay: 'ShopeePay',
  bca: 'BCA', bni: 'BNI', bri: 'BRI', mandiri: 'Mandiri',
  jago: 'Jago', tunai: 'Tunai', transfer: 'Transfer',
  qris: 'QRIS', kartu: 'Kartu', lainnya: 'Lainnya',
};

// Chart color helpers
const BUILTIN_CHART_COLORS: Record<string, string> = {
  makanan: '#FBBF24', transportasi: '#60A5FA', belanja: '#F472B6',
  hiburan: '#A78BFA', kesehatan: '#F87171', pendidikan: '#34D399',
  tagihan: '#38BDF8', gaji: '#34D399', investasi: '#34D399',
  penjualan: '#2DD4BF', cashback: '#38BDF8', refund: '#60A5FA',
  hadiah: '#FBBF24', freelance: '#34D399', transfer: '#8EA0C2',
  lainnya: '#66789A',
};

export function getBaseChartColor(category: string): string {
  return BUILTIN_CHART_COLORS[category] ?? '#66789A';
}

export function assignDistinctChartColors(categories: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  const used = new Set<string>();
  const fallbackColors = ['#38BDF8', '#34D399', '#FBBF24', '#F472B6', '#A78BFA', '#FB923C'];

  for (const cat of categories) {
    if (!cat || result[cat]) continue;
    let color = getBaseChartColor(cat);
    let offset = 0;
    while (used.has(color)) {
      offset += 1;
      color = fallbackColors[(fallbackColors.indexOf(getBaseChartColor(cat)) + offset) % fallbackColors.length];
    }
    result[cat] = color;
    used.add(color);
  }
  return result;
}
