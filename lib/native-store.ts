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

import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'

const NATIVE_INDEX_KEY = '__sakukilat_native_keys__'
const BACKUP_DIR = 'sakukilat'
const BACKUP_FILE = 'sakukilat/backup-latest.json'
const PRIMARY_KEYS = [
  'sakukilat:v2:local-state',
  'sakukilat:v2:goals',
  'sakukilat:v2:recurring',
] as const
const TRACKED_KEYS = [
  ...PRIMARY_KEYS,
  'sakukilat:v2:celebrated-goals',
  'sakukilat:v2:app-lock',
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
  return entries
}

function primaryDataPresent(entries: Record<string, string>): boolean {
  return PRIMARY_KEYS.some((key) => typeof entries[key] === 'string' && entries[key].length > 0)
}

function applyEntries(entries: Record<string, string>) {
  for (const key of TRACKED_KEYS) {
    const value = entries[key]
    if (value == null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
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
      .filter((key): key is typeof TRACKED_KEYS[number] => TRACKED_KEYS.includes(key as typeof TRACKED_KEYS[number]))
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
      TRACKED_KEYS.map((key) => {
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
  if (!isNative() || !TRACKED_KEYS.includes(key as typeof TRACKED_KEYS[number])) return
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
  if (!isNative() || !TRACKED_KEYS.includes(key as typeof TRACKED_KEYS[number])) return
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
