'use client'

import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  BookOpen, Camera, Shield, Moon, Sun, Monitor, ChevronRight, RotateCcw, Zap, Check, Save, Heart, Flame, FileText, FlaskConical,
} from 'lucide-react'
import Image from 'next/image'
import { useAuthStore, useFeedbackStore, usePreferenceStore, useTransactionData, type ThemeMode } from '@/lib/store'
import { monthlyTotals, streakStatus } from '@/lib/stats'
import { formatIDR } from '@/lib/parser'
import { DataPortability } from '@/components/data-portability'
import { AvatarCropper } from '@/components/avatar-cropper'
import { ReportPreview } from '@/components/report-preview'
import { UserGuide } from '@/components/user-guide'
import { TrophyCase } from '@/components/trophy-case'
import { NotificationSettings } from '@/components/notification-settings'
import { AppLockSettings } from '@/components/app-lock-settings'
import { enableDemo, disableDemo, isDemoActive } from '@/lib/demo'
import { cn } from '@/lib/utils'

const MAX_AVATAR_BYTES = 5 * 1024 * 1024

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex-1 rounded-xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-3.5 flex flex-col gap-1">
      <p className="text-[10px] text-[var(--sk-text-dim)] uppercase tracking-widest font-medium">{label}</p>
      <p className={cn('text-sm md:text-base font-bold leading-tight break-words', color)}>{value}</p>
    </div>
  )
}

function SettingRow({
  icon: Icon,
  label,
  description,
  onClick,
  danger,
  right,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  description?: string
  onClick?: () => void
  danger?: boolean
  right?: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-colors text-left',
        danger
          ? 'bg-[var(--sk-red-dim)] border-[rgba(248,113,113,0.2)] hover:bg-[rgba(248,113,113,0.18)]'
          : 'bg-[var(--sk-surface)] border-[var(--sk-border)] hover:bg-[var(--sk-surface-2)]'
      )}
    >
      <div
        className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
          danger ? 'bg-[rgba(248,113,113,0.15)]' : 'bg-[var(--sk-surface-2)]'
        )}
      >
        <Icon className={cn('w-4 h-4', danger ? 'text-[var(--sk-red)]' : 'text-[var(--sk-text-muted)]')} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-medium leading-tight', danger ? 'text-[var(--sk-red)]' : 'text-[var(--sk-text)]')}>
          {label}
        </p>
        {description && (
          <p className="text-xs text-[var(--sk-text-dim)] mt-0.5 leading-relaxed">{description}</p>
        )}
      </div>
      {right ?? <ChevronRight className={cn('w-4 h-4 flex-shrink-0', danger ? 'text-[var(--sk-red)]' : 'text-[var(--sk-text-dim)]')} />}
    </button>
  )
}

