import { createContext, useContext, useReducer } from 'react'
import type { SPCAction, SPCContextValue, SPCProviderProps, SPCState } from './types'

const SPCContext = createContext<SPCContextValue | null>(null)

// ── Preference keys (localStorage) ───────────────────────────────────────────
const PREF_RULE_SET = 'spc_rule_set'
const PREF_EXCLUDE_OUTLIERS = 'spc_exclude_outliers'
const PREF_LIMITS_MODE = 'spc_limits_mode'

// ── URL param keys ────────────────────────────────────────────────────────────
const VALID_TABS = ['flow', 'charts', 'scorecard', 'compare', 'msa', 'correlation'] as const

function getPref(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

function localDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function defaultDateRange(): { from: string; to: string } {
  const to = new Date()
  const from = new Date(to)
  from.setFullYear(from.getFullYear() - 1)
  return { from: localDateString(from), to: localDateString(to) }
}

// ── State factory: merges hardcoded defaults → localStorage prefs → URL params
function buildInitialState(): SPCState {
  const { from: dateFrom, to: dateTo } = defaultDateRange()
  const state: SPCState = {
    selectedMaterial: null,
    selectedPlant: null,
    selectedMIC: null,
    dateFrom,
    dateTo,
    activeTab: 'flow',
    chartTypeOverride: null,
    excludedIndices: new Set<number>(),
    ruleSet: 'weco',
    excludeOutliers: false,
    limitsMode: 'live',
    stratifyBy: null,
    exclusionAudit: null,
    exclusionDialog: null,
  }

  // Apply persisted analysis preferences
  const ruleSet = getPref(PREF_RULE_SET)
  if (ruleSet === 'weco' || ruleSet === 'nelson') state.ruleSet = ruleSet
  const excludeOutliers = getPref(PREF_EXCLUDE_OUTLIERS)
  if (excludeOutliers !== null) state.excludeOutliers = excludeOutliers === 'true'
  const limitsMode = getPref(PREF_LIMITS_MODE)
  if (limitsMode === 'live' || limitsMode === 'locked') state.limitsMode = limitsMode

  // Apply URL-encoded analysis context
  try {
    const params = new URLSearchParams(window.location.search)

    const tab = params.get('tab')
    if (tab && (VALID_TABS as readonly string[]).includes(tab)) {
      state.activeTab = tab as SPCState['activeTab']
    }

    const matId = params.get('mat')
    if (matId) {
      state.selectedMaterial = {
        material_id: matId,
        material_name: params.get('mat_n') ?? null,
      }
    }

    const plantId = params.get('plant')
    if (plantId) {
      state.selectedPlant = {
        plant_id: plantId,
        plant_name: params.get('plant_n') ?? null,
      }
    }

    const micId = params.get('mic')
    if (micId) {
      state.selectedMIC = {
        mic_id: micId,
        mic_name: params.get('mic_n') ?? null,
        chart_type: params.get('mic_ct') ?? null,
      }
    }

    const from = params.get('from')
    if (from) state.dateFrom = from
    const to = params.get('to')
    if (to) state.dateTo = to
  } catch { /* no window.location (e.g., test environment) */ }

  return state
}

// Keep exported `initialState` for tests that reference it directly.
export const initialState: SPCState = {
  selectedMaterial: null,
  selectedPlant: null,
  selectedMIC: null,
  dateFrom: '',
  dateTo: '',
  activeTab: 'flow',
  chartTypeOverride: null,
  excludedIndices: new Set<number>(),
  ruleSet: 'weco',
  excludeOutliers: false,
  limitsMode: 'live',
  stratifyBy: null,
  exclusionAudit: null,
  exclusionDialog: null,
}

export function reducer(state: SPCState, action: SPCAction): SPCState {
  switch (action.type) {
    case 'SET_MATERIAL':
      return {
        ...state,
        selectedMaterial: action.payload,
        excludedIndices: new Set<number>(),
        chartTypeOverride: null,
        exclusionAudit: null,
        exclusionDialog: null,
      }
    case 'SET_PLANT':
      return {
        ...state,
        selectedPlant: action.payload,
        exclusionAudit: null,
        exclusionDialog: null,
      }
    case 'SET_MIC':
      return {
        ...state,
        selectedMIC: action.payload,
        excludedIndices: new Set<number>(),
        chartTypeOverride: null,
        exclusionAudit: null,
        exclusionDialog: null,
      }
    case 'SET_DATE_FROM':
      return {
        ...state,
        dateFrom: action.payload,
        excludedIndices: new Set<number>(),
        exclusionAudit: null,
        exclusionDialog: null,
      }
    case 'SET_DATE_TO':
      return {
        ...state,
        dateTo: action.payload,
        excludedIndices: new Set<number>(),
        exclusionAudit: null,
        exclusionDialog: null,
      }
    case 'SET_ACTIVE_TAB':
      return { ...state, activeTab: action.payload }
    case 'SET_CHART_TYPE_OVERRIDE':
      return {
        ...state,
        chartTypeOverride: action.payload,
        excludedIndices: new Set<number>(),
        exclusionAudit: null,
        exclusionDialog: null,
      }
    case 'TOGGLE_EXCLUDE_INDEX': {
      const next = new Set<number>(state.excludedIndices)
      if (next.has(action.payload)) next.delete(action.payload)
      else next.add(action.payload)
      return { ...state, excludedIndices: next }
    }
    case 'CLEAR_EXCLUSIONS':
      return { ...state, excludedIndices: new Set<number>() }
    case 'OPEN_EXCLUSION_DIALOG':
      return { ...state, exclusionDialog: action.payload }
    case 'CLOSE_EXCLUSION_DIALOG':
      return { ...state, exclusionDialog: null }
    case 'SET_EXCLUSION_AUDIT':
      return { ...state, exclusionAudit: action.payload }
    case 'CLEAR_EXCLUSION_AUDIT':
      return { ...state, exclusionAudit: null }
    case 'SET_RULE_SET':
      return { ...state, ruleSet: action.payload, exclusionDialog: null }
    case 'TOGGLE_EXCLUDE_OUTLIERS':
      return { ...state, excludeOutliers: !state.excludeOutliers }
    case 'SET_EXCLUSIONS':
      return { ...state, excludedIndices: new Set<number>(action.payload) }
    case 'SET_LIMITS_MODE':
      return { ...state, limitsMode: action.payload }
    case 'SET_STRATIFY_BY':
      return {
        ...state,
        stratifyBy: action.payload,
        excludedIndices: new Set<number>(),
        exclusionAudit: null,
        exclusionDialog: null,
      }
    case 'SELECT_MATERIAL_AND_CHARTS':
      return {
        ...state,
        selectedMaterial: action.payload,
        activeTab: 'charts',
        excludedIndices: new Set<number>(),
        chartTypeOverride: null,
        exclusionAudit: null,
        exclusionDialog: null,
      }
    default:
      return state
  }
}

export function SPCProvider({ children }: SPCProviderProps) {
  const [state, dispatch] = useReducer(reducer, null, buildInitialState)
  return (
    <SPCContext.Provider value={{ state, dispatch }}>
      {children}
    </SPCContext.Provider>
  )
}

export function useSPC(): SPCContextValue {
  const ctx = useContext(SPCContext)
  if (!ctx) throw new Error('useSPC must be used within SPCProvider')
  return ctx
}

// ── Preference key constants (used by useSPCPreferences hook) ────────────────
export { PREF_RULE_SET, PREF_EXCLUDE_OUTLIERS, PREF_LIMITS_MODE }
