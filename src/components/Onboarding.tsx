'use client';

import { useState, useEffect } from 'react';
import { Sparkles, ArrowRight, Check, Wallet, BarChart3, Target, Zap } from 'lucide-react';

const ONBOARDING_KEY = 'sakukilat:v2:onboarding-completed-v9';

const SLIDES = [
  {
    icon: Zap,
    title: 'Catat Seketika',
    desc: 'Tulis "kopi 25k gopay" — nominal, kategori, dan saku ketebak otomatis. Cepat, tanpa buka banyak form.',
    color: 'text-[var(--sk-cyan)]',
    bg: 'bg-[var(--sk-cyan-dim)]',
  },
  {
    icon: Wallet,
    title: 'Multi-Saku',
    desc: 'Pisahkan uang di cash, bank, e-wallet, dan tabungan. Setiap transaksi mengurangi dompet yang benar.',
    color: 'text-[var(--sk-green)]',
    bg: 'bg-[var(--sk-green-dim)]',
  },
  {
    icon: BarChart3,
    title: 'Rekapan & Tren',
    desc: 'History, kalender harian, dan tren grafik dalam satu tab. Evaluasi pengeluaran tiap minggu.',
    color: 'text-[var(--sk-amber)]',
    bg: 'bg-[var(--sk-amber-dim)]',
  },
  {
    icon: Target,
    title: 'Target Tabungan',
    desc: 'Buat goal seperti "Laptop 8jt", lalu tambah kontribusi sedikit demi sedikit sampai tercapai.',
    color: 'text-[#F472B6]',
    bg: 'bg-[rgba(244,114,182,0.12)]',
  },
];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const isLast = step === SLIDES.length - 1;
  const Icon = SLIDES[step].icon;

  const next = () => {
    if (isLast) {
      try { localStorage.setItem(ONBOARDING_KEY, '1'); } catch {}
      onDone();
    } else {
      setStep((s) => s + 1);
    }
  };

  const skip = () => {
    try { localStorage.setItem(ONBOARDING_KEY, '1'); } catch {}
    onDone();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[var(--sk-bg)] flex flex-col items-center justify-center px-6">
      {/* Progress dots */}
      <div className="flex gap-1.5 mb-8">
        {SLIDES.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${i === step ? 'w-6 bg-[var(--sk-cyan)]' : 'w-1.5 bg-[var(--sk-surface-3)]'}`}
          />
        ))}
      </div>

      {/* Icon */}
      <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mb-6 ${SLIDES[step].bg}`}>
        <Icon className={`w-10 h-10 ${SLIDES[step].color}`} />
      </div>

      {/* Content */}
      <div className="text-center max-w-xs space-y-2">
        <h2 className="text-lg font-bold text-[var(--sk-text)]">{SLIDES[step].title}</h2>
        <p className="text-sm text-[var(--sk-text-muted)] leading-relaxed">{SLIDES[step].desc}</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 mt-10">
        {!isLast && (
          <button onClick={skip} className="text-xs text-[var(--sk-text-dim)] hover:text-[var(--sk-text-muted)] px-4 py-2">
            Lewati
          </button>
        )}
        <button
          onClick={next}
          className="min-h-10 px-6 rounded-xl bg-[var(--sk-cyan)] text-[#090D16] text-sm font-bold shadow-[0_0_20px_var(--sk-cyan-glow)] active:scale-95 transition-all flex items-center gap-2"
        >
          {isLast ? (
            <>
              <Check className="w-4 h-4" />
              Mulai pakai
            </>
          ) : (
            <>
              Lanjut
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export function shouldShowOnboarding(): boolean {
  try { return localStorage.getItem(ONBOARDING_KEY) !== '1'; } catch { return false; }
}
