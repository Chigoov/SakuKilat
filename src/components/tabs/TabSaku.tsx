'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, ArrowRightLeft, Target, Check, X, Pencil, Trash2 } from 'lucide-react';
import { useWalletStore, useFeedbackStore } from '@/store/StoreProvider';
import { formatIDR } from '@/lib/format';
import { Confetti } from '@/components/Confetti';
import type { Wallet, Goal } from '@/types';

const GOALS_KEY = 'sakukilat:v2:goals';
const CELEBRATED_GOALS_KEY = 'sakukilat:v2:celebrated-goals';

function loadGoals(): Goal[] {
  try {
    const raw = localStorage.getItem(GOALS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((g: any) => g && typeof g.id === 'string' && typeof g.label === 'string' && typeof g.target === 'number' && typeof g.saved === 'number') : [];
  } catch { return []; }
}

function saveGoals(goals: Goal[]) {
  try { localStorage.setItem(GOALS_KEY, JSON.stringify(goals)); } catch {}
}

function loadCelebrated(): Set<string> {
  try {
    const raw = localStorage.getItem(CELEBRATED_GOALS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    const set = new Set(Array.isArray(arr) ? arr : []);
    return set;
  } catch { return new Set(); }
}

function saveCelebrated(set: Set<string>) {
  try { localStorage.setItem(CELEBRATED_GOALS_KEY, JSON.stringify([...set])); } catch {}
}

export function TabSaku() {
  const { wallets, totalStored, addWallet, updateWallet, removeWallet, transferMoney, saveMoney } = useWalletStore();
  const { showToast } = useFeedbackStore();
  const [showAddWallet, setShowAddWallet] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [celebratingId, setCelebratingId] = useState<string | null>(null);
  const celebratedRef = useRef<Set<string>>(loadCelebrated());

  useEffect(() => { setGoals(loadGoals()); }, []);
  useEffect(() => { saveGoals(goals); }, [goals]);

  // Check for newly completed goals → trigger confetti
  useEffect(() => {
    for (const g of goals) {
      if (g.saved >= g.target && !celebratedRef.current.has(g.id)) {
        celebratedRef.current.add(g.id);
        saveCelebrated(celebratedRef.current);
        setCelebratingId(g.id);
        showToast(`Goal "${g.label}" tercapai! 🎉`, 'success');
        break;
      }
    }
  }, [goals]);

  const handleContribute = useCallback((goalId: string, amount: number, source?: string) => {
    if (amount <= 0) {
      showToast('Jumlah kontribusi harus lebih dari 0.', 'error');
      return;
    }
    setGoals((gs) => gs.map((g) => {
      if (g.id !== goalId) return g;
      const newSaved = Math.max(0, g.saved + amount);
      return { ...g, saved: newSaved };
    }));
    if (source) {
      saveMoney(source, amount);
      showToast(`Kontribusi ${formatIDR(amount)} ke goal.`, 'success');
    } else {
      showToast(`Kontribusi ${formatIDR(amount)} dicatat.`, 'success');
    }
  }, [saveMoney, showToast]);

  return (
    <div className="px-4 pt-4 space-y-2.5 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-[var(--sk-text)]">Saku</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowTransfer(true)} className="w-8 h-8 rounded-lg bg-[var(--sk-surface-2)] flex items-center justify-center text-[var(--sk-text-muted)]" aria-label="Pindah uang">
            <ArrowRightLeft className="w-4 h-4" />
          </button>
          <button onClick={() => setShowAddWallet(true)} className="w-8 h-8 rounded-lg bg-[var(--sk-cyan-dim)] flex items-center justify-center text-[var(--sk-cyan)]" aria-label="Tambah saku">
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Total */}
      <div className="rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-3">
        <p className="text-[11px] text-[var(--sk-text-muted)] font-medium">Total Saldo Semua Saku</p>
        <p className="text-xl font-bold text-[var(--sk-text)] tabular-nums mt-0.5">{formatIDR(totalStored)}</p>
      </div>

      {/* Wallet list */}
      <div className="space-y-1.5">
        {wallets.map((w) => (
          <div key={w.id} className="rounded-xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-2.5 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[var(--sk-text)]">{w.label}</p>
              <p className="text-[10px] text-[var(--sk-text-dim)] capitalize">{w.type}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-bold tabular-nums ${w.balance < 0 ? 'text-[var(--sk-red)]' : 'text-[var(--sk-text)]'}`}>
                {formatIDR(w.balance)}
              </span>
              {!w.isBuiltIn && w.balance === 0 && (
                <button onClick={() => removeWallet(w.id)} className="w-6 h-6 rounded-lg flex items-center justify-center text-[var(--sk-text-dim)] hover:text-[var(--sk-red)]" aria-label="Hapus saku">
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Goals section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-[var(--sk-text)]">Target Tabungan</h2>
          <button onClick={() => { setEditingGoal(null); setShowAddGoal(true); }} className="w-7 h-7 rounded-lg bg-[var(--sk-cyan-dim)] flex items-center justify-center text-[var(--sk-cyan)]" aria-label="Tambah goal">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        {goals.length === 0 ? (
          <p className="text-xs text-[var(--sk-text-dim)] py-4 text-center">Belum ada target tabungan. Buat satu!</p>
        ) : (
          <div className="space-y-1.5">
            {goals.map((g) => {
              const pct = Math.round(Math.min(1, g.saved / Math.max(1, g.target)) * 100);
              const done = g.saved >= g.target;
              const daysLeft = g.deadline ? Math.round((new Date(g.deadline).getTime() - Date.now()) / 86400000) : null;
              return (
                <div key={g.id} className={`relative rounded-xl bg-[var(--sk-surface)] border p-2.5 ${done ? 'border-[var(--sk-green)] shadow-[0_0_24px_rgba(52,211,153,0.18)]' : 'border-[var(--sk-border)]'}`}>
                  {celebratingId === g.id && <Confetti onDone={() => setCelebratingId(null)} />}
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${done ? 'bg-[var(--sk-green-dim)]' : 'bg-[var(--sk-cyan-dim)]'}`}>
                        {done ? <Check className="w-4 h-4 text-[var(--sk-green)]" /> : <Target className="w-4 h-4 text-[var(--sk-cyan)]" />}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[var(--sk-text)]">{g.label}</p>
                        <p className="text-[10px] text-[var(--sk-text-dim)] tabular-nums">
                          {formatIDR(g.saved)} / {formatIDR(g.target)}
                          {daysLeft !== null && !done && (
                            <span className={`ml-2 ${daysLeft < 0 ? 'text-[var(--sk-red)]' : ''}`}>
                              {daysLeft >= 0 ? `${daysLeft} hari lagi` : `lewat ${-daysLeft} hari`}
                            </span>
                          )}
                          {done && <span className="ml-2 text-[var(--sk-green)]">tercapai!</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => { setEditingGoal(g); setShowAddGoal(true); }} className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--sk-text-dim)] hover:bg-[var(--sk-surface-2)]" aria-label="Edit goal">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setGoals((gs) => gs.filter((x) => x.id !== g.id))} className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--sk-text-dim)] hover:text-[var(--sk-red)]" aria-label="Hapus goal">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="relative h-2 rounded-full bg-[var(--sk-surface-2)] overflow-hidden mb-1.5">
                    <div className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ${done ? 'bg-[var(--sk-green)]' : pct >= 66 ? 'bg-[var(--sk-cyan)]' : pct >= 33 ? 'bg-[var(--sk-amber)]' : 'bg-[var(--sk-red)]'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] text-[var(--sk-text-dim)] tabular-nums">
                    <span>{pct}%</span>
                    {!done && daysLeft !== null && daysLeft > 0 && (
                      <span>Sisihkan ~<span className="text-[var(--sk-cyan)] font-semibold">{formatIDR(Math.ceil((g.target - g.saved) / daysLeft))}</span>/hari</span>
                    )}
                  </div>
                  {!done && (
                    <ContributeForm
                      goal={g}
                      wallets={wallets}
                      onContribute={(amount, source) => handleContribute(g.id, amount, source)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add wallet form — bottom sheet modal */}
      {showAddWallet && (
        <BottomSheet onClose={() => setShowAddWallet(false)}>
          <AddWalletForm
            onSave={(label, type, balance, keywords) => { addWallet(label, type, balance, keywords); setShowAddWallet(false); }}
            onCancel={() => setShowAddWallet(false)}
          />
        </BottomSheet>
      )}

      {/* Transfer form — bottom sheet modal */}
      {showTransfer && (
        <BottomSheet onClose={() => setShowTransfer(false)}>
          <TransferForm
            wallets={wallets}
            onTransfer={(from, to, amount) => {
              const ok = transferMoney(from, to, amount);
              if (ok) showToast('Uang dipindahkan.', 'success');
              setShowTransfer(false);
            }}
            onCancel={() => setShowTransfer(false)}
          />
        </BottomSheet>
      )}

      {/* Add/Edit goal form — bottom sheet modal */}
      {showAddGoal && (
        <BottomSheet onClose={() => { setShowAddGoal(false); setEditingGoal(null); }}>
          <AddGoalForm
            initial={editingGoal}
            onSave={(label, target, deadline) => {
              if (editingGoal) {
                setGoals((gs) => gs.map((g) => g.id === editingGoal.id ? { ...g, label, target, deadline } : g));
                showToast('Goal diperbarui.', 'success');
            } else {
              const goal: Goal = { id: 'g_' + Math.random().toString(36).slice(2, 10), label, target, saved: 0, deadline, createdAt: new Date().toISOString() };
              setGoals((gs) => [goal, ...gs]);
              showToast('Goal dibuat. Yuk mulai sisihkan!', 'success');
            }
            setShowAddGoal(false);
            setEditingGoal(null);
          }}
          onCancel={() => { setShowAddGoal(false); setEditingGoal(null); }}
        />
        </BottomSheet>
      )}
    </div>
  );
}

// --- BottomSheet wrapper for modal forms ---
function BottomSheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 sk-backdrop" />
      <div
        className="relative w-full max-w-2xl bg-[var(--sk-bg)] rounded-t-3xl border-t border-[var(--sk-border-2)] safe-bottom animate-sheet max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex justify-center py-2 bg-[var(--sk-bg)] z-10">
          <div className="w-10 h-1 rounded-full bg-[var(--sk-surface-3)]" />
        </div>
        <div className="px-5 pb-6 pt-1">
          {children}
        </div>
      </div>
    </div>
  );
}

