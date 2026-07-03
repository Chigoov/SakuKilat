'use client'

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, BarChart2, Bell, BookOpen, Check, PenLine, Repeat, Sparkles, Trophy, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'

type TourTab = 'beranda' | 'saku' | 'rekapan' | 'profil'

const ONBOARDING_VERSION = 9
const ONBOARDING_KEY_PREFIX = `sakukilat:v2:onboarding-completed-v${ONBOARDING_VERSION}`

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
    title: 'Catat otomatis',
    body: 'Area bawah ini membaca kalimat seperti "kopi 18k gopay" dan langsung menebak nominal, kategori, serta saku.',
    action: 'Coba nanti ketik transaksi singkat di kolom yang disorot.',
    tab: 'beranda',
    target: 'smart-input',
  },
  {
    icon: PenLine,
    iconColor: 'text-[var(--sk-amber)]',
    iconBg: 'bg-[var(--sk-amber-dim)]',
    title: 'Catat manual',
    body: 'Tombol ini membuka form lengkap untuk memilih tipe, dompet, kategori, tanggal, dan deskripsi sendiri.',
    action: 'Pakai ini untuk transaksi hari kemarin, besok, atau catatan yang butuh detail.',
    tab: 'beranda',
    target: 'manual-entry',
  },
  {
    icon: Wallet,
    iconColor: 'text-[var(--sk-green)]',
    iconBg: 'bg-[var(--sk-green-dim)]',
    title: 'Saku uang',
    body: 'Di sini kamu melihat total uang tersimpan, beberapa saku utama, dan tombol untuk membuka semua saku.',
    action: 'Buka semua saku kalau ingin cek saldo dompet satu per satu.',
    tab: 'saku',
    target: 'wallets',
  },
  {
    icon: BarChart2,
    iconColor: 'text-[var(--sk-cyan)]',
    iconBg: 'bg-[var(--sk-cyan-dim)]',
    title: 'Rekapan',
    body: 'Di sini kamu bisa pindah antara mode mingguan dan bulanan, lalu buka rincian kategori masuk atau keluar.',
    action: 'Mulai dari kartu Masuk atau Keluar untuk masuk ke detail kategori lebih cepat.',
    tab: 'rekapan',
    target: 'rekapan-tabs',
  },
  {
    icon: Repeat,
    iconColor: 'text-[var(--sk-green)]',
    iconBg: 'bg-[var(--sk-green-dim)]',
    title: 'Pindah data',
    body: 'Bagian ini untuk backup JSON, ekspor CSV, dan impor data dari SakuKilat atau aplikasi lain.',
    action: 'Backup JSON paling aman untuk memindahkan semua data lokal.',
    tab: 'profil',
    target: 'data-portability',
  },
  {
    icon: Trophy,
    iconColor: 'text-[var(--sk-amber)]',
    iconBg: 'bg-[var(--sk-amber-dim)]',
    title: 'Streak & Trofi',
    body: 'Catat tiap hari untuk menjaga streak dan 5 nyawa. Kebiasaan baikmu membuka lencana di Etalase Trofi.',
    action: 'Bagian ini di tab Profil — pantau nyawa, rekor streak, dan koleksi lencanamu.',
    tab: 'profil',
    target: 'streak-card',
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
    icon: BookOpen,
    iconColor: 'text-[var(--sk-cyan)]',
    iconBg: 'bg-[var(--sk-cyan-dim)]',
    title: 'Buku Panduan',
    body: 'Masih bingung? Tombol ini membuka Buku Panduan lengkap. Semua fitur dijelaskan pakai bahasa yang gampang.',
    action: 'Ada di tab Profil. Baca kapan saja, sesantai kamu.',
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
  const [highlight, setHighlight] = useState<{ top: number; left: number; width: number; height: number } | null>(null)

  useEffect(() => {
    setResolved(readCompleted(userId))
  }, [userId])

  const total = SLIDES.length
  const slide = SLIDES[index]
  const isFirst = index === 0
  const isLast = index === total - 1
  const Icon = useMemo(() => slide.icon, [slide.icon])

  const updateHighlight = useCallback(() => {
    // Beberapa anchor (mis. lonceng) ada di header desktop & mobile sekaligus —
    // salah satunya tersembunyi (display:none). Pilih yang benar-benar terlihat.
    const candidates = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${slide.target}"]`))
    const target = candidates.find(el => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    }) ?? candidates[0] ?? null
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
    const timers = [180, 520, 900].map(delay => window.setTimeout(updateHighlight, delay))
    window.addEventListener('resize', updateHighlight)
    window.addEventListener('scroll', updateHighlight, true)
    return () => {
      timers.forEach(timer => window.clearTimeout(timer))
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
    setIndex(value => Math.min(total - 1, value + 1))
  }, [finish, isLast, total])

  const prev = useCallback(() => {
    if (!isFirst) setIndex(value => Math.max(0, value - 1))
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
    return () => { document.body.style.overflow = prevOverflow }
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
          'fixed left-4 right-4 mx-auto max-w-sm rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border-2)] p-4 shadow-2xl',
          'transition-transform duration-200',
          panelTop ? 'top-4' : 'bottom-4',
          closing ? 'scale-95' : 'scale-100'
        )}
      >
        <div className="flex items-start gap-3">
          <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0', slide.iconBg)}>
            <Icon className={cn('w-5 h-5', slide.iconColor)} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-[var(--sk-text-dim)] uppercase tracking-widest mb-1">
              Panduan {index + 1}/{total}
            </p>
            <h2 id="sk-onboarding-title" className="text-lg font-bold text-[var(--sk-text)] leading-tight">
              {slide.title}
            </h2>
            <p className="text-sm text-[var(--sk-text-muted)] leading-relaxed mt-1">
              {slide.body}
            </p>
          </div>
        </div>

        <div className="mt-3 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] px-3 py-2 text-xs text-[var(--sk-cyan)] leading-relaxed">
          {slide.action}
        </div>

        <div className="flex items-center justify-center gap-1.5 my-4" aria-hidden>
          {SLIDES.map((_, slideIndex) => (
            <span
              key={slideIndex}
              className={cn(
                'h-1.5 rounded-full transition-all duration-200',
                slideIndex === index ? 'w-6 bg-[var(--sk-cyan)]' : 'w-1.5 bg-[var(--sk-border-2)]'
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
              'w-11 h-11 rounded-xl flex items-center justify-center transition-colors',
              isFirst
                ? 'text-[var(--sk-text-dim)] opacity-40 cursor-not-allowed'
                : 'text-[var(--sk-text-muted)] hover:text-[var(--sk-text)] hover:bg-[var(--sk-surface-2)]'
            )}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={next}
            className="flex-1 h-11 rounded-xl flex items-center justify-center gap-2 bg-[var(--sk-cyan)] text-[var(--sk-bg)] font-semibold text-sm hover:opacity-90 transition-opacity"
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
    </div>
  )
})
