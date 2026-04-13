import { useQuery } from '@tanstack/react-query'
import { fetchAttributeCharacteristics } from '../../api/spc'
import type { MicRef } from '../types'
import { spcQueryKeys } from '../queryKeys'

interface UseAttributeCharacteristicsResult {
  characteristics: MicRef[]
  loading: boolean
  error: string | null
}

export function useAttributeCharacteristics(
  materialId?: string | null,
  plantId?: string | null,
): UseAttributeCharacteristicsResult {
  const query = useQuery({
    queryKey: spcQueryKeys.attributeCharacteristics(materialId, plantId),
    queryFn: ({ signal }) => fetchAttributeCharacteristics(materialId as string, plantId ?? null, signal),
    enabled: Boolean(materialId),
    staleTime: 5 * 60_000,
  })

  return {
    characteristics: materialId ? (query.data ?? []) : [],
    loading: query.isLoading || query.isFetching,
    error: query.error instanceof Error ? query.error.message : query.error ? String(query.error) : null,
  }
}
