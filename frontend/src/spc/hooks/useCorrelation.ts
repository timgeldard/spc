import { useCallback, useRef, useState } from 'react'
import type { CorrelationPair, CorrelationResult } from '../types'
import { createRequestCache } from './requestCache'

interface FetchCorrelationArgs {
  materialId: string
  plantId?: string | null
  dateFrom?: string | null
  dateTo?: string | null
  minBatches?: number
}

interface UseCorrelationResult {
  result: CorrelationResult | null
  loading: boolean
  error: string | null
  fetchCorrelation: (args: FetchCorrelationArgs) => void
}

/** Normalise backend field aliases so display components always see a consistent shape. */
function normalisePair(p: CorrelationPair): CorrelationPair {
  return {
    ...p,
    mic_a_id: p.mic_a_id ?? p.mic_a ?? '',
    mic_b_id: p.mic_b_id ?? p.mic_b ?? '',
    pearson_r: p.pearson_r ?? p.r ?? null,
    shared_batches: p.shared_batches ?? p.n ?? null,
  }
}

export function useCorrelation(): UseCorrelationResult {
  const [result, setResult] = useState<CorrelationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const requestIdRef = useRef(0)

  const fetchCorrelation = useCallback(({ materialId, plantId, dateFrom, dateTo, minBatches = 10 }: FetchCorrelationArgs) => {
    if (!materialId) return
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    const requestId = ++requestIdRef.current
    const cacheKey = JSON.stringify({
      materialId,
      plantId: plantId ?? null,
      dateFrom: dateFrom ?? null,
      dateTo: dateTo ?? null,
      minBatches,
    })
    setLoading(true)
    setError(null)
    setResult(null)

    correlationCache
      .load(cacheKey, controller.signal, async (signal) => {
        const res = await fetch('/api/spc/correlation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            material_id: materialId,
            plant_id: plantId ?? null,
            date_from: dateFrom || null,
            date_to: dateTo || null,
            min_batches: minBatches,
          }),
          signal,
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.detail ?? `Error ${res.status}`)
        }
        const data = await res.json() as CorrelationResult
        return { ...data, pairs: data.pairs.map(normalisePair) }
      })
      .then((nextResult) => {
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

  return { result, loading, error, fetchCorrelation }
}

const correlationCache = createRequestCache<CorrelationResult>()
