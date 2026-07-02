'use client'

/**
 * Gerbang boot: pada platform native, pulihkan localStorage dari Preferences
 * (native durable store) SEBELUM StoreProvider membacanya secara sinkron.
 * Di web, langsung render tanpa penundaan.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { Capacitor } from '@capacitor/core'
import { hydrateFromNative } from '@/lib/native-store'

function nativeAtStart(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

export function StorageBoot({ children }: { children: ReactNode }) {
  // Di web (dan saat SSR/static export) langsung siap -> tidak ada flash.
  const [ready, setReady] = useState(() => !nativeAtStart())

  useEffect(() => {
    if (ready) return
    let alive = true
    hydrateFromNative().finally(() => {
      if (alive) setReady(true)
    })
    return () => {
      alive = false
    }
  }, [ready])

  if (!ready) return null
  return <>{children}</>
}
