import { useCallback, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchMultivariate } from '../../api/spc'
import { spcQueryKeys } from '../queryKeys'
import type { MultivariateResult } from '../types'

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

function normalizeMicIds(micIds: string[]): string[] {
  return Array.from(new Set(micIds)).slice(0, 8)
}

function serialiseArgs(args: FetchMultivariateArgs | null): string {
  if (!args) return ''
  return JSON.stringify({
    materialId: args.materialId,
    micIds: normalizeMicIds(args.micIds),
    plantId: args.plantId ?? null,
    dateFrom: args.dateFrom ?? null,
    dateTo: args.dateTo ?? null,
  })
}

export function useMultivariate(): UseMultivariateResult {
  const [params, setParams] = useState<FetchMultivariateArgs | null>(null)

  const normalized = useMemo(() => {
    if (!params?.materialId) return null
    const micIds = normalizeMicIds(params.micIds)
    if (micIds.length < 2) return null
    return {
      materialId: params.materialId,
      micIds,
      plantId: params.plantId ?? null,
      dateFrom: params.dateFrom ?? null,
      dateTo: params.dateTo ?? null,
    }
  }, [params])

  const query = useQuery({
    queryKey: normalized
      ? spcQueryKeys.multivariate(
          normalized.materialId,
          normalized.micIds,
          normalized.plantId,
          normalized.dateFrom,
          normalized.dateTo,
        )
      : ['spc', 'multivariate', 'idle'],
    queryFn: ({ signal }) =>
      fetchMultivariate(
        normalized!.materialId,
        normalized!.micIds,
        normalized!.plantId,
        normalized!.dateFrom,
        normalized!.dateTo,
        signal,
      ),
    enabled: Boolean(normalized),
  })

  const clear = useCallback(() => {
    setParams(null)
  }, [])

  const fetchMultivariateForArgs = useCallback((args: FetchMultivariateArgs) => {
    if (!args.materialId || args.micIds.length < 2) return
    const next = {
      materialId: args.materialId,
      micIds: normalizeMicIds(args.micIds),
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
    fetchMultivariate: fetchMultivariateForArgs,
    clear,
  }
}
