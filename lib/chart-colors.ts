export const BUILTIN_CATEGORY_CHART_COLORS: Record<string, string> = {
  makanan: '#F59E0B',
  transportasi: '#3B82F6',
  belanja: '#EC4899',
  hiburan: '#8B5CF6',
  kesehatan: '#EF4444',
  pendidikan: '#10B981',
  tagihan: '#06B6D4',
  gaji: '#22C55E',
  investasi: '#14B8A6',
  penjualan: '#F97316',
  cashback: '#0EA5E9',
  refund: '#6366F1',
  hadiah: '#EAB308',
  freelance: '#84CC16',
  transfer: '#64748B',
  lainnya: '#78716C',
}

const FALLBACK_HUES = [
  198, 168, 142, 118, 92, 68, 44, 20, 352, 326, 298, 272, 246, 222, 186, 154,
]

function hashIndex(id: string, mod: number): number {
  let h = 0
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h % mod
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100
  const l = lightness / 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs((hue / 60) % 2 - 1))
  const m = l - c / 2

  let r = 0
  let g = 0
  let b = 0

  if (hue < 60) [r, g, b] = [c, x, 0]
  else if (hue < 120) [r, g, b] = [x, c, 0]
  else if (hue < 180) [r, g, b] = [0, c, x]
  else if (hue < 240) [r, g, b] = [0, x, c]
  else if (hue < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]

  const toHex = (value: number) =>
    Math.round((value + m) * 255).toString(16).padStart(2, '0')

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function fallbackChartColor(id: string, attempt = 0): string {
  const baseHue = FALLBACK_HUES[hashIndex(id, FALLBACK_HUES.length)]
  const hue = (baseHue + attempt * 23) % 360
  const lightness = attempt % 2 === 0 ? 58 : 50
  return hslToHex(hue, 78, lightness)
}

export function getBaseChartColor(category: string): string {
  return BUILTIN_CATEGORY_CHART_COLORS[category] ?? fallbackChartColor(category)
}

export function assignDistinctChartColors(keys: string[]): Record<string, string> {
  const colors: Record<string, string> = {}
  const used = new Set<string>()

  for (const key of keys) {
    if (!key || colors[key]) continue

    let attempt = 0
    let color = getBaseChartColor(key)

    // ponytail: uniqueness is enforced per visible chart; persist colors only if users later need manual color picking.
    while (used.has(color)) {
      attempt += 1
      color = fallbackChartColor(key, attempt)
    }

    colors[key] = color
    used.add(color)
  }

  return colors
}
