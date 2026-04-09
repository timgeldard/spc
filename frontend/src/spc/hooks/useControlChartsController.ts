import { useCallback, useMemo } from 'react'
import { useSPC } from '../SPCContext'
import { computeAll, computeRollingCapability } from '../calculations'
import { toExcludedPoints } from '../exclusions'
import { useSPCCalculations } from './useSPCCalculations'
import { useLockedLimits } from './useLockedLimits'
import { useExport } from './useExport'
import { useChartSettings } from './useChartSettings'
import { useChartData } from './useChartData'
import { useExclusionWorkflow } from './useExclusionWorkflow'
import type {
  AttributeChartPoint,
  ChartDataPoint,
  ExcludedPoint,
  ExclusionAuditSnapshot,
  LockedLimits,
  NormalityResult,
  SPCComputationResult,
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

export function useControlChartsController(): ControlChartsController {
  const { state } = useSPC()
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
  } = state

  const { exportData, exporting } = useExport()

  // ── Local UI state ──────────────────────────────────────────────────────
  const {
    attrChartType, setAttrChartType,
    rollingWindowSize, setRollingWindowSize,
    autoCleanLog, setAutoCleanLog,
  } = useChartSettings(selectedMIC?.mic_id)

  // ── Data fetching ───────────────────────────────────────────────────────
  const {
    isAttributeChart, isPChart, isCountChart, isQuantitative, effectiveChartType,
    quantPoints, quantNormality, dataTruncated,
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
  )

  // ── SPC computation ─────────────────────────────────────────────────────
  const spc = useSPCCalculations(
    isQuantitative ? quantPoints : [],
    effectiveChartType ?? 'imr',
    excludedIndices,
    ruleSet,
    excludeOutliers,
    quantNormality,
  )

  // ── Exclusion workflow ──────────────────────────────────────────────────
  const {
    exclusionsSnapshot, exclusionsLoading, exclusionsSaving, exclusionsError,
    handlePointClick, handleAutoClean, handleRestoreAll, handleRestorePoint,
    handleDialogSubmit, closeDialog,
  } = useExclusionWorkflow({
    materialId: selectedMaterial?.material_id,
    micId: selectedMIC?.mic_id,
    micName: selectedMIC?.mic_name,
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
  )

  // ── Derived values ──────────────────────────────────────────────────────
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
    // Raw data
    quantPoints, quantNormality, dataTruncated,
    attrPoints, countPoints, points, loading, error,
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
