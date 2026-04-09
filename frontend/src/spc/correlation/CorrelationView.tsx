import { useState } from 'react'
import '../charts/ensureEChartsTheme'
import { useSPC } from '../SPCContext'
import { useCorrelation } from '../hooks/useCorrelation'
import CorrelationMatrix from '../charts/CorrelationMatrix'
import CorrelationScatter from '../charts/CorrelationScatter'
import { useCorrelationScatter } from '../hooks/useCorrelationScatter'
import { Button } from '../../components/ui'
import type { ChangeEvent } from 'react'
import type { CorrelationPair } from '../types'
import {
  cardSubClass,
  cardTitleClass,
  controlsRowClass,
  correlationMetaClass,
  correlationViewClass,
  heroCardDenseClass,
  inputBaseClass,
  inputSmClass,
  inlineLabelClass,
  moduleEyebrowClass,
  moduleHeaderCardClass,
  splitPanelClass,
  surfacePanelClass,
} from '../uiClasses'
import FieldHelp from '../components/FieldHelp'
import InfoBanner from '../components/InfoBanner'
import LoadingSkeleton from '../components/LoadingSkeleton'
import ModuleEmptyState from '../components/ModuleEmptyState'

interface SelectedCorrelationPair {
  micAId: string
  micBId: string
  micAName: string
  micBName: string
}

