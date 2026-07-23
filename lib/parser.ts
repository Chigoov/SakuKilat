/**
 * SakuKilat — Smart Natural Language Transaction Parser
 * Parses Indonesian natural language input like:
 *   "makan soto 25k gopay"
 *   "terima gaji 5jt transfer"
 *   "beli kopi 18.500 tunai"
 *   "ongkir grab stasiun tawang 38k ovo"
 *   "bayar listrik 38,500 bca"
 */

export type PaymentMethod =
  | 'gopay'
  | 'ovo'
  | 'dana'
  | 'shopeepay'
  | 'bca'
  | 'bni'
  | 'bri'
  | 'mandiri'
  | 'jago'
  | 'tunai'
  | 'transfer'
  | 'qris'
  | 'kartu'
  | 'lainnya'

export type TransactionType = 'expense' | 'income'

export type Category =
  | 'makanan'
  | 'transportasi'
  | 'belanja'
  | 'hiburan'
  | 'kesehatan'
  | 'pendidikan'
  | 'tagihan'
  | 'gaji'
  | 'investasi'
  | 'penjualan'
  | 'cashback'
  | 'refund'
  | 'hadiah'
  | 'freelance'
  | 'transfer'
  | 'lainnya'

export interface ParsedTransaction {
  kind?: 'transaction'
  description: string
  amount: number
  type: TransactionType
  category: string // built-in Category id OR a custom category id
  subcategory?: string
  paymentMethod: string // built-in PaymentMethod id OR a custom payment id
  date?: Date
  rawInput: string
  confidence: number // 0-1
  warning?: string
}

export interface ParsedTransfer {
  kind: 'transfer'
  description: string
  amount: number
  fromWalletId: string
  toWalletId: string
  rawInput: string
  confidence: number
  warning?: string
}

export interface ParsedSaving {
  kind: 'saving'
  description: string
  amount: number
  fromWalletId: string
  toWalletId: string
  rawInput: string
  confidence: number
  warning?: string
}

export type ParsedEntry = ParsedTransaction | ParsedTransfer | ParsedSaving

/**
 * User-defined slang that the parser should also recognize.
 * Lets users teach SakuKilat their own payment apps & categories.
 */
export interface CustomPayment {
  id: string
  label: string
  keywords: string[]
}
export interface CustomCategory {
  id: string
  label: string
  keywords: string[]
  subcategories?: string[]
  type?: TransactionType
  /** Kunci ikon custom, opsional. */
  icon?: string
  /** Batas pengeluaran per bulan untuk kategori ini. 0/undefined = tanpa batas. */
  monthlyBudget?: number
}
export interface ParserExtras {
  payments?: CustomPayment[]
  categories?: CustomCategory[]
  lastActiveWalletId?: string
}

// ── Payment method keywords ──────────────────────────────────────────────────
// Each entry: [exactTokens[], substringTokens[]]
// exactTokens  → matched only against a complete whitespace-split token
// substringTokens → also matched if the token *contains* the keyword
// This prevents "bca" from matching inside "abca" etc.
const PAYMENT_MAP: Array<{ method: PaymentMethod; exact: string[]; contains: string[] }> = [
  { method: 'gopay',     exact: ['gopay', 'gp'],                        contains: [] },
  { method: 'ovo',       exact: ['ovo'],                                 contains: [] },
  { method: 'dana',      exact: ['dana'],                                contains: [] },
  { method: 'shopeepay', exact: ['shopeepay', 'shopepay', 'shopee', 'spay'], contains: ['shopeepay', 'shopepay'] },
  { method: 'qris',      exact: ['qris'],                                contains: [] },
  { method: 'jago',      exact: ['jago'],                                contains: [] },
  { method: 'bca',       exact: ['bca', 'klikbca'],                      contains: [] },
  { method: 'bni',       exact: ['bni'],                                 contains: [] },
  { method: 'bri',       exact: ['bri', 'brimo'],                        contains: [] },
  { method: 'mandiri',   exact: ['mandiri', 'livin'],                    contains: [] },
  { method: 'kartu',     exact: ['kartu', 'debit', 'kredit', 'cc'],      contains: [] },
  { method: 'transfer',  exact: ['transfer', 'tf'],                      contains: [] },
  { method: 'tunai',     exact: ['tunai', 'cash', 'kontan'],             contains: [] },
]

const CURRENCY_TOKENS = new Set(['rp', 'idr'])
const AMOUNT_SUFFIX_MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  rb: 1_000,
  ribu: 1_000,
  jt: 1_000_000,
  juta: 1_000_000,
  m: 1_000_000_000,
  miliar: 1_000_000_000,
  milyar: 1_000_000_000,
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeToken(token: string): string {
  return token
    .toLowerCase()
    .trim()
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '')
}

const wordRegexCache = new Map<string, RegExp>()

function wordMatch(str: string, kw: string): boolean {
  const normalized = kw.trim().toLowerCase()
  if (!normalized) return false
  let regex = wordRegexCache.get(normalized)
  if (!regex) {
    regex = new RegExp(`(^|[^a-z0-9_])${escapeRegex(normalized)}(?=$|[^a-z0-9_])`, 'i')
    wordRegexCache.set(normalized, regex)
  }
  return regex.test(str)
}

// ── Income keywords ──────────────────────────────────────────────────────────
const INCOME_KEYWORDS = [
  'gaji', 'salary', 'terima', 'pemasukan', 'pendapatan', 'income',
  'bonus', 'komisi', 'dividen', 'honor', 'dibayar', 'jual', 'jualan',
  'refund', 'cashback', 'hadiah', 'thr', 'freelance',
]

