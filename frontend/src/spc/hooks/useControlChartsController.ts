import { useCallback, useMemo } from 'react'
import { shallowEqual, useSPCSelector } from '../SPCContext'
import { toExcludedPoints } from '../exclusions'
import { useLockedLimits } from './useLockedLimits'
import { useGovernedControlLimits } from './useGovernedControlLimits'
import { useExport } from './useExport'
import { useChartSettings } from './useChartSettings'
import { useChartData } from './useChartData'
import { useExclusionWorkflow } from './useExclusionWorkflow'
import { useSPCComputedAnalytics } from './useSPCComputedAnalytics'
import type {
  AttributeChartPoint,
  ChartDataPoint,
  ExcludedPoint,
  ExclusionAuditSnapshot,
  GovernedControlLimits,
  LockedLimits,
  NormalityResult,
  RollingCapabilityPoint,
  SPCComputationResult,
  SpecDriftWarning,
} from '../types'
import type { AttributeChartType, QuantChartType } from '../charts/ChartSettingsRail'
import type { StratumSection } from '../charts/StratificationPanel'
import type { AutoCleanLog } from './useChartSettings'

export type { AutoCleanLog }

function getCapabilityHeadline(spc: SPCComputationResult | null | undefined): { label: 'Cpk' | 'Ppk'; value: number } | null {
  const cpk = spc?.capability?.cpk
  if (cpk != null) return { label: 'Cpk', value: cpk }
  const ppk = spc?.capability?.ppk
  if (ppk != null) return { label: 'Ppk', value: ppk }
  return null
}

function buildSpecSignature(points: ChartDataPoint[]): string | null {
  const signatureSet = new Set(
    points.map(point => [
      point.lsl ?? '_',
      point.usl ?? '_',
      point.nominal ?? '_',
    ].join('|')),
  )
  if (signatureSet.size !== 1) return null
  return Array.from(signatureSet)[0] ?? null
}

export interface ControlChartsController {
  // Type flags
  isAttributeChart: boolean
  isPChart: boolean
  isCountChart: boolean
  isQuantitative: boolean
  effectiveChartType: QuantChartType | null
  attrChartType: AttributeChartType
  setAttrChartType: (v: AttributeChartType) => void
  ewmaLambda: number
  setEwmaLambda: (v: number) => void
  ewmaL: number
  setEwmaL: (v: number) => void
  cusumK: number
  setCusumK: (v: number) => void
  cusumH: number
  setCusumH: (v: number) => void

  // Raw data
  quantPoints: ChartDataPoint[]
  quantNormality: NormalityResult | null
  specDrift: SpecDriftWarning | null
  dataTruncated: boolean
  hydrating: boolean
  attrPoints: AttributeChartPoint[]
  countPoints: AttributeChartPoint[]
  points: Array<ChartDataPoint | AttributeChartPoint>
  loading: boolean
  analyticsLoading: boolean
  analyticsError: string | null
  error: string | null

  // SPC computation
  spc: SPCComputationResult | null
  trendData: RollingCapabilityPoint[]
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
  lockedLimitsWarning: string | null
  externalLimits: LockedLimits | null
  governedLimits: GovernedControlLimits | null
  governedLimitsError: string | null
  canLockLimits: boolean

  // Display values
  totalSignals: number
  exclusionCount: number
  chartFamilyLabel: string
  capabilityHeadline: { label: 'Cpk' | 'Ppk'; value: number } | null
  stratifyLabel: string | null
  limitsSourceLabel: string
  limitsSourceDetail: string | null
  limitsSourceTone: 'info' | 'warning' | null

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

export function useControlChartsController(): ControlChartsController {
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
    stratifyBy,
    limitsMode,
  } = useSPCSelector(
    state => ({
      selectedMaterial: state.selectedMaterial,
      selectedMIC: state.selectedMIC,
      selectedPlant: state.selectedPlant,
      dateFrom: state.dateFrom,
      dateTo: state.dateTo,
      chartTypeOverride: state.chartTypeOverride,
      excludedIndices: state.excludedIndices,
      ruleSet: state.ruleSet,
      excludeOutliers: state.excludeOutliers,
      exclusionAudit: state.exclusionAudit,
      stratifyBy: state.stratifyBy,
      limitsMode: state.limitsMode,
    }),
    shallowEqual,
  )
  const { exportData, exporting } = useExport()

