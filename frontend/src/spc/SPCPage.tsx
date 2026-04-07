import { Suspense, lazy, useEffect, useState, type ComponentType, type LazyExoticComponent } from 'react'
import {
  GitBranch, Activity, BarChart2, Layers, Ruler, TrendingUp, type LucideIcon,
} from 'lucide-react'
import { SPCProvider, useSPC } from './SPCContext'
import SPCErrorBoundary from './SPCErrorBoundary'
import SPCFilterBar from './SPCFilterBar'
import SPCPageHeader from './SPCPageHeader'
import type { SPCState } from './types'
import {
  pageShellClass,
  shellSidebarClass,
  sidebarGroupLabelClass,
  sidebarItemActiveClass,
  sidebarItemClass,
  sidebarNavClass,
  workspaceClass,
  workspaceMainClass,
} from './uiClasses'

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
  const [tabTransitioning, setTabTransitioning] = useState(false)

  useEffect(() => {
    setTabTransitioning(true)
    const timer = window.setTimeout(() => setTabTransitioning(false), 220)
    return () => window.clearTimeout(timer)
  }, [state.activeTab])

  return (
    <aside className={shellSidebarClass}>
      <div className={sidebarGroupLabelClass}>Modules</div>
      <div className={sidebarNavClass}>
        {TABS.map(({ id, label, Icon }) => {
          const active = state.activeTab === id
          return (
            <button
              key={id}
              onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', payload: id })}
              title={label}
              className={`${sidebarItemClass} ${active ? sidebarItemActiveClass : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={17} strokeWidth={active ? 2.5 : 1.9} />
              <span>{label}</span>
              {active && tabTransitioning && (
                <span className="ml-auto h-2 w-2 animate-pulse rounded-full bg-[var(--c-brand)]" aria-hidden="true" />
              )}
            </button>
          )
        })}
      </div>
      <div className="mt-6 rounded-xl border border-[var(--c-border)] bg-slate-50/80 p-3 text-sm text-[var(--c-text-muted)]">
        <div className="text-[0.7rem] font-semibold uppercase tracking-[0.06em]">Review posture</div>
        <p className="mt-2 leading-6">
          Use the chart workspace for signal interpretation, the scorecard for portfolio triage,
          and the evidence rail for exclusions and capability context.
        </p>
      </div>
    </aside>
  )
}

function SPCContent() {
  const { state } = useSPC()
  const ActiveView = TAB_COMPONENTS[state.activeTab]
  return (
    <div className={pageShellClass}>
      <SPCPageHeader />
      <SPCFilterBar />
      <div className={workspaceClass}>
        <Sidebar />
        <div className={workspaceMainClass}>
          <SPCErrorBoundary>
            <Suspense fallback={<TabLoadingState />}>
              <ActiveView />
            </Suspense>
          </SPCErrorBoundary>
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
