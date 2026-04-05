import { useState, useEffect } from 'react'

export function useSPCChartData(materialId, micId, micName, dateFrom, dateTo, plantId, stratifyAll = false) {
  const [points, setPoints] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setPoints([])
    setError(null)
    if (!materialId || !micId || !micName) {
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    fetch('/api/spc/chart-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        material_id: materialId,
        mic_id: micId,
        mic_name: micName,
        date_from: dateFrom || null,
        date_to: dateTo || null,
        plant_id: plantId ?? null,
        stratify_all: stratifyAll,
      }),
    })
      .then(res => {
        if (!res.ok) return res.json().then(b => Promise.reject(b.detail ?? `Error ${res.status}`))
        return res.json()
      })
      .then(data => {
        if (!cancelled) setPoints(data.points ?? [])
      })
      .catch(err => {
        if (!cancelled) setError(String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [materialId, micId, micName, dateFrom, dateTo, plantId, stratifyAll])

  return { points, loading, error }
}
