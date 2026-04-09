import { useCallback, useEffect } from 'react'
import { useSPC } from '../SPCContext'
import { getLimitsSnapshot, mapExcludedPointsToIndices, recomputeForExcludedSet, toExcludedPoints } from '../exclusions'
import { useSPCExclusions } from './useSPCExclusions'
import type {
  ChartDataPoint,
  ExcludedPoint,
  ExclusionAuditSnapshot,
  ExclusionDialogState,
  SPCComputationResult,
  NormalityResult,
} from '../types'
import type { QuantChartType } from '../charts/ChartSettingsRail'
import type { AutoCleanLog } from './useChartSettings'
import { autoCleanPhaseI } from '../calculations'

export interface ExclusionWorkflowResult {
  exclusionsSnapshot: ExclusionAuditSnapshot | null
  exclusionsLoading: boolean
  exclusionsSaving: boolean
  exclusionsError: string | null
  handlePointClick: (index: number) => void
  handleAutoClean: () => void
  handleRestoreAll: () => void
  handleRestorePoint: (point: ExcludedPoint) => void
  handleDialogSubmit: (args: { justification: string }) => Promise<void>
  closeDialog: () => void
  setAutoCleanLog: (log: AutoCleanLog | null) => void
}

interface UseExclusionWorkflowArgs {
  materialId: string | null | undefined
  micId: string | null | undefined
  micName: string | null | undefined
  plantId: string | null | undefined
  effectiveChartType: QuantChartType | null
  isQuantitative: boolean
  quantPoints: ChartDataPoint[]
  ruleSet: 'weco' | 'nelson'
  quantNormality: NormalityResult | null
  stratifyBy: string | null
  dateFrom: string
  dateTo: string
  spc: SPCComputationResult | null
  setAutoCleanLog: (log: AutoCleanLog | null) => void
}

/**
 * Manages the full exclusion lifecycle: loading persisted exclusions, syncing to context,
 * opening/submitting/closing the justification dialog, and all point-level handlers.
 */
