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
  loadingClass,
  moduleEyebrowClass,
  moduleHeaderCardClass,
  splitPanelClass,
  spinnerClass,
} from '../uiClasses'
import InfoBanner from '../components/InfoBanner'

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

  return (
    <div className={compareViewClass}>
      <div className={moduleHeaderCardClass}>
        <div className={moduleEyebrowClass}>Cross-material analysis</div>
        <h3 className={cardTitleClass}>Multi-Material Capability Comparison</h3>
        <p className={cardSubClass}>Compare Cpk across common characteristics for 2–3 materials using the same selected plant and date scope.</p>
      </div>

      <div className={splitPanelClass}>
        <div className={compareInputsClass}>
          <div className={moduleEyebrowClass}>Comparison inputs</div>
          {materialInputs.map((val, i) => (
            <div key={i} className={compareInputRowClass}>
              <div className="flex-1">
                <label className={compareInputLabelClass}>Material {i + 1}</label>
                <input
                  className={inputBaseClass}
                  type="text"
                  placeholder="Material ID"
                  value={val}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => updateMaterial(i, e.target.value)}
                />
              </div>
              {materialInputs.length > 2 && (
                <button className={`${buttonBaseClass} ${buttonSmClass} ${buttonGhostClass}`} onClick={() => removeMaterial(i)}>✕</button>
              )}
            </div>
          ))}
          {materialInputs.length < 3 && (
            <button className={`${buttonBaseClass} ${buttonSmClass} ${buttonSecondaryClass} w-fit`} onClick={addMaterial}>+ Add material</button>
          )}
        </div>
        <aside className={`${heroCardDenseClass} space-y-3`}>
          <div className={moduleEyebrowClass}>How to use this view</div>
          <p className="text-sm text-[var(--c-text-muted)]">Compare materials that share common MICs and operating context. This is best for process transfers, supplier changes, or recipe alternatives.</p>
          <div className="space-y-2 text-sm text-[var(--c-text-muted)]">
            <p>1. Enter 2–3 materials.</p>
            <p>2. Review common-characteristic overlap.</p>
            <p>3. Use the grouped bar chart to spot capability gaps quickly.</p>
          </div>
        </aside>
      </div>

      {validIds.length >= 2 && loading && (
        <div className={loadingClass}>
          <div className={spinnerClass} />
          <p>Loading comparison data (may take a few seconds)…</p>
        </div>
      )}

      {error && <InfoBanner variant="error">{error}</InfoBanner>}

      {result && (
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
    </div>
  )
}
