// SakuKilat - Natural Language Parser (parseEntry)
// Reconstructed from APK reverse engineering

import type { ParserExtras, ParsedEntry } from '@/types';
import { CATEGORY_KEYWORDS, INCOME_CATEGORY_IDS, EXPENSE_CATEGORY_IDS } from './categories';

// --- Payment method matching config ---
const PAYMENT_MATCHERS: { method: string; exact: string[]; contains: string[] }[] = [
  { method: 'gopay', exact: ['gopay', 'gp'], contains: [] },
  { method: 'ovo', exact: ['ovo'], contains: [] },
  { method: 'dana', exact: ['dana'], contains: [] },
  { method: 'shopeepay', exact: ['shopeepay', 'shopepay', 'shopee', 'spay'], contains: ['shopeepay', 'shopepay'] },
  { method: 'qris', exact: ['qris'], contains: [] },
  { method: 'jago', exact: ['jago'], contains: [] },
  { method: 'bca', exact: ['bca', 'klikbca'], contains: [] },
  { method: 'bni', exact: ['bni'], contains: [] },
  { method: 'bri', exact: ['bri', 'brimo'], contains: [] },
  { method: 'mandiri', exact: ['mandiri', 'livin'], contains: [] },
  { method: 'kartu', exact: ['kartu', 'debit', 'kredit', 'cc'], contains: [] },
  { method: 'transfer', exact: ['transfer', 'tf'], contains: [] },
  { method: 'tunai', exact: ['tunai', 'cash', 'kontan'], contains: [] },
];

const CURRENCY_PREFIXES = new Set(['rp', 'idr']);
const AMOUNT_SUFFIXES: Record<string, number> = {
  k: 1e3, rb: 1e3, ribu: 1e3,
  jt: 1e6, juta: 1e6,
  m: 1e9, miliar: 1e9, milyar: 1e9,
};

// Income/expense keyword sets
const INCOME_KEYWORDS = new Set(['gaji', 'salary', 'terima', 'pemasukan', 'pendapatan', 'income', 'bonus', 'komisi', 'dividen', 'honor', 'dibayar', 'jual', 'jualan', 'refund', 'cashback', 'hadiah', 'thr', 'freelance']);
const INCOME_START_KEYWORDS = new Set(['gaji', 'salary', 'terima', 'pemasukan', 'pendapatan', 'income', 'bonus', 'komisi', 'dividen', 'honor', 'dibayar', 'refund', 'cashback', 'hadiah', 'thr', 'freelance']);
const INCOME_PHRASES = [
  ['dapat', 'gaji'], ['dapet', 'gaji'], ['dapat', 'bonus'], ['dapet', 'bonus'],
  ['dapat', 'thr'], ['dapet', 'thr'], ['hasil', 'jual'], ['hasil', 'jualan'], ['uang', 'masuk'],
];
const EXPENSE_START_KEYWORDS = new Set(['keluar', 'expense', 'pengeluaran', 'bayar', 'beli', 'belanja', 'makan', 'minum', 'ongkir', 'jajan', 'parkir', 'bensin', 'tagihan']);
const TYPE_NEUTRAL_KEYWORDS = new Set(['keluar', 'expense', 'pengeluaran', 'masuk', 'income', 'pemasukan']);
const SPLIT_KEYWORDS = new Set(['bagi', 'patungan', 'split', 'share', 'sharing']);
const MULTIPLIER_KEYWORDS = new Set(['x', 'kali']);
const CONTINUATION_KEYWORDS = new Set(['terus', 'lalu', 'kemudian', 'trus', 'abis', 'habis']);

// --- Helpers ---
function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '');
}

const keywordRegexCache = new Map<string, RegExp>();
function wordMatch(text: string, keyword: string): boolean {
  const k = keyword.trim().toLowerCase();
  if (!k) return false;
  let regex = keywordRegexCache.get(k);
  if (!regex) {
    regex = RegExp(`(^|[^a-z0-9_])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^a-z0-9_])`, 'i');
    keywordRegexCache.set(k, regex);
  }
  return regex.test(text);
}

