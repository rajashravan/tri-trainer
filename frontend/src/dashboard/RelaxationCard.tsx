import { formatDuration } from '../format'
import { VERDICT_LABEL, type Verdict } from '../solveTypes'

interface Props {
  human: string
  verdict: Verdict
  marginS: number
  highlighted?: boolean
  onClick: () => void
}

const signed = (s: number) => `${s >= 0 ? '+' : '−'}${formatDuration(Math.abs(s))}`

/** Shared by the feasibility relaxations and the injury inverse solve. */
export default function RelaxationCard({
  human,
  verdict,
  marginS,
  highlighted = false,
  onClick,
}: Props) {
  return (
    <button className={`relax-card${highlighted ? ' cheapest' : ''}`} onClick={onClick}>
      <span className="relax-human">{human}</span>
      <span className={`relax-verdict ${verdict}`}>{VERDICT_LABEL[verdict]}</span>
      <span className="relax-margin">{signed(marginS)} vs goal</span>
    </button>
  )
}
