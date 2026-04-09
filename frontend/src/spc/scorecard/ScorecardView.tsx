import { Suspense, lazy, useCallback, useMemo, useState } from 'react'
import '../charts/ensureEChartsTheme'
import { useSPC } from '../SPCContext'
import { useSPCScorecard } from '../hooks/useSPCScorecard'
import type { ScorecardRow } from '../types'
import {
  buttonBaseClass,
  buttonPrimaryClass,
  buttonSecondaryClass,
  buttonSmClass,
  cardSubClass,
  cardTitleClass,
  heroCardClass,
  heroCardDenseClass,
  metricGridClass,
  scorecardEvidenceClass,
  scorecardHeaderClass,
  scorecardLayoutClass,
  scorecardPlantClass,
  scorecardSidebarClass,
  scorecardSubClass,
  scorecardSummaryClass,
  scorecardTitleClass,
  scorecardToggleClass,
  stabilityNoteClass,
} from '../uiClasses'
import InfoBanner from '../components/InfoBanner'
import LoadingSkeleton from '../components/LoadingSkeleton'
import MetricCard from '../components/MetricCard'
import ModuleEmptyState from '../components/ModuleEmptyState'
import StatusPill, { deriveStatus } from '../components/StatusPill'

const ScorecardTable = lazy(() => import('./ScorecardTable'))
const CapabilityMatrix = lazy(() => import('../charts/CapabilityMatrix'))

// ── Capability-status colour tokens ─────────────────────────────────────────
// Kerry semantic status: Jade=capable, Sunrise=marginal, Sunset=poor
const STATUS_COLOR: Record<string, string> = {
  excellent:       'border-[#8FE2BE] bg-[#DAF5E9] text-[#143700]',  /* Jade strong */
  good:            'border-[#B4ECD4] bg-[#DAF5E9] text-[#143700]',  /* Jade */
  marginal:        'border-[#FDE79D] bg-[#FEF3CE] text-[#005776]',  /* Sunrise */
  poor:            'border-[#FAB799] bg-[#FCDBCC] text-[#F24A00]',  /* Sunset */
  out_of_spec_mean:'border-[#F56E33] bg-[#FCDBCC] text-[#F24A00]',  /* Sunset strong */
}

interface SummaryBarProps {
  rows: ScorecardRow[]
}

function SummaryBar({ rows }: SummaryBarProps) {
  const total = rows.length
  const excellent = rows.filter(r => r.capability_status === 'excellent').length
  const good = rows.filter(r => r.capability_status === 'good').length
  const marginal = rows.filter(r => r.capability_status === 'marginal').length
  const poor = rows.filter(r => r.capability_status === 'poor').length
  const cards = [
    { label: 'Characteristics', value: total, colorClass: 'border-[#CCDDE4] bg-[#F4F4EA] text-[#005776]', meta: 'Total measurable MICs in scope' },
    { label: 'Highly Capable (≥1.67)', value: excellent, colorClass: 'border-[#8FE2BE] bg-[#DAF5E9] text-[#143700]', meta: 'Strong headroom above specification' },
    { label: 'Capable (≥1.33)', value: good, colorClass: 'border-[#B4ECD4] bg-[#DAF5E9] text-[#143700]', meta: 'Operationally healthy and reliable' },
    { label: 'Marginal (≥1.00)', value: marginal, colorClass: 'border-[#FDE79D] bg-[#FEF3CE] text-[#005776]', meta: 'Monitor closely before release decisions' },
    { label: 'Not Capable (<1.00)', value: poor, colorClass: 'border-[#FAB799] bg-[#FCDBCC] text-[#F24A00]', meta: 'Immediate attention required' },
  ]

  return (
    <div className={scorecardSummaryClass}>
      {cards.map(card => (
        <MetricCard
          key={card.label}
          label={card.label}
          value={card.value}
          meta={card.meta}
          colorClass={card.colorClass}
        />
      ))}
    </div>
  )
}

