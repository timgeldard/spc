import { useState, useEffect } from 'react'

export function useSPCFlow(materialId, dateFrom, dateTo) {
  const [flowData, setFlowData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!materialId) {
      setFlowData(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    fetch('/api/spc/process-flow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        material_id: materialId,
        date_from: dateFrom || null,
        date_to: dateTo || null,
      }),
    })
      .then(res => {
        if (!res.ok) return res.json().then(b => Promise.reject(b.detail ?? `Error ${res.status}`))
        return res.json()
      })
      .then(data => {
        if (!cancelled) setFlowData(data)
      })
      .catch(err => {
        if (!cancelled) setError(String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [materialId, dateFrom, dateTo])

  return { flowData, loading, error }
}