function parsePlainNumber(s: string): number | null {
  const clean = s.trim().replace(/\s+/g, '');
  if (!/^\d+(?:[.,]\d+)*$/.test(clean)) return null;
  const dots = (clean.match(/\./g) || []).length;
  const commas = (clean.match(/,/g) || []).length;

  if (dots > 0 && commas > 0) {
    const lastSep = clean.lastIndexOf('.') > clean.lastIndexOf(',') ? '.' : ',';
    const parts = clean.split(lastSep);
    if (parts.length > 2) return null;
    const [intPart, decPart] = parts;
    if (!intPart) return null;
    const intClean = intPart.split(lastSep === '.' ? ',' : '.').join('');
    if (intClean.split('').some((c, i) => i > 0 && !/\d/.test(c))) return null;
    if (decPart !== undefined && !/^\d{1,2}$/.test(decPart)) return null;
    const num = Number(`${intClean}${decPart ? `.${decPart}` : ''}`);
    return Number.isFinite(num) ? num : null;
  }

  const sep = dots > 0 ? '.' : commas > 0 ? ',' : null;
  if (!sep) {
    const n = Number(clean);
    return Number.isFinite(n) ? n : null;
  }
  const parts = clean.split(sep);
  if (parts.some((p) => p.length === 0)) return null;
  if (parts.length > 2) {
    if (parts.slice(1).some((p) => p.length !== 3)) return null;
    const n = Number(parts.join(''));
    return Number.isFinite(n) ? n : null;
  }
  const [intPart, decPart] = parts;
  const composed = decPart.length === 3 ? `${intPart}${decPart}` : decPart.length <= 2 ? `${intPart}.${decPart}` : null;
  if (!composed) return null;
  const n = Number(composed);
  return Number.isFinite(n) ? n : null;
}

function parseAmountAt(words: string[], idx: number): { amount: number; indexes: Set<number> } | null {
  const raw = normalize(words[idx]);
  const hasPrefix = /^(rp|idr)(?=\d)/.test(raw);
  const stripped = raw.replace(/^(rp|idr)(?=\d)/, '');
  const suffixMatch = stripped.match(/^(\d+(?:[.,]\d+)*)(k|rb|ribu|jt|juta|m|miliar|milyar)$/);

  if (suffixMatch) {
    const base = parsePlainNumber(suffixMatch[1]);
    if (base === null) return null;
    return { amount: base * AMOUNT_SUFFIXES[suffixMatch[2]], indexes: new Set([idx]) };
  }

  if (/^[\d.,]+$/.test(stripped)) {
    const allDigits = stripped.replace(/[.,]/g, '');
    if (!hasPrefix && /^0\d{8,}$/.test(allDigits) || !hasPrefix && allDigits.length >= 10) return null;
    const n = parsePlainNumber(stripped);
    if (n === null) return null;
    return { amount: n, indexes: new Set([idx]) };
  }

  // Check if word at idx is a suffix and word before is a number
  const suffix = AMOUNT_SUFFIXES[normalize(words[idx])];
  if (!suffix || idx === 0) return null;
  const prevNum = parsePlainNumber(normalize(words[idx - 1]));
  if (prevNum === null) return null;
  return { amount: prevNum * suffix, indexes: new Set([idx - 1, idx]) };
}

function smallAmountWarning(words: string[], indexes: Set<number>, amount: number): string | undefined {
  if (amount >= 1000 || indexes.size !== 1) return;
  const [idx] = Array.from(indexes);
  const raw = normalize(words[idx]).replace(/^(rp|idr)(?=\d)/, '');
  return /^\d+$/.test(raw) ? 'Nominal di bawah Rp1.000?' : undefined;
}

function parsePureInt(s: string): number | null {
  const clean = normalize(s);
  if (!/^\d+$/.test(clean)) return null;
  const n = Number(clean);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function isModifierWord(s: string): boolean {
  const w = normalize(s);
  return SPLIT_KEYWORDS.has(w) || MULTIPLIER_KEYWORDS.has(w);
}

function isMultiplierAt(words: string[], idx: number): boolean {
  if (idx <= 0) return false;
  return parsePureInt(words[idx]) !== null && isModifierWord(words[idx - 1]);
}

function shiftDate(days: number): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
}

