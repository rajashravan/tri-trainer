import { formatClock, formatDuration } from '../format'
import type { SolveResponse } from '../solveTypes'
import { DISCIPLINE_LABEL, DISCIPLINES, type Discipline, type GoalSpec } from '../types'

interface Props {
  result: SolveResponse
  goal: GoalSpec
  onGoal: (goal: GoalSpec) => void
}

interface Seg {
  key: string
  label: string
  seconds: number
}

/** Widest segment label that will fit; below this the segment shows nothing. */
const LABEL_MIN_PCT = 9
const TIME_MIN_PCT = 5

export default function SplitBar({ result, goal, onGoal }: Props) {
  const projectedBy = Object.fromEntries(
    result.predictions.map((p) => [p.discipline, p.projected_s]),
  ) as Record<Discipline, number>

  const projLegs = DISCIPLINES.reduce((s, d) => s + projectedBy[d], 0)
  const goalLegs = DISCIPLINES.reduce((s, d) => s + goal[`${d}_s`], 0)
  // Transition is whatever the race adds on top of the three legs.
  const transition = Math.max(0, result.projected_finish_s - projLegs)

  const projected: Seg[] = [
    ...DISCIPLINES.map((d) => ({
      key: d,
      label: DISCIPLINE_LABEL[d],
      seconds: projectedBy[d],
    })),
    { key: 'transition', label: 'T1/T2', seconds: transition },
  ]
  const target: Seg[] = [
    ...DISCIPLINES.map((d) => ({
      key: d,
      label: DISCIPLINE_LABEL[d],
      seconds: goal[`${d}_s`],
    })),
    { key: 'transition', label: 'T1/T2', seconds: Math.max(0, goal.total_s - goalLegs) },
  ]

  // Both bars share one scale, so the length difference IS the margin.
  const scale = Math.max(result.projected_finish_s, goal.total_s) || 1

  /** Zero-sum across the three legs: the total goal stays put, the split moves. */
  const setLeg = (d: Discipline, seconds: number) => {
    const budget = goal.total_s - Math.max(0, goal.total_s - goalLegs)
    const next = Math.max(60, Math.min(budget - 120, seconds))
    const others = DISCIPLINES.filter((x) => x !== d)
    const priorOthers = others.reduce((s, x) => s + goal[`${x}_s`], 0)
    const remainder = budget - next
    const out = { ...goal, [`${d}_s`]: next }
    others.forEach((x) => {
      out[`${x}_s`] =
        priorOthers > 0 ? (remainder * goal[`${x}_s`]) / priorOthers : remainder / 2
    })
    onGoal(out)
  }

  const renderBar = (segs: Seg[], total: number, kind: string) => (
    <div className="split-track">
      <div className="split-bar" style={{ width: `${(total / scale) * 100}%` }}>
        {segs.map((s) => {
          const pct = (s.seconds / total) * 100
          return (
            <div
              key={s.key}
              className={`split-seg ${s.key}`}
              style={{ flexGrow: Math.max(0.0001, s.seconds) }}
              title={`${s.label} — ${formatDuration(s.seconds)} (${pct.toFixed(0)}% of ${kind})`}
            >
              {pct >= LABEL_MIN_PCT && <span className="seg-label">{s.label}</span>}
              {pct >= TIME_MIN_PCT && (
                <span className="seg-time">{formatDuration(s.seconds)}</span>
              )}
            </div>
          )
        })}
      </div>
      <span className="split-total">{formatClock(total)}</span>
    </div>
  )

  return (
    <section className="panel splitbar">
      <div className="panel-head">
        <h2>Where your race time goes</h2>
        <span className="hint">
          Both bars on one scale — the overhang is your{' '}
          {result.margin_s < 0 ? 'shortfall' : 'margin'}
        </span>
      </div>

      <div className="split-row">
        <span className="split-tag">Projected</span>
        {renderBar(projected, result.projected_finish_s, 'projected finish')}
      </div>
      <div className="split-row">
        <span className="split-tag goal">Goal</span>
        {renderBar(target, goal.total_s, 'goal')}
      </div>

      <div className="split-legs">
        {DISCIPLINES.map((d) => {
          const over = projectedBy[d] - goal[`${d}_s`]
          return (
            <div className="split-leg" key={d}>
              <span className={`swatch ${d}`} />
              <span className="leg-name">{DISCIPLINE_LABEL[d]}</span>
              <input
                type="range"
                min={60}
                max={goalLegs - 120}
                step={30}
                value={goal[`${d}_s`]}
                onChange={(e) => setLeg(d, Number(e.target.value))}
                aria-label={`${DISCIPLINE_LABEL[d]} goal split`}
              />
              <span className={`leg-delta ${over > 0 ? 'over' : 'under'}`}>
                {over > 0 ? '+' : '−'}
                {formatDuration(Math.abs(over))}
              </span>
            </div>
          )
        })}
      </div>
      <p className="split-help">
        Drag to move time between legs. The total goal stays fixed — this is zero-sum, so
        buying yourself a slower bike split costs you elsewhere.
      </p>
    </section>
  )
}
