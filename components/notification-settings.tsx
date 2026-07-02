'use client'

import { useEffect, useState } from 'react'
import { BellRing } from 'lucide-react'
import { rescheduleNotifications } from '@/lib/cron'
import {
  DEFAULT_NOTIF_PREFS,
  getPermission,
  isNativeRuntime,
  requestPermission,
  type PermState,
} from '@/lib/notifications'
import { useBudgetStore, useFeedbackStore, useTransactionData } from '@/lib/store'

export function NotificationSettings() {
  const { showToast } = useFeedbackStore()
  const { transactions } = useTransactionData()
  const { monthlyBudget } = useBudgetStore()
  const [mounted, setMounted] = useState(false)
  const [native, setNative] = useState(false)
  const [permission, setPermission] = useState<PermState>('unsupported')

  useEffect(() => {
    setMounted(true)

    const inNativeApp = isNativeRuntime()
    setNative(inNativeApp)

    if (!inNativeApp) return

    getPermission()
      .then((state) => {
        setPermission(state)
        if (state === 'granted') {
          rescheduleNotifications({ transactions, monthlyBudget })
        }
      })
      .catch(() => setPermission('unsupported'))
  }, [transactions, monthlyBudget])

  function handleRequestPermission() {
    requestPermission()
      .then((state) => {
        setPermission(state)
        if (state === 'granted') {
          rescheduleNotifications({ transactions, monthlyBudget })
          showToast('Notifikasi otomatis aktif tiap hari jam 20:00.', 'success')
        } else if (state === 'denied') {
          showToast('Izin notifikasi ditolak. Android tetap bisa memblokir notifikasi.', 'error')
        }
      })
      .catch(() => {
        showToast('Gagal meminta izin notifikasi.', 'error')
      })
  }

  const statusText =
    permission === 'granted'
      ? 'Aktif otomatis tiap hari jam 20:00'
      : permission === 'denied'
        ? 'Butuh izin Android untuk bisa tampil'
        : 'Aplikasi akan mengaktifkan notifikasi otomatis saat izin diberikan'

  return (
    <section data-tour="notif-settings">
      <div className="rounded-xl bg-[var(--sk-surface)] border border-[var(--sk-border)] px-3.5 py-3">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-[var(--sk-cyan-dim)] flex items-center justify-center flex-shrink-0">
            <BellRing className="w-5 h-5 text-[var(--sk-cyan)]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-[var(--sk-text)] leading-tight">Notifikasi otomatis</p>
              <div className="px-2 py-0.5 rounded-full bg-[var(--sk-cyan-dim)] text-[10px] font-semibold text-[var(--sk-cyan)]">
                20:00
              </div>
            </div>
            <p className="text-[11px] text-[var(--sk-text-dim)] mt-1 leading-relaxed">{statusText}</p>

            {mounted && native && permission !== 'granted' && (
              <button
                type="button"
                onClick={handleRequestPermission}
                className="mt-2 h-7 px-3 rounded-lg bg-[var(--sk-amber)] text-[11px] font-bold text-[#0B0F19] inline-flex items-center"
              >
                Izinkan notifikasi
              </button>
            )}

            {mounted && !native && (
              <p className="text-[10px] text-[var(--sk-text-muted)] mt-1.5 leading-relaxed">
                Preview web saja. Di APK, pengingat aktif otomatis setiap hari jam {String(DEFAULT_NOTIF_PREFS.hour).padStart(2, '0')}:
                {String(DEFAULT_NOTIF_PREFS.minute).padStart(2, '0')}.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
