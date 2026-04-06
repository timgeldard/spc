import { createContext, useContext, useReducer } from 'react'
import type { SPCAction, SPCContextValue, SPCProviderProps, SPCState } from './types'

const SPCContext = createContext<SPCContextValue | null>(null)

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
  stratifyAll: false,
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
    case 'TOGGLE_STRATIFY_ALL':
      return {
        ...state,
        stratifyAll: !state.stratifyAll,
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
  const [state, dispatch] = useReducer(reducer, initialState)
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