const INCOME_START_KEYWORDS = new Set([
  'gaji', 'salary', 'terima', 'pemasukan', 'pendapatan', 'income',
  'bonus', 'komisi', 'dividen', 'honor', 'dibayar',
  'refund', 'cashback', 'hadiah', 'thr', 'freelance',
])

const INCOME_START_PHRASES = [
  ['dapat', 'gaji'],
  ['dapet', 'gaji'],
  ['dapat', 'bonus'],
  ['dapet', 'bonus'],
  ['dapat', 'thr'],
  ['dapet', 'thr'],
  ['hasil', 'jual'],
  ['hasil', 'jualan'],
  ['uang', 'masuk'],
]

const EXPENSE_START_KEYWORDS = new Set([
  'keluar', 'expense', 'pengeluaran', 'bayar', 'beli', 'belanja',
  'makan', 'minum', 'ongkir', 'jajan', 'parkir', 'bensin', 'tagihan',
])

const EXPLICIT_TYPE_PREFIXES = new Set([
  'keluar', 'expense', 'pengeluaran', 'masuk', 'income', 'pemasukan',
])

const DIVIDE_TOKENS = new Set(['bagi', 'dibagi', 'patungan', 'split'])
const MULTIPLY_TOKENS = new Set(['x', 'kali'])

// Penghubung antar-transaksi. Dipakai HANYA untuk mendeteksi (bukan memecah)
// apakah satu input berisi lebih dari satu transaksi, sehingga parser bisa
// menurunkan confidence & memberi peringatan alih-alih menggabung diam-diam.
const CLAUSE_CONNECTORS = new Set(['terus', 'lalu', 'kemudian', 'trus', 'abis', 'habis'])

export const INCOME_CATEGORIES: Category[] = ['gaji', 'investasi', 'penjualan', 'cashback', 'refund', 'hadiah', 'freelance']
export const EXPENSE_CATEGORIES: Category[] = ['makanan', 'transportasi', 'belanja', 'hiburan', 'kesehatan', 'pendidikan', 'tagihan', 'transfer']

export function getBuiltinCategoryType(category: string): TransactionType {
  return INCOME_CATEGORIES.includes(category as Category) ? 'income' : 'expense'
}

// ── Category keyword map ─────────────────────────────────────────────────────
// Keywords are matched as whole words against the lowercased description
// (using a word-boundary aware check), preventing partial false-matches.
const CATEGORY_KEYWORDS: Record<Category, string[]> = {
  makanan: [
    'makan', 'minum', 'kopi', 'teh', 'nasi', 'soto', 'bakso',
    'ayam', 'pizza', 'burger', 'sushi', 'resto', 'warung', 'kantin',
    'cafe', 'kafe', 'snack', 'camilan', 'jajan', 'boba', 'juice',
    'mcdonalds', 'kfc', 'gofood', 'shopeefood', 'pecel', 'rawon', 'sate',
    'martabak', 'gorengan', 'indomie', 'nasgor', 'esteh', 'mie', 'mi',
    'es', 'minuman', 'sarapan', 'makan siang', 'makan malam',
  ],
  transportasi: [
    'ongkir', 'bensin', 'bbm', 'parkir', 'tol', 'ojek', 'gojek', 'grab',
    'taxi', 'taksi', 'busway', 'transjakarta', 'kereta', 'commuter',
    'krl', 'mrt', 'lrt', 'bis', 'angkot', 'pesawat',
    'tiket', 'uber', 'maxim', 'servis motor', 'servis mobil',
  ],
  belanja: [
    'beli', 'belanja', 'shopee', 'tokopedia', 'lazada', 'tiktokshop',
    'baju', 'celana', 'sepatu', 'tas', 'elektronik', 'hp', 'laptop',
    'charger', 'kabel', 'aksesoris', 'kosmetik', 'skincare', 'parfum',
    'buku', 'peralatan', 'furniture', 'supermarket',
  ],
  hiburan: [
    'netflix', 'spotify', 'youtube', 'game', 'bioskop', 'film',
    'konser', 'event', 'steam', 'playstation', 'xbox', 'disney',
    'prime', 'vidio', 'cinema',
  ],
  kesehatan: [
    'dokter', 'rumah sakit', 'klinik', 'apotek', 'obat',
    'vitamin', 'suplemen', 'gym', 'fitness', 'olahraga',
    'periksa', 'laboratorium', 'dental', 'gigi',
  ],
  pendidikan: [
    'kursus', 'les', 'bimbel', 'sekolah', 'kampus', 'kuliah',
    'spp', 'ukt', 'udemy', 'coursera', 'dicoding',
    'ruangguru', 'zenius', 'seminar', 'pelatihan', 'workshop',
  ],
  tagihan: [
    'listrik', 'pln', 'air', 'pdam', 'internet', 'wifi',
    'indihome', 'telkom', 'pulsa', 'paket data',
    'iuran', 'pajak', 'bpjs', 'asuransi', 'cicilan', 'angsuran',
    'kpr', 'tagihan', 'bayar', 'langganan',
  ],
  gaji: [
    'gaji', 'salary', 'upah', 'honor', 'thr', 'bonus', 'komisi',
    'insentif', 'honorarium',
  ],
  investasi: [
    'investasi', 'saham', 'reksadana', 'crypto',
    'bitcoin', 'ethereum', 'emas', 'deposito', 'obligasi',
    'nabung', 'bibit', 'ajaib',
  ],
  penjualan: [
    'jual', 'jualan', 'penjualan', 'dagang', 'dagangan', 'order',
    'pesanan', 'profit', 'laba',
  ],
  cashback: [
    'cashback', 'cash back', 'reward', 'rewards',
  ],
  refund: [
    'refund', 'pengembalian', 'retur', 'dikembalikan',
  ],
  hadiah: [
    'hadiah', 'gift', 'angpao', 'kado',
  ],
  freelance: [
    'freelance', 'freelancer', 'proyek', 'project', 'job',
    'client', 'klien', 'fee freelance',
  ],
  transfer: [
    'transfer', 'kirim', 'setor', 'tarik tunai',
  ],
  lainnya: [],
}