export function TabProfil() {
  const { user, updateProfile, updateProfileAvatar } = useAuthStore()
  const { showToast } = useFeedbackStore()
  const { transactions } = useTransactionData()
  const { themeMode, setThemeMode } = usePreferenceStore()
  const [profileNameDraft, setProfileNameDraft] = useState(user?.name ?? '')
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [cropUrl, setCropUrl] = useState<string | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [demoActive, setDemoActive] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDemoActive(isDemoActive())
  }, [])

  const { income, expense, balance } = monthlyTotals(transactions)
  const streak = streakStatus(transactions)

  const handleSaveProfile = () => {
    updateProfile(profileNameDraft)
  }

  const handlePrintReport = () => {
    setReportOpen(true)
    showToast('Preview laporan dibuka.', 'success')
  }

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      showToast('Pilih file gambar untuk foto profil.', 'error')
      return
    }
    if (file.size > MAX_AVATAR_BYTES) {
      showToast('Ukuran foto maksimal 5 MB.', 'error')
      return
    }
    setCropUrl(URL.createObjectURL(file))
  }

  const handleCropCancel = () => {
    if (cropUrl) URL.revokeObjectURL(cropUrl)
    setCropUrl(null)
  }

  const handleCropConfirm = (dataUrl: string) => {
    setAvatarBusy(true)
    try {
      updateProfileAvatar(dataUrl)
      void import('@/lib/achievements').then(m => m.setFlag(m.PHOTO_CHANGED_KEY))
    } finally {
      setAvatarBusy(false)
      if (cropUrl) URL.revokeObjectURL(cropUrl)
      setCropUrl(null)
    }
  }

  if (!user) return null

  return (
    <div className="flex flex-col min-h-full md:ml-[72px]">
      {cropUrl && (
        <AvatarCropper
          imageUrl={cropUrl}
          onCancel={handleCropCancel}
          onConfirm={handleCropConfirm}
        />
      )}
      <ReportPreview
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        profileName={user.name}
        transactions={transactions}
      />
      <UserGuide open={guideOpen} onClose={() => setGuideOpen(false)} />

      <div className="sticky top-0 z-20 bg-[var(--sk-bg)] border-b border-[var(--sk-border)] px-4 md:px-8 py-4">
        <h2 className="text-base font-semibold text-[var(--sk-text)]">Profil</h2>
      </div>

      <div className="flex-1 px-4 md:px-8 py-5 flex flex-col gap-5 pb-10">
        <div className="rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-5 flex items-center gap-4 relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-8 -right-8 w-40 h-40 rounded-full blur-3xl"
            style={{ background: 'radial-gradient(circle, rgba(56,189,248,0.08) 0%, transparent 70%)' }}
          />
          <div className="relative flex-shrink-0">
            <Image
              src={user.avatarUrl}
              alt={user.name}
              width={56}
              height={56}
              className="rounded-full border-2 border-[var(--sk-border-2)]"
            />
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[var(--sk-cyan)] flex items-center justify-center border-2 border-[var(--sk-bg)]">
              <Zap className="w-2.5 h-2.5 fill-[#0B0F19]" strokeWidth={0} />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[var(--sk-text)] truncate">{user.name}</p>
            <p className="text-xs text-[var(--sk-text-dim)] truncate mt-0.5">Mode lokal di perangkat ini</p>
            <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[var(--sk-cyan-dim)] border border-[rgba(56,189,248,0.2)]">
              <Shield className="w-2.5 h-2.5 text-[var(--sk-cyan)]" />
              <span className="text-[10px] text-[var(--sk-cyan)] font-medium">Mode lokal</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarBusy}
                className="h-8 px-3 rounded-lg bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-[11px] font-semibold text-[var(--sk-text)] inline-flex items-center gap-1.5"
              >
                <Camera className="w-3.5 h-3.5" />
                {avatarBusy ? 'Memproses...' : 'Ubah foto'}
              </button>
              <button
                type="button"
                onClick={() => updateProfileAvatar(null)}
                className="h-8 px-3 rounded-lg bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-[11px] font-semibold text-[var(--sk-text-dim)] inline-flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Foto bawaan
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
              />
            </div>
          </div>
        </div>

        <div data-tour="streak-card">
          <p className="text-xs text-[var(--sk-text-dim)] uppercase tracking-widest font-medium mb-2.5">
            Konsistensi
          </p>
          <div className="rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--sk-amber-dim)] flex items-center justify-center flex-shrink-0">
                <Flame className="w-5 h-5 text-[var(--sk-amber)]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[var(--sk-text)] leading-tight">
                  {streak.current > 0 ? `${streak.current} hari beruntun` : 'Mulai streak hari ini'}
                </p>
                <p className="text-[11px] text-[var(--sk-text-dim)] mt-0.5">
                  {streak.loggedToday
                    ? 'Sudah catat hari ini. Mantap, pertahankan!'
                    : 'Catat 1 transaksi untuk menjaga streak.'}
                </p>
              </div>
            </div>

            <div className="mt-3.5 flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                {Array.from({ length: streak.maxLives }).map((_, i) => {
                  const alive = i < streak.lives
                  return (
                    <Heart
                      key={i}
                      className={cn(
                        'w-5 h-5 transition-all',
                        alive
                          ? 'text-[var(--sk-red)] fill-[var(--sk-red)]'
                          : 'text-[var(--sk-surface-3)] fill-[var(--sk-surface-3)] opacity-50'
                      )}
                    />
                  )
                })}
              </div>
              <span className="ml-auto text-[11px] font-semibold tabular-nums text-[var(--sk-text-muted)]">
                {streak.lives}/{streak.maxLives} nyawa
              </span>
            </div>
            {streak.lives < streak.maxLives && (
              <p className="mt-2 text-[11px] leading-relaxed text-[var(--sk-amber)]">
                {streak.lives === 0
                  ? 'Semua nyawa pecah. Catat lagi hari ini untuk mulai dari awal - santai, gak ada yang menghakimi.'
                  : `${streak.maxLives - streak.lives} nyawa pecah karena absen. Catat hari ini untuk berhenti kehilangan nyawa.`}
              </p>
            )}

            <div className="mt-3.5 grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] px-3 py-2.5 text-center">
                <p className="text-base font-bold tabular-nums text-[var(--sk-text)]">{streak.current}</p>
                <p className="text-[10px] text-[var(--sk-text-dim)] uppercase tracking-wide mt-0.5">Beruntun</p>
              </div>
              <div className="rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] px-3 py-2.5 text-center">
                <p className="text-base font-bold tabular-nums text-[var(--sk-cyan)]">{streak.longest}</p>
                <p className="text-[10px] text-[var(--sk-text-dim)] uppercase tracking-wide mt-0.5">Rekor</p>
              </div>
              <div className="rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] px-3 py-2.5 text-center">
                <p className="text-base font-bold tabular-nums text-[var(--sk-green)]">{streak.totalDaysLogged}</p>
                <p className="text-[10px] text-[var(--sk-text-dim)] uppercase tracking-wide mt-0.5">Total hari</p>
              </div>
            </div>
          </div>
        </div>

        <TrophyCase />

        <div>
          <p className="text-xs text-[var(--sk-text-dim)] uppercase tracking-widest font-medium mb-2.5">
            Edit profil
          </p>
          <div className="rounded-xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-3 flex items-center gap-2">
            <input
              value={profileNameDraft}
              onChange={e => setProfileNameDraft(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveProfile()}
              placeholder="Nama panggilan"
              className="flex-1 min-w-0 bg-[var(--sk-surface-2)] border border-[var(--sk-border)] rounded-lg px-3 py-2 text-sm text-[var(--sk-text)] placeholder:text-[var(--sk-text-dim)] outline-none focus:border-[var(--sk-cyan)]"
            />
            <button
              type="button"
              onClick={handleSaveProfile}
              disabled={!profileNameDraft.trim()}
              className="w-9 h-9 rounded-lg bg-[var(--sk-cyan)] text-[#090D16] disabled:bg-[var(--sk-surface-2)] disabled:text-[var(--sk-text-dim)] flex items-center justify-center"
              aria-label="Simpan profil"
            >
              <Save className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] text-[var(--sk-text-dim)] mt-2">
            Nama ini hanya dipakai di SakuKilat, bukan mengubah akun Google.
          </p>
        </div>

        <div>
          <p className="text-xs text-[var(--sk-text-dim)] uppercase tracking-widest font-medium mb-2.5">
            Bulan ini
          </p>
          <div className="flex gap-2.5">
            <StatCard label="Saldo" value={formatIDR(Math.abs(balance))} color={balance >= 0 ? 'text-[var(--sk-text)]' : 'text-[var(--sk-red)]'} />
            <StatCard label="Masuk" value={formatIDR(income)} color="text-[var(--sk-green)]" />
            <StatCard label="Keluar" value={formatIDR(expense)} color="text-[var(--sk-red)]" />
          </div>
          <div className="mt-2 rounded-xl bg-[var(--sk-surface)] border border-[var(--sk-border)] px-3.5 py-2.5 flex items-center justify-between">
            <span className="text-xs text-[var(--sk-text-dim)]">Total transaksi dicatat</span>
            <span className="text-sm font-bold tabular-nums text-[var(--sk-text)]">{transactions.length}</span>
          </div>
        </div>

        <div>
          <p className="text-xs text-[var(--sk-text-dim)] uppercase tracking-widest font-medium mb-2.5">
            Pakai maksimal
          </p>
          <button
            type="button"
            data-tour="guide-button"
            onClick={() => {
              setGuideOpen(true)
              void import('@/lib/achievements').then(m => m.setFlag(m.GUIDE_OPENED_KEY))
            }}
            className="w-full flex items-center gap-3 rounded-xl bg-[var(--sk-surface)] border border-[var(--sk-border)] p-4 text-left hover:bg-[var(--sk-surface-2)] transition-colors"
          >
            <div className="w-9 h-9 rounded-lg bg-[var(--sk-cyan-dim)] flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-4.5 h-4.5 text-[var(--sk-cyan)]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--sk-text)] leading-tight">Buku Panduan</p>
              <p className="text-[11px] text-[var(--sk-text-dim)] mt-0.5 leading-relaxed">
                Pelajari cara catat cepat, atur saku, rekapan, dan semua fitur - pakai bahasa yang mudah.
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-[var(--sk-text-dim)] flex-shrink-0" />
          </button>
        </div>

        <div>
          <p className="text-xs text-[var(--sk-text-dim)] uppercase tracking-widest font-medium mb-2.5">
            Coba fitur
          </p>
          <div
            className={cn(
              'rounded-xl border p-4',
              demoActive
                ? 'bg-[var(--sk-amber-dim)] border-[rgba(251,191,36,0.3)]'
                : 'bg-[var(--sk-surface)] border-[var(--sk-border)]'
            )}
          >
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
                  demoActive ? 'bg-[rgba(251,191,36,0.18)]' : 'bg-[var(--sk-cyan-dim)]'
                )}
              >
                <FlaskConical className={cn('w-4.5 h-4.5', demoActive ? 'text-[var(--sk-amber)]' : 'text-[var(--sk-cyan)]')} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[var(--sk-text)] leading-tight">
                  {demoActive ? 'Mode Demo aktif' : 'Mode Demo'}
                </p>
                <p className="text-[11px] text-[var(--sk-text-dim)] mt-0.5 leading-relaxed">
                  {demoActive
                    ? 'Sedang menampilkan data contoh. Datamu yang asli aman dan akan dipulihkan saat keluar.'
                    : 'Isi data contoh kaya supaya semua fitur (rekap, tren, streak, lencana) langsung hidup.'}
                </p>
              </div>
            </div>
            {demoActive ? (
              <button
                type="button"
                onClick={() => disableDemo()}
                className="mt-3 w-full h-10 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-xs font-semibold text-[var(--sk-text)] inline-flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Keluar mode demo dan pulihkan dataku
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Aktifkan Mode Demo? Datamu saat ini dicadangkan dulu dan dipulihkan saat kamu keluar dari mode demo.')) {
                    enableDemo()
                  }
                }}
                className="mt-3 w-full h-10 rounded-xl bg-[var(--sk-cyan)] text-[#090D16] text-xs font-semibold inline-flex items-center justify-center gap-2"
              >
                <FlaskConical className="w-4 h-4" />
                Coba dengan data contoh
              </button>
            )}
          </div>
        </div>

        <div>
          <p className="text-xs text-[var(--sk-text-dim)] uppercase tracking-widest font-medium mb-2.5">
            Preferensi
          </p>
          <div className="flex flex-col gap-2">
            <div className="w-full rounded-xl border border-[var(--sk-border)] bg-[var(--sk-surface)] px-4 py-3.5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-[var(--sk-surface-2)] flex items-center justify-center flex-shrink-0">
                  <Sun className="w-4 h-4 text-[var(--sk-text-muted)]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--sk-text)] leading-tight">Tampilan</p>
                  <p className="text-xs text-[var(--sk-text-dim)] mt-0.5">Pilih mode yang paling nyaman di mata</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  ['system', Monitor, 'System'],
                  ['dark', Moon, 'Dark'],
                  ['light', Sun, 'Light'],
                ] as Array<[ThemeMode, React.ComponentType<{ className?: string }>, string]>).map(([mode, Icon, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setThemeMode(mode)}
                    className={cn(
                      'h-9 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border transition-colors',
                      themeMode === mode
                        ? 'bg-[var(--sk-cyan)] border-[var(--sk-cyan)] text-[#090D16]'
                        : 'bg-[var(--sk-surface-2)] border-[var(--sk-border)] text-[var(--sk-text-muted)]'
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <NotificationSettings />
        <AppLockSettings />

        <div>
          <p className="text-xs text-[var(--sk-text-dim)] uppercase tracking-widest font-medium mb-2.5">
            Data
          </p>
          <div className="flex flex-col gap-2">
            <div className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border bg-[var(--sk-surface)] border-[var(--sk-border)]">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-[var(--sk-surface-2)]">
                <Save className="w-4 h-4 text-[var(--sk-text-muted)]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-tight text-[var(--sk-text)]">Auto-save aktif</p>
                <p className="text-xs text-[var(--sk-text-dim)] mt-0.5 leading-relaxed">
                  Transaksi, saku, budget, profil, dan tema tersimpan otomatis di browser ini.
                </p>
              </div>
              <Check className="w-4 h-4 text-[var(--sk-green)] flex-shrink-0" />
            </div>
            <button
              type="button"
              onClick={handlePrintReport}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border bg-[var(--sk-surface)] border-[var(--sk-border)] hover:bg-[var(--sk-surface-2)] transition-colors text-left"
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-[var(--sk-cyan-dim)]">
                <FileText className="w-4 h-4 text-[var(--sk-cyan)]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-tight text-[var(--sk-text)]">Laporan PDF bulan ini</p>
                <p className="text-xs text-[var(--sk-text-dim)] mt-0.5 leading-relaxed">
                  Ringkasan + rincian transaksi siap cetak atau simpan jadi PDF.
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-[var(--sk-text-dim)] flex-shrink-0" />
            </button>
            <DataPortability />
          </div>
        </div>

        <div className="text-center pt-4">
          <p className="text-[11px] text-[var(--sk-text-dim)]">
            SakuKilat v2.0 - dibuat oleh Ardhika Argha
          </p>
        </div>
      </div>
    </div>
  )
}
