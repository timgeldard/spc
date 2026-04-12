import { useCallback, useRef, useState } from 'react'
import type { CorrelationScatterResult } from '../types'
import { createRequestCache } from './requestCache'

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
  const controllerRef = useRef<AbortController | null>(null)
  const requestIdRef = useRef(0)

  const fetchScatter = useCallback(({ materialId, micAId, micBId, plantId, dateFrom, dateTo }: FetchScatterArgs) => {
    if (!materialId || !micAId || !micBId) return
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    const requestId = ++requestIdRef.current
    const cacheKey = JSON.stringify({
      materialId,
      micAId,
      micBId,
      plantId: plantId ?? null,
      dateFrom: dateFrom ?? null,
      dateTo: dateTo ?? null,
    })
    setLoading(true)
    setError(null)
    setResult(null)

    scatterCache
      .load(cacheKey, controller.signal, async (signal) => {
        const res = await fetch('/api/spc/correlation-scatter', {
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
          signal,
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.detail ?? `Error ${res.status}`)
        }
        return await res.json() as CorrelationScatterResult
      })
      .then(nextResult => {
        if (controller.signal.aborted || requestIdRef.current !== requestId) return
        setResult(nextResult)
      })
      .catch(e => {
        if (e?.name === 'AbortError' || controller.signal.aborted || requestIdRef.current !== requestId) return
        setError(String(e))
      })
      .finally(() => {
        if (!controller.signal.aborted && requestIdRef.current === requestId) setLoading(false)
      })
  }, [])

  return { result, loading, error, fetchScatter }
}

const scatterCache = createRequestCache<CorrelationScatterResult>()
