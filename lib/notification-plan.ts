/**
 * SakuKilat — Perencana Notifikasi Terjadwal (FUNGSI MURNI)
 * --------------------------------------------------------------------------
 * Modul ini SENGAJA murni: tidak menyentuh `window`, tidak memanggil
 * `Date.now()` / `Math.random()` internal — `now` selalu di-inject lewat
 * snapshot. Tujuannya supaya logika "notifikasi apa & kapan" bisa diuji
 * deterministik (Req 8.6) dan dipakai ulang di Node maupun browser.
 *
 * Karena saat aplikasi benar-benar tertutup tidak ada kode yang berjalan,
 * notifikasi HARUS dijadwalkan di muka. Fungsi `buildNotificationPlan`
 * memetakan snapshot kondisi pengguna → daftar notifikasi `{id, title, body, at}`
 * untuk beberapa hari ke depan. Lapisan native (lib/notifications.ts, Task 10)
 * tinggal menjadwalkan tiap entri pada waktu absolut `at`-nya.
 *
 * Prinsip "jangan gagal diam-diam" + totalitas:
 * - prefs nonaktif → kembalikan [] (tidak menjadwalkan apa pun) — Property 8.
 * - `now` invalid / input ekstrem → kembalikan [] / rencana sebagian, tidak
 *   pernah melempar — Property 10.
 * - Semua `at` dijamin > `now`; jumlah dibatasi MAX_SCHEDULED — Property 9.
 * - Saat aktif tapi tak ada kondisi khusus, minimal satu pengingat harian tetap
 *   ada — Property 11.
 *
 * Modul ini aman diimpor di Node (tanpa 'use client') seperti
 * lib/historical-achievements.ts, dan mengandalkan kalkulasi murni dari
 * lib/stats.ts (streakStatus, monthlyBudgetStatus) yang juga node-safe.
 */

import type { Transaction } from './mock-data'
import { streakStatus, monthlyBudgetStatus } from './stats'

// ── Konstanta rentang ID khusus fitur ini (Req 8.4) ───────────────────────────
// ID berurutan mulai SCHEDULED_BASE_ID, dibatasi MAX_SCHEDULED entri (Req 8.9).
// Rentang valid: [SCHEDULED_BASE_ID, SCHEDULED_BASE_ID + MAX_SCHEDULED).
export const SCHEDULED_BASE_ID = 2000
export const MAX_SCHEDULED = 30

export interface NotifSnapshot {
  transactions: Transaction[]
  monthlyBudget: number
  goals: { label: string; saved: number; target: number; deadline?: string }[]
  prefs: { enabled: boolean; hour: number; minute: number }
  now: Date
  horizonDays?: number // default 7
}

export interface PlannedNotification {
  id: number // dalam rentang SCHEDULED_BASE_ID
  title: string
  body: string
  at: Date // waktu absolut munculnya notifikasi (selalu > now)
}

const MS_PER_DAY = 86_400_000
const HORIZON_DEFAULT = 7
const HORIZON_MIN = 1
const HORIZON_MAX = 14
// Batas wajar jumlah notifikasi tenggat goal supaya tidak membanjiri batch.
const MAX_GOAL_NOTIFS = 5
// Jam tetap untuk notifikasi non-harian (netral, tidak mengganggu).
const STREAK_HOUR = 20
const STREAK_MINUTE = 30
const MORNING_HOUR = 9
const MORNING_MINUTE = 0

// Tier prioritas saat memangkas overflow (Req 8.9):
// streak > budget > goal > pengingat harian "ekstra". Pengingat harian PERTAMA
// selalu dipertahankan (Property 11) terlepas dari tier.
const TIER_STREAK = 0
const TIER_BUDGET = 1
const TIER_GOAL = 2
const TIER_DAILY = 3

interface Candidate {
  tier: number
  at: Date
  title: string
  body: string
}

// ── Helper murni ──────────────────────────────────────────────────────────────
function isValidDate(d: unknown): d is Date {
  return d instanceof Date && !Number.isNaN(d.getTime())
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}

