import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import type { ExclusionAuditSnapshot, StratifyByKey } from '../types'

interface UseSPCExclusionsArgs {
  materialId: string | null | undefined
  micId: string | null | undefined
  chartType: string | null | undefined
  plantId: string | null | undefined
  stratifyAll: boolean
  stratifyBy: StratifyByKey | null
  dateFrom: string | null | undefined
  dateTo: string | null | undefined
}

interface SaveExclusionResponse {
  event_id?: string
  user_id?: string | null
  event_ts?: string | null
}

interface UseSPCExclusionsResult {
  snapshot: ExclusionAuditSnapshot | null
  loading: boolean
  saving: boolean
  error: string | null
  saveSnapshot: (payload: Record<string, unknown>) => Promise<SaveExclusionResponse>
  setSnapshot: Dispatch<SetStateAction<ExclusionAuditSnapshot | null>>
}

export function useSPCExclusions({
  materialId,
  micId,
  chartType,
  plantId,
  stratifyAll,
  stratifyBy,
  dateFrom,
  dateTo,
}: UseSPCExclusionsArgs): UseSPCExclusionsResult {
  const [snapshot, setSnapshot] = useState<ExclusionAuditSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      material_id: materialId!,
      mic_id: micId!,
      chart_type: chartType!,
      stratify_all: String(Boolean(stratifyAll)),
    })
    if (stratifyBy) params.set('stratify_by', stratifyBy)
    if (plantId) params.set('plant_id', plantId)
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)

    fetch(`/api/spc/exclusions?${params.toString()}`, { signal: controller.signal })
      .then(res => {
        if (!res.ok) return res.json().then(body => Promise.reject(body.detail ?? `Error ${res.status}`))
        return res.json()
      })
      .then(data => {
        if (!cancelled) setSnapshot((data.exclusions ?? null) as ExclusionAuditSnapshot | null)
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
  }, [scopeReady, materialId, micId, chartType, plantId, stratifyAll, stratifyBy, dateFrom, dateTo])

  const saveSnapshot = useCallback(async (payload: Record<string, unknown>) => {
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
      const data = await res.json() as SaveExclusionResponse
      setSnapshot({
        ...(payload as ExclusionAuditSnapshot),
        event_id: data.event_id,
        excluded_count: Array.isArray(payload.excluded_points) ? payload.excluded_points.length : 0,
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
