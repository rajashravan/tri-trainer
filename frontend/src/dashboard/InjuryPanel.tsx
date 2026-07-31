import RelaxationCard from './RelaxationCard'
import type { AbsorberOption, InjuryRisk, LoadProjection } from '../solveTypes'

interface Props {
  injury: InjuryRisk
  load: LoadProjection
  absorbers: AbsorberOption[]
  solving: boolean
  onSolve: () => void
  onClear: () => void
  onAbsorb: (option: AbsorberOption) => void
}

/** Meter domain. Fixed so the marker moves as the ratio changes, not the scale. */
const LO = 0.8
const HI = 2.0

const pos = (v: number) => ((Math.min(HI, Math.max(LO, v)) - LO) / (HI - LO)) * 100

function band(ratio: number, threshold: number): { label: string; tone: string } {
  if (ratio >= threshold) return { label: 'Elevated', tone: 'over' }
  if (ratio >= threshold * 0.85) return { label: 'Moderate', tone: 'caution' }
  return { label: 'Low', tone: 'safe' }
}

export default function InjuryPanel({
  injury,
  load,
  absorbers,
  solving,
  onSolve,
  onClear,
  onAbsorb,
}: Props) {
  const { peak_acwr: ratio, threshold_acwr: threshold } = injury
  const { label, tone } = band(ratio, threshold)

  return (
    <section className={`panel injury ${tone}`}>
      <div className="panel-head">
        <h2>Load ratio</h2>
        <span className={`band-chip ${tone}`}>{label}</span>
      </div>

      <div className="ratio-headline">
        <span className="ratio-value">{ratio.toFixed(2)}</span>
        <span className="ratio-vs">/ {threshold.toFixed(2)} threshold</span>
      </div>
      <p className="ratio-what">
        Peak acute:chronic training load — how sharply this plan ramps, against the line
        you set.
      </p>

      {/* Read-only. Deliberately no thumb, no hover, no pointer cursor: this is a
          derived output, not something the athlete gets to set. */}
      <div className="meter" role="img"
        aria-label={`Peak acute to chronic ratio ${ratio.toFixed(2)} against a threshold of ${threshold.toFixed(2)}: ${label}`}>
        <div className="meter-track">
          <span className="zone safe" style={{ width: `${pos(threshold * 0.85)}%` }} />
          <span
            className="zone caution"
            style={{ width: `${pos(threshold) - pos(threshold * 0.85)}%` }}
          />
          <span className="zone over" style={{ width: `${100 - pos(threshold)}%` }} />
          <span className="meter-threshold" style={{ left: `${pos(threshold)}%` }} />
          <span className={`meter-marker ${tone}`} style={{ left: `${pos(ratio)}%` }} />
        </div>
        <div className="meter-scale">
          <span style={{ left: '0%' }}>{LO.toFixed(1)}</span>
          <span className="at-threshold" style={{ left: `${pos(threshold)}%` }}>
            {threshold.toFixed(2)}
          </span>
          <span style={{ left: '100%' }}>{HI.toFixed(1)}</span>
        </div>
      </div>

      <div className="ratio-meta">
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
        <div>
          <span>modelled injury chance</span>
          <strong className="muted-figure">{injury.chance_pct.toFixed(0)}%</strong>
        </div>
      </div>

      {/* Inverse query — a button, not a slider: the ratio is an output, so the only
          honest interaction is asking what would move it. */}
      <div className="ratio-actions">
        {ratio >= threshold ? (
          <button className="ghost-btn solve-btn" onClick={onSolve} disabled={solving}>
            {solving ? 'Solving…' : 'Solve for lower risk'}
          </button>
        ) : (
          <span className="ratio-ok">Ratio is under your threshold.</span>
        )}
        {solving && (
          <button className="link-btn" onClick={onClear}>
            clear
          </button>
        )}
      </div>

      {solving && (
        <div className="ratio-solved">
          {absorbers.length === 0 ? (
            <p className="absorb-none">
              No single change to weeks or hours brings the ratio under {threshold.toFixed(2)}.
            </p>
          ) : (
            <>
              <p className="absorb-lead">
                To get under {threshold.toFixed(2)}, change one of these:
              </p>
              <div className="relax-row">
                {absorbers.map((a) => (
                  <RelaxationCard
                    key={a.control}
                    human={`${a.label} — ${a.human}`}
                    verdict={a.resulting_verdict}
                    marginS={a.resulting_margin_s}
                    highlighted={a.helps_goal}
                    onClick={() => onAbsorb(a)}
                  />
                ))}
              </div>
              <p className="ratio-note">
                Your goal time is absent on purpose — it does not change training load, so
                it cannot move this ratio.
              </p>
            </>
          )}
        </div>
      )}

      <p className="injury-caveat">{injury.caveat}</p>
    </section>
  )
}
