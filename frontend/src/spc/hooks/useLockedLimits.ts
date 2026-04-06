import { useCallback, useEffect, useState } from 'react'
import type { LockedLimits } from '../types'

interface UseLockedLimitsResult {
  lockedLimits: LockedLimits | null
  loading: boolean
  error: string | null
  saveLimits: (limitsObj: LockedLimits) => Promise<LockedLimits | null>
  deleteLimits: () => Promise<void>
}

export function useLockedLimits(
  materialId: string | null | undefined,
  micId: string | null | undefined,
  plantId: string | null | undefined,
  chartType: string | null | undefined,
): UseLockedLimitsResult {
  const [lockedLimits, setLockedLimits] = useState<LockedLimits | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchLimits = useCallback(() => {
    if (!materialId || !micId || !chartType) {
      setLockedLimits(null)
      setLoading(false)
      setError(null)
      return Promise.resolve(null)
    }

    setLoading(true)
    setError(null)
    const params = new URLSearchParams({
      material_id: materialId,
      mic_id: micId,
      chart_type: chartType,
    })
    if (plantId) params.append('plant_id', plantId)

    return fetch(`/api/spc/locked-limits?${params}`)
      .then(r => r.ok ? r.json() : r.json().then(b => Promise.reject(b.detail ?? `Error ${r.status}`)))
      .then(d => {
        const next = (d.locked_limits ?? null) as LockedLimits | null
        setLockedLimits(next)
        return next
      })
      .catch(e => {
        setError(String(e))
        return null
      })
      .finally(() => setLoading(false))
  }, [materialId, micId, plantId, chartType])

  useEffect(() => {
    setLockedLimits(null)
    void fetchLimits()
  }, [fetchLimits])

  const saveLimits = useCallback(async (limitsObj: LockedLimits) => {
    if (!materialId || !micId || !chartType) throw new Error('Missing required fields')

    setError(null)
    const response = await fetch('/api/spc/locked-limits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        material_id: materialId,
        mic_id: micId,
        plant_id: plantId ?? null,
        chart_type: chartType,
        ...limitsObj,
      }),
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      const message = body.detail ?? `Error ${response.status}`
      setError(String(message))
      throw new Error(message)
    }
    return fetchLimits()
  }, [materialId, micId, plantId, chartType, fetchLimits])

  const deleteLimits = useCallback(async () => {
    if (!materialId || !micId || !chartType) throw new Error('Missing required fields')

    setError(null)
    const response = await fetch('/api/spc/locked-limits', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        material_id: materialId,
        mic_id: micId,
        plant_id: plantId ?? null,
        chart_type: chartType,
      }),
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      const message = body.detail ?? `Error ${response.status}`
      setError(String(message))
      throw new Error(message)
    }
    setLockedLimits(null)
  }, [materialId, micId, plantId, chartType])

  return { lockedLimits, loading, error, saveLimits, deleteLimits }
}
