/**
 * SakuKilat — Category & Subcategory Deduplication & Normalization Utilities
 *
 * Requirements:
 * - 3.7: WHEN displaying subcategory chips or badges, THE Saku_Submenu_Navigator
 *        SHALL render the items using a Flex_Wrap_Layout without horizontal scroll carousels.
 */

/**
 * Standard CSS classes for subcategory chip/badge container elements.
 * Strict flex-wrap layout allowing badges to drop to subsequent lines without horizontal scrolling.
 */
export const SUBCATEGORY_CONTAINER_CLASS = 'flex flex-wrap gap-1.5'

/**
 * Validates whether a CSS class string enforces the strict Flex-Wrap layout invariant:
 * 1. Must include 'flex' or 'inline-flex'
 * 2. Must include 'flex-wrap'
 * 3. Must NOT contain horizontal scroll container styles ('overflow-x-auto', 'overflow-x-scroll')
 * 4. Must NOT contain carousel-style nowrap scrolling
 */
export function isFlexWrapLayout(className: string): boolean {
  if (!className || typeof className !== 'string') return false
  const tokens = className.split(/\s+/).filter(Boolean)
  const hasFlex = tokens.includes('flex') || tokens.includes('inline-flex')
  const hasWrap = tokens.includes('flex-wrap')
  const hasScroll = tokens.some(
    t => t === 'overflow-x-auto' ||
         t === 'overflow-x-scroll' ||
         t === 'overflow-auto' ||
         t === 'overflow-scroll' ||
         (t.startsWith('overflow-x-') && (t.includes('scroll') || t.includes('auto')))
  )
  return hasFlex && hasWrap && !hasScroll
}

export interface LayoutValidationResult {
  isValid: boolean
  hasFlex: boolean
  hasWrap: boolean
  hasScroll: boolean
  issues: string[]
}

/**
 * Detailed validation report for subcategory container styles.
 */
export function validateSubcategoryContainerLayout(className: string): LayoutValidationResult {
  const issues: string[] = []
  if (!className || typeof className !== 'string') {
    return {
      isValid: false,
      hasFlex: false,
      hasWrap: false,
      hasScroll: false,
      issues: ['Class name is empty or not a string'],
    }
  }

  const tokens = className.split(/\s+/).filter(Boolean)
  const hasFlex = tokens.includes('flex') || tokens.includes('inline-flex')
  const hasWrap = tokens.includes('flex-wrap')
  const hasScroll = tokens.some(
    t => t === 'overflow-x-auto' ||
         t === 'overflow-x-scroll' ||
         t === 'overflow-auto' ||
         t === 'overflow-scroll'
  )

  if (!hasFlex) issues.push("Container missing 'flex' display utility")
  if (!hasWrap) issues.push("Container missing 'flex-wrap' utility (badges will not wrap)")
  if (hasScroll) issues.push("Container contains horizontal scroll utility ('overflow-x-auto'/'overflow-x-scroll')")

  return {
    isValid: hasFlex && hasWrap && !hasScroll,
    hasFlex,
    hasWrap,
    hasScroll,
    issues,
  }
}

export interface SubcategoryChipDescriptor {
  label: string
  isSelected: boolean
  className: string
}

export interface SubcategoryChipsRenderResult {
  containerClassName: string
  chips: SubcategoryChipDescriptor[]
  totalChips: number
  html: string
}

/**
 * Renders structured descriptor and HTML for subcategory badge/chip views.
 * Strictly guarantees flex-wrap layout without horizontal scrolling carousels.
 */
export function renderSubcategoryChips(
  subcategories: string[],
  options?: {
    selectedSubcategory?: string
    includeAllOption?: boolean
    allOptionLabel?: string
    containerClassName?: string
  }
): SubcategoryChipsRenderResult {
  const deduped = dedupeSubcategories(subcategories ?? [])
  const selected = options?.selectedSubcategory?.trim() || ''
  const includeAll = options?.includeAllOption ?? false
  const allLabel = options?.allOptionLabel ?? 'Tanpa Sub'
  const containerClassName = options?.containerClassName || SUBCATEGORY_CONTAINER_CLASS

  // Enforce flex-wrap invariant on container
  const baseContainer = isFlexWrapLayout(containerClassName)
    ? containerClassName
    : `${containerClassName} flex flex-wrap gap-1.5`.replace(/overflow-x-(auto|scroll)/g, '').trim()

  const chips: SubcategoryChipDescriptor[] = []

  if (includeAll) {
    chips.push({
      label: allLabel,
      isSelected: !selected,
      className: !selected
        ? 'bg-[var(--sk-surface-3)] text-[var(--sk-text)] border-[var(--sk-border-2)]'
        : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] border-transparent',
    })
  }

  for (const sub of deduped) {
    const isSelected = selected.toLowerCase() === sub.toLowerCase()
    chips.push({
      label: sub,
      isSelected,
      className: isSelected
        ? 'bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)] border-[var(--sk-cyan)]'
        : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] border-transparent',
    })
  }

  const chipsHtml = chips
    .map(
      c =>
        `<button type="button" class="px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${c.className}">${c.label}</button>`
    )
    .join('')

  const html = `<div class="${baseContainer}">${chipsHtml}</div>`

  return {
    containerClassName: baseContainer,
    chips,
    totalChips: chips.length,
    html,
  }
}

export const DEFAULT_SUBCATEGORIES: Record<string, string[]> = {
  makanan: ['Makan Siang/Malam', 'Kopi & Nongkrong', 'Bahan Dapur', 'Jajan & Camilan', 'Sarapan'],
  transportasi: ['Bensin', 'Parkir & Tol', 'Ojek Online', 'Servis Kendaraan', 'Tiket Kendaraan'],
  belanja: ['Kebutuhan Rumah', 'Pakaian & Fashion', 'Elektronik & Gadget', 'Hobi & Hiburan'],
  tagihan: ['Listrik PLN', 'Internet & WiFi', 'Pulsa & Paket Data', 'Air PDAM', 'Langganan Aplikasi'],
  kesehatan: ['Obat & Vitamin', 'Dokter & Klinik', 'Olahraga & Gym', 'Perawatan Diri'],
  hiburan: ['Nonton Bioskop', 'Streaming', 'Game & Hiburan', 'Liburan & Wisata'],
  pendidikan: ['Buku & Modul', 'Kursus & Sertifikasi', 'Alat Tulis', 'SPP & Biaya Sekolah'],
  gaji: ['Gaji Pokok', 'Bonus & THR', 'Tunjangan', 'Insentif'],
  investasi: ['Saham & Reksadana', 'Kripto', 'Emas', 'Dividen'],
  freelance: ['Proyek Klien', 'Desain & Coding', 'Jasa / Konsultasi'],
}

export function getDefaultSubcategories(categoryId: string): string[] {
  return DEFAULT_SUBCATEGORIES[categoryId] ?? []
}

/**
 * Deduplicate subcategories case-insensitively and trimmed, preserving first seen casing.
 */
export function dedupeSubcategories(subs: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const s of subs) {
    if (!s) continue
    const trimmed = s.trim()
    const key = trimmed.toLowerCase()
    if (trimmed && !seen.has(key)) {
      seen.add(key)
      result.push(trimmed)
    }
  }
  return result
}

/**
 * Normalized key for category comparison (e.g. 'Lainnya', 'lainnya', 'Lain-lain' -> 'lainnya')
 */
export function normalizeCategoryKey(labelOrId: string): string {
  return (labelOrId || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '')
}
