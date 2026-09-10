'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle, Copy, Download, RefreshCw, CheckCircle2, ShieldAlert } from 'lucide-react'
import { resetCorruptState, type LoadResult } from '@/lib/storage'
import { pushBackLayer, removeBackLayer } from '@/lib/back-stack'

interface StorageRecoveryScreenProps {
  loadResult: LoadResult
}

export function StorageRecoveryScreen({ loadResult }: StorageRecoveryScreenProps) {
  const [copied, setCopied] = useState(false)
  const [showConfirmReset, setShowConfirmReset] = useState(false)

  useEffect(() => {
    if (showConfirmReset) {
      pushBackLayer({ id: 'recovery-confirm-reset', type: 'dialog', onClose: () => setShowConfirmReset(false) })
    } else {
      removeBackLayer('recovery-confirm-reset')
    }
    return () => removeBackLayer('recovery-confirm-reset')
  }, [showConfirmReset])

  const isCorrupt = loadResult.status === 'corrupt'
  const isIncompatible = loadResult.status === 'incompatible'
  // For corrupt: use quarantinedRaw. For incompatible: use incompatibleRaw or re-serialize state.
  const rawPayload = isCorrupt
    ? (loadResult.quarantinedRaw || '')
    : (loadResult.incompatibleRaw || (loadResult.state ? JSON.stringify(loadResult.state, null, 2) : ''))

  const handleCopy = async () => {
    if (!rawPayload) return
    try {
      await navigator.clipboard.writeText(rawPayload)
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    } catch {
      // Fallback
    }
  }

  const handleDownload = () => {
    if (!rawPayload) return
    const blob = new Blob([rawPayload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sakukilat-recovery-${Date.now()}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleReset = () => {
    if (typeof window === 'undefined') return
    // Only allow reset for corrupt status — incompatible is blocked
    const success = resetCorruptState(window.localStorage, true, loadResult.status)
    if (success) {
      window.location.reload()
    }
  }

  return (
    <div className="min-h-screen bg-[var(--sk-bg,#090D16)] text-white flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[var(--sk-card,#141A29)] border border-amber-500/30 rounded-2xl p-6 shadow-2xl space-y-6">
        {/* Header Icon */}
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
            {isIncompatible ? <ShieldAlert className="w-8 h-8" /> : <AlertTriangle className="w-8 h-8" />}
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">
              {isIncompatible ? 'Versi Data Tidak Kompatibel' : 'Penyimpanan Rusak Terdeteksi'}
            </h1>
            <p className="text-xs text-amber-400 font-medium">
              Mode Pemulihan Darurat (Aplikasi Dikunci)
            </p>
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-slate-300 leading-relaxed">
          {isIncompatible
            ? `Data lokal menggunakan skema versi ${loadResult.detectedVersion ?? 'baru'} yang tidak didukung oleh versi aplikasi ini. Perbarui aplikasi untuk membuka data ini. Anda dapat mengunduh data mentah sebagai cadangan.`
            : 'Data penyimpanan lokal terdeteksi rusak atau tidak lengkap. Demi menjaga keamanan saldo dan riwayat, aplikasi tidak menerima transaksi baru agar data asli tidak tertimpa.'}
        </p>

        {/* Incompatible: update prompt */}
        {isIncompatible && (
          <div className="bg-blue-950/40 border border-blue-500/30 rounded-xl p-3.5">
            <p className="text-sm text-blue-200 font-medium leading-relaxed">
              💡 Perbarui aplikasi ke versi terbaru untuk membuka data ini tanpa kehilangan apa pun.
            </p>
          </div>
        )}

        {/* Diagnostic info */}
        <div className="bg-slate-900/60 rounded-xl p-3.5 border border-slate-800 space-y-2 text-xs text-slate-400">
          <div className="flex justify-between">
            <span>Status Penyimpanan:</span>
            <span className="font-mono text-amber-400 uppercase font-semibold">{loadResult.status}</span>
          </div>
          {loadResult.error && (
            <div className="flex justify-between">
              <span>Detail Kesalahan:</span>
              <span className="font-mono text-slate-300 truncate max-w-[200px]" title={loadResult.error}>
                {loadResult.error}
              </span>
            </div>
          )}
          {isIncompatible && loadResult.detectedVersion && (
            <div className="flex justify-between">
              <span>Versi Skema Data:</span>
              <span className="font-mono text-slate-300">v{loadResult.detectedVersion}</span>
            </div>
          )}
          {rawPayload ? (
            <div className="flex justify-between">
              <span>Ukuran Data Mentah:</span>
              <span className="font-mono text-slate-300">{rawPayload.length} karakter</span>
            </div>
          ) : null}
          {loadResult.quarantineKey && (
            <div className="flex justify-between">
              <span>Salinan Karantina:</span>
              <span className="text-emerald-400 font-mono text-[11px]">Tersimpan Aman</span>
            </div>
          )}
        </div>

        {/* Recovery Action Buttons */}
        <div className="space-y-2.5 pt-2">
          {rawPayload ? (
            <>
              <button
                type="button"
                onClick={handleCopy}
                className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-sm font-medium transition border border-slate-700"
              >
                {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Tersalin ke Clipboard!' : 'Salin Data Mentah'}</span>
              </button>

              <button
                type="button"
                onClick={handleDownload}
                className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-sm font-medium transition"
              >
                <Download className="w-4 h-4" />
                <span>Unduh Cadangan (.json)</span>
              </button>
            </>
          ) : null}

          {/* Reset button: ONLY for corrupt status, NEVER for incompatible */}
          {isCorrupt && (
            <>
              {!showConfirmReset ? (
                <button
                  type="button"
                  onClick={() => setShowConfirmReset(true)}
                  className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-sm font-medium transition"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Mulai Ulang (Reset Penyimpanan)</span>
                </button>
              ) : (
                <div className="p-3.5 bg-red-950/40 border border-red-500/50 rounded-xl space-y-3">
                  <p className="text-xs text-red-200 leading-relaxed font-medium">
                    ⚠️ PERINGATAN: Reset akan menghapus data yang rusak dari penyimpanan perangkat ini. Pastikan Anda sudah mengunduh data mentah di atas.
                  </p>
                  <div className="flex space-x-2">
                    <button
                      type="button"
                      onClick={handleReset}
                      className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold transition"
                    >
                      Ya, Hapus &amp; Mulai Ulang
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowConfirmReset(false)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

