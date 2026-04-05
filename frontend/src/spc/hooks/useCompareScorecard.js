import { useState, useEffect } from 'react'

export function useCompareScorecard(materialIds, dateFrom, dateTo, plantId) {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const materialIdsKey = JSON.stringify(materialIds ?? [])

  useEffect(() => {
    const controller = new AbortController()
    setResult(null)
    setError(null)
    if (!materialIds || materialIds.length < 2) {
      setLoading(false)
      return () => controller.abort()
    }

    setLoading(true)

    fetch('/api/spc/compare-scorecard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        material_ids: materialIds,
        date_from: dateFrom || null,
        date_to: dateTo || null,
        plant_id: plantId ?? null,
      }),
    })
      .then(r => r.ok ? r.json() : r.json().then(b => Promise.reject(b.detail ?? `Error ${r.status}`)))
      .then(d => {
        if (!controller.signal.aborted) setResult(d)
      })
      .catch(e => {
        if (e?.name === 'AbortError' || controller.signal.aborted) return
        setError(String(e))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [materialIdsKey, dateFrom, dateTo, plantId])

  return { result, loading, error }
}
