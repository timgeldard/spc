import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import './ensureEChartsTheme'
import {
  Button,
  Checkbox,
} from '~/lib/carbon-forms'
import { InlineNotification, SkeletonPlaceholder } from '~/lib/carbon-feedback'
import { Column, Grid, Stack, Tag, Tile } from '~/lib/carbon-layout'
import { shallowEqual, useSPCDispatch, useSPCSelector } from '../SPCContext'
import { useControlChartsController } from '../hooks/useControlChartsController'
import type { LockedLimits, SPCComputationResult } from '../types'
import ModuleEmptyState from '../components/ModuleEmptyState'
import ChartCard from './ChartCard'
import ChartInfoBanners from './ChartInfoBanners'
import ChartSettingsRail from './ChartSettingsRail'
import ChartSummaryBar from './ChartSummaryBar'
import StratificationPanel from './StratificationPanel'

const IndividualsChart           = lazy(() => import('./IndividualsChart'))
const MovingRangeChart           = lazy(() => import('./MovingRangeChart'))
const XbarChart                  = lazy(() => import('./XbarChart'))
const RangeChart                 = lazy(() => import('./RangeChart'))
const PChart                     = lazy(() => import('./PChart'))
const CChart                     = lazy(() => import('./CChart'))
const UChart                     = lazy(() => import('./UChart'))
const NPChart                    = lazy(() => import('./NPChart'))
const CapabilityPanel            = lazy(() => import('./CapabilityPanel'))
const CapabilityTrendChart       = lazy(() => import('./CapabilityTrendChart'))
const ExcludedPointsPanel        = lazy(() => import('./ExcludedPointsPanel'))
const ExclusionJustificationModal = lazy(() => import('./ExclusionJustificationModal'))
const SignalsPanel               = lazy(() => import('./SignalsPanel'))

// ── Types ──────────────────────────────────────────────────────────────────

type PanelId = 'primary' | 'capability' | 'signals' | 'trend' | 'exclusions' | 'stratification'

const DEFAULT_VISIBLE_PANELS: PanelId[] = [
  'primary', 'capability', 'signals', 'trend', 'exclusions', 'stratification',
]

// ── Chart skeleton (replaces custom LoadingSkeleton for ECharts containers) -

function ChartSkeleton({ height = '520px' }: { height?: string }) {
  return <SkeletonPlaceholder style={{ width: '100%', height }} />
}

// ── Quantitative chart switcher (ECharts logic preserved exactly) ──────────

function renderQuantitativeChart(
  spcResult: SPCComputationResult,
  limits: LockedLimits | null,
  excludedSet: Set<number>,
  onPointClick?: (index: number) => void,
) {
  return (
    <Suspense fallback={<ChartSkeleton height="520px" />}>
      {spcResult.chartType === 'imr' ? (
        <>
          <IndividualsChart
            spc={spcResult}
            indexedPoints={spcResult.indexedPoints}
            signals={spcResult.signals}
            excludedIndices={excludedSet}
            onPointClick={onPointClick}
            externalLimits={limits}
          />
          <MovingRangeChart
            spc={spcResult}
            indexedPoints={spcResult.indexedPoints ?? []}
            mrSignals={spcResult.mrSignals ?? []}
            externalUclMr={limits?.ucl_r}
          />
        </>
      ) : (
        <>
          <XbarChart
            spc={spcResult}
            signals={spcResult.signals}
            externalLimits={limits}
          />
          <RangeChart
            spc={spcResult}
            mrSignals={spcResult.mrSignals ?? []}
            externalUclR={limits?.ucl_r}
          />
        </>
      )}
    </Suspense>
  )
}

