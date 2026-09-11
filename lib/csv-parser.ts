/**
 * SakuKilat — Shared CSV/TSV Parser & Validator
 *
 * Robust delimited-text parser with support for:
 * - RFC 4180 compliance (quoted fields, escaped quotes "")
 * - Commas, semicolons, or tabs inside quoted fields
 * - Unclosed quote detection with line number reporting
 * - Column count mismatch detection per row
 * - Duplicate header detection
 * - Mandatory header validation (tanggal, tipe, nominal)
 * - Indonesian number and date parsing
 * - Strict rejection of invalid financial data (no silent defaults or fallbacks)
 */

/**
 * Auto-detect the most likely delimiter from the first line.
 */
export function detectDelimiter(firstLine: string): string {
  return [',', ';', '\t'].reduce((best, delimiter) =>
    firstLine.split(delimiter).length > firstLine.split(best).length ? delimiter : best
  )
}

export interface ParseDelimitedResult {
  rows: string[][]
  unclosedQuoteError?: string
}

/**
 * Parse a delimited text string (CSV/TSV/semicolon) into a 2D array of strings.
 * Accurately tracks quotes, escaped quotes, and unclosed quotes at EOF.
 */
export function parseDelimited(text: string): ParseDelimitedResult {
  const trimmed = text.replace(/^\uFEFF/, '') // Strip UTF-8 BOM if present
  if (!trimmed.trim()) {
    return { rows: [] }
  }

  const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = detectDelimiter(firstLine)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  let quoteStartLine = 1
  let currentLine = 1

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i]
    if (quoted) {
      if (char === '"' && trimmed[i + 1] === '"') {
        cell += '"'
        i += 1
      } else if (char === '"') {
        quoted = false
      } else {
        if (char === '\n') currentLine++
        cell += char
      }
    } else if (char === '"') {
      quoted = true
      quoteStartLine = currentLine
    } else if (char === delimiter) {
      row.push(cell)
      cell = ''
    } else if (char === '\n') {
      currentLine++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (char !== '\r') {
      cell += char
    }
  }

  if (quoted) {
    return {
      rows: [],
      unclosedQuoteError: `Tanda kutip ganda tidak ditutup (dimulai pada baris ${quoteStartLine}).`,
    }
  }

  // Push final cell and row
  row.push(cell)
  if (row.length > 1 || (row.length === 1 && row[0].trim() !== '')) {
    rows.push(row)
  }

  // Filter out completely blank lines at EOF
  const cleanRows = rows.filter((r, idx) => {
    // Keep header row always if present
    if (idx === 0) return r.some(c => c.trim() !== '')
    return r.some(c => c.trim() !== '')
  })

  return { rows: cleanRows }
}

export interface DelimitedRecordsResult {
  headers: string[]
  records: Record<string, string>[]
  errors: string[]
}

/**
 * Validates headers and parses rows into structured records.
 * Reports unclosed quotes, duplicate headers, and column count mismatches.
 */
export function parseDelimitedToRecords(text: string): DelimitedRecordsResult {
  const { rows, unclosedQuoteError } = parseDelimited(text)

  if (unclosedQuoteError) {
    return { headers: [], records: [], errors: [unclosedQuoteError] }
  }

  if (rows.length === 0) {
    return { headers: [], records: [], errors: ['File CSV kosong atau tidak memiliki baris data.'] }
  }

  const rawHeaders = rows[0].map(h => h.trim())
  if (rawHeaders.length === 0 || rawHeaders.every(h => !h)) {
    return { headers: [], records: [], errors: ['Header CSV kosong atau tidak ditemukan.'] }
  }

  const errors: string[] = []

  // Check duplicate headers
  const seenHeaders = new Set<string>()
  const duplicateHeaders: string[] = []
  for (const h of rawHeaders) {
    const lower = h.toLowerCase()
    if (seenHeaders.has(lower)) {
      duplicateHeaders.push(h)
    }
    seenHeaders.add(lower)
  }
  if (duplicateHeaders.length > 0) {
    errors.push(`Header duplikat ditemukan: "${duplicateHeaders.join('", "')}".`)
  }

  // Check column count mismatch on each row
  const records: Record<string, string>[] = []
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i]
    const rowNum = i + 1 // 1-indexed row number (header is row 1)
    if (cells.length !== rawHeaders.length) {
      errors.push(`Baris ${rowNum}: jumlah kolom (${cells.length}) tidak sesuai dengan jumlah header (${rawHeaders.length}).`)
      continue
    }

    const record: Record<string, string> = {}
    for (let j = 0; j < rawHeaders.length; j++) {
      record[rawHeaders[j]] = cells[j] ?? ''
    }
    records.push(record)
  }

  return { headers: rawHeaders, records, errors }
}

/**
 * Validates presence of required headers (tanggal, tipe, nominal).
 */
export function validateCsvHeaders(headers: string[]): { valid: boolean; error?: string } {
  const normalized = headers.map(h => h.trim().toLowerCase())
  const hasDate = normalized.some(h => ['tanggal', 'date'].includes(h))
  const hasType = normalized.some(h => ['tipe', 'type', 'jenis'].includes(h))
  const hasAmount = normalized.some(h => ['nominal', 'amount', 'jumlah'].includes(h))

  const missing: string[] = []
  if (!hasDate) missing.push('tanggal')
  if (!hasType) missing.push('tipe')
  if (!hasAmount) missing.push('nominal')

  if (missing.length > 0) {
    return {
      valid: false,
      error: `Header wajib tidak ditemukan: ${missing.join(', ')}. Header yang diperlukan: tanggal, tipe, nominal.`,
    }
  }
  return { valid: true }
}

