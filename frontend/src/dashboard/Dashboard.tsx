import { useMemo, useState } from 'react'
import ControlRail from './ControlRail'
import InjuryPanel from './InjuryPanel'
import WeekTemplateEditor from './WeekTemplateEditor'
import LoadHeatmap from './LoadHeatmap'
import SplitBar from './SplitBar'
import { useSolver } from '../useSolver'
import { formatClock, formatDuration } from '../format'
import { VERDICT_LABEL, type AbsorberOption } from '../solveTypes'
import { DISCIPLINE_LABEL, type SolveRequest } from '../types'

interface Props {
  request: SolveRequest
  onApply: (patch: Partial<SolveRequest>) => void
  onBack: () => void
}

const signed = (s: number) => `${s >= 0 ? '+' : '−'}${formatDuration(Math.abs(s))}`

export default function Dashboard({ request, onApply, onBack }: Props) {
  const [injuryTarget, setInjuryTarget] = useState<number | null>(null)
  const payload = useMemo(
    () => ({ ...request, injury_target_pct: injuryTarget }),
    [request, injuryTarget],
  )
  const { result, error, pending } = useSolver(payload)

  const absorb = (a: AbsorberOption) => {
    if (a.control === 'weeks') {
      onApply({ weeks_until_race: Math.round(a.new_value) })
    } else {
      const prior =
        request.allocation.swim_h + request.allocation.bike_h + request.allocation.run_h
      const k = prior > 0 ? a.new_value / prior : 0
      onApply({
        weekly_hours_available: a.new_value,
        allocation: {
          swim_h: request.allocation.swim_h * k,
          bike_h: request.allocation.bike_h * k,
          run_h: request.allocation.run_h * k,
        },
      })
    }
    setInjuryTarget(null)
  }

  if (error && !result) {
    return (
      <div className="dash">
        <div className="verdict-banner infeasible">
          <div className="verdict-word">Error</div>
          <div className="verdict-line">{error}</div>
        </div>
        <button className="ghost-btn" onClick={onBack}>
          Back to onboarding
        </button>
      </div>
    )
  }

  if (!result) {
    return <div className="dash dash-loading">Solving…</div>
  }

  const applyRelaxation = (control: string, delta: number) => {
    if (control === 'weeks') {
      onApply({ weeks_until_race: request.weeks_until_race + delta })
    } else if (control === 'weekly_hours') {
      const budget = request.weekly_hours_available + delta
      const prior =
        request.allocation.swim_h + request.allocation.bike_h + request.allocation.run_h
      const scale = prior > 0 ? budget / prior : 0
      onApply({
        weekly_hours_available: budget,
        allocation: {
          swim_h: request.allocation.swim_h * scale,
          bike_h: request.allocation.bike_h * scale,
          run_h: request.allocation.run_h * scale,
        },
      })
    } else {
      onApply({ goal: { ...request.goal, total_s: request.goal.total_s + delta } })
    }
  }

  return (
    <div className={`dash${pending ? ' pending' : ''}`}>
      <ControlRail request={request} onChange={onApply} />
      <div className="dash-main">
      {/* ① Verdict — readable across a room */}
      <section className={`verdict-banner ${result.verdict}`}>
        <div className="verdict-word">{VERDICT_LABEL[result.verdict]}</div>
        <div className="verdict-line">{result.binding_explanation}</div>
        <div className="verdict-nums">
          <span>
            <em>projected</em>
            {formatClock(result.projected_finish_s)}
          </span>
          <span>
            <em>goal</em>
            {formatClock(result.goal_finish_s)}
          </span>
          <span>
            <em>margin</em>
            {signed(result.margin_s)}
          </span>
        </div>
      </section>

      <SplitBar
        result={result}
        goal={request.goal}
        onGoal={(goal) => onApply({ goal })}
      />

      {/* ② Relaxation options + ④ sensitivity hint */}
      {result.relaxations.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <h2>Cheapest ways to make this work</h2>
            {result.cheapest_fix && (
              <span className="hint">
                Cheapest right now: <strong>{result.cheapest_fix.human}</strong>
              </span>
            )}
          </div>
          <div className="relax-row">
            {result.relaxations.map((o) => (
              <button
                key={o.control}
                className={`relax-card${o === result.cheapest_fix ||
                  o.control === result.cheapest_fix?.control
                  ? ' cheapest'
                  : ''
                  }`}
                onClick={() => applyRelaxation(o.control, o.delta)}
              >
                <span className="relax-human">{o.human}</span>
                <span className={`relax-verdict ${o.resulting_verdict}`}>
                  {VERDICT_LABEL[o.resulting_verdict]}
                </span>
                <span className="relax-margin">{signed(o.resulting_margin_s)} vs goal</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Per-discipline breakdown */}
      <section className="panel">
        <h2>Where the time is, and where the headroom is</h2>
        <table className="pred-table">
          <thead>
            <tr>
              <th>Sport</th>
              <th>Now</th>
              <th>Projected</th>
              <th>Goal</th>
              <th>Needs</th>
              <th>Plausible</th>
              <th>Headroom</th>
              <th>Hours</th>
            </tr>
          </thead>
          <tbody>
            {result.predictions.map((p) => (
              <tr key={p.discipline} className={p.is_binding ? 'binding' : ''}>
                <td>
                  {DISCIPLINE_LABEL[p.discipline]}
                  {p.is_binding && <span className="binding-tag">binding</span>}
                </td>
                <td>{formatDuration(p.predicted_current_s)}</td>
                <td>{formatDuration(p.projected_s)}</td>
                <td>{formatDuration(p.goal_s)}</td>
                <td>{p.required_time_reduction_pct.toFixed(1)}%</td>
                <td>{p.plausible_time_reduction_pct.toFixed(1)}%</td>
                <td className={p.headroom_pct < 0 ? 'neg' : 'pos'}>
                  {p.headroom_pct > 0 ? '+' : ''}
                  {p.headroom_pct.toFixed(1)}%
                </td>
                <td>{p.allocated_hours.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <WeekTemplateEditor
        template={request.week_template}
        recovery={result.recovery}
        onChange={(week_template) => onApply({ week_template })}
      />

      <LoadHeatmap
        grid={result.schedule}
        blackouts={request.blackout_days}
        onBlackouts={(blackout_days) => onApply({ blackout_days })}
      />

      <InjuryPanel
        injury={result.injury}
        load={result.load}
        absorbers={result.injury_absorbers}
        target={injuryTarget}
        onTarget={setInjuryTarget}
        onAbsorb={absorb}
      />

      {result.warnings.length > 0 && (
        <section className="panel warnings">
          <h2>Model caveats</h2>
          <ul>
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </section>
      )}

      <footer className="dash-foot">
        <button className="ghost-btn" onClick={onBack}>
          Back to onboarding
        </button>
      </footer>
      </div>
    </div>
  )
}