// ── Panel selector (Carbon Checkbox replaces custom input) ────────────────

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
    <Tile>
      <Stack gap={4}>
        <p
          style={{
            margin: 0,
            fontSize: '0.875rem',
            fontWeight: 600,
            color: 'var(--cds-text-primary)',
          }}
        >
          Display Panels
        </p>

        <Stack gap={3}>
          {availablePanels.map(panel => (
            <div key={panel.id}>
              <Checkbox
                id={`panel-toggle-${panel.id}`}
                labelText={panel.label}
                checked={visiblePanels.includes(panel.id)}
                onChange={() => !panel.disabled && onToggle(panel.id)}
                disabled={panel.disabled}
              />
              <p
                style={{
                  margin: '0.125rem 0 0 1.625rem',
                  fontSize: '0.75rem',
                  color: 'var(--cds-text-secondary)',
                }}
              >
                {panel.description}
              </p>
            </div>
          ))}
        </Stack>

        <div style={{ borderTop: '1px solid var(--cds-border-subtle-01)', paddingTop: '1rem' }}>
          <p
            style={{
              margin: '0 0 0.5rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: 'var(--cds-text-primary)',
            }}
          >
            Stratification
          </p>
          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
            {stratifyLabel
              ? `Current view is stratified by ${stratifyLabel}.`
              : 'Line, shift, lot, and plant context are inherited from the top filter bar.'}
          </p>
        </div>
      </Stack>
    </Tile>
  )
}

// ── Auto-clean result panel ────────────────────────────────────────────────

