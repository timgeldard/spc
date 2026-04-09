import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'

import './ensureEChartsTheme'
import { useSPC } from '../SPCContext'
import { useControlChartsController } from '../hooks/useControlChartsController'
import type { LockedLimits, SPCComputationResult } from '../types'
import {
  autoCleanHeaderClass,
  autoCleanIterClass,
  autoCleanLogClass,
  badgeAmberClass,
  badgeGreenClass,
  buttonBaseClass,
  buttonGhostClass,
  buttonSmClass,
  heroCardDenseClass,
} from '../uiClasses'
import InfoBanner from '../components/InfoBanner'
import LoadingSkeleton from '../components/LoadingSkeleton'
import ModuleEmptyState from '../components/ModuleEmptyState'
import ChartCard from './ChartCard'
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

type PanelId = 'primary' | 'capability' | 'signals' | 'trend' | 'exclusions' | 'stratification'

const DEFAULT_VISIBLE_PANELS: PanelId[] = ['primary', 'capability', 'signals', 'trend', 'exclusions', 'stratification']

function renderQuantitativeChart(
  spcResult: SPCComputationResult,
  limits: LockedLimits | null,
  excludedSet: Set<number>,
  onPointClick?: (index: number) => void,
  embedded = false,
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
          embedded={embedded}
        />
      ) : (
        <XbarRChart
          spc={spcResult}
          signals={spcResult.signals}
          mrSignals={spcResult.mrSignals}
          externalLimits={limits}
          embedded={embedded}
        />
      )}
    </Suspense>
  )
}

