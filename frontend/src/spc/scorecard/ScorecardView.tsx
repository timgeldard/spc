import { Suspense, lazy, useState } from 'react'
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
  heroCardDenseClass,
  metricGridClass,
  scorecardHeaderClass,
  scorecardEvidenceClass,
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

const ScorecardTable = lazy(() => import('./ScorecardTable'))
const CapabilityMatrix = lazy(() => import('../charts/CapabilityMatrix'))

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
    { label: 'Characteristics', value: total, colorClass: 'border-slate-200 bg-slate-50 text-slate-800', meta: 'Total measurable MICs in scope' },
    { label: 'Highly Capable (≥1.67)', value: excellent, colorClass: 'border-emerald-200 bg-emerald-50 text-emerald-700', meta: 'Strong headroom above specification' },
    { label: 'Capable (≥1.33)', value: good, colorClass: 'border-green-200 bg-green-50 text-green-700', meta: 'Operationally healthy and reliable' },
    { label: 'Marginal (≥1.00)', value: marginal, colorClass: 'border-amber-200 bg-amber-50 text-amber-700', meta: 'Monitor closely before release decisions' },
    { label: 'Not Capable (<1.00)', value: poor, colorClass: 'border-red-200 bg-red-50 text-red-700', meta: 'Immediate attention required' },
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

export default function ScorecardView() {
  const { state } = useSPC()
  const [viewMode, setViewMode] = useState<'table' | 'matrix'>('table')
  const { scorecard, loading, error } = useSPCScorecard(
    state.selectedMaterial?.material_id,
    state.dateFrom,
    state.dateTo,
    state.selectedPlant?.plant_id,
  )

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
      <div className={scorecardHeaderClass}>
        <div className="text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-[var(--c-text-muted)]">Portfolio review</div>
        <h3 className={scorecardTitleClass}>
          {state.selectedMaterial.material_name}
          {state.selectedPlant && (
            <span className={scorecardPlantClass}> · {state.selectedPlant.plant_name || state.selectedPlant.plant_id}</span>
          )}
        </h3>
        <p className={scorecardSubClass}>
          Use this scorecard to triage which characteristics need chart-level review first.
        </p>
      </div>
      <SummaryBar rows={scorecard} />
      <div className={scorecardToggleClass}>
        <button
          className={`${buttonBaseClass} ${buttonSmClass} ${viewMode === 'table' ? buttonPrimaryClass : buttonSecondaryClass}`}
          onClick={() => setViewMode('table')}
        >
          Table
        </button>
        <button
          className={`${buttonBaseClass} ${buttonSmClass} ${viewMode === 'matrix' ? buttonPrimaryClass : buttonSecondaryClass}`}
          onClick={() => setViewMode('matrix')}
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
              <p>Start with low Cpk or high OOC-rate rows first. Those are the fastest path to meaningful intervention.</p>
              <p>Use Ppk to judge long-run performance drift, but only after the control chart shows stability.</p>
              <p>Click any row to jump directly into its control chart with the same selected scope.</p>
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
