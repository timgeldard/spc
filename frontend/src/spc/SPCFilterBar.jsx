import { useState, useMemo } from 'react'
import { useSPC } from './SPCContext.jsx'
import { useValidateMaterial } from './hooks/useMaterials.js'
import { usePlants } from './hooks/usePlants.js'
import { useCharacteristics } from './hooks/useCharacteristics.js'

export default function SPCFilterBar() {
  const { state, dispatch } = useSPC()
  const { validateMaterial, validating, error: validateError } = useValidateMaterial()
  const { plants, loading: plantsLoading } = usePlants(state.selectedMaterial?.material_id)
  const { characteristics, attrCharacteristics, loading: charsLoading } = useCharacteristics(
    state.selectedMaterial?.material_id,
    state.selectedPlant?.plant_id,
  )
  const allCharacteristics = useMemo(() => [
    ...characteristics,
    ...attrCharacteristics,
  ].sort((a, b) => (a.mic_name || '').localeCompare(b.mic_name || '')), [characteristics, attrCharacteristics])

  const [inputValue, setInputValue] = useState('')
  const [notFound, setNotFound] = useState(false)

  const handleValidate = async () => {
    const trimmed = inputValue.trim()
    if (!trimmed) return
    setNotFound(false)
    const result = await validateMaterial(trimmed)
    if (result?.valid) {
      dispatch({ type: 'SET_MATERIAL', payload: { material_id: result.material_id, material_name: result.material_name } })
    } else if (result && !result.valid) {
      setNotFound(true)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleValidate()
  }

  const handlePlantChange = (e) => {
    const plant = plants.find(p => p.plant_id === e.target.value) ?? null
    dispatch({ type: 'SET_PLANT', payload: plant })
  }

  const handleMICChange = (e) => {
    const [mic_id, mic_name] = e.target.value.split('|')
    const mic = allCharacteristics.find(c => c.mic_id === mic_id && c.mic_name === mic_name) ?? null
    dispatch({ type: 'SET_MIC', payload: mic })
  }

  return (
    <div className="spc-filter-bar">
      {/* Material */}
      <div className="spc-filter-group">
        <label className="spc-filter-label" htmlFor="spc-material">Material</label>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <input
            id="spc-material"
            type="text"
            className="spc-select"
            placeholder="Enter material ID"
            value={inputValue}
            onChange={e => { setInputValue(e.target.value); setNotFound(false) }}
            onKeyDown={handleKeyDown}
            disabled={validating}
          />
          <button
            className="spc-btn"
            onClick={handleValidate}
            disabled={validating || !inputValue.trim()}
          >
            {validating ? 'Validating...' : 'Validate'}
          </button>
        </div>
        {(validateError || notFound) && (
          <span style={{ color: 'var(--spc-red, #c0392b)', fontSize: '0.82rem', marginTop: '0.2rem', display: 'block' }}>
            Material not found
          </span>
        )}
        {state.selectedMaterial && !validateError && (
          <span style={{ color: 'var(--spc-green, #27ae60)', fontSize: '0.82rem', marginTop: '0.2rem', display: 'block' }}>
            {state.selectedMaterial.material_name || state.selectedMaterial.material_id}
          </span>
        )}
      </div>

      {/* Plant — only shown once a material is validated */}
      {state.selectedMaterial && (
        <div className="spc-filter-group">
          <label className="spc-filter-label" htmlFor="spc-plant">Plant</label>
          <select
            id="spc-plant"
            className="spc-select"
            value={state.selectedPlant?.plant_id ?? ''}
            onChange={handlePlantChange}
            disabled={plantsLoading}
          >
            <option value="">
              {plantsLoading ? 'Loading...' : plants.length > 1 ? '— All plants —' : plants.length === 1 ? '— Select plant —' : 'No plant data'}
            </option>
            {plants.map(p => (
              <option key={p.plant_id} value={p.plant_id}>
                {p.plant_name || p.plant_id}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* MIC characteristic */}
      <div className="spc-filter-group">
        <label className="spc-filter-label" htmlFor="spc-mic">Characteristic (MIC)</label>
        <select
          id="spc-mic"
          className="spc-select"
          value={state.selectedMIC ? `${state.selectedMIC.mic_id}|${state.selectedMIC.mic_name}` : ''}
          onChange={handleMICChange}
          disabled={!state.selectedMaterial || charsLoading}
        >
          <option value="">
            {!state.selectedMaterial
              ? '— Select material first —'
              : charsLoading
              ? 'Loading...'
              : allCharacteristics.length === 0
              ? 'No characteristics found'
              : '— Select a characteristic —'}
          </option>
          {allCharacteristics.map(c => (
            <option
              key={`${c.mic_id}|${c.mic_name}`}
              value={`${c.mic_id}|${c.mic_name}`}
              title={c.inspection_method || undefined}
            >
              {c.chart_type === 'p_chart' ? '[Attribute] ' : ''}{c.mic_name || c.mic_id}
              {c.batch_count ? ` (${c.batch_count} batches)` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Date range */}
      <div className="spc-filter-group">
        <label className="spc-filter-label" htmlFor="spc-date-from">From</label>
        <input
          id="spc-date-from"
          type="date"
          className="spc-date-input"
          value={state.dateFrom}
          onChange={e => dispatch({ type: 'SET_DATE_FROM', payload: e.target.value })}
        />
      </div>

      <div className="spc-filter-group">
        <label className="spc-filter-label" htmlFor="spc-date-to">To</label>
        <input
          id="spc-date-to"
          type="date"
          className="spc-date-input"
          value={state.dateTo}
          onChange={e => dispatch({ type: 'SET_DATE_TO', payload: e.target.value })}
        />
      </div>

      {state.selectedMaterial && (
        <div className="spc-filter-meta">
          {state.selectedMIC && (
            <span className={`spc-badge spc-badge--${state.selectedMIC.chart_type}`}>
              {state.selectedMIC.chart_type === 'xbar_r'   ? 'X̄-R chart'
               : state.selectedMIC.chart_type === 'p_chart'  ? 'Attribute chart'
               : 'I-MR chart'}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
