'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Home, BarChart2, Wallet, User, X, Fingerprint, KeyRound } from 'lucide-react'
import pkg from '@/package.json'
import { cn } from '@/lib/utils'
import {
  useAuthStore,
  useCustomizationStore,
  useFeedbackStore,
  useTransactionActions,
  useTransactionStatus,
} from '@/lib/store'
import { useDailyRollover } from '@/lib/cron'
import { SmartInput } from '@/components/smart-input'
import { TabBeranda } from '@/components/tab-beranda'
import { TabSaku } from '@/components/tab-saku'
import { TabProfil } from '@/components/tab-profil'
import { OnboardingTour } from '@/components/onboarding-tour'
import { isNativeRuntime } from '@/lib/notifications'
import { authenticateBiometric, readLockConfig, verifyPasscode, type AppLockConfig } from '@/lib/app-lock'

type Tab = 'beranda' | 'saku' | 'rekapan' | 'profil'
type SakuSection = 'budget' | 'wallet' | 'move' | 'goal' | 'category'
type AppNavigateDetail = { tab?: Tab; section?: SakuSection }

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'beranda', label: 'Beranda', icon: Home },
  { id: 'rekapan', label: 'Rekapan', icon: BarChart2 },
  { id: 'saku', label: 'Saku', icon: Wallet },
  { id: 'profil', label: 'Profil', icon: User },
]

const TabRekapan = dynamic(
  () => import('@/components/tab-rekapan-yearly').then(mod => mod.TabRekapan),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[100dvh] px-5 pt-8 text-sm text-[var(--sk-text-muted)]">
        Memuat rekapan...
      </div>
    ),
  }
)

const APP_VERSION = pkg.version
const APP_SPLASH_MS = 1200
const APP_NAME = 'SakuKilat Nova'

function triggerTinyHaptic() {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(18)
  }
}

function AppUnlockScreen({
  config,
  onUnlock,
}: {
  config: AppLockConfig
  onUnlock: () => void
}) {
  const [passcode, setPasscode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [hint, setHint] = useState(
    config.biometricEnabled
      ? 'Tempel sidik jari, atau lanjut pakai sandi.'
      : 'Masukkan sandi untuk masuk ke aplikasi.'
  )
  const biometricAutoTried = useRef(false)

  useEffect(() => {
    if (!config.biometricEnabled || biometricAutoTried.current) return
    biometricAutoTried.current = true
    setBusy(true)
    setError('')
    setHint('Mencoba sidik jari perangkat...')
    void authenticateBiometric(config).then((ok) => {
      setBusy(false)
      if (ok) {
        onUnlock()
        return
      }
      setHint('Sidik jari belum cocok. Kamu tetap bisa masuk pakai sandi.')
    })
  }, [config, onUnlock])

  const handlePasscodeSubmit = async () => {
    if (!passcode.trim()) {
      setError('Masukkan sandi dulu.')
      return
    }
    setBusy(true)
    setError('')
    const ok = await verifyPasscode(passcode.trim(), config)
    setBusy(false)
    if (!ok) {
      setError('Sandi belum cocok.')
      return
    }
    setPasscode('')
    onUnlock()
  }

  const handleBiometric = async () => {
    setBusy(true)
    setError('')
    const ok = await authenticateBiometric(config)
    setBusy(false)
    if (!ok) {
      setError('Verifikasi perangkat belum berhasil.')
      return
    }
    onUnlock()
  }

  return (
    <div className="min-h-[100dvh] bg-[var(--sk-bg)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-[28px] border border-[var(--sk-border)] bg-[var(--sk-surface)] p-5 shadow-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-[var(--sk-cyan-dim)]">
          <KeyRound className="h-6 w-6 text-[var(--sk-cyan)]" />
        </div>
        <div className="mt-4 text-center">
          <p className="text-lg font-semibold text-[var(--sk-text)]">{APP_NAME}</p>
          <p className="mt-1 text-sm text-[var(--sk-text-dim)]">{hint}</p>
        </div>

        <form
          className="mt-5 space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            void handlePasscodeSubmit()
          }}
        >
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={passcode}
            onChange={(event) => setPasscode(event.target.value)}
            placeholder="Sandi aplikasi"
            className="w-full rounded-2xl border border-[var(--sk-border)] bg-[var(--sk-surface-2)] px-4 py-3 text-sm text-[var(--sk-text)] outline-none"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-2xl bg-[var(--sk-cyan)] px-4 py-3 text-sm font-semibold text-[#090D16]"
          >
            {busy ? 'Memeriksa...' : 'Masuk'}
          </button>
        </form>

        {config.biometricEnabled && (
          <button
            type="button"
            onClick={() => void handleBiometric()}
            disabled={busy}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--sk-border)] bg-[var(--sk-surface-2)] px-4 py-3 text-sm font-semibold text-[var(--sk-text)]"
          >
            <Fingerprint className="h-4 w-4" />
            Coba lagi sidik jari
          </button>
        )}

        {error && (
          <p className="mt-3 text-center text-xs font-medium text-[var(--sk-red)]">{error}</p>
        )}
      </div>
    </div>
  )
}

