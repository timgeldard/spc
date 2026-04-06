import { useCallback, useState } from 'react'
import type { CorrelationScatterResult } from '../types'

interface FetchScatterArgs {
  materialId: string
  micAId: string
  micBId: string
  plantId?: string | null
  dateFrom?: string | null
  dateTo?: string | null
}

interface UseCorrelationScatterResult {
  result: CorrelationScatterResult | null
  loading: boolean
  error: string | null
  fetchScatter: (args: FetchScatterArgs) => void
}

export function useCorrelationScatter(): UseCorrelationScatterResult {
  const [result, setResult] = useState<CorrelationScatterResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchScatter = useCallback(({ materialId, micAId, micBId, plantId, dateFrom, dateTo }: FetchScatterArgs) => {
    if (!materialId || !micAId || !micBId) return
    setLoading(true)
    setError(null)
    setResult(null)

    fetch('/api/spc/correlation-scatter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        material_id: materialId,
        mic_a_id: micAId,
        mic_b_id: micBId,
        plant_id: plantId ?? null,
        date_from: dateFrom || null,
        date_to: dateTo || null,
      }),
    })
      .then(r => r.ok ? r.json() : r.json().then(b => Promise.reject(b.detail ?? `Error ${r.status}`)))
      .then(d => setResult(d as CorrelationScatterResult))
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  return { result, loading, error, fetchScatter }
}
