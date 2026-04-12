import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useSyncExternalStore,
  type Dispatch,
} from 'react'
import type { SPCAction, SPCContextValue, SPCProviderProps, SPCState } from './types'

interface SPCStore {
  getState: () => SPCState
  dispatch: Dispatch<SPCAction>
  subscribe: (listener: () => void) => () => void
}

const SPCContext = createContext<SPCStore | null>(null)

// ── Preference keys (localStorage) ───────────────────────────────────────────
const PREF_RULE_SET = 'spc_rule_set'
const PREF_EXCLUDE_OUTLIERS = 'spc_exclude_outliers'
const PREF_LIMITS_MODE = 'spc_limits_mode'
const PREF_ROLE_MODE = 'spc_role_mode'
const PREF_SAVED_VIEWS = 'spc_saved_views'

// ── URL param keys ────────────────────────────────────────────────────────────
const VALID_TABS = ['overview', 'flow', 'charts', 'scorecard', 'compare', 'msa', 'correlation', 'genie'] as const

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
    activeTab: 'overview',
    globalSearch: '',
    isLoading: false,
    savedViews: [],
    roleMode: 'engineer',
    kpis: { processHealth: 0, avgCpk: 0, oocPoints: 0, affectedBatches: 0 },
    recentViolations: [],
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
  const roleMode = getPref(PREF_ROLE_MODE)
  if (roleMode === 'operator' || roleMode === 'engineer') state.roleMode = roleMode
  const savedViews = getPref(PREF_SAVED_VIEWS)
  if (savedViews) {
    try {
      const parsed = JSON.parse(savedViews)
      if (Array.isArray(parsed)) state.savedViews = parsed
    } catch {
      state.savedViews = []
    }
  }

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
        operation_id: params.get('op_id') ?? null,
        mic_name: params.get('mic_n') ?? null,
        chart_type: params.get('mic_ct') ?? null,
      }
    }

    const from = params.get('from')
    if (from) state.dateFrom = from
    const to = params.get('to')
    if (to) state.dateTo = to
  } catch { /* no window.location (e.g., test environment) */ }

  if (state.roleMode === 'operator' && ['compare', 'msa', 'correlation', 'genie'].includes(state.activeTab)) {
    state.activeTab = 'overview'
  }

  return state
}

// Keep exported `initialState` for tests that reference it directly.
export const initialState: SPCState = {
  selectedMaterial: null,
  selectedPlant: null,
  selectedMIC: null,
  dateFrom: '',
  dateTo: '',
  activeTab: 'overview',
  globalSearch: '',
  isLoading: false,
  savedViews: [],
  roleMode: 'engineer',
  kpis: { processHealth: 0, avgCpk: 0, oocPoints: 0, affectedBatches: 0 },
  recentViolations: [],
  chartTypeOverride: null,
  excludedIndices: new Set<number>(),
  ruleSet: 'weco',
  excludeOutliers: false,
  limitsMode: 'live',
  stratifyBy: null,
  exclusionAudit: null,
  exclusionDialog: null,
}

export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false

  const aKeys = Object.keys(a) as Array<keyof T>
  const bKeys = Object.keys(b) as Array<keyof T>
  if (aKeys.length !== bKeys.length) return false

  return aKeys.every(key => Object.is(a[key], b[key]))
}

