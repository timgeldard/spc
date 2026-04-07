import { Suspense, lazy, useEffect, useMemo, useState } from 'react'

import './ensureEChartsTheme'
import { useSPC } from '../SPCContext'
import { autoCleanPhaseI, computeAll, computeRollingCapability } from '../calculations'
import { getLimitsSnapshot, mapExcludedPointsToIndices, recomputeForExcludedSet, toExcludedPoints } from '../exclusions'
import { useSPCChartData } from '../hooks/useSPCChartData'
import { useSPCCalculations } from '../hooks/useSPCCalculations'
import { useSPCExclusions } from '../hooks/useSPCExclusions'
import { usePChartData } from '../hooks/usePChartData'
import { useCountChartData } from '../hooks/useCountChartData'
import { useLockedLimits } from '../hooks/useLockedLimits'
import { useExport } from '../hooks/useExport'
import type {
  AttributeChartPoint,
  ChartDataPoint,
  ExcludedPoint,
  ExclusionDialogState,
  LockedLimits,
  SPCComputationResult,
} from '../types'
import {
  autoCleanHeaderClass,
  autoCleanIterClass,
  autoCleanLogClass,
  badgeAmberClass,
  badgeGreenClass,
  buttonBaseClass,
  buttonGhostClass,
  buttonSecondaryClass,
  buttonSmClass,
  chartsBottomClass,
  chartsLayoutClass,
  chartsMainClass,
  chartsWorkspaceClass,
  emptyCardClass,
  emptyIconClass,
  emptySubClass,
  evidenceRailClass,
  heroCardDenseClass,
  loadingClass,
  rollingHeaderClass,
  rollingPanelClass,
  rollingTitleClass,
  rollingWindowInputClass,
  rollingWindowLabelClass,
  sideStackClass,
  spinnerClass,
} from '../uiClasses'
import ChartInfoBanners from './ChartInfoBanners'
import ChartSettingsRail, { type AttributeChartType, type QuantChartType } from './ChartSettingsRail'
import ChartSummaryBar from './ChartSummaryBar'
import StratificationPanel, { type StratumSection } from './StratificationPanel'

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

