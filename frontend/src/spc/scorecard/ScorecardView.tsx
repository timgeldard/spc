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
  kpiLabelClass,
  kpiValueClass,
  metricGridClass,
  scorecardHeaderClass,
  scorecardEvidenceClass,
  scorecardKpiClass,
  scorecardLayoutClass,
  scorecardPlantClass,
  scorecardSidebarClass,
  scorecardSubClass,
  scorecardSummaryClass,
  scorecardTitleClass,
  scorecardToggleClass,
  stabilityNoteClass,
} from '../uiClasses'

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
    { label: 'Characteristics', value: total, border: 'border-slate-200 bg-slate-50 text-slate-800', meta: 'Total measurable MICs in scope' },
    { label: 'Highly Capable (≥1.67)', value: excellent, border: 'border-emerald-200 bg-emerald-50 text-emerald-700', meta: 'Strong headroom above specification' },
    { label: 'Capable (≥1.33)', value: good, border: 'border-green-200 bg-green-50 text-green-700', meta: 'Operationally healthy and reliable' },
    { label: 'Marginal (≥1.00)', value: marginal, border: 'border-amber-200 bg-amber-50 text-amber-700', meta: 'Monitor closely before release decisions' },
    { label: 'Not Capable (<1.00)', value: poor, border: 'border-red-200 bg-red-50 text-red-700', meta: 'Immediate attention required' },
  ]

  return (
    <div className={scorecardSummaryClass}>
      {cards.map(card => (
        <div key={card.label} className={`${scorecardKpiClass} ${card.border}`}>
          <span className={kpiValueClass}>{card.value}</span>
          <span className={kpiLabelClass}>{card.label}</span>
          <span className="mt-2 block text-xs opacity-80">{card.meta}</span>
        </div>
      ))}
    </div>
  )
}

function ScorecardPanelLoadingState() {
  return (
    <div className="flex min-h-[280px] items-center justify-center rounded-xl border border-slate-200 bg-white/70 px-6 py-12 text-sm text-slate-500 shadow-sm">
      Loading scorecard view…
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
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <div className="text-gray-300">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="3" y1="15" x2="21" y2="15" />
            <line x1="9" y1="9" x2="9" y2="21" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-700">No material selected</p>
          <p className="mt-1 max-w-xs text-xs text-gray-400">Select a material above to view the SPC scorecard with Cp/Cpk for all characteristics.</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ padding: '1.5rem 0' }}>
        <div className="flex flex-col gap-3">
          <div className="h-10 w-full animate-pulse rounded-md bg-gray-200/70" />
          <div className="h-10 w-full animate-pulse rounded-md bg-gray-200/70" />
          <div className="h-10 w-5/6 animate-pulse rounded-md bg-gray-200/70" />
          <div className="h-10 w-4/6 animate-pulse rounded-md bg-gray-200/70" />
          <div className="h-10 w-full animate-pulse rounded-md bg-gray-200/70" />
        </div>
      </div>
    )
  }

  if (error) {
    return <div className="banner banner--error">Failed to load scorecard: {error}</div>
  }

  if (!scorecard.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <div className="text-gray-300">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-700">No scorecard data</p>
          <p className="mt-1 max-w-xs text-xs text-gray-400">No data found for <strong>{state.selectedMaterial.material_name}</strong>. At least 3 batches with quantitative results are required.</p>
        </div>
      </div>
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
            <Suspense fallback={<ScorecardPanelLoadingState />}>
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
        <Suspense fallback={<ScorecardPanelLoadingState />}>
          <CapabilityMatrix rows={scorecard} />
        </Suspense>
      )}
    </div>
  )
}
