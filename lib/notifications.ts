'use client'

import { Capacitor } from '@capacitor/core'
import type { PlannedNotification } from './notification-plan'
import { SCHEDULED_BASE_ID, MAX_SCHEDULED } from './notification-plan'

export interface NotifPrefs {
  enabled: boolean
  hour: number
  minute: number
}

export const NOTIF_PREFS_KEY = 'sakukilat:v2:notif-prefs'
// ponytail: app-controlled reminder, expose per-user settings again only if
// product direction changes later.
export const DEFAULT_NOTIF_PREFS: NotifPrefs = { enabled: true, hour: 20, minute: 0 }

const DAILY_REMINDER_ID = 1001
const SCHEDULED_ID_RANGE = 100

function clampHour(h: unknown): number {
  const n = Math.floor(Number(h))
  if (!Number.isFinite(n)) return DEFAULT_NOTIF_PREFS.hour
  return Math.min(23, Math.max(0, n))
}

function clampMinute(m: unknown): number {
  const n = Math.floor(Number(m))
  if (!Number.isFinite(n)) return DEFAULT_NOTIF_PREFS.minute
  return Math.min(59, Math.max(0, n))
}

export function loadNotifPrefs(): NotifPrefs {
  return { ...DEFAULT_NOTIF_PREFS }
}

export function saveNotifPrefs(_p: NotifPrefs): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(DEFAULT_NOTIF_PREFS))
  } catch {
    // noop
  }
}

export function isNativeRuntime(): boolean {
  try {
    return Capacitor?.isNativePlatform?.() === true
  } catch {
    return false
  }
}

export type PermState = 'granted' | 'denied' | 'prompt' | 'unsupported'

function mapPermission(display: unknown): PermState {
  switch (display) {
    case 'granted':
      return 'granted'
    case 'denied':
      return 'denied'
    case 'prompt':
    case 'prompt-with-rationale':
      return 'prompt'
    default:
      return 'prompt'
  }
}

async function loadPlugin() {
  // @ts-ignore guarded at runtime
  return import('@capacitor/local-notifications')
}

export async function getPermission(): Promise<PermState> {
  if (!isNativeRuntime()) return 'unsupported'
  try {
    const { LocalNotifications } = await loadPlugin()
    const res = await LocalNotifications.checkPermissions()
    return mapPermission(res?.display)
  } catch {
    return 'unsupported'
  }
}

export async function requestPermission(): Promise<PermState> {
  if (!isNativeRuntime()) return 'unsupported'
  try {
    const { LocalNotifications } = await loadPlugin()
    const res = await LocalNotifications.requestPermissions()
    return mapPermission(res?.display)
  } catch {
    return 'unsupported'
  }
}

export type ScheduleResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'denied' | 'error'; message: string }

export async function applyDailyReminder(p: NotifPrefs): Promise<ScheduleResult> {
  if (!isNativeRuntime()) {
    return {
      ok: false,
      reason: 'unsupported',
      message: 'Pengingat HP asli hanya aktif di aplikasi Android (APK).',
    }
  }

  let perm = await getPermission()
  if (perm !== 'granted') perm = await requestPermission()
  if (perm !== 'granted') {
    return {
      ok: false,
      reason: 'denied',
      message: 'Pengingat HP tidak bisa aktif tanpa izin notifikasi.',
    }
  }

  try {
    const { LocalNotifications } = await loadPlugin()
    const hour = clampHour(p?.hour)
    const minute = clampMinute(p?.minute)

    await LocalNotifications.cancel({ notifications: [{ id: DAILY_REMINDER_ID }] })
    await LocalNotifications.schedule({
      notifications: [
        {
          id: DAILY_REMINDER_ID,
          title: 'Waktunya catat keuangan',
          body: 'Luangkan 10 detik buat catat pengeluaran hari ini.',
          schedule: {
            on: { hour, minute },
            allowWhileIdle: true,
          },
        },
      ],
    })

    return { ok: true }
  } catch {
    return {
      ok: false,
      reason: 'error',
      message: 'Gagal menjadwalkan pengingat.',
    }
  }
}

export async function cancelDailyReminder(): Promise<void> {
  if (!isNativeRuntime()) return
  try {
    const { LocalNotifications } = await loadPlugin()
    await LocalNotifications.cancel({ notifications: [{ id: DAILY_REMINDER_ID }] })
  } catch {
    // noop
  }
}

function scheduledRangeIds(): { id: number }[] {
  const ids: { id: number }[] = []
  for (let i = 0; i < SCHEDULED_ID_RANGE; i += 1) {
    ids.push({ id: SCHEDULED_BASE_ID + i })
  }
  return ids
}

export async function applyScheduledPlan(items: PlannedNotification[]): Promise<ScheduleResult> {
  if (!isNativeRuntime()) {
    return {
      ok: false,
      reason: 'unsupported',
      message: 'Notifikasi terjadwal hanya aktif di aplikasi Android (APK).',
    }
  }

  let perm = await getPermission()
  if (perm !== 'granted') perm = await requestPermission()
  if (perm !== 'granted') {
    return {
      ok: false,
      reason: 'denied',
      message: 'Notifikasi terjadwal tidak bisa aktif tanpa izin notifikasi.',
    }
  }

  try {
    const { LocalNotifications } = await loadPlugin()
    try {
      await LocalNotifications.cancel({ notifications: scheduledRangeIds() })
    } catch {
      // noop
    }

    const nowMs = Date.now()
    const notifications = (Array.isArray(items) ? items : [])
      .filter(
        (it) =>
          it &&
          it.at instanceof Date &&
          !Number.isNaN(it.at.getTime()) &&
          it.at.getTime() > nowMs,
      )
      .slice(0, MAX_SCHEDULED)
      .map((it) => ({
        id: it.id,
        title: it.title,
        body: it.body,
        schedule: {
          at: it.at,
          allowWhileIdle: true,
        },
      }))

    if (notifications.length === 0) return { ok: true }

    await LocalNotifications.schedule({ notifications })
    return { ok: true }
  } catch {
    return {
      ok: false,
      reason: 'error',
      message: 'Gagal menjadwalkan notifikasi.',
    }
  }
}

export async function cancelScheduledPlan(): Promise<void> {
  if (!isNativeRuntime()) return
  try {
    const { LocalNotifications } = await loadPlugin()
    await LocalNotifications.cancel({ notifications: scheduledRangeIds() })
  } catch {
    // noop
  }
}
