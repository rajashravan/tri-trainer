/** Duration helpers. Efforts are entered as mm:ss, goal times as h:mm:ss. */

const pad = (n: number) => String(n).padStart(2, '0')

/** 1680 -> "28:00"; 4500 -> "1:15:00" (hours only when non-zero). */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

/** 19863 -> "5:31:03". Always h:mm:ss. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}

/**
 * Accepts "28:00", "1:15:00", "90" (bare seconds). Returns null when unparseable
 * so callers can hold the raw text and defer validation until blur.
 */
export function parseDuration(text: string): number | null {
  const t = text.trim()
  if (!t) return null
  const parts = t.split(':')
  if (parts.length > 3) return null
  if (parts.some((p) => p === '' || !/^\d+$/.test(p))) return null
  const nums = parts.map(Number)
  if (parts.length > 1 && nums.slice(1).some((n) => n >= 60)) return null
  const seconds = nums.reduce((acc, n) => acc * 60 + n, 0)
  return seconds > 0 ? seconds : null
}

/** "4:12 /km" style pace, for the effort-input hint line. */
export function formatPace(distance_m: number, duration_s: number, discipline: string): string {
  if (distance_m <= 0 || duration_s <= 0) return ''
  if (discipline === 'swim') {
    return `${formatDuration((duration_s / distance_m) * 100)} /100m`
  }
  if (discipline === 'bike') {
    return `${((distance_m / 1000 / duration_s) * 3600).toFixed(1)} km/h`
  }
  return `${formatDuration((duration_s / distance_m) * 1000)} /km`
}
