import DurationInput from '../components/DurationInput'
import { EFFORT_DISTANCES } from '../defaults'
import { formatPace } from '../format'
import { DISCIPLINE_LABEL, type Discipline, type Effort } from '../types'

interface Props {
  discipline: Discipline
  efforts: Effort[]
  onChange: (efforts: Effort[]) => void
}

export default function EffortPairInput({ discipline, efforts, onChange }: Props) {
  const options = EFFORT_DISTANCES[discipline]
  const hasSecond = efforts.length > 1

  const patch = (i: number, next: Partial<Effort>) =>
    onChange(efforts.map((e, idx) => (idx === i ? { ...e, ...next } : e)))

  const toggleSecond = () => {
    if (hasSecond) {
      onChange([efforts[0]])
      return
    }
    // Seed the second effort at a longer distance than the first so the CS fit is valid.
    const longer = options.find((o) => o.m > efforts[0].distance_m) ?? options[options.length - 1]
    const scale = longer.m / efforts[0].distance_m
    onChange([efforts[0], { distance_m: longer.m, duration_s: Math.round(efforts[0].duration_s * scale) }])
  }

  return (
    <div className="effort-block">
      <div className="effort-head">
        <span className="effort-title">{DISCIPLINE_LABEL[discipline]}</span>
        <span className={`fit-badge${hasSecond ? ' strong' : ''}`}>
          {hasSecond ? 'critical speed fit' : 'Riegel default'}
        </span>
      </div>

      {efforts.map((effort, i) => (
        <div className="effort-row" key={i}>
          <select
            className="dist-select"
            aria-label={`${discipline} effort ${i + 1} distance`}
            value={effort.distance_m}
            onChange={(e) => patch(i, { distance_m: Number(e.target.value) })}
          >
            {options.map((o) => (
              <option key={o.m} value={o.m}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="effort-in">in</span>
          <DurationInput
            value={effort.duration_s}
            ariaLabel={`${discipline} effort ${i + 1} time`}
            onChange={(duration_s) => patch(i, { duration_s })}
          />
          <span className="pace-hint">{formatPace(effort.distance_m, effort.duration_s, discipline)}</span>
        </div>
      ))}

      <button className="link-btn" type="button" onClick={toggleSecond}>
        {hasSecond ? 'Remove second effort' : 'Add a second effort'}
      </button>
    </div>
  )
}
