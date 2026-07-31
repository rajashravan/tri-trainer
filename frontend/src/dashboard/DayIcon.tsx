import type { DayDiscipline } from '../types'

/** Tabler-style outline icons, inlined. No icon dependency. */
export default function DayIcon({ discipline }: { discipline: DayDiscipline }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  if (discipline === 'swim') {
    return (
      <svg {...common} aria-label="Swim">
        <circle cx="16.5" cy="6.5" r="1.5" />
        <path d="M3 16.5c1.2 0 1.2 1 2.5 1s1.3-1 2.5-1 1.2 1 2.5 1 1.3-1 2.5-1 1.2 1 2.5 1 1.3-1 2.5-1" />
        <path d="M3 20c1.2 0 1.2 1 2.5 1s1.3-1 2.5-1 1.2 1 2.5 1 1.3-1 2.5-1 1.2 1 2.5 1 1.3-1 2.5-1" />
        <path d="m6 13 4-2-3.5-3 4-2 3 3" />
      </svg>
    )
  }

  if (discipline === 'bike') {
    return (
      <svg {...common} aria-label="Bike">
        <circle cx="5" cy="17.5" r="3.5" />
        <circle cx="19" cy="17.5" r="3.5" />
        <path d="M8 17.5h4l4-8M14 6h3M9.5 9.5h6" />
        <circle cx="12" cy="17.5" r="0.6" />
      </svg>
    )
  }

  if (discipline === 'run') {
    return (
      <svg {...common} aria-label="Run">
        <circle cx="15.5" cy="4.5" r="1.5" />
        <path d="m13 21 1.5-5-3-2.5.5-4.5-3.5 2L7 13" />
        <path d="m11.5 9 3.5-1.5 3 3 2.5.5" />
        <path d="m14.5 16 2.5 2 .5 3" />
      </svg>
    )
  }

  return (
    <svg {...common} aria-label="Rest">
      <path d="M18 14.3A7.3 7.3 0 0 1 9.7 6a7.5 7.5 0 1 0 8.3 8.3z" />
    </svg>
  )
}
