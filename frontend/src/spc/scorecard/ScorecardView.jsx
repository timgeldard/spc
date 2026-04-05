import { useState } from 'react'
import { useSPC } from '../SPCContext.jsx'
import { useSPCScorecard } from '../hooks/useSPCScorecard.js'
import ScorecardTable from './ScorecardTable.jsx'
import CapabilityMatrix from '../charts/CapabilityMatrix.jsx'

function SummaryBar({ rows }) {
  const total = rows.length
  const excellent = rows.filter(r => r.capability_status === 'excellent').length
  const good      = rows.filter(r => r.capability_status === 'good').length
  const marginal  = rows.filter(r => r.capability_status === 'marginal').length
  const poor      = rows.filter(r => r.capability_status === 'poor').length

  return (
    <div className="spc-scorecard-summary">
      <div className="spc-summary-kpi spc-summary-kpi--total">
        <span className="spc-kpi-value">{total}</span>
        <span className="spc-kpi-label">Characteristics</span>
      </div>
      <div className="spc-summary-kpi spc-summary-kpi--excellent">
        <span className="spc-kpi-value">{excellent}</span>
        <span className="spc-kpi-label">Highly Capable (≥1.67)</span>
      </div>
      <div className="spc-summary-kpi spc-summary-kpi--good">
        <span className="spc-kpi-value">{good}</span>
        <span className="spc-kpi-label">Capable (≥1.33)</span>
      </div>
      <div className="spc-summary-kpi spc-summary-kpi--marginal">
        <span className="spc-kpi-value">{marginal}</span>
        <span className="spc-kpi-label">Marginal (≥1.00)</span>
      </div>
      <div className="spc-summary-kpi spc-summary-kpi--poor">
        <span className="spc-kpi-value">{poor}</span>
        <span className="spc-kpi-label">Not Capable (&lt;1.00)</span>
      </div>
    </div>
  )
}

export default function ScorecardView() {
  const { state } = useSPC()
  const [viewMode, setViewMode] = useState('table')
  const { scorecard, loading, error } = useSPCScorecard(
    state.selectedMaterial?.material_id,
    state.dateFrom,
    state.dateTo,
    state.selectedPlant?.plant_id,
  )

  if (!state.selectedMaterial) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
        <div className="text-gray-300">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/>
            <line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="9" x2="9" y2="21"/>
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-700">No material selected</p>
          <p className="text-xs text-gray-400 max-w-xs mt-1">Select a material above to view the SPC scorecard with Cp/Cpk for all characteristics.</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ padding: '1.5rem 0' }}>
        <div className="flex flex-col gap-3">
          <div className="animate-pulse rounded-md bg-gray-200/70 h-10 w-full" />
          <div className="animate-pulse rounded-md bg-gray-200/70 h-10 w-full" />
          <div className="animate-pulse rounded-md bg-gray-200/70 h-10 w-5/6" />
          <div className="animate-pulse rounded-md bg-gray-200/70 h-10 w-4/6" />
          <div className="animate-pulse rounded-md bg-gray-200/70 h-10 w-full" />
        </div>
      </div>
    )
  }

  if (error) {
    return <div className="banner banner--error">Failed to load scorecard: {error}</div>
  }

  if (!scorecard.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
        <div className="text-gray-300">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-700">No scorecard data</p>
          <p className="text-xs text-gray-400 max-w-xs mt-1">No data found for <strong>{state.selectedMaterial.material_name}</strong>. At least 3 batches with quantitative results are required.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="spc-scorecard-layout">
      <div className="spc-scorecard-header">
        <h3 className="spc-scorecard-title">
          {state.selectedMaterial.material_name}
          {state.selectedPlant && (
            <span className="spc-scorecard-plant"> · {state.selectedPlant.plant_name || state.selectedPlant.plant_id}</span>
          )}
        </h3>
        <p className="spc-scorecard-sub">Click any row to open its control chart</p>
      </div>
      <SummaryBar rows={scorecard} />
      <div className="spc-scorecard-view-toggle">
        <button
          className={'spc-btn spc-btn--sm' + (viewMode === 'table' ? ' spc-btn--primary' : ' spc-btn--secondary')}
          onClick={() => setViewMode('table')}
        >
          Table
        </button>
        <button
          className={'spc-btn spc-btn--sm' + (viewMode === 'matrix' ? ' spc-btn--primary' : ' spc-btn--secondary')}
          onClick={() => setViewMode('matrix')}
        >
          Matrix
        </button>
      </div>
      {viewMode === 'table' && (
        <>
          <p className="spc-scorecard-stability-note">
            Cpk values are shown without stability verification. Open the control chart for each
            characteristic to check for rule violations before interpreting capability.
          </p>
          {state.exclusionAudit && (state.exclusionAudit.excluded_count ?? 0) > 0 && state.selectedMIC && (
            <p className="spc-scorecard-stability-note">
              {state.exclusionAudit.excluded_count} point{state.exclusionAudit.excluded_count !== 1 ? 's' : ''} excluded from
              {' '}{state.selectedMIC.mic_name ?? state.selectedMIC.mic_id}
              {state.exclusionAudit.user_id ? ` by ${state.exclusionAudit.user_id}` : ''}
              {state.exclusionAudit.event_ts ? ` on ${String(state.exclusionAudit.event_ts).replace('T', ' ').slice(0, 19)}` : ''}.
            </p>
          )}
          <ScorecardTable rows={scorecard} />
        </>
      )}
      {viewMode === 'matrix' && <CapabilityMatrix rows={scorecard} />}
    </div>
  )
}
