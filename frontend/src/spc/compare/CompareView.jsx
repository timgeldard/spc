import { useState, useMemo } from 'react'
import '../charts/ensureEChartsTheme'
import { useSPC } from '../SPCContext.jsx'
import { useCompareScorecard } from '../hooks/useCompareScorecard.js'
import GroupedBarChart from './GroupedBarChart.jsx'
import {
  buttonBaseClass,
  buttonGhostClass,
  buttonSecondaryClass,
  buttonSmClass,
  compareBadgeClass,
  compareBadgeCommonClass,
  compareInputLabelClass,
  compareInputRowClass,
  compareInputsClass,
  compareSummaryClass,
  compareViewClass,
  inputBaseClass,
  loadingClass,
  spinnerClass,
  sectionSubClass,
  sectionTitleClass,
} from '../uiClasses.js'

export default function CompareView() {
  const { state } = useSPC()
  const [materialInputs, setMaterialInputs] = useState(['', ''])

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

  const addMaterial = () => {
    if (materialInputs.length < 3) setMaterialInputs(v => [...v, ''])
  }

  const removeMaterial = (i) => {
    setMaterialInputs(v => v.filter((_, idx) => idx !== i))
  }

  const updateMaterial = (i, val) => {
    setMaterialInputs(v => v.map((x, idx) => idx === i ? val : x))
  }

  return (
    <div className={compareViewClass}>
      <h3 className={sectionTitleClass}>Multi-Material Capability Comparison</h3>
      <p className={sectionSubClass}>Compare Cpk across common characteristics for 2–3 materials.</p>

      <div className={compareInputsClass}>
        {materialInputs.map((val, i) => (
          <div key={i} className={compareInputRowClass}>
            <div className="flex-1">
              <label className={compareInputLabelClass}>Material {i + 1}</label>
              <input
                className={inputBaseClass}
                type="text"
                placeholder="Material ID"
                value={val}
                onChange={e => updateMaterial(i, e.target.value)}
              />
            </div>
            {materialInputs.length > 2 && (
              <button className={`${buttonBaseClass} ${buttonSmClass} ${buttonGhostClass}`} onClick={() => removeMaterial(i)}>✕</button>
            )}
          </div>
        ))}
        {materialInputs.length < 3 && (
          <button className={`${buttonBaseClass} ${buttonSmClass} ${buttonSecondaryClass}`} onClick={addMaterial}>+ Add material</button>
        )}
      </div>

      {validIds.length >= 2 && loading && (
        <div className={loadingClass}>
          <div className={spinnerClass} />
          <p>Loading comparison data (may take a few seconds)…</p>
        </div>
      )}

      {error && <div className="banner banner--error">{error}</div>}

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
