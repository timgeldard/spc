import { Suspense, lazy, type ComponentType, type LazyExoticComponent } from 'react'
import {
  GitBranch, Activity, BarChart2, Layers, Ruler, TrendingUp, type LucideIcon,
} from 'lucide-react'
import { SPCProvider, useSPC } from './SPCContext'
import SPCFilterBar from './SPCFilterBar'
import type { SPCState } from './types'

type TabId = SPCState['activeTab']

interface TabDefinition {
  id: TabId
  label: string
  Icon: LucideIcon
}

const ProcessFlowView = lazy(() => import('./flow/ProcessFlowView'))
const ControlChartsView = lazy(() => import('./charts/ControlChartsView'))
const ScorecardView = lazy(() => import('./scorecard/ScorecardView'))
const CompareView = lazy(() => import('./compare/CompareView'))
const MSAView = lazy(() => import('./msa/MSAView'))
const CorrelationView = lazy(() => import('./correlation/CorrelationView'))

const TABS: TabDefinition[] = [
  { id: 'flow', label: 'Process Flow', Icon: GitBranch },
  { id: 'charts', label: 'Control Charts', Icon: Activity },
  { id: 'scorecard', label: 'Scorecard', Icon: BarChart2 },
  { id: 'compare', label: 'Compare', Icon: Layers },
  { id: 'msa', label: 'MSA', Icon: Ruler },
  { id: 'correlation', label: 'Correlation', Icon: TrendingUp },
]

const TAB_COMPONENTS: Record<TabId, LazyExoticComponent<ComponentType>> = {
  flow: ProcessFlowView,
  charts: ControlChartsView,
  scorecard: ScorecardView,
  compare: CompareView,
  msa: MSAView,
  correlation: CorrelationView,
}

function TabLoadingState() {
  return (
    <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-slate-200 bg-white/70 px-6 py-12 text-sm text-slate-500 shadow-sm">
      Loading analysis view…
    </div>
  )
}

function Sidebar() {
  const { state, dispatch } = useSPC()
  return (
    <aside style={{
      width: 200,
      flexShrink: 0,
      borderRight: '1px solid var(--c-border)',
      background: 'var(--c-surface)',
      display: 'flex',
      flexDirection: 'column',
      paddingTop: 8,
      paddingBottom: 8,
      gap: 2,
    }}>
      {TABS.map(({ id, label, Icon }) => {
        const active = state.activeTab === id
        return (
          <button
            key={id}
            onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', payload: id })}
            title={label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 14px',
              border: 'none',
              background: active ? 'rgba(27,58,75,0.08)' : 'transparent',
              borderLeft: `3px solid ${active ? 'var(--c-brand)' : 'transparent'}`,
              color: active ? 'var(--c-brand)' : 'var(--c-text-muted)',
              fontWeight: active ? 600 : 400,
              fontSize: '0.8125rem',
              cursor: 'pointer',
              textAlign: 'left',
              borderRadius: '0 6px 6px 0',
              marginRight: 8,
              transition: 'background 0.12s, color 0.12s',
            }}
          >
            <Icon size={16} strokeWidth={active ? 2.5 : 1.75} />
            {label}
          </button>
        )
      })}
    </aside>
  )
}

function SPCContent() {
  const { state } = useSPC()
  const ActiveView = TAB_COMPONENTS[state.activeTab]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)' }}>
      <SPCFilterBar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar />
        <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem 2rem' }}>
          <Suspense fallback={<TabLoadingState />}>
            <ActiveView />
          </Suspense>
        </div>
      </div>
    </div>
  )
}

export default function SPCPage() {
  return (
    <SPCProvider>
      <SPCContent />
    </SPCProvider>
  )
}