function AppShell() {
  const { user, authReady } = useAuthStore()
  const { toast, dismissToast } = useFeedbackStore()
  const { addTransaction } = useTransactionActions()
  const { isSubmitting } = useTransactionStatus()
  const { parserExtras } = useCustomizationStore()
  const [activeTab, setActiveTab] = useState<Tab>('beranda')
  const [mounted, setMounted] = useState(false)
  const [nativeSplashVisible, setNativeSplashVisible] = useState(false)
  const [nativeRuntime, setNativeRuntime] = useState(false)
  const [lockConfig, setLockConfig] = useState<AppLockConfig | null>(null)
  const [lockReady, setLockReady] = useState(false)
  const [appUnlocked, setAppUnlocked] = useState(false)

  useDailyRollover()

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('demo') !== '1') return

    const root = document.documentElement
    root.dataset.theme = 'dark'
    root.classList.add('dark')
    root.classList.remove('light')
    root.style.colorScheme = 'dark'

    void import('@/lib/demo').then(({ enableDemo, isDemoActive }) => {
      if (!isDemoActive()) enableDemo()
    })
  }, [])

  useEffect(() => {
    const inNativeApp = isNativeRuntime()
    setNativeRuntime(inNativeApp)
    setMounted(true)
    if (inNativeApp) {
      setNativeSplashVisible(true)
      const timeoutId = window.setTimeout(() => setNativeSplashVisible(false), APP_SPLASH_MS)
      void import('@/lib/achievements').then(m => m.addToSet(m.TABS_SEEN_KEY, 'beranda'))
      return () => window.clearTimeout(timeoutId)
    }
    void import('@/lib/achievements').then(m => m.addToSet(m.TABS_SEEN_KEY, 'beranda'))
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const requestedTab = params.get('tab')
    if (requestedTab === 'beranda' || requestedTab === 'rekapan' || requestedTab === 'saku' || requestedTab === 'profil') {
      setActiveTab(requestedTab)
    }
  }, [])

  const switchTab = (tab: Tab) => {
    if (tab !== activeTab) triggerTinyHaptic()
    setActiveTab(tab)
    void import('@/lib/achievements').then(m => m.addToSet(m.TABS_SEEN_KEY, tab))
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onNavigate = (event: Event) => {
      const detail = (event as CustomEvent<AppNavigateDetail>).detail
      if (detail?.tab) switchTab(detail.tab)
      if (!detail?.section) return
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('sakukilat:focus-section', { detail: { section: detail.section } }))
      }, detail.tab && detail.tab !== activeTab ? 160 : 20)
    }
    window.addEventListener('sakukilat:navigate', onNavigate as EventListener)
    return () => window.removeEventListener('sakukilat:navigate', onNavigate as EventListener)
  }, [activeTab])

  useEffect(() => {
    if (!mounted || !authReady) return
    const syncLock = () => {
      const nextConfig = readLockConfig()
      setLockConfig(nextConfig)
      setAppUnlocked((current) => (nextConfig ? current : true))
      setLockReady(true)
    }
    syncLock()
    window.addEventListener('sakukilat:app-lock-changed', syncLock)
    return () => window.removeEventListener('sakukilat:app-lock-changed', syncLock)
  }, [mounted, authReady])

  if (!mounted || !authReady || nativeSplashVisible || !lockReady) {
    return (
      <div className="min-h-[100dvh] bg-[var(--sk-bg)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 animate-fade-in">
          <div className="w-14 h-14 rounded-3xl bg-[var(--sk-cyan)] animate-pulse-soft flex items-center justify-center shadow-[0_0_30px_var(--sk-cyan-glow)]">
            <svg viewBox="0 0 24 24" className="w-7 h-7 fill-[#090D16]" aria-hidden>
              <path d="M13 3L4 14h7l-1 7 9-11h-7l1-7z" />
            </svg>
          </div>
          {nativeRuntime && (
            <div className="text-center">
              <p className="text-base font-semibold text-[var(--sk-text)]">{APP_NAME}</p>
              <p className="text-xs text-[var(--sk-text-dim)] mt-1">Versi {APP_VERSION}</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (!user) return null
  if (lockConfig && !appUnlocked) {
    return <AppUnlockScreen config={lockConfig} onUnlock={() => setAppUnlocked(true)} />
  }

  return (
    <div className="min-h-[100dvh] bg-[var(--sk-bg)] flex flex-col">
      <main className={cn('flex-1 overflow-y-auto pb-[182px] md:pb-[118px] md:mb-0')}>
        {activeTab === 'beranda' && <TabBeranda />}
        {activeTab === 'rekapan' && <TabRekapan />}
        {activeTab === 'saku' && <TabSaku />}
        {activeTab === 'profil' && <TabProfil />}
      </main>

      <div className="fixed bottom-[62px] left-3 right-3 z-30 rounded-[28px] border border-[var(--sk-border-2)] bg-[color-mix(in_srgb,var(--sk-surface)_92%,transparent)] shadow-[0_18px_40px_rgba(0,0,0,0.22)] backdrop-blur-xl safe-bottom md:bottom-5 md:left-[96px] md:right-6 md:max-w-[560px]">
        <div className="px-3 py-2 md:px-4">
          <SmartInput
            onSubmit={addTransaction}
            isSubmitting={isSubmitting}
            parserExtras={parserExtras}
          />
        </div>
      </div>

      <nav
        aria-label="Navigasi utama"
        className="fixed bottom-0 left-0 right-0 z-40 sk-glass border-t border-[var(--sk-border-2)] safe-bottom md:hidden"
      >
        <div className="flex items-stretch h-[58px]">
          {TABS.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                aria-label={tab.label}
                className={cn(
                  'flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors duration-150',
                  isActive ? 'text-[var(--sk-cyan)]' : 'text-[var(--sk-text-dim)]'
                )}
              >
                <Icon className="w-5 h-5" />
                <span
                  className={cn(
                    'text-[10px] font-medium transition-opacity',
                    isActive ? 'opacity-100' : 'opacity-60'
                  )}
                >
                  {tab.label}
                </span>
              </button>
            )
          })}
        </div>
      </nav>

      <nav
        aria-label="Navigasi utama"
        className="hidden md:flex fixed left-0 top-0 bottom-0 z-40 w-[72px] flex-col items-center py-6 gap-2 sk-glass border-r border-[var(--sk-border-2)]"
      >
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[var(--sk-cyan)] shadow-[0_0_20px_var(--sk-cyan-glow)] mb-4">
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-[#0B0F19]" aria-hidden>
            <path d="M13 3L4 14h7l-1 7 9-11h-7l1-7z" />
          </svg>
        </div>
        {TABS.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={tab.label}
              title={tab.label}
              className={cn(
                'w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all duration-150',
                isActive
                  ? 'bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)]'
                  : 'text-[var(--sk-text-dim)] hover:bg-[var(--sk-surface-2)] hover:text-[var(--sk-text-muted)]'
              )}
            >
              <Icon className="w-5 h-5" />
            </button>
          )
        })}
      </nav>

      <OnboardingTour userId={user.email} onNavigate={switchTab} />

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed z-50 animate-slide-up top-4 left-4 right-4 md:top-auto md:bottom-[104px] md:left-auto md:right-6 md:w-auto"
        >
          <div
            className={cn(
              'flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium border backdrop-blur-xl',
              toast.type === 'success'
                ? 'bg-[var(--sk-green-dim)] border-[rgba(52,211,153,0.3)] text-[var(--sk-green)]'
                : 'bg-[var(--sk-red-dim)] border-[rgba(248,113,113,0.3)] text-[var(--sk-red)]'
            )}
          >
            <span
              className={cn(
                'inline-block w-2 h-2 rounded-full flex-shrink-0',
                toast.type === 'success' ? 'bg-[var(--sk-green)]' : 'bg-[var(--sk-red)]'
              )}
            />
            <span className="min-w-0 flex-1">{toast.text}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  dismissToast()
                  toast.action?.onClick()
                }}
                className="min-h-8 px-2.5 rounded-lg bg-white/10 text-[11px] font-bold uppercase tracking-wide"
              >
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={dismissToast}
              aria-label="Tutup notifikasi"
              className="w-8 h-8 -mr-1 rounded-lg flex items-center justify-center text-current opacity-70 hover:opacity-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Page() {
  return <AppShell />
}
