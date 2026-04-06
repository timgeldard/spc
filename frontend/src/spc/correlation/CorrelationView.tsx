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
  cardSubClass,
  cardTitleClass,
  controlsRowClass,
  correlationMetaClass,
  correlationViewClass,
  emptyStateClass,
  heroCardDenseClass,
  inputBaseClass,
  inputSmClass,
  inlineLabelClass,
  moduleEyebrowClass,
  moduleHeaderCardClass,
  splitPanelClass,
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
      <div className={moduleHeaderCardClass}>
        <div className={moduleEyebrowClass}>Relationship analysis</div>
        <h3 className={cardTitleClass}>Correlation Explorer</h3>
        <p className={cardSubClass}>
          Pairwise Pearson correlation between all characteristics for {state.selectedMaterial.material_name}.
          Click a cell to see the scatter plot and validate whether a relationship is operationally meaningful.
        </p>
      </div>

      <div className={splitPanelClass}>
        <div className={`${heroCardDenseClass} space-y-3`}>
          <div className={moduleEyebrowClass}>Analysis controls</div>
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
        </div>
        <aside className={`${heroCardDenseClass} space-y-3`}>
          <div className={moduleEyebrowClass}>Interpretation guardrails</div>
          <p className="text-sm text-[var(--c-text-muted)]">Correlation is a directional clue, not proof of causation. Use the scatter plot to separate real structure from coincidence or common trend.</p>
        </aside>
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
