import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteLockedLimits as deleteLockedLimitsRequest,
  fetchLockedLimits,
  saveLockedLimits as saveLockedLimitsRequest,
} from '../../api/spc'
import { spcQueryKeys } from '../queryKeys'
import type { LockedLimits } from '../types'

interface UseLockedLimitsResult {
  lockedLimits: LockedLimits | null
  loading: boolean
  error: string | null
  saveLimits: (limitsObj: LockedLimits) => Promise<LockedLimits | null>
  deleteLimits: () => Promise<void>
}

export function useLockedLimits(
  materialId: string | null | undefined,
  micId: string | null | undefined,
  plantId: string | null | undefined,
  chartType: string | null | undefined,
  operationId: string | null | undefined = null,
  unifiedMicKey: string | null | undefined = null,
  currentSpecSignature: string | null | undefined = null,
): UseLockedLimitsResult {
  const queryClient = useQueryClient()
  const queryKey = spcQueryKeys.lockedLimits(materialId, micId, plantId, chartType, operationId, unifiedMicKey)

  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      fetchLockedLimits(
        materialId as string,
        micId as string,
        chartType as string,
        plantId ?? null,
        operationId ?? null,
        unifiedMicKey ?? null,
        signal,
      ),
    enabled: Boolean(materialId && micId && chartType),
  })

  const saveMutation = useMutation({
    mutationFn: async (limitsObj: LockedLimits) => {
      await saveLockedLimitsRequest(
        materialId as string,
        micId as string,
        chartType as string,
        plantId ?? null,
        operationId ?? null,
        unifiedMicKey ?? null,
        limitsObj,
      )
      return await queryClient.fetchQuery({
        queryKey,
        queryFn: ({ signal }) =>
          fetchLockedLimits(
            materialId as string,
            micId as string,
            chartType as string,
            plantId ?? null,
            operationId ?? null,
            unifiedMicKey ?? null,
            signal,
          ),
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await deleteLockedLimitsRequest(
        materialId as string,
        micId as string,
        chartType as string,
        plantId ?? null,
        operationId ?? null,
        unifiedMicKey ?? null,
      )
    },
    onSuccess: () => {
      queryClient.setQueryData(queryKey, null)
    },
  })

  const lockedLimits = materialId && micId && chartType ? (query.data ?? null) : null
  const decoratedLockedLimits = lockedLimits
    ? {
        ...lockedLimits,
        live_spec_signature: currentSpecSignature ?? null,
        stale_spec: Boolean(
          currentSpecSignature &&
          lockedLimits.spec_signature &&
          lockedLimits.spec_signature !== currentSpecSignature,
        ),
      }
    : null

  return {
    lockedLimits: decoratedLockedLimits,
    loading: query.isLoading || query.isFetching || saveMutation.isPending || deleteMutation.isPending,
    error:
      (query.error instanceof Error ? query.error.message : query.error ? String(query.error) : null) ??
      (saveMutation.error instanceof Error ? saveMutation.error.message : saveMutation.error ? String(saveMutation.error) : null) ??
      (deleteMutation.error instanceof Error ? deleteMutation.error.message : deleteMutation.error ? String(deleteMutation.error) : null),
    saveLimits: async (limitsObj: LockedLimits) => {
      if (!materialId || !micId || !chartType) throw new Error('Missing required fields')
      return await saveMutation.mutateAsync(limitsObj)
    },
    deleteLimits: async () => {
      if (!materialId || !micId || !chartType) throw new Error('Missing required fields')
      await deleteMutation.mutateAsync()
    },
  }
}
