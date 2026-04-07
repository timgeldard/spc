import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSPC } from '../SPCContext'
import { autoCleanPhaseI, computeAll, computeRollingCapability } from '../calculations'
import { getLimitsSnapshot, mapExcludedPointsToIndices, recomputeForExcludedSet, toExcludedPoints } from '../exclusions'
import { useSPCChartData } from './useSPCChartData'
import { useSPCCalculations } from './useSPCCalculations'
import { useSPCExclusions } from './useSPCExclusions'
import { usePChartData } from './usePChartData'
import { useCountChartData } from './useCountChartData'
import { useLockedLimits } from './useLockedLimits'
import { useExport } from './useExport'
import type {
  AttributeChartPoint,
  ChartDataPoint,
  ExcludedPoint,
  ExclusionAuditSnapshot,
  ExclusionDialogState,
  LockedLimits,
  NormalityResult,
  SPCComputationResult,
} from '../types'
import type { AttributeChartType, QuantChartType } from '../charts/ChartSettingsRail'
import type { StratumSection } from '../charts/StratificationPanel'

// ── Types ────────────────────────────────────────────────────────────────────

interface AutoCleanLog {
  stable: boolean
  cleanedIndices: Set<number>
  iterationLog: Array<{
    iteration: number
    removedCount: number
    removedOriginalIndices: number[]
    ucl?: number | null
    cl?: number | null
    lcl?: number | null
  }>
}

export type { AutoCleanLog }

function isQuantChartType(value: string | null | undefined): value is QuantChartType {
  return value === 'imr' || value === 'xbar_r'
}

function getCapabilityHeadline(spc: SPCComputationResult | null | undefined): { label: 'Cpk' | 'Ppk'; value: number } | null {
  const cpk = spc?.capability?.cpk
  if (cpk != null) return { label: 'Cpk', value: cpk }
  const ppk = spc?.capability?.ppk
  if (ppk != null) return { label: 'Ppk', value: ppk }
  return null
}

// ── Controller interface ─────────────────────────────────────────────────────

export interface ControlChartsController {
  // Type flags
  isAttributeChart: boolean
  isPChart: boolean
  isCountChart: boolean
  isQuantitative: boolean
  effectiveChartType: QuantChartType | null
  attrChartType: AttributeChartType
  setAttrChartType: (v: AttributeChartType) => void

  // Raw data
  quantPoints: ChartDataPoint[]
  quantNormality: NormalityResult | null
  dataTruncated: boolean
  attrPoints: AttributeChartPoint[]
  countPoints: AttributeChartPoint[]
  points: Array<ChartDataPoint | AttributeChartPoint>
  loading: boolean
  error: string | null

  // SPC computation
  spc: SPCComputationResult | null
  trendData: ReturnType<typeof computeRollingCapability>
  stratumSections: StratumSection[]
  currentExcludedPoints: ExcludedPoint[]

  // Exclusions
  exclusionsSnapshot: ExclusionAuditSnapshot | null
  exclusionsLoading: boolean
  exclusionsSaving: boolean
  exclusionsError: string | null

  // Locked limits
  lockedLimits: LockedLimits | null
  lockedLimitsError: string | null
  externalLimits: LockedLimits | null
  canLockLimits: boolean

  // Display values
  totalSignals: number
  exclusionCount: number
  chartFamilyLabel: string
  capabilityHeadline: { label: 'Cpk' | 'Ppk'; value: number } | null
  stratifyLabel: string | null

  // Rolling capability
  rollingWindowSize: number
  setRollingWindowSize: (v: number) => void

  // Auto-clean log
  autoCleanLog: AutoCleanLog | null
  setAutoCleanLog: (v: AutoCleanLog | null) => void

  // Export
  exportData: ReturnType<typeof useExport>['exportData']
  exporting: boolean

