import { useState } from 'react'
import StepProfile from './StepProfile'
import StepPerformance from './StepPerformance'
import StepRaceAndGoal from './StepRaceAndGoal'
import type { AthleteProfile, Discipline, Effort, SolveRequest } from '../types'

interface Props {
  request: SolveRequest
  onChange: (patch: Partial<SolveRequest>) => void
  onFinish: () => void
}

const STEPS = ['You', 'Efforts', 'Race']

export default function OnboardingWizard({ request, onChange, onFinish }: Props) {
  const [step, setStep] = useState(0)
  const last = step === STEPS.length - 1

  const patchProfile = (patch: Partial<AthleteProfile>) =>
    onChange({ profile: { ...request.profile, ...patch } })

  const patchEfforts = (d: Discipline, efforts: Effort[]) =>
    onChange({ efforts: { ...request.efforts, [d]: efforts } })

  return (
    <div className="onboard-shell">
      <header className="onboard-head">
        <h1 className="brand">Can you actually do this?</h1>
        <p className="brand-sub">
          Tell us where you are and where you want to be. We will tell you whether the maths works
          — and if not, the cheapest thing to change.
        </p>
      </header>

      <div className="progress" role="tablist" aria-label="Onboarding progress">
        {STEPS.map((label, i) => (
          <button
            key={label}
            role="tab"
            aria-selected={i === step}
            className={`pip${i === step ? ' active' : ''}${i < step ? ' done' : ''}`}
            onClick={() => setStep(i)}
          >
            <span className="pip-dot">{i < step ? '✓' : i + 1}</span>
            <span className="pip-label">{label}</span>
          </button>
        ))}
      </div>

      <section className="card">
        {step === 0 && <StepProfile profile={request.profile} onChange={patchProfile} />}
        {step === 1 && <StepPerformance efforts={request.efforts} onChange={patchEfforts} />}
        {step === 2 && <StepRaceAndGoal request={request} onChange={onChange} />}
      </section>

      <footer className="onboard-foot">
        <button
          className="ghost-btn"
          type="button"
          disabled={step === 0}
          onClick={() => setStep((s) => s - 1)}
        >
          Back
        </button>

        <button className="link-btn skip" type="button" onClick={onFinish}>
          Skip — solve with these defaults
        </button>

        <button
          className="primary-btn"
          type="button"
          onClick={() => (last ? onFinish() : setStep((s) => s + 1))}
        >
          {last ? 'Solve' : 'Continue'}
        </button>
      </footer>
    </div>
  )
}
