import { useState, useMemo } from 'react'
import '../charts/ensureEChartsTheme'
import { useSPC } from '../SPCContext'
import { useCompareScorecard } from '../hooks/useCompareScorecard'
import GroupedBarChart from './GroupedBarChart'
import type { ChangeEvent } from 'react'
import {
  buttonBaseClass,
  buttonGhostClass,
  buttonSecondaryClass,
  buttonSmClass,
  cardSubClass,
  cardTitleClass,
  compareBadgeClass,
  compareBadgeCommonClass,
  compareInputLabelClass,
  compareInputRowClass,
  compareInputsClass,
  compareSummaryClass,
  compareViewClass,
  heroCardDenseClass,
  inputBaseClass,
  moduleEyebrowClass,
  moduleHeaderCardClass,
  splitPanelClass,
} from '../uiClasses'
import FieldHelp from '../components/FieldHelp'
import InfoBanner from '../components/InfoBanner'
import LoadingSkeleton from '../components/LoadingSkeleton'
import ModuleEmptyState from '../components/ModuleEmptyState'

export default function CompareView() {
  const { state } = useSPC()
  const [materialInputs, setMaterialInputs] = useState<string[]>(['', ''])

  const validIds = useMemo(
    () => Array.from(new Set(materialInputs.map(s => s.trim()).filter(s => s.length > 0))),
    [materialInputs]
  )

  const { result, loading, error } = useCompareScorecard(
    validIds.length >= 2 ? validIds : null,
    state.dateFrom,
    state.dateTo,
    state.selectedPlant?.plant_id,
  )

  const addMaterial = (): void => {
    if (materialInputs.length < 3) setMaterialInputs(v => [...v, ''])
  }

  const removeMaterial = (i: number): void => {
    setMaterialInputs(v => v.filter((_, idx) => idx !== i))
  }

  const updateMaterial = (i: number, val: string): void => {
    setMaterialInputs(v => v.map((x, idx) => idx === i ? val : x))
  }

  const hasNoCommonMICs = result && result.common_mics.length === 0

  return (
    <div className={compareViewClass}>
      <div className={moduleHeaderCardClass}>
        <div className={moduleEyebrowClass}>Cross-material analysis</div>
        <h3 className={cardTitleClass}>Multi-Material Capability Comparison</h3>
        <p className={cardSubClass}>
          Compare Cpk across common characteristics for 2–3 materials using the same selected plant and date scope.
          Results show only characteristics measured on all entered materials.
        </p>
      </div>

      <div className={splitPanelClass}>
        {/* ── Input card ── */}
        <div className={compareInputsClass}>
          <div className={moduleEyebrowClass}>Materials to compare</div>
          {materialInputs.map((val, i) => (
            <div key={i} className={compareInputRowClass}>
              <div className="flex-1">
                <label className={compareInputLabelClass} htmlFor={`compare-mat-${i}`}>
                  Material {i + 1}
                </label>
                <input
                  id={`compare-mat-${i}`}
                  className={inputBaseClass}
                  type="text"
                  placeholder="e.g. RM-12345"
                  value={val}
                  aria-describedby={`compare-mat-${i}-help`}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => updateMaterial(i, e.target.value)}
                />
                <FieldHelp id={`compare-mat-${i}-help`}>
                  {i === 0
                    ? 'Enter the SAP / ERP material ID exactly as it appears in your system.'
                    : 'Must share at least one characteristic (MIC) with Material 1 to generate comparison data.'}
                </FieldHelp>
              </div>
              {materialInputs.length > 2 && (
                <button
                  className={`${buttonBaseClass} ${buttonSmClass} ${buttonGhostClass}`}
                  onClick={() => removeMaterial(i)}
                  aria-label={`Remove Material ${i + 1}`}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {materialInputs.length < 3 && (
            <button
              className={`${buttonBaseClass} ${buttonSmClass} ${buttonSecondaryClass} w-fit`}
              onClick={addMaterial}
              aria-label="Add a third material to compare"
            >
              + Add material
            </button>
          )}

          {validIds.length === 1 && (
            <FieldHelp>Enter a second material ID to start the comparison.</FieldHelp>
          )}
        </div>

        {/* ── Guidance panel ── */}
        <aside className={`${heroCardDenseClass} space-y-3`}>
          <div className={moduleEyebrowClass}>How to use this view</div>
          <p className="text-sm text-[var(--c-text-muted)]">
            Best for process transfers, supplier changes, or recipe alternatives — where you want to check
            whether two materials behave consistently across shared quality characteristics.
          </p>
          <ol className="space-y-1.5 text-sm text-[var(--c-text-muted)]" aria-label="Steps to compare materials">
            <li><span className="font-semibold text-[var(--c-text)]">1.</span> Enter 2–3 material IDs above.</li>
            <li><span className="font-semibold text-[var(--c-text)]">2.</span> Set plant and date scope in the filter bar.</li>
            <li><span className="font-semibold text-[var(--c-text)]">3.</span> Comparison loads automatically once ≥ 2 valid IDs are entered.</li>
            <li><span className="font-semibold text-[var(--c-text)]">4.</span> Look for characteristics where one material has materially lower Cpk than the others.</li>
          </ol>
          <InfoBanner variant="info">
            Only characteristics measured on <strong>all</strong> entered materials are shown. If the chart is empty,
            check that all materials share at least one common MIC.
          </InfoBanner>
        </aside>
      </div>

      {/* ── Loading ── */}
      {validIds.length >= 2 && loading && (
        <LoadingSkeleton message="Loading comparison data (may take a few seconds)…" />
      )}

      {/* ── Error ── */}
      {error && <InfoBanner variant="error">{error}</InfoBanner>}

      {/* ── No common MICs ── */}
      {hasNoCommonMICs && (
        <ModuleEmptyState
          title="No common characteristics found"
          description={`The selected materials share no common MICs in the chosen plant and date window. Try a different plant, a wider date range, or verify the material IDs are correct.`}
        />
      )}

      {/* ── Results ── */}
      {result && result.common_mics.length > 0 && (
        <>
          <div className={compareSummaryClass}>
            {result.materials.map(m => (
              <span key={m.material_id} className={compareBadgeClass}>
                {m.material_name ?? m.material_id}: {m.scorecard.length} characteristics
              </span>
            ))}
            <span className={`${compareBadgeClass} ${compareBadgeCommonClass}`}>
              {result.common_mics.length} common
            </span>
          </div>
          <GroupedBarChart materials={result.materials} commonMics={result.common_mics} />
        </>
      )}

      {/* ── Pre-run placeholder ── */}
      {!result && !loading && !error && validIds.length < 2 && (
        <ModuleEmptyState
          icon="⇄"
          title="Enter two or more materials to compare"
          description="Use the inputs above to load a side-by-side Cpk comparison for shared characteristics."
        />
      )}
    </div>
  )
}
