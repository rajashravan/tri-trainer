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

export interface LoadProjection {
  weekly_ctl: number[]
  weekly_atl: number[]
  weekly_acwr: number[]
  peak_weekly_ctl_ramp: number
  peak_acwr: number
  weeks_above_threshold: number
  ramp_flag: boolean
  ramp_hard_violation: boolean
  ramp_note: string
}

export interface InjuryRisk {
  chance_pct: number
  peak_acwr: number
  threshold_acwr: number
  weeks_above_threshold: number
  caveat: string
}

export interface AbsorberOption {
  control: 'weekly_hours' | 'weeks'
  label: string
  new_value: number
  human: string
  resulting_chance_pct: number
  resulting_verdict: Verdict
  resulting_margin_s: number
  helps_goal: boolean
}

export interface RecoveryScore {
  value: number
  ramp_multiplier: number
  consecutive_hard_days: number
  longest_training_block: number
  min_same_discipline_gap: number
  rest_days: number
  reasons: string[]
}

export interface DayCell {
  week: number
  day: number
  discipline: 'swim' | 'bike' | 'run' | null
  is_long: boolean
  load: number
  is_blackout: boolean
  is_race: boolean
}

export interface ScheduleGrid {
  weeks: number
  cells: DayCell[]
  peak_day_load: number
  weekly_stress: number[]
  unabsorbed_stress: number
  blackout_weeks: number[]
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
  load: LoadProjection
  recovery: RecoveryScore
  schedule: ScheduleGrid
  injury: InjuryRisk
  injury_absorbers: AbsorberOption[]
  relaxations: RelaxationOption[]
  cheapest_fix: RelaxationOption | null
  warnings: string[]
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  feasible: 'Feasible',
  tight: 'Tight',
  infeasible: 'Infeasible',
}
