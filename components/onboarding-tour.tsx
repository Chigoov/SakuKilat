'use client'

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BarChart2,
  Bell,
  BookOpen,
  Check,
  PenLine,
  Repeat,
  Sparkles,
  Trophy,
  Wallet,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { appScopedKey } from '@/lib/app-variant'

type TourTab = 'beranda' | 'saku' | 'rekapan' | 'profil'

const ONBOARDING_VERSION = 10
const ONBOARDING_KEY_PREFIX = appScopedKey(`onboarding-completed-v${ONBOARDING_VERSION}`)

interface Slide {
  icon: React.ComponentType<{ className?: string }>
  iconColor: string
  iconBg: string
  title: string
  body: string
  action: string
  tab: TourTab
  target: string
}

const SLIDES: Slide[] = [
  {
    icon: Sparkles,
    iconColor: 'text-[var(--sk-cyan)]',
    iconBg: 'bg-[var(--sk-cyan-dim)]',
    title: 'Input cepat',
    body: 'Kolom bawah membaca kalimat singkat seperti "kopi 18k gopay" atau "gaji 6jt bca". Sistem akan menebak nominal, tipe, kategori, dan saku.',
    action: 'Pakai format: nama transaksi + nominal + saku. Contoh aman: "makan 25rb cash".',
    tab: 'beranda',
    target: 'smart-input',
  },
  {
    icon: PenLine,
    iconColor: 'text-[var(--sk-amber)]',
    iconBg: 'bg-[var(--sk-amber-dim)]',
    title: 'Catat manual',
    body: 'Tombol ini membuka form lengkap untuk memilih pemasukan atau pengeluaran, saku, kategori, tanggal, dan deskripsi sendiri.',
    action: 'Pakai ini kalau input cepat tidak cocok, atau saat kamu ingin isi data lebih detail.',
    tab: 'beranda',
    target: 'manual-entry',
  },
  {
    icon: Wallet,
    iconColor: 'text-[var(--sk-green)]',
    iconBg: 'bg-[var(--sk-green-dim)]',
    title: 'Saku uang',
    body: 'Di tab Saku kamu bisa melihat saldo tiap saku, menambah saku baru, edit nama saku, dan cek total uang tersimpan.',
    action: 'Pastikan nama saku sesuai kebiasaanmu, misalnya Cash, BCA, GoPay, atau Dana.',
    tab: 'saku',
    target: 'wallets',
  },
  {
    icon: Repeat,
    iconColor: 'text-[var(--sk-green)]',
    iconBg: 'bg-[var(--sk-green-dim)]',
    title: 'Transaksi otomatis',
    body: 'Bagian ini cocok untuk gaji, langganan, cicilan, atau tagihan bulanan. Isi dengan kalimat transaksi lengkap, bukan cuma judul.',
    action: 'Contoh: "netflix 54rb bca" atau "gaji 6,5jt bca". Tombol petir artinya catat sekarang.',
    tab: 'saku',
    target: 'recurring',
  },
  {
    icon: BarChart2,
    iconColor: 'text-[var(--sk-cyan)]',
    iconBg: 'bg-[var(--sk-cyan-dim)]',
    title: 'Rekapan',
    body: 'Di sini kamu bisa melihat history, kalender, tren, dan detail kategori pengeluaran atau pemasukan.',
    action: 'Cara tercepat cek detail kategori: buka Rekapan lalu tekan kartu Total keluar atau Total masuk.',
    tab: 'rekapan',
    target: 'rekapan-tabs',
  },
  {
    icon: Bell,
    iconColor: 'text-[var(--sk-cyan)]',
    iconBg: 'bg-[var(--sk-cyan-dim)]',
    title: 'Notifikasi',
    body: 'Lonceng ini mengingatkanmu saat streak hampir putus, budget menipis, atau goal hampir tercapai.',
    action: 'Tap lonceng di pojok kanan atas Beranda kapan saja.',
    tab: 'beranda',
    target: 'notif-bell',
  },
  {
    icon: Trophy,
    iconColor: 'text-[var(--sk-amber)]',
    iconBg: 'bg-[var(--sk-amber-dim)]',
    title: 'Streak & Trofi',
    body: 'Kalau kamu rutin mencatat, streak akan naik dan trofi akan terbuka sedikit demi sedikit.',
    action: 'Cek bagian ini di Profil untuk lihat progres kebiasaanmu.',
    tab: 'profil',
    target: 'streak-card',
  },
  {
    icon: BookOpen,
    iconColor: 'text-[var(--sk-cyan)]',
    iconBg: 'bg-[var(--sk-cyan-dim)]',
    title: 'Buku Panduan',
    body: 'Kalau masih bingung, buka Buku Panduan di Profil. Di sana ada penjelasan yang lebih lengkap dan santai.',
    action: 'Panduan awal ini cuma ringkas. Buku Panduan cocok buat belajar pelan-pelan.',
    tab: 'profil',
    target: 'guide-button',
  },
]

function storageKey(userId?: string | null): string {
  return `${ONBOARDING_KEY_PREFIX}:${encodeURIComponent(userId || 'local')}`
}

function readCompleted(userId?: string | null): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(storageKey(userId)) === '1'
  } catch {
    return true
  }
}

function writeCompleted(userId?: string | null): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey(userId), '1')
  } catch {
    /* localStorage can be blocked in private mode */
  }
}

