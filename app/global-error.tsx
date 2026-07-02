'use client'

/**
 * Last-resort boundary. Menangkap error yang terjadi di root layout itu sendiri
 * (di luar jangkauan app/error.tsx). Wajib me-render <html> & <body> sendiri
 * karena ia menggantikan root layout saat aktif.
 */
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[SakuKilat] Fatal root error:', error)
  }, [error])

  return (
    <html lang="id">
      <body
        style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          padding: '24px',
          textAlign: 'center',
          background: '#090D16',
          color: '#E5E9F0',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Aplikasi gagal dimuat.</h2>
        <p style={{ fontSize: '14px', color: '#94A3B8', maxWidth: '320px' }}>
          Terjadi kesalahan fatal. Datamu di perangkat ini tidak terpengaruh.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            minHeight: '40px',
            padding: '0 20px',
            borderRadius: '12px',
            border: 'none',
            background: '#22D3EE',
            color: '#090D16',
            fontSize: '14px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Muat ulang
        </button>
      </body>
    </html>
  )
}