function AutoCleanLog({
  log,
  onDismiss,
}: {
  log: NonNullable<ReturnType<typeof useControlChartsController>['autoCleanLog']>
  onDismiss: () => void
}) {
  return (
    <Tile>
      <Stack gap={3}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: '0.875rem', color: 'var(--cds-text-primary)' }}>
            Phase I Auto-clean result
          </strong>
          {log.stable
            ? (
              <Tag type="green" size="sm">
                Stable after {log.iterationLog.length} iteration{log.iterationLog.length !== 1 ? 's' : ''}
              </Tag>
            ) : (
              <Tag type="warm-gray" size="sm">
                Not fully stable — {log.cleanedIndices.size} point{log.cleanedIndices.size !== 1 ? 's' : ''} excluded
              </Tag>
            )}
          <Button kind="ghost" size="sm" onClick={onDismiss}>Dismiss</Button>
        </div>

        {log.iterationLog.map((iter, i) => (
          <p key={i} style={{ margin: 0, fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
            Iteration {iter.iteration}: removed {iter.removedCount} point{iter.removedCount !== 1 ? 's' : ''}
            {iter.removedCount > 0 && ` (indices: ${iter.removedOriginalIndices.join(', ')})`}
            {' '}· UCL={iter.ucl?.toFixed(4) ?? '—'}, CL={iter.cl?.toFixed(4) ?? '—'}, LCL={iter.lcl?.toFixed(4) ?? '—'}
          </p>
        ))}
      </Stack>
    </Tile>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────

export default function ControlChartsView() {
  const dispatch = useSPCDispatch()
  const state = useSPCSelector(
    current => ({
      selectedMaterial: current.selectedMaterial,
      selectedMIC: current.selectedMIC,
      selectedPlant: current.selectedPlant,
      dateFrom: current.dateFrom,
      dateTo: current.dateTo,
      excludedIndices: current.excludedIndices,
      exclusionDialog: current.exclusionDialog,
      exclusionAudit: current.exclusionAudit,
      chartTypeOverride: current.chartTypeOverride,
      excludeOutliers: current.excludeOutliers,
      limitsMode: current.limitsMode,
      roleMode: current.roleMode,
      ruleSet: current.ruleSet,
      stratifyBy: current.stratifyBy,
    }),
    shallowEqual,
  )
  const {
    selectedMaterial, selectedMIC, selectedPlant, dateFrom, dateTo,
    excludedIndices, exclusionDialog, limitsMode,
  } = state
  const ctrl = useControlChartsController()
  const excludedPanelRef = useRef<HTMLDivElement>(null)
  const [visiblePanels, setVisiblePanels] = useState<PanelId[]>(DEFAULT_VISIBLE_PANELS)
  const [actionNote, setActionNote] = useState<string | null>(null)

  useEffect(() => {
    setActionNote(null)
  }, [selectedMIC?.mic_id, ctrl.attrChartType, ctrl.effectiveChartType])

  useEffect(() => {
    if (state.roleMode === 'operator') {
      setVisiblePanels(cur => cur.filter(id => id === 'primary'))
    }
  }, [state.roleMode])

  const togglePanel  = (id: PanelId) =>
    setVisiblePanels(cur => cur.includes(id) ? cur.filter(p => p !== id) : [...cur, id])
  const isVisible    = (id: PanelId) => visiblePanels.includes(id)

  const exportPayload = {
    export_type:  'excel',
    export_scope: ctrl.isAttributeChart ? 'attribute_chart' : 'chart_data',
    material_id:  selectedMaterial?.material_id ?? null,
    mic_id:       selectedMIC?.mic_id           ?? null,
    plant_id:     selectedPlant?.plant_id       ?? null,
    date_from:    dateFrom || null,
    date_to:      dateTo   || null,
  }

  const availablePanels = useMemo<Array<{ id: PanelId; label: string; description: string; disabled?: boolean }>>(() => [
    { id: 'primary',        label: 'Primary chart',     description: 'Main control chart with live signals and limits.'             },
    { id: 'capability',     label: 'Capability panel',  description: 'Capability metrics and spec interpretation.',  disabled: ctrl.isAttributeChart || state.roleMode === 'operator' },
    { id: 'signals',        label: 'Signal queue',      description: 'Ordered rule violations and supporting evidence.', disabled: ctrl.isAttributeChart || state.roleMode === 'operator' },
    { id: 'trend',          label: 'Capability trend',  description: 'Rolling capability storyline over time.',      disabled: ctrl.isAttributeChart || state.roleMode === 'operator' },
    { id: 'exclusions',     label: 'Exclusions',        description: 'Audited exclusions and restore actions.',      disabled: ctrl.isAttributeChart || state.roleMode === 'operator' },
    { id: 'stratification', label: 'Stratification',    description: 'Split the chart into comparison strata.',      disabled: ctrl.stratumSections.length === 0 || state.roleMode === 'operator' },
  ], [ctrl.isAttributeChart, ctrl.stratumSections.length, state.roleMode])

  const primarySubtitle = ctrl.isAttributeChart
    ? `${ctrl.chartFamilyLabel} · ${selectedMaterial?.material_name ?? selectedMaterial?.material_id ?? ''}`
    : `${ctrl.chartFamilyLabel}${ctrl.stratifyLabel ? ` · Stratified by ${ctrl.stratifyLabel}` : ''}`

  const handleExcludeAssist = () =>
    setActionNote(ctrl.isAttributeChart
      ? 'Exclusion request recorded. Attribute-chart point removal will connect to the backend audit workflow in the next iteration.'
      : 'Exclusion request recorded. Click any chart point to exclude or restore it, and the audit trail will carry the justification you just entered.',
    )

  const handleAnnotate = () =>
    setActionNote('Annotation threads are staged for the next iteration. For now, use the exclusion audit trail and exported evidence package.')

  // ── Guards ───────────────────────────────────────────────────────────────

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

  if (ctrl.loading || ctrl.analyticsLoading) {
    return (
      <div aria-live="polite" aria-busy="true">
        <SkeletonPlaceholder style={{ width: '100%', height: '600px' }} />
      </div>
    )
  }

  if (ctrl.error) {
    return (
      <InlineNotification
        kind="error"
        title="Failed to load chart data"
        subtitle={String(ctrl.error)}
        hideCloseButton
      />
    )
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

  // ── Main layout ──────────────────────────────────────────────────────────
  return (
    <Stack gap={6} aria-live="polite" aria-busy="false">

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
        onExclusionClick={
          ctrl.exclusionCount > 0
            ? () => excludedPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
            : undefined
        }
      />

      <ChartInfoBanners
        lockedLimitsError={ctrl.lockedLimitsError}
        exclusionsError={ctrl.exclusionsError}
        exclusionsLoading={ctrl.exclusionsLoading}
        dataTruncated={ctrl.dataTruncated}
        exclusionAudit={state.exclusionAudit}
      />

      {/*
       * Two-column layout:
       *   lg={4}  — sticky left sidebar (panel selector + settings rail)
       *   lg={12} — scrollable right area (chart cards)
       */}
      <Grid>
        {/* ── Sidebar ───────────────────────────────────────────────── */}
        <Column sm={4} md={8} lg={4}>
          <Stack gap={4} style={{ position: 'sticky', top: '6rem' }}>
            <PanelSelector
              availablePanels={availablePanels}
              visiblePanels={visiblePanels}
              onToggle={togglePanel}
              stratifyLabel={ctrl.stratifyLabel}
            />

            {state.roleMode === 'engineer' ? (
              <ChartSettingsRail
                ruleSet={state.ruleSet}
                onRuleSetChange={v => dispatch({ type: 'SET_RULE_SET', payload: v })}
                selectedMicChartType={selectedMIC.chart_type}
                chartTypeOverride={state.chartTypeOverride}
                onChartTypeOverride={v => dispatch({ type: 'SET_CHART_TYPE_OVERRIDE', payload: v })}
                attrChartType={ctrl.attrChartType}
                onAttrChartTypeChange={ctrl.setAttrChartType}
                isAttributeChart={ctrl.isAttributeChart}
                lockedLimits={ctrl.lockedLimits}
                limitsMode={limitsMode}
                onLimitsMode={v => dispatch({ type: 'SET_LIMITS_MODE', payload: v })}
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
              <Tile>
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
                  Operator mode keeps this view focused on live monitoring. Switch back to Engineer
                  mode in the header to unlock rule tuning, limit controls, and the audit panels.
                </p>
              </Tile>
            )}
          </Stack>
        </Column>

        {/* ── Chart cards column ────────────────────────────────────── */}
        <Column sm={4} md={8} lg={12}>
          <Stack gap={6}>

            {/* Primary control chart */}
            {isVisible('primary') && (
              <ChartCard
                title={selectedMIC.mic_name || selectedMIC.mic_id}
                subtitle={primarySubtitle}
                cpk={ctrl.capabilityHeadline?.value ?? null}
                note={actionNote}
                onExcludePoint={handleExcludeAssist}
                onExport={() => ctrl.exportData(exportPayload)}
                onAnnotate={handleAnnotate}
                exportLabel="Export Data"
              >
                {ctrl.isAttributeChart ? (
                  <Suspense fallback={<ChartSkeleton height="420px" />}>
                    {ctrl.attrChartType === 'p_chart'  && <PChart  points={ctrl.attrPoints}  embedded />}
                    {ctrl.attrChartType === 'c_chart'  && <CChart  points={ctrl.countPoints} embedded />}
                    {ctrl.attrChartType === 'u_chart'  && <UChart  points={ctrl.countPoints} embedded />}
                    {ctrl.attrChartType === 'np_chart' && <NPChart points={ctrl.countPoints} embedded />}
                  </Suspense>
                ) : (
                  ctrl.spc
                    ? renderQuantitativeChart(ctrl.spc, ctrl.externalLimits, excludedIndices, ctrl.handlePointClick)
                    : null
                )}
              </ChartCard>
            )}

            {/* Quantitative-only lower panels */}
            {!ctrl.isAttributeChart && (
              <Stack gap={6}>

                {/* Capability + Exclusions — two columns */}
                <Grid condensed>
                  {isVisible('capability') && (
                    <Column sm={4} md={8} lg={8}>
                      <Suspense fallback={<ChartSkeleton height="160px" />}>
                        <CapabilityPanel spc={ctrl.spc} />
                      </Suspense>
                    </Column>
                  )}
                  {isVisible('exclusions') && (
                    <Column sm={4} md={8} lg={8}>
                      <div ref={excludedPanelRef}>
                        <Suspense fallback={<ChartSkeleton height="160px" />}>
                          <ExcludedPointsPanel
                            snapshot={ctrl.exclusionsSnapshot ?? state.exclusionAudit}
                            currentPoints={ctrl.currentExcludedPoints}
                            onRestorePoint={ctrl.handleRestorePoint}
                            onRestoreAll={ctrl.handleRestoreAll}
                            saving={ctrl.exclusionsSaving}
                          />
                        </Suspense>
                      </div>
                    </Column>
                  )}

                  {/* Fallback guide when both panels are hidden */}
                  {!isVisible('capability') && !isVisible('exclusions') && (
                    <Column sm={4} md={8} lg={16}>
                      <Tile>
                        <p style={{ margin: '0 0 0.5rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>
                          Interpretation guide
                        </p>
                        <p style={{ margin: 0, fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--cds-text-secondary)' }}>
                          Establish stability first, then interpret capability. Signals point to assignable causes, while
                          exclusions and locked limits preserve the audit trail for this chart scope.
                        </p>
                      </Tile>
                    </Column>
                  )}
                </Grid>

                {/* Signals + Capability Trend — two columns */}
                <Grid condensed>
                  {isVisible('signals') && (
                    <Column sm={4} md={8} lg={8}>
                      <Suspense fallback={<ChartSkeleton height="160px" />}>
                        <SignalsPanel
                          signals={ctrl.spc?.signals}
                          mrSignals={ctrl.spc?.mrSignals}
                          indexedPoints={ctrl.spc?.indexedPoints}
                          ruleSet={state.ruleSet}
                        />
                      </Suspense>
                    </Column>
                  )}

                  {isVisible('trend') && (
                    <Column sm={4} md={8} lg={8}>
                      <ChartCard
                        title="Capability Storyline"
                        subtitle={`Rolling window ${ctrl.rollingWindowSize} observations`}
                        cpk={ctrl.capabilityHeadline?.value ?? null}
                        onExport={() => ctrl.exportData(exportPayload)}
                        onAnnotate={handleAnnotate}
                        exportLabel="Export Data"
                      >
                        {/* Window size control — Carbon NumberInput would be Phase 5 */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                          <label
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              fontSize: '0.875rem',
                              color: 'var(--cds-text-secondary)',
                            }}
                          >
                            Window
                            <input
                              type="number"
                              min={5}
                              max={Math.max(5, ctrl.spc?.sorted?.length ?? 5)}
                              value={ctrl.rollingWindowSize}
                              style={{
                                width: '5rem',
                                padding: '0.375rem 0.75rem',
                                fontSize: '0.875rem',
                                border: '1px solid var(--cds-border-strong-01)',
                                background: 'var(--cds-layer)',
                                color: 'var(--cds-text-primary)',
                                outline: 'none',
                              }}
                              onChange={e => {
                                const next = Number(e.target.value)
                                if (Number.isFinite(next) && next >= 5) ctrl.setRollingWindowSize(next)
                              }}
                            />
                          </label>
                        </div>
                        <Suspense fallback={<ChartSkeleton height="220px" />}>
                          <CapabilityTrendChart trendData={ctrl.trendData} windowSize={ctrl.rollingWindowSize} />
                        </Suspense>
                      </ChartCard>
                    </Column>
                  )}
                </Grid>

                {/* Stratification panels */}
                {isVisible('stratification') && ctrl.stratumSections.length > 0 && (
                  <StratificationPanel
                    micLabel={selectedMIC.mic_name || selectedMIC.mic_id}
                    stratifyBy={state.stratifyBy ?? ''}
                    sections={ctrl.stratumSections}
                    renderChart={spc => renderQuantitativeChart(spc, null, new Set<number>())}
                    renderSignals={spc => (
                      <Suspense fallback={<ChartSkeleton height="160px" />}>
                        <SignalsPanel signals={spc.signals} mrSignals={spc.mrSignals} indexedPoints={spc.indexedPoints} ruleSet={state.ruleSet} />
                      </Suspense>
                    )}
                    renderCapability={spc => (
                      <Suspense fallback={<ChartSkeleton height="160px" />}>
                        <CapabilityPanel spc={spc} />
                      </Suspense>
                    )}
                  />
                )}
              </Stack>
            )}
          </Stack>
        </Column>
      </Grid>

      {/* Auto-clean result panel */}
      {ctrl.autoCleanLog && (
        <AutoCleanLog log={ctrl.autoCleanLog} onDismiss={() => ctrl.setAutoCleanLog(null)} />
      )}

      {/* Exclusion justification modal */}
      <Suspense fallback={null}>
        <ExclusionJustificationModal
          dialog={exclusionDialog}
          saving={ctrl.exclusionsSaving}
          onCancel={ctrl.closeDialog}
          onSubmit={ctrl.handleDialogSubmit}
        />
      </Suspense>
    </Stack>
  )
}
