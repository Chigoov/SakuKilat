import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Konfigurasi Capacitor untuk membungkus SakuKilat (Next.js static export)
 * menjadi aplikasi Android native.
 *
 * - webDir 'out'  → hasil `pnpm build:mobile` (next export)
 * - appId         → reverse-domain unik, dipakai sebagai package name di Play Store.
 *                   GANTI ke domain milikmu sebelum publish (tidak bisa diubah
 *                   setelah app live di Play Store).
 */
const config: CapacitorConfig = {
  appId: 'com.sakukilat.app.v2',
  appName: 'SakuKilat',
  webDir: 'out',
  android: {
    backgroundColor: '#090D16',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: '#090D16',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    // Notifikasi HP asli (@capacitor/local-notifications).
    // Hanya warna ikon yang diset agar aman: Capacitor fallback ke ikon aplikasi
    // bila smallIcon tidak ditentukan, sehingga tidak ada referensi drawable
    // yang berisiko hilang/merusak notifikasi.
    LocalNotifications: {
      iconColor: '#22D3EE',
    },
  },
}

export default config
