import { useCallback, useMemo } from 'react'
import { shallowEqual, useSPCSelector } from '../SPCContext'
import { toExcludedPoints } from '../exclusions'
import { useLockedLimits } from './useLockedLimits'
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

  // ── Locked limits ───────────────────────────────────────────────────────
  const { lockedLimits, error: lockedLimitsError, saveLimits, deleteLimits } = useLockedLimits(
    isQuantitative ? selectedMaterial?.material_id : null,
    isQuantitative ? selectedMIC?.mic_id : null,
    isQuantitative ? selectedPlant?.plant_id : null,
    effectiveChartType,
    isQuantitative ? selectedMIC?.operation_id : null,
  )

  // ── Derived values ──────────────────────────────────────────────────────
  const currentExcludedPoints = useMemo(
    () => (isQuantitative ? (toExcludedPoints(quantPoints, excludedIndices) as ExcludedPoint[]) : []),
    [isQuantitative, quantPoints, excludedIndices],
  )

  const externalLimits = limitsMode === 'locked' && lockedLimits ? lockedLimits : null
  const totalSignals = (spc?.signals?.length ?? 0) + (spc?.mrSignals?.length ?? 0)
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
  const capabilityHeadline = getCapabilityHeadline(spc)
  const stratifyLabel = stratifyBy ? stratifyBy.replace(/_/g, ' ') : null

  const canLockLimits = Boolean(
    spc &&
    limitsMode === 'live' &&
    (((spc.chartType === 'imr' && spc.imr?.xBar != null && spc.imr?.ucl_x != null && spc.imr?.lcl_x != null) ||
      (spc.chartType === 'xbar_r' && spc.xbarR?.grandMean != null && spc.xbarR?.ucl_x != null && spc.xbarR?.lcl_x != null) ||
      (spc.chartType === 'xbar_s' && spc.xbarS?.grandMean != null && spc.xbarS?.ucl_x != null && spc.xbarS?.lcl_x != null))),
  )

  // ── Locked limits handlers ──────────────────────────────────────────────
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
      : spc.chartType === 'xbar_s'
        ? {
            cl: spc.xbarS?.grandMean,
            ucl: spc.xbarS?.ucl_x,
            lcl: spc.xbarS?.lcl_x,
            ucl_r: spc.xbarS?.ucl_s,
            lcl_r: spc.xbarS?.lcl_s,
            sigma_within: spc.xbarS?.sigmaWithin,
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
    attrPoints, countPoints, points, loading, analyticsLoading, analyticsError, error,
    // SPC computation
    spc, trendData, stratumSections, currentExcludedPoints,
    // Exclusions
    exclusionsSnapshot, exclusionsLoading, exclusionsSaving, exclusionsError,
    // Locked limits
    lockedLimits, lockedLimitsError, externalLimits, canLockLimits,
    // Display values
    totalSignals, exclusionCount, chartFamilyLabel, capabilityHeadline, stratifyLabel,
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
