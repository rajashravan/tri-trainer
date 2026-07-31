import { useEffect, useRef, useState } from 'react'
import type { ScheduleGrid } from '../solveTypes'
import { DAY_NAMES } from '../types'

interface Props {
  grid: ScheduleGrid
  blackouts: [number, number][]
  onBlackouts: (next: [number, number][]) => void
}

const LEVELS = 5

const key = (w: number, d: number) => `${w}:${d}`

export default function LoadHeatmap({ grid, blackouts, onBlackouts }: Props) {
  const set = new Set(blackouts.map(([w, d]) => key(w, d)))
  const dragging = useRef<null | { adding: boolean }>(null)
  const [preview, setPreview] = useState<Set<string>>(new Set())

  // Drag-select a range of days. Not drag-and-drop — just a painted selection.
  useEffect(() => {
    const stop = () => {
      if (!dragging.current) return
      const adding = dragging.current.adding
      dragging.current = null
      setPreview((current) => {
        if (current.size === 0) return current
        const next = new Set(set)
        current.forEach((k) => (adding ? next.add(k) : next.delete(k)))
        onBlackouts(
          [...next].map((k) => k.split(':').map(Number) as [number, number]),
        )
        return new Set()
      })
    }
    window.addEventListener('mouseup', stop)
    return () => window.removeEventListener('mouseup', stop)
  })

  const start = (w: number, d: number) => {
    const adding = !set.has(key(w, d))
    dragging.current = { adding }
    setPreview(new Set([key(w, d)]))
  }

  const extend = (w: number, d: number) => {
    if (!dragging.current) return
    setPreview((p) => new Set(p).add(key(w, d)))
  }

  const cellAt = (w: number, d: number) =>
    grid.cells.find((c) => c.week === w && c.day === d)

  const level = (load: number) => {
    if (load <= 0) return 0
    return Math.min(LEVELS, Math.max(1, Math.ceil((load / grid.peak_day_load) * LEVELS)))
  }

  return (
    <section className="panel heatmap-panel">
      <div className="panel-head">
        <h2>Training block — {grid.weeks} weeks</h2>
        <span className="hint">
          Click or drag to black out days you are unavailable
          {blackouts.length > 0 && (
            <button className="link-btn clear-bo" onClick={() => onBlackouts([])}>
              clear {blackouts.length}
            </button>
          )}
        </span>
      </div>

      <div className="heat-wrap">
        <div className="heat-days">
          {DAY_NAMES.map((n) => (
            <span key={n}>{n}</span>
          ))}
        </div>
        <div className="heat-grid" style={{ gridTemplateColumns: `repeat(${grid.weeks}, 1fr)` }}>
          {Array.from({ length: grid.weeks }, (_, w) => (
            <div className="heat-col" key={w}>
              {Array.from({ length: 7 }, (_, d) => {
                const cell = cellAt(w, d)
                if (!cell) return <span key={d} className="heat-cell" />
                const k = key(w, d)
                const shown = preview.has(k)
                  ? dragging.current?.adding ?? cell.is_blackout
                  : cell.is_blackout
                const cls = cell.is_race
                  ? 'race'
                  : shown
                    ? 'blackout'
                    : `lv${level(cell.load)}`
                return (
                  <span
                    key={d}
                    className={`heat-cell ${cls}`}
                    onMouseDown={() => start(w, d)}
                    onMouseEnter={() => extend(w, d)}
                    title={
                      cell.is_race
                        ? 'Race day'
                        : shown
                          ? `Week ${w + 1} ${DAY_NAMES[d]} — blacked out`
                          : `Week ${w + 1} ${DAY_NAMES[d]} — ${cell.discipline ?? 'rest'}${cell.is_long ? ' (long)' : ''} · ${cell.load.toFixed(0)} load`
                    }
                  />
                )
              })}
            </div>
          ))}
        </div>
        <div className="heat-weeks">
          <span>week 1</span>
          <span>race</span>
        </div>
      </div>

      <div className="heat-legend">
        <span>less</span>
        {Array.from({ length: LEVELS + 1 }, (_, i) => (
          <span key={i} className={`heat-cell lv${i}`} />
        ))}
        <span>more</span>
        <span className="heat-cell race" />
        <span>race day</span>
        <span className="heat-cell blackout" />
        <span>blackout</span>
      </div>
    </section>
  )
}
