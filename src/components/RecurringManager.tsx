'use client';

import { useState, useEffect } from 'react';
import { Repeat, Plus, X, Trash2, Power } from 'lucide-react';
import { useFeedbackStore } from '@/store/StoreProvider';
import { loadRecurring, addRecurring, removeRecurring, toggleRecurring, type RecurringTransaction, type RecurringFrequency } from '@/lib/recurring';
import { getCategoryConfig, PAYMENT_METHOD_LABELS } from '@/lib/categories';
import { formatIDR } from '@/lib/format';
import { useWalletStore } from '@/store/StoreProvider';

const FREQ_LABELS: Record<RecurringFrequency, string> = {
  daily: 'Harian',
  weekly: 'Mingguan',
  monthly: 'Bulanan',
};

const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export function RecurringManager({ onClose }: { onClose: () => void }) {
  const { showToast } = useFeedbackStore();
  const { wallets } = useWalletStore();
  const [items, setItems] = useState<RecurringTransaction[]>([]);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => { setItems(loadRecurring()); }, []);

  const refresh = () => setItems(loadRecurring());

  return (
    <div className="fixed inset-0 z-[90] bg-[var(--sk-bg)] overflow-y-auto">
      <div className="sticky top-0 z-10 sk-glass border-b border-[var(--sk-border)] px-5 py-3 flex items-center gap-2">
        <Repeat className="w-5 h-5 text-[var(--sk-cyan)]" />
        <h2 className="text-base font-bold text-[var(--sk-text)]">Transaksi Berulang</h2>
        <button onClick={onClose} className="ml-auto w-8 h-8 rounded-lg flex items-center justify-center text-[var(--sk-text-dim)] hover:bg-[var(--sk-surface-2)]" aria-label="Tutup">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="px-5 py-4 space-y-3 max-w-2xl mx-auto pb-[180px]">
        <p className="text-xs text-[var(--sk-text-muted)] leading-relaxed">
          Atur transaksi yang berulang seperti langganan Netflix, bayar kos, atau gaji. SakuKilat akan otomatis mencatatnya sesuai jadwal.
        </p>

        {items.length === 0 && !showAdd && (
          <div className="text-center py-8">
            <Repeat className="w-10 h-10 text-[var(--sk-text-dim)] mx-auto mb-2" />
            <p className="text-sm text-[var(--sk-text-dim)]">Belum ada transaksi berulang.</p>
            <button onClick={() => setShowAdd(true)} className="mt-3 px-4 py-2 rounded-xl bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)] text-xs font-semibold flex items-center gap-1.5 mx-auto">
              <Plus className="w-3.5 h-3.5" /> Tambah transaksi berulang
            </button>
          </div>
        )}

        {items.length > 0 && (
          <div className="space-y-2">
            {items.map((item) => {
              const cat = getCategoryConfig(item.category);
              return (
                <div key={item.id} className={`rounded-xl bg-[var(--sk-surface)] border p-3 ${item.active ? 'border-[var(--sk-border)]' : 'border-[var(--sk-border)] opacity-60'}`}>
                  <div className="flex items-center gap-2.5">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${cat.bg}`}>
                      <cat.icon className={`w-4 h-4 ${cat.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--sk-text)] truncate">{item.description}</p>
                      <p className="text-[10px] text-[var(--sk-text-dim)]">
                        {formatIDR(item.amount)} · {FREQ_LABELS[item.frequency]}
                        {item.frequency === 'weekly' && ` ${DAYS[item.dayOfWeek ?? 1]}`}
                        {item.frequency === 'monthly' && ` tgl ${item.dayOfMonth ?? 1}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => { toggleRecurring(item.id); refresh(); }} className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--sk-text-dim)] hover:text-[var(--sk-cyan)]" aria-label="Aktif/nonaktif">
                        <Power className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => { removeRecurring(item.id); refresh(); showToast('Transaksi berulang dihapus.', 'success'); }} className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--sk-text-dim)] hover:text-[var(--sk-red)]" aria-label="Hapus">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            <button onClick={() => setShowAdd(true)} className="w-full py-2.5 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-xs font-semibold text-[var(--sk-cyan)] flex items-center justify-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Tambah
            </button>
          </div>
        )}

        {showAdd && (
          <div className="fixed inset-0 z-[75] flex items-end justify-center" onClick={() => setShowAdd(false)}>
            <div className="absolute inset-0 sk-backdrop" />
            <div
              className="relative w-full max-w-2xl bg-[var(--sk-bg)] rounded-t-3xl border-t border-[var(--sk-border-2)] safe-bottom animate-sheet max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 flex justify-center py-2 bg-[var(--sk-bg)] z-10">
                <div className="w-10 h-1 rounded-full bg-[var(--sk-surface-3)]" />
              </div>
              <div className="px-5 pb-6 pt-1">
                <AddRecurringForm
                  wallets={wallets}
                  onSave={(data) => {
                    addRecurring(data);
                    refresh();
                    setShowAdd(false);
                    showToast('Transaksi berulang ditambahkan.', 'success');
                  }}
                  onCancel={() => setShowAdd(false)}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AddRecurringForm({ wallets, onSave, onCancel }: {
  wallets: { id: string; label: string }[];
  onSave: (data: Omit<RecurringTransaction, 'id' | 'active'>) => void;
  onCancel: () => void;
}) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [category, setCategory] = useState('tagihan');
  const [paymentMethod, setPaymentMethod] = useState(wallets[0]?.id ?? 'tunai');
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [dayOfWeek, setDayOfWeek] = useState('1');

  const parseAmount = (s: string): number => {
    const m = s.match(/^(\d+(?:[.,]\d+)*)(k|rb|ribu|jt|juta)?$/i);
    if (!m) return Number(s) || 0;
    const n = Number(m[1].replace(/[.,]/g, ''));
    const suffix = m[2]?.toLowerCase();
    if (suffix === 'k' || suffix === 'rb' || suffix === 'ribu') return n * 1000;
    if (suffix === 'jt' || suffix === 'juta') return n * 1000000;
    return n;
  };

  return (
    <div className="rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-cyan)] p-3.5 shadow-[0_0_20px_var(--sk-cyan-glow)] animate-slide-up">
      <div className="flex items-center gap-2 mb-3">
        <Repeat className="w-4 h-4 text-[var(--sk-cyan)]" />
        <h4 className="text-sm font-semibold text-[var(--sk-text)]">Transaksi Berulang Baru</h4>
        <button onClick={onCancel} className="ml-auto text-[var(--sk-text-dim)]" aria-label="Tutup"><X className="w-4 h-4" /></button>
      </div>
      <div className="space-y-2">
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Deskripsi cth. Netflix Premium" autoFocus className="w-full px-3 py-2 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] outline-none text-sm text-[var(--sk-text)] placeholder:text-[var(--sk-text-dim)] focus:border-[var(--sk-cyan)]" />
        <div className="grid grid-cols-2 gap-2">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Nominal (186k)" inputMode="decimal" className="px-3 py-2 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] outline-none text-sm text-[var(--sk-text)] placeholder:text-[var(--sk-text-dim)] focus:border-[var(--sk-cyan)]" />
          <select value={type} onChange={(e) => setType(e.target.value as 'expense' | 'income')} className="px-3 py-2 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] outline-none text-sm text-[var(--sk-text)]">
            <option value="expense">Pengeluaran</option>
            <option value="income">Pemasukan</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="px-3 py-2 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] outline-none text-sm text-[var(--sk-text)]">
            <option value="tagihan">Tagihan</option><option value="hiburan">Hiburan</option><option value="makanan">Makanan</option><option value="transportasi">Transportasi</option><option value="belanja">Belanja</option><option value="kesehatan">Kesehatan</option><option value="gaji">Gaji</option><option value="lainnya">Lainnya</option>
          </select>
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="px-3 py-2 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] outline-none text-sm text-[var(--sk-text)]">
            {wallets.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
          </select>
        </div>
        <select value={frequency} onChange={(e) => setFrequency(e.target.value as RecurringFrequency)} className="w-full px-3 py-2 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] outline-none text-sm text-[var(--sk-text)]">
          <option value="daily">Harian</option><option value="weekly">Mingguan</option><option value="monthly">Bulanan</option>
        </select>
        {frequency === 'monthly' && (
          <input value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} placeholder="Tanggal (1-31)" inputMode="numeric" className="w-full px-3 py-2 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] outline-none text-sm text-[var(--sk-text)]" />
        )}
        {frequency === 'weekly' && (
          <select value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] outline-none text-sm text-[var(--sk-text)]">
            {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        )}
        <button
          onClick={() => {
            const amt = parseAmount(amount);
            if (!description.trim() || amt <= 0) return;
            onSave({
              description: description.trim(),
              amount: amt,
              type,
              category,
              paymentMethod,
              frequency,
              dayOfMonth: frequency === 'monthly' ? Number(dayOfMonth) || 1 : undefined,
              dayOfWeek: frequency === 'weekly' ? Number(dayOfWeek) || 1 : undefined,
              startDate: new Date().toISOString(),
            });
          }}
          disabled={!description.trim() || !amount}
          className="w-full py-2 rounded-xl font-semibold text-sm bg-[var(--sk-cyan)] text-[#090D16] shadow-[0_0_15px_var(--sk-cyan-glow)] disabled:opacity-40 active:scale-95 transition-all"
        >
          Simpan
        </button>
      </div>
    </div>
  );
}