// ── Amount normalizer ────────────────────────────────────────────────────────
/**
 * Converts a raw number string (possibly with Indonesian-style separators)
 * into a plain float. Rules:
 *   - Dot as thousands separator: "38.500" → 38500
 *     Heuristic: if there's exactly one dot AND the substring after it is
 *     exactly 3 digits, treat dot as thousands sep (no fractional part).
 *   - Comma as thousands separator: "38,500" → 38500
 *     Same heuristic applies for a single comma + 3 trailing digits.
 *   - Mixed "1.500.000" → 1500000 (multiple dots → all are thousands seps)
 *   - Standard decimal "18.5" / "1,5" → kept as-is
 */
function normalizeNumberString(raw: string, mode: 'plain' | 'suffix' = 'suffix'): number | null {
  const s = raw.trim().replace(/\s+/g, '')
  if (!/^\d+(?:[.,]\d+)*$/.test(s)) return null

  if (mode === 'plain') {
    const separatorCount = (s.match(/[.,]/g) || []).length
    if (separatorCount === 0) {
      const value = Number(s)
      return Number.isFinite(value) ? value : null
    }

    const compact = s.replace(/[.,]/g, '')
    if (!/^\d+$/.test(compact)) return null

    const compactValue = Number(compact)
    if (!Number.isFinite(compactValue)) return null

    return compactValue < 1_000 ? compactValue * 100 : compactValue
  }

  {
    const dotCount = (s.match(/\./g) || []).length
    const commaCount = (s.match(/,/g) || []).length

    if (dotCount > 0 && commaCount > 0) {
      const decimalSep = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ','
      const thousandSep = decimalSep === '.' ? ',' : '.'
      const pieces = s.split(decimalSep)
      if (pieces.length > 2) return null

      const [integerPart, fractionPart] = pieces
      if (!integerPart) return null

      const groups = integerPart.split(thousandSep)
      if (groups.length > 1 && groups.slice(1).some(group => group.length !== 3)) return null
      if (fractionPart !== undefined && !/^\d{1,2}$/.test(fractionPart)) return null

      const normalized = `${groups.join('')}${fractionPart ? `.${fractionPart}` : ''}`
      const value = Number(normalized)
      return Number.isFinite(value) ? value : null
    }

    const separator = dotCount > 0 ? '.' : commaCount > 0 ? ',' : null
    if (!separator) {
      const value = Number(s)
      return Number.isFinite(value) ? value : null
    }

    const parts = s.split(separator)
    if (parts.some(part => part.length === 0)) return null

    if (parts.length > 2) {
      if (parts.slice(1).some(part => part.length !== 3)) return null
      const value = Number(parts.join(''))
      return Number.isFinite(value) ? value : null
    }

    const [left, right] = parts
    const normalized =
      right.length === 3
        ? `${left}${right}`
        : right.length <= 2
          ? `${left}.${right}`
          : null

    if (!normalized) return null
    const value = Number(normalized)
    return Number.isFinite(value) ? value : null
  }

}

// ── Amount token parser ──────────────────────────────────────────────────────
/**
 * Attempts to parse a single whitespace-split token as a currency amount.
 * Returns null if the token is not an amount token.
 */
export function parseAmountToken(token: string): number | null {
  const normalizedToken = normalizeToken(token)
  const hasCurrencyPrefix = /^(rp|idr)(?=\d)/.test(normalizedToken)
  const t = normalizedToken.replace(/^(rp|idr)(?=\d)/, '')

  // suffix-based patterns — capture numeric part then multiply
  // supports: 25k, 25K, 25rb, 25ribu, 2jt, 2juta, 1.5jt, 1,5jt, 3m, 3miliar
  const suffixPattern = /^(\d+(?:[.,]\d+)*)(k|rb|ribu|jt|juta|m|miliar|milyar)$/
  const suffixMatch = t.match(suffixPattern)

  if (suffixMatch) {
    const numPart = normalizeNumberString(suffixMatch[1], 'suffix')
    const suffix  = suffixMatch[2]
    if (numPart === null) return null
    return numPart * AMOUNT_SUFFIX_MULTIPLIERS[suffix]
  }

  // plain numeric token (digits, dots, commas only)
  if (/^[\d.,]+$/.test(t)) {
    const compactDigits = t.replace(/[.,]/g, '')
    if (!hasCurrencyPrefix && /^0\d{8,}$/.test(compactDigits)) return null
    if (!hasCurrencyPrefix && compactDigits.length >= 10) return null

    const val = normalizeNumberString(t, 'plain')
    return val === null ? null : val
  }

  return null
}

