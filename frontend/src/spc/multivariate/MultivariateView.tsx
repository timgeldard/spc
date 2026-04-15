import { useEffect, useMemo, useState } from 'react'
import { Button } from '~/lib/carbon-forms'
import { Column, Grid, Stack, Tag, Tile } from '~/lib/carbon-layout'
import '../charts/ensureEChartsTheme'
import { shallowEqual, useSPCSelector } from '../SPCContext'
import CorrelationMatrix from '../charts/CorrelationMatrix'
import EChart from '../charts/EChart'
import FieldHelp from '../components/FieldHelp'
import InfoBanner from '../components/InfoBanner'
import LoadingSkeleton from '../components/LoadingSkeleton'
import ModuleEmptyState from '../components/ModuleEmptyState'

function formatSelectionKey(selectionKey: string): string {
  const [micId, operationId] = selectionKey.split('||')
  if (!operationId || operationId === 'NO_OP') return micId
  return `${micId} · Op ${operationId}`
}
import { useMultivariate } from '../hooks/useMultivariate'
import type { EventParamLike, MultivariateContribution, MultivariatePoint } from '../types'

function formatBatchLabel(point: Pick<MultivariatePoint, 'batch_date' | 'batch_id'>): string {
  return point.batch_date || point.batch_id || 'Batch'
}

function T2Chart({
  points,
  ucl,
  selectedIndex,
  onPointSelect,
}: {
  points: MultivariatePoint[]
  ucl: number
  selectedIndex: number | null
  onPointSelect: (index: number) => void
}) {
  const option = useMemo(() => ({
    animation: false,
    grid: { left: 56, right: 24, top: 24, bottom: 84 },
    tooltip: {
      trigger: 'axis',
      formatter: (_params: unknown) => '',
      valueFormatter: (value: number) => value.toFixed(3),
    },
    xAxis: {
      type: 'category',
      data: points.map(point => formatBatchLabel(point)),
      axisLabel: { rotate: 45, fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      name: 'T²',
      nameLocation: 'middle',
      nameGap: 40,
    },
    series: [
      {
        type: 'line',
        name: 'T²',
        smooth: false,
        symbolSize: 8,
        data: points.map(point => ({
          value: point.t2 ?? 0,
          itemStyle: {
            color: point.is_anomaly ? '#da1e28' : '#0f62fe',
            borderColor: selectedIndex === point.index ? '#161616' : '#ffffff',
            borderWidth: selectedIndex === point.index ? 2 : 1,
          },
        })),
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#8a3ffc', type: 'dashed', width: 2 },
          data: [{ yAxis: ucl, name: 'UCL' }],
          label: { formatter: `UCL ${ucl.toFixed(3)}` },
        },
      },
    ],
  }), [points, selectedIndex, ucl])

  return (
    <EChart
      option={option}
      notMerge
      ariaLabel="Hotelling T-squared multivariate control chart"
      style={{ height: 320, width: '100%' }}
      onEvents={{
        click: (event: EventParamLike) => {
          if (typeof event.dataIndex === 'number') {
            onPointSelect(event.dataIndex)
          }
        },
      }}
    />
  )
}

function ContributionChart({
  point,
}: {
  point: MultivariatePoint | null
}) {
  const contributions = point?.contributions ?? []
  const option = useMemo(() => ({
    animation: false,
    grid: { left: 72, right: 24, top: 16, bottom: 32 },
    xAxis: { type: 'value' },
    yAxis: {
      type: 'category',
      data: contributions.map(item => item.mic_name),
      inverse: true,
      axisLabel: { fontSize: 11 },
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (value: number) => value.toFixed(4),
    },
    series: [
      {
        type: 'bar',
        data: contributions.map(item => ({
          value: item.contribution ?? 0,
          itemStyle: { color: (item.contribution ?? 0) >= 0 ? '#0f62fe' : '#da1e28' },
        })),
      },
    ],
  }), [contributions])

  if (!point) {
    return (
      <ModuleEmptyState
        icon="Δ"
        title="Select a T² point to inspect contributors"
        description="The contribution chart breaks a multivariate signal into the individual characteristics pushing it high or low."
      />
    )
  }

  return (
    <EChart
      option={option}
      notMerge
      ariaLabel="Contribution decomposition for selected multivariate anomaly"
      style={{ height: 320, width: '100%' }}
    />
  )
}

