import { useMemo, useState, useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useSPC } from '../SPCContext.jsx'
import { useSPCChartData } from '../hooks/useSPCChartData.js'
import { useSPCCalculations } from '../hooks/useSPCCalculations.js'
import { useSPCExclusions } from '../hooks/useSPCExclusions.js'
import { usePChartData } from '../hooks/usePChartData.js'
import { useCountChartData } from '../hooks/useCountChartData.js'
import { useLockedLimits } from '../hooks/useLockedLimits.js'
import { useExport } from '../hooks/useExport.js'
import { autoCleanPhaseI, computeRollingCapability } from '../calculations.js'
import { getLimitsSnapshot, mapExcludedPointsToIndices, recomputeForExcludedSet, toExcludedPoints } from '../exclusions.js'
import IMRChart from './IMRChart.jsx'
import XbarRChart from './XbarRChart.jsx'
import PChart from './PChart.jsx'
import CChart from './CChart.jsx'
import UChart from './UChart.jsx'
import NPChart from './NPChart.jsx'
import CapabilityPanel from './CapabilityPanel.jsx'
import CapabilityTrendChart from './CapabilityTrendChart.jsx'
import ExcludedPointsPanel from './ExcludedPointsPanel.jsx'
import ExclusionJustificationModal from './ExclusionJustificationModal.jsx'
import SignalsPanel from './SignalsPanel.jsx'

function ChartTypeToggle({ chartType, override, onOverride }) {
  return (
    <div className="spc-chart-type-toggle">
      <span className="spc-chart-type-label">Chart type:</span>
      {['imr', 'xbar_r'].map(type => (
        <button
          key={type}
          className={'spc-chart-type-btn' + ((override ?? chartType) === type ? ' spc-chart-type-btn--active' : '')}
          onClick={() => onOverride(type === chartType ? null : type)}
          title={type === 'imr' ? 'Individuals + Moving Range' : 'X-bar + Range'}
        >
          {type === 'imr' ? 'I-MR' : 'X̄-R'}
        </button>
      ))}
      {override && (
        <button className="spc-chart-type-btn spc-chart-type-btn--reset" onClick={() => onOverride(null)}>
          Reset to auto
        </button>
      )}
      {chartType && !override && (
        <span className="spc-chart-type-auto">auto-detected</span>
      )}
    </div>
  )
}