  // ── Local UI state ──────────────────────────────────────────────────────
  const {
    attrChartType, setAttrChartType,
    ewmaLambda, setEwmaLambda,
    ewmaL, setEwmaL,
    cusumK, setCusumK,
    cusumH, setCusumH,
    rollingWindowSize, setRollingWindowSize,
    autoCleanLog, setAutoCleanLog,
  } = useChartSettings(selectedMIC?.mic_id)

  // ── Data fetching ───────────────────────────────────────────────────────
  const {
    isAttributeChart, isPChart, isCountChart, isQuantitative, effectiveChartType,
    quantPoints, quantNormality, specDrift, dataTruncated, hydrating,
    attrPoints, countPoints, points, loading, error,
  } = useChartData(
    selectedMaterial?.material_id,
    selectedMIC?.mic_id,
    selectedMIC?.mic_name,
    selectedMIC?.chart_type,
    chartTypeOverride,
    attrChartType,
    dateFrom,
    dateTo,
    selectedPlant?.plant_id,
    stratifyBy,
    selectedMIC?.operation_id,
  )

  // ── SPC computation ─────────────────────────────────────────────────────
  const {
    spc,
    trendData,
    stratumSections,
    analyticsLoading,
    analyticsError,
  } = useSPCComputedAnalytics({
    points: isQuantitative ? quantPoints : [],
    chartType: isQuantitative ? (effectiveChartType ?? 'imr') : null,
    excludedIndices,
    ruleSet,
    excludeOutliers,
    normality: quantNormality,
    stratifyBy,
    rollingWindowSize,
    ewmaLambda,
    ewmaL,
    cusumK,
    cusumH,
    governedLimits: null,
    useGovernedLimits: false,
  })

  // ── Exclusion workflow ──────────────────────────────────────────────────
  const {
    exclusionsSnapshot, exclusionsLoading, exclusionsSaving, exclusionsError,
    handlePointClick, handleAutoClean, handleRestoreAll, handleRestorePoint,
    handleDialogSubmit, closeDialog,
  } = useExclusionWorkflow({
    materialId: selectedMaterial?.material_id,
    micId: selectedMIC?.mic_id,
    micName: selectedMIC?.mic_name,
    operationId: selectedMIC?.operation_id,
    plantId: selectedPlant?.plant_id,
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
  })

  // ── Derived values ──────────────────────────────────────────────────────
  const currentExcludedPoints = useMemo(
    () => (isQuantitative ? (toExcludedPoints(quantPoints, excludedIndices) as ExcludedPoint[]) : []),
    [isQuantitative, quantPoints, excludedIndices],
  )
  const liveSpecSignature = useMemo(
    () => (isQuantitative ? buildSpecSignature(quantPoints) : null),
    [isQuantitative, quantPoints],
  )
  const useDerivedLimitsMode = (
    !isQuantitative ||
    limitsMode === 'locked' ||
    effectiveChartType === 'ewma' ||
    effectiveChartType === 'cusum' ||
    excludedIndices.size > 0 ||
    excludeOutliers
  )
  const shouldFetchGovernedLimits = isQuantitative && limitsMode === 'live'
  const {
    controlLimits: governedLimits,
    loading: governedLimitsLoading,
    error: governedLimitsError,
    isComplete: governedLimitsComplete,
  } = useGovernedControlLimits(
    isQuantitative ? selectedMaterial?.material_id : null,
    isQuantitative ? selectedMIC?.mic_id : null,
    isQuantitative ? selectedPlant?.plant_id : null,
    dateFrom ?? null,
    dateTo ?? null,
    isQuantitative ? selectedMIC?.operation_id : null,
    shouldFetchGovernedLimits,
  )
  const shouldApplyGovernedLimits = isQuantitative && limitsMode === 'live' && !useDerivedLimitsMode && governedLimitsComplete
  const {
    spc: governedSpc,
    trendData: governedTrendData,
    stratumSections: governedStratumSections,
    analyticsLoading: governedAnalyticsLoading,
    analyticsError: governedAnalyticsError,
  } = useSPCComputedAnalytics({
    points: isQuantitative ? quantPoints : [],
    chartType: isQuantitative ? (effectiveChartType ?? 'imr') : null,
    excludedIndices,
    ruleSet,
    excludeOutliers,
    normality: quantNormality,
    stratifyBy,
    rollingWindowSize,
    ewmaLambda,
    ewmaL,
    cusumK,
    cusumH,
    governedLimits,
    useGovernedLimits: shouldApplyGovernedLimits,
  })
  const effectiveSpc = shouldApplyGovernedLimits ? governedSpc : spc
  const effectiveTrendData = shouldApplyGovernedLimits ? governedTrendData : trendData
  const effectiveStratumSections = shouldApplyGovernedLimits ? governedStratumSections : stratumSections
  const effectiveAnalyticsLoading = governedLimitsLoading || (shouldApplyGovernedLimits ? governedAnalyticsLoading : analyticsLoading)
  const effectiveAnalyticsError = shouldApplyGovernedLimits ? governedAnalyticsError : analyticsError

