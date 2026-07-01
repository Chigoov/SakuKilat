'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { Moon, Sun, Monitor, Eye, EyeOff, Download, Upload, Award, BookOpen, Bell, Sparkles } from 'lucide-react';
import { useAuthStore, usePreferenceStore, useTransactionData, useWalletStore, useBudgetStore, useCustomizationStore, useFeedbackStore } from '@/store/StoreProvider';
import { formatIDR } from '@/lib/format';
import { evaluateBadges, buildBadgeContext, BACKUP_COUNT_KEY, bumpCount, setFlag, GUIDE_OPENED_KEY } from '@/lib/badges';
import { isDemoActive, deactivateDemo } from '@/lib/demo';
import { getNotifPrefs, saveNotifPrefs, type NotifPrefs } from '@/lib/notifications';
import { loadRecurring } from '@/lib/recurring';
import type { ThemeMode } from '@/types';

const GOALS_KEY = 'sakukilat:v2:goals';

function loadGoalStats(): { total: number; completed: number } {
  try {
    const raw = localStorage.getItem(GOALS_KEY);
    if (!raw) return { total: 0, completed: 0 };
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return { total: 0, completed: 0 };
    const goals = arr.filter((g: any) => g && typeof g.target === 'number' && typeof g.saved === 'number');
    return {
      total: goals.length,
      completed: goals.filter((g: any) => g.saved >= g.target).length,
    };
  } catch { return { total: 0, completed: 0 }; }
}