function getCapabilityHeadline(spc: SPCComputationResult | null | undefined): { label: 'Cpk' | 'Ppk'; value: number } | null {
  const cpk = spc?.capability?.cpk
  if (cpk != null) return { label: 'Cpk', value: cpk }
  const ppk = spc?.capability?.ppk
  if (ppk != null) return { label: 'Ppk', value: ppk }
  return null
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
  }, [dispatch, exclusionsSnapshot, isQuantitative, quantPoints])

  const persistExclusions = async (nextExcludedIndices: Set<number>, justification: string, action: string) => {
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
  }

  const openDialog = (payload: ExclusionDialogState) => {
    dispatch({ type: 'OPEN_EXCLUSION_DIALOG', payload })
  }

  const closeDialog = () => {
    if (!exclusionsSaving) dispatch({ type: 'CLOSE_EXCLUSION_DIALOG' })
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
      // Hook-level error state surfaces failure.
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
      <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900" role="alert">
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
  const capabilityHeadline = getCapabilityHeadline(spc)
  const stratifyLabel = stratifyBy ? stratifyBy.replace(/_/g, ' ') : null

  const actionRail = isAttributeChart ? null : (
    <>
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
    </>
  )

  const renderQuantitativeChart = (
    spcResult: SPCComputationResult,
    limits: LockedLimits | null,
    excludedSet = excludedIndices,
    pointClick?: (index: number) => void,
  ) => (
    <Suspense fallback={<ChartLoadingState />}>
      {spcResult.chartType === 'imr' ? (
        <IMRChart
          spc={spcResult}
          indexedPoints={spcResult.indexedPoints}
          signals={spcResult.signals}
          mrSignals={spcResult.mrSignals}
          excludedIndices={excludedSet}
          onPointClick={pointClick}
          externalLimits={limits}
        />
      ) : (
        <XbarRChart
          spc={spcResult}
          signals={spcResult.signals}
          mrSignals={spcResult.mrSignals}
          externalLimits={limits}
        />
      )}
    </Suspense>
  )

  if (isAttributeChart) {
    return (
      <div className={chartsLayoutClass}>
        <ChartSummaryBar
          title={selectedMIC.mic_name || selectedMIC.mic_id}
          materialName={selectedMaterial.material_name || selectedMaterial.material_id}
          inspectionMethod={selectedMIC.inspection_method}
          chartFamilyLabel={chartFamilyLabel}
          totalSignals={0}
          exclusionCount={0}
          capabilityHeadline={null}
          capabilityHeadlineLabel={null}
          stratifyLabel={stratifyLabel}
          quantNormality={null}
          ruleSet={ruleSet}
          actionRail={null}
        />
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

  const canLockLimits = Boolean(
    spc &&
    limitsMode === 'live' &&
    (((spc.chartType === 'imr' && spc.imr?.xBar != null && spc.imr?.ucl_x != null && spc.imr?.lcl_x != null) ||
      (spc.chartType === 'xbar_r' && spc.xbarR?.grandMean != null && spc.xbarR?.ucl_x != null && spc.xbarR?.lcl_x != null))),
  )

  const handleLockLimits = () => {
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
  }

  return (
    <div className={chartsLayoutClass}>
      <ChartSummaryBar
        title={selectedMIC.mic_name || selectedMIC.mic_id}
        materialName={selectedMaterial.material_name || selectedMaterial.material_id}
        inspectionMethod={selectedMIC.inspection_method}
        chartFamilyLabel={chartFamilyLabel}
        totalSignals={totalSignals}
        exclusionCount={exclusionCount}
        capabilityHeadline={capabilityHeadline?.value ?? null}
        capabilityHeadlineLabel={capabilityHeadline?.label ?? null}
        stratifyLabel={stratifyLabel}
        quantNormality={quantNormality}
        ruleSet={ruleSet}
        actionRail={actionRail}
      />

      <ChartInfoBanners
        lockedLimitsError={lockedLimitsError}
        exclusionsError={exclusionsError}
        exclusionsLoading={exclusionsLoading}
        dataTruncated={dataTruncated}
        exclusionAudit={exclusionAudit}
      />

      <div className={chartsWorkspaceClass}>
        <div className={sideStackClass}>
          <ChartSettingsRail
            ruleSet={ruleSet}
            onRuleSetChange={value => dispatch({ type: 'SET_RULE_SET', payload: value })}
            selectedMicChartType={selectedMIC.chart_type}
            chartTypeOverride={chartTypeOverride}
            onChartTypeOverride={value => dispatch({ type: 'SET_CHART_TYPE_OVERRIDE', payload: value })}
            attrChartType={attrChartType}
            onAttrChartTypeChange={setAttrChartType}
            isAttributeChart={false}
            lockedLimits={lockedLimits}
            limitsMode={limitsMode}
            onLimitsMode={value => dispatch({ type: 'SET_LIMITS_MODE', payload: value })}
            canLockLimits={canLockLimits}
            onLockLimits={handleLockLimits}
            onDeleteLock={() => { void deleteLimits() }}
            quantPoints={quantPoints}
            excludeOutliers={excludeOutliers}
            onToggleExcludeOutliers={() => dispatch({ type: 'TOGGLE_EXCLUDE_OUTLIERS' })}
            exclusionCount={exclusionCount}
            exclusionsSaving={exclusionsSaving}
            onRestoreAll={handleRestoreAll}
            canAutoClean={(spc?.indexedPoints?.length ?? 0) > 0}
            onAutoClean={handleAutoClean}
          />

          <div className={chartsMainClass}>
            {spc ? renderQuantitativeChart(spc, externalLimits, excludedIndices, handlePointClick) : null}
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

      <StratificationPanel
        micLabel={selectedMIC.mic_name || selectedMIC.mic_id}
        stratifyBy={stratifyBy ?? ''}
        sections={stratumSections}
        renderChart={sectionSpc => renderQuantitativeChart(sectionSpc, null, new Set<number>())}
        renderSignals={sectionSpc => (
          <Suspense fallback={<PanelLoadingState />}>
            <SignalsPanel
              signals={sectionSpc.signals}
              mrSignals={sectionSpc.mrSignals}
              indexedPoints={sectionSpc.indexedPoints}
              ruleSet={ruleSet}
            />
          </Suspense>
        )}
        renderCapability={sectionSpc => (
          <Suspense fallback={<PanelLoadingState />}>
            <CapabilityPanel spc={sectionSpc} />
          </Suspense>
        )}
      />

      {autoCleanLog && (
        <div className={autoCleanLogClass}>
          <div className={autoCleanHeaderClass}>
            <strong>Phase I Auto-clean result</strong>
            {autoCleanLog.stable
              ? <span className={`${badgeGreenClass} inline-flex rounded-full px-2 py-0.5 text-xs font-medium`}>Stable after {autoCleanLog.iterationLog.length} iteration{autoCleanLog.iterationLog.length !== 1 ? 's' : ''}</span>
              : <span className={`${badgeAmberClass} inline-flex rounded-full px-2 py-0.5 text-xs font-medium`}>Not fully stable — {autoCleanLog.cleanedIndices.size} point{autoCleanLog.cleanedIndices.size !== 1 ? 's' : ''} excluded</span>}
            <button className={`${buttonBaseClass} ${buttonSmClass} ${buttonGhostClass}`} onClick={() => setAutoCleanLog(null)}>Dismiss</button>
          </div>
          {autoCleanLog.iterationLog.map((iter, index) => (
            <div key={index} className={autoCleanIterClass}>
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
