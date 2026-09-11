import { formatIDR, parseAmountToken } from './parser.ts'

const FORMAT_SKIP_PREV = new Set([
  'bagi',
  'dibagi',
  'patungan',
  'split',
  'share',
  'sharing',
  'x',
  'kali',
  'tgl',
  'tanggal',
  'jam',
])

function isDateLikeToken(token: string): boolean {
  return /^\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?$/.test(token.trim())
}

function normalizeCurrencyToken(token: string): string {
  const lower = token.trim().toLowerCase()
  if (lower === 'rp' || lower === 'idr') return ''
  return token
}

function formatInlineAmount(token: string, prevToken?: string): string {
  const previous = prevToken?.trim().toLowerCase() ?? ''
  if (FORMAT_SKIP_PREV.has(previous)) return token
  if (isDateLikeToken(token)) return token

  const amount = parseAmountToken(token)
  if (!amount || amount <= 0) return normalizeCurrencyToken(token)

  if (previous === 'rp' || previous === 'idr') {
    return formatIDR(amount).replace(/^Rp\s*/, '')
  }

  return formatIDR(amount)
}

export function parseAmountInput(raw: string): number {
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, '').replace(/^rp/, '')
  if (!normalized) return 0

  // ponytail: formatted IDR input already uses dot thousand separators; strip
  // them here so every amount field can safely reuse the same realtime formatter.
  const compact = normalized.includes('.') && !normalized.includes(',') && !/(k|rb|ribu|jt|juta|m|miliar|milyar)$/.test(normalized)
    ? normalized.replace(/\./g, '')
    : normalized

  const match = compact.match(/^(\d+(?:[.,]\d+)?)(k|rb|ribu|jt|juta)?$/)
  if (!match) return 0

  const numeric = Number(match[1].replace(',', '.'))
  if (!Number.isFinite(numeric)) return 0

  const suffix = match[2]
  if (suffix === 'k' || suffix === 'rb' || suffix === 'ribu') return Math.round(numeric * 1_000)
  if (suffix === 'jt' || suffix === 'juta') return Math.round(numeric * 1_000_000)
  return Math.round(numeric)
}

export function formatNaturalAmountInput(raw: string): string {
  if (!raw.trim()) return raw

  const parts = raw.split(/(\s+)/)
  const formatted: string[] = []

  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i]
    if (!part || /^\s+$/.test(part)) {
      formatted.push(part)
      continue
    }
    formatted.push(formatInlineAmount(part, parts[i - 2]))
  }

  return formatted.join('')
}

export function formatAmountFieldInput(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  return formatNaturalAmountInput(raw).replace(/^Rp\s*/i, '')
}

/**
 * Strips all non-digit characters and normalizes leading zeros.
 * E.g., "Rp 1.250.000" -> "1250000", "0050" -> "50", "0" -> "0", "" -> ""
 */
export function stripToDigits(raw: string): string {
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  return digits.replace(/^0+(?=\d)/, '')
}

/**
 * Formats a raw digit string or number into Indonesian Rupiah format with dots.
 * E.g., "1250000" -> "1.250.000", 50000 -> "50.000"
 */
export function formatRupiahLive(raw: string | number): string {
  if (raw === null || raw === undefined || raw === '') return ''
  const digits = typeof raw === 'number'
    ? Math.round(Math.max(0, raw)).toString()
    : stripToDigits(String(raw))
  if (!digits) return ''
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/**
 * Calculates the new cursor position after reformatting the input text with thousand separators.
 * Preserves the user's editing position by tracking the number of digits before the cursor.
 */
export function calculateCursorPosition(
  oldFormatted: string,
  newFormatted: string,
  oldCursor: number
): number {
  if (oldCursor <= 0) return 0
  if (oldCursor >= oldFormatted.length) return newFormatted.length

  const digitsBefore = oldFormatted.slice(0, oldCursor).replace(/\D/g, '').length
  if (digitsBefore === 0) return 0

  let count = 0
  for (let i = 0; i < newFormatted.length; i++) {
    if (/\d/.test(newFormatted[i])) {
      count++
      if (count === digitsBefore) {
        return i + 1
      }
    }
  }
  return newFormatted.length
}