/** Top N strongest correlations (by |r|) for driver ranking */
function DriverRanking({ pairs, n = 5 }: { pairs: CorrelationPair[]; n?: number }) {
  type RankedPair = CorrelationPair & { _r: number }
  const top: RankedPair[] = pairs
    .map(p => ({ ...p, _r: p.pearson_r ?? null }))
    .filter((p): p is RankedPair => p._r != null)
    .sort((a, b) => Math.abs(b._r) - Math.abs(a._r))
    .slice(0, n)

  if (!top.length) return null

  return (
    <div className={`${surfacePanelClass} space-y-2`}>
      <div className={moduleEyebrowClass}>Strongest relationships (top {top.length})</div>
      <p className="text-xs text-[var(--c-text-muted)]">
        High |r| values indicate a linear relationship. Click the corresponding cell in the matrix to validate with a scatter plot.
      </p>
      <ol className="space-y-1" aria-label="Top correlated characteristic pairs">
        {top.map((p, i) => {
          const r = p._r
          const isPositive = r >= 0
          const absR = Math.abs(r)
          const strength = absR >= 0.7 ? 'strong' : absR >= 0.4 ? 'moderate' : 'weak'
          const colorClass = absR >= 0.7 ? 'text-[#F24A00]' : absR >= 0.4 ? 'text-[#005776]' : 'text-[#4E7080]'
          return (
            <li key={`${p.mic_a_id}-${p.mic_b_id}`} className="flex items-baseline gap-2 text-sm">
              <span className="w-4 shrink-0 text-right text-xs text-[var(--c-text-muted)]">{i + 1}.</span>
              <span className="flex-1 truncate text-[var(--c-text)]">
                {p.mic_a_name ?? p.mic_a_id} <span className="text-[var(--c-text-muted)]">↔</span> {p.mic_b_name ?? p.mic_b_id}
              </span>
              <span className={`shrink-0 font-mono text-xs font-semibold ${colorClass}`}>
                r = {r.toFixed(3)}
                <span className="sr-only"> ({isPositive ? 'positive' : 'negative'} {strength} correlation)</span>
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
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
      <ModuleEmptyState
        icon="〜"
        title="Select a material to explore correlations"
        description="Pairwise Pearson correlation across all characteristics. Use the filter bar above to select a material, then run the analysis."
      />
    )
  }

  return (
    <div className={correlationViewClass}>
      <div className={moduleHeaderCardClass}>
        <div className={moduleEyebrowClass}>Relationship analysis</div>
        <h3 className={cardTitleClass}>Correlation Explorer</h3>
        <p className={cardSubClass}>
          Pairwise Pearson correlation between all characteristics for{' '}
          <strong>{state.selectedMaterial.material_name ?? state.selectedMaterial.material_id}</strong>.
          Click a matrix cell to validate whether a relationship is operationally meaningful.
        </p>
      </div>

      <div className={splitPanelClass}>
        {/* ── Controls ── */}
        <div className={`${heroCardDenseClass} space-y-3`}>
          <div className={moduleEyebrowClass}>Analysis controls</div>
          <div className={controlsRowClass}>
            <label className={inlineLabelClass} htmlFor="corr-min-batches">
              Min batches:
              <input
                id="corr-min-batches"
                type="number"
                className={`${inputBaseClass} ${inputSmClass} w-20`}
                min={5}
                max={100}
                value={minBatches}
                aria-describedby="corr-min-batches-help"
                onChange={(e: ChangeEvent<HTMLInputElement>) => setMinBatches(Math.max(5, Math.min(100, Number(e.target.value))))}
              />
            </label>
            <Button
              variant="primary"
              onClick={handleRun}
              disabled={loading}
              aria-label={`Run correlation analysis for ${state.selectedMaterial.material_name ?? state.selectedMaterial.material_id}`}
            >
              {loading ? 'Computing…' : 'Run Correlation'}
            </Button>
          </div>
          <FieldHelp id="corr-min-batches-help">
            Minimum number of shared batch observations required to include a pair. Higher values improve
            statistical reliability but reduce the number of pairs shown.
          </FieldHelp>
          {(state.dateFrom || state.dateTo) && (
            <p className="text-xs text-[var(--c-text-muted)]">
              Window: {state.dateFrom || '—'} → {state.dateTo || 'today'}
            </p>
          )}
        </div>

        {/* ── Guardrails ── */}
        <aside className={`${heroCardDenseClass} space-y-3`}>
          <div className={moduleEyebrowClass}>Interpretation guardrails</div>
          <p className="text-sm text-[var(--c-text-muted)]">
            Correlation is a directional clue, not proof of causation. A strong r value may reflect a common
            trend, a confounding variable, or true process coupling — use the scatter plot to distinguish.
          </p>
          <div className="space-y-1 text-xs text-[var(--c-text-muted)]">
            <p><span className="font-semibold text-[#F24A00]">|r| ≥ 0.70</span> — strong, worth investigating</p>
            <p><span className="font-semibold text-[#005776]">0.40 ≤ |r| &lt; 0.70</span> — moderate signal</p>
            <p><span className="font-semibold text-[#4E7080]">|r| &lt; 0.40</span> — weak, usually noise</p>
          </div>
        </aside>
      </div>

      {/* ── Loading ── */}
      {loading && <LoadingSkeleton message="Computing correlations…" />}

      {/* ── Error ── */}
      {error && <InfoBanner variant="error">{error}</InfoBanner>}

      {/* ── Results ── */}
      {result && (
        <>
          <p className={correlationMetaClass}>
            {result.pair_count} pairs · {result.mics.length} characteristics · min {minBatches} batches
            {result.pair_count >= 500 && ' (showing top 500 by |r|)'}
          </p>

          {result.mics.length > 30 && (
            <InfoBanner variant="warn">
              More than 30 characteristics detected — consider narrowing the date range or increasing min batches
              to focus on the most data-rich pairs.
            </InfoBanner>
          )}

          {/* Driver ranking */}
          <DriverRanking pairs={result.pairs} />

          <InfoBanner variant="info">
            Click any cell in the matrix below to open a scatter plot for that pair.
          </InfoBanner>

          <CorrelationMatrix
            pairs={result.pairs}
            mics={result.mics}
            onCellClick={handleCellClick}
          />

          {/* Scatter drill */}
          {selectedPair && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--c-text-muted)]">
                  Scatter: {selectedPair.micAName} ↔ {selectedPair.micBName}
                </span>
                <span className="text-xs text-[var(--c-text-muted)]">
                  — does the relationship hold across the batch range?
                </span>
              </div>
              <CorrelationScatter
                result={scatterResult}
                loading={scatterLoading}
                error={scatterError}
              />
            </>
          )}
        </>
      )}

      {/* ── Pre-run placeholder ── */}
      {!result && !loading && !error && (
        <ModuleEmptyState
          title="Run the analysis to explore relationships"
          description="Adjust the min-batches threshold if needed, then press Run Correlation."
        />
      )}
    </div>
  )
}
