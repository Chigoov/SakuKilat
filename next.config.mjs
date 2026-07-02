/** @type {import('next').NextConfig} */
const nextConfig = {
  // Output HTML statis murni — wajib untuk Capacitor (APK Android).
  output: 'export',
  // Pin root workspace supaya Turbopack tidak salah menebak direktori induk.
  turbopack: {
    root: import.meta.dirname,
  },
  // Kunci eksplisit: jangan pernah membiarkan build lolos dengan type error.
  typescript: { ignoreBuildErrors: false },
  devIndicators: false,
  allowedDevOrigins: ['127.0.0.1', '192.168.1.10', '*.local'],
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.googleusercontent.com',
      },
    ],
  },
}

export default nextConfig
