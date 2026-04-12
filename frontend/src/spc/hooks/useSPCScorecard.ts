import { useEffect, useState } from 'react'
import type { ScorecardRow } from '../types'
import { createRequestCache } from './requestCache'

interface UseSPCScorecardResult {
  scorecard: ScorecardRow[]
  loading: boolean
  error: string | null
}

const scorecardCache = createRequestCache<ScorecardRow[]>()

export function useSPCScorecard(
  materialId: string | null | undefined,
  dateFrom: string | null | undefined,
  dateTo: string | null | undefined,
  plantId: string | null | undefined,
): UseSPCScorecardResult {
  const [scorecard, setScorecard] = useState<ScorecardRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const cacheKey = JSON.stringify({
      materialId,
      dateFrom: dateFrom ?? null,
      dateTo: dateTo ?? null,
      plantId: plantId ?? null,
    })

    if (!materialId) {
      setScorecard([])
      setError(null)
      setLoading(false)
      return () => controller.abort()
    }

    const cachedScorecard = scorecardCache.get(cacheKey)
    if (cachedScorecard) {
      setScorecard(cachedScorecard)
      setError(null)
      setLoading(false)
      return () => controller.abort()
    }

    setLoading(true)
    setError(null)

    scorecardCache
      .load(cacheKey, controller.signal, async (signal) => {
        const res = await fetch('/api/spc/scorecard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            material_id: materialId,
            date_from: dateFrom || null,
            date_to: dateTo || null,
            plant_id: plantId ?? null,
          }),
          signal,
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.detail ?? `Error ${res.status}`)
        }
        const data = await res.json()
        return (data.scorecard ?? []) as ScorecardRow[]
      })
      .then(nextScorecard => {
        if (!controller.signal.aborted) setScorecard(nextScorecard)
      })
      .catch(err => {
        if (err?.name === 'AbortError' || controller.signal.aborted) return
        setError(String(err))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [materialId, dateFrom, dateTo, plantId])

  return { scorecard, loading, error }
}