// ── Worst-first triage panel ─────────────────────────────────────────────────
interface TriagePanelProps {
  rows: ScorecardRow[]
  onViewChart: (row: ScorecardRow) => void
}

function TriagePanel({ rows, onViewChart }: TriagePanelProps) {
  // Top 3 worst: sorted by Cpk ascending (worst first)
  const worst = useMemo(
    () =>
      [...rows]
        .filter(r => r.cpk != null || r.ppk != null || (r.ooc_rate ?? 0) > 0)
        .sort((a, b) => {
          const aCpk = a.cpk ?? a.ppk ?? 999
          const bCpk = b.cpk ?? b.ppk ?? 999
          return aCpk - bCpk
        })
        .slice(0, 3),
    [rows],
  )

  if (!worst.length) return null

  return (
    <section aria-label="Worst-first triage — top 3 characteristics requiring attention">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-[var(--c-text-muted)]">
          Priority triage — review these first
        </h4>
        <span className="text-xs text-[var(--c-text-muted)]">Sorted by lowest Cpk</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {worst.map(row => {
          const cpk = row.cpk ?? row.ppk
          const hasViolations = (row.ooc_rate ?? 0) > 0.02
          const status = deriveStatus(hasViolations, cpk)
          const colorClass = STATUS_COLOR[row.capability_status ?? 'grey'] ?? 'border-slate-200 bg-slate-50'

          return (
            <div
              key={row.mic_id}
              className={`rounded-[calc(var(--radius)+4px)] border p-4 shadow-[var(--shadow)] ${colorClass}`}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <p className="text-sm font-semibold leading-snug text-[var(--c-text)]">{row.mic_name}</p>
                <StatusPill status={status} compact />
              </div>
              <div className="mb-3 flex flex-wrap gap-3 text-xs">
                {cpk != null && (
                  <span>
                    <span className="font-semibold">Cpk</span> {cpk.toFixed(2)}
                  </span>
                )}
                {row.ooc_rate != null && (
                  <span>
                    <span className="font-semibold">OOC</span> {(row.ooc_rate * 100).toFixed(1)}%
                  </span>
                )}
                <span>
                  <span className="font-semibold">n</span> {row.batch_count}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className={`${buttonBaseClass} ${buttonSmClass} ${buttonPrimaryClass}`}
                  onClick={() => onViewChart(row)}
                  aria-label={`View control chart for ${row.mic_name}`}
                >
                  View Chart
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ── Main view ────────────────────────────────────────────────────────────────
export default function ScorecardView() {
  const { state, dispatch } = useSPC()
  const [viewMode, setViewMode] = useState<'table' | 'matrix'>('table')
  const { scorecard, loading, error } = useSPCScorecard(
    state.selectedMaterial?.material_id,
    state.dateFrom,
    state.dateTo,
    state.selectedPlant?.plant_id,
  )

  const handleViewChart = useCallback((row: ScorecardRow) => {
    dispatch({ type: 'SET_MIC', payload: { mic_id: row.mic_id, mic_name: row.mic_name, chart_type: 'imr' } })
    dispatch({ type: 'SET_ACTIVE_TAB', payload: 'charts' })
  }, [dispatch])

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
    return <LoadingSkeleton variant="lines" message="Loading scorecard…" />
  }

  if (error) {
    return <InfoBanner variant="error">Failed to load scorecard: {error}</InfoBanner>
  }

  if (!scorecard.length) {
    return (
      <ModuleEmptyState
        title="No scorecard data"
        description={`No data found for ${state.selectedMaterial.material_name ?? state.selectedMaterial.material_id}. At least 3 batches with quantitative results are required.`}
      />
    )
  }

  return (
    <div className={scorecardLayoutClass}>

      {/* Header */}
      <div className={scorecardHeaderClass}>
        <div className="text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-[var(--c-text-muted)]">Portfolio review</div>
        <h3 className={scorecardTitleClass}>
          {state.selectedMaterial.material_name ?? state.selectedMaterial.material_id}
          {state.selectedPlant && (
            <span className={scorecardPlantClass}> · {state.selectedPlant.plant_name || state.selectedPlant.plant_id}</span>
          )}
        </h3>
        <p className={scorecardSubClass}>
          Start with the priority triage panel below — then drill into the full table for a complete picture.
        </p>
      </div>

      {/* Portfolio summary KPIs */}
      <SummaryBar rows={scorecard} />

      {/* Worst-first triage panel */}
      <div className={heroCardClass}>
        <TriagePanel
          rows={scorecard}
          onViewChart={handleViewChart}
        />
      </div>

      {/* View toggle */}
      <div className={scorecardToggleClass}>
        <button
          className={`${buttonBaseClass} ${buttonSmClass} ${viewMode === 'table' ? buttonPrimaryClass : buttonSecondaryClass}`}
          onClick={() => setViewMode('table')}
          aria-pressed={viewMode === 'table'}
        >
          Table
        </button>
        <button
          className={`${buttonBaseClass} ${buttonSmClass} ${viewMode === 'matrix' ? buttonPrimaryClass : buttonSecondaryClass}`}
          onClick={() => setViewMode('matrix')}
          aria-pressed={viewMode === 'matrix'}
        >
          Matrix
        </button>
      </div>

      {viewMode === 'table' && (
        <div className={scorecardEvidenceClass}>
          <div className="flex flex-col gap-4">
            <div className={heroCardDenseClass}>
              <div className={cardTitleClass}>Interpretation guardrails</div>
              <p className={cardSubClass}>
                Cpk values are shown without stability verification. Open the control chart for each
                characteristic to check for rule violations before interpreting capability.
              </p>
              {state.exclusionAudit && (state.exclusionAudit.excluded_count ?? 0) > 0 && state.selectedMIC && (
                <p className={`${stabilityNoteClass} mt-3`}>
                  {state.exclusionAudit.excluded_count} point{state.exclusionAudit.excluded_count !== 1 ? 's' : ''} excluded from
                  {' '}{state.selectedMIC.mic_name ?? state.selectedMIC.mic_id}
                  {state.exclusionAudit.user_id ? ` by ${state.exclusionAudit.user_id}` : ''}
                  {state.exclusionAudit.event_ts ? ` on ${String(state.exclusionAudit.event_ts).replace('T', ' ').slice(0, 19)}` : ''}.
                </p>
              )}
            </div>
            <Suspense fallback={<LoadingSkeleton minHeight="280px" message="Loading view…" />}>
              <ScorecardTable rows={scorecard} />
            </Suspense>
          </div>
          <aside className={scorecardSidebarClass}>
            <div className="text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-[var(--c-text-muted)]">Decision support</div>
            <div className="space-y-3 text-sm text-[var(--c-text-muted)]">
              <p>Start with the priority triage panel — those are the fastest path to meaningful intervention.</p>
              <p>Use Ppk to judge long-run performance drift, but only after the control chart shows stability.</p>
              <p>
                In the table, use{' '}
                <kbd className="rounded border border-[var(--c-border)] bg-slate-100 px-1 py-0.5 text-[0.65rem] font-mono">↑↓</kbd>{' '}
                to navigate rows and{' '}
                <kbd className="rounded border border-[var(--c-border)] bg-slate-100 px-1 py-0.5 text-[0.65rem] font-mono">Enter</kbd>{' '}
                to open the chart.
              </p>
            </div>
            <div className={metricGridClass}>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-[0.05em] text-[var(--c-text-muted)]">Primary sort</div>
                <div className="mt-2 text-lg font-semibold text-[var(--c-text)]">Cpk → Ppk</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-[0.05em] text-[var(--c-text-muted)]">Best use</div>
                <div className="mt-2 text-lg font-semibold text-[var(--c-text)]">Portfolio triage</div>
              </div>
            </div>
          </aside>
        </div>
      )}

      {viewMode === 'matrix' && (
        <Suspense fallback={<LoadingSkeleton minHeight="280px" message="Loading view…" />}>
          <CapabilityMatrix rows={scorecard} />
        </Suspense>
      )}
    </div>
  )
}