function parseSplitSuffixAmount(tokens: string[], suffixIndex: number): { amount: number; indexes: Set<number> } | null {
  const suffix = normalizeToken(tokens[suffixIndex])
  const multiplier = AMOUNT_SUFFIX_MULTIPLIERS[suffix]
  if (!multiplier || suffixIndex === 0) return null

  const numeric = normalizeNumberString(normalizeToken(tokens[suffixIndex - 1]), 'suffix')
  if (numeric === null) return null

  return { amount: numeric * multiplier, indexes: new Set([suffixIndex - 1, suffixIndex]) }
}

function parseAmountEndingAt(tokens: string[], index: number): { amount: number; indexes: Set<number> } | null {
  const direct = parseAmountToken(tokens[index])
  if (direct !== null) return { amount: direct, indexes: new Set([index]) }
  return parseSplitSuffixAmount(tokens, index)
}

function amountWarning(tokens: string[], indexes: Set<number>, amount: number): string | undefined {
  if (amount >= 1_000 || indexes.size !== 1) return undefined
  const [index] = Array.from(indexes)
  const token = normalizeToken(tokens[index]).replace(/^(rp|idr)(?=\d)/, '')
  return /^\d+$/.test(token) ? 'Nominal di bawah Rp1.000?' : undefined
}

function parsePositiveIntegerToken(token: string): number | null {
  const normalized = normalizeToken(token)
  if (!/^\d+$/.test(normalized)) return null
  const value = Number(normalized)
  return Number.isInteger(value) && value > 0 ? value : null
}

function isAmountModifierToken(token: string): boolean {
  const normalized = normalizeToken(token)
  return DIVIDE_TOKENS.has(normalized) || MULTIPLY_TOKENS.has(normalized)
}

function isAmountModifierOperand(tokens: string[], index: number): boolean {
  if (index <= 0) return false
  return parsePositiveIntegerToken(tokens[index]) !== null && isAmountModifierToken(tokens[index - 1])
}

function applyAmountModifiers(
  amount: number,
  tokens: string[],
  amountIndexes: Set<number>
): { amount: number; indexes: Set<number>; modifierApplied: boolean } {
  const indexes = new Set(amountIndexes)
  const amountEndIndex = Math.max(...Array.from(amountIndexes))
  let adjustedAmount = amount
  let modifierApplied = false

  for (let i = amountEndIndex + 1; i < tokens.length - 1; i++) {
    const modifier = normalizeToken(tokens[i])
    const operand = parsePositiveIntegerToken(tokens[i + 1])
    if (operand === null) continue

    if (DIVIDE_TOKENS.has(modifier)) {
      adjustedAmount = adjustedAmount / operand
    } else if (MULTIPLY_TOKENS.has(modifier)) {
      adjustedAmount = adjustedAmount * operand
    } else {
      continue
    }

    indexes.add(i)
    indexes.add(i + 1)
    modifierApplied = true
    i += 1
  }

  return {
    amount: Math.round(adjustedAmount),
    indexes,
    modifierApplied,
  }
}

function dateWithOffset(days: number): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + days)
}

function parseDateHint(tokens: string[]): { date: Date; indexes: Set<number> } | null {
  const normalized = tokens.map(normalizeToken)

  for (let i = 0; i < normalized.length; i++) {
    const token = normalized[i]

    if (token === 'kemarin') {
      return { date: dateWithOffset(-1), indexes: new Set([i]) }
    }

    if ((token === 'hari' && normalized[i + 1] === 'ini') || token === 'today') {
      return { date: dateWithOffset(0), indexes: token === 'hari' ? new Set([i, i + 1]) : new Set([i]) }
    }

    const compactMatch = token.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/)
    if (compactMatch) {
      const day = Number(compactMatch[1])
      const month = Number(compactMatch[2])
      const now = new Date()
      const year = compactMatch[3]
        ? Number(compactMatch[3].length === 2 ? `20${compactMatch[3]}` : compactMatch[3])
        : now.getFullYear()
      const date = new Date(year, month - 1, day)
      if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
        return { date, indexes: new Set([i]) }
      }
    }

    if ((token === 'tgl' || token === 'tanggal') && normalized[i + 1]) {
      const day = parsePositiveIntegerToken(normalized[i + 1])
      if (day && day >= 1 && day <= 31) {
        const now = new Date()
        const date = new Date(now.getFullYear(), now.getMonth(), day)
        return { date, indexes: new Set([i, i + 1]) }
      }
    }
  }

  return null
}

function amountTokenLooksExplicit(token: string): boolean {
  const normalized = normalizeToken(token)
  return /^(rp|idr)(?=\d)/.test(normalized) || /\d(k|rb|ribu|jt|juta|m|miliar|milyar)$/.test(normalized)
}

function isContextualAmount(tokens: string[], indexes: Set<number>, extras?: ParserExtras): boolean {
  const sortedIndexes = Array.from(indexes).sort((a, b) => a - b)
  const start = sortedIndexes[0]
  const end = sortedIndexes[sortedIndexes.length - 1]

  if (sortedIndexes.some(index => amountTokenLooksExplicit(tokens[index]))) return true
  if (start > 0 && isCurrencyToken(tokens[start - 1])) return true
  if (end < tokens.length - 1 && isPaymentToken(tokens[end + 1], extras)) return true
  if (start > 0 && isPaymentToken(tokens[start - 1], extras)) return true
  if (end < tokens.length - 1 && isAmountModifierToken(tokens[end + 1])) return true

  return false
}

// ── Detect payment method ────────────────────────────────────────────────────
/**
 * Scans tokens left-to-right and returns the first payment method found.
 * Uses exact matching by default; the `contains` list allows substring
 * matching for compound keywords like "shopeepay".
 * Defaults to 'tunai' (cash) when no method is detected.
 */
