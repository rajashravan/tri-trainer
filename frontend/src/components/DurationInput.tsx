import { useEffect, useState } from 'react'
import { formatClock, formatDuration, parseDuration } from '../format'

interface Props {
  value: number
  onChange: (seconds: number) => void
  mode?: 'duration' | 'clock'
  ariaLabel?: string
}

/**
 * Holds raw text while the user types so intermediate states like "28:" are not
 * clobbered. Commits on every valid parse; snaps back to the canonical format on blur.
 */
export default function DurationInput({ value, onChange, mode = 'duration', ariaLabel }: Props) {
  const canonical = mode === 'clock' ? formatClock(value) : formatDuration(value)
  const [text, setText] = useState(canonical)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setText(canonical)
  }, [canonical, focused])

  const parsed = parseDuration(text)
  const invalid = text.trim() !== '' && parsed === null

  return (
    <input
      className={`dur-input${invalid ? ' invalid' : ''}`}
      value={text}
      aria-label={ariaLabel}
      inputMode="numeric"
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        setText(e.target.value)
        const next = parseDuration(e.target.value)
        if (next !== null) onChange(next)
      }}
      onBlur={() => {
        setFocused(false)
        setText(canonical)
      }}
    />
  )
}