export function TabProfil() {
  const { user, updateProfile, updateProfileAvatar } = useAuthStore();
  const { zenMode, themeMode, toggleZen, setThemeMode } = usePreferenceStore();
  const { transactions } = useTransactionData();
  const { wallets, totalStored } = useWalletStore();
  const { monthlyBudget } = useBudgetStore();
  const { customCategories } = useCustomizationStore();
  const { showToast } = useFeedbackStore();
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(user?.name ?? '');
  const [showBadges, setShowBadges] = useState(false);
  const [showNotifSettings, setShowNotifSettings] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs | null>(null);
  const [recurringCount, setRecurringCount] = useState(0);
  const [goalStats, setGoalStats] = useState({ total: 0, completed: 0 });

  useEffect(() => {
    setNotifPrefs(getNotifPrefs());
    setRecurringCount(loadRecurring().filter(r => r.active).length);
    setGoalStats(loadGoalStats());
  }, []);

  const demoActive = isDemoActive();

  const badgeCtx = buildBadgeContext({
    transactions, wallets,
    walletsCount: wallets.length,
    goalsTotal: goalStats.total,
    goalsCompleted: goalStats.completed,
    customCategoriesCount: customCategories.length,
  });

  const evaluatedBadges = evaluateBadges(badgeCtx);
  const unlockedBadges = evaluatedBadges.filter((b) => b.unlocked);

  const handleBackup = useCallback(() => {
    const data = {
      schemaVersion: 6,
      transactions: transactions.map((t) => ({ ...t, date: t.date.toISOString() })),
      wallets, monthlyBudget,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sakukilat-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    bumpCount(BACKUP_COUNT_KEY);
    showToast('Backup berhasil.', 'success');
  }, [transactions, wallets, monthlyBudget, showToast]);

  const handleExportCSV = useCallback(() => {
    const rows = transactions.map((t) => [
      t.date.toISOString(), t.description, String(t.amount), t.type, t.category, t.paymentMethod,
    ]);
    const csv = [['Date', 'Description', 'Amount', 'Type', 'Category', 'PaymentMethod'].join(',')]
      .concat(rows.map((r) => r.map((c) => `"${c}"`).join(',')))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sakukilat-transaksi-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV berhasil diexport.', 'success');
  }, [transactions, showToast]);

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (!data || typeof data !== 'object') {
          showToast('File tidak valid: bukan JSON object.', 'error');
          return;
        }
        // Validate minimum schema fields
        if (!Array.isArray(data.transactions) && !Array.isArray(data.wallets)) {
          showToast('File tidak valid: tidak ada data transaksi atau wallet.', 'error');
          return;
        }
        localStorage.setItem('sakukilat:v2:local-state', JSON.stringify(data));
        showToast('Import berhasil. Memuat ulang...', 'success');
        setTimeout(() => window.location.reload(), 1000);
      } catch {
        showToast('File tidak valid: JSON corrupt atau malformed.', 'error');
      }
    };
    reader.onerror = () => {
      showToast('Gagal membaca file.', 'error');
    };
    reader.readAsText(file);
  }, [showToast]);

  const handleExitDemo = useCallback(() => {
    deactivateDemo();
    showToast('Mode demo dinonaktifkan. Memuat ulang...', 'success');
    setTimeout(() => window.location.reload(), 1000);
  }, [showToast]);

  const themeOptions: { mode: ThemeMode; label: string; icon: typeof Moon }[] = [
    { mode: 'dark', label: 'Gelap', icon: Moon },
    { mode: 'light', label: 'Terang', icon: Sun },
    { mode: 'system', label: 'Sistem', icon: Monitor },
  ];

  return (
    <div className="px-4 pt-4 space-y-2.5 max-w-2xl mx-auto">
      <h1 className="text-lg font-bold text-[var(--sk-text)]">Profil</h1>

      {/* Demo banner */}
      {demoActive && (
        <div className="rounded-xl bg-[var(--sk-amber-dim)] border border-[var(--sk-amber)] p-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[var(--sk-amber)] flex-shrink-0" />
          <p className="text-xs text-[var(--sk-amber)] flex-1">Mode demo aktif. Data demo akan hilang saat dinonaktifkan.</p>
          <button onClick={handleExitDemo} className="text-xs font-semibold text-[var(--sk-amber)] underline">Keluar demo</button>
        </div>
      )}

      {/* Profile card */}
      <div className="rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-[var(--sk-cyan-dim)] flex items-center justify-center text-[var(--sk-cyan)] font-bold text-base overflow-hidden">
          {user?.avatarUrl ? <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" /> : (user?.givenName?.[0] ?? 'K')}
        </div>
        <div className="flex-1 min-w-0">
          {editingName ? (
            <div className="flex gap-2">
              <input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { updateProfile(nameInput); setEditingName(false); } }}
                className="flex-1 px-2 py-1 rounded-lg bg-[var(--sk-surface-2)] border border-[var(--sk-border)] outline-none text-sm text-[var(--sk-text)]"
                autoFocus
              />
              <button onClick={() => { updateProfile(nameInput); setEditingName(false); }} className="text-xs font-semibold text-[var(--sk-cyan)]">Simpan</button>
            </div>
          ) : (
            <>
              <p className="text-sm font-semibold text-[var(--sk-text)]">{user?.name}</p>
              <button onClick={() => { setNameInput(user?.name ?? ''); setEditingName(true); }} className="text-[10px] text-[var(--sk-cyan)]">Edit profil</button>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-1.5">
        <div className="rounded-xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-2.5 text-center">
          <p className="text-base font-bold text-[var(--sk-text)] tabular-nums">{transactions.length}</p>
          <p className="text-[10px] text-[var(--sk-text-dim)]">Transaksi</p>
        </div>
        <div className="rounded-xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-2.5 text-center">
          <p className="text-base font-bold text-[var(--sk-text)] tabular-nums">{wallets.length}</p>
          <p className="text-[10px] text-[var(--sk-text-dim)]">Saku</p>
        </div>
        <div className="rounded-xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-2.5 text-center">
          <p className="text-base font-bold text-[var(--sk-text)] tabular-nums">{unlockedBadges.length}</p>
          <p className="text-[10px] text-[var(--sk-text-dim)]">Lencana</p>
        </div>
      </div>

      {/* Theme */}
      <div className="rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-3">
        <h3 className="text-[11px] font-semibold text-[var(--sk-text-muted)] mb-1.5">Tema</h3>
        <div className="flex gap-1.5">
          {themeOptions.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.mode}
                onClick={() => setThemeMode(opt.mode)}
                className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-xl border transition-all ${themeMode === opt.mode ? 'border-[var(--sk-cyan)] bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)]' : 'border-[var(--sk-border)] text-[var(--sk-text-muted)]'}`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-[10px] font-medium">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Zen mode */}
      <button
        onClick={toggleZen}
        className="w-full rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-3 flex items-center justify-between transition-colors hover:bg-[var(--sk-surface-2)]"
      >
        <div className="flex items-center gap-2.5">
          {zenMode ? <EyeOff className="w-4 h-4 text-[var(--sk-cyan)]" /> : <Eye className="w-4 h-4 text-[var(--sk-text-muted)]" />}
          <div className="text-left">
            <p className="text-sm font-semibold text-[var(--sk-text)]">Zen Mode</p>
            <p className="text-[10px] text-[var(--sk-text-dim)]">Sembunyikan angka untuk mindful spending</p>
          </div>
        </div>
        <div className={`w-10 h-6 rounded-full transition-colors ${zenMode ? 'bg-[var(--sk-cyan)]' : 'bg-[var(--sk-surface-3)]'}`}>
          <div className={`w-5 h-5 rounded-full bg-white transition-transform mt-0.5 ${zenMode ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
        </div>
      </button>

      {/* Notification settings */}
      <button
        onClick={() => {
          if (!notifPrefs) setNotifPrefs(getNotifPrefs());
          setShowNotifSettings(!showNotifSettings);
        }}
        className="w-full rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-3 flex items-center justify-between transition-colors hover:bg-[var(--sk-surface-2)]"
      >
        <div className="flex items-center gap-2.5">
          <Bell className="w-4 h-4 text-[var(--sk-cyan)]" />
          <span className="text-sm font-semibold text-[var(--sk-text)]">Notifikasi</span>
        </div>
        <span className="text-xs text-[var(--sk-text-dim)]">{showNotifSettings ? 'Tutup' : 'Atur'}</span>
      </button>
      {showNotifSettings && notifPrefs && (
        <div className="rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-3 space-y-2">
          <label className="flex items-center justify-between">
            <span className="text-xs text-[var(--sk-text-muted)]">Pengingat streak</span>
            <input
              type="checkbox"
              checked={notifPrefs.streakReminder}
              onChange={(e) => { const p = { ...notifPrefs, streakReminder: e.target.checked }; setNotifPrefs(p); saveNotifPrefs(p); }}
              className="w-4 h-4 accent-[var(--sk-cyan)]"
            />
          </label>
          <label className="flex items-center justify-between">
            <span className="text-xs text-[var(--sk-text-muted)]">Pengingat budget</span>
            <input
              type="checkbox"
              checked={notifPrefs.budgetReminder}
              onChange={(e) => { const p = { ...notifPrefs, budgetReminder: e.target.checked }; setNotifPrefs(p); saveNotifPrefs(p); }}
              className="w-4 h-4 accent-[var(--sk-cyan)]"
            />
          </label>
          <p className="text-[10px] text-[var(--sk-text-dim)]">Notifikasi aktif di APK. Di browser, cek panel lonceng di Beranda.</p>
        </div>
      )}

      {/* Badges */}
      <button
        onClick={() => setShowBadges(!showBadges)}
        className="w-full rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-3 flex items-center justify-between transition-colors hover:bg-[var(--sk-surface-2)]"
      >
        <div className="flex items-center gap-2.5">
          <Award className="w-4 h-4 text-[var(--sk-amber)]" />
          <span className="text-sm font-semibold text-[var(--sk-text)]">Lencana ({unlockedBadges.length}/{evaluatedBadges.length})</span>
        </div>
        <span className="text-xs text-[var(--sk-text-dim)]">{showBadges ? 'Tutup' : 'Lihat'}</span>
      </button>
      {showBadges && (
        <div className="rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-3 space-y-1.5 max-h-96 overflow-y-auto">
          {evaluatedBadges.map((badge) => (
            <div key={badge.id} className={`flex items-center gap-2 p-2 rounded-lg ${badge.unlocked ? 'bg-[var(--sk-surface-2)]' : 'opacity-50'}`}>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold ${badge.tier === 'gold' ? 'bg-[var(--sk-amber-dim)] text-[var(--sk-amber)]' : badge.tier === 'silver' ? 'bg-[var(--sk-surface-3)] text-[var(--sk-text-muted)]' : badge.tier === 'special' ? 'bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)]' : 'bg-[var(--sk-surface-3)] text-[var(--sk-text-dim)]'}`}>
                {badge.tier[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-[var(--sk-text)] truncate">{badge.title}</p>
                <p className="text-[10px] text-[var(--sk-text-dim)] truncate">{badge.howTo}</p>
              </div>
              {badge.unlocked ? (
                <span className="text-[10px] text-[var(--sk-green)]">✓</span>
              ) : (badge as any).target ? (
                <span className="text-[9px] text-[var(--sk-text-dim)] tabular-nums">{(badge as any).current ?? 0}/{(badge as any).target}</span>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* Data management */}
      <div className="rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-3 space-y-1.5">
        <h3 className="text-[11px] font-semibold text-[var(--sk-text-muted)] mb-0.5">Data</h3>
        <button onClick={handleBackup} className="w-full flex items-center gap-2.5 py-2 text-sm text-[var(--sk-text)] hover:text-[var(--sk-cyan)] transition-colors">
          <Download className="w-4 h-4 text-[var(--sk-text-muted)]" /> Backup (JSON)
        </button>
        <button onClick={handleExportCSV} className="w-full flex items-center gap-2.5 py-2 text-sm text-[var(--sk-text)] hover:text-[var(--sk-cyan)] transition-colors">
          <Download className="w-4 h-4 text-[var(--sk-text-muted)]" /> Export CSV
        </button>
        <label className="w-full flex items-center gap-2.5 py-2 text-sm text-[var(--sk-text)] hover:text-[var(--sk-cyan)] transition-colors cursor-pointer">
          <Upload className="w-4 h-4 text-[var(--sk-text-muted)]" /> Import (JSON)
          <input type="file" accept=".json" onChange={handleImport} className="hidden" />
        </label>
      </div>

      {/* Guide */}
      <button
        onClick={() => setFlag(GUIDE_OPENED_KEY)}
        className="w-full rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-3 flex items-center gap-2.5 transition-colors hover:bg-[var(--sk-surface-2)]"
      >
        <BookOpen className="w-4 h-4 text-[var(--sk-cyan)]" />
        <span className="text-sm font-semibold text-[var(--sk-text)]">Buku Panduan</span>
      </button>

      <p className="text-center text-[10px] text-[var(--sk-text-dim)] py-2">
        SakuKilat v2.0.0 · Data tersimpan di perangkat ini
      </p>
    </div>
  );
}
