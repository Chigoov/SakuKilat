'use client'

/**
 * SakuKilat — Penjadwal Rollover Harian (cron lokal)
 * --------------------------------------------------------------------------
 * Orkestrasi efek samping di atas logika murni `lib/historical-achievements.ts`.
 * - `runDailyRollover()` mengevaluasi flag historis lalu menyalakannya via
 *   `setFlag` (monoton/idempoten) — hanya sekali per hari kalender.
 * - `useDailyRollover()` memicu rollover saat mount, saat lewat tengah malam
 *   (timer best-effort), dan saat tab kembali terlihat (`visibilitychange`).
 *
 * Prinsip "jangan gagal diam-diam" tetap dijaga: seluruh alur dibungkus
 * try/catch sehingga kegagalan rollover TIDAK PERNAH mengganggu boot aplikasi
 * (Req 4.7). Semua akses `window`/`localStorage` diberi guard SSR.
 */

import { useEffect, useRef } from 'react'

import { readGoalSnapshot } from '@/components/goal-tracker'
import { setFlag } from './achievements'
import {
  dayKey,
  evaluateHistoricalFlags,
  needsRollover,
} from './historical-achievements'
import type { Transaction } from './mock-data'
import { buildNotificationPlan } from './notification-plan'
import { applyDailyReminder, applyScheduledPlan, cancelDailyReminder, cancelScheduledPlan, loadNotifPrefs } from './notifications'
import { useBudgetStore, usePreferenceStore, useTransactionData } from './store'

/** Tanggal evaluasi rollover terakhir, format 'YYYY-MM-DD' lokal. */
export const LAST_ROLLOVER_KEY = 'sakukilat:v2:last-rollover'

interface RolloverInput {
  transactions: Transaction[]
  monthlyBudget: number
  zenMode: boolean
  now?: Date
}

interface RolloverResult {
  ranToday: boolean
  flagsSet: string[]
}

/**
 * Jalankan evaluasi rollover sekali per hari kalender.
 * Idempoten: pemanggilan kedua di hari yang sama → `{ ranToday: false }`.
 * Tidak pernah melempar — pada error apa pun kembalikan hasil "tidak jalan".
 */
export function runDailyRollover(input: RolloverInput): RolloverResult {
  try {
    const now = input.now ?? new Date()

    // Baca tanggal evaluasi terakhir (guard SSR; null bila absen/galat).
    let last: string | null = null
    if (typeof window !== 'undefined') {
      try {
        last = window.localStorage.getItem(LAST_ROLLOVER_KEY)
      } catch {
        last = null
      }
    }

    if (!needsRollover(last, now)) {
      return { ranToday: false, flagsSet: [] }
    }

    const flags = evaluateHistoricalFlags({
      transactions: input.transactions,
      monthlyBudget: input.monthlyBudget,
      zenMode: input.zenMode,
      now,
    })

    // Monoton/idempoten: setFlag hanya menyetel '1', tidak pernah mematikan.
    for (const flag of flags) {
      setFlag(flag)
    }

    // Tandai sudah dievaluasi hari ini supaya tidak jalan berulang.
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(LAST_ROLLOVER_KEY, dayKey(now))
      } catch {
        /* quota — abaikan, rollover berikutnya akan mencoba lagi */
      }
    }

    return { ranToday: true, flagsSet: flags }
  } catch {
    // Totalitas: kegagalan tidak boleh merusak boot aplikasi (Req 4.7).
    return { ranToday: false, flagsSet: [] }
  }
}

interface RescheduleInput {
  transactions: Transaction[]
  monthlyBudget: number
  goals?: { label: string; saved: number; target: number; deadline?: string }[]
  now?: Date
}

/**
 * Hitung ulang & jadwalkan ulang BATCH notifikasi terjadwal (Req 8.1, 8.3).
 *
 * Fire-and-forget: membangun rencana murni via `buildNotificationPlan` dari
 * snapshot terkini lalu menerapkannya ke lapisan native. Di web semua efek
 * native menjadi no-op rapi (lihat lib/notifications.ts), jadi aman dipanggil
 * tanpa syarat. Seluruh badan dibungkus try/catch + guard SSR sehingga TIDAK
 * PERNAH melempar / mengganggu boot (selaras prinsip "jangan gagal diam-diam").
 *
 * - Bila `prefs.enabled` true → `applyScheduledPlan(plan)` (batch baru
 *   menggantikan batch lama; idempoten terhadap snapshot yang sama — Req 8.3).
 * - Bila `prefs.enabled` false → `cancelScheduledPlan()` (Req 8.5).
 * - Goals: pakai `input.goals` bila diberikan; jika tidak, ambil sendiri lewat
 *   `readGoalSnapshot()` (menyentuh localStorage → dibungkus try/catch, fallback []).
 */