export const OnboardingTour = memo(function OnboardingTour({
  userId,
  onNavigate,
}: {
  userId?: string | null
  onNavigate?: (tab: TourTab) => void
}) {
  const [resolved, setResolved] = useState<boolean | null>(null)
  const [index, setIndex] = useState(0)
  const [closing, setClosing] = useState(false)
  const [highlight, setHighlight] = useState<{ top: number; left: number; width: number; height: number } | null>(
    null,
  )

  useEffect(() => {
    setResolved(readCompleted(userId))
  }, [userId])

  const total = SLIDES.length
  const slide = SLIDES[index]
  const isFirst = index === 0
  const isLast = index === total - 1
  const Icon = useMemo(() => slide.icon, [slide.icon])

  const updateHighlight = useCallback(() => {
    const candidates = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${slide.target}"]`))
    const target =
      candidates.find((element) => {
        const rect = element.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      }) ??
      candidates[0] ??
      null

    if (!target) {
      setHighlight(null)
      return
    }

    target.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
    window.requestAnimationFrame(() => {
      const rect = target.getBoundingClientRect()
      const pad = 8
      setHighlight({
        top: Math.max(8, rect.top - pad),
        left: Math.max(8, rect.left - pad),
        width: Math.min(window.innerWidth - 16, rect.width + pad * 2),
        height: Math.min(window.innerHeight - 16, rect.height + pad * 2),
      })
    })
  }, [slide.target])

  useEffect(() => {
    if (resolved !== false) return
    onNavigate?.(slide.tab)
    const timers = [180, 520, 900].map((delay) => window.setTimeout(updateHighlight, delay))
    window.addEventListener('resize', updateHighlight)
    window.addEventListener('scroll', updateHighlight, true)
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
      window.removeEventListener('resize', updateHighlight)
      window.removeEventListener('scroll', updateHighlight, true)
    }
  }, [onNavigate, resolved, slide.tab, updateHighlight])

  const finish = useCallback(() => {
    writeCompleted(userId)
    setClosing(true)
    window.setTimeout(() => setResolved(true), 180)
  }, [userId])

  const next = useCallback(() => {
    if (isLast) {
      finish()
      return
    }
    setIndex((value) => Math.min(total - 1, value + 1))
  }, [finish, isLast, total])

  const prev = useCallback(() => {
    if (!isFirst) setIndex((value) => Math.max(0, value - 1))
  }, [isFirst])

  useEffect(() => {
    if (resolved !== false) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') next()
      if (event.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [next, prev, resolved])

  useEffect(() => {
    if (resolved !== false) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [resolved])

  if (resolved !== false) return null

  const panelTop = highlight ? highlight.top > window.innerHeight * 0.45 : false

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sk-onboarding-title"
      className={cn('fixed inset-0 z-[100] transition-opacity duration-200', closing ? 'opacity-0' : 'opacity-100')}
    >
      {!highlight && <div className="absolute inset-0 bg-[rgba(9,13,22,0.82)]" />}

      {highlight && (
        <div
          aria-hidden
          className="fixed rounded-2xl border-2 border-[var(--sk-cyan)] shadow-[0_0_0_9999px_rgba(9,13,22,0.78),0_0_28px_var(--sk-cyan-glow)] animate-pulse-soft transition-all duration-300"
          style={{
            top: highlight.top,
            left: highlight.left,
            width: highlight.width,
            height: highlight.height,
          }}
        />
      )}

      <div
        className={cn(
          'fixed left-4 right-4 mx-auto max-w-sm rounded-2xl border border-[var(--sk-border-2)] bg-[var(--sk-surface)] p-4 shadow-2xl',
          'transition-transform duration-200',
          panelTop ? 'top-4' : 'bottom-4',
          closing ? 'scale-95' : 'scale-100',
        )}
      >
        <div className="flex items-start gap-3">
          <div className={cn('h-11 w-11 flex-shrink-0 rounded-xl flex items-center justify-center', slide.iconBg)}>
            <Icon className={cn('h-5 w-5', slide.iconColor)} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--sk-text-dim)]">
              Panduan {index + 1}/{total}
            </p>
            <h2 id="sk-onboarding-title" className="text-lg font-bold leading-tight text-[var(--sk-text)]">
              {slide.title}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-[var(--sk-text-muted)]">{slide.body}</p>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-[var(--sk-border)] bg-[var(--sk-surface-2)] px-3 py-2 text-xs leading-relaxed text-[var(--sk-cyan)]">
          {slide.action}
        </div>

        <div className="my-4 flex items-center justify-center gap-1.5" aria-hidden>
          {SLIDES.map((_, slideIndex) => (
            <span
              key={slideIndex}
              className={cn(
                'h-1.5 rounded-full transition-all duration-200',
                slideIndex === index ? 'w-6 bg-[var(--sk-cyan)]' : 'w-1.5 bg-[var(--sk-border-2)]',
              )}
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={prev}
            disabled={isFirst}
            aria-label="Sebelumnya"
            className={cn(
              'h-11 w-11 rounded-xl flex items-center justify-center transition-colors',
              isFirst
                ? 'cursor-not-allowed text-[var(--sk-text-dim)] opacity-40'
                : 'text-[var(--sk-text-muted)] hover:bg-[var(--sk-surface-2)] hover:text-[var(--sk-text)]',
            )}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={next}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--sk-cyan)] text-sm font-semibold text-[var(--sk-bg)] transition-opacity hover:opacity-90"
          >
            {isLast ? (
              <>
                <Check className="h-4 w-4" />
                Mulai pakai
              </>
            ) : (
              <>
                Lanjut
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
})