  // Handlers
  handlePointClick: (index: number) => void
  handleAutoClean: () => void
  handleRestoreAll: () => void
  handleRestorePoint: (point: ExcludedPoint) => void
  handleDialogSubmit: (args: { justification: string }) => Promise<void>
  handleLockLimits: () => void
  handleDeleteLock: () => void
  closeDialog: () => void
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useControlChartsController(): ControlChartsController {
  const { state, dispatch } = useSPC()
  const {
    selectedMaterial,
    selectedMIC,
    selectedPlant,
    dateFrom,
    dateTo,
    chartTypeOverride,
    excludedIndices,
    ruleSet,
    excludeOutliers,
    exclusionAudit,
    exclusionDialog,
    stratifyBy,
    limitsMode,
  } = state

  const { exportData, exporting } = useExport()
  const [autoCleanLog, setAutoCleanLog] = useState<AutoCleanLog | null>(null)
  const [rollingWindowSize, setRollingWindowSize] = useState(20)
  const [attrChartType, setAttrChartType] = useState<AttributeChartType>('p_chart')

  useEffect(() => {
    setAttrChartType('p_chart')
  }, [selectedMIC?.mic_id])

  const isAttributeMIC = selectedMIC?.chart_type === 'p_chart'
  const isAttributeChart = isAttributeMIC
  const isPChart = isAttributeMIC && attrChartType === 'p_chart'
  const isCountChart = isAttributeMIC && ['c_chart', 'u_chart', 'np_chart'].includes(attrChartType)
  const isQuantitative = !isAttributeChart
  const baseChartType = isQuantChartType(selectedMIC?.chart_type) ? selectedMIC.chart_type : 'imr'
  const effectiveChartType: QuantChartType | null = isQuantitative
    ? (chartTypeOverride ?? baseChartType)
    : null

  const {
    points: quantPoints,
    normality: quantNormality,
    dataTruncated,
    loading: quantLoading,
    error: quantError,
  } = useSPCChartData(
    isQuantitative ? selectedMaterial?.material_id : null,
    selectedMIC?.mic_id,
    selectedMIC?.mic_name,
    dateFrom,
    dateTo,
    selectedPlant?.plant_id,
    stratifyBy,
  )

  const {
    snapshot: exclusionsSnapshot,
    loading: exclusionsLoading,
    saving: exclusionsSaving,
    error: exclusionsError,
    saveSnapshot,
  } = useSPCExclusions({
    materialId: isQuantitative ? selectedMaterial?.material_id : null,
    micId: isQuantitative ? selectedMIC?.mic_id : null,
    chartType: effectiveChartType,
    plantId: selectedPlant?.plant_id ?? null,
    stratifyAll: Boolean(stratifyBy),
    stratifyBy,
    dateFrom: dateFrom || null,
    dateTo: dateTo || null,
  })

  const { points: attrPoints, loading: attrLoading, error: attrError } = usePChartData(
    isPChart ? selectedMaterial?.material_id : null,
    selectedMIC?.mic_id,
    selectedMIC?.mic_name,
    dateFrom,
    dateTo,
    selectedPlant?.plant_id,
  )

  const { points: countPoints, loading: countLoading, error: countError } = useCountChartData(
    isCountChart ? selectedMaterial?.material_id : null,
    selectedMIC?.mic_id,
    selectedMIC?.mic_name,
    dateFrom,
    dateTo,
    selectedPlant?.plant_id,
    attrChartType === 'u_chart' ? 'u' : attrChartType === 'np_chart' ? 'np' : 'c',
  )

  const { lockedLimits, error: lockedLimitsError, saveLimits, deleteLimits } = useLockedLimits(
    isQuantitative ? selectedMaterial?.material_id : null,
    isQuantitative ? selectedMIC?.mic_id : null,
    isQuantitative ? selectedPlant?.plant_id : null,
    effectiveChartType,
  )

  const points: Array<ChartDataPoint | AttributeChartPoint> = isPChart
    ? attrPoints
    : isCountChart
      ? countPoints
      : quantPoints
  const loading = isPChart ? attrLoading : isCountChart ? countLoading : quantLoading
  const error = isPChart ? attrError : isCountChart ? countError : quantError

  const spc = useSPCCalculations(
    isQuantitative ? quantPoints : [],
    effectiveChartType ?? 'imr',
    excludedIndices,
    ruleSet,
    excludeOutliers,
    quantNormality,
  )

  const trendData = useMemo(
    () => (spc?.sorted ? computeRollingCapability(spc.sorted, rollingWindowSize, spc.specConfig ?? {}) : []),
    [spc, rollingWindowSize],
  )

  const stratumSections = useMemo<StratumSection[]>(() => {
    if (!stratifyBy || !isQuantitative || !effectiveChartType || !quantPoints.length) return []

    const effectiveExclusions = new Set<number>(excludedIndices)
    if (excludeOutliers) {
      quantPoints.forEach((point, index) => {
        if (point.is_outlier) effectiveExclusions.add(index)
      })
    }

    const grouped = new Map<string, ChartDataPoint[]>()
    quantPoints.forEach((point, index) => {
      if (effectiveExclusions.has(index)) return
      const key = point.stratify_value ?? 'Unassigned'
      const next = grouped.get(key) ?? []
      next.push(point)
      grouped.set(key, next)
    })

    return [...grouped.entries()]
      .map(([label, groupedPoints]) => ({
        label,
        pointCount: groupedPoints.length,
        spc: groupedPoints.length > 0
          ? computeAll(groupedPoints, effectiveChartType, ruleSet, { normality: quantNormality })
          : null,
      }))
      .filter(section => (section.spc?.values?.length ?? 0) > 0)
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [
    stratifyBy, isQuantitative, effectiveChartType, quantPoints,
    excludedIndices, excludeOutliers, ruleSet, quantNormality,
  ])

  const currentExcludedPoints = useMemo(
    () => (isQuantitative ? (toExcludedPoints(quantPoints, excludedIndices) as ExcludedPoint[]) : []),
    [isQuantitative, quantPoints, excludedIndices],
  )

  useEffect(() => {
    if (exclusionsSnapshot) {
      dispatch({ type: 'SET_EXCLUSION_AUDIT', payload: exclusionsSnapshot })
    } else {
      dispatch({ type: 'CLEAR_EXCLUSION_AUDIT' })
    }
  }, [dispatch, exclusionsSnapshot])

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

  // ── Derived display values ─────────────────────────────────────────────

  const externalLimits = limitsMode === 'locked' && lockedLimits ? lockedLimits : null
  const totalSignals = (spc?.signals?.length ?? 0) + (spc?.mrSignals?.length ?? 0)
  const exclusionCount = excludedIndices.size
  const chartFamilyLabel = isAttributeChart
    ? `${attrChartType.toUpperCase()} attribute chart`
    : spc?.chartType === 'xbar_r'
      ? 'X̄-R variable chart'
      : 'I-MR variable chart'
  const capabilityHeadline = getCapabilityHeadline(spc)
  const stratifyLabel = stratifyBy ? stratifyBy.replace(/_/g, ' ') : null

  const canLockLimits = Boolean(
    spc &&
    limitsMode === 'live' &&
    (((spc.chartType === 'imr' && spc.imr?.xBar != null && spc.imr?.ucl_x != null && spc.imr?.lcl_x != null) ||
      (spc.chartType === 'xbar_r' && spc.xbarR?.grandMean != null && spc.xbarR?.ucl_x != null && spc.xbarR?.lcl_x != null))),
  )

  // ── Handlers ──────────────────────────────────────────────────────────

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
    if (!selectedMaterial || !selectedMIC || !effectiveChartType) return
    const beforeLimits = getLimitsSnapshot(spc)
    const recomputed = (
      recomputeForExcludedSet as (
        points: ChartDataPoint[],
        excluded: Set<number>,
        chartType: QuantChartType,
        nextRuleSet: 'weco' | 'nelson',
        normality: unknown,
      ) => SPCComputationResult
    )(quantPoints, nextExcludedIndices, effectiveChartType, ruleSet, quantNormality)

    await saveSnapshot({
      material_id: selectedMaterial.material_id,
      mic_id: selectedMIC.mic_id,
      mic_name: selectedMIC.mic_name ?? null,
      plant_id: selectedPlant?.plant_id ?? null,
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
    selectedMaterial, selectedMIC, selectedPlant, effectiveChartType,
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
  }, [exclusionDialog, persistExclusions, dispatch])

  const handleDeleteLock = useCallback(() => {
    void deleteLimits()
  }, [deleteLimits])

  const handleLockLimits = useCallback(() => {
    if (!spc) return
    const limits: LockedLimits = spc.chartType === 'imr'
      ? {
          cl: spc.imr?.xBar,
          ucl: spc.imr?.ucl_x,
          lcl: spc.imr?.lcl_x,
          ucl_r: spc.imr?.ucl_mr,
          lcl_r: spc.imr?.lcl_mr,
          sigma_within: spc.imr?.sigmaWithin,
        }
      : {
          cl: spc.xbarR?.grandMean,
          ucl: spc.xbarR?.ucl_x,
          lcl: spc.xbarR?.lcl_x,
          ucl_r: spc.xbarR?.ucl_r,
          lcl_r: spc.xbarR?.lcl_r,
          sigma_within: spc.xbarR?.sigmaWithin,
        }
    if (limits.cl == null || limits.ucl == null || limits.lcl == null) return
    void saveLimits(limits)
  }, [spc, saveLimits])

  return {
    // Type flags
    isAttributeChart,
    isPChart,
    isCountChart,
    isQuantitative,
    effectiveChartType,
    attrChartType,
    setAttrChartType,

    // Raw data
    quantPoints,
    quantNormality,
    dataTruncated,
    attrPoints,
    countPoints,
    points,
    loading,
    error,

    // SPC computation
    spc,
    trendData,
    stratumSections,
    currentExcludedPoints,

    // Exclusions
    exclusionsSnapshot,
    exclusionsLoading,
    exclusionsSaving,
    exclusionsError,

    // Locked limits
    lockedLimits,
    lockedLimitsError,
    externalLimits,
    canLockLimits,

    // Display values
    totalSignals,
    exclusionCount,
    chartFamilyLabel,
    capabilityHeadline,
    stratifyLabel,

    // Rolling capability
    rollingWindowSize,
    setRollingWindowSize,

    // Auto-clean log
    autoCleanLog,
    setAutoCleanLog,

    // Export
    exportData,
    exporting,

    // Handlers
    handlePointClick,
    handleAutoClean,
    handleRestoreAll,
    handleRestorePoint,
    handleDialogSubmit,
    handleLockLimits,
    handleDeleteLock,
    closeDialog,
  }
}