/** Jam:menit "aman" dalam 0..23 / 0..59 (defensif terhadap prefs rusak). */
function safeHour(h: number): number {
  return Number.isFinite(h) ? clamp(Math.floor(h), 0, 23) : 20
}
function safeMinute(m: number): number {
  return Number.isFinite(m) ? clamp(Math.floor(m), 0, 59) : 0
}

/** Awal hari kalender lokal dari sebuah tanggal. */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Tanggal pada (now + dayOffset hari) dengan jam:menit tertentu. */
function dateAtDayOffset(now: Date, dayOffset: number, hour: number, minute: number): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, hour, minute, 0, 0)
}

/** Kemunculan berikutnya dari jam:menit yang STRICTLY > now (hari ini / besok). */
function nextOccurrence(now: Date, hour: number, minute: number): Date {
  const today = dateAtDayOffset(now, 0, hour, minute)
  return today.getTime() > now.getTime() ? today : dateAtDayOffset(now, 1, hour, minute)
}

/** Selisih hari kalender (deadline - hari ini); null bila tanggal tak valid. */
function daysUntilDeadline(deadline: string, now: Date): number | null {
  const target = new Date(deadline)
  if (!isValidDate(target)) return null
  const today = startOfDay(now).getTime()
  const goalDay = startOfDay(target).getTime()
  return Math.round((goalDay - today) / MS_PER_DAY)
}

/**
 * Petakan snapshot kondisi pengguna → daftar notifikasi terjadwal untuk N hari
 * ke depan. Murni & deterministik (hanya bergantung pada `snap`, termasuk `now`).
 */
