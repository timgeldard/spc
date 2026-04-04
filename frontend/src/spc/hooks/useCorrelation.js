import { useState, useCallback } from 'react'

export function useCorrelation() {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchCorrelation = useCallback(({ materialId, plantId, dateFrom, dateTo, minBatches = 10 }) => {
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
      .then(d => setResult(d))
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  return { result, loading, error, fetchCorrelation }
}
