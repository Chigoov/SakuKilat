'use client'

/**
 * Durable native storage bridge for SakuKilat (Capacitor Android/iOS).
 *
 * MASALAH: `localStorage` di dalam WebView diperlakukan seperti cache. Android
 * bisa mengevakuasinya saat storage menipis, dan ia hilang saat data WebView
 * dibersihkan. Untuk app finansial itu terlalu rapuh.
 *
 * SOLUSI (2 lapis):
 *  1. @capacitor/preferences  -> SharedPreferences (Android) / UserDefaults (iOS).
 *     Ini "app data" native yang jauh lebih lengket daripada localStorage:
 *     TIDAK ikut terhapus saat cache/data WebView dibersihkan.
 *     (Tetap terhapus saat "Clear data" app atau uninstall.)
 *  2. @capacitor/filesystem   -> menulis file backup .json ke Documents.
 *     Ini satu-satunya lapisan yang bisa BERTAHAN dari uninstall / ganti HP,
 *     karena file berada di luar sandbox data app.
 *
 * STRATEGI: localStorage tetap jadi cache sinkron yang cepat (agar store.tsx
 * tidak perlu dirombak jadi async). Preferences jadi sumber kebenaran durable.
 * - Saat boot: salin Preferences -> localStorage (lihat hydrateFromNative()).
 * - Saat menyimpan: cermin localStorage -> Preferences (lihat syncAllToNative()).
 */

import { Capacitor, registerPlugin } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { APP_STORAGE_PREFIX, appScopedKey } from './app-variant.ts'

export const WIDGET_SNAPSHOT_KEY = 'sakukilat:v2:widget-snapshot'

const NATIVE_INDEX_KEY = `${APP_STORAGE_PREFIX}:native-keys`
const BACKUP_DIR = APP_STORAGE_PREFIX.replace(/[:]/g, '-')
const BACKUP_FILE = `${BACKUP_DIR}/backup-latest.json`
const CANONICAL_PRIMARY_KEYS = [
  'sakukilat:v2:local-state',
  'sakukilat:v2:goals',
  'sakukilat:v2:recurring',
] as const

const CANONICAL_TRACKED_KEYS = [
  ...CANONICAL_PRIMARY_KEYS,
  'sakukilat:v2:celebrated-goals',
  'sakukilat:v2:app-lock',
  WIDGET_SNAPSHOT_KEY,
  'sakukilat:v2:onboarding-completed',
  'sakukilat:v2:onboarding-completed-v9',
  'sakukilat:v2:onboarding-completed-v9:local',
  'sakukilat:v2:onboarding-completed-v9:local-device%40sakukilat.local',
] as const

export function isTrackedKey(key: string): boolean {
  if ((TRACKED_KEYS as readonly string[]).includes(key)) return true
  if (
    key.startsWith('sakukilat:v2:onboarding-completed') ||
    key.startsWith('sakukilat:onboarding:')
  ) {
    return true
  }
  return false
}

const PRIMARY_KEYS = [
  ...CANONICAL_PRIMARY_KEYS,
  appScopedKey('local-state'),
  appScopedKey('goals'),
  appScopedKey('recurring'),
] as const

const TRACKED_KEYS = [
  ...CANONICAL_TRACKED_KEYS,
  appScopedKey('local-state'),
  appScopedKey('goals'),
  appScopedKey('recurring'),
  appScopedKey('celebrated-goals'),
  appScopedKey('app-lock'),
  appScopedKey('widget-snapshot'),
] as const

let fileBackupTimer: ReturnType<typeof setTimeout> | null = null

interface BackupPayload {
  version: 1
  entries: Record<string, string>
}

export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

function localEntries() {
  const entries: Record<string, string> = {}
  for (const key of TRACKED_KEYS) {
    const value = window.localStorage.getItem(key)
    if (value != null) entries[key] = value
  }
  try {
    const len = window.localStorage.length
    for (let i = 0; i < len; i++) {
      const k = window.localStorage.key(i)
      if (k && isTrackedKey(k)) {
        const val = window.localStorage.getItem(k)
        if (val != null) entries[k] = val
      }
    }
  } catch {
    /* ignore */
  }
  // Ensure canonical keys and scoped keys mirror each other
  const keyPairs: [string, string][] = [
    ['sakukilat:v2:local-state', appScopedKey('local-state')],
    ['sakukilat:v2:goals', appScopedKey('goals')],
    ['sakukilat:v2:recurring', appScopedKey('recurring')],
    ['sakukilat:v2:celebrated-goals', appScopedKey('celebrated-goals')],
    ['sakukilat:v2:app-lock', appScopedKey('app-lock')],
    [WIDGET_SNAPSHOT_KEY, appScopedKey('widget-snapshot')],
  ]
  for (const [canonical, scoped] of keyPairs) {
    if (!entries[canonical] && entries[scoped]) entries[canonical] = entries[scoped]
    if (!entries[scoped] && entries[canonical]) entries[scoped] = entries[canonical]
  }
  return entries
}

