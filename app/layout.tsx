import type { Metadata, Viewport } from 'next'
import { Inter, Geist_Mono } from 'next/font/google'
import type { ReactNode } from 'react'
import './globals.css'
import { StoreProvider } from '@/lib/store'

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
  applicationName: 'SakuKilat',
  title: 'SakuKilat - Pencatat Keuangan Cepat',
  description: 'Catat pengeluaran dan pemasukan dengan input bahasa natural. Gratis, lokal, dan cepat.',
  generator: 'v0.app',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SakuKilat',
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
    title: 'SakuKilat - Pencatat Keuangan Cepat',
    description: 'Catat pengeluaran dan pemasukan dengan input bahasa natural.',
    type: 'website',
  },
  other: {
    'apple-mobile-web-app-title': 'SakuKilat',
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
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  )
}
