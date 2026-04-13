import { useQuery } from '@tanstack/react-query'
import { fetchCompareScorecard } from '../../api/spc'
import { spcQueryKeys } from '../queryKeys'
import type { CompareScorecardResult } from '../types'

interface UseCompareScorecardResult {
  result: CompareScorecardResult | null
  loading: boolean
  error: string | null
}

export function useCompareScorecard(
  materialIds: string[] | null,
  dateFrom?: string | null,
  dateTo?: string | null,
  plantId?: string | null,
): UseCompareScorecardResult {
  const normalizedIds = materialIds ? Array.from(new Set(materialIds)).sort() : null
  const query = useQuery({
    queryKey: spcQueryKeys.compareScorecard(normalizedIds, dateFrom, dateTo, plantId),
    queryFn: ({ signal }) =>
      fetchCompareScorecard(normalizedIds as string[], dateFrom ?? null, dateTo ?? null, plantId ?? null, signal),
    enabled: Boolean(normalizedIds && normalizedIds.length >= 2),
  })

  return {
    result: normalizedIds && normalizedIds.length >= 2 ? (query.data ?? null) : null,
    loading: query.isLoading || query.isFetching,
    error: query.error instanceof Error ? query.error.message : query.error ? String(query.error) : null,
  }
}
