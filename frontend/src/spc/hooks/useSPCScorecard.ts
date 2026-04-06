import { useEffect, useState } from 'react'
import type { ScorecardRow } from '../types'

interface UseSPCScorecardResult {
  scorecard: ScorecardRow[]
  loading: boolean
  error: string | null
}

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
    if (!materialId) {
      setScorecard([])
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    fetch('/api/spc/scorecard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        material_id: materialId,
        date_from: dateFrom || null,
        date_to: dateTo || null,
        plant_id: plantId ?? null,
      }),
    })
      .then(res => {
        if (!res.ok) return res.json().then(b => Promise.reject(b.detail ?? `Error ${res.status}`))
        return res.json()
      })
      .then(data => {
        if (!cancelled) setScorecard((data.scorecard ?? []) as ScorecardRow[])
      })
      .catch(err => {
        if (!cancelled) setError(String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [materialId, dateFrom, dateTo, plantId])

  return { scorecard, loading, error }
}
