import { useQuery } from '@tanstack/react-query'
import { fetchScorecard } from '../../api/spc'
import type { ScorecardRow } from '../types'
import { spcQueryKeys } from '../queryKeys'

interface UseSPCScorecardResult {
  scorecard: ScorecardRow[]
  loading: boolean
  error: string | null
}

export function useSPCScorecard(
  materialId: string | null | undefined,
  dateFrom: string | null | undefined,
  dateTo: string | null | undefined,
  plantId: string | null | undefined,
): UseSPCScorecardResult {
  const query = useQuery({
    queryKey: spcQueryKeys.scorecard(materialId, dateFrom, dateTo, plantId),
    queryFn: ({ signal }) => fetchScorecard(materialId as string, dateFrom ?? null, dateTo ?? null, plantId ?? null, signal),
    enabled: Boolean(materialId),
  })

  return {
    scorecard: materialId ? (query.data ?? []) : [],
    loading: query.isLoading || query.isFetching,
    error: query.error ? String(query.error) : null,
  }
}
