import {
  UtensilsCrossed,
  Car,
  ShoppingBag,
  Gamepad2,
  Heart,
  BookOpen,
  Zap,
  Briefcase,
  TrendingUp,
  ArrowRightLeft,
  MoreHorizontal,
  Tag,
} from 'lucide-react'
import type { Category, PaymentMethod } from '@/lib/parser'
import { BUILTIN_CATEGORY_CHART_COLORS, getBaseChartColor } from '@/lib/chart-colors'
import { cn } from '@/lib/utils'

export interface CategoryConfig {
  icon: React.ComponentType<{ className?: string }>
  label: string
  color: string
  bg: string
}

export const CATEGORY_CONFIG: Record<Category, CategoryConfig> = {
  makanan:      { icon: UtensilsCrossed, label: 'Makanan',       color: 'text-[var(--sk-amber)]',  bg: 'bg-[var(--sk-amber-dim)]' },
  transportasi: { icon: Car,             label: 'Transportasi',  color: 'text-[#60A5FA]',           bg: 'bg-[rgba(96,165,250,0.12)]' },
  belanja:      { icon: ShoppingBag,     label: 'Belanja',       color: 'text-[#F472B6]',           bg: 'bg-[rgba(244,114,182,0.12)]' },
  hiburan:      { icon: Gamepad2,        label: 'Hiburan',       color: 'text-[#A78BFA]',           bg: 'bg-[rgba(167,139,250,0.12)]' },
  kesehatan:    { icon: Heart,           label: 'Kesehatan',     color: 'text-[var(--sk-red)]',     bg: 'bg-[var(--sk-red-dim)]' },
  pendidikan:   { icon: BookOpen,        label: 'Pendidikan',    color: 'text-[#34D399]',           bg: 'bg-[var(--sk-green-dim)]' },
  tagihan:      { icon: Zap,             label: 'Tagihan',       color: 'text-[var(--sk-cyan)]',    bg: 'bg-[var(--sk-cyan-dim)]' },
  gaji:         { icon: Briefcase,       label: 'Gaji/Usaha',    color: 'text-[var(--sk-green)]',   bg: 'bg-[var(--sk-green-dim)]' },
  investasi:    { icon: TrendingUp,      label: 'Investasi',     color: 'text-[#34D399]',           bg: 'bg-[var(--sk-green-dim)]' },
  penjualan:    { icon: TrendingUp,      label: 'Penjualan',     color: 'text-[#2DD4BF]',           bg: 'bg-[rgba(45,212,191,0.12)]' },
  cashback:     { icon: ArrowRightLeft,  label: 'Cashback',      color: 'text-[#38BDF8]',           bg: 'bg-[var(--sk-cyan-dim)]' },
  refund:       { icon: ArrowRightLeft,  label: 'Refund',        color: 'text-[#60A5FA]',           bg: 'bg-[rgba(96,165,250,0.12)]' },
  hadiah:       { icon: Tag,             label: 'Hadiah',        color: 'text-[#FBBF24]',           bg: 'bg-[rgba(251,191,36,0.12)]' },
  freelance:    { icon: Briefcase,       label: 'Freelance',     color: 'text-[#34D399]',           bg: 'bg-[var(--sk-green-dim)]' },
  transfer:     { icon: ArrowRightLeft,  label: 'Transfer',      color: 'text-[var(--sk-text-muted)]', bg: 'bg-[var(--sk-surface-3)]' },
  lainnya:      { icon: MoreHorizontal,  label: 'Lainnya',       color: 'text-[var(--sk-text-muted)]', bg: 'bg-[var(--sk-surface-3)]' },
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  gopay:     'GoPay',
  ovo:       'OVO',
  dana:      'DANA',
  shopeepay: 'ShopeePay',
  bca:       'BCA',
  bni:       'BNI',
  bri:       'BRI',
  mandiri:   'Mandiri',
  jago:      'Jago',
  tunai:     'Tunai',
  transfer:  'Transfer',
  qris:      'QRIS',
  kartu:     'Kartu',
  lainnya:   'Lainnya',
}

// ── Custom (user-defined) registry ───────────────────────────────────────────
// The store registers user-defined categories/payments here so that display
// components can resolve labels & styling for arbitrary custom ids without
// threading config through every prop.
const CUSTOM_PALETTE = [
  { color: 'text-[#38BDF8]', bg: 'bg-[rgba(56,189,248,0.12)]' },
  { color: 'text-[#34D399]', bg: 'bg-[rgba(52,211,153,0.12)]' },
  { color: 'text-[#FBBF24]', bg: 'bg-[rgba(251,191,36,0.12)]' },
  { color: 'text-[#F472B6]', bg: 'bg-[rgba(244,114,182,0.12)]' },
  { color: 'text-[#A78BFA]', bg: 'bg-[rgba(167,139,250,0.12)]' },
  { color: 'text-[#FB923C]', bg: 'bg-[rgba(251,146,60,0.12)]' },
]

const customCategoryRegistry = new Map<string, CategoryConfig>()
const customPaymentRegistry = new Map<string, string>()

function hashIndex(id: string, mod: number): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h % mod
}

export function registerCustomCategories(cats: { id: string; label: string }[]) {
  customCategoryRegistry.clear()
  for (const c of cats) {
    const base = CATEGORY_CONFIG[c.id as Category]
    if (base) {
      customCategoryRegistry.set(c.id, { ...base, label: c.label })
      continue
    }
    const palette = CUSTOM_PALETTE[hashIndex(c.id, CUSTOM_PALETTE.length)]
    customCategoryRegistry.set(c.id, { icon: Tag, label: c.label, ...palette })
  }
}

export function registerCustomPayments(pms: { id: string; label: string }[]) {
  customPaymentRegistry.clear()
  for (const p of pms) customPaymentRegistry.set(p.id, p.label)
}

/** Resolve a category id (built-in OR custom) to its display config. */
export function getCategoryConfig(category: string): CategoryConfig {
  return (
    customCategoryRegistry.get(category) ??
    CATEGORY_CONFIG[category as Category] ??
    CATEGORY_CONFIG.lainnya
  )
}

/** Resolve a payment method id (built-in OR custom) to its display label. */
export function getPaymentLabel(method: string): string {
  return (
    PAYMENT_METHOD_LABELS[method as PaymentMethod] ??
    customPaymentRegistry.get(method) ??
    (method.charAt(0).toUpperCase() + method.slice(1))
  )
}

// ── Raw hex colors for charts (Recharts can't read Tailwind classes) ──────────
export const CATEGORY_HEX: Record<string, string> = BUILTIN_CATEGORY_CHART_COLORS

/** Resolve a category id (built-in OR custom) to a raw hex color. */
export function getCategoryHex(category: string): string {
  return getBaseChartColor(category)
}

interface CategoryIconProps {
  category: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function CategoryIcon({ category, size = 'md', className }: CategoryIconProps) {
  const config = getCategoryConfig(category)
  const Icon = config.icon

  const sizeClasses = {
    sm: { wrapper: 'w-8 h-8', icon: 'w-4 h-4' },
    md: { wrapper: 'w-10 h-10', icon: 'w-5 h-5' },
    lg: { wrapper: 'w-12 h-12', icon: 'w-6 h-6' },
  }

  const s = sizeClasses[size]

  return (
    <div
      className={cn(
        'rounded-xl flex items-center justify-center flex-shrink-0',
        config.bg,
        s.wrapper,
        className
      )}
    >
      <Icon className={cn(config.color, s.icon)} />
    </div>
  )
}
