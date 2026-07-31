import type { Discipline } from './types'

export type Verdict = 'feasible' | 'tight' | 'infeasible'

export interface DisciplineModel {
  discipline: Discipline
  critical_speed_mps: number
  d_prime_m: number | null
  riegel_k: number
  fit_source: 'critical_speed' | 'riegel_fitted' | 'riegel_default'
  k_was_clamped: boolean
  zones_mps: Record<string, [number, number]>
}

export interface DisciplinePrediction {
  discipline: Discipline
  predicted_current_s: number
  goal_s: number
  projected_s: number
  required_time_reduction_pct: number
  plausible_time_reduction_pct: number
  headroom_pct: number
  allocated_hours: number
  share_of_projected_time_pct: number
  is_binding: boolean
}

export interface RelaxationOption {
  control: 'weeks' | 'weekly_hours' | 'goal_time'
  delta: number
  human: string
  resulting_verdict: Verdict
  resulting_margin_s: number
  normalized_cost: number
}

export interface SolveResponse {
  verdict: Verdict
  binding_constraint: string
  binding_explanation: string
  projected_finish_s: number
  goal_finish_s: number
  margin_s: number
  models: DisciplineModel[]
  predictions: DisciplinePrediction[]
  relaxations: RelaxationOption[]
  cheapest_fix: RelaxationOption | null
  warnings: string[]
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  feasible: 'Feasible',
  tight: 'Tight',
  infeasible: 'Infeasible',
}
