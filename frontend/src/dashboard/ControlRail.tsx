import { formatClock } from '../format'
import { DISCIPLINE_LABEL, DISCIPLINES, type SolveRequest } from '../types'

interface Props {
  request: SolveRequest
  onChange: (patch: Partial<SolveRequest>) => void
}

/** Rescale the allocation so it always sums to the budget. */
function scaled(request: SolveRequest, budget: number) {
  const prior =
    request.allocation.swim_h + request.allocation.bike_h + request.allocation.run_h
  const k = prior > 0 ? budget / prior : 0
  return {
    swim_h: request.allocation.swim_h * k,
    bike_h: request.allocation.bike_h * k,
    run_h: request.allocation.run_h * k,
  }
}

export default function ControlRail({ request, onChange }: Props) {
  const budget = request.weekly_hours_available
  const alloc = request.allocation

  /**
   * Zero-sum: raising one discipline drains the other two proportionally, so the three
   * always sum to the budget. Independent sliders would let the user add hours
   * everywhere, which removes the scarcity the whole tool is about.
   */
  const setDiscipline = (d: 'swim' | 'bike' | 'run', value: number) => {
    const next = Math.max(0, Math.min(budget, value))
    const others = DISCIPLINES.filter((x) => x !== d)
    const remainder = budget - next
    const priorOthers = others.reduce((sum, x) => sum + alloc[`${x}_h`], 0)
    const out = { ...alloc, [`${d}_h`]: next }
    others.forEach((x) => {
      out[`${x}_h`] =
        priorOthers > 0 ? (remainder * alloc[`${x}_h`]) / priorOthers : remainder / 2
    })
    onChange({ allocation: out })
  }

  return (
    <aside className="rail">
      <div className="rail-block">
        <label className="rail-label">
          Weeks until race <strong>{request.weeks_until_race}</strong>
        </label>
        <input
          type="range"
          min={1}
          max={52}
          step={1}
          value={request.weeks_until_race}
          onChange={(e) => onChange({ weeks_until_race: Number(e.target.value) })}
        />
      </div>

      <div className="rail-block">
        <label className="rail-label">
          Hours per week <strong>{budget.toFixed(1)}</strong>
        </label>
        <input
          type="range"
          min={1}
          max={25}
          step={0.5}
          value={budget}
          onChange={(e) => {
            const next = Number(e.target.value)
            onChange({ weekly_hours_available: next, allocation: scaled(request, next) })
          }}
        />
        <span className="rail-sub">now training {request.profile.current_weekly_hours} h/week</span>
      </div>

      <div className="rail-block">
        <label className="rail-label">
          Goal finish <strong>{formatClock(request.goal.total_s)}</strong>
        </label>
        <input
          type="range"
          min={10800}
          max={36000}
          step={60}
          value={request.goal.total_s}
          onChange={(e) =>
            onChange({ goal: { ...request.goal, total_s: Number(e.target.value) } })
          }
        />
      </div>

      <div className="rail-block zero-sum">
        <label className="rail-label">
          Allocation <span className="rail-note">zero-sum · {budget.toFixed(1)} h</span>
        </label>
        <div className="alloc-bar">
          {DISCIPLINES.map((d) => (
            <div
              key={d}
              className={`alloc-seg ${d}`}
              style={{ flexGrow: Math.max(0.001, alloc[`${d}_h`]) }}
              title={`${DISCIPLINE_LABEL[d]} ${alloc[`${d}_h`].toFixed(1)} h`}
            >
              {alloc[`${d}_h`] / budget > 0.12 && (
                <span>{alloc[`${d}_h`].toFixed(1)}</span>
              )}
            </div>
          ))}
        </div>
        {DISCIPLINES.map((d) => (
          <div className="alloc-row" key={d}>
            <span className={`swatch ${d}`} />
            <span className="alloc-name">{DISCIPLINE_LABEL[d]}</span>
            <input
              type="range"
              min={0}
              max={budget}
              step={0.25}
              value={alloc[`${d}_h`]}
              onChange={(e) => setDiscipline(d, Number(e.target.value))}
            />
            <span className="alloc-val">{alloc[`${d}_h`].toFixed(1)}</span>
          </div>
        ))}
      </div>
    </aside>
  )
}
