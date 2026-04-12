import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import '../charts/ensureEChartsTheme'
import {
  Button,
  Switch,
} from '~/lib/carbon-forms'
import { InlineNotification } from '~/lib/carbon-feedback'
import { DataTableSkeleton } from '~/lib/carbon-data-table'
import { Column, ContentSwitcher, Grid, Stack, Tag, Tile } from '~/lib/carbon-layout'
import { shallowEqual, useSPCDispatch, useSPCSelector } from '../SPCContext'
import { useSPCScorecard } from '../hooks/useSPCScorecard'
import type { ScorecardRow } from '../types'
import MetricCard from '../components/MetricCard'
import ModuleEmptyState from '../components/ModuleEmptyState'

const ScorecardTable   = lazy(() => import('./ScorecardTable'))
const CapabilityMatrix = lazy(() => import('../charts/CapabilityMatrix'))

// ── Status accent: maps capability_status to Carbon support tokens ─────────
const TRIAGE_ACCENT: Record<string, string> = {
  excellent:        'var(--cds-support-success)',
  good:             'var(--cds-support-success)',
  marginal:         'var(--cds-support-warning)',
  poor:             'var(--cds-support-error)',
  out_of_spec_mean: 'var(--cds-support-error)',
}

function triageTagType(cpk: number | null | undefined): 'green' | 'teal' | 'warm-gray' | 'red' | 'gray' {
  if (cpk == null)   return 'gray'
  if (cpk >= 1.33)   return 'teal'
  if (cpk >= 1.0)    return 'warm-gray'
  return 'red'
}

// ── Summary bar ────────────────────────────────────────────────────────────

function SummaryBar({ rows }: { rows: ScorecardRow[] }) {
  const total    = rows.length
  const excellent = rows.filter(r => r.capability_status === 'excellent').length
  const good      = rows.filter(r => r.capability_status === 'good').length
  const marginal  = rows.filter(r => r.capability_status === 'marginal').length
  const poor      = rows.filter(r => r.capability_status === 'poor').length

  const cards = [
    { label: 'Characteristics',      value: total,     tone: 'neutral'  as const, meta: 'Total measurable MICs in scope'              },
    { label: 'Highly Capable (≥1.67)', value: excellent, tone: 'success' as const, meta: 'Strong headroom above specification'          },
    { label: 'Capable (≥1.33)',       value: good,      tone: 'success' as const, meta: 'Operationally healthy and reliable'            },
    { label: 'Marginal (≥1.00)',      value: marginal,  tone: 'warning' as const, meta: 'Monitor closely before release decisions'     },
    { label: 'Not Capable (<1.00)',   value: poor,      tone: 'error'   as const, meta: 'Immediate attention required'                  },
  ]

  return (
    // auto-fit grid — 5 equal tiles, responsive down to full-width on mobile
    <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))' }}>
      {cards.map(card => (
        <MetricCard key={card.label} label={card.label} value={card.value} meta={card.meta} tone={card.tone} />
      ))}
    </div>
  )
}

// ── Worst-first triage panel ───────────────────────────────────────────────

interface TriagePanelProps {
  rows: ScorecardRow[]
  onViewChart: (row: ScorecardRow) => void
}

function TriagePanel({ rows, onViewChart }: TriagePanelProps) {
  const worst = useMemo(() =>
    [...rows]
      .filter(r => r.cpk != null || r.ppk != null || (r.ooc_rate ?? 0) > 0)
      .sort((a, b) => (a.cpk ?? a.ppk ?? 999) - (b.cpk ?? b.ppk ?? 999))
      .slice(0, 3),
  [rows])

  if (!worst.length) return null

  return (
    <section aria-label="Worst-first triage — top 3 characteristics requiring attention">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.75rem',
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: '0.6875rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--cds-text-secondary)',
          }}
        >
          Priority triage — review these first
        </p>
        <span style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
          Sorted by lowest Cpk
        </span>
      </div>

      <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))' }}>
        {worst.map(row => {
          const cpk     = row.cpk ?? row.ppk
          const accent  = TRIAGE_ACCENT[row.capability_status ?? 'grey'] ?? 'var(--cds-border-subtle-01)'
          const tagType = triageTagType(cpk)

          return (
            <Tile key={row.mic_id} style={{ borderLeft: `4px solid ${accent}` }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                  marginBottom: '0.5rem',
                }}
              >
                <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>
                  {row.mic_name}
                </p>
                <Tag type={tagType} size="sm">
                  {cpk != null
                    ? cpk >= 1.33 ? 'Capable' : cpk >= 1.0 ? 'Marginal' : 'Poor'
                    : 'No Data'}
                </Tag>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                  fontSize: '0.75rem',
                  color: 'var(--cds-text-secondary)',
                  marginBottom: '0.75rem',
                }}
              >
                {cpk != null && <span><strong>Cpk</strong> {cpk.toFixed(2)}</span>}
                {row.ooc_rate != null && <span><strong>OOC</strong> {(row.ooc_rate * 100).toFixed(1)}%</span>}
                <span><strong>n</strong> {row.batch_count}</span>
              </div>

              <Button kind="primary" size="sm" onClick={() => onViewChart(row)}>
                View Chart
              </Button>
            </Tile>
          )
        })}
      </div>
    </section>
  )
}