function ContributeForm({ goal, wallets, onContribute }: { goal: Goal; wallets: Wallet[]; onContribute: (amount: number, source?: string) => void }) {
  const [show, setShow] = useState(false);
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState('');

  const parseAmt = (s: string): number => {
    const m = s.match(/^(\d+(?:[.,]\d+)*)(k|rb|ribu|jt|juta)?$/i);
    if (!m) return Number(s) || 0;
    const n = Number(m[1].replace(/[.,]/g, ''));
    const suffix = m[2]?.toLowerCase();
    if (suffix === 'k' || suffix === 'rb' || suffix === 'ribu') return n * 1000;
    if (suffix === 'jt' || suffix === 'juta') return n * 1000000;
    return n;
  };

  if (!show) {
    return (
      <button onClick={() => setShow(true)} className="mt-2.5 w-full flex items-center justify-center gap-1 py-1.5 rounded-lg bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-[11px] font-semibold text-[var(--sk-text-muted)] hover:bg-[var(--sk-surface-3)] transition-colors">
        <Plus className="w-3.5 h-3.5" /> Tambah kontribusi
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-1.5">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { const a = parseAmt(amount); if (a > 0) { onContribute(a, source || undefined); setAmount(''); setShow(false); } } }}
          placeholder="cth. 100k"
          inputMode="decimal"
          autoFocus
          className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-[var(--sk-surface-2)] border border-[var(--sk-border)] outline-none text-xs text-[var(--sk-text)] placeholder:text-[var(--sk-text-dim)] focus:border-[var(--sk-cyan)]"
        />
        <button
          onClick={() => { const a = parseAmt(amount); if (a > 0) { onContribute(a, source || undefined); setAmount(''); setShow(false); } }}
          disabled={!amount}
          className="w-9 h-8 rounded-lg flex items-center justify-center bg-[var(--sk-cyan)] text-[#090D16] shadow-[0_0_10px_var(--sk-cyan-glow)] disabled:opacity-40"
          aria-label="Simpan kontribusi"
        >
          <Check className="w-4 h-4" />
        </button>
      </div>
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar text-[10px]">
        <span className="text-[var(--sk-text-dim)] flex-shrink-0">Sumber:</span>
        <button onClick={() => setSource('')} className={`sk-suggest-chip ${source === '' && 'bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)] border-[rgba(56,189,248,0.3)]'}`}>Catat saja</button>
        {wallets.filter((w) => w.id !== 'tabungan').slice(0, 5).map((w) => (
          <button key={w.id} onClick={() => setSource(w.id)} className={`sk-suggest-chip ${source === w.id && 'bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)] border-[rgba(56,189,248,0.3)]'}`}>{w.label}</button>
        ))}
      </div>
      {source && (
        <p className="text-[10px] text-[var(--sk-text-dim)] leading-relaxed">
          Akan dipindahkan dari <span className="text-[var(--sk-text-muted)] font-medium">{wallets.find((w) => w.id === source)?.label}</span> ke <span className="text-[var(--sk-text-muted)] font-medium">Tabungan</span>.
        </p>
      )}
    </div>
  );
}

function AddWalletForm({ onSave, onCancel }: { onSave: (label: string, type: Wallet['type'], balance: number, keywords: string[]) => void; onCancel: () => void }) {
  const [label, setLabel] = useState('');
  const [type, setType] = useState<Wallet['type']>('cash');
  const [balance, setBalance] = useState('');
  return (
    <div className="rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-cyan)] p-4 shadow-[0_0_20px_var(--sk-cyan-glow)]">
      <div className="flex items-center gap-2 mb-3">
        <Plus className="w-4 h-4 text-[var(--sk-cyan)]" />
        <h4 className="text-sm font-semibold text-[var(--sk-text)]">Saku Baru</h4>
        <button onClick={onCancel} className="ml-auto text-[var(--sk-text-dim)]" aria-label="Tutup"><X className="w-4 h-4" /></button>
      </div>
      <div className="space-y-2.5">
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nama saku" autoFocus className="w-full px-3 py-2 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] outline-none text-sm text-[var(--sk-text)] placeholder:text-[var(--sk-text-dim)] focus:border-[var(--sk-cyan)]" />
        <select value={type} onChange={(e) => setType(e.target.value as Wallet['type'])} className="w-full px-3 py-2 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] outline-none text-sm text-[var(--sk-text)]">
          <option value="cash">Cash</option><option value="bank">Bank</option><option value="ewallet">E-Wallet</option><option value="savings">Tabungan</option><option value="other">Lainnya</option>
        </select>
        <input value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="Saldo awal (opsional)" inputMode="decimal" className="w-full px-3 py-2 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] outline-none text-sm text-[var(--sk-text)] placeholder:text-[var(--sk-text-dim)] focus:border-[var(--sk-cyan)]" />
        <button onClick={() => { if (label.trim()) onSave(label, type, Number(balance) || 0, []); }} disabled={!label.trim()} className="w-full py-2 rounded-xl font-semibold text-sm bg-[var(--sk-cyan)] text-[#090D16] shadow-[0_0_15px_var(--sk-cyan-glow)] disabled:opacity-40 active:scale-95 transition-all">
          Tambah saku
        </button>
      </div>
    </div>
  );
}

