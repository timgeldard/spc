import { useQuery } from '@tanstack/react-query'
import { fetchDataQuality, type DataQualitySummary } from '../../api/spc'
import { spcQueryKeys } from '../queryKeys'

interface UseDataQualityResult {
  summary: DataQualitySummary | null
  loading: boolean
  error: string | null
}

export function useDataQuality(
  materialId: string | null | undefined,
  micId: string | null | undefined,
  plantId: string | null | undefined,
  dateFrom: string | null | undefined,
  dateTo: string | null | undefined,
  operationId: string | null | undefined,
): UseDataQualityResult {
  const query = useQuery({
    queryKey: spcQueryKeys.dataQuality(materialId, micId, plantId, dateFrom, dateTo, operationId),
    queryFn: ({ signal }) =>
      fetchDataQuality(
        materialId as string,
        micId as string,
        plantId ?? null,
        dateFrom ?? null,
        dateTo ?? null,
        operationId ?? null,
        signal,
      ),
    enabled: Boolean(materialId && micId),
    staleTime: 60_000,
  })

  return {
    summary: materialId && micId ? (query.data ?? null) : null,
    loading: query.isLoading || query.isFetching,
    error: query.error ? String(query.error) : null,
  }
}
