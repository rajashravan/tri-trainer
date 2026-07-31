export type Discipline = 'swim' | 'bike' | 'run'
export type RaceKey = 'sprint' | 'olympic' | 'half' | 'full'
export type Sex = 'male' | 'female' | 'unspecified'

export interface Effort {
  distance_m: number
  duration_s: number
}

export interface AthleteProfile {
  age_years: number
  sex: Sex
  height_cm: number
  mass_kg: number
  current_weekly_hours: number
}

export interface Allocation {
  swim_h: number
  bike_h: number
  run_h: number
}

export interface GoalSpec {
  total_s: number
  swim_s: number
  bike_s: number
  run_s: number
}

export interface SolverSettings {
  acwr_flag_threshold: number
  max_weekly_ctl_ramp: number
  tight_margin_frac: number
  tri_run_penalty_frac: number
}

export interface SolveRequest {
  injury_target_pct?: number | null
  profile: AthleteProfile
  race: RaceKey
  efforts: Record<Discipline, Effort[]>
  weeks_until_race: number
  weekly_hours_available: number
  allocation: Allocation
  goal: GoalSpec
  settings: SolverSettings
}

export const DISCIPLINES: Discipline[] = ['swim', 'bike', 'run']

export const DISCIPLINE_LABEL: Record<Discipline, string> = {
  swim: 'Swim',
  bike: 'Bike',
  run: 'Run',
}