/**
 * Expand multi-word payment/wallet keywords into single-token aliases.
 *
 * Why: detectPaymentMethod() compares against ONE TOKEN AT A TIME. A wallet
 * labelled "Kartu Kredit" with the user-typed keyword "kartu kredit" has a
 * space inside it, so it can never match a tokenised input. We pre-build
 * underscore-joined and concatenated aliases so the matcher can find it.
 *
 * Also auto-derives aliases from the wallet/payment LABEL itself, because
 * users routinely add a wallet without bothering to fill the keywords field.
 */
function expandMultiWordKeywords(extras?: ParserExtras): ParserExtras | undefined {
  if (!extras?.payments) return extras
  const expanded = extras.payments.map(p => {
    const set = new Set<string>(p.keywords.map(normalizeToken).filter(Boolean))
    const seeds: string[] = [...p.keywords, p.label ?? '']
    for (const raw of seeds) {
      const lower = (raw ?? '').trim().toLowerCase()
      if (!lower) continue
      if (/\s/.test(lower)) {
        // "kartu kredit" -> add "kartukredit" + "kartu_kredit" as token aliases
        set.add(lower.replace(/\s+/g, ''))
        set.add(lower.replace(/\s+/g, '_'))
      }
    }
    return { ...p, keywords: Array.from(set) }
  })
  return { ...extras, payments: expanded }
}

/**
 * Pre-tokenises a raw input array so that multi-word custom keywords
 * collapse into a single token before downstream matching runs.
 *
 * Example: with wallet "Kartu Kredit", ["mie","ayam","50000","kartu","kredit"]
 * becomes ["mie","ayam","50000","kartu_kredit"]. Sorted longest-first so
 * "Kartu Kredit" (2 words) is preferred over an also-defined "Kartu" (1).
 */
function preprocessTokens(tokens: string[], extras?: ParserExtras): string[] {
  if (!extras?.payments || tokens.length < 2) return tokens

  type MultiEntry = { wordTokens: string[]; replacement: string }
  const entries: MultiEntry[] = []
  for (const p of extras.payments) {
    const seeds: string[] = [...p.keywords, p.label ?? '']
    for (const raw of seeds) {
      const lower = (raw ?? '').trim().toLowerCase()
      if (!lower || !/\s/.test(lower)) continue
      entries.push({
        wordTokens: lower.split(/\s+/).map(normalizeToken).filter(Boolean),
        replacement: lower.replace(/\s+/g, '_'),
      })
    }
  }
  if (entries.length === 0) return tokens

  // Longest match wins — "kartu kredit" (2) beats "kartu" (1).
  entries.sort((a, b) => b.wordTokens.length - a.wordTokens.length)

  const lower = tokens.map(t => normalizeToken(t))
  const out: string[] = []
  let i = 0
  while (i < tokens.length) {
    let matched = false
    for (const e of entries) {
      const n = e.wordTokens.length
      if (n < 2 || i + n > tokens.length) continue
      let ok = true
      for (let j = 0; j < n; j++) {
        if (lower[i + j] !== e.wordTokens[j]) { ok = false; break }
      }
      if (ok) {
        out.push(e.replacement)
        i += n
        matched = true
        break
      }
    }
    if (!matched) {
      out.push(tokens[i])
      i++
    }
  }
  return out
}

function detectPaymentMethod(tokens: string[], extras?: ParserExtras): string {
  for (const token of tokens) {
    const tl = normalizeToken(token)
    // Custom user-defined payments take priority (their personal slang)
    if (extras?.payments) {
      for (const p of extras.payments) {
        if (p.keywords.some(kw => tl === normalizeToken(kw))) return p.id
      }
    }
    for (const entry of PAYMENT_MAP) {
      if (entry.exact.includes(tl)) return entry.method
      if (entry.contains.some(kw => tl.includes(kw))) return entry.method
    }
  }
  // Default: cash / tunai
  return 'tunai'
}

function detectExplicitPaymentMethod(tokens: string[], extras?: ParserExtras): string | null {
  for (const token of tokens) {
    if (isPaymentToken(token, extras)) return detectPaymentMethod([token], extras)
  }
  return null
}

// ── Token is a payment keyword? ──────────────────────────────────────────────
function isPaymentToken(token: string, extras?: ParserExtras): boolean {
  const tl = normalizeToken(token)
  if (extras?.payments) {
    for (const p of extras.payments) {
      if (p.keywords.some(kw => tl === normalizeToken(kw))) return true
    }
  }
  for (const entry of PAYMENT_MAP) {
    if (entry.exact.includes(tl)) return true
    if (entry.contains.some(kw => tl.includes(kw))) return true
  }
  return false
}

function isCurrencyToken(token: string): boolean {
  return CURRENCY_TOKENS.has(normalizeToken(token))
}

