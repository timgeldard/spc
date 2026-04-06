import { useState } from 'react'
import '../charts/ensureEChartsTheme'
import { useSPC } from '../SPCContext'
import { useCorrelation } from '../hooks/useCorrelation'
import CorrelationMatrix from '../charts/CorrelationMatrix'
import CorrelationScatter from '../charts/CorrelationScatter'
import { useCorrelationScatter } from '../hooks/useCorrelationScatter'
import type { ChangeEvent } from 'react'
import {
  buttonBaseClass,
  buttonPrimaryClass,
  controlsRowClass,
  correlationMetaClass,
  correlationViewClass,
  emptyStateClass,
  inputBaseClass,
  inputSmClass,
  inlineLabelClass,
  sectionSubClass,
  sectionTitleClass,
} from '../uiClasses'

interface SelectedCorrelationPair {
  micAId: string
  micBId: string
  micAName: string
  micBName: string
}

export default function CorrelationView() {
  const { state } = useSPC()
  const { result, loading, error, fetchCorrelation } = useCorrelation()
  const { result: scatterResult, loading: scatterLoading, error: scatterError, fetchScatter } = useCorrelationScatter()
  const [minBatches, setMinBatches] = useState(10)
  const [selectedPair, setSelectedPair] = useState<SelectedCorrelationPair | null>(null)

  const handleRun = (): void => {
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

  const handleCellClick = (micAId: string, micBId: string, micAName: string, micBName: string): void => {
    if (!state.selectedMaterial) return
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
      <div className={emptyStateClass}>
        <p>Select a material above, then run the correlation analysis.</p>
      </div>
    )
  }

  return (
    <div className={correlationViewClass}>
      <h3 className={sectionTitleClass}>Correlation Explorer</h3>
      <p className={sectionSubClass}>
        Pairwise Pearson correlation between all characteristics for {state.selectedMaterial.material_name}.
        Click a cell to see the scatter plot.
      </p>

      <div className={controlsRowClass}>
        <label className={inlineLabelClass}>
          Min batches:
          <input
            type="number"
            className={`${inputBaseClass} ${inputSmClass} w-20`}
            min={5}
            max={100}
            value={minBatches}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setMinBatches(Math.max(5, Math.min(100, Number(e.target.value))))}
          />
        </label>
        <button className={`${buttonBaseClass} ${buttonPrimaryClass}`} onClick={handleRun} disabled={loading}>
          {loading ? 'Computing…' : 'Run Correlation'}
        </button>
      </div>

      {error && <div className="banner banner--error">{error}</div>}

      {result && (
        <>
          <p className={correlationMetaClass}>
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
