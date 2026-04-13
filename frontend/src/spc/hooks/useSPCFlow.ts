import { useQuery } from '@tanstack/react-query'
import { fetchProcessFlow } from '../../api/spc'
import type { ProcessFlowResult } from '../types'
import { spcQueryKeys } from '../queryKeys'

interface UseSPCFlowResult {
  flowData: ProcessFlowResult | null
  loading: boolean
  error: string | null
}

export function useSPCFlow(
  materialId?: string | null,
  dateFrom?: string | null,
  dateTo?: string | null,
  upstreamDepth = 4,
  downstreamDepth = 3,
): UseSPCFlowResult {
  const query = useQuery({
    queryKey: spcQueryKeys.processFlow(materialId, dateFrom, dateTo, upstreamDepth, downstreamDepth),
    queryFn: ({ signal }) =>
      fetchProcessFlow(materialId as string, dateFrom ?? null, dateTo ?? null, upstreamDepth, downstreamDepth, signal),
    enabled: Boolean(materialId),
  })

  return {
    flowData: materialId ? (query.data ?? null) : null,
    loading: query.isLoading || query.isFetching,
    error: query.error ? String(query.error) : null,
  }
}
