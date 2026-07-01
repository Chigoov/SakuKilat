'use client';

import { useEffect, useRef } from 'react';

interface ConfettiProps {
  onDone: () => void;
}

export function Confetti({ onDone }: ConfettiProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Vibrate pattern for celebration
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([20, 40, 20, 80]);
    }
    timerRef.current = setTimeout(onDone, 3200);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [onDone]);

  const colors = ['#34D399', '#38BDF8', '#FBBF24', '#F472B6'];
  const particles = Array.from({ length: 28 }, (_, i) => {
    const angle = (i / 28) * Math.PI * 2;
    const distance = 70 + 110 * Math.random();
    return {
      id: i,
      dx: Math.cos(angle) * distance,
      dy: Math.sin(angle) * distance - 30,
      color: colors[i % colors.length],
      delay: 80 * Math.random(),
      duration: 700 + 600 * Math.random(),
    };
  });

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center z-50">
      <div className="relative">
        {particles.map((p) => (
          <span
            key={p.id}
            className="absolute w-1.5 h-2 rounded-sm"
            style={{
              background: p.color,
              animation: `sk-confetti ${p.duration}ms cubic-bezier(0.16,1,0.3,1) ${p.delay}ms forwards`,
              '--sk-dx': `${p.dx}px`,
              '--sk-dy': `${p.dy}px`,
            } as React.CSSProperties}
          />
        ))}
      </div>
    </div>
  );
}
