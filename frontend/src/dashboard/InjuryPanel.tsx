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

/** Meter domain in percentage points, matching the headline figure's units. */
const HI = 60

const pos = (v: number) => (Math.min(HI, Math.max(0, v)) / HI) * 100

export default function InjuryPanel({
  injury,
  load,
  absorbers,
  solving,
  onSolve,
  onClear,
  onAbsorb,
}: Props) {
  const chance = injury.chance_pct
  const moderateFrom = injury.moderate_chance_pct
  const elevatedFrom = injury.threshold_chance_pct

  const { label, tone } =
    chance >= elevatedFrom
      ? { label: 'Elevated', tone: 'over' }
      : chance >= moderateFrom
        ? { label: 'Moderate', tone: 'caution' }
        : { label: 'Low', tone: 'safe' }

  return (
    <section className={`panel injury ${tone}`}>
      <div className="panel-head">
        <h2>Injury chance</h2>
        <span className={`band-chip ${tone}`}>{label}</span>
      </div>

      {/* Neutral, not green: colour beside the word "injury" reads as reassurance the
          model cannot honestly give. The meter and chip carry the status instead. */}
      <div className="ratio-headline">
        <span className="ratio-value">{chance.toFixed(0)}%</span>
        <span className="ratio-vs">over this {load.weekly_acwr.length}-week block</span>
      </div>

      {/* Read-only: a derived output, not something the athlete sets. */}
      <div
        className="meter"
        role="img"
        aria-label={`Modelled injury chance ${chance.toFixed(0)} percent: ${label}`}
      >
        <div className="meter-track">
          <span className="zone safe" style={{ width: `${pos(moderateFrom)}%` }} />
          <span
            className="zone caution"
            style={{ width: `${pos(elevatedFrom) - pos(moderateFrom)}%` }}
          />
          <span className="zone over" style={{ width: `${100 - pos(elevatedFrom)}%` }} />
          <span className="meter-threshold" style={{ left: `${pos(elevatedFrom)}%` }} />
          <span className={`meter-marker ${tone}`} style={{ left: `${pos(chance)}%` }} />
        </div>
        <div className="meter-scale">
          <span style={{ left: '0%' }}>0%</span>
          <span className="at-threshold" style={{ left: `${pos(elevatedFrom)}%` }}>
            your line
          </span>
          <span style={{ left: '100%' }}>{HI}%</span>
        </div>
      </div>

      {/* Inverse query — a button, not a slider: the figure is an output, so the only
          honest interaction is asking what would move it. */}
      <div className="ratio-actions">
        {chance >= elevatedFrom ? (
          <button className="ghost-btn solve-btn" onClick={onSolve} disabled={solving}>
            {solving ? 'Solving…' : 'Solve for lower risk'}
          </button>
        ) : (
          <span className="ratio-ok">Under the line you set.</span>
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
              No single change to weeks or hours brings this down.
            </p>
          ) : (
            <>
              <p className="absorb-lead">To lower it, change one of these:</p>
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
                it cannot move this figure.
              </p>
            </>
          )}
        </div>
      )}

      <p className="injury-caveat">{injury.caveat}</p>
    </section>
  )
}
