import EffortPairInput from './EffortPairInput'
import { DISCIPLINES, type Discipline, type Effort } from '../types'

interface Props {
  efforts: Record<Discipline, Effort[]>
  onChange: (discipline: Discipline, efforts: Effort[]) => void
}

export default function StepPerformance({ efforts, onChange }: Props) {
  return (
    <>
      <h2 className="step-title">Your recent best efforts</h2>
      <p className="step-sub">
        This is what actually drives the model. Two efforts per sport let us fit your personal
        threshold; one falls back to a standard scaling curve.
      </p>

      {DISCIPLINES.map((d) => (
        <EffortPairInput
          key={d}
          discipline={d}
          efforts={efforts[d]}
          onChange={(next) => onChange(d, next)}
        />
      ))}
    </>
  )
}
