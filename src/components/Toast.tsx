'use client';

import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import type { ToastState } from '@/types';

interface ToastProps {
  toast: ToastState;
  onDismiss: () => void;
}

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const COLORS = {
  success: 'text-[var(--sk-green)]',
  error: 'text-[var(--sk-red)]',
  info: 'text-[var(--sk-cyan)]',
};

export function Toast({ toast, onDismiss }: ToastProps) {
  const Icon = ICONS[toast.type];
  return (
    <div className="fixed bottom-[150px] left-1/2 -translate-x-1/2 z-50 animate-slide-up md:bottom-24 safe-bottom">
      <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border-2)] shadow-lg max-w-[90vw]">
        <Icon className={`w-4 h-4 flex-shrink-0 ${COLORS[toast.type]}`} />
        <span className="text-sm text-[var(--sk-text)] whitespace-nowrap">{toast.text}</span>
        {toast.action && (
          <button
            onClick={() => { toast.action!.onClick(); onDismiss(); }}
            className="text-xs font-semibold text-[var(--sk-cyan)] hover:opacity-80 ml-1"
          >
            {toast.action.label}
          </button>
        )}
        <button onClick={onDismiss} className="text-[var(--sk-text-dim)] hover:text-[var(--sk-text-muted)] ml-1" aria-label="Tutup">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