export function rescheduleNotifications(input: RescheduleInput): void {
  if (typeof window === 'undefined') return
  try {
    const now = input.now ?? new Date()
    const prefs = loadNotifPrefs()

    // Ambil goals: pakai yang diberikan, atau baca sendiri dari store (defensif).
    let goals: { label: string; saved: number; target: number; deadline?: string }[] = []
    if (input.goals) {
      goals = input.goals
    } else {
      try {
        goals = readGoalSnapshot().map((g) => ({
          label: g.label,
          saved: g.saved,
          target: g.target,
          deadline: g.deadline,
        }))
      } catch {
        // Gagal membaca goal (localStorage) → anggap kosong (best-effort).
        goals = []
      }
    }

    const plan = buildNotificationPlan({
      transactions: input.transactions,
      monthlyBudget: input.monthlyBudget,
      goals,
      prefs,
      now,
    })

    if (prefs.enabled) {
      // Fire-and-forget: jangan blokir; native-guarding ditangani di wrapper.
      void applyDailyReminder(prefs).catch(() => {})
      void applyScheduledPlan(plan).catch(() => {})
    } else {
      // Pengingat nonaktif → bersihkan seluruh batch terjadwal (Req 8.5).
      void cancelDailyReminder().catch(() => {})
      void cancelScheduledPlan().catch(() => {})
    }
  } catch {
    // Totalitas: kegagalan reschedule tidak boleh mengganggu boot aplikasi.
  }
}

/** ms hingga tengah malam lokal berikutnya, + buffer kecil agar tanggal sudah berganti. */
function msUntilNextMidnight(now: Date): number {
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0)
  return Math.max(0, nextMidnight.getTime() - now.getTime()) + 1000
}

/**
 * Hook penjadwal: dipanggil sekali di AppShell.
 * - Jalankan rollover saat mount.
 * - Pasang timer best-effort ke tengah malam berikutnya, lalu reschedule.
 * - Pasang listener `visibilitychange` (cheap karena self-guard via needsRollover).
 * Snapshot data terbaru disimpan di ref supaya callback timer tidak stale.
 */
export function useDailyRollover(): void {
  const { transactions } = useTransactionData()
  const { monthlyBudget } = useBudgetStore()
  const { zenMode } = usePreferenceStore()

  // Ref selalu memuat data terbaru tiap render → callback timer baca data segar.
  const dataRef = useRef({ transactions, monthlyBudget, zenMode })
  dataRef.current = { transactions, monthlyBudget, zenMode }

  useEffect(() => {
    if (typeof window === 'undefined') return

    let timerId: ReturnType<typeof setTimeout> | undefined
    let cancelled = false

    const trigger = () => {
      const snapshot = dataRef.current
      const now = new Date()
      runDailyRollover({
        transactions: snapshot.transactions,
        monthlyBudget: snapshot.monthlyBudget,
        zenMode: snapshot.zenMode,
        now,
      })
      rescheduleNotifications({
        transactions: snapshot.transactions,
        monthlyBudget: snapshot.monthlyBudget,
        now,
      })
    }

    const scheduleNextMidnight = () => {
      if (cancelled) return
      const delay = msUntilNextMidnight(new Date())
      timerId = setTimeout(() => {
        trigger()
        scheduleNextMidnight()
      }, delay)
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') trigger()
    }

    try {
      // 1) Jalankan saat mount.
      trigger()
      // 2) Timer tengah malam best-effort.
      scheduleNextMidnight()
      // 3) Re-cek saat tab kembali terlihat (idempoten/self-guarded).
      document.addEventListener('visibilitychange', handleVisibility)
    } catch {
      /* jangan ganggu boot */
    }

    return () => {
      cancelled = true
      if (timerId !== undefined) clearTimeout(timerId)
      try {
        document.removeEventListener('visibilitychange', handleVisibility)
      } catch {
        /* noop */
      }
    }
    // Mount-only: data segar dibaca lewat dataRef, jadi tak perlu deps data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