function PanelSelector({
  availablePanels,
  visiblePanels,
  onToggle,
  stratifyLabel,
}: {
  availablePanels: Array<{ id: PanelId; label: string; description: string; disabled?: boolean }>
  visiblePanels: PanelId[]
  onToggle: (panelId: PanelId) => void
  stratifyLabel: string | null
}) {
  return (
    <div className="rounded-sm border border-[var(--c-border)] bg-[var(--c-surface)] p-6 shadow-sm">
      <h3 className="font-semibold text-[var(--c-text)]">Display Panels</h3>
      <div className="mt-4 space-y-3">
        {availablePanels.map(panel => (
          <label
            key={panel.id}
            className={`flex cursor-pointer items-start gap-3 ${panel.disabled ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            <input
              type="checkbox"
              checked={visiblePanels.includes(panel.id)}
              onChange={() => !panel.disabled && onToggle(panel.id)}
              disabled={panel.disabled}
              className="mt-1 h-4 w-4 accent-blue-600"
            />
            <span>
              <span className="block text-sm font-medium text-[var(--c-text)]">{panel.label}</span>
              <span className="block text-xs text-[var(--c-text-muted)]">{panel.description}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="mt-8 border-t border-[var(--c-border)] pt-6">
        <h4 className="text-sm font-medium text-[var(--c-text)]">Stratification</h4>
        <p className="mt-2 text-xs text-[var(--c-text-muted)]">
          {stratifyLabel
            ? `Current view is stratified by ${stratifyLabel}.`
            : 'Line, shift, lot, and plant context are inherited from the top filter bar.'}
        </p>
      </div>
    </div>
  )
}

export default function ControlChartsView() {
  const { state, dispatch } = useSPC()
  const { selectedMaterial, selectedMIC, selectedPlant, dateFrom, dateTo, excludedIndices, exclusionDialog, limitsMode } = state
  const ctrl = useControlChartsController()
  const excludedPanelRef = useRef<HTMLDivElement>(null)
  const [visiblePanels, setVisiblePanels] = useState<PanelId[]>(DEFAULT_VISIBLE_PANELS)
  const [actionNote, setActionNote] = useState<string | null>(null)

  useEffect(() => {
    setActionNote(null)
  }, [selectedMIC?.mic_id, ctrl.attrChartType, ctrl.effectiveChartType])

  useEffect(() => {
    if (state.roleMode === 'operator') {
      setVisiblePanels(current => current.filter(panelId => panelId === 'primary'))
    }
  }, [state.roleMode])

  const togglePanel = (panelId: PanelId) => {
    setVisiblePanels(current => (
      current.includes(panelId)
        ? current.filter(id => id !== panelId)
        : [...current, panelId]
    ))
  }

  const isVisible = (panelId: PanelId) => visiblePanels.includes(panelId)

  const exportPayload = {
    export_type: 'excel',
    export_scope: ctrl.isAttributeChart ? 'attribute_chart' : 'chart_data',
    material_id: selectedMaterial?.material_id ?? null,
    mic_id: selectedMIC?.mic_id ?? null,
    plant_id: selectedPlant?.plant_id ?? null,
    date_from: dateFrom || null,
    date_to: dateTo || null,
  }

  const availablePanels = useMemo<Array<{ id: PanelId; label: string; description: string; disabled?: boolean }>>(() => [
    { id: 'primary', label: 'Primary chart', description: 'Main control chart with live signals and limits.' },
    { id: 'capability', label: 'Capability panel', description: 'Capability metrics and spec interpretation.', disabled: ctrl.isAttributeChart || state.roleMode === 'operator' },
    { id: 'signals', label: 'Signal queue', description: 'Ordered rule violations and supporting evidence.', disabled: ctrl.isAttributeChart || state.roleMode === 'operator' },
    { id: 'trend', label: 'Capability trend', description: 'Rolling capability storyline over time.', disabled: ctrl.isAttributeChart || state.roleMode === 'operator' },
    { id: 'exclusions', label: 'Exclusions', description: 'Audited exclusions and restore actions.', disabled: ctrl.isAttributeChart || state.roleMode === 'operator' },
    { id: 'stratification', label: 'Stratification', description: 'Split the chart into comparison strata.', disabled: ctrl.stratumSections.length === 0 || state.roleMode === 'operator' },
  ], [ctrl.isAttributeChart, ctrl.stratumSections.length, state.roleMode])

  const primarySubtitle = ctrl.isAttributeChart
    ? `${ctrl.chartFamilyLabel} · ${selectedMaterial?.material_name ?? selectedMaterial?.material_id ?? ''}`
    : `${ctrl.chartFamilyLabel}${ctrl.stratifyLabel ? ` · Stratified by ${ctrl.stratifyLabel}` : ''}`

  const primaryCapability = ctrl.capabilityHeadline?.value ?? null

  const handleExcludeAssist = () => {
    setActionNote(
      ctrl.isAttributeChart
        ? 'Exclusion request recorded. Attribute-chart point removal will connect to the backend audit workflow in the next iteration.'
        : 'Exclusion request recorded. Click any chart point to exclude or restore it, and the audit trail will carry the justification you just entered.',
    )
  }

  const handleAnnotate = () => {
    setActionNote('Annotation threads are staged for the next iteration. For now, use the exclusion audit trail and exported evidence package.')
  }

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
    return (
      <div aria-live="polite" aria-busy="true">
        <LoadingSkeleton message="Loading measurement data…" />
      </div>
    )
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

  return (
    <div className="space-y-6" aria-live="polite" aria-busy="false">
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
        quantNormality={ctrl.isAttributeChart ? null : ctrl.quantNormality}
        ruleSet={state.ruleSet}
        actionRail={null}
        lockedLimits={ctrl.lockedLimits}
        limitsMode={limitsMode}
        onExclusionClick={ctrl.exclusionCount > 0
          ? () => excludedPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          : undefined}
      />

      <ChartInfoBanners
        lockedLimitsError={ctrl.lockedLimitsError}
        exclusionsError={ctrl.exclusionsError}
        exclusionsLoading={ctrl.exclusionsLoading}
        dataTruncated={ctrl.dataTruncated}
        exclusionAudit={state.exclusionAudit}
      />

      <div className="flex flex-col gap-6 xl:flex-row">
        <aside className="w-full shrink-0 space-y-4 xl:sticky xl:top-24 xl:w-72 xl:self-start">
          <PanelSelector
            availablePanels={availablePanels}
            visiblePanels={visiblePanels}
            onToggle={togglePanel}
            stratifyLabel={ctrl.stratifyLabel}
          />

          {state.roleMode === 'engineer' ? (
            <ChartSettingsRail
              ruleSet={state.ruleSet}
              onRuleSetChange={value => dispatch({ type: 'SET_RULE_SET', payload: value })}
              selectedMicChartType={selectedMIC.chart_type}
              chartTypeOverride={state.chartTypeOverride}
              onChartTypeOverride={value => dispatch({ type: 'SET_CHART_TYPE_OVERRIDE', payload: value })}
              attrChartType={ctrl.attrChartType}
              onAttrChartTypeChange={ctrl.setAttrChartType}
              isAttributeChart={ctrl.isAttributeChart}
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
          ) : (
            <div className="rounded-sm border border-[var(--c-border)] bg-[var(--c-surface)] p-5 text-sm text-[var(--c-text-muted)] shadow-sm">
              Operator mode keeps this view focused on live monitoring. Switch back to Engineer mode in the header to unlock rule tuning, limit controls, and the audit panels.
            </div>
          )}
        </aside>

        <div className="min-w-0 flex-1 space-y-6">
          {isVisible('primary') && (
            <ChartCard
              title={selectedMIC.mic_name || selectedMIC.mic_id}
              subtitle={primarySubtitle}
              cpk={primaryCapability}
              note={actionNote}
              onExcludePoint={handleExcludeAssist}
              onExport={() => ctrl.exportData(exportPayload)}
              onAnnotate={handleAnnotate}
              exportLabel="Export Data"
            >
              {ctrl.isAttributeChart ? (
                <Suspense fallback={<LoadingSkeleton minHeight="420px" message="Loading chart…" />}>
                  {ctrl.attrChartType === 'p_chart' && <PChart points={ctrl.attrPoints} embedded />}
                  {ctrl.attrChartType === 'c_chart' && <CChart points={ctrl.countPoints} embedded />}
                  {ctrl.attrChartType === 'u_chart' && <UChart points={ctrl.countPoints} embedded />}
                  {ctrl.attrChartType === 'np_chart' && <NPChart points={ctrl.countPoints} embedded />}
                </Suspense>
              ) : (
                ctrl.spc
                  ? renderQuantitativeChart(ctrl.spc, ctrl.externalLimits, excludedIndices, ctrl.handlePointClick, true)
                  : null
              )}
            </ChartCard>
          )}

          {!ctrl.isAttributeChart && (
            <>
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
                {isVisible('capability') && (
                  <Suspense fallback={<LoadingSkeleton minHeight="160px" message="Loading panel…" />}>
                    <CapabilityPanel spc={ctrl.spc} />
                  </Suspense>
                )}

                {isVisible('exclusions') && (
                  <div ref={excludedPanelRef}>
                    <Suspense fallback={<LoadingSkeleton minHeight="160px" message="Loading panel…" />}>
                      <ExcludedPointsPanel
                        snapshot={ctrl.exclusionsSnapshot ?? state.exclusionAudit}
                        currentPoints={ctrl.currentExcludedPoints}
                        onRestorePoint={ctrl.handleRestorePoint}
                        onRestoreAll={ctrl.handleRestoreAll}
                        saving={ctrl.exclusionsSaving}
                      />
                    </Suspense>
                  </div>
                )}
              </div>

              {(!isVisible('capability') && !isVisible('exclusions')) && (
                <div className={heroCardDenseClass}>
                  <div className="text-sm font-semibold text-[var(--c-text)]">Interpretation guide</div>
                  <p className="mt-2 text-sm leading-6 text-[var(--c-text-muted)]">
                    Establish stability first, then interpret capability. Signals point to assignable causes, while exclusions and locked limits preserve the audit trail for this chart scope.
                  </p>
                </div>
              )}

              <div className="grid gap-6 xl:grid-cols-2">
                {isVisible('signals') && (
                  <Suspense fallback={<LoadingSkeleton minHeight="160px" message="Loading panel…" />}>
                    <SignalsPanel
                      signals={ctrl.spc?.signals}
                      mrSignals={ctrl.spc?.mrSignals}
                      indexedPoints={ctrl.spc?.indexedPoints}
                      ruleSet={state.ruleSet}
                    />
                  </Suspense>
                )}

                {isVisible('trend') && (
                  <ChartCard
                    title="Capability Storyline"
                    subtitle={`Rolling window ${ctrl.rollingWindowSize} observations`}
                    cpk={primaryCapability}
                    onExport={() => ctrl.exportData(exportPayload)}
                    onAnnotate={handleAnnotate}
                    exportLabel="Export Data"
                  >
                    <div className="mb-4 flex items-center justify-end">
                      <label className="flex items-center gap-2 text-sm text-[var(--c-text-muted)]">
                        Window
                        <input
                          type="number"
                          min={5}
                          max={Math.max(5, ctrl.spc?.sorted?.length ?? 5)}
                          value={ctrl.rollingWindowSize}
                          className="w-20 rounded-sm border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-sm text-[var(--c-text)]"
                          onChange={event => {
                            const next = Number(event.target.value)
                            if (Number.isFinite(next) && next >= 5) ctrl.setRollingWindowSize(next)
                          }}
                        />
                      </label>
                    </div>
                    <Suspense fallback={<LoadingSkeleton minHeight="220px" message="Loading panel…" />}>
                      <CapabilityTrendChart trendData={ctrl.trendData} windowSize={ctrl.rollingWindowSize} />
                    </Suspense>
                  </ChartCard>
                )}
              </div>

              {isVisible('stratification') && ctrl.stratumSections.length > 0 && (
                <StratificationPanel
                  micLabel={selectedMIC.mic_name || selectedMIC.mic_id}
                  stratifyBy={state.stratifyBy ?? ''}
                  sections={ctrl.stratumSections}
                  renderChart={sectionSpc => renderQuantitativeChart(sectionSpc, null, new Set<number>(), undefined, true)}
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
              )}
            </>
          )}
        </div>
      </div>

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
