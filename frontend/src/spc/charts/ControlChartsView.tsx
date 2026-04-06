import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
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
import { autoCleanPhaseI, computeRollingCapability } from '../calculations'
import { getLimitsSnapshot, mapExcludedPointsToIndices, recomputeForExcludedSet, toExcludedPoints } from '../exclusions.js'
import type {
  AttributeChartPoint,
  ChartDataPoint,
  ExcludedPoint,
  ExclusionDialogState,
  LockedLimits,
  SPCComputationResult,
} from '../types'
const IMRChart = lazy(() => import('./IMRChart.jsx'))
const XbarRChart = lazy(() => import('./XbarRChart.jsx'))
const PChart = lazy(() => import('./PChart.jsx'))
const CChart = lazy(() => import('./CChart.jsx'))
const UChart = lazy(() => import('./UChart.jsx'))
const NPChart = lazy(() => import('./NPChart.jsx'))
const CapabilityPanel = lazy(() => import('./CapabilityPanel'))
const CapabilityTrendChart = lazy(() => import('./CapabilityTrendChart.jsx'))
const ExcludedPointsPanel = lazy(() => import('./ExcludedPointsPanel'))
const ExclusionJustificationModal = lazy(() => import('./ExclusionJustificationModal.jsx'))
const SignalsPanel = lazy(() => import('./SignalsPanel'))
import {
  autoCleanHeaderClass,
  autoCleanIterClass,
  autoCleanLogClass,
  badgeAmberClass,
  badgeGreenClass,
  buttonBaseClass,
  buttonDangerClass,
  buttonGhostClass,
  buttonPrimaryClass,
  buttonSecondaryClass,
  buttonSmClass,
  chartsBottomClass,
  chartsHeaderClass,
  chartsHeaderRightClass,
  chartsLayoutClass,
  chartsMainClass,
  chartsMaterialClass,
  chartsMicMetaClass,
  chartsTitleClass,
  checkboxLabelClass,
  emptyCardClass,
  emptyIconClass,
  emptySubClass,
  loadingClass,
  rollingHeaderClass,
  rollingPanelClass,
  rollingTitleClass,
  rollingWindowInputClass,
  rollingWindowLabelClass,
  sideStackClass,
  spinnerClass,
  toggleAutoClass,
  toggleButtonActiveClass,
  toggleButtonBaseClass,
  toggleButtonResetClass,
  toggleGroupClass,
  toggleLabelClass,
} from '../uiClasses.js'

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

  const { stratifyAll, limitsMode } = state

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
    stratifyAll,
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
    stratifyAll,
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
      stratify_all: stratifyAll,
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
    return <div className="banner banner--error">Failed to load chart data: {error}</div>
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

  if (isAttributeChart) {
    return (
      <div className={chartsLayoutClass}>
        <div className={chartsHeaderClass}>
          {headerLeft}
          <div className={chartsHeaderRightClass}>
            <AttributeChartTypeToggle attrChartType={attrChartType} onSet={setAttrChartType} />
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
        {headerLeft}
        <div className={chartsHeaderRightClass}>
          <RuleSetToggle
            ruleSet={ruleSet}
            onSet={v => dispatch({ type: 'SET_RULE_SET', payload: v })}
          />
          <ChartTypeToggle
            chartType={selectedMIC.chart_type}
            override={chartTypeOverride}
            onOverride={v => dispatch({ type: 'SET_CHART_TYPE_OVERRIDE', payload: v })}
          />
          {!selectedPlant && (
            <button
              className={`${buttonBaseClass} ${buttonSmClass} ${stratifyAll ? buttonPrimaryClass : buttonSecondaryClass}`}
              onClick={() => dispatch({ type: 'TOGGLE_STRATIFY_ALL' })}
              title="Show all plants as separate coloured series"
            >
              {stratifyAll ? 'Stratified' : 'Stratify by Plant'}
            </button>
          )}
          {lockedLimits && (
            <button
              className={`${buttonBaseClass} ${buttonSmClass} ${limitsMode === 'locked' ? buttonPrimaryClass : buttonSecondaryClass}`}
              onClick={() => dispatch({ type: 'SET_LIMITS_MODE', payload: limitsMode === 'locked' ? 'live' : 'locked' })}
              title={`Locked ${lockedLimits.locked_at?.substring(0, 10) ?? ''} by ${lockedLimits.locked_by ?? 'unknown'}`}
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
            >
              Lock Limits
            </button>
          )}
          {lockedLimits && limitsMode === 'locked' && (
            <button className={`${buttonBaseClass} ${buttonSmClass} ${buttonDangerClass}`} onClick={() => { void deleteLimits() }} title="Remove locked limits">
              Delete Lock
            </button>
          )}
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
            >
              {exclusionsSaving ? 'Saving…' : 'Auto-clean Phase I'}
            </button>
          )}
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
          >
            {exporting ? 'Exporting…' : 'Export Excel'}
          </button>
          <button
            className={`${buttonBaseClass} ${buttonSmClass} ${buttonSecondaryClass}`}
            onClick={() => window.print()}
          >
            Print / PDF
          </button>
        </div>
      </div>

      {lockedLimitsError && (
        <div className="banner banner--error">Locked limits error: {lockedLimitsError}</div>
      )}
      {exclusionsError && (
        <div className="banner banner--error">Exclusions audit error: {exclusionsError}</div>
      )}
      {exclusionsLoading && (
        <div className="banner banner--info">Loading persisted exclusions…</div>
      )}
      {dataTruncated && (
        <div className="banner banner--warning" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertTriangle size={16} />
          <span>Data limit reached. Only the first 10,000 points are displayed. Please narrow your Date Range for a complete analysis.</span>
        </div>
      )}
      {exclusionAudit && (
        <div className="banner banner--info">
          {exclusionAudit.excluded_count ?? 0} point{(exclusionAudit.excluded_count ?? 0) !== 1 ? 's' : ''} excluded
          {exclusionAudit.user_id ? ` by ${exclusionAudit.user_id}` : ''}
          {exclusionAudit.event_ts ? ` on ${String(exclusionAudit.event_ts).replace('T', ' ').slice(0, 19)}` : ''}
          {exclusionAudit.justification ? ` — ${exclusionAudit.justification}` : ''}
        </div>
      )}

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

      <div className={chartsBottomClass}>
        <Suspense fallback={<PanelLoadingState />}>
          <SignalsPanel
            signals={spc?.signals}
            mrSignals={spc?.mrSignals}
            indexedPoints={spc?.indexedPoints}
            ruleSet={ruleSet}
          />
        </Suspense>
        <div className={sideStackClass}>
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
        </div>
      </div>

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

      {spc?.sorted?.length && spc.sorted.length >= 15 && (
        <div className={rollingPanelClass}>
          <div className={rollingHeaderClass}>
            <span className={rollingTitleClass}>Rolling Capability Trend</span>
            <label className={rollingWindowLabelClass}>
              Window:
              <input
                type="number"
                className={rollingWindowInputClass}
                min={10}
                max={50}
                value={rollingWindowSize}
                onChange={e => setRollingWindowSize(Math.max(10, Math.min(50, Number(e.target.value))))}
              />
            </label>
          </div>
          <Suspense fallback={<PanelLoadingState />}>
            <CapabilityTrendChart trendData={trendData} windowSize={rollingWindowSize} />
          </Suspense>
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