// ── Split-bill detector ─────────────────────────────────────────────
// Detects "bagi N", "patungan N", "split N", "share N", or inline "/N"
// e.g. "makan padang 200k bagi 4 gopay" → amount /= 4, marker "[1/4]" prepended.
const SPLIT_KEYWORDS = new Set<string>(['bagi', 'patungan', 'split', 'share', 'sharing'])
function parseSplitDivisor(tokens: string[]): { divisor: number; indexes: Set<number> } | null {
  const indexes = new Set<number>()
  let divisor = 1

  for (let i = 0; i < tokens.length - 1; i++) {
    const kw = normalizeToken(tokens[i])
    if (!SPLIT_KEYWORDS.has(kw)) continue
    const next = normalizeToken(tokens[i + 1]).replace(/[^0-9]/g, '')
    const num = Number.parseInt(next, 10)
    if (Number.isFinite(num) && num >= 2 && num <= 99) {
      divisor = num
      indexes.add(i)
      indexes.add(i + 1)
      break
    }
  }

  if (divisor === 1) {
    for (let i = 0; i < tokens.length; i++) {
      const m = /^\/(\d{1,2})$/.exec(tokens[i].trim())
      if (m) {
        const num = Number.parseInt(m[1], 10)
        if (num >= 2 && num <= 99) {
          divisor = num
          indexes.add(i)
          break
        }
      }
    }
  }

  return divisor > 1 ? { divisor, indexes } : null
}

function findTrailingAmount(tokens: string[], extras?: ParserExtras): { amount: number; indexes: Set<number> } | null {
  let amountEndIndex = tokens.length - 1
  const dateHint = parseDateHint(tokens)

  while (
    amountEndIndex >= 0 &&
    (
      isPaymentToken(tokens[amountEndIndex], extras) ||
      Boolean(dateHint?.indexes.has(amountEndIndex)) ||
      isAmountModifierToken(tokens[amountEndIndex]) ||
      isAmountModifierOperand(tokens, amountEndIndex)
    )
  ) {
    amountEndIndex -= 1
  }

  if (amountEndIndex < 0) return null
  const parsed = parseAmountEndingAt(tokens, amountEndIndex)
  if (!parsed || !Number.isFinite(parsed.amount) || parsed.amount <= 0) return null

  return {
    amount: Math.round(parsed.amount),
    indexes: parsed.indexes,
  }
}

function findAnyAmount(tokens: string[]): { amount: number; startIndex: number; endIndex: number; indexes: Set<number> } | null {
  for (let i = 0; i < tokens.length; i++) {
    if (isAmountModifierOperand(tokens, i)) continue
    const parsed = parseAmountEndingAt(tokens, i)
    if (!parsed || !Number.isFinite(parsed.amount) || parsed.amount <= 0) continue
    const indexes = Array.from(parsed.indexes)
    return {
      amount: Math.round(parsed.amount),
      startIndex: Math.min(...indexes),
      endIndex: Math.max(...indexes),
      indexes: parsed.indexes,
    }
  }
  return null
}

function hasKeyword(tokens: string[], keywords: string[]): boolean {
  return tokens.some(token => keywords.includes(normalizeToken(token)))
}

/**
 * Hitung berapa banyak nominal berbeda yang muncul di sederet token.
 * Dipakai untuk mendeteksi input multi-transaksi (mis. "... 450rb ... 3rb ...").
 * Token operand pengali/pembagi (cth. angka setelah "bagi") tidak dihitung.
 */
function countDistinctAmounts(tokens: string[]): number {
  let count = 0
  let i = 0
  while (i < tokens.length) {
    if (isAmountModifierOperand(tokens, i)) { i += 1; continue }
    const parsed = parseAmountEndingAt(tokens, i)
    if (parsed && Number.isFinite(parsed.amount) && parsed.amount > 0) {
      count += 1
      // Lewati seluruh indeks milik nominal ini supaya tidak terhitung dobel.
      i = Math.max(...Array.from(parsed.indexes)) + 1
      continue
    }
    i += 1
  }
  return count
}

/**
 * Apakah input kemungkinan memuat lebih dari satu transaksi?
 * Sinyal kuat = ada kata penghubung klausa (terus/lalu/kemudian) DAN
 * ada minimal dua nominal terpisah. Kombinasi ini menekan false-positive
 * dari kata penghubung yang kebetulan jadi bagian deskripsi.
 */
function looksLikeMultiTransaction(tokens: string[]): boolean {
  const normalized = tokens.map(normalizeToken)
  const hasConnector = normalized.some(token => CLAUSE_CONNECTORS.has(token))
  if (!hasConnector) return false
  return countDistinctAmounts(tokens) >= 2
}

function parseTransferCommand(input: string, extras?: ParserExtras): ParsedTransfer | null {
  const trimmed = input.trim()
  const tokens = trimmed.split(/\s+/)
  const normalized = tokens.map(normalizeToken)

  if (!hasKeyword(tokens, ['pindah', 'transfer', 'kirim', 'topup'])) return null

  const amount = findAnyAmount(tokens)
  if (!amount) return null

  const keIndex = normalized.findIndex((token, index) => token === 'ke' && index !== 0)
  if (keIndex === -1) return null

  const tokensBetweenAmountAndTarget =
    keIndex > amount.endIndex
      ? tokens.slice(amount.endIndex + 1, keIndex)
      : []
  const tokensBeforeAmount = tokens
    .slice(0, amount.startIndex)
    .filter(token => !['pindah', 'transfer', 'kirim', 'topup', 'tf'].includes(normalizeToken(token)))
  const sourceTokens = tokensBetweenAmountAndTarget.length > 0 ? tokensBetweenAmountAndTarget : tokensBeforeAmount
  const destinationTokens = tokens.slice(keIndex + 1)

  const fromWalletId = detectExplicitPaymentMethod(sourceTokens, extras) ?? extras?.lastActiveWalletId ?? 'tunai'
  const toWalletId = detectExplicitPaymentMethod(destinationTokens, extras)

  if (!fromWalletId || !toWalletId || fromWalletId === toWalletId) return null

  return {
    kind: 'transfer',
    description: 'Pindah uang',
    amount: amount.amount,
    fromWalletId,
    toWalletId,
    rawInput: trimmed,
    confidence: 0.95,
    warning: amountWarning(tokens, amount.indexes, amount.amount),
  }
}

