import DurationInput from '../components/DurationInput'
import { RACES, raceDef } from '../defaults'
import type { RaceKey, SolveRequest } from '../types'

interface Props {
  request: SolveRequest
  onChange: (patch: Partial<SolveRequest>) => void
}

export default function StepRaceAndGoal({ request, onChange }: Props) {
  const def = raceDef(request.race)

  return (
    <>
      <h2 className="step-title">The race, and the goal</h2>
      <p className="step-sub">The last four numbers. Then we solve.</p>

      <div className="race-picker">
        {RACES.map((r) => (
          <button
            key={r.key}
            type="button"
            className={`race-chip${r.key === request.race ? ' active' : ''}`}
            onClick={() => onChange({ race: r.key as RaceKey })}
          >
            <span className="race-name">{r.label}</span>
            <span className="race-dist">
              {r.swim_m >= 1000 ? `${r.swim_m / 1000}k` : `${r.swim_m}m`} · {r.bike_m / 1000}k ·{' '}
              {r.run_m / 1000}k
            </span>
          </button>
        ))}
      </div>

      <div className="field-grid">
        <label className="field">
          <span>Weeks until race</span>
          <input
            type="number"
            min={1}
            max={104}
            value={request.weeks_until_race}
            onChange={(e) => onChange({ weeks_until_race: Number(e.target.value) })}
          />
        </label>

        <label className="field">
          <span>Hours available per week</span>
          <input
            type="number"
            step={0.5}
            min={0}
            max={30}
            value={request.weekly_hours_available}
            onChange={(e) => onChange({ weekly_hours_available: Number(e.target.value) })}
          />
        </label>
      </div>

      <label className="field wide emphasis">
        <span>Goal finish time</span>
        <DurationInput
          mode="clock"
          value={request.goal.total_s}
          ariaLabel="Goal finish time"
          onChange={(total_s) => onChange({ goal: { ...request.goal, total_s } })}
        />
      </label>
      <p className="field-help">
        Whole-race time including transitions ({Math.round(def.transition_s / 60)} min assumed for{' '}
        {def.label}). We will split it across the three sports for you.
      </p>
    </>
  )
}
