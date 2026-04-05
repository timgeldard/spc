import { useState, useMemo } from 'react'
import { useSPC } from '../SPCContext.jsx'
import { useCompareScorecard } from '../hooks/useCompareScorecard.js'
import GroupedBarChart from './GroupedBarChart.jsx'

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
    <div className="spc-compare-view">
      <h3 className="spc-section-title">Multi-Material Capability Comparison</h3>
      <p className="spc-section-sub">Compare Cpk across common characteristics for 2–3 materials.</p>

      <div className="spc-compare-inputs">
        {materialInputs.map((val, i) => (
          <div key={i} className="spc-compare-input-row">
            <label className="spc-compare-input-label">Material {i + 1}</label>
            <input
              className="spc-input"
              type="text"
              placeholder="Material ID"
              value={val}
              onChange={e => updateMaterial(i, e.target.value)}
            />
            {materialInputs.length > 2 && (
              <button className="spc-btn spc-btn--sm spc-btn--ghost" onClick={() => removeMaterial(i)}>✕</button>
            )}
          </div>
        ))}
        {materialInputs.length < 3 && (
          <button className="spc-btn spc-btn--sm spc-btn--secondary" onClick={addMaterial}>+ Add material</button>
        )}
      </div>

      {validIds.length >= 2 && loading && (
        <div className="spc-loading">
          <div className="spc-spinner" />
          <p>Loading comparison data (may take a few seconds)…</p>
        </div>
      )}

      {error && <div className="banner banner--error">{error}</div>}

      {result && (
        <>
          <div className="spc-compare-summary">
            {result.materials.map(m => (
              <span key={m.material_id} className="spc-compare-badge">
                {m.material_name ?? m.material_id}: {m.scorecard.length} characteristics
              </span>
            ))}
            <span className="spc-compare-badge spc-compare-badge--common">
              {result.common_mics.length} common
            </span>
          </div>
          <GroupedBarChart materials={result.materials} commonMics={result.common_mics} />
        </>
      )}
    </div>
  )
}