function parseDate(words: string[]): { date: Date; indexes: Set<number> } | null {
  const normalized = words.map(normalize);
  for (let i = 0; i < normalized.length; i++) {
    const w = normalized[i];
    if (w === 'kemarin') return { date: shiftDate(-1), indexes: new Set([i]) };
    if ((w === 'hari' && normalized[i + 1] === 'ini') || w === 'today')
      return { date: shiftDate(0), indexes: new Set(w === 'hari' ? [i, i + 1] : [i]) };

    const dateMatch = w.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
    if (dateMatch) {
      const day = Number(dateMatch[1]);
      const month = Number(dateMatch[2]);
      const now = new Date();
      const year = dateMatch[3] ? Number(dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3]) : now.getFullYear();
      const date = new Date(year, month - 1, day);
      if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day)
        return { date, indexes: new Set([i]) };
    }

    if ((w === 'tgl' || w === 'tanggal') && normalized[i + 1]) {
      const dayNum = parsePureInt(normalized[i + 1]);
      if (dayNum && dayNum >= 1 && dayNum <= 31) {
        const now = new Date();
        return { date: new Date(now.getFullYear(), now.getMonth(), dayNum), indexes: new Set([i, i + 1]) };
      }
    }
  }
  return null;
}

function matchPaymentMethod(words: string[], extras?: ParserExtras): string {
  for (const word of words) {
    const w = normalize(word);
    if (extras?.payments) {
      for (const p of extras.payments) {
        if (p.keywords.some((k) => w === normalize(k))) return p.id;
      }
    }
    for (const m of PAYMENT_MATCHERS) {
      if (m.exact.includes(w) || m.contains.some((c) => w.includes(c))) return m.method;
    }
  }
  return 'tunai';
}

function isPaymentWord(word: string, extras?: ParserExtras): boolean {
  const w = normalize(word);
  if (extras?.payments) {
    for (const p of extras.payments) {
      if (p.keywords.some((k) => w === normalize(k))) return true;
    }
  }
  for (const m of PAYMENT_MATCHERS) {
    if (m.exact.includes(w) || m.contains.some((c) => w.includes(c))) return true;
  }
  return false;
}

function findPaymentInWords(words: string[], extras?: ParserExtras): string | null {
  for (const word of words) {
    if (isPaymentWord(word, extras)) return matchPaymentMethod([word], extras);
  }
  return null;
}

function findFirstAmount(words: string[]): { amount: number; startIndex: number; endIndex: number; indexes: Set<number> } | null {
  for (let i = 0; i < words.length; i++) {
    if (isMultiplierAt(words, i)) continue;
    const result = parseAmountAt(words, i);
    if (!result || !Number.isFinite(result.amount) || result.amount <= 0) continue;
    const idxArr = Array.from(result.indexes);
    return {
      amount: Math.round(result.amount),
      startIndex: Math.min(...idxArr),
      endIndex: Math.max(...idxArr),
      indexes: result.indexes,
    };
  }
  return null;
}

function hasAnyWord(words: string[], targets: string[]): boolean {
  return words.some((w) => targets.includes(normalize(w)));
}

function detectType(input: string): 'expense' | 'income' {
  const words = input.split(/\s+/).map(normalize).filter(Boolean);
  const first = words[0];
  if (!first || EXPENSE_START_KEYWORDS.has(first)) return 'expense';
  if (first === 'masuk') {
    const rest = words.slice(1).join(' ').toLowerCase();
    const isExpenseCategory = EXPENSE_CATEGORY_IDS.some((cat) =>
      CATEGORY_KEYWORDS[cat]?.some((kw) => wordMatch(rest, kw))
    );
    return isExpenseCategory ? 'expense' : 'income';
  }
  if (INCOME_START_KEYWORDS.has(first) || INCOME_PHRASES.some((phrase) => phrase.every((w, i) => words[i] === w)))
    return 'income';
  return 'expense';
}

