/**
 * SakuKilat — Tab Saku Structured Submenus Configuration & Utilities (Phase P3)
 *
 * Requirements:
 * - 3.1: Four distinct collapsible sections in Tab Saku:
 *        `Saku & Pembayaran`, `Kategori & Subkategori`, `Perencanaan Keuangan`, and `Kontrol Keuangan`
 * - 3.2: Host `Daftar saku`, `Metode pembayaran`, and `Transfer antar-saku` under `Saku & Pembayaran`
 * - 3.3: Host `Kategori pemasukan`, `Kategori pengeluaran`, and `Subkategori` under `Kategori & Subkategori`
 * - 3.4: Host `Goals` and `Tagihan & Langganan` under `Perencanaan Keuangan`
 * - 3.5: Host `Rekonsiliasi Saldo`, `Tutup Bulan`, and `Net Worth` under `Kontrol Keuangan`
 * - 3.6: Maintain exactly four bottom navigation tabs (Beranda, Rekapan, Saku, Profil) without secondary bottom nav
 * - 3.8: Suppress empty placeholder links for submenu items whose target views are not yet implemented
 */

export interface SubmenuItem {
  id: string
  label: string
  description?: string
  isImplemented: boolean
  targetPhase?: string
}

export interface SakuSectionConfig {
  id: string
  title: string
  subtitle: string
  iconName: 'Wallet' | 'SlidersHorizontal' | 'PiggyBank' | 'ShieldCheck'
  defaultOpen: boolean
  items: SubmenuItem[]
}

export const SAKU_SECTIONS: SakuSectionConfig[] = [
  {
    id: 'saku-pembayaran',
    title: 'Saku & Pembayaran',
    subtitle: 'Daftar saku, metode pembayaran & transfer antar-saku',
    iconName: 'Wallet',
    defaultOpen: true,
    items: [
      {
        id: 'daftar-saku',
        label: 'Daftar saku',
        description: 'Kelola saku dan saldo tersimpan',
        isImplemented: true,
      },
      {
        id: 'metode-pembayaran',
        label: 'Metode pembayaran',
        description: 'Atur dompet & metode pembayaran aktif',
        isImplemented: true,
      },
      {
        id: 'transfer-antar-saku',
        label: 'Transfer antar-saku',
        description: 'Pindah saldo dan simpan ke tabungan',
        isImplemented: true,
      },
    ],
  },
  {
    id: 'kategori-subkategori',
    title: 'Kategori & Subkategori',
    subtitle: 'Kategori pemasukan, kategori pengeluaran & subkategori',
    iconName: 'SlidersHorizontal',
    defaultOpen: false,
    items: [
      {
        id: 'kategori-pemasukan',
        label: 'Kategori pemasukan',
        description: 'Atur kategori dan keyword pemasukan',
        isImplemented: true,
      },
      {
        id: 'kategori-pengeluaran',
        label: 'Kategori pengeluaran',
        description: 'Atur kategori pengeluaran dan batas bulanan',
        isImplemented: true,
      },
      {
        id: 'subkategori',
        label: 'Subkategori',
        description: 'Kelola subkategori belanja dan pemasukan',
        isImplemented: true,
      },
    ],
  },
  {
    id: 'perencanaan-keuangan',
    title: 'Perencanaan Keuangan',
    subtitle: 'Goals target tabungan dan tagihan rutin',
    iconName: 'PiggyBank',
    defaultOpen: false,
    items: [
      {
        id: 'goals',
        label: 'Goals',
        description: 'Target tabungan dan progres impian',
        isImplemented: true,
      },
      {
        id: 'tagihan-langganan',
        label: 'Tagihan & Langganan',
        description: 'Pusat tagihan rutin dan pengingat jatuh tempo',
        isImplemented: true,
      },
    ],
  },
  {
    id: 'kontrol-keuangan',
    title: 'Kontrol Keuangan',
    subtitle: 'Rekonsiliasi saldo, tutup bulan & net worth',
    iconName: 'ShieldCheck',
    defaultOpen: false,
    items: [
      {
        id: 'rekonsiliasi-saldo',
        label: 'Rekonsiliasi Saldo',
        description: 'Pencocokan saldo catatan dengan fisik/bank',
        isImplemented: false,
        targetPhase: 'P6',
      },
      {
        id: 'tutup-bulan',
        label: 'Tutup Bulan',
        description: 'Kunci buku bulanan dan verifikasi laporan',
        isImplemented: false,
        targetPhase: 'P9',
      },
      {
        id: 'net-worth',
        label: 'Net Worth',
        description: 'Total aset bersih dikurangi kewajiban/utang',
        isImplemented: false,
        targetPhase: 'P10',
      },
    ],
  },
]

