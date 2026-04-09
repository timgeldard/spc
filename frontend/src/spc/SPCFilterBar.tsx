import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ChangeEvent } from 'react'
import {
  Button,
  DatePicker,
  DatePickerInput,
  Select,
  SelectItem,
  Stack,
  Tag,
  TextInput,
  Tile,
} from '@carbon/react'
// Verify icon names against your installed @carbon/icons-react version
import { Edit, Filter } from '@carbon/icons-react'
import { useSPC } from './SPCContext'
import { useValidateMaterial } from './hooks/useMaterials'
import { usePlants } from './hooks/usePlants'
import { useCharacteristics } from './hooks/useCharacteristics'
import { getRecentMaterials, addRecentMaterial } from './hooks/useRecentMaterials'
import type { MaterialRef, MicRef, PlantRef, StratifyByKey } from './types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function serializeMicKey(mic: Pick<MicRef, 'mic_id' | 'mic_name'> | null | undefined): string {
  if (!mic) return ''
  return JSON.stringify({ mic_id: mic.mic_id, mic_name: mic.mic_name ?? null })
}

/** YYYY-MM-DD in local time — avoids toISOString UTC shift in negative-offset timezones */
function toLocalDateString(d: Date): string {
  const y   = d.getFullYear()
  const m   = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Default date range: last 12 months from today */
function defaultDateRange(): { from: string; to: string } {
  const to   = new Date()
  const from = new Date(to)
  from.setFullYear(from.getFullYear() - 1)
  return { from: toLocalDateString(from), to: toLocalDateString(to) }
}

// ── Date presets ──────────────────────────────────────────────────────────────

type DatePreset = { label: string; days?: number; getRange?: () => { from: string; to: string } }

const DATE_PRESETS: DatePreset[] = [
  { label: '30d', days: 30  },
  { label: '90d', days: 90  },
  { label: '6m',  days: 183 },
  { label: '1y',  days: 365 },
  {
    label: 'YTD',
    getRange: () => {
      const now = new Date()
      return { from: toLocalDateString(new Date(now.getFullYear(), 0, 1)), to: toLocalDateString(now) }
    },
  },
]

function resolvePresetRange(preset: DatePreset): { from: string; to: string } {
  if (preset.getRange) return preset.getRange()
  const to   = new Date()
  const from = new Date(to)
  from.setDate(from.getDate() - preset.days!)
  return { from: toLocalDateString(from), to: toLocalDateString(to) }
}

// ── Chart type label helper ───────────────────────────────────────────────────

function chartTypeLabel(chartType: string | null | undefined): string {
  if (chartType === 'xbar_r')  return 'X̄-R chart'
  if (chartType === 'p_chart') return 'Attribute chart'
  return 'I-MR chart'
}

function chartTypeTagType(chartType: string | null | undefined): 'blue' | 'warm-gray' {
  return chartType === 'p_chart' ? 'warm-gray' : 'blue'
}

// ── Stratify options ──────────────────────────────────────────────────────────

const STRATIFY_OPTIONS: Array<{ value: StratifyByKey; label: string }> = [
  { value: 'plant_id',          label: 'Plant'          },
  { value: 'inspection_lot_id', label: 'Inspection Lot' },
  { value: 'operation_id',      label: 'Operation'      },
]

// ── Props ─────────────────────────────────────────────────────────────────────

interface SPCFilterBarProps {
  embedded?: boolean
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SPCFilterBar({ embedded = false }: SPCFilterBarProps) {
  const { state, dispatch } = useSPC()
  const { validateMaterial, clearError, validating, error: validateError } = useValidateMaterial()
  const { plants, loading: plantsLoading }                                 = usePlants(state.selectedMaterial?.material_id)
  const { characteristics, attrCharacteristics, loading: charsLoading }   = useCharacteristics(
    state.selectedMaterial?.material_id,
    state.selectedPlant?.plant_id,
  )

  const [collapsed,   setCollapsed]   = useState(false)
  const [inputValue,  setInputValue]  = useState('')
  const [notFound,    setNotFound]    = useState(false)
  const [recents]                     = useState<MaterialRef[]>(() => getRecentMaterials())
  const prevMICRef                    = useRef<string | null>(null)
  const defaults                      = useMemo(() => defaultDateRange(), [])

  const allCharacteristics = useMemo(
    () =>
      [...characteristics, ...attrCharacteristics].sort((a, b) =>
        (a.mic_name || '').localeCompare(b.mic_name || ''),
      ),
    [characteristics, attrCharacteristics],
  )

  const selectedMicValue = useMemo(() => serializeMicKey(state.selectedMIC), [state.selectedMIC])

  // Auto-clear plant when it's no longer valid for the selected material
  useEffect(() => {
    if (plantsLoading || !state.selectedPlant) return
    const stillValid = plants.some(p => p.plant_id === state.selectedPlant?.plant_id)
    if (!stillValid) dispatch({ type: 'SET_PLANT', payload: null })
  }, [dispatch, plants, plantsLoading, state.selectedPlant])

  // Auto-select plant when exactly one is available
  useEffect(() => {
    if (plantsLoading || state.selectedPlant || plants.length !== 1) return
    dispatch({ type: 'SET_PLANT', payload: plants[0] as PlantRef })
  }, [dispatch, plants, plantsLoading, state.selectedPlant])

  // Auto-clear MIC when it's no longer valid for the current material / plant
  useEffect(() => {
    if (charsLoading || !state.selectedMIC) return
    const match = allCharacteristics.find(c => c.mic_id === state.selectedMIC?.mic_id)
    if (match) {
      if (match.mic_name !== state.selectedMIC?.mic_name) dispatch({ type: 'SET_MIC', payload: match })
    } else {
      dispatch({ type: 'SET_MIC', payload: null })
    }
  }, [allCharacteristics, charsLoading, dispatch, state.selectedMIC])

  // Auto-collapse when a MIC is freshly selected
  useEffect(() => {
    const micId = state.selectedMIC?.mic_id ?? null
    if (micId && micId !== prevMICRef.current) setCollapsed(true)
    prevMICRef.current = micId
  }, [state.selectedMIC?.mic_id])

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleValidate = async () => {
    const trimmed = inputValue.trim()
    if (!trimmed) return
    setNotFound(false)
    const result = await validateMaterial(trimmed)
    if (result?.valid) {
      const material: MaterialRef = {
        material_id:   result.material_id   ?? trimmed,
        material_name: result.material_name ?? null,
      }
      addRecentMaterial(material)
      dispatch({ type: 'SET_MATERIAL', payload: material })
    } else if (result && !result.valid) {
      setNotFound(true)
    }
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') void handleValidate()
  }

  const handlePlantChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const plant = plants.find(p => p.plant_id === event.target.value) ?? null
    dispatch({ type: 'SET_PLANT', payload: plant as PlantRef | null })
  }

  const handleMICChange = (event: ChangeEvent<HTMLSelectElement>) => {
    if (!event.target.value) { dispatch({ type: 'SET_MIC', payload: null }); return }
    const mic = allCharacteristics.find(c => serializeMicKey(c) === event.target.value) ?? null
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

  // ── Derived state ──────────────────────────────────────────────────────────

  const hasMaterialError = Boolean(validateError || notFound)
  const scopeReady       = Boolean(state.selectedMaterial)
  const timeReady        = Boolean(state.dateFrom || state.dateTo)
  const canCollapse      = Boolean(state.selectedMaterial && state.selectedMIC)

  // ── Collapsed summary bar ──────────────────────────────────────────────────

  if (canCollapse && collapsed) {
    const micLabel   = state.selectedMIC?.mic_name  || state.selectedMIC?.mic_id  || ''
    const matLabel   = state.selectedMaterial?.material_name || state.selectedMaterial?.material_id || ''
    const plantPart  = state.selectedPlant ? ` · ${state.selectedPlant.plant_name || state.selectedPlant.plant_id}` : ''
    const datePart   = state.dateFrom && state.dateTo
      ? ` · ${state.dateFrom} → ${state.dateTo}`
      : state.dateFrom
        ? ` · From ${state.dateFrom}`
        : ''

    return (
      <div
        style={embedded ? undefined : {
          borderBottom: '1px solid var(--cds-border-subtle-01)',
          background:   'var(--cds-layer)',
          padding:      '0.5rem 1.5rem',
        }}
        aria-label="SPC analysis filters (collapsed)"
      >
        <Button
          kind="ghost"
          size="sm"
          renderIcon={Filter}
          onClick={() => setCollapsed(false)}
          aria-label="Edit analysis filters"
        >
          <span style={{ fontWeight: 600, color: 'var(--cds-text-primary)' }}>{matLabel}</span>
          <span style={{ margin: '0 0.375rem', color: 'var(--cds-border-subtle-02)' }}>·</span>
          <span>{micLabel}</span>
          {plantPart && <span style={{ color: 'var(--cds-text-secondary)' }}>{plantPart}</span>}
          {datePart  && <span style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', marginLeft: '0.25rem' }}>{datePart}</span>}
          <span
            style={{
              marginLeft:    '0.75rem',
              padding:       '0 0.5rem',
              border:        '1px solid var(--cds-border-subtle-01)',
              borderRadius:  '2px',
              fontSize:      '0.6875rem',
              color:         'var(--cds-text-secondary)',
            }}
          >
            Edit
          </span>
        </Button>
      </div>
    )
  }

  // ── Expanded layout ────────────────────────────────────────────────────────

  const outerStyle: React.CSSProperties = embedded
    ? { display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(22rem, 1fr))' }
    : {
        display:         'grid',
        gap:             '1rem',
        gridTemplateColumns: 'repeat(auto-fit, minmax(22rem, 1fr))',
        padding:         '1.25rem 1.5rem',
        borderBottom:    '1px solid var(--cds-border-subtle-01)',
        background:      'var(--cds-layer)',
      }

  const sectionLabelStyle: React.CSSProperties = {
    margin:        '0 0 0.5rem',
    fontSize:      '0.6875rem',
    fontWeight:    600,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color:         'var(--cds-text-secondary)',
  }

  return (
    <div style={outerStyle} aria-label="SPC analysis filters">

      {/* ── Left: filter steps (Material, Plant, MIC, Stratify) ─────────── */}
      <div
        style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))' }}
      >

        {/* Material */}
        <Tile style={{ padding: '1rem' }}>
          <p style={sectionLabelStyle}>Material</p>
          <Stack gap={3}>
            <TextInput
              id="spc-material"
              labelText="Material ID"
              placeholder="Enter material ID"
              value={inputValue}
              onChange={e => { setInputValue(e.target.value); setNotFound(false); clearError() }}
              onKeyDown={handleKeyDown}
              disabled={validating}
              invalid={hasMaterialError}
              invalidText={validateError || 'Material not found — check the ID and try again.'}
              helperText={
                state.selectedMaterial && !hasMaterialError
                  ? `Validated: ${state.selectedMaterial.material_name || state.selectedMaterial.material_id}`
                  : 'Press Enter or Validate to confirm.'
              }
            />
            <Button
              kind="primary"
              size="md"
              onClick={() => void handleValidate()}
              disabled={validating || !inputValue.trim()}
            >
              {validating ? 'Validating…' : 'Validate'}
            </Button>

            {/* Recent material chips */}
            {!state.selectedMaterial && recents.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                {recents.map(material => (
                  <button
                    key={material.material_id}
                    onClick={() => selectRecent(material)}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                    aria-label={`Use recent material ${material.material_name || material.material_id}`}
                  >
                    <Tag type="gray" size="sm">
                      {material.material_name || material.material_id}
                    </Tag>
                  </button>
                ))}
              </div>
            )}
          </Stack>
        </Tile>

        {/* Plant */}
        <Tile style={{ padding: '1rem' }}>
          <p style={sectionLabelStyle}>Plant</p>
          <Select
            id="spc-plant"
            labelText="Plant"
            value={state.selectedPlant?.plant_id ?? ''}
            onChange={handlePlantChange}
            disabled={!scopeReady || plantsLoading}
            helperText={
              scopeReady && plants.length === 0 && !plantsLoading
                ? 'No plant data found for this material — scorecard and charts will be empty.'
                : 'Leave broad for portfolio review; narrow to a specific plant for local diagnosis.'
            }
          >
            <SelectItem
              value=""
              text={
                !scopeReady      ? '— Validate material first —'
                : plantsLoading  ? 'Loading…'
                : plants.length > 1 ? '— All plants —'
                : plants.length === 1 ? '— Select plant —'
                : 'No plant data'
              }
            />
            {plants.map(plant => (
              <SelectItem
                key={plant.plant_id}
                value={plant.plant_id}
                text={plant.plant_name || plant.plant_id}
              />
            ))}
          </Select>
        </Tile>

        {/* Characteristic (MIC) */}
        <Tile style={{ padding: '1rem' }}>
          <p style={sectionLabelStyle}>Characteristic</p>
          <Select
            id="spc-mic"
            labelText="Characteristic (MIC)"
            value={selectedMicValue}
            onChange={handleMICChange}
            disabled={!scopeReady || charsLoading}
            helperText={
              scopeReady && allCharacteristics.length === 0 && !charsLoading
                ? 'No characteristics found — try a different plant.'
                : state.selectedMIC?.inspection_method
                  ? `Method: ${state.selectedMIC.inspection_method}`
                  : 'Select a characteristic to load control chart and capability data.'
            }
          >
            <SelectItem
              value=""
              text={
                !scopeReady         ? '— Validate material first —'
                : charsLoading      ? 'Loading…'
                : allCharacteristics.length === 0 ? 'No characteristics found'
                : '— Select a characteristic —'
              }
            />
            {allCharacteristics.map(c => (
              <SelectItem
                key={`${c.mic_id}|${c.mic_name}`}
                value={serializeMicKey(c)}
                text={`${c.chart_type === 'p_chart' ? '[Attribute] ' : ''}${c.mic_name || c.mic_id}${c.batch_count ? ` (${c.batch_count} batches)` : ''}`}
              />
            ))}
          </Select>
        </Tile>

        {/* Stratify By (conditional) */}
        {state.selectedMaterial && (
          <Tile style={{ padding: '1rem' }}>
            <p style={sectionLabelStyle}>Stratification</p>
            <Select
              id="spc-stratify-by"
              labelText="Stratify By"
              value={state.stratifyBy ?? ''}
              onChange={handleStratifyChange}
              helperText="Splits the chart into separate series to expose hidden between-group variation."
            >
              <SelectItem value="" text="— None —" />
              {STRATIFY_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value} text={opt.label} />
              ))}
            </Select>
          </Tile>
        )}
      </div>

      {/* ── Right: Date window + Analysis posture ───────────────────────── */}
      <Stack gap={3}>

        {/* Date window */}
        <Tile style={{ padding: '1rem' }}>
          <p style={sectionLabelStyle}>Date window</p>
          <Stack gap={4}>

            {/* Preset quick-select buttons */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
              {DATE_PRESETS.map(preset => {
                const range    = resolvePresetRange(preset)
                const isActive = state.dateFrom === range.from && state.dateTo === range.to
                return (
                  <Button
                    key={preset.label}
                    kind={isActive ? 'primary' : 'ghost'}
                    size="sm"
                    onClick={() => {
                      dispatch({ type: 'SET_DATE_FROM', payload: range.from })
                      dispatch({ type: 'SET_DATE_TO',   payload: range.to   })
                    }}
                    aria-pressed={isActive}
                  >
                    {preset.label}
                  </Button>
                )
              })}
            </div>

            {/* From / To date pickers */}
            <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: '1fr 1fr' }}>
              <DatePicker
                datePickerType="single"
                value={state.dateFrom || undefined}
                dateFormat="Y-m-d"
                onChange={(dates: Date[]) =>
                  dispatch({ type: 'SET_DATE_FROM', payload: dates[0] ? toLocalDateString(dates[0]) : '' })
                }
              >
                <DatePickerInput
                  id="spc-date-from"
                  labelText="From"
                  placeholder="YYYY-MM-DD"
                  size="md"
                />
              </DatePicker>

              <DatePicker
                datePickerType="single"
                value={state.dateTo || undefined}
                dateFormat="Y-m-d"
                onChange={(dates: Date[]) =>
                  dispatch({ type: 'SET_DATE_TO', payload: dates[0] ? toLocalDateString(dates[0]) : '' })
                }
              >
                <DatePickerInput
                  id="spc-date-to"
                  labelText="To"
                  placeholder="YYYY-MM-DD"
                  size="md"
                />
              </DatePicker>
            </div>

            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
              {!timeReady
                ? `Default: last 12 months (${defaults.from} to ${defaults.to}). Narrow the window to isolate a specific investigation period.`
                : 'Custom date window active — capability and rule calculations apply to this period only.'}
            </p>
          </Stack>
        </Tile>

        {/* Analysis posture (conditional on material selection) */}
        {state.selectedMaterial && (
          <Tile style={{ padding: '1rem' }}>
            <p style={sectionLabelStyle}>Analysis posture</p>
            <p
              style={{ margin: '0 0 0.75rem', fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}
              aria-live="polite"
            >
              Choose the scope first, then interpret capability and rule signals in the chart workspace.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
              {state.selectedMIC && (
                <Tag type={chartTypeTagType(state.selectedMIC.chart_type)} size="md">
                  {chartTypeLabel(state.selectedMIC.chart_type)}
                </Tag>
              )}
              {state.stratifyBy && (
                <Tag type="teal" size="md">
                  Stratified by{' '}
                  {STRATIFY_OPTIONS.find(o => o.value === state.stratifyBy)?.label ?? state.stratifyBy}
                </Tag>
              )}
              {!state.selectedMIC && !state.stratifyBy && (
                <span style={{ fontSize: '0.75rem', color: 'var(--cds-text-placeholder)' }}>
                  Select a characteristic above to see posture.
                </span>
              )}
            </div>
          </Tile>
        )}

        {/* Expand/collapse control — only shown when collapsible */}
        {canCollapse && (
          <Button
            kind="ghost"
            size="sm"
            renderIcon={Edit}
            onClick={() => setCollapsed(true)}
            style={{ alignSelf: 'flex-start' }}
          >
            Collapse filters
          </Button>
        )}
      </Stack>

    </div>
  )
}
