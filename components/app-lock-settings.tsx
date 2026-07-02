'use client'

import { useEffect, useMemo, useState } from 'react'
import { Fingerprint, KeyRound, ShieldOff } from 'lucide-react'
import { useFeedbackStore } from '@/lib/store'
import { BottomSheet } from '@/components/bottom-sheet'
import {
  clearPasscode,
  disableBiometric,
  enrollBiometric,
  isBiometricSupported,
  readLockConfig,
  savePasscode,
} from '@/lib/app-lock'
import { cn } from '@/lib/utils'

type SheetMode = 'create' | 'change' | null

export function AppLockSettings() {
  const { showToast } = useFeedbackStore()
  const [config, setConfig] = useState(() => readLockConfig())
  const [sheetMode, setSheetMode] = useState<SheetMode>(null)
  const [passcode, setPasscode] = useState('')
  const [confirmPasscode, setConfirmPasscode] = useState('')
  const [busy, setBusy] = useState(false)
  const biometricSupported = useMemo(() => isBiometricSupported(), [])

  useEffect(() => {
    const sync = () => setConfig(readLockConfig())
    sync()
    window.addEventListener('sakukilat:app-lock-changed', sync)
    return () => window.removeEventListener('sakukilat:app-lock-changed', sync)
  }, [])

  const closeSheet = () => {
    setSheetMode(null)
    setPasscode('')
    setConfirmPasscode('')
    setBusy(false)
  }

  const handleSavePasscode = async () => {
    const normalized = passcode.trim()
    if (normalized.length < 4) {
      showToast('Sandi minimal 4 digit atau karakter.', 'error')
      return
    }
    if (normalized !== confirmPasscode.trim()) {
      showToast('Konfirmasi sandi belum sama.', 'error')
      return
    }

    setBusy(true)
    try {
      const next = await savePasscode(normalized, config)
      setConfig(next)
      closeSheet()
      showToast(sheetMode === 'change' ? 'Sandi aplikasi diperbarui.' : 'Sandi aplikasi aktif.', 'success')
    } catch {
      showToast('Sandi gagal disimpan.', 'error')
      setBusy(false)
    }
  }

  const handleRemovePasscode = () => {
    clearPasscode()
    setConfig(null)
    showToast('Sandi aplikasi dimatikan.', 'success')
  }

  const handleBiometric = async () => {
    if (!config) {
      showToast('Aktifkan sandi dulu sebelum sidik jari.', 'error')
      return
    }
    if (!biometricSupported) {
      showToast('Sidik jari belum didukung di perangkat ini.', 'error')
      return
    }

    if (config.biometricEnabled) {
      disableBiometric(config)
      setConfig(readLockConfig())
      showToast('Sidik jari dimatikan.', 'success')
      return
    }

    setBusy(true)
    try {
      const next = await enrollBiometric(config)
      setConfig(next)
      showToast('Sidik jari aktif untuk buka aplikasi.', 'success')
    } catch {
      showToast('Sidik jari gagal diaktifkan.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <p className="text-xs text-[var(--sk-text-dim)] uppercase tracking-widest font-medium mb-2.5">
        Keamanan
      </p>
      <div className="flex flex-col gap-2">
        <div className="rounded-xl border border-[var(--sk-border)] bg-[var(--sk-surface)] px-4 py-3.5">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--sk-surface-2)]">
              <KeyRound className="h-4 w-4 text-[var(--sk-text-muted)]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--sk-text)]">Sandi aplikasi</p>
              <p className="mt-0.5 text-xs leading-relaxed text-[var(--sk-text-dim)]">
                {config ? 'Aplikasi akan meminta sandi saat dibuka ulang.' : 'Tambahkan sandi supaya aplikasi tidak langsung terbuka.'}
              </p>
            </div>
            <span className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-semibold',
              config ? 'bg-[var(--sk-green-dim)] text-[var(--sk-green)]' : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-dim)]'
            )}>
              {config ? 'Aktif' : 'Nonaktif'}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSheetMode(config ? 'change' : 'create')}
              className="min-h-10 rounded-lg bg-[var(--sk-cyan)] px-4 py-2.5 text-sm font-semibold text-[#090D16]"
            >
              {config ? 'Ganti sandi' : 'Buat sandi'}
            </button>
            {config && (
              <button
                type="button"
                onClick={handleRemovePasscode}
                className="min-h-10 rounded-lg bg-[var(--sk-surface-2)] px-4 py-2.5 text-sm font-semibold text-[var(--sk-text-muted)]"
              >
                Hapus sandi
              </button>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--sk-border)] bg-[var(--sk-surface)] px-4 py-3.5">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--sk-surface-2)]">
              <Fingerprint className="h-4 w-4 text-[var(--sk-text-muted)]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--sk-text)]">Sidik jari</p>
              <p className="mt-0.5 text-xs leading-relaxed text-[var(--sk-text-dim)]">
                {biometricSupported
                  ? 'Kalau perangkat mendukung, aplikasi bisa dibuka lewat sidik jari atau verifikasi layar perangkat.'
                  : 'Perangkat atau browser ini belum membuka akses sidik jari untuk aplikasi.'}
              </p>
            </div>
            <span className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-semibold',
              config?.biometricEnabled ? 'bg-[var(--sk-green-dim)] text-[var(--sk-green)]' : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-dim)]'
            )}>
              {config?.biometricEnabled ? 'Aktif' : 'Nonaktif'}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleBiometric()}
              disabled={busy || !config || !biometricSupported}
              className={cn(
                'min-h-10 rounded-lg px-4 py-2.5 text-sm font-semibold',
                config && biometricSupported
                  ? 'bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)]'
                  : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-dim)]'
              )}
            >
              {config?.biometricEnabled ? 'Matikan sidik jari' : 'Aktifkan sidik jari'}
            </button>
            {!config && (
              <span className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-[var(--sk-surface-2)] px-3 py-2 text-[12px] text-[var(--sk-text-dim)]">
                <ShieldOff className="h-3.5 w-3.5" />
                Aktifkan sandi dulu
              </span>
            )}
          </div>
        </div>
      </div>

      <BottomSheet
        open={sheetMode !== null}
        onClose={closeSheet}
        title={sheetMode === 'change' ? 'Ganti sandi aplikasi' : 'Buat sandi aplikasi'}
        subtitle="Sandi ini disimpan lokal di perangkat ini."
      >
        <div className="space-y-3">
          <input
            type="password"
            inputMode="numeric"
            value={passcode}
            onChange={(event) => setPasscode(event.target.value)}
            placeholder="Masukkan sandi"
            className="w-full rounded-xl border border-[var(--sk-border)] bg-[var(--sk-surface-2)] px-3 py-3 text-sm text-[var(--sk-text)] outline-none"
          />
          <input
            type="password"
            inputMode="numeric"
            value={confirmPasscode}
            onChange={(event) => setConfirmPasscode(event.target.value)}
            placeholder="Ulangi sandi"
            className="w-full rounded-xl border border-[var(--sk-border)] bg-[var(--sk-surface-2)] px-3 py-3 text-sm text-[var(--sk-text)] outline-none"
          />
          <button
            type="button"
            onClick={() => void handleSavePasscode()}
            disabled={busy}
            className="w-full rounded-xl bg-[var(--sk-cyan)] px-3 py-3 text-sm font-semibold text-[#090D16]"
          >
            {busy ? 'Menyimpan...' : 'Simpan sandi'}
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}