export function getSakuSections(): SakuSectionConfig[] {
  return SAKU_SECTIONS
}

export function getSectionById(sectionId: string): SakuSectionConfig | undefined {
  return SAKU_SECTIONS.find(s => s.id === sectionId)
}

export function isSubmenuImplemented(itemId: string): boolean {
  for (const section of SAKU_SECTIONS) {
    const item = section.items.find(i => i.id === itemId)
    if (item) return item.isImplemented
  }
  return false
}

export function getSubmenuItem(itemId: string): SubmenuItem | undefined {
  for (const section of SAKU_SECTIONS) {
    const item = section.items.find(i => i.id === itemId)
    if (item) return item
  }
  return undefined
}

/**
 * Resolves the navigation link for a submenu item.
 *
 * Property 10 & Requirement 3.8:
 * If isImplemented is false, MUST return null to suppress interactive links
 * and prevent rendering empty placeholder destinations.
 */
export function resolveSubmenuLink(item: SubmenuItem): string | null {
  if (!item.isImplemented) {
    return null
  }
  return `/saku/${item.id}`
}

export interface SubmenuItemRenderDescriptor {
  id: string
  label: string
  description?: string
  isImplemented: boolean
  isInteractive: boolean
  href: string | null
  ariaDisabled: boolean
  dataImplemented: 'true' | 'false'
  badgeText: string | null
}

/**
 * Evaluates the accessibility and rendering descriptor for a submenu item.
 * Ensures consistent link suppression across both SSR/HTML and React components.
 */
export function getSubmenuRenderDescriptor(item: SubmenuItem): SubmenuItemRenderDescriptor {
  const isImplemented = Boolean(item.isImplemented)
  const badgeText = isImplemented
    ? null
    : item.targetPhase && item.targetPhase.trim().length > 0
      ? `Segera Hadir (${item.targetPhase.trim()})`
      : 'Segera Hadir'

  return {
    id: item.id,
    label: item.label,
    description: item.description,
    isImplemented,
    isInteractive: isImplemented,
    href: isImplemented ? resolveSubmenuLink(item) : null,
    ariaDisabled: !isImplemented,
    dataImplemented: isImplemented ? 'true' : 'false',
    badgeText,
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Generates the HTML markup representation of an unimplemented submenu item.
 * Guarantees zero <a> tags, zero href attributes, and non-interactive accessibility semantics.
 */
export function renderUnimplementedSubmenuMarkup(item: SubmenuItem): string {
  const descriptor = getSubmenuRenderDescriptor(item)
  const badgeText = descriptor.badgeText ?? 'Segera Hadir'
  const descMarkup = item.description
    ? `<p class="text-[11px] text-[var(--sk-text-dim)] truncate">${escapeHtml(item.description)}</p>`
    : ''

  return `<div data-testid="submenu-${escapeHtml(item.id)}" data-submenu-id="${escapeHtml(item.id)}" data-implemented="${descriptor.dataImplemented}" aria-disabled="${descriptor.ariaDisabled}" class="rounded-xl border border-dashed border-[var(--sk-border-2)] bg-[var(--sk-surface-2)]/40 p-3.5 flex items-center justify-between opacity-75 cursor-not-allowed select-none"><div class="flex items-center gap-2.5 min-w-0"><div class="w-7 h-7 rounded-lg bg-[var(--sk-surface-2)] flex items-center justify-center shrink-0"></div><div class="min-w-0"><p class="text-xs font-semibold text-[var(--sk-text)] truncate">${escapeHtml(item.label)}</p>${descMarkup}</div></div><span class="shrink-0 text-[10px] font-medium text-[var(--sk-text-dim)] bg-[var(--sk-surface-2)] border border-[var(--sk-border)] px-2 py-0.5 rounded-full ml-2">${escapeHtml(badgeText)}</span></div>`
}

