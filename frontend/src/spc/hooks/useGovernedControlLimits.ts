import { useQuery } from '@tanstack/react-query'
import { fetchControlLimits } from '../../api/spc'
import { spcQueryKeys } from '../queryKeys'
import type { GovernedControlLimits } from '../types'

interface UseGovernedControlLimitsResult {
  controlLimits: GovernedControlLimits | null
  loading: boolean
  error: string | null
  isComplete: boolean
}

function hasCompleteGovernedControlLimits(limits: GovernedControlLimits | null | undefined): boolean {
  if (!limits) return false
  return (
    limits.cl != null &&
    limits.ucl != null &&
    limits.lcl != null &&
    limits.sigma_within != null
  )
}

export function useGovernedControlLimits(
  materialId: string | null | undefined,
  micId: string | null | undefined,
  plantId: string | null | undefined,
  dateFrom: string | null | undefined,
  dateTo: string | null | undefined,
  operationId: string | null | undefined = null,
  enabled = true,
): UseGovernedControlLimitsResult {
  const query = useQuery({
    queryKey: spcQueryKeys.controlLimits(materialId, micId, plantId, dateFrom, dateTo, operationId),
    queryFn: ({ signal }) =>
      fetchControlLimits(
        materialId as string,
        micId as string,
        plantId ?? null,
        dateFrom ?? null,
        dateTo ?? null,
        operationId ?? null,
        signal,
      ),
    enabled: Boolean(enabled && materialId && micId),
    staleTime: 5 * 60_000,
  })

  const controlLimits = materialId && micId ? (query.data ?? null) : null
  return {
    controlLimits,
    loading: query.isLoading || query.isFetching,
    error: query.error instanceof Error ? query.error.message : query.error ? String(query.error) : null,
    isComplete: hasCompleteGovernedControlLimits(controlLimits),
  }
}