  const { lockedLimits, error: lockedLimitsError, saveLimits, deleteLimits } = useLockedLimits(
    isQuantitative ? selectedMaterial?.material_id : null,
    isQuantitative ? selectedMIC?.mic_id : null,
    isQuantitative ? selectedPlant?.plant_id : null,
    effectiveChartType,
    isQuantitative ? selectedMIC?.operation_id : null,
    isQuantitative ? selectedMIC?.unified_mic_key : null,
    liveSpecSignature,
  )

  const lockedLimitsWarning = lockedLimits?.stale_spec
    ? 'Locked limits were saved against a different live specification signature. Review the lock before using locked mode.'
    : null
  const externalLimits = limitsMode === 'locked' && lockedLimits ? lockedLimits : null
  const totalSignals = (effectiveSpc?.signals?.length ?? 0) + (effectiveSpc?.mrSignals?.length ?? 0)
  const exclusionCount = excludedIndices.size
  const chartFamilyLabel = isAttributeChart
    ? `${attrChartType.toUpperCase()} attribute chart`
    : spc?.chartType === 'xbar_r'
      ? 'X̄-R variable chart'
      : spc?.chartType === 'xbar_s'
        ? 'X̄-S variable chart'
        : spc?.chartType === 'ewma'
          ? `EWMA variable chart (λ=${ewmaLambda.toFixed(2)}, L=${ewmaL.toFixed(1)})`
          : spc?.chartType === 'cusum'
            ? `CUSUM variable chart (k=${cusumK.toFixed(2)}, h=${cusumH.toFixed(1)})`
      : 'I-MR variable chart'
  const capabilityHeadline = getCapabilityHeadline(effectiveSpc)
  const stratifyLabel = stratifyBy ? stratifyBy.replace(/_/g, ' ') : null
  const hasActiveLockedLimits = limitsMode === 'locked' && Boolean(lockedLimits)
  const limitsSourceLabel = hasActiveLockedLimits
    ? 'Locked'
    : shouldApplyGovernedLimits
      ? 'Governed'
      : 'Derived'
  const limitsSourceTone: 'info' | 'warning' | null = hasActiveLockedLimits
    ? 'info'
    : (!useDerivedLimitsMode && shouldFetchGovernedLimits && !governedLimitsComplete && !governedLimitsLoading)
      ? 'warning'
      : useDerivedLimitsMode && isQuantitative
        ? 'info'
        : null
  const limitsSourceDetail = hasActiveLockedLimits
    ? 'Using the persisted locked baseline for this chart scope.'
    : shouldApplyGovernedLimits
      ? 'Live control limits and default capability values are sourced from governed Databricks metrics.'
      : isQuantitative
        ? (
            (governedLimitsError && !useDerivedLimitsMode)
              ? 'Governed control limits were unavailable, so this chart is using limits derived from the current point set.'
              : (effectiveChartType === 'ewma' || effectiveChartType === 'cusum')
                ? 'EWMA and CUSUM remain locally derived because they depend on ordered point-by-point recalculation.'
                : exclusionCount > 0 || excludeOutliers
                  ? 'Active exclusions or outlier filtering require locally derived control limits for what-if analysis.'
                  : (shouldFetchGovernedLimits && !governedLimitsComplete && !governedLimitsLoading)
                    ? 'Governed control limits were incomplete, so this chart fell back to locally derived limits.'
                    : null
          )
        : null

