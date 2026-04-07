import { Suspense, lazy } from 'react'

import './ensureEChartsTheme'
import { useSPC } from '../SPCContext'
import { useControlChartsController } from '../hooks/useControlChartsController'
import type { LockedLimits, SPCComputationResult } from '../types'
import type { QuantChartType } from './ChartSettingsRail'
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
  evidenceRailClass,
  heroCardDenseClass,
  rollingHeaderClass,
  rollingPanelClass,
  rollingTitleClass,
  rollingWindowInputClass,
  rollingWindowLabelClass,
  sideStackClass,
} from '../uiClasses'
import InfoBanner from '../components/InfoBanner'
import LoadingSkeleton from '../components/LoadingSkeleton'
import ModuleEmptyState from '../components/ModuleEmptyState'
import ChartInfoBanners from './ChartInfoBanners'
import ChartSettingsRail from './ChartSettingsRail'
import ChartSummaryBar from './ChartSummaryBar'
import StratificationPanel from './StratificationPanel'

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

// ── Chart stage ──────────────────────────────────────────────────────────────

function renderQuantitativeChart(
  spcResult: SPCComputationResult,
  limits: LockedLimits | null,
  excludedSet: Set<number>,
  onPointClick?: (index: number) => void,
) {
  return (
    <Suspense fallback={<LoadingSkeleton minHeight="520px" message="Loading chart…" />}>
      {spcResult.chartType === 'imr' ? (
        <IMRChart
          spc={spcResult}
          indexedPoints={spcResult.indexedPoints}
          signals={spcResult.signals}
          mrSignals={spcResult.mrSignals}
          excludedIndices={excludedSet}
          onPointClick={onPointClick}
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
}

// ── Main view ────────────────────────────────────────────────────────────────

export default function ControlChartsView() {
  const { state, dispatch } = useSPC()
  const { selectedMaterial, selectedMIC, selectedPlant, dateFrom, dateTo, excludedIndices, exclusionDialog, limitsMode } = state
  const ctrl = useControlChartsController()

  // ── Guard states ───────────────────────────────────────────────────────

  if (!selectedMaterial) {
    return (
      <ModuleEmptyState
        icon="📈"
        title="No scope selected"
        description="Select a material and characteristic above to view control charts."
      />
    )
  }

  if (!selectedMIC) {
    return (
      <ModuleEmptyState
        title={`Material: ${selectedMaterial.material_name ?? selectedMaterial.material_id}`}
        description="Now select a characteristic (MIC) to view its control chart."
      />
    )
  }

  if (ctrl.loading) {
    return <LoadingSkeleton message="Loading measurement data…" />
  }

  if (ctrl.error) {
    return <InfoBanner variant="error">Failed to load chart data: {ctrl.error}</InfoBanner>
  }

  if (!ctrl.points.length) {
    return (
      <ModuleEmptyState
        title={`No ${ctrl.isAttributeChart ? 'attribute' : 'quantitative'} data found for ${selectedMIC.mic_name ?? selectedMIC.mic_id}`}
        description="Try widening the date range or selecting a different characteristic."
      />
    )
  }

  if (ctrl.isQuantitative && !ctrl.spc) {
    return (
      <ModuleEmptyState
        title="Insufficient data"
        description="Minimum 2 points required to compute control limits."
      />
    )
  }

  // ── Action rail (export buttons) ───────────────────────────────────────

  const actionRail = ctrl.isAttributeChart ? null : (
    <>
      <button
        className={`${buttonBaseClass} ${buttonSmClass} ${buttonSecondaryClass}`}
        disabled={ctrl.exporting}
        onClick={() => ctrl.exportData({
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
        {ctrl.exporting ? 'Exporting…' : 'Export Excel'}
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

  // ── Attribute chart layout ─────────────────────────────────────────────

  if (ctrl.isAttributeChart) {
    return (
      <div className={chartsLayoutClass}>
        <ChartSummaryBar
          title={selectedMIC.mic_name || selectedMIC.mic_id}
          materialName={selectedMaterial.material_name || selectedMaterial.material_id}
          inspectionMethod={selectedMIC.inspection_method}
          chartFamilyLabel={ctrl.chartFamilyLabel}
          totalSignals={0}
          exclusionCount={0}
          capabilityHeadline={null}
          capabilityHeadlineLabel={null}
          stratifyLabel={ctrl.stratifyLabel}
          quantNormality={null}
          ruleSet={state.ruleSet}
          actionRail={null}
        />
        <div className={chartsMainClass}>
          <Suspense fallback={<LoadingSkeleton minHeight="520px" message="Loading chart…" />}>
            {ctrl.attrChartType === 'p_chart' && <PChart points={ctrl.attrPoints} />}
            {ctrl.attrChartType === 'c_chart' && <CChart points={ctrl.countPoints} />}
            {ctrl.attrChartType === 'u_chart' && <UChart points={ctrl.countPoints} />}
            {ctrl.attrChartType === 'np_chart' && <NPChart points={ctrl.countPoints} />}
          </Suspense>
        </div>
      </div>
    )
  }

  // ── Quantitative chart layout ──────────────────────────────────────────

  return (
    <div className={chartsLayoutClass}>

      {/* ── Scope summary bar ── */}
      <ChartSummaryBar
        title={selectedMIC.mic_name || selectedMIC.mic_id}
        materialName={selectedMaterial.material_name || selectedMaterial.material_id}
        inspectionMethod={selectedMIC.inspection_method}
        chartFamilyLabel={ctrl.chartFamilyLabel}
        totalSignals={ctrl.totalSignals}
        exclusionCount={ctrl.exclusionCount}
        capabilityHeadline={ctrl.capabilityHeadline?.value ?? null}
        capabilityHeadlineLabel={ctrl.capabilityHeadline?.label ?? null}
        stratifyLabel={ctrl.stratifyLabel}
        quantNormality={ctrl.quantNormality}
        ruleSet={state.ruleSet}
        actionRail={actionRail}
      />

      {/* ── Contextual banners ── */}
      <ChartInfoBanners
        lockedLimitsError={ctrl.lockedLimitsError}
        exclusionsError={ctrl.exclusionsError}
        exclusionsLoading={ctrl.exclusionsLoading}
        dataTruncated={ctrl.dataTruncated}
        exclusionAudit={state.exclusionAudit}
      />

      {/* ── Chart workspace: settings rail + main chart + evidence rail ── */}
      <div className={chartsWorkspaceClass}>
        <div className={sideStackClass}>
          <ChartSettingsRail
            ruleSet={state.ruleSet}
            onRuleSetChange={value => dispatch({ type: 'SET_RULE_SET', payload: value })}
            selectedMicChartType={selectedMIC.chart_type}
            chartTypeOverride={state.chartTypeOverride}
            onChartTypeOverride={value => dispatch({ type: 'SET_CHART_TYPE_OVERRIDE', payload: value })}
            attrChartType={ctrl.attrChartType}
            onAttrChartTypeChange={ctrl.setAttrChartType}
            isAttributeChart={false}
            lockedLimits={ctrl.lockedLimits}
            limitsMode={limitsMode}
            onLimitsMode={value => dispatch({ type: 'SET_LIMITS_MODE', payload: value })}
            canLockLimits={ctrl.canLockLimits}
            onLockLimits={ctrl.handleLockLimits}
            onDeleteLock={ctrl.handleDeleteLock}
            quantPoints={ctrl.quantPoints}
            excludeOutliers={state.excludeOutliers}
            onToggleExcludeOutliers={() => dispatch({ type: 'TOGGLE_EXCLUDE_OUTLIERS' })}
            exclusionCount={ctrl.exclusionCount}
            exclusionsSaving={ctrl.exclusionsSaving}
            onRestoreAll={ctrl.handleRestoreAll}
            canAutoClean={(ctrl.spc?.indexedPoints?.length ?? 0) > 0}
            onAutoClean={ctrl.handleAutoClean}
          />
          <div className={chartsMainClass}>
            {ctrl.spc
              ? renderQuantitativeChart(ctrl.spc, ctrl.externalLimits, excludedIndices, ctrl.handlePointClick)
              : null}
          </div>
        </div>

        {/* ── Evidence rail ── */}
        <div className={evidenceRailClass}>
          <Suspense fallback={<LoadingSkeleton minHeight="160px" message="Loading panel…" />}>
            <CapabilityPanel spc={ctrl.spc} />
          </Suspense>
          <Suspense fallback={<LoadingSkeleton minHeight="160px" message="Loading panel…" />}>
            <ExcludedPointsPanel
              snapshot={ctrl.exclusionsSnapshot ?? state.exclusionAudit}
              currentPoints={ctrl.currentExcludedPoints}
              onRestorePoint={ctrl.handleRestorePoint}
              onRestoreAll={ctrl.handleRestoreAll}
              saving={ctrl.exclusionsSaving}
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

      {/* ── Bottom row: signals + rolling capability ── */}
      <div className={chartsBottomClass}>
        <Suspense fallback={<LoadingSkeleton minHeight="160px" message="Loading panel…" />}>
          <SignalsPanel
            signals={ctrl.spc?.signals}
            mrSignals={ctrl.spc?.mrSignals}
            indexedPoints={ctrl.spc?.indexedPoints}
            ruleSet={state.ruleSet}
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
                max={Math.max(5, ctrl.spc?.sorted?.length ?? 5)}
                value={ctrl.rollingWindowSize}
                className={rollingWindowInputClass}
                onChange={event => {
                  const next = Number(event.target.value)
                  if (Number.isFinite(next) && next >= 5) ctrl.setRollingWindowSize(next)
                }}
              />
            </label>
          </div>
          <Suspense fallback={<LoadingSkeleton minHeight="160px" message="Loading panel…" />}>
            <CapabilityTrendChart trendData={ctrl.trendData} windowSize={ctrl.rollingWindowSize} />
          </Suspense>
        </div>
      </div>

      {/* ── Stratification panels ── */}
      <StratificationPanel
        micLabel={selectedMIC.mic_name || selectedMIC.mic_id}
        stratifyBy={state.stratifyBy ?? ''}
        sections={ctrl.stratumSections}
        renderChart={sectionSpc => renderQuantitativeChart(sectionSpc, null, new Set<number>())}
        renderSignals={sectionSpc => (
          <Suspense fallback={<LoadingSkeleton minHeight="160px" message="Loading panel…" />}>
            <SignalsPanel
              signals={sectionSpc.signals}
              mrSignals={sectionSpc.mrSignals}
              indexedPoints={sectionSpc.indexedPoints}
              ruleSet={state.ruleSet}
            />
          </Suspense>
        )}
        renderCapability={sectionSpc => (
          <Suspense fallback={<LoadingSkeleton minHeight="160px" message="Loading panel…" />}>
            <CapabilityPanel spc={sectionSpc} />
          </Suspense>
        )}
      />

      {/* ── Auto-clean log ── */}
      {ctrl.autoCleanLog && (
        <div className={autoCleanLogClass}>
          <div className={autoCleanHeaderClass}>
            <strong>Phase I Auto-clean result</strong>
            {ctrl.autoCleanLog.stable
              ? <span className={`${badgeGreenClass} inline-flex rounded-full px-2 py-0.5 text-xs font-medium`}>
                  Stable after {ctrl.autoCleanLog.iterationLog.length} iteration{ctrl.autoCleanLog.iterationLog.length !== 1 ? 's' : ''}
                </span>
              : <span className={`${badgeAmberClass} inline-flex rounded-full px-2 py-0.5 text-xs font-medium`}>
                  Not fully stable — {ctrl.autoCleanLog.cleanedIndices.size} point{ctrl.autoCleanLog.cleanedIndices.size !== 1 ? 's' : ''} excluded
                </span>}
            <button
              className={`${buttonBaseClass} ${buttonSmClass} ${buttonGhostClass}`}
              onClick={() => ctrl.setAutoCleanLog(null)}
            >
              Dismiss
            </button>
          </div>
          {ctrl.autoCleanLog.iterationLog.map((iter, index) => (
            <div key={index} className={autoCleanIterClass}>
              Iteration {iter.iteration}: removed {iter.removedCount} point{iter.removedCount !== 1 ? 's' : ''}
              {iter.removedCount > 0 && ` (indices: ${iter.removedOriginalIndices.join(', ')})`}
              {' '}· UCL={iter.ucl?.toFixed(4) ?? '—'}, CL={iter.cl?.toFixed(4) ?? '—'}, LCL={iter.lcl?.toFixed(4) ?? '—'}
            </div>
          ))}
        </div>
      )}

      {/* ── Exclusion justification modal ── */}
      <Suspense fallback={null}>
        <ExclusionJustificationModal
          dialog={exclusionDialog}
          saving={ctrl.exclusionsSaving}
          onCancel={ctrl.closeDialog}
          onSubmit={ctrl.handleDialogSubmit}
        />
      </Suspense>
    </div>
  )
}
