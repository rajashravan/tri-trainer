import { formatDuration } from '../format'
import { VERDICT_LABEL, type AbsorberOption, type InjuryRisk, type LoadProjection } from '../solveTypes'

interface Props {
  injury: InjuryRisk
  load: LoadProjection
  absorbers: AbsorberOption[]
  target: number | null
  onTarget: (pct: number | null) => void
  onAbsorb: (option: AbsorberOption) => void
}

const band = (pct: number) => (pct < 15 ? 'low' : pct < 30 ? 'mid' : 'high')

export default function InjuryPanel({
  injury,
  load,
  absorbers,
  target,
  onTarget,
  onAbsorb,
}: Props) {
  const shown = target ?? injury.chance_pct

  return (
    <section className={`panel injury ${band(shown)}`}>
      <div className="injury-head">
        <div className="injury-figure">
          <span className="injury-pct">{shown.toFixed(0)}%</span>
          <span className="injury-cap">
            injury chance{target !== null && <em> — target</em>}
          </span>
        </div>
        <div className="injury-meta">
          <div>
            <span>peak acute:chronic</span>
            <strong>
              {injury.peak_acwr.toFixed(2)}{' '}
              <em>vs {injury.threshold_acwr.toFixed(2)} threshold</em>
            </strong>
          </div>
          <div>
            <span>ramp rate</span>
            <strong>{load.peak_weekly_ctl_ramp.toFixed(1)} CTL/week</strong>
          </div>
          <div>
            <span>weeks above your line</span>
            <strong>
              {injury.weeks_above_threshold} of {load.weekly_acwr.length}
            </strong>
          </div>
        </div>
      </div>

      <input
        className="injury-slider"
        type="range"
        min={3}
        max={65}
        step={1}
        value={shown}
        onChange={(e) => onTarget(Number(e.target.value))}
        onDoubleClick={() => onTarget(null)}
      />
      <div className="injury-scale">
        <span>safer · less training</span>
        <span>drag down to see what must change</span>
        <span>riskier</span>
      </div>

      {target !== null && (
        <div className="absorb">
          {absorbers.length === 0 ? (
            <p className="absorb-none">
              No single change gets you to {target.toFixed(0)}%. Try a less extreme target,
              or change more than one thing.
              <button className="link-btn" onClick={() => onTarget(null)}>
                reset
              </button>
            </p>
          ) : (
            <>
              <p className="absorb-lead">
                To reach <strong>{target.toFixed(0)}%</strong>, one of these must change:
              </p>
              <div className="absorb-row">
                {absorbers.map((a) => (
                  <button
                    key={a.control}
                    className={`absorb-card ${a.helps_goal ? 'helps' : 'hurts'}`}
                    onClick={() => onAbsorb(a)}
                  >
                    <span className="absorb-label">{a.label}</span>
                    <span className="absorb-human">{a.human}</span>
                    <span className="absorb-effect">
                      injury {a.resulting_chance_pct.toFixed(0)}% ·{' '}
                      {VERDICT_LABEL[a.resulting_verdict]}
                    </span>
                    <span className="absorb-goal">
                      {a.helps_goal ? 'helps your goal' : 'costs you the goal'} ·{' '}
                      {a.resulting_margin_s >= 0 ? '+' : '−'}
                      {formatDuration(Math.abs(a.resulting_margin_s))}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <p className="injury-caveat">{injury.caveat}</p>
    </section>
  )
}