  const canLockLimits = Boolean(
    effectiveSpc &&
    !specDrift?.detected &&
    liveSpecSignature &&
    limitsMode === 'live' &&
    (((effectiveSpc.chartType === 'imr' && effectiveSpc.imr?.xBar != null && effectiveSpc.imr?.ucl_x != null && effectiveSpc.imr?.lcl_x != null) ||
      (effectiveSpc.chartType === 'xbar_r' && effectiveSpc.xbarR?.grandMean != null && effectiveSpc.xbarR?.ucl_x != null && effectiveSpc.xbarR?.lcl_x != null) ||
      (effectiveSpc.chartType === 'xbar_s' && effectiveSpc.xbarS?.grandMean != null && effectiveSpc.xbarS?.ucl_x != null && effectiveSpc.xbarS?.lcl_x != null))),
  )

  // ── Locked limits handlers ──────────────────────────────────────────────
  const handleDeleteLock = useCallback(() => {
    void deleteLimits()
  }, [deleteLimits])

  const handleLockLimits = useCallback(() => {
    if (!effectiveSpc) return
    const limits: LockedLimits = effectiveSpc.chartType === 'imr'
      ? {
          cl: effectiveSpc.imr?.xBar,
          ucl: effectiveSpc.imr?.ucl_x,
          lcl: effectiveSpc.imr?.lcl_x,
          ucl_r: effectiveSpc.imr?.ucl_mr,
          lcl_r: effectiveSpc.imr?.lcl_mr,
          sigma_within: effectiveSpc.imr?.sigmaWithin,
        }
      : effectiveSpc.chartType === 'xbar_s'
        ? {
            cl: effectiveSpc.xbarS?.grandMean,
            ucl: effectiveSpc.xbarS?.ucl_x,
            lcl: effectiveSpc.xbarS?.lcl_x,
            ucl_r: effectiveSpc.xbarS?.ucl_s,
            lcl_r: effectiveSpc.xbarS?.lcl_s,
            sigma_within: effectiveSpc.xbarS?.sigmaWithin,
          }
        : {
            cl: effectiveSpc.xbarR?.grandMean,
            ucl: effectiveSpc.xbarR?.ucl_x,
            lcl: effectiveSpc.xbarR?.lcl_x,
            ucl_r: effectiveSpc.xbarR?.ucl_r,
            lcl_r: effectiveSpc.xbarR?.lcl_r,
            sigma_within: effectiveSpc.xbarR?.sigmaWithin,
          }
    if (limits.cl == null || limits.ucl == null || limits.lcl == null) return
    void saveLimits({
      ...limits,
      unified_mic_key: selectedMIC?.unified_mic_key ?? null,
      spec_signature: liveSpecSignature,
    })
  }, [effectiveSpc, liveSpecSignature, saveLimits, selectedMIC?.unified_mic_key])

  // ── superseded by exclusionAudit from context ───────────────────────────
  void exclusionAudit // referenced via context; used by consumers via state

  return {
    // Type flags
    isAttributeChart, isPChart, isCountChart, isQuantitative, effectiveChartType,
    attrChartType, setAttrChartType,
    ewmaLambda, setEwmaLambda,
    ewmaL, setEwmaL,
    cusumK, setCusumK,
    cusumH, setCusumH,
    // Raw data
    quantPoints, quantNormality, specDrift, dataTruncated, hydrating,
    attrPoints, countPoints, points, loading, analyticsLoading: effectiveAnalyticsLoading, analyticsError: effectiveAnalyticsError, error,
    // SPC computation
    spc: effectiveSpc, trendData: effectiveTrendData, stratumSections: effectiveStratumSections, currentExcludedPoints,
    // Exclusions
    exclusionsSnapshot, exclusionsLoading, exclusionsSaving, exclusionsError,
    // Locked limits
    lockedLimits, lockedLimitsError, lockedLimitsWarning, externalLimits, governedLimits, governedLimitsError, canLockLimits,
    // Display values
    totalSignals, exclusionCount, chartFamilyLabel, capabilityHeadline, stratifyLabel, limitsSourceLabel, limitsSourceDetail, limitsSourceTone,
    // Rolling capability
    rollingWindowSize, setRollingWindowSize,
    // Auto-clean log
    autoCleanLog, setAutoCleanLog,
    // Export
    exportData, exporting,
    // Handlers
    handlePointClick, handleAutoClean, handleRestoreAll, handleRestorePoint,
    handleDialogSubmit, handleLockLimits, handleDeleteLock, closeDialog,
  }
}