function matchCategory(description: string, type: 'expense' | 'income', extras?: ParserExtras): string {
  const lower = description.toLowerCase();
  if (extras?.categories) {
    for (const cat of extras.categories) {
      if ((cat.type ?? 'expense') === type) {
        for (const kw of [cat.id, cat.label, ...cat.keywords, ...(cat.subcategories ?? [])]) {
          if (kw && wordMatch(lower, kw)) return cat.id;
        }
      }
    }
  }
  const categoryIds = type === 'income' ? INCOME_CATEGORY_IDS : EXPENSE_CATEGORY_IDS;
  for (const catId of categoryIds) {
    for (const kw of CATEGORY_KEYWORDS[catId] ?? []) {
      if (wordMatch(lower, kw)) return catId;
    }
  }
  return 'lainnya';
}

// --- Main parser ---
export function parseEntry(input: string, extras?: ParserExtras): ParsedEntry | null {
  return parseTransfer(input, extras) ?? parseSaving(input, extras) ?? parseTransaction(input, extras);
}

function parseTransfer(input: string, extras?: ParserExtras): ParsedEntry | null {
  const trimmed = input.trim();
  const words = trimmed.split(/\s+/);
  if (!hasAnyWord(words, ['pindah', 'transfer', 'kirim', 'topup'])) return null;
  const amountResult = findFirstAmount(words);
  if (!amountResult) return null;
  const normalized = words.map(normalize);
  const keIdx = normalized.findIndex((w, i) => w === 'ke' && i !== 0);
  if (keIdx === -1) return null;

  const beforeKe = keIdx > amountResult.endIndex ? words.slice(amountResult.endIndex + 1, keIdx) : [];
  const beforeAmount = words.slice(0, amountResult.startIndex).filter((w) => !['pindah', 'transfer', 'kirim', 'topup', 'tf'].includes(normalize(w)));
  const sourceWords = beforeKe.length > 0 ? beforeKe : beforeAmount;
  const destWords = words.slice(keIdx + 1);

  const fromWallet = findPaymentInWords(sourceWords, extras) ?? extras?.lastActiveWalletId ?? 'tunai';
  const toWallet = findPaymentInWords(destWords, extras);

  if (fromWallet && toWallet && fromWallet !== toWallet) {
    return {
      kind: 'transfer',
      description: 'Pindah uang',
      amount: amountResult.amount,
      fromWalletId: fromWallet,
      toWalletId: toWallet,
      rawInput: trimmed,
      confidence: 0.95,
      warning: smallAmountWarning(words, amountResult.indexes, amountResult.amount),
    };
  }
  return null;
}

function parseSaving(input: string, extras?: ParserExtras): ParsedEntry | null {
  const trimmed = input.trim();
  const words = trimmed.split(/\s+/);
  if (!hasAnyWord(words, ['simpan', 'tabung', 'nabung', 'menabung'])) return null;
  const amountResult = findFirstAmount(words);
  if (!amountResult) return null;
  const normalized = words.map(normalize);
  const dariIdx = normalized.findIndex((w) => w === 'dari');
  const keIdx = normalized.findIndex((w) => w === 'ke');

  const sourceWords = dariIdx !== -1 ? words.slice(dariIdx + 1, keIdx > dariIdx ? keIdx : words.length) : words.slice(amountResult.endIndex + 1, keIdx > amountResult.endIndex ? keIdx : words.length);
  const destWords = keIdx !== -1 ? words.slice(keIdx + 1) : ['tabungan'];

  const fromWallet = findPaymentInWords(sourceWords, extras) ?? 'tunai';
  const toWallet = findPaymentInWords(destWords, extras) ?? 'tabungan';

  if (fromWallet === toWallet) return null;
  return {
    kind: 'saving',
    description: 'Simpan uang',
    amount: amountResult.amount,
    fromWalletId: fromWallet,
    toWalletId: toWallet,
    rawInput: trimmed,
    confidence: 0.9,
    warning: smallAmountWarning(words, amountResult.indexes, amountResult.amount),
  };
}

