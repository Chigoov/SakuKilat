'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export interface ExplodedPieData {
  name: string
  value: number
  fill: string
}

interface ExplodedPieChartProps {
  data: ExplodedPieData[]
  className?: string
}

interface Point {
  x: number
  y: number
}

const WIDTH = 420
const CENTER_X = 210
const OUTER_RADIUS = 88
const ACTIVE_SHIFT = 10
const ACTIVE_SCALE = 1.055
const LABEL_RAIL = 42
const LABEL_GAP = 38
const MIN_HEIGHT = 330
const SIDE_LABEL_X = {
  left: 70,
  right: WIDTH - 70,
}
const MOTION = 'transform 520ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease'

const idrFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function pointAt(cx: number, cy: number, radius: number, angle: number): Point {
  const rad = (angle * Math.PI) / 180
  return {
    x: cx + Math.cos(rad) * radius,
    y: cy + Math.sin(rad) * radius,
  }
}

function piePath(cx: number, cy: number, radius: number, start: number, end: number): string {
  const from = pointAt(cx, cy, radius, start)
  const to = pointAt(cx, cy, radius, end)
  const largeArc = end - start > 180 ? 1 : 0
  return `M ${cx} ${cy} L ${from.x} ${from.y} A ${radius} ${radius} 0 ${largeArc} 1 ${to.x} ${to.y} Z`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function shortLabel(name: string): string {
  const label = name.trim().toUpperCase()
  return label.length > 13 ? `${label.slice(0, 12)}...` : label
}

function distributeLabels<T extends { naturalY: number }>(
  items: T[],
  minY: number,
  maxY: number,
  gap: number
): Array<T & { labelY: number }> {
  const placed = [...items]
    .sort((left, right) => left.naturalY - right.naturalY)
    .map(item => ({ ...item, labelY: clamp(item.naturalY, minY, maxY) }))

  for (let index = 1; index < placed.length; index += 1) {
    placed[index].labelY = Math.max(placed[index].labelY, placed[index - 1].labelY + gap)
  }

  const overflow = placed.at(-1) ? placed.at(-1)!.labelY - maxY : 0
  if (overflow > 0) {
    for (const item of placed) item.labelY -= overflow
  }

  for (let index = placed.length - 2; index >= 0; index -= 1) {
    placed[index].labelY = Math.min(placed[index].labelY, placed[index + 1].labelY - gap)
  }

  const underflow = placed[0] ? minY - placed[0].labelY : 0
  if (underflow > 0) {
    for (const item of placed) item.labelY += underflow
  }

  return placed
}

export function ExplodedPieChart({ data, className }: ExplodedPieChartProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [hasEntered, setHasEntered] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setHasEntered(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const resetOnOutsidePress = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setActiveIndex(null)
    }

    document.addEventListener('pointerdown', resetOnOutsidePress)
    return () => document.removeEventListener('pointerdown', resetOnOutsidePress)
  }, [])

  const model = useMemo(() => {
    const items = data.filter(item => item.value > 0)
    const total = items.reduce((sum, item) => sum + item.value, 0)

    let cursor = -90
    const baseSlices = items.map((item, index) => {
      const sweep = total > 0 ? (item.value / total) * 360 : 0
      const start = cursor
      const end = cursor + sweep
      const mid = start + sweep / 2
      cursor = end
      const side = Math.cos((mid * Math.PI) / 180) >= 0 ? 'right' as const : 'left' as const
      return { ...item, index, start, end, mid, side, percent: total > 0 ? item.value / total : 0 }
    })

    const leftCount = baseSlices.filter(slice => slice.side === 'left').length
    const rightCount = baseSlices.length - leftCount
    const height = Math.max(MIN_HEIGHT, Math.max(leftCount, rightCount) * LABEL_GAP + 90)
    const centerY = height / 2

    const slices = baseSlices.map(slice => {
      const sliceCx = CENTER_X
      const sliceCy = centerY
      const edge = pointAt(sliceCx, sliceCy, OUTER_RADIUS + 1, slice.mid)
      const natural = pointAt(sliceCx, sliceCy, OUTER_RADIUS + LABEL_RAIL, slice.mid)
      return {
        ...slice,
        sliceCx,
        sliceCy,
        edge,
        naturalY: natural.y,
        label: shortLabel(slice.name),
      }
    })

    const minY = 28
    const maxY = height - 28
    const left = distributeLabels(slices.filter(slice => slice.side === 'left'), minY, maxY, LABEL_GAP)
    const right = distributeLabels(slices.filter(slice => slice.side === 'right'), minY, maxY, LABEL_GAP)
    const labelYByIndex = new Map([...left, ...right].map(slice => [slice.index, slice.labelY]))

    return {
      height,
      total,
      slices: slices.map(slice => ({ ...slice, labelY: labelYByIndex.get(slice.index) ?? slice.naturalY })),
    }
  }, [data])

  const active = activeIndex === null ? null : model.slices.find(slice => slice.index === activeIndex)
  const tooltipWidth = 138
  const tooltipHeight = 56
  const activeShift = active ? pointAt(0, 0, ACTIVE_SHIFT, active.mid) : { x: 0, y: 0 }
  const activeEdge = active
    ? pointAt(active.sliceCx + activeShift.x, active.sliceCy + activeShift.y, OUTER_RADIUS + 7, active.mid)
    : null
  const tooltipX = activeEdge ? clamp(activeEdge.x + 12, 8, WIDTH - tooltipWidth - 8) : 0
  const tooltipY = activeEdge ? clamp(activeEdge.y - tooltipHeight / 2, 8, model.height - tooltipHeight - 8) : 0

  if (model.total <= 0) return null

  return (
    <div ref={rootRef} className={cn('w-full max-w-[420px]', className)}>
      <svg
        className="block w-full overflow-visible"
        viewBox={`0 0 ${WIDTH} ${model.height}`}
        role="img"
        aria-label="Chart pengeluaran per kategori"
        onClick={() => setActiveIndex(null)}
        onMouseLeave={() => setActiveIndex(null)}
        onPointerLeave={() => setActiveIndex(null)}
      >
        <defs>
          <filter id="pie-tooltip-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="6" stdDeviation="5" floodColor="rgba(15,23,42,0.22)" />
          </filter>
        </defs>

        {model.slices.map(slice => {
          const isActive = activeIndex === slice.index
          const isDimmed = activeIndex !== null && !isActive
          const shift = isActive ? pointAt(0, 0, ACTIVE_SHIFT, slice.mid) : { x: 0, y: 0 }
          const scale = hasEntered ? (isActive ? ACTIVE_SCALE : 1) : 0.88

          return (
            <path
              key={`slice-${slice.index}`}
              d={piePath(slice.sliceCx, slice.sliceCy, OUTER_RADIUS, slice.start, slice.end)}
              fill={slice.fill}
              stroke="var(--sk-surface)"
              strokeWidth={isActive ? 2 : 0}
              strokeLinejoin="round"
              tabIndex={0}
              role="button"
              aria-label={`${slice.name}: ${(slice.percent * 100).toFixed(1)}%, ${idrFormatter.format(slice.value)}`}
              onFocus={() => setActiveIndex(slice.index)}
              onBlur={() => setActiveIndex(null)}
              onClick={event => {
                event.stopPropagation()
                setActiveIndex(slice.index)
              }}
              onPointerEnter={() => setActiveIndex(slice.index)}
              onPointerDown={() => setActiveIndex(slice.index)}
              style={{
                cursor: 'pointer',
                opacity: hasEntered ? (isDimmed ? 0.6 : 1) : 0,
                transform: `translate(${shift.x}px, ${shift.y}px) scale(${scale})`,
                transformBox: 'fill-box',
                transformOrigin: 'center',
                transition: MOTION,
                transitionDelay: hasEntered ? '0ms' : `${slice.index * 45}ms`,
              }}
            />
          )
        })}

        {model.slices.map(slice => {
          const isActive = activeIndex === slice.index
          const isDimmed = activeIndex !== null && !isActive
          const shift = isActive ? pointAt(0, 0, ACTIVE_SHIFT, slice.mid) : { x: 0, y: 0 }
          const edge = pointAt(slice.sliceCx + shift.x, slice.sliceCy + shift.y, OUTER_RADIUS + (isActive ? 7 : 1), slice.mid)
          const labelX = slice.side === 'right' ? SIDE_LABEL_X.right : SIDE_LABEL_X.left
          const lineEndX = slice.side === 'right' ? labelX - 10 : labelX + 10
          const breakX = slice.side === 'right' ? lineEndX - 30 : lineEndX + 30
          const anchor = slice.side === 'right' ? 'start' : 'end'

          return (
            <g
              key={`label-${slice.index}`}
              style={{
                opacity: hasEntered ? (isDimmed ? 0.52 : 1) : 0,
                transition: 'opacity 220ms ease',
              }}
            >
              <polyline
                points={`${edge.x},${edge.y} ${breakX},${slice.labelY} ${lineEndX},${slice.labelY}`}
                fill="none"
                stroke={slice.fill}
                strokeWidth={1}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <text
                x={labelX}
                y={slice.labelY - 5}
                textAnchor={anchor}
                className="fill-[var(--sk-text)] text-[12px] font-semibold"
              >
                {slice.label}
              </text>
              <text
                x={labelX}
                y={slice.labelY + 13}
                textAnchor={anchor}
                className="fill-[var(--sk-text-dim)] text-[11px] font-medium tabular-nums"
              >
                {(slice.percent * 100).toFixed(1)}%
              </text>
            </g>
          )
        })}

        {active && (
          <g filter="url(#pie-tooltip-shadow)" pointerEvents="none">
            <rect
              x={tooltipX}
              y={tooltipY}
              width={tooltipWidth}
              height={tooltipHeight}
              rx={8}
              fill="var(--sk-surface-2)"
              stroke="var(--sk-border-2)"
            />
            <text x={tooltipX + 12} y={tooltipY + 22} className="fill-[var(--sk-text-muted)] text-[11px] font-semibold">
              {shortLabel(active.name)}
            </text>
            <text x={tooltipX + 12} y={tooltipY + 42} className="fill-[var(--sk-text)] text-[13px] font-bold tabular-nums">
              {idrFormatter.format(active.value)}
            </text>
          </g>
        )}
      </svg>
    </div>
  )
}
