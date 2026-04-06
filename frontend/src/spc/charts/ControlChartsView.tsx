import { Suspense, lazy, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import './ensureEChartsTheme'
import { useSPC } from '../SPCContext'
import { useSPCChartData } from '../hooks/useSPCChartData'
import { useSPCCalculations } from '../hooks/useSPCCalculations'
import { useSPCExclusions } from '../hooks/useSPCExclusions'
import { usePChartData } from '../hooks/usePChartData'
import { useCountChartData } from '../hooks/useCountChartData'
import { useLockedLimits } from '../hooks/useLockedLimits'
import { useExport } from '../hooks/useExport'
import { autoCleanPhaseI, computeAll, computeRollingCapability } from '../calculations'
import { getLimitsSnapshot, mapExcludedPointsToIndices, recomputeForExcludedSet, toExcludedPoints } from '../exclusions'
import type {
  AttributeChartPoint,
  ChartDataPoint,
  ExcludedPoint,
  ExclusionDialogState,
  LockedLimits,
  SPCComputationResult,
} from '../types'
const IMRChart = lazy(() => import('./IMRChart'))
const XbarRChart = lazy(() => import('./XbarRChart'))
const PChart = lazy(() => import('./PChart'))
const CChart = lazy(() => import('./CChart'))
const UChart = lazy(() => import('./UChart'))
const NPChart = lazy(() => import('./NPChart'))
const CapabilityPanel = lazy(() => import('./CapabilityPanel'))
const CapabilityTrendChart = lazy(() => import('./CapabilityTrendChart'))
const ExcludedPointsPanel = lazy(() => import('./ExcludedPointsPanel'))
const ExclusionJustificationModal = lazy(() => import('./ExclusionJustificationModal'))
const SignalsPanel = lazy(() => import('./SignalsPanel'))
import {
  autoCleanHeaderClass,
  autoCleanIterClass,
  autoCleanLogClass,
  badgeAmberClass,
  badgeGreenClass,
  badgeSlateClass,
  buttonBaseClass,
  buttonDangerClass,
  buttonGhostClass,
  buttonPrimaryClass,
  buttonSecondaryClass,
  buttonSmClass,
  chartsBottomClass,
  chartsHeaderClass,
  chartsHeaderTopClass,
  chartsHeaderRightClass,
  chartsLayoutClass,
  chartsMainClass,
  chartsMaterialClass,
  chartsMicMetaClass,
  chartsTitleClass,
  chartsWorkspaceClass,
  checkboxLabelClass,
  comparisonGridClass,
  evidenceRailClass,
  emptyCardClass,
  emptyIconClass,
  emptySubClass,
  heroCardDenseClass,
  infoBannerClass,
  loadingClass,
  metricCardClass,
  metricCardLabelClass,
  metricCardMetaClass,
  metricCardValueClass,
  metricGridClass,
  rollingHeaderClass,
  rollingPanelClass,
  rollingTitleClass,
  rollingWindowInputClass,
  rollingWindowLabelClass,
  settingsRailClass,
  settingsRailLabelClass,
  settingsRailRowClass,
  sideStackClass,
  spinnerClass,
  statusChipClass,
  strataSectionClass,
  strataSectionHeaderClass,
  strataSectionMetaClass,
  strataSectionTitleClass,
  toggleAutoClass,
  toggleButtonActiveClass,
  toggleButtonBaseClass,
  toggleButtonResetClass,
  toggleGroupClass,
  toggleLabelClass,
} from '../uiClasses'

type AttributeChartType = 'p_chart' | 'np_chart' | 'c_chart' | 'u_chart'
type QuantChartType = 'imr' | 'xbar_r'

interface ChartTypeToggleProps {
  chartType?: string | null
  override: QuantChartType | null
  onOverride: (value: QuantChartType | null) => void
}

function ChartTypeToggle({ chartType, override, onOverride }: ChartTypeToggleProps) {
  return (
    <div className={toggleGroupClass}>
      <span className={toggleLabelClass}>Chart type:</span>
      {(['imr', 'xbar_r'] as const).map(type => (
        <button
          key={type}
          className={`${toggleButtonBaseClass} ${((override ?? chartType) === type) ? toggleButtonActiveClass : ''}`}
          onClick={() => onOverride(type === chartType ? null : type)}
          title={type === 'imr' ? 'Individuals + Moving Range' : 'X-bar + Range'}
        >
          {type === 'imr' ? 'I-MR' : 'X̄-R'}
        </button>
      ))}
      {override && (
        <button className={`${toggleButtonBaseClass} ${toggleButtonResetClass}`} onClick={() => onOverride(null)}>
          Reset to auto
        </button>
      )}
      {chartType && !override && (
        <span className={toggleAutoClass}>auto-detected</span>
      )}
    </div>
  )
}

interface AttributeChartTypeToggleProps {
  attrChartType: AttributeChartType
  onSet: (value: AttributeChartType) => void
}

function AttributeChartTypeToggle({ attrChartType, onSet }: AttributeChartTypeToggleProps) {
  const options: Array<{ type: AttributeChartType; label: string; title: string }> = [
    { type: 'p_chart', label: 'P', title: 'Proportion nonconforming (variable sample size)' },
    { type: 'np_chart', label: 'NP', title: 'Number nonconforming (constant sample size)' },
    { type: 'c_chart', label: 'C', title: 'Count of defects per unit (constant area of opportunity)' },
    { type: 'u_chart', label: 'U', title: 'Defects per unit (variable area of opportunity)' },
  ]
  return (
    <div className={toggleGroupClass}>
      <span className={toggleLabelClass}>Chart type:</span>
      {options.map(({ type, label, title }) => (
        <button
          key={type}
          className={`${toggleButtonBaseClass} ${attrChartType === type ? toggleButtonActiveClass : ''}`}
          onClick={() => onSet(type)}
          title={title}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

interface RuleSetToggleProps {
  ruleSet: 'weco' | 'nelson'
  onSet: (value: 'weco' | 'nelson') => void
}

function RuleSetToggle({ ruleSet, onSet }: RuleSetToggleProps) {
  return (
    <div className={toggleGroupClass}>
      <span className={toggleLabelClass}>Rules:</span>
      <button
        className={`${toggleButtonBaseClass} ${ruleSet === 'weco' ? toggleButtonActiveClass : ''}`}
        onClick={() => onSet('weco')}
        title="Western Electric rules (4 tests)"
      >
        WECO
      </button>
      <button
        className={`${toggleButtonBaseClass} ${ruleSet === 'nelson' ? toggleButtonActiveClass : ''}`}
        onClick={() => onSet('nelson')}
        title="Nelson rules (8 tests)"
      >
        Nelson
      </button>
    </div>
  )
}

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

interface StratumSection {
  label: string
  points: ChartDataPoint[]
  spc: SPCComputationResult | null
}

function getCapabilityHeadlineValue(spc: SPCComputationResult | null): number | null {
  return spc?.capability?.cpk ?? spc?.capability?.ppk ?? null
}

function isQuantChartType(value: string | null | undefined): value is QuantChartType {
  return value === 'imr' || value === 'xbar_r'
}

function PanelLoadingState() {
  return (
    <div className="flex min-h-[160px] items-center justify-center rounded-xl border border-slate-200 bg-white/70 px-4 py-8 text-sm text-slate-500 shadow-sm">
      Loading chart panel…
    </div>
  )
}

function ChartLoadingState() {
  return (
    <div className="flex min-h-[520px] items-center justify-center rounded-xl border border-slate-200 bg-white/70 px-6 py-12 text-sm text-slate-500 shadow-sm">
      Loading chart…
    </div>
  )
}

function StatusChip({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'amber' | 'green' | 'blue' }) {
  const toneClass = tone === 'amber'
    ? badgeAmberClass
    : tone === 'green'
      ? badgeGreenClass
      : tone === 'blue'
        ? 'bg-sky-50 text-sky-700'
        : badgeSlateClass

  return <span className={`${statusChipClass} ${toneClass}`}>{children}</span>
}

function SummaryMetric({
  label,
  value,
  meta,
  tone = 'slate',
}: {
  label: string
  value: string
  meta: string
  tone?: 'slate' | 'green' | 'amber' | 'red'
}) {
  const toneClass = tone === 'green'
    ? 'border-emerald-200 bg-emerald-50'
    : tone === 'amber'
      ? 'border-amber-200 bg-amber-50'
      : tone === 'red'
        ? 'border-red-200 bg-red-50'
        : 'border-[var(--c-border)] bg-slate-50/80'

  return (
    <div className={`${metricCardClass} ${toneClass}`}>
      <div className={metricCardLabelClass}>{label}</div>
      <div className={metricCardValueClass}>{value}</div>
      <div className={metricCardMetaClass}>{meta}</div>
    </div>
  )
}

export default function ControlChartsView() {
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
  } = state
  const { exportData, exporting } = useExport()
  const [autoCleanLog, setAutoCleanLog] = useState<AutoCleanLog | null>(null)
  const [rollingWindowSize, setRollingWindowSize] = useState(20)
  const [attrChartType, setAttrChartType] = useState<AttributeChartType>('p_chart')

  useEffect(() => {
    setAttrChartType('p_chart')
  }, [selectedMIC?.mic_id])

  const isAttributeMIC = selectedMIC?.chart_type === 'p_chart'
  const isPChart = isAttributeMIC && attrChartType === 'p_chart'
  const isCountChart = isAttributeMIC && ['c_chart', 'u_chart', 'np_chart'].includes(attrChartType)
  const isAttributeChart = isAttributeMIC
  const isQuantitative = !isAttributeChart
  const baseChartType = isQuantChartType(selectedMIC?.chart_type) ? selectedMIC.chart_type : 'imr'
  const effectiveChartType: QuantChartType | null = isQuantitative
    ? (chartTypeOverride ?? baseChartType)
    : null

  const { stratifyBy, limitsMode } = state

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
      .map(([label, points]) => ({
        label,
        points,
        spc: points.length > 0 ? computeAll(points, effectiveChartType, ruleSet, { normality: quantNormality }) : null,
      }))
      .filter(section => (section.spc?.values?.length ?? 0) > 0)
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [
    stratifyBy,
    isQuantitative,
    effectiveChartType,
    quantPoints,
    excludedIndices,
    excludeOutliers,
    ruleSet,
    quantNormality,
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
  }, [dispatch, isQuantitative, quantPoints, exclusionsSnapshot])

  const persistExclusions = async (nextExcludedIndices: Set<number>, justification: string, action: string) => {
    if (!selectedMaterial || !selectedMIC || !effectiveChartType) return

    const beforeLimits = getLimitsSnapshot(spc)
    const recomputed = (recomputeForExcludedSet as (
      points: ChartDataPoint[],
      excluded: Set<number>,
      chartType: QuantChartType,
      nextRuleSet: 'weco' | 'nelson',
      normality: unknown,
    ) => SPCComputationResult)(quantPoints, nextExcludedIndices, effectiveChartType, ruleSet, quantNormality)
    const payload = {
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
    }

    await saveSnapshot(payload)
    dispatch({ type: 'SET_EXCLUSIONS', payload: [...nextExcludedIndices].sort((a, b) => a - b) })
  }

  const openDialog = (payload: ExclusionDialogState) => {
    dispatch({ type: 'OPEN_EXCLUSION_DIALOG', payload })
  }

  const closeDialog = () => {
    if (exclusionsSaving) return
    dispatch({ type: 'CLOSE_EXCLUSION_DIALOG' })
  }

  const handlePointClick = (index: number) => {
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
  }

  const handleAutoClean = () => {
    if (!spc?.indexedPoints?.length || !effectiveChartType) return
    const result = autoCleanPhaseI(spc.indexedPoints, effectiveChartType, ruleSet, spc.specConfig ?? {}) as AutoCleanLog
    openDialog({
      action: 'auto_clean_phase_i',
      excludedCount: result.cleanedIndices.size,
      nextExcludedIndices: [...result.cleanedIndices].sort((a, b) => a - b),
      autoCleanLog: result,
    })
  }

  const handleRestoreAll = () => {
    if (excludedIndices.size === 0) return
    openDialog({
      action: 'clear_exclusions',
      excludedCount: excludedIndices.size,
      nextExcludedIndices: [],
    })
  }

  const handleRestorePoint = (point: ExcludedPoint) => {
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
  }

  const handleDialogSubmit = async ({ justification }: { justification: string }) => {
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
      // Hook-level error state surfaces the failure banner.
    }
  }

  if (!selectedMaterial) {
    return (
      <div className={emptyCardClass}>
        <div className={emptyIconClass}>📈</div>
        <p>Select a material and characteristic above to view control charts.</p>
      </div>
    )
  }

  if (!selectedMIC) {
    return (
      <div className={emptyCardClass}>
        <p>Material selected: <strong>{selectedMaterial.material_name}</strong></p>
        <p className={emptySubClass}>Now select a characteristic (MIC) to view its control chart.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className={loadingClass}>
        <div className={spinnerClass} />
        <p>Loading measurement data…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div
        className={infoBannerClass}
        role="alert"
        style={{ borderColor: '#fca5a5', background: '#fef2f2', color: '#991b1b' }}
      >
        Failed to load chart data: {error}
      </div>
    )
  }

  if (!points.length) {
    return (
      <div className={emptyCardClass}>
        <p>No {isAttributeChart ? 'attribute' : 'quantitative'} data found for <strong>{selectedMIC.mic_name}</strong>.</p>
        <p className={emptySubClass}>Try widening the date range or selecting a different characteristic.</p>
      </div>
    )
  }

  if (isQuantitative && !spc) {
    return (
      <div className={emptyCardClass}>
        <p>Insufficient data to compute control limits (minimum 2 points required).</p>
      </div>
    )
  }

  const externalLimits = limitsMode === 'locked' && lockedLimits ? lockedLimits : null
  const totalSignals = (spc?.signals?.length ?? 0) + (spc?.mrSignals?.length ?? 0)
  const exclusionCount = excludedIndices.size
  const chartFamilyLabel = isAttributeChart
    ? `${attrChartType.toUpperCase()} attribute chart`
    : spc?.chartType === 'xbar_r'
      ? 'X̄-R variable chart'
      : 'I-MR variable chart'
  const capabilityHeadline = getCapabilityHeadlineValue(spc)

  const headerLeft = (
    <div>
      <span className={chartsTitleClass}>{selectedMIC.mic_name || selectedMIC.mic_id}</span>
      <span className={chartsMaterialClass}> · {selectedMaterial.material_name}</span>
      {selectedMIC.inspection_method && (
        <div className={chartsMicMetaClass}>
          <span>Method: {selectedMIC.inspection_method}</span>
        </div>
      )}
    </div>
  )
  const stratifyLabel = stratifyBy ? stratifyBy.replace(/_/g, ' ') : null

  if (isAttributeChart) {
    return (
      <div className={chartsLayoutClass}>
        <div className={chartsHeaderClass}>
          <div className={chartsHeaderTopClass}>
            <div>
              {headerLeft}
              <div className="mt-3 flex flex-wrap gap-2">
                <StatusChip tone="blue">{chartFamilyLabel}</StatusChip>
                {stratifyLabel && <StatusChip tone="blue">Stratified by {stratifyLabel}</StatusChip>}
              </div>
            </div>
            <div className={chartsHeaderRightClass}>
              <AttributeChartTypeToggle attrChartType={attrChartType} onSet={setAttrChartType} />
            </div>
          </div>
        </div>
        <div className={chartsMainClass}>
          <Suspense fallback={<ChartLoadingState />}>
            {attrChartType === 'p_chart' && <PChart points={attrPoints} />}
            {attrChartType === 'c_chart' && <CChart points={countPoints} />}
            {attrChartType === 'u_chart' && <UChart points={countPoints} />}
            {attrChartType === 'np_chart' && <NPChart points={countPoints} />}
          </Suspense>
        </div>
      </div>
    )
  }

  return (
    <div className={chartsLayoutClass}>
      <div className={chartsHeaderClass}>
        <div className={chartsHeaderTopClass}>
          <div>
            {headerLeft}
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusChip tone="blue">{chartFamilyLabel}</StatusChip>
              <StatusChip tone={totalSignals > 0 ? 'amber' : 'green'}>
                {totalSignals > 0 ? `${totalSignals} active signal${totalSignals === 1 ? '' : 's'}` : 'No active signals'}
              </StatusChip>
              {capabilityHeadline != null && (
                <StatusChip tone={capabilityHeadline >= 1.33 ? 'green' : capabilityHeadline >= 1.0 ? 'amber' : 'slate'}>
                  Headline Cpk {capabilityHeadline.toFixed(2)}
                </StatusChip>
              )}
              {stratifyBy && <StatusChip tone="blue">Stratified by {stratifyLabel}</StatusChip>}
              {exclusionCount > 0 && <StatusChip tone="amber">{exclusionCount} audited exclusion{exclusionCount === 1 ? '' : 's'}</StatusChip>}
              {quantNormality?.is_normal === false && <StatusChip tone="amber">Non-normal capability override</StatusChip>}
            </div>
          </div>
          <div className={chartsHeaderRightClass}>
            <button
              className={`${buttonBaseClass} ${buttonSmClass} ${buttonSecondaryClass}`}
              disabled={exporting}
              onClick={() => exportData({
                export_type: 'excel',
                export_scope: 'chart_data',
                material_id: selectedMaterial.material_id,
                mic_id: selectedMIC.mic_id,
                plant_id: selectedPlant?.plant_id ?? null,
                date_from: dateFrom || null,
                date_to: dateTo || null,
              })}
              aria-label="Export current chart analysis to Excel"
            >
              {exporting ? 'Exporting…' : 'Export Excel'}
            </button>
            <button
              className={`${buttonBaseClass} ${buttonSmClass} ${buttonSecondaryClass}`}
              onClick={() => window.print()}
              aria-label="Print the current chart view or save as PDF"
            >
              Print / PDF
            </button>
          </div>
        </div>
        <div className={metricGridClass}>
          <SummaryMetric
            label="Signals"
            value={String(totalSignals)}
            meta={totalSignals > 0 ? 'Investigate assignable causes before interpreting capability' : 'No current signal breaches'}
            tone={totalSignals > 0 ? 'amber' : 'green'}
          />
          <SummaryMetric
            label="Excluded points"
            value={String(exclusionCount)}
            meta={exclusionCount > 0 ? 'Persisted with justification and limits snapshot' : 'No active exclusions'}
            tone={exclusionCount > 0 ? 'amber' : 'slate'}
          />
          <SummaryMetric
            label="Rule set"
            value={ruleSet === 'nelson' ? 'Nelson 8' : 'WECO'}
            meta="Sensitivity profile for signal detection"
          />
          <SummaryMetric
            label="Capability mode"
            value={quantNormality?.is_normal === false ? 'Empirical' : 'Parametric'}
            meta={quantNormality?.is_normal === false ? 'Non-normal percentiles are active' : 'Standard sigma-based capability'}
            tone={quantNormality?.is_normal === false ? 'amber' : 'green'}
          />
        </div>
      </div>

      {lockedLimitsError && (
        <div className={infoBannerClass} role="alert" style={{ borderColor: '#fca5a5', background: '#fef2f2', color: '#991b1b' }}>Locked limits error: {lockedLimitsError}</div>
      )}
      {exclusionsError && (
        <div className={infoBannerClass} role="alert" style={{ borderColor: '#fca5a5', background: '#fef2f2', color: '#991b1b' }}>Exclusions audit error: {exclusionsError}</div>
      )}
      {exclusionsLoading && (
        <div className={infoBannerClass} role="status" aria-live="polite" style={{ borderColor: '#bfdbfe', background: '#eff6ff', color: '#1d4ed8' }}>Loading persisted exclusions…</div>
      )}
      {dataTruncated && (
        <div className={infoBannerClass} role="alert" style={{ borderColor: '#fcd34d', background: '#fffbeb', color: '#92400e' }}>
          <AlertTriangle size={16} />
          <span>Data limit reached. Only the first 10,000 points are displayed. Please narrow your Date Range for a complete analysis.</span>
        </div>
      )}
      {exclusionAudit && (
        <div className={infoBannerClass} role="status" aria-live="polite" style={{ borderColor: '#cbd5e1', background: '#f8fafc', color: '#334155' }}>
          {exclusionAudit.excluded_count ?? 0} point{(exclusionAudit.excluded_count ?? 0) !== 1 ? 's' : ''} excluded
          {exclusionAudit.user_id ? ` by ${exclusionAudit.user_id}` : ''}
          {exclusionAudit.event_ts ? ` on ${String(exclusionAudit.event_ts).replace('T', ' ').slice(0, 19)}` : ''}
          {exclusionAudit.justification ? ` — ${exclusionAudit.justification}` : ''}
        </div>
      )}

      <div className={chartsWorkspaceClass}>
        <div className={sideStackClass}>
          <div className={settingsRailClass}>
            <div className={settingsRailLabelClass}>Analysis controls</div>
            <div className={settingsRailRowClass}>
              <RuleSetToggle
                ruleSet={ruleSet}
                onSet={v => dispatch({ type: 'SET_RULE_SET', payload: v })}
              />
              <ChartTypeToggle
                chartType={selectedMIC.chart_type}
                override={chartTypeOverride}
                onOverride={v => dispatch({ type: 'SET_CHART_TYPE_OVERRIDE', payload: v })}
              />
            </div>
            <div className={settingsRailRowClass}>
              {lockedLimits && (
                <button
                  className={`${buttonBaseClass} ${buttonSmClass} ${limitsMode === 'locked' ? buttonPrimaryClass : buttonSecondaryClass}`}
                  onClick={() => dispatch({ type: 'SET_LIMITS_MODE', payload: limitsMode === 'locked' ? 'live' : 'locked' })}
                  title={`Locked ${lockedLimits.locked_at?.substring(0, 10) ?? ''} by ${lockedLimits.locked_by ?? 'unknown'}`}
                  aria-label={limitsMode === 'locked' ? 'Switch to live limits' : 'Use locked limits'}
                >
                  {limitsMode === 'locked' ? 'Locked Limits' : 'Use Locked Limits'}
                </button>
              )}
              {spc && limitsMode === 'live' && (
                <button
                  className={`${buttonBaseClass} ${buttonSmClass} ${buttonSecondaryClass}`}
                  onClick={() => {
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
                  }}
                  title="Lock current control limits for Phase II monitoring"
                  aria-label="Lock current control limits for Phase II monitoring"
                >
                  Lock Limits
                </button>
              )}
              {lockedLimits && limitsMode === 'locked' && (
                <button className={`${buttonBaseClass} ${buttonSmClass} ${buttonDangerClass}`} onClick={() => { void deleteLimits() }} title="Remove locked limits" aria-label="Delete locked control limits">
                  Delete Lock
                </button>
              )}
            </div>
            <div className={settingsRailRowClass}>
              {quantPoints.some((p: ChartDataPoint) => p.is_outlier) && (
                <label className={checkboxLabelClass}>
                  <input
                    type="checkbox"
                    checked={excludeOutliers}
                    onChange={() => dispatch({ type: 'TOGGLE_EXCLUDE_OUTLIERS' })}
                  />
                  Exclude attribute outliers ({quantPoints.filter((p: ChartDataPoint) => p.is_outlier).length})
                </label>
              )}
              {excludedIndices.size > 0 && (
                <button
                  className={`${buttonBaseClass} ${buttonSmClass} ${buttonSecondaryClass}`}
                  disabled={exclusionsSaving}
                  onClick={handleRestoreAll}
                  aria-label="Clear all persisted exclusions for this chart scope"
                >
                  Clear {excludedIndices.size} exclusion{excludedIndices.size !== 1 ? 's' : ''}
                </button>
              )}
              {(spc?.indexedPoints?.length ?? 0) > 0 && (
                <button
                  className={`${buttonBaseClass} ${buttonSmClass} ${buttonSecondaryClass}`}
                  disabled={exclusionsSaving}
                  onClick={handleAutoClean}
                  title="Iteratively remove Rule 1 OOC points to establish Phase I baseline limits"
                  aria-label="Auto-clean Phase I points and persist exclusions with justification"
                >
                  {exclusionsSaving ? 'Saving…' : 'Auto-clean Phase I'}
                </button>
              )}
            </div>
          </div>

          <div className={chartsMainClass}>
            <Suspense fallback={<ChartLoadingState />}>
              {spc?.chartType === 'imr' ? (
                <IMRChart
                  spc={spc}
                  indexedPoints={spc.indexedPoints}
                  signals={spc.signals}
                  mrSignals={spc.mrSignals}
                  excludedIndices={excludedIndices}
                  onPointClick={handlePointClick}
                  externalLimits={externalLimits}
                />
              ) : (
                <XbarRChart
                  spc={spc}
                  signals={spc?.signals}
                  mrSignals={spc?.mrSignals}
                  externalLimits={externalLimits}
                />
              )}
            </Suspense>
          </div>
        </div>

        <div className={evidenceRailClass}>
          <Suspense fallback={<PanelLoadingState />}>
            <CapabilityPanel spc={spc} />
          </Suspense>
          <Suspense fallback={<PanelLoadingState />}>
            <ExcludedPointsPanel
              snapshot={exclusionsSnapshot ?? exclusionAudit}
              currentPoints={currentExcludedPoints}
              onRestorePoint={handleRestorePoint}
              onRestoreAll={handleRestoreAll}
              saving={exclusionsSaving}
            />
          </Suspense>
          <div className={heroCardDenseClass}>
            <div className={rollingHeaderClass}>
              <div className={rollingTitleClass}>Interpretation guide</div>
            </div>
            <p className="mt-3 text-sm leading-6 text-[var(--c-text-muted)]">
              Establish stability first, then interpret capability. Signals point to assignable causes;
              exclusions and locked limits are preserved as audit evidence for the active chart scope.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusChip tone="green">Cp/Cpk = short-term</StatusChip>
              <StatusChip tone="blue">Pp/Ppk = long-term</StatusChip>
              {quantNormality?.is_normal === false && <StatusChip tone="amber">Empirical percentiles active</StatusChip>}
            </div>
          </div>
        </div>
      </div>

      <div className={chartsBottomClass}>
        <Suspense fallback={<PanelLoadingState />}>
          <SignalsPanel
            signals={spc?.signals}
            mrSignals={spc?.mrSignals}
            indexedPoints={spc?.indexedPoints}
            ruleSet={ruleSet}
          />
        </Suspense>
        <div className={rollingPanelClass}>
          <div className={rollingHeaderClass}>
            <div className={rollingTitleClass}>Capability storyline</div>
            <label className={rollingWindowLabelClass}>
              Window
              <input
                type="number"
                min={5}
                max={Math.max(5, spc?.sorted?.length ?? 5)}
                value={rollingWindowSize}
                className={rollingWindowInputClass}
                onChange={event => {
                  const next = Number(event.target.value)
                  if (Number.isFinite(next) && next >= 5) setRollingWindowSize(next)
                }}
              />
            </label>
          </div>
          <Suspense fallback={<PanelLoadingState />}>
            <CapabilityTrendChart trendData={trendData} windowSize={rollingWindowSize} />
          </Suspense>
        </div>
      </div>

      {stratumSections.length > 1 && (
        <div className="flex flex-col gap-5">
          {stratumSections.map(section => {
            const stratumSignalCount = (section.spc?.signals?.length ?? 0) + (section.spc?.mrSignals?.length ?? 0)
            const stratumCapabilityHeadline = getCapabilityHeadlineValue(section.spc)

            return (
            <section
              key={section.label}
              className={strataSectionClass}
              role="region"
              aria-label={`Stratum analysis for ${section.label}`}
            >
              <div className={strataSectionHeaderClass}>
                <div>
                  <div className={strataSectionTitleClass}>
                    {selectedMIC?.mic_name || selectedMIC?.mic_id} · {section.label}
                  </div>
                  <div className={strataSectionMetaClass}>
                    Stratified by {stratifyBy?.replace(/_/g, ' ')} · {section.points.length} point{section.points.length !== 1 ? 's' : ''}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusChip tone={stratumSignalCount > 0 ? 'amber' : 'green'}>
                    {stratumSignalCount > 0 ? `${stratumSignalCount} signal${stratumSignalCount === 1 ? '' : 's'}` : 'No active signals'}
                  </StatusChip>
                  {stratumCapabilityHeadline != null && (
                    <StatusChip tone={stratumCapabilityHeadline >= 1.33 ? 'green' : stratumCapabilityHeadline >= 1.0 ? 'amber' : 'slate'}>
                      Headline Cpk {stratumCapabilityHeadline.toFixed(2)}
                    </StatusChip>
                  )}
                </div>
              </div>

              <div className="mb-5 grid gap-3 md:grid-cols-3">
                <SummaryMetric
                  label="Points"
                  value={String(section.points.length)}
                  meta="Data included after the current exclusion and outlier rules"
                  tone="slate"
                />
                <SummaryMetric
                  label="Signals"
                  value={String(stratumSignalCount)}
                  meta={stratumSignalCount > 0 ? 'Assignable-cause review still required' : 'No active rule breaches'}
                  tone={stratumSignalCount > 0 ? 'amber' : 'green'}
                />
                <SummaryMetric
                  label="Capability"
                  value={stratumCapabilityHeadline != null ? stratumCapabilityHeadline.toFixed(2) : '—'}
                  meta={section.spc?.capability?.capabilityMethod === 'non_parametric' ? 'Empirical percentile method active' : 'Short-term and long-term evidence available'}
                  tone={stratumCapabilityHeadline == null ? 'slate' : stratumCapabilityHeadline >= 1.33 ? 'green' : stratumCapabilityHeadline >= 1.0 ? 'amber' : 'red'}
                />
              </div>

              <div className={chartsMainClass}>
                <Suspense fallback={<ChartLoadingState />}>
                  {section.spc?.chartType === 'imr' ? (
                    <IMRChart
                      spc={section.spc}
                      indexedPoints={section.spc.indexedPoints}
                      signals={section.spc.signals}
                      mrSignals={section.spc.mrSignals}
                      excludedIndices={new Set<number>()}
                      externalLimits={null}
                    />
                  ) : (
                    <XbarRChart
                      spc={section.spc}
                      signals={section.spc?.signals}
                      mrSignals={section.spc?.mrSignals}
                      externalLimits={null}
                    />
                  )}
                </Suspense>
              </div>

              <div className={`mt-5 ${comparisonGridClass}`}>
                <Suspense fallback={<PanelLoadingState />}>
                  <SignalsPanel
                    signals={section.spc?.signals}
                    mrSignals={section.spc?.mrSignals}
                    indexedPoints={section.spc?.indexedPoints}
                    ruleSet={ruleSet}
                  />
                </Suspense>
                <div className={sideStackClass}>
                  <Suspense fallback={<PanelLoadingState />}>
                    <CapabilityPanel spc={section.spc} />
                  </Suspense>
                </div>
              </div>
            </section>
          )})}
        </div>
      )}

      {autoCleanLog && (
        <div className={autoCleanLogClass}>
          <div className={autoCleanHeaderClass}>
            <strong>Phase I Auto-clean result</strong>
            {autoCleanLog.stable
              ? <span className={`${badgeGreenClass} inline-flex rounded-full px-2 py-0.5 text-xs font-medium`}>Stable after {autoCleanLog.iterationLog.length} iteration{autoCleanLog.iterationLog.length !== 1 ? 's' : ''}</span>
              : <span className={`${badgeAmberClass} inline-flex rounded-full px-2 py-0.5 text-xs font-medium`}>Not fully stable — {autoCleanLog.cleanedIndices.size} point{autoCleanLog.cleanedIndices.size !== 1 ? 's' : ''} excluded</span>}
            <button className={`${buttonBaseClass} ${buttonSmClass} ${buttonGhostClass}`} onClick={() => setAutoCleanLog(null)}>Dismiss</button>
          </div>
          {autoCleanLog.iterationLog.map((iter, i) => (
            <div key={i} className={autoCleanIterClass}>
              Iteration {iter.iteration}: removed {iter.removedCount} point{iter.removedCount !== 1 ? 's' : ''}
              {iter.removedCount > 0 && ` (indices: ${iter.removedOriginalIndices.join(', ')})`}
              {' '}· UCL={iter.ucl?.toFixed(4) ?? '—'}, CL={iter.cl?.toFixed(4) ?? '—'}, LCL={iter.lcl?.toFixed(4) ?? '—'}
            </div>
          ))}
        </div>
      )}

      <Suspense fallback={null}>
        <ExclusionJustificationModal
          dialog={exclusionDialog}
          saving={exclusionsSaving}
          onCancel={closeDialog}
          onSubmit={handleDialogSubmit}
        />
      </Suspense>
    </div>
  )
}