function parseTransaction(input: string, extras?: ParserExtras): ParsedEntry | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Pre-process: merge multi-word payment keywords
  let processedExtras = extras;
  if (extras?.payments) {
    processedExtras = {
      ...extras,
      payments: extras.payments.map((p) => {
        const kwSet = new Set(p.keywords.map(normalize).filter(Boolean));
        for (const k of [...p.keywords, p.label ?? '']) {
          const lower = (k ?? '').trim().toLowerCase();
          if (lower && /\s/.test(lower)) {
            kwSet.add(lower.replace(/\s+/g, ''));
            kwSet.add(lower.replace(/\s+/g, '_'));
          }
        }
        return { ...p, keywords: Array.from(kwSet) };
      }),
    };
  }

  // Merge multi-word payment keywords in the input
  let words = trimmed.split(/\s+/);
  if (processedExtras?.payments && words.length >= 2) {
    const replacements: { wordTokens: string[]; replacement: string }[] = [];
    for (const p of processedExtras.payments) {
      for (const k of [...p.keywords, p.label ?? '']) {
        const lower = (k ?? '').trim().toLowerCase();
        if (lower && /\s/.test(lower)) {
          replacements.push({ wordTokens: lower.split(/\s+/).map(normalize).filter(Boolean), replacement: lower.replace(/\s+/g, '_') });
        }
      }
    }
    if (replacements.length > 0) {
      replacements.sort((a, b) => b.wordTokens.length - a.wordTokens.length);
      const normalizedWords = words.map(normalize);
      const merged: string[] = [];
      let i = 0;
      while (i < words.length) {
        let matched = false;
        for (const r of replacements) {
          const len = r.wordTokens.length;
          if (len < 2 || i + len > words.length) continue;
          let ok = true;
          for (let j = 0; j < len; j++) {
            if (normalizedWords[i + j] !== r.wordTokens[j]) { ok = false; break; }
          }
          if (ok) { merged.push(r.replacement); i += len; matched = true; break; }
        }
        if (!matched) { merged.push(words[i]); i++; }
      }
      words = merged;
    }
  }

  const type = detectType(trimmed);

  // Find amount (scan from end for income, from start for expense)
  let amountResult: { amount: number; indexes: Set<number> } | null = null;
  if (type === 'income') {
    // Scan from end backwards
    let idx = words.length - 1;
    const dateResult = parseDate(words);
    while (idx >= 0 && (isPaymentWord(words[idx], processedExtras) || dateResult?.indexes.has(idx) || isModifierWord(words[idx]) || isMultiplierAt(words, idx))) {
      idx--;
    }
    if (idx >= 0) {
      const r = parseAmountAt(words, idx);
      if (r && Number.isFinite(r.amount) && r.amount > 0) {
        amountResult = { amount: Math.round(r.amount), indexes: r.indexes };
      }
    }
    if (!amountResult) amountResult = findFirstAmount(words);
  } else {
    amountResult = findFirstAmount(words);
  }

  if (!amountResult) return null;

  // Apply multipliers (x2, kali 3)
  const maxIdx = Math.max(...Array.from(amountResult.indexes));
  let finalAmount = amountResult.amount;
  const allIndexes = new Set(amountResult.indexes);
  let modifierApplied = false;
  for (let i = maxIdx + 1; i < words.length - 1; i++) {
    const w = normalize(words[i]);
    const nextNum = parsePureInt(words[i + 1]);
    if (nextNum !== null) {
      if (SPLIT_KEYWORDS.has(w)) { finalAmount /= nextNum; }
      else if (MULTIPLIER_KEYWORDS.has(w)) { finalAmount *= nextNum; }
      else continue;
      allIndexes.add(i); allIndexes.add(i + 1); modifierApplied = true; i++;
    }
  }

  // Detect split bill
  let divisor = 1;
  const splitIndexes = new Set<number>();
  for (let i = 0; i < words.length - 1; i++) {
    const w = normalize(words[i]);
    if (!SPLIT_KEYWORDS.has(w)) continue;
    const n = parseInt(normalize(words[i + 1]).replace(/[^0-9]/g, ''), 10);
    if (Number.isFinite(n) && n >= 2 && n <= 99) { divisor = n; splitIndexes.add(i); splitIndexes.add(i + 1); break; }
  }
  if (divisor === 1) {
    for (let i = 0; i < words.length; i++) {
      const m = /^\/(\d{1,2})$/.exec(words[i].trim());
      if (m) { const n = parseInt(m[1], 10); if (n >= 2 && n <= 99) { divisor = n; splitIndexes.add(i); break; } }
    }
  }

  const splitAmount = divisor > 1 ? Math.round(finalAmount / divisor) : finalAmount;
  const dateResult = parseDate(words);

  // Payment method
  const paymentWords = words.filter((w) => isPaymentWord(w, processedExtras));
  let paymentMethod = paymentWords.length > 0 ? matchPaymentMethod(words, processedExtras) : type === 'income' ? (extras?.lastActiveWalletId ?? 'tunai') : 'tunai';

  // Build description
  const descWords = words.filter((w, i) => {
    const nw = normalize(w);
    const prevW = i > 0 ? normalize(words[i - 1]) : '';
    return !(
      allIndexes.has(i) || splitIndexes.has(i) || dateResult?.indexes.has(i) ||
      CURRENCY_PREFIXES.has(normalize(w)) || isPaymentWord(w, processedExtras) ||
      (i === 0 && type === 'expense' && ['keluar', 'expense', 'pengeluaran'].includes(nw)) ||
      (i === 0 && type === 'income' && TYPE_NEUTRAL_KEYWORDS.has(nw)) ||
      (type === 'income' && i === 0 && (INCOME_START_KEYWORDS.has(nw) || ['dapat', 'dapet', 'hasil', 'uang'].includes(nw))) ||
      (type === 'income' && ['dapat', 'dapet', 'hasil', 'uang', 'terima', 'masuk'].includes(prevW) && INCOME_KEYWORDS.has(nw))
    );
  });

  let description = descWords.join(' ').trim() || (type === 'income' ? 'Pemasukan' : 'Transaksi');
  if (divisor > 1) description = `[1/${divisor}] ${description}`;

  // Fix: income + transfer payment → use lastActiveWalletId
  if (type === 'income' && paymentMethod === 'transfer') {
    paymentMethod = extras?.lastActiveWalletId ?? 'tunai';
  }

  // Match category
  const category = matchCategory(`${description} ${trimmed}`, type, extras);

  // Subcategory matching
  let subcategory: string | undefined;
  if (processedExtras?.categories) {
    const cat = processedExtras.categories.find((c) => c.id === category);
    if (cat?.subcategories) {
      subcategory = cat.subcategories.find((s) => s && wordMatch(`${description} ${trimmed}`.toLowerCase(), s));
    }
  }

  // Confidence scoring
  const hasDesc = descWords.length > 0;
  const hasPayment = paymentWords.length > 0;
  const hasSuffixOrPrefix = Array.from(allIndexes).some((i) => {
    const w = normalize(words[i]);
    return /^(rp|idr)(?=\d)/.test(w) || /\d(k|rb|ribu|jt|juta|m|miliar|milyar)$/.test(w);
  });

  // Multi-transaction detection
  const hasContinuation = words.map(normalize).some((w) => CONTINUATION_KEYWORDS.has(w));
  let multiTxCount = 0;
  if (hasContinuation) {
    let i = 0;
    while (i < words.length) {
      if (isMultiplierAt(words, i)) { i++; continue; }
      const r = parseAmountAt(words, i);
      if (r && Number.isFinite(r.amount) && r.amount > 0) {
        multiTxCount++; i = Math.max(...Array.from(r.indexes)) + 1; continue;
      }
      i++;
    }
  }
  const isMultiTx = multiTxCount >= 2;

  let baseConfidence = hasDesc ? (hasPayment ? 0.95 : 0.75) : 0.4;
  let confidence = Math.min(1, (hasSuffixOrPrefix || hasPayment ? baseConfidence : Math.min(baseConfidence, 0.55)) + 0.05 * (divisor > 1 ? 1 : 0));
  if (isMultiTx) confidence = Math.min(confidence, 0.45);

  let warning: string | undefined;
  if (isMultiTx) warning = 'Terdeteksi lebih dari satu transaksi. Catat satu per satu, atau pakai catat manual.';
  else warning = smallAmountWarning(words, allIndexes, splitAmount);
  if (!warning && !hasSuffixOrPrefix && !hasPayment) warning = 'Nominal belum jelas. Pakai format seperti Rp25.000 atau 25k.';

  return {
    kind: 'transaction',
    description,
    amount: splitAmount,
    type,
    category,
    subcategory,
    paymentMethod,
    date: dateResult?.date,
    rawInput: trimmed,
    confidence,
    warning,
  };
}
