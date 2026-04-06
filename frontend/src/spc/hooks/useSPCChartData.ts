import { useEffect, useState } from 'react'
import type { ChartDataPoint, NormalityResult, UseSPCChartDataResult } from '../types'

interface PaginatedChartResponse {
  data?: ChartDataPoint[]
  next_cursor?: string | null
  has_more?: boolean
  normality?: NormalityResult | null
}

export function useSPCChartData(
  materialId: string | null | undefined,
  micId: string | null | undefined,
  micName: string | null | undefined,
  dateFrom: string | null | undefined,
  dateTo: string | null | undefined,
  plantId: string | null | undefined,
  stratifyAll = false,
): UseSPCChartDataResult {
  const [points, setPoints] = useState<ChartDataPoint[]>([])
  const [normality, setNormality] = useState<NormalityResult | null>(null)
  const [dataTruncated, setDataTruncated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setPoints([])
    setNormality(null)
    setDataTruncated(false)
    setError(null)
    if (!materialId || !micId || !micName) {
      setLoading(false)
      return
    }

    let cancelled = false
    const controller = new AbortController()
    setLoading(true)

    const payload = {
      material_id: materialId,
      mic_id: micId,
      mic_name: micName,
      date_from: dateFrom || null,
      date_to: dateTo || null,
      plant_id: plantId ?? null,
      stratify_all: stratifyAll,
    }

    const fetchAllPages = async () => {
      const allPoints: ChartDataPoint[] = []
      let nextCursor: string | null = null
      let hasMore = true
      let summaryNormality: NormalityResult | null = null

      while (hasMore && !cancelled) {
        const url = new URL('/api/spc/chart-data', window.location.origin)
        url.searchParams.set('limit', '1000')
        if (nextCursor) url.searchParams.set('cursor', nextCursor)
        if (allPoints.length === 0) url.searchParams.set('include_summary', 'true')

        const res = await fetch(url.pathname + url.search, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        })

        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.detail ?? `Error ${res.status}`)
        }

        const data: PaginatedChartResponse = await res.json()
        allPoints.push(...(data.data ?? []))
        hasMore = Boolean(data.has_more)
        nextCursor = data.next_cursor ?? null
        if (data.normality) summaryNormality = data.normality
      }

      if (!cancelled) {
        setPoints(allPoints)
        setNormality(summaryNormality)
        setDataTruncated(false)
      }
    }

    fetchAllPages()
      .catch(err => {
        if (!cancelled && err?.name !== 'AbortError') setError(String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [materialId, micId, micName, dateFrom, dateTo, plantId, stratifyAll])

  return { points, normality, dataTruncated, loading, error }
}

