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
      <div className="spc-empty-state">
        <div className="spc-empty-icon">📋</div>
        <p>Select a material above to view the SPC scorecard.</p>
        <p className="spc-empty-sub">The scorecard shows Cp/Cpk for all characteristics. Click a row to open its control chart.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="spc-loading">
        <div className="spc-spinner" />
        <p>Loading scorecard…</p>
      </div>
    )
  }

  if (error) {
    return <div className="banner banner--error">Failed to load scorecard: {error}</div>
  }

  if (!scorecard.length) {
    return (
      <div className="spc-empty-state">
        <p>No scorecard data found for <strong>{state.selectedMaterial.material_name}</strong>.</p>
        <p className="spc-empty-sub">At least 3 batches with quantitative results are required per characteristic.</p>
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
          <ScorecardTable rows={scorecard} />
        </>
      )}
      {viewMode === 'matrix' && <CapabilityMatrix rows={scorecard} />}
    </div>
  )
}