export function reducer(state: SPCState, action: SPCAction): SPCState {
  switch (action.type) {
    case 'SET_MATERIAL':
      return {
        ...state,
        selectedMaterial: action.payload,
        selectedPlant: null,
        selectedMIC: null,
        stratifyBy: null,
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
    case 'SET_GLOBAL_SEARCH':
      return { ...state, globalSearch: action.payload }
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload }
    case 'SET_ROLE_MODE': {
      const nextTab = action.payload === 'operator' && ['compare', 'msa', 'correlation', 'genie'].includes(state.activeTab)
        ? 'overview'
        : state.activeTab
      return { ...state, roleMode: action.payload, activeTab: nextTab }
    }
    case 'SET_KPIS':
      return { ...state, kpis: action.payload }
    case 'SET_RECENT_VIOLATIONS':
      return { ...state, recentViolations: action.payload }
    case 'ADD_SAVED_VIEW':
      return {
        ...state,
        savedViews: [action.payload, ...state.savedViews.filter(view => view.id !== action.payload.id)].slice(0, 8),
      }
    case 'APPLY_SAVED_VIEW': {
      const nextTab = state.roleMode === 'operator' && ['compare', 'msa', 'correlation', 'genie'].includes(action.payload.activeTab)
        ? 'overview'
        : action.payload.activeTab
      return {
        ...state,
        selectedMaterial: action.payload.selectedMaterial,
        selectedPlant: action.payload.selectedPlant,
        selectedMIC: action.payload.selectedMIC,
        dateFrom: action.payload.dateFrom,
        dateTo: action.payload.dateTo,
        activeTab: nextTab,
        globalSearch: action.payload.globalSearch,
        stratifyBy: action.payload.stratifyBy,
        excludedIndices: new Set<number>(),
        exclusionAudit: null,
        exclusionDialog: null,
      }
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
      return {
        ...state,
        ruleSet: action.payload,
        excludedIndices: new Set<number>(),
        exclusionAudit: null,
        exclusionDialog: null,
      }
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
        selectedPlant: null,
        selectedMIC: null,
        stratifyBy: null,
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
  const stateRef = useRef(state)
  const dispatchRef = useRef(dispatch)
  const listenersRef = useRef(new Set<() => void>())
  const storeRef = useRef<SPCStore | null>(null)

  stateRef.current = state
  dispatchRef.current = dispatch

  if (!storeRef.current) {
    storeRef.current = {
      getState: () => stateRef.current,
      dispatch: action => dispatchRef.current(action),
      subscribe: listener => {
        listenersRef.current.add(listener)
        return () => {
          listenersRef.current.delete(listener)
        }
      },
    }
  }

  useEffect(() => {
    try {
      localStorage.setItem(PREF_ROLE_MODE, state.roleMode)
      localStorage.setItem(PREF_SAVED_VIEWS, JSON.stringify(state.savedViews))
    } catch {
      // Ignore localStorage persistence errors in constrained environments.
    }
  }, [state.roleMode, state.savedViews])

  useLayoutEffect(() => {
    listenersRef.current.forEach(listener => listener())
  }, [state])

  return (
    <SPCContext.Provider value={storeRef.current}>
      {children}
    </SPCContext.Provider>
  )
}

function useSPCStore(): SPCStore {
  const store = useContext(SPCContext)
  if (!store) throw new Error('SPC hooks must be used within SPCProvider')
  return store
}

export function useSPCDispatch(): Dispatch<SPCAction> {
  return useSPCStore().dispatch
}

export function useSPCSelector<T>(
  selector: (state: SPCState) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const store = useSPCStore()
  const selectorRef = useRef(selector)
  const equalityRef = useRef(isEqual)
  const snapshotRef = useRef<T | null>(null)
  const hasSnapshotRef = useRef(false)

  selectorRef.current = selector
  equalityRef.current = isEqual

  const getSnapshot = () => {
    const nextSnapshot = selectorRef.current(store.getState())
    if (hasSnapshotRef.current && equalityRef.current(snapshotRef.current as T, nextSnapshot)) {
      return snapshotRef.current as T
    }
    snapshotRef.current = nextSnapshot
    hasSnapshotRef.current = true
    return nextSnapshot
  }

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot)
}

export function useSPC(): SPCContextValue {
  const state = useSPCSelector(current => current)
  const dispatch = useSPCDispatch()
  return useMemo(() => ({ state, dispatch }), [state, dispatch])
}

// ── Preference key constants (used by useSPCPreferences hook) ────────────────
export { PREF_RULE_SET, PREF_EXCLUDE_OUTLIERS, PREF_LIMITS_MODE, PREF_ROLE_MODE, PREF_SAVED_VIEWS }
