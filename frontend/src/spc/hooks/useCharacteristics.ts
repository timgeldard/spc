import { useQuery } from '@tanstack/react-query'
import { fetchCharacteristics } from '../../api/spc'
import type { MicRef } from '../types'
import { spcQueryKeys } from '../queryKeys'

interface UseCharacteristicsResult {
  characteristics: MicRef[]
  attrCharacteristics: MicRef[]
  loading: boolean
  error: string | null
}

export function useCharacteristics(
  materialId: string | null | undefined,
  plantId: string | null | undefined,
): UseCharacteristicsResult {
  const query = useQuery({
    queryKey: spcQueryKeys.characteristics(materialId, plantId),
    queryFn: ({ signal }) => fetchCharacteristics(materialId as string, plantId ?? null, signal),
    enabled: Boolean(materialId),
    staleTime: 15 * 60_000,
  })

  return {
    characteristics: materialId ? (query.data?.characteristics ?? []) : [],
    attrCharacteristics: materialId ? (query.data?.attrCharacteristics ?? []) : [],
    loading: query.isLoading || query.isFetching,
    error: query.error ? String(query.error) : null,
  }
}