// ── Main view ──────────────────────────────────────────────────────────────

export default function ScorecardView() {
  const dispatch = useSPCDispatch()
  const state = useSPCSelector(
    current => ({
      roleMode: current.roleMode,
      selectedMaterial: current.selectedMaterial,
      selectedPlant: current.selectedPlant,
      selectedMIC: current.selectedMIC,
      exclusionAudit: current.exclusionAudit,
      dateFrom: current.dateFrom,
      dateTo: current.dateTo,
    }),
    shallowEqual,
  )
  const [viewMode, setViewMode] = useState<'table' | 'matrix'>('table')
  const { scorecard, loading, error } = useSPCScorecard(
    state.selectedMaterial?.material_id,
    state.dateFrom,
    state.dateTo,
    state.selectedPlant?.plant_id,
  )

  const handleViewChart = useCallback((row: ScorecardRow) => {
    dispatch({ type: 'SET_MIC',        payload: { mic_id: row.mic_id, mic_name: row.mic_name, chart_type: 'imr' } })
    dispatch({ type: 'SET_ACTIVE_TAB', payload: 'charts' })
  }, [dispatch])
  const viewSwitches = [
    <Switch key="table" name="table" text="Table" />,
    ...(state.roleMode === 'engineer'
      ? [<Switch key="matrix" name="matrix" text="Matrix" />]
      : []),
  ]

  useEffect(() => {
    if (state.roleMode === 'operator' && viewMode === 'matrix') setViewMode('table')
  }, [state.roleMode, viewMode])

  // ── Empty / loading / error guards ────────────────────────────────────────

  if (!state.selectedMaterial) {
    return (
      <ModuleEmptyState
        icon="▦"
        title="No material selected"
        description="Select a material above to view the SPC scorecard with Cp/Cpk for all characteristics."
      />
    )
  }

  if (loading) {
    return (
      <DataTableSkeleton
        columnCount={10}
        rowCount={8}
        showHeader={false}
        showToolbar
      />
    )
  }

  if (error) {
    return (
      <InlineNotification
        kind="error"
        title="Failed to load scorecard"
        subtitle={String(error)}
        hideCloseButton
      />
    )
  }

  if (!scorecard.length) {
    return (
      <ModuleEmptyState
        title="No scorecard data"
        description={`No data found for ${state.selectedMaterial.material_name ?? state.selectedMaterial.material_id}. At least 3 batches with quantitative results are required.`}
      />
    )
  }

  // ── Full view ─────────────────────────────────────────────────────────────
  return (
    // Stack replaces the custom scorecardLayoutClass (flex flex-col gap-5)
    <Stack gap={5}>

      {/* Page header */}
      <Tile>
        <p
          style={{
            margin: '0 0 0.25rem',
            fontSize: '0.6875rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--cds-text-secondary)',
          }}
        >
          Portfolio review
        </p>
        <h3
          style={{
            margin: '0 0 0.25rem',
            fontSize: '1.25rem',
            fontWeight: 600,
            color: 'var(--cds-text-primary)',
          }}
        >
          {state.selectedMaterial.material_name ?? state.selectedMaterial.material_id}
          {state.selectedPlant && (
            <span style={{ fontSize: '1rem', fontWeight: 400, color: 'var(--cds-text-secondary)' }}>
              {' '}· {state.selectedPlant.plant_name || state.selectedPlant.plant_id}
            </span>
          )}
        </h3>
        <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
          Start with the priority triage panel below — then drill into the full table for a complete picture.
        </p>
      </Tile>

      {/* Portfolio summary KPIs */}
      <SummaryBar rows={scorecard} />

      {/* Worst-first triage panel */}
      <Tile>
        <TriagePanel rows={scorecard} onViewChart={handleViewChart} />
      </Tile>

      {/* View mode toggle — ContentSwitcher replaces custom button pair */}
      <Stack orientation="horizontal" gap={2}>
        <ContentSwitcher
          selectedIndex={viewMode === 'table' ? 0 : 1}
          onChange={({ index }: { index?: number }) => {
            setViewMode(index === 1 ? 'matrix' : 'table')
          }}
        >
          {viewSwitches}
        </ContentSwitcher>
      </Stack>

      {/* ── Table view ─────────────────────────────────────────────────── */}
      {viewMode === 'table' && (
        <Grid>
          {/* Table + guardrails column */}
          <Column sm={4} md={8} lg={state.roleMode === 'engineer' ? 11 : 16}>
            <Stack gap={4}>
              {/* Interpretation guardrails */}
              <Tile>
                <p
                  style={{
                    margin: '0 0 0.25rem',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    color: 'var(--cds-text-primary)',
                  }}
                >
                  Interpretation guardrails
                </p>
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
                  Cpk values are shown without stability verification. Open the control chart for each
                  characteristic to check for rule violations before interpreting capability.
                </p>
                {state.exclusionAudit && (state.exclusionAudit.excluded_count ?? 0) > 0 && state.selectedMIC && (
                  <p style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
                    {state.exclusionAudit.excluded_count} point
                    {state.exclusionAudit.excluded_count !== 1 ? 's' : ''} excluded from{' '}
                    {state.selectedMIC.mic_name ?? state.selectedMIC.mic_id}
                    {state.exclusionAudit.user_id ? ` by ${state.exclusionAudit.user_id}` : ''}
                    {state.exclusionAudit.event_ts
                      ? ` on ${String(state.exclusionAudit.event_ts).replace('T', ' ').slice(0, 19)}`
                      : ''}.
                  </p>
                )}
              </Tile>

              <Suspense fallback={<DataTableSkeleton columnCount={10} rowCount={8} showHeader={false} showToolbar />}>
                <ScorecardTable rows={scorecard} />
              </Suspense>
            </Stack>
          </Column>

          {/* Decision support sidebar — engineer mode only */}
          {state.roleMode === 'engineer' && (
            <Column sm={4} md={8} lg={5}>
              <Tile style={{ height: '100%' }}>
                <Stack gap={4}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '0.6875rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--cds-text-secondary)',
                    }}
                  >
                    Decision support
                  </p>

                  <Stack gap={3}>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
                      Start with the priority triage panel — those are the fastest path to meaningful intervention.
                    </p>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
                      Use Ppk to judge long-run performance drift, but only after the control chart shows stability.
                    </p>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
                      In the table, use{' '}
                      <kbd
                        style={{
                          borderRadius: '2px',
                          border: '1px solid var(--cds-border-subtle-01)',
                          background: 'var(--cds-layer-02)',
                          padding: '0 0.25rem',
                          fontFamily: 'var(--cds-code-02-font-family, monospace)',
                          fontSize: '0.6875rem',
                        }}
                      >
                        ↑↓
                      </kbd>{' '}
                      to navigate rows and{' '}
                      <kbd
                        style={{
                          borderRadius: '2px',
                          border: '1px solid var(--cds-border-subtle-01)',
                          background: 'var(--cds-layer-02)',
                          padding: '0 0.25rem',
                          fontFamily: 'var(--cds-code-02-font-family, monospace)',
                          fontSize: '0.6875rem',
                        }}
                      >
                        Enter
                      </kbd>{' '}
                      to open the chart.
                    </p>
                  </Stack>

                  {/* Mini metric tiles */}
                  <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: '1fr 1fr' }}>
                    <Tile>
                      <p
                        style={{
                          margin: '0 0 0.5rem',
                          fontSize: '0.6875rem',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          color: 'var(--cds-text-secondary)',
                        }}
                      >
                        Primary sort
                      </p>
                      <p style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>
                        Cpk → Ppk
                      </p>
                    </Tile>
                    <Tile>
                      <p
                        style={{
                          margin: '0 0 0.5rem',
                          fontSize: '0.6875rem',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          color: 'var(--cds-text-secondary)',
                        }}
                      >
                        Best use
                      </p>
                      <p style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>
                        Portfolio triage
                      </p>
                    </Tile>
                  </div>
                </Stack>
              </Tile>
            </Column>
          )}
        </Grid>
      )}

      {/* ── Matrix view (engineer only) ───────────────────────────────── */}
      {state.roleMode === 'engineer' && viewMode === 'matrix' && (
        <Suspense fallback={<DataTableSkeleton columnCount={8} rowCount={6} showHeader={false} showToolbar={false} />}>
          <CapabilityMatrix rows={scorecard} />
        </Suspense>
      )}
    </Stack>
  )
}
