import DayIcon from './DayIcon'
import type { RecoveryScore } from '../solveTypes'
import {
  DAY_NAMES,
  DISCIPLINE_LABEL,
  nextDiscipline,
  type Allocation,
  type Discipline,
  type WeekTemplate,
} from '../types'

interface Props {
  template: WeekTemplate
  recovery: RecoveryScore
  orphaned: Discipline[]
  allocation: Allocation
  onChange: (template: WeekTemplate) => void
}

export default function WeekTemplateEditor({
  template,
  recovery,
  orphaned,
  allocation,
  onChange,
}: Props) {
  /** Click cycles rest -> swim -> bike -> run. Shift-click toggles long session. */
  const handle = (index: number, shift: boolean) => {
    const days = template.days.map((d, i) => {
      if (i !== index) return d
      if (shift) {
        return d.discipline === null ? d : { ...d, is_long: !d.is_long }
      }
      const next = nextDiscipline(d.discipline)
      return { discipline: next, is_long: next === null ? false : d.is_long }
    })
    onChange({ days })
  }

  const tight = recovery.ramp_multiplier < 1

  return (
    <section className="panel week-tpl">
      <div className="panel-head">
        <h2>Your typical week</h2>
        <span className={`recovery-chip${tight ? ' tight' : ''}`}>
          {tight
            ? `safe ramp × ${recovery.ramp_multiplier.toFixed(2)}`
            : 'well spaced'}
        </span>
      </div>

      <div className="week-row">
        {template.days.map((day, i) => (
          <button
            key={i}
            type="button"
            className={`day-box ${day.discipline ?? 'rest'}${day.is_long ? ' long' : ''}`}
            onClick={(e) => handle(i, e.shiftKey)}
            title={`${DAY_NAMES[i]} — click to cycle, shift-click for long session`}
          >
            <span className="day-name">{DAY_NAMES[i]}</span>
            <span className="day-icon">
              <DayIcon discipline={day.discipline} />
            </span>
            <span className="day-tag">{day.is_long ? 'LONG' : ' '}</span>
          </button>
        ))}
      </div>

      <p className="week-help">
        Click a day to cycle rest → swim → bike → run. Shift-click to mark it a long
        session. Spacing feeds the ramp ceiling — stacked hard days lower it.
      </p>

      {orphaned.length > 0 && (
        <p className="week-orphan">
          {orphaned
            .map(
              (d) =>
                `${allocation[`${d}_h`].toFixed(1)} h/week of ${DISCIPLINE_LABEL[d].toLowerCase()}`,
            )
            .join(' and ')}{' '}
          {orphaned.length > 1 ? 'have' : 'has'} no day in your week — those hours are not
          being trained. Click a day to add one.
        </p>
      )}

      {recovery.reasons.length > 0 && (
        <ul className="week-reasons">
          {recovery.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
