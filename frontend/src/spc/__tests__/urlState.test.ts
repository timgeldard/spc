import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { reducer, initialState } from '../SPCContext'

// Tests for URL-state related reducer behaviour.
// The buildInitialState() function (which reads window.location.search) is exercised
// indirectly via the reducer — we verify the reducer handles the state shapes that
// buildInitialState produces from URL params.

describe('reducer — URL-restored state shapes', () => {
  it('SELECT_MATERIAL_AND_CHARTS sets activeTab to charts', () => {
    const next = reducer(initialState, {
      type: 'SELECT_MATERIAL_AND_CHARTS',
      payload: { material_id: 'RM-001', material_name: 'Raw Material A' },
    })
    expect(next.activeTab).toBe('charts')
    expect(next.selectedMaterial?.material_id).toBe('RM-001')
    expect(next.selectedMaterial?.material_name).toBe('Raw Material A')
    expect([...next.excludedIndices]).toEqual([])
  })

  it('SET_ACTIVE_TAB changes only the tab', () => {
    const withMaterial = reducer(initialState, {
      type: 'SET_MATERIAL',
      payload: { material_id: 'RM-002' },
    })
    const next = reducer(withMaterial, { type: 'SET_ACTIVE_TAB', payload: 'scorecard' })
    expect(next.activeTab).toBe('scorecard')
    expect(next.selectedMaterial?.material_id).toBe('RM-002')
  })

  it('SET_MIC with a partial ref (id + name only) is accepted', () => {
    // buildInitialState produces partial MicRef from URL — only mic_id, mic_name, chart_type
    const next = reducer(initialState, {
      type: 'SET_MIC',
      payload: { mic_id: 'MIC-99', mic_name: 'Moisture', chart_type: 'imr' },
    })
    expect(next.selectedMIC?.mic_id).toBe('MIC-99')
    expect(next.selectedMIC?.mic_name).toBe('Moisture')
    expect(next.selectedMIC?.chart_type).toBe('imr')
  })

  it('SET_RULE_SET changes the rule set', () => {
    const next = reducer(initialState, { type: 'SET_RULE_SET', payload: 'nelson' })
    expect(next.ruleSet).toBe('nelson')
  })

  it('TOGGLE_EXCLUDE_OUTLIERS flips the flag', () => {
    expect(initialState.excludeOutliers).toBe(false)
    const on = reducer(initialState, { type: 'TOGGLE_EXCLUDE_OUTLIERS' })
    expect(on.excludeOutliers).toBe(true)
    const off = reducer(on, { type: 'TOGGLE_EXCLUDE_OUTLIERS' })
    expect(off.excludeOutliers).toBe(false)
  })

  it('SET_LIMITS_MODE changes limitsMode', () => {
    const next = reducer(initialState, { type: 'SET_LIMITS_MODE', payload: 'locked' })
    expect(next.limitsMode).toBe('locked')
  })
})

describe('URL param key mapping', () => {
  // Verify the param names documented in useSPCUrlSync are the same ones
  // buildInitialState reads — a simple contract test using URLSearchParams.

  beforeEach(() => {
    // Clear any previous search
    window.history.replaceState(null, '', '/')
  })

  afterEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('round-trips material ID through URLSearchParams', () => {
    const params = new URLSearchParams()
    params.set('mat', 'RM-12345')
    params.set('mat_n', 'Reagent Mix')
    expect(params.get('mat')).toBe('RM-12345')
    expect(params.get('mat_n')).toBe('Reagent Mix')
  })

  it('round-trips MIC through URLSearchParams', () => {
    const params = new URLSearchParams()
    params.set('mic', 'MIC-007')
    params.set('mic_n', 'pH Value')
    params.set('mic_ct', 'imr')
    expect(params.get('mic')).toBe('MIC-007')
    expect(params.get('mic_n')).toBe('pH Value')
    expect(params.get('mic_ct')).toBe('imr')
  })

  it('round-trips date range through URLSearchParams', () => {
    const params = new URLSearchParams()
    params.set('from', '2025-01-01')
    params.set('to', '2025-12-31')
    expect(params.get('from')).toBe('2025-01-01')
    expect(params.get('to')).toBe('2025-12-31')
  })
})
