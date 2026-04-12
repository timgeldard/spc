import { useEffect, useState } from 'react'
import type { AttributeChartPoint } from '../types'
import { createRequestCache } from './requestCache'

interface UsePChartDataResult {
  points: AttributeChartPoint[]
  loading: boolean
  error: string | null
}

export function usePChartData(
  materialId: string | null | undefined,
  micId: string | null | undefined,
  micName: string | null | undefined,
  dateFrom: string | null | undefined,
  dateTo: string | null | undefined,
  plantId: string | null | undefined,
  operationId: string | null | undefined = null,
): UsePChartDataResult {
  const cache = pChartCache
  const [points, setPoints] = useState<AttributeChartPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setPoints([])
    setError(null)
    if (!materialId || !micId) {
      setLoading(false)
      return
    }

    const controller = new AbortController()
    const cacheKey = JSON.stringify({
      materialId,
      micId,
      micName: micName ?? null,
      operationId: operationId ?? null,
      dateFrom: dateFrom ?? null,
      dateTo: dateTo ?? null,
      plantId: plantId ?? null,
    })
    setLoading(true)
    const cachedPoints = cache.get(cacheKey)
    if (cachedPoints) {
      setPoints(cachedPoints)
      setLoading(false)
      return () => controller.abort()
    }

    cache.load(cacheKey, controller.signal, async (signal) => {
      const res = await fetch('/api/spc/p-chart-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          material_id: materialId,
          mic_id: micId,
          mic_name: micName ?? null,
          operation_id: operationId ?? null,
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
      return (data.points ?? []) as AttributeChartPoint[]
    })
      .then(nextPoints => {
        if (!controller.signal.aborted) setPoints(nextPoints)
      })
      .catch(e => {
        if (e?.name === 'AbortError' || controller.signal.aborted) return
        setError(String(e))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => { controller.abort() }
  }, [materialId, micId, operationId, dateFrom, dateTo, plantId])

  return { points, loading, error }
}

const pChartCache = createRequestCache<AttributeChartPoint[]>()
