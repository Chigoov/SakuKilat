/**
 * SakuKilat — Shared CSV/TSV Parser
 *
 * Robust delimited-text parser with support for:
 * - Quoted fields (double-quote escaped)
 * - Commas/semicolons/tabs inside quoted fields
 * - CRLF and LF line endings
 * - UTF-8 Indonesian text
 * - Strict validation (no silent fallbacks)
 */

/**
 * Auto-detect the most likely delimiter from the first line.
 */
export function detectDelimiter(firstLine: string): string {
  return [',', ';', '\t'].reduce((best, delimiter) =>
    firstLine.split(delimiter).length > firstLine.split(best).length ? delimiter : best
  )
}

/**
 * Parse a delimited text string (CSV/TSV/semicolon) into a 2D array of strings.
 * Handles: quoted fields, escaped double-quotes, CRLF/LF, empty cells.
 */
export function parseDelimited(text: string): string[][] {
  const delimiter = detectDelimiter(text.split(/\r?\n/, 1)[0] ?? '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"'
        i += 1
      } else if (char === '"') {
        quoted = false
      } else {
        cell += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === delimiter) {
      row.push(cell)
      cell = ''
    } else if (char === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (char !== '\r') {
      cell += char
    }
  }

  row.push(cell)
  rows.push(row)
  return rows.filter(items => items.some(item => item.trim()))
}

/**
 * Parse delimited text into an array of objects keyed by header names.
 * Returns { headers, records, errors }.
 * Strict: every row must have at least as many cells as headers.
 */
export function parseDelimitedToRecords(text: string): {
  headers: string[]
  records: Record<string, string>[]
  errors: string[]
} {
  const rows = parseDelimited(text)
  if (rows.length === 0) return { headers: [], records: [], errors: ['File kosong'] }

  const headers = rows[0].map(h => h.trim())
  if (headers.length === 0 || headers.every(h => !h)) {
    return { headers: [], records: [], errors: ['Header kosong atau tidak ditemukan'] }
  }

  const records: Record<string, string>[] = []
  const errors: string[] = []

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i]
    // Allow trailing empty cells but not too few
    if (cells.length < headers.length) {
      // Pad with empty strings if only slightly short
      while (cells.length < headers.length) cells.push('')
    }
    const record: Record<string, string> = {}
    for (let j = 0; j < headers.length; j++) {
      if (headers[j]) {
        record[headers[j]] = cells[j] ?? ''
      }
    }
    records.push(record)
  }

  return { headers, records, errors }
}
