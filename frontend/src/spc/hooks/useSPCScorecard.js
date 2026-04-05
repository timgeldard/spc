import { useState, useEffect } from 'react'

export function useSPCScorecard(materialId, dateFrom, dateTo, plantId) {
  const [scorecard, setScorecard] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

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
        if (!cancelled) setScorecard(data.scorecard ?? [])
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