export function buildNotificationPlan(snap: NotifSnapshot): PlannedNotification[] {
  try {
    // Property 8: nonaktif → tidak menjadwalkan apa pun.
    if (!snap || !snap.prefs || snap.prefs.enabled !== true) return []

    const now = snap.now
    // Totalitas: now invalid → rencana kosong (bukan exception).
    if (!isValidDate(now)) return []
    const nowMs = now.getTime()

    const hour = safeHour(snap.prefs.hour)
    const minute = safeMinute(snap.prefs.minute)
    const horizon = clamp(snap.horizonDays ?? HORIZON_DEFAULT, HORIZON_MIN, HORIZON_MAX)
    const transactions = Array.isArray(snap.transactions) ? snap.transactions : []

    // Kandidat terpisah per kategori; perakitan & pemangkasan dilakukan di akhir.
    const dailyCandidates: Candidate[] = []
    const otherCandidates: Candidate[] = []

    // ── 1) Pengingat harian (Req 8.2) ────────────────────────────────────────
    // Hari ini (offset 0) hanya bila jam target masih di depan `now`; hari 1..H
    // selalu di masa depan.
    try {
      const dailyTitle = 'Waktunya catat keuangan'
      const dailyBody = 'Luangkan 10 detik buat catat pengeluaran hari ini ⚡'
      const todayReminder = dateAtDayOffset(now, 0, hour, minute)
      if (todayReminder.getTime() > nowMs) {
        dailyCandidates.push({ tier: TIER_DAILY, at: todayReminder, title: dailyTitle, body: dailyBody })
      }
      for (let d = 1; d <= horizon; d++) {
        const at = dateAtDayOffset(now, d, hour, minute)
        if (at.getTime() > nowMs) {
          dailyCandidates.push({ tier: TIER_DAILY, at, title: dailyTitle, body: dailyBody })
        }
      }
    } catch {
      /* abaikan — pengingat harian best-effort */
    }

    // ── 2) Streak berisiko (Req 8.2) ──────────────────────────────────────────
    // Bila punya streak berjalan & belum mencatat di hari snapshot, ingatkan
    // (sore/malam hari ini, atau besok bila jamnya sudah lewat).
    try {
      const streak = streakStatus(transactions, now)
      if (streak.current > 0 && !streak.loggedToday) {
        const at = nextOccurrence(now, STREAK_HOUR, STREAK_MINUTE)
        otherCandidates.push({
          tier: TIER_STREAK,
          at,
          title: 'Jaga streak-mu',
          body: `Streak ${streak.current} hari jangan putus. Catat 1 transaksi hari ini ya.`,
        })
      }
    } catch {
      /* abaikan — streak best-effort */
    }

    // ── 3) Budget menipis / terlewat (Req 8.2) ────────────────────────────────
    // Hanya bila budget bulanan > 0. Dijadwalkan keesokan pagi (~09:00) sekali.
    try {
      if (Number.isFinite(snap.monthlyBudget) && snap.monthlyBudget > 0) {
        const status = monthlyBudgetStatus(transactions, snap.monthlyBudget, now)
        const pct = Number.isFinite(status.pctUsed) ? status.pctUsed : 0
        if (pct >= 1) {
          otherCandidates.push({
            tier: TIER_BUDGET,
            at: nextOccurrence(now, MORNING_HOUR, MORNING_MINUTE),
            title: 'Budget bulan ini terlewat',
            body: 'Pemakaian sudah melewati budget bulan ini. Yuk rem pengeluaran sampai akhir bulan.',
          })
        } else if (pct >= 0.8) {
          const persen = Math.round(pct * 100)
          otherCandidates.push({
            tier: TIER_BUDGET,
            at: nextOccurrence(now, MORNING_HOUR, MORNING_MINUTE),
            title: 'Budget tinggal sedikit',
            body: `Budget bulan ini sudah terpakai ${persen}%. Sisanya dijaga ya.`,
          })
        }
      }
    } catch {
      /* abaikan — budget best-effort */
    }

    // ── 4) Tenggat goal mendekat (Req 8.2) ────────────────────────────────────
    // Goal dengan deadline ≤3 hari (0..3 inklusif) dan belum tercapai.
    try {
      const goals = Array.isArray(snap.goals) ? snap.goals : []
      let goalCount = 0
      for (const goal of goals) {
        if (goalCount >= MAX_GOAL_NOTIFS) break
        if (!goal || typeof goal.deadline !== 'string') continue
        const saved = Number.isFinite(goal.saved) ? goal.saved : 0
        const target = Number.isFinite(goal.target) ? goal.target : 0
        if (target <= 0 || saved >= target) continue // sudah tercapai / target invalid
        const n = daysUntilDeadline(goal.deadline, now)
        if (n === null || n < 0 || n > 3) continue
        const label = typeof goal.label === 'string' && goal.label.trim() ? goal.label.trim() : 'tabungan'
        otherCandidates.push({
          tier: TIER_GOAL,
          at: nextOccurrence(now, MORNING_HOUR, MORNING_MINUTE),
          title: `Tenggat goal ${label} mendekat`,
          body: n === 0
            ? `Tenggat goal "${label}" hari ini. Sisihkan sedikit lagi yuk.`
            : `Tenggat goal "${label}" tinggal ${n} hari. Sisihkan sedikit lagi yuk.`,
        })
        goalCount++
      }
    } catch {
      /* abaikan — goal best-effort */
    }

    // ── 5) Perakitan & pemangkasan (Req 8.9, Property 9 & 11) ─────────────────
    // Urutkan pengingat harian by waktu agar "yang pertama" deterministik.
    const dailies = dailyCandidates
      .filter((c) => c.at.getTime() > nowMs)
      .sort((a, b) => a.at.getTime() - b.at.getTime())

    const selected: Candidate[] = []

    // Jaminan: minimal satu pengingat harian bila ada (Property 11).
    if (dailies.length > 0) selected.push(dailies[0])

    // Sisanya diisi sesuai prioritas: streak > budget > goal > pengingat ekstra.
    const prioritized = [
      ...otherCandidates.filter((c) => c.at.getTime() > nowMs),
      ...dailies.slice(1),
    ].sort((a, b) => a.tier - b.tier)

    for (const c of prioritized) {
      if (selected.length >= MAX_SCHEDULED) break
      selected.push(c)
    }

    // Urutkan hasil akhir by waktu, lalu beri ID berurutan dari SCHEDULED_BASE_ID.
    selected.sort((a, b) => a.at.getTime() - b.at.getTime())

    return selected.map((c, i) => ({
      id: SCHEDULED_BASE_ID + i,
      title: c.title,
      body: c.body,
      at: c.at,
    }))
  } catch {
    // Totalitas: apa pun yang gagal → rencana kosong (jangan ganggu boot/app).
    return []
  }
}
