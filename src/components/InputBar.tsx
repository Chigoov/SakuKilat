'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import { Send } from 'lucide-react';
import { parseEntry } from '@/lib/parser';
import { formatIDR } from '@/lib/format';
import type { ParserExtras } from '@/types';

interface InputBarProps {
  onSubmit: (input: string) => Promise<boolean>;
  isSubmitting: boolean;
  parserExtras: ParserExtras;
}

export function InputBar({ onSubmit, isSubmitting, parserExtras }: InputBarProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const preview = useMemo(() => {
    if (!value.trim()) return null;
    const parsed = parseEntry(value, parserExtras);
    if (!parsed) return null;
    return parsed;
  }, [value, parserExtras]);

  const handleSubmit = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed || isSubmitting) return;
    const ok = await onSubmit(trimmed);
    if (ok) setValue('');
  }, [value, isSubmitting, onSubmit]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
          placeholder="cth: kopi 25k gopay"
          className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] outline-none text-sm text-[var(--sk-text)] placeholder:text-[var(--sk-text-dim)] focus:border-[var(--sk-cyan)] transition-colors"
          aria-label="Input transaksi"
        />
        <button
          onClick={handleSubmit}
          disabled={!value.trim() || isSubmitting}
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all bg-[var(--sk-cyan)] text-[#090D16] shadow-[0_0_12px_var(--sk-cyan-glow)] disabled:opacity-40 disabled:shadow-none active:scale-95"
          aria-label="Kirim"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
      {preview && (
        <div className="text-[11px] text-[var(--sk-text-dim)] flex items-center gap-2 px-1">
          <span className="text-[var(--sk-text-muted)] font-medium">
            {preview.kind === 'transfer' ? 'Pindah' : preview.kind === 'saving' ? 'Simpan' : preview.type === 'income' ? 'Masuk' : 'Keluar'}
          </span>
          <span className="tabular-nums">{formatIDR(preview.amount)}</span>
          {preview.category && preview.kind === 'transaction' && <span>· {preview.category}</span>}
          {preview.paymentMethod && preview.kind === 'transaction' && <span>· {preview.paymentMethod}</span>}
          {preview.warning && <span className="text-[var(--sk-amber)]">· {preview.warning}</span>}
        </div>
      )}
    </div>
  );
}
