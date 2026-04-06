import { useEffect, useMemo, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { useSPC } from './SPCContext'
import { useValidateMaterial } from './hooks/useMaterials'
import { usePlants } from './hooks/usePlants'
import { useCharacteristics } from './hooks/useCharacteristics'
import { getRecentMaterials, addRecentMaterial } from './hooks/useRecentMaterials'
import type { MaterialRef, MicRef, PlantRef, StratifyByKey } from './types'
import {
  badgeAmberClass,
  badgeBlueClass,
  buttonBaseClass,
  buttonPrimaryClass,
  dateInputClass,
  filterActionsClass,
  filterBarClass,
  filterCardClass,
  filterGroupClass,
  filterLabelClass,
  filterMetaClass,
  filterSectionClass,
  filterValueClass,
  selectClass,
} from './uiClasses'

export default function SPCFilterBar() {
  const { state, dispatch } = useSPC()
  const { validateMaterial, validating, error: validateError } = useValidateMaterial()
  const { plants, loading: plantsLoading } = usePlants(state.selectedMaterial?.material_id)
  const { characteristics, attrCharacteristics, loading: charsLoading } = useCharacteristics(
    state.selectedMaterial?.material_id,
    state.selectedPlant?.plant_id,
  )

  const allCharacteristics = useMemo(
    () =>
      [...characteristics, ...attrCharacteristics].sort((a, b) =>
        (a.mic_name || '').localeCompare(b.mic_name || ''),
      ),
    [characteristics, attrCharacteristics],
  )

  const [inputValue, setInputValue] = useState('')
  const [notFound, setNotFound] = useState(false)
  const [recents] = useState<MaterialRef[]>(() => getRecentMaterials())
  const materialFeedbackId = 'spc-material-feedback'
  const stratifyOptions: Array<{ value: StratifyByKey; label: string }> = [
    { value: 'plant_id', label: 'Plant' },
    { value: 'inspection_lot_id', label: 'Inspection Lot' },
    { value: 'operation_id', label: 'Operation' },
  ]

  useEffect(() => {
    if (plantsLoading || !state.selectedPlant) return
    const stillValid = plants.some(p => p.plant_id === state.selectedPlant?.plant_id)
    if (!stillValid) {
      dispatch({ type: 'SET_PLANT', payload: null })
    }
  }, [dispatch, plants, plantsLoading, state.selectedPlant])

  useEffect(() => {
    if (charsLoading || !state.selectedMIC) return
    const stillValid = allCharacteristics.some(
      c => c.mic_id === state.selectedMIC?.mic_id && c.mic_name === state.selectedMIC?.mic_name,
    )
    if (!stillValid) {
      dispatch({ type: 'SET_MIC', payload: null })
    }
  }, [allCharacteristics, charsLoading, dispatch, state.selectedMIC])

  const handleValidate = async () => {
    const trimmed = inputValue.trim()
    if (!trimmed) return
    setNotFound(false)
    const result = await validateMaterial(trimmed)
    if (result?.valid) {
      const material: MaterialRef = {
        material_id: result.material_id ?? trimmed,
        material_name: result.material_name ?? null,
      }
      addRecentMaterial(material)
      dispatch({ type: 'SET_MATERIAL', payload: material })
    } else if (result && !result.valid) {
      setNotFound(true)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') void handleValidate()
  }

  const handlePlantChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const plant = plants.find(p => p.plant_id === event.target.value) ?? null
    dispatch({ type: 'SET_PLANT', payload: plant as PlantRef | null })
  }

  const handleMICChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const [mic_id, mic_name] = event.target.value.split('|')
    const mic = allCharacteristics.find(c => c.mic_id === mic_id && c.mic_name === mic_name) ?? null
    dispatch({ type: 'SET_MIC', payload: mic as MicRef | null })
  }

  const handleStratifyChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value as StratifyByKey | ''
    dispatch({ type: 'SET_STRATIFY_BY', payload: value || null })
  }

  const selectRecent = (material: MaterialRef) => {
    setInputValue(material.material_id)
    dispatch({ type: 'SET_MATERIAL', payload: material })
  }

  return (
    <div className={filterBarClass} aria-label="SPC analysis filters">
      <div className={filterSectionClass}>
        <div className={filterCardClass}>
          <div className={filterGroupClass}>
            <label className={filterLabelClass} htmlFor="spc-material">Material</label>
            <div className="flex items-center gap-2">
              <input
                id="spc-material"
                type="text"
                className={selectClass}
                placeholder="Enter material ID"
                value={inputValue}
                aria-describedby={materialFeedbackId}
                aria-invalid={Boolean(validateError || notFound)}
                onChange={event => {
                  setInputValue(event.target.value)
                  setNotFound(false)
                }}
                onKeyDown={handleKeyDown}
                disabled={validating}
              />
              <button
                className={`${buttonBaseClass} ${buttonPrimaryClass}`}
                onClick={() => void handleValidate()}
                disabled={validating || !inputValue.trim()}
                aria-label="Validate material"
              >
                {validating ? 'Validating...' : 'Validate'}
              </button>
            </div>
            {(validateError || notFound) ? (
              <span
                id={materialFeedbackId}
                role="alert"
                aria-live="polite"
                style={{ color: 'var(--spc-red, #c0392b)', fontSize: '0.82rem', marginTop: '0.2rem', display: 'block' }}
              >
                {validateError || 'Material not found'}
              </span>
            ) : (
              <span id={materialFeedbackId} className="text-xs text-[var(--c-text-muted)]">
                Validate the material before narrowing plant, characteristic, or date scope.
              </span>
            )}
            {state.selectedMaterial && !validateError && (
              <span className={filterValueClass}>
                {state.selectedMaterial.material_name || state.selectedMaterial.material_id}
              </span>
            )}
            {!state.selectedMaterial && recents.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {recents.map(material => (
                  <button
                    key={material.material_id}
                    onClick={() => selectRecent(material)}
                    className="inline-flex cursor-pointer items-center rounded-full border-0 bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
                    aria-label={`Use recent material ${material.material_name || material.material_id}`}
                  >
                    {material.material_name || material.material_id}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {state.selectedMaterial && (
          <div className={filterCardClass}>
            <div className={filterGroupClass}>
              <label className={filterLabelClass} htmlFor="spc-plant">Plant</label>
              <select
                id="spc-plant"
                className={selectClass}
                value={state.selectedPlant?.plant_id ?? ''}
                onChange={handlePlantChange}
                disabled={plantsLoading}
              >
                <option value="">
                  {plantsLoading ? 'Loading…' : plants.length > 1 ? '— All plants —' : plants.length === 1 ? '— Select plant —' : 'No plant data'}
                </option>
                {plants.map(plant => (
                  <option key={plant.plant_id} value={plant.plant_id}>
                    {plant.plant_name || plant.plant_id}
                  </option>
                ))}
              </select>
              <span className="text-xs text-[var(--c-text-muted)]">
                Keep broad for portfolio review, narrow for local diagnosis.
              </span>
            </div>
          </div>
        )}

        <div className={filterCardClass}>
          <div className={filterGroupClass}>
            <label className={filterLabelClass} htmlFor="spc-mic">Characteristic (MIC)</label>
            <select
              id="spc-mic"
              className={selectClass}
              value={state.selectedMIC ? `${state.selectedMIC.mic_id}|${state.selectedMIC.mic_name}` : ''}
              onChange={handleMICChange}
              disabled={!state.selectedMaterial || charsLoading}
            >
              <option value="">
                {!state.selectedMaterial
                  ? '— Select material first —'
                  : charsLoading
                    ? 'Loading…'
                    : allCharacteristics.length === 0
                      ? 'No characteristics found'
                      : '— Select a characteristic —'}
              </option>
              {allCharacteristics.map(characteristic => (
                <option
                  key={`${characteristic.mic_id}|${characteristic.mic_name}`}
                  value={`${characteristic.mic_id}|${characteristic.mic_name}`}
                  title={characteristic.inspection_method || undefined}
                >
                  {characteristic.chart_type === 'p_chart' ? '[Attribute] ' : ''}
                  {characteristic.mic_name || characteristic.mic_id}
                  {characteristic.batch_count ? ` (${characteristic.batch_count} batches)` : ''}
                </option>
              ))}
            </select>
            {state.selectedMIC?.inspection_method && (
              <span className="text-xs text-[var(--c-text-muted)]">
                Method: {state.selectedMIC.inspection_method}
              </span>
            )}
          </div>
        </div>

        {state.selectedMaterial && (
          <div className={filterCardClass}>
            <div className={filterGroupClass}>
              <label className={filterLabelClass} htmlFor="spc-stratify-by">Stratify By</label>
              <select
                id="spc-stratify-by"
                className={selectClass}
                value={state.stratifyBy ?? ''}
                onChange={handleStratifyChange}
              >
                <option value="">— None —</option>
                {stratifyOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="text-xs text-[var(--c-text-muted)]">
                Compare hidden variation by plant, lot, or operation.
              </span>
            </div>
          </div>
        )}
      </div>

      <div className={filterActionsClass}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className={filterCardClass}>
            <div className={filterGroupClass}>
              <label className={filterLabelClass} htmlFor="spc-date-from">From</label>
              <input
                id="spc-date-from"
                type="date"
                className={dateInputClass}
                value={state.dateFrom}
                onChange={event => dispatch({ type: 'SET_DATE_FROM', payload: event.target.value })}
              />
            </div>
          </div>

          <div className={filterCardClass}>
            <div className={filterGroupClass}>
              <label className={filterLabelClass} htmlFor="spc-date-to">To</label>
              <input
                id="spc-date-to"
                type="date"
                className={dateInputClass}
                value={state.dateTo}
                onChange={event => dispatch({ type: 'SET_DATE_TO', payload: event.target.value })}
              />
            </div>
          </div>
        </div>

        {state.selectedMaterial && (
          <div className={`${filterCardClass} flex flex-col justify-between gap-3`}>
            <div>
              <div className={filterLabelClass}>Analysis posture</div>
              <div className="mt-2 text-sm text-[var(--c-text-muted)]" aria-live="polite">
                Choose the scope first, then interpret capability and rule signals in the chart workspace.
              </div>
            </div>
            <div className={filterMetaClass}>
              {state.selectedMIC && (
                <span className={`${state.selectedMIC.chart_type === 'p_chart' ? badgeAmberClass : badgeBlueClass} inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium`}>
                  {state.selectedMIC.chart_type === 'xbar_r'
                    ? 'X̄-R chart'
                    : state.selectedMIC.chart_type === 'p_chart'
                      ? 'Attribute chart'
                      : 'I-MR chart'}
                </span>
              )}
              {state.stratifyBy && (
                <span className={`${badgeBlueClass} inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium`}>
                  Stratified by {stratifyOptions.find(option => option.value === state.stratifyBy)?.label ?? state.stratifyBy}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