function primaryDataPresent(entries: Record<string, string>): boolean {
  return PRIMARY_KEYS.some((key) => typeof entries[key] === 'string' && entries[key].length > 0)
}

function applyEntries(entries: Record<string, string>) {
  for (const [key, value] of Object.entries(entries)) {
    if (value != null && isTrackedKey(key)) {
      window.localStorage.setItem(key, value)
      if (key === appScopedKey('local-state')) {
        window.localStorage.setItem('sakukilat:v2:local-state', value)
      } else if (key === appScopedKey('goals')) {
        window.localStorage.setItem('sakukilat:v2:goals', value)
      } else if (key === appScopedKey('recurring')) {
        window.localStorage.setItem('sakukilat:v2:recurring', value)
      } else if (key === appScopedKey('widget-snapshot')) {
        window.localStorage.setItem(WIDGET_SNAPSHOT_KEY, value)
      }
    }
  }
}

async function readNativeEntries(keys: readonly string[]): Promise<Record<string, string>> {
  const entries: Record<string, string> = {}
  for (const key of keys) {
    const { value } = await Preferences.get({ key })
    if (value != null) entries[key] = value
  }
  return entries
}

function buildBackupPayload(): BackupPayload {
  return {
    version: 1,
    entries: localEntries(),
  }
}

/**
 * Dipanggil SEBELUM StoreProvider mount (via <StorageBoot/>).
 * Menyalin nilai durable dari Preferences ke localStorage supaya loader
 * sinkron di store.tsx langsung menemukan datanya. Kalau localStorage sudah
 * berisi (kasus normal), Preferences justru di-seed dari localStorage.
 */
export async function hydrateFromNative(): Promise<void> {
  if (!isNative()) return
  try {
    const { value: indexRaw } = await Preferences.get({ key: NATIVE_INDEX_KEY })
    const nativeKeys = ((indexRaw ? JSON.parse(indexRaw) : []) as string[])
      .filter((key): key is string => isTrackedKey(key))
    const local = localEntries()
    const localHasPrimaryData = primaryDataPresent(local)
    const localHasTrackedData = Object.keys(local).length > 0

    if (nativeKeys.length > 0 && !localHasPrimaryData) {
      // WebView localStorage kosong/terhapus, tapi native masih punya -> PULIHKAN.
      applyEntries(await readNativeEntries(nativeKeys))
    } else if (localHasTrackedData) {
      // Migrasi pertama kali: seed Preferences dari localStorage yang ada.
      await syncAllToNative()
    } else {
      const backup = await readFileBackup()
      if (backup) {
        applyEntries(backup)
        await syncAllToNative()
      }
    }
  } catch {
    /* best-effort: jangan pernah memblokir boot karena storage gagal */
  }
}

/** Cermin SEMUA kunci sakukilat: dari localStorage -> Preferences. */
export async function syncAllToNative(): Promise<void> {
  if (!isNative()) return
  try {
    const entries = localEntries()
    const keys = Object.keys(entries)
    await Promise.all(
      keys.map((key) => {
        const value = entries[key]
        return value == null ? Preferences.remove({ key }) : Preferences.set({ key, value })
      }),
    )
    await Preferences.set({ key: NATIVE_INDEX_KEY, value: JSON.stringify(keys) })
  } catch {
    /* best-effort */
  }
}

/** Cermin satu kunci (fire-and-forget). Dipanggil dari persistState store.tsx. */
export function mirrorToNative(key: string, value: string): void {
  if (!isNative() || !isTrackedKey(key)) return
  void (async () => {
    try {
      await Preferences.set({ key, value })
      const { value: indexRaw } = await Preferences.get({ key: NATIVE_INDEX_KEY })
      const set = new Set<string>(indexRaw ? JSON.parse(indexRaw) : [])
      set.add(key)
      await Preferences.set({ key: NATIVE_INDEX_KEY, value: JSON.stringify([...set]) })
    } catch {
      /* best-effort */
    }
  })()
}

export function removeFromNative(key: string): void {
  if (!isNative() || !isTrackedKey(key)) return
  void (async () => {
    try {
      await Preferences.remove({ key })
      const { value: indexRaw } = await Preferences.get({ key: NATIVE_INDEX_KEY })
      const next = (indexRaw ? JSON.parse(indexRaw) : []).filter((item: string) => item !== key)
      await Preferences.set({ key: NATIVE_INDEX_KEY, value: JSON.stringify(next) })
    } catch {
      /* best-effort */
    }
  })()
}

