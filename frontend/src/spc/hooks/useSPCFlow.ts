import { useState, useEffect } from 'react'
import type { ProcessFlowResult } from '../types'
import { createRequestCache } from './requestCache'

interface UseSPCFlowResult {
  flowData: ProcessFlowResult | null
  loading: boolean
  error: string | null
}

const processFlowCache = createRequestCache<ProcessFlowResult>()

export function useSPCFlow(
  materialId?: string | null,
  dateFrom?: string | null,
  dateTo?: string | null,
  upstreamDepth = 4,
  downstreamDepth = 3,
): UseSPCFlowResult {
  const [flowData, setFlowData] = useState<ProcessFlowResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const cacheKey = JSON.stringify({
      materialId,
      dateFrom: dateFrom ?? null,
      dateTo: dateTo ?? null,
      upstreamDepth,
      downstreamDepth,
    })

    if (!materialId) {
      setFlowData(null)
      setError(null)
      setLoading(false)
      return () => controller.abort()
    }

    const cachedFlow = processFlowCache.get(cacheKey)
    if (cachedFlow) {
      setFlowData(cachedFlow)
      setError(null)
      setLoading(false)
      return () => controller.abort()
    }

    setLoading(true)
    setError(null)

    processFlowCache
      .load(cacheKey, controller.signal, async (signal) => {
        const res = await fetch('/api/spc/process-flow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            material_id: materialId,
            date_from: dateFrom || null,
            date_to: dateTo || null,
            upstream_depth: upstreamDepth,
            downstream_depth: downstreamDepth,
          }),
          signal,
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.detail ?? `Error ${res.status}`)
        }
        return await res.json() as ProcessFlowResult
      })
      .then(data => {
        if (!controller.signal.aborted) setFlowData(data)
      })
      .catch(err => {
        if (err?.name === 'AbortError' || controller.signal.aborted) return
        setError(String(err))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [materialId, dateFrom, dateTo, upstreamDepth, downstreamDepth])

  return { flowData, loading, error }
}
