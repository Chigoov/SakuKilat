import type { Metadata, Viewport } from 'next'
import { Inter, Geist_Mono } from 'next/font/google'
import type { ReactNode } from 'react'
import './globals.css'
import { StoreProvider } from '@/lib/store'
import { StorageBoot } from '@/components/storage-boot'

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  applicationName: 'Saku Kilat V2',
  title: 'Saku Kilat V2 - Pencatat Keuangan Cepat',
  description: 'Saku Kilat V2 untuk catat pemasukan, pengeluaran, dan goal tabungan lebih cepat.',
  generator: 'v0.app',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Saku Kilat V2',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-icon.png',
    shortcut: '/icon-192.png',
  },
  openGraph: {
    title: 'Saku Kilat V2 - Pencatat Keuangan Cepat',
    description: 'Saku Kilat V2 untuk catat pemasukan, pengeluaran, dan goal tabungan lebih cepat.',
    type: 'website',
  },
  other: {
    'apple-mobile-web-app-title': 'Saku Kilat V2',
    'mobile-web-app-capable': 'yes',
    'msapplication-TileColor': '#090D16',
  },
}

export const viewport: Viewport = {
  themeColor: '#090D16',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return (
    <html lang="id" className={`${inter.variable} ${geistMono.variable} dark`}>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/apple-icon.png" />
      </head>
      <body className="font-sans antialiased bg-[var(--sk-bg)] overscroll-none">
        <StorageBoot>
          <StoreProvider>{children}</StoreProvider>
        </StorageBoot>
      </body>
    </html>
  )
}
