import { formatIDR } from './parser'

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
  if (lower === 'rp' || lower === 'idr') return 'Rp'
  return token
}

function formatInlineAmount(token: string, prevToken?: string): string {
  const previous = prevToken?.trim().toLowerCase() ?? ''
  if (FORMAT_SKIP_PREV.has(previous)) return token
  if (isDateLikeToken(token)) return token

  // ponytail: reuse the shared input parser so backspace on formatted inputs
  // shrinks cleanly instead of bouncing between grouped values.
  const amount = parseAmountInput(token)
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
  const compact = normalized.includes('.') && !normalized.includes(',') && !/(jt|juta)$/.test(normalized)
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
