import { useEffect, useMemo } from 'react'
import {
  Button,
} from '~/lib/carbon-forms'
import { SkeletonPlaceholder } from '~/lib/carbon-feedback'
import { ClickableTile, Column, Grid, Tile } from '~/lib/carbon-layout'
import Analytics from '@carbon/icons-react/es/Analytics.js'
import ArrowRight from '@carbon/icons-react/es/ArrowRight.js'
import Group from '@carbon/icons-react/es/Group.js'
import Growth from '@carbon/icons-react/es/Growth.js'
import WarningFilled from '@carbon/icons-react/es/WarningFilled.js'
import EmptyState from '../../components/EmptyState'
import { useSPC } from '../SPCContext'
import { useSPCFlow } from '../hooks/useSPCFlow'
import { useSPCScorecard } from '../hooks/useSPCScorecard'
import ProcessFlowMiniMap from '../flow/ProcessFlowMiniMap'
import KPICard from './KPICard'
import RecentViolations from './RecentViolations'

export default function OverviewPage() {
  const { state, dispatch } = useSPC()

  const materialLabel =
    state.selectedMaterial?.material_name ||
    state.selectedMaterial?.material_id ||
    'No material selected'
  const plantLabel =
    state.selectedPlant?.plant_name || state.selectedPlant?.plant_id || 'All plants'
  const characteristicLabel =
    state.selectedMIC?.mic_name || state.selectedMIC?.mic_id || 'No characteristic selected'
  const hasScope = Boolean(state.selectedMaterial)
  const hasCharacteristic = Boolean(state.selectedMIC)

  const { scorecard, loading: scorecardLoading } = useSPCScorecard(
    state.selectedMaterial?.material_id,
    state.dateFrom,
    state.dateTo,
    state.selectedPlant?.plant_id,
  )
  const { flowData, loading: flowLoading } = useSPCFlow(
    state.selectedMaterial?.material_id,
    state.dateFrom,
    state.dateTo,
  )

  const derivedKpis = useMemo(() => {
    if (!scorecard.length) {
      return { processHealth: 0, avgCpk: 0, oocPoints: 0, affectedBatches: 0 }
    }

    const capabilityValues = scorecard
      .map(row => row.cpk ?? row.ppk)
      .filter((value): value is number => value != null)

    const healthyCharacteristics = scorecard.filter(
      row => (row.cpk ?? row.ppk ?? 0) >= 1.33 && (row.ooc_rate ?? 0) <= 0.02,
    ).length

    const processHealth = Math.round((healthyCharacteristics / scorecard.length) * 100)
    const avgCpk = capabilityValues.length
      ? Number(
          (
            capabilityValues.reduce((sum, value) => sum + value, 0) / capabilityValues.length
          ).toFixed(2),
        )
      : 0
    const oocPoints = scorecard.filter(row => (row.ooc_rate ?? 0) > 0).length
    const affectedBatches = scorecard.reduce(
      (sum, row) => sum + Math.max(0, Math.round((row.batch_count ?? 0) * (row.ooc_rate ?? 0))),
      0,
    )

    return { processHealth, avgCpk, oocPoints, affectedBatches }
  }, [scorecard])

  const derivedViolations = useMemo(() => {
    const flowViolations = (flowData?.nodes ?? [])
      .filter(node => {
        const inferredSignal = Boolean(node.last_ooc || node.has_ooc_signal)
        const weakCapability =
          typeof node.estimated_cpk === 'number' && node.estimated_cpk < 1
        const elevatedRejection =
          typeof node.rejection_rate_pct === 'number' && node.rejection_rate_pct >= 2
        return inferredSignal || weakCapability || elevatedRejection
      })
      .slice()
      .sort((a, b) => String(b.last_ooc ?? '').localeCompare(String(a.last_ooc ?? '')))
      .slice(0, 5)
      .map((node, index) => ({
        id: index + 1,
        time: node.last_ooc ? String(node.last_ooc) : 'In scope',
        rule: node.has_ooc_signal || node.last_ooc ? 'OOC signal present' : 'Capability below target',
        chart: node.material_name ?? node.material_id,
        value:
          typeof node.rejection_rate_pct === 'number'
            ? `${node.rejection_rate_pct.toFixed(1)}% rejection`
            : node.estimated_cpk != null
              ? `Cpk ${node.estimated_cpk.toFixed(2)}`
              : 'Review node details',
      }))

    if (flowViolations.length > 0) return flowViolations

    return scorecard
      .filter(row => (row.ooc_rate ?? 0) > 0 || (row.cpk ?? row.ppk ?? 999) < 1.33)
      .slice()
      .sort(
        (a, b) =>
          (b.ooc_rate ?? 0) - (a.ooc_rate ?? 0) ||
          (a.cpk ?? a.ppk ?? 999) - (b.cpk ?? b.ppk ?? 999),
      )
      .slice(0, 5)
      .map((row, index) => ({
        id: index + 1,
        time: `${row.batch_count} batches`,
        rule: (row.ooc_rate ?? 0) > 0.02 ? 'Elevated OOC rate' : 'Capability below target',
        chart: row.mic_name,
        value:
          (row.ooc_rate ?? 0) > 0
            ? `${((row.ooc_rate ?? 0) * 100).toFixed(1)}% OOC`
            : `Cpk ${(row.cpk ?? row.ppk ?? 0).toFixed(2)}`,
      }))
  }, [flowData?.nodes, scorecard])

  useEffect(() => {
    dispatch({ type: 'SET_LOADING', payload: hasScope && (scorecardLoading || flowLoading) })
  }, [dispatch, flowLoading, hasScope, scorecardLoading])

  useEffect(() => {
    if (!hasScope) {
      dispatch({ type: 'SET_KPIS', payload: { processHealth: 0, avgCpk: 0, oocPoints: 0, affectedBatches: 0 } })
      dispatch({ type: 'SET_RECENT_VIOLATIONS', payload: [] })
      return
    }
    dispatch({ type: 'SET_KPIS', payload: derivedKpis })
    dispatch({ type: 'SET_RECENT_VIOLATIONS', payload: derivedViolations })
  }, [derivedKpis, derivedViolations, dispatch, hasScope])

  const openFlow = () => {
    if (!hasScope) return
    dispatch({ type: 'SET_ACTIVE_TAB', payload: 'flow' })
  }

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (state.isLoading) {
    return (
      <Grid>
        {/* KPI row skeletons */}
        {[0, 1, 2, 3].map(i => (
          <Column key={i} sm={4} md={4} lg={4}>
            <SkeletonPlaceholder style={{ width: '100%', height: '10rem' }} />
          </Column>
        ))}
        {/* Main content row skeletons */}
        <Column sm={4} md={8} lg={10}>
          <SkeletonPlaceholder style={{ width: '100%', height: '22rem' }} />
        </Column>
        <Column sm={4} md={8} lg={6}>
          <SkeletonPlaceholder style={{ width: '100%', height: '22rem' }} />
        </Column>
      </Grid>
    )
  }

  if (hasScope && scorecard.length === 0 && state.recentViolations.length === 0) {
    return <EmptyState message="No process data available for the selected filters" />
  }

  // ── Main layout ───────────────────────────────────────────────────────────
  return (
    <Grid>
      {/* Row 1: KPI Cards — 4-up on lg (4/16), 2-up on md (4/8), full-width on sm */}
      <Column sm={4} md={4} lg={4}>
        <KPICard
          title="Process Health"
          value={hasScope ? `${state.kpis.processHealth}%` : '—'}
          status={
            hasScope
              ? state.kpis.processHealth >= 85
                ? 'good'
                : state.kpis.processHealth >= 65
                  ? 'warning'
                  : 'bad'
              : 'neutral'
          }
          icon={Growth}
        />
      </Column>

      <Column sm={4} md={4} lg={4}>
        <KPICard
          title="Avg Cpk"
          value={hasCharacteristic || hasScope ? state.kpis.avgCpk || '—' : '—'}
          status={
            hasScope
              ? state.kpis.avgCpk >= 1.33
                ? 'good'
                : state.kpis.avgCpk >= 1
                  ? 'warning'
                  : 'bad'
              : 'neutral'
          }
          icon={Analytics}
        />
      </Column>

      <Column sm={4} md={4} lg={4}>
        <KPICard
          title="Out of Control"
          value={hasScope ? state.kpis.oocPoints : '—'}
          unit={hasScope ? 'points' : undefined}
          status={hasScope ? (state.kpis.oocPoints > 0 ? 'warning' : 'good') : 'neutral'}
          icon={WarningFilled}
        />
      </Column>

      <Column sm={4} md={4} lg={4}>
        <KPICard
          title="Affected Batches"
          value={hasScope ? state.kpis.affectedBatches : '—'}
          status={
            hasScope ? (state.kpis.affectedBatches > 0 ? 'bad' : 'good') : 'neutral'
          }
          icon={Group}
        />
      </Column>

      {/* Row 2: Process Flow preview (10/16) + Recent Violations (6/16) */}
      <Column sm={4} md={8} lg={10}>
        {/*
         * ClickableTile is the Carbon equivalent of role="button" div.
         * It renders a <button>, so no nested interactive elements are allowed.
         * The "Open Full Flow" intent is communicated via the tile's secondary text.
         */}
        <ClickableTile
          onClick={openFlow}
          disabled={!hasScope}
          style={{ height: '100%', padding: '1.5rem' }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '0.75rem',
              marginBottom: '1rem',
            }}
          >
            <div>
              <p
                style={{
                  margin: 0,
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: 'var(--cds-text-primary)',
                }}
              >
                Process Flow Overview
              </p>
              <p
                style={{
                  margin: '0.25rem 0 0',
                  fontSize: '0.75rem',
                  color: 'var(--cds-text-secondary)',
                }}
              >
                {materialLabel} · {plantLabel}
                {hasScope && ' — click to open full flow'}
              </p>
            </div>
            <ArrowRight size={16} style={{ color: 'var(--cds-text-secondary)', flexShrink: 0 }} />
          </div>

          <div
            style={{
              height: '20rem',
              border: '1px solid var(--cds-border-subtle-01)',
              background: 'var(--cds-layer-02)',
              overflow: 'hidden',
            }}
          >
            {hasScope ? (
              <ProcessFlowMiniMap flowData={flowData} loading={flowLoading} />
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
                <EmptyState message="Select a material from the filter bar to load KPI context, flow preview, and investigation shortcuts." />
              </div>
            )}
          </div>
        </ClickableTile>
      </Column>

      <Column sm={4} md={8} lg={6}>
        <RecentViolations />
      </Column>

      {/* Row 3: CTA Buttons */}
      <Column sm={4} md={4} lg={8}>
        <Button
          kind="primary"
          disabled={!hasCharacteristic}
          onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', payload: 'charts' })}
          style={{ width: '100%', maxWidth: '100%' }}
        >
          Investigate Latest OOC Signal
        </Button>
      </Column>

      <Column sm={4} md={4} lg={8}>
        <Button
          kind="tertiary"
          disabled={!hasScope}
          onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', payload: 'scorecard' })}
          style={{ width: '100%', maxWidth: '100%' }}
        >
          Generate Shift Report
        </Button>
      </Column>
    </Grid>
  )
}