/**
 * Strict parser for monetary amounts with Indonesian dot/comma handling.
 * Disallows negative, zero, empty, or non-numeric tokens.
 */
export function parseCsvAmount(raw: unknown): { value: number | null; error?: string } {
  if (raw === null || raw === undefined || raw === '') {
    return { value: null, error: 'Nominal kosong' }
  }
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0) {
      return { value: null, error: `Nominal tidak valid (${raw})` }
    }
    return { value: Math.round(raw) }
  }
  const str = String(raw).trim()
  if (!str) {
    return { value: null, error: 'Nominal kosong' }
  }

  // Remove currency prefixes
  let cleaned = str.replace(/^(rp\.?|idr)\s*/i, '').trim()

  if (cleaned.startsWith('-')) {
    return { value: null, error: `Nominal tidak boleh negatif ("${str}")` }
  }

  // Handle Indonesian thousands and decimal separators
  if (cleaned.includes('.') && cleaned.includes(',')) {
    const dotIdx = cleaned.indexOf('.')
    const commaIdx = cleaned.indexOf(',')
    if (dotIdx < commaIdx) {
      // Indonesian format: 1.250.000,50
      cleaned = cleaned.replace(/\./g, '').replace(',', '.')
    } else {
      // International format: 1,250,000.50
      cleaned = cleaned.replace(/,/g, '')
    }
  } else if (cleaned.includes('.')) {
    const dotParts = cleaned.split('.')
    if (dotParts.length > 2) {
      // Multiple dots: 1.250.000 -> thousand separators
      cleaned = cleaned.replace(/\./g, '')
    } else if (dotParts.length === 2) {
      // Single dot: if exactly 3 digits after dot, treat as thousand separator
      if (dotParts[1].length === 3) {
        cleaned = cleaned.replace('.', '')
      }
      // Otherwise keep as decimal (e.g. 50.5)
    }
  } else if (cleaned.includes(',')) {
    const commaParts = cleaned.split(',')
    if (commaParts.length > 2) {
      cleaned = cleaned.replace(/,/g, '')
    } else if (commaParts.length === 2) {
      if (commaParts[1].length === 3) {
        cleaned = cleaned.replace(',', '')
      } else {
        cleaned = cleaned.replace(',', '.')
      }
    }
  }

  if (!/^\d+(\.\d+)?$/.test(cleaned)) {
    return { value: null, error: `Nominal berisi karakter tidak valid ("${str}")` }
  }

  const num = Number(cleaned)
  if (!Number.isFinite(num) || num <= 0) {
    return { value: null, error: `Nominal harus lebih dari nol ("${str}")` }
  }

  return { value: Math.round(num) }
}

/**
 * Strict parser for dates. Supports ISO strings, YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY.
 * Rejects empty or invalid dates.
 */
export function parseCsvDate(raw: unknown): { value: string | null; error?: string } {
  if (raw === null || raw === undefined || raw === '') {
    return { value: null, error: 'Tanggal kosong' }
  }
  const str = String(raw).trim()
  if (!str) {
    return { value: null, error: 'Tanggal kosong' }
  }

  // Check DD/MM/YYYY or DD-MM-YYYY format
  const ddmmyyyy = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (ddmmyyyy) {
    const day = parseInt(ddmmyyyy[1], 10)
    const month = parseInt(ddmmyyyy[2], 10)
    const year = parseInt(ddmmyyyy[3], 10)
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return { value: null, error: `Tanggal tidak valid ("${str}")` }
    }
    const d = new Date(Date.UTC(year, month - 1, day, 0, 0, 0))
    if (!Number.isFinite(d.getTime())) {
      return { value: null, error: `Tanggal tidak valid ("${str}")` }
    }
    return { value: d.toISOString() }
  }

  const d = new Date(str)
  if (!Number.isFinite(d.getTime())) {
    return { value: null, error: `Format tanggal tidak valid ("${str}")` }
  }

  return { value: d.toISOString() }
}

/**
 * Strict parser for transaction types.
 * Rejects empty or unrecognized types without defaulting to expense.
 */
export function parseCsvType(raw: unknown): { value: 'income' | 'expense' | null; error?: string } {
  if (raw === null || raw === undefined || raw === '') {
    return { value: null, error: 'Tipe transaksi kosong' }
  }
  const str = String(raw).trim().toLowerCase()
  if (!str) {
    return { value: null, error: 'Tipe transaksi kosong' }
  }

  const incomeKeywords = ['income', 'masuk', 'pemasukan', 'credit', 'kredit']
  const expenseKeywords = ['expense', 'keluar', 'pengeluaran', 'debit']

  if (incomeKeywords.includes(str)) {
    return { value: 'income' }
  }
  if (expenseKeywords.includes(str)) {
    return { value: 'expense' }
  }

  return {
    value: null,
    error: `Tipe transaksi tidak dikenal: "${str}". Hanya menerima: masuk/keluar, income/expense, kredit/debit.`,
  }
}
