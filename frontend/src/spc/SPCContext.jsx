import { createContext, useContext, useReducer } from 'react'

const SPCContext = createContext(null)

const initialState = {
  selectedMaterial: null,   // { material_id, material_name }
  selectedPlant: null,      // { plant_id, plant_name } | null = all plants
  selectedMIC: null,        // { mic_id, mic_name, chart_type, avg_samples_per_batch, ... }
  dateFrom: '',
  dateTo: '',
  activeTab: 'flow',        // 'flow' | 'charts' | 'scorecard'
  chartTypeOverride: null,  // 'imr' | 'xbar_r' | null (null = auto)
  excludedIndices: new Set(), // indices excluded from control limit calculation
  ruleSet: 'weco',          // 'weco' | 'nelson'
  excludeOutliers: false,   // exclude ATTRIBUT='*' outliers from limit calc
  limitsMode: 'live',       // 'live' | 'locked'
  stratifyAll: false,       // show all plants as separate series
  exclusionAudit: null,     // latest persisted exclusion snapshot for active chart scope
  exclusionDialog: null,    // pending exclusion action requiring justification
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_MATERIAL':
      return {
        ...state,
        selectedMaterial: action.payload,
        selectedPlant: null,
        selectedMIC: null,
        excludedIndices: new Set(),
        chartTypeOverride: null,
        exclusionAudit: null,
        exclusionDialog: null,
      }
    case 'SET_PLANT':
      return {
        ...state,
        selectedPlant: action.payload,
        selectedMIC: null,
        excludedIndices: new Set(),
        chartTypeOverride: null,
        exclusionAudit: null,
        exclusionDialog: null,
      }
    case 'SET_MIC':
      return {
        ...state,
        selectedMIC: action.payload,
        excludedIndices: new Set(),
        chartTypeOverride: null,
        exclusionAudit: null,
        exclusionDialog: null,
      }
    case 'SET_DATE_FROM':
      return { ...state, dateFrom: action.payload, exclusionDialog: null }
    case 'SET_DATE_TO':
      return { ...state, dateTo: action.payload, exclusionDialog: null }
    case 'SET_ACTIVE_TAB':
      return { ...state, activeTab: action.payload }
    case 'SET_CHART_TYPE_OVERRIDE':
      return { ...state, chartTypeOverride: action.payload, exclusionDialog: null }
    case 'TOGGLE_EXCLUDE_INDEX': {
      const next = new Set(state.excludedIndices)
      if (next.has(action.payload)) {
        next.delete(action.payload)
      } else {
        next.add(action.payload)
      }
      return { ...state, excludedIndices: next }
    }
    case 'CLEAR_EXCLUSIONS':
      return { ...state, excludedIndices: new Set() }
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
      return { ...state, excludedIndices: new Set(action.payload) }
    case 'SET_LIMITS_MODE':
      return { ...state, limitsMode: action.payload }
    case 'TOGGLE_STRATIFY_ALL':
      return { ...state, stratifyAll: !state.stratifyAll, exclusionDialog: null }
    case 'SELECT_MATERIAL_AND_CHARTS':
      return {
        ...state,
        selectedMaterial: action.payload,
        selectedPlant: null,
        selectedMIC: null,
        activeTab: 'charts',
        excludedIndices: new Set(),
        chartTypeOverride: null,
        exclusionAudit: null,
        exclusionDialog: null,
      }
    default:
      return state
  }
}

export function SPCProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  return (
    <SPCContext.Provider value={{ state, dispatch }}>
      {children}
    </SPCContext.Provider>
  )
}

export function useSPC() {
  const ctx = useContext(SPCContext)
  if (!ctx) throw new Error('useSPC must be used within SPCProvider')
  return ctx
}
