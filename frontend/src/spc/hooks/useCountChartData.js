import { useState, useEffect } from 'react'

export function useCountChartData(materialId, micId, micName, dateFrom, dateTo, plantId, chartSubtype = 'c') {
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

    fetch('/api/spc/count-chart-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        material_id: materialId,
        mic_id: micId,
        mic_name: micName,
        date_from: dateFrom || null,
        date_to: dateTo || null,
        plant_id: plantId ?? null,
        chart_subtype: chartSubtype,
      }),
    })
      .then(r => r.ok ? r.json() : r.json().then(b => Promise.reject(b.detail ?? `Error ${r.status}`)))
      .then(d => { if (!cancelled) setPoints(d.points ?? []) })
      .catch(e => { if (!cancelled) setError(String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [materialId, micId, micName, dateFrom, dateTo, plantId, chartSubtype])

  return { points, loading, error }
}
