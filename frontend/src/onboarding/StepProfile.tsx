import type { AthleteProfile, Sex } from '../types'

interface Props {
  profile: AthleteProfile
  onChange: (patch: Partial<AthleteProfile>) => void
}

export default function StepProfile({ profile, onChange }: Props) {
  return (
    <>
      <h2 className="step-title">A little about you</h2>
      <p className="step-sub">Every field is pre-filled. Change what you like, or just continue.</p>

      <div className="field-grid">
        <label className="field">
          <span>Age</span>
          <input
            type="number"
            value={profile.age_years}
            min={14}
            max={90}
            onChange={(e) => onChange({ age_years: Number(e.target.value) })}
          />
        </label>

        <label className="field">
          <span>Sex</span>
          <select value={profile.sex} onChange={(e) => onChange({ sex: e.target.value as Sex })}>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="unspecified">Prefer not to say</option>
          </select>
        </label>

        <label className="field">
          <span>Height (cm)</span>
          <input
            type="number"
            value={profile.height_cm}
            min={120}
            max={230}
            onChange={(e) => onChange({ height_cm: Number(e.target.value) })}
          />
        </label>

        <label className="field">
          <span>Weight (kg)</span>
          <input
            type="number"
            value={profile.mass_kg}
            min={35}
            max={200}
            onChange={(e) => onChange({ mass_kg: Number(e.target.value) })}
          />
        </label>
      </div>

      <label className="field wide emphasis">
        <span>
          Current training hours per week
          <em> — this one matters</em>
        </span>
        <input
          type="number"
          step={0.5}
          min={0}
          max={30}
          value={profile.current_weekly_hours}
          onChange={(e) => onChange({ current_weekly_hours: Number(e.target.value) })}
        />
      </label>
      <p className="field-help">
        What you are actually doing now, not what you plan to do. This sets your starting fitness,
        which is what makes an unrealistic jump in training load show up as infeasible.
      </p>
    </>
  )
}
