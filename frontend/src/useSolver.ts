import { useEffect, useRef, useState } from 'react'
import type { SolveResponse } from './solveTypes'
import type { SolveRequest } from './types'

const DEBOUNCE_MS = 100

interface State {
  result: SolveResponse | null
  error: string | null
  pending: boolean
}

/**
 * Debounced, abortable solve. Retains the last good result while a new one is in
 * flight so the dashboard never blanks mid-drag.
 */
export function useSolver(request: SolveRequest): State {
  const [state, setState] = useState<State>({ result: null, error: null, pending: true })
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const timer = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setState((s) => ({ ...s, pending: true }))

      try {
        const res = await fetch('/api/solve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
          signal: controller.signal,
        })
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          const detail = body?.detail
          const message =
            typeof detail === 'string'
              ? detail
              : Array.isArray(detail)
                ? detail.map((d: { msg?: string }) => d.msg ?? '').join('; ')
                : `Solve failed (${res.status})`
          setState((s) => ({ result: s.result, error: message, pending: false }))
          return
        }
        setState({ result: await res.json(), error: null, pending: false })
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        setState((s) => ({ result: s.result, error: (err as Error).message, pending: false }))
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [request])

  return state
}