function parseSavingCommand(input: string, extras?: ParserExtras): ParsedSaving | null {
  const trimmed = input.trim()
  const tokens = trimmed.split(/\s+/)
  const normalized = tokens.map(normalizeToken)

  if (!hasKeyword(tokens, ['simpan', 'tabung', 'nabung', 'menabung'])) return null

  const amount = findAnyAmount(tokens)
  if (!amount) return null

  const dariIndex = normalized.findIndex(token => token === 'dari')
  const keIndex = normalized.findIndex(token => token === 'ke')
  const sourceTokens =
    dariIndex !== -1
      ? tokens.slice(dariIndex + 1, keIndex > dariIndex ? keIndex : tokens.length)
      : tokens.slice(amount.endIndex + 1, keIndex > amount.endIndex ? keIndex : tokens.length)
  const destinationTokens = keIndex !== -1 ? tokens.slice(keIndex + 1) : ['tabungan']

  const fromWalletId = detectExplicitPaymentMethod(sourceTokens, extras) ?? 'tunai'
  const toWalletId = detectExplicitPaymentMethod(destinationTokens, extras) ?? 'tabungan'

  if (fromWalletId === toWalletId) return null

  return {
    kind: 'saving',
    description: 'Simpan uang',
    amount: amount.amount,
    fromWalletId,
    toWalletId,
    rawInput: trimmed,
    confidence: 0.9,
    warning: amountWarning(tokens, amount.indexes, amount.amount),
  }
}

// ── Detect category ──────────────────────────────────────────────────────────
/**
 * Matches description text against category keyword lists.
 * Uses word-boundary detection: keyword must appear as a standalone word
 * (surrounded by non-word chars or string edges) to prevent false positives
 * like "bca" matching inside "abcana".
 */
function detectCategory(text: string, type: TransactionType, extras?: ParserExtras): string {
  const lower = text.toLowerCase()

  // Custom user-defined categories take priority (their personal slang)
  if (extras?.categories) {
    for (const c of extras.categories) {
      if ((c.type ?? 'expense') !== type) continue
      for (const kw of [c.id, c.label, ...c.keywords, ...(c.subcategories ?? [])]) {
        if (kw && wordMatch(lower, kw)) return c.id
      }
    }
  }

  if (type === 'income') {
    for (const category of INCOME_CATEGORIES) {
      for (const kw of CATEGORY_KEYWORDS[category]) {
        if (wordMatch(lower, kw)) return category
      }
    }
    return 'lainnya'
  }

  for (const category of EXPENSE_CATEGORIES) {
    const keywords = CATEGORY_KEYWORDS[category]
    for (const kw of keywords) {
      if (wordMatch(lower, kw)) return category
    }
  }

  return 'lainnya'
}

function detectSubcategory(text: string, category: string, extras?: ParserExtras): string | undefined {
  const lower = text.toLowerCase()
  const configured = extras?.categories?.find(item => item.id === category)
  return configured?.subcategories?.find(item => item && wordMatch(lower, item))
}

// ── Detect transaction type ──────────────────────────────────────────────────
function hasExpenseCategorySignal(text: string): boolean {
  const lower = text.toLowerCase()
  return EXPENSE_CATEGORIES.some(category =>
    CATEGORY_KEYWORDS[category].some(keyword => wordMatch(lower, keyword))
  )
}

function startsWithPhrase(tokens: string[], phrase: string[]): boolean {
  return phrase.every((word, index) => tokens[index] === word)
}

function detectType(text: string): TransactionType {
  const tokens = text.split(/\s+/).map(normalizeToken).filter(Boolean)
  const first = tokens[0]
  if (!first) return 'expense'

  if (EXPENSE_START_KEYWORDS.has(first)) return 'expense'

  if (first === 'masuk') {
    const rest = tokens.slice(1).join(' ')
    return hasExpenseCategorySignal(rest) ? 'expense' : 'income'
  }

  if (INCOME_START_KEYWORDS.has(first)) return 'income'
  if (INCOME_START_PHRASES.some(phrase => startsWithPhrase(tokens, phrase))) return 'income'

  return 'expense'
}