function ContributionSummary({ contributors }: { contributors: MultivariateContribution[] }) {
  if (!contributors.length) return null

  return (
    <div style={{ display: 'grid', gap: '0.5rem' }}>
      {contributors.map(contributor => {
        const contribution = contributor.contribution ?? 0
        const direction = contribution >= 0 ? 'high' : 'low'
        const sharePct = Math.round((contributor.share_abs ?? 0) * 100)
        return (
          <div key={contributor.mic_id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', fontSize: '0.875rem' }}>
            <span style={{ color: 'var(--cds-text-primary)' }}>{contributor.mic_name}</span>
            <span style={{ color: 'var(--cds-text-secondary)' }}>
              {direction} · {(contributor.contribution ?? 0).toFixed(3)} · {sharePct}%
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default function MultivariateView() {
  const state = useSPCSelector(
    current => ({
      selectedMaterial: current.selectedMaterial,
      selectedPlant: current.selectedPlant,
      dateFrom: current.dateFrom,
      dateTo: current.dateTo,
      selectedMultivariateMicIds: current.selectedMultivariateMicIds,
    }),
    shallowEqual,
  )
  const { result, loading, error, fetchMultivariate, clear } = useMultivariate()
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null)

  useEffect(() => {
    clear()
    setSelectedPointIndex(null)
  }, [clear, state.selectedMaterial?.material_id, state.selectedPlant?.plant_id, state.dateFrom, state.dateTo, state.selectedMultivariateMicIds])

  useEffect(() => {
    if (!result) return
    const defaultPoint = result.points.find(point => point.is_anomaly) ?? result.points[0] ?? null
    setSelectedPointIndex(defaultPoint?.index ?? null)
  }, [result])

  const selectedPoint = useMemo(
    () => result?.points.find(point => point.index === selectedPointIndex) ?? null,
    [result, selectedPointIndex],
  )

  const handleRun = () => {
    if (!state.selectedMaterial || state.selectedMultivariateMicIds.length < 2) return
    fetchMultivariate({
      materialId: state.selectedMaterial.material_id,
      micIds: state.selectedMultivariateMicIds,
      plantId: state.selectedPlant?.plant_id,
      dateFrom: state.dateFrom,
      dateTo: state.dateTo,
    })
  }

  if (!state.selectedMaterial) {
    return (
      <ModuleEmptyState
        icon="Σ"
        title="Select a material to run multivariate SPC"
        description="Hotelling's T² detects coordinated shifts that single-characteristic charts can miss, then breaks the signal into its top contributing variables."
      />
    )
  }

  if (state.selectedMultivariateMicIds.length < 2) {
    return (
      <ModuleEmptyState
        icon="Σ"
        title="Choose at least two multivariate variables"
        description="Use the filter bar above to select 2 to 8 quantitative characteristics. The analysis uses only batches where all selected variables were measured together."
        action={
          <FieldHelp>
            Current scope: {state.selectedMaterial.material_name ?? state.selectedMaterial.material_id}
          </FieldHelp>
        }
      />
    )
  }

  return (
    <Stack gap={5}>
      <Tile>
        <Stack gap={3}>
          <div style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--cds-text-secondary)' }}>
            Multivariate anomaly detection
          </div>
          <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>
            Hotelling&apos;s T² Explorer
          </h3>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
            Detects coordinated drift across multiple characteristics, surfaces the batches that break multivariate control, and highlights which variables contributed most strongly.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {state.selectedMultivariateMicIds.map(micId => (
              <Tag key={micId} type="blue" size="sm">{formatSelectionKey(micId)}</Tag>
            ))}
          </div>
        </Stack>
      </Tile>

      <Tile>
        <Stack gap={3}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem' }}>
            <Button kind="primary" onClick={handleRun} disabled={loading}>
              {loading ? 'Computing…' : 'Run Multivariate SPC'}
            </Button>
            <FieldHelp>
              Run against the current material, plant, and date scope. The engine only retains shared batches with complete observations across the selected variables.
            </FieldHelp>
          </div>
        </Stack>
      </Tile>

      {loading && <LoadingSkeleton message="Computing multivariate covariance, T² signals, and contributor breakdown…" />}
      {error && <InfoBanner variant="error">{error}</InfoBanner>}

      {result && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <Tag type="cool-gray" size="sm">{result.n_observations} shared batches</Tag>
            <Tag type="cool-gray" size="sm">{result.n_variables} variables</Tag>
            <Tag type="cool-gray" size="sm">UCL {result.ucl?.toFixed(3) ?? '—'}</Tag>
            {result.excluded_incomplete_batches ? (
              <Tag type="warm-gray" size="sm">{result.excluded_incomplete_batches} incomplete batches dropped</Tag>
            ) : null}
          </div>

          {result.excluded_incomplete_batches ? (
            <InfoBanner variant="warn">
              Some batches were excluded because at least one selected variable was missing. Multivariate SPC only uses complete shared-batch observations.
            </InfoBanner>
          ) : null}

          <Grid condensed>
            <Column sm={4} md={8} lg={10}>
              <Tile>
                <Stack gap={3}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--cds-text-secondary)' }}>
                    T² control chart
                  </div>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
                    Shows the combined multivariate distance of each batch from the process center. Click a point to inspect which variables drove that signal.
                  </p>
                  <T2Chart
                    points={result.points}
                    ucl={result.ucl ?? 0}
                    selectedIndex={selectedPointIndex}
                    onPointSelect={setSelectedPointIndex}
                  />
                </Stack>
              </Tile>
            </Column>

            <Column sm={4} md={8} lg={6}>
              <Tile>
                <Stack gap={3}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--cds-text-secondary)' }}>
                    Root-cause suggestions
                  </div>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
                    Ranked anomaly summaries for the strongest multivariate excursions in the current scope.
                  </p>
                  {result.anomalies.length === 0 ? (
                    <FieldHelp>No multivariate anomalies exceeded the control limit in this window.</FieldHelp>
                  ) : (
                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                      {result.anomalies.map(anomaly => (
                        <button
                          key={`${anomaly.batch_id}-${anomaly.index}`}
                          type="button"
                          onClick={() => setSelectedPointIndex(anomaly.index)}
                          style={{
                            textAlign: 'left',
                            border: anomaly.index === selectedPointIndex ? '1px solid var(--cds-border-interactive)' : '1px solid var(--cds-border-subtle-01)',
                            background: 'var(--cds-layer)',
                            padding: '0.75rem',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                            <strong>{formatBatchLabel(anomaly)}</strong>
                            <span style={{ color: 'var(--cds-support-error)', fontFamily: 'var(--cds-code-02-font-family, monospace)' }}>
                              T² {anomaly.t2?.toFixed(3) ?? '—'}
                            </span>
                          </div>
                          <p style={{ margin: '0.5rem 0 0', fontSize: '0.8125rem', color: 'var(--cds-text-secondary)' }}>
                            {anomaly.summary}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </Stack>
              </Tile>
            </Column>
          </Grid>

          <Grid condensed>
            <Column sm={4} md={8} lg={8}>
              <Tile>
                <Stack gap={3}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--cds-text-secondary)' }}>
                    Contribution decomposition
                  </div>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
                    Breaks the selected batch&apos;s multivariate excursion into individual variable pushes. Positive bars push the batch further from center; negative bars pull in the opposite direction.
                  </p>
                  <ContributionChart point={selectedPoint} />
                </Stack>
              </Tile>
            </Column>

            <Column sm={4} md={8} lg={8}>
              <Tile>
                <Stack gap={3}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--cds-text-secondary)' }}>
                    Selected batch detail
                  </div>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
                    Explains why the selected point matters operationally and which variables were most responsible.
                  </p>
                  {selectedPoint ? (
                    <>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <Tag type={selectedPoint.is_anomaly ? 'red' : 'green'} size="sm">
                          {selectedPoint.is_anomaly ? 'Above multivariate limit' : 'Within multivariate control'}
                        </Tag>
                        <Tag type="cool-gray" size="sm">
                          {formatBatchLabel(selectedPoint)}
                        </Tag>
                        <Tag type="cool-gray" size="sm">
                          T² {selectedPoint.t2?.toFixed(3) ?? '—'}
                        </Tag>
                      </div>
                      <ContributionSummary contributors={selectedPoint.top_contributors} />
                    </>
                  ) : (
                    <FieldHelp>Select a point or anomaly summary to inspect detailed contributors.</FieldHelp>
                  )}
                </Stack>
              </Tile>
            </Column>
          </Grid>

          <Tile>
            <Stack gap={3}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--cds-text-secondary)' }}>
                Correlation heatmap
              </div>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
                Shows pairwise correlation across the same shared-batch population used for T². Strong coupling helps explain why variables move together during a multivariate excursion.
              </p>
              <CorrelationMatrix pairs={result.correlation.pairs} mics={result.correlation.mics} />
            </Stack>
          </Tile>
        </>
      )}
    </Stack>
  )
}