function TransferForm({ wallets, onTransfer, onCancel }: { wallets: Wallet[]; onTransfer: (from: string, to: string, amount: number) => void; onCancel: () => void }) {
  const [from, setFrom] = useState(wallets[0]?.id ?? '');
  const [to, setTo] = useState(wallets[1]?.id ?? '');
  const [amount, setAmount] = useState('');
  return (
    <div className="rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-cyan)] p-4 shadow-[0_0_20px_var(--sk-cyan-glow)]">
      <div className="flex items-center gap-2 mb-3">
        <ArrowRightLeft className="w-4 h-4 text-[var(--sk-cyan)]" />
        <h4 className="text-sm font-semibold text-[var(--sk-text)]">Pindah Uang</h4>
        <button onClick={onCancel} className="ml-auto text-[var(--sk-text-dim)]" aria-label="Tutup"><X className="w-4 h-4" /></button>
      </div>
      <div className="space-y-2.5">
        <select value={from} onChange={(e) => setFrom(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] outline-none text-sm text-[var(--sk-text)]">
          {wallets.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
        </select>
        <select value={to} onChange={(e) => setTo(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] outline-none text-sm text-[var(--sk-text)]">
          {wallets.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
        </select>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Jumlah (100k)" inputMode="decimal" className="w-full px-3 py-2 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] outline-none text-sm text-[var(--sk-text)] placeholder:text-[var(--sk-text-dim)] focus:border-[var(--sk-cyan)]" />
        <button onClick={() => { const amt = Number(amount); if (from && to && from !== to && amt > 0) onTransfer(from, to, amt); }} disabled={!from || !to || from === to || !amount} className="w-full py-2 rounded-xl font-semibold text-sm bg-[var(--sk-cyan)] text-[#090D16] shadow-[0_0_15px_var(--sk-cyan-glow)] disabled:opacity-40 active:scale-95 transition-all">
          Pindahkan
        </button>
      </div>
    </div>
  );
}

function AddGoalForm({ initial, onSave, onCancel }: { initial: Goal | null; onSave: (label: string, target: number, deadline?: string) => void; onCancel: () => void }) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [target, setTarget] = useState(initial ? String(initial.target) : '');
  const [deadline, setDeadline] = useState(initial?.deadline?.slice(0, 10) ?? '');

  const parseAmt = (s: string): number => {
    const m = s.match(/^(\d+(?:[.,]\d+)*)(k|rb|ribu|jt|juta)?$/i);
    if (!m) return Number(s) || 0;
    const n = Number(m[1].replace(/[.,]/g, ''));
    const suffix = m[2]?.toLowerCase();
    if (suffix === 'k' || suffix === 'rb' || suffix === 'ribu') return n * 1000;
    if (suffix === 'jt' || suffix === 'juta') return n * 1000000;
    return n;
  };

  return (
    <div className="rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-cyan)] p-4 shadow-[0_0_20px_var(--sk-cyan-glow)]">
      <div className="flex items-center gap-2 mb-3">
        <Target className="w-4 h-4 text-[var(--sk-cyan)]" />
        <h4 className="text-sm font-semibold text-[var(--sk-text)]">{initial ? 'Edit Goal' : 'Goal Baru'}</h4>
        <button onClick={onCancel} className="ml-auto text-[var(--sk-text-dim)]" aria-label="Tutup"><X className="w-4 h-4" /></button>
      </div>
      <div className="space-y-2.5">
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Apa yang mau dicapai? cth. Laptop baru" autoFocus className="w-full px-3 py-2 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] outline-none text-sm text-[var(--sk-text)] placeholder:text-[var(--sk-text-dim)] focus:border-[var(--sk-cyan)]" />
        <div className="grid grid-cols-2 gap-2">
          <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Target (5jt)" inputMode="decimal" className="px-3 py-2 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] outline-none text-sm text-[var(--sk-text)] placeholder:text-[var(--sk-text-dim)] focus:border-[var(--sk-cyan)]" />
          <input value={deadline} onChange={(e) => setDeadline(e.target.value)} type="date" className="px-3 py-2 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] outline-none text-sm text-[var(--sk-text)] focus:border-[var(--sk-cyan)]" />
        </div>
        <button onClick={() => { const t = parseAmt(target); if (label.trim() && t > 0) onSave(label.trim(), t, deadline || undefined); }} disabled={!label.trim() || !target} className="w-full py-2 rounded-xl font-semibold text-sm bg-[var(--sk-cyan)] text-[#090D16] shadow-[0_0_15px_var(--sk-cyan-glow)] disabled:opacity-40 active:scale-95 transition-all">
          {initial ? 'Simpan perubahan' : 'Buat goal'}
        </button>
      </div>
    </div>
  );
}
