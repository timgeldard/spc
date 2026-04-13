import { useCallback, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchCorrelationScatter } from '../../api/spc'
import { spcQueryKeys } from '../queryKeys'
import type { CorrelationScatterResult } from '../types'

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

function serialiseArgs(args: FetchScatterArgs | null): string {
  if (!args) return ''
  return JSON.stringify({
    materialId: args.materialId,
    micAId: args.micAId,
    micBId: args.micBId,
    plantId: args.plantId ?? null,
    dateFrom: args.dateFrom ?? null,
    dateTo: args.dateTo ?? null,
  })
}

export function useCorrelationScatter(): UseCorrelationScatterResult {
  const [params, setParams] = useState<FetchScatterArgs | null>(null)

  const normalized = useMemo(() => {
    if (!params?.materialId || !params.micAId || !params.micBId) return null
    return {
      materialId: params.materialId,
      micAId: params.micAId,
      micBId: params.micBId,
      plantId: params.plantId ?? null,
      dateFrom: params.dateFrom ?? null,
      dateTo: params.dateTo ?? null,
    }
  }, [params])

  const query = useQuery({
    queryKey: normalized
      ? spcQueryKeys.correlationScatter(
          normalized.materialId,
          normalized.micAId,
          normalized.micBId,
          normalized.plantId,
          normalized.dateFrom,
          normalized.dateTo,
        )
      : ['spc', 'correlationScatter', 'idle'],
    queryFn: ({ signal }) =>
      fetchCorrelationScatter(
        normalized!.materialId,
        normalized!.micAId,
        normalized!.micBId,
        normalized!.plantId,
        normalized!.dateFrom,
        normalized!.dateTo,
        signal,
      ),
    enabled: Boolean(normalized),
  })

  const fetchScatterForArgs = useCallback((args: FetchScatterArgs) => {
    if (!args.materialId || !args.micAId || !args.micBId) return
    const next = {
      materialId: args.materialId,
      micAId: args.micAId,
      micBId: args.micBId,
      plantId: args.plantId ?? null,
      dateFrom: args.dateFrom ?? null,
      dateTo: args.dateTo ?? null,
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
    fetchScatter: fetchScatterForArgs,
  }
}
