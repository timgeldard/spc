import { useCallback, useState } from 'react'
import type { CorrelationResult } from '../types'

interface FetchCorrelationArgs {
  materialId: string
  plantId?: string | null
  dateFrom?: string | null
  dateTo?: string | null
  minBatches?: number
}

interface UseCorrelationResult {
  result: CorrelationResult | null
  loading: boolean
  error: string | null
  fetchCorrelation: (args: FetchCorrelationArgs) => void
}

export function useCorrelation(): UseCorrelationResult {
  const [result, setResult] = useState<CorrelationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchCorrelation = useCallback(({ materialId, plantId, dateFrom, dateTo, minBatches = 10 }: FetchCorrelationArgs) => {
    if (!materialId) return
    setLoading(true)
    setError(null)
    setResult(null)

    fetch('/api/spc/correlation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        material_id: materialId,
        plant_id: plantId ?? null,
        date_from: dateFrom || null,
        date_to: dateTo || null,
        min_batches: minBatches,
      }),
    })
      .then(r => r.ok ? r.json() : r.json().then(b => Promise.reject(b.detail ?? `Error ${r.status}`)))
      .then(d => setResult(d as CorrelationResult))
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  return { result, loading, error, fetchCorrelation }
}
