import type { Discipline, RaceKey, SolveRequest } from './types'

export interface RaceDef {
  key: RaceKey
  label: string
  swim_m: number
  bike_m: number
  run_m: number
  transition_s: number
}

export const RACES: RaceDef[] = [
  { key: 'sprint', label: 'Sprint', swim_m: 750, bike_m: 20000, run_m: 5000, transition_s: 240 },
  { key: 'olympic', label: 'Olympic', swim_m: 1500, bike_m: 40000, run_m: 10000, transition_s: 300 },
  { key: 'half', label: 'Half (70.3)', swim_m: 1900, bike_m: 90000, run_m: 21100, transition_s: 480 },
  { key: 'full', label: 'Full (140.6)', swim_m: 3800, bike_m: 180000, run_m: 42200, transition_s: 600 },
]

export const raceDef = (key: RaceKey): RaceDef => RACES.find((r) => r.key === key)!

/** Preset effort distances per discipline — picking beats typing for a <60s onboarding. */
export const EFFORT_DISTANCES: Record<Discipline, { m: number; label: string }[]> = {
  swim: [
    { m: 100, label: '100 m' },
    { m: 400, label: '400 m' },
    { m: 750, label: '750 m' },
    { m: 1500, label: '1500 m' },
    { m: 1900, label: '1900 m' },
  ],
  bike: [
    { m: 10000, label: '10 km' },
    { m: 20000, label: '20 km' },
    { m: 40000, label: '40 km' },
    { m: 90000, label: '90 km' },
  ],
  run: [
    { m: 1000, label: '1 km' },
    { m: 5000, label: '5 km' },
    { m: 10000, label: '10 km' },
    { m: 21100, label: 'Half mar.' },
  ],
}

/**
 * Seeded defaults (SPEC §9). A realistic 40y age-grouper, 16 weeks from a 70.3,
 * with the goal deliberately set ~9% faster than their predicted current split so
 * the dashboard opens in a tight/infeasible state with live relaxation options.
 */
export const DEFAULT_REQUEST: SolveRequest = {
  profile: {
    age_years: 40,
    sex: 'male',
    height_cm: 178,
    mass_kg: 75,
    current_weekly_hours: 5,
  },
  race: 'half',
  efforts: {
    swim: [
      { distance_m: 400, duration_s: 420 },
      { distance_m: 1500, duration_s: 1680 },
    ],
    bike: [
      { distance_m: 20000, duration_s: 2160 },
      { distance_m: 40000, duration_s: 4500 },
    ],
    run: [
      { distance_m: 5000, duration_s: 1350 },
      { distance_m: 10000, duration_s: 2820 },
    ],
  },
  weeks_until_race: 16,
  weekly_hours_available: 8,
  allocation: { swim_h: 1.5, bike_h: 4, run_h: 2.5 },
  goal: { total_s: 18720, swim_s: 2026, bike_s: 9994, run_s: 6220 },
  settings: {
    acwr_flag_threshold: 1.5,
    max_weekly_ctl_ramp: 8,
    tight_margin_frac: 0.02,
    tri_run_penalty_frac: 0.06,
  },
}