// ── Main parser ──────────────────────────────────────────────────────────────
export function parseTransaction(input: string, extras?: ParserExtras): ParsedTransaction | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  // Auto-derive single-token aliases for multi-word wallet/payment keywords
  // (e.g. "Kartu Kredit" → "kartu_kredit") and collapse adjacent matches in
  // the raw input so downstream single-token matchers can find them.
  const extrasExpanded = expandMultiWordKeywords(extras)
  const tokens = preprocessTokens(trimmed.split(/\s+/), extrasExpanded)
  // Rebind `extras` so legacy code below transparently uses the expanded list.
  extras = extrasExpanded
  const type = detectType(trimmed)

  // ── Step 1: Find the LAST amount token ──────────────────────────────────
  // Scanning from the end is more robust: in "ongkir grab 38k ovo",
  // the amount always comes just before the payment method.
  const trailingAmount = findTrailingAmount(tokens, extras)
  const parsedAmount = trailingAmount ?? (type === 'income' ? findAnyAmount(tokens) : null)
  if (!parsedAmount) return null

  const adjustedAmount = applyAmountModifiers(parsedAmount.amount, tokens, parsedAmount.indexes)
  const splitInfo = parseSplitDivisor(tokens)
  const amount = splitInfo
    ? Math.round(adjustedAmount.amount / splitInfo.divisor)
    : adjustedAmount.amount
  const amountIndexes = adjustedAmount.indexes
  const dateHint = parseDateHint(tokens)
  const paymentTokens = tokens.filter(token => isPaymentToken(token, extras))

  // ── Step 2: Detect payment method ───────────────────────────────────────
  let paymentMethod = paymentTokens.length > 0
    ? detectPaymentMethod(tokens, extras)
    : type === 'income'
      ? extras?.lastActiveWalletId ?? 'tunai'
      : 'tunai'

  // ── Step 3: Build description ────────────────────────────────────────────
  // Include only tokens that are:
  //   - NOT the amount token (by index)
  //   - NOT a payment method token (by value)
  // This ensures "ongkir grab stasiun tawang 38k ovo" →
  // description = "ongkir grab stasiun tawang"
  const descTokens = tokens.filter((t, i) => {
    const normalized = normalizeToken(t)
    const previous = i > 0 ? normalizeToken(tokens[i - 1]) : ''
    if (amountIndexes.has(i)) return false
    if (splitInfo?.indexes.has(i)) return false
    if (dateHint?.indexes.has(i)) return false
    if (isCurrencyToken(t)) return false
    if (isPaymentToken(t, extras)) return false
    if (i === 0 && type === 'expense' && ['keluar', 'expense', 'pengeluaran'].includes(normalized)) return false
    if (i === 0 && type === 'income' && EXPLICIT_TYPE_PREFIXES.has(normalized)) return false
    if (type === 'income' && i === 0 && (INCOME_START_KEYWORDS.has(normalized) || ['dapat', 'dapet', 'hasil', 'uang'].includes(normalized))) return false
    if (type === 'income' && ['dapat', 'dapet', 'hasil', 'uang', 'terima', 'masuk'].includes(previous) && INCOME_KEYWORDS.includes(normalized)) return false
    return true
  })

  const baseDescription = descTokens.join(' ').trim() || (type === 'income' ? 'Pemasukan' : 'Transaksi')
  const description = splitInfo ? `[1/${splitInfo.divisor}] ${baseDescription}` : baseDescription

  // ── Step 4: Classify ─────────────────────────────────────────────────────
  if (type === 'income' && paymentMethod === 'transfer') {
    paymentMethod = extras?.lastActiveWalletId ?? 'tunai'
  }
  const category = detectCategory(`${description} ${trimmed}`, type, extras)
  const subcategory = detectSubcategory(`${description} ${trimmed}`, category, extras)

  // ── Step 5: Confidence score ─────────────────────────────────────────────
  // Deduct for missing signals; add for explicit payment method detection
  const hasDescription    = descTokens.length > 0
  const hasExplicitMethod = paymentTokens.length > 0
  const hasAmountContext = adjustedAmount.modifierApplied || isContextualAmount(tokens, parsedAmount.indexes, extras)
  const multiTransaction = looksLikeMultiTransaction(tokens)
  const baseConfidence =
    !hasDescription       ? 0.4
    : hasExplicitMethod   ? 0.95
    :                       0.75
  const splitBoost = splitInfo ? 0.05 : 0
  const rawConfidence = Math.min(
    1,
    (!hasAmountContext && !hasExplicitMethod
      ? Math.min(baseConfidence, 0.55)
      : baseConfidence) + splitBoost
  )
  // Input multi-transaksi tidak bisa dicatat akurat oleh parser single-entry.
  // Tahan confidence rendah supaya UI tidak menampilkan keyakinan palsu.
  const confidence = multiTransaction ? Math.min(rawConfidence, 0.45) : rawConfidence
  const warning =
    (multiTransaction
      ? 'Terdeteksi lebih dari satu transaksi. Catat satu per satu, atau pakai catat manual.'
      : undefined) ??
    amountWarning(tokens, amountIndexes, amount) ??
    (!hasAmountContext && !hasExplicitMethod ? 'Nominal belum jelas. Pakai format seperti Rp25.000 atau 25k.' : undefined)

  return {
    kind: 'transaction',
    description,
    amount,
    type,
    category,
    subcategory,
    paymentMethod,
    date: dateHint?.date,
    rawInput: trimmed,
    confidence,
    warning,
  }
}

export function parseEntry(input: string, extras?: ParserExtras): ParsedEntry | null {
  return (
    parseTransferCommand(input, extras) ??
    parseSavingCommand(input, extras) ??
    parseTransaction(input, extras)
  )
}

// ── Format currency (IDR) ────────────────────────────────────────────────────
export function formatIDR(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount).replace(/\s+/g, ' ')
}

export function formatIDRCompact(amount: number): string {
  return formatIDR(amount)
}

/**
 * Angka rupiah tanpa prefix "Rp" dan tanpa penyingkatan (digit tetap penuh),
 * mis. 138000 -> "138.000". Dipakai di UI padat seperti sel kalender.
 */
export function formatIDRShort(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

/**
 * Konsistensi tanggal di seluruh aplikasi: SELALU tampilkan format
 * "1 Juli 2026" — tidak ada lagi "Hari ini", "Kemarin", "3 hari lalu".
 * Fungsi ini dipertahankan agar call-site lama tetap kompatibel, tapi
 * secara efektif sama dengan `formatDate`.
 */
export function formatRelativeDate(date: Date): string {
  return formatDate(date)
}
