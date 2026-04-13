import { useCallback, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchCorrelation } from '../../api/spc'
import { spcQueryKeys } from '../queryKeys'
import type { CorrelationResult } from '../types'

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

function serialiseArgs(args: FetchCorrelationArgs | null): string {
  if (!args) return ''
  return JSON.stringify({
    materialId: args.materialId,
    plantId: args.plantId ?? null,
    dateFrom: args.dateFrom ?? null,
    dateTo: args.dateTo ?? null,
    minBatches: args.minBatches ?? 10,
  })
}

export function useCorrelation(): UseCorrelationResult {
  const [params, setParams] = useState<FetchCorrelationArgs | null>(null)

  const normalized = useMemo(() => {
    if (!params?.materialId) return null
    return {
      materialId: params.materialId,
      plantId: params.plantId ?? null,
      dateFrom: params.dateFrom ?? null,
      dateTo: params.dateTo ?? null,
      minBatches: params.minBatches ?? 10,
    }
  }, [params])

  const query = useQuery({
    queryKey: normalized
      ? spcQueryKeys.correlation(
          normalized.materialId,
          normalized.plantId,
          normalized.dateFrom,
          normalized.dateTo,
          normalized.minBatches,
        )
      : ['spc', 'correlation', 'idle'],
    queryFn: ({ signal }) =>
      fetchCorrelation(
        normalized!.materialId,
        normalized!.plantId,
        normalized!.dateFrom,
        normalized!.dateTo,
        normalized!.minBatches,
        signal,
      ),
    enabled: Boolean(normalized),
  })

  const fetchCorrelationForArgs = useCallback((args: FetchCorrelationArgs) => {
    if (!args.materialId) return
    const next = {
      materialId: args.materialId,
      plantId: args.plantId ?? null,
      dateFrom: args.dateFrom ?? null,
      dateTo: args.dateTo ?? null,
      minBatches: args.minBatches ?? 10,
    }
    if (serialiseArgs(params) === serialiseArgs(next)) {
      void query.refetch()
      return
    }
    setParams(next)
  }, [params, query])

  return {
    result: normalized ? (query.data ?? null) : null,
    loading: query.isLoading || query.isFetching,
    error: query.error instanceof Error ? query.error.message : query.error ? String(query.error) : null,
    fetchCorrelation: fetchCorrelationForArgs,
  }
}
