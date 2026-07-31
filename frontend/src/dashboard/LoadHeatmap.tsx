import { useEffect, useRef, useState } from 'react'
import DayIcon from './DayIcon'
import { formatClock, formatPace } from '../format'
import type { DayCell, ScheduleGrid } from '../solveTypes'
import { DAY_NAMES, DISCIPLINE_LABEL } from '../types'

interface Props {
  grid: ScheduleGrid
  blackouts: [number, number][]
  goalFinishS: number
  onBlackouts: (next: [number, number][]) => void
}

const LEVELS = 5
const TOOLTIP_W = 216

// Cell size bounds. Without a cap, `repeat(N, 1fr)` stretches columns to fill the panel,
// so a short block renders enormous squares; without a floor, a long block would render
// unclickable slivers. Capping total width caps each cell, and the floor lets the grid
// overflow into a scroll rather than collapse.
const CELL_MAX = 42
const CELL_MIN = 11
const CELL_GAP = 3

const key = (w: number, d: number) => `${w}:${d}`

function distanceLabel(cell: DayCell): string {
  if (cell.discipline === 'swim') return `${Math.round(cell.distance_m).toLocaleString()} m`
  return `${(cell.distance_m / 1000).toFixed(1)} km`
}

function durationLabel(seconds: number): string {
  const m = Math.round(seconds / 60)
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m} min`
}

export default function LoadHeatmap({ grid, blackouts, goalFinishS, onBlackouts }: Props) {
  const set = new Set(blackouts.map(([w, d]) => key(w, d)))
  const dragging = useRef<null | { adding: boolean }>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const [preview, setPreview] = useState<Set<string>>(new Set())
  const [hover, setHover] = useState<{ cell: DayCell; left: number; top: number } | null>(null)

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
        onBlackouts([...next].map((k) => k.split(':').map(Number) as [number, number]))
        return new Set()
      })
    }
    window.addEventListener('mouseup', stop)
    return () => window.removeEventListener('mouseup', stop)
  })

  const cellAt = (w: number, d: number) => grid.cells.find((c) => c.week === w && c.day === d)

  const level = (load: number) => {
    if (load <= 0) return 0
    return Math.min(LEVELS, Math.max(1, Math.ceil((load / grid.peak_day_load) * LEVELS)))
  }

  const enter = (e: React.MouseEvent, cell: DayCell) => {
    if (dragging.current) setPreview((p) => new Set(p).add(key(cell.week, cell.day)))
    const box = wrap.current?.getBoundingClientRect()
    if (!box) return
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const raw = r.left - box.left + r.width / 2 - TOOLTIP_W / 2
    setHover({
      cell,
      left: Math.max(0, Math.min(raw, box.width - TOOLTIP_W)),
      top: r.top - box.top,
    })
  }

  return (
    <section className="panel heatmap-panel">
      <div className="panel-head">
        <h2>Training block — {grid.weeks} weeks</h2>
        <span className="hint">
          Hover a day for its session · click or drag to black out
          {blackouts.length > 0 && (
            <button className="link-btn clear-bo" onClick={() => onBlackouts([])}>
              clear {blackouts.length}
            </button>
          )}
        </span>
      </div>

      <div className="heat-wrap" ref={wrap} onMouseLeave={() => setHover(null)}>
        <div className="heat-days">
          {DAY_NAMES.map((n) => (
            <span key={n}>{n}</span>
          ))}
        </div>
        <div
          className="heat-grid"
          style={{
            gridTemplateColumns: `repeat(${grid.weeks}, minmax(${CELL_MIN}px, 1fr))`,
            maxWidth: grid.weeks * CELL_MAX + (grid.weeks - 1) * CELL_GAP,
          }}
        >
          {Array.from({ length: grid.weeks }, (_, w) => (
            <div className="heat-col" key={w}>
              {Array.from({ length: 7 }, (_, d) => {
                const cell = cellAt(w, d)
                if (!cell) return <span key={d} className="heat-cell" />
                const k = key(w, d)
                const shown = preview.has(k)
                  ? (dragging.current?.adding ?? cell.is_blackout)
                  : cell.is_blackout
                const cls = cell.is_race ? 'race' : shown ? 'blackout' : `lv${level(cell.load)}`
                return (
                  <span
                    key={d}
                    className={`heat-cell ${cls}${hover?.cell === cell ? ' hot' : ''}`}
                    onMouseDown={() => {
                      dragging.current = { adding: !set.has(k) }
                      setPreview(new Set([k]))
                    }}
                    onMouseEnter={(e) => enter(e, cell)}
                  />
                )
              })}
            </div>
          ))}
        </div>

        {hover && (
          <div
            className={`day-pop ${hover.cell.discipline ?? 'rest'}`}
            style={{ left: hover.left, top: hover.top, width: TOOLTIP_W }}
          >
            <div className="pop-head">
              <span>
                Week {hover.cell.week + 1} · {DAY_NAMES[hover.cell.day]}
              </span>
              {hover.cell.session_kind !== 'rest' && !hover.cell.is_blackout && (
                <span className={`pop-kind ${hover.cell.session_kind}`}>
                  {hover.cell.session_kind}
                </span>
              )}
            </div>

            {hover.cell.is_race ? (
              <>
                <div className="pop-target">Race day</div>
                <div className="pop-sub">Goal finish {formatClock(goalFinishS)}</div>
              </>
            ) : hover.cell.is_blackout ? (
              <>
                <div className="pop-target muted">Blacked out</div>
                <div className="pop-sub">Load moved to nearby weeks</div>
              </>
            ) : hover.cell.duration_s <= 0 ? (
              <>
                <div className="pop-target muted">Rest</div>
                <div className="pop-sub">No session</div>
              </>
            ) : (
              <>
                <div className="pop-sport">
                  <DayIcon discipline={hover.cell.discipline} />
                  {DISCIPLINE_LABEL[hover.cell.discipline!]}
                </div>
                <div className="pop-target">{distanceLabel(hover.cell)}</div>
                <div className="pop-sub">
                  {formatPace(hover.cell.distance_m, hover.cell.duration_s, hover.cell.discipline!)}
                  <span className="pop-dot">·</span>
                  {durationLabel(hover.cell.duration_s)}
                </div>
              </>
            )}
          </div>
        )}

        <div
          className="heat-weeks"
          style={{ maxWidth: grid.weeks * CELL_MAX + (grid.weeks - 1) * CELL_GAP }}
        >
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