export function useExclusionWorkflow({
  materialId,
  micId,
  micName,
  plantId,
  effectiveChartType,
  isQuantitative,
  quantPoints,
  ruleSet,
  quantNormality,
  stratifyBy,
  dateFrom,
  dateTo,
  spc,
  setAutoCleanLog,
}: UseExclusionWorkflowArgs): ExclusionWorkflowResult {
  const { state, dispatch } = useSPC()
  const { excludedIndices, exclusionDialog } = state

  const {
    snapshot: exclusionsSnapshot,
    loading: exclusionsLoading,
    saving: exclusionsSaving,
    error: exclusionsError,
    saveSnapshot,
  } = useSPCExclusions({
    materialId: isQuantitative ? materialId : null,
    micId: isQuantitative ? micId : null,
    chartType: effectiveChartType,
    plantId: plantId ?? null,
    stratifyAll: Boolean(stratifyBy),
    stratifyBy,
    dateFrom: dateFrom || null,
    dateTo: dateTo || null,
  })

  // Sync persisted snapshot into context audit
  useEffect(() => {
    if (exclusionsSnapshot) {
      dispatch({ type: 'SET_EXCLUSION_AUDIT', payload: exclusionsSnapshot })
    } else {
      dispatch({ type: 'CLEAR_EXCLUSION_AUDIT' })
    }
  }, [dispatch, exclusionsSnapshot])

  // Sync persisted snapshot into excluded indices set
  useEffect(() => {
    if (!isQuantitative) return
    if (!quantPoints?.length) {
      if (!exclusionsSnapshot) dispatch({ type: 'SET_EXCLUSIONS', payload: [] })
      return
    }
    const nextIndices = exclusionsSnapshot
      ? mapExcludedPointsToIndices(quantPoints, exclusionsSnapshot.excluded_points ?? [])
      : []
    dispatch({ type: 'SET_EXCLUSIONS', payload: nextIndices })
  }, [dispatch, exclusionsSnapshot, isQuantitative, quantPoints])

  const openDialog = useCallback((payload: ExclusionDialogState) => {
    dispatch({ type: 'OPEN_EXCLUSION_DIALOG', payload })
  }, [dispatch])

  const closeDialog = useCallback(() => {
    if (!exclusionsSaving) dispatch({ type: 'CLOSE_EXCLUSION_DIALOG' })
  }, [dispatch, exclusionsSaving])

  const persistExclusions = useCallback(async (
    nextExcludedIndices: Set<number>,
    justification: string,
    action: string,
  ) => {
    if (!materialId || !micId || !effectiveChartType) return
    const beforeLimits = getLimitsSnapshot(spc)
    const recomputed = (recomputeForExcludedSet as (
      points: ChartDataPoint[],
      excluded: Set<number>,
      chartType: QuantChartType,
      ruleSet: 'weco' | 'nelson',
      normality: unknown,
    ) => SPCComputationResult)(quantPoints, nextExcludedIndices, effectiveChartType, ruleSet, quantNormality)

    await saveSnapshot({
      material_id: materialId,
      mic_id: micId,
      mic_name: micName ?? null,
      plant_id: plantId ?? null,
      stratify_all: Boolean(stratifyBy),
      stratify_by: stratifyBy,
      chart_type: effectiveChartType,
      date_from: dateFrom || null,
      date_to: dateTo || null,
      rule_set: ruleSet,
      justification,
      action,
      excluded_points: toExcludedPoints(quantPoints, nextExcludedIndices),
      before_limits: beforeLimits,
      after_limits: getLimitsSnapshot(recomputed),
    })

    dispatch({ type: 'SET_EXCLUSIONS', payload: [...nextExcludedIndices].sort((a, b) => a - b) })
  }, [
    materialId, micId, micName, plantId, effectiveChartType,
    quantPoints, ruleSet, quantNormality, stratifyBy, dateFrom, dateTo,
    spc, saveSnapshot, dispatch,
  ])

  const handlePointClick = useCallback((index: number) => {
    const point = quantPoints[index]
    if (!point) return
    const nextExcluded = new Set<number>(excludedIndices)
    const adding = !nextExcluded.has(index)
    if (adding) nextExcluded.add(index)
    else nextExcluded.delete(index)
    openDialog({
      action: adding ? 'manual_exclude' : 'manual_restore',
      point,
      excludedCount: nextExcluded.size,
      nextExcludedIndices: [...nextExcluded].sort((a, b) => a - b),
    })
  }, [quantPoints, excludedIndices, openDialog])

  const handleAutoClean = useCallback(() => {
    if (!spc?.indexedPoints?.length || !effectiveChartType) return
    const result = autoCleanPhaseI(spc.indexedPoints, effectiveChartType, ruleSet, spc.specConfig ?? {}) as AutoCleanLog
    openDialog({
      action: 'auto_clean_phase_i',
      excludedCount: result.cleanedIndices.size,
      nextExcludedIndices: [...result.cleanedIndices].sort((a, b) => a - b),
      autoCleanLog: result,
    })
  }, [spc, effectiveChartType, ruleSet, openDialog])

  const handleRestoreAll = useCallback(() => {
    if (excludedIndices.size === 0) return
    openDialog({
      action: 'clear_exclusions',
      excludedCount: excludedIndices.size,
      nextExcludedIndices: [],
    })
  }, [excludedIndices, openDialog])

  const handleRestorePoint = useCallback((point: ExcludedPoint) => {
    const [index] = mapExcludedPointsToIndices(quantPoints, [point])
    if (index == null) return
    const nextExcluded = new Set<number>(excludedIndices)
    nextExcluded.delete(index)
    openDialog({
      action: 'manual_restore',
      point: quantPoints[index],
      excludedCount: nextExcluded.size,
      nextExcludedIndices: [...nextExcluded].sort((a, b) => a - b),
    })
  }, [quantPoints, excludedIndices, openDialog])

  const handleDialogSubmit = useCallback(async ({ justification }: { justification: string }) => {
    if (!exclusionDialog) return
    try {
      await persistExclusions(
        new Set<number>(exclusionDialog.nextExcludedIndices ?? []),
        justification,
        exclusionDialog.action,
      )
      if (exclusionDialog.action === 'auto_clean_phase_i') {
        setAutoCleanLog((exclusionDialog.autoCleanLog as AutoCleanLog | null) ?? null)
      }
      dispatch({ type: 'CLOSE_EXCLUSION_DIALOG' })
    } catch {
      // Hook-level error state surfaces failure.
    }
  }, [exclusionDialog, persistExclusions, setAutoCleanLog, dispatch])

  return {
    exclusionsSnapshot,
    exclusionsLoading,
    exclusionsSaving,
    exclusionsError,
    handlePointClick,
    handleAutoClean,
    handleRestoreAll,
    handleRestorePoint,
    handleDialogSubmit,
    closeDialog,
    setAutoCleanLog,
  }
}
