import { useCallback, useEffect, useState } from 'react'

export function useSPCExclusions({ materialId, micId, chartType, plantId, dateFrom, dateTo }) {
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const scopeReady = Boolean(materialId && micId && chartType)

  useEffect(() => {
    setSnapshot(null)
    setError(null)
    if (!scopeReady) {
      setLoading(false)
      return
    }

    let cancelled = false
    const controller = new AbortController()
    setLoading(true)

    const params = new URLSearchParams({
      material_id: materialId,
      mic_id: micId,
      chart_type: chartType,
    })
    if (plantId) params.set('plant_id', plantId)
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)

    fetch(`/api/spc/exclusions?${params.toString()}`, { signal: controller.signal })
      .then(res => {
        if (!res.ok) return res.json().then(body => Promise.reject(body.detail ?? `Error ${res.status}`))
        return res.json()
      })
      .then(data => {
        if (!cancelled) setSnapshot(data.exclusions ?? null)
      })
      .catch(err => {
        if (err?.name === 'AbortError') return
        if (!cancelled) setError(String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [scopeReady, materialId, micId, chartType, plantId, dateFrom, dateTo])

  const saveSnapshot = useCallback(async (payload) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/spc/exclusions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail ?? `Error ${res.status}`)
      }
      const data = await res.json()
      setSnapshot({
        ...payload,
        event_id: data.event_id,
        excluded_count: payload.excluded_points.length,
        user_id: data.user_id ?? null,
        event_ts: data.event_ts ?? null,
      })
      return data
    } catch (err) {
      setError(String(err))
      throw err
    } finally {
      setSaving(false)
    }
  }, [])

  return { snapshot, loading, saving, error, saveSnapshot, setSnapshot }
}
