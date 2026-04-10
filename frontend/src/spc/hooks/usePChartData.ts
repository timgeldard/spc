import { useEffect, useState } from 'react'
import type { AttributeChartPoint } from '../types'

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

    let cancelled = false
    setLoading(true)

    fetch('/api/spc/p-chart-data', {
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
    })
      .then(r => r.ok ? r.json() : r.json().then(b => Promise.reject(b.detail ?? `Error ${r.status}`)))
      .then(d => { if (!cancelled) setPoints((d.points ?? []) as AttributeChartPoint[]) })
      .catch(e => { if (!cancelled) setError(String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [materialId, micId, operationId, dateFrom, dateTo, plantId])

  return { points, loading, error }
}
