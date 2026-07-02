'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Minus, Plus, RotateCcw, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const OUTPUT_SIZE = 256        // sisi hasil akhir (px) — kecil supaya app ringan
const OUTPUT_QUALITY = 0.82    // kualitas JPEG hasil crop
const MIN_ZOOM = 1
const MAX_ZOOM = 4
const VIEWPORT = 280           // ukuran area pratinjau kotak (px)

interface AvatarCropperProps {
  /** Object URL dari file yang dipilih user. */
  imageUrl: string
  onCancel: () => void
  onConfirm: (dataUrl: string) => void
}

interface Point {
  x: number
  y: number
}

/**
 * Modal crop & adjust foto profil. User bisa zoom dan geser foto di dalam
 * bingkai kotak, lalu hasilnya dipotong + dikompres lewat canvas.
 */
export function AvatarCropper({ imageUrl, onCancel, onConfirm }: AvatarCropperProps) {
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [natural, setNatural] = useState({ w: 0, h: 0 })
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 })
  const dragState = useRef<{ start: Point; origin: Point } | null>(null)
  const pinchState = useRef<{ dist: number; zoom: number } | null>(null)

  // Skala dasar: "cover" supaya foto selalu memenuhi bingkai pada zoom = 1.
  const baseScale = natural.w && natural.h
    ? Math.max(VIEWPORT / natural.w, VIEWPORT / natural.h)
    : 1
  const drawW = natural.w * baseScale * zoom
  const drawH = natural.h * baseScale * zoom

  const clampOffset = useCallback((next: Point, dW: number, dH: number): Point => {
    const maxX = Math.max(0, (dW - VIEWPORT) / 2)
    const maxY = Math.max(0, (dH - VIEWPORT) / 2)
    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    }
  }, [])

  useEffect(() => {
    const img = new window.Image()
    img.onload = () => {
      imgRef.current = img
      setNatural({ w: img.naturalWidth, h: img.naturalHeight })
      setLoaded(true)
    }
    img.src = imageUrl
  }, [imageUrl])

  // Jaga offset tetap valid saat zoom berubah.
  useEffect(() => {
    setOffset(prev => clampOffset(prev, drawW, drawH))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, loaded])

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    dragState.current = { start: { x: e.clientX, y: e.clientY }, origin: offset }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragState.current) return
    const dx = e.clientX - dragState.current.start.x
    const dy = e.clientY - dragState.current.start.y
    setOffset(clampOffset(
      { x: dragState.current.origin.x + dx, y: dragState.current.origin.y + dy },
      drawW,
      drawH
    ))
  }

  const onPointerUp = (e: React.PointerEvent) => {
    ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
    dragState.current = null
  }

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      pinchState.current = { dist: Math.hypot(dx, dy), zoom }
    }
  }

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchState.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.hypot(dx, dy)
      const ratio = dist / pinchState.current.dist
      setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinchState.current.zoom * ratio)))
    }
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) pinchState.current = null
  }

  const reset = () => {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
  }

  const confirm = () => {
    const img = imgRef.current
    if (!img) return

    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT_SIZE
    canvas.height = OUTPUT_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Petakan bingkai viewport ke koordinat gambar asli.
    const scale = baseScale * zoom
    const viewCenterX = drawW / 2 + offset.x
    const viewCenterY = drawH / 2 + offset.y
    // Titik kiri-atas bingkai (0,0 viewport) dalam ruang gambar yang digambar.
    const cropLeftDraw = VIEWPORT / 2 - viewCenterX
    const cropTopDraw = VIEWPORT / 2 - viewCenterY
    const sx = -cropLeftDraw / scale
    const sy = -cropTopDraw / scale
    const sSize = VIEWPORT / scale

    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
    onConfirm(canvas.toDataURL('image/jpeg', OUTPUT_QUALITY))
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border-2)] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--sk-border)]">
          <p className="text-sm font-semibold text-[var(--sk-text)]">Atur foto profil</p>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Batal"
            className="w-8 h-8 rounded-lg bg-[var(--sk-surface-2)] flex items-center justify-center text-[var(--sk-text-muted)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 flex flex-col items-center gap-4">
          {/* Area crop */}
          <div
            className="relative overflow-hidden rounded-full border-2 border-[var(--sk-border-2)] touch-none select-none bg-[var(--sk-bg)]"
            style={{ width: VIEWPORT, height: VIEWPORT, cursor: loaded ? 'grab' : 'default' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            {loaded && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt="Pratinjau"
                draggable={false}
                style={{
                  position: 'absolute',
                  width: drawW,
                  height: drawH,
                  left: '50%',
                  top: '50%',
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                  maxWidth: 'none',
                }}
              />
            )}
            {!loaded && (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-[var(--sk-text-dim)]">
                Memuat foto...
              </div>
            )}
          </div>

          {/* Zoom control */}
          <div className="w-full flex items-center gap-3">
            <button
              type="button"
              onClick={() => setZoom(z => Math.max(MIN_ZOOM, z - 0.2))}
              aria-label="Perkecil"
              className="w-9 h-9 rounded-lg bg-[var(--sk-surface-2)] flex items-center justify-center text-[var(--sk-text-muted)] flex-shrink-0"
            >
              <Minus className="w-4 h-4" />
            </button>
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
              aria-label="Zoom foto"
              className="flex-1 accent-[var(--sk-cyan)]"
            />
            <button
              type="button"
              onClick={() => setZoom(z => Math.min(MAX_ZOOM, z + 0.2))}
              aria-label="Perbesar"
              className="w-9 h-9 rounded-lg bg-[var(--sk-surface-2)] flex items-center justify-center text-[var(--sk-text-muted)] flex-shrink-0"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <p className="text-[11px] text-[var(--sk-text-dim)] text-center">
            Geser foto untuk mengatur posisi, lalu pakai slider untuk zoom.
          </p>
        </div>

        <div className="flex items-center gap-2 px-4 pb-4">
          <button
            type="button"
            onClick={reset}
            className="h-10 px-3 rounded-xl bg-[var(--sk-surface-2)] border border-[var(--sk-border)] text-xs font-semibold text-[var(--sk-text-muted)] inline-flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!loaded}
            className={cn(
              'flex-1 h-10 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-1.5',
              loaded
                ? 'bg-[var(--sk-cyan)] text-[#090D16]'
                : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-dim)]'
            )}
          >
            <Check className="w-4 h-4" />
            Pakai foto
          </button>
        </div>
      </div>
    </div>
  )
}
