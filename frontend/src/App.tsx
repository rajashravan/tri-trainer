import { useState } from 'react'
import OnboardingWizard from './onboarding/OnboardingWizard'
import Dashboard from './dashboard/Dashboard'
import { DEFAULT_REQUEST, raceDef } from './defaults'
import type { SolveRequest } from './types'
import './styles.css'

/**
 * Keeps the per-discipline goal fields consistent with the total the user typed, so the
 * payload always satisfies the GoalSpec invariant. The backend re-derives the
 * authoritative split from predicted current times; this is only local coherence.
 */
function resplitGoal(req: SolveRequest, total_s: number): SolveRequest['goal'] {
  const { swim_s, bike_s, run_s } = req.goal
  const transition = raceDef(req.race).transition_s
  const legs = Math.max(1, total_s - transition)
  const prior = swim_s + bike_s + run_s || 1
  return {
    total_s,
    swim_s: Math.round((swim_s / prior) * legs),
    bike_s: Math.round((bike_s / prior) * legs),
    run_s: Math.round((run_s / prior) * legs),
  }
}

/**
 * The backend requires the allocation to sum to the weekly budget. Enforced here, at the
 * one funnel every state change passes through, so no individual control can violate it
 * — the onboarding hours field previously set the budget without rescaling and produced
 * a 422. Rescaling proportionally preserves the athlete's chosen split.
 */
function normalizeAllocation(req: SolveRequest): SolveRequest {
  const { swim_h, bike_h, run_h } = req.allocation
  const budget = req.weekly_hours_available
  const sum = swim_h + bike_h + run_h
  if (Math.abs(sum - budget) < 1e-6) return req
  const k = budget / sum
  return {
    ...req,
    allocation:
      sum > 0
        ? { swim_h: swim_h * k, bike_h: bike_h * k, run_h: run_h * k }
        : { swim_h: budget / 3, bike_h: budget / 3, run_h: budget / 3 },
  }
}

export default function App() {
  const [request, setRequest] = useState<SolveRequest>(DEFAULT_REQUEST)
  const [onboarded, setOnboarded] = useState(false)

  const patch = (p: Partial<SolveRequest>) =>
    setRequest((prev) => {
      const next = { ...prev, ...p }
      if (p.goal && p.goal.total_s !== prev.goal.total_s) {
        next.goal = resplitGoal(prev, p.goal.total_s)
      }
      if (p.race && p.race !== prev.race) {
        next.goal = resplitGoal(next, next.goal.total_s)
      }
      return normalizeAllocation(next)
    })

  if (!onboarded) {
    return (
      <OnboardingWizard request={request} onChange={patch} onFinish={() => setOnboarded(true)} />
    )
  }

  return <Dashboard request={request} onApply={patch} onBack={() => setOnboarded(false)} />
}
