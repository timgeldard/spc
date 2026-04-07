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
  fieldHelpClass,
  fieldValidationErrorClass,
  filterBarClass,
  filterCardClass,
  filterGroupClass,
  filterLabelClass,
  filterMetaClass,
  filterSectionClass,
  filterStepBodyClass,
  filterStepClass,
  filterStepNumClass,
  filterStepNumInactiveClass,
  filterValueClass,
  selectClass,
} from './uiClasses'

function serializeMicKey(mic: Pick<MicRef, 'mic_id' | 'mic_name'> | null | undefined): string {
  if (!mic) return ''
  return JSON.stringify({ mic_id: mic.mic_id, mic_name: mic.mic_name ?? null })
}

/** Default date range: last 12 months from today */
function defaultDateRange(): { from: string; to: string } {
  const to = new Date()
  const from = new Date(to)
  from.setFullYear(from.getFullYear() - 1)
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  }
}

export default function SPCFilterBar() {
  const { state, dispatch } = useSPC()
  const { validateMaterial, clearError, validating, error: validateError } = useValidateMaterial()
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
  const selectedMicValue = useMemo(
    () => serializeMicKey(state.selectedMIC),
    [state.selectedMIC],
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

  const defaults = useMemo(() => defaultDateRange(), [])

  // Auto-clear plant if it's no longer valid for the selected material
  useEffect(() => {
    if (plantsLoading || !state.selectedPlant) return
    const stillValid = plants.some(p => p.plant_id === state.selectedPlant?.plant_id)
    if (!stillValid) {
      dispatch({ type: 'SET_PLANT', payload: null })
    }
  }, [dispatch, plants, plantsLoading, state.selectedPlant])

  // Auto-select plant when only one is available
  useEffect(() => {
    if (plantsLoading || state.selectedPlant || plants.length !== 1) return
    dispatch({ type: 'SET_PLANT', payload: plants[0] as PlantRef })
  }, [dispatch, plants, plantsLoading, state.selectedPlant])

  // Auto-clear MIC if it's no longer valid for the current material/plant
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
    if (!event.target.value) {
      dispatch({ type: 'SET_MIC', payload: null })
      return
    }
    const mic = allCharacteristics.find(characteristic =>
      serializeMicKey(characteristic) === event.target.value,
    ) ?? null
    dispatch({ type: 'SET_MIC', payload: mic as MicRef | null })
  }

  const handleStratifyChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value as StratifyByKey | ''
    dispatch({ type: 'SET_STRATIFY_BY', payload: value || null })
  }

  const selectRecent = (material: MaterialRef) => {
    setInputValue(material.material_id)
    clearError()
    setNotFound(false)
    dispatch({ type: 'SET_MATERIAL', payload: material })
  }

  const hasMaterialError = Boolean(validateError || notFound)
  const scopeReady = Boolean(state.selectedMaterial)
  const timeReady = Boolean(state.dateFrom || state.dateTo)

  return (
    <div className={filterBarClass} aria-label="SPC analysis filters">

      {/* ── Step 1: Material ─────────────────────────────────────── */}
      <div className={filterSectionClass}>
        <div className={filterCardClass}>
          <div className={filterStepClass}>
            <span className={filterStepNumClass} aria-hidden="true">1</span>
            <div className={filterStepBodyClass}>
              <div className={filterGroupClass}>
                <label className={filterLabelClass} htmlFor="spc-material">Material</label>
                <div className="flex items-center gap-2">
                  <input
                    id="spc-material"
                    type="text"
                    className={`${selectClass}${hasMaterialError ? ' border-red-400 focus:border-red-500' : ''}`}
                    placeholder="Enter material ID"
                    value={inputValue}
                    aria-describedby={materialFeedbackId}
                    aria-invalid={hasMaterialError}
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
                    {validating ? 'Validating…' : 'Validate'}
                  </button>
                </div>

                {hasMaterialError ? (
                  <span
                    id={materialFeedbackId}
                    role="alert"
                    aria-live="polite"
                    className={fieldValidationErrorClass}
                  >
                    {validateError || 'Material not found — check the ID and try again.'}
                  </span>
                ) : (
                  <span id={materialFeedbackId} className={fieldHelpClass}>
                    Press Enter or Validate to confirm. Plant and characteristic options load after this step.
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
          </div>
        </div>

        {/* ── Step 2: Scope (Plant + MIC) ─────────────────────────── */}
        <div className={filterCardClass}>
          <div className={filterStepClass}>
            <span className={scopeReady ? filterStepNumClass : filterStepNumInactiveClass} aria-hidden="true">2</span>
            <div className={filterStepBodyClass}>
              <div className={filterGroupClass}>
                <label className={filterLabelClass} htmlFor="spc-plant">Plant</label>
                <select
                  id="spc-plant"
                  className={selectClass}
                  value={state.selectedPlant?.plant_id ?? ''}
                  onChange={handlePlantChange}
                  disabled={!scopeReady || plantsLoading}
                  aria-describedby="spc-plant-help"
                >
                  <option value="">
                    {!scopeReady
                      ? '— Validate material first —'
                      : plantsLoading
                        ? 'Loading…'
                        : plants.length > 1
                          ? '— All plants —'
                          : plants.length === 1
                            ? '— Select plant —'
                            : 'No plant data'}
                  </option>
                  {plants.map(plant => (
                    <option key={plant.plant_id} value={plant.plant_id}>
                      {plant.plant_name || plant.plant_id}
                    </option>
                  ))}
                </select>
                <span id="spc-plant-help" className={fieldHelpClass}>
                  {scopeReady && plants.length === 0 && !plantsLoading
                    ? 'No plant data found for this material — the scorecard and charts will be empty.'
                    : 'Leave broad for portfolio review; narrow to a specific plant for local diagnosis.'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className={filterCardClass}>
          <div className={filterStepClass}>
            <span className={scopeReady ? filterStepNumClass : filterStepNumInactiveClass} aria-hidden="true">3</span>
            <div className={filterStepBodyClass}>
              <div className={filterGroupClass}>
                <label className={filterLabelClass} htmlFor="spc-mic">Characteristic (MIC)</label>
                <select
                  id="spc-mic"
                  className={selectClass}
                  value={selectedMicValue}
                  onChange={handleMICChange}
                  disabled={!scopeReady || charsLoading}
                  aria-describedby="spc-mic-help"
                >
                  <option value="">
                    {!scopeReady
                      ? '— Validate material first —'
                      : charsLoading
                        ? 'Loading…'
                        : allCharacteristics.length === 0
                          ? 'No characteristics found'
                          : '— Select a characteristic —'}
                  </option>
                  {allCharacteristics.map(characteristic => (
                    <option
                      key={`${characteristic.mic_id}|${characteristic.mic_name}`}
                      value={serializeMicKey(characteristic)}
                      title={characteristic.inspection_method || undefined}
                    >
                      {characteristic.chart_type === 'p_chart' ? '[Attribute] ' : ''}
                      {characteristic.mic_name || characteristic.mic_id}
                      {characteristic.batch_count ? ` (${characteristic.batch_count} batches)` : ''}
                    </option>
                  ))}
                </select>
                <span id="spc-mic-help" className={fieldHelpClass}>
                  {scopeReady && allCharacteristics.length === 0 && !charsLoading
                    ? 'No characteristics found for this material and plant combination — try a different plant.'
                    : state.selectedMIC?.inspection_method
                      ? `Method: ${state.selectedMIC.inspection_method}`
                      : 'Select a characteristic to load control chart and capability data.'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {state.selectedMaterial && (
          <div className={filterCardClass}>
            <div className={filterStepClass}>
              <span className={filterStepNumClass} aria-hidden="true">4</span>
              <div className={filterStepBodyClass}>
                <div className={filterGroupClass}>
                  <label className={filterLabelClass} htmlFor="spc-stratify-by">Stratify By</label>
                  <select
                    id="spc-stratify-by"
                    className={selectClass}
                    value={state.stratifyBy ?? ''}
                    onChange={handleStratifyChange}
                    aria-describedby="spc-stratify-help"
                  >
                    <option value="">— None —</option>
                    {stratifyOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <span id="spc-stratify-help" className={fieldHelpClass}>
                    Splits the chart into separate series to expose hidden between-group variation.
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Step 5: Date window + posture summary ────────────────── */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto]">
        <div className={filterCardClass}>
          <div className={filterStepClass}>
            <span className={scopeReady ? filterStepNumClass : filterStepNumInactiveClass} aria-hidden="true">
              {state.selectedMaterial ? '5' : '2'}
            </span>
            <div className={filterStepBodyClass}>
              <div className={filterGroupClass}>
                <span className={filterLabelClass}>Date window</span>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className={filterGroupClass}>
                    <label className={filterLabelClass} htmlFor="spc-date-from">From</label>
                    <input
                      id="spc-date-from"
                      type="date"
                      className={dateInputClass}
                      value={state.dateFrom}
                      onChange={event => dispatch({ type: 'SET_DATE_FROM', payload: event.target.value })}
                      aria-describedby="spc-date-help"
                    />
                  </div>
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
                <span id="spc-date-help" className={fieldHelpClass}>
                  {!timeReady
                    ? `Default: last 12 months (${defaults.from} → ${defaults.to}). Narrow the window to isolate a specific investigation period.`
                    : 'Custom date window active — capability and rule calculations apply to this period only.'}
                </span>
              </div>
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
