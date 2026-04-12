import { useCallback, useRef, useState } from 'react'
import type { MultivariateResult } from '../types'
import { createRequestCache } from './requestCache'

interface FetchMultivariateArgs {
  materialId: string
  micIds: string[]
  plantId?: string | null
  dateFrom?: string | null
  dateTo?: string | null
}

interface UseMultivariateResult {
  result: MultivariateResult | null
  loading: boolean
  error: string | null
  fetchMultivariate: (args: FetchMultivariateArgs) => void
  clear: () => void
}

export function useMultivariate(): UseMultivariateResult {
  const [result, setResult] = useState<MultivariateResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const requestIdRef = useRef(0)

  const clear = useCallback(() => {
    controllerRef.current?.abort()
    setResult(null)
    setError(null)
    setLoading(false)
  }, [])

  const fetchMultivariate = useCallback(({ materialId, micIds, plantId, dateFrom, dateTo }: FetchMultivariateArgs) => {
    if (!materialId || micIds.length < 2) return

    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    const requestId = ++requestIdRef.current
    const dedupedMicIds = Array.from(new Set(micIds)).slice(0, 8)
    const cacheKey = JSON.stringify({
      materialId,
      micIds: dedupedMicIds,
      plantId: plantId ?? null,
      dateFrom: dateFrom ?? null,
      dateTo: dateTo ?? null,
    })

    setLoading(true)
    setError(null)
    setResult(null)

    multivariateCache
      .load(cacheKey, controller.signal, async (signal) => {
        const response = await fetch('/api/spc/multivariate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal,
          body: JSON.stringify({
            material_id: materialId,
            mic_ids: dedupedMicIds,
            plant_id: plantId ?? null,
            date_from: dateFrom || null,
            date_to: dateTo || null,
          }),
        })
        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          throw new Error(body.detail ?? `Error ${response.status}`)
        }
        return await response.json() as MultivariateResult
      })
      .then(nextResult => {
        if (controller.signal.aborted || requestIdRef.current !== requestId) return
        setResult(nextResult)
      })
      .catch(err => {
        if (err?.name === 'AbortError' || controller.signal.aborted || requestIdRef.current !== requestId) return
        setError(String(err))
      })
      .finally(() => {
        if (!controller.signal.aborted && requestIdRef.current === requestId) setLoading(false)
      })
  }, [])

  return { result, loading, error, fetchMultivariate, clear }
}

const multivariateCache = createRequestCache<MultivariateResult>()
