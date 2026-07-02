'use client'

/**
 * Route-level error boundary. Menangkap exception render/runtime di seluruh
 * pohon halaman sehingga satu komponen yang gagal tidak memutihkan aplikasi.
 */
import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[SakuKilat] Render error:', error)
  }, [error])

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[var(--sk-bg)] px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--sk-red-dim)] text-[var(--sk-red)]">
        <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current" aria-hidden>
          <path d="M12 2 1 21h22L12 2zm0 6 6.5 11h-13L12 8zm-1 4v3h2v-3h-2zm0 4v2h2v-2h-2z" />
        </svg>
      </div>
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-[var(--sk-text)]">Ada yang error sebentar.</h2>
        <p className="text-sm text-[var(--sk-text-muted)]">
          Datamu aman tersimpan di perangkat ini. Coba muat ulang halaman.
        </p>
      </div>
      <button
        type="button"
        onClick={reset}
        className="min-h-10 rounded-xl bg-[var(--sk-cyan)] px-5 text-sm font-bold text-[#090D16] shadow-[0_0_20px_var(--sk-cyan-glow)]"
      >
        Coba lagi
      </button>
    </div>
  )
}
