import { useState } from 'react'
import { useSPC } from '../SPCContext.jsx'
import { useCorrelation } from '../hooks/useCorrelation.js'
import CorrelationMatrix from '../charts/CorrelationMatrix.jsx'
import CorrelationScatter from '../charts/CorrelationScatter.jsx'
import { useCorrelationScatter } from '../hooks/useCorrelationScatter.js'

export default function CorrelationView() {
  const { state } = useSPC()
  const { result, loading, error, fetchCorrelation } = useCorrelation()
  const { result: scatterResult, loading: scatterLoading, error: scatterError, fetchScatter } = useCorrelationScatter()
  const [minBatches, setMinBatches] = useState(10)
  const [selectedPair, setSelectedPair] = useState(null)

  const handleRun = () => {
    if (!state.selectedMaterial) return
    setSelectedPair(null)
    fetchCorrelation({
      materialId: state.selectedMaterial.material_id,
      plantId: state.selectedPlant?.plant_id,
      dateFrom: state.dateFrom,
      dateTo: state.dateTo,
      minBatches,
    })
  }

  const handleCellClick = (micAId, micBId, micAName, micBName) => {
    setSelectedPair({ micAId, micBId, micAName, micBName })
    fetchScatter({
      materialId: state.selectedMaterial.material_id,
      micAId,
      micBId,
      plantId: state.selectedPlant?.plant_id,
      dateFrom: state.dateFrom,
      dateTo: state.dateTo,
    })
  }

  if (!state.selectedMaterial) {
    return (
      <div className="spc-empty-state">
        <p>Select a material above, then run the correlation analysis.</p>
      </div>
    )
  }

  return (
    <div className="spc-correlation-view">
      <h3 className="spc-section-title">Correlation Explorer</h3>
      <p className="spc-section-sub">
        Pairwise Pearson correlation between all characteristics for {state.selectedMaterial.material_name}.
        Click a cell to see the scatter plot.
      </p>

      <div className="spc-correlation-controls">
        <label className="spc-inline-label">
          Min batches:
          <input
            type="number"
            className="spc-input spc-input--sm"
            min={5}
            max={100}
            value={minBatches}
            onChange={e => setMinBatches(Math.max(5, Math.min(100, Number(e.target.value))))}
          />
        </label>
        <button className="spc-btn spc-btn--primary" onClick={handleRun} disabled={loading}>
          {loading ? 'Computing…' : 'Run Correlation'}
        </button>
      </div>

      {error && <div className="banner banner--error">{error}</div>}

      {result && (
        <>
          <p className="spc-correlation-meta">
            {result.pair_count} pairs · {result.mics.length} characteristics
            {result.pair_count >= 500 && ' (showing top 500 by |r|)'}
          </p>
          {result.mics.length > 30 && (
            <div className="banner banner--warning">
              More than 30 characteristics detected — consider narrowing the date range or increasing min batches.
            </div>
          )}
          <CorrelationMatrix
            pairs={result.pairs}
            mics={result.mics}
            onCellClick={handleCellClick}
          />
          {selectedPair && (
            <CorrelationScatter
              result={scatterResult}
              loading={scatterLoading}
              error={scatterError}
            />
          )}
        </>
      )}
    </div>
  )
}