function AttributeChartTypeToggle({ attrChartType, onSet }) {
  const options = [
    { type: 'p_chart',  label: 'P',  title: 'Proportion nonconforming (variable sample size)' },
    { type: 'np_chart', label: 'NP', title: 'Number nonconforming (constant sample size)' },
    { type: 'c_chart',  label: 'C',  title: 'Count of defects per unit (constant area of opportunity)' },
    { type: 'u_chart',  label: 'U',  title: 'Defects per unit (variable area of opportunity)' },
  ]
  return (
    <div className="spc-chart-type-toggle">
      <span className="spc-chart-type-label">Chart type:</span>
      {options.map(({ type, label, title }) => (
        <button
          key={type}
          className={'spc-chart-type-btn' + (attrChartType === type ? ' spc-chart-type-btn--active' : '')}
          onClick={() => onSet(type)}
          title={title}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function RuleSetToggle({ ruleSet, onSet }) {
  return (
    <div className="spc-chart-type-toggle">
      <span className="spc-chart-type-label">Rules:</span>
      <button
        className={'spc-chart-type-btn' + (ruleSet === 'weco' ? ' spc-chart-type-btn--active' : '')}
        onClick={() => onSet('weco')}
        title="Western Electric rules (4 tests)"
      >
        WECO
      </button>
      <button
        className={'spc-chart-type-btn' + (ruleSet === 'nelson' ? ' spc-chart-type-btn--active' : '')}
        onClick={() => onSet('nelson')}
        title="Nelson rules (8 tests)"
      >
        Nelson
      </button>
    </div>
  )
}

export default function ControlChartsView() {
  const { state, dispatch } = useSPC()
  const { selectedMaterial, selectedMIC, selectedPlant, dateFrom, dateTo, chartTypeOverride, excludedIndices, ruleSet, excludeOutliers, exclusionAudit, exclusionDialog } = state
  const { exportData, exporting } = useExport()
  const [autoCleanLog, setAutoCleanLog] = useState(null)
  const [rollingWindowSize, setRollingWindowSize] = useState(20)
  const [attrChartType, setAttrChartType] = useState('p_chart')

  // Reset attribute chart type selection whenever the MIC changes
  useEffect(() => { setAttrChartType('p_chart') }, [selectedMIC?.mic_id])

  const isAttributeMIC = selectedMIC?.chart_type === 'p_chart'
  const isPChart = isAttributeMIC && attrChartType === 'p_chart'
  const isCountChart = isAttributeMIC && ['c_chart', 'u_chart', 'np_chart'].includes(attrChartType)
  const isAttributeChart = isAttributeMIC
  const isQuantitative = !isAttributeChart
  const effectiveChartType = isQuantitative ? (chartTypeOverride ?? (selectedMIC?.chart_type ?? 'imr')) : null

  const { stratifyAll, limitsMode } = state

  const { points: quantPoints, normality: quantNormality, dataTruncated, loading: quantLoading, error: quantError } = useSPCChartData(
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

  const points = isPChart ? attrPoints : isCountChart ? countPoints : quantPoints
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
    () => spc?.sorted ? computeRollingCapability(spc.sorted, rollingWindowSize, spc.specConfig ?? {}) : [],
    [spc, rollingWindowSize],
  )
  const currentExcludedPoints = useMemo(
    () => (isQuantitative ? toExcludedPoints(quantPoints, excludedIndices) : []),
    [isQuantitative, quantPoints, excludedIndices],
  )

  useEffect(() => {
    dispatch({ type: exclusionsSnapshot ? 'SET_EXCLUSION_AUDIT' : 'CLEAR_EXCLUSION_AUDIT', payload: exclusionsSnapshot ?? null })
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

  const persistExclusions = async (nextExcludedIndices, justification, action) => {
    if (!selectedMaterial || !selectedMIC || !effectiveChartType) return

    const beforeLimits = getLimitsSnapshot(spc)
    const recomputed = recomputeForExcludedSet(quantPoints, nextExcludedIndices, effectiveChartType, ruleSet, quantNormality)
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

  const openDialog = (payload) => {
    dispatch({ type: 'OPEN_EXCLUSION_DIALOG', payload })
  }

  const closeDialog = () => {
    if (exclusionsSaving) return
    dispatch({ type: 'CLOSE_EXCLUSION_DIALOG' })
  }

  const handlePointClick = (index) => {
    const point = quantPoints[index]
    if (!point) return

    const nextExcluded = new Set(excludedIndices)
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
    if (!spc?.indexedPoints?.length) return
    const result = autoCleanPhaseI(spc.indexedPoints, effectiveChartType, ruleSet, spc.specConfig ?? {})
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

  const handleRestorePoint = (point) => {
    const [index] = mapExcludedPointsToIndices(quantPoints, [point])
    if (index == null) return

    const nextExcluded = new Set(excludedIndices)
    nextExcluded.delete(index)
    openDialog({
      action: 'manual_restore',
      point: quantPoints[index],
      excludedCount: nextExcluded.size,
      nextExcludedIndices: [...nextExcluded].sort((a, b) => a - b),
    })
  }

  const handleDialogSubmit = async ({ justification }) => {
    if (!exclusionDialog) return
    try {
      await persistExclusions(
        new Set(exclusionDialog.nextExcludedIndices ?? []),
        justification,
        exclusionDialog.action,
      )
      if (exclusionDialog.action === 'auto_clean_phase_i') {
        setAutoCleanLog(exclusionDialog.autoCleanLog ?? null)
      }
      dispatch({ type: 'CLOSE_EXCLUSION_DIALOG' })
    } catch {
      // Hook-level error state surfaces the failure banner.
    }
  }

  if (!selectedMaterial) {
    return (
      <div className="spc-empty-state">
        <div className="spc-empty-icon">📈</div>
        <p>Select a material and characteristic above to view control charts.</p>
      </div>
    )
  }

  if (!selectedMIC) {
    return (
      <div className="spc-empty-state">
        <p>Material selected: <strong>{selectedMaterial.material_name}</strong></p>
        <p className="spc-empty-sub">Now select a characteristic (MIC) to view its control chart.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="spc-loading">
        <div className="spc-spinner" />
        <p>Loading measurement data…</p>
      </div>
    )
  }

  if (error) {
    return <div className="banner banner--error">Failed to load chart data: {error}</div>
  }

  if (!points.length) {
    return (
      <div className="spc-empty-state">
        <p>No {isAttributeChart ? 'attribute' : 'quantitative'} data found for <strong>{selectedMIC.mic_name}</strong>.</p>
        <p className="spc-empty-sub">Try widening the date range or selecting a different characteristic.</p>
      </div>
    )
  }

  if (isQuantitative && !spc) {
    return (
      <div className="spc-empty-state">
        <p>Insufficient data to compute control limits (minimum 2 points required).</p>
      </div>
    )
  }

  const externalLimits = (limitsMode === 'locked' && lockedLimits) ? lockedLimits : null

  const headerLeft = (
    <div>
      <span className="spc-charts-title">{selectedMIC.mic_name || selectedMIC.mic_id}</span>
      <span className="spc-charts-material"> · {selectedMaterial.material_name}</span>
      {selectedMIC.inspection_method && (
        <div className="spc-charts-mic-meta">
          <span className="spc-meta-item spc-meta-method">Method: {selectedMIC.inspection_method}</span>
        </div>
      )}
    </div>
  )

  if (isAttributeChart) {
    return (
      <div className="spc-charts-layout">
        <div className="spc-charts-header">
          {headerLeft}
          <div className="spc-charts-header-right">
            <AttributeChartTypeToggle attrChartType={attrChartType} onSet={setAttrChartType} />
          </div>
        </div>
        <div className="spc-charts-main">
          {attrChartType === 'p_chart'  && <PChart  points={attrPoints} />}
          {attrChartType === 'c_chart'  && <CChart  points={countPoints} />}
          {attrChartType === 'u_chart'  && <UChart  points={countPoints} />}
          {attrChartType === 'np_chart' && <NPChart points={countPoints} />}
        </div>
      </div>
    )
  }

  return (
    <div className="spc-charts-layout">
      {/* Header bar */}
      <div className="spc-charts-header">
        {headerLeft}
        <div className="spc-charts-header-right">
          <RuleSetToggle
            ruleSet={ruleSet}
            onSet={v => dispatch({ type: 'SET_RULE_SET', payload: v })}
          />
          <ChartTypeToggle
            chartType={selectedMIC.chart_type}
            override={chartTypeOverride}
            onOverride={v => dispatch({ type: 'SET_CHART_TYPE_OVERRIDE', payload: v })}
          />
          {/* Stratify by plant toggle — only when no plant is filtered */}
          {!selectedPlant && (
            <button
              className={'spc-btn spc-btn--sm' + (stratifyAll ? ' spc-btn--primary' : ' spc-btn--secondary')}
              onClick={() => dispatch({ type: 'TOGGLE_STRATIFY_ALL' })}
              title="Show all plants as separate coloured series"
            >
              {stratifyAll ? 'Stratified' : 'Stratify by Plant'}
            </button>
          )}
          {/* Locked limits toggle */}
          {lockedLimits && (
            <button
              className={'spc-btn spc-btn--sm' + (limitsMode === 'locked' ? ' spc-btn--primary' : ' spc-btn--secondary')}
              onClick={() => dispatch({ type: 'SET_LIMITS_MODE', payload: limitsMode === 'locked' ? 'live' : 'locked' })}
              title={`Locked ${lockedLimits.locked_at?.substring(0, 10) ?? ''} by ${lockedLimits.locked_by ?? 'unknown'}`}
            >
              {limitsMode === 'locked' ? 'Locked Limits' : 'Use Locked Limits'}
            </button>
          )}
          {spc && limitsMode === 'live' && (
            <button
              className="spc-btn spc-btn--sm spc-btn--secondary"
              onClick={() => {
                const limits = spc.chartType === 'imr'
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
                saveLimits(limits).catch(() => {})
              }}
              title="Lock current control limits for Phase II monitoring"
            >
              Lock Limits
            </button>
          )}
          {lockedLimits && limitsMode === 'locked' && (
            <button className="spc-btn spc-btn--sm spc-btn--danger" onClick={() => deleteLimits().catch(() => {})} title="Remove locked limits">
              Delete Lock
            </button>
          )}
          {quantPoints.some(p => p.is_outlier) && (
            <label className="spc-toggle-label">
              <input
                type="checkbox"
                checked={excludeOutliers}
                onChange={() => dispatch({ type: 'TOGGLE_EXCLUDE_OUTLIERS' })}
              />
              Exclude attribute outliers ({quantPoints.filter(p => p.is_outlier).length})
            </label>
          )}
          {excludedIndices.size > 0 && (
            <button
              className="spc-btn spc-btn--sm spc-btn--secondary"
              disabled={exclusionsSaving}
              onClick={handleRestoreAll}
            >
              Clear {excludedIndices.size} exclusion{excludedIndices.size !== 1 ? 's' : ''}
            </button>
          )}
          {spc?.indexedPoints?.length > 0 && (
            <button
              className="spc-btn spc-btn--sm spc-btn--secondary"
              disabled={exclusionsSaving}
              onClick={handleAutoClean}
              title="Iteratively remove Rule 1 OOC points to establish Phase I baseline limits"
            >
              {exclusionsSaving ? 'Saving…' : 'Auto-clean Phase I'}
            </button>
          )}
          <button
            className="spc-btn spc-btn--sm spc-btn--secondary"
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
            className="spc-btn spc-btn--sm spc-btn--secondary"
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

      {/* Control charts */}
      <div className="spc-charts-main">
        {spc.chartType === 'imr' ? (
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
            signals={spc.signals}
            mrSignals={spc.mrSignals}
            externalLimits={externalLimits}
          />
        )}
      </div>

      {/* Signals + Capability side by side */}
      <div className="spc-charts-bottom">
        <SignalsPanel
          signals={spc.signals}
          mrSignals={spc.mrSignals}
          indexedPoints={spc.indexedPoints}
          ruleSet={ruleSet}
        />
        <div className="spc-side-stack">
          <CapabilityPanel spc={spc} />
          <ExcludedPointsPanel
            snapshot={exclusionsSnapshot ?? exclusionAudit}
            currentPoints={currentExcludedPoints}
            onRestorePoint={handleRestorePoint}
            onRestoreAll={handleRestoreAll}
            saving={exclusionsSaving}
          />
        </div>
      </div>

      {/* Auto-clean log */}
      {autoCleanLog && (
        <div className="spc-autoclean-log">
          <div className="spc-autoclean-log-header">
            <strong>Phase I Auto-clean result</strong>
            {autoCleanLog.stable
              ? <span className="spc-badge spc-badge--green">Stable after {autoCleanLog.iterationLog.length} iteration{autoCleanLog.iterationLog.length !== 1 ? 's' : ''}</span>
              : <span className="spc-badge spc-badge--amber">Not fully stable — {autoCleanLog.cleanedIndices.size} point{autoCleanLog.cleanedIndices.size !== 1 ? 's' : ''} excluded</span>
            }
            <button className="spc-btn spc-btn--sm spc-btn--ghost" onClick={() => setAutoCleanLog(null)}>Dismiss</button>
          </div>
          {autoCleanLog.iterationLog.map((iter, i) => (
            <div key={i} className="spc-autoclean-iter">
              Iteration {iter.iteration}: removed {iter.removedCount} point{iter.removedCount !== 1 ? 's' : ''}
              {iter.removedCount > 0 && ` (indices: ${iter.removedOriginalIndices.join(', ')})`}
              {' '}· UCL={iter.ucl?.toFixed(4) ?? '—'}, CL={iter.cl?.toFixed(4) ?? '—'}, LCL={iter.lcl?.toFixed(4) ?? '—'}
            </div>
          ))}
        </div>
      )}

      {/* Rolling Capability Trend */}
      {spc.sorted?.length >= 15 && (
        <div className="spc-rolling-panel">
          <div className="spc-rolling-panel-header">
            <span className="spc-rolling-panel-title">Rolling Capability Trend</span>
            <label className="spc-rolling-window-label">
              Window:
              <input
                type="number"
                className="spc-rolling-window-input"
                min={10}
                max={50}
                value={rollingWindowSize}
                onChange={e => setRollingWindowSize(Math.max(10, Math.min(50, Number(e.target.value))))}
              />
            </label>
          </div>
          <CapabilityTrendChart trendData={trendData} windowSize={rollingWindowSize} />
        </div>
      )}

      <ExclusionJustificationModal
        dialog={exclusionDialog}
        saving={exclusionsSaving}
        onCancel={closeDialog}
        onSubmit={handleDialogSubmit}
      />
    </div>
  )
}