export function scheduleFileBackup(delayMs = 5000): void {
  if (!isNative()) return
  if (fileBackupTimer) clearTimeout(fileBackupTimer)
  fileBackupTimer = setTimeout(() => {
    void writeFileBackup()
  }, delayMs)
}

/**
 * Backup bundle key penting ke file .json di Documents.
 * Ini dipakai untuk pemulihan manual / migrasi bila file Documents masih ada.
 */
export async function writeFileBackup(): Promise<string | null> {
  if (!isNative()) return null
  try {
    await Filesystem.mkdir({ path: BACKUP_DIR, directory: Directory.Documents, recursive: true }).catch(() => {})
    await Filesystem.writeFile({
      path: BACKUP_FILE,
      data: JSON.stringify(buildBackupPayload()),
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    })
    return BACKUP_FILE
  } catch {
    return null
  }
}

/** Baca file backup terakhir dari Documents. */
export async function readFileBackup(): Promise<Record<string, string> | null> {
  if (!isNative()) return null
  try {
    const res = await Filesystem.readFile({
      path: BACKUP_FILE,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    })
    if (typeof res.data !== 'string') return null
    const parsed = JSON.parse(res.data) as BackupPayload
    if (!parsed || parsed.version !== 1 || typeof parsed.entries !== 'object' || !parsed.entries) return null
    const entries: Record<string, string> = {}
    for (const key of TRACKED_KEYS) {
      const value = parsed.entries[key]
      if (typeof value === 'string') entries[key] = value
    }
    return Object.keys(entries).length > 0 ? entries : null
  } catch {
    return null
  }
}

interface WidgetNativePlugin {
  notifyUpdate?: () => Promise<{ ok: boolean }>
}

let widgetNativePlugin: WidgetNativePlugin | null = null
try {
  widgetNativePlugin = registerPlugin<WidgetNativePlugin>('SakuKilatWidget')
} catch {
  /* plugin unavailable */
}

/**
 * Simpan snapshot widget ke native SharedPreferences melalui @capacitor/preferences
 * dan cermin ke window.localStorage.
 */
export async function saveWidgetSnapshotToNative(snapshotJson: string): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(WIDGET_SNAPSHOT_KEY, snapshotJson)
      window.localStorage.setItem(appScopedKey('widget-snapshot'), snapshotJson)
    } catch {
      /* ignore */
    }
  }
  if (!isNative()) return
  try {
    await Preferences.set({ key: WIDGET_SNAPSHOT_KEY, value: snapshotJson })
    await Preferences.set({ key: appScopedKey('widget-snapshot'), value: snapshotJson })
    const { value: indexRaw } = await Preferences.get({ key: NATIVE_INDEX_KEY })
    const set = new Set<string>(indexRaw ? JSON.parse(indexRaw) : [])
    set.add(WIDGET_SNAPSHOT_KEY)
    set.add(appScopedKey('widget-snapshot'))
    await Preferences.set({ key: NATIVE_INDEX_KEY, value: JSON.stringify([...set]) })
  } catch {
    /* best-effort */
  }
}

/**
 * Baca snapshot widget dari native SharedPreferences atau localStorage.
 */
export async function readWidgetSnapshotFromNative(): Promise<string | null> {
  if (isNative()) {
    try {
      const { value } = await Preferences.get({ key: WIDGET_SNAPSHOT_KEY })
      if (typeof value === 'string' && value.length > 0) return value
    } catch {
      /* fallback */
    }
  }
  if (typeof window !== 'undefined') {
    try {
      return window.localStorage.getItem(WIDGET_SNAPSHOT_KEY)
    } catch {
      return null
    }
  }
  return null
}

/**
 * Kirim broadcast pembaruan widget ke launcher Android native.
 */
export async function triggerWidgetUpdateBroadcast(): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('sakukilat:widget-updated'))
    } catch {
      /* ignore */
    }
    try {
      const android = (window as unknown as { SakuKilatAndroid?: { notifyWidgetUpdate?: () => void } }).SakuKilatAndroid
      if (typeof android?.notifyWidgetUpdate === 'function') {
        android.notifyWidgetUpdate()
      }
    } catch {
      /* ignore */
    }
  }
  if (isNative() && widgetNativePlugin && typeof widgetNativePlugin.notifyUpdate === 'function') {
    try {
      await widgetNativePlugin.notifyUpdate()
    } catch {
      /* ignore */
    }
  }
}
